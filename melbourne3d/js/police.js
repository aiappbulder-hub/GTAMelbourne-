// Victoria Police, the parts you meet face to face (js/wanted.js decides the stars and sends the cars).
//
//  - Light bars: red and blue, flashing at night and whenever the police are after you, dark on a patrol in daylight. The
//    traffic's cruisers' bars read one switch (cars.js `lightbarActive`); the pursuit cars (js/pursuit.js, the model
//    models/custom/police.json) get a bar of their own here, and the nearest one lights the street with a point light.
//  - The siren: a synthesised wail and then a yelp (Web Audio, on the game's own context), louder as the nearest unit
//    closes (wanted.js passes the level), off the moment the chase ends.
//  - Officers on foot: at two stars or more, when a pursuit car has closed up and stopped (or is held up in traffic), two
//    officers get out. They run at you and call out (subtitle, and the browser's speech synthesis where there is one),
//    and arrest you if they reach you while you stand about (BUSTED, the same as standing beside a police car). At three
//    stars, or if you have been shooting, or once you have shot one of them, they open fire with the pistol: they are
//    armed hostiles of js/combat.js (`g.cop` tells combat where to run, where to face and whether to fire). When you get
//    away (far off, or in a moving car) or the heat goes out they run back to their car, get in and the car drives on.
//  - Killing an officer is a crime (wanted.crime('cop')): three stars at least.
//  - The patrol: the traffic's own cruisers (js/traffic.js: one car in twelve or so is police, on the road network with the
//    traffic's caps) are the patrol; a police car within 55 m of a crime sees it (wanted.js).
//
// None of this runs on a story job or in a cut scene: the police are off during jobs.
import * as THREE from 'three/webgpu';
import { lightbarActive } from './cars.js';

const CLASSIC = typeof location !== 'undefined' && new URLSearchParams(location.search).has('classic');
const OFFICERS = CLASSIC ? ['Police_Male_01', 'Police_Male_03'] : ['ara:cons', 'ara:sgt'];
const RUN = 5.2; // m/s on foot
const ARREST_DIST = 3.2;
const LINES_ARREST = ['Police! Get on the ground!', 'Stop right there! Police!', 'Hands where I can see them!', 'You are under arrest!'];
const LINES_FIGHT = ['Drop the weapon!', 'Shots fired! Shots fired!', 'Stop or I will shoot!', 'Officer needs help!'];

// ---- the siren: a wail (two slow sweeps) then a yelp (quick ones), looped ----------------------------------------------
const SIREN_SECS = 8;
function sirenCurve() {
  const rate = 60, a = new Float32Array(SIREN_SECS * rate);
  for (let i = 0; i < a.length; i++) {
    const t = i / rate;
    if (t < 4) a[i] = 640 + 880 * (0.5 - 0.5 * Math.cos(((t % 2) / 2) * Math.PI * 2)); // wail
    else { const ph = ((t - 4) % 0.32) / 0.32; a[i] = 720 + 900 * Math.sin(ph * Math.PI); } // yelp
  }
  return a;
}
function createSiren(audioSystem) {
  let node = null;
  const curve = sirenCurve();
  const context = () => { const c = audioSystem?.context; return c && c.state === 'running' && audioSystem.master ? c : null; };
  return function siren(level) {
    if (level <= 0.01) {
      if (!node) return;
      const { o, out, c } = node;
      node = null;
      const t = c.currentTime;
      try { out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + 0.15); o.stop(t + 0.2); } catch (e) { /* already stopped */ }
      return;
    }
    const c = context();
    if (!c) return;
    if (!node) {
      const o = c.createOscillator(), out = c.createGain(), bp = c.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.value = 900;
      bp.type = 'bandpass';
      bp.frequency.value = 1500;
      bp.Q.value = 0.55;
      out.gain.value = 0;
      o.connect(bp);
      bp.connect(out);
      out.connect(audioSystem.master);
      o.start();
      node = { o, out, c, end: 0 };
    }
    const t = c.currentTime;
    if (t > node.end - 0.5) {
      const start = Math.max(t, node.end + 0.001);
      try { node.o.frequency.setValueCurveAtTime(curve, start, SIREN_SECS); node.end = start + SIREN_SECS; } catch (e) { /* overlapping: next frame */ }
    }
    node.out.gain.setTargetAtTime(0.03 + 0.2 * level * level, t, 0.12); // (level falls with distance: wanted.js)
  };
}

