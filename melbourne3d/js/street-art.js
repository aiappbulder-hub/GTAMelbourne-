// Real Melbourne street art as wall decals (photos credited one by one in CREDITS.md).
// Two 2048x2048 atlases (4x4 cells of 512 px, images squashed into square cells; `a` below is the true aspect).
// Quads are placed flush on the outer walls of the surveyed OSM building footprints (0.04 m off the wall, with
// polygonOffset): dense in Hosier Lane and AC/DC Lane, thinner in the other CBD laneways, scattered on Fitzroy and
// Collingwood back walls, rare on main-street facades. Geometry is merged per 128 m chunk and atlas (a few draw calls),
// and chunks beyond a quality-dependent distance are hidden. Low quality loads only atlas 0 and draws near the player.
import * as THREE from 'three/webgpu';
import { terrainHeight } from './terrain.js';
import { QUALITY } from './quality.js';
import { REAL_BUILDINGS } from './city-buildings.js';

// [atlas, cell, aspect, tag] tag: h = Hosier-ish, a = AC/DC
const ART = [
  [0, 0, 1.982, 'h'], [0, 1, 1.726, 'h'], [0, 2, 1.735, 'h'], [0, 3, 1.163, ''],
  [0, 4, 1.137, 'h'], [0, 5, 1.393, 'h'], [0, 6, 1.140, 'h'], [0, 7, 1.546, 'h'],
  [0, 8, 1.751, 'h'], [0, 9, 1.546, 'h'], [0, 10, 1.045, 'a'], [0, 11, 1.045, 'a'],
  [0, 12, 1.393, 'a'], [0, 13, 2.110, 'a'], [0, 14, 1.744, 'h'], [0, 15, 1.744, 'h'],
  [1, 0, 1.672, ''], [1, 1, 1.320, ''], [1, 2, 1.546, 'a'], [1, 3, 1.873, 'h'],
  [1, 4, 1.748, ''], [1, 5, 1.546, ''], [1, 6, 0.783, ''], [1, 7, 1.744, '']
];
const LANES = [
  { x: 58, hw: 2.6, z0: 126, z1: 231, dense: 0.95, tag: 'h' },    // Hosier Lane
  { x: 120, hw: 2.4, z0: 126, z1: 231, dense: 0.95, tag: 'a' },   // AC/DC Lane
  { x: -88, hw: 2.4, z0: 126, z1: 231, dense: 0.5, tag: '' },     // Centre Place
  { x: -31, hw: 3.2, z0: 126, z1: 231, dense: 0.3, tag: '' }      // Degraves St
];
const CELL = 0.25, INSET = 0.004;
const CHUNK = 128;
const DIST = { low: 140, medium: 260, high: 420 }[QUALITY] ?? 260;
const MAX_QUADS = { low: 500, medium: 800, high: 1200 }[QUALITY] ?? 800;

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296); }
function inRing(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
}
function fitzCollingwood(x, z) {
  if (x < 790 || x > 2600) return false;
  const vicPde = x < 1560 ? -690 + ((x - 780) * 486) / 780 : -204;
  if (z >= vicPde || z < -1300) return false;
  const nich = z > -853 ? 780 + ((-690 - z) * 185) / 163 : 965 + ((-853 - z) * 187) / 406;
  return x > nich;
}
const inCBD = (x, z) => x > -420 && x < 460 && z > -120 && z < 290;

