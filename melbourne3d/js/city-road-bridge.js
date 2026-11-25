// City Road's extension to Alexandra Avenue, and the underpass that takes it beneath St Kilda Road (Melbourne only).
//
// In the road data City Road ends at (-70, 609) in Southbank, west of St Kilda Road, and Alexandra Avenue begins at
// (42, 629) east of it, with nothing across the 110 m between. This module returns one extra "way" for js/freeways.js
// (same tuple as js/melbourne-freeways.js: name, kind, width, lanes, samples [x, z, height above terrain, covered]) plus
// its options, so the underpass is built and driven exactly like CityLink's cuttings and tunnels: an open cutting with
// retaining walls down each ramp, a covered tube with portal headwalls under St Kilda Road, and the layered ground for
// cars and cameras (the covered stretch holds only something already inside it, so St Kilda Road stays drivable on top).
// Its two lanes (one each way) carry ambient traffic like the freeway lanes (js/traffic.js createHighwayTraffic).
// It also returns the outlines js/city-grid.js cuts out of the land deck (cuts: the open cuttings) and out of the water
// plane (wet: the whole run, covered stretch included), since this way is added at runtime and so isn't in the
// FREEWAYS.trenches / waterHoles that tools/melbourne/refine-freeways.mjs writes.
//
// The line follows City Road's centreline east from x = -140, bends through the open parkland (no building footprint
// within 15 m: checked against GEO's buildings), crosses St Kilda Road (carriageways, trams and service roads, x -18 to
// 34) and lands on Alexandra Avenue's centreline. The road is covered from COVER[0] to COVER[1], on a flat floor
// HEAD m under St Kilda Road's lowest ground over the tube, and climbs out each side at GRADE until it meets the
// terrain. Everything is tuned by the constants below. The terrain is passed in so this stays testable without the engine.

const GRADE = 0.1; // ramp slope: the streets' last stretch is short, so the ramps are steeper than a freeway's 6%
const HEAD = 4.8; // headroom: the tube's floor to the underside of the ground over it, m
const WIDTH = 15; // kerb to kerb: two lanes each way less the footpaths
const STEP = 6; // sample spacing, m
const COVER = [-21, 37]; // the covered tube (the route's x): St Kilda Rd's carriageways, trams and footpaths (x -18 to 34) plus a margin

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

let memo = null;

/** Returns { way, lanes, cuts, wet, ... } given terrainHeight(x, z); cached after the first call. */
export function buildCityRoadWay(terrainHeight) {
  if (memo) return memo;
  const P = centreline();
  const T = P.map(([x, z]) => terrainHeight(x, z));
  const cov = P.map(([x]) => x >= COVER[0] && x <= COVER[1]);
  const iW = cov.indexOf(true), iE = cov.lastIndexOf(true);
  // the floor: HEAD under the lowest ground over the tube (the tube's ceiling stands 0.3 m below the ground)
  let low = Infinity;
  for (let i = iW; i <= iE; i++) low = Math.min(low, T[i]);
  const yFloor = low - 0.3 - HEAD;
  const y = P.map((_, i) => (i < iW ? yFloor + GRADE * STEP * (iW - i) : i > iE ? yFloor + GRADE * STEP * (i - iE) : yFloor));
  // trim to where the ramps come up to the ground
  let a = iW, b = iE;
  while (a > 0 && y[a - 1] < T[a - 1]) a--;
  while (b < P.length - 1 && y[b + 1] < T[b + 1]) b++;
  const h = (i) => (i === a || i === b ? 0 : Math.min(0, y[i] - T[i]));
  const samples = [];
  for (let i = a; i <= b; i++) samples.push(P[i][0], P[i][1], h(i), cov[i] ? 1 : 0);
  // traffic lanes, one each way (drive on the left: the way's offset axis points right of travel)
  const lanes = [[], []];
  const nrm = (j) => { const p = P[j], q = P[Math.min(b, j + 1)], r = P[Math.max(a, j - 1)]; const dx = q[0] - r[0], dz = q[1] - r[1], L = Math.hypot(dx, dz) || 1; return [-dz / L, dx / L, p]; };
  for (let i = a; i <= b; i++) {
    const [nx, nz, p] = nrm(i), yy = T[i] + h(i) + 0.02;
    lanes[0].push([p[0] - nx * WIDTH * 0.25, yy, p[1] - nz * WIDTH * 0.25]);
    lanes[1].push([p[0] + nx * WIDTH * 0.25, yy, p[1] + nz * WIDTH * 0.25]);
  }
  lanes[1].reverse();
  // outlines (flat [x, z, ...], like FREEWAYS.trenches) round the runs of samples that go below the ground (cuts: the open
  // cuttings, cut out of the land deck) and below the water plane (wet: from the first to the last, tube included, cut out
  // of the water plane; the river level is -1.6 m), WIDTH / 2 + 1.6 m each side as refine-freeways.mjs does
  const outline = (i0, i1) => {
    const left = [], right = [];
    for (let i = i0; i <= i1; i++) {
      const [nx, nz, p] = nrm(i), o = WIDTH / 2 + 1.6;
      const e = i === i0 ? -1.5 : i === i1 ? 1.5 : 0; // (a little past each end, along the heading)
      left.push([p[0] + nx * o + nz * e, p[1] + nz * o - nx * e]);
      right.push([p[0] - nx * o + nz * e, p[1] - nz * o - nx * e]);
    }
    return left.concat(right.reverse()).flat();
  };
  const run = (test) => {
    const out = [];
    let s = -1;
    for (let i = a; i <= b + 1; i++) {
      const on = i <= b && test(i);
      if (on && s < 0) s = i;
      if (!on && s >= 0) { if (i - 1 > s) out.push(outline(s, i - 1)); s = -1; }
    }
    return out;
  };
  const cuts = run((i) => !cov[i] && h(i) < -0.3);
  const wet = run((i) => T[i] + h(i) < -1.3 && (cov[i] || h(i) < -0.3));
  memo = {
    way: ['City Road Underpass', 0, WIDTH, 4, samples, { ramp: true, piers: [] }],
    lanes, cuts, wet, floor: yFloor, start: P[a], end: P[b], samples: samples.length / 4
  };
  return memo;
}
