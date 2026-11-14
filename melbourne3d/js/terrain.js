// Melbourne's terrain: gentle real hills over the old flat city. terrainHeight(x, z) is metres above the river level (the
// old y = 0), bilinear over the baked grid in js/melbourne-terrain-data.js (tools/melbourne/build-terrain.mjs): 0 along the
// river, the coast, the bridges and the helipad, at most about 8% steep. `?flat` in the URL forces 0 everywhere (the old
// flat city), and so does a failed data load: every consumer reads the height through this module.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TERRAIN_DATA } from './melbourne-terrain-data.js';

export const TERRAIN_FLAT = typeof location !== 'undefined' && new URLSearchParams(location.search).has('flat');

const { x0: X0, z0: Z0, cell: CELL, nx: NX, nz: NZ, unit: UNIT } = TERRAIN_DATA;
const GRID = (() => {
  const bin = atob(TERRAIN_DATA.data);
  const g = new Float32Array(bin.length);
  for (let i = 0; i < g.length; i++) g[i] = bin.charCodeAt(i) * UNIT;
  return g;
})();
const X1 = X0 + (NX - 1) * CELL, Z1 = Z0 + (NZ - 1) * CELL;

/** Terrain height above the river level at (x, z), in metres. */
export function terrainHeight(x, z) {
  if (TERRAIN_FLAT) return 0;
  if (!(x > X0 && x < X1 && z > Z0 && z < Z1)) return 0;
  const fx = (x - X0) / CELL, fz = (z - Z0) / CELL;
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const k = j * NX + i;
  return GRID[k] * (1 - u) * (1 - v) + GRID[k + 1] * u * (1 - v) + GRID[k + NX] * (1 - u) * v + GRID[k + NX + 1] * u * v;
}

/** Highest terrain over a footprint (a list of {x, z} or [x, z] corners, or a bounding box {minX, maxX, minZ, maxZ}). */
export function terrainRange(pts) {
  let lo = Infinity, hi = -Infinity;
  const take = (x, z) => { const h = terrainHeight(x, z); if (h < lo) lo = h; if (h > hi) hi = h; };
  if (pts.minX !== undefined) {
    take(pts.minX, pts.minZ); take(pts.maxX, pts.minZ); take(pts.minX, pts.maxZ); take(pts.maxX, pts.maxZ);
    take((pts.minX + pts.maxX) / 2, (pts.minZ + pts.maxZ) / 2);
  } else for (const p of pts) Array.isArray(p) ? take(p[0], p[1]) : take(p.x, p.z);
  return { lo, hi };
}

/** The unit up-vector of the terrain at (x, z), written into out ({x, y, z}); slope sampled over `d` metres. */
export function terrainNormal(x, z, out = { x: 0, y: 1, z: 0 }, d = 1.5) {
  if (TERRAIN_FLAT) { out.x = 0; out.y = 1; out.z = 0; return out; }
  const dx = (terrainHeight(x + d, z) - terrainHeight(x - d, z)) / (2 * d);
  const dz = (terrainHeight(x, z + d) - terrainHeight(x, z - d)) / (2 * d);
  const L = Math.hypot(dx, 1, dz);
  out.x = -dx / L; out.y = 1 / L; out.z = -dz / L;
  return out;
}

const ATTR_KEYS = (g) => Object.keys(g.attributes);

/**
 * Drapes a geometry (in world coordinates) over the terrain in place: edges longer than maxEdge (inside the terrain's
 * extent) are bisected, interpolating every attribute, then each vertex's y is raised by terrainHeight(x, z) + lift.
 * Returns the geometry.
 */
