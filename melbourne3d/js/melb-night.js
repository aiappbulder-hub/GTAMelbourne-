// Melbourne after dark: Flinders St Station glow + uplights, hand-placed laneways (bluestone, festoon
// lights, bins, cafe tables), Crown's gas fire pillars on the Yarra's south bank and a river cruise boat.
// Everything is distance-gated and instanced; fire/boat/lanes are skipped entirely when far from the camera.
import * as THREE from 'three/webgpu';
import { uniform, vec3, color as tslColor } from 'three/tsl';
import { terrainHeight, drapeGeometry } from './terrain.js';
import { REAL_BUILDINGS } from './city-buildings.js';
import { QUALITY } from './quality.js';

const LOW = QUALITY === 'low';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function bluestoneTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a4e55'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 64) {
      const o = (y / 32) % 2 ? 32 : 0, v = 62 + rnd() * 26;
      g.fillStyle = `rgb(${v},${v + 3},${v + 10})`;
      g.fillRect(x + o + 1.5, y + 1.5, 61, 29);
    }
  }, [1, 1]);
}
// Laneways: a nominal centre line (x) and the stretch of block it crosses (z0..z1, kerb to kerb), at most hw wide each side.
// The paving, festoons, bins and tables are fitted to the real gap between the surveyed building footprints (laneGaps):
// rows where a building stands across the line get nothing, so nothing pokes out of a wall or past a facade.
// Blocks: Flinders Lane to Flinders St is z 125..227, Collins St to Flinders Lane z 19..116 (js/melbourne-geodata.js).
const LANES = [
  { name: 'Degraves St', x: -75, z0: 125.3, z1: 226.7, hw: 3.2, tables: 8 },
  { name: 'Centre Place', x: -72.3, z0: 19.3, z1: 115.7, hw: 2, tables: 4 },
  { name: 'Hosier Lane', x: 75.5, z0: 125.3, z1: 226.7, hw: 4, tables: 2, oneWall: true }, // (its west side is open ground in the survey)
  { name: 'AC/DC Lane', x: 97.8, z0: 125.3, z1: 226.7, hw: 1.8, tables: 0 }
];
const SW_TOP = 0.22; // the footpath slab's top over the block (js/city-grid.js): the lane is paved on it

// The footprint test (outer ring minus holes) over the buildings near a lane
function inRing(r, x, z) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
}
function coveredBy(list, x, z) {
  for (const b of list) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    for (const p of b.polygons) if (inRing(p.outer, x, z) && !p.holes.some((h) => inRing(h, x, z))) return true;
  }
  return false;
}
// Rows of a lane (every 0.5 m of z): the free interval [a, b] around the centre line between the footprints, and whether a
// wall bounds each side within reach (festoon strings need both). A row whose centre is built over (and has no free
// spot within 1.5 m) is null.
export function laneGaps(L, buildings = REAL_BUILDINGS) {
  const reach = L.hw + 1.5, step = 0.25;
  const list = buildings.filter((b) => b.maxX > L.x - reach - 2 && b.minX < L.x + reach + 2 && b.maxZ > L.z0 - 2 && b.minZ < L.z1 + 2);
  const rows = [];
  for (let z = L.z0 + 0.25; z < L.z1; z += 0.5) {
    let c = null;
    for (const d of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) if (!coveredBy(list, L.x + d, z)) { c = L.x + d; break; }
    if (c === null) { rows.push(null); continue; }
    let a = c, b = c, wa = false, wb = false;
    while (a - step >= L.x - reach) { if (coveredBy(list, a - step, z)) { wa = true; break; } a -= step; }
    while (b + step <= L.x + reach) { if (coveredBy(list, b + step, z)) { wb = true; break; } b += step; }
    // open on a side (a car park, a forecourt): pave only the lane's own width
    if (!wa) a = Math.max(a, L.x - L.hw);
    if (!wb) b = Math.min(b, L.x + L.hw);
    rows.push(b - a >= 1 ? { z, a, b, wa, wb } : null);
  }
  // a lane is a corridor: keep the rows walled on both sides (or one, for L.oneWall), bridge breaks of up to 6 m between them (a doorway, a
  // gap between two buildings) and the mouths of up to 12 m to the kerb (across the footpath). Open ground beyond that
  // (a forecourt, a car park, the cathedral's close) stays footpath.
  const keep = rows.map((r) => !!(r && (L.oneWall ? r.wa || r.wb : r.wa && r.wb)));
  const BR = 12, MOUTH = 24; // rows (0.5 m each): 6 m breaks, 12 m mouths (Flinders St's footpath is wide)
  let last = -1;
  for (let i = 0; i < rows.length; i++) {
    if (!keep[i]) continue;
    const from = last < 0 ? (i <= MOUTH ? 0 : i) : (i - last - 1 <= BR ? last + 1 : i);
    // (only through open rows: a mouth or break with a building across it stays unpaved)
    if (rows.slice(from, i).every(Boolean)) for (let k = from; k < i; k++) keep[k] = true;
    last = i;
  }
  if (last >= 0 && rows.length - 1 - last <= MOUTH && rows.slice(last + 1).every(Boolean)) for (let k = last + 1; k < rows.length; k++) keep[k] = true;
  return rows.map((r, i) => (keep[i] ? r : null));
}

