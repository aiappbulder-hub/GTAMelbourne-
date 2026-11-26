// River path (Melbourne only): a shared bike and foot path along both banks of the Yarra (north: Flinders Walk / Birrarung Marr;
// south: the Southbank promenade; x -650 .. 420), drawn as a sealed grey-brown strip with a dashed centre line, laid on the
// RENDERED ground (a downward raycast onto the city grid's deck, kerb islands and parks at build time, not the bare terrain
// height: footpaths sit 0.22 m and park paving 0.26 m above it, which buried the old strip), with a few cyclists riding it
// both ways (left-hand traffic) and walkers near the player's nearest bank.
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
  lift: 0.05, // above the rendered ground
  halfWidth: 1.9, // the strip is 3.8 m wide: two lanes
  lane: 0.85, // a rider's offset from the centre line (to the left of travel)
  count: LITE ? 3 : QUALITY === 'low' ? 4 : 6,
  speed: [4.2, 7.0], // m/s
  showDist: 250, poseDist: 110,
  models: ['Male_Adult_04', 'Female_Adult_04', 'Male_Adult_10', 'Female_Adult_06', 'Male_Adult_05'],
  colours: [0xd23a2c, 0x1f7ae0, 0x2a9d5c, 0xf2b01e, 0x8a4fc4]
};

// ---------------------------------------------------------------------------------------------------------------------
// The bank: the Yarra's north edge at x (as melbourne-config.js' riverZ, east of the harbour)
// (the rendered water: the merged outline the land deck is cut by in js/city-grid.js, the ring that spans the whole reach;
// the raw OSM Yarra rings (GEO.water) sit up to 8 m off it, which put the old strip over the water)
const RINGS = (GEO.waterOutlines || []).map((flat) => {
  const o = [];
  for (let i = 0; i < flat.length; i += 2) o.push([flat[i], flat[i + 1]]);
  return o;
}).filter((r) => Math.min(...r.map((p) => p[0])) < CONFIG.x0 + 50 && Math.max(...r.map((p) => p[0])) > CONFIG.x1 - 50);
function bankZ(x, side = -1) { // side -1: north bank (smallest z), +1: south bank (largest z)
  let best = side < 0 ? Infinity : -Infinity;
  for (const r of RINGS) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[j], b = r[i];
      if ((a[0] > x) === (b[0] > x)) continue;
      const zc = a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);
      if (zc > -900) best = side < 0 ? Math.min(best, zc) : Math.max(best, zc);
    }
  }
  return best;
}

/** The path's centre line: points every ~10 m east, smoothed, with cumulative length. [{ x, z, cum }] */
export function buildPathLine(side = -1) {
  const raw = [];
  for (let x = CONFIG.x0; x <= CONFIG.x1; x += 10) {
    const z = bankZ(x, side);
    if (Number.isFinite(z)) raw.push({ x, z: z + side * CONFIG.inset });
  }
  // a moving average so the quay's little steps don't wobble the path
  const pts = raw.map((p, i) => {
    let s = 0, n = 0;
    for (let k = -3; k <= 3; k++) { const q = raw[i + k]; if (q) { s += q.z; n++; } }
    return { x: p.x, z: s / n, cum: 0, y: 0 };
  });
  for (let i = 1; i < pts.length; i++) pts[i].cum = pts[i - 1].cum + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return pts;
}

