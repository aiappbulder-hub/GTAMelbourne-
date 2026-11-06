// Your own cars from BeamNG.drive mods: drop a mod's .zip on the game (or Menu → Load a car mod). It's opened here in
// the browser, never uploaded: the body's meshes (Collada .dae) with their BeamNG materials (*.materials.json: colour
// map, normal map, paint) become one of your cars, the car button cycles to it, and it's kept in this browser
// (IndexedDB) for next time. BeamNG's soft-body physics doesn't come across: the car drives with the game's handling.
//
// BeamNG vehicle space is Z up, facing -Y; the Collada loader turns Z up into Y up, which puts the front at +Z, the
// game's forward. Meshes for damage, collision, shadows and lower detail are left out.

import * as THREE from 'three/webgpu';

const FFLATE = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js';
const DB = 'gta-melbourne-car-mods', STORE = 'zips';
const SKIP = /collision|shadow|_lod|lod\d|_dmg|dmg_|damage|broken|cracked|proxy|_col$|^col_|helper|dummy|bbox|occluder/i;
const PAINTS = [0x1d3c6e, 0x9b1b1b, 0xe8e8e8, 0x1a1a1a, 0x2f5d3a, 0xc9a227, 0x6e6e74];

// --- storage (the zips themselves, so a car comes back as it was) -------------------------------------------------
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function saveZip(name, buf) {
  try { const d = await db(); d.transaction(STORE, 'readwrite').objectStore(STORE).put(buf, name); } catch { /* storage unavailable */ }
}
async function savedZips() {
  try {
    const d = await db();
    return await new Promise((res) => {
      const out = [], tx = d.transaction(STORE).objectStore(STORE).openCursor();
      tx.onsuccess = () => { const c = tx.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); };
      tx.onerror = () => res(out);
    });
  } catch { return []; }
}
async function forget(name) {
  try { const d = await db(); d.transaction(STORE, 'readwrite').objectStore(STORE).delete(name); } catch { /* fine */ }
}

