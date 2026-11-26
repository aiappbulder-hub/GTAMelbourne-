// Melbourne's freeways: CityLink, the West Gate Freeway and their ramps on viaducts, embankments and in open cuttings,
// and the Burnley and Domain Tunnels, from js/melbourne-freeways.js (tools/melbourne/build-freeways.mjs, OSM).
//
// Built once at load, cheaply:
//  - Everything is merged per 500 m cell into at most two meshes (one lit material with vertex colours and a dry asphalt
//    grain for the decks, lane paint, barriers, pillars, poles and cutting walls, js/tsl-materials.js
//    createFreewayMaterial; one unlit for the tunnels' inside and the lamp heads), so a cell costs at most two draws.
//    Cells beyond the tier's view distance (Q.viewDist) are hidden, checked four times a second against the camera.
//  - Tunnel walls are unlit with their lighting baked into the vertex colours (bright under each ceiling light), so the
//    sun doesn't light the inside and no light sources are added.
//
// Driving: groundHeight(x, z, mode, y) is the surface under (x, z) for something at height y. It is layered: a deck
// counts only for something up on it (so traffic and people under a viaduct stay on the street), a tunnel's floor only
// for something already inside it, and an open cutting for anything over it (the cutting's walls are solid at ground
// level, so it is entered only along the ramp). Without a y (AI traffic, pedestrians, spawns) it returns null. The
// barriers, pillars, cutting walls and tunnel walls are colliders with a height range (js/controllers.js buildingContact),
// so a car on the deck meets the barrier and a car under it passes the deck's edge. lanes are centre lines for the
// ambient highway traffic (js/traffic.js createHighwayTraffic).
//
// Usage (js/main.js):
//   const freeways = createFreeways({ scene });
//   allColliders.push(...freeways.colliders);
//   controllerManager.extraGround.unshift(freeways.groundHeight);
//   ...each frame: freeways.update(camera.position);
import * as THREE from 'three/webgpu';
import { FREEWAYS } from './freeway-data.js';
import { terrainHeight } from './terrain.js';
import { Q } from './quality.js';
import { buildCityRoadWay } from './city-road-bridge.js';
import { createFreewayMaterial } from './tsl-materials.js';

const CELL = 500;
const INDEX = 32; // ground-query grid
const TUNNEL_H = 5.4; // floor to ceiling
const DECK_T = 1.4; // a viaduct deck's depth
const BARRIER_H = 1.0;
const HIGH_EDGE = 4; // a deck higher than this keeps solid barriers (falling off); lower ones are drive-through
const PILLAR_EVERY = 4; // samples (about 32 m)
const LAMP_EVERY = 6; // samples (about 48 m)
const TUNNEL_SEEN = 260;

const C = {
  asphalt: [0.25, 0.255, 0.265], paint: [0.9, 0.885, 0.84], concrete: [0.62, 0.61, 0.58], concreteDark: [0.42, 0.41, 0.39],
  pole: [0.45, 0.47, 0.5], lamp: [1.0, 0.86, 0.6], tunnelFloor: [0.13, 0.13, 0.14], tunnelWall: [0.78, 0.78, 0.72],
  tunnelCeil: [0.16, 0.17, 0.18], tunnelLight: [1.0, 0.97, 0.88], tunnelPaint: [0.6, 0.6, 0.56], portal: [0.55, 0.53, 0.5]
};

