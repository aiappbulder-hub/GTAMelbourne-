// Sidney Myer Music Bowl (1959), Kings Domain: the tensile canopy over the stage, the proscenium, the first seating, the
// sloping lawn amphitheatre, four light towers and the paths round it. Built for this game from the real shape (a
// doubly-curved saddle hung from two tall masts at the front, drawn down to the ground behind the stage, lined with
// aluminium-faced plywood). Sited on the "Sidney Myer Music Bowl Reserve" park ring (js/melbourne-geodata.js).
// Four draw calls: canopy (one parametric surface), structure (stage, masts, towers, seats; merged), ground (lawn + paths,
// draped on the terrain) and the night glow (stage lights, merged, basic material).
// buildMusicBowl(scene) runs before the city blocks: its colliders stand in for the surveyed building on the site.
import * as THREE from 'three/webgpu';
import { uniform, vertexColor } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO } from './geodata.js';
import { terrainHeight, terrainRange } from './terrain.js';
import { QUALITY } from './quality.js';

const LOW = QUALITY === 'low';
const PARK = 'Sidney Myer Music Bowl Reserve';

// bowl-local frame: origin at the stage's front-centre on the ground, +z toward the audience, +x to the audience's left
const STAGE_W = 34, STAGE_D = 16, STAGE_H = 1.3;
const CAN_HW = 36, CAN_FRONT = 2, CAN_BACK = -44; // canopy half-width at the front, front/back edge z
const MAST_H = 27;

/** The stage's world position and the park's ring (flat [x, z, ...]) from the surveyed park. */
export function bowlSite() {
  const p = GEO.parks.find((q) => q.name === PARK);
  if (!p) return null;
  const r = p.rings[0];
  let minZ = Infinity, maxZ = -Infinity, sx = 0, n = 0;
  for (let i = 0; i < r.length; i += 2) { sx += r[i]; n++; if (r[i + 1] < minZ) minZ = r[i + 1]; if (r[i + 1] > maxZ) maxZ = r[i + 1]; }
  // the stage sits toward the park's north end (Alexandra Ave); the lawn falls away south toward Linlithgow Ave
  return { x: 390, z: minZ + 62, yaw: 0, cx: sx / n, ring: r, minZ, maxZ };
}

const col = (g, hex) => {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const prep = (g) => { const o = g.index ? g.toNonIndexed() : g; o.deleteAttribute('uv'); return o; };
function box(w, h, d, x, y, z, hex) { // box with its base at y
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return col(prep(g), hex);
}
function cyl(r0, r1, h, x, y, z, hex, seg = 8) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y + h / 2, z); return col(prep(g), hex);
}
function rod(a, b, r, hex) { // a thin cylinder from a to b
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 4);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return col(prep(g), hex);
}

// canopy height at u (0 front .. 1 back), v (-1 .. 1): high at the front corners (the masts), sagging at the front middle
// (a saddle), swept down to the ground at the back corners with a low ridge up the middle
function canopyY(u, v) {
  const v2 = v * v;
  return 2.2 + 22.5 * Math.pow(1 - u, 1.45) * (0.42 + 0.58 * v2) + 3.3 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - v2);
}
const canopyHalfWidth = (u) => CAN_HW * (1 - 0.34 * u);