// --- textures: PNG/JPG through the browser, DDS (DXT1/3/5) decoded here so it works on any renderer ------------------
function decodeDDS(buf) {
  const u32 = new Uint32Array(buf, 0, 32);
  if (u32[0] !== 0x20534444) return null; // 'DDS '
  const h = u32[3], w = u32[4], four = u32[21];
  const fmt = String.fromCharCode(four & 255, (four >> 8) & 255, (four >> 16) & 255, four >>> 24);
  if (!['DXT1', 'DXT3', 'DXT5'].includes(fmt)) return null; // (BC7 and friends: left untextured)
  const src = new Uint8Array(buf, 128), out = new Uint8Array(w * h * 4);
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2), bs = fmt === 'DXT1' ? 8 : 16;
  const c565 = (c, o) => { o[0] = ((c >> 11) & 31) * 255 / 31; o[1] = ((c >> 5) & 63) * 255 / 63; o[2] = (c & 31) * 255 / 31; };
  const cols = [[0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255]];
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const o = (by * bw + bx) * bs, co = fmt === 'DXT1' ? o : o + 8;
    const a0 = src[co] | (src[co + 1] << 8), a1 = src[co + 2] | (src[co + 3] << 8);
    c565(a0, cols[0]); c565(a1, cols[1]);
    for (let k = 0; k < 3; k++) {
      if (a0 > a1 || fmt !== 'DXT1') { cols[2][k] = (2 * cols[0][k] + cols[1][k]) / 3; cols[3][k] = (cols[0][k] + 2 * cols[1][k]) / 3; }
      else { cols[2][k] = (cols[0][k] + cols[1][k]) / 2; cols[3][k] = 0; }
    }
    cols[3][3] = fmt === 'DXT1' && a0 <= a1 ? 0 : 255;
    const bits = src[co + 4] | (src[co + 5] << 8) | (src[co + 6] << 16) | (src[co + 7] << 24);
    // alpha: DXT3 4 bits a pixel, DXT5 two endpoints and 3-bit indices
    let alpha = null;
    if (fmt === 'DXT5') {
      const e0 = src[o], e1 = src[o + 1];
      const tab = e0 > e1 ? [e0, e1, ...[1, 2, 3, 4, 5, 6].map((i) => ((7 - i) * e0 + i * e1) / 7)]
        : [e0, e1, ...[1, 2, 3, 4].map((i) => ((5 - i) * e0 + i * e1) / 5), 0, 255];
      alpha = [];
      let ab = 0n;
      for (let i = 0; i < 6; i++) ab |= BigInt(src[o + 2 + i]) << BigInt(8 * i);
      for (let i = 0; i < 16; i++) alpha.push(tab[Number((ab >> BigInt(3 * i)) & 7n)]);
    } else if (fmt === 'DXT3') {
      alpha = [];
      for (let i = 0; i < 16; i++) alpha.push(((src[o + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17);
    }
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
      const x = bx * 4 + px, y = by * 4 + py;
      if (x >= w || y >= h) continue;
      const i = py * 4 + px, c = cols[(bits >>> (2 * i)) & 3], d = ((h - 1 - y) * w + x) * 4; // (bottom row first, as the PNGs are)
      out[d] = c[0]; out[d + 1] = c[1]; out[d + 2] = c[2]; out[d + 3] = alpha ? alpha[i] : c[3];
    }
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.flipY = false;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}
async function texture(files, path, srgb) {
  if (!path) return null;
  const base = path.split('/').pop().toLowerCase();
  const stem = base.replace(/\.[a-z0-9]+$/, '');
  // the file as named, else the same name in another format (mods often ship .png where the material says .dds)
  const hit = files.byName.get(base) || ['.dds', '.png', '.jpg', '.jpeg'].map((e) => files.byName.get(stem + e)).find(Boolean);
  if (!hit) return null;
  let t = null;
  try {
    if (/\.dds$/i.test(hit.path)) t = decodeDDS(hit.data.buffer.slice(hit.data.byteOffset, hit.data.byteOffset + hit.data.byteLength));
    else {
      const bmp = await createImageBitmap(new Blob([hit.data]), { imageOrientation: 'flipY' });
      t = new THREE.Texture(bmp);
      t.flipY = false;
      t.needsUpdate = true;
    }
  } catch (e) { console.warn('[car mods] texture', hit.path, e); }
  if (t) { t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return t;
}

// BeamNG's material files are JSON with comments and trailing commas allowed
const relaxed = (s) => JSON.parse(s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1'));

// --- a mod's zip to a car --------------------------------------------------------------------------------------------
async function build(name, buf) {
  const { unzipSync } = await import(FFLATE);
  const raw = unzipSync(new Uint8Array(buf));
  const files = { all: Object.entries(raw).map(([path, data]) => ({ path, data })), byName: new Map() };
  for (const f of files.all) files.byName.set(f.path.split('/').pop().toLowerCase(), f);
  const daes = files.all.filter((f) => /\.dae$/i.test(f.path));
  if (!daes.length) throw new Error('no .dae model in this zip (is it a vehicle mod?)');
  // materials by name
  const mats = {};
  for (const f of files.all.filter((x) => /materials?\.json$/i.test(x.path))) {
    try {
      const j = relaxed(new TextDecoder().decode(f.data));
      for (const [k, v] of Object.entries(j)) if (v && typeof v === 'object') { mats[k] = v; if (v.mapTo) mats[v.mapTo] = v; }
    } catch (e) { console.warn('[car mods] materials file', f.path, e.message); }
  }
  const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js');
  const loader = new ColladaLoader();
  // textures the .dae names itself go nowhere (BeamNG's come from the material files)
  loader.manager.setURLModifier(() => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
  const car = new THREE.Group();
  const paint = PAINTS[Math.floor(Math.random() * PAINTS.length)];
  const made = new Map();
  async function material(src) {
    const n = src && src.name ? src.name.replace(/-material$/i, '') : '';
    if (made.has(n)) return made.get(n);
    const def = mats[n] || mats[n.replace(/_\d+$/, '')] || null;
    const st = def && (def.Stages || def.stages) ? (def.Stages || def.stages)[0] || {} : def || {};
    const m = new THREE.MeshStandardMaterial({ name: n, roughness: 0.55, metalness: 0.1 });
    const colour = st.baseColorFactor || st.diffuseColor;
    if (Array.isArray(colour)) m.color.setRGB(colour[0], colour[1], colour[2], THREE.SRGBColorSpace);
    m.map = await texture(files, st.baseColorMap || st.colorMap || st.diffuseMap, true);
    m.normalMap = await texture(files, st.normalMap, false);
    if (st.instanceDiffuse || /paint|body|carpaint/i.test(n)) { m.color.setHex(paint); m.roughness = 0.28; m.metalness = 0.45; }
    if (/glass|window|windscreen|windshield/i.test(n) || (def && def.translucent)) { m.transparent = true; m.opacity = 0.55; m.roughness = 0.05; m.metalness = 0.2; m.color.setHex(0x223038); m.depthWrite = false; }
    if (/chrome|mirror_?refl/i.test(n)) { m.metalness = 1; m.roughness = 0.12; }
    if (/tire|tyre|rubber/i.test(n)) { m.color.setHex(0x161616); m.roughness = 0.9; }
    if (m.map && m.map.image && m.map.format === THREE.RGBAFormat && /decal|grille|badge|alpha/i.test(n)) m.alphaTest = 0.5;
    if (def && def.doubleSided) m.side = THREE.DoubleSide;
    made.set(n, m);
    return m;
  }
  let tris = 0;
  for (const f of daes) {
    let col;
    try { col = loader.parse(new TextDecoder().decode(f.data), ''); } catch (e) { console.warn('[car mods] model', f.path, e); continue; }
    col.scene.updateMatrixWorld(true);
    const meshes = [];
    col.scene.traverse((o) => { if (o.isMesh && !SKIP.test(o.name) && !(o.parent && SKIP.test(o.parent.name))) meshes.push(o); });
    for (const o of meshes) {
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const srcMats = [].concat(o.material);
      const ms = await Promise.all(srcMats.map(material));
      const mesh = new THREE.Mesh(g, Array.isArray(o.material) ? ms : ms[0]);
      mesh.name = o.name;
      mesh.castShadow = true;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      car.add(mesh);
    }
  }
  if (!car.children.length) throw new Error('nothing to draw in the model');
  // stand it on the ground, centred, facing +Z: the long side along Z, in metres
  let box = new THREE.Box3().setFromObject(car);
  const size = box.getSize(new THREE.Vector3());
  if (size.x > size.z * 1.2) car.rotation.y = Math.PI / 2;
  if (Math.max(size.x, size.z) > 30) car.scale.setScalar(0.01); // (centimetres)
  car.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(car);
  const c = box.getCenter(new THREE.Vector3());
  const root = new THREE.Group();
  root.add(car);
  car.position.set(-c.x, -box.min.y, -c.z);
  const len = box.getSize(new THREE.Vector3());
  const label = name.replace(/\.zip$/i, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  return { root, name: label, tris: Math.round(tris), length: Math.max(len.x, len.z) };
}

export function createCarMods({ gameplay, trafficSystem = null, missionSystem = null }) {
  const say = (t, s = 4) => (missionSystem?.sub ? missionSystem.sub(t, s) : console.log('[car mods]', t));
  let n = 0;
  async function add(name, buf, store = true, bringIt = true) {
    say(`Opening ${name}...`, 3);
    const car = await build(name, buf);
    const id = 'mod_' + (++n);
    // the street's sedans become this car too (the latest one loaded), a lighter copy where it's heavy
    if (trafficSystem?.useSedanModel) {
      trafficSystem.useSedanModel(car.root.clone()).then((r) => {
        if (r) console.log(`[car mods] ${car.name} in the traffic: ${r.tris} triangles${r.kept < r.tris ? `, ${r.kept} in its street copy` : ''}`);
      }).catch((e) => console.warn('[car mods] traffic copy', e));
    }
    gameplay.addCar({ id, name: car.name, root: car.root, line: `Your ${car.name}.`, wheelbase: Math.min(3.4, Math.max(2.3, car.length * 0.6)) });
    if (store) saveZip(name, buf);
    if (bringIt) await gameplay.summon(id);
    say(`${car.name} is ready (${(car.tris / 1000).toFixed(0)}k triangles). Walk up and press F; the car button cycles your cars.`, 6);
    return car;
  }
  async function fromFile(file) {
    try { await add(file.name, await file.arrayBuffer()); } catch (e) { console.warn('[car mods]', e); say(`Couldn't load ${file.name}: ${e.message}`, 6); }
  }
  // drop a zip anywhere on the game
  window.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    const fs = [...(e.dataTransfer?.files || [])].filter((f) => /\.zip$/i.test(f.name));
    if (!fs.length) return;
    e.preventDefault();
    fs.forEach(fromFile);
  });
  // or pick one
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip';
  input.multiple = true;
  input.hidden = true;
  input.addEventListener('change', () => { [...input.files].forEach(fromFile); input.value = ''; });
  document.body.append(input);
  // the cars loaded before come back (not brought round: they're in the car button's cycle)
  savedZips().then(async (list) => {
    for (const [name, buf] of list) {
      try { await add(name, buf, false, false); } catch (e) { console.warn('[car mods] saved car', name, e); forget(name); }
    }
  });
  return {
    pick: () => input.click(),
    /** Forget every saved car mod (they go at the next start) */
    async clear() { for (const [name] of await savedZips()) await forget(name); say('Your car mods are forgotten (gone next time you start).', 4); }
  };
}