class Buf {
  constructor() { this.p = []; this.c = []; }
  // (the world frame is x east, z south, y up: seen from the front, a quad's corners listed a-b-c-d run clockwise in x-z
  // terms, so the triangles are stored a-c-b to face the right way)
  tri(a, b, c, col) { this.p.push(...a, ...c, ...b); for (let i = 0; i < 3; i++) this.c.push(col[0], col[1], col[2]); }
  // a quad a-b-c-d (counter-clockwise seen from the front)
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  // both faces
  quad2(a, b, c, d, col) { this.quad(a, b, c, d, col); this.quad(a, d, c, b, col); }
  // an axis-free box from a centre, half sizes and a heading (ux, uz)
  box(cx, y0, cz, ux, uz, hl, hw, y1, col) {
    const nx = -uz, nz = ux;
    const P = (s, o, y) => [cx + ux * s + nx * o, y, cz + uz * s + nz * o];
    const a = P(-hl, -hw, y0), b = P(hl, -hw, y0), c = P(hl, hw, y0), d = P(-hl, hw, y0);
    const e = P(-hl, -hw, y1), f = P(hl, -hw, y1), g = P(hl, hw, y1), h = P(-hl, hw, y1);
    this.quad(e, h, g, f, col); this.quad(a, b, f, e, col); this.quad(b, c, g, f, col); this.quad(c, d, h, g, col); this.quad(d, a, e, h, col);
  }
  geometry(lit) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (lit) g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

export function createFreeways({ scene }) {
  const group = new THREE.Group();
  group.name = 'Freeways';
  // (one dry asphalt material, js/tsl-materials.js, for the decks' own tops with their lane paint: no second road layer
  // over them to pop in and out or fight them for depth, and no puddles)
  const litMat = createFreewayMaterial();
  const glowMat = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
  litMat.name = 'FreewayLit'; glowMat.name = 'FreewayGlow';
  const cells = new Map();
  const cellOf = (x, z) => {
    const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    let c = cells.get(k);
    if (!c) cells.set(k, (c = { lit: new Buf(), glow: new Buf(), x: (Math.floor(x / CELL) + 0.5) * CELL, z: (Math.floor(z / CELL) + 0.5) * CELL }));
    return c;
  };

  // --- Ways: samples in the world ----------------------------------------------------------------------------------
  // City Road's underpass beneath St Kilda Road (js/city-road-bridge.js) is one more way after the data's, so the chains'
  // indices stay valid; its cutting's water and land-deck holes are cut in js/city-grid.js. `opts.piers` names the
  // samples that get a pier pair (every way's, from the refine pass, which keeps them out of the streets),
  // `opts.street` the segments a street crosses under, `opts.tube` a lower tunnel height than TUNNEL_H; any way's barriers are left off where its deck is within 0.7 m
  // of the ground (ramps meeting their streets)
  const cityRoad = buildCityRoadWay(terrainHeight);
  const wayEnds = FREEWAYS.ways.flatMap(([, , , , f]) => [[f[0], f[1]], [f[f.length - 4], f[f.length - 3]]]);
  const ways = [...FREEWAYS.ways, cityRoad.way].map(([name, kind, width, lanes, flat, opts], wi) => {
    let S = [];
    for (let i = 0; i < flat.length; i += 4) {
      const x = flat[i], z = flat[i + 1], h = flat[i + 2], t = terrainHeight(x, z);
      S.push({ x, z, h, t, y: t + h + (Math.abs(h) < 0.05 ? 0.03 : 0), cov: flat[i + 3] === 1, tube: opts && opts.tube, oi: i / 4, f: 0 });
    }
    if (wi < FREEWAYS.ways.length) ({ S, opts } = smoothWay(S, opts));
    // An at-grade or low stretch is a straight line between samples up to 8 m apart, and the ground between them can
    // bulge over it (the road vanishing under the land deck in patches): each sample is lifted by what the ground between
    // it and its neighbours stands over the road, plus 2 cm (up to 0.7 m, at a cutting's shallow mouth)
    if (wi < FREEWAYS.ways.length) {
      const lift = S.map(() => 0), o = width / 2 - 0.5;
      for (let i = 0; i + 1 < S.length; i++) {
        const a = S[i], b = S[i + 1];
        if ((a.cov || b.cov) || Math.max(a.h, b.h) > 0.3 || Math.max(a.h, b.h) <= -0.6) continue; // (a deep cutting has its hole)
        const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
        let over = 0;
        for (const t of [0.2, 0.4, 0.6, 0.8]) for (const k of [-1, 0, 1]) {
          const x = a.x + (b.x - a.x) * t + nx * o * k, z = a.z + (b.z - a.z) * t + nz * o * k;
          over = Math.max(over, terrainHeight(x, z) + 0.02 - (a.y + (b.y - a.y) * t));
        }
        if (over > 0) { lift[i] = Math.max(lift[i], Math.min(0.7, over)); lift[i + 1] = Math.max(lift[i + 1], Math.min(0.7, over)); }
      }
      S.forEach((s, i) => { if (lift[i] > 0) { s.y += lift[i]; s.h = s.y - s.t; } });
    }
    // headings (averaged at the joints) and normals (left of travel)
    for (let i = 0; i < S.length; i++) {
      const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
      if (i === 0 || i === S.length - 1) S[i].end = i ? 1 : -1;
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
      S[i].ux = dx / L; S[i].uz = dz / L; S[i].nx = -dz / L; S[i].nz = dx / L;
    }
    return { name, kind, width, hw: width / 2, lanes, S, wi, opts: opts || null };
  });

  // A data way made smoother (the samples are up to 8 m apart): a viaduct's deck rides a smoothed line instead of following
  // every bump of the ground under it, and the open road gets extra samples along a curve (a Catmull-Rom spline through
  // the samples, one more for each 2 degrees of turn), so the decks, barriers and paint bend round instead of kinking.
  // Each sample keeps its original index `oi` and its place `f` (0..1) along the original segment, for the lamps and the
  // lane dashes; `opts.piers` and `opts.street` (original indices) are mapped onto the new ones.
  function smoothWay(S0, opts) {
    const raised = (s) => !s.cov && s.h > 0.3;
    const street = new Set(opts && opts.street || []);
    // (held too: a sample another way's end meets, so the two still meet at one height)
    const meets = (s) => wayEnds.some(([x, z]) => Math.abs(x - s.x) < 2.5 && Math.abs(z - s.z) < 2.5);
    for (const s of S0) s.meets = meets(s);
    for (let it = 0; it < 6; it++) {
      const Y = S0.map((s) => s.y);
      for (let i = 1; i + 1 < S0.length; i++) {
        // (held: the ends, the ramps' feet, and the decks over a street, which keep their headroom)
        if (!raised(S0[i - 1]) || !raised(S0[i]) || !raised(S0[i + 1]) || street.has(i) || street.has(i - 1) || S0[i].meets) continue;
        S0[i].y = (Y[i - 1] + 2 * Y[i] + Y[i + 1]) / 4;
      }
    }
    for (const s of S0) if (raised(s)) { s.y = Math.max(s.y, s.t + 0.35); s.h = s.y - s.t; }
    const turn = (i) => {
      if (i <= 0 || i >= S0.length - 1) return 0;
      const a = S0[i - 1], b = S0[i], c = S0[i + 1];
      let d = Math.abs(Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z));
      return d > Math.PI ? 2 * Math.PI - d : d;
    };
    const out = [], map = [];
    for (let i = 0; i < S0.length; i++) {
      map.push(out.length);
      out.push(S0[i]);
      if (i + 1 >= S0.length) break;
      const a = S0[i], b = S0[i + 1];
      if (a.cov || b.cov) continue;
      const n = Math.min(4, Math.floor(Math.max(turn(i), turn(i + 1)) / 0.035) + 1);
      if (n < 2) continue;
      const p0 = S0[Math.max(0, i - 1)], p3 = S0[Math.min(S0.length - 1, i + 2)];
      for (let k = 1; k < n; k++) {
        const f = k / n;
        const cr = (v0, v1, v2, v3) => 0.5 * (2 * v1 + (v2 - v0) * f + (2 * v0 - 5 * v1 + 4 * v2 - v3) * f * f + (3 * v1 - v0 - 3 * v2 + v3) * f * f * f);
        const x = cr(p0.x, a.x, b.x, p3.x), z = cr(p0.z, a.z, b.z, p3.z), t = terrainHeight(x, z);
        let h, y;
        if (raised(a) && raised(b)) { y = cr(p0.y, a.y, b.y, p3.y); h = Math.max(0.35, y - t); y = t + h; }
        else { h = a.h + (b.h - a.h) * f; y = t + h + (Math.abs(h) < 0.05 ? 0.03 : 0); }
        out.push({ x, z, h, t, y, cov: false, tube: a.tube, oi: i, f });
      }
    }
    if (!opts) return { S: out, opts };
    const o = { ...opts };
    if (opts.piers) o.piers = opts.piers.map((i) => map[i]).filter((i) => i !== undefined);
    if (opts.street) o.street = opts.street.flatMap((i) => { const r = []; for (let k = map[i]; k < (map[i + 1] ?? map[i] + 1); k++) r.push(k); return r; });
    return { S: out, opts: o };
  }

