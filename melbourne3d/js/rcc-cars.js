// Cars ported from Red Clay Chase (js/car.js): the lofted convertible (a drivable player car) and the sedan / pickup /
// van traffic shapes.
//
// The lofted bodies, spline tables and shapes below are adapted from:
//   Red Clay Chase, https://github.com/noclipepe/red-clay-chase
//   MIT License, Copyright (c) 2026 noclipepe
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//   documentation files (the "Software"), to deal in the Software without restriction, including without limitation
//   the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
//   to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above
//   copyright notice and this permission notice shall be included in all copies or substantial portions of the
//   Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
//
// Changes: MeshStandardNodeMaterial instead of their physical materials and shader patches; geometry merged per
// material (the convertible is a few draw calls: paint, black, trim/detail by vertex colour, glass, and one mesh per
// wheel; hood and the two doors are separate groups so js/car-damage.js works on them natively); the traffic shapes
// are returned as one geometry with our `partId` attribute so the instanced traffic material paints them (paint
// variety, lamps, plates) like every other traffic car.
import * as THREE from 'three/webgpu';
import { toCreasedNormals, mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (x) => Math.exp(-x * x);

function spline(keys) {
  const n = keys.length, m = new Array(n);
  for (let k = 0; k < n; k++) {
    const a = keys[Math.max(0, k - 1)], b = keys[Math.min(n - 1, k + 1)];
    m[k] = (b[1] - a[1]) / ((b[0] - a[0]) || 1);
  }
  return (x) => {
    if (x <= keys[0][0]) return keys[0][1];
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let k = 0; while (keys[k + 1][0] < x) k++;
    const x0 = keys[k][0], x1 = keys[k + 1][0], h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * keys[k][1] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * keys[k + 1][1] + (t3 - t2) * h * m[k + 1];
  };
}
const tf = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  return geo.applyMatrix4(m);
};
const box = (w, h, d, x, y, z, rx, ry, rz) => tf(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
const crease = (arr, angle) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return toCreasedNormals(g, angle);
};
// position + normal only (merge-compatible), non-indexed
const plain = (g) => {
  const o = g.index ? g.toNonIndexed() : g, r = new THREE.BufferGeometry();
  r.setAttribute('position', o.attributes.position);
  if (!o.attributes.normal) o.computeVertexNormals();
  r.setAttribute('normal', o.attributes.normal);
  return r;
};
const mergeN = (list) => mergeGeometries(list.map(plain));
const colored = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };

// ======================================= the convertible ==========================================================
const ZF = 1.36, ZR = -1.26, RA = 0.405, WR = 0.35, ZC0 = -0.72, ZC1 = 0.40, ZT = -2.16, ZN = 2.22;
const fTop = spline([[-2.16, 0.895], [-2.02, 0.902], [-1.8, 0.897], [-1.3, 0.902], [-0.74, 0.918], [0.42, 0.925], [0.8, 0.897], [1.36, 0.818], [1.8, 0.716], [2.05, 0.612], [2.22, 0.515]]);
const fSh = spline([[-2.16, 0.84], [-2.0, 0.872], [-1.7, 0.906], [-1.26, 0.926], [-0.9, 0.902], [-0.3, 0.866], [0.42, 0.868], [0.9, 0.861], [1.36, 0.846], [1.75, 0.758], [2.03, 0.632], [2.22, 0.505]]);
const fBot = spline([[-2.16, 0.36], [-1.95, 0.27], [-1.7, 0.18], [-1.5, 0.15], [1.65, 0.15], [1.95, 0.19], [2.22, 0.27]]);
const fW = spline([[-2.16, 0.8], [-2.1, 0.874], [-1.95, 0.92], [-1.26, 0.956], [-0.6, 0.926], [0.3, 0.914], [1.36, 0.946], [1.8, 0.902], [2.03, 0.824], [2.15, 0.705], [2.22, 0.565]]);
const fCr = spline([[-2.16, 0.66], [-1.26, 0.705], [-0.2, 0.628], [1.36, 0.602], [2.0, 0.5], [2.22, 0.425]]);
const fDip = (z) => 0.012 + 0.022 * smooth(0.3, 0.8, z);
const KS = 11, KD = 8, K = KS + KD;
const ZH0 = 0.62, ZH1 = 2.0, JH = 13; // hood panel: between these stations, inboard of ring point JH on both sides

