// The Albert Park Grand Prix: the player against five AI cars, two laps of the real circuit (js/albert-park-circuit.js).
//
//  - Start it from the Jobs list or by driving into the blue marker in the pits. The cars line up on a two-wide grid
//    behind the start line (the player at the back), a 3-2-1 countdown, and go.
//  - The AI drive their own lines along the loop: a speed profile from the circuit's curvature (each corner taken at
//    the speed its grip allows, braking for it in good time), set against the player's car (top speed and grip), each
//    driver a touch different. They pull out to pass a slower car ahead and tuck in behind one they can't.
//  - HUD: lap, position, time. Places pay: 1st $5,000, 2nd $2,500, 3rd $1,000. Leaving the car or the circuit ends it.
import * as THREE from 'three/webgpu';
import { CIRCUIT } from './albert-park-circuit.js';
import { circuitPoint, trackHeight } from './race-track.js';

const LAPS = 2;
const RIVALS = [
  { file: 'comodo', name: 'Dazza', color: 0x1d4fd8, skill: 0.97 },
  { file: 'clubbie', name: 'Shazza', color: 0xf2c21a, skill: 0.95 },
  { file: 'barrina', name: 'Gaz', color: 0x18a058, skill: 0.92 },
  { file: 'territorial', name: 'Bruce', color: 0xe8e8e8, skill: 0.9 },
  { file: 'strainger', name: 'Kylie', color: 0x9a2bd8, skill: 0.88 }
];
const PRIZES = [5000, 2500, 1000];

const CSS = `
.race-hud { position: fixed; top: 84px; left: 50%; transform: translateX(-50%); z-index: 31; display: none; gap: 18px; padding: 8px 18px;
  border-radius: 12px; background: rgba(10,12,16,.82); color: #fff; font: 800 18px/1 'JetBrains Mono', monospace; pointer-events: none; }
.race-hud.on { display: flex; }
.race-hud b { color: #ffd23f; }
.race-count { position: fixed; left: 50%; top: 36%; transform: translate(-50%, -50%); z-index: 40; color: #fff; pointer-events: none;
  font: 900 clamp(60px, 12vw, 140px)/1 Inter, system-ui, sans-serif; text-shadow: 0 6px 30px rgba(0,0,0,.6); display: none; }
.race-count.on { display: block; }
body.racing .gm-objective, body.racing .gm-pointer { display: none !important; }
`;