function buildCanopy() {
  const NU = LOW ? 14 : 22, NV = LOW ? 16 : 26, T = 0.45;
  const pos = [], colr = [], idx = [];
  const top = new THREE.Color(0xd9dde0), under = new THREE.Color(0xb7bdc4);
  const P = (u, v, off) => [v * canopyHalfWidth(u), canopyY(u, v) + off, CAN_FRONT + (CAN_BACK - CAN_FRONT) * u];
  const add = (p, c) => { pos.push(...p); colr.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
  const ti = [], bi = [];
  for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
    const u = i / NU, v = (j / NV) * 2 - 1;
    const band = 0.92 + 0.08 * Math.sin(j * 1.7 + i * 0.3); // silvery panels in bands
    ti.push(add(P(u, v, T), top));
    bi.push(add(P(u, v, 0), new THREE.Color().copy(under).multiplyScalar(band)));
  }
  const W = NV + 1;
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    idx.push(ti[a], ti[c], ti[b], ti[b], ti[c], ti[d]); // top faces up
    idx.push(bi[a], bi[b], bi[c], bi[b], bi[d], bi[c]); // underside faces down
  }
  const strip = (list) => { for (let k = 0; k < list.length - 1; k++) { const [t0, b0] = list[k], [t1, b1] = list[k + 1]; idx.push(t0, b0, t1, t1, b0, b1, t0, t1, b0, t1, b1, b0); } };
  const f = [], bk = [], l = [], r = [];
  for (let j = 0; j <= NV; j++) { f.push([ti[j], bi[j]]); bk.push([ti[NU * W + j], bi[NU * W + j]]); }
  for (let i = 0; i <= NU; i++) { l.push([ti[i * W], bi[i * W]]); r.push([ti[i * W + NV], bi[i * W + NV]]); }
  [f, bk, l, r].forEach(strip);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildMusicBowl(scene) {
  const site = bowlSite();
  if (!site) return { colliders: [], update() {} };
  const { x: sx, z: sz, yaw } = site;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const toWorld = (lx, lz) => ({ x: sx + lx * cs + lz * sn, z: sz - lx * sn + lz * cs });
  // lifted to the highest ground under the stage and canopy; the structure carries a skirt down to the lowest
  const pts = [];
  for (let lx = -CAN_HW; lx <= CAN_HW; lx += 6) for (let lz = CAN_BACK; lz <= STAGE_D / 2; lz += 6) pts.push(toWorld(lx, lz));
  const { lo, hi } = terrainRange(pts);
  const base = Math.max(lo, hi - 0.2);

  const root = new THREE.Group();
  root.name = 'SidneyMyerMusicBowl';
  root.position.set(sx, base, sz);
  root.rotation.y = yaw;
  scene.add(root);

  // ---- canopy (draw call 1)
  const canopy = new THREE.Mesh(buildCanopy(), new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.5, side: THREE.DoubleSide }));
  canopy.name = 'MusicBowlCanopy';
  canopy.castShadow = true;
  root.add(canopy);

  // ---- structure (draw call 2): stage, proscenium, back shell, masts, backstays, seating steps, light towers
  const G = [];
  const concrete = 0xa7a49b, dark = 0x2c2f35, steel = 0xaab1b8, frame = 0x4a4e55;
  const skirt = base - lo + 3;
  G.push(box(STAGE_W + 6, skirt + STAGE_H, STAGE_D, 0, -skirt, -STAGE_D / 2 + 0.5, concrete)); // stage block, down to the low side
  G.push(box(STAGE_W, 0.2, STAGE_D - 1, 0, STAGE_H, -STAGE_D / 2, 0x6b5a45)); // timber deck
  G.push(box(STAGE_W + 6, 12, 1, 0, STAGE_H, -STAGE_D - 0.5, dark)); // back wall
  G.push(box(2.5, 11, 2, -STAGE_W / 2 - 1, STAGE_H, -2, frame), box(2.5, 11, 2, STAGE_W / 2 + 1, STAGE_H, -2, frame)); // proscenium
  G.push(box(STAGE_W + 6, 1.2, 2, 0, STAGE_H + 10.6, -2, frame));
  G.push(box(STAGE_W + 6, 1.4, 6, 0, STAGE_H - 0.4, 3.5, concrete)); // apron steps
  for (let k = 0; k < 4; k++) G.push(box(30 + k * 7, 0.35 + k * 0.1, 1.6, 0, 0, 9 + k * 2.4, 0xb7b4aa)); // first seating tiers
  for (const s of [-1, 1]) { // the two masts and their backstays to ground anchors behind the canopy
    const mx = s * CAN_HW, mz = CAN_FRONT + 1.2, top = new THREE.Vector3(mx, MAST_H, mz);
    G.push(cyl(0.55, 0.38, MAST_H + skirt, mx, -skirt, mz, steel, 10));
    G.push(box(3, 1.6, 3, mx, -skirt, mz, concrete));
    const ax = mx * 1.25, az = CAN_BACK - 14;
    G.push(rod(top, new THREE.Vector3(ax, 0.6, az), 0.12, steel));
    G.push(box(2.4, 1.2, 2.4, ax, -skirt, az, concrete));
  }
  const lamps = []; // light towers on the lawn
  for (const [tx, tz] of [[-34, 24], [34, 24], [-48, 62], [48, 62]]) {
    const w = toWorld(tx, tz), gy = terrainHeight(w.x, w.z) - base;
    G.push(cyl(0.28, 0.2, 15, tx, gy, tz, 0x70767d, 6));
    G.push(box(3.4, 0.9, 0.6, tx, gy + 15, tz, 0x30343a));
    lamps.push({ x: tx, y: gy + 15.2, z: tz - 0.4 });
  }
  const structure = new THREE.Mesh(mergeGeometries(G), new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.15 }));
  structure.name = 'MusicBowlStructure';
  structure.castShadow = structure.receiveShadow = true;
  root.add(structure);

  // ---- night glow (draw call 4): stage lights under the canopy's front edge, the back wash, lamp bars on the towers
  const nightU = uniform(0.12);
  const glowMat = new THREE.MeshBasicNodeMaterial();
  glowMat.colorNode = vertexColor().mul(nightU);
  const L = [];
  for (let k = -5; k <= 5; k++) L.push(box(1.5, 0.35, 0.6, k * 5.2, canopyY(0.05, k / 5.5) - 0.4, CAN_FRONT - 2.2, k % 2 ? 0xffd9a0 : 0x9fc4ff));
  for (let k = -3; k <= 3; k++) L.push(box(1.4, 0.3, 0.5, k * 4.4, STAGE_H + 8.6, -STAGE_D + 0.3, k % 2 ? 0xff9a6e : 0xffe0a0));
  for (const p of lamps) L.push(box(3.0, 0.6, 0.3, p.x, p.y, p.z, 0xfff1c8));
  const glow = new THREE.Mesh(mergeGeometries(L), glowMat);
  glow.name = 'MusicBowlGlow';
  root.add(glow);

  // ---- ground (draw call 3): the lawn fan and its paths, draped on the terrain (world space)
  const parts = [];
  const NR = LOW ? 9 : 14, NA = LOW ? 14 : 22, R0 = 12, R1 = 112, HALF = 1.0;
  const grass = new THREE.Color(0x5f8a3a), grass2 = new THREE.Color(0x6a9640), path = new THREE.Color(0xcbc1a8);
  {
    const gp = [], gc = [], gi = [], W = NA + 1;
    for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) {
      const r = R0 + (R1 - R0) * i / NR, a = (j / NA * 2 - 1) * HALF;
      const w = toWorld(Math.sin(a) * r, 2 + Math.cos(a) * r);
      gp.push(w.x, terrainHeight(w.x, w.z) + 0.1, w.z);
      const c = (i + j) & 1 ? grass : grass2;
      gc.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) { const a = i * W + j; gi.push(a, a + W, a + 1, a + 1, a + W, a + W + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    g.setIndex(gi);
    parts.push(g);
  }
  const pathStrip = (pl, hw) => { // a path along the polyline of local points, hw metres each side
    const p = [], c = [], ix = [];
    for (let k = 0; k < pl.length; k++) {
      const a = pl[Math.max(0, k - 1)], b = pl[Math.min(pl.length - 1, k + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      for (const s of [-1, 1]) {
        const w = toWorld(pl[k][0] - dz * hw * s, pl[k][1] + dx * hw * s);
        p.push(w.x, terrainHeight(w.x, w.z) + 0.16, w.z);
        c.push(path.r, path.g, path.b);
      }
      if (k) { const q = k * 2; ix.push(q - 2, q - 1, q, q, q - 1, q + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.setIndex(ix);
    parts.push(g);
  };
  const arc = (r, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + (a1 - a0) * k / n; return [Math.sin(a) * r, 2 + Math.cos(a) * r]; });
  pathStrip(arc(R1 + 3, -HALF - 0.1, HALF + 0.1), 1.6); // rim path round the lawn
  pathStrip(arc(46, -HALF, HALF), 1.2); // mid-lawn promenade
  pathStrip(arc(R0 - 3, -HALF - 0.25, HALF + 0.25), 1.6); // path behind the first seating
  for (const a of [-HALF, 0, HALF]) pathStrip([[Math.sin(a) * R0, 2 + Math.cos(a) * R0], [Math.sin(a) * R1, 2 + Math.cos(a) * R1]], 1.2); // aisles
  pathStrip([[-CAN_HW - 4, -4], [-CAN_HW - 4, -CAN_HW * 1.1]], 1.2); // service paths round the sides of the stage
  pathStrip([[CAN_HW + 4, -4], [CAN_HW + 4, -CAN_HW * 1.1]], 1.2);
  const lawn = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1 }));
  lawn.name = 'MusicBowlGround';
  lawn.receiveShadow = true;
  scene.add(lawn);

  // ---- colliders: stage block, mast and anchor footings; one slab over the canopy, above head height, so the surveyed
  // building on the site is dropped (buildings.js) while walking under the canopy stays free
  const colliders = [];
  const rect = (lx0, lx1, lz0, lz1, minY, maxY) => {
    const c4 = [toWorld(lx0, lz0), toWorld(lx1, lz0), toWorld(lx0, lz1), toWorld(lx1, lz1)];
    colliders.push({ minX: Math.min(...c4.map((p) => p.x)), maxX: Math.max(...c4.map((p) => p.x)), minZ: Math.min(...c4.map((p) => p.z)), maxZ: Math.max(...c4.map((p) => p.z)),
      minY, groundY: lo - 3, maxY, landmark: 'musicbowl' });
  };
  rect(-STAGE_W / 2 - 3, STAGE_W / 2 + 3, -STAGE_D - 1, 3.5, lo - 3, base + STAGE_H + 12);
  for (const s of [-1, 1]) {
    rect(s * CAN_HW - 1.2, s * CAN_HW + 1.2, CAN_FRONT, CAN_FRONT + 2.4, lo - 3, base + MAST_H);
    rect(s * CAN_HW * 1.25 - 1.2, s * CAN_HW * 1.25 + 1.2, CAN_BACK - 15.2, CAN_BACK - 12.8, lo - 3, base + 1.2);
  }
  rect(-CAN_HW, CAN_HW, CAN_BACK, CAN_FRONT, base + 7, base + 26);
  rect(-CAN_HW * 0.7, CAN_HW * 0.7, CAN_BACK - 0.5, CAN_BACK + 7, lo - 3, base + 4); // where the canopy comes down behind the stage

  function update(dt, { night = 0 } = {}) { nightU.value = 0.12 + night * 2.4; }
  console.info(`[music-bowl] placed at ${sx.toFixed(0)}, ${sz.toFixed(0)} base ${base.toFixed(1)}`);
  return { group: root, ground: lawn, colliders, update, site, base };
}
