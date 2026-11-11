// The Yarra's road bridges (Melbourne only): a deck over the water from bank to bank for each road that crosses the
// river in the data (found by tools/melbourne/find-bridges.mjs), so cars and people cross on a bridge instead of on
// the river's surface.
//
//  - Princes Bridge (Swanston St / St Kilda Rd): three low iron arches between bluestone piers with cutwaters, a cast-
//    iron balustrade, and lamp standards on pedestals over the piers and abutments.
//  - Queens Bridge (Queens Bridge St): a low, flat five-span plate-girder bridge on bluestone piers.
//  - Spencer St, Swan St and Charles Grimes Bridges: a plain concrete girder deck on rounded piers.
//
// The decks are flat at road level (y = 0, the land deck's height), not cambered: AI traffic (js/traffic.js), the trams
// and their rails and wires (js/trams.js) and the road paint (js/road-paint.js) are all drawn at fixed heights above
// y = 0 rather than from the ground-height function, so a hump would bury them mid-span. The asphalt top meets the land
// deck flush at both banks (pushed back a little in depth, so where the two overlap on the bank the land wins), the
// footpaths are raised 0.22 m like every other kerb island, and the network's lane lines and tram rails, which run
// over the water already, now lie on the deck instead of floating above the river.
//
// Everything is merged into one mesh per material across all the bridges. createBridges returns the railings' colliders
// (oriented boxes, for js/controllers.js) and groundHeight(x, z, mode) for controllerManager.extraGround.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER, blockAt, ISLAND_BOUNDS } from './melbourne-config.js';
import { createRoadSurfaceMaterial, createSidewalkMaterial, createCurbMaterial, createParkLampGlobeMaterial } from './tsl-materials.js';

const WL = ISLAND_BOUNDS.waterLevel; // the river's surface (-1.6 m)
const FOOT_Y = ISLAND_BOUNDS.sidewalkHeight; // footpath top, as the kerb islands (0.22 m)

// Each bridge's axis (two points on it, either side of the river: the deck is trimmed to the water found along it),
// the roadway's width between the kerbs and each footpath's width. The axes are the middles of the two carriageways
// (and of the tram tracks) in GEO.roads; the widths cover both carriageways and the tracks between them.
export const BRIDGES = [
  // Swanston St to St Kilda Rd: carriageways at x 0..2 and 10..12, trams at x 4..9
  { name: 'Princes Bridge', style: 'princes', a: [5, 385], b: [7, 515], road: 19, foot: 4.5 },
  // Queens Bridge St: carriageways 13 m apart, trams in the middle
  { name: 'Queens Bridge', style: 'queens', a: [-593, 320], b: [-628, 426], road: 21, foot: 3.5, spans: 5 },
  // Spencer St to Clarendon St: carriageways at x -1162 and -1145, trams between
  { name: 'Spencer Street Bridge', style: 'girder', a: [-1153.5, 420], b: [-1153, 542], road: 25, foot: 3.5, spans: 3 },
  // Olympic Boulevard (Swan St) to Alexandra Ave and St Kilda Rd: one two-way centreline, 19 m
  { name: 'Swan Street Bridge', style: 'girder', a: [560, 1100], b: [667, 1148], road: 19, foot: 3, spans: 5 },
  // Charles Grimes Bridge: Wurundjeri Way to Montague St. Its western carriageway (Charles Grimes Bridge Road) is in the
  // data; the eastern one, curving in from Wurundjeri Way along the north bank, is a gap in it (from (-1831, 351) by
  // (-1826, 324) to (-1779, 267)), built here as two straight pieces meeting at the bend, overlapping by 3 m so the
  // outside of the bend has no gap (the railings are left out wherever they fall on another deck)
  { name: 'Charles Grimes Bridge', style: 'girder', a: [-1854, 362], b: [-1845, 228], road: 12, foot: 3, spans: 4 },
  { name: 'Charles Grimes Bridge (east, south half)', style: 'girder', a: [-1834.2, 368.2], b: [-1825.5, 321], road: 12, foot: 3, spans: 2 },
  { name: 'Charles Grimes Bridge (east, north half)', style: 'girder', a: [-1827.9, 326.3], b: [-1768.8, 254.6], road: 12, foot: 3, spans: 3 }
];

