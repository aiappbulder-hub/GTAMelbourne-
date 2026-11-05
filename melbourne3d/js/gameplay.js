import * as THREE from 'three/webgpu';
import { SPORTS_DRIVE } from './controllers.js';

// The player's game on foot and behind the wheel (Melbourne):
// - Cars: F (or the touch CAR prompt) gets in the player's own taxi or any car in the traffic, and out again. From a
//   few metres away the player walks to the driver's door first (the right-hand side: cars here are right-hand
//   drive). A car taken from the traffic keeps its own body and paint (traffic.js draws it where the player's car
//   physics puts it) and stays parked where it's left.
// - Guns: pistol, Uzi and shotgun (Tab or the wheel to change, G to holster). Hold the right mouse button to aim
//   where the camera looks; click (or J, or FIRE on touch) to shoot. Without aiming, a shot locks on to the nearest
//   person or car in front. Shots hit people, cars and walls; people nearby run.
// - People: T talks to the person in front of you (they stop and turn to you); T with a gun drawn robs them.

const WEAPONS = [
  { id: 'pistol', name: 'Pistol', mag: 12, rate: 0.28, reload: 1.2, range: 60, pellets: 1, spread: 0.012, auto: false, sound: 'pistol' },
  { id: 'uzi', name: 'Uzi', mag: 32, rate: 0.085, reload: 1.6, range: 45, pellets: 1, spread: 0.05, auto: true, sound: 'uzi' },
  { id: 'shotgun', name: 'Shotgun', mag: 6, rate: 0.85, reload: 2.2, range: 26, pellets: 8, spread: 0.11, auto: false, sound: 'shotgun' }
];
const ENTER_REACH = 2.8; // metres from the car's side: get straight in
const WALK_REACH = 9; // metres: walk to the door first
const TALK_REACH = 3.6;
const LOCK_CONE = 0.62; // radians either side of the facing for lock-on without aiming
const LOCK_RANGE = 40;

const LINES = [
  "Flinders Street's that way, mate. Under the clocks.",
  'You going to the footy Saturday? Carn the Pies!',
  "Bloody trams. The 86 never comes when you want it.",
  'Grab a coffee on Degraves. Best in town, I reckon.',
  "Four seasons in one day, this city. Brought the wrong jacket again.",
  "Watch yourself round here. The Broadmeadows lot have been about.",
  "Heard Taskforce Kestrel's cracking down. Keep your head down.",
  "Reckon it'll rain later. Always does.",
  "Sorry mate, no change. Ask at the 7-Eleven.",
  "Have you been to the Queen Vic Market? The doughnut van, mate.",
  'Lygon Street for a parma, that\'s my tip.',
  "You lost? Swanston's the one with all the trams.",
  "Don't touch me, ya weirdo.",
  "No worries. Have a good one.",
  "Can't stop, I'm late for work. Again.",
  "MCG's that way. Follow the scarves.",
  "Is it me or are there more cranes than people in this town?",
  "My cousin knows a bloke who knows Vince. Small world, eh."
];
const GREETINGS = ["G'day.", 'Excuse me, mate.', "How ya going?", 'Oi, got a sec?', 'Hey there.'];

