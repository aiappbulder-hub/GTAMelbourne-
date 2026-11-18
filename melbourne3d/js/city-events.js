// Ambient city events: every 1-3 minutes something Melbourne starts near the player (off-screen-ish): a Bourke St Mall
// busker with a crowd circle, a protest walking by the trams, a footy crowd streaming to the MCG (evenings), a
// laneway party (night), a car-park burnout with a cheering crowd (night), Yarra fireworks (night) and a "four seasons in
// one day" weather flip. Each is self-contained, despawns when far away or when its time is up, shows a small headline
// the first time it is on screen, and never takes input or blocks anything. Debug: __city.events.trigger(name).
import * as THREE from 'three/webgpu';
import { PersonCrowd, PersonRig } from './pedestrians.js';
import { getMelbourneCharacterPreset } from './character-presets.js';
import { MELBOURNE_LINES } from './melbourne-lines.js';
import { GEO } from './melbourne-geodata.js';
import { fromLonLat } from './melbourne-config.js';
import { terrainHeight } from './terrain.js';

const G = GEO.grid;
const SIDEWALK = 0.22;
const DESPAWN_FAR = 520; // m from the player
const MAX_ACTORS = 120;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[Math.floor(Math.random() * l.length)];
const TEAMS = [[0x10244d, 0xffffff], [0xc8102e, 0xffffff], [0x111111, 0xffffff], [0xf4c400, 0x111111], [0x7a1c34, 0x2f6fb5], [0x0a5a2a, 0xf4c400]];
const FAN_IDS = ['afl-fan', 'afl-fan-f'];

