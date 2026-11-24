// tools/melbourne/build-freeways.mjs: writes js/melbourne-freeways.js, the freeways (OSM highway=motorway and
// motorway_link: CityLink, the West Gate Freeway, the Burnley and Domain Tunnels and their ramps) with a vertical profile.
//
// Each way's height above (or below) the terrain comes from its tags: bridge=yes runs on a viaduct (7 m, +6 m per layer
// above 1), tunnel=yes runs in a tunnel (floor 10-12 m down), anything else is at grade. Between them the height ramps
// at no more than RAMP_SLOPE along the network (the ramps fall on the at-grade ways either side, as embankments and open
// cuttings), and reaches 0 wherever a ramp meets an ordinary street. Open cuttings (below ground, not in a tunnel) are
// traced into outlines that js/city-grid.js cuts out of the land deck; where an ordinary street crosses a cutting, the
// cutting is covered (a short cut-and-cover tunnel) so the street keeps its surface.
//
// Output (flat arrays, world frame of tools/melbourne/osm.mjs):
//   ways:     [name, kind (0 motorway, 1 link), width, lanes, [x, z, h, covered, ...] every <= 8 m]
//   trenches: [[x0, z0, x1, z1, ...], ...] open cutting outlines
//   chains:   [[way index, ...], ...] ways joined end to start under one name, for the ambient traffic's lanes
//
// usage: node tools/melbourne/build-freeways.mjs   (after tools/melbourne/fetch-osm.mjs)
// Data © OpenStreetMap contributors (ODbL).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadOSM, toWorld, log } from './osm.mjs';
import { Raster, rdpRing } from '../geo-geometry.mjs';
import { makeBlocks } from './blocks.mjs';

const OUT = process.argv[2] || fileURLToPath(new URL('../../js/melbourne-freeways.js', import.meta.url));
const RAMP_SLOPE = 0.055; // the steepest grade of a ramp, embankment or cutting
const ANCHOR_SLOPE = 0.09; // the grade allowed into a junction with a street, where the ramp has less room
const STEP = 8;
const num = (v) => { const m = /^\s*(-?[0-9.]+)/.exec(v || ''); return m ? parseFloat(m[1]) : NaN; };
const q = (v) => Math.round(v * 10) / 10;
const { nodes, ways } = loadOSM();

const STREET = new Set(['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service']);
const fw = [];
const streetNodes = new Set();
const streetSegs = [];
for (const w of ways.values()) {
  const t = w.tags || {};
  if (!t.highway) continue;
  const tunnel = !!t.tunnel && t.tunnel !== 'no' && t.tunnel !== 'building_passage';
  const bridge = !!t.bridge && t.bridge !== 'no';
  if (/^motorway/.test(t.highway)) {
    const ids = w.nodes.filter((id) => nodes.has(id));
    if (ids.length < 2) continue;
    const layer = num(t.layer) || 0;
    const lanes = num(t.lanes) || (t.highway === 'motorway' ? 3 : 1);
    const width = Math.max(6.5, Math.min(22, lanes * 3.5 + 2.5));
    const target = tunnel ? -(10 + Math.max(0, -layer - 1) * 1) : bridge || layer >= 1 ? 7 + Math.max(0, layer - 1) * 6 : 0;
    fw.push({ id: w.id, name: t.name || t.ref || '', kind: t.highway === 'motorway' ? 0 : 1, lanes, width, ids, target, tunnel });
  } else if (STREET.has(t.highway) && !tunnel && !bridge && !((num(t.layer) || 0) < 0)) {
    for (const id of w.nodes) streetNodes.add(id);
    if (t.highway !== 'service') {
      const pts = w.nodes.filter((id) => nodes.has(id)).map((id) => toWorld(...nodes.get(id)));
      const lanes = num(t.lanes) || 2;
      for (let i = 0; i + 1 < pts.length; i++) streetSegs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], Math.max(4, lanes * 1.8)]);
    }
  }
}
log(`freeway ways: ${fw.length} (${fw.filter((f) => f.tunnel).length} in tunnels, ${fw.filter((f) => f.target > 0).length} raised)`);

