// tools/melbourne/build-buildings.mjs: writes js/melbourne-building-geodata.js and its .bin.gz asset, Melbourne's
// building footprints with roof heights in the engine's NYB1 format (the same layout tools/build-buildings.py writes for
// New York, so the loader is the same).
//
// usage: node tools/melbourne/fetch-osm.mjs && node tools/melbourne/build-buildings.mjs
//
// Source: OpenStreetMap building outlines (ways and multipolygons) and building:part pieces. Heights, in order:
//   1. the outline's own height tag, or the tallest building:part whose centre lies inside it, if that is taller;
//   2. building:levels x 3.2 m (+ roof:levels x 2.5 m, + 1 m parapet);
//   3. otherwise an estimate: the length-weighted median of tagged heights within 120 m, held down for small
//      footprints (a 100 m^2 lot in the Hoddle Grid is a shopfront, not a tower), and floored by the kind of building.
// Canopies, roofs over platforms, carports and building parts are not buildings here. Data © OpenStreetMap contributors.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadOSM, wayPts, relationRings, log } from './osm.mjs';

const OUT_JS = fileURLToPath(new URL('../../js/melbourne-building-geodata.js', import.meta.url));
const OUT_BIN = OUT_JS.replace(/\.js$/, '.bin.gz');
const SKIP = new Set(['roof', 'carport', 'canopy', 'shelter', 'no', 'bridge', 'construction', 'ruins', 'collapsed', 'kiosk', 'toilets', 'grandstand']);

const num = (v) => {
  if (v == null) return NaN;
  const m = /^\s*([0-9.]+)\s*(m|ft|')?/.exec(String(v));
  if (!m) return NaN;
  return parseFloat(m[1]) * (m[2] === 'ft' || m[2] === "'" ? 0.3048 : 1);
};
function tagHeight(t) {
  const h = num(t.height);
  if (h > 0) return h;
  const lv = num(t['building:levels']);
  if (lv > 0) return lv * 3.2 + (num(t['roof:levels']) > 0 ? num(t['roof:levels']) * 2.5 : 0) + 1;
  return NaN;
}
function area(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}
function centroid(r) {
  let x = 0, z = 0;
  for (const p of r) { x += p[0]; z += p[1]; }
  return [x / r.length, z / r.length];
}
function inside([x, z], r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a], [bx, bz] = pts[b];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1e-9;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// Closed ring (first point repeated or not) -> simplified ring on the 0.5 m grid, integer half-metres, with the given
// winding (+1: positive signed area in x/z), or null when it collapses
function quantRing(r, sign) {
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r = r.slice(0, -1);
  if (r.length < 3) return null;
  // split at the farthest point from the first so RDP keeps both ends
  let far = 0, fi = 0;
  for (let i = 1; i < r.length; i++) { const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]); if (d > far) { far = d; fi = i; } }
  const s = [...rdp(r.slice(0, fi + 1), 0.25).slice(0, -1), ...rdp([...r.slice(fi), r[0]], 0.25).slice(0, -1)];
  const q = [];
  for (const [x, z] of s) {
    const p = [Math.round(x * 2), Math.round(z * 2)];
    const last = q[q.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) q.push(p);
  }
  while (q.length > 1 && q[0][0] === q[q.length - 1][0] && q[0][1] === q[q.length - 1][1]) q.pop();
  if (q.length < 3 || Math.abs(area(q)) < 4) return null; // < 1 m^2
  if (Math.sign(area(q)) !== sign) q.reverse();
  // canonical start: the smallest point
  let st = 0;
  for (let i = 1; i < q.length; i++) if (q[i][0] < q[st][0] || (q[i][0] === q[st][0] && q[i][1] < q[st][1])) st = i;
  return [...q.slice(st), ...q.slice(0, st)];
}