const RIVER_BOAT = [[-690, 365], [-820, 395], [-926, 435], [-1020, 462], [-1110, 482], [-1170, 490]];
const FIRE = [[-820, 463], [-926, 488], [-1115, 535]];

function mergeTable() {
  const top = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 10).translate(0, 0.75, 0);
  const leg = new THREE.CylinderGeometry(0.04, 0.04, 0.75, 5).translate(0, 0.375, 0);
  const pos = [], nor = [], idx = [];
  for (const g of [top, leg]) {
    const n = pos.length / 3, gi = g.index.array;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    for (let i = 0; i < gi.length; i++) idx.push(gi[i] + n);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

export function createMelbNight({ scene, lightingSystem }) {
  const root = new THREE.Group();
  root.name = 'MelbNight';
  scene.add(root);
  const night = { v: 0 };
  const uGlow = uniform(0.2); // festoon / window glow multiplier
  const glowMat = (hex) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = tslColor(hex).mul(uGlow); return m; };

  // ---------- Flinders St Station ----------
  const stationMats = [];
  const lm = scene.getObjectByName('MelbourneLandmarks');
  const warm = { FSS: [0xffe6b8, 1.5], Ochre: [0xffa83a, 0.55], Copper: [0xffc060, 0.5], Cream: [0xffd48a, 0.5], ClockFace: [0xfff0b0, 1.6] };
  lm?.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      const w = warm[m.name];
      if (w && !stationMats.some((s) => s.m === m)) stationMats.push({ m, col: new THREE.Color(w[0]), k: w[1] });
    }
  });
  const upl = [];
  for (const [x, z] of [[-240, 238], [-200, 238], [-150, 238], [-110, 238]].slice(0, LOW ? 2 : 4)) {
    const l = new THREE.PointLight(0xffa040, 0, 90, 1.6);
    l.position.set(x, 4, z);
    root.add(l);
    upl.push(l);
  }

  // ---------- Laneways ----------
  // All lanes share one paving mesh, one festoon bulb set, one bin set and one table set (4 draw calls), fitted to the
  // footprint gaps (laneGaps) and laid on the footpath slab's top so they never sink under it or float above it.
  const lanes = new THREE.Group();
  lanes.name = 'Laneways';
  root.add(lanes);
  const stone = bluestoneTex();
  const pave = [], bulbAt = [], binAt = [], tabAt = [];
  let lx0 = Infinity, lx1 = -Infinity, lz0 = Infinity, lz1 = -Infinity;
  for (const L of LANES) {
    const rows = laneGaps(L);
    // paving: consecutive rows with the same edges become one quad (world-space UVs, 4 m per stone tile)
    let run = null;
    const flush = () => { if (run) pave.push(run); run = null; };
    for (const r of rows) {
      if (!r) { flush(); continue; }
      if (run && Math.abs(run.a - r.a) < 0.01 && Math.abs(run.b - r.b) < 0.01) run.z1 = r.z + 0.25;
      else { flush(); run = { a: r.a, b: r.b, z0: r.z - 0.25, z1: r.z + 0.25 }; }
      lx0 = Math.min(lx0, r.a); lx1 = Math.max(lx1, r.b); lz0 = Math.min(lz0, r.z); lz1 = Math.max(lz1, r.z);
    }
    flush();
    // festoon strings every 10 m where both walls stand; bins against a wall; tables where the lane is 3 m or wider
    const ok = rows.filter(Boolean);
    let lastS = -1e9;
    for (const r of ok) {
      if (r.wa && r.wb && r.z - lastS >= 10 && r.z > L.z0 + 4 && r.z < L.z1 - 4) {
        lastS = r.z;
        for (let k = 0; k < 9; k++) {
          const u = k / 8;
          bulbAt.push([r.a + 0.15 + u * (r.b - r.a - 0.3), 4.6 - Math.sin(Math.PI * u) * 0.55, r.z]);
        }
      }
    }
    const walled = ok.filter((r) => (r.wa || r.wb) && r.z > L.z0 + 5 && r.z < L.z1 - 5);
    for (let i = 0; i < 6 && walled.length; i++) {
      const r = walled[Math.floor((i + 0.5) * walled.length / 6)];
      const left = r.wa && (i % 2 === 0 || !r.wb);
      binAt.push([left ? r.a + 0.45 : r.b - 0.45, r.z]);
    }
    const wide = ok.filter((r) => r.b - r.a >= 3 && r.z > L.z0 + 10 && r.z < L.z1 - 10);
    for (let i = 0; i < L.tables && wide.length; i++) {
      const r = wide[Math.floor((i + 0.5) * wide.length / L.tables)];
      tabAt.push([i % 2 ? r.b - 1.1 : r.a + 1.1, r.z]);
    }
  }
  if (pave.length) {
    const pos = [], uv = [], idx = [];
    for (const q of pave) {
      const n = pos.length / 3;
      pos.push(q.a, 0, q.z0, q.b, 0, q.z0, q.b, 0, q.z1, q.a, 0, q.z1);
      uv.push(q.a / 4, q.z0 / 4, q.b / 4, q.z0 / 4, q.b / 4, q.z1 / 4, q.a / 4, q.z1 / 4);
      idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    drapeGeometry(g, { maxEdge: 6, lift: SW_TOP + 0.015 });
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardNodeMaterial({ map: stone, roughness: 0.55 });
    mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -2;
    const ground = new THREE.Mesh(g, mat);
    ground.receiveShadow = true;
    lanes.add(ground);
  }
  const ty = (x, z) => terrainHeight(x, z) + SW_TOP;
  const inst = (geo, mat, list, place) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => { place(p); im.setMatrixAt(i, m4.compose(pv, q.identity(), sc)); });
    im.computeBoundingSphere();
    lanes.add(im);
    return im;
  };
  const bulbGeo = new THREE.SphereGeometry(0.1, 6, 4);
  const binGeo = new THREE.BoxGeometry(0.7, 1.1, 0.7);
  const binMat = new THREE.MeshStandardNodeMaterial({ color: 0x1f5a34, roughness: 0.8 });
  // a cafe table: top and leg in one geometry
  const tabGeo = mergeTable();
  const tabMat = new THREE.MeshStandardNodeMaterial({ color: 0x2c2c30, roughness: 0.5, metalness: 0.4 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  inst(bulbGeo, glowMat(0xffc870), bulbAt, ([x, y, z]) => pv.set(x, ty(x, z) + y, z));
  inst(binGeo, binMat, binAt, ([x, z]) => pv.set(x, ty(x, z) + 0.55, z));
  inst(tabGeo, tabMat, tabAt, ([x, z]) => pv.set(x, ty(x, z), z));
  lanes.userData.box = { x0: lx0, x1: lx1, z0: lz0, z1: lz1 };

  // ---------- Crown fire pillars ----------
  const fire = new THREE.Group();
  root.add(fire);
  const pillars = [];
  const pts = [];
  { // 7 evenly spaced along the polyline
    const segLen = []; let tot = 0;
    for (let i = 1; i < FIRE.length; i++) { const l = Math.hypot(FIRE[i][0] - FIRE[i - 1][0], FIRE[i][1] - FIRE[i - 1][1]); segLen.push(l); tot += l; }
    const N = 7;
    for (let k = 0; k < N; k++) {
      let d = tot * k / (N - 1) - 1e-3, i = 0;
      d = Math.max(0, d);
      while (i < segLen.length - 1 && d > segLen[i]) { d -= segLen[i]; i++; }
      const t = Math.min(1, d / segLen[i]);
      pts.push([FIRE[i][0] + (FIRE[i + 1][0] - FIRE[i][0]) * t, FIRE[i][1] + (FIRE[i + 1][1] - FIRE[i][1]) * t]);
    }
  }
  const pilGeo = new THREE.CylinderGeometry(0.5, 0.7, 5, 8); pilGeo.translate(0, 2.5, 0);
  const pilMat = new THREE.MeshStandardNodeMaterial({ color: 0x2b2b2e, roughness: 0.5, metalness: 0.6 });
  const flameGeo = new THREE.ConeGeometry(1.1, 1, 8); flameGeo.translate(0, 0.5, 0);
  const flameMat = new THREE.MeshBasicNodeMaterial({ color: 0xff8a1e, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  pts.forEach(([x, z], i) => {
    const y = Math.max(0.1, terrainHeight(x, z));
    const p = new THREE.Mesh(pilGeo, pilMat); p.position.set(x, y, z);
    const f = new THREE.Mesh(flameGeo, flameMat); f.position.set(x, y + 5, z); f.visible = false; f.frustumCulled = false;
    fire.add(p, f);
    pillars.push({ f, x, z, y: y + 5, phase: i * 1.7, period: 11 + (i % 3) * 1.5 });
  });
  let debugBurst = false;
  const fireLight = new THREE.PointLight(0xff8a30, 0, 70, 1.5);
  root.add(fireLight);

  // ---------- River cruise boat ----------
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 18), new THREE.MeshStandardNodeMaterial({ color: 0xe9edf0, roughness: 0.5 }));
  hull.position.y = 0.2;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.5, 11), new THREE.MeshStandardNodeMaterial({ color: 0xf5f5f5, roughness: 0.5 }));
  cabin.position.set(0, 1.65, -1);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.7, 10), glowMat(0xffe0a0));
  glass.position.set(0, 1.75, -1);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.25, 18.05), new THREE.MeshStandardNodeMaterial({ color: 0x1a4f8a }));
  stripe.position.y = 0.5;
  boat.add(hull, cabin, glass, stripe);
  root.add(boat);
  const bCum = [0];
  for (let i = 1; i < RIVER_BOAT.length; i++) bCum.push(bCum[i - 1] + Math.hypot(RIVER_BOAT[i][0] - RIVER_BOAT[i - 1][0], RIVER_BOAT[i][1] - RIVER_BOAT[i - 1][1]));
  const bLen = bCum[bCum.length - 1];
  let bS = 0;
  function boatAt(s, out) { // s in [0, 2*bLen): out and back
    const fwd = s < bLen, d = fwd ? s : 2 * bLen - s;
    let i = 1;
    while (i < bCum.length - 1 && d > bCum[i]) i++;
    const t = (d - bCum[i - 1]) / (bCum[i] - bCum[i - 1]);
    const a = RIVER_BOAT[i - 1], b = RIVER_BOAT[i];
    out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t;
    out.h = Math.atan2((b[0] - a[0]) * (fwd ? 1 : -1), (b[1] - a[1]) * (fwd ? 1 : -1));
  }
  const bo = { x: 0, z: 0, h: 0 };

  // ---------- update ----------
  let time = 0;
  const near = (cam, x, z, r) => (cam.x - x) ** 2 + (cam.z - z) ** 2 < r * r;
  function update(dt, camPos) {
    time += dt;
    night.v = lightingSystem?.uNightFactor?.value ?? 0;
    const nf = night.v;
    uGlow.value = 0.15 + nf * 3.0;
    for (const s of stationMats) {
      s.m.emissive.copy(s.col);
      s.m.emissiveIntensity = nf * s.k;
    }
    const stationNear = near(camPos, -177, 265, 500);
    for (const l of upl) l.intensity = stationNear ? nf * 900 : 0;
    // lanes
    { const b = lanes.userData.box; const cx = Math.max(b.x0, Math.min(b.x1, camPos.x)), cz = Math.max(b.z0, Math.min(b.z1, camPos.z));
      lanes.visible = near(camPos, cx, cz, LOW ? 450 : 800); }
    // fire
    let best = null, bd = 1e12;
    const fireNear = near(camPos, -960, 500, 900);
    fire.visible = fireNear;
    for (const p of pillars) {
      let on = 0;
      if (fireNear && nf > 0.4) {
        const ph = debugBurst ? 1.1 : ((time + p.phase) % p.period);
        if (ph < 2.2) on = Math.sin(Math.PI * ph / 2.2);
      }
      p.f.visible = on > 0.02;
      if (p.f.visible) {
        const flick = 1 + 0.15 * Math.sin(time * 40 + p.phase);
        p.f.scale.set(1.3 + on * 0.7, (2 + on * 8) * flick, 1.3 + on * 0.7);
        p.f.updateMatrixWorld(); // the scene's matrices are frozen after init, so refresh by hand
        const d = (camPos.x - p.x) ** 2 + (camPos.z - p.z) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
    }
    if (best) {
      fireLight.position.set(best.x, best.y + 4, best.z);
      fireLight.intensity = 1800 * Math.max(0.2, best.f.scale.y / 9);
      fireLight.updateMatrixWorld();
    } else fireLight.intensity = 0;
    // boat
    bS = (bS + dt * 4.5) % (2 * bLen);
    boatAt(bS, bo);
    boat.position.set(bo.x, -1.6 + 0.55 + Math.sin(time * 1.1) * 0.03, bo.z);
    boat.rotation.y = bo.h;
    boat.visible = near(camPos, bo.x, bo.z, 1400);
    if (boat.visible) boat.updateMatrixWorld(true);
  }
  return { group: root, update, burstAll(on = true) { debugBurst = !!on; } };
}
