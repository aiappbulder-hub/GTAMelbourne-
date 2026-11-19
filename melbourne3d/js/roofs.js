import * as THREE from 'three/webgpu';
import { districtAt } from './city-config.js';
import { PBR_ON, pbrTexture } from './pbr.js';

// Real roof shapes for low-rise, small-footprint buildings in the inner suburbs: gabled, hipped and pyramidal roofs,
// ported (to plain JS, on the footprint's oriented bounding rectangle) from the roof builders of Streets-GL
// (MIT, (c) 2020-2023 StrandedKitty, src/lib/tile-processing/tile3d/builders/roofs: GabledRoofBuilder, HippedRoofBuilder,
// PyramidalRoofBuilder). Streets-GL derives hips from a straight skeleton; for a rectangle that skeleton is exactly the
// ridge inset by half the short side used here, so the shapes match. Merged per 1 km cell and per material: one mesh
// each (three or four draw calls per cell), no per-building objects.
//   ?nopbr  disables roofs (before/after comparisons)

const ROOF_DISTRICTS = new Set(['fitzroy', 'carlton', 'south_melbourne', 'albert_park', 'collingwood', 'richmond',
  'north_melbourne', 'middle_park', 'port_melbourne', 'st_kilda']);
const MAX_HEIGHT = 13;        // under about four storeys
const MAX_AREA = 380;         // m2, small footprints
const MIN_FILL = 0.86;        // footprint area / bounding rectangle area (roofs are built on the rectangle)
const OVERHANG = 0.3;

function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.x * q.z - q.x * p.z; }
  return Math.abs(a) / 2;
}

// Minimum-area oriented rectangle: try every edge direction
function orientedRect(r) {
  let best = null;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    const ux = dx / len, uz = dz / len;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const s of r) {
      const a = s.x * ux + s.z * uz, b = -s.x * uz + s.z * ux;
      if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b;
    }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area) best = { area, ux, uz, a0, a1, b0, b1 };
  }
  if (!best) return null;
  let { ux, uz } = best;
  let hu = (best.a1 - best.a0) / 2, hv = (best.b1 - best.b0) / 2;
  const ca = (best.a0 + best.a1) / 2, cb = (best.b0 + best.b1) / 2;
  const cx = ca * ux - cb * uz, cz = ca * uz + cb * ux;
  if (hv > hu) { [hu, hv] = [hv, hu]; [ux, uz] = [-uz, ux]; } // long axis first
  return { cx, cz, ux, uz, vx: -uz, vz: ux, hu, hv, area: best.area };
}

/** The roof kind for a surveyed building record, or null to keep its flat roof. */
export function roofPlan(record, rand) {
  if (!PBR_ON) return null;
  const h = record.height;
  if (!(h >= 3 && h <= MAX_HEIGHT) || record.polygons.length !== 1) return null;
  const poly = record.polygons[0];
  if ((poly.holes && poly.holes.length) || poly.outer.length > 14) return null;
  if (!ROOF_DISTRICTS.has(districtAt(record.cx, record.cz))) return null;
  let ring = poly.outer;
  if (ring.length > 1 && ring[0].x === ring[ring.length - 1].x && ring[0].z === ring[ring.length - 1].z) ring = ring.slice(0, -1);
  const area = ringArea(ring);
  if (area < 25 || area > MAX_AREA) return null;
  const rect = orientedRect(ring);
  if (!rect || area / rect.area < MIN_FILL || rect.hv < 1.8) return null;
  const aspect = rect.hu / rect.hv;
  const r = rand();
  const kind = aspect < 1.2 ? 'pyramidal' : r < 0.55 ? 'gabled' : 'hipped';
  const pitch = kind === 'hipped' ? 25 : 30;
  const rise = Math.min(4.2, rect.hv * Math.tan(pitch * Math.PI / 180));
  const roofMat = rand() < 0.62 ? 'corrugated' : 'tiles';
  return { kind, rect, rise, roofMat, tint: rand() };
}

const TINTS = {
  corrugated: [[0.85, 0.86, 0.88], [0.62, 0.64, 0.66], [0.78, 0.38, 0.30], [0.42, 0.52, 0.45], [0.30, 0.33, 0.37]],
  tiles: [[1.0, 0.95, 0.9], [0.85, 0.7, 0.62], [0.55, 0.55, 0.58], [1.1, 0.9, 0.8]]
};

