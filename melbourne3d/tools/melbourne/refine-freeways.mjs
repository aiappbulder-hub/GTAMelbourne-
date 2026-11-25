// tools/melbourne/refine-freeways.mjs: the second pass over the freeway data (js/melbourne-freeways.js), run by
// tools/melbourne/build-freeways.mjs on its output, or on its own on the raw output saved earlier:
//   node tools/melbourne/refine-freeways.mjs [raw = tools/melbourne/freeways-raw.json] [out = js/melbourne-freeways.js]
// It needs no OSM tiles, only the raw data, js/melbourne-geodata.js (streets, water, blocks) and the terrain.
//
// Passes, in order:
//  2. the vertical profile: slope-limited everywhere (tunnels come up through portals onto their roads); the open
//     cuttings and the kerb islands round them (trenches, blockPatches) are traced again for it.
//  1. waterHoles: the outlines (merged, non-overlapping) where the water plane under the land (js/city-grid.js, at the
//     river level, -1.6 m) must be cut out: every open cutting, and every tunnel whose inside reaches below that level, so
//     no water is drawn across a cutting's or a tunnel's road.
// More passes are added below (profile, streets, smoothing, simplification); see each section.
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Raster, rdpRing } from '../geo-geometry.mjs';
import { makeBlocks } from './blocks.mjs';

const JS = new URL('../../js/', import.meta.url);
const WL = -1.6; // the water plane's height (js/melbourne-config.js ISLAND_BOUNDS.waterLevel)
const TUNNEL_H = 5.4; // js/freeways.js
const GRADE = 0.06; // the steepest grade anywhere on the network (6%)
// a tunnel's ceiling over a floor at y under ground at t (js/freeways.js ceilingAt)
const ceilingAt = (y, t) => Math.max(y + 2.4, Math.min(y + TUNNEL_H, t - 0.3));
const q = (v) => Math.round(v * 10) / 10;

export async function loadTerrain() {
  const { TERRAIN_DATA } = await import(new URL('melbourne-terrain-data.js', JS));
  const { x0: X0, z0: Z0, cell: CELL, nx: NX, nz: NZ, unit: UNIT } = TERRAIN_DATA;
  const bin = Buffer.from(TERRAIN_DATA.data, 'base64');
  const G = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) G[i] = bin[i] * UNIT;
  const X1 = X0 + (NX - 1) * CELL, Z1 = Z0 + (NZ - 1) * CELL;
  return (x, z) => {
    if (!(x > X0 && x < X1 && z > Z0 && z < Z1)) return 0;
    const fx = (x - X0) / CELL, fz = (z - Z0) / CELL, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * NX + i;
    return G[k] * (1 - u) * (1 - v) + G[k + 1] * u * (1 - v) + G[k + NX] * (1 - u) * v + G[k + NX + 1] * u * v;
  };
}

// Outlines of the union of capsules [ax, az, bx, bz, r] (1 m raster, gaps under 8 m closed), simplified
function outlines(caps, closeR = 4, minArea = 40, tol = 0.5) {
  if (!caps.length) return [];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [ax, az, bx, bz, r] of caps) { x0 = Math.min(x0, ax - r, bx - r); x1 = Math.max(x1, ax + r, bx + r); z0 = Math.min(z0, az - r, bz - r); z1 = Math.max(z1, az + r, bz + r); }
  const R = new Raster(x0 - 10, z0 - 10, x1 + 10, z1 + 10, 1);
  for (const [ax, az, bx, bz, r] of caps) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = (-dz / L) * r, nz = (dx / L) * r, ex = (dx / L) * 0.6, ez = (dz / L) * 0.6;
    R.fillRing([[ax + nx - ex, az + nz - ez], [bx + nx + ex, bz + nz + ez], [bx - nx + ex, bz - nz + ez], [ax - nx - ex, az - nz - ez]], 1);
  }
  if (closeR) R.close(closeR);
  return makeBlocks({ land: R, roads: [], sidewalk: 1, log: () => {} }).filter((b) => b.area > minArea).map((b) => rdpRing(b.poly, tol));
}
const flatRing = (r) => r.flatMap(([x, z]) => [q(x), q(z)]);

