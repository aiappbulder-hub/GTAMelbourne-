// Melbourne's freeways: CityLink, the West Gate Freeway and their ramps on viaducts, embankments and in open cuttings,
// and the Burnley and Domain Tunnels, from js/melbourne-freeways.js (tools/melbourne/build-freeways.mjs, OSM).
//
// Built once at load, cheaply:
//  - Everything is merged per 500 m cell into at most two meshes (one lit material with vertex colours for the decks,
//    lane paint, barriers, pillars, poles and cutting walls; one unlit for the tunnels' inside and the lamp heads), so a
//    cell costs at most two draws. Cells beyond the tier's view distance (Q.viewDist) are hidden, checked four times a
//    second against the camera.
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
import { FREEWAYS } from './melbourne-freeways.js';
import { terrainHeight } from './terrain.js';
import { Q } from './quality.js';
import { buildCityRoadWay } from './city-road-bridge.js';

const CELL = 500;
const INDEX = 32; // ground-query grid
const TUNNEL_H = 5.4; // floor to ceiling
const DECK_T = 1.4; // a viaduct deck's depth
const BARRIER_H = 1.0;
const PILLAR_EVERY = 4; // samples (about 32 m)
const LAMP_EVERY = 6; // samples (about 48 m)
const TUNNEL_SEEN = 260;

