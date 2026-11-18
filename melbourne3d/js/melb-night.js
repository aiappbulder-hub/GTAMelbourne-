// Melbourne after dark: Flinders St Station glow + uplights, hand-placed laneways (bluestone, graffiti, festoon
// lights, bins, cafe tables), Crown's gas fire pillars on the Yarra's south bank and a river cruise boat.
// Everything is distance-gated and instanced; fire/boat/lanes are skipped entirely when far from the camera.
import * as THREE from 'three/webgpu';
import { uniform, vec3, color as tslColor } from 'three/tsl';
import { terrainHeight } from './terrain.js';
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
function graffitiTex(variant) {
  const pal = ['#ff2e88', '#18d6c8', '#ffd21f', '#7a3cff', '#ff6a1a', '#3ddc4a', '#e8f0ff', '#2a8cff'];
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = variant ? '#3a3238' : '#2f3a40'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 38; i++) {
      g.fillStyle = pal[(rnd() * pal.length) | 0];
      g.globalAlpha = 0.65 + rnd() * 0.35;
      const x = rnd() * w, y = rnd() * h, s = 18 + rnd() * 70;
      g.beginPath();
      if (i % 3 === 0) g.ellipse(x, y, s, s * 0.55, rnd() * 3, 0, 6.3);
      else if (i % 3 === 1) g.rect(x, y, s * 1.4, s * 0.5);
      else { g.moveTo(x, y); g.lineTo(x + s, y + rnd() * s); g.lineTo(x + rnd() * s, y + s); }
      g.fill();
      g.strokeStyle = '#111'; g.lineWidth = 3; g.globalAlpha = 0.8; g.stroke();
    }
    g.globalAlpha = 1;
  });
}

// lanes: x (north-south lane), z from..to, half width
const LANES = [
  { name: 'Degraves St', x: -31, z0: 126, z1: 231, hw: 3.2 },
  { name: 'Hosier Lane', x: 58, z0: 126, z1: 231, hw: 2.6 },
  { name: 'Centre Place', x: -88, z0: 126, z1: 231, hw: 2.4 },
  { name: 'AC/DC Lane', x: 120, z0: 126, z1: 231, hw: 2.4 }
];
const RIVER_BOAT = [[-690, 365], [-820, 395], [-926, 435], [-1020, 462], [-1110, 482], [-1170, 490]];
const FIRE = [[-820, 463], [-926, 488], [-1115, 535]];

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
  const warm = { Ochre: [0xffa83a, 0.55], Copper: [0xffc060, 0.5], Cream: [0xffd48a, 0.5], ClockFace: [0xfff0b0, 1.6] };
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
  const lanes = new THREE.Group();
  root.add(lanes);
  const stone = bluestoneTex();
  const gTex = [graffitiTex(0), graffitiTex(1)];
  const bulbGeo = new THREE.SphereGeometry(0.1, 6, 4);
  const bulbMat = glowMat(0xffc870);
  const binGeo = new THREE.BoxGeometry(0.7, 1.1, 0.7);
  const binMat = new THREE.MeshStandardNodeMaterial({ color: 0x1f5a34, roughness: 0.8 });
  const tabGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 10); tabGeo.translate(0, 0.75, 0);
  const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.75, 5); legGeo.translate(0, 0.375, 0);
  const tabMat = new THREE.MeshStandardNodeMaterial({ color: 0x2c2c30, roughness: 0.5, metalness: 0.4 });
  const wallGeo = new THREE.PlaneGeometry(1, 1);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  LANES.forEach((L, li) => {
    const len = L.z1 - L.z0, cz = (L.z0 + L.z1) / 2, y = terrainHeight(L.x, cz) + 0.07;
    const grp = new THREE.Group();
    grp.userData.c = new THREE.Vector3(L.x, y, cz);
    const st = stone.clone(); st.needsUpdate = true; st.repeat.set(L.hw * 2 / 4, len / 4);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(L.hw * 2, len), new THREE.MeshStandardNodeMaterial({ map: st, roughness: 0.55 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(L.x, y, cz);
    ground.receiveShadow = false;
    grp.add(ground);
    for (const side of [-1, 1]) {
      const t = gTex[(li + (side > 0 ? 1 : 0)) % 2].clone(); t.needsUpdate = true; t.repeat.set(len / 14, 1);
      const w = new THREE.Mesh(wallGeo, new THREE.MeshStandardNodeMaterial({ map: t, roughness: 0.9 }));
      w.scale.set(len, 6, 1);
      w.position.set(L.x + side * (L.hw - 0.02), y + 3, cz);
      w.rotation.y = -side * Math.PI / 2;
      grp.add(w);
    }
    // festoon strings across the lane every 10 m, 9 bulbs each on a sag curve
    const strings = Math.floor(len / 10);
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, strings * 9);
    let n = 0;
    for (let s = 0; s < strings; s++) for (let k = 0; k < 9; k++) {
      const u = k / 8, x = L.x - L.hw + u * L.hw * 2;
      pv.set(x, y + 4.6 - Math.sin(Math.PI * u) * 0.55, L.z0 + 5 + s * 10);
      m4.compose(pv, q.identity(), sc);
      bulbs.setMatrixAt(n++, m4);
    }
    bulbs.frustumCulled = false;
    grp.add(bulbs);
    // bins + cafe tables
    const nb = 6, bins = new THREE.InstancedMesh(binGeo, binMat, nb);
    for (let i = 0; i < nb; i++) {
      pv.set(L.x + (i % 2 ? 1 : -1) * (L.hw - 0.6), y + 0.55, L.z0 + 8 + i * (len - 16) / (nb - 1));
      bins.setMatrixAt(i, m4.compose(pv, q.identity(), sc));
    }
    bins.frustumCulled = false;
    grp.add(bins);
    const nt = li === 0 ? 8 : 4, tabs = new THREE.InstancedMesh(tabGeo, tabMat, nt), legs = new THREE.InstancedMesh(legGeo, tabMat, nt);
    for (let i = 0; i < nt; i++) {
      pv.set(L.x + (i % 2 ? 1 : -1) * (L.hw - 1.2), y, L.z0 + 14 + i * (len - 28) / Math.max(1, nt - 1));
      m4.compose(pv, q.identity(), sc);
      tabs.setMatrixAt(i, m4); legs.setMatrixAt(i, m4);
    }
    tabs.frustumCulled = legs.frustumCulled = false;
    grp.add(tabs, legs);
    lanes.add(grp);
  });

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
    for (const g of lanes.children) g.visible = near(camPos, g.userData.c.x, g.userData.c.z, LOW ? 450 : 800);
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