export function createPolice({ scene, controllerManager, wanted, gameplay, missionSystem = null, lightingSystem = null, audioSystem = null, cast = null }) {
  const combat = gameplay.combat;
  const siren = createSiren(audioSystem);
  const tuning = { arrest: true, dismountDist: 40, lineEvery: 5.5 };
  const crews = new Map(); // unit (wanted.units entry) -> { u, p, officers: [g], phase: 'out' | 'back', t, stopT, awayT, stuckT, callT, line, arrestT, detached }
  cast?.preload?.(OFFICERS);

  const player = () => controllerManager.getActiveEntity();
  const onJob = () => !!missionSystem?.onJob;
  const cinematic = () => document.body.classList.contains('cinematic');
  const say = (text, secs = 3) => missionSystem?.sub?.(text, secs);

  // ---- light bars on the pursuit cars --------------------------------------------------------------------------------
  const redMat = new THREE.MeshStandardNodeMaterial({ color: 0x3a0508, emissive: 0xff1522, emissiveIntensity: 0.2, roughness: 0.25 });
  const blueMat = new THREE.MeshStandardNodeMaterial({ color: 0x06143a, emissive: 0x2a6bff, emissiveIntensity: 0.2, roughness: 0.25 });
  const baseMat = new THREE.MeshStandardNodeMaterial({ color: 0x121417, roughness: 0.5, metalness: 0.4 });
  const glow = new THREE.PointLight(0xff1828, 0, 16, 1.4);
  glow.position.set(0, -1000, 0);
  scene.add(glow);
  let flashT = 0, barsOn = false;
  function dress(p) {
    const root = p.root;
    if (!root || root.userData.vicpol) return;
    root.userData.vicpol = true;
    root.traverse((o) => { if (o.isMesh && o.material?.name === 'Livery-Yellow') { o.material = o.material.clone(); o.material.color.setHex(0xf4f6f8); } }); // blue and white chequer, not blue and yellow
    // the roof, from the glass: measured with the car at the origin facing +z
    const keep = { p: root.position.clone(), r: root.rotation.clone() };
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    const glass = new THREE.Box3(), all = new THREE.Box3();
    root.traverse((o) => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o); all.union(b); if (o.material?.name === 'Glass') glass.union(b); } });
    root.position.copy(keep.p);
    root.rotation.copy(keep.r);
    const roofY = glass.isEmpty() ? all.max.y - 0.1 : glass.max.y;
    const zc = glass.isEmpty() ? 0 : (glass.min.z + glass.max.z) / 2;
    const bar = new THREE.Group();
    bar.name = 'LightBar';
    const box = (w, h, d, x, y, z, m) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); bar.add(mesh); return mesh; };
    box(1.0, 0.05, 0.3, 0, 0.025, 0, baseMat);
    box(0.46, 0.085, 0.26, -0.25, 0.085, 0, redMat);
    box(0.46, 0.085, 0.26, 0.25, 0.085, 0, blueMat);
    box(0.05, 0.05, 0.24, 0, 0.07, 0, baseMat);
    bar.position.set(0, roofY + 0.005, zc + 0.05);
    root.add(bar);
  }

  // ---- officers --------------------------------------------------------------------------------------------------------
  function spawnCrew(u) {
    const p = u.p, h = p.heading, pos = p.position;
    const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    const P = player().position;
    const crew = { u, p, officers: [], phase: 'out', t: 0, stopT: 0, awayT: 0, stuckT: 0, callT: 1.2, line: 0, arrestT: 0, detached: false, provoked: false };
    for (let i = 0; i < 2; i++) {
      const side = i ? -1 : 1;
      const x = pos.x + rx * side * 1.7 + fx * 0.5, z = pos.z + rz * side * 1.7 + fz * 0.5;
      const g = combat.spawn({ x, z, weapon: 'pistol', model: OFFICERS[i % OFFICERS.length], hp: 70, heading: Math.atan2(P.x - x, P.z - z), sight: 45 });
      g.cop = { fire: false, move: 0, face: g.heading };
      g.crew = crew;
      g.px = x; g.pz = z;
      crew.officers.push(g);
    }
    crews.set(u, crew);
    return crew;
  }
  function speak(text, from) {
    say(`Officer: "${text}"`, 3);
    try {
      const ss = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
      if (!ss || (audioSystem && audioSystem.enabled === false) || ss.speaking) return;
      const P = player().position, d = Math.hypot(P.x - from.x, P.z - from.z);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-AU';
      u.rate = 1.1;
      u.pitch = 0.8;
      u.volume = Math.max(0.15, Math.min(1, 1.2 - d / 45));
      ss.speak(u);
    } catch (e) { /* no speech here */ }
  }
  function board(g) {
    const i = combat.list.indexOf(g);
    if (i >= 0) combat.list.splice(i, 1);
    cast?.setGunman?.(g.key, g.model, null);
    g.boarded = true;
  }
  const leavers = []; // pursuit cars driving off on their own (no longer in wanted.units): updated here
  function endCrew(crew, resume) {
    crews.delete(crew.u);
    for (const g of crew.officers) if (!g.boarded && !g.dead) board(g);
    const p = crew.p;
    if (p.active) {
      if (resume && !crew.detached && wanted.stars > 0) {
        const seed = wanted.routeFrom(p.position.x, p.position.z);
        if (seed) { p.release(seed); return; } // back on the chase, on the route you drove
      }
      p.driveOff();
      leavers.push(p);
    }
    if (!crew.detached) wanted.drop(crew.u);
  }
  function stepCrew(crew, dt, P, e, inCar) {
    const { p } = crew;
    crew.t += dt;
    const alive = crew.officers.filter((g) => !g.dead && !g.boarded);
    if (!p.active) { for (const g of crew.officers) if (!g.boarded && !g.dead) board(g); crews.delete(crew.u); return; }
    if (!alive.length) { if (crew.t > 4) endCrew(crew, true); return; }
    const stars = wanted.stars;
    const pspeed = Math.abs(e.speed || 0);
    let nearest = Infinity;
    for (const g of alive) nearest = Math.min(nearest, Math.hypot(P.x - g.x, P.z - g.z));
    if (crew.phase === 'out') {
      const shooting = stars >= 3 || wanted.shotAge() < 10 || crew.provoked || alive.some((g) => g.hp < g.maxHp);
      if (crew.officers.some((g) => g.hp < g.maxHp)) crew.provoked = true;
      // got away?
      if ((inCar && pspeed > 8 && nearest > 30) || nearest > 85) crew.awayT += dt; else crew.awayT = Math.max(0, crew.awayT - dt);
      let moved = 0;
      for (const g of alive) { moved += Math.hypot(g.x - g.px, g.z - g.pz); g.px = g.x; g.pz = g.z; }
      if (!shooting && nearest > ARREST_DIST + 1.5 && moved < 0.3 * dt) crew.stuckT += dt; else crew.stuckT = 0;
      if (crew.awayT > 4 || crew.stuckT > 5 || stars === 0) { crew.phase = 'back'; crew.t = 0; }
      // calling out
      crew.callT -= dt;
      if (nearest < 30 && crew.callT <= 0) {
        const lines = shooting ? LINES_FIGHT : LINES_ARREST;
        speak(lines[crew.line++ % lines.length], alive[0]);
        crew.callT = tuning.lineEvery;
      }
      for (const g of alive) {
        const D = Math.hypot(P.x - g.x, P.z - g.z);
        g.cop.fire = shooting && !P.dead;
        g.cop.face = Math.atan2(P.x - g.x, P.z - g.z);
        g.cop.move = !shooting && D > 2 ? RUN : 0;
      }
      // the arrest: close up on a player who is standing about
      if (tuning.arrest && !shooting && nearest < ARREST_DIST && pspeed < 2.5) {
        crew.arrestT += dt;
        if (crew.arrestT > 1.2) { crews.forEach((c) => { c.phase = 'back'; c.t = 0; }); wanted.bust(); return; }
      } else crew.arrestT = Math.max(0, crew.arrestT - dt);
    }
    if (crew.phase === 'back') {
      let home = true;
      for (const g of alive) {
        const dx = p.position.x - g.x, dz = p.position.z - g.z, D = Math.hypot(dx, dz);
        g.cop.fire = false;
        g.cop.face = Math.atan2(dx, dz);
        g.cop.move = D > 2.2 ? RUN : 0;
        if (D < 2.4 || crew.t > 25) board(g); else home = false;
      }
      if (home) endCrew(crew, true);
    }
  }

  // ---- the frame -----------------------------------------------------------------------------------------------------
  const night = () => lightingSystem?.activePresetId === 'midnight';
  function dropAll() {
    for (const crew of crews.values()) for (const g of crew.officers) { if (!g.boarded && !g.dead) board(g); }
    for (const crew of crews.values()) if (crew.p.active && crew.detached) crew.p.stop();
    crews.clear();
    for (const p of leavers.splice(0)) p.stop();
  }
  function update(dt) {
    dt = Math.min(dt, 0.1);
    flashT += dt;
    if (onJob() || cinematic()) {
      if (crews.size) dropAll();
      siren(0);
      lightbars(dt, false);
      return;
    }
    const e = player(), P = e.position, inCar = controllerManager.activeMode === 'car';
    const stars = wanted.stars;
    for (const u of wanted.units) {
      dress(u.p);
      if (stars >= 2 && !crews.has(u) && u.p.root && u.p.active && !u.p.leaving && crews.size < 2) {
        const d = u.p.distance();
        u.stopT = u.p.speed < 1.2 ? (u.stopT || 0) + dt : 0;
        if ((d < tuning.dismountDist && u.stopT > 0.8) || (u.stopT > 4 && d < 90)) spawnCrew(u);
      }
    }
    for (const crew of [...crews.values()]) stepCrew(crew, dt, P, e, inCar);
    for (const crew of crews.values()) if (crew.detached) crew.p.update(dt); // (wanted.js updates the rest)
    for (let i = leavers.length - 1; i >= 0; i--) { leavers[i].update(dt); if (!leavers[i].active) leavers.splice(i, 1); }
    for (const crew of crews.values()) {
      dress(crew.p);
      for (const g of crew.officers) if (g.dead && !g.reported) { g.reported = true; wanted.crime('cop', g.x, g.z); }
    }
    lightbars(dt, stars > 0);
  }

  // The bars flash at night and while the police are after you
  function lightbars(dt, chase) {
    const on = chase || night();
    if (on !== barsOn) { barsOn = on; lightbarActive.value = on ? 1 : 0; }
    const ph = (flashT * 1.25) % 1, strobe = (flashT * 12) % 1 < 0.5;
    const red = on && ph < 0.5 && strobe, blue = on && ph >= 0.5 && strobe;
    redMat.emissiveIntensity = red ? 5 : 0.08;
    blueMat.emissiveIntensity = blue ? 6 : 0.08;
    // the nearest pursuit car lights the street
    let best = null, bd = 70;
    const cam = player().position;
    const cars = [...wanted.units.map((u) => u.p), ...[...crews.values()].map((c) => c.p), ...leavers];
    for (const p of cars) {
      if (!p.active || !p.root || !p.root.visible) continue;
      const d = Math.hypot(p.position.x - cam.x, p.position.z - cam.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (best && on && (red || blue)) {
      glow.color.setHex(red ? 0xff1828 : 0x2a6bff);
      glow.position.set(best.position.x, best.position.y + 2.4, best.position.z);
      glow.intensity = 26;
    } else { glow.intensity = 0; glow.position.set(0, -1000, 0); }
  }

  return {
    update,
    siren,
    tuning,
    /** wanted.js: a unit is leaving. true: its officers are out and it stays until they are back in (then drives on) */
    adopt(u) {
      const crew = crews.get(u);
      if (!crew) return false;
      crew.detached = true; // (wanted.js has let it go: this module drives it from here)
      if (onJob() || !crew.p.active) {
        crews.delete(u);
        for (const g of crew.officers) if (!g.boarded && !g.dead) board(g);
        if (crew.p.active) crew.p.stop();
      } else if (crew.officers.every((g) => g.dead || g.boarded)) endCrew(crew, false);
      else { crew.phase = 'back'; crew.t = 0; }
      return true;
    },
    /** wanted.js: this unit has officers out (it does not count as a police car standing beside you) */
    hasCrew(u) { return crews.has(u); },
    /** The traffic's police cruisers (the patrol), for checks */
    patrolCars() { return (window.__city?.trafficSystem?.cars || []).filter((c) => c.isPolice); },
    /** The footprints of the cars this module drives (parked while officers are out, or driving off) */
    boxes() { return [...[...crews.values()].filter((c) => c.detached).map((c) => c.p), ...leavers].map((p) => p.box()).filter(Boolean); },
    get barsOn() { return barsOn; },
    debug() {
      return {
        barsOn,
        crews: [...crews.values()].map((c) => ({
          phase: c.phase, detached: c.detached, t: +c.t.toFixed(1), arrestT: +c.arrestT.toFixed(1), car: [Math.round(c.p.position.x), Math.round(c.p.position.z)],
          officers: c.officers.map((g) => ({ x: +g.x.toFixed(1), z: +g.z.toFixed(1), hp: g.hp, dead: g.dead, boarded: !!g.boarded, fire: g.cop.fire, move: g.cop.move, visible: g.visible, shots: g.shotsFired,
            d: +Math.hypot(player().position.x - g.x, player().position.z - g.z).toFixed(1) }))
        }))
      };
    }
  };
}
