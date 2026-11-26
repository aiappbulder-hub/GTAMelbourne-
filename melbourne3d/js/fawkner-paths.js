// Fawkner Park's paths: the real park has long diagonal avenues; the geodata has none inside it, so four straight avenues run from
// the park's corners and edges to a crossing south of the off-leash dog park, with a link north to the dog park's gate (js/dogs.js,
// the gate gap is in the south fence at x = 300). Gravel-grey strips raised 5 cm above the rendered ground (js/ground-index.js;
// not polygonOffset, which fails on WebGPU), with lamps every 40 m and benches every 90 m. Three draw calls (strips, lamps, benches).
import * as THREE from 'three/webgpu';
import { groundIndexFor } from './ground-index.js';
import { terrainHeight } from './terrain.js';

const J = [300, 3085]; // the crossing
export const FAWKNER_PATHS = [
  [[125, 2634], J], // from the north-west corner
  [[722, 2934], J], // from the Toorak Road tip
  [[572, 3216], J], // from the Punt Road side
  [[104, 3462], J], // from the south-west
  [J, [300, 3013]] // the link to the dog park gate
];
const HW = 1.3, LIFT = 0.05;

export function buildFawknerPaths(scene) {
  const maxHit = groundIndexFor(scene);
  const gnd = (x, z) => { const t = terrainHeight(x, z), h = maxHit ? maxHit(x, z, t - 1, t + 1.2) : -Infinity; return h > -Infinity ? h : t; };
  const group = new THREE.Group();
  group.name = 'FawknerPaths';
  const pos = [], col = [], idx = [];
  const lamps = [], benches = [];
  FAWKNER_PATHS.forEach(([a, b], pi) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, n = Math.ceil(L / 3), base = pos.length / 3, lift = LIFT + pi * 0.004;
    for (let i = 0; i <= n; i++) {
      const s = L * i / n, x = a[0] + ux * s, z = a[1] + uz * s, sh = 0.7 + (i % 3) * 0.015;
      for (const side of [-1, 1]) {
        const px = x - uz * HW * side, pz = z + ux * HW * side;
        pos.push(px, gnd(px, pz) + lift, pz);
        const e = side === 0 ? 1 : 0.9;
        col.push(0.66 * sh * e, 0.62 * sh * e, 0.55 * sh * e);
      }
      if (i) { const k = base + (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    for (let s = 20; s < L - 12; s += 40) for (const side of [-1, 1]) { if (pi === 4 && s > 30) continue; const x = a[0] + ux * s - uz * 2.2 * side, z = a[1] + uz * s + ux * 2.2 * side; lamps.push([x, gnd(x, z), z]); }
    for (let s = 45; s < L - 20; s += 90) { const x = a[0] + ux * s - uz * 2.1, z = a[1] + uz * s + ux * 2.1; benches.push([x, gnd(x, z), z, Math.atan2(uz, -ux) + Math.PI / 2 * 0]); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const strips = new THREE.Mesh(g, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  strips.name = 'FawknerPathStrips'; strips.frustumCulled = false; strips.receiveShadow = true;
  group.add(strips);
  // lamps: a black pole with a warm glowing head
  const lampGeo = (() => {
    const pole = new THREE.CylinderGeometry(0.05, 0.07, 4, 6).translate(0, 2, 0), head = new THREE.SphereGeometry(0.22, 8, 6).translate(0, 4.1, 0);
    const parts = [pole, head], n = pole.attributes.position.count + head.attributes.position.count, c = new Float32Array(n * 3), p = new Float32Array(n * 3), ix = [];
    let o = 0;
    parts.forEach((q, qi) => { p.set(q.attributes.position.array, o * 3); for (let i = 0; i < q.attributes.position.count; i++) c.set(qi ? [1, 0.85, 0.55] : [0.1, 0.1, 0.1], (o + i) * 3); for (let i = 0; i < q.index.count; i++) ix.push(q.index.getX(i) + o); o += q.attributes.position.count; });
    const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.BufferAttribute(p, 3)); r.setAttribute('color', new THREE.BufferAttribute(c, 3)); r.setIndex(ix); r.computeVertexNormals();
    return r;
  })();
  const lampMesh = new THREE.InstancedMesh(lampGeo, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x332200 }), Math.max(1, lamps.length));
  const m = new THREE.Matrix4();
  lamps.forEach((l, i) => lampMesh.setMatrixAt(i, m.makeTranslation(l[0], l[1], l[2])));
  lampMesh.count = lamps.length; lampMesh.frustumCulled = false; lampMesh.name = 'FawknerLamps';
  // benches: a timber seat and back on two legs, facing the path
  const benchGeo = (() => {
    const parts = [[1.7, 0.08, 0.5, 0, 0.45, 0, [0.45, 0.3, 0.18]], [1.7, 0.45, 0.07, 0, 0.75, -0.23, [0.45, 0.3, 0.18]], [0.08, 0.45, 0.5, -0.75, 0.22, 0, [0.12, 0.12, 0.12]], [0.08, 0.45, 0.5, 0.75, 0.22, 0, [0.12, 0.12, 0.12]]];
    const ps = [], cs = [], ix = []; let o = 0;
    for (const [w, h, d, x, y, z, c] of parts) { const b = new THREE.BoxGeometry(w, h, d).translate(x, y, z); ps.push(...b.attributes.position.array); for (let i = 0; i < b.attributes.position.count; i++) cs.push(...c); for (let i = 0; i < b.index.count; i++) ix.push(b.index.getX(i) + o); o += b.attributes.position.count; }
    const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3)); r.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3)); r.setIndex(ix); r.computeVertexNormals();
    return r;
  })();
  const benchMesh = new THREE.InstancedMesh(benchGeo, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85 }), Math.max(1, benches.length));
  const q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  benches.forEach((b, i) => benchMesh.setMatrixAt(i, m.compose(pv.set(b[0], b[1], b[2]), q.setFromEuler(e.set(0, b[3], 0)), one)));
  benchMesh.count = benches.length; benchMesh.frustumCulled = false; benchMesh.name = 'FawknerBenches';
  group.add(lampMesh, benchMesh);
  return { group, gnd, lamps: lamps.length, benches: benches.length };
}
