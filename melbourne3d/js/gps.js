// The minimap's GPS: a route along the street centreline graph (GEO.roadGraph: every drivable street, bridges included,
// with their one-way directions), from the player to a target. A* over the graph's junctions, started and finished
// part-way along the nearest street to each end. (The traffic's own graph, js/road-network.js, is a cut-down copy of it
// that stops 150 m short of the Yarra's banks, so it can't route over the bridges of js/bridges.js; this one reaches
// every bridge deck's ends within 10 m.)
//
//   const gps = createGps();
//   gps.route(fromX, fromZ, toX, toZ) -> { pts: [{ x, z }, ...], length, start, end } | null
//
// pts run along street centrelines only: the first is the point on the nearest street to the start (`start`: how far
// the player is from it, metres), the last the point on the nearest street to the target (`end`). The caller draws the
// short links to the player and the target itself.
import { GEO } from './geodata.js';

const CELL = 120; // spatial index cell, metres
const MAX_SNAP = 400; // furthest a point may be from a street and still be routed

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) {
    const a = this.a;
    let i = a.length;
    a.push([k, v]);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export function createGps(roadGraph = GEO.roadGraph) {
  if (!roadGraph) return { route: () => null, snap: () => null };
  const RG = roadGraph;
  const nn = RG.nodes.length / 2;
  const nx = (i) => RG.nodes[2 * i], nz = (i) => RG.nodes[2 * i + 1];

  // links: { a, b, dir, xs, zs (the shape, from a to b), cum (distance along it), L }
  const links = [];
  const out = Array.from({ length: nn }, () => []); // node -> [{ link, fwd }] the ways to leave it
  const outAny = Array.from({ length: nn }, () => []); // the same ignoring one-way signs
  for (const [a, b, , , , dir, inner] of RG.links) {
    const xs = [nx(a)], zs = [nz(a)];
    for (let k = 0; k < inner.length; k += 2) { xs.push(inner[k]); zs.push(inner[k + 1]); }
    xs.push(nx(b)); zs.push(nz(b));
    const cum = [0];
    for (let k = 1; k < xs.length; k++) cum.push(cum[k - 1] + Math.hypot(xs[k] - xs[k - 1], zs[k] - zs[k - 1]));
    const L = cum[cum.length - 1];
    if (!(L > 0.01) || a === b) continue;
    const link = { a, b, dir, xs, zs, cum, L };
    links.push(link);
    outAny[a].push({ link, fwd: true });
    outAny[b].push({ link, fwd: false });
    if (dir >= 0) out[a].push({ link, fwd: true });
    if (dir <= 0) out[b].push({ link, fwd: false });
  }

  // only the main network is routed to (the few little islands of street cut off from it are not)
  const par = Array.from({ length: nn }, (_, i) => i);
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (const l of links) par[find(l.a)] = find(l.b);
  const size = new Map();
  for (let i = 0; i < nn; i++) size.set(find(i), (size.get(find(i)) || 0) + 1);
  let main = -1;
  for (const [r, n] of size) if (main < 0 || n > size.get(main)) main = r;

  // spatial index of the links' segments
  const grid = new Map();
  const key = (ix, iz) => ix * 100003 + iz;
  for (const link of links) {
    if (find(link.a) !== main) continue;
    for (let k = 0; k + 1 < link.xs.length; k++) {
      const x0 = Math.floor(Math.min(link.xs[k], link.xs[k + 1]) / CELL), x1 = Math.floor(Math.max(link.xs[k], link.xs[k + 1]) / CELL);
      const z0 = Math.floor(Math.min(link.zs[k], link.zs[k + 1]) / CELL), z1 = Math.floor(Math.max(link.zs[k], link.zs[k + 1]) / CELL);
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const kk = key(ix, iz);
        let l = grid.get(kk);
        if (!l) grid.set(kk, (l = []));
        l.push(link, k);
      }
    }
  }

  // the nearest street to (x, z): { link, k, s (metres along the link), d (metres away), x, z }
  function snap(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = null;
    for (let r = 0; r <= Math.ceil(MAX_SNAP / CELL) + 1; r++) {
      for (let ix = cx - r; ix <= cx + r; ix++) for (let iz = cz - r; iz <= cz + r; iz++) {
        if (r > 0 && Math.abs(ix - cx) !== r && Math.abs(iz - cz) !== r) continue; // only the ring
        const l = grid.get(key(ix, iz));
        if (!l) continue;
        for (let i = 0; i < l.length; i += 2) {
          const link = l[i], k = l[i + 1];
          const ax = link.xs[k], az = link.zs[k], dx = link.xs[k + 1] - ax, dz = link.zs[k + 1] - az;
          const len2 = dx * dx + dz * dz || 1e-9;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
          const px = ax + dx * t, pz = az + dz * t;
          const d = Math.hypot(px - x, pz - z);
          if (!best || d < best.d) best = { link, k, d, x: px, z: pz, s: link.cum[k] + Math.sqrt(len2) * t };
        }
      }
      if (best && best.d <= r * CELL) break; // nothing in a further ring can be nearer
    }
    return best && best.d <= MAX_SNAP ? best : null;
  }

  // the link's shape between distances s0 and s1 along it (either order), as points from s0 to s1; `from`/`to` are the
  // exact end points
  function slice(link, s0, p0, s1, p1) {
    const pts = [p0];
    if (s1 >= s0) {
      for (let k = 0; k < link.xs.length; k++) if (link.cum[k] > s0 + 1e-6 && link.cum[k] < s1 - 1e-6) pts.push({ x: link.xs[k], z: link.zs[k] });
    } else {
      for (let k = link.xs.length - 1; k >= 0; k--) if (link.cum[k] < s0 - 1e-6 && link.cum[k] > s1 + 1e-6) pts.push({ x: link.xs[k], z: link.zs[k] });
    }
    pts.push(p1);
    return pts;
  }

  function search(A, B, tx, tz, directed) {
    const P = { x: A.x, z: A.z }, Q = { x: B.x, z: B.z };
    const canFwd = (l) => !directed || l.dir >= 0, canBack = (l) => !directed || l.dir <= 0;
    // on the same street, the target in a direction it can be driven
    if (A.link === B.link) {
      const l = A.link;
      if (B.s >= A.s && canFwd(l)) return { pts: slice(l, A.s, P, B.s, Q), length: B.s - A.s };
      if (B.s < A.s && canBack(l)) return { pts: slice(l, A.s, P, B.s, Q), length: A.s - B.s };
    }
    const g = new Float64Array(nn).fill(Infinity);
    const prev = new Int32Array(nn).fill(-1);
    const via = new Array(nn).fill(null);
    const heap = new Heap();
    const h = (i) => Math.hypot(nx(i) - tx, nz(i) - tz);
    const seed = (i, c) => { if (c < g[i]) { g[i] = c; prev[i] = -1; via[i] = null; heap.push(c + h(i), i); } };
    if (canFwd(A.link)) seed(A.link.b, A.link.L - A.s);
    if (canBack(A.link)) seed(A.link.a, A.s);
    // where the target can be reached from: the street's start (driving on to it), or its end if it runs the other way
    const goal = new Map();
    if (canFwd(B.link)) goal.set(B.link.a, B.s);
    if (canBack(B.link)) goal.set(B.link.b, Math.min(goal.get(B.link.b) ?? Infinity, B.link.L - B.s));
    let bestTotal = Infinity, bestNode = -1;
    while (heap.size) {
      const [f, u] = heap.pop();
      if (f > bestTotal) break;
      if (f > g[u] + h(u) + 1e-6) continue;
      if (goal.has(u) && g[u] + goal.get(u) < bestTotal) { bestTotal = g[u] + goal.get(u); bestNode = u; }
      for (const o of (directed ? out : outAny)[u]) {
        const v = o.fwd ? o.link.b : o.link.a;
        const c = g[u] + o.link.L;
        if (c < g[v]) { g[v] = c; prev[v] = u; via[v] = o; heap.push(c + h(v), v); }
      }
    }
    if (bestNode < 0) return null;
    // walk back from the goal junction, then lay the shapes down in order
    const legs = [];
    for (let i = bestNode; via[i]; i = prev[i]) legs.push(via[i]);
    legs.reverse();
    const pts = [P];
    // the first stretch: from P to the junction the search left by
    const firstNode = legs.length ? (legs[0].fwd ? legs[0].link.a : legs[0].link.b) : bestNode;
    {
      const l = A.link;
      const toB = firstNode === l.b;
      const sEnd = toB ? l.L : 0;
      for (const q of slice(l, A.s, P, sEnd, { x: nx(firstNode), z: nz(firstNode) }).slice(1)) pts.push(q);
    }
    for (const o of legs) {
      const l = o.link;
      const n = o.fwd ? l.xs.length : -1;
      if (o.fwd) for (let k = 1; k < l.xs.length; k++) pts.push({ x: l.xs[k], z: l.zs[k] });
      else for (let k = l.xs.length - 2; k >= 0; k--) pts.push({ x: l.xs[k], z: l.zs[k] });
      void n;
    }
    // the last: from the goal junction along the target's street to Q
    {
      const l = B.link;
      const sStart = bestNode === l.a ? 0 : l.L;
      for (const q of slice(l, sStart, pts[pts.length - 1], B.s, Q).slice(1)) pts.push(q);
    }
    return { pts, length: bestTotal };
  }

  function route(fx, fz, tx, tz) {
    const A = snap(fx, fz);
    const B = snap(tx, tz);
    if (!A || !B) return null;
    // streets' one-way directions respected; if that finds nothing (a start in a one-way dead end, a mis-tagged street),
    // any street both ways rather than no route
    const r = search(A, B, tx, tz, true) || search(A, B, tx, tz, false);
    return r && { ...r, start: A.d, end: B.d };
  }

  return { route, snap, links };
}
