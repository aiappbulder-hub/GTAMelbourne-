// A fast stand-in for THREE.Raycaster's straight-down rays onto a group's meshes at build time (river-path.js, dogs.js).
// Raycaster tests every triangle of the huge merged city-grid meshes per ray; this bins the triangles once by XZ cell and
// tests only the few under the query point. Same hits: front faces (per material.side), vertical ray, any height.
import * as THREE from 'three/webgpu';

const CELL = 8;
const _v = new THREE.Vector3();

export function buildGroundIndex(root) {
  root.updateWorldMatrix(true, true);
  const tris = [];
  const cells = new Map();
  root.traverse((o) => {
    if (!o.isMesh || (o.material && o.material.transparent)) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    if (!pos) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const side = mat ? mat.side : THREE.FrontSide;
    const wm = o.matrixWorld;
    const n = pos.count, w = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { _v.fromBufferAttribute(pos, i).applyMatrix4(wm); w[i * 3] = _v.x; w[i * 3 + 1] = _v.y; w[i * 3 + 2] = _v.z; }
    const total = idx ? idx.count : n;
    for (let t = 0; t + 2 < total; t += 3) {
      const a = (idx ? idx.getX(t) : t) * 3, b = (idx ? idx.getX(t + 1) : t + 1) * 3, c = (idx ? idx.getX(t + 2) : t + 2) * 3;
      const ax = w[a], az = w[a + 2], bx = w[b], bz = w[b + 2], cx = w[c], cz = w[c + 2];
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (side === THREE.FrontSide ? !(ny > 0) : side === THREE.BackSide ? !(ny < 0) : ny === 0) continue;
      const id = tris.length / 9;
      tris.push(ax, w[a + 1], az, bx, w[b + 1], bz, cx, w[c + 1], cz);
      const x0 = Math.floor(Math.min(ax, bx, cx) / CELL), x1 = Math.floor(Math.max(ax, bx, cx) / CELL);
      const z0 = Math.floor(Math.min(az, bz, cz) / CELL), z1 = Math.floor(Math.max(az, bz, cz) / CELL);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
        const k = i * 262144 + j;
        let l = cells.get(k);
        if (!l) cells.set(k, (l = []));
        l.push(id);
      }
    }
  });
  const T = Float32Array.from(tris);
  /** Highest surface y under (x, z) with lo < y < hi, or -Infinity */
  return function maxHit(x, z, lo, hi) {
    const l = cells.get(Math.floor(x / CELL) * 262144 + Math.floor(z / CELL));
    let best = -Infinity;
    if (!l) return best;
    for (let q = 0; q < l.length; q++) {
      const o = l[q] * 9;
      const ax = T[o], ay = T[o + 1], az = T[o + 2], bx = T[o + 3], by = T[o + 4], bz = T[o + 5], cx = T[o + 6], cy = T[o + 7], cz = T[o + 8];
      const det = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (det === 0) continue;
      const px = x - ax, pz = z - az;
      const u = (px * (cz - az) - pz * (cx - ax)) / det; // weight of b
      const v = ((bx - ax) * pz - (bz - az) * px) / det; // weight of c
      if (u < 0 || v < 0 || u + v > 1) continue;
      const y = ay + (by - ay) * u + (cy - ay) * v;
      if (y > lo && y < hi && y > best) best = y;
    }
    return best;
  };
}

const KEY = '__groundIndex';
export function groundIndexFor(scene) {
  const grid = scene.getObjectByName('MelbourneCityGrid');
  if (!grid) return null;
  return grid.userData[KEY] ||= buildGroundIndex(grid);
}
