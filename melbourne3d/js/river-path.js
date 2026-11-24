// River path (Melbourne only): a shared bike and foot path along the Yarra's north bank (Southbank / Flinders Walk /
// Birrarung Marr side, x -650 .. 420), drawn as a flat pale strip with a dashed centre line, and a few cyclists riding it
// both ways (left-hand traffic).
//
// Reuses: the Yarra outline in js/melbourne-geodata.js (the same bank trace as melbourne-config.js' riverZ), the cyclist
// build of js/controllers.js createCyclistEntity (frame, wheels, bars: here merged into one mesh), js/procedural-rider.js
// (the pedal-stroke rocking and breathing of a seated rider, as the lean/bob of the bike) and js/bikies.js' way of seating a
// person on a bike (js/people.js setRider: the seated clip, hands solved onto grips).
//
// Cost: the strip and its dashes are 2 draw calls; each cyclist is 3 meshes (merged frame + 2 wheels). 4 cyclists on
// Medium/High, 2 on Low-lite. Hidden beyond 250 m; the person is only posed within 110 m.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO } from './melbourne-geodata.js';
import { terrainHeight } from './terrain.js';
import { LITE, QUALITY } from './quality.js';
import { RIDER_PROFILES, evaluateRiderMotion } from './procedural-rider.js';

export const CONFIG = {
  x0: -650, x1: 420, // the path's extent along the bank (world x)
  inset: 4.2, // metres north of the bank line (the quay's edge)
  halfWidth: 1.9, // the strip is 3.8 m wide: two lanes
  lane: 0.85, // a rider's offset from the centre line (to the left of travel)
  count: LITE ? 2 : QUALITY === 'low' ? 3 : 4,
  speed: [4.2, 7.0], // m/s
  showDist: 250, poseDist: 110,
  models: ['Male_Adult_04', 'Female_Adult_04', 'Male_Adult_10', 'Female_Adult_06', 'Male_Adult_05'],
  colours: [0xd23a2c, 0x1f7ae0, 0x2a9d5c, 0xf2b01e, 0x8a4fc4]
};

// ---------------------------------------------------------------------------------------------------------------------
// The bank: the Yarra's north edge at x (as melbourne-config.js' riverZ, east of the harbour)
const RINGS = GEO.water.filter((w) => w.name === 'Yarra River').map((w) => {
  const o = [];
  for (let i = 0; i < w.rings[0].length; i += 2) o.push([w.rings[0][i], w.rings[0][i + 1]]);
  return o;
});
function bankZ(x) {
  let best = Infinity;
  for (const r of RINGS) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[j], b = r[i];
      if ((a[0] > x) === (b[0] > x)) continue;
      const zc = a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);
      if (zc > -900) best = Math.min(best, zc);
    }
  }
  return best;
}

/** The path's centre line: points every ~10 m east, smoothed, with cumulative length. [{ x, z, cum }] */
export function buildPathLine() {
  const raw = [];
  for (let x = CONFIG.x0; x <= CONFIG.x1; x += 10) {
    const z = bankZ(x);
    if (Number.isFinite(z)) raw.push({ x, z: z - CONFIG.inset });
  }
  // a moving average so the quay's little steps don't wobble the path
  const pts = raw.map((p, i) => {
    let s = 0, n = 0;
    for (let k = -3; k <= 3; k++) { const q = raw[i + k]; if (q) { s += q.z; n++; } }
    return { x: p.x, z: s / n, cum: 0 };
  });
  for (let i = 1; i < pts.length; i++) pts[i].cum = pts[i - 1].cum + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return pts;
}