// ---------------------------------------------------------------------------------------------------------------------
// The rendered ground under the path: a downward ray onto the city grid's meshes (deck, kerb islands, park paving), the
// highest hit within 1 m of the terrain (so tree canopies and awnings are ignored); falls back to the terrain height.
const _ray = new THREE.Raycaster(), _dn = new THREE.Vector3(0, -1, 0), _org = new THREE.Vector3();
function groundSampler(scene) {
  const grid = scene.getObjectByName('MelbourneCityGrid');
  const targets = [];
  grid?.traverse((o) => { if (o.isMesh && !(o.material && o.material.transparent)) targets.push(o); });
  return (x, z) => {
    const t = terrainHeight(x, z);
    if (!targets.length) return t;
    _org.set(x, t + 6, z);
    _ray.set(_org, _dn);
    let best = t;
    for (const h of _ray.intersectObjects(targets, false)) { if (h.point.y > best && h.point.y < t + 1) best = h.point.y; }
    return best;
  };
}
/** Fill line[i].y with the rendered ground (max over the path's width, then the max of neighbours so it never dips under a kerb step) */
function setLineHeights(line, ground) {
  const n = line.length, raw = [];
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, p = line[i];
    raw.push(Math.max(ground(p.x, p.z), ground(p.x + nx * CONFIG.halfWidth, p.z + nz * CONFIG.halfWidth), ground(p.x - nx * CONFIG.halfWidth, p.z - nz * CONFIG.halfWidth)));
  }
  for (let i = 0; i < n; i++) line[i].y = Math.max(raw[Math.max(0, i - 1)], raw[i], raw[Math.min(n - 1, i + 1)]);
}
/** Ground height along the line at cumulative length s */
function yAt(line, s) {
  let lo = 0, hi = line.length - 1;
  s = Math.max(0, Math.min(line[hi].cum, s));
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (line[m].cum <= s) lo = m; else hi = m; }
  const a = line[lo], b = line[hi], k = (s - a.cum) / Math.max(1e-6, b.cum - a.cum);
  return a.y + (b.y - a.y) * k;
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
      pos.push(x, p.y + CONFIG.lift, z);
    }
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  // dashes every 9 m, 3.5 m long, 0.16 m wide
  for (let d = 4; d < line[n - 1].cum - 4; d += 9) {
    const a = { ...pointAt(line, d) }, b = pointAt(line, d + 3.5), ya = yAt(line, d), yb = yAt(line, d + 3.5);
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * 0.08, nz = dx / l * 0.08;
    const k = dpos.length / 3;
    for (const [px, pz, py] of [[a.x - nx, a.z - nz, ya], [a.x + nx, a.z + nz, ya], [b.x - nx, b.z - nz, yb], [b.x + nx, b.z + nz, yb]]) dpos.push(px, py + CONFIG.lift + 0.02, pz);
    didx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const mk = (p, i) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(i); g.computeVertexNormals(); return g; };
  const strip = new THREE.Mesh(mk(pos, idx), new THREE.MeshStandardNodeMaterial({ color: 0x69655e, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const dash = new THREE.Mesh(mk(dpos, didx), new THREE.MeshStandardNodeMaterial({ color: 0xeee8d4, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
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
  const ground = groundSampler(scene);
  // one path per bank: -1 the north bank, +1 the south bank (Southbank promenade)
  const banks = [-1, 1].map((side) => {
    const line = buildPathLine(side);
    if (line.length < 4) return null;
    setLineHeights(line, ground);
    root.add(...buildStrip(line));
    return { side, line, total: line[line.length - 1].cum, nearS: 0, nearD: Infinity, cyclists: [] };
  }).filter(Boolean);
  if (!banks.length) return { update() {}, group: root, cyclists: [], walkers: [], line: [] };

  // the riders are split across the banks (3 on lite: 2 + 1; 4: 2 + 2; 6: 3 + 3)
  const cyclists = [];
  for (let i = 0; i < CONFIG.count; i++) {
    const bank = banks[i % banks.length];
    const dir = (i >> 1) % 2 ? -1 : 1;
    const parts = buildBicycle(i);
    parts.group.visible = false;
    root.add(parts.group);
    const c = {
      i, bank, parts, dir, s: ((i + 0.5) / CONFIG.count) * bank.total, speed: CONFIG.speed[0] + Math.random() * (CONFIG.speed[1] - CONFIG.speed[0]),
      key: `rivercyclist${i}`, model: CONFIG.models[i % CONFIG.models.length], phase: Math.random(), breath: Math.random(), heading: null, lean: 0,
      frame: null, posed: false, x: 0, z: 0
    };
    cyclists.push(c);
    bank.cyclists.push(c);
  }
  const SEAT = { y: 1.03, z: -0.3 };
  let t = 0;

  // Walkers: a few people strolling both ways along the edges of whichever bank is nearest the player, kept within a
  // window round the player's place on it (so whenever the player is by the river there are people about)
  const WALK_N = LITE ? 3 : QUALITY === 'low' ? 5 : 7, WIN = 110;
  const walkers = [];
  for (let i = 0; i < WALK_N; i++) {
    walkers.push({
      key: `riverwalker${i}`, model: CONFIG.models[(i + 2) % CONFIG.models.length], dir: i % 2 ? -1 : 1,
      off: (Math.random() * 2 - 1) * WIN, speed: 1.1 + Math.random() * 0.45, edge: 1.35 + Math.random() * 0.35, posed: false
    });
  }
  let nearBank = banks[0], nearT = 0;
  function playerOnPath(pp) {
    for (const b of banks) {
      let bs = 0, bd = Infinity;
      for (const q of b.line) { const d = (q.x - pp.x) ** 2 + (q.z - pp.z) ** 2; if (d < bd) { bd = d; bs = q.cum; } }
      b.nearS = bs; b.nearD = Math.sqrt(bd);
    }
    // (a little hysteresis, so the walkers don't hop across the river as the player stands midway)
    for (const b of banks) if (b.nearD < nearBank.nearD - 15) nearBank = b;
  }
  function updateWalkers(dt, pp) {
    nearT -= dt;
    if (nearT <= 0) { playerOnPath(pp); nearT = 0.5; }
    const near = nearBank.nearD < 160, { line, total, nearS } = nearBank;
    for (const w of walkers) {
      if (!near) { if (w.posed) { cast?.setActor(w.key, null, null); w.posed = false; } continue; }
      w.off += w.dir * w.speed * dt;
      if (w.off > WIN) w.off -= 2 * WIN; else if (w.off < -WIN) w.off += 2 * WIN; // (round again at the window's far side)
      const sAt = Math.max(0, Math.min(total, nearS + w.off));
      const p = pointAt(line, sAt);
      const fx = p.dx * w.dir, fz = p.dz * w.dir;
      const x = p.x + fz * w.edge, z = p.z - fx * w.edge; // keep left, on the path's edge
      cast?.setActor(w.key, w.model, { x, y: yAt(line, sAt) + CONFIG.lift, z, heading: Math.atan2(fx, fz), speed: w.speed, ease: 3 }, 'idle');
      w.posed = true;
    }
  }

  function update(dt) {
    dt = Math.min(dt, 0.1);
    t += dt;
    const pp = cm.getActiveEntity().position;
    updateWalkers(dt, pp);
    for (const c of cyclists) {
      const { line, total, nearS, nearD } = c.bank;
      c.s += c.dir * c.speed * dt;
      if (c.s > total) c.s -= total; else if (c.s < 0) c.s += total; // (the far end: round again, out of sight)
      // with the player by this bank, keep its riders within 150 m of them along the path (round again past that)
      if (nearD < 160) { const w = 150, r = c.s - nearS; if (Math.abs(r) > w) c.s = Math.max(0, Math.min(total, nearS + ((((r + w) % (2 * w)) + 2 * w) % (2 * w)) - w)); }
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
      const hF = yAt(line, c.s + c.dir * 0.6), hB = yAt(line, c.s - c.dir * 0.6);
      g.position.set(x, (hF + hB) / 2 + CONFIG.lift, z);
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
    update, group: root, cyclists, walkers, banks, line: banks[0].line,
    /** For checks: a point on the path beside rider i (x, z, heading) */
    cyclistPos(i = 0) { const c = cyclists[i]; return c && { x: c.parts.group.position.x, z: c.parts.group.position.z, heading: c.heading, shown: c.parts.group.visible }; }
  };
}