// Faces as lists of local (x along ridge axis, y up, z across) points; slope faces carry u = x, v = slope distance
function faces(kind, hu, hv, h) {
  const U = hu + OVERHANG, V = hv + OVERHANG;
  const eave = -h * (OVERHANG / hv); // overhang continues the slope downwards
  const out = []; // { pts: [[x,y,z]...], gable: bool }
  if (kind === 'gabled') {
    out.push({ pts: [[-U, eave, -V], [U, eave, -V], [U, h, 0], [-U, h, 0]] });
    out.push({ pts: [[-U, h, 0], [U, h, 0], [U, eave, V], [-U, eave, V]] });
    out.push({ pts: [[-hu, 0, -hv], [-hu, 0, hv], [-hu, h, 0]], gable: true });
    out.push({ pts: [[hu, 0, hv], [hu, 0, -hv], [hu, h, 0]], gable: true });
  } else if (kind === 'hipped') {
    const r = Math.max(0, hu - hv);
    out.push({ pts: [[-U, eave, -V], [U, eave, -V], [r, h, 0], [-r, h, 0]] });
    out.push({ pts: [[-r, h, 0], [r, h, 0], [U, eave, V], [-U, eave, V]] });
    out.push({ pts: [[-U, eave, V], [-U, eave, -V], [-r, h, 0]] });
    out.push({ pts: [[U, eave, -V], [U, eave, V], [r, h, 0]] });
  } else {
    out.push({ pts: [[-U, eave, -V], [U, eave, -V], [0, h, 0]] });
    out.push({ pts: [[U, eave, -V], [U, eave, V], [0, h, 0]] });
    out.push({ pts: [[U, eave, V], [-U, eave, V], [0, h, 0]] });
    out.push({ pts: [[-U, eave, V], [-U, eave, -V], [0, h, 0]] });
  }
  return out;
}

const _mats = {};
function roofMaterial(name) {
  if (_mats[name]) return _mats[name];
  const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true, metalness: name === 'corrugated' ? 0.55 : 0.0, roughness: 0.8 });
  m.map = pbrTexture(name, 'color');
  m.roughnessMap = pbrTexture(name, 'rough');
  m.normalMap = pbrTexture(name, 'normal');
  m.normalScale = new THREE.Vector2(1.0, 1.0);
  return (_mats[name] = m);
}

/** Merged roof meshes for the planned records (those with `roof` set by roofPlan). */
export function createRoofs(records) {
  const group = new THREE.Group();
  group.name = 'SurveyedRoofs';
  const buckets = new Map();
  for (const rec of records) {
    const plan = rec.roof;
    if (!plan) continue;
    const { rect, kind } = plan;
    const key = Math.floor(rec.cx / 1000) + ',' + Math.floor(rec.cz / 1000);
    const top = rec.height + 0.22 + (rec.baseY || 0);
    const tints = TINTS[plan.roofMat];
    const tint = tints[Math.floor(plan.tint * tints.length) % tints.length];
    const wallTint = [0.85, 0.85, 0.85];
    for (const f of faces(kind, rect.hu, rect.hv, plan.rise)) {
      const matName = f.gable ? 'brick' : plan.roofMat;
      const bk = key + '|' + matName;
      let b = buckets.get(bk);
      if (!b) buckets.set(bk, (b = { name: matName, pos: [], nor: [], uv: [], col: [], idx: [] }));
      const world = f.pts.map(([x, y, z]) => [
        rect.cx + rect.ux * x + rect.vx * z, top + y, rect.cz + rect.uz * x + rect.vz * z]);
      // flat normal from the first three points, facing up/out
      const [p0, p1, p2] = world;
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const nl = Math.hypot(...n) || 1; n = n.map((c) => c / nl);
      let order = world.map((_, i) => i);
      // winding: the local mirror (x,z) flips handedness with the rect axes; force the normal to point away from the roof centre
      const cen = [rect.cx, top, rect.cz];
      const out = (p0[0] - cen[0]) * n[0] + (p0[1] - cen[1] - plan.rise * 0.3) * n[1] + (p0[2] - cen[2]) * n[2];
      if (out < 0) { n = n.map((c) => -c); order = order.reverse(); }
      const base = b.pos.length / 3;
      // texture coords in metres: u along the first edge, v perpendicular within the face plane
      const eu = e1.map((c) => c / (Math.hypot(...e1) || 1));
      const ev = [n[1] * eu[2] - n[2] * eu[1], n[2] * eu[0] - n[0] * eu[2], n[0] * eu[1] - n[1] * eu[0]];
      const scale = matName === 'brick' ? 1 / 1.6 : matName === 'corrugated' ? 1 / 1.2 : 1 / 1.8;
      const col = matName === 'brick' ? wallTint : tint;
      for (const i of order) {
        const p = world[i];
        b.pos.push(p[0], p[1], p[2]);
        b.nor.push(n[0], n[1], n[2]);
        b.uv.push(((p[0] - p0[0]) * eu[0] + (p[1] - p0[1]) * eu[1] + (p[2] - p0[2]) * eu[2]) * scale,
          ((p[0] - p0[0]) * ev[0] + (p[1] - p0[1]) * ev[1] + (p[2] - p0[2]) * ev[2]) * scale);
        b.col.push(col[0], col[1], col[2]);
      }
      for (let i = 1; i < world.length - 1; i++) b.idx.push(base, base + i, base + i + 1);
    }
  }
  for (const b of buckets.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, roofMaterial(b.name));
    mesh.name = 'SurveyedRoofChunk';
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