// --- The network: nodes, edges (metres), targets ----------------------------------------------------------------------
const P = new Map(); // node id -> [x, z]
const adj = new Map(); // node id -> [[other, length], ...]
const T = new Map(); // node id -> target heights seen
for (const f of fw) {
  for (let i = 0; i < f.ids.length; i++) {
    const id = f.ids[i];
    if (!P.has(id)) P.set(id, toWorld(...nodes.get(id)));
    (T.get(id) || T.set(id, []).get(id)).push(f.target);
    if (i) {
      const a = f.ids[i - 1], pa = P.get(a), pb = P.get(id), L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      (adj.get(a) || adj.set(a, []).get(a)).push([id, L]);
      (adj.get(id) || adj.set(id, []).get(id)).push([a, L]);
    }
  }
}
// Dijkstra-style envelope: best(n) = max over sources m of (src(m) - slope * dist(m, n))   (sign -1 for the minimum)
function envelope(src, slope, sign = 1) {
  const best = new Map();
  const heap = [];
  const push = (id, v) => { heap.push([id, v]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][1] * sign >= heap[i][1] * sign) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][1] * sign > heap[m][1] * sign) m = l; if (r < heap.length && heap[r][1] * sign > heap[m][1] * sign) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const [id, v] of src) push(id, v);
  while (heap.length) {
    const [id, v] = pop();
    if (best.has(id)) continue;
    best.set(id, v);
    for (const [o, L] of adj.get(id) || []) if (!best.has(o)) push(o, v - sign * slope * L);
  }
  return best;
}
const up = envelope([...T].map(([id, ts]) => [id, Math.max(0, ...ts)]), RAMP_SLOPE, 1);
const down = envelope([...T].map(([id, ts]) => [id, Math.min(0, ...ts)]), RAMP_SLOPE, -1);
// distance from the nearest junction with a street: the ramp must be at ground there
const anchors = [...P.keys()].filter((id) => streetNodes.has(id));
const anchorDist = envelope(anchors.map((id) => [id, 0]), 1, -1); // grows by 1 per metre
const H = new Map();
for (const id of P.keys()) {
  const ad = anchorDist.get(id), lim = ad === undefined ? Infinity : ad * ANCHOR_SLOPE;
  const u = Math.min(up.get(id) ?? 0, lim), d = Math.max(down.get(id) ?? 0, -lim);
  H.set(id, u > 0.05 ? u : d < -0.05 ? d : 0);
}
log(`anchors (junctions with streets): ${anchors.length}`);

// --- Ways resampled every STEP m, with height and the covered flag -----------------------------------------------------
const crossesStreet = (x, z, half) => {
  for (const [x0, z0, x1, z1, r] of streetSegs) {
    if (Math.max(x0, x1) + r + half < x || Math.min(x0, x1) - r - half > x || Math.max(z0, z1) + r + half < z || Math.min(z0, z1) - r - half > z) continue;
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1;
    const s = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2));
    if (Math.hypot(x - x0 - dx * s, z - z0 - dz * s) < r + half + 4) return true;
  }
  return false;
};
const outWays = [];
for (const f of fw) {
  const pts = [];
  for (let i = 0; i < f.ids.length; i++) {
    const a = P.get(f.ids[i]), ha = H.get(f.ids[i]);
    if (i) {
      const b = P.get(f.ids[i - 1]), hb = H.get(f.ids[i - 1]);
      const L = Math.hypot(a[0] - b[0], a[1] - b[1]), n = Math.ceil(L / STEP);
      for (let k = 1; k < n; k++) { const s = k / n; pts.push([b[0] + (a[0] - b[0]) * s, b[1] + (a[1] - b[1]) * s, hb + (ha - hb) * s]); }
    }
    pts.push([a[0], a[1], ha]);
  }
  // covered: the whole of a tunnel way; and below ground where a street crosses over (cut and cover)
  const cov = pts.map(([x, z, h]) => (f.tunnel || (h < -2.5 && crossesStreet(x, z, f.width / 2))) ? 1 : 0);
  // a covered stretch shorter than 2 samples inside an open cutting is widened by one, so the cover is a whole slab
  for (let i = 1; i + 1 < pts.length; i++) if (cov[i] && pts[i][2] < -2.5 && !f.tunnel) { cov[i - 1] = cov[i - 1] || 2; cov[i + 1] = cov[i + 1] || 2; }
  f.pts = pts; f.cov = cov.map((c) => (c ? 1 : 0));
  outWays.push([f.name, f.kind, q(f.width), f.lanes, pts.flatMap(([x, z, h], i) => [q(x), q(z), q(h), f.cov[i]])]);
}