const CSS = `
.gp-prompt { position: fixed; left: 50%; bottom: 160px; transform: translateX(-50%); z-index: 30; padding: 7px 14px; border-radius: 999px;
  background: rgba(10,12,16,.78); color: #fff; font: 600 14px/1 Inter, system-ui, sans-serif; pointer-events: auto; cursor: pointer; white-space: nowrap; }
.gp-prompt:empty { display: none; }
.gp-prompt kbd { display: inline-block; min-width: 18px; margin-right: 6px; padding: 2px 5px; border-radius: 5px; background: #ffd23f; color: #111; font: 800 12px/1.2 Inter, sans-serif; text-align: center; }
.gp-weapon { position: fixed; right: 18px; top: 160px; z-index: 30; padding: 6px 12px; border-radius: 10px; background: rgba(10,12,16,.72);
  color: #fff; font: 700 14px/1.3 Inter, system-ui, sans-serif; text-align: right; pointer-events: none; }
.gp-weapon b { display: block; font: 800 20px/1 'JetBrains Mono', monospace; color: #ffd23f; }
.gp-weapon[hidden] { display: none; }
.gp-cross { position: fixed; left: 50%; top: 46%; width: 22px; height: 22px; margin: -11px 0 0 -11px; z-index: 29; pointer-events: none;
  border: 2px solid rgba(255,255,255,.85); border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
.gp-cross::after { content: ''; position: absolute; left: 8px; top: 8px; width: 2px; height: 2px; background: #fff; border-radius: 1px; }
.gp-cross.lock { border-color: #ff4040; }
.gp-cross[hidden] { display: none; }
.gp-fire { position: fixed; right: 26px; bottom: 210px; z-index: 31; width: 74px; height: 74px; border-radius: 50%; border: 0;
  background: rgba(220, 40, 40, .82); color: #fff; font: 800 14px/1 Inter, sans-serif; display: none; }
body.touch-enabled .gp-fire.on { display: block; }
.gp-say { position: fixed; z-index: 30; max-width: 260px; padding: 8px 12px; border-radius: 12px; background: rgba(255,255,255,.95); color: #111;
  font: 600 14px/1.35 Inter, system-ui, sans-serif; transform: translate(-50%, -100%); pointer-events: none; box-shadow: 0 6px 20px rgba(0,0,0,.3); }
.gp-say::after { content: ''; position: absolute; left: 50%; bottom: -7px; margin-left: -7px; border: 7px solid transparent; border-bottom: 0; border-top-color: rgba(255,255,255,.95); }
.gp-say small { display: block; color: #a0336b; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
`;

