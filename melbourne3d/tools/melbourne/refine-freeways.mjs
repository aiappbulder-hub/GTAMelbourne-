// tools/melbourne/refine-freeways.mjs: the second pass over the freeway data (js/melbourne-freeways.js), run by
// tools/melbourne/build-freeways.mjs on its output, or on its own on the raw output saved earlier:
//   node tools/melbourne/refine-freeways.mjs [raw = tools/melbourne/freeways-raw.json] [out = js/melbourne-freeways.js]
// It needs no OSM tiles, only the raw data, js/melbourne-geodata.js (streets, water, blocks) and the terrain.
//
// Passes, in order:
//  2. the vertical profile: slope-limited everywhere (tunnels come up through portals onto their roads); the open
//     cuttings and the kerb islands round them (trenches, blockPatches) are traced again for it.
//  3. headroom where a street crosses under a deck or over a cutting; 4. piers moved out of the streets' carriageways,
//     and the segments over a street listed (js/freeways.js leaves the walls and colliders down to the ground off them).
//  6. fewer layers: duplicate carriageways and stacked or hanging ramps dropped (runs first); chains rebuilt.
//  5. smooth centrelines (rounded corners, even samples) and smooth cutting outlines (no raster stair steps).
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
const CLEAR = 6.6; // a deck's height over a street it crosses (5.2 m clear under a 1.4 m deck)
const STEP = 8; // the longest gap between samples
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
// Chaikin's corner cutting of a closed ring, `n` times
function chaikin(r, n) {
  for (let it = 0; it < n; it++) {
    const o = [];
    for (let i = 0; i < r.length; i++) { const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length]; o.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]); }
    r = o;
  }
  return r;
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

  // --- 6. Fewer, cleaner layers ------------------------------------------------------------------------------------------
  // OSM maps every slip lane, so the junctions stacked up to four ramps over and beside one another. Kept: every
  // motorway carriageway (but one that runs on top of another, a duplicate), and the ramps that run clear of the others.
  // Dropped: a ramp lying over, under or along another kept way for more than a fifth of its length, then (repeatedly)
  // a ramp left with an end in the air or underground (it led to a dropped one), then ramp pieces under 100 m.
  {
    const segsOf = (w) => w.S.slice(0, -1).map((a, i) => { const b = w.S[i + 1], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1; return { a, ux: dx / L, uz: dz / L, L, hw: w.width / 2 }; });
    for (const w of ways) w.segs = segsOf(w);
    // share of w's samples on o's footprint (and the mean height gap there)
    const overlap = (w, o) => {
      let n = 0, gap = 0;
      for (const s of w.S) for (const g of o.segs) {
        const dx = s.x - g.a.x, dz = s.z - g.a.z, al = dx * g.ux + dz * g.uz;
        if (al < 0 || al > g.L) continue;
        if (Math.abs(dx * g.uz - dz * g.ux) < g.hw + w.width / 2 - 1.5) { n++; gap += Math.abs(s.h - (g.a.h)); break; }
      }
      return [n / w.S.length, n ? gap / n : 0];
    };
    const bb = (w) => { const xs = w.S.map((s) => s.x), zs = w.S.map((s) => s.z); return [Math.min(...xs) - 12, Math.max(...xs) + 12, Math.min(...zs) - 12, Math.max(...zs) + 12]; };
    for (const w of ways) w.bb = bb(w);
    const touch = (a, b) => a.bb[0] < b.bb[1] && b.bb[0] < a.bb[1] && a.bb[2] < b.bb[3] && b.bb[2] < a.bb[3];
    const len = (w) => w.segs.reduce((t, g) => t + g.L, 0);
    const keep = new Set(ways);
    // duplicate carriageways: a motorway way lying on another (longer) one at about the same height
    for (const w of [...ways].filter((w) => w.kind === 0).sort((a, b) => len(a) - len(b))) {
      for (const o of keep) {
        if (o === w || o.kind !== 0 || !touch(w, o) || len(o) < len(w)) continue;
        const [f, gap] = overlap(w, o);
        if (f > 0.7 && gap < 1.5) { keep.delete(w); break; }
      }
    }
    // stacked ramps
    for (const w of [...ways].filter((w) => w.kind === 1).sort((a, b) => len(a) - len(b))) {
      let f = 0;
      for (const o of keep) if (o !== w && touch(w, o)) f += overlap(w, o)[0];
      if (f > 0.2) keep.delete(w);
    }
    // ramps left hanging, and short leftovers
    const endKey = (s) => `${Math.round(s.x / 2)},${Math.round(s.z / 2)}`;
    const nearEnd = (s, w) => { for (const o of keep) if (o !== w && touch(w, o) && o.S.some((p) => Math.abs(p.x - s.x) < 2 && Math.abs(p.z - s.z) < 2)) return true; return false; };
    for (let changed = true; changed;) {
      changed = false;
      for (const w of [...keep]) {
        if (w.kind !== 1) continue;
        const hang = [w.S[0], w.S[w.S.length - 1]].some((s) => Math.abs(s.h) >= 0.3 && !nearEnd(s, w));
        if (hang) { keep.delete(w); changed = true; }
      }
    }
    // ramp pieces (ramps joined end to end) under 100 m in all
    const comp = new Map();
    for (const w of keep) if (w.kind === 1) comp.set(w, new Set([w]));
    for (const w of keep) if (w.kind === 1) for (const o of keep) if (o !== w && o.kind === 1 && touch(w, o) && [w.S[0], w.S[w.S.length - 1]].some((s) => [o.S[0], o.S[o.S.length - 1]].some((p) => endKey(p) === endKey(s)))) {
      const A = comp.get(w), B = comp.get(o); if (A === B) continue; for (const x of B) { A.add(x); comp.set(x, A); }
    }
    for (const c of new Set(comp.values())) if ([...c].reduce((t, w) => t + len(w), 0) < 100) for (const w of c) keep.delete(w);
    const before = ways.length, kept = ways.filter((w) => keep.has(w));
    log(`simplified: ${before} ways -> ${kept.length} (motorway ${ways.filter((w) => w.kind === 0).length} -> ${kept.filter((w) => w.kind === 0).length}, ramps ${ways.filter((w) => w.kind === 1).length} -> ${kept.filter((w) => w.kind === 1).length})`);
    ways.length = 0; ways.push(...kept);
    for (const w of ways) { delete w.segs; delete w.bb; }
  }

  // --- 5. Smooth centrelines: OSM's corners rounded (a few passes of neighbour averaging, the ends and any sample another
  // way's end meets held still), then resampled evenly by arc length at no more than STEP m ------------------------------
  {
    const ends = ways.flatMap((w) => [w.S[0], w.S[w.S.length - 1]]);
    for (const w of ways) {
      const S = w.S;
      if (S.length < 3) continue;
      const pin = S.map((s, i) => i === 0 || i === S.length - 1 || ends.some((e) => !w.S.includes(e) && Math.abs(e.x - s.x) < 2.5 && Math.abs(e.z - s.z) < 2.5));
      for (let it = 0; it < 8; it++) {
        const P = S.map((s) => [s.x, s.z]);
        for (let i = 1; i + 1 < S.length; i++) if (!pin[i]) { S[i].x = P[i][0] + 0.5 * ((P[i - 1][0] + P[i + 1][0]) / 2 - P[i][0]); S[i].z = P[i][1] + 0.5 * ((P[i - 1][1] + P[i + 1][1]) / 2 - P[i][1]); }
      }
      // resample: pinned samples kept, evenly spaced samples between them
      const out = [S[0]];
      let start = 0;
      for (let i = 1; i < S.length; i++) {
        if (!pin[i]) continue;
        const run = S.slice(start, i + 1), cum = [0];
        for (let k = 1; k < run.length; k++) cum.push(cum[k - 1] + Math.hypot(run[k].x - run[k - 1].x, run[k].z - run[k - 1].z));
        const L = cum[cum.length - 1], n = Math.max(1, Math.ceil(L / STEP - 0.01));
        for (let m = 1; m < n; m++) {
          const d = (L * m) / n;
          let k = 1; while (k < run.length - 1 && cum[k] < d) k++;
          const f = (d - cum[k - 1]) / (cum[k] - cum[k - 1] || 1), A = run[k - 1], B = run[k];
          out.push({ x: A.x + (B.x - A.x) * f, z: A.z + (B.z - A.z) * f, h: A.h + (B.h - A.h) * f, cov: A.cov && B.cov });
        }
        out.push(S[i]);
        start = i;
      }
      w.S = out;
    }
  }

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

  // --- Streets (js/melbourne-geodata.js roads, less the freeways' own): segments in 32 m cells ---------------------------
  const streets = [], sgrid = new Map();
  for (const [name, width, , , , f] of GEO.roads) {
    if (/CITYLINK|FREEWAY|TUNNEL|RAMP/i.test(name || '')) continue;
    for (let k = 0; k + 3 < f.length; k += 2) {
      const sg = [f[k], f[k + 1], f[k + 2], f[k + 3], Math.max(3, width / 2)];
      streets.push(sg);
      for (let ix = Math.floor((Math.min(sg[0], sg[2]) - 12) / 32); ix <= Math.floor((Math.max(sg[0], sg[2]) + 12) / 32); ix++)
        for (let iz = Math.floor((Math.min(sg[1], sg[3]) - 12) / 32); iz <= Math.floor((Math.max(sg[1], sg[3]) + 12) / 32); iz++)
          (sgrid.get(ix * 65536 + iz) || sgrid.set(ix * 65536 + iz, new Set()).get(ix * 65536 + iz)).add(sg);
    }
  }
  const streetsNear = (x, z) => sgrid.get(Math.floor(x / 32) * 65536 + Math.floor(z / 32)) || [];
  // distance from (x, z) to the nearest street's kerb (negative on its carriageway)
  const kerbDist = (x, z) => {
    let d = Infinity;
    for (const [x0, z0, x1, z1, r] of streetsNear(x, z)) {
      const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2));
      d = Math.min(d, Math.hypot(x - x0 - dx * t, z - z0 - dz * t) - r);
    }
    return d;
  };
  const cross = (a, b) => {
    for (const [cx, cz, dx2, dz2] of new Set([...streetsNear(a.x, a.z), ...streetsNear(b.x, b.z)])) {
      const r1x = b.x - a.x, r1z = b.z - a.z, r2x = dx2 - cx, r2z = dz2 - cz, den = r1x * r2z - r1z * r2x;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((cx - a.x) * r2z - (cz - a.z) * r2x) / den, u = ((cx - a.x) * r1z - (cz - a.z) * r1x) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
    }
    return false;
  };
  for (const w of ways) w.cross = w.S.slice(0, -1).map((a, i) => cross(a, w.S[i + 1]));

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
  // 3. A street crossing under a deck or over a cutting, away from the junctions, gets headroom (the deck at least
  // CLEAR up, a cutting at least 6 m down under a cut-and-cover slab), on hard slope-limited bounds
  const up = [], down = [];
  for (const w of ways) {
    if (w.S.every((s) => s.cov)) continue;
    w.cross.forEach((c, i) => {
      if (!c) return;
      for (const s of [w.S[i], w.S[i + 1]]) {
        if (da && !(da[s.id] > 60)) continue;
        if (s.h >= -0.3 && s.h < CLEAR) up.push([s.id, CLEAR]);
        else if (s.h < -0.3 && s.h > -6) down.push([s.id, -6]);
      }
    });
  }
  // (a crossing whose headroom would lift a cutting or tunnel nearby out of the ground, or sink a deck, is left as it is)
  const mean = nodes.map((s) => (lo[s.id] + hi[s.id]) / 2);
  const negs = nodes.filter((s) => mean[s.id] < -0.3).map((s) => [s.id, mean[s.id]]), poss = nodes.filter((s) => mean[s.id] > 0.3).map((s) => [s.id, mean[s.id]]);
  const belowEnv = negs.length ? envelope(negs, GRADE, -1) : null, aboveEnv = poss.length ? envelope(poss, GRADE, 1) : null;
  const upOk = up.filter(([id, v]) => !belowEnv || Number.isNaN(belowEnv[id]) || v <= belowEnv[id]);
  const downOk = down.filter(([id, v]) => !aboveEnv || Number.isNaN(aboveEnv[id]) || v >= aboveEnv[id]);
  const upB = upOk.length ? envelope(upOk, GRADE, 1) : null, downB = downOk.length ? envelope(downOk, GRADE, -1) : null;
  for (const s of nodes) {
    let h = mean[s.id];
    if (upB && !Number.isNaN(upB[s.id])) h = Math.max(h, upB[s.id]);
    if (downB && !Number.isNaN(downB[s.id])) h = Math.min(h, downB[s.id]);
    if (da && !Number.isNaN(da[s.id])) h = Math.max(-GRADE * da[s.id], Math.min(GRADE * da[s.id], h));
    s.h = Math.abs(h) < 0.05 ? 0 : h;
  }
  log(`street crossings given headroom: ${upOk.length} of ${up.length} under decks, ${downOk.length} of ${down.length} over cuttings`);
  for (const w of ways) {
    const tunnel = w.S.every((s) => s.cov);
    for (const s of w.S) s.cov = tunnel ? s.h <= -5.7 : s.cov && s.h < -2.7;
    // a street over a cutting: covered (cut and cover) where there's headroom
    if (!tunnel) w.cross.forEach((c, i) => { if (c) for (const s of [w.S[i], w.S[i + 1]]) if (s.h < -2.7) s.cov = true; });
  }
  log(`profile: ${anchors.length} street junctions, ${nodes.filter((s) => Math.abs(s.h - s.target) > 0.3).length} of ${nodes.length} samples moved`);

  // --- Open cuttings (holes in the land deck), recomputed for the new profile --------------------------------------------
  const tcaps = [];
  for (const w of ways) for (let i = 0; i + 1 < w.S.length; i++) {
    const a = w.S[i], b = w.S[i + 1];
    if ((a.cov && b.cov) || Math.max(a.h, b.h) > -0.6) continue;
    tcaps.push([a.x, a.z, b.x, b.z, w.width / 2 + 1.6]);
  }
  // (traced on the 1 m raster, then the stair steps simplified away and the corners rounded: the walls stand 0.9 m in)
  const trenches = outlines(tcaps, 4, 40, 1.0).map((r) => chaikin(r, 2)).map(flatRing);
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
  const waterHoles = outlines(caps, 4, 40, 1.0).map((r) => chaikin(r, 1)).map(flatRing);
  log(`water holes: ${waterHoles.length} outlines, ${waterHoles.reduce((a, r) => a + r.length / 2, 0)} points`);

  // --- 4. Piers out of the streets' carriageways; segments over a street (no walls or colliders down to it) ----------
  // options per way: piers (sample indices that get a pier, js/freeways.js), street (segment indices crossing a street)
  let moved = 0, dropped = 0;
  for (const w of ways) {
    const piers = [], hw = w.width / 2, n = hw > 7 ? 2 : 1;
    const clear = (s, i) => {
      if (s.h <= 3.2 || s.cov) return false;
      const a = w.S[Math.max(0, i - 1)], b = w.S[Math.min(w.S.length - 1, i + 1)], L = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
      for (let k = 0; k < n; k++) { const off = n === 1 ? 0 : (k ? 1 : -1) * hw * 0.5; if (kerbDist(s.x + nx * off, s.z + nz * off) < 1.5) return false; }
      return true;
    };
    for (let i = 0; i < w.S.length; i += 4) {
      if (w.S[i].h <= 3.2) continue;
      const j = [0, 1, -1, 2, -2].map((d) => i + d).find((j) => j >= 0 && j < w.S.length && clear(w.S[j], j));
      if (j === undefined) { dropped++; continue; }
      if (j !== i) moved++;
      if (!piers.includes(j)) piers.push(j);
    }
    const street = w.cross.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    w.opts = { ...(w.opts || {}), piers, ...(street.length ? { street } : {}) };
  }
  log(`piers: ${moved} moved off a street, ${dropped} dropped`);

  const out = ways.map((w) => [w.name, w.kind, w.width, w.lanes, w.S.flatMap((s) => [q(s.x), q(s.z), q(s.h), s.cov ? 1 : 0]), w.opts]);
  // --- Chains for the traffic, for the kept ways: a motorway way continues into the one that starts where it ends ------
  const chains = [];
  {
    const k = (s) => `${Math.round(s.x)},${Math.round(s.z)}`;
    const startsAt = new Map();
    ways.forEach((w, i) => { if (w.kind === 0) (startsAt.get(k(w.S[0])) || startsAt.set(k(w.S[0]), []).get(k(w.S[0]))).push(i); });
    const hasPred = new Set();
    ways.forEach((w) => { if (w.kind === 0) for (const j of startsAt.get(k(w.S[w.S.length - 1])) || []) hasPred.add(j); });
    const order = ways.map((w, i) => i).filter((i) => ways[i].kind === 0).sort((a, b) => ways[b].S.length - ways[a].S.length);
    const used = new Set();
    for (const i0 of [...order.filter((i) => !hasPred.has(i)), ...order]) {
      if (used.has(i0)) continue;
      const chain = [i0]; used.add(i0);
      for (let cur = i0; ;) {
        const next = (startsAt.get(k(ways[cur].S[ways[cur].S.length - 1])) || []).filter((j) => !used.has(j));
        if (!next.length) break;
        const j = next.find((n) => ways[n].name === ways[cur].name) ?? next[0];
        chain.push(j); used.add(j); cur = j;
      }
      if (chain.reduce((a, i) => a + ways[i].S.length * STEP, 0) >= 400) chains.push(chain);
    }
    log(`traffic chains: ${chains.length}`);
  }

  return { ...body, ways: out, chains, trenches, blockPatches, waterHoles, refined: 1 };
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