// --- Gather outlines and parts --------------------------------------------------------------------------------------
const { nodes, ways, relations } = loadOSM();
const outlines = []; // { rings: [{outer, inner: []}], tags, id }
const parts = []; // { ring, h }
const inMultipolygon = new Set();
for (const r of relations.values()) {
  const t = r.tags || {};
  if (t.type !== 'multipolygon') continue;
  for (const m of r.members) if (m.type === 'way') inMultipolygon.add(m.ref);
  if (!t.building || SKIP.has(t.building)) continue;
  const { outer, inner } = relationRings(r, ways, nodes);
  if (!outer.length) continue;
  outlines.push({ id: `r${r.id}`, tags: t, polys: outer.map((o) => ({ outer: o, inner: inner.filter((h) => inside(centroid(h), o)) })) });
}
for (const w of ways.values()) {
  const t = w.tags || {};
  if (w.nodes.length < 4 || w.nodes[0] !== w.nodes[w.nodes.length - 1]) continue;
  if (t['building:part'] && t['building:part'] !== 'no') {
    const h = tagHeight(t);
    if (h > 0) parts.push({ ring: wayPts(w, nodes), h });
    continue;
  }
  if (!t.building || SKIP.has(t.building)) continue;
  if (inMultipolygon.has(w.id) && !t.building) continue;
  const pts = wayPts(w, nodes);
  if (pts.length < 4 || pts.length < w.nodes.length) continue; // incomplete at a tile edge: should not happen
  outlines.push({ id: `w${w.id}`, tags: t, polys: [{ outer: pts, inner: [] }] });
}
log(`${outlines.length} building outlines, ${parts.length} building parts with heights`);

// --- Heights ---------------------------------------------------------------------------------------------------------
const CELL = 60;
const partGrid = new Map();
for (const p of parts) {
  const c = centroid(p.ring);
  p.c = c;
  const k = `${Math.floor(c[0] / CELL)},${Math.floor(c[1] / CELL)}`;
  if (!partGrid.has(k)) partGrid.set(k, []);
  partGrid.get(k).push(p);
}
for (const b of outlines) {
  const outer = b.polys[0].outer;
  b.area = b.polys.reduce((t, p) => t + Math.abs(area(p.outer)), 0);
  b.c = centroid(outer);
  let h = tagHeight(b.tags);
  // tallest part inside
  const [cx, cz] = [Math.floor(b.c[0] / CELL), Math.floor(b.c[1] / CELL)];
  const reach = Math.ceil(Math.sqrt(b.area) / CELL) + 1;
  let ph = 0;
  for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
    for (const p of partGrid.get(`${cx + dx},${cz + dz}`) || []) if (p.h > ph && b.polys.some((q) => inside(p.c, q.outer))) ph = p.h;
  }
  if (ph > 0 && !(h >= ph)) h = ph;
  b.h = h;
  b.known = h > 0;
}
const known = outlines.filter((b) => b.known);
const kGrid = new Map();
for (const b of known) {
  const k = `${Math.floor(b.c[0] / CELL)},${Math.floor(b.c[1] / CELL)}`;
  if (!kGrid.has(k)) kGrid.set(k, []);
  kGrid.get(k).push(b);
}
const FLOOR = { house: 6.5, detached: 6.5, semidetached_house: 7, terrace: 8, garage: 3, garages: 3, shed: 3.5, hut: 3, service: 4, residential: 7, apartments: 12, commercial: 10, retail: 7, office: 14, industrial: 8, warehouse: 8, school: 9, church: 14, hotel: 18 };
let estimated = 0;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
for (const b of outlines) {
  if (b.known) continue;
  estimated++;
  const [cx, cz] = [Math.floor(b.c[0] / CELL), Math.floor(b.c[1] / CELL)];
  const near = [];
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    for (const k of kGrid.get(`${cx + dx},${cz + dz}`) || []) {
      const d = Math.hypot(k.c[0] - b.c[0], k.c[1] - b.c[1]);
      if (d < 120) near.push([k.h, Math.sqrt(k.area) / (1 + d / 30)]);
    }
  }
  let h;
  if (near.length >= 3) {
    near.sort((p, q) => p[0] - q[0]);
    const tot = near.reduce((t, v) => t + v[1], 0);
    let acc = 0;
    h = near[near.length - 1][0];
    for (const [v, w] of near) { acc += w; if (acc >= tot * (0.3 + 0.4 * hash(b.id))) { h = v; break; } }
  } else h = FLOOR[b.tags.building] || 8;
  // small footprints stay low: about four storeys per 10 m of lot frontage
  h = Math.min(h, 4 + Math.sqrt(b.area) * 1.3);
  h = Math.max(h, FLOOR[b.tags.building] || 4);
  b.h = h;
}
log(`${known.length} heights from tags and parts, ${estimated} estimated`);

