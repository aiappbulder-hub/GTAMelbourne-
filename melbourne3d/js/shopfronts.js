// Melbourne shopfronts: recognisable ground-floor shops with canvas-texture signs, striped awnings and windows that
// glow at night. Specialty cafes (footpath tables and chairs), a "7-Twelve" convenience store, kebab and souvlaki
// shops, dumpling houses, op shops, bottle-os and pho places in the CBD; a Lygon St trattoria strip in Carlton;
// Chinatown on Little Bourke St (red arches and lanterns); Brunswick St-style shops in Fitzroy.
//
// How: shop positions are found once at start by probing from each street's centreline to the first real building
// footprint (REAL_BUILDINGS), so signs sit on actual facades. Everything is stored as plain data in 120 m cells; every
// half second the cells near the camera are packed into a handful of InstancedMeshes (one per sign tile, plus awnings,
// windows, tables, chairs, lanterns), so only nearby shops cost anything. Names are invented; no real trademarks.
import * as THREE from 'three/webgpu';
import { REAL_BUILDINGS } from './city-buildings.js';
import { polygonContains } from './building-collision.js';
import { ROADS } from './city-config.js';
import { GEO } from './melbourne-geodata.js';
import { terrainHeight } from './terrain.js';

const CELL = 120;
const RANGE = 300; // m: shops further than this are not drawn
const STEP = 6.5; // m between candidate shops along a street
const hash = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };

// ---- the sign atlas: 4 x 8 tiles of 512 x 128 ---------------------------------------------------------------------
const TW = 512, TH = 128, COLS = 4, ROWS = 8;
// kind: what the shop is (cafe gets tables); zone: where it appears
const SIGNS = [
  { t: 'BEAN COUNTER', s: 'specialty espresso', bg: '#1d1d1b', fg: '#f4e7c8', ac: '#c98a3c', kind: 'cafe', zones: ['cbd', 'fitz', 'lygon'] },
  { t: 'Flat White Society', s: 'single origin', bg: '#2f4a3d', fg: '#f8f3e6', ac: '#e9b44c', kind: 'cafe', zones: ['cbd', 'fitz'] },
  { t: 'THE DAILY GRIND', s: 'coffee & toasties', bg: '#6a3b24', fg: '#fff1d6', ac: '#f0a04b', kind: 'cafe', zones: ['cbd', 'fitz', 'lygon'] },
  { t: 'Oat & Bean', s: 'cold drip · batch brew', bg: '#e9dfc9', fg: '#262626', ac: '#b5532a', kind: 'cafe', zones: ['cbd', 'fitz'] },
  { t: '7-TWELVE', s: 'open late', bg: '#ffffff', fg: '#1f1f1f', ac: '#ee7b1f', kind: 'conv', zones: ['cbd', 'fitz'], stripes: true },
  { t: 'Kebab Palace', s: 'souvlaki · felafel · HSP', bg: '#b3261e', fg: '#ffffff', ac: '#ffd23f', kind: 'kebab', zones: ['cbd', 'fitz'] },
  { t: 'SOUVLAKI EXPRESS', s: 'gyros · chips · late', bg: '#1a4fa3', fg: '#ffffff', ac: '#fff', kind: 'kebab', zones: ['cbd', 'lygon', 'fitz'] },
  { t: 'Dumpling House', s: 'handmade · xiao long bao', bg: '#8e1b16', fg: '#ffe9a8', ac: '#ffd23f', kind: 'dumpling', zones: ['cbd', 'china'] },
  { t: 'Dim Sum Garden', s: 'yum cha daily', bg: '#a3201a', fg: '#fff3c9', ac: '#ffcf4a', kind: 'dumpling', zones: ['china'] },
  { t: 'Op Shop', s: 'second chance · all proceeds to charity', bg: '#3b6ea5', fg: '#ffffff', ac: '#ffd23f', kind: 'opshop', zones: ['cbd', 'fitz'] },
  { t: 'Thrift & Found', s: 'vintage · retro · denim', bg: '#6a3a73', fg: '#fff4d1', ac: '#ff9ec7', kind: 'opshop', zones: ['fitz', 'cbd'] },
  { t: 'BOTTLE-O', s: 'cold beer · wine · spirits', bg: '#14451f', fg: '#ffd23f', ac: '#fff', kind: 'bottlo', zones: ['cbd', 'fitz'] },
  { t: 'Cellar Door Liquor', s: 'drive-thru · open til 11', bg: '#40202a', fg: '#f0d9a4', ac: '#c9a24c', kind: 'bottlo', zones: ['cbd'] },
  { t: 'PHO SAIGON', s: 'beef noodle soup · bánh mì', bg: '#c2331f', fg: '#ffffff', ac: '#ffe066', kind: 'pho', zones: ['cbd', 'china'] },
  { t: 'Pho 24', s: 'open 7 days', bg: '#165c3b', fg: '#ffffff', ac: '#ffe066', kind: 'pho', zones: ['cbd', 'china'] },
  { t: 'Trattoria Bella Lygon', s: 'pasta · vino · dal 1962', bg: '#7a1d1d', fg: '#fff7e0', ac: '#4ea05a', kind: 'trat', zones: ['lygon'], stripes2: true },
  { t: 'Pizzeria Da Luigi', s: 'wood fired · parma night tues', bg: '#2f6b3a', fg: '#ffffff', ac: '#e0342f', kind: 'trat', zones: ['lygon'] },
  { t: 'Gelato Carlton', s: 'amaretto · pistacchio · stracciatella', bg: '#f6d9e0', fg: '#8a1e4a', ac: '#2f8f6d', kind: 'trat', zones: ['lygon'] },
  { t: 'Caffe Roma', s: 'espresso bar · cannoli', bg: '#1b2a4d', fg: '#f6ecd0', ac: '#c9a24c', kind: 'cafe', zones: ['lygon'] },
  { t: 'Peking Duck House', s: 'banquets · BYO', bg: '#9c1c15', fg: '#ffd96b', ac: '#ffd96b', kind: 'dumpling', zones: ['china'] },
  { t: 'HOT POT PALACE', s: 'all you can eat', bg: '#2a0e0e', fg: '#ff7a3d', ac: '#ffd23f', kind: 'dumpling', zones: ['china'] },
  { t: 'Bubble Tea Lab', s: 'brown sugar · taro · cheese foam', bg: '#6fd0c0', fg: '#2b1b4d', ac: '#ff7ab8', kind: 'cafe', zones: ['china', 'cbd'] },
  { t: 'Vinyl Cellar', s: 'records · tapes · cafe', bg: '#191919', fg: '#ff4d6d', ac: '#4de1ff', kind: 'opshop', zones: ['fitz'] },
  { t: 'Rooftop Bar', s: 'craft beer · live music', bg: '#2b1b4d', fg: '#ffd23f', ac: '#ff4d9a', kind: 'bottlo', zones: ['fitz'] },
  { t: 'Ink & Barber', s: 'tattoo · cuts · shaves', bg: '#111', fg: '#f2f2f2', ac: '#d6272b', kind: 'opshop', zones: ['fitz'] },
  { t: 'Vegan Bakehouse', s: 'sourdough · croissants', bg: '#f3e6c9', fg: '#2e5d2b', ac: '#d96a3b', kind: 'cafe', zones: ['fitz', 'cbd'] }
];