export function createStreetArt({ scene }) {
  const root = new THREE.Group();
  root.name = 'StreetArt';
  scene.add(root);
  const items = ART.filter((a) => QUALITY !== 'low' || a[0] === 0);
  const pick = (r, tag) => {
    const pool = tag ? items.filter((a) => a[3] === tag || a[3] === '') : items;
    const pref = tag ? items.filter((a) => a[3] === tag) : null;
    const p = pref && pref.length && r() < 0.7 ? pref : pool;
    return p[Math.floor(r() * p.length)];
  };
  const chunks = new Map(); // key -> {atlas: [pos[], uv[], nrm[]], cx, cz}
  let total = 0;
  const addQuad = (it, mx, mz, y0, nx, nz, w, h) => {
    const key = Math.floor(mx / CHUNK) + ',' + Math.floor(mz / CHUNK);
    let ch = chunks.get(key);
    if (!ch) chunks.set(key, ch = { cx: (Math.floor(mx / CHUNK) + 0.5) * CHUNK, cz: (Math.floor(mz / CHUNK) + 0.5) * CHUNK, a: [null, null].map(() => ({ p: [], u: [], n: [] })) });
    const g = ch.a[it[0]];
    const rx = nz, rz = -nx; // viewer's right
    const bx = mx - rx * w / 2, bz = mz - rz * w / 2, ex = mx + rx * w / 2, ez = mz + rz * w / 2;
    g.p.push(bx, y0, bz, ex, y0, ez, ex, y0 + h, ez, bx, y0 + h, bz);
    const col = it[1] % 4, row = Math.floor(it[1] / 4);
    const u0 = col * CELL + INSET, u1 = (col + 1) * CELL - INSET, v1 = 1 - row * CELL - INSET, v0 = 1 - (row + 1) * CELL + INSET;
    g.u.push(u0, v0, u1, v0, u1, v1, u0, v1);
    for (let k = 0; k < 4; k++) g.n.push(nx, 0, nz);
    total++;
  };

  const r = rng(1337);
  // Spatial index of every footprint (32 m cells): a decal is only placed where the open air in front of the wall is free
  const GC = 32, grid = new Map();
  for (const b of REAL_BUILDINGS) {
    if (!(inCBD(b.cx, b.cz) || fitzCollingwood(b.cx, b.cz))) continue;
    for (let ix = Math.floor(b.minX / GC); ix <= Math.floor(b.maxX / GC); ix++) for (let iz = Math.floor(b.minZ / GC); iz <= Math.floor(b.maxZ / GC); iz++) {
      const k = ix + ',' + iz; (grid.get(k) || grid.set(k, []).get(k)).push(b);
    }
  }
  const blocked = (x, z, self) => {
    for (const o of grid.get(Math.floor(x / GC) + ',' + Math.floor(z / GC)) || []) {
      if (x < o.minX || x > o.maxX || z < o.minZ || z > o.maxZ) continue;
      for (const pl of o.polygons) if (inRing(pl.outer, x, z)) return true;
    }
    return false;
  };
  const placed = []; // {x,z,nx,nz,w,y0,y1}
  const overlaps = (x, z, nx, nz, w, y0, y1) => {
    for (const q of placed) {
      if (nx * q.nx + nz * q.nz < 0.8) continue;
      if (Math.abs((x - q.x) * nx + (z - q.z) * nz) > 0.6) continue;
      if (Math.abs((x - q.x) * nz - (z - q.z) * nx) > (w + q.w) / 2 + 0.15) continue;
      if (y0 < q.y1 + 0.1 && y1 > q.y0 - 0.1) return true;
    }
    return false;
  };
  for (let pass = 0; pass < 2; pass++) for (const b of REAL_BUILDINGS) {
    if (total >= MAX_QUADS) break;
    if (!(inCBD(b.cx, b.cz) || fitzCollingwood(b.cx, b.cz))) continue;
    if (pass === 0 && !LANES.some((L) => Math.abs(b.cx - L.x) < 60 && b.maxZ > L.z0 && b.minZ < L.z1)) continue;
    const cbd = inCBD(b.cx, b.cz);
    const wallH = b.height || 8;
    if (wallH < 4) continue;
    for (const poly of b.polygons) {
      const ring = poly.outer;
      let A = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) A += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
      const sgn = A > 0 ? 1 : -1;
      for (let i = 0; i < ring.length; i++) {
        const p0 = ring[i], p1 = ring[(i + 1) % ring.length];
        const dx = p1.x - p0.x, dz = p1.z - p0.z, len = Math.hypot(dx, dz);
        if (len < 3.5) continue;
        const nx = sgn * dz / len, nz = -sgn * dx / len;
        const mx = (p0.x + p1.x) / 2, mz = (p0.z + p1.z) / 2;
        if (inRing(ring, mx + nx * 0.3, mz + nz * 0.3)) continue; // normal must point out
        let lane = null;
        for (const L of LANES) {
          if (Math.abs(mx - L.x) < L.hw + 4 && mz > L.z0 - 5 && mz < L.z1 + 5 && Math.abs(nz) < 0.35) { lane = L; break; }
        }
        if ((pass === 0) !== !!lane) continue;
        let prob;
        if (lane) prob = lane.dense;
        else if (cbd) prob = len < 16 ? 0.1 : 0.012;
        else prob = len < 30 ? 0.22 : 0.04;
        if (r() > prob) continue;
        const tx = dx / len, tz = dz / len;
        const rows = lane && wallH >= 6.5 ? 2 : 1;
        for (let row = 0; row < rows; row++) {
          let s = 0.4 + r() * 0.6;
          while (s < len - 1.5 && total < MAX_QUADS) {
            const it = pick(r, lane ? lane.tag : '');
            let w = Math.min(len - s - 0.3, lane ? 2.6 + r() * 2.2 : 2 + r() * 2);
            let h = w / it[2];
            const maxH = row ? 2.0 : (lane ? 3.5 : 3);
            if (h > maxH) { h = maxH; w = h * it[2]; }
            if (w < 1.2 || s + w > len - 0.2) { s += 1; continue; }
            const cx = p0.x + tx * (s + w / 2), cz = p0.z + tz * (s + w / 2);
            // free air in front of the whole span (not inside, or hidden by, another footprint)
            let ok = true;
            for (const f of [-0.5, 0, 0.5]) for (const d of [0.5, 1.5]) {
              if (blocked(cx + tx * f * w + nx * d, cz + tz * f * w + nz * d, b)) ok = false;
            }
            const gy = terrainHeight(cx, cz);
            const y0 = gy + (row ? 3.9 : 0.3);
            const px = cx + nx * 0.02, pz = cz + nz * 0.02;
            if (ok && y0 + h <= gy + Math.min(wallH - 0.3, 6.2) && !overlaps(px, pz, nx, nz, w, y0, y0 + h)) {
              addQuad(it, px, pz, y0, nx, nz, w, h);
              placed.push({ x: px, z: pz, nx, nz, w, y0, y1: y0 + h });
            }
            s += w + 0.2 + r() * 0.5;
            if (!lane) break; // one piece per ordinary wall
          }
        }
      }
    }
  }

  const loader = new THREE.TextureLoader();
  const mats = [0, 1].map((i) => {
    if (QUALITY === 'low' && i === 1) return null;
    const t = loader.load(new URL(`../assets/streetart/atlas${i}.webp`, import.meta.url).href);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = QUALITY === 'low' ? 1 : 4;
    return new THREE.MeshStandardNodeMaterial({
      map: t, color: 0xb8b8b8, roughness: 1, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
  });
  const list = [];
  for (const ch of chunks.values()) {
    const grp = new THREE.Group();
    ch.a.forEach((g, i) => {
      if (!g.p.length || !mats[i]) return;
      const n = g.p.length / 12, idx = [];
      for (let q = 0; q < n; q++) idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.u, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mats[i]);
      m.receiveShadow = true; m.frustumCulled = true;
      grp.add(m);
    });
    if (!grp.children.length) continue;
    grp.visible = false;
    root.add(grp);
    list.push({ grp, cx: ch.cx, cz: ch.cz });
  }
  const lim = DIST + CHUNK * 0.75;
  function update(camPos) {
    if (!camPos) return;
    for (const c of list) c.grp.visible = Math.abs(camPos.x - c.cx) < lim && Math.abs(camPos.z - c.cz) < lim
      && Math.hypot(camPos.x - c.cx, camPos.z - c.cz) < lim;
  }
  return { root, update, count: total, chunks: list.length };
}
