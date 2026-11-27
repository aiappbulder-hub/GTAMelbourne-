// "Pillars of Wisdom" (Kings Domain, on the Yarra side of Alexandra Avenue north of the Pioneer Women's Memorial Garden): a tasteful
// invented version, since nothing about its looks is in the data. Seven slender sandstone pillars of different heights (3 to 7 m)
// in an arc behind a shallow reflecting pool, all on a round paved plaza with two benches. Each pillar carries a few short engraved
// bands (a procedural canvas texture). Two draw calls: one merged stone mesh (pillars, plaza, pool coping, benches) and the pool.
// Pillars are solid for the player and the player's car (oriented boxes pushed on the manager's collider list by js/dogwalk.js).
import * as THREE from 'three/webgpu';
import { LITE } from './quality.js';

// on the park side of Alexandra Ave (about 20 m west of its centreline), the arc of pillars opening east-north-east
// across the road to the Yarra; `face` is the direction the pool side (local +z) looks
export const PILLARS = { x: 518.6, z: 1142.2, face: Math.atan2(0.909, -0.416), plazaR: 8, heights: [3.2, 4.4, 5.8, 7, 5.4, 4.0, 3.4] };

export function buildPillars(gnd) {
  const { x: wx, z: wz, plazaR, face } = PILLARS;
  const cs = Math.cos(face), sn = Math.sin(face);
  const toWorld = (lx, lz) => [wx + lx * cs + lz * sn, wz - lx * sn + lz * cs]; // (as rotateY(face), then the site)
  const cx = 0, cz = 0; // the stone is laid out round the origin, facing +z, then turned and moved onto the site
  const group = new THREE.Group();
  group.name = 'PillarsOfWisdom';
  // the plaza level: the highest ground under it, so it never sinks into the slope
  let base = gnd(wx, wz);
  for (let k = 0; k < 12; k++) base = Math.max(base, gnd(wx + Math.cos(k / 12 * 6.283) * plazaR, wz + Math.sin(k / 12 * 6.283) * plazaR));
  const top = base + 0.14;

  const parts = [];
  const add = (geo, x, y, z, col, uvAt = null, uvScaleV = 0) => {
    geo = geo.clone();
    geo.translate(x, y, z);
    const n = geo.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set(col, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const uv = geo.attributes.uv;
    if (uv) for (let i = 0; i < n; i++) { if (uvAt) uv.setXY(i, uvAt[0], uvAt[1]); else uv.setY(i, uv.getY(i) * uvScaleV); }
    parts.push(geo);
  };
  const flat = [0.5, 0.97];
  // plaza (and a skirt down to the ground), pool coping, benches
  add(new THREE.CylinderGeometry(plazaR, plazaR + 0.15, 1.6, 40).translate(0, -0.66, 0), cx, top, cz, [0.62, 0.6, 0.56], flat);
  const poolX = cx, poolZ = cz + 1.6, pw = 5.6, pl = 2.4; // the reflecting pool, south of the pillars (they stand to its north)
  for (const [w, l, dx, dz] of [[pw + 0.8, 0.4, 0, -pl / 2 - 0.2], [pw + 0.8, 0.4, 0, pl / 2 + 0.2], [0.4, pl, -pw / 2 - 0.2, 0], [0.4, pl, pw / 2 + 0.2, 0]]) add(new THREE.BoxGeometry(w, 0.28, l), poolX + dx, top + 0.14, poolZ + dz, [0.82, 0.72, 0.56], flat);
  for (const sx of [-1, 1]) { // benches: a timber seat on two stone ends, beside the pool facing it
    const bx = cx + sx * 5.2, bz = cz + 2.6;
    add(new THREE.BoxGeometry(0.5, 0.45, 1.8), bx + sx * 0.0, top + 0.22, bz - 0.0, [0.78, 0.68, 0.52], flat);
    add(new THREE.BoxGeometry(0.62, 0.08, 2.0), bx, top + 0.49, bz, [0.45, 0.3, 0.18], flat);
  }
  // pillars: seven in an arc on the pool's north side
  const colliders = [];
  PILLARS.heights.forEach((h, i) => {
    const a = (-0.5 + i / 6) * 2.2, r = 4.6 + (i % 2) * 0.9, px = cx + Math.sin(a) * r, pz = cz - 1.2 - Math.cos(a) * r * 0.62;
    const rad = 0.3 + (h > 6 ? 0.06 : 0) + (i % 3) * 0.02;
    add(new THREE.CylinderGeometry(rad * 0.78, rad, h, 8).translate(0, h / 2, 0), px, top, pz, [1, 1, 1], null, h / 7);
    add(new THREE.BoxGeometry(rad * 2.5, 0.3, rad * 2.5), px, top + 0.15, pz, [0.8, 0.74, 0.62], flat); // plinth
    const [qx, qz] = toWorld(px, pz);
    colliders.push({ minX: qx - rad - 0.1, maxX: qx + rad + 0.1, minZ: qz - rad - 0.1, maxZ: qz + rad + 0.1, minY: base - 1, maxY: top + h, obb: { cx: qx, cz: qz, hx: rad + 0.1, hz: rad + 0.1, cs: 1, sn: 0 }, pillar: true });
  });
  // merge
  let nv = 0, ni = 0;
  for (const g of parts) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let o = 0, k = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[k++] = g.index.getX(i) + o; else for (let i = 0; i < n; i++) idx[k++] = o + i;
    o += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.rotateY(face); geo.translate(wx, 0, wz); geo.computeVertexNormals();
  // sandstone with engraved bands (canvas v runs up the pillar: 0 at the foot over 7 m)
  let tex = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 128; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#cfae7e'; g.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${120 + Math.random() * 40},${90 + Math.random() * 30},${50},${Math.random() * 0.07})`; g.fillRect(Math.random() * 128, Math.random() * 480, 2 + Math.random() * 14, 1 + Math.random() * 3); }
    g.fillStyle = '#cfae7e'; g.fillRect(0, 490, 128, 22); // (the plain strip that plaza, benches and plinths sample)
    g.fillStyle = 'rgba(70,48,24,0.75)';
    for (const [y, n] of [[110, 3], [210, 2], [300, 4], [380, 2], [450, 3]]) { // bands of short engraved lines
      g.fillRect(0, y, 128, 3);
      for (let j = 0; j < n; j++) g.fillRect(0, y + 8 + j * 7, 128, 2);
      for (let j = 0; j < 7; j++) g.fillRect(8 + j * 17, y + 8 + n * 7, 3 + (j % 3) * 3, 6); // runic ticks
    }
    tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  }
  const stone = new THREE.Mesh(geo, new THREE.MeshStandardNodeMaterial({ map: tex, vertexColors: true, roughness: 0.92 }));
  stone.name = 'PillarsStone'; stone.castShadow = !LITE; stone.receiveShadow = true; stone.frustumCulled = false;
  // the pool: a glossy dark sheet just under the coping's top
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.4).rotateX(-Math.PI / 2).translate(poolX, top + 0.16, poolZ).rotateY(face).translate(wx, 0, wz), new THREE.MeshStandardNodeMaterial({ color: 0x1d3a4a, roughness: 0.04, metalness: 0.85 }));
  pool.name = 'PillarsPool'; pool.frustumCulled = false;
  group.add(stone, pool);
  return { group, colliders, x: wx, z: wz, y: top };
}