export async function refineFreeways(body, { log = console.log } = {}) {
  const terrainHeight = await loadTerrain();
  const { GEO } = await import(new URL('melbourne-geodata.js', JS));
  const ways = body.ways.map(([name, kind, width, lanes, flat, opts]) => {
    const S = [];
    for (let i = 0; i < flat.length; i += 4) S.push({ x: flat[i], z: flat[i + 1], h: flat[i + 2], cov: flat[i + 3] });
    return { name, kind, width, lanes, S, opts };
  });

  // --- The network: every sample a node, joined along its way and where a way's end meets another way -----------------
  const nodes = [];
  for (const w of ways) w.S.forEach((s, i) => { s.id = nodes.length; s.w = w; s.i = i; nodes.push(s); });
  const adj = nodes.map(() => []);
  const link = (a, b, L) => { adj[a.id].push([b.id, L]); adj[b.id].push([a.id, L]); };
  for (const w of ways) for (let i = 1; i < w.S.length; i++) link(w.S[i - 1], w.S[i], Math.hypot(w.S[i].x - w.S[i - 1].x, w.S[i].z - w.S[i - 1].z));
  const grid = new Map(), gk = (x, z) => Math.floor(x / 16) * 65536 + Math.floor(z / 16);
  for (const s of nodes) { const k = gk(s.x, s.z); (grid.get(k) || grid.set(k, []).get(k)).push(s); }
  const near = (x, z, r) => { const o = []; for (let ix = Math.floor((x - r) / 16); ix <= Math.floor((x + r) / 16); ix++) for (let iz = Math.floor((z - r) / 16); iz <= Math.floor((z + r) / 16); iz++) for (const s of grid.get(ix * 65536 + iz) || []) if (Math.hypot(s.x - x, s.z - z) < r) o.push(s); return o; };
  for (const w of ways) {
    for (const e of [w.S[0], w.S[w.S.length - 1]]) {
      const best = new Map();
      for (const s of near(e.x, e.z, 2)) if (s.w !== w) { const d = Math.hypot(s.x - e.x, s.z - e.z); if (!best.has(s.w) || d < best.get(s.w)[1]) best.set(s.w, [s, d]); }
      for (const [s, d] of best.values()) link(e, s, d);
      e.joined = best.size > 0;
    }
  }
  // Dijkstra-style envelope over the network: best(n) = max over sources m of (v(m) - slope * dist(m, n)) (sign -1: min)
  function envelope(src, slope, sign = 1) {
    const best = new Float64Array(nodes.length).fill(NaN), heap = [];
    const push = (id, v) => { heap.push([id, v]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][1] * sign >= heap[i][1] * sign) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][1] * sign > heap[m][1] * sign) m = l; if (r < heap.length && heap[r][1] * sign > heap[m][1] * sign) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    for (const [id, v] of src) push(id, v);
    while (heap.length) {
      const [id, v] = pop();
      if (!Number.isNaN(best[id])) continue;
      best[id] = v;
      for (const [o, L] of adj[id]) if (Number.isNaN(best[o])) push(o, v - sign * slope * L);
    }
    return best;
  }

  // --- 2. The vertical profile: no grade steeper than GRADE anywhere ---------------------------------------------------
  // The raw heights jump where a viaduct's target meets a tunnel's (CityLink's Domain Tunnel portals fell 12 m in 50 m,
  // the Kings Way ramps met their streets 3.5 m down), so the tunnels led into walls. Each sample's target (its raw
  // height, see pass 3 for the streets) gives the upper and lower slope-limited envelopes over the network; the new
  // height is their mean (slope-limited too, and equal to the raw height wherever that was already within GRADE), held
  // to the ground within GRADE of each junction with a street (a free way end at grade). A tunnel that comes up nearer
  // the surface than its full height opens into a cutting, with a portal where it goes under.
  for (const s of nodes) s.target = s.h;
  const anchors = nodes.filter((s) => (s.i === 0 || s.i === s.w.S.length - 1) && !s.joined && Math.abs(s.h) < 0.3);
  const lo = envelope(nodes.map((s) => [s.id, s.target]), GRADE, 1), hi = envelope(nodes.map((s) => [s.id, s.target]), GRADE, -1);
  const da = anchors.length ? envelope(anchors.map((s) => [s.id, 0]), 1, -1) : null;
  for (const s of nodes) {
    let h = (lo[s.id] + hi[s.id]) / 2;
    if (da && !Number.isNaN(da[s.id])) h = Math.max(-GRADE * da[s.id], Math.min(GRADE * da[s.id], h));
    s.h = Math.abs(h) < 0.05 ? 0 : h;
  }
  for (const w of ways) {
    const tunnel = w.S.every((s) => s.cov);
    for (const s of w.S) s.cov = tunnel ? s.h <= -5.7 : s.cov && s.h < -2.7;
  }
  log(`profile: ${anchors.length} street junctions, ${nodes.filter((s) => Math.abs(s.h - s.target) > 0.3).length} of ${nodes.length} samples moved`);

  // --- Open cuttings (holes in the land deck), recomputed for the new profile --------------------------------------------
  const tcaps = [];
  for (const w of ways) for (let i = 0; i + 1 < w.S.length; i++) {
    const a = w.S[i], b = w.S[i + 1];
    if ((a.cov && b.cov) || Math.max(a.h, b.h) > -0.6) continue;
    tcaps.push([a.x, a.z, b.x, b.z, w.width / 2 + 1.2]);
  }
  const trenches = outlines(tcaps).map(flatRing);
  log(`open cuttings: ${trenches.length}`);

  // --- Kerb islands over a cutting (js/city-grid.js blockPatches: each block's outline minus the cuttings) ---------------
  const blockPatches = {};
  {
    const pip = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xa, za] = r[i], [xb, zb] = r[j]; if ((za > z) !== (zb > z) && x < ((xb - xa) * (z - za)) / (zb - za) + xa) ins = !ins; } return ins; };
    const rings = trenches.map((t) => { const r = []; for (let i = 0; i < t.length; i += 2) r.push([t[i], t[i + 1]]); return r; });
    const rb = rings.map((r) => [Math.min(...r.map((p) => p[0])), Math.max(...r.map((p) => p[0])), Math.min(...r.map((p) => p[1])), Math.max(...r.map((p) => p[1]))]);
    GEO.blocks.forEach(([flat, , , , isRect], id) => {
      if (isRect) return;
      const poly = []; for (let i = 0; i < flat.length; i += 2) poly.push([flat[i], flat[i + 1]]);
      const x0 = Math.min(...poly.map((p) => p[0])), x1 = Math.max(...poly.map((p) => p[0])), z0 = Math.min(...poly.map((p) => p[1])), z1 = Math.max(...poly.map((p) => p[1]));
      const hits = rings.filter((r, k) => rb[k][0] < x1 && rb[k][1] > x0 && rb[k][2] < z1 && rb[k][3] > z0);
      if (!hits.length) return;
      const R = new Raster(x0 - 4, z0 - 4, x1 + 4, z1 + 4, 1);
      R.fillRing(poly, 1);
      let before = 0; for (const v of R.d) before += v;
      for (const r of hits) R.fillRing(r, 0);
      let after = 0; for (const v of R.d) after += v;
      if (after > before - 20) return; // no real overlap
      const pieces = makeBlocks({ land: R, roads: [], sidewalk: 1, log: () => {} }).filter((b) => b.area > 25);
      blockPatches[id] = pieces.map((b) => {
        const outer = rdpRing(b.poly, 0.4);
        const holes = hits.filter((r) => r.every(([x, z]) => pip(x, z, outer)));
        return [outer, ...holes].map(flatRing);
      });
    });
    log(`blocks patched round cuttings: ${Object.keys(blockPatches).length}`);
  }

  // --- 1. Water holes --------------------------------------------------------------------------------------------------
  const caps = [];
  for (const w of ways) {
    for (let i = 0; i + 1 < w.S.length; i++) {
      const a = w.S[i], b = w.S[i + 1];
      const ta = terrainHeight(a.x, a.z), tb = terrainHeight(b.x, b.z), ya = ta + a.h, yb = tb + b.h;
      const open = !(a.cov && b.cov);
      // open: below the ground (a cutting); covered: the water plane passes through the inside (floor to ceiling)
      const ceil = Math.max(ceilingAt(ya, ta), ceilingAt(yb, tb));
      const wet = open ? Math.max(a.h, b.h) <= -0.6 || Math.min(ya, yb) < WL + 0.3 : Math.min(ya, yb) < WL + 0.3 && ceil > WL - 0.3;
      if (wet) caps.push([a.x, a.z, b.x, b.z, w.width / 2 + 1.6]);
    }
  }
  const waterHoles = outlines(caps).map(flatRing);
  log(`water holes: ${waterHoles.length} outlines, ${waterHoles.reduce((a, r) => a + r.length / 2, 0)} points`);

  const out = ways.map((w) => {
    const t = [w.name, w.kind, w.width, w.lanes, w.S.flatMap((s) => [q(s.x), q(s.z), q(s.h), s.cov ? 1 : 0])];
    if (w.opts) t.push(w.opts);
    return t;
  });
  return { ...body, ways: out, trenches, blockPatches, waterHoles, refined: 1 };
}