// --- The Hoddle Grid: footprints clipped to their blocks' property lines -----------------------------------------------
// js/melbourne-geodata.js lays the grid's streets out as straight, axis-aligned corridors a chain wide; the real streets
// wander a few metres off those lines (most at the grid's west end, where Flinders, Lonsdale and La Trobe Streets bend),
// so real footprints would stand in the roadway. Inside the grid every footprint is clipped to the rectangular block
// it stands on, inset by the footpath; one standing mostly in the road is dropped. Needs build-geodata.mjs run first.
const { GEO } = await import('../../js/melbourne-geodata.js');
const SIDEWALK = GEO.frame.sidewalk;
const EXT = GEO.grid.extent, GW = GEO.grid.width / 2;
const inGridZone = ([x, z]) => x > EXT.minX - GW && x < EXT.maxX + GW && z > EXT.minZ - GW && z < EXT.maxZ + GW;
const propRects = GEO.blocks.filter((b) => b[4]).map((b) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < b[0].length; i += 2) { x0 = Math.min(x0, b[0][i]); x1 = Math.max(x1, b[0][i]); z0 = Math.min(z0, b[0][i + 1]); z1 = Math.max(z1, b[0][i + 1]); }
  return { x0: x0 + SIDEWALK, x1: x1 - SIDEWALK, z0: z0 + SIDEWALK, z1: z1 - SIDEWALK, bx0: x0, bx1: x1, bz0: z0, bz1: z1 };
});
function clipRing(r, R) {
  // Sutherland-Hodgman against the rect's four sides
  const sides = [[(p) => p[0] - R.x0, 0, R.x0], [(p) => R.x1 - p[0], 0, R.x1], [(p) => p[1] - R.z0, 1, R.z0], [(p) => R.z1 - p[1], 1, R.z1]];
  let pts = r;
  for (const [f, axis, v] of sides) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        const t = fa / (fa - fb);
        const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        q[axis] = v;
        out.push(q);
      }
    }
    pts = out;
    if (pts.length < 3) return null;
  }
  return pts;
}
let clipped = 0, dropped = 0;
for (const b of outlines) {
  if (!inGridZone(b.c)) continue;
  const R = propRects.find((r) => b.c[0] > r.bx0 && b.c[0] < r.bx1 && b.c[1] > r.bz0 && b.c[1] < r.bz1);
  if (!R) { b.drop = true; dropped++; continue; } // centred in a grid street
  let before = 0, after = 0, changed = false;
  for (const p of b.polys) {
    const ring = p.outer[0][0] === p.outer[p.outer.length - 1][0] && p.outer[0][1] === p.outer[p.outer.length - 1][1] ? p.outer.slice(0, -1) : p.outer;
    before += Math.abs(area(ring));
    const c = clipRing(ring, R);
    if (!c || c.length !== ring.length || c.some((q, i) => q[0] !== ring[i][0] || q[1] !== ring[i][1])) changed = true;
    p.outer = c || [];
    p.inner = p.inner.filter((h) => h.every((q) => q[0] > R.x0 && q[0] < R.x1 && q[1] > R.z0 && q[1] < R.z1));
    after += c ? Math.abs(area(c)) : 0;
  }
  if (after < before * 0.3) { b.drop = true; dropped++; } else if (changed) clipped++;
}
log(`Hoddle Grid: ${clipped} footprints clipped to their property lines, ${dropped} dropped`);

