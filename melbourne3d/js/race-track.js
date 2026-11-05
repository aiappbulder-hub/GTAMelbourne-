// The Albert Park Grand Prix circuit as a drivable race track: the real 5.3 km loop (js/albert-park-circuit.js, from
// OSM), laid as an 11 m asphalt ribbon over the park roads and across the grass where the raceway leaves them, with
// white edge lines, red and white kerbs on the corners, a chequered start/finish line and a grandstand on the pit
// straight. trackHeight() tells the car physics where the track is (asphalt, not grass) and how high it is.
import * as THREE from 'three/webgpu';
import { CIRCUIT, CIRCUIT_LENGTH } from './albert-park-circuit.js';
import { blockAt } from './city-config.js';

export const TRACK_HALF = 5.5;
const N = CIRCUIT.length / 2;
const px = (i) => CIRCUIT[((i % N + N) % N) * 2];
const pz = (i) => CIRCUIT[((i % N + N) % N) * 2 + 1];

// Height of the surface at each point: on a park's lawn (0.41 m) it sits just above the grass, on a road just above
// the asphalt, smoothed along the loop so the change is a gentle ramp rather than a step
const raw = new Float32Array(N);
let heights = null;
function surfaceHeights() {
  if (heights) return heights;
  for (let i = 0; i < N; i++) {
    const b = blockAt(px(i), pz(i));
    raw[i] = b && b.park > 0.6 && !b.median ? 0.43 : 0.02;
  }
  heights = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -4; k <= 4; k++) s += raw[((i + k) % N + N) % N];
    heights[i] = Math.max(raw[i] > 0.2 ? 0.43 : 0.02, s / 9);
  }
  return heights;
}

// A bucket grid of the loop's segments (32 m cells) for trackHeight()
const CELL = 32;
let grid = null;
function buckets() {
  if (grid) return grid;
  grid = new Map();
  for (let i = 0; i < N; i++) {
    const x0 = Math.min(px(i), px(i + 1)) - TRACK_HALF, x1 = Math.max(px(i), px(i + 1)) + TRACK_HALF;
    const z0 = Math.min(pz(i), pz(i + 1)) - TRACK_HALF, z1 = Math.max(pz(i), pz(i + 1)) + TRACK_HALF;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = cx * 100003 + cz;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  }
  return grid;
}
const BOUNDS = (() => {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (let i = 0; i < N; i++) { a = Math.min(a, px(i)); b = Math.max(b, px(i)); c = Math.min(c, pz(i)); d = Math.max(d, pz(i)); }
  return { minX: a, maxX: b, minZ: c, maxZ: d };
})();
/** Albert Park: the circuit's bounds widened to the park around it */
export const ALBERT_PARK = { minX: BOUNDS.minX - 160, maxX: BOUNDS.maxX + 160, minZ: BOUNDS.minZ - 160, maxZ: BOUNDS.maxZ + 160 };

/** The track surface's height at (x, z), or null off the track. extra widens it (e.g. for kerbs and run-off) */
export function trackHeight(x, z, extra = 0) {
  if (x < BOUNDS.minX - 20 || x > BOUNDS.maxX + 20 || z < BOUNDS.minZ - 20 || z > BOUNDS.maxZ + 20) return null;
  const list = buckets().get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
  if (!list) return null;
  const h = surfaceHeights();
  const r = TRACK_HALF + extra;
  let best = r * r, y = null;
  for (const i of list) {
    const ax = px(i), az = pz(i), bx = px(i + 1), bz = pz(i + 1);
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const ex = ax + dx * t - x, ez = az + dz * t - z;
    const d2 = ex * ex + ez * ez;
    if (d2 < best) { best = d2; y = h[i] + (h[(i + 1) % N] - h[i]) * t; }
  }
  return y;
}

/** The point a fraction u (0..1) of the way round the loop from the start line */
export function circuitPoint(u) {
  const i = Math.floor((((u % 1) + 1) % 1) * N);
  return { x: px(i), z: pz(i), heading: Math.atan2(px(i + 1) - px(i), pz(i + 1) - pz(i)) };
}
export { CIRCUIT_LENGTH };