  // A way's end that continues straight into another way's start (or end): both ends take the heading through the
  // neighbouring samples either side of the join, so the decks and barriers meet without a kink
  {
    const ends = new Map(), ek = (s) => `${Math.round(s.x)},${Math.round(s.z)}`;
    for (const w of ways) for (const s of [w.S[0], w.S[w.S.length - 1]]) (ends.get(ek(s)) || ends.set(ek(s), []).get(ek(s))).push([w, s]);
    for (const list of ends.values()) {
      if (list.length !== 2 || list[0][0] === list[1][0]) continue;
      const [[wa, sa], [wb, sb]] = list;
      if (wa.S.length < 2 || wb.S.length < 2 || Math.hypot(sa.x - sb.x, sa.z - sb.z) > 0.5) continue;
      // the sample before the join on a's side and after it on b's (a ends where b starts, or the reverse, or head to head)
      const before = sa.end > 0 ? wa.S[wa.S.length - 2] : wa.S[1], after = sb.end < 0 ? wb.S[1] : wb.S[wb.S.length - 2];
      const dx = after.x - before.x, dz = after.z - before.z, L = Math.hypot(dx, dz) || 1;
      const ux0 = (sa.end > 0 ? 1 : -1) * dx / L, uz0 = (sa.end > 0 ? 1 : -1) * dz / L;
      if (ux0 * sa.ux + uz0 * sa.uz < 0.8) continue; // not a straight continuation (a merge at an angle)
      const sgn = (sb.end < 0) === (sa.end > 0) ? 1 : -1;
      sa.ux = ux0; sa.uz = uz0; sa.nx = -uz0; sa.nz = ux0; sa.straight = sb.straight = true;
      sb.ux = ux0 * sgn; sb.uz = uz0 * sgn; sb.nx = -sb.uz; sb.nz = sb.ux;
    }
  }