function drawAtlas() {
  const c = document.createElement('canvas');
  c.width = TW * COLS; c.height = TH * ROWS;
  const g = c.getContext('2d');
  SIGNS.forEach((d, i) => {
    const x = (i % COLS) * TW, y = Math.floor(i / COLS) * TH;
    g.fillStyle = d.bg; g.fillRect(x, y, TW, TH);
    if (d.stripes) { // green, orange and red stripes of the convenience-store chain parody
      const cols = ['#1a9a4a', '#ee7b1f', '#d6272b'];
      cols.forEach((col, k) => { g.fillStyle = col; g.fillRect(x, y + TH - 30 + k * 10, TW, 10); g.fillRect(x, y + k * 6, TW, 6); });
    }
    if (d.stripes2) { g.fillStyle = '#fff'; g.fillRect(x, y + TH - 14, TW / 3, 14); g.fillStyle = '#4ea05a'; g.fillRect(x + TW / 3, y + TH - 14, TW / 3, 14); g.fillStyle = '#e0342f'; g.fillRect(x + 2 * TW / 3, y + TH - 14, TW / 3, 14); }
    g.strokeStyle = d.ac; g.lineWidth = 5; g.strokeRect(x + 5, y + 5, TW - 10, TH - 10);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 58;
    g.font = `800 ${size}px "Trebuchet MS", Arial, sans-serif`;
    while (g.measureText(d.t).width > TW - 40 && size > 20) { size -= 3; g.font = `800 ${size}px "Trebuchet MS", Arial, sans-serif`; }
    g.fillStyle = d.fg; g.fillText(d.t, x + TW / 2, y + (d.s ? 50 : 64));
    if (d.s) {
      size = 24; g.font = `600 ${size}px Arial, sans-serif`;
      while (g.measureText(d.s).width > TW - 50 && size > 12) { size -= 1; g.font = `600 ${size}px Arial, sans-serif`; }
      g.fillStyle = d.ac; g.fillText(d.s, x + TW / 2, y + 92);
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

function drawGate() { // the Chinatown arch's board
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#a3141a'; g.fillRect(0, 0, 1024, 160);
  g.strokeStyle = '#ffd23f'; g.lineWidth = 8; g.strokeRect(8, 8, 1008, 144);
  g.fillStyle = '#ffd23f'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 86px "Trebuchet MS", Arial, sans-serif';
  g.fillText('MELBOURNE CHINATOWN', 512, 84);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#d8d8d8' : '#ffffff'; g.fillRect(i * 8, 0, 8, 8); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.magFilter = THREE.NearestFilter;
  return tex;
}

// ---- finding facades ------------------------------------------------------------------------------------------------
function buildIndex() {
  const bins = new Map();
  const key = (x, z) => `${Math.floor(x / 64)},${Math.floor(z / 64)}`;
  for (const b of REAL_BUILDINGS) {
    if (b.height < 6) continue;
    for (let x = Math.floor(b.minX / 64); x <= Math.floor(b.maxX / 64); x++) {
      for (let z = Math.floor(b.minZ / 64); z <= Math.floor(b.maxZ / 64); z++) {
        const k = `${x},${z}`;
        let l = bins.get(k); if (!l) bins.set(k, (l = []));
        l.push(b);
      }
    }
  }
  return (x, z) => {
    const l = bins.get(key(x, z));
    if (!l) return false;
    for (const b of l) {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      for (const p of b.polygons) if (polygonContains(p, x, z)) return true;
    }
    return false;
  };
}

const G = GEO.grid;
const ZONE_OF = { LYGON: 'lygon', BRUNSWICK: 'fitz' };

export function createShopfronts({ scene, lightingSystem = null, getFocus }) {
  const group = new THREE.Group();
  group.name = 'Shopfronts';
  scene.add(group);
  const inside = buildIndex();
  const cells = new Map();
  const counts = { sign: 0, awn: 0, win: 0, table: 0, chair: 0, lantern: 0 };
  const occupied = new Set();
  const add = (it) => {
    const k = `${Math.floor(it.x / CELL)},${Math.floor(it.z / CELL)}`;
    let l = cells.get(k); if (!l) cells.set(k, (l = []));
    l.push(it); counts[it.k]++;
  };

  // lines: arrays of [x, z] points (centrelines) with the zone chooser
  function wallAt(px, pz, nx, nz) {
    for (let d = 4.5; d < 27; d += 0.5) {
      if (inside(px + nx * d, pz + nz * d) && inside(px + nx * (d + 1.2), pz + nz * (d + 1.2)) && !inside(px + nx * (d - 0.5), pz + nz * (d - 0.5))) return d - 0.2;
    }
    return -1;
  }
  function walk(pts, zoneOf) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 8) continue;
      const tx = (bx - ax) / L, tz = (bz - az) / L;
      for (let s = STEP / 2; s < L - 2; s += STEP) {
        const px = ax + tx * s, pz = az + tz * s;
        const zone = zoneOf(px, pz);
        if (!zone) continue;
        for (const side of [-1, 1]) {
          const nx = -tz * side, nz = tx * side;
          const seed = Math.round(px) * 7 + Math.round(pz) * 13 + side;
          if (hash(seed, 1) > (zone === 'cbd' ? 0.5 : 0.75)) continue;
          const d = wallAt(px, pz, nx, nz);
          if (d < 0) continue;
          // the facade must be flat along the shop
          if (Math.abs(wallAt(px + tx * 3.2, pz + tz * 3.2, nx, nz) - d) > 0.6 || Math.abs(wallAt(px - tx * 3.2, pz - tz * 3.2, nx, nz) - d) > 0.6) continue;
          const key = `${Math.round(px / 4)},${Math.round(pz / 4)},${side}`;
          if (occupied.has(key)) continue;
          occupied.add(key);
          const wx = px + nx * d, wz = pz + nz * d, gy = terrainHeight(wx, wz);
          const pool = SIGNS.map((sg, idx) => ({ sg, idx })).filter((o) => o.sg.zones.includes(zone));
          const pick = pool[Math.floor(hash(seed, 2) * pool.length)];
          if (!pick) continue;
          const fx = -nx, fz = -nz, ry = Math.atan2(fx, fz); // facing the street
          const base = { x: wx + fx * 0.06, z: wz + fz * 0.06, ry };
          add({ ...base, k: 'sign', tile: pick.idx, y: gy + 4.3 });
          add({ ...base, k: 'win', y: gy + 1.65, c: pick.sg.kind === 'bottlo' ? 0xffb35a : pick.sg.kind === 'cafe' ? 0xffd9a0 : pick.sg.kind === 'conv' ? 0xf4fff4 : 0xffe6b0 });
          const awnCols = [0xc0392b, 0x2e7d4f, 0x1f4e9c, 0x222222, 0xe0a030, 0x7a2a6a];
          add({ x: wx + fx * 0.1, z: wz + fz * 0.1, ry, k: 'awn', y: gy + 3.35, c: pick.sg.kind === 'conv' ? 0xee7b1f : awnCols[Math.floor(hash(seed, 3) * awnCols.length)] });
          if (pick.sg.kind === 'cafe' || pick.sg.kind === 'trat') {
            for (let t = 0; t < 2; t++) {
              const along = (t - 0.5) * 2.2, out = 2.3;
              const tx0 = wx + fx * out + tx * along, tz0 = wz + fz * out + tz * along;
              add({ x: tx0, z: tz0, y: gy, k: 'table', ry: 0, c: 0x2a2a2a });
              for (let ch = 0; ch < 2; ch++) {
                const sx = ch ? 1 : -1;
                add({ x: tx0 + tx * 0.62 * sx, z: tz0 + tz * 0.62 * sx, y: gy, k: 'chair', ry: Math.atan2(-tx * sx, -tz * sx), c: hash(seed + ch, 5) > 0.5 ? 0x8a5a2e : 0x2f6b4f });
              }
            }
          }
          if (zone === 'china') add({ x: wx + fx * 0.9, z: wz + fz * 0.9, y: gy + 3.7, k: 'lantern', ry: 0 });
        }
      }
    }
  }

  // CBD: the Hoddle Grid's main streets, little streets and avenues, Little Bourke split at Chinatown
  const ext = G.extent;
  const lines = [];
  for (const s of G.streets) lines.push({ pts: [[ext.minX, s.at], [ext.maxX, s.at]], zone: () => 'cbd' });
  for (const s of G.little) {
    if (s.name === 'Little Bourke Street') lines.push({ pts: [[ext.minX, s.at], [ext.maxX, s.at]], zone: (x) => (x > 0 ? 'china' : 'cbd') });
    else lines.push({ pts: [[ext.minX, s.at], [ext.maxX, s.at]], zone: () => 'cbd' });
  }
  for (const a of G.avenues) lines.push({ pts: [[a.at, ext.minZ], [a.at, ext.maxZ]], zone: () => 'cbd' });
  for (const r of ROADS) {
    if (r.raw === 'LYGON STREET') lines.push({ pts: r.pts.map((p) => [p.x, p.z]), zone: (x, z) => (z > -1650 && z < -900 ? 'lygon' : null) });
    else if (r.raw === 'BRUNSWICK STREET') lines.push({ pts: r.pts.map((p) => [p.x, p.z]), zone: () => 'fitz' });
  }
  for (const l of lines) walk(l.pts, l.zone);

  // Chinatown: lanterns strung down and across Little Bourke St between its two red arches
  const lbz = G.little.find((s) => s.name === 'Little Bourke Street').at;
  const GATES = [30, 470];
  for (let x = GATES[0] + 8; x < GATES[1]; x += 9) {
    add({ x, z: lbz - 3.2, y: 6.1, k: 'lantern', ry: 0 });
    add({ x, z: lbz + 3.2, y: 6.1, k: 'lantern', ry: 0 });
    add({ x: x + 4.5, z: lbz, y: 6.4, k: 'lantern', ry: 0 });
  }

  // ---- meshes ----------------------------------------------------------------------------------------------------
  const atlas = drawAtlas();
  const signMats = [], signMeshes = [];
  const MAXS = 90;
  SIGNS.forEach((d, i) => {
    const geo = new THREE.PlaneGeometry(4.2, 1.05);
    const u0 = (i % COLS) / COLS, v1 = 1 - Math.floor(i / COLS) / ROWS;
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / COLS, v1 - (1 - uv.getY(k)) / ROWS);
    const mat = new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false });
    const m = new THREE.InstancedMesh(geo, mat, MAXS);
    m.frustumCulled = false; m.count = 0; m.name = `Sign:${d.t}`;
    signMats.push(mat); signMeshes.push(m); group.add(m);
  });
  const glowMats = [];
  function inst(geo, mat, max, name) {
    const m = new THREE.InstancedMesh(geo, mat, max);
    m.frustumCulled = false; m.count = 0; m.name = name;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    group.add(m);
    return m;
  }
  const awnGeo = new THREE.BoxGeometry(3.9, 0.08, 1.7); awnGeo.rotateX(0.42); awnGeo.translate(0, 0, 0.8);
  const awnMat = new THREE.MeshBasicMaterial({ map: stripeTexture(), toneMapped: false });
  const winMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const lanMat = new THREE.MeshBasicMaterial({ color: 0xff3b24, toneMapped: false });
  const meshes = {
    awn: inst(awnGeo, awnMat, 700, 'ShopAwnings'),
    win: inst(new THREE.PlaneGeometry(3.7, 2.3), winMat, 700, 'ShopWindows'),
    table: inst(new THREE.CylinderGeometry(0.38, 0.38, 0.75, 10).translate(0, 0.375, 0), new THREE.MeshLambertMaterial(), 400, 'CafeTables'),
    chair: inst(new THREE.BoxGeometry(0.42, 0.9, 0.42).translate(0, 0.45, 0), new THREE.MeshLambertMaterial(), 800, 'CafeChairs'),
    lantern: inst(new THREE.SphereGeometry(0.3, 8, 6).scale(1, 1.25, 1), lanMat, 500, 'Lanterns')
  };
  meshes.lantern.instanceColor.array.fill(1);
  glowMats.push(awnMat, winMat);

  // the two red arches
  const arches = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0xb01a1a }), gold = new THREE.MeshBasicMaterial({ color: 0xf2c230, toneMapped: false });
  const boardMat = new THREE.MeshBasicMaterial({ map: drawGate(), toneMapped: false });
  for (const gx of GATES) {
    const gr = new THREE.Group();
    for (const sz of [-7.4, 7.4]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 7.2, 1.1), red); p.position.set(0, 3.6, sz); gr.add(p);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 1.5), gold); base.position.set(0, 0.4, sz); gr.add(base);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 17.5), red); beam.position.set(0, 7.5, 0); gr.add(beam);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 19.5), gold); roof.position.set(0, 8.15, 0); gr.add(roof);
    for (const sz of [-1, 1]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 2.2), gold); tip.position.set(0, 8.5, sz * 9.4); tip.rotation.z = 0.25; gr.add(tip); }
    for (const face of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), boardMat); b.position.set(face * 0.85, 7.5, 0); b.rotation.y = face * Math.PI / 2; gr.add(b); }
    gr.position.set(gx, terrainHeight(gx, lbz), lbz);
    arches.add(gr);
  }
  group.add(arches);

  // ---- distance chunking ----------------------------------------------------------------------------------------------
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  let lastX = 1e9, lastZ = 1e9, lastNight = -1, timer = 0;
  const near = { sign: 0, awn: 0, win: 0, table: 0, chair: 0, lantern: 0 };
  function repack(fx, fz) {
    const n = { sign: new Array(SIGNS.length).fill(0), awn: 0, win: 0, table: 0, chair: 0, lantern: 0 };
    for (const k of Object.keys(near)) near[k] = 0;
    const r = Math.ceil(RANGE / CELL);
    const cx = Math.floor(fx / CELL), cz = Math.floor(fz / CELL);
    for (let x = cx - r; x <= cx + r; x++) {
      for (let z = cz - r; z <= cz + r; z++) {
        const l = cells.get(`${x},${z}`);
        if (!l) continue;
        for (const it of l) {
          if ((it.x - fx) ** 2 + (it.z - fz) ** 2 > RANGE * RANGE) continue;
          dummy.position.set(it.x, it.y, it.z); dummy.rotation.set(0, it.ry, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          if (it.k === 'sign') {
            const m = signMeshes[it.tile];
            if (n.sign[it.tile] >= MAXS) continue;
            m.setMatrixAt(n.sign[it.tile]++, dummy.matrix); near.sign++;
          } else {
            const m = meshes[it.k];
            if (n[it.k] >= m.instanceMatrix.count) continue;
            m.setMatrixAt(n[it.k], dummy.matrix);
            if (it.k !== 'lantern') { col.setHex(it.c ?? 0xffffff); m.setColorAt(n[it.k], col); }
            n[it.k]++; near[it.k]++;
          }
        }
      }
    }
    signMeshes.forEach((m, i) => { m.count = n.sign[i]; m.instanceMatrix.needsUpdate = true; });
    for (const k of Object.keys(meshes)) {
      meshes[k].count = n[k]; meshes[k].instanceMatrix.needsUpdate = true;
      if (meshes[k].instanceColor) meshes[k].instanceColor.needsUpdate = true;
    }
  }
  function glow() {
    const night = lightingSystem?.uNightFactor?.value ?? 0;
    const s = 0.72 + night * 0.9; // signs and windows light up at night
    for (const m of signMats) m.color.setScalar(s);
    winMat.color.setScalar(0.3 + night * 0.9);
    awnMat.color.setScalar(0.75 + night * 0.35);
    lanMat.color.setRGB(1, 0.23, 0.14).multiplyScalar(0.8 + night * 0.9);
  }
  function update(dt, force = false) {
    timer -= dt;
    if (timer > 0 && !force) return;
    timer = 0.5;
    const f = getFocus();
    if (force || (f.x - lastX) ** 2 + (f.z - lastZ) ** 2 > 400) { lastX = f.x; lastZ = f.z; repack(f.x, f.z); }
    const night = lightingSystem?.uNightFactor?.value ?? 0;
    if (Math.abs(night - lastNight) > 0.01) { lastNight = night; glow(); }
  }
  glow();
  const api = {
    group, counts, near, update, repack: () => { const f = getFocus(); repack(f.x, f.z); },
    get nearCount() { return near.sign; },
    stats: () => ({ total: { ...counts }, near: { ...near }, signTypes: SIGNS.length })
  };
  return api;
}