export function createRace({ scene, controllerManager, missionSystem, teleportTo, selectMode }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const hud = document.createElement('div');
  hud.className = 'race-hud';
  const count = document.createElement('div');
  count.className = 'race-count';
  document.body.append(hud, count);

  // --- The loop: points every 4 m, cumulative distance, and the speed profile ------------------------------------------
  const N = CIRCUIT.length / 2;
  const X = (i) => CIRCUIT[((i % N + N) % N) * 2], Z = (i) => CIRCUIT[((i % N + N) % N) * 2 + 1];
  const S = new Float32Array(N + 1);
  for (let i = 1; i <= N; i++) S[i] = S[i - 1] + Math.hypot(X(i) - X(i - 1), Z(i) - Z(i - 1));
  const L = S[N];
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a1 = Math.atan2(X(i + 3) - X(i), Z(i + 3) - Z(i)), a0 = Math.atan2(X(i) - X(i - 3), Z(i) - Z(i - 3));
    const d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
    curv[i] = Math.abs(d) / Math.max(1, S[Math.min(N, i + 3)] - S[Math.max(0, i - 3)] || 24);
  }
  let profile = new Float32Array(N);
  function buildProfile(vTop, aLat, aBrake) {
    profile = new Float32Array(N);
    for (let i = 0; i < N; i++) profile[i] = Math.min(vTop, Math.sqrt(aLat / Math.max(curv[i], 1e-4)));
    // brake in good time: no point faster than it can slow from to the next corner's speed
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const j = (i + 1) % N, ds = Math.hypot(X(j) - X(i), Z(j) - Z(i));
        profile[i] = Math.min(profile[i], Math.sqrt(profile[j] * profile[j] + 2 * aBrake * ds));
      }
    }
  }
  const idxAt = (s) => {
    s = ((s % L) + L) % L;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    return lo;
  };
  // a point s along the loop, `lane` metres to the right of the line, and its heading
  const at = (s, lane) => {
    const i = idxAt(s), j = i + 1, t = (((s % L) + L) % L - S[i]) / Math.max(0.01, S[j] - S[i]);
    const x = X(i) + (X(j) - X(i)) * t, z = Z(i) + (Z(j) - Z(i)) * t;
    const tx = X(i + 2) - X(i - 1), tz = Z(i + 2) - Z(i - 1), tl = Math.hypot(tx, tz) || 1;
    const heading = Math.atan2(tx, tz);
    // right of the direction (tx, tz), in x-east / z-south
    return { x: x - (tz / tl) * lane, z: z + (tx / tl) * lane, heading };
  };

  // --- The rivals' cars (the same models as the player's own cars, in their colours) -------------------------------------
  const models = new Map();
  async function model(def) {
    if (!models.has(def.file)) {
      models.set(def.file, (async () => {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        return new GLTFLoader().loadAsync(new URL(`../../models/custom/${def.file}.json`, import.meta.url).href);
      })());
    }
    const gltf = await models.get(def.file);
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    const body = gltf.scene.clone(true);
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      if (o.material && o.material.name === 'Body') { o.material = o.material.clone(); o.material.color.setHex(def.color); }
    });
    root.add(body);
    const wheels = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'].map((n) => body.getObjectByName(n)).filter(Boolean);
    root.visible = false;
    scene.add(root);
    return { root, wheels };
  }
  let rivals = [];

  // --- The start marker in the pits ----------------------------------------------------------------------------------
  const markerMat = new THREE.MeshBasicNodeMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const marker = new THREE.Group();
  marker.add(new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 140, 24, 1, true), markerMat));
  marker.children[0].position.y = 70;
  scene.add(marker);
  const mk = (() => {
    const p = circuitPoint(0.975);
    const inside = at(S[idxAt(L * 0.975)], -14); // in towards the lake, off the track
    return { x: inside.x, z: inside.z, heading: p.heading };
  })();
  marker.position.set(mk.x, 0.1, mk.z);

  // --- The race ------------------------------------------------------------------------------------------------------
  let state = 'idle', t = 0, startT = 0, playerLap = 0, playerIdx = 0, halfway = false, result = null;
  const car = () => controllerManager.entities.car;
  function playerS() {
    // the player's place on the loop: the nearest point within a stretch around the last one
    const c = car().position;
    let best = playerIdx, bd = Infinity;
    for (let k = -80; k <= 80; k++) {
      const i = ((playerIdx + k) % N + N) % N;
      const d = (X(i) - c.x) ** 2 + (Z(i) - c.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return { idx: best, dist: Math.sqrt(bd) };
  }
  async function start() {
    if (state !== 'idle') return;
    state = 'loading';
    if (controllerManager.activeMode !== 'car') selectMode('car');
    // the rivals as quick as the player's car allows, each a little different
    const D = car().drive || { speed: 36, grip: 13 };
    buildProfile(D.speed * 0.98, (D.grip || 13) * 0.9, 9);
    if (!rivals.length) rivals = await Promise.all(RIVALS.map(async (def) => ({ def, ...(await model(def)) })));
    // the grid: two wide, 8 m apart, behind the start line; the player at the back
    const slot = (k) => ({ s: L - 9 - k * 8, lane: k % 2 ? 2.2 : -2.2 });
    rivals.forEach((r, k) => {
      const g = slot(k);
      Object.assign(r, { s: g.s, lane: g.lane, laneWant: g.lane, v: 0, lap: -1, half: false, done: false, finishT: 0 });
      r.root.visible = true;
    });
    const g = slot(rivals.length);
    const p = at(g.s, g.lane);
    teleportTo(p.x, p.z, p.heading);
    playerIdx = idxAt(g.s);
    playerLap = -1; // crossing the line at the start makes it lap 0
    halfway = false;
    result = null;
    state = 'countdown';
    t = 0;
    gridPos = p;
    hud.classList.add('on');
    document.body.classList.add('racing');
    missionSystem?.sub?.('The Albert Park Grand Prix: two laps. Wait for the lights.', 3);
  }
  let gridPos = null;
  function finish(text, prize = 0) {
    state = 'done';
    t = 0;
    hud.classList.remove('on');
    count.textContent = text;
    count.classList.add('on');
    if (prize) missionSystem?.addMoney?.(prize);
  }
  function end() {
    state = 'idle';
    document.body.classList.remove('racing');
    count.classList.remove('on');
    hud.classList.remove('on');
    for (const r of rivals) r.root.visible = false;
  }
  const progressOf = (lap, s) => lap * L + (((s % L) + L) % L);

  function update(dt) {
    t += dt;
    if (state === 'idle') {
      marker.visible = !missionSystem?.inCut;
      marker.children[0].material.opacity = 0.42 + Math.sin(performance.now() / 300) * 0.1;
      const c = car().position;
      if (controllerManager.activeMode === 'car' && Math.hypot(c.x - mk.x, c.z - mk.z) < 6 && !missionSystem?.inCut) start();
      return;
    }
    marker.visible = false;
    if (state === 'loading') return;
    if (state === 'done') { if (t > 4) end(); return; }
    const c = car();
    if (state === 'countdown') {
      // held on the grid: 3, 2, 1, GO
      c.position.x = gridPos.x; c.position.z = gridPos.z; c.heading = gridPos.heading; c.speed = 0; c.vx = c.vz = 0;
      const n = 3 - Math.floor(t);
      count.textContent = n > 0 ? String(n) : 'GO!';
      count.classList.add('on');
      if (t >= 3) { state = 'racing'; startT = performance.now(); }
      placeRivals(0);
      updateHud();
      return;
    }
    if (t > 3.8) count.classList.remove('on');
    // the player: out of the car or off the circuit ends it
    const me = playerS();
    if (controllerManager.activeMode !== 'car' || me.dist > 150) { finish('RACE ABANDONED'); return; }
    if (me.idx < 25 && playerIdx > N - 25) { if (playerLap < 0 || halfway) { playerLap++; halfway = false; } }
    if (me.idx > N / 2 - 30 && me.idx < N / 2 + 30) halfway = true;
    playerIdx = me.idx;
    const mine = progressOf(playerLap, S[me.idx]);
    // the rivals
    const all = rivals.map((r) => ({ s: r.s, lane: r.lane, v: r.v, r }));
    all.push({ s: S[me.idx], lane: laneOf(c.position, me.idx), v: Math.abs(c.speed), player: true });
    for (const r of rivals) {
      if (r.done) { r.v = Math.max(0, r.v - 6 * dt); r.s += r.v * dt; continue; }
      let want = profile[idxAt(r.s)] * r.def.skill;
      // traffic ahead: pass it if there's room and we're quicker, else sit behind it
      for (const o of all) {
        if (o.r === r) continue;
        const gap = (((o.s - r.s) % L) + L) % L;
        if (gap > 0.5 && gap < 14 && Math.abs(o.lane - r.lane) < 2.4) {
          if (r.v > o.v + 1.5 && !r.passing) { r.laneWant = o.lane > 0 ? -2.6 : 2.6; r.passing = 3; }
          else if (gap < 9) want = Math.min(want, o.v - 0.5);
        }
      }
      r.passing = Math.max(0, (r.passing || 0) - dt);
      if (!r.passing) r.laneWant *= 1 - Math.min(1, dt * 0.25); // back to the racing line
      r.lane += Math.max(-2.2 * dt, Math.min(2.2 * dt, r.laneWant - r.lane));
      r.v += Math.max(-12 * dt, Math.min((r.v < 20 ? 7 : 4.5) * dt, want - r.v));
      const before = ((r.s % L) + L) % L;
      r.s += r.v * dt;
      const after = ((r.s % L) + L) % L;
      if (after < before) { if (r.lap < 0 || r.half) { r.lap++; r.half = false; } }
      if (after > L * 0.45 && after < L * 0.55) r.half = true;
      if (r.lap >= LAPS && !r.done) { r.done = true; r.finishT = performance.now(); }
    }
    collide(c, dt);
    placeRivals(dt);
    updateHud(mine);
    if (playerLap >= LAPS) {
      const place = 1 + rivals.filter((r) => r.done && r.finishT < performance.now()).length;
      const secs = (performance.now() - startT) / 1000;
      finish(`${['1ST', '2ND', '3RD', '4TH', '5TH', '6TH'][place - 1]}  ${fmt(secs)}`, PRIZES[place - 1] || 0);
      if (PRIZES[place - 1]) missionSystem?.sub?.(`P${place} at Albert Park. +$${PRIZES[place - 1].toLocaleString('en-AU')}`, 5);
    }
  }
  // how far right of the line the player is (for the rivals to see which side they're on)
  function laneOf(p, i) {
    const tx = X(i + 1) - X(i), tz = Z(i + 1) - Z(i), tl = Math.hypot(tx, tz) || 1;
    return ((p.x - X(i)) * -tz + (p.z - Z(i)) * tx) / tl;
  }
  // Contact: the rivals can't pass through each other or the player. Nose to tail, the one behind is held off at the
  // leader's speed; side by side, they're shoved apart (and the rival steers away)
  const HL = 2.3, HW = 0.95;
  function collide(c, dt) {
    // rival against rival, along the loop
    const order = [...rivals].sort((a, b) => a.s - b.s);
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        if (i === j) continue;
        const a = order[i], b = order[j];
        const gap = (((b.s - a.s) % L) + L) % L; // b ahead of a by this much
        if (gap > 0 && gap < HL * 2 + 0.3 && Math.abs(a.lane - b.lane) < HW * 2 + 0.2) {
          a.s = b.s - (HL * 2 + 0.3) - (b.s - a.s - gap); // back to the leader's bumper (same lap)
          a.v = Math.min(a.v, b.v);
        }
      }
    }
    // the player's car against each rival, in the rival's frame
    for (const r of rivals) {
      const p = at(r.s, r.lane);
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      const dx = c.position.x - p.x, dz = c.position.z - p.z;
      const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
      const pa = HL * 2 - Math.abs(along), ps = HW * 2 - Math.abs(side);
      if (pa <= 0 || ps <= 0) continue;
      if (pa < ps * 1.6) {
        // nose to tail: separate along, and the one behind takes the one in front's speed (a bump)
        const k = Math.sign(along || 1) * pa;
        c.position.x += fx * k; c.position.z += fz * k;
        const mine = c.speed * (Math.sin(c.heading) * fx + Math.cos(c.heading) * fz);
        if (along < 0) { if (mine > r.v) c.speed = r.v * 0.95; } // the player ran into it
        else { r.v = Math.min(r.v, Math.max(0, mine) * 0.95); } // it ran into the player
      } else {
        // side by side: shoved apart, and the rival moves over
        const k = Math.sign(side || 1) * ps;
        c.position.x += fz * k; c.position.z -= fx * k;
        c.vx = (c.vx || 0) + fz * Math.sign(side || 1) * 1.5;
        c.vz = (c.vz || 0) - fx * Math.sign(side || 1) * 1.5;
        r.laneWant = r.lane - Math.sign(side || 1) * 2.5;
        r.passing = 1.5;
        c.speed *= 0.97;
      }
    }
  }
  /** The rivals' footprints (for the player on foot) */
  function boxes() {
    if (state === 'idle') return [];
    return rivals.map((r) => { const p = at(r.s, r.lane); return { x: p.x, z: p.z, yaw: p.heading, halfL: HL, halfW: HW }; });
  }
  function placeRivals(dt) {
    for (const r of rivals) {
      const p = at(r.s, r.lane);
      r.root.position.set(p.x, trackHeight(p.x, p.z) ?? 0.03, p.z);
      r.root.rotation.set(0, p.heading, 0);
      for (const w of r.wheels) w.rotation.x += (r.v * dt) / 0.33;
    }
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  function updateHud(mine = 0) {
    const rank = 1 + rivals.filter((r) => progressOf(r.lap, r.s) > mine).length;
    const secs = state === 'racing' ? (performance.now() - startT) / 1000 : 0;
    hud.innerHTML = `<span>LAP <b>${Math.max(1, Math.min(LAPS, playerLap + 1))}/${LAPS}</b></span><span>POS <b>${rank}/${rivals.length + 1}</b></span><span>${fmt(secs)}</span>`;
  }

  return { start, update, end, boxes, get racing() { return state !== 'idle'; }, marker: mk };
}