// --- Open cuttings: rasterised, merged and traced ---------------------------------------------------------------------
const trenchSegs = [];
for (const f of fw) {
  for (let i = 0; i + 1 < f.pts.length; i++) {
    const a = f.pts[i], b = f.pts[i + 1];
    if (f.cov[i] && f.cov[i + 1]) continue;
    if (Math.max(a[2], b[2]) > -0.6) continue; // shallow ends: the deck covers them (a slight dip)
    trenchSegs.push([a, b, f.width / 2 + 1.2]);
  }
}
const trenches = [];
if (trenchSegs.length) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [a, b, r] of trenchSegs) for (const p of [a, b]) { x0 = Math.min(x0, p[0] - r); x1 = Math.max(x1, p[0] + r); z0 = Math.min(z0, p[1] - r); z1 = Math.max(z1, p[1] + r); }
  const R = new Raster(x0 - 8, z0 - 8, x1 + 8, z1 + 8, 1);
  for (const [a, b, r] of trenchSegs) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L * r, nz = dx / L * r, ex = dx / L * 0.6, ez = dz / L * 0.6;
    R.fillRing([[a[0] + nx - ex, a[1] + nz - ez], [b[0] + nx + ex, b[1] + nz + ez], [b[0] - nx + ex, b[1] - nz + ez], [a[0] - nx - ex, a[1] - nz - ez]], 1);
  }
  R.close(4); // pieces closer than 8 m merge into one outline (holes that touch break the land deck's triangulation)
  const bodies = makeBlocks({ land: R, roads: [], sidewalk: 1, log: () => {} });
  for (const b of bodies) if (b.area > 40) trenches.push(rdpRing(b.poly, 0.5).flatMap(([x, z]) => [q(x), q(z)]));
}
log(`open cuttings: ${trenches.length}`);

// --- Chains for the traffic: a way continues into the motorway way that starts where it ends, same name preferred ------
const startsAt = new Map();
fw.forEach((f, i) => (startsAt.get(f.ids[0]) || startsAt.set(f.ids[0], []).get(f.ids[0])).push(i));
const used = new Set();
const chains = [];
const order = fw.map((f, i) => i).filter((i) => fw[i].kind === 0).sort((a, b) => fw[b].pts.length - fw[a].pts.length);
const hasPred = new Set();
for (const f of fw) for (const j of startsAt.get(f.ids[f.ids.length - 1]) || []) if (fw[j].kind === 0 && f.kind === 0) hasPred.add(j);
for (const i0 of [...order.filter((i) => !hasPred.has(i)), ...order]) {
  if (used.has(i0)) continue;
  const chain = [i0];
  used.add(i0);
  for (let cur = i0; ;) {
    const next = (startsAt.get(fw[cur].ids[fw[cur].ids.length - 1]) || []).filter((j) => !used.has(j) && fw[j].kind === 0);
    if (!next.length) break;
    const j = next.find((k) => fw[k].name === fw[cur].name) ?? next[0];
    chain.push(j); used.add(j); cur = j;
  }
  const len = chain.reduce((a, i) => a + fw[i].pts.length * STEP, 0);
  if (len >= 400) chains.push(chain);
}
log(`traffic chains: ${chains.length}`);

const body = { ways: outWays, trenches, chains };
fs.writeFileSync(OUT, `// js/melbourne-freeways.js: GENERATED by tools/melbourne/build-freeways.mjs, do not edit by hand.
// Melbourne's freeways (CityLink, the West Gate Freeway, the Burnley and Domain Tunnels and their ramps) in the world
// frame of js/melbourne-geodata.js, each way as [name, kind (0 motorway, 1 link), width, lanes, [x, z, h, covered, ...]]
// with h the height above the terrain (negative in tunnels and cuttings). Source: OpenStreetMap (© OpenStreetMap
// contributors, ODbL).
export const FREEWAYS = ${JSON.stringify(body)};
`);
log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