function section(z, cabin, archY) {
  const w = fW(z), yt = fTop(z), ys = fSh(z), yb = fBot(z), yc = Math.min(fCr(z), ys - 0.07), pts = [];
  pts.push([0, yb], [0.55 * w, yb], [w - 0.085, yb], [w - 0.045, yb + 0.02], [w - 0.02, yb + 0.09], [w - 0.003, yb + (yc - yb) * 0.6],
    [w, yc - 0.035], [w - 0.008, yc], [w - 0.04, yc + (ys - yc) * 0.5], [w - 0.09, yc + (ys - yc) * 0.88], [w - 0.15, ys]);
  if (archY > 0) for (const p of pts) if (p[1] < archY) p[1] = archY;
  if (cabin) {
    pts.push([w - 0.215, ys + 0.003], [w - 0.225, ys - 0.25], [w - 0.235, 0.34], [0.5 * (w - 0.235) + 0.1, 0.33], [0.2, 0.33], [0.17, 0.55], [0.1, 0.575], [0, 0.58]);
  } else {
    const xe = w - 0.15, yv = Math.min(ys, yt) - fDip(z), hz = z < ZC0 ? smooth(-1.75, -0.85, z) : 0;
    for (let k = 1; k <= KD; k++) {
      const u = 1 - k / KD, x = xe * u;
      let y = u > 0.7 ? yv + (ys - yv) * smooth(0.7, 1.0, u) : yt + (yv - yt) * smooth(0.12, 0.7, u);
      y += 0.044 * hz * gauss((x - 0.375) / 0.18);
      pts.push([x, y]);
    }
  }
  return pts;
}

function convertibleBody() {
  const special = [];
  for (const z of [ZT, -2.135, -2.09, -2.02, 2.06, 2.12, 2.17, 2.2, ZN]) special.push({ z, cabin: false, arch: 0 });
  for (const za of [ZF, ZR]) {
    special.push({ z: za - 0.3725, cabin: false, arch: 0 }, { z: za + 0.3725, cabin: false, arch: 0 });
    for (let k = 0; k <= 14; k++) { const dz = -0.37 * Math.cos(Math.PI * k / 14); special.push({ z: za + dz, cabin: false, arch: WR + Math.sqrt(RA * RA - dz * dz) }); }
  }
  special.push({ z: ZH0, cabin: false, arch: 0 }, { z: ZH1, cabin: false, arch: 0 });
  special.push({ z: ZC0 - 0.004, cabin: false, arch: 0 }, { z: ZC0 + 0.004, cabin: true, arch: 0 }, { z: ZC1 - 0.004, cabin: true, arch: 0 }, { z: ZC1 + 0.004, cabin: false, arch: 0 });
  const stn = special.slice();
  for (let z = -1.96; z < 2.03; z += 0.1) { // (a little coarser than the original's 0.066 step: fewer triangles)
    let ok = true;
    for (const s of special) if (Math.abs(s.z - z) < 0.04) ok = false;
    if (Math.abs(z - ZF) < 0.38 || Math.abs(z - ZR) < 0.38) ok = false;
    if (ok) stn.push({ z, cabin: z > ZC0 && z < ZC1, arch: 0 });
  }
  stn.sort((a, b) => a.z - b.z);
  const RING = 2 * K - 2, S = stn.length;
  const ring = stn.map((s) => {
    const h = section(s.z, s.cabin, s.arch), r = [];
    for (let j = 0; j < K; j++) r.push([h[j][0], h[j][1], s.z]);
    for (let j = K - 2; j >= 1; j--) r.push([-h[j][0], h[j][1], s.z]);
    return r;
  });
  const paint = [], black = [], hood = [], hoodIn = [], dP = { 1: [], '-1': [] }, dB = { 1: [], '-1': [] };
  const tri = (list, a, b, c) => list.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let i = 0; i < S - 1; i++) for (let j = 0; j < RING; j++) {
    const j2 = (j + 1) % RING, a = ring[i][j], b = ring[i][j2], c = ring[i + 1][j], d = ring[i + 1][j2];
    const jj = j < K - 1 ? j : RING - 1 - j, sx = j < K - 1 ? 1 : -1, zm = (stn[i].z + stn[i + 1].z) / 2;
    const cab = stn[i].cabin && stn[i + 1].cabin;
    const tub = jj >= KS && (stn[i].cabin || stn[i + 1].cabin);
    const well = jj <= 2 && (stn[i].arch > 0 || stn[i + 1].arch > 0);
    let list = tub || well ? black : paint;
    if (!stn[i].cabin && !stn[i + 1].cabin && zm > ZH0 && zm < ZH1 && jj >= JH) list = hood; // hood skin
    else if (cab && jj >= 3 && jj <= 12) list = jj >= KS ? dB[sx] : dP[sx]; // door: outer skin, top, inner card
    tri(list, a, b, c); tri(list, b, d, c);
  }
  for (let k = 0; k < hood.length; k += 9) hoodIn.push(hood[k], hood[k + 1] - 0.004, hood[k + 2], hood[k + 6], hood[k + 7] - 0.004, hood[k + 8], hood[k + 3], hood[k + 4] - 0.004, hood[k + 5]); // underside
  const cap = (i, list, flip) => {
    const r = ring[i]; let cy = 0; for (const p of r) cy += p[1]; cy /= r.length; const c = [0, cy, r[0][2]];
    for (let j = 0; j < RING; j++) { const a = r[j], b = r[(j + 1) % RING]; if (flip) tri(list, c, b, a); else tri(list, c, a, b); }
  };
  cap(0, paint, true); cap(S - 1, black, false);
  return { paint, black, hood, hoodIn, dP, dB, ring, stn };
}

