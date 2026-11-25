// City Road's extension to Alexandra Avenue, and the bridge that carries it over St Kilda Road (Melbourne only).
//
// In the road data City Road ends at (-70, 609) in Southbank, west of St Kilda Road, and Alexandra Avenue begins at
// (42, 629) east of it, with nothing across the 110 m between. This module returns one extra "way" for js/freeways.js
// (same tuple as js/melbourne-freeways.js: name, kind, width, lanes, samples [x, z, height above terrain, covered]) plus
// its options, so the bridge is built and driven exactly like a CityLink viaduct: one deck with concrete parapets (the
// railings), concrete piers with crossheads, the layered ground for cars and cameras, and merged per-cell meshes. Its
// two lanes (one each way) carry ambient traffic like the freeway lanes (js/traffic.js createHighwayTraffic).
//
// The line follows City Road's centreline east from x = -100, bends through the open parkland (no building footprint
// within 15 m: checked against GEO's buildings), crosses St Kilda Road (carriageways, trams and service roads, x -14 to
// 30) and lands on Alexandra Avenue's centreline. The deck climbs at GRADE to a flat top CLEAR m above St Kilda Road's
// highest point under it, with a pier pair just outside each kerb, and descends at GRADE until it meets the terrain.
// Everything is tuned by the constants below. The terrain is passed in so this stays testable without the engine.

const GRADE = 0.063; // ramp slope (6-7%)
const CLEAR = 6.3; // clearance under the deck over St Kilda Road's highest point beneath it, m
const DECK_T = 1.4; // the deck's depth (freeways.js DECK_T)
const WIDTH = 15; // kerb to kerb: two lanes each way less the footpaths
const STEP = 6; // sample spacing, m
const PIER_X = [-24, 37]; // where the pier pairs stand (the route's x): clear of St Kilda Rd's footpaths (x -18 to 34)

// The centreline: City Road's end (centre of its two carriageways), a Hermite bend, then Alexandra Avenue's centreline
const WEST = [[-140, 614.5], [-100, 611.7], [-70, 609.2]];
const EAST = [[42.1, 628.6], [55.6, 633.7], [93.5, 651.7], [136.9, 680.4], [175, 706]];
const HEAD_W = (-4.8 * Math.PI) / 180, HEAD_E = (20.7 * Math.PI) / 180;

function centreline() {
  const pts = WEST.slice();
  const [x0, z0] = WEST[WEST.length - 1], [x1, z1] = EAST[0];
  const m = Math.hypot(x1 - x0, z1 - z0) * 1.05;
  const t0 = [Math.cos(HEAD_W) * m, Math.sin(HEAD_W) * m], t1 = [Math.cos(HEAD_E) * m, Math.sin(HEAD_E) * m];
  for (let i = 1; i <= 24; i++) {
    const t = i / 24, t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    pts.push([h00 * x0 + h10 * t0[0] + h01 * x1 + h11 * t1[0], h00 * z0 + h10 * t0[1] + h01 * z1 + h11 * t1[1]]);
  }
  pts.push(...EAST);
  // resample every STEP m by arc length
  const out = [[pts[0][0], pts[0][1]]];
  let next = STEP, run = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    while (next <= run + L) { const f = (next - run) / L; out.push([ax + (bx - ax) * f, az + (bz - az) * f]); next += STEP; }
    run += L;
  }
  return out;
}

/** Returns { way: [name, kind, width, lanes, samples, opts], lanes: [[x, y, z]...] x2 } given terrainHeight(x, z). */
export function buildCityRoadWay(terrainHeight) {
  const P = centreline();
  const T = P.map(([x, z]) => terrainHeight(x, z));
  const iW = P.findIndex(([x]) => x >= PIER_X[0]), iE = P.findIndex(([x]) => x >= PIER_X[1]);
  let top = 0;
  // St Kilda Rd's highest ground under the span (x -16 to 30, the carriageways, trams and service roads)
  for (let i = iW; i <= iE; i++) if (P[i][0] > -16 && P[i][0] < 30) top = Math.max(top, T[i]);
  const yTop = top + CLEAR + DECK_T;
  const y = P.map((_, i) => (i < iW ? yTop - GRADE * STEP * (iW - i) : i > iE ? yTop - GRADE * STEP * (i - iE) : yTop));
  // trim to where the ramps meet the ground
  let a = iW, b = iE;
  while (a > 0 && y[a - 1] > T[a - 1]) a--;
  while (b < P.length - 1 && y[b + 1] > T[b + 1]) b++;
  const samples = [];
  for (let i = a; i <= b; i++) samples.push(P[i][0], P[i][1], i === a || i === b ? 0 : Math.max(0, y[i] - T[i]), 0);
  // (the end samples sit on the ground: h = 0)
  const piers = [iW - a, iE - a];
  // traffic lanes, one each way (drive on the left: the way's offset axis points right of travel)
  const lanes = [[], []];
  const n = (j) => { const p = P[Math.min(b, Math.max(a, j))], q = P[Math.min(b, Math.max(a, j + 1))], r = P[Math.min(b, Math.max(a, j - 1))]; const dx = q[0] - r[0], dz = q[1] - r[1], L = Math.hypot(dx, dz) || 1; return [-dz / L, dx / L, p]; };
  for (let i = a; i <= b; i++) {
    const [nx, nz, p] = n(i), h = i === a || i === b ? 0 : Math.max(0, y[i] - T[i]), yy = T[i] + h + 0.02;
    lanes[0].push([p[0] - nx * WIDTH * 0.25, yy, p[1] - nz * WIDTH * 0.25]);
    lanes[1].push([p[0] + nx * WIDTH * 0.25, yy, p[1] + nz * WIDTH * 0.25]);
  }
  lanes[1].reverse();
  return {
    way: ['City Road Bridge', 0, WIDTH, 4, samples, { ramp: true, piers }],
    lanes, top: yTop, piers: piers.map((i) => P[a + i]), start: P[a], end: P[b], samples: samples.length / 4
  };
}
