// River boats (Melbourne only): the traffic on the Yarra. Replaces the single box "cruise boat" that used to live in
// js/melb-night.js.
//
//   Reach A, Queens Bridge to Princes Bridge (Southbank / Crown / Flinders Walk, past the Arbory Afloat pontoon):
//     two river cruise ferries (long, white, glazed enclosed lower deck, open upper deck with a wheelhouse), a water
//     taxi, a motor launch and a tinnie.
//   Reach B, upstream of Princes Bridge (the rowing stretch, Birrarung Marr to Alexandra Gardens): three eights and a
//     pair of single sculls, with a tinnie for the coach.
//
// Why two reaches: the bridge decks are flat at y = 0 with their soffits at -1.05 to -0.6 (js/bridges.js), half a metre
// above the water, so nothing taller than a kayak can pass under one. Every boat therefore turns round before a bridge.
//
// Each boat follows a lane (a fraction across the channel) on the Yarra's rendered outline (GEO.waterOutlines, the ring
// that js/river-path.js and the land deck use), kept clear of the banks by a margin: 25 m on the north side of reach A
// (the Arbory Afloat pontoon is out there), 12 m elsewhere. Steering chases a look-ahead point on the lane with a smoothed,
// rate-limited turn, speed eases down for the turnaround at each end and while turning, the hull bobs, pitches and
// rolls gently, and it sits on the real water plane (ISLAND_BOUNDS.waterLevel: the water in js/water.js is flat).
//
// Wake: one transparent textured quad per boat (a V with foam at the stern), all in ONE instanced draw call.
// Rowing: all hulls, rowers' bodies, heads and oars of the eights and sculls are instanced (5 draw calls for the lot);
// the oars sweep, dip and feather in rhythm and the rowers rock with the stroke.
// Motor boats: hull + glass = 2 draw calls each (hull is vertex-coloured, so one material for every hull).
// LITE: one ferry, no tinnie, two eights.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO } from './melbourne-geodata.js';
import { ISLAND_BOUNDS } from './melbourne-config.js';
import { LITE } from './quality.js';

const WL = ISLAND_BOUNDS.waterLevel;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
let _seed = 4242;
const rnd = () => ((_seed = (_seed * 16807) % 2147483647) / 2147483647);