export function createGameplay({ scene, renderer, controllerManager, cameraSystem, trafficSystem, missionSystem, selectMode }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const div = (cls) => { const e = document.createElement('div'); e.className = cls; document.body.append(e); return e; };
  const elPrompt = div('gp-prompt');
  const elWeapon = div('gp-weapon');
  const elCross = div('gp-cross');
  elCross.hidden = true;
  const elSay = div('gp-say');
  elSay.hidden = true;
  const fireBtn = document.createElement('button');
  fireBtn.className = 'gp-fire';
  fireBtn.type = 'button';
  fireBtn.textContent = 'FIRE';
  document.body.append(fireBtn);

  const cm = controllerManager;
  // mode changes made here skip beforeMode() (main.js routes the HUD's mode buttons through it)
  let internal = false;
  const go = (mode) => { internal = true; try { selectMode(mode); } finally { internal = false; } };
  const person = cm.entities.person;
  const car = cm.entities.car;
  const carMesh = car.mesh;
  let clock = 0;

  // ------------------------------------------------------------------------------------------------------------------
  // Cars
  // ------------------------------------------------------------------------------------------------------------------
  // The car entity (controllers.js) is the physics of whatever the player drives: the taxi (its own body), a car taken
  // from the traffic (drawn by traffic.js) or the sports car (the HSB Clubbie R8, drawn here). Whatever is left behind
  // stays parked: the taxi as a copy of its body, a taken car in the traffic's hands, the sports car where it stopped.
  let riding = 'taxi'; // what the car entity is: 'taxi', 'sports' or a traffic vehicle
  let lastRide = 'taxi'; // the last thing driven (the HUD's car button goes back to it)
  let taxiClone = null; // the player's taxi left parked while something else is driven
  const driving = () => (typeof riding === 'object' ? riding : null);
  const ownTaxiParked = () => !(cm.activeMode === 'car' && riding === 'taxi');
  const TAXI_LABEL = car.label;

  // --- The sports car: the old game's HSB Clubbie R8 (models/custom/clubbie.json), with its own handling
  const sports = { mesh: null, wheels: {}, x: -237, z: 160, heading: 0, y: 0, pitch: 0, roll: 0, ready: false };
  (async () => {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(new URL('../../models/custom/clubbie.json', import.meta.url).href);
      const root = new THREE.Group();
      root.name = 'SportsCar';
      root.rotation.order = 'YXZ';
      gltf.scene.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
        if (o.material && o.material.name === 'Body') o.material.color.setHex(0xd8221d); // Clubbie red
      });
      root.add(gltf.scene);
      for (const n of ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right']) {
        const w = gltf.scene.getObjectByName(n);
        if (w) { w.rotation.order = 'YXZ'; sports.wheels[n] = w; }
      }
      scene.add(root);
      sports.mesh = root;
      sports.ready = true;
      placeSports();
    } catch (e) {
      console.warn('[gameplay] the sports car failed to load', e);
    }
  })();
  function placeSports() {
    const m = sports.mesh;
    if (!m) return;
    m.position.set(sports.x, sports.y, sports.z);
    m.rotation.set(sports.pitch, sports.heading, sports.roll);
    m.updateMatrixWorld(true);
  }

  function parkTaxiCopy() {
    if (taxiClone) return;
    taxiClone = carMesh.clone(true);
    taxiClone.traverse((o) => { if (o.isLight) o.visible = false; });
    taxiClone.position.copy(car.position);
    taxiClone.rotation.set(0, car.heading, 0);
    taxiClone.name = 'ParkedTaxi';
    scene.add(taxiClone);
    taxiClone.updateMatrixWorld(true);
  }
  function placeCarEntity(x, z, heading) {
    car.position.set(x, 0, z);
    car.heading = heading;
    car.speed = 0;
    car.vx = 0;
    car.vz = 0;
    if ('angularVel' in car) car.angularVel = 0;
    car.prevX = x;
    car.prevZ = z;
  }
  // the right-hand (driver's) side door of a car at (x, z) facing heading
  const doorOf = (x, z, heading, out = 1.45) => ({ x: x - Math.cos(heading) * out, z: z + Math.sin(heading) * out });

  // Leave what the car entity is now where it stands
  function parkCurrent() {
    if (!riding) return; // already parked (on foot)
    if (riding === 'taxi') { parkTaxiCopy(); }
    else if (riding === 'sports') {
      sports.x = car.position.x; sports.z = car.position.z; sports.heading = car.heading; sports.y = car.position.y;
      sports.pitch = car.kerbPitch || 0; sports.roll = car.kerbRoll || 0;
      placeSports();
    } else if (riding) trafficSystem.parkCar(riding);
    lastRide = riding;
    riding = null;
  }
  function enterOwnTaxi() {
    if (riding !== 'taxi') parkCurrent();
    if (taxiClone) {
      placeCarEntity(taxiClone.position.x, taxiClone.position.z, taxiClone.rotation.y);
      scene.remove(taxiClone);
      taxiClone = null;
    }
    riding = lastRide = 'taxi';
    car.drive = null;
    car.label = TAXI_LABEL;
    go('car');
    carMesh.visible = true;
  }
  function enterSports() {
    if (!sports.ready) return;
    if (riding !== 'sports') parkCurrent();
    placeCarEntity(sports.x, sports.z, sports.heading);
    riding = lastRide = 'sports';
    car.drive = SPORTS_DRIVE;
    car.label = 'HSB Clubbie R8';
    go('car');
    carMesh.visible = false;
    missionSystem?.sub?.('HSB Clubbie R8. Try not to wrap it round a tram.', 2.5);
  }
  function enterTrafficCar(v) {
    const wasMoving = v.edge && v.speed > 0.5;
    if (riding !== v) parkCurrent();
    trafficSystem.takeCar(v);
    riding = lastRide = v;
    placeCarEntity(v.x, v.z, v.yaw);
    car.drive = null;
    car.label = `Stolen ${v.bodyType === 'pickup' ? 'ute' : v.bodyType}`;
    go('car');
    // (setMode shows the active vehicle's own body: here the taken car is drawn by the traffic instead)
    carMesh.visible = false;
    if (wasMoving || v.edge === null) trafficSystem.scarePeds(v.x, v.z, 18, 6);
    missionSystem?.sub?.(wasMoving ? 'You dragged the driver out and took the car.' : 'You took the car.', 2.5);
  }
  function exitCar() {
    if (Math.abs(car.speed) > 9) { missionSystem?.sub?.('Slow down before you get out.', 1.5); return; }
    const d = doorOf(car.position.x, car.position.z, car.heading, 1.6);
    if (riding !== 'taxi') {
      parkCurrent();
      // the car entity is nobody's now: keep the taxi's body hidden where it stood
      carMesh.visible = false;
    } else {
      lastRide = 'taxi';
    }
    go('person');
    if (riding === null && lastRide !== 'taxi') carMesh.visible = false;
    person.position.set(d.x, 0.22, d.z);
    person.heading = car.heading + Math.PI / 2;
    person.speed = 0;
  }
  /** The sports car, brought round to the kerb beside the player */
  function summonSports() {
    if (!sports.ready || riding === 'sports' && cm.activeMode === 'car') return;
    const p = cm.activeMode === 'person' ? person.position : car.position;
    const h = cm.activeMode === 'person' ? person.heading : car.heading;
    // 3.5 m to the player's left, facing the same way
    sports.x = p.x + Math.cos(h) * 3.5;
    sports.z = p.z - Math.sin(h) * 3.5;
    sports.heading = h;
    sports.y = 0;
    sports.pitch = sports.roll = 0;
    placeSports();
    missionSystem?.sub?.('Your HSB Clubbie R8 is waiting. Walk up and press F.', 3);
  }

  // the nearest car to get into: [kind, target, distance to its driver's door]
  function nearestRide() {
    const p = person.position;
    let best = null;
    const consider = (r) => { if (!best || r.dist < best.dist) best = r; };
    if (ownTaxiParked()) {
      const t = taxiClone || car;
      const h = taxiClone ? taxiClone.rotation.y : car.heading;
      const d = doorOf(t.position.x, t.position.z, h);
      if (taxiClone || riding === 'taxi' || lastRide === 'taxi') consider({ kind: 'taxi', door: d, dist: Math.hypot(d.x - p.x, d.z - p.z) });
    }
    if (sports.ready && !(riding === 'sports' && cm.activeMode === 'car')) {
      const d = doorOf(sports.x, sports.z, sports.heading);
      consider({ kind: 'sports', door: d, dist: Math.hypot(d.x - p.x, d.z - p.z) });
    }
    const v = trafficSystem.nearestCar(p.x, p.z, WALK_REACH + 3);
    if (v) {
      const d = doorOf(v.x, v.z, v.yaw);
      consider({ kind: 'traffic', v, door: d, dist: Math.hypot(d.x - p.x, d.z - p.z) });
    }
    return best && best.dist < WALK_REACH ? best : null;
  }

  let approach = null; // walking to a car's door
  function tryEnter() {
    const r = nearestRide();
    if (!r) return;
    if (r.dist <= ENTER_REACH) return board(r);
    approach = { ride: r, t: 0 };
  }
  function board(r) {
    approach = null;
    if (r.kind === 'taxi') enterOwnTaxi();
    else if (r.kind === 'sports') enterSports();
    else enterTrafficCar(r.v);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Guns
  // ------------------------------------------------------------------------------------------------------------------
  let armed = true;
  let wi = 0;
  const ammo = WEAPONS.map((w) => w.mag);
  let cooldown = 0, reloading = 0, triggerHeld = false, aimHeld = false;
  let lockTarget = null;

  // tracers and muzzle flashes, pooled
  const tracerMat = new THREE.LineBasicNodeMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9, depthWrite: false });
  const tracers = Array.from({ length: 16 }, () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.LineSegments(g, tracerMat);
    l.frustumCulled = false;
    l.visible = false;
    l.userData.t = 0;
    scene.add(l);
    return l;
  });
  let tracerNext = 0;
  const flashMat = new THREE.MeshBasicNodeMaterial({ color: 0xffc860, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), flashMat);
  flash.visible = false;
  scene.add(flash);
  const sparkMat = new THREE.MeshBasicNodeMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparks = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), sparkMat);
    m.visible = false;
    m.userData.t = 0;
    scene.add(m);
    return m;
  });
  let sparkNext = 0;
  let flashT = 0;

  // gunshots synthesised with Web Audio (a filtered noise burst and a thump)
  let audio = null;
  function bang(kind, dist = 0) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime;
      const len = kind === 'shotgun' ? 0.5 : kind === 'uzi' ? 0.12 : 0.28;
      const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * len), audio.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, kind === 'shotgun' ? 2.2 : 3.5);
      const src = audio.createBufferSource();
      src.buffer = buf;
      const filter = audio.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = (kind === 'shotgun' ? 2400 : kind === 'uzi' ? 4200 : 3400) / (1 + dist / 60);
      const gain = audio.createGain();
      gain.gain.setValueAtTime((kind === 'shotgun' ? 0.9 : 0.6) / (1 + dist / 25), t);
      src.connect(filter).connect(gain).connect(audio.destination);
      src.start(t);
      const osc = audio.createOscillator();
      const og = audio.createGain();
      osc.frequency.setValueAtTime(kind === 'shotgun' ? 90 : 140, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      og.gain.setValueAtTime(0.5 / (1 + dist / 25), t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(og).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    } catch { /* no audio */ }
  }

  // Where a shot from (x, z) along (dx, dz) stops: the first person, car or wall within range
  function trace(x, z, dx, dz, range) {
    const peds = trafficSystem.peds;
    const step = 0.5;
    for (let s = 0.6; s <= range; s += step) {
      const px = x + dx * s, pz = z + dz * s;
      // walls
      for (const c of cm.nearColliders(px, pz, 0.5)) {
        if ((c.minY ?? 0) > 2 || px < c.minX || px > c.maxX || pz < c.minZ || pz > c.maxZ) continue;
        if (c.polygon && !insidePoly(c.polygon.outer, px, pz)) continue;
        return { kind: 'wall', x: px, z: pz, dist: s };
      }
      for (const p of peds) {
        if (!p.placed || p.dead) continue;
        if (Math.abs(p.x - px) < 0.45 && Math.abs(p.z - pz) < 0.45) return { kind: 'ped', p, x: px, z: pz, dist: s };
      }
      for (const v of trafficSystem.cars) {
        if (v.driven || !(v.edge || v.parked)) continue;
        const ox = px - v.x, oz = pz - v.z;
        const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
        const along = ox * fx + oz * fz, across = ox * fz - oz * fx;
        if (Math.abs(along) < (v.halfL ?? 2.2) && Math.abs(across) < v.halfWidth) return { kind: 'car', v, x: px, z: pz, dist: s };
      }
    }
    return { kind: 'none', x: x + dx * range, z: z + dz * range, dist: range };
  }
  function insidePoly(poly, x, z) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  }

  // Lock-on: the nearest living person or car within the cone in front of `yaw`
  function findTarget(yaw, cone) {
    const p = person.position;
    let best = null, bestScore = Infinity;
    const consider = (x, z, t) => {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.8 || d > LOCK_RANGE) return;
      let a = Math.atan2(dx, dz) - yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) > cone) return;
      const score = d * (1 + Math.abs(a) * 2);
      if (score < bestScore) { bestScore = score; best = t; }
    };
    for (const q of trafficSystem.peds) if (q.placed && !q.dead) consider(q.x, q.z, { kind: 'ped', q, get x() { return q.x; }, get z() { return q.z; } });
    for (const v of trafficSystem.cars) if (!v.driven && (v.edge || v.parked)) consider(v.x, v.z, { kind: 'car', v, get x() { return v.x; }, get z() { return v.z; } });
    return best;
  }

  function fire() {
    if (!armed || cm.activeMode !== 'person' || reloading > 0 || cooldown > 0) return;
    const w = WEAPONS[wi];
    if (ammo[wi] <= 0) { reloading = w.reload; return; }
    ammo[wi]--;
    cooldown = w.rate;
    // aim: where the camera looks (aiming), else at the lock-on target, else straight ahead
    let yaw = person.heading;
    if (aimHeld && cm.cameraYaw !== null) yaw = cm.cameraYaw;
    const t = lockTarget || (!aimHeld && findTarget(person.heading, LOCK_CONE));
    if (t) yaw = Math.atan2(t.x - person.position.x, t.z - person.position.z);
    person.heading = yaw;
    const mx = person.position.x + Math.sin(yaw) * 0.55, mz = person.position.z + Math.cos(yaw) * 0.55;
    const my = person.position.y + 1.38;
    flash.position.set(mx, my, mz);
    flash.visible = true;
    flashT = 0.05;
    bang(w.sound);
    for (let k = 0; k < w.pellets; k++) {
      const a = yaw + (Math.random() - 0.5) * 2 * w.spread;
      const dx = Math.sin(a), dz = Math.cos(a);
      const hit = trace(person.position.x, person.position.z, dx, dz, w.range);
      const tr = tracers[tracerNext++ % tracers.length];
      const pos = tr.geometry.attributes.position;
      pos.setXYZ(0, mx, my, mz);
      pos.setXYZ(1, hit.x, hit.kind === 'ped' ? my - 0.25 : my - 0.1, hit.z);
      pos.needsUpdate = true;
      tr.visible = true;
      tr.userData.t = 0.06;
      if (hit.kind !== 'none') {
        const sp = sparks[sparkNext++ % sparks.length];
        sp.position.set(hit.x, hit.kind === 'ped' ? 1.1 : my - 0.1, hit.z);
        sp.visible = true;
        sp.userData.t = 0.08;
      }
      if (hit.kind === 'ped') trafficSystem.killPed(hit.p, person.position.x, person.position.z);
      else if (hit.kind === 'car') trafficSystem.shootCar(hit.v);
    }
    trafficSystem.scarePeds(person.position.x, person.position.z, 40, 10);
    if (ammo[wi] <= 0) reloading = w.reload;
  }
  function switchWeapon(d) {
    wi = (wi + d + WEAPONS.length) % WEAPONS.length;
    armed = true;
    reloading = 0;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Talking
  // ------------------------------------------------------------------------------------------------------------------
  let chat = null; // { p, lines: [[who, text], ...], k, t }
  function nearestPed(maxDist) {
    const p = person.position;
    let best = null, bd = maxDist;
    for (const q of trafficSystem.peds) {
      if (!q.placed || q.dead) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  function talk() {
    if (cm.activeMode !== 'person') return;
    const q = nearestPed(TALK_REACH);
    if (!q) return;
    person.heading = Math.atan2(q.x - person.position.x, q.z - person.position.z);
    if (armed && aimHeld) {
      // a hold-up
      const cash = 20 + Math.floor(Math.random() * 10) * 10;
      trafficSystem.talkToPed(q, person.position.x, person.position.z, 1.5);
      chat = { p: q, lines: [['You', 'Wallet. Now.'], ['Local', `Alright, alright! Take it, $${cash}, just don't shoot!`]], k: 0, t: 0 };
      missionSystem?.addMoney?.(cash);
      missionSystem?.onTalk?.(true);
      setTimeout(() => trafficSystem.scarePeds(q.x, q.z, 6, 10), 2600);
      return;
    }
    trafficSystem.talkToPed(q, person.position.x, person.position.z, 7);
    missionSystem?.onTalk?.(false);
    const line = LINES[Math.floor(Math.random() * LINES.length)];
    chat = { p: q, lines: [['You', GREETINGS[Math.floor(Math.random() * GREETINGS.length)]], ['Local', line]], k: 0, t: 0 };
  }
  const _v3 = new THREE.Vector3();
  function placeBubble(x, y, z) {
    _v3.set(x, y, z).project(cameraSystem.camera);
    if (_v3.z > 1 || Math.abs(_v3.x) > 1.2 || Math.abs(_v3.y) > 1.2) { elSay.hidden = true; return; }
    elSay.style.left = `${((_v3.x + 1) / 2) * window.innerWidth}px`;
    elSay.style.top = `${((1 - _v3.y) / 2) * window.innerHeight - 8}px`;
    elSay.hidden = false;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------------------------------------------------------
  const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.repeat) return;
    switch (e.code) {
      case 'KeyF':
        if (cm.activeMode === 'car') exitCar();
        else if (cm.activeMode === 'person') tryEnter();
        break;
      case 'KeyT':
        talk();
        break;
      case 'KeyJ':
        triggerHeld = true;
        fire();
        break;
      case 'Tab':
        e.preventDefault();
        switchWeapon(e.shiftKey ? -1 : 1);
        break;
      case 'KeyG':
        armed = !armed;
        break;
      case 'KeyR':
        if (ammo[wi] < WEAPONS[wi].mag) reloading = WEAPONS[wi].reload;
        break;
    }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'KeyJ') triggerHeld = false; });
  const canvas = renderer.domElement;
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2) { aimHeld = true; e.preventDefault(); return; }
    if (e.button === 0) down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  window.addEventListener('pointerup', (e) => {
    if (e.button === 2) aimHeld = false;
    if (e.button === 0 && down) {
      // a click, not a camera drag
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 350) fire();
      down = null;
      triggerHeld = false;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (down && WEAPONS[wi].auto && aimHeld && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) triggerHeld = true;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { if (cm.activeMode === 'person' && aimHeld) { e.preventDefault(); switchWeapon(Math.sign(e.deltaY)); } }, { passive: false });
  fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); triggerHeld = true; fire(); });
  fireBtn.addEventListener('pointerup', () => { triggerHeld = false; });
  elPrompt.addEventListener('click', () => {
    if (elPrompt.dataset.act === 'enter') tryEnter();
    else if (elPrompt.dataset.act === 'exit') exitCar();
    else if (elPrompt.dataset.act === 'talk') talk();
  });

  // ------------------------------------------------------------------------------------------------------------------
  // Frame
  // ------------------------------------------------------------------------------------------------------------------
  function update(dt) {
    clock += dt;
    cooldown = Math.max(0, cooldown - dt);
    if (reloading > 0) {
      reloading -= dt;
      if (reloading <= 0) ammo[wi] = WEAPONS[wi].mag;
    }
    const onFoot = cm.activeMode === 'person';
    // aiming: face where the camera looks, crosshair on, lock on to whoever is under it
    cm.aiming = onFoot && armed && aimHeld;
    if (cm.aiming && cm.cameraYaw !== null) {
      lockTarget = findTarget(cm.cameraYaw, 0.12);
      cm.aimYaw = lockTarget ? Math.atan2(lockTarget.x - person.position.x, lockTarget.z - person.position.z) : cm.cameraYaw;
    } else lockTarget = null;
    elCross.hidden = !cm.aiming;
    elCross.classList.toggle('lock', !!lockTarget);
    if (triggerHeld && WEAPONS[wi].auto) fire();

    // walking to a car's door, then in
    if (approach) {
      const anyKey = cm.keys.forward || cm.keys.backward || cm.keys.left || cm.keys.right;
      if (!onFoot || anyKey) approach = null;
      else {
        const r = approach.ride;
        // the target moves if it's a car in traffic: follow its door
        if (r.kind === 'traffic') Object.assign(r.door, doorOf(r.v.x, r.v.z, r.v.yaw));
        const dx = r.door.x - person.position.x, dz = r.door.z - person.position.z, d = Math.hypot(dx, dz);
        approach.t += dt;
        if (d < 0.7 || approach.t > 6) board(r);
        else {
          person.heading = Math.atan2(dx, dz);
          const sp = Math.min(4.3, d * 3);
          person.speed = sp;
          person.position.x += (dx / d) * sp * dt;
          person.position.z += (dz / d) * sp * dt;
        }
      }
    }

    // the sports car, driven: where the car physics puts it, tilting over kerbs and with the chassis, wheels turning
    if (riding === 'sports' && cm.activeMode === 'car' && sports.mesh) {
      const m = sports.mesh;
      m.position.set(car.position.x, car.position.y + (car.heaveY || 0), car.position.z);
      m.rotation.set((car.kerbPitch || 0) + (car.chassisPivot ? car.chassisPivot.rotation.x : 0), car.heading,
        (car.kerbRoll || 0) + (car.chassisPivot ? car.chassisPivot.rotation.z : 0));
      m.updateMatrixWorld(true);
      for (const [n, w] of Object.entries(sports.wheels)) {
        w.rotation.x = car.wheelSpin || 0;
        if (n.startsWith('wheel-front')) w.rotation.y = car.steerAngle || 0;
      }
      sports.x = car.position.x; sports.z = car.position.z; sports.heading = car.heading;
    }

    // effects
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.visible = false; }
    for (const tr of tracers) if (tr.visible) { tr.userData.t -= dt; if (tr.userData.t <= 0) tr.visible = false; }
    for (const sp of sparks) if (sp.visible) { sp.userData.t -= dt; if (sp.userData.t <= 0) sp.visible = false; }

    // chat bubbles over the speaker
    if (chat) {
      chat.t += dt;
      if (chat.t > 2.6) { chat.k++; chat.t = 0; }
      if (chat.k >= chat.lines.length) { chat = null; elSay.hidden = true; }
      else {
        const [who, text] = chat.lines[chat.k];
        elSay.innerHTML = '';
        const sm = document.createElement('small');
        sm.textContent = who;
        elSay.append(sm, document.createTextNode(text));
        const at = who === 'You' ? person.position : chat.p;
        placeBubble(at.x, (at.y ?? 0.2) + 2.1, at.z);
      }
    }

    // context prompt
    let act = '', label = '';
    if (onFoot && !approach) {
      const r = nearestRide();
      const q = nearestPed(TALK_REACH);
      if (r && r.dist < 5) { act = 'enter'; label = r.kind === 'taxi' ? 'Get in your taxi' : r.kind === 'sports' ? 'Drive the HSB Clubbie R8' : 'Take this car'; }
      else if (q && !chat) { act = 'talk'; label = armed && aimHeld ? 'Rob them' : 'Talk'; }
    } else if (cm.activeMode === 'car' && Math.abs(car.speed) < 3) { act = 'exit'; label = 'Get out'; }
    if (elPrompt.dataset.act !== act) {
      elPrompt.dataset.act = act;
      elPrompt.innerHTML = '';
      if (act) {
        const k = document.createElement('kbd');
        k.textContent = act === 'talk' ? 'T' : 'F';
        elPrompt.append(k, document.createTextNode(label));
      }
    } else if (act && elPrompt.lastChild && elPrompt.lastChild.textContent !== label) elPrompt.lastChild.textContent = label;

    // weapon panel
    elWeapon.hidden = !onFoot;
    fireBtn.classList.toggle('on', onFoot && armed);
    if (onFoot) {
      const w = WEAPONS[wi];
      elWeapon.textContent = '';
      const b = document.createElement('b');
      b.textContent = !armed ? 'Fists' : reloading > 0 ? 'Reloading' : `${ammo[wi]} / ${w.mag}`;
      elWeapon.append(b, document.createTextNode(armed ? `${w.name} · Tab to change · G holster` : 'G to draw'));
    }
  }

  /** When the HUD's mode buttons change mode: keep the cars consistent (main.js calls this first) */
  function beforeMode(mode) {
    if (internal || mode === cm.activeMode) return true;
    if (cm.activeMode === 'car' && mode !== 'car' && riding !== 'taxi') {
      parkCurrent();
      carMesh.visible = false;
    }
    if (mode === 'car') {
      // the car button goes back to the last car driven
      if (lastRide === 'sports' && sports.ready) { enterSports(); return false; }
      if (lastRide && typeof lastRide === 'object' && lastRide.parked && Math.hypot(lastRide.x - person.position.x, lastRide.z - person.position.z) < 300) {
        enterTrafficCar(lastRide);
        return false;
      }
      enterOwnTaxi();
      return false;
    }
    return true;
  }

  return {
    update, beforeMode, weapons: WEAPONS,
    get driving() { return driving(); },
    get inSports() { return riding === 'sports' && cm.activeMode === 'car'; },
    summonSports,
    // for scripted checks
    fire, talk, tryEnter, exitCar,
    get state() { return { armed, wi, ammo: ammo[wi], cooldown, reloading, mode: cm.activeMode }; }
  };
}