// --- Quantise and pack -------------------------------------------------------------------------------------------------
const buildings = [];
for (const b of outlines) {
  if (b.drop) continue;
  const polygons = [];
  for (const p of b.polys) {
    if (p.outer.length < 3) continue;
    const outer = quantRing(p.outer, 1);
    if (!outer) continue;
    const holes = p.inner.map((h) => quantRing(h, -1)).filter(Boolean).sort();
    polygons.push([outer, ...holes]);
  }
  if (!polygons.length) continue;
  const x = Math.round(b.c[0]) + 8192, z = Math.round(b.c[1]) + 8192;
  let order = 0;
  for (let i = 0; i < 16; i++) order += (((x >> i) & 1) * 2 ** (2 * i)) + (((z >> i) & 1) * 2 ** (2 * i + 1));
  const start = num(b.tags.start_date);
  const year = start >= 1800 && start <= 2100 ? Math.round(start / 10) * 10 : 0;
  buildings.push({ order, height: Math.max(1, Math.round(b.h)), year, polygons });
}
buildings.sort((a, b) => a.order - b.order);

const meta = [], xs = [], zs = [];
const uint = (arr, v) => { while (v > 127) { arr.push((v & 127) | 128); v >>>= 7; } arr.push(v); };
const sint = (arr, v) => uint(arr, v >= 0 ? v * 2 : -v * 2 - 1);
uint(meta, buildings.length);
let px = 0, pz = 0;
for (const b of buildings) {
  uint(meta, b.height);
  uint(meta, b.year ? b.year / 10 - 159 : 0);
  uint(meta, b.polygons.length);
  for (const poly of b.polygons) {
    uint(meta, poly.length);
    for (const ring of poly) {
      uint(meta, ring.length);
      for (const [x, z] of ring) { sint(xs, x - px); sint(zs, z - pz); px = x; pz = z; }
    }
  }
}
const header = Buffer.alloc(12);
header.write('NYB1', 0, 'latin1');
header.writeUInt32LE(meta.length, 4);
header.writeUInt32LE(xs.length, 8);
const raw = Buffer.concat([header, Buffer.from(meta), Buffer.from(xs), Buffer.from(zs)]);
const gz = zlib.gzipSync(raw, { level: 9 });
gz.writeUInt32LE(0, 4); // no mtime, so rebuilds are byte-identical
fs.writeFileSync(OUT_BIN, gz);

// The loader is the one tools/build-buildings.py writes, pointed at this asset
const nyc = fs.readFileSync(fileURLToPath(new URL('../../js/building-geodata.js', import.meta.url)), 'utf8');
const body = nyc.slice(nyc.indexOf('const response'));
const digest = crypto.createHash('sha256').update(raw).digest('hex');
fs.writeFileSync(OUT_JS, `// Generated by tools/melbourne/build-buildings.mjs; do not edit.
// Melbourne building footprints and heights from OpenStreetMap (© OpenStreetMap contributors, ODbL).
// Data SHA-256: ${digest}
// ${buildings.length.toLocaleString('en')} buildings (${known.length} with tagged heights). Coordinates: 0.5 m; roof heights: 1 m.
${body.replace("./building-geodata.bin.gz", './melbourne-building-geodata.bin.gz')}`);
const hs = buildings.map((b) => b.height).sort((a, b) => a - b);
log(`wrote ${buildings.length} buildings: ${(gz.length / 1024).toFixed(0)} KB gzip; heights ${hs[0]}-${hs[hs.length - 1]} m, median ${hs[hs.length >> 1]} m, ${hs.filter((h) => h >= 100).length} at 100 m or more`);
