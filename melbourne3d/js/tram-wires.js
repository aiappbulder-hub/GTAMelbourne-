// Melbourne tram overhead: contact wire + sagging messenger wire ribbons, and instanced poles with span arms.
// Built lazily in 400 m chunks around the player (162 km of track in total) and dropped when far away.
// Replaces the old 1px line mesh ("TramWires" from trams.js), which it hides.
import * as THREE from 'three/webgpu';
import { GEO } from './geodata.js';
import { terrainHeight } from './terrain.js';
import { QUALITY } from './quality.js';

const CHUNK = 400;
const CONTACT_H = 5.6, MESSENGER_H = 6.15, POLE_GAP = 32, POLE_OFF = 3.3, POLE_H = 7.4;
const RING = QUALITY === 'low' ? 1 : QUALITY === 'medium' ? 2 : 3; // chunks each way
const PER_FRAME = 1;

export function createTramWires({ scene }) {
  const group = new THREE.Group();
  group.name = 'TramOverhead';
  scene.add(group);
  const wireMat = new THREE.MeshBasicNodeMaterial({ color: 0x25272b, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardNodeMaterial({ color: 0x4c5056, roughness: 0.7, metalness: 0.5 });
  const poleGeo = new THREE.BoxGeometry(0.22, POLE_H, 0.22);
  poleGeo.translate(0, POLE_H / 2, 0);
  const armGeo = new THREE.BoxGeometry(0.1, 0.1, 1); // length set per instance (scale z)
  armGeo.translate(0, 0, 0.5);

  // bucket every track segment by the chunk its start lies in
  const buckets = new Map();
  for (const flat of GEO.tramTracks || []) {
    for (let i = 0; i + 3 < flat.length; i += 2) {
      const key = Math.floor(flat[i] / CHUNK) + ',' + Math.floor(flat[i + 1] / CHUNK);
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = []));
      b.push(flat[i], flat[i + 1], flat[i + 2], flat[i + 3]);
    }
  }
  const chunks = new Map(); // key -> Object3D | null (built, empty)

  function ribbon(pos, idx, a, b, ha, hb, w) {
    const base = pos.length / 3;
    pos.push(a.x, ha, a.z, a.x, ha + w, a.z, b.x, hb, b.z, b.x, hb + w, b.z);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }

  function build(cx, cz) {
    const segs = buckets.get(cx + ',' + cz);
    if (!segs) return null;
    const pos = [], idx = [], poles = [];
    let along = 0;
    for (let i = 0; i < segs.length; i += 4) {
      const ax = segs[i], az = segs[i + 1], bx = segs[i + 2], bz = segs[i + 3];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      const n = Math.max(1, Math.round(len / 10));
      let px = ax, pz = az;
      for (let k = 1; k <= n; k++) {
        const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
        const g0 = terrainHeight(px, pz), g1 = terrainHeight(x, z);
        const z1 = (k % 2 ? 0.18 : -0.18), z0 = -z1; // contact wire zig-zags
        ribbon(pos, idx, { x: px - dz * z0, z: pz + dx * z0 }, { x: x - dz * z1, z: z + dx * z1 }, g0 + CONTACT_H, g1 + CONTACT_H, 0.05);
        const s0 = 0.35 * Math.sin(Math.PI * (((along + (k - 1) * len / n) % POLE_GAP) / POLE_GAP));
        const s1 = 0.35 * Math.sin(Math.PI * (((along + k * len / n) % POLE_GAP) / POLE_GAP));
        ribbon(pos, idx, { x: px, z: pz }, { x, z }, g0 + MESSENGER_H - s0 * 0.6, g1 + MESSENGER_H - s1 * 0.6, 0.04);
        px = x; pz = z;
      }
      let d = (POLE_GAP - (along % POLE_GAP)) % POLE_GAP;
      for (; d < len; d += POLE_GAP) {
        const x = ax + dx * d, z = az + dz * d;
        const side = Math.floor((along + d) / POLE_GAP) % 2 ? 1 : -1;
        const qx = x - dz * POLE_OFF * side, qz = z + dx * POLE_OFF * side;
        poles.push(qx, qz, x, z, terrainHeight(qx, qz));
      }
      along += len;
    }
    if (!pos.length) return null;
    const holder = new THREE.Group();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    holder.add(new THREE.Mesh(g, wireMat));
    const np = poles.length / 5;
    if (np) {
      const pm = new THREE.InstancedMesh(poleGeo, poleMat, np);
      const am = new THREE.InstancedMesh(armGeo, poleMat, np);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const fwd = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3();
      for (let i = 0; i < np; i++) {
        const o = i * 5;
        p.set(poles[o], poles[o + 4], poles[o + 1]);
        m.compose(p, q.identity(), s.set(1, 1, 1));
        pm.setMatrixAt(i, m);
        const tx = poles[o + 2] - poles[o], tz = poles[o + 3] - poles[o + 1];
        const L = Math.hypot(tx, tz) || 1;
        q.setFromUnitVectors(fwd, dir.set(tx / L, 0, tz / L));
        p.set(poles[o], poles[o + 4] + POLE_H - 0.9, poles[o + 1]);
        m.compose(p, q, s.set(1, 1, L));
        am.setMatrixAt(i, m);
      }
      pm.frustumCulled = am.frustumCulled = false; // chunk-level culling by distance instead
      holder.add(pm, am);
    }
    group.add(holder);
    return holder;
  }

  let hid = false;
  function update(camPos) {
    if (!hid) {
      const old = scene.getObjectByName('TramWires');
      if (old) { old.visible = false; hid = true; }
    }
    const cx = Math.floor(camPos.x / CHUNK), cz = Math.floor(camPos.z / CHUNK);
    let built = 0;
    for (let r = 0; r <= RING && built < PER_FRAME; r++) {
      for (let dx = -r; dx <= r && built < PER_FRAME; dx++) {
        for (let dz = -r; dz <= r && built < PER_FRAME; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const key = (cx + dx) + ',' + (cz + dz);
          if (chunks.has(key)) continue;
          chunks.set(key, build(cx + dx, cz + dz));
          built++;
        }
      }
    }
    for (const [key, obj] of chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) > RING + 1) {
        if (obj) {
          group.remove(obj);
          obj.traverse((o) => { if (o.isMesh && o.geometry !== poleGeo && o.geometry !== armGeo) o.geometry.dispose(); });
        }
        chunks.delete(key);
      }
    }
  }
  return { group, update, chunks };
}