export function drapeGeometry(geometry, { maxEdge = 25, lift = 0 } = {}) {
  if (TERRAIN_FLAT) { if (lift) { const p = geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + lift); p.needsUpdate = true; } return geometry; }
  const pos0 = geometry.attributes.position;
  const names = ATTR_KEYS(geometry);
  const arrays = names.map((n) => {
    const a = geometry.attributes[n];
    return { name: n, size: a.itemSize, norm: a.normalized, data: Array.from(a.array), ctor: a.array.constructor };
  });
  const posA = arrays[names.indexOf('position')].data;
  let index = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: pos0.count }, (_, i) => i);
  let count = pos0.count;
  const cache = new Map();
  const edgeLong = (a, b) => {
    const ax = posA[a * 3], az = posA[a * 3 + 2], bx = posA[b * 3], bz = posA[b * 3 + 2];
    if (Math.max(ax, bx) < X0 || Math.min(ax, bx) > X1 || Math.max(az, bz) < Z0 || Math.min(az, bz) > Z1) return 0;
    const dx = ax - bx, dy = posA[a * 3 + 1] - posA[b * 3 + 1], dz = az - bz;
    const l = Math.hypot(dx, dz);
    return l > maxEdge ? Math.hypot(dx, dy, dz) : 0;
  };
  const mid = (a, b) => {
    const key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
    let m = cache.get(key);
    if (m === undefined) {
      m = count++;
      cache.set(key, m);
      for (const A of arrays) for (let c = 0; c < A.size; c++) A.data.push((A.data[a * A.size + c] + A.data[b * A.size + c]) / 2);
    }
    return m;
  };
  const out = [];
  const stack = [];
  for (let t = 0; t < index.length; t += 3) {
    stack.push(index[t], index[t + 1], index[t + 2]);
    while (stack.length) {
      const c = stack.pop(), b = stack.pop(), a = stack.pop();
      const l0 = edgeLong(a, b), l1 = edgeLong(b, c), l2 = edgeLong(c, a);
      const m = Math.max(l0, l1, l2);
      if (m === 0) { out.push(a, b, c); continue; }
      if (m === l0) { const d = mid(a, b); stack.push(a, d, c, d, b, c); }
      else if (m === l1) { const d = mid(b, c); stack.push(a, b, d, a, d, c); }
      else { const d = mid(c, a); stack.push(a, b, d, d, b, c); }
    }
  }
  for (const A of arrays) {
    const Ctor = A.ctor;
    const arr = new Ctor(A.data.length);
    for (let i = 0; i < arr.length; i++) arr[i] = A.data[i];
    geometry.setAttribute(A.name, new THREE.BufferAttribute(arr, A.size, A.norm));
  }
  geometry.setIndex(count > 65535 ? new THREE.BufferAttribute(new Uint32Array(out), 1) : new THREE.BufferAttribute(new Uint16Array(out), 1));
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + terrainHeight(p.getX(i), p.getZ(i)) + lift);
  p.needsUpdate = true;
  const n = geometry.attributes.normal;
  if (n) { // upward faces take the slope's normal
    const t = { x: 0, y: 1, z: 0 };
    for (let i = 0; i < n.count; i++) if (n.getY(i) > 0.9) { terrainNormal(p.getX(i), p.getZ(i), t); n.setXYZ(i, t.x, t.y, t.z); }
    n.needsUpdate = true;
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const _m = new THREE.Matrix4();

/** Raises each instance of an InstancedMesh (world matrices, not parented anywhere odd) by the terrain at its position. */
export function liftInstances(mesh, extra = 0) {
  if (TERRAIN_FLAT && !extra) return mesh;
  const e = mesh.instanceMatrix.array;
  for (let i = 0; i < mesh.count; i++) e[i * 16 + 13] += terrainHeight(e[i * 16 + 12], e[i * 16 + 14]) + extra;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.boundingSphere !== undefined) { mesh.boundingSphere = null; mesh.boundingBox = null; }
  return mesh;
}

/** An InstancedMesh's instances baked into one plain Mesh (world space), so they can be draped. */
export function bakeInstances(mesh) {
  const geos = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, _m);
    geos.push(mesh.geometry.clone().applyMatrix4(_m));
  }
  const geo = geos.length ? mergeGeometries(geos, false) : mesh.geometry.clone();
  const out = new THREE.Mesh(geo, mesh.material);
  out.castShadow = mesh.castShadow; out.receiveShadow = mesh.receiveShadow; out.name = mesh.name;
  return out;
}

/**
 * Drapes every mesh under a group (whose own transform is the identity) over the terrain: plain meshes by drapeGeometry,
 * instanced boxes (userData.bakeToDrape or a 24-vertex unit box) baked and draped, other instanced meshes lifted per
 * instance. `skip` is a set of objects to leave alone (the water).
 */
export function drapeGroup(group, { skip = new Set(), maxEdge = 25, lift = 0 } = {}) {
  if (TERRAIN_FLAT && !lift) return;
  const todo = [];
  for (const o of [...group.children]) {
    if (skip.has(o)) continue;
    if (o.isMesh) todo.push(o);
    else if (o.isObject3D && !o.isLight) o.position.y += terrainHeight(o.position.x, o.position.z) + lift; // a nested group: rigid
  }
  for (const o of todo) {
    if (o.isInstancedMesh) {
      if (o.userData.bakeToDrape) {
        const baked = bakeInstances(o);
        drapeGeometry(baked.geometry, { maxEdge, lift });
        o.parent.add(baked);
        o.parent.remove(o);
      } else liftInstances(o, lift);
    } else if (o.geometry && o.geometry.attributes.position) {
      drapeGeometry(o.geometry, { maxEdge, lift });
    }
  }
}