  // --- Ground index: every segment in the 32 m cells it touches ------------------------------------------------------
  const segs = [];
  const index = new Map();
  const key = (ix, iz) => ix * 65536 + iz;
  // a way's end that meets another way (a join, a merge): the ground there is rounded (see surfaceAt), elsewhere square
  const joined = (s, wi) => ways.some((o) => o.wi !== wi && o.S.some((p) => Math.abs(p.x - s.x) < 2 && Math.abs(p.z - s.z) < 2));
  for (const w of ways) {
    const j0 = joined(w.S[0], w.wi), j1 = joined(w.S[w.S.length - 1], w.wi);
    for (let i = 0; i + 1 < w.S.length; i++) {
      const a = w.S[i], b = w.S[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
      if (L < 0.01) continue;
      const seg = { w: w.wi, ax: a.x, az: a.z, ux: dx / L, uz: dz / L, L, hw: w.hw, ya: a.y, yb: b.y, ta: a.t, tb: b.t,
        cov: a.cov && b.cov, ceilA: ceilingAt(a), ceilB: ceilingAt(b), capA: i > 0 || j0, capB: i + 2 < w.S.length || j1 };
      segs.push(seg);
      const r = w.hw + 1;
      for (let ix = Math.floor((Math.min(a.x, b.x) - r) / INDEX); ix <= Math.floor((Math.max(a.x, b.x) + r) / INDEX); ix++)
        for (let iz = Math.floor((Math.min(a.z, b.z) - r) / INDEX); iz <= Math.floor((Math.max(a.z, b.z) + r) / INDEX); iz++) {
          const k = key(ix, iz);
          (index.get(k) || index.set(k, []).get(k)).push(seg);
        }
    }
  }
  function ceilingAt(s) { return Math.max(s.y + 2.4, Math.min(s.y + (s.tube || TUNNEL_H), s.t - 0.3)); } // (`opts.tube`: a way's own floor-to-ceiling height)

  // The surface under (x, z) for something at height y (see the header); `skipWay` leaves one way out (barrier test)
  function surfaceAt(x, z, y, skipWay = -1, out = null) {
    const list = index.get(key(Math.floor(x / INDEX), Math.floor(z / INDEX)));
    if (!list) return null;
    // (two picks: among the segments the point lies along, and among the caps past segment ends; a cap counts only where
    // no segment does, and carries its segment's slope on rather than holding its end's height: held flat, the next
    // segment's start cap lifted the road a step ahead of every sample on a ramp, and the car jolted up each one)
    let best = null, bestSeg = null, cap = null, capSeg = null;
    const better = (cur, surf) => cur === null || (surf <= y + 1.0 && (surf > cur || cur > y + 1.0)) || (cur > y + 1.0 && surf < cur);
    for (const s of list) {
      if (s.w === skipWay) continue;
      const dx = x - s.ax, dz = z - s.az;
      const along = dx * s.ux + dz * s.uz;
      const off = dx * s.uz - dz * s.ux;
      if (Math.abs(off) > s.hw + 0.25) continue;
      // past a segment's end: square at a way's free end, rounded at a joint (the outside of a bend, a join with another
      // way), so the deck has no wedge-shaped gaps where a car could drop through (to the street or the river below)
      if (along < -0.5 && !(s.capA && along * along + off * off < (s.hw + 0.25) ** 2)) continue;
      if (along > s.L + 0.5 && !(s.capB && (along - s.L) ** 2 + off * off < (s.hw + 0.25) ** 2)) continue;
      const onSeg = along >= -0.5 && along <= s.L + 0.5;
      const f = Math.max(0, Math.min(1, along / s.L));
      const surf = s.ya + ((s.yb - s.ya) * along) / s.L;
      if (s.cov) {
        const ceil = s.ceilA + (s.ceilB - s.ceilA) * f;
        if (!(y < ceil - 0.8)) continue; // on the ground above the tunnel
      } else {
        const ground = s.ta + (s.tb - s.ta) * f;
        // a raised deck counts for something up near it; a cutting (below the ground) for anything over it
        if (surf > ground + 0.05 && y < surf - 1.6) continue;
      }
      // of several (stacked decks, a ramp beside its road): the highest not far above
      if (onSeg) { if (better(best, surf)) { best = surf; bestSeg = s; } }
      else if (better(cap, surf)) { cap = surf; capSeg = s; }
    }
    if (best === null) { best = cap; bestSeg = capSeg; }
    if (out) out.seg = bestSeg;
    return best;
  }
  function groundHeight(x, z, mode, y) {
    if (y === undefined || y === null) return null;
    return surfaceAt(x, z, y);
  }

  // --- Geometry ----------------------------------------------------------------------------------------------------------
  const colliders = [];
  const obb = (ax, az, bx, bz, thick, minY, maxY) => {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, hx = L / 2 + 0.1, hz = thick / 2;
    const ex = Math.abs(ux) * hx + Math.abs(uz) * hz, ez = Math.abs(uz) * hx + Math.abs(ux) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, minY, maxY, obb: { cx, cz, hx, hz, cs: ux, sn: -uz }, freeway: true });
  };
  const lerp = (a, b, f) => a + (b - a) * f;
  let triangles = 0;
  // another way's open deck or carriageway at (x, z) with its top between y0 and y1 (a lamp pole or pier of one way
  // must not stand through the deck of a way beside, over or under it: merges, diverges and the interchanges' crossings)
  const deckBetween = (x, z, y0, y1, wi, pad = 0.6) => {
    for (const s of index.get(key(Math.floor(x / INDEX), Math.floor(z / INDEX))) || []) {
      if (s.w === wi || s.cov) continue;
      const dx = x - s.ax, dz = z - s.az, along = dx * s.ux + dz * s.uz;
      if (along < -pad || along > s.L + pad || Math.abs(dx * s.uz - dz * s.ux) > s.hw + pad) continue;
      const y = s.ya + (s.yb - s.ya) * Math.max(0, Math.min(1, along / s.L));
      if (y > y0 && y - DECK_T < y1) return true;
    }
    return false;
  };

  for (const w of ways) {
    const S = w.S, hw = w.hw;
    const E = (s, o, dy = 0) => [s.x + s.nx * o, s.y + dy, s.z + s.nz * o];
    // is the point at offset o of sample s on another way's deck, floor or cutting (a merge or a split)
    const onOther = (s, o) => surfaceAt(s.x + s.nx * o, s.z + s.nz * o, s.y, w.wi) !== null;
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: (a.y + b.y) / 2, nx: (a.nx + b.nx) / 2, nz: (a.nz + b.nz) / 2 });
    // another way's road anywhere along segment i at offset o (a barrier, a cutting's or a tunnel's wall there would stand
    // across that way's lanes: at a split or a merge, the walls between the two ways are left out so neither is blocked)
    const otherAlong = (i, o) => onOther(S[i], o) || onOther(mid(S[i], S[i + 1]), o) || onOther(S[i + 1], o);
    const n = S.length - 1, segLen = (i) => Math.hypot(S[i + 1].x - S[i].x, S[i + 1].z - S[i].z);
    // Which segments have a barrier on each side: where the deck stands 0.7 m or more over the ground, out of a cutting
    // and a tunnel, and its edge nowhere along the segment on another way's deck (a merge, a diverge, a join at an angle);
    // then gaps under 12 m between two runs are filled (where nothing else is in the way) and runs under 24 m that don't
    // reach the way's end dropped, so a barrier is a tidy continuous run or nothing, never a stray stub
    const fence = [-1, 1].map((side) => {
      const other = [], want = [], open = [];
      for (let i = 0; i < n; i++) {
        const a = S[i], b = S[i + 1], covered = a.cov && b.cov, cut = !covered && Math.min(a.h, b.h) < -0.6;
        // (tested just inside the edge, so a carriageway beside this one keeps both barriers, and at the wall's own line)
        other.push(otherAlong(i, side * (hw - 0.6)) || otherAlong(i, side * (covered ? hw + 0.6 : cut ? hw + 0.7 : hw + 0.2)));
        open.push(!(a.cov && b.cov) && Math.min(a.h, b.h) >= -0.6 && !other[i]);
        want.push(open[i] && Math.max(a.h, b.h) >= 0.7);
      }
      for (let i = 0; i < n;) {
        let j = i, len = 0;
        while (j < n && !want[j]) len += segLen(j++);
        if (i > 0 && j < n && len < 12 && open.slice(i, j).every(Boolean)) for (let k = i; k < j; k++) want[k] = true;
        i = Math.max(j, i + 1);
      }
      for (let i = 0; i < n;) {
        let j = i, len = 0;
        while (j < n && want[j]) len += segLen(j++);
        if (j > i && len < 24 && i > 0 && j < n) for (let k = i; k < j; k++) want[k] = false;
        i = Math.max(j, i + 1);
      }
      return { other, want };
    });
    // A point of this way's road that lies on a way ranked above it (a motorway over its ramp, then the earlier way): the
    // road there sits 4 cm under that way's, so where a ramp's end overlaps the carriageway it joins there is one surface
    // (no step, no overlapping slab fighting it for depth) and no paint of the ramp's across the carriageway's lanes
    const out = {};
    const ranked = (o) => ways[o].kind < w.kind || (ways[o].kind === w.kind && o < w.wi);
    const roadY = (s, o) => {
      const y2 = surfaceAt(s.x + s.nx * o, s.z + s.nz * o, s.y, w.wi, out);
      return y2 !== null && out.seg && ranked(out.seg.w) && Math.abs(y2 - s.y) < 0.8 ? y2 - 0.04 : null;
    };
    const RE = (s, o) => { const y = roadY(s, o); return y === null ? E(s, o) : [s.x + s.nx * o, y, s.z + s.nz * o]; };
    for (let i = 0; i + 1 < S.length; i++) {
      const a = S[i], b = S[i + 1];
      const cell = cellOf((a.x + b.x) / 2, (a.z + b.z) / 2);
      const L = cell.lit, G = cell.glow;
      const covered = a.cov && b.cov;
      const raised = Math.min(a.h, b.h) > 0.3;
      const cut = !covered && Math.min(a.h, b.h) < -0.6;
      const roadCol = covered ? C.tunnelFloor : C.asphalt;
      const paint = covered ? C.tunnelPaint : C.paint;
      const R = covered ? G : L;
      // a street crosses under this segment (tools/melbourne/refine-freeways.mjs): no walls or colliders down to it
      const overStreet = !!(w.opts && w.opts.street && w.opts.street.includes(i));
      // roadway
      // (a cutting's floor runs on to its retaining walls, 0.7 m beyond the kerb, so nothing below shows between)
      const rw = cut ? hw + 0.7 : hw;
      R.quad(RE(a, -rw), RE(b, -rw), RE(b, rw), RE(a, rw), roadCol);
      const underOther = !covered && roadY(a, 0) !== null && roadY(b, 0) !== null;
      // lane paint: edge lines, dashed lines between lanes (3 m dash in each 9 m)
      const line = (o, w0, f0 = 0, f1 = 1) => {
        const p = (s, t, oo) => { const x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t), y = lerp(a.y, b.y, t); return [x + s.nx * oo, y + 0.025, z + s.nz * oo]; };
        R.quad(p(a, f0, o - w0), p(b, f1, o - w0), p(b, f1, o + w0), p(a, f0, o + w0), paint);
      };
      if (!underOther) { line(hw - 0.7, 0.08); line(-hw + 0.7, 0.08); }
      const nl = Math.max(1, Math.min(5, Math.round(w.lanes)));
      // (the dash is on the first 40% of each original segment: this piece's share of it, if any)
      const fa = a.f, fb = b.oi === a.oi ? b.f : 1, d1 = Math.min(0.4, fb);
      if (nl > 1 && d1 > fa && !underOther) for (let k = 1; k < nl; k++) line(-hw + 0.7 + ((2 * hw - 1.4) * k) / nl, 0.07, 0, (d1 - fa) / (fb - fa));

      if (covered) {
        // the tube: walls, ceiling and a strip light; brightness baked (lights over every other sample)
        const ca = ceilingAt(a), cb = ceilingAt(b);
        const lit = a.oi % 2 === 0 ? 1 : 0.82;
        const wc = C.tunnelWall.map((v) => v * lit);
        const W = (s, o, y) => [s.x + s.nx * o, y, s.z + s.nz * o];
        const o = hw + 0.6;
        // (each wall left out where another way's road runs through it: a split or a merge inside the tunnel, see `fence`)
        const wallR = !fence[0].other[i], wallL = !fence[1].other[i];
        if (wallR) G.quad(W(a, -o, a.y - 0.1), W(a, -o, ca), W(b, -o, cb), W(b, -o, b.y - 0.1), wc); // right wall, facing in
        if (wallL) G.quad(W(a, o, a.y - 0.1), W(b, o, b.y - 0.1), W(b, o, cb), W(a, o, ca), wc); // left wall
        // a dark tiled band along the bottom of each wall
        if (wallR) G.quad(W(a, -o + 0.01, a.y - 0.1), W(a, -o + 0.01, a.y + 0.9), W(b, -o + 0.01, b.y + 0.9), W(b, -o + 0.01, b.y - 0.1), C.concreteDark);
        if (wallL) G.quad(W(a, o - 0.01, a.y - 0.1), W(b, o - 0.01, b.y - 0.1), W(b, o - 0.01, b.y + 0.9), W(a, o - 0.01, a.y + 0.9), C.concreteDark);
        G.quad(W(a, -o, ca), W(a, o, ca), W(b, o, cb), W(b, -o, cb), C.tunnelCeil);
        G.quad(W(a, -0.35, ca - 0.04), W(a, 0.35, ca - 0.04), W(b, 0.35, cb - 0.04), W(b, -0.35, cb - 0.04), C.tunnelLight);
        // the roof slab and walls seen from outside (only where it shows: in a cutting's end, from above it's buried)
        L.quad(W(a, -o - 0.4, ca + 0.3), W(b, -o - 0.4, cb + 0.3), W(b, o + 0.4, cb + 0.3), W(a, o + 0.4, ca + 0.3), C.concreteDark);
        if (wallR) obb(...[a.x - a.nx * o, a.z - a.nz * o, b.x - b.nx * o, b.z - b.nz * o], 0.6, Math.min(a.y, b.y) - 1, Math.max(ca, cb));
        if (wallL) obb(...[a.x + a.nx * o, a.z + a.nz * o, b.x + b.nx * o, b.z + b.nz * o], 0.6, Math.min(a.y, b.y) - 1, Math.max(ca, cb));
        // portals: where the tube opens into a cutting, a headwall from the roof up to the ground
        for (const [s, n, sign] of [[a, i > 0 ? S[i - 1] : null, -1], [b, S[i + 2] || null, 1]]) {
          if (!n || n.cov) continue;
          const top = Math.max(s.t + 1.2, ceilingAt(s) + 1.2), ce = ceilingAt(s), oo = o + 2.5;
          const P = (off, y) => [s.x + s.nx * off, y, s.z + s.nz * off];
          const face = sign > 0 ? (p, q, r, t) => L.quad2(p, q, r, t, C.portal) : (p, q, r, t) => L.quad2(p, q, r, t, C.portal);
          face(P(-oo, ce), P(oo, ce), P(oo, top), P(-oo, top));
          // solid above the opening: something on the ground over the tunnel can't drive off the headwall into the cutting
          obb(s.x - s.nx * oo, s.z - s.nz * oo, s.x + s.nx * oo, s.z + s.nz * oo, 1.0, ce + 0.2, top + 2);
          face(P(-oo, s.y - 0.5), P(-o, s.y - 0.5), P(-o, ce), P(-oo, ce));
          face(P(o, s.y - 0.5), P(oo, s.y - 0.5), P(oo, ce), P(o, ce));
          // a dark lintel band and the name plate's strip
          const P2 = (off, y) => [s.x + s.nx * off + s.ux * sign * 0.05, y, s.z + s.nz * off + s.uz * sign * 0.05];
          L.quad2(P2(-o, ce), P2(o, ce), P2(o, ce + 0.6), P2(-o, ce + 0.6), C.concreteDark);
          G.quad2(P2(-3, ce + 1.0), P2(3, ce + 1.0), P2(3, ce + 1.5), P2(-3, ce + 1.5), [0.1, 0.35, 0.2]);
        }
        continue;
      }

      // barriers on both sides (left out where the edge lies on another way's deck: a merge or a diverge)
      for (const side of [-1, 1]) {
        const o = side * (hw + 0.2), F = fence[side > 0 ? 1 : 0];
        if (F.other[i]) continue;
        // at grade (a ramp meeting its street, a carriageway on the ground) no barriers: the streets stay passable (a
        // cutting keeps its walls, below); see `fence`
        const noBarrier = !F.want[i];
        const bA = [a.x + a.nx * o, a.y, a.z + a.nz * o], bB = [b.x + b.nx * o, b.y, b.z + b.nz * o];
        const tA = [bA[0], a.y + BARRIER_H, bA[2]], tB = [bB[0], b.y + BARRIER_H, bB[2]];
        const iA = [a.x + a.nx * (o - side * 0.25), a.y + BARRIER_H, a.z + a.nz * (o - side * 0.25)], iB = [b.x + b.nx * (o - side * 0.25), b.y + BARRIER_H, b.z + b.nz * (o - side * 0.25)];
        const fA = [a.x + a.nx * (o - side * 0.45), a.y, a.z + a.nz * (o - side * 0.45)], fB = [b.x + b.nx * (o - side * 0.45), b.y, b.z + b.nz * (o - side * 0.45)];
        // inner face (sloped), top, outer face down to the deck's underside (raised) or the ground
        const low = raised ? -DECK_T : cut ? 0 : -0.3;
        if (!noBarrier) {
          L.quad2(fA, fB, iB, iA, C.concrete);
          L.quad2(iA, iB, tB, tA, C.concrete);
          L.quad2(bA, bB, [bB[0], b.y + low, bB[2]], [bA[0], a.y + low, bA[2]], C.concreteDark);
          L.quad2(tA, tB, [bB[0], b.y + low, bB[2]], [bA[0], a.y + low, bA[2]], C.concrete);
          // a run's ends closed off square
          if (i === 0 || !F.want[i - 1]) L.quad2(fA, iA, tA, [bA[0], a.y + low, bA[2]], C.concrete);
          if (i === n - 1 || !F.want[i + 1]) L.quad2(fB, iB, tB, [bB[0], b.y + low, bB[2]], C.concrete);
        }
        // the barriers are drive-through (easy on and off from any angle) except along a high deck, where they keep
        // the car from going over the edge; there they are solid from the deck up only
        if (!noBarrier && Math.min(a.h, b.h) > HIGH_EDGE) obb(bA[0], bA[2], bB[0], bB[2], 0.7, Math.min(a.y, b.y) - 0.4, Math.max(a.y, b.y) + BARRIER_H + 0.2);
        // an embankment (raised a little): a solid wall down to the ground (not over a street: it passes under)
        if (!raised && Math.max(a.h, b.h) > 0.05 && !cut && !overStreet && !noBarrier) {
          L.quad2(bA, bB, [bB[0], b.t - 0.2, bB[2]], [bA[0], a.t - 0.2, bA[2]], C.concreteDark);
        }
        if (raised && Math.max(a.h, b.h) < 4.5 && !overStreet) {
          // a low viaduct end: retaining wall to the ground (an embankment between walls)
          L.quad2([bA[0], a.y - DECK_T, bA[2]], [bB[0], b.y - DECK_T, bB[2]], [bB[0], b.t - 0.2, bB[2]], [bA[0], a.t - 0.2, bA[2]], C.concreteDark);
          if (Math.min(a.h, b.h) > 1.6) obb(bA[0], bA[2], bB[0], bB[2], 0.7, Math.min(a.t, b.t) - 1, Math.max(a.y, b.y) - DECK_T);
        }
        // a cutting: the retaining wall from the road up past the ground
        if (cut) {
          const wo = side * (hw + 0.7);
          const gA = [a.x + a.nx * wo, a.y - 0.2, a.z + a.nz * wo], gB = [b.x + b.nx * wo, b.y - 0.2, b.z + b.nz * wo];
          L.quad2(gA, gB, [gB[0], b.t + 0.7, gB[2]], [gA[0], a.t + 0.7, gA[2]], C.concrete);
          L.quad2([gA[0], a.t + 0.7, gA[2]], [gB[0], b.t + 0.7, gB[2]], [gB[0] + b.nx * side * 0.4, b.t + 0.7, gB[2] + b.nz * side * 0.4], [gA[0] + a.nx * side * 0.4, a.t + 0.7, gA[2] + a.nz * side * 0.4], C.concreteDark);
          if (Math.max(a.h, b.h) < -1.6) obb(gA[0], gA[2], gB[0], gB[2], 0.8, Math.min(a.y, b.y) - 1, Math.max(a.t, b.t) + 0.7);
        }
      }
      if (raised) {
        // the deck's underside
        L.quad(E(a, -hw - 0.2, -DECK_T), E(a, hw + 0.2, -DECK_T), E(b, hw + 0.2, -DECK_T), E(b, -hw - 0.2, -DECK_T), C.concrete);
        // pillars (and a crosshead under the deck) every few samples, where the deck stands clear of the ground
        if ((w.opts && w.opts.piers ? w.opts.piers.includes(i) : i % PILLAR_EVERY === 0) && a.h > 3.2) {
          const n = hw > 7 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const off = n === 1 ? 0 : (k ? 1 : -1) * hw * 0.5;
            const px = a.x + a.nx * off, pz = a.z + a.nz * off;
            if (deckBetween(px, pz, a.t - 0.5, a.y - DECK_T - 0.2, w.wi, 1.0)) continue;
            L.box(px, a.t - 0.5, pz, a.ux, a.uz, 0.8, 0.8, a.y - DECK_T, C.concrete);
            colliders.push({ minX: px - 1.1, maxX: px + 1.1, minZ: pz - 1.1, maxZ: pz + 1.1, minY: a.t - 1, maxY: a.y - DECK_T, freeway: true });
          }
          // (the crosshead only where no other deck runs through it, and its top 2 cm under the deck's underside)
          if (![-0.85, 0, 0.85].some((f) => deckBetween(a.x + a.nx * hw * f, a.z + a.nz * hw * f, a.y - DECK_T - 1.0, a.y - DECK_T, w.wi, 0.3)))
            L.box(a.x, a.y - DECK_T - 1.0, a.z, a.ux, a.uz, 0.9, hw * 0.85, a.y - DECK_T - 0.02, C.concrete);
        }
      }
      // lamp poles (one side, alternating), with a glowing head over the road
      if (a.f === 0 && a.oi % LAMP_EVERY === 0 && w.kind === 0) {
        const side = (a.oi / LAMP_EVERY) % 2 ? 1 : -1, o = side * (hw + 0.45);
        const px = a.x + a.nx * o, pz = a.z + a.nz * o;
        const hx = px - a.nx * side * 2.2, hz = pz - a.nz * side * 2.2;
        if (!deckBetween(px, pz, a.y - 3, a.y + 11.5, w.wi) && !deckBetween(hx, hz, a.y + 1, a.y + 11.5, w.wi)) {
          L.box(px, a.y + BARRIER_H, pz, a.ux, a.uz, 0.12, 0.12, a.y + 11, C.pole);
          L.box((px + hx) / 2, a.y + 10.85, (pz + hz) / 2, -a.nz * side, a.nx * side, 1.15, 0.08, a.y + 11, C.pole);
          G.box(hx, a.y + 10.65, hz, a.ux, a.uz, 0.45, 0.22, a.y + 10.85, C.lamp);
        }
      }
    }
  }

  // A way's end that meets another way at an angle (a ramp leaving or joining, a split): a half-disc of deck beyond the
  // end, 2 cm under the road, filling the wedge-shaped gaps between the square end and the way it meets (the ground there
  // is rounded the same way, see surfaceAt), with its underside under a raised deck
  for (const w of ways) {
    for (const [s, sgn] of [[w.S[0], -1], [w.S[w.S.length - 1], 1]]) {
      if (w.S.length < 2 || s.cov || s.straight || !joined(s, w.wi)) continue;
      const cell = cellOf(s.x, s.z), N = 8, ux = s.ux * sgn, uz = s.uz * sgn;
      const P = (k, dy) => { const t = -Math.PI / 2 + (Math.PI * k) / N; const c = Math.cos(t), sn = Math.sin(t); return [s.x + (ux * c + s.nx * sn) * w.hw, s.y + dy, s.z + (uz * c + s.nz * sn) * w.hw]; };
      for (let k = 0; k < N; k++) {
        const top = [P(k, -0.02), P(k + 1, -0.02)], C0 = [s.x, s.y - 0.02, s.z];
        cell.lit.tri(C0, top[0], top[1], C.asphalt); cell.lit.tri(C0, top[1], top[0], C.asphalt);
        if (s.h > 0.3) {
          const bot = [P(k, -DECK_T), P(k + 1, -DECK_T)], C1 = [s.x, s.y - DECK_T, s.z];
          cell.lit.tri(C1, bot[0], bot[1], C.concrete); cell.lit.tri(C1, bot[1], bot[0], C.concrete);
          cell.lit.quad2(top[0], top[1], bot[1], bot[0], C.concreteDark);
        }
      }
    }
  }

  // A tunnel or cutting that stops underground with nothing beyond (no join with another way): a closed concrete end
  // wall across it, solid, so it never leads into the ground
  for (const w of ways) {
    for (const [s, n] of [[w.S[0], w.S[1]], [w.S[w.S.length - 1], w.S[w.S.length - 2]]]) {
      if (!n || joined(s, w.wi) || !(s.cov || s.h < -0.6)) continue;
      const o = w.hw + 0.7, top = s.cov ? ceilingAt(s) : s.t + 0.7, cell = cellOf(s.x, s.z);
      const P = (off, y) => [s.x + s.nx * off, y, s.z + s.nz * off];
      (s.cov ? cell.glow : cell.lit).quad2(P(-o, s.y - 0.3), P(o, s.y - 0.3), P(o, top), P(-o, top), C.portal);
      obb(s.x - s.nx * o, s.z - s.nz * o, s.x + s.nx * o, s.z + s.nz * o, 1.2, s.y - 1, top);
    }
  }

  for (const c of cells.values()) {
    c.meshes = [];
    for (const [buf, mat, lit] of [[c.lit, litMat, true], [c.glow, glowMat, false]]) {
      const geo = buf.geometry(lit);
      if (!geo) continue;
      triangles += geo.attributes.position.count / 3;
      const m = new THREE.Mesh(geo, mat);
      m.name = lit ? 'Freeway' : 'FreewayTunnel';
      m.receiveShadow = lit;
      m.castShadow = false;
      group.add(m);
      c.meshes.push(m);
    }
    c.lit = c.glow = null;
  }
  scene.add(group);

  // --- Ambient traffic lanes along the long chains -----------------------------------------------------------------------
  const lanes = cityRoad.lanes.map((l) => ({ pts: l.map(([x, y, z]) => new THREE.Vector3(x, y, z)), speed: 13, noDip: true }));
  for (const chain of FREEWAYS.chains || []) {
    const pts = [];
    let nl = 3;
    for (const wi of chain) {
      const w = ways[wi];
      nl = Math.min(nl, Math.max(1, Math.round(w.lanes)));
      for (const s of w.S) if (!pts.length || Math.hypot(s.x - pts[pts.length - 1].s.x, s.z - pts[pts.length - 1].s.z) > 1) pts.push({ s, hw: w.hw });
    }
    if (pts.length < 20) continue;
    const use = Math.min(2, nl);
    for (let k = 0; k < use; k++) {
      const P = pts.map(({ s, hw }) => {
        const o = -hw + 0.7 + ((2 * hw - 1.4) * (k + 0.5)) / Math.max(use, Math.round(nl));
        return new THREE.Vector3(s.x + s.nx * o, s.y + 0.02, s.z + s.nz * o);
      });
      lanes.push({ pts: P, speed: 21 + k * 2.5, noDip: true });
    }
  }

  // --- Distance culling: cells beyond the view distance hidden, four times a second ----------------------------------
  // (by each mesh's bounding sphere: the lit structure to 70% of the view distance, where the fog has nearly hidden it;
  // a tunnel's inside only within TUNNEL_SEEN m, since from further off it is underground or deep in a cutting)
  const meshList = group.children.map((m) => ({ m, s: m.geometry.boundingSphere, tunnel: m.material === glowMat }));
  let clock = 0;
  function update(camPos, dt = 0.016) {
    clock -= dt;
    if (clock > 0) return;
    clock = 0.25;
    const far = Number.isFinite(Q.viewDist) ? Q.viewDist * 0.7 : 1e9;
    for (const e of meshList) {
      const d = Math.hypot(e.s.center.x - camPos.x, e.s.center.z - camPos.z) - e.s.radius;
      e.m.visible = d < (e.tunnel ? Math.min(far, TUNNEL_SEEN) : far);
    }
  }

  // What carries something at height y over (x, z): 'tunnel', 'cutting', 'deck', or null (the ground). js/main.js uses it
  // for the safety net that brings a car stuck down a tunnel or a cutting back to a street.
  const kindOut = {};
  function layerKind(x, z, y) {
    if (surfaceAt(x, z, y, -1, kindOut) === null || !kindOut.seg) return null;
    const g = kindOut.seg;
    return g.cov ? 'tunnel' : Math.min(g.ya - g.ta, g.yb - g.tb) < -0.6 ? 'cutting' : 'deck';
  }

  return { group, colliders, groundHeight, surfaceAt, layerKind, lanes, update, stats: { cells: cells.size, meshes: group.children.length, triangles, colliders: colliders.length, lanes: lanes.length } };
}