export function writeFreeways(OUT, body) {
  fs.writeFileSync(OUT, `// js/melbourne-freeways.js: GENERATED by tools/melbourne/build-freeways.mjs (then tools/melbourne/refine-freeways.mjs),
// do not edit by hand. Melbourne's freeways (CityLink, the West Gate Freeway, the Burnley and Domain Tunnels and their
// ramps) in the world frame of js/melbourne-geodata.js, each way as [name, kind (0 motorway, 1 link), width, lanes,
// [x, z, h, covered, ...], options?] with h the height above the terrain (negative in tunnels and cuttings).
// Source: OpenStreetMap (© OpenStreetMap contributors, ODbL).
export const FREEWAYS = ${JSON.stringify(body)};
`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , INARG, OUTARG] = process.argv;
  const IN = INARG || fileURLToPath(new URL('./freeways-raw.json', import.meta.url));
  const FREEWAYS = IN.endsWith('.json') ? JSON.parse(fs.readFileSync(IN, 'utf8')) : (await import(pathToFileURL(fs.realpathSync(IN)).href)).FREEWAYS;
  if (FREEWAYS.refined) { console.error('that file is already refined: give build-freeways.mjs\'s raw output'); process.exit(1); }
  const OUT = OUTARG || fileURLToPath(new URL('melbourne-freeways.js', JS));
  const body = await refineFreeways(FREEWAYS, { log: (...a) => console.log('[refine]', ...a) });
  writeFreeways(OUT, body);
  console.log('[refine] wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0), 'KB');
}
