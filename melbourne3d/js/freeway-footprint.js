// Where the freeways' open decks and cuttings are in plan (js/melbourne-freeways.js), for the modules that place things
// at load so nothing pokes through a deck or stands in a cutting: the surveyed buildings (js/city-buildings.js), the
// mapped trees (js/city-trees.js) and the street lamps and signal masts (js/street-details.js).
//
// freewayClearance(x, z, pad) is the lowest clearance (m above the ground) of any open deck within `pad` m of (x, z) in
// plan: the deck's underside over a viaduct or embankment, 0 in a cutting or a carriageway at grade, Infinity where there
// is no open freeway (the tunnels are underground and don't count).
// polygonFreewayClearance(ring, pad) is the same for a polygon ([{x, z}]): its edges (sampled every 3 m) and any deck
// sample inside it.
import { FREEWAYS } from './melbourne-freeways.js';

const INDEX = 32;
const DECK_T = 1.4; // a deck's depth (js/freeways.js)
const segs = [];
const index = new Map();
const key = (ix, iz) => ix * 65536 + iz;
for (const [, , width, , flat] of FREEWAYS.ways) {
  const hw = width / 2;
  for (let i = 0; i + 4 < flat.length; i += 4) {
    if (flat[i + 3] === 1 && flat[i + 7] === 1) continue; // a tunnel
    const ax = flat[i], az = flat[i + 1], bx = flat[i + 4], bz = flat[i + 5];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 0.01) continue;
    const ha = flat[i + 2], hb = flat[i + 6];
    // clearance under the deck: its underside above a raised deck, nothing at grade or in a cutting
    const clr = (h) => (h > 0.3 ? Math.max(0, h - DECK_T) : 0);
    const s = { ax, az, ux: dx / L, uz: dz / L, L, hw, ca: clr(ha), cb: clr(hb) };
    segs.push(s);
    const r = hw + 12;
    for (let ix = Math.floor((Math.min(ax, bx) - r) / INDEX); ix <= Math.floor((Math.max(ax, bx) + r) / INDEX); ix++)
      for (let iz = Math.floor((Math.min(az, bz) - r) / INDEX); iz <= Math.floor((Math.max(az, bz) + r) / INDEX); iz++) {
        const k = key(ix, iz);
        (index.get(k) || index.set(k, []).get(k)).push(s);
      }
  }
}

/** Lowest clearance under an open freeway deck within `pad` m (<= 10) of (x, z); Infinity with none */
export function freewayClearance(x, z, pad = 0) {
  const list = index.get(key(Math.floor(x / INDEX), Math.floor(z / INDEX)));
  if (!list) return Infinity;
  let best = Infinity;
  for (const s of list) {
    const dx = x - s.ax, dz = z - s.az;
    const along = dx * s.ux + dz * s.uz;
    if (along < -pad - 1 || along > s.L + pad + 1) continue;
    if (Math.abs(dx * s.uz - dz * s.ux) > s.hw + 0.5 + pad) continue;
    const f = Math.max(0, Math.min(1, along / s.L));
    best = Math.min(best, s.ca + (s.cb - s.ca) * f);
  }
  return best;
}

/** Lowest clearance under an open freeway deck over or within `pad` m of a polygon ring; Infinity with none */
export function polygonFreewayClearance(ring, pad = 0) {
  let best = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x); minZ = Math.min(minZ, a.z); maxZ = Math.max(maxZ, a.z);
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3));
    for (let k = 0; k < n; k++) best = Math.min(best, freewayClearance(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n, pad));
  }
  // a deck crossing the polygon's inside, clear of its edges: its centre lines (every 3 m) inside the ring
  const seen = new Set();
  for (let ix = Math.floor(minX / INDEX); ix <= Math.floor(maxX / INDEX); ix++)
    for (let iz = Math.floor(minZ / INDEX); iz <= Math.floor(maxZ / INDEX); iz++)
      for (const s of index.get(key(ix, iz)) || []) {
        if (seen.has(s)) continue;
        seen.add(s);
        for (let t = 0; t <= s.L; t += 3) {
          const x = s.ax + s.ux * t, z = s.az + s.uz * t;
          if (x < minX || x > maxX || z < minZ || z > maxZ || !inside(ring, x, z)) continue;
          best = Math.min(best, s.ca + (s.cb - s.ca) * (t / s.L));
        }
      }
  return best;
}

function inside(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
}