// ---------------------------------------------------------------------------------------------------------------------
// Water near a bridge (GEO.water's rings, only those whose bounds reach it)
function pointInRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function waterNear(x0, z0, x1, z1) {
  const near = [];
  for (const w of WATER) {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const p of w.ring) { a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.z); d = Math.max(d, p.z); }
    if (b >= x0 && a <= x1 && d >= z0 && c <= z1) near.push(w);
  }
  return (x, z) => near.some((w) => pointInRing(w.ring, x, z) && !w.holes.some((h) => pointInRing(h, x, z)));
}

// ---------------------------------------------------------------------------------------------------------------------
// Geometry helpers: every piece is built in the bridge's own frame (x across, y up, z along the axis from bank a) and
// collected per material, then moved into the world and merged.
function collector() {
  const parts = new Map();
  const add = (key, geo) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key).push(g);
  };
  const box = (key, w, h, d, x, y, z) => add(key, new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  // a box from y0 to y1, centred on (x, z)
  const slab = (key, w, d, y0, y1, x, z) => box(key, w, y1 - y0, d, x, (y0 + y1) / 2, z);
  const cyl = (key, r, y0, y1, x, z, seg = 12) => add(key, new THREE.CylinderGeometry(r, r, y1 - y0, seg).translate(x, (y0 + y1) / 2, z));
  return { parts, add, box, slab, cyl };
}

