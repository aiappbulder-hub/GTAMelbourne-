// The Royal Botanic Gardens (Melbourne only): a black wrought-iron perimeter fence with stone-pier gates, and the "Walk the dog"
// activity (Y) along a winding gravel path past the Western Lawn, Fern Gully, the Ornamental Lake, the Arid Garden and Guilfoyle's
// Volcano. Called from js/dogs.js, which supplies the dogs (kind 'walk'), their steering, the lead line, the sounds and the money.
//
// Cost: the fence is one ribbon mesh (an alpha-tested palisade texture, so no instancing of thousands of bars), one InstancedMesh
// of posts and one merged mesh of stone gate piers; the path is one strip mesh; the paw-print checkpoints are one InstancedMesh
// and their light beams another. 6 draw calls in all. The fence has collider boxes (oriented, thin) for the player and the player's
// car; roads that cross the park's outline get gaps in the fence (found from GEO.roads), and so do the gates.
//
// The route is hand-laid (the geodata carries no footpaths inside the gardens): waypoints are smoothed through a Catmull-Rom
// curve with a gentle wobble so it winds, and the strip is raised 6 cm above the rendered ground (js/ground-index.js).
import * as THREE from 'three/webgpu';
import { GEO } from './melbourne-geodata.js';
import { groundIndexFor } from './ground-index.js';
import { terrainHeight } from './terrain.js';
import { LITE } from './quality.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export const WALK = {
  fenceH: 1.8,
  gateHalf: 3.6, // half the width of a gate opening
  pathWidth: 2.8,
  lift: 0.06, // the strip's height above the rendered ground
  leadSlack: 3.2, leadMax: 4.5, // m between hand and dog: the lead is slack below the first, taut at the second
  walkers: LITE ? 2 : 3,
  reach: 3.4, // m from a checkpoint
  gates: [ // snapped to the nearest edge of the park's outline
    { name: 'Gate F (Observatory side, Birdwood Avenue)', x: 285, z: 1930 },
    { name: 'Alexandra Avenue gate', x: 990, z: 1861 },
    { name: 'Domain Road gate', x: 535, z: 2251 },
    { name: 'Tan gate', x: 640, z: 1515 }
  ],
  waypoints: [[294, 1932], [360, 1925], [440, 1890], [520, 1830], [545, 1930], [560, 2005], [640, 1990], [715, 1952], [790, 1950], [760, 2050], [700, 2150], [735, 2235], [785, 2252], [700, 2290], [600, 2262], [538, 2240]],
  checkpoints: [ // [name, x, z] (snapped to the nearest point of the route)
    ['Western Lawn', 360, 1925], ['Fern Gully', 520, 1830], ['Ornamental Lake', 715, 1952], ['Arid Garden', 735, 2235],
    ["Guilfoyle's Volcano", 785, 2252], ['Domain Road gate', 538, 2240]
  ]
};

// the outline: [x, z] points, closed
const RING = (() => {
  const p = GEO.parks.find((q) => q.name === 'Royal Botanic Gardens');
  const r = p.rings[0], out = [];
  for (let i = 0; i < r.length; i += 2) out.push([r[i], r[i + 1]]);
  return out;
})();
function pip(x, z, ring = RING) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1])) c = !c;
  }
  return c;
}
const WATER = GEO.water.filter((w) => /Lake|Volcano/.test(w.name)).flatMap((w) => w.rings.map((r) => { const o = []; for (let i = 0; i < r.length; i += 2) o.push([r[i], r[i + 1]]); return o; }));
const inWater = (x, z) => WATER.some((r) => pip(x, z, r));