/** Build the track's meshes into `group`; footprints gets the grandstand's (so people walk round it) */
export function buildRaceTrack(group, footprints = [], lakeCentre = null) {
  const h = surfaceHeights();
  // directions and left normals (x, z), smoothed a little so the ribbon doesn't crease at OSM's kinks
  const tx = new Float32Array(N), tz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const dx = px(i + 2) - px(i - 2), dz = pz(i + 2) - pz(i - 2), L = Math.hypot(dx, dz) || 1;
    tx[i] = dx / L; tz[i] = dz / L;
  }
  // curvature: turn per metre over ±3 points (12 m either side)
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.atan2(tx[(i + 3) % N], tz[(i + 3) % N]) - Math.atan2(tx[(i - 3 + N) % N], tz[(i - 3 + N) % N]);
    curv[i] = Math.atan2(Math.sin(a), Math.cos(a)) / 24;
  }
  const at = (i, off, lift = 0) => {
    const k = ((i % N) + N) % N;
    // left normal of the direction (tx, tz) in the x-z plane
    return [px(k) + tz[k] * off, h[k] + lift, pz(k) - tx[k] * off];
  };

  const asphalt = [], paint = [], paintCol = [];
  const band = (out, i, o0, o1, lift, colour) => {
    const a0 = at(i, o0, lift), a1 = at(i, o1, lift), b0 = at(i + 1, o0, lift), b1 = at(i + 1, o1, lift);
    out.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
    if (colour) for (let k = 0; k < 6; k++) paintCol.push(colour.r, colour.g, colour.b);
  };
  const WHITE = new THREE.Color(0xf4f4f0), RED = new THREE.Color(0xd0202a), BLACK = new THREE.Color(0x111111);
  for (let i = 0; i < N; i++) {
    band(asphalt, i, -TRACK_HALF, TRACK_HALF, 0);
    // white edge lines
    band(paint, i, TRACK_HALF - 0.45, TRACK_HALF - 0.2, 0.008, WHITE);
    band(paint, i, -TRACK_HALF + 0.2, -TRACK_HALF + 0.45, 0.008, WHITE);
    // corner kerbs (tighter than ~180 m radius), 1.3 m wide just outside both edges, in 4 m red and white blocks
    if (Math.abs(curv[i]) > 1 / 180) {
      const c = i % 2 ? WHITE : RED;
      band(paint, i, TRACK_HALF, TRACK_HALF + 1.3, 0.03, c);
      band(paint, i, -TRACK_HALF - 1.3, -TRACK_HALF, 0.03, c);
    }
  }
  // the start/finish line: a chequered band 2 m deep across the track at point 0
  {
    const ux = tx[0], uz = tz[0], nx = tz[0], nz = -tx[0], y = h[0] + 0.012;
    const SQ = 0.5;
    for (let r = 0; r < 4; r++) {
      for (let j = -Math.round(TRACK_HALF / SQ); j < Math.round(TRACK_HALF / SQ); j++) {
        const s0 = -1 + r * SQ, o0 = j * SQ;
        const P = (s, o) => [px(0) + ux * s + nx * o, y, pz(0) + uz * s + nz * o];
        paint.push(...P(s0, o0), ...P(s0 + SQ, o0), ...P(s0 + SQ, o0 + SQ), ...P(s0, o0), ...P(s0 + SQ, o0 + SQ), ...P(s0, o0 + SQ));
        const c = (r + j) % 2 === 0 ? WHITE : BLACK;
        for (let k = 0; k < 6; k++) paintCol.push(c.r, c.g, c.b);
      }
    }
  }
  const mesh = (pos, mat, col) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (col) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const n = new Float32Array(pos.length);
    for (let k = 1; k < n.length; k += 3) n[k] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    return m;
  };
  const track = mesh(asphalt, new THREE.MeshStandardNodeMaterial({ color: 0x2b2d30, roughness: 0.92, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  track.name = 'AlbertParkTrack';
  const lines = mesh(paint, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), paintCol);
  lines.name = 'AlbertParkTrackPaint';
  group.add(track, lines);

  // the grandstand: beside the pit straight (40 m past the line), on the side away from the lake, 70 m long
  {
    const i = 10;
    const ux = tx[i], uz = tz[i], nx = tz[i], nz = -tx[i];
    let side = 1;
    if (lakeCentre) side = (lakeCentre.x - px(i)) * nx + (lakeCentre.z - pz(i)) * nz > 0 ? -1 : 1;
    const standMat = new THREE.MeshStandardNodeMaterial({ color: 0x9aa0a8, roughness: 0.8 });
    const seatMat = new THREE.MeshStandardNodeMaterial({ color: 0x1f4fa8, roughness: 0.6 });
    const stand = new THREE.Group();
    for (let t = 0; t < 8; t++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(70, 0.55 * (t + 1), 1.4), t % 2 ? standMat : seatMat);
      step.position.set(0, 0.275 * (t + 1), side * (TRACK_HALF + 7 + t * 1.4));
      step.castShadow = true;
      step.receiveShadow = true;
      stand.add(step);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(72, 0.3, 13), new THREE.MeshStandardNodeMaterial({ color: 0xe8e8e4, roughness: 0.5 }));
    roof.position.set(0, 7.2, side * (TRACK_HALF + 12));
    roof.castShadow = true;
    stand.add(roof);
    // local x along the straight, local z across it (+z = the left normal)
    stand.rotation.y = Math.atan2(ux, uz) + Math.PI / 2;
    stand.position.set(px(i), 0, pz(i));
    group.add(stand);
    const cx = px(i) + nx * side * (TRACK_HALF + 12), cz = pz(i) + nz * side * (TRACK_HALF + 12);
    footprints.push({ minX: cx - 30, maxX: cx + 30, minZ: cz - 30, maxZ: cz + 30, pedestrianOnly: true });
  }
}