// ---------------------------------------------------------------------------------------------------------------------
// The channel: north and south edge z at each x, from the Yarra's rendered outline
const RING = (() => {
  let best = null;
  for (const flat of GEO.waterOutlines || []) {
    let a = Infinity, b = -Infinity;
    for (let i = 0; i < flat.length; i += 2) { a = Math.min(a, flat[i]); b = Math.max(b, flat[i]); }
    if (a < -700 && b > 450 && (!best || flat.length > best.length)) best = flat;
  }
  return best;
})();
function edgesAt(x) { // [north z, south z] of the river at world x
  let lo = Infinity, hi = -Infinity;
  const n = RING.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = RING[j * 2], az = RING[j * 2 + 1], bx = RING[i * 2], bz = RING[i * 2 + 1];
    if ((ax > x) === (bx > x)) continue;
    const z = az + ((x - ax) * (bz - az)) / (bx - ax);
    if (z > -900) { lo = Math.min(lo, z); hi = Math.max(hi, z); }
  }
  return [lo, hi];
}
const STEP = 4;
function buildReach(name, x0, x1, marginN, marginS) {
  const n = Math.floor((x1 - x0) / STEP) + 1, N = [], S = [];
  for (let i = 0; i < n; i++) { const e = edgesAt(x0 + i * STEP); N.push(e[0]); S.push(e[1]); }
  const sm = (a) => a.map((_, i) => { let s = 0, c = 0; for (let k = -3; k <= 3; k++) if (a[i + k] !== undefined) { s += a[i + k]; c++; } return s / c; });
  const Ns = sm(N), Ss = sm(S);
  const at = (x) => { const u = clamp((x - x0) / STEP, 0, n - 1.001), i = Math.floor(u), k = u - i; return [Ns[i] + (Ns[i + 1] - Ns[i]) * k, Ss[i] + (Ss[i + 1] - Ss[i]) * k]; };
  return {
    name, x0, x1, marginN, marginS, at,
    lane(x, f) { const [a, b] = at(x), n0 = a + marginN, s0 = b - marginS; return n0 + f * (s0 - n0); },
    limits(x, half) { const [a, b] = at(x); return [a + marginN * 0.5 + half, b - marginS * 0.5 - half]; }
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Geometry helpers (everything low-poly, vertex-coloured, non-indexed, merged)
function tint(g, hex) {
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(hex);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const box = (w, h, l, x, y, z, hex) => tint(new THREE.BoxGeometry(w, h, l).translate(x, y, z), hex);
const gbox = (w, h, l, x, y, z) => { const g = new THREE.BoxGeometry(w, h, l).translate(x, y, z).toNonIndexed(); g.deleteAttribute('uv'); return g; };
const cyl = (r, h, x, y, z, hex, seg = 6) => tint(new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z), hex);
const ball = (r, x, y, z, hex) => tint(new THREE.SphereGeometry(r, 7, 5).translate(x, y, z), hex);

/** A lofted hull: origin at the waterline, bow toward +z. cols = [topsides, below the waterline, deck] */
function loft({ L, B, draft, free, bowAt = 0.74, sternAt = 0, sternW = 0.88, sheer = 0.35, cols, N = 14 }) {
  const taper = (u) => Math.pow(Math.max(0, 1 - Math.pow(u, 1.7)), 0.55);
  const wAt = (t) => {
    let f = 1;
    if (t > bowAt) f = taper((t - bowAt) / (1 - bowAt));
    if (sternAt > 0) { if (t < sternAt) f = Math.min(f, taper((sternAt - t) / sternAt)); } else if (t < 0.06) f *= sternW + (1 - sternW) * (t / 0.06);
    return Math.max(f, 0.03) * B / 2;
  };
  const hAt = (t) => free * (1 + sheer * smooth(bowAt - 0.12, 1, t));
  const dAt = (t) => draft * (1 - 0.5 * smooth(0.75, 1, t));
  const sec = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, w = wAt(t), h = hAt(t), d = dAt(t), z = -L / 2 + t * L;
    sec.push([[-0.4 * w, -d, z], [-w, -d * 0.3, z], [-w, h, z], [w, h, z], [w, -d * 0.3, z], [0.4 * w, -d, z]]);
  }
  const pos = [], col = [];
  const cu = new THREE.Color(cols[0]), cl = new THREE.Color(cols[1]), cd = new THREE.Color(cols[2]);
  const tri = (a, b, c, k) => {
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * cx + ny * cy + nz * cz < 0) { const t = b; b = c; c = t; } // outward from the origin
    const C = k === 2 ? cd : cy >= -0.02 && k !== 0 && k !== 5 ? cu : cl;
    pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(C.r, C.g, C.b);
  };
  for (let i = 0; i < N; i++) for (let k = 0; k < 6; k++) {
    const k2 = (k + 1) % 6, a = sec[i][k], b = sec[i][k2], c = sec[i + 1][k2], d = sec[i + 1][k];
    const kk = k === 2 ? 2 : k;
    tri(a, b, c, kk); tri(a, c, d, kk);
  }
  for (const [s, zc] of [[sec[0], -L / 2 - 0.01], [sec[N], L / 2 + 0.01]]) {
    const mid = [0, (s[2][1] - s[0][1]) / 2, s[0][2]];
    for (let k = 0; k < 6; k++) tri(mid, s[k], s[(k + 1) % 6], 9);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------------------------------
// Boat builders. Each returns { hull: BufferGeometry, glass: BufferGeometry|null }, local frame: y = 0 at the waterline.
function railRun(parts, x, z0, z1, y, hex = 0xdfe3e6, post = 1.5) {
  parts.push(box(0.05, 0.05, z1 - z0, x, y + 0.95, (z0 + z1) / 2, hex), box(0.04, 0.04, z1 - z0, x, y + 0.5, (z0 + z1) / 2, hex));
  for (let z = z0; z <= z1 + 0.01; z += post) parts.push(box(0.05, 0.95, 0.05, x, y + 0.475, z, hex));
}
function railCross(parts, z, x0, x1, y, hex = 0xdfe3e6) { parts.push(box(x1 - x0, 0.05, 0.05, (x0 + x1) / 2, y + 0.95, z, hex)); }

function buildFerry(o) {
  const { L, B, free = 1.1, draft = 0.9 } = o, parts = [], glass = [];
  parts.push(loft({ L, B, draft, free, bowAt: 0.76, sternW: 0.9, cols: [o.hullCol, o.lowCol, o.deckCol] }));
  const cw = B - 0.7, z0 = -L / 2 + 1.4, z1 = L / 2 - (o.foredeck ?? 6.2), len = z1 - z0, cc = (z0 + z1) / 2;
  const ch = 1.9, yb = free;
  parts.push(box(cw, ch, len, 0, yb + ch / 2, cc, o.cabinCol));
  for (const s of [-1, 1]) {
    glass.push(gbox(0.07, 0.95, len - 1.4, s * (cw / 2 + 0.02), yb + 1.05, cc));
    for (let z = z0 + 0.7; z <= z1 - 0.6; z += 1.7) parts.push(box(0.12, 1.0, 0.13, s * (cw / 2 + 0.03), yb + 1.05, z, o.cabinCol));
  }
  glass.push(gbox(cw - 0.8, 0.9, 0.07, 0, yb + 1.05, z1 + 0.02), gbox(cw - 0.8, 0.9, 0.07, 0, yb + 1.05, z0 - 0.02));
  parts.push(box(cw + 0.2, 0.14, len + 0.6, 0, yb + ch + 0.07, cc + 0.1, o.roofCol));
  // livery band along the topsides
  for (const s of [-1, 1]) parts.push(box(0.06, 0.34, L * 0.62, s * (B / 2 + 0.015), free - 0.32, -L / 2 + L * 0.4, o.bandCol));
  // upper (open) deck: rails, benches, wheelhouse, funnel, mast
  const y0 = yb + ch + 0.14;
  if (o.upper !== false) {
    const xr = cw / 2 + 0.05, za = z0 + 0.2, zb = z1 + 0.4;
    for (const s of [-1, 1]) railRun(parts, s * xr, za, zb, y0);
    railCross(parts, za, -xr, xr, y0); railCross(parts, zb, -xr, xr, y0);
    for (let z = z0 + 1.2; z < z1 - 2.8; z += 1.5) for (const s of [-1, 1]) {
      parts.push(box(1.5, 0.1, 0.42, s * 1.0, y0 + 0.42, z, o.seatCol), box(1.5, 0.45, 0.07, s * 1.0, y0 + 0.65, z - 0.22, o.seatCol));
    }
    const wz = z1 - 1.5;
    parts.push(box(cw - 1.4, 1.7, 3.0, 0, y0 + 0.85, wz, o.cabinCol), box(cw - 1.0, 0.12, 3.5, 0, y0 + 1.76, wz + 0.1, o.roofCol));
    glass.push(gbox(cw - 1.8, 0.75, 0.07, 0, y0 + 1.05, wz + 1.52));
    for (const s of [-1, 1]) glass.push(gbox(0.07, 0.75, 2.2, s * (cw / 2 - 0.68), y0 + 1.05, wz + 0.1));
    parts.push(cyl(0.04, 2.0, 0, y0 + 2.8, wz - 0.6, 0x9aa3ab), box(0.9, 0.05, 0.12, 0, y0 + 3.2, wz - 0.6, 0x4a5058));
    parts.push(box(0.8, 1.3, 0.95, 0, y0 + 0.65, z0 + 1.8, o.bandCol));
  }
  // foredeck rails
  for (const s of [-1, 1]) railRun(parts, s * (B / 2 - 0.35), z1 + 0.6, L / 2 - 1.8, free, 0xdfe3e6, 1.2);
  return { hull: mergeGeometries(parts), glass: mergeGeometries(glass), len: L };
}

function buildTaxi() {
  const L = 10, B = 3.0, free = 0.8, parts = [], glass = [];
  parts.push(loft({ L, B, draft: 0.5, free, bowAt: 0.68, cols: [0x14315a, 0x8a1c1c, 0xb8bcc0] }));
  parts.push(box(2.5, 1.35, 4.4, 0, free + 0.67, 0.7, 0xf4f6f7), box(2.8, 0.1, 4.9, 0, free + 1.4, 0.7, 0xf2c200));
  glass.push(gbox(0.06, 0.7, 3.6, 1.26, free + 0.85, 0.7), gbox(0.06, 0.7, 3.6, -1.26, free + 0.85, 0.7), gbox(2.0, 0.65, 0.06, 0, free + 0.85, 2.93));
  for (const s of [-1, 1]) railRun(parts, s * 1.25, -4.2, -1.8, free, 0xdfe3e6, 1.2);
  railCross(parts, -4.4, -1.25, 1.25, free);
  parts.push(box(1.8, 0.1, 0.45, 0, free + 0.4, -3.4, 0x14315a), box(1.8, 0.4, 0.07, 0, free + 0.6, -3.65, 0x14315a));
  parts.push(cyl(0.03, 1.0, 0.6, free + 1.9, 0.2, 0x9aa3ab), box(1.2, 0.3, 0.5, 0, 0.35, -L / 2 + 0.1, 0x222629)); // aerial, outboards
  return { hull: mergeGeometries(parts), glass: mergeGeometries(glass), len: L };
}

function buildLaunch() {
  const L = 8.2, B = 2.7, free = 0.75, parts = [], glass = [];
  parts.push(loft({ L, B, draft: 0.45, free, bowAt: 0.62, cols: [0xf3f1ea, 0x1f5a8a, 0xc9b48a] }));
  parts.push(box(2.1, 1.1, 3.0, 0, free + 0.55, 0.5, 0xf8f8f4), box(2.3, 0.08, 3.3, 0, free + 1.14, 0.5, 0xdcdcd4));
  glass.push(gbox(0.06, 0.55, 2.4, 1.06, free + 0.65, 0.5), gbox(0.06, 0.55, 2.4, -1.06, free + 0.65, 0.5), gbox(1.7, 0.55, 0.06, 0, free + 0.65, 2.02));
  parts.push(box(1.2, 0.8, 1.3, 0, free + 1.58, 0.1, 0xf8f8f4), box(1.4, 0.07, 1.5, 0, free + 2.0, 0.1, 0xdcdcd4), cyl(0.03, 1.0, 0, free + 2.5, -0.1, 0x9aa3ab));
  glass.push(gbox(1.0, 0.45, 0.06, 0, free + 1.62, 0.78));
  for (const s of [-1, 1]) railRun(parts, s * 1.1, -3.6, -1.2, free, 0xdfe3e6, 1.2);
  parts.push(box(1.6, 0.1, 0.5, 0, free + 0.35, -2.2, 0x1f5a8a));
  return { hull: mergeGeometries(parts), glass: mergeGeometries(glass), len: L };
}

function buildTinnie() {
  const L = 4.6, B = 1.8, free = 0.45, parts = [];
  parts.push(loft({ L, B, draft: 0.2, free, bowAt: 0.55, sternW: 1, sheer: 0.45, cols: [0xaeb6bc, 0x7d858b, 0x8d959b] }));
  for (const z of [-0.4, 0.9]) parts.push(box(1.5, 0.07, 0.3, 0, free + 0.05, z, 0x9aa2a8));
  parts.push(box(0.5, 0.5, 0.35, 0, 0.35, -L / 2 + 0.05, 0x24282b), box(0.12, 0.5, 0.12, 0, 0.1, -L / 2 - 0.15, 0x24282b)); // outboard
  parts.push(box(0.36, 0.5, 0.24, 0, free + 0.35, -0.25, 0xd9622b), ball(0.12, 0, free + 0.74, -0.25, 0xd8a47a), box(0.05, 0.05, 1.5, 0.25, free + 0.9, 0.5, 0x2a2a2a)); // skipper, rod
  return { hull: mergeGeometries(parts), glass: null, len: L };
}

// The rowing shells (instanced): hull + riggers, a rower's body, a head, an oar (blade at the +x tip)
function buildShell(seats, scull) {
  const L = scull ? 8.2 : 17.2, parts = [];
  parts.push(loft({ L, B: scull ? 0.3 : 0.55, draft: 0.07, free: 0.1, bowAt: 0.78, sternAt: 0.18, sheer: 0.2, N: 12, cols: [0xffffff, 0xffffff, 0xffffff] }));
  const pins = [];
  const z0 = scull ? 0 : -6.0, dz = 1.7;
  for (let i = 0; i < seats; i++) {
    const z = z0 + i * dz;
    for (const s of scull ? [-1, 1] : [i % 2 ? -1 : 1]) {
      parts.push(box(0.9, 0.025, 0.05, s * 0.5, 0.2, z, 0xc9ced2)); // rigger
      pins.push({ x: s * 0.95, y: 0.22, z, side: s, seat: i });
    }
  }
  parts.push(box(0.06, 0.05, 0.9, 0, 0.12, z0 + (seats - 1) * dz / 2 + 0, 0xdadfe3)); // slide rails (short)
  return { hull: mergeGeometries(parts), len: L, pins, seatZ: Array.from({ length: seats }, (_, i) => z0 + i * dz) };
}
const TORSO = mergeGeometries([
  box(0.36, 0.5, 0.2, 0, 0.27, 0, 0xffffff),
  box(0.09, 0.09, 0.5, 0.13, 0.4, 0.3, 0xffffff), box(0.09, 0.09, 0.5, -0.13, 0.4, 0.3, 0xffffff)
]);
const HEAD = new THREE.SphereGeometry(0.1, 7, 5);
const OAR = mergeGeometries([
  tint(new THREE.CylinderGeometry(0.032, 0.032, 3.4, 4).rotateZ(Math.PI / 2).translate(0.8, 0, 0), 0x8a8f94), // shaft along +x, the pin at x = 0 (inboard 0.9, outboard 2.5 m)
  box(0.55, 0.012, 0.2, 2.35, 0, 0, 0xffffff)
]);

// ---------------------------------------------------------------------------------------------------------------------
function wakeTexture() {
  const W = 128, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if ('filter' in g) g.filter = 'blur(1.6px)';
  const fade = (a0, a1) => { const gr = g.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, `rgba(255,255,255,${a0})`); gr.addColorStop(1, `rgba(255,255,255,${a1})`); return gr; };
  // the two arms of the V (stern at the bottom, where v = 0), a thinner second set inside, and the foam wedge down the middle
  g.lineCap = 'round';
  for (const [dx, w, a] of [[56, 7, 0.75], [38, 4, 0.5], [22, 3, 0.35]]) for (const s of [-1, 1]) {
    g.strokeStyle = fade(a, 0); g.lineWidth = w;
    g.beginPath(); g.moveTo(64, H - 6); g.lineTo(64 + s * dx, 6); g.stroke();
  }
  g.fillStyle = fade(0.9, 0);
  g.beginPath(); g.moveTo(58, H); g.lineTo(70, H); g.lineTo(88, H * 0.45); g.lineTo(64, 0.12 * H); g.lineTo(40, H * 0.45); g.closePath(); g.fill();
  for (let i = 0; i < 70; i++) { // foam flecks
    const t = Math.pow(Math.random(), 1.6), y = H - t * H * 0.8, x = 64 + (Math.random() - 0.5) * (14 + t * 50);
    g.fillStyle = `rgba(255,255,255,${0.55 * (1 - t)})`; g.beginPath(); g.arc(x, y, 1 + Math.random() * 2.4, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------------------------------------------------
export function createRiverBoats({ scene, lightingSystem }) {
  const root = new THREE.Group();
  root.name = 'RiverBoats';
  scene.add(root);
  if (!RING) return { group: root, update() {}, boats: [] };

  const reachA = buildReach('A', -545, -52, 25, 12);
  const reachB = buildReach('B', 62, 300, 10, 10);

  const hullMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
  const glassMat = new THREE.MeshStandardNodeMaterial({ color: 0x1b2a38, roughness: 0.15, metalness: 0.3, emissive: new THREE.Color(0xffd9a0), emissiveIntensity: 0 });
  const shellMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.4 });
  const wakeMat = new THREE.MeshBasicNodeMaterial({ map: wakeTexture(), transparent: true, depthWrite: false, opacity: 0.5 });

  const boats = [];
  const shells = []; // rowing boats (instanced)
  let seedPh = 1;

  // ---- motor boats ----
  const FERRY1 = buildFerry({ L: 24, B: 5.6, hullCol: 0xf2f4f6, lowCol: 0x16355c, deckCol: 0xcfd4d8, cabinCol: 0xf6f7f8, roofCol: 0xd8dde0, bandCol: 0x1a4f8a, seatCol: 0x2a5c93 });
  const FERRY2 = buildFerry({ L: 17, B: 4.4, free: 0.95, draft: 0.75, foredeck: 4.4, hullCol: 0xf1e9d6, lowCol: 0x6b1d1d, deckCol: 0xc7bda5, cabinCol: 0xf4efe2, roofCol: 0xbf9d5a, bandCol: 0x8c2a2a, seatCol: 0x8c2a2a });
  const TAXI = buildTaxi(), LAUNCH = buildLaunch(), TINNIE = buildTinnie();
  const motor = (name, geo, o) => {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(geo.hull, hullMat);
    g.add(hull);
    if (geo.glass) g.add(new THREE.Mesh(geo.glass, glassMat));
    for (const m of g.children) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; }
    g.rotation.order = 'YXZ';
    g.visible = false;
    root.add(g);
    boats.push({ name, kind: 'motor', obj: g, L: geo.len, beam: o.beam, speed: o.speed, turn: o.turn, wake: o.wake, lanes: o.lanes, reach: o.reach, dir: o.dir, x: o.x, rolls: o.rolls ?? 1 });
  };
  motor('Yarra cruise ferry', FERRY1, { beam: 5.6, speed: 4.6, turn: 0.30, wake: [54, 30], lanes: [0.30, 0.78], reach: reachA, dir: 1, x: -380 });
  if (!LITE) motor('Southbank cruise ferry', FERRY2, { beam: 4.4, speed: 4.0, turn: 0.34, wake: [38, 21], lanes: [0.40, 0.62], reach: reachA, dir: -1, x: -200 });
  motor('Water taxi', TAXI, { beam: 3.0, speed: 7.4, turn: 0.6, wake: [30, 17], lanes: [0.5, 0.5], reach: reachA, dir: -1, x: -420, rolls: 1.6 });
  motor('Motor launch', LAUNCH, { beam: 2.7, speed: 5.4, turn: 0.55, wake: [24, 13], lanes: [0.06, 0.98], reach: reachA, dir: 1, x: -160, rolls: 1.4 });
  if (!LITE) motor('Tinnie', TINNIE, { beam: 1.8, speed: 5.6, turn: 0.9, wake: [14, 7], lanes: [0.38, 0.62], reach: reachB, dir: 1, x: 140, rolls: 2 });

  // ---- rowing shells (instanced) ----
  const TEAMS = [0xd23a2c, 0x1f7ae0, 0xf2b01e, 0x2a9d5c, 0xffffff];
  const EIGHT = buildShell(8, false), SCULL = buildShell(1, true);
  const shell = (name, geo, scull, o, reach = reachB) => shells.push({ name, geo, scull, kind: 'shell', L: geo.len, beam: scull ? 3.2 : 6.4, speed: o.speed, turn: 0.22, wake: scull ? [10, 4.5] : [13, 5.5], lanes: o.lanes, reach, dir: o.dir, x: o.x, rate: o.rate, team: o.team });
  shell('Eight (red)', EIGHT, false, { speed: 4.9, lanes: [0.14, 0.86], dir: 1, x: 120, rate: 0.5, team: TEAMS[0] });
  shell('Eight (blue)', EIGHT, false, { speed: 4.6, lanes: [0.30, 0.70], dir: -1, x: 250, rate: 0.47, team: TEAMS[1] });
  if (!LITE) shell('Eight (gold)', EIGHT, false, { speed: 5.1, lanes: [0.46, 0.54], dir: 1, x: 220, rate: 0.52, team: TEAMS[2] });
  shell('Single scull', SCULL, true, { speed: 3.4, lanes: [0.06, 0.94], dir: -1, x: 160, rate: 0.4, team: TEAMS[3] });
  if (!LITE) shell('Single scull 2', SCULL, true, { speed: 3.1, lanes: [0.22, 0.78], dir: 1, x: 100, rate: 0.38, team: TEAMS[4] });
  shell('Single scull 3 (Southbank)', SCULL, true, { speed: 3.3, lanes: [0.17, 0.87], dir: 1, x: -300, rate: 0.42, team: TEAMS[2] }, reachA);
  boats.push(...shells);

  const eights = shells.filter((s) => !s.scull), sculls = shells.filter((s) => s.scull);
  const rowers = shells.reduce((n, s) => n + s.geo.seatZ.length, 0), oars = shells.reduce((n, s) => n + s.geo.pins.length, 0);
  const mkInst = (geo, n, mat) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; root.add(m); return m; };
  const eightHull = eights.length ? mkInst(EIGHT.hull, eights.length, shellMat) : null;
  const scullHull = sculls.length ? mkInst(SCULL.hull, sculls.length, shellMat) : null;
  const torsoMesh = mkInst(TORSO, rowers, shellMat);
  const headMesh = mkInst(HEAD, rowers, new THREE.MeshStandardNodeMaterial({ color: 0xd8a47a, roughness: 0.8 }));
  const oarMesh = mkInst(OAR, oars, shellMat);
  eights.forEach((s, i) => eightHull.setColorAt(i, new THREE.Color(s.team)));
  sculls.forEach((s, i) => scullHull.setColorAt(i, new THREE.Color(s.team)));
  { let ri = 0, oi = 0;
    for (const s of shells) {
      s.ri = ri; s.oi = oi;
      for (let k = 0; k < s.geo.seatZ.length; k++) torsoMesh.setColorAt(ri + k, new THREE.Color(s.team === 0xffffff ? 0x223a66 : s.team).multiplyScalar(0.9));
      for (let k = 0; k < s.geo.pins.length; k++) oarMesh.setColorAt(oi + k, new THREE.Color(s.team));
      ri += s.geo.seatZ.length; oi += s.geo.pins.length;
    }
  }

  // ---- wakes: one instanced quad per boat ----
  const wakeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5); // stern at z = 0, trailing to -z
  const wakes = new THREE.InstancedMesh(wakeGeo, wakeMat, boats.length);
  wakes.frustumCulled = false; wakes.renderOrder = 2; wakes.count = 0;
  wakes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(wakes);

  // ---- state ----
  for (const b of boats) {
    b.half = b.beam / 2;
    b.f = b.lanes[b.dir > 0 ? 1 : 0] + (rnd() - 0.5) * 0.02;
    b.z = b.reach.lane(b.x, b.f);
    const e = b.reach.lane(b.x + b.dir * 6, b.f) - b.z;
    b.h = Math.atan2(b.dir * 6, e);
    b.v = b.speed; b.tr = 0; b.ph = rnd() * 6.28; b.ph2 = rnd() * 6.28; b.stroke = rnd() * 6.28;
    b.roll = 0; b.pitch = 0; b.y = WL; b.vr = 1; b.show = false;
    b.cruise = b.speed * (0.92 + rnd() * 0.16);
  }

  const _t = new THREE.Matrix4(), _m = new THREE.Matrix4(), _b = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
  let time = 0;

  function steer(b, dt) {
    const R = b.reach;
    const distEnd = b.dir > 0 ? R.x1 - b.x : b.x - R.x0;
    if (distEnd < 22 + b.L * 0.7) { b.dir = -b.dir; b.f = b.lanes[b.dir > 0 ? 1 : 0] + (rnd() - 0.5) * 0.02; }
    const La = 16 + b.v * 4 + b.L * 0.3;
    const xt = clamp(b.x + b.dir * La, R.x0 - 40, R.x1 + 40);
    const zt = R.lane(clamp(xt, R.x0, R.x1), b.f);
    const want = Math.atan2(xt - b.x, zt - b.z), dh = wrapPi(want - b.h);
    // turn rate eases toward what the error asks for (never above the boat's limit): smooth heading, wide turnarounds
    const trT = clamp(dh * 1.1, -b.turn, b.turn);
    b.tr += (trT - b.tr) * Math.min(1, dt * 1.6);
    b.h = wrapPi(b.h + b.tr * dt);
    // speed: slow for the ends and while turning, eased in and out
    const endK = 0.4 + 0.6 * smooth(0, 90, Math.max(0, b.dir > 0 ? R.x1 - b.x : b.x - R.x0)), turnK = 1 - 0.55 * smooth(0.15, 1.3, Math.abs(dh));
    const vt = b.cruise * Math.min(endK, turnK, b.yield);
    b.v += (vt - b.v) * Math.min(1, dt * (vt < b.v ? 1.2 : 0.6));
    b.vr = b.v / b.cruise;
    b.x += Math.sin(b.h) * b.v * dt;
    b.z += Math.cos(b.h) * b.v * dt;
    const [zlo, zhi] = R.limits(b.x, b.half);
    b.z = clamp(b.z, zlo, zhi);
    b.x = clamp(b.x, R.x0 - 25, R.x1 + 25);
    // bob, pitch and roll: a slow swell, plus heel into turns
    const sw = b.kind === 'shell' ? 0.6 : 1;
    b.y = WL + (Math.sin(time * 1.15 + b.ph) * 0.035 + Math.sin(time * 0.7 + b.ph2) * 0.02) * sw;
    b.pitch = Math.sin(time * 0.9 + b.ph2) * 0.012 * sw - b.vr * 0.004;
    b.roll += ((Math.sin(time * 1.3 + b.ph) * 0.018 - b.tr * (b.rolls ?? 1) * b.v * 0.012 * (b.kind === 'shell' ? 0.2 : 1)) * sw - b.roll) * Math.min(1, dt * 2.5);
  }

  function place(b) { // base transform of the hull
    _e.set(b.pitch, b.h, b.roll, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(b.x, b.y, b.z);
    _b.compose(_p, _q, _s);
  }

  function update(dt, camPos) {
    dt = Math.min(dt, 0.1);
    time += dt;
    const nf = lightingSystem?.uNightFactor?.value ?? 0;
    glassMat.emissiveIntensity = nf * 1.6;
    wakeMat.color.setScalar(1 - 0.6 * nf);
    let any = false, wi = 0;
    // right of way: a boat yields (slows, and is nudged aside) to any other boat close ahead of it on the same reach
    for (const b of boats) {
      b.yield = 1;
      for (const c of boats) {
        if (c === b || c.reach !== b.reach) continue;
        const rx = c.x - b.x, rz = c.z - b.z, d = Math.hypot(rx, rz), d0 = (b.L + c.L) * 0.32 + (b.beam + c.beam) * 0.6;
        if (d > d0 || d < 1e-3) continue;
        const ahead = (rx * Math.sin(b.h) + rz * Math.cos(b.h)) / d > 0.2;
        if (ahead && boats.indexOf(b) > boats.indexOf(c)) b.yield = Math.min(b.yield, 0.15 + 0.85 * smooth(d0 * 0.45, d0, d));
        if (d < d0 * 0.55 && boats.indexOf(b) > boats.indexOf(c)) { const k = (1 - d / (d0 * 0.55)) * 1.8 * dt; b.x -= (rx / d) * k; b.z -= (rz / d) * k; }
      }
    }
    for (const b of boats) {
      steer(b, dt);
      const dx = camPos.x - b.x, dz = camPos.z - b.z, far = b.kind === 'shell' ? 520 : 800;
      b.show = dx * dx + dz * dz < far * far;
      if (b.show) any = true;
    }
    root.visible = any;
    if (!any) return;

    // motor boats
    for (const b of boats) if (b.kind === 'motor') {
      b.obj.visible = b.show;
      if (!b.show) continue;
      b.obj.position.set(b.x, b.y, b.z);
      b.obj.rotation.set(b.pitch, b.h, b.roll);
      b.obj.updateMatrixWorld(true);
    }

    // rowing shells
    let nh = 0, ne = 0, ns = 0, nr = 0, no = 0;
    for (const s of shells) {
      if (!s.show) continue;
      place(s);
      const sg = s.scull ? scullHull : eightHull;
      sg.setMatrixAt(s.scull ? ns++ : ne++, _b);
      s.stroke += dt * Math.PI * 2 * s.rate * (0.25 + 0.75 * s.vr);
      const sn = Math.sin(s.stroke), cs = Math.cos(s.stroke);
      const sweep = 0.52 * sn, lift = 0.1 - 0.13 * Math.tanh(cs * 3), lean = -0.5 * sn, slide = -0.22 * sn;
      s.geo.seatZ.forEach((z) => {
        _q.setFromEuler(_e.set(lean, 0, 0, 'XYZ'));
        _l.compose(_p.set(0, 0.2, z + slide), _q, _s); _m.multiplyMatrices(_b, _l); torsoMesh.setMatrixAt(nr, _m);
        _l.multiply(_t.makeTranslation(0, 0.62, 0.04)); _m.multiplyMatrices(_b, _l); headMesh.setMatrixAt(nr, _m);
        nr++;
      });
      for (const pin of s.geo.pins) {
        const yaw = (pin.side > 0 ? 0 : Math.PI) + pin.side * sweep + (s.scull ? 0 : 0);
        _qa.setFromAxisAngle(_p.set(0, 1, 0), yaw); _qb.setFromAxisAngle(_p.set(0, 0, 1), lift);
        _q.copy(_qa).multiply(_qb);
        _l.compose(_p.set(pin.x, pin.y, pin.z), _q, _s); _m.multiplyMatrices(_b, _l); oarMesh.setMatrixAt(no++, _m);
      }
    }
    if (eightHull) { eightHull.count = ne; eightHull.instanceMatrix.needsUpdate = true; }
    if (scullHull) { scullHull.count = ns; scullHull.instanceMatrix.needsUpdate = true; }
    torsoMesh.count = headMesh.count = nr; oarMesh.count = no;
    torsoMesh.instanceMatrix.needsUpdate = headMesh.instanceMatrix.needsUpdate = oarMesh.instanceMatrix.needsUpdate = true;

    // wakes (stern, scaled by speed so a boat easing into its turnaround stirs less water)
    for (const b of boats) {
      if (!b.show) continue;
      const k = 0.35 + 0.65 * clamp(b.vr, 0, 1.1);
      _q.setFromEuler(_e.set(0, b.h, 0, 'YXZ'));
      _p.set(b.x - Math.sin(b.h) * b.L * 0.42, WL + 0.07, b.z - Math.cos(b.h) * b.L * 0.42);
      _s.set(b.wake[1] * k, 1, b.wake[0] * k);
      _m.compose(_p, _q, _s); wakes.setMatrixAt(wi++, _m);
      _s.set(1, 1, 1);
    }
    wakes.count = wi; wakes.instanceMatrix.needsUpdate = true;
    for (const m of [eightHull, scullHull, torsoMesh, headMesh, oarMesh]) if (m?.instanceColor) m.instanceColor.needsUpdate = true;
  }

  return { group: root, update, boats, reaches: { A: reachA, B: reachB }, WL };
}