export function createCityEvents({ scene, controllerManager, cameraSystem, lightingSystem, voices = null }) {
  // ---- shared drawing: one small crowd of people, one instanced box mesh for their accessories ------------------------
  const crowd = new PersonCrowd(MAX_ACTORS, { farDistance: 60, castShadow: false });
  const root = new THREE.Group(); root.name = 'CityEvents';
  crowd.meshes.forEach((m) => root.add(m));
  const accMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), 900);
  accMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(900 * 3), 3);
  accMesh.frustumCulled = false; accMesh.count = 0;
  root.add(accMesh);
  const fxMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, toneMapped: false }), 700);
  fxMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(700 * 3), 3);
  fxMesh.frustumCulled = false; fxMesh.count = 0;
  root.add(fxMesh);
  scene.add(root);
  const ground = (owner, x, z) => terrainHeight(x, z) + SIDEWALK;

  // ---- the toast -----------------------------------------------------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `.gm-event { position: fixed; left: 50%; top: 84px; transform: translate(-50%, -8px); z-index: 28; pointer-events: none; opacity: 0;
    transition: opacity .5s ease, transform .5s ease; padding: 7px 16px; border-radius: 6px; background: rgba(10,12,16,.72); color: #fff;
    font: 700 14px/1.3 Inter, system-ui, sans-serif; max-width: min(560px, 90vw); text-align: center; text-shadow: 0 1px 2px #000; }
    .gm-event.on { opacity: 1; transform: translate(-50%, 0); } .gm-event small { display: block; font-weight: 500; opacity: .75; }`;
  document.head.append(style);
  const toastEl = document.createElement('div'); toastEl.className = 'gm-event'; document.body.append(toastEl);
  let toastTimer = 0;
  const toast = (text, sub = '') => { toastEl.innerHTML = ''; toastEl.append(text); if (sub) { const s = document.createElement('small'); s.textContent = sub; toastEl.append(s); } toastEl.classList.add('on'); toastTimer = 5; };

  // ---- people ---------------------------------------------------------------------------------------------------------
  const actors = [];
  function makeActor(presetId, x, z, acc = []) {
    if (actors.length >= MAX_ACTORS) return null;
    const preset = getMelbourneCharacterPreset(presetId) || getMelbourneCharacterPreset('melbourne-local');
    const { id, name, role, ...opts } = preset;
    opts.seed = opts.seed + Math.random() * 400; opts.scale *= rand(0.94, 1.06); opts.female = Math.random() < (opts.female ? 0.85 : 0.2);
    const a = { rig: new PersonRig(opts), x, z, heading: rand(0, 6.28), vx: 0, vz: 0, acc, dance: 0, bob: Math.random() * 6, face: null };
    actors.push(a);
    return a;
  }
  const tmpO = new THREE.Object3D(), tmpC = new THREE.Color();
  let accN = 0;
  function drawAcc(a, kind, color, ox, oy, oz, sx, sy, sz) {
    if (accN >= 900) return;
    const s = a.rig.s, c = Math.cos(a.heading), sn = Math.sin(a.heading);
    tmpO.position.set(a.x + (ox * c + oz * sn) * s, ground(null, a.x, a.z) + oy * s, a.z + (-ox * sn + oz * c) * s);
    tmpO.rotation.set(0, a.heading, 0); tmpO.scale.set(sx * s, sy * s, sz * s); tmpO.updateMatrix();
    accMesh.setMatrixAt(accN, tmpO.matrix); tmpC.setHex(color); accMesh.setColorAt(accN, tmpC); accN++;
  }
  const ACC = {
    scarf: (a, c) => { drawAcc(a, 0, c[0], 0, 1.46, 0.02, 0.4, 0.13, 0.34); drawAcc(a, 0, c[1], 0, 1.35, 0.17, 0.1, 0.34, 0.04); },
    hivis: (a) => { drawAcc(a, 0, 0xc8ff1a, 0, 1.15, 0, 0.5, 0.5, 0.31); drawAcc(a, 0, 0xdddddd, 0, 1.1, 0, 0.52, 0.06, 0.33); },
    black: (a) => drawAcc(a, 0, 0x101010, 0, 1.15, 0, 0.5, 0.52, 0.3),
    hoodie: (a) => { drawAcc(a, 0, 0x2b2f36, 0, 1.15, 0, 0.5, 0.55, 0.31); drawAcc(a, 0, 0x2b2f36, 0, 1.52, -0.04, 0.3, 0.26, 0.32); },
    lycra: (a, c) => drawAcc(a, 0, c[0], 0, 1.17, 0, 0.47, 0.5, 0.28),
    cup: (a) => drawAcc(a, 0, 0xf2f2f2, 0.32, 1.05, 0.25, 0.08, 0.14, 0.08),
    guitar: (a) => drawAcc(a, 0, 0x9a5a22, 0.05, 1.0, 0.28, 0.34, 0.5, 0.08),
    banner: (a, c) => { drawAcc(a, 0, 0x6b4a2a, 0.25, 1.4, 0.15, 0.04, 2.1, 0.04); drawAcc(a, 0, c[0], 0.25, 2.2, 0.15, 1.5, 0.8, 0.04); },
    flag: (a, c) => { drawAcc(a, 0, 0x6b4a2a, 0.25, 1.2, 0.15, 0.03, 1.8, 0.03); drawAcc(a, 0, c[0], 0.5, 2.0, 0.15, 0.55, 0.35, 0.03); }
  };

  // ---- places ---------------------------------------------------------------------------------------------------------
  const camPos = () => cameraSystem.currentPos;
  const player = () => controllerManager.getActiveEntity().position;
  const lines = [...G.streets.map((s) => ({ ax: 'z', at: s.at })), ...G.little.map((s) => ({ ax: 'z', at: s.at })), ...G.avenues.map((s) => ({ ax: 'x', at: s.at }))];
  // a spot on a Hoddle Grid street (or the open ground if the player is outside the grid), `dist` m from the player in a random direction
  function spotNear(dist, little = false) {
    const p = player(), ang = rand(0, 6.283);
    let x = p.x + Math.cos(ang) * dist, z = p.z + Math.sin(ang) * dist;
    const ext = G.extent;
    if (x > ext.minX - 20 && x < ext.maxX + 20 && z > ext.minZ - 20 && z < ext.maxZ + 20) {
      let best = null, bd = 1e9;
      for (const l of lines) {
        if (little && l.at !== G.little.find((s) => s.at === l.at)?.at) continue;
        const d = Math.abs((l.ax === 'z' ? z : x) - l.at);
        if (d < bd) { bd = d; best = l; }
      }
      if (best) { if (best.ax === 'z') { z = best.at; return { x, z, dx: 1, dz: 0 }; } x = best.at; return { x, z, dx: 0, dz: 1 }; }
    }
    return { x, z, dx: 1, dz: 0 };
  }
  const mcg = fromLonLat(144.9834, -37.8199);
  const crown = fromLonLat(144.9585, -37.8228);

  // ---- events -----------------------------------------------------------------------------------------------------------
  // each: eligible(t) weight; start(spot, forced) -> event {headline, sub, x, z, life, tick(dt, t), end()}
  const nightNow = () => (lightingSystem?.uNightFactor?.value ?? 0);
  function circle(ev, cx, cz, n, r, presets, accs) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + rand(-0.15, 0.15), rr = r + rand(0, 0.8);
      const m = makeActor(pick(presets), cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, accs ? accs(i) : []);
      if (m) { m.heading = Math.atan2(cx - m.x, cz - m.z); m.face = { x: cx, z: cz }; ev.actors.push(m); }
    }
  }
  const DEFS = {
    busker: {
      weight: () => (nightNow() < 0.7 ? 1.2 : 0.3),
      start(spot) {
        const ev = { actors: [], x: spot.x, z: spot.z, life: 150, headline: 'A busker has drawn a crowd', sub: 'Bourke St Mall, ~2:30pm on a Saturday. Somebody requests Wonderwall.' };
        const b = makeActor('busker', spot.x, spot.z, ['guitar']); if (b) { b.face = { x: spot.x + 5, z: spot.z }; ev.actors.push(b); }
        circle(ev, spot.x, spot.z, 11, 3.6, ['melbourne-local', 'female-local', 'hipster-coffee', 'uni-student', 'office-black'], (i) => (i % 4 === 0 ? ['cup'] : []));
        ev.tick = (dt, t) => { if (b) b.bob = Math.sin(t * 6) * 0.1; };
        return ev;
      }
    },
    protest: {
      weight: () => (nightNow() < 0.6 ? 1 : 0.2),
      start(spot) {
        const ev = { actors: [], x: spot.x, z: spot.z, life: 140, headline: 'Protest march holding up the trams', sub: 'Banners, whistles and a lot of "what do we want".', dir: spot };
        const cols = [[0xd62828], [0xf2c230], [0xffffff], [0x2b7de9]];
        for (let i = 0; i < 16; i++) {
          const row = i % 2, k = Math.floor(i / 2);
          const m = makeActor(pick(['melbourne-local', 'female-local', 'uni-student', 'hipster-coffee']),
            spot.x - spot.dx * k * 1.8 + spot.dz * (row ? 2 : -2), spot.z - spot.dz * k * 1.8 + spot.dx * (row ? 2 : -2), i % 3 === 0 ? ['banner'] : []);
          if (m) { m.accC = pick(cols); m.heading = Math.atan2(spot.dx, spot.dz); m.v = 0.9; ev.actors.push(m); }
        }
        ev.tick = (dt) => { for (const m of ev.actors) { m.x += spot.dx * 0.9 * dt; m.z += spot.dz * 0.9 * dt; } ev.x += spot.dx * 0.9 * dt; ev.z += spot.dz * 0.9 * dt; };
        return ev;
      }
    },
    footy: {
      weight: () => { const n = nightNow(); return n > 0.1 && n < 0.8 ? 2.4 : 0.35; },
      start(spot) {
        const ev = { actors: [], x: spot.x, z: spot.z, life: 110, headline: 'Footy crowd streaming to the MCG', sub: 'Scarves, pies and a light-hearted threat to the umpire.' };
        const team = [pick(TEAMS), pick(TEAMS)];
        for (let i = 0; i < 30; i++) {
          const along = rand(0, 28), side = rand(-3.5, 3.5);
          const m = makeActor(pick(FAN_IDS), spot.x + spot.dx * along - spot.dz * side + spot.dx * 0, spot.z + spot.dz * along + spot.dx * side, i % 6 === 0 ? ['flag'] : []);
          if (m) { m.team = team[i % 2]; m.accC = m.team; m.heading = Math.atan2(spot.dx, spot.dz); m.v = rand(1.5, 2.2); m.fan = true; ev.actors.push(m); }
        }
        // head toward the MCG along the street (towards +x for an east-west street, else towards the MCG's side)
        let dx = spot.dx, dz = spot.dz;
        if (dx) dx = mcg.x > spot.x ? 1 : -1; else dz = mcg.z > spot.z ? 1 : -1;
        for (const m of ev.actors) m.heading = Math.atan2(dx, dz);
        ev.tick = (dt) => { for (const m of ev.actors) { m.x += dx * m.v * dt; m.z += dz * m.v * dt; } ev.x += dx * 1.8 * dt; ev.z += dz * 1.8 * dt; };
        return ev;
      }
    },
    party: {
      weight: () => (nightNow() > 0.5 ? 2 : 0),
      little: true,
      start(spot) {
        const ev = { actors: [], x: spot.x, z: spot.z, life: 150, headline: 'Laneway party', sub: 'Bass you can feel in your fillings. Nobody knows whose birthday it is.', lights: [] };
        circle(ev, spot.x, spot.z, 16, 2.8, ['hipster-coffee', 'uni-student', 'female-local', 'melbourne-local', 'scooter-rider'], () => []);
        for (const m of ev.actors) m.dance = 1;
        const cols = [0xff2d95, 0x2dd4ff, 0xffe14d];
        let beat = 0;
        ev.tick = (dt, t) => {
          beat = (t * 2.1) % 1; // 126 bpm
          cols.forEach((c, i) => fx(spot.x + (i - 1) * 3, 4.8 + terrainHeight(spot.x, spot.z), spot.z + (i % 2 ? 3 : -3), 0.35 + (1 - beat) * 0.5, c));
          audio.thump(ev.x, ev.z, beat < dt * 1.2);
        };
        return ev;
      }
    },
    burnout: {
      weight: () => (nightNow() > 0.5 ? 1.5 : 0),
      start(spot) {
        const ev = { actors: [], x: spot.x, z: spot.z, life: 100, headline: 'Burnout in the car park', sub: 'Hooded teens, a Commodore and a lot of smoke. Somebody is filming it.', smoke: [] };
        circle(ev, spot.x, spot.z, 18, 8.5, ['street-criminal', 'melbourne-local', 'female-local'], () => ['hoodie']);
        for (const m of ev.actors) m.dance = 0.6;
        let ang = 0;
        ev.tick = (dt, t) => {
          ang += dt * 5;
          const cx = spot.x + Math.cos(ang) * 3, cz = spot.z + Math.sin(ang) * 3, gy = terrainHeight(cx, cz) + 0.9;
          box(cx, gy, cz, -ang, 0x7a1f1f, 2, 1.1, 4.4); box(cx, gy + 0.75, cz, -ang, 0x222a33, 1.7, 0.7, 2);
          if (Math.random() < dt * 30) ev.smoke.push({ x: cx, y: gy - 0.4, z: cz, vx: rand(-1, 1), vy: rand(1, 2.2), vz: rand(-1, 1), a: 0 });
          for (const s of ev.smoke) { s.a += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; fx(s.x, s.y, s.z, 0.6 + s.a * 0.9, 0x888888, 1 - s.a / 3); }
          ev.smoke = ev.smoke.filter((s) => s.a < 3);
          audio.thump(spot.x, spot.z, Math.random() < dt * 8, 70);
        };
        return ev;
      }
    },
    fireworks: {
      weight: () => (nightNow() > 0.5 ? 1.6 : 0),
      start(spot) {
        // over the Yarra by Crown when that is close, else over the nearest water-ish spot ahead of the player
        const p = player(); const nearCrown = Math.hypot(crown.x - p.x, crown.z - p.z) < 900;
        const o = nearCrown ? crown : { x: spot.x, z: spot.z };
        const ev = { actors: [], x: o.x, z: o.z, life: 45, headline: 'Fireworks over the Yarra', sub: 'The Crown towers light up and half of Southbank looks up.', parts: [], next: 0 };
        ev.tick = (dt, t) => {
          ev.next -= dt;
          if (ev.next <= 0) {
            ev.next = rand(0.7, 1.6);
            const c = pick([0xff4d4d, 0xffd23f, 0x4dd2ff, 0xb48cff, 0x7dff6a, 0xffffff]);
            const bx = o.x + rand(-40, 40), by = rand(60, 100), bz = o.z + rand(-40, 40);
            for (let i = 0; i < 70; i++) { const u = rand(0, 6.283), v = Math.acos(rand(-1, 1)), sp = rand(8, 20); ev.parts.push({ x: bx, y: by, z: bz, vx: Math.sin(v) * Math.cos(u) * sp, vy: Math.cos(v) * sp, vz: Math.sin(v) * Math.sin(u) * sp, a: 0, c }); }
            audio.thump(bx, bz, true, 55);
          }
          for (const q of ev.parts) { q.a += dt; q.vy -= 9 * dt; q.vx *= 0.99; q.vz *= 0.99; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; fx(q.x, q.y, q.z, 0.45 * (1 - q.a / 2.4), q.c, 1 - q.a / 2.4); }
          ev.parts = ev.parts.filter((q) => q.a < 2.4);
        };
        return ev;
      }
    },
    seasons: {
      weight: () => 0.9,
      start() {
        const p = player();
        const ev = { actors: [], x: p.x, z: p.z, life: 70, headline: 'Four seasons in one day', sub: 'The southerly just arrived. Everyone is wearing the wrong jacket.', global: true };
        const prev = lightingSystem?.weather || 'clear';
        lightingSystem?.setWeather(prev === 'clear' ? pick(['rain', 'overcast', 'fog']) : 'clear');
        ev.end = () => lightingSystem?.setWeather(prev);
        ev.tick = () => { const q = player(); ev.x = q.x; ev.z = q.z; };
        return ev;
      }
    }
  };

  // ---- fx helpers: spheres and boxes into the shared fx mesh (rebuilt each frame) ---------------------------------------
  let fxN = 0;
  function fx(x, y, z, r, color, alpha = 1) {
    if (fxN >= 700 || r <= 0.02) return;
    tmpO.position.set(x, y, z); tmpO.rotation.set(0, 0, 0); tmpO.scale.setScalar(r); tmpO.updateMatrix();
    fxMesh.setMatrixAt(fxN, tmpO.matrix); tmpC.setHex(color).multiplyScalar(Math.max(0.25, alpha)); fxMesh.setColorAt(fxN, tmpC); fxN++;
  }
  function box(x, y, z, ry, color, w, h, d) {
    if (accN >= 900) return;
    tmpO.position.set(x, y, z); tmpO.rotation.set(0, ry, 0); tmpO.scale.set(w, h, d); tmpO.updateMatrix();
    accMesh.setMatrixAt(accN, tmpO.matrix); tmpC.setHex(color); accMesh.setColorAt(accN, tmpC); accN++;
  }
  // a cheap bass thump through the shared audio context, louder when close
  const audio = {
    ctx: null,
    thump(x, z, hit, freq = 52) {
      if (!hit) return;
      try {
        if (!this.ctx) this.ctx = window.__city?.audio?.context || window.__city?.audio?.ctx || null;
        const ctx = this.ctx; if (!ctx || ctx.state !== 'running') return;
        const p = player(), d = Math.hypot(x - p.x, z - p.z), g0 = Math.max(0, 1 - d / 160) * 0.35;
        if (g0 < 0.01) return;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(freq * 2, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + 0.12);
        g.gain.setValueAtTime(g0, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.32);
      } catch (e) { /* silent */ }
    }
  };

  // ---- scheduling -------------------------------------------------------------------------------------------------------
  const active = [];
  let nextAt = rand(25, 60), clock = 0, seen = false, lastHeadline = '';
  const _v = new THREE.Vector3();
  function trigger(name, { near = true } = {}) {
    const def = DEFS[name];
    if (!def) return false;
    const dist = near ? 28 : rand(130, 230);
    const spot = spotNear(dist, !!def.little);
    const ev = def.start(spot);
    ev.name = name; ev.age = 0; ev.seen = false; ev.def = def;
    active.push(ev);
    return true;
  }
  function despawn(ev) {
    ev.end?.();
    for (const m of ev.actors) { const i = actors.indexOf(m); if (i >= 0) actors.splice(i, 1); }
    const i = active.indexOf(ev); if (i >= 0) active.splice(i, 1);
  }
  function scheduleRandom() {
    if (active.length >= 2) return;
    const names = Object.keys(DEFS).filter((n) => !active.some((e) => e.name === n));
    const w = names.map((n) => DEFS[n].weight());
    let sum = w.reduce((a, b) => a + b, 0); if (sum <= 0) return;
    let r = Math.random() * sum, k = 0;
    while (k < names.length - 1 && (r -= w[k]) > 0) k++;
    trigger(names[k], { near: false });
  }

  let drewActors = false;
  function update(dt, elapsed = 0) {
    clock += dt;
    if (toastTimer > 0 && (toastTimer -= dt) <= 0) toastEl.classList.remove('on');
    if (!document.body.classList.contains('cinematic') && clock >= nextAt) { nextAt = clock + rand(60, 180); scheduleRandom(); }
    const p = player(), cam = cameraSystem.camera;
    accN = 0; fxN = 0;
    for (const ev of [...active]) {
      ev.age += dt;
      const d = Math.hypot(ev.x - p.x, ev.z - p.z);
      if (ev.age > ev.life || (d > DESPAWN_FAR && !ev.def.start.global && ev.name !== 'seasons') ) { despawn(ev); continue; }
      ev.tick?.(dt, clock);
      if (!ev.seen && (ev.name === 'seasons' || d < 110)) {
        _v.set(ev.x, 2, ev.z).project(cam);
        if (ev.name === 'seasons' || (_v.z < 1 && Math.abs(_v.x) < 1.05)) { ev.seen = true; toast(ev.headline, ev.sub); lastHeadline = ev.headline; }
      }
      // a passer-by's overheard line from a crowd, once in a while when close
      if (ev.actors.length && d < 30 && Math.random() < dt * 0.02 && toastTimer <= 0) toast(`"${pick(MELBOURNE_LINES)}"`, 'overheard');
    }
    // draw people
    if (actors.length || drewActors) {
      crowd.begin();
      for (const a of actors) {
        const t = clock + a.bob;
        let hx = a.x, hz = a.z, hd = a.heading;
        if (a.dance) { hd += Math.sin(t * 5) * 0.5 * a.dance; hx += Math.sin(t * 9) * 0.05 * a.dance; }
        else if (a.face && !a.v) hd = Math.atan2(a.face.x - a.x, a.face.z - a.z);
        a.rig.update(dt, hx, hz, hd, ground, null, a.dance ? 0.12 + Math.abs(Math.sin(t * 9)) * 0.1 * a.dance : 0, true, -1);
        crowd.add(a.rig, Math.hypot(a.x - p.x, a.z - p.z));
        const c = a.accC || a.team || [0xcc3333];
        for (const k of a.acc) ACC[k]?.(a, Array.isArray(c) ? c : [c]);
        if (a.fan) ACC.scarf(a, a.team);
      }
      crowd.end();
      drewActors = actors.length > 0;
    }
    accMesh.count = accN; accMesh.instanceMatrix.needsUpdate = true; if (accMesh.instanceColor) accMesh.instanceColor.needsUpdate = true;
    fxMesh.count = fxN; fxMesh.instanceMatrix.needsUpdate = true; if (fxMesh.instanceColor) fxMesh.instanceColor.needsUpdate = true;
  }

  return {
    update, trigger: (name, opts) => trigger(name, opts), get names() { return Object.keys(DEFS); },
    get active() { return active.map((e) => ({ name: e.name, age: e.age, x: e.x, z: e.z, actors: e.actors.length, seen: e.seen })); },
    despawnAll() { [...active].forEach(despawn); }, get lastHeadline() { return lastHeadline; }, get actorCount() { return actors.length; }
  };
}