// A curved strip across the deck (x from -w/2 to w/2) through the (z, y) points of an arch: its soffit, seen from below
function vaultGeometry(pts, w) {
  const pos = [], nor = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [z0, y0] = pts[i], [z1, y1] = pts[i + 1];
    const dz = z1 - z0, dy = y1 - y0, L = Math.hypot(dz, dy) || 1;
    const ny = -dz / L, nz = dy / L; // facing down into the arch
    const quad = [[-w / 2, y0, z0], [w / 2, y0, z0], [w / 2, y1, z1], [-w / 2, y0, z0], [w / 2, y1, z1], [-w / 2, y1, z1]];
    for (const q of quad) { pos.push(...q); nor.push(0, ny, nz); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// A segmental arch from (z0, spring) to (z1, spring) rising to `crown`, sampled every ~2 m
function archPoints(z0, z1, spring, crown) {
  const c = z1 - z0, h = crown - spring, R = (c * c / 4 + h * h) / (2 * h), mid = (z0 + z1) / 2, cy = crown - R;
  const n = Math.max(6, Math.ceil(c / 2));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const z = z0 + (c * i) / n;
    pts.push([z, cy + Math.sqrt(Math.max(0, R * R - (z - mid) * (z - mid)))]);
  }
  return pts;
}

// A lamp standard on (x, y, z): a fluted iron pole with a crossarm and three globes (Princes Bridge), or one globe
function lamp(C, x, y, z, triple) {
  C.cyl('iron', 0.24, y, y + 0.9, x, z, 10);
  C.add('iron', new THREE.CylinderGeometry(0.08, 0.13, 4.2, 8).translate(x, y + 0.9 + 2.1, z));
  if (triple) {
    C.box('iron', 0.08, 0.08, 1.5, x, y + 4.75, z);
    for (const dz of [-0.7, 0.7]) C.add('globe', new THREE.SphereGeometry(0.26, 8, 6).translate(x, y + 5.0, z + dz));
    C.add('globe', new THREE.SphereGeometry(0.3, 8, 6).translate(x, y + 5.45, z));
  } else {
    C.add('globe', new THREE.SphereGeometry(0.28, 8, 6).translate(x, y + 5.35, z));
  }
}

// A railing along one side (x = ox) from z0 to z1 on a base at y, skipping the stretches in `gaps` ([z0, z1] pairs):
// posts every `step` m, a top rail and a bottom rail (balusters when `step` is small)
function railing(C, key, ox, z0, z1, y, step, gaps = []) {
  const open = (z) => !gaps.some(([g0, g1]) => z > g0 && z < g1);
  // the rails, broken at the gaps
  let start = null;
  const flush = (end) => {
    if (start === null || end - start < 0.2) return;
    const L = end - start, zc = (start + end) / 2;
    C.box(key, 0.1, 0.09, L, ox, y + 1.05, zc);
    C.box(key, 0.07, 0.07, L, ox, y + 0.12, zc);
  };
  for (let z = z0; z <= z1 + 1e-6; z += 0.25) {
    if (open(z)) { if (start === null) start = z; } else { flush(z); start = null; }
  }
  flush(z1);
  for (let z = z0; z <= z1 + 1e-6; z += step) if (open(z)) C.box(key, step < 1 ? 0.05 : 0.09, 1.0, step < 1 ? 0.05 : 0.09, ox, y + 0.55, z);
}

// ---------------------------------------------------------------------------------------------------------------------
// The bridge's frame and extents: its axis, the deck's reach (to 2.5 m onto the land past the water at each end, over
// the quay walls) and the water along its centreline (between the abutments, where the piers go)
function frameBridge(spec) {
  const [ax, az] = spec.a, [bx, bz] = spec.b;
  const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
  const half = spec.road / 2 + spec.foot; // to the outer edge of the footpaths
  const toWorld = (o, s) => ({ x: ax + uz * o + ux * s, z: az - ux * o + uz * s });
  const pad = half + 4;
  const wet = waterNear(Math.min(ax, bx) - pad, Math.min(az, bz) - pad, Math.max(ax, bx) + pad, Math.max(az, bz) + pad);
  const wetAt = (o, s) => { const p = toWorld(o, s); return wet(p.x, p.z); };

  // The wet stretch along the axis: over the deck's whole width (where the deck must reach), and on the centreline
  // (between the abutments, where the piers go). Each is the run of water containing the middle of the axis.
  const run = (test) => {
    let m = L / 2;
    if (!test(m)) for (let d = 1; d < L / 2; d++) { if (test(L / 2 + d)) { m = L / 2 + d; break; } if (test(L / 2 - d)) { m = L / 2 - d; break; } }
    let s0 = m, s1 = m;
    while (s0 > 0 && test(s0 - 0.5)) s0 -= 0.5;
    while (s1 < L && test(s1 + 0.5)) s1 += 0.5;
    return [s0, s1];
  };
  const offsets = [];
  for (let o = -half; o <= half + 1e-6; o += half / 6) offsets.push(o);
  const [d0, d1] = run((s) => offsets.some((o) => wetAt(o, s)));
  const [w0, w1] = run((s) => wetAt(0, s));
  // the deck reaches 2.5 m onto the land at each end, over the quay walls
  const s0 = Math.max(0, d0 - 2.5), s1 = Math.min(L, d1 + 2.5);
  return { spec, name: spec.name, ax, az, ux, uz, L, s0, s1, half, road: spec.road, waterStart: w0, waterEnd: w1, toWorld,
    minX: Math.min(ax + ux * s0, ax + ux * s1) - half - 1, maxX: Math.max(ax + ux * s0, ax + ux * s1) + half + 1,
    minZ: Math.min(az + uz * s0, az + uz * s1) - half - 1, maxZ: Math.max(az + uz * s0, az + uz * s1) + half + 1 };
}

// Is (x, z) on bridge b's deck (within `margin` of its edges)?
function onDeck(b, x, z, margin = 0) {
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
  const dx = x - b.ax, dz = z - b.az, s = dx * b.ux + dz * b.uz, o = dx * b.uz - dz * b.ux;
  return s >= b.s0 - margin && s <= b.s1 + margin && Math.abs(o) <= b.half + margin;
}

function buildBridge(F, others, C) {
  const { spec, ax, az, ux, uz, s0, s1, half, toWorld, waterStart: w0, waterEnd: w1 } = F;
  const len = s1 - s0, mid = (s0 + s1) / 2;
  // the stretches of each side's railing line that aren't on another deck (where two pieces of a bridge overlap)
  const railRuns = (o) => {
    const runs = [];
    let start = null;
    const clear = (s) => { const p = toWorld(o, s); return !others.some((b) => onDeck(b, p.x, p.z, -0.2)); };
    for (let s = s0 + 0.3; s <= s1 - 0.3 + 1e-6; s += 0.5) {
      if (clear(s)) { if (start === null) start = s; } else if (start !== null) { runs.push([start, s - 0.5]); start = null; }
    }
    if (start !== null) runs.push([start, s1 - 0.3]);
    return runs.filter(([a, b]) => b - a > 0.6);
  };
  const lampClear = (o, s) => { const p = toWorld(o, s); return !others.some((b) => onDeck(b, p.x, p.z, 1)); };

  // the pieces in the bridge's frame, then moved into the world: start a fresh collector and copy its parts across
  const local = collector();
  const rd = spec.road / 2;

  // --- The deck: asphalt between the kerbs, raised footpaths with granite kerbs, the structure beneath -------------
  local.slab('asphalt', spec.road + 0.02, len, -0.32, 0, 0, mid);
  for (const side of [-1, 1]) {
    local.slab('curb', 0.3, len, -0.32, FOOT_Y - 0.02, side * (rd + 0.15), mid);
    local.slab('footpath', spec.foot - 0.3, len, -0.32, FOOT_Y, side * (rd + 0.3 + (spec.foot - 0.3) / 2), mid);
  }

  const gaps = [];
  if (spec.style === 'princes') {
    // three iron arches between two bluestone piers and the abutments
    const T = 4.2; // pier thickness along the river
    const piers = [w0 + (w1 - w0) / 3, w0 + (2 * (w1 - w0)) / 3];
    const spring = WL - 0.35, crown = -0.62;
    const openings = [[w0 + 0.6, piers[0] - T / 2], [piers[0] + T / 2, piers[1] - T / 2], [piers[1] + T / 2, w1 - 0.6]];
    // the structure under the deck, the arch crowns just touching it
    local.slab('stone', half * 2, len, crown - 0.02, -0.3, 0, mid);
    // the iron spandrel girders along both faces: a band from below the water to the balustrade's sill, with the three
    // arch openings cut out of it
    const yb = WL - 0.9, yt = 0.32;
    const shape = new THREE.Shape();
    shape.moveTo(s0, yb); shape.lineTo(s1, yb); shape.lineTo(s1, yt); shape.lineTo(s0, yt); shape.closePath();
    for (const [o0, o1] of openings) {
      const pts = archPoints(o0, o1, spring, crown);
      const hole = new THREE.Path();
      hole.moveTo(o0, yb + 0.2);
      for (const [z, y] of pts) hole.lineTo(z, y);
      hole.lineTo(o1, yb + 0.2);
      hole.closePath();
      shape.holes.push(hole);
      // the arch's soffit across the full width, and an iron rib standing proud on each face
      local.add('stone', vaultGeometry(pts, half * 2));
    }
    const face = new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false, curveSegments: 1 });
    // shape x (along the axis) -> local z, extrusion -> local -x
    face.rotateY(-Math.PI / 2);
    for (const side of [-1, 1]) local.add('iron', face.clone().translate(side > 0 ? half + 0.45 : -half, 0, 0));
    // arch rings: a thin moulding just outside each face, following the opening
    for (const [o0, o1] of openings) {
      const pts = archPoints(o0, o1, spring, crown);
      for (const side of [-1, 1]) {
        for (let i = 0; i + 1 < pts.length; i++) {
          const [za, ya] = pts[i], [zb, yb2] = pts[i + 1];
          const segL = Math.hypot(zb - za, yb2 - ya);
          const g = new THREE.BoxGeometry(0.2, 0.32, segL + 0.05);
          g.rotateX(-Math.atan2(yb2 - ya, zb - za));
          g.translate(side * (half + 0.55), (ya + yb2) / 2 + 0.12, (za + zb) / 2);
          local.add('iron', g);
        }
      }
    }
    // bluestone piers with rounded cutwaters up and downstream, rising to pedestals that carry the lamps
    const pedestal = (z, w) => {
      for (const side of [-1, 1]) {
        local.slab('stone', 1.8, w, yt - 0.02, 1.45, side * (half + 0.3), z);
        local.slab('stone', 2.1, w + 0.3, 1.45, 1.65, side * (half + 0.3), z);
        lamp(local, side * (half + 0.3), 1.65, z, true);
      }
      gaps.push([z - w / 2 - 0.05, z + w / 2 + 0.05]);
    };
    for (const z of piers) {
      local.slab('stone', half * 2 + 1.0, T, WL - 1.2, -0.3, 0, z);
      for (const side of [-1, 1]) local.cyl('stone', T / 2, WL - 1.2, yt, side * (half + 0.5), z, 16);
      pedestal(z, 2.6);
    }
    // abutments at the banks, under the deck ends, with pedestals and lamps at the bridge's four corners
    for (const [z0, z1] of [[s0, w0 + 0.6], [w1 - 0.6, s1]]) {
      local.slab('stone', half * 2 + 1.0, z1 - z0, WL - 1.2, -0.3, 0, (z0 + z1) / 2);
      for (const side of [-1, 1]) local.slab('stone', 1.0, z1 - z0, WL - 1.2, yt, side * (half + 0.5), (z0 + z1) / 2);
    }
    pedestal(w0 - 0.9, 2.2);
    pedestal(w1 + 0.9, 2.2);
    // cast-iron balustrade: close-set balusters between the pedestals
    for (const side of [-1, 1]) railing(local, 'iron', side * (half + 0.22), s0 + 0.3, s1 - 0.3, yt, 0.32, gaps);
  } else {
    // girder decks: Queens Bridge in painted steel plate girders on bluestone piers, the others in concrete
    const queens = spec.style === 'queens';
    const girder = queens ? 'steel' : 'concrete';
    const pierKey = queens ? 'stone' : 'concrete';
    const bottom = queens ? -1.15 : -1.05; // the girders' soffit, half a metre clear of the water
    local.slab('concrete', half * 2, len, -0.75, -0.3, 0, mid);
    for (const side of [-1, 1]) {
      // the fascia girder, its bottom flange, and the web stiffeners every 3 m (Queens Bridge)
      local.slab(girder, 0.5, len, bottom, 0.32, side * (half + 0.25), mid);
      if (queens) {
        local.slab(girder, 0.9, len, bottom, bottom + 0.12, side * (half + 0.35), mid);
        local.slab(girder, 0.9, len, 0.2, 0.32, side * (half + 0.35), mid);
        for (let z = s0 + 1.5; z < s1 - 1; z += 3) local.slab(girder, 0.14, 0.22, bottom + 0.1, 0.22, side * (half + 0.55), z);
      }
      // the inner girders under the deck, so the bridge doesn't look hollow from the water
      for (const f of [0.18, 0.5]) local.slab(girder, 0.45, len, bottom, -0.7, side * half * f, mid);
    }
    // piers splitting the river crossing into equal spans, each a wall across the deck with rounded ends
    const n = spec.spans || Math.max(2, Math.round((w1 - w0) / 30));
    const T = queens ? 2.4 : 1.8;
    for (let k = 1; k < n; k++) {
      const z = w0 + ((w1 - w0) * k) / n;
      local.slab(pierKey, half * 2 - T, T, WL - 1.2, bottom, 0, z);
      for (const side of [-1, 1]) local.cyl(pierKey, T / 2, WL - 1.2, bottom, side * (half - T / 2), z, 14);
    }
    // abutment walls at the banks
    for (const z of [w0 - 0.4, w1 + 0.4]) local.slab(pierKey, half * 2 + 1.0, 1.6, WL - 1.2, -0.3, 0, z);
    // a steel railing on the girder, and lamps every ~25 m on both sides
    const lampEvery = (s1 - s0) / Math.max(2, Math.round((s1 - s0) / 25));
    for (const side of [-1, 1]) {
      for (const [r0, r1] of railRuns(side * (half + 0.22))) railing(local, 'steel', side * (half + 0.22), r0, r1, 0.32, queens ? 1.8 : 2.4);
      for (let z = s0 + lampEvery / 2; z < s1; z += lampEvery) if (lampClear(side * (half + 0.25), z)) lamp(local, side * (half + 0.25), 0.32, z, false);
    }
  }

  // move the pieces into the world: rotate the local frame (z along the axis) onto the bridge's heading
  const m = new THREE.Matrix4().makeRotationY(Math.atan2(ux, uz)).setPosition(ax, 0, az);
  for (const [key, list] of local.parts) for (const g of list) C.add(key, g.applyMatrix4(m));

  // the railings are solid: an oriented box along each stretch of railing, 1 m thick, its inner face on the balustrade
  const colliders = [];
  for (const side of [-1, 1]) for (const [r0, r1] of railRuns(side * (half + 0.22))) {
    const o = side * (half + 0.62), sc = (r0 + r1) / 2;
    const c = toWorld(o, sc);
    const hz = (r1 - r0) / 2, hx = 0.5;
    const ex = Math.abs(uz) * hx + Math.abs(ux) * hz, ez = Math.abs(ux) * hx + Math.abs(uz) * hz;
    colliders.push({
      minX: c.x - ex, maxX: c.x + ex, minZ: c.z - ez, maxZ: c.z + ez, minY: -0.5, maxY: 1.4,
      // controllers.js buildingContact: local x = dx*cs - dz*sn (across), local z = dx*sn + dz*cs (along)
      obb: { cx: c.x, cz: c.z, hx, hz, cs: uz, sn: ux }, bridge: spec.name
    });
  }
  F.colliders = colliders;
  return F;
}