// ---------------------------------------------------------------------------------------------------------------------
function buildStrip(line) {
  const n = line.length, pos = [], idx = [], dpos = [], didx = [];
  const normal = (i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return { nx: -dz / l, nz: dx / l, dx: dx / l, dz: dz / l };
  };
  for (let i = 0; i < n; i++) {
    const p = line[i], { nx, nz } = normal(i);
    for (const s of [-1, 1]) {
      const x = p.x + nx * CONFIG.halfWidth * s, z = p.z + nz * CONFIG.halfWidth * s;
      pos.push(x, terrainHeight(x, z) + 0.07, z);
    }
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  // dashes every 9 m, 3.5 m long, 0.12 m wide
  for (let d = 4; d < line[n - 1].cum - 4; d += 9) {
    const a = pointAt(line, d), b = pointAt(line, d + 3.5);
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * 0.06, nz = dx / l * 0.06;
    const k = dpos.length / 3;
    for (const [px, pz] of [[a.x - nx, a.z - nz], [a.x + nx, a.z + nz], [b.x - nx, b.z - nz], [b.x + nx, b.z + nz]]) dpos.push(px, terrainHeight(px, pz) + 0.09, pz);
    didx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const mk = (p, i) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(i); g.computeVertexNormals(); return g; };
  const strip = new THREE.Mesh(mk(pos, idx), new THREE.MeshStandardNodeMaterial({ color: 0xd9d0bd, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const dash = new THREE.Mesh(mk(dpos, didx), new THREE.MeshStandardNodeMaterial({ color: 0xf4f1e8, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  for (const m of [strip, dash]) { m.receiveShadow = true; m.frustumCulled = false; }
  // (normals of an upward strip may come out down: make sure they face up)
  for (const m of [strip, dash]) { const nrm = m.geometry.attributes.normal; for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i)); }
  return [strip, dash];
}
const _o = { x: 0, z: 0, dx: 1, dz: 0 };
/** The centre line at cumulative length s (clamped): { x, z, dx, dz } (shared object) */
function pointAt(line, s, o = _o) {
  let lo = 0, hi = line.length - 1;
  s = Math.max(0, Math.min(line[hi].cum, s));
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (line[m].cum <= s) lo = m; else hi = m; }
  const a = line[lo], b = line[hi], k = (s - a.cum) / Math.max(1e-6, b.cum - a.cum), l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  o.x = a.x + (b.x - a.x) * k; o.z = a.z + (b.z - a.z) * k; o.dx = (b.x - a.x) / l; o.dz = (b.z - a.z) / l;
  return o;
}

// ---------------------------------------------------------------------------------------------------------------------
// The bicycle (as controllers.js createCyclistEntity: forward +z, origin on the ground between the wheels), frame merged
const TIRE = new THREE.MeshStandardNodeMaterial({ color: 0x181a1e, roughness: 0.6 });
const FRAMES = CONFIG.colours.map((c) => new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.4, metalness: 0.3 }));
const WHEEL = new THREE.TorusGeometry(0.35, 0.04, 6, 18).rotateY(Math.PI / 2);
const FRAME_GEO = (() => {
  const part = (geo, rx, x, y, z) => { geo.rotateX(rx); geo.translate(x, y, z); return geo; };
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 6), Math.PI * 0.46, 0, 0.78, 0.04),
    part(new THREE.CylinderGeometry(0.026, 0.026, 0.78, 6), Math.PI * 0.28, 0, 0.58, 0.16),
    part(new THREE.CylinderGeometry(0.022, 0.022, 0.64, 6), -0.22, 0, 0.66, -0.22),
    part(new THREE.CylinderGeometry(0.02, 0.016, 0.68, 6), -0.24, 0, 0.68, 0.48),
    new THREE.CylinderGeometry(0.018, 0.018, 0.48, 6).rotateZ(Math.PI / 2).translate(0, 0.98, 0.4),
    new THREE.CapsuleGeometry(0.045, 0.16, 3, 6).scale(1.15, 1, 0.55).rotateX(Math.PI / 2).translate(0, 0.96, -0.28)
  ]);
})();
/** { group, grips, wheels: [front, rear] } */
export function buildBicycle(seed = 0) {
  const g = new THREE.Group();
  const lean = new THREE.Group(); // (rocks with the pedal stroke)
  g.add(lean);
  const frame = new THREE.Mesh(FRAME_GEO, FRAMES[seed % FRAMES.length]);
  const f = new THREE.Mesh(WHEEL, TIRE), r = new THREE.Mesh(WHEEL, TIRE);
  f.position.set(0, 0.38, 0.58); r.position.set(0, 0.38, -0.58);
  lean.add(frame, f, r);
  const grips = [-1, 1].map((s) => { const o = new THREE.Object3D(); o.position.set(-s * 0.22, 0.98, 0.42); lean.add(o); return o; });
  return { group: g, lean, grips };
}