export function createDogWalk({ scene, cm, cast = null, models = [], dogs = [], steer, stand, voice, getMissions = () => null, setLead = () => {}, reduced = false }) {
  const root = new THREE.Group();
  root.name = 'BotanicGardens';
  scene.add(root);

  // ---- the rendered ground (same triangles the city is drawn with)
  const maxHit = groundIndexFor(scene);
  const gnd = (x, z) => {
    const t = terrainHeight(x, z);
    if (!maxHit) return t;
    const h = maxHit(x, z, t - 1, t + 1.2);
    return h > -Infinity ? h : t;
  };

  // ---------------------------------------------------------------------------------------------------------------
  // The outline's edges, with gaps (gates and the roads that cross it)
  const edges = [];
  for (let i = 0; i < RING.length; i++) {
    const a = RING[i], b = RING[(i + 1) % RING.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.5) continue;
    edges.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], L, ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L, gaps: [] });
  }
  const gates = [];
  for (const g of WALK.gates) { // snap to the nearest point of an edge, away from its ends
    let best = null;
    for (const e of edges) {
      const margin = Math.min(WALK.gateHalf + 3, e.L / 2 - 0.5);
      const s = clamp((g.x - e.ax) * e.ux + (g.z - e.az) * e.uz, margin, e.L - margin);
      const px = e.ax + e.ux * s, pz = e.az + e.uz * s, d = Math.hypot(px - g.x, pz - g.z);
      if (!best || d < best.d) best = { d, e, s, px, pz };
    }
    let nx = -best.e.uz, nz = best.e.ux; // the inward normal
    if (!pip(best.px + nx * 3, best.pz + nz * 3)) { nx = -nx; nz = -nz; }
    const gate = { name: g.name, x: best.px, z: best.pz, ux: best.e.ux, uz: best.e.uz, nx, nz };
    gates.push(gate);
    best.e.gaps.push({ c: best.s, h: WALK.gateHalf });
  }
  // roads crossing the outline
  const bb = RING.reduce((o, p) => ({ x0: Math.min(o.x0, p[0]), x1: Math.max(o.x1, p[0]), z0: Math.min(o.z0, p[1]), z1: Math.max(o.z1, p[1]) }), { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 });
  let crossings = 0;
  for (const r of GEO.roads) {
    const c = r[5], w = r[1];
    for (let i = 0; i + 3 < c.length; i += 2) {
      const px = c[i], pz = c[i + 1], qx = c[i + 2], qz = c[i + 3];
      if (Math.max(px, qx) < bb.x0 || Math.min(px, qx) > bb.x1 || Math.max(pz, qz) < bb.z0 || Math.min(pz, qz) > bb.z1) continue;
      const rx = qx - px, rz = qz - pz;
      for (const e of edges) {
        const den = rx * e.uz - rz * e.ux;
        if (Math.abs(den) < 1e-6) continue;
        const t = ((e.ax - px) * e.uz - (e.az - pz) * e.ux) / den, s = ((e.ax - px) * rz - (e.az - pz) * rx) / den;
        if (t < 0 || t > 1 || s < 0 || s > e.L) continue;
        const sin = Math.abs(den) / Math.hypot(rx, rz);
        e.gaps.push({ c: s, h: Math.min(16, (Math.max(w, 6) / 2 + 1.5) / Math.max(sin, 0.25)) });
        crossings++;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The fence: runs between gaps
  const ribbonPos = [], ribbonUv = [], ribbonIdx = [];
  const postXZ = [];
  const colliders = [];
  const piers = [];
  let fenceLen = 0, runCount = 0;
  const H = WALK.fenceH;
  function addCollider(ax, az, bx, bz, th, gmin, gmax, h) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 0.1) return;
    const ux = dx / L, uz = dz / L, cx = (ax + bx) / 2, cz = (az + bz) / 2, hz = L / 2;
    const ex = Math.abs(uz) * th + Math.abs(ux) * hz, ez = Math.abs(ux) * th + Math.abs(uz) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, minY: gmin - 1, maxY: gmax + h, obb: { cx, cz, hx: th, hz, cs: uz, sn: ux }, fence: true });
  }
  let uAcc = 0;
  for (const e of edges) {
    const gaps = e.gaps.map((g) => [g.c - g.h, g.c + g.h]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const g of gaps) { if (merged.length && g[0] <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], g[1]); else merged.push(g.slice()); }
    const runs = [];
    let at = 0;
    for (const g of merged) { if (g[0] - at > 1.5) runs.push([at, Math.min(g[0], e.L)]); at = Math.max(at, g[1]); }
    if (e.L - at > 1.5) runs.push([at, e.L]);
    for (const [s0, s1] of runs) {
      runCount++;
      const n = Math.max(1, Math.ceil((s1 - s0) / 5)), base = ribbonPos.length / 3;
      let gmin = 1e9, gmax = -1e9;
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const s = s0 + (s1 - s0) * k / n, x = e.ax + e.ux * s, z = e.az + e.uz * s, g = gnd(x, z);
        pts.push([x, z, g]);
        gmin = Math.min(gmin, g); gmax = Math.max(gmax, g);
        ribbonPos.push(x, g - 0.3, z, x, g + H, z);
        ribbonUv.push((uAcc + s - s0) / 0.6, 0, (uAcc + s - s0) / 0.6, 1);
        postXZ.push([x, z, g]);
        if (k > 0) { const a = base + (k - 1) * 2; ribbonIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      uAcc += s1 - s0; fenceLen += s1 - s0;
      // collider pieces up to 24 m
      const pc = Math.max(1, Math.ceil((s1 - s0) / 24));
      for (let k = 0; k < pc; k++) {
        const sa = s0 + (s1 - s0) * k / pc, sb = s0 + (s1 - s0) * (k + 1) / pc;
        addCollider(e.ax + e.ux * sa, e.az + e.uz * sa, e.ax + e.ux * sb, e.az + e.uz * sb, 0.3, gmin, gmax, H + 0.2);
      }
    }
  }
  // stone piers either side of each gate: a 1.3 m shaft 3.2 m tall, a cap and a ball
  const pierGeo = (() => {
    const parts = [new THREE.BoxGeometry(1.4, 0.5, 1.4).translate(0, 0.25, 0), new THREE.BoxGeometry(1.15, 2.7, 1.15).translate(0, 1.85, 0), new THREE.BoxGeometry(1.5, 0.25, 1.5).translate(0, 3.325, 0), new THREE.SphereGeometry(0.34, 10, 8).translate(0, 3.8, 0)];
    for (const p of parts) { p.deleteAttribute('uv'); p.deleteAttribute('normal'); }
    return parts;
  })();
  const pierPlaced = [];
  for (const g of gates) {
    for (const sgn of [-1, 1]) {
      const x = g.x + g.ux * sgn * (WALK.gateHalf + 0.5), z = g.z + g.uz * sgn * (WALK.gateHalf + 0.5), y = gnd(x, z);
      pierPlaced.push([x, y, z]);
      addCollider(x - 0.7, z, x + 0.7, z, 0.7, y, y, 3.4);
      postXZ.push([x, z, y]);
    }
  }
  // fence mesh
  const ribbonGeo = new THREE.BufferGeometry();
  ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribbonPos, 3));
  ribbonGeo.setAttribute('uv', new THREE.Float32BufferAttribute(ribbonUv, 2));
  ribbonGeo.setIndex(ribbonIdx);
  ribbonGeo.computeVertexNormals();
  const tex = (() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 448;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) { // five bars per 0.6 m with spear tips
      const cx = (i + 0.5) * 25.6;
      g.fillRect(cx - 5, 34, 10, 414);
      g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx + 8, 40); g.lineTo(cx - 8, 40); g.closePath(); g.fill();
    }
    g.fillRect(0, 62, 128, 14); g.fillRect(0, 372, 128, 14); // rails
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const fenceMat = new THREE.MeshStandardNodeMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.4, color: 0x141414 });
  const fence = new THREE.Mesh(ribbonGeo, fenceMat);
  fence.name = 'BotanicFence'; fence.frustumCulled = false; fence.matrixAutoUpdate = false;
  root.add(fence);
  // posts (one instanced mesh)
  const postGeo = new THREE.BoxGeometry(0.16, 2.1, 0.16).translate(0, 0.75, 0);
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardNodeMaterial({ color: 0x101010, roughness: 0.5, metalness: 0.4 }), postXZ.length);
  const mm = new THREE.Matrix4();
  postXZ.forEach((p, i) => posts.setMatrixAt(i, mm.makeTranslation(p[0], p[2], p[1])));
  posts.instanceMatrix.needsUpdate = true; posts.frustumCulled = false; posts.name = 'BotanicFencePosts';
  root.add(posts);
  // piers: merged copies
  {
    const geos = [];
    for (const [x, y, z] of pierPlaced) for (const p of pierGeo) { const q = p.clone(); q.translate(x, y, z); geos.push(q); }
    if (geos.length) {
      let nv = 0; for (const g of geos) nv += g.attributes.position.count;
      const pos = new Float32Array(nv * 3), idx = [];
      let o = 0;
      for (const g of geos) {
        pos.set(g.attributes.position.array, o * 3);
        const gi = g.index; if (gi) for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + o); else for (let i = 0; i < g.attributes.position.count; i++) idx.push(o + i);
        o += g.attributes.position.count;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardNodeMaterial({ color: 0x9d9788, roughness: 0.95 }));
      m.name = 'BotanicGatePiers'; m.frustumCulled = false; m.castShadow = !LITE; m.receiveShadow = true;
      root.add(m);
    }
  }
  // the player's collision (the manager indexes its colliders lazily, once)
  cm.colliders.push(...colliders);
  cm._colliderCells = null;

  // ---------------------------------------------------------------------------------------------------------------
  // The route: a smooth wobbling curve through the waypoints, sampled every 2 m
  const curve = new THREE.CatmullRomCurve3(WALK.waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const raw = curve.getSpacedPoints(Math.ceil(curve.getLength() / 2));
  const path = []; // { x, z, y, s, ux, uz }
  let s = 0;
  raw.forEach((p, i) => {
    const q = raw[Math.min(i + 1, raw.length - 1)], r = raw[Math.max(i - 1, 0)];
    let ux = q.x - r.x, uz = q.z - r.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
    const edge = Math.min(1, i / 12, (raw.length - 1 - i) / 12), w = Math.sin(i * 0.13) * 1.6 * edge; // the wobble (nothing at the ends)
    const x = p.x - uz * w, z = p.z + ux * w;
    if (i) s += Math.hypot(x - path[i - 1].x, z - path[i - 1].z);
    path.push({ x, z, y: 0, s, ux, uz });
  });
  for (const p of path) p.y = gnd(p.x, p.z);
  const pathLen = s;
  const nearestNode = (x, z) => { let b = 0, bd = 1e12; for (let i = 0; i < path.length; i++) { const d = (path[i].x - x) ** 2 + (path[i].z - z) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
  const pointAt = (sArc) => {
    const t = clamp(sArc, 0, pathLen);
    let lo = 0, hi = path.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path[m].s <= t) lo = m; else hi = m; }
    const a = path[lo], b = path[hi], f = b.s > a.s ? (t - a.s) / (b.s - a.s) : 0;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, ux: a.ux + (b.ux - a.ux) * f, uz: a.uz + (b.uz - a.uz) * f };
  };
  // the strip
  {
    const n = path.length, pos = new Float32Array(n * 6), col = new Float32Array(n * 6), idx = [];
    const hw = WALK.pathWidth / 2;
    path.forEach((p, i) => {
      for (const side of [-1, 1]) {
        const x = p.x - p.uz * hw * side, z = p.z + p.ux * hw * side, k = i * 2 + (side < 0 ? 0 : 1);
        pos.set([x, gnd(x, z) + WALK.lift, z], k * 3);
        const edge = 0.74 + (i % 3) * 0.02;
        col.set([0.66 * edge, 0.58 * edge, 0.43 * edge], k * 3);
      }
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    m.name = 'BotanicPath'; m.frustumCulled = false; m.receiveShadow = true;
    root.add(m);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Checkpoints: glowing paw prints with a light beam (instance 0 is the start at Gate F)
  const cps = WALK.checkpoints.map(([name, x, z]) => { const i = nearestNode(x, z); return { name, i, x: path[i].x, z: path[i].z, y: path[i].y }; });
  const startNode = path[0];
  const start = { x: startNode.x, z: startNode.z, y: startNode.y, name: 'Walk the dog' };
  const pawGeo = (() => {
    const parts = [new THREE.CylinderGeometry(0.36, 0.4, 0.05, 14).scale(1, 1, 0.85).translate(0, 0, -0.2)];
    for (const [x, z, r] of [[-0.5, 0.25, 0.17], [-0.19, 0.52, 0.18], [0.19, 0.52, 0.18], [0.5, 0.25, 0.17]]) parts.push(new THREE.CylinderGeometry(r, r, 0.05, 10).translate(x, 0, z));
    let nv = 0; for (const p of parts) nv += p.attributes.position.count;
    const pos = new Float32Array(nv * 3), idx = []; let o = 0;
    for (const p of parts) { pos.set(p.attributes.position.array, o * 3); for (let i = 0; i < p.index.count; i++) idx.push(p.index.getX(i) + o); o += p.attributes.position.count; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
    return g;
  })();
  const markers = [start, ...cps];
  const paws = new THREE.InstancedMesh(pawGeo, new THREE.MeshBasicNodeMaterial({ color: 0xffd23a }), markers.length);
  const beamMat = new THREE.MeshBasicNodeMaterial({ color: 0xffd23a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const beams = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 0.7, 14, 14, 1, true).translate(0, 7, 0), beamMat, markers.length);
  paws.frustumCulled = beams.frustumCulled = false; paws.name = 'DogWalkPaws'; beams.name = 'DogWalkBeams';
  root.add(paws, beams);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  function drawMarkers(t) {
    markers.forEach((mk, i) => {
      // marker i: 0 the start (shown while no walk), i >= 1 checkpoint i-1 (the next one with a beam, later ones a paw only)
      let paw = false, beam = false;
      if (!W.on) { paw = beam = i === 0; } else if (i > 0) { paw = i - 1 >= W.cp; beam = i - 1 === W.cp; }
      const pulse = 1 + Math.sin(t * 4 + i) * 0.1;
      if (paw) {
        // paw prints lie along the path direction
        const node = path[i === 0 ? 0 : cps[i - 1].i], yaw = Math.atan2(node.ux, node.uz);
        _m.compose(_p.set(mk.x, mk.y + 0.14, mk.z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(1.7 * pulse, 1, 1.7 * pulse));
        paws.setMatrixAt(i, _m);
      } else paws.setMatrixAt(i, ZERO);
      if (beam) beams.setMatrixAt(i, _m.makeTranslation(mk.x, mk.y, mk.z)); else beams.setMatrixAt(i, ZERO);
    });
    paws.instanceMatrix.needsUpdate = true; beams.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // HUD
  let hud = null, hTop = null, hBar = null, hFill = null, hMsg = null, hPrompt = null;
  if (typeof document !== 'undefined') {
    hud = document.createElement('div');
    hud.id = 'dog-walk-hud';
    hud.style.cssText = 'position:fixed;left:50%;top:78px;transform:translateX(-50%);z-index:30;pointer-events:none;text-align:center;font:600 14px/1.35 system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000;display:none';
    const box = 'padding:3px 12px;background:rgba(0,0,0,.55);border-radius:8px;margin-top:3px;display:inline-block';
    hTop = document.createElement('div'); hTop.style.cssText = box;
    hBar = document.createElement('div'); hBar.style.cssText = 'width:200px;height:10px;background:rgba(0,0,0,.55);border-radius:5px;margin:4px auto 0;overflow:hidden;border:1px solid rgba(255,255,255,.4)';
    hFill = document.createElement('div'); hFill.style.cssText = 'height:100%;width:50%;background:#7bd34e'; hBar.appendChild(hFill);
    hMsg = document.createElement('div'); hMsg.style.cssText = box;
    hud.append(hTop, document.createElement('br'), hBar, hMsg);
    document.body.appendChild(hud);
    hPrompt = document.createElement('div');
    hPrompt.id = 'dog-walk-prompt';
    hPrompt.style.cssText = 'position:fixed;left:50%;bottom:140px;transform:translateX(-50%);z-index:30;pointer-events:none;font:600 14px/1.35 system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000;padding:3px 12px;background:rgba(0,0,0,.5);border-radius:8px;display:none';
    document.body.appendChild(hPrompt);
  }
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  // ---------------------------------------------------------------------------------------------------------------
  // The player's walk
  const W = { on: false, cp: 0, t: 0, meter: 0.6, state: 'heel', stateT: 0, smellT: 8, tx: 0, tz: 0, target: null, wait: 0, sniffMoved: 0, tension: 0, msg: '', msgT: 0, speed: 0, lastX: 0, lastZ: 0, summary: null, best: 0, done: 0, smells: 0, tugged: 0 };
  const dog = dogs[0] || null;
  const smellPts = [];
  for (let i = 0; i < path.length; i += 40) {
    const p = path[i];
    for (const side of [1, -1]) { const x = p.x - p.uz * side * rnd(3.5, 6), z = p.z + p.ux * side * rnd(3.5, 6); if (pip(x, z) && !inWater(x, z) && Math.hypot(x - p.x, z - p.z) > 3) { smellPts.push({ x, z }); break; } }
  }
  const walkers = [];
  for (let i = 0; i < WALK.walkers; i++) walkers.push({ key: `rbgwalker${i}`, model: models[(i + 2) % Math.max(1, models.length)], dog: dogs[1 + i] || null, s: 0, dir: i % 2 ? -1 : 1, v: rnd(1.25, 1.65), pause: 0, pauseT: rnd(6, 14), active: false, x: 0, z: 0, heading: 0, posed: false });

  function flash(m, t = 3) { W.msg = m; W.msgT = t; }
  function startWalk(pp, ent) {
    if (W.on || !dog) return;
    Object.assign(W, { on: true, cp: 0, t: 0, meter: 0.6, state: 'heel', stateT: 0, smellT: rnd(5, 8), target: null, summary: null, speed: 0, lastX: pp.x, lastZ: pp.z, done: 0, smells: 0, tugged: 0 });
    const h = ent.heading || 0;
    dog.x = pp.x + Math.cos(h) * 0.9 + Math.sin(h) * 0.8; dog.z = pp.z - Math.sin(h) * 0.9 + Math.cos(h) * 0.8; dog.yaw = h; dog.v = 0; dog.active = true; dog.mode = 'stand'; dog.flee = 0; dog.job = null; dog.y = gnd(dog.x, dog.z); dog.happy = 1;
    voice('woof', dog);
    flash(`Walk the dog: head for the ${cps[0].name}`, 4);
  }
  function endWalk(why) {
    if (!W.on) return;
    W.on = false;
    if (dog) { dog.active = false; dog.mode = 'stand'; }
    setLead(0, 0, 0, 0, 0, 0, 0);
    W.summary = { text: why, t: 6 };
  }
  function finish() {
    const bonus = Math.round(clamp((900 - W.t) / 900, 0, 1) * 30), reward = 40 + Math.round(110 * W.meter) + bonus;
    getMissions()?.addMoney?.(reward);
    W.best = Math.max(W.best, W.meter); W.lastReward = reward;
    endWalk(`Walk complete! ${fmt(W.t)} · Good dog ${Math.round(W.meter * 100)}% · +$${reward}`);
    W.summary.t = 9;
  }

  const hand = { x: 0, y: 0, z: 0 };
  function updateWalk(dt, pp, ent) {
    const onFoot = cm.activeMode === 'person';
    W.speed += (Math.hypot(pp.x - W.lastX, pp.z - W.lastZ) / Math.max(dt, 1e-3) - W.speed) * Math.min(1, dt * 6);
    W.lastX = pp.x; W.lastZ = pp.z;
    if (!W.on) { if (W.summary) { W.summary.t -= dt; if (W.summary.t <= 0) W.summary = null; } return; }
    if (!onFoot) { endWalk('Walk ended'); return; }
    if (!pip(pp.x, pp.z) && Math.hypot(pp.x - path[nearestNode(pp.x, pp.z)].x, pp.z - path[nearestNode(pp.x, pp.z)].z) > 20) { endWalk('You left the gardens: walk ended'); return; }
    W.t += dt; W.msgT -= dt;
    const h = ent.heading || 0, dirx = Math.sin(h), dirz = Math.cos(h);
    const rx = dirz, rz = -dirx; // the player's right
    const d = dog;
    // -- the dog's mood
    W.stateT -= dt; W.smellT -= dt;
    const dxp = d.x - pp.x, dzp = d.z - pp.z, dist = Math.hypot(dxp, dzp);
    if (W.state === 'heel') {
      const tx = pp.x + rx * 1.0 + dirx * 1.1, tz = pp.z + rz * 1.0 + dirz * 1.1;
      d.mode = 'trot';
      const dd = Math.hypot(tx - d.x, tz - d.z);
      if (W.speed < 0.3 && dd < 1.4) { stand(d, dt); d.mode = 'stand'; } else steer(d, tx, tz, clamp(0.4 + W.speed * 0.95 + dd * 1.8, 0.5, 4.2), dt, 8);
      if (W.smellT <= 0) { // something smells: another dog if one is near, else a post or tree beside the path
        let tgt = null, bd = 16 * 16;
        for (const w of walkers) if (w.active && w.dog) { const q = (w.dog.x - pp.x) ** 2 + (w.dog.z - pp.z) ** 2; if (q < bd) { bd = q; tgt = { x: w.dog.x, z: w.dog.z, dog: w.dog }; } }
        if (!tgt || Math.random() < 0.3) {
          let bq = 1e9;
          for (const sp of smellPts) { const q = Math.hypot(sp.x - pp.x, sp.z - pp.z); if (q > 3 && q < 13 && q < bq && Math.abs(Math.atan2(sp.x - pp.x, sp.z - pp.z) - h) < 2.2) { bq = q; tgt = { x: sp.x, z: sp.z }; } }
        }
        if (tgt) { W.target = tgt; W.state = 'pull'; W.stateT = 9; flash(tgt.dog ? 'Your dog wants to say hello!' : 'Your dog has found a smell…', 2.5); voice('woof', d); }
        W.smellT = rnd(6, 11);
      }
    } else if (W.state === 'pull') {
      d.mode = 'trot';
      if (W.target.dog) { W.target.x = W.target.dog.x; W.target.z = W.target.dog.z; }
      const dd = steer(d, W.target.x, W.target.z, 3.4, dt, 8);
      if (dd < 0.9 || W.stateT <= 0) { W.state = Math.random() < 0.35 ? 'wee' : 'sniff'; W.stateT = rnd(1.4, 2.4); W.sniffMoved = 0; W.smells++; }
    } else { // sniff / wee: the dog is rooted; stand still for it
      stand(d, dt);
      d.mode = 'sniff';
      if (W.target?.dog) d.yaw += angDiff(Math.atan2(W.target.x - d.x, W.target.z - d.z), d.yaw) * Math.min(1, dt * 4);
      W.sniffMoved = Math.max(W.sniffMoved, W.speed);
      if (W.stateT <= 0) {
        if (W.sniffMoved < 1.3) { W.meter = clamp(W.meter + 0.07, 0, 1); flash('Good dog!', 1.5); } else { W.meter = clamp(W.meter - 0.05, 0, 1); flash('You rushed the dog', 1.5); }
        W.state = 'heel'; W.target = null; W.smellT = rnd(6, 11);
      }
    }
    d.happy = Math.max(d.happy, 0.7);
    // -- the lead: slack up to leadSlack, taut at leadMax; beyond that the dog is brought back and the player is tugged
    const hx = pp.x + rx * 0.3, hz = pp.z + rz * 0.3, hy = pp.y + 0.95;
    const ex = d.x - hx, ez = d.z - hz, el = Math.hypot(ex, ez);
    W.tension = clamp((el - WALK.leadSlack) / (WALK.leadMax - WALK.leadSlack), 0, 1);
    if (el > WALK.leadMax) {
      const over = el - WALK.leadMax, ux = ex / el, uz = ez / el;
      if (W.state === 'heel') { d.x -= ux * over; d.z -= uz * over; } // a free dog is dragged in
      else { const tug = Math.min(over, 4 * dt); pp.x += ux * tug; pp.z += uz * tug; W.tugged += tug; } // a rooted dog holds you back
    }
    if (W.tension > 0.75) W.meter = clamp(W.meter - 0.16 * dt, 0, 1);
    else if (W.tension < 0.4 && W.state === 'heel') W.meter = clamp(W.meter + 0.03 * dt, 0, 1);
    if (W.tension > 0.75 && W.msgT <= 0) flash(W.speed > 3.5 ? 'Slow down: the lead is tight!' : 'Wait for your dog!', 1.2);
    setLead(0, hx, hy, hz, d.x + Math.sin(d.yaw) * 0.32 * d.scale[2], d.y + 0.58 * d.scale[1], d.z + Math.cos(d.yaw) * 0.32 * d.scale[2]);
    // -- checkpoints
    const cp = cps[W.cp];
    if (cp) {
      const dp = Math.hypot(pp.x - cp.x, pp.z - cp.z);
      if (dp < WALK.reach) {
        if (Math.hypot(d.x - cp.x, d.z - cp.z) < WALK.reach + 2) {
          W.cp++; W.done++; d.happy = 1;
          if (W.cp >= cps.length) { finish(); return; }
          flash(`${cp.name} ✓  (${W.cp}/${cps.length}) · next: ${cps[W.cp].name}`, 3.5);
        } else if (W.msgT <= 0) flash('Wait for your dog to catch up', 1.2);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The NPC dog walkers: owners on the path with a dog at heel on a lead
  let nearT = 0, nearPath = false;
  function updateWalkers(dt, pp) {
    nearT -= dt;
    if (nearT <= 0) { nearT = 0.5; nearPath = Math.hypot(path[nearestNode(pp.x, pp.z)].x - pp.x, path[nearestNode(pp.x, pp.z)].z - pp.z) < 170; }
    walkers.forEach((w, k) => {
      const d = w.dog;
      if (!nearPath || !d) {
        if (w.active) { w.active = false; if (w.posed) { cast?.setActor(w.key, null, null); w.posed = false; } if (d) d.active = false; setLead(1 + k, 0, 0, 0, 0, 0, 0); }
        return;
      }
      if (!w.active) { // appear somewhere on the path away from the player
        w.active = true;
        for (let tries = 0; tries < 12; tries++) { w.s = rnd(30, pathLen - 30); const p = pointAt(w.s); if (Math.hypot(p.x - pp.x, p.z - pp.z) > 35) break; }
        const p = pointAt(w.s); d.x = p.x; d.z = p.z; d.yaw = Math.atan2(p.ux * w.dir, p.uz * w.dir); d.v = 0; d.active = true; d.flee = 0; d.job = null; d.mode = 'trot'; d.happy = 0.8; d.y = gnd(d.x, d.z);
      }
      w.pauseT -= dt;
      if (w.pause > 0) { w.pause -= dt; } else if (w.pauseT <= 0) { w.pause = rnd(2, 3.5); w.pauseT = rnd(10, 22); }
      const moving = w.pause <= 0, v = moving ? w.v : 0;
      w.s += w.dir * v * dt;
      if (w.s > pathLen - 6) { w.s = pathLen - 6; w.dir = -1; } else if (w.s < 6) { w.s = 6; w.dir = 1; }
      const p = pointAt(w.s), lane = 0.7 * w.dir; // keep to their side of the path
      w.x = p.x - p.uz * lane; w.z = p.z + p.ux * lane;
      w.heading = Math.atan2(p.ux * w.dir, p.uz * w.dir);
      const gy = gnd(w.x, w.z);
      cast?.setActor(w.key, w.model, { x: w.x, y: gy, z: w.z, heading: w.heading, speed: v, ease: 5 }, 'idle');
      w.posed = true;
      // the dog: at heel on the owner's side, nose down when they stop
      const fx = Math.sin(w.heading), fz = Math.cos(w.heading), rx = fz, rz = -fx;
      if (moving) { d.mode = 'trot'; steer(d, w.x + rx * 1.0 + fx * 0.6, w.z + rz * 1.0 + fz * 0.6, clamp(0.5 + v + Math.hypot(w.x - d.x, w.z - d.z) * 1.8, 0.5, 3.5), dt, 8); } else { stand(d, dt); d.mode = 'sniff'; }
      if (Math.hypot(d.x - w.x, d.z - w.z) > 12) { d.x = w.x + rx; d.z = w.z + rz; }
      setLead(1 + k, w.x + rx * 0.2, gy + 0.95, w.z + rz * 0.2, d.x + Math.sin(d.yaw) * 0.32 * d.scale[2], d.y + 0.58 * d.scale[1], d.z + Math.cos(d.yaw) * 0.32 * d.scale[2]);
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  let t = 0;
  function nearStart(pp) { return Math.hypot(pp.x - start.x, pp.z - start.z) < 14; }
  function update(dt, pp, ent) {
    t += dt;
    updateWalk(dt, pp, ent);
    updateWalkers(dt, pp);
    if (Math.abs(pp.x - 560) < 700 && Math.abs(pp.z - 1900) < 700) drawMarkers(t);
    if (hud) {
      let top = '', msg = '';
      if (W.on) {
        top = `Walk the dog · ${W.cp}/${cps.length} · ${fmt(W.t)} · next: ${cps[W.cp].name}`;
        msg = W.msgT > 0 ? W.msg : (W.state === 'sniff' || W.state === 'wee') ? (W.state === 'wee' ? 'Your dog is having a wee: wait' : 'Your dog is sniffing: wait') : 'Y: end the walk';
        hFill.style.width = Math.round(W.meter * 100) + '%';
        hFill.style.background = W.meter > 0.6 ? '#7bd34e' : W.meter > 0.3 ? '#e6c040' : '#d9503a';
        hTop.textContent = top + ' · Good dog';
      } else if (W.summary) { top = W.summary.text; }
      hud.style.display = W.on || W.summary ? 'block' : 'none';
      hBar.style.display = W.on ? 'block' : 'none';
      hMsg.style.display = msg ? 'inline-block' : 'none'; hMsg.textContent = msg;
      if (!W.on) hTop.textContent = top;
      const prompt = !W.on && cm.activeMode === 'person' && nearStart(pp) && dog;
      hPrompt.textContent = prompt ? 'Y: Walk the dog (Royal Botanic Gardens)' : '';
      hPrompt.style.display = prompt ? 'block' : 'none';
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyY' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))) return;
      const ent = cm.getActiveEntity();
      if (W.on) endWalk('Walk cancelled');
      else if (cm.activeMode === 'person' && nearStart(ent.position)) startWalk(ent.position, ent);
    });
  }
  drawMarkers(0);

  return {
    update, groundAt: gnd, state: W, path, cps, start, gates, colliders, pathLen, fenceLen, crossings, runCount, walkers,
    startWalk: () => { const ent = cm.getActiveEntity(); startWalk(ent.position, ent); }, endWalk, inGardens: (x, z) => pip(x, z), group: root,
    stats: () => ({ fenceLen: Math.round(fenceLen), runs: runCount, posts: postXZ.length, colliders: colliders.length, crossings, gates: gates.length, pathLen: Math.round(pathLen), cps: cps.length })
  };
}