const C = {
  asphalt: [0.2, 0.205, 0.215], paint: [0.86, 0.86, 0.82], concrete: [0.62, 0.61, 0.58], concreteDark: [0.42, 0.41, 0.39],
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
  const litMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
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
  // City Road's bridge over St Kilda Road (js/city-road-bridge.js) is one more way after the data's, so the chains'
  // indices stay valid; `opts.piers` names the samples that get a pier pair (every way's, from the refine pass, which
  // keeps them out of the streets), `opts.street` the segments a street crosses under; any way's barriers are left off
  // where its deck is within 0.7 m of the ground (ramps meeting their streets)
  const cityRoad = buildCityRoadWay(terrainHeight);
  const ways = [...FREEWAYS.ways, cityRoad.way].map(([name, kind, width, lanes, flat, opts], wi) => {
    const S = [];
    for (let i = 0; i < flat.length; i += 4) {
      const x = flat[i], z = flat[i + 1], h = flat[i + 2], t = terrainHeight(x, z);
      S.push({ x, z, h, t, y: t + h + (Math.abs(h) < 0.05 ? 0.03 : 0), cov: flat[i + 3] === 1 });
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
      sa.ux = ux0; sa.uz = uz0; sa.nx = -uz0; sa.nz = ux0;
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
  function ceilingAt(s) { return Math.max(s.y + 2.4, Math.min(s.y + TUNNEL_H, s.t - 0.3)); }

  // The surface under (x, z) for something at height y (see the header); `skipWay` leaves one way out (barrier test)
  function surfaceAt(x, z, y, skipWay = -1, out = null) {
    const list = index.get(key(Math.floor(x / INDEX), Math.floor(z / INDEX)));
    if (!list) return null;
    let best = null, bestSeg = null;
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
      const f = Math.max(0, Math.min(1, along / s.L));
      const surf = s.ya + (s.yb - s.ya) * f;
      if (s.cov) {
        const ceil = s.ceilA + (s.ceilB - s.ceilA) * f;
        if (!(y < ceil - 0.8)) continue; // on the ground above the tunnel
      } else {
        const ground = s.ta + (s.tb - s.ta) * f;
        // a raised deck counts for something up near it; a cutting (below the ground) for anything over it
        if (surf > ground + 0.05 && y < surf - 1.6) continue;
      }
      // of several (stacked decks, a ramp beside its road): the highest not far above
      if (best === null || (surf <= y + 1.0 && (surf > best || best > y + 1.0)) || (best > y + 1.0 && surf < best)) { best = surf; bestSeg = s; }
    }
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

  for (const w of ways) {
    const S = w.S, hw = w.hw;
    const E = (s, o, dy = 0) => [s.x + s.nx * o, s.y + dy, s.z + s.nz * o];
    // is the edge at offset o of sample s on another way's deck (a merge: no barrier there)
    const onOther = (s, o) => surfaceAt(s.x + s.nx * o * 1.15, s.z + s.nz * o * 1.15, s.y, w.wi) !== null;
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
      R.quad(E(a, -hw), E(b, -hw), E(b, hw), E(a, hw), roadCol);
      // lane paint: edge lines, dashed lines between lanes (3 m dash in each 9 m)
      const line = (o, w0, f0 = 0, f1 = 1) => {
        const p = (s, t, oo) => { const x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t), y = lerp(a.y, b.y, t); return [x + s.nx * oo, y + 0.025, z + s.nz * oo]; };
        R.quad(p(a, f0, o - w0), p(b, f1, o - w0), p(b, f1, o + w0), p(a, f0, o + w0), paint);
      };
      line(hw - 0.7, 0.08); line(-hw + 0.7, 0.08);
      const nl = Math.max(1, Math.min(5, Math.round(w.lanes)));
      if (nl > 1) for (let k = 1; k < nl; k++) line(-hw + 0.7 + ((2 * hw - 1.4) * k) / nl, 0.07, 0, 0.4);

      if (covered) {
        // the tube: walls, ceiling and a strip light; brightness baked (lights over every other sample)
        const ca = ceilingAt(a), cb = ceilingAt(b);
        const lit = i % 2 === 0 ? 1 : 0.82;
        const wc = C.tunnelWall.map((v) => v * lit);
        const W = (s, o, y) => [s.x + s.nx * o, y, s.z + s.nz * o];
        const o = hw + 0.6;
        G.quad(W(a, -o, a.y - 0.1), W(a, -o, ca), W(b, -o, cb), W(b, -o, b.y - 0.1), wc); // right wall, facing in
        G.quad(W(a, o, a.y - 0.1), W(b, o, b.y - 0.1), W(b, o, cb), W(a, o, ca), wc); // left wall
        // a dark tiled band along the bottom of each wall
        G.quad(W(a, -o + 0.01, a.y - 0.1), W(a, -o + 0.01, a.y + 0.9), W(b, -o + 0.01, b.y + 0.9), W(b, -o + 0.01, b.y - 0.1), C.concreteDark);
        G.quad(W(a, o - 0.01, a.y - 0.1), W(b, o - 0.01, b.y - 0.1), W(b, o - 0.01, b.y + 0.9), W(a, o - 0.01, a.y + 0.9), C.concreteDark);
        G.quad(W(a, -o, ca), W(a, o, ca), W(b, o, cb), W(b, -o, cb), C.tunnelCeil);
        G.quad(W(a, -0.35, ca - 0.04), W(a, 0.35, ca - 0.04), W(b, 0.35, cb - 0.04), W(b, -0.35, cb - 0.04), C.tunnelLight);
        // the roof slab and walls seen from outside (only where it shows: in a cutting's end, from above it's buried)
        L.quad(W(a, -o - 0.4, ca + 0.3), W(b, -o - 0.4, cb + 0.3), W(b, o + 0.4, cb + 0.3), W(a, o + 0.4, ca + 0.3), C.concreteDark);
        obb(...[a.x - a.nx * o, a.z - a.nz * o, b.x - b.nx * o, b.z - b.nz * o], 0.6, Math.min(a.y, b.y) - 1, Math.max(ca, cb));
        obb(...[a.x + a.nx * o, a.z + a.nz * o, b.x + b.nx * o, b.z + b.nz * o], 0.6, Math.min(a.y, b.y) - 1, Math.max(ca, cb));
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
        const o = side * (hw + 0.2);
        if (onOther(a, side * hw) && onOther(b, side * hw)) continue;
        // at grade (a ramp meeting its street, a carriageway on the ground) no barriers: the streets stay passable
        if (Math.max(a.h, b.h) < 0.7) continue;
        const bA = [a.x + a.nx * o, a.y, a.z + a.nz * o], bB = [b.x + b.nx * o, b.y, b.z + b.nz * o];
        const tA = [bA[0], a.y + BARRIER_H, bA[2]], tB = [bB[0], b.y + BARRIER_H, bB[2]];
        const iA = [a.x + a.nx * (o - side * 0.25), a.y + BARRIER_H, a.z + a.nz * (o - side * 0.25)], iB = [b.x + b.nx * (o - side * 0.25), b.y + BARRIER_H, b.z + b.nz * (o - side * 0.25)];
        const fA = [a.x + a.nx * (o - side * 0.45), a.y, a.z + a.nz * (o - side * 0.45)], fB = [b.x + b.nx * (o - side * 0.45), b.y, b.z + b.nz * (o - side * 0.45)];
        // inner face (sloped), top, outer face down to the deck's underside (raised) or the ground
        L.quad2(fA, fB, iB, iA, C.concrete);
        L.quad2(iA, iB, tB, tA, C.concrete);
        const low = raised ? -DECK_T : cut ? 0 : -0.3;
        L.quad2(bA, bB, [bB[0], b.y + low, bB[2]], [bA[0], a.y + low, bA[2]], C.concreteDark);
        L.quad2(tA, tB, [bB[0], b.y + low, bB[2]], [bA[0], a.y + low, bA[2]], C.concrete);
        obb(bA[0], bA[2], bB[0], bB[2], 0.7, Math.max(Math.min(a.y, b.y) - 0.4, overStreet ? Math.min(a.t, b.t) + 2.6 : -Infinity), Math.max(a.y, b.y) + BARRIER_H + 0.2);
        // an embankment (raised a little): a solid wall down to the ground (not over a street: it passes under)
        if (!raised && Math.max(a.h, b.h) > 0.05 && !cut && !overStreet) {
          L.quad2(bA, bB, [bB[0], b.t - 0.2, bB[2]], [bA[0], a.t - 0.2, bA[2]], C.concreteDark);
        }
        if (raised && Math.max(a.h, b.h) < 4.5 && !overStreet) {
          // a low viaduct end: retaining wall to the ground (an embankment between walls)
          L.quad2([bA[0], a.y - DECK_T, bA[2]], [bB[0], b.y - DECK_T, bB[2]], [bB[0], b.t - 0.2, bB[2]], [bA[0], a.t - 0.2, bA[2]], C.concreteDark);
          obb(bA[0], bA[2], bB[0], bB[2], 0.7, Math.min(a.t, b.t) - 1, Math.max(a.y, b.y) - DECK_T);
        }
        // a cutting: the retaining wall from the road up past the ground
        if (cut) {
          const wo = side * (hw + 0.7);
          const gA = [a.x + a.nx * wo, a.y - 0.2, a.z + a.nz * wo], gB = [b.x + b.nx * wo, b.y - 0.2, b.z + b.nz * wo];
          L.quad2(gA, gB, [gB[0], b.t + 0.7, gB[2]], [gA[0], a.t + 0.7, gA[2]], C.concrete);
          L.quad2([gA[0], a.t + 0.7, gA[2]], [gB[0], b.t + 0.7, gB[2]], [gB[0] + b.nx * side * 0.4, b.t + 0.7, gB[2] + b.nz * side * 0.4], [gA[0] + a.nx * side * 0.4, a.t + 0.7, gA[2] + a.nz * side * 0.4], C.concreteDark);
          obb(gA[0], gA[2], gB[0], gB[2], 0.8, Math.min(a.y, b.y) - 1, Math.max(a.t, b.t) + 0.7);
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
            L.box(px, a.t - 0.5, pz, a.ux, a.uz, 0.8, 0.8, a.y - DECK_T, C.concrete);
            colliders.push({ minX: px - 1.1, maxX: px + 1.1, minZ: pz - 1.1, maxZ: pz + 1.1, minY: a.t - 1, maxY: a.y - DECK_T, freeway: true });
          }
          L.box(a.x, a.y - DECK_T - 1.0, a.z, a.ux, a.uz, 0.9, hw * 0.85, a.y - DECK_T, C.concrete);
        }
      }
      // lamp poles (one side, alternating), with a glowing head over the road
      if (i % LAMP_EVERY === 0 && w.kind === 0) {
        const side = (i / LAMP_EVERY) % 2 ? 1 : -1, o = side * (hw + 0.45);
        const px = a.x + a.nx * o, pz = a.z + a.nz * o;
        L.box(px, a.y + BARRIER_H, pz, a.ux, a.uz, 0.12, 0.12, a.y + 11, C.pole);
        const hx = px - a.nx * side * 2.2, hz = pz - a.nz * side * 2.2;
        L.box((px + hx) / 2, a.y + 10.85, (pz + hz) / 2, -a.nz * side, a.nx * side, 1.15, 0.08, a.y + 11, C.pole);
        G.box(hx, a.y + 10.65, hz, a.ux, a.uz, 0.45, 0.22, a.y + 10.85, C.lamp);
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

  return { group, colliders, groundHeight, surfaceAt, lanes, update, stats: { cells: cells.size, meshes: group.children.length, triangles, colliders: colliders.length, lanes: lanes.length } };
}