function lensPatch(sx, z0, z1, f0, f1, lift) { // headlight lens that follows the body surface
  const NA = 6, NB = 4, pos = [], idx = [];
  const surf = (z, f) => { const s = section(z, false, 0), n = K - 1 - 7, t = 7 + f * n, i = Math.min(K - 2, Math.floor(t)), u = t - i; return [s[i][0] + (s[i + 1][0] - s[i][0]) * u, s[i][1] + (s[i + 1][1] - s[i][1]) * u]; };
  for (let a = 0; a <= NA; a++) {
    const t = a / NA, z = z0 + (z1 - z0) * t, k = Math.sqrt(Math.sin(t * Math.PI * 0.5)), lo = lerp((f0 + f1) / 2, f0, k), hi = lerp((f0 + f1) / 2, f1, k);
    for (let b = 0; b <= NB; b++) { const p = surf(z, lo + (hi - lo) * b / NB); pos.push(sx * (p[0] + lift * 0.4), p[1] + lift, z + lift * 0.5); }
  }
  for (let a = 0; a < NA; a++) for (let b = 0; b < NB; b++) {
    const v = a * (NB + 1) + b;
    if (sx > 0) idx.push(v, v + 1, v + NB + 1, v + 1, v + NB + 2, v + NB + 1); else idx.push(v, v + NB + 1, v + 1, v + 1, v + NB + 1, v + NB + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// one wheel (tyre + rim + spokes + hub), vertex-coloured, as a single geometry: +x is outward
function wheelGeometry() {
  const prof = [[0.25, -0.125], [0.302, -0.131], [0.338, -0.112], [0.35, -0.07], [0.35, 0.07], [0.338, 0.112], [0.302, 0.131], [0.25, 0.125]];
  const tire = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 24).rotateZ(-Math.PI / 2);
  const parts = [colored(plain(tire), 0x141416)];
  const barrel = new THREE.CylinderGeometry(0.252, 0.252, 0.235, 20, 1, true).rotateZ(Math.PI / 2);
  parts.push(colored(plain(barrel), 0x101113));
  const back = new THREE.CircleGeometry(0.252, 16).rotateY(Math.PI / 2).translate(-0.04, 0, 0);
  parts.push(colored(plain(back), 0x101113));
  const face = new THREE.CircleGeometry(0.252, 16).rotateY(Math.PI / 2).translate(0.1, 0, 0);
  parts.push(colored(plain(face), 0x2a2c30));
  for (let a = 0; a < 5; a++) { const g = new THREE.BoxGeometry(0.02, 0.2, 0.05).rotateZ(-0.25).translate(0.108, 0.14, 0).rotateX(a * Math.PI * 0.4); parts.push(colored(plain(g), 0xb5b9be)); }
  const hub = new THREE.CylinderGeometry(0.05, 0.062, 0.05, 12).rotateZ(-Math.PI / 2).translate(0.12, 0, 0);
  parts.push(colored(plain(hub), 0xc9ccd0));
  return mergeGeometries(parts);
}

/** The convertible: { root, wheels: { 'wheel-front-left': Object3D, ... }, panels: { hood, doorL, doorR } }. Car space: +z forward, +x left. */
export function buildConvertible({ paintHex = 0xa60205 } = {}) {
  const b = convertibleBody();
  const mat = (o) => new THREE.MeshStandardNodeMaterial(o);
  const paintM = mat({ color: paintHex, roughness: 0.32, metalness: 0.45 });
  const blackM = mat({ color: 0x0d0d0f, roughness: 0.6, metalness: 0.1 });
  const detailM = mat({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.5 });
  const glassM = mat({ color: 0x1c262c, roughness: 0.05, metalness: 0.7, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
  const wheelM = mat({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.4 });
  const root = new THREE.Group(), body = new THREE.Group();
  root.name = 'RccConvertible';
  root.rotation.order = 'YXZ';
  root.add(body);
  const add = (g, m, parent = body) => { const ms = new THREE.Mesh(g, m); ms.castShadow = true; ms.receiveShadow = true; parent.add(ms); return ms; };
  const P = [crease(b.paint, 0.72)], Bk = [crease(b.black, 0.9)], D = []; // D: vertex-coloured details
  const dt = (g, hex) => D.push(colored(plain(g), hex));
  // underbody, sills, engine bay floor
  Bk.push(box(1.2, 0.14, 3.8, 0, 0.245, 0), box(1.2, 0.48, 0.76, 0, 0.41, ZF - 0.02), box(1.2, 0.56, 0.8, 0, 0.45, ZR));
  for (const sx of [-1, 1]) {
    dt(box(0.06, 0.07, 1.72, sx * 0.885, 0.185, 0.05), 0x08080a); // sill
    dt(box(0.006, 0.46, 0.012, sx * (fW(ZC0) + 0.0005), 0.46, ZC0 + 0.002), 0x08080a); // door shut lines
    dt(box(0.006, 0.44, 0.012, sx * (fW(ZC1) + 0.0005), 0.44, ZC1 - 0.002), 0x08080a);
  }
  const YB = 0.305;
  Bk.push(box(1.04, 0.01, 1.38, 0, YB, (ZH0 + ZH1) / 2)); // engine bay floor (seen once the hood has gone)
  dt(box(0.5, 0.3, 0.74, 0, 0.47, 1.22), 0x2a2c30); // engine block
  dt(box(0.78, 0.2, 0.05, 0, 0.43, 1.9), 0x15161a); // radiator
  // nose and tail
  dt(box(1.16, 0.03, 0.16, 0, 0.245, 2.15), 0x08080a);
  for (const k of [0.335, 0.385, 0.435]) dt(box(1.0, 0.012, 0.02, 0, k, 2.224), 0x08080a);
  for (const sx of [-1, 1]) {
    dt(lensPatch(sx, 1.62, 2.09, 0.16, 0.5, 0.007), 0xe8eef4); // headlight
    dt(box(0.3, 0.07, 0.03, sx * 0.625, 0.742, ZT - 0.01), 0xd01808); // tail lamp
    dt(box(0.46, 0.25, 0.1, sx * 0.53, 0.325, ZT + 0.045), 0x08080a); // corner pod
    for (const ox of [0.46, 0.585]) dt(tf(new THREE.CylinderGeometry(0.047, 0.051, 0.16, 10, 1, true), sx * ox, 0.3, ZT + 0.03, Math.PI / 2), 0xc9ccd0); // exhausts
  }
  dt(box(0.3, 0.014, 0.022, 0, 0.887, ZT - 0.002), 0xd01808);
  dt(box(0.37, 0.19, 0.03, 0, 0.5, ZT + 0.006), 0x2a2c30);
  dt(box(0.3, 0.15, 0.01, 0, 0.5, ZT - 0.012), 0xe8e8e0); // plate
  dt(box(1.5, 0.19, 0.16, 0, 0.255, ZT + 0.09), 0x08080a); // valance
  // cabin: seats, console, roll hoops
  dt(box(1.34, 0.18, 0.3, 0, 0.77, 0.27), 0x121214);
  dt(box(0.24, 0.2, 0.75, 0, 0.56, -0.26), 0x121214);
  for (const sx of [-1, 1]) {
    const x = sx * 0.37;
    dt(box(0.46, 0.14, 0.5, x, 0.42, -0.28), 0x121214);
    dt(box(0.46, 0.6, 0.13, x, 0.72, -0.58, -0.2), 0x121214);
    dt(box(0.25, 0.2, 0.1, x, 1.04, -0.655, -0.14), 0x121214);
    dt(tf(new THREE.TorusGeometry(0.135, 0.018, 6, 12, Math.PI), x, 0.94, -0.752, -0.1), 0xc9ccd0); // headrest hoop
  }
  // windshield frame, glass and mirrors
  const wsB = 0.52, wsT = 0.1, yB = fSh(wsB) - 0.006, yT = 1.21, xB = fW(wsB) - 0.165, xT = 0.66;
  const yBc = (() => { const s = section(wsB + 0.06, false, 0), n = K - 1 - 7; return s[7 + n][1] - 0.004; })();
  {
    const pts = [new THREE.Vector3(xB, yB, wsB), new THREE.Vector3(xT, yT, wsT), new THREE.Vector3(xT - 0.06, yT + 0.012, wsT - 0.012), new THREE.Vector3(-xT + 0.06, yT + 0.012, wsT - 0.012), new THREE.Vector3(-xT, yT, wsT), new THREE.Vector3(-xB, yB, wsB)];
    const path = new THREE.CurvePath();
    for (let k = 0; k < pts.length - 1; k++) path.add(new THREE.LineCurve3(pts[k], pts[k + 1]));
    dt(new THREE.TubeGeometry(path, 24, 0.021, 5, false), 0x08080a);
  }
  const glassPos = [], GX = 8, GY = 3, gIdx = [];
  for (let bb = 0; bb <= GY; bb++) for (let a = 0; a <= GX; a++) {
    const u = a / GX * 2 - 1, v = bb / GY, hw = lerp(xB, xT, v) - 0.005;
    glassPos.push(u * hw, lerp(yB + (yBc - yB) * (1 - u * u), yT, v), lerp(wsB, wsT, v) + 0.07 * (1 - u * u) * (1 - v * 0.4));
  }
  for (let bb = 0; bb < GY; bb++) for (let a = 0; a < GX; a++) { const v0 = bb * (GX + 1) + a; gIdx.push(v0, v0 + 1, v0 + GX + 1, v0 + 1, v0 + GX + 2, v0 + GX + 1); }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(glassPos, 3)); gg.setIndex(gIdx); gg.computeVertexNormals();
  const glass = add(gg, glassM); glass.renderOrder = 3; glass.castShadow = false;
  for (const sx of [-1, 1]) P.push(box(0.1, 0.085, 0.17, sx * (xB + 0.2), yB + 0.085, wsB - 0.06, 0, sx * 0.22, 0)); // mirrors
  // lamp glow stays dim: emissive is not worth a material here
  add(mergeN(P), paintM); add(mergeN(Bk), blackM); add(mergeGeometries(D), detailM);
  // loose panels: each hangs in its own group at its hinge (home: hinge position; c: panel centre relative to the hinge)
  const panels = {};
  const panel = (name, px, py, pz, cx, cy, cz, sx, geos) => {
    const g = new THREE.Group(); g.name = name; g.position.set(px, py, pz);
    for (const [geo, m] of geos) add(geo.translate(-px, -py, -pz), m, g);
    body.add(g); panels[name] = { g, home: [px, py, pz], c: [cx - px, cy - py, cz - pz], sx };
  };
  panel('hood', 0, fTop(ZH0) - 0.03, ZH0, 0, fTop(1.31) - 0.03, 1.31, 0, [[crease(b.hood, 0.72), paintM], [crease(b.hoodIn, 0.72), blackM]]);
  for (const sx of [1, -1]) panel(sx > 0 ? 'doorL' : 'doorR', sx * (fW(ZC1) - 0.03), 0.5, ZC1 - 0.004, sx * (fW(-0.16) - 0.11), 0.55, -0.16, sx,
    [[crease(b.dP[sx], 0.72), paintM], [crease(b.dB[sx], 0.9), blackM]]);
  // wheels: one merged mesh each, in a steer group (front) and a spin group
  const wg = wheelGeometry(), wheels = {};
  for (const [name, sx, z] of [['wheel-front-left', 1, ZF], ['wheel-front-right', -1, ZF], ['wheel-back-left', 1, ZR], ['wheel-back-right', -1, ZR]]) {
    const steer = new THREE.Group(); steer.name = name; steer.position.set(sx * 0.815, WR, z); steer.rotation.order = 'YXZ'; root.add(steer);
    const flip = new THREE.Group(); flip.scale.x = sx; steer.add(flip);
    add(wg, wheelM, flip);
    wheels[name] = steer;
  }
  root.userData.panels = panels;
  return { root, wheels, panels, wheelbase: ZF - ZR };
}

// ======================================= traffic shapes ===========================================================
// base: the cars.js body spec whose wheels, axles and paint layout the shape borrows (wheelZ, wheelRadius, track)
const SHAPES = {
  sedan: {
    base: 'sedan', L0: -2.4, L1: 2.4, wr: 0.35, crown: 0.05,
    W: [[-2.4, 0.76], [-2.32, 0.85], [-2.0, 0.905], [0, 0.925], [1.8, 0.905], [2.28, 0.84], [2.4, 0.74]],
    bot: [[-2.4, 0.42], [-2.2, 0.3], [-1.9, 0.21], [1.95, 0.21], [2.25, 0.3], [2.4, 0.4]],
    belt: [[-2.4, 0.86], [-2.2, 0.93], [-1.5, 0.955], [0, 0.94], [1.0, 0.91], [1.9, 0.82], [2.3, 0.72], [2.4, 0.66]],
    green: { z0: -1.78, zr0: -1.02, zr1: 0.3, z1: 1.08, roofY: 1.43, inset: 0.15, pillars: [-0.28, -1.0], glass: [-1.3, 0.86], rear: true }
  },
  pickup: {
    base: 'pickup', L0: -2.85, L1: 2.8, wr: 0.4, crown: 0.045,
    W: [[-2.85, 0.9], [-2.78, 0.965], [-2.4, 0.985], [0, 0.99], [2.2, 0.98], [2.7, 0.93], [2.8, 0.86]],
    bot: [[-2.85, 0.5], [-2.5, 0.4], [2.4, 0.4], [2.65, 0.46], [2.8, 0.55]],
    belt: [[-2.85, 1.2], [-0.8, 1.2], [1.2, 1.2], [2.3, 1.15], [2.7, 1.06], [2.8, 0.98]],
    green: { z0: -0.74, zr0: -0.5, zr1: 0.68, z1: 1.3, roofY: 1.85, inset: 0.12, pillars: [0.06], glass: [-0.52, 1.1], rear: true },
    bed: { z0: -2.74, z1: -0.82, depth: 0.42 }
  },
  van: {
    base: 'van', L0: -2.6, L1: 2.6, wr: 0.36, crown: 0.03,
    W: [[-2.6, 0.9], [-2.52, 0.965], [-2.2, 0.985], [1.9, 0.985], [2.45, 0.93], [2.6, 0.84]],
    bot: [[-2.6, 0.44], [-2.3, 0.34], [2.2, 0.34], [2.45, 0.4], [2.6, 0.5]],
    belt: [[-2.6, 1.22], [1.5, 1.22], [2.1, 1.1], [2.45, 0.98], [2.6, 0.86]],
    green: { z0: -2.58, zr0: -2.38, zr1: 1.42, z1: 2.16, roofY: 2.04, inset: 0.09, pillars: [0.82], glass: [0.9, 1.86], rear: false }
  }
};
export const RCC_SHAPES = Object.keys(SHAPES);
export const rccBaseOf = (type) => SHAPES[type].base;

/** A traffic shape as one geometry (position, normal, uv, partId: 0 body, 1 window, 4 trim) in the cars.js body frame.
 *  axleZ / wheelRadius come from the borrowed spec so the instanced wheels line up with the arches. */
export function buildRccTrafficGeometry(type, axleZ, wheelRadius) {
  const sp = SHAPES[type], gr = sp.green, bed = sp.bed;
  const zf = axleZ, zr = -axleZ, wr = wheelRadius, ra = wr + 0.036;
  const fWd = spline(sp.W), fBt = spline(sp.bot), fBl = spline(sp.belt);
  const paint = [], black = [], glass = [];
  const tri = (list, a, b, c) => list.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  const inBed = (z) => bed && z > bed.z0 && z < bed.z1;
  const KSb = 9, Kb = 12;
  const sec = (z, arch, isBed) => {
    const w = fWd(z), yb = fBt(z), ys = fBl(z), p = [];
    p.push([0, yb], [0.55 * w, yb], [w - 0.07, yb], [w - 0.03, yb + 0.03], [w - 0.008, yb + 0.1], [w, yb + (ys - yb) * 0.55], [w - 0.006, ys - 0.1], [w - 0.03, ys - 0.03], [w - 0.075, ys]);
    if (arch > 0) for (const q of p) if (q[1] < arch) q[1] = arch;
    if (isBed) p.push([w - 0.135, ys], [w - 0.145, ys - bed.depth], [0, ys - bed.depth]);
    else { const under = z < gr.z1 && z > gr.z0 ? 0.25 : 1, c = sp.crown * under; p.push([(w - 0.075) * 0.72, ys + c * 0.62], [(w - 0.075) * 0.36, ys + c * 0.94], [0, ys + c]); }
    return p;
  };
  const stn = [];
  for (const z of [sp.L0, sp.L0 + 0.025, sp.L0 + 0.08, sp.L1 - 0.08, sp.L1 - 0.025, sp.L1]) stn.push({ z, arch: 0 });
  const hw = Math.sqrt(ra * ra - Math.pow(wr - fBt(0), 2)) - 0.012;
  for (const za of [zf, zr]) {
    stn.push({ z: za - hw - 0.003, arch: 0 }, { z: za + hw + 0.003, arch: 0 });
    for (let k = 0; k <= 8; k++) { const dz = -hw * Math.cos(Math.PI * k / 8); stn.push({ z: za + dz, arch: wr + Math.sqrt(Math.max(0, ra * ra - dz * dz)) }); }
  }
  if (bed) for (const z of [bed.z0 - 0.004, bed.z0 + 0.004, bed.z1 - 0.004, bed.z1 + 0.004]) stn.push({ z, arch: 0 });
  const special = stn.slice();
  for (let z = sp.L0 + 0.2; z < sp.L1 - 0.15; z += 0.2) {
    let ok = true; for (const s of special) if (Math.abs(s.z - z) < 0.06) ok = false;
    if (Math.abs(z - zf) < hw + 0.01 || Math.abs(z - zr) < hw + 0.01) ok = false;
    if (ok) stn.push({ z, arch: 0 });
  }
  stn.sort((a, b) => a.z - b.z);
  const RING = 2 * Kb - 2;
  const rings = stn.map((s) => { const h = sec(s.z, s.arch, inBed(s.z)), r = []; for (let j = 0; j < Kb; j++) r.push([h[j][0], h[j][1], s.z]); for (let j = Kb - 2; j >= 1; j--) r.push([-h[j][0], h[j][1], s.z]); return r; });
  for (let i = 0; i < stn.length - 1; i++) for (let j = 0; j < RING; j++) {
    const j2 = (j + 1) % RING, a = rings[i][j], b = rings[i][j2], c = rings[i + 1][j], d = rings[i + 1][j2], jj = j < Kb - 1 ? j : RING - 1 - j;
    const well = jj <= 2 && (stn[i].arch > 0 || stn[i + 1].arch > 0), bd = jj >= KSb && (inBed(stn[i].z) || inBed(stn[i + 1].z));
    const l = well || bd ? black : paint; tri(l, a, b, c); tri(l, b, d, c);
  }
  const cap = (i, flip) => { const r = rings[i]; let cy = 0; for (const p of r) cy += p[1]; cy /= r.length; const c = [0, cy, r[0][2]]; for (let j = 0; j < RING; j++) { const a = r[j], b = r[(j + 1) % RING]; if (flip) tri(paint, c, b, a); else tri(paint, c, a, b); } };
  cap(0, true); cap(stn.length - 1, false);
  // greenhouse
  const hAt = (z) => { const t = z >= gr.z1 || z <= gr.z0 ? 0 : z > gr.zr1 ? (gr.z1 - z) / (gr.z1 - gr.zr1) : z < gr.zr0 ? (z - gr.z0) / (gr.zr0 - gr.z0) : 1; return Math.pow(t, 0.9); };
  const gz = [gr.z0, gr.zr0, gr.zr1, gr.z1, gr.glass[0], gr.glass[1]];
  for (const p of gr.pillars) gz.push(p - 0.045, p + 0.045);
  const gsp = gz.slice();
  for (let z = gr.z0 + 0.1; z < gr.z1 - 0.06; z += 0.2) { let ok = true; for (const s of gsp) if (Math.abs(s - z) < 0.06) ok = false; if (ok) gz.push(z); }
  gz.sort((a, b) => a - b);
  const grow = gz.map((z) => {
    const h = hAt(z), yb0 = fBl(z) - 0.006, yr = yb0 + (gr.roofY - yb0) * h, wb = fWd(z) - 0.082, wt = wb - gr.inset * h;
    const half = [[wb, yb0], [wt, yb0 + (yr - yb0) * 0.8], [wt - 0.06 * h, yb0 + (yr - yb0) * 0.965], [wt * 0.5, yr + 0.014 * h], [0, yr + 0.02 * h]], r = [];
    for (let j = 0; j < 5; j++) r.push([half[j][0], half[j][1], z]);
    for (let j = 3; j >= 0; j--) r.push([-half[j][0], half[j][1], z]);
    return r;
  });
  for (let i = 0; i < gz.length - 1; i++) {
    const zm = (gz[i] + gz[i + 1]) / 2;
    let pil = false; for (const p of gr.pillars) if (Math.abs(zm - p) < 0.045) pil = true;
    for (let j = 0; j < 8; j++) {
      const a = grow[i][j], b = grow[i][j + 1], c = grow[i + 1][j], d = grow[i + 1][j + 1], r = j < 4 ? j : 7 - j;
      let g = false;
      if (r === 0) g = zm > gr.glass[0] && zm < gr.glass[1] && !pil;
      else if (r >= 2) g = zm > gr.zr1 + 0.02 || (gr.rear && zm < gr.zr0 - 0.02);
      const l = g ? glass : paint; tri(l, a, b, c); tri(l, b, d, c);
    }
  }
  const trim = [crease(black, 0.9), box(1.24, 0.16, zf - zr + 0.4, 0, fBt(0) + 0.1, 0)];
  for (const sx of [-1, 1]) trim.push(box(0.1, 0.06, 0.15, sx * (fWd(gr.z1) + 0.06), fBl(gr.z1) + 0.07, gr.z1, 0, sx * 0.2, 0)); // mirrors
  const mk = (g, id) => {
    const o = plain(g), n = o.attributes.position.count;
    o.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    o.setAttribute('partId', new THREE.BufferAttribute(new Float32Array(n).fill(id), 1));
    return o;
  };
  return mergeVertices(mergeGeometries([mk(crease(paint, 0.75), 0), mk(crease(glass, 0.6), 1), ...trim.map((g) => mk(g, 4))]));
}