// ---------------------------------------------------------------------------------------------------------------------
export function createRiverPath({ scene, controllerManager: cm, cast = null }) {
  const root = new THREE.Group();
  root.name = 'RiverPath';
  scene.add(root);
  const line = buildPathLine();
  if (line.length < 4) return { update() {}, group: root, cyclists: [] };
  const total = line[line.length - 1].cum;
  root.add(...buildStrip(line));

  const cyclists = [];
  for (let i = 0; i < CONFIG.count; i++) {
    const dir = i % 2 ? -1 : 1;
    const parts = buildBicycle(i);
    parts.group.visible = false;
    root.add(parts.group);
    cyclists.push({
      i, parts, dir, s: ((i + 0.5) / CONFIG.count) * total, speed: CONFIG.speed[0] + Math.random() * (CONFIG.speed[1] - CONFIG.speed[0]),
      key: `rivercyclist${i}`, model: CONFIG.models[i % CONFIG.models.length], phase: Math.random(), breath: Math.random(), heading: null, lean: 0,
      frame: null, posed: false, x: 0, z: 0
    });
  }
  const SEAT = { y: 1.03, z: -0.3 };
  let t = 0;

  function update(dt) {
    dt = Math.min(dt, 0.1);
    t += dt;
    const pp = cm.getActiveEntity().position;
    for (const c of cyclists) {
      c.s += c.dir * c.speed * dt;
      if (c.s > total) c.s -= total; else if (c.s < 0) c.s += total; // (the far end: round again, out of sight)
      const p = pointAt(line, c.s);
      const fx = p.dx * c.dir, fz = p.dz * c.dir; // the way it faces
      const x = p.x + fz * CONFIG.lane, z = p.z - fx * CONFIG.lane; // to the left of travel (right of travel is x - dz, z + dx)
      const d = Math.hypot(x - pp.x, z - pp.z);
      const show = d < CONFIG.showDist;
      const g = c.parts.group;
      if (!show) { if (g.visible) { g.visible = false; cast?.setRider(c.key, null, null); c.posed = false; } continue; }
      g.visible = true;
      const hd = Math.atan2(fx, fz);
      if (c.heading === null) c.heading = hd;
      const dyaw = Math.atan2(Math.sin(hd - c.heading), Math.cos(hd - c.heading));
      c.heading += dyaw * Math.min(1, dt * 6);
      const hF = terrainHeight(x + fx * 0.6, z + fz * 0.6), hB = terrainHeight(x - fx * 0.6, z - fz * 0.6);
      g.position.set(x, (hF + hB) / 2 + 0.07, z);
      g.rotation.set(-Math.atan2(hF - hB, 1.2), c.heading, 0, 'YXZ');
      // the pedal stroke rocks the bike a little (js/procedural-rider.js)
      const cadence = 50 + c.speed * 5;
      c.phase = (c.phase + dt * cadence / 60) % 1;
      c.breath = (c.breath + dt * 0.3) % 1;
      c.frame = evaluateRiderMotion(RIDER_PROFILES.seated, c.phase, c.breath, cadence, 0.7, 0.01, 0.006, c.frame || undefined);
      c.parts.lean.rotation.z = c.frame.bikeLean * 0.8 + Math.max(-0.3, Math.min(0.3, (-dyaw / Math.max(dt, 1e-3)) * 0.04));
      c.parts.lean.position.y = c.frame.y;
      g.updateMatrixWorld(true);
      if (d < CONFIG.poseDist) { cast?.setRider(c.key, c.model, { parent: g, seat: SEAT, grips: c.parts.grips, dt, plain: true }); c.posed = true; }
      else if (c.posed) { cast?.setRider(c.key, null, null); c.posed = false; }
    }
  }
  return {
    update, group: root, cyclists, line,
    /** For checks: a point on the path beside rider i (x, z, heading) */
    cyclistPos(i = 0) { const c = cyclists[i]; return c && { x: c.parts.group.position.x, z: c.parts.group.position.z, heading: c.heading, shown: c.parts.group.visible }; }
  };
}