export function createBridges({ scene }) {
  const group = new THREE.Group();
  group.name = 'YarraBridges';
  const C = collector();
  const frames = BRIDGES.map(frameBridge);
  const built = frames.map((F) => buildBridge(F, frames.filter((b) => b !== F), C));

  const asphalt = createRoadSurfaceMaterial();
  // where the deck's ends overlap the land deck on the banks (both at y = 0, the same world-space asphalt), the land
  // draws on top
  asphalt.polygonOffset = true;
  asphalt.polygonOffsetFactor = 1;
  asphalt.polygonOffsetUnits = 2;
  const materials = {
    asphalt,
    footpath: createSidewalkMaterial(),
    curb: createCurbMaterial(),
    stone: new THREE.MeshStandardNodeMaterial({ color: 0x4a4c4f, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }), // the quay walls' bluestone
    iron: new THREE.MeshStandardNodeMaterial({ color: 0x5a675e, roughness: 0.55, metalness: 0.4 }), // Princes Bridge's ironwork
    steel: new THREE.MeshStandardNodeMaterial({ color: 0x66707a, roughness: 0.5, metalness: 0.45 }),
    concrete: new THREE.MeshStandardNodeMaterial({ color: 0x9a968e, roughness: 0.85, metalness: 0.0 }),
    globe: createParkLampGlobeMaterial()
  };
  let triangles = 0;
  for (const [key, list] of C.parts) {
    const geo = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!geo) continue;
    geo.computeBoundingSphere();
    triangles += geo.attributes.position.count / 3;
    const mesh = new THREE.Mesh(geo, materials[key]);
    mesh.name = `Bridges-${key}`;
    mesh.receiveShadow = true;
    mesh.castShadow = key !== 'asphalt' && key !== 'footpath' && key !== 'curb' && key !== 'globe';
    group.add(mesh);
  }
  scene.add(group);

  // The ground on a bridge: the roadway at y = 0, the footpaths at kerb height for people. Over the land at the deck's
  // ends, whichever is higher of the deck and the kerb island under it (the island's footpath covers the deck's asphalt)
  function groundHeight(x, z, mode) {
    for (const b of built) {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      const dx = x - b.ax, dz = z - b.az;
      const s = dx * b.ux + dz * b.uz;
      const o = dx * b.uz - dz * b.ux;
      if (s < b.s0 || s > b.s1 || Math.abs(o) > b.half + 0.45) continue;
      const deck = mode === 'person' && Math.abs(o) > b.road / 2 ? FOOT_Y : 0;
      if (deck > 0) return deck;
      const blk = mode === 'person' ? blockAt(x, z) : null;
      return blk && !(blk.park > 0.6 && !blk.median) ? FOOT_Y : 0;
    }
    return null;
  }

  return {
    group,
    bridges: built,
    colliders: built.flatMap((b) => b.colliders),
    groundHeight,
    stats: { meshes: group.children.length, triangles }
  };
}
