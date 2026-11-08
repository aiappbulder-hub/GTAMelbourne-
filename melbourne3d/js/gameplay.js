import * as THREE from 'three/webgpu';
import { ALBERT_PARK, OPEN_PARK_LAWN_Y } from './race-track.js';
import { SPORTS_DRIVE } from './controllers.js';
const inAlbertPark = (x, z) => x > ALBERT_PARK.minX && x < ALBERT_PARK.maxX && z > ALBERT_PARK.minZ && z < ALBERT_PARK.maxZ;

// The player's own cars (the car button cycles: the taxi, then these). Handling as controllers.js reads it.
const drive = (speed, acceleration, grip, extra = {}) => ({
  speed, reverseSpeed: 10.5, acceleration, powerSpeed: 16 + acceleration * 1.6,
  rolling: 0.17, drag: 0.0011 - acceleration * 0.00006, coast: 0.6, brake: 9 + grip * 0.25,
  wheelbase: 2.76, grip, cornering: grip * 1.05, ...extra
});
const CUSTOM_CARS = [
  { id: 'clubbie', file: 'clubbie', name: 'HSB Clubbie R8', color: 0xd8221d, drive: SPORTS_DRIVE, line: 'HSB Clubbie R8. Try not to wrap it round a tram.' },
  { id: 'comodo', file: 'comodo', name: 'Holdan Comodo SS', drive: drive(52, 6.5, 11), line: 'The Comodo SS. Every dad in Melbourne wants one.' },
  { id: 'police', file: 'police', name: 'Victoria Police pursuit car', drive: drive(62, 7.8, 12.5), line: 'A pursuit car. Bold.' },
  { id: 'strainger', file: 'strainger', name: 'Fjord Strainger ute', drive: drive(46, 5.2, 9.5, { wheelbase: 3.2 }), line: 'The Strainger. Tradie royalty.' },
  { id: 'barrina', file: 'barrina', name: 'Barrina hatch', drive: drive(47, 5.6, 11.5, { wheelbase: 2.55 }), line: 'The Barrina. Zippy enough.' },
  { id: 'territorial', file: 'territorial', name: 'Fjord Territorial', drive: drive(45, 5, 9.5), line: 'The Territorial. A school-run tank.' }
];

// The player's game on foot and behind the wheel (Melbourne):
// - Cars: F (or the touch CAR prompt) gets in the player's own taxi or any car in the traffic, and out again. From a
//   few metres away the player walks to the driver's door first (the right-hand side: cars here are right-hand
//   drive). A car taken from the traffic keeps its own body and paint (traffic.js draws it where the player's car
//   physics puts it) and stays parked where it's left.
// - Guns: pistol, Uzi and shotgun (Tab or the wheel to change, G to holster). Hold the right mouse button to aim
//   where the camera looks (or hold Q); left click (or J, or FIRE on touch) to shoot. Without aiming, a shot locks on to the nearest
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
.gp-weapon { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); max-width: min(300px, 92vw); z-index: 30; padding: 6px 12px; border-radius: 10px; background: rgba(10,12,16,.72);
  color: #fff; font: 700 13px/1.3 Inter, system-ui, sans-serif; text-align: center; pointer-events: none; }
.gp-weapon b { display: block; font: 800 20px/1 'JetBrains Mono', monospace; color: #ffd23f; }
.gp-weapon[hidden] { display: none; }
.gp-hint { display: block; margin-top: 4px; font-size: 11px; font-weight: 600; opacity: .85; }
@media (max-width: 960px) { .gp-hint { display: none; } }
body.touch-enabled .gp-hint { display: none; }
.gp-cross { position: fixed; left: 50%; top: 46%; width: 22px; height: 22px; margin: -11px 0 0 -11px; z-index: 29; pointer-events: none;
  border: 2px solid rgba(255,255,255,.85); border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
.gp-cross::after { content: ''; position: absolute; left: 8px; top: 8px; width: 2px; height: 2px; background: #fff; border-radius: 1px; }
.gp-cross.lock { border-color: #ff4040; }
.gp-cross[hidden] { display: none; }
.gp-fire { position: fixed; right: 26px; bottom: 210px; z-index: 31; width: 74px; height: 74px; border-radius: 50%; border: 0;
  background: rgba(220, 40, 40, .82); color: #fff; font: 800 14px/1 Inter, sans-serif; display: none; }
body.touch-enabled .gp-fire.on { display: block; }
.gp-lock { position: fixed; z-index: 31; width: 34px; height: 34px; margin: -17px 0 0 -17px; border: 3px solid #ff3b30; border-radius: 50%;
  box-shadow: 0 0 10px rgba(255,59,48,.7); pointer-events: none; }
.gp-lock[hidden] { display: none; }
.gp-aim { position: fixed; right: 108px; bottom: 150px; z-index: 31; width: 74px; height: 74px; border-radius: 50%; display: none;
  border: 2px solid rgba(255,255,255,.6); background: rgba(10,12,16,.6); color: #fff; font: 800 15px Inter, sans-serif; touch-action: none; }
.gp-aim.on { display: block; }
.gp-aim.held { background: rgba(255,59,48,.75); }
.gp-speedo { position: fixed; right: 18px; top: 200px; z-index: 30; width: 150px; height: 150px; pointer-events: none; display: none; }
.gp-speedo.on { display: block; }
.gp-speedo svg { width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 4px 14px rgba(0,0,0,.45)); }
.gp-speedo .num { font: 800 30px 'JetBrains Mono', monospace; fill: #fff; }
.gp-speedo .unit { font: 700 11px Inter, sans-serif; fill: rgba(255,255,255,.7); letter-spacing: .1em; }
.gp-speedo .tick { font: 600 9px Inter, sans-serif; fill: rgba(255,255,255,.75); }
@media (max-width: 700px) { .gp-speedo { width: 112px; height: 112px; top: auto; bottom: 150px; right: 10px; } }
.gp-say { position: fixed; z-index: 30; max-width: 260px; padding: 8px 12px; border-radius: 12px; background: rgba(255,255,255,.95); color: #111;
  font: 600 14px/1.35 Inter, system-ui, sans-serif; transform: translate(-50%, -100%); pointer-events: none; box-shadow: 0 6px 20px rgba(0,0,0,.3); }
.gp-say::after { content: ''; position: absolute; left: 50%; bottom: -7px; margin-left: -7px; border: 7px solid transparent; border-bottom: 0; border-top-color: rgba(255,255,255,.95); }
.gp-say small { display: block; color: #a0336b; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
`;

export function createGameplay({ scene, renderer, controllerManager, cameraSystem, trafficSystem, missionSystem, selectMode, voices = null, cast = null }) {
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
  // The speedo: a dial with a needle and the speed in km/h, while driving (its scale from the car's top speed)
  const speedo = div('gp-speedo');
  const SVG = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs, parent) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent.append(e);
    return e;
  };
  const svg = svgEl('svg', { viewBox: '-75 -75 150 150' }, speedo);
  svgEl('circle', { r: 70, fill: 'rgba(10,12,16,.82)', stroke: 'rgba(255,255,255,.18)', 'stroke-width': 2 }, svg);
  const A0 = -225, A1 = 45; // degrees: the dial sweeps 270 from bottom left round to bottom right
  const arcPt = (deg, r) => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r];
  const ticks = svgEl('g', {}, svg);
  let ticksFor = 0;
  function drawTicks(top) {
    if (ticksFor === top) return;
    ticksFor = top;
    ticks.replaceChildren();
    const step = top > 200 ? 50 : 20;
    for (let v = 0; v <= top; v += step / 2) {
      const a = A0 + ((A1 - A0) * v) / top;
      const major = v % step === 0;
      const [x0, y0] = arcPt(a, major ? 54 : 58), [x1, y1] = arcPt(a, 63);
      svgEl('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: v > top * 0.8 ? '#ff4d4d' : 'rgba(255,255,255,.8)', 'stroke-width': major ? 2.2 : 1 }, ticks);
      if (major) {
        const [tx, ty] = arcPt(a, 44);
        const t = svgEl('text', { x: tx, y: ty + 3, 'text-anchor': 'middle', class: 'tick' }, ticks);
        t.textContent = String(v);
      }
    }
  }
  const needle = svgEl('line', { x1: 0, y1: 0, x2: 0, y2: -56, stroke: '#ff3b30', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
  svgEl('circle', { r: 5, fill: '#ff3b30' }, svg);
  const num = svgEl('text', { x: 0, y: 34, 'text-anchor': 'middle', class: 'num' }, svg);
  const unit = svgEl('text', { x: 0, y: 48, 'text-anchor': 'middle', class: 'unit' }, svg);
  unit.textContent = 'KM/H';

  // Ruts: dark marks the wheels leave in the grass (a ring of instanced strips)
  const RUTS = 1400;
  const rutMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.32, 0.9).rotateX(-Math.PI / 2),
    new THREE.MeshBasicNodeMaterial({ color: 0x3a2a18, transparent: true, opacity: 0.72, depthWrite: false }), RUTS);
  rutMesh.count = 0;
  rutMesh.frustumCulled = false;
  rutMesh.renderOrder = 2;
  scene.add(rutMesh);
  let rutNext = 0, rutLastX = 0, rutLastZ = 0;
  const rutM = new THREE.Matrix4(), rutQ = new THREE.Quaternion(), rutP = new THREE.Vector3(), rutS = new THREE.Vector3(1, 1, 1), UPV = new THREE.Vector3(0, 1, 0);

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

  // --- The player's own cars: the old game's Blender models (models/custom/*.json), each with its own handling. One of
  // them is out at a time ('sports' in `riding`, `sports.def` which): the HSB Clubbie R8 to start with, the car
  // button (cycleCar) swaps through the rest. Models load the first time they're wanted and are kept.
  const sports = { mesh: null, wheels: {}, x: -237, z: 160, heading: 0, y: 0, pitch: 0, roll: 0, ready: false, def: CUSTOM_CARS[0] };
  const modelCache = new Map();
  async function loadCarModel(def) {
    if (modelCache.has(def.id)) return modelCache.get(def.id);
    if (def.root) {
      // a car built elsewhere (a BeamNG mod, js/car-mods.js): its body as it is, no wheels to turn
      const root = new THREE.Group();
      root.name = 'PlayerCar_' + def.id;
      root.rotation.order = 'YXZ';
      root.add(def.root);
      const entry = { root, wheels: {} };
      modelCache.set(def.id, entry);
      return entry;
    }
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(new URL(`../../models/custom/${def.file}.json`, import.meta.url).href);
    const root = new THREE.Group();
    root.name = 'PlayerCar_' + def.id;
    root.rotation.order = 'YXZ';
    gltf.scene.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      if (def.color && o.material && o.material.name === 'Body') o.material.color.setHex(def.color);
    });
    root.add(gltf.scene);
    const wheels = {};
    for (const n of ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right']) {
      const w = gltf.scene.getObjectByName(n);
      if (w) { w.rotation.order = 'YXZ'; wheels[n] = w; }
    }
    const entry = { root, wheels };
    modelCache.set(def.id, entry);
    return entry;
  }
  /** Make `def` the player's own car (its model in the scene in place of the last one) */
  async function useCarModel(def) {
    const entry = await loadCarModel(def);
    if (sports.mesh && sports.mesh !== entry.root) scene.remove(sports.mesh);
    sports.def = def;
    sports.mesh = entry.root;
    sports.wheels = entry.wheels;
    if (!sports.mesh.parent) scene.add(sports.mesh);
    sports.ready = true;
    placeSports();
  }
  useCarModel(CUSTOM_CARS[0]).catch((e) => console.warn('[gameplay] the sports car failed to load', e));
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
    car.drive = sports.def.drive;
    car.label = sports.def.name;
    go('car');
    carMesh.visible = false;
    missionSystem?.sub?.(sports.def.line, 2.5);
  }
  function enterTrafficCar(v) {
    voices?.event('carjack', v);
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
  /** One of the player's cars, brought round to the kerb beside the player ('taxi' or a CUSTOM_CARS id) */
  async function summon(id = 'clubbie') {
    const p = cm.activeMode === 'person' ? person.position : car.position;
    const h = cm.activeMode === 'person' ? person.heading : car.heading;
    // 3.5 m to the player's left, facing the same way
    const x = p.x + Math.cos(h) * 3.5, z = p.z - Math.sin(h) * 3.5;
    if (id === 'taxi') {
      if (cm.activeMode === 'car' && riding === 'taxi') return;
      if (taxiClone) { taxiClone.position.set(x, 0, z); taxiClone.rotation.set(0, h, 0); taxiClone.updateMatrixWorld(true); }
      else if (riding === 'taxi' || lastRide === 'taxi') { placeCarEntity(x, z, h); carMesh.visible = true; }
      missionSystem?.sub?.('Your taxi is waiting. Walk up and press F.', 3);
      return;
    }
    if (riding === 'sports' && cm.activeMode === 'car') return;
    const def = await placeCar(id, x, z, h);
    missionSystem?.sub?.(`Your ${def.name} is waiting. Walk up and press F.`, 3);
  }
  /** One of the player's own cars, parked at (x, z) facing `heading` (a mission's car waiting at the kerb) */
  async function placeCar(id, x, z, heading) {
    const def = CUSTOM_CARS.find((d) => d.id === id) || CUSTOM_CARS[0];
    await useCarModel(def);
    sports.x = x;
    sports.z = z;
    sports.heading = heading;
    sports.y = 0;
    sports.pitch = sports.roll = 0;
    placeSports();
    return def;
  }
  /** Out of the car at once, wherever it is (a mission taking over): it stops where it stands */
  function leaveCarNow() {
    if (cm.activeMode !== 'car') return;
    car.speed = 0;
    car.vx = car.vz = 0;
    exitCar();
  }
  const summonSports = () => summon('clubbie');

  /** The car button: the next of the player's cars. In a car it's a swap on the spot (keeping the speed); on foot the
   *  next car is brought round beside the player. A car taken from the traffic goes back to the traffic. */
  let cycling = false;
  async function cycleCar() {
    if (cycling) return;
    cycling = true;
    try {
      const order = ['taxi', ...CUSTOM_CARS.map((d) => d.id)];
      const current = riding === 'sports' ? sports.def.id : riding === 'taxi' ? 'taxi' : lastRide === 'sports' ? sports.def.id : 'taxi';
      const next = order[(order.indexOf(current) + 1) % order.length];
      if (cm.activeMode !== 'car') { await summon(next); return; }
      const speed = car.speed;
      // what's being driven now gives way
      if (typeof riding === 'object' && riding) { trafficSystem.parkCar(riding); riding.parked = false; } // back into the traffic
      if (next === 'taxi') {
        if (sports.mesh) scene.remove(sports.mesh);
        sports.ready = false;
        if (taxiClone) { scene.remove(taxiClone); taxiClone = null; }
        riding = lastRide = 'taxi';
        car.drive = null;
        car.label = TAXI_LABEL;
        carMesh.visible = true;
      } else {
        const def = CUSTOM_CARS.find((d) => d.id === next);
        if (riding === 'taxi' && taxiClone) { scene.remove(taxiClone); taxiClone = null; }
        await useCarModel(def);
        riding = lastRide = 'sports';
        car.drive = def.drive;
        car.label = def.name;
        carMesh.visible = false;
      }
      car.speed = speed;
      const elMode = document.getElementById('hud-active-mode');
      if (elMode) elMode.textContent = car.label;
      missionSystem?.sub?.(car.label, 1.5);
    } finally {
      cycling = false;
    }
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
  let cooldown = 0, reloading = 0, triggerHeld = false, aimHeld = false, raisedT = 0;
  let lockTarget = null, cycleTarget = false, freeYaw = null, freePitch = 0;
  // Mouse aim: holding aim captures the mouse (pointer lock) and moving it turns the aim; letting go frees it
  const AIM_SENS = 0.0032; // radians per pixel
  const canvasEl = renderer.domElement;
  const grabMouse = () => { try { if (document.pointerLockElement !== canvasEl) canvasEl.requestPointerLock?.(); } catch { /* not allowed */ } };
  const freeMouse = () => { try { if (document.pointerLockElement === canvasEl) document.exitPointerLock(); } catch { /* fine */ } };
  let lastMouseX = null, lastMouseY = null, aimByMouse = false;
  const stopMouseAim = () => { if (aimByMouse) { aimByMouse = false; aimHeld = false; freeMouse(); } };
  window.addEventListener('mousemove', (e) => {
    if (!aimHeld || cm.activeMode !== 'person') { lastMouseX = null; return; }
    // captured: the movement; not (yet): how far the pointer went
    const dx = document.pointerLockElement === canvasEl ? (e.movementX || 0) : lastMouseX === null ? 0 : e.clientX - lastMouseX;
    lastMouseX = e.clientX;
    if (freeYaw === null) freeYaw = person.heading;
    freeYaw -= dx * AIM_SENS;
    // up and down too
    const dy = document.pointerLockElement === canvasEl ? (e.movementY || 0) : lastMouseY === null ? 0 : e.clientY - lastMouseY;
    lastMouseY = e.clientY;
    freePitch = Math.max(-0.55, Math.min(0.75, freePitch - dy * AIM_SENS));
  });
  const _lk = new THREE.Vector3();
  // the lock-on marker (over the target) and, on touch screens, a hold-to-aim button
  const elLock = document.createElement('div');
  elLock.className = 'gp-lock';
  elLock.hidden = true;
  document.body.append(elLock);
  const elAim = document.createElement('button');
  elAim.className = 'gp-aim';
  elAim.type = 'button';
  elAim.textContent = 'AIM';
  document.body.append(elAim);
  elAim.addEventListener('pointerdown', (e) => { e.preventDefault(); aimHeld = true; });
  elAim.addEventListener('pointerup', () => { aimHeld = false; });
  elAim.addEventListener('pointercancel', () => { aimHeld = false; });

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
  function findTarget(yaw, cone, pedsOnly = false, skip = null) {
    const p = person.position;
    let best = null, bestScore = Infinity;
    const consider = (x, z, t) => {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.8 || d > LOCK_RANGE) return;
      let a = Math.atan2(dx, dz) - yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) > cone) return;
      if (skip && t[t.kind === 'ped' ? 'q' : 'v'] === skip) return;
      const score = d * (1 + Math.abs(a) * 2);
      if (score < bestScore) { bestScore = score; best = t; }
    };
    for (const q of trafficSystem.peds) if (q.placed && !q.dead) consider(q.x, q.z, { kind: 'ped', q, get x() { return q.x; }, get z() { return q.z; } });
    if (!pedsOnly) for (const v of trafficSystem.cars) if (!v.driven && (v.edge || v.parked)) consider(v.x, v.z, { kind: 'car', v, get x() { return v.x; }, get z() { return v.z; } });
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
    let mx = person.position.x + Math.sin(yaw) * 0.55, mz = person.position.z + Math.cos(yaw) * 0.55;
    let my = person.position.y + 1.38;
    raisedT = 0.7; // the gun comes up to fire, and stays up a moment
    const mz0 = cast?.muzzle();
    if (mz0) { mx = mz0.x; my = mz0.y; mz = mz0.z; }
    flash.position.set(mx, my, mz);
    flash.visible = true;
    flashT = 0.05;
    bang(w.sound);
    voices?.event('gunfire', person.position);
    missionSystem?.onGunfire?.();
    const pitch = aimHeld ? cm.aimPitch || 0 : t ? Math.atan2((t.kind === 'ped' ? 1.25 : 0.9) - (person.position.y + 1.4), Math.hypot(t.x - person.position.x, t.z - person.position.z) || 1) : 0;
    for (let k = 0; k < w.pellets; k++) {
      const a = yaw + (Math.random() - 0.5) * 2 * w.spread;
      const pa = pitch + (Math.random() - 0.5) * 2 * w.spread * 0.6;
      const dx = Math.sin(a), dz = Math.cos(a);
      let hit = trace(person.position.x, person.position.z, dx, dz, w.range);
      // the height the shot is at where it reaches what it hit: over a person's head or a car's roof, under them into
      // the road, it misses (and carries on to the range, or the ground)
      const hd = Math.hypot(hit.x - person.position.x, hit.z - person.position.z);
      const hy = person.position.y + 1.4 + Math.tan(pa) * hd;
      if ((hit.kind === 'ped' && (hy < 0 || hy > 2.0)) || (hit.kind === 'car' && (hy < 0 || hy > 1.7))) {
        hit = { kind: 'none', x: person.position.x + dx * w.range, z: person.position.z + dz * w.range };
      }
      const endD = Math.hypot(hit.x - person.position.x, hit.z - person.position.z);
      let endY = person.position.y + 1.4 + Math.tan(pa) * endD;
      if (endY < 0) { // into the ground first
        const g = (person.position.y + 1.4) / Math.max(1e-3, -Math.tan(pa));
        hit = { kind: 'none', x: person.position.x + dx * g, z: person.position.z + dz * g };
        endY = 0.02;
      }
      const tr = tracers[tracerNext++ % tracers.length];
      const pos = tr.geometry.attributes.position;
      pos.setXYZ(0, mx, my, mz);
      pos.setXYZ(1, hit.x, endY, hit.z);
      pos.needsUpdate = true;
      tr.visible = true;
      tr.userData.t = 0.06;
      if (hit.kind !== 'none') {
        const sp = sparks[sparkNext++ % sparks.length];
        sp.position.set(hit.x, endY, hit.z);
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
    // a recorded line in their voice when there is one (its length sets the bubble's), else a written one
    const voiced = voices?.talkLine(q);
    const line = voiced ? voiced.text : LINES[Math.floor(Math.random() * LINES.length)];
    chat = { p: q, lines: [['You', GREETINGS[Math.floor(Math.random() * GREETINGS.length)]], ['Local', line, voiced && Math.max(2.6, voiced.duration + 0.6), voiced && voiced.play]], k: 0, t: 0 };
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
  // aim with the right mouse button anywhere off the menus (the camera's own handlers can take the canvas's events),
  // or hold Q (touchpads); fire with a left click or J
  const offUi = (e) => !(e.target instanceof Element && e.target.closest('button, input, select, a, [role=dialog], .pop-item, .gm-cut, .intro-card'));
  window.addEventListener('pointerdown', (e) => {
    if (!offUi(e)) return;
    // right button: aim (held)
    if (e.button === 2) { aimHeld = true; aimByMouse = true; e.preventDefault(); if (cm.activeMode === 'person') grabMouse(); return; }
    if (e.button === 0) down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }, true);
  window.addEventListener('contextmenu', (e) => { if (offUi(e)) e.preventDefault(); });
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    if (e.code === 'KeyQ' && !aimHeld) { aimHeld = true; if (cm.activeMode === 'person') grabMouse(); }
    if (e.code === 'KeyE' && aimHeld && !e.repeat) cycleTarget = true; // the next target
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'KeyQ' && !aimByMouse) { aimHeld = false; freeMouse(); } });
  window.addEventListener('mouseup', (e) => { if (e.button === 2) stopMouseAim(); });
  // a left click while the right button is held (aiming): browsers send no pointerdown for a second button, only the
  // mouse events, so the shot is taken here
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !(e.buttons & 2) || !offUi(e)) return;
    down = null;
    fire();
    if (WEAPONS[wi].auto) triggerHeld = true;
  }, true);
  window.addEventListener('mouseup', (e) => { if (e.button === 0 && (e.buttons & 2)) triggerHeld = false; }, true);
  // Esc (or the browser) took the mouse back: stop aiming with it
  // (only when the right button is up too: a lock the browser drops by itself, or never really gives, leaves the aim on
  // while the button's held, turned by the pointer's movement instead)
  let rightDown = false;
  window.addEventListener('mousedown', (e) => { if (e.button === 2) rightDown = true; }, true);
  window.addEventListener('mouseup', (e) => { if (e.button === 2) rightDown = false; }, true);
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvasEl && !rightDown) stopMouseAim(); });
  window.addEventListener('pointerup', (e) => {
    if (e.button === 2) stopMouseAim();
    if (e.button === 0 && down) {
      // a click, not a camera drag
      if (document.pointerLockElement === canvasEl || (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 350)) fire();
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
    if (cm.aiming) {
      // free aim, turned by the mouse (see the pointer handlers), with a light magnet: a person (else a car) within ~6
      // degrees of it draws the aim onto them; E jumps the aim to the next one along
      if (freeYaw === null) freeYaw = person.heading;
      if (cycleTarget) {
        cycleTarget = false;
        const cur = lockTarget && (lockTarget.q || lockTarget.v);
        const next = findTarget(freeYaw, 1.4, true, cur);
        if (next) freeYaw = Math.atan2(next.x - person.position.x, next.z - person.position.z);
      }
      lockTarget = findTarget(freeYaw, 0.11, true) || findTarget(freeYaw, 0.07);
      cm.aimYaw = lockTarget ? Math.atan2(lockTarget.x - person.position.x, lockTarget.z - person.position.z) : freeYaw;
      // up and down: the mouse's, or, locked on, at the target's chest
      if (lockTarget) {
        const d = Math.hypot(lockTarget.x - person.position.x, lockTarget.z - person.position.z) || 1;
        cm.aimPitch = Math.atan2((lockTarget.kind === 'ped' ? 1.25 : 0.9) - (person.position.y + 1.4), d);
      } else cm.aimPitch = freePitch;
    } else { lockTarget = null; freeYaw = null; freePitch = 0; cm.aimPitch = 0; }
    // the lock marker over the target's head
    if (lockTarget && cm.aiming) {
      _lk.set(lockTarget.x, lockTarget.kind === 'ped' ? 1.9 : 1.6, lockTarget.z).project(cameraSystem.camera);
      if (_lk.z < 1) {
        elLock.style.left = `${((_lk.x + 1) / 2) * window.innerWidth}px`;
        elLock.style.top = `${((1 - _lk.y) / 2) * window.innerHeight}px`;
        elLock.hidden = false;
      } else elLock.hidden = true;
    } else elLock.hidden = true;
    elAim.classList.toggle('on', onFoot && armed && document.body.classList.contains('touch-enabled'));
    elAim.classList.toggle('held', aimHeld);
    elCross.hidden = !cm.aiming;
    // the gun in the player's hands (js/people.js): up while aiming or just after a shot, at their side otherwise
    raisedT = Math.max(0, raisedT - dt);
    cast?.setPlayerWeapon({ id: WEAPONS[wi].id, armed: armed && onFoot, aiming: cm.aiming || raisedT > 0,
      yaw: cm.aiming ? cm.aimYaw ?? person.heading : person.heading, pitch: cm.aiming ? cm.aimPitch || 0 : 0 });
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

    // the speedo, while driving
    const drivingNow = cm.activeMode === 'car';
    speedo.classList.toggle('on', drivingNow);
    if (drivingNow) {
      const top = Math.round((((car.drive && car.drive.speed) || 36) * 3.6) / 20) * 20 + 20;
      drawTicks(top);
      const kmh = Math.abs(car.speed) * 3.6;
      const a = A0 + ((A1 - A0) * Math.min(kmh, top)) / top;
      needle.setAttribute('transform', `rotate(${a + 90})`);
      num.textContent = String(Math.round(kmh));
    }
    // ruts in the grass behind the rear wheels, every 0.6 m
    if (drivingNow && car.onGrass && Math.hypot(car.position.x - rutLastX, car.position.z - rutLastZ) > 0.6) {
      rutLastX = car.position.x;
      rutLastZ = car.position.z;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading), lx = Math.cos(car.heading), lz = -Math.sin(car.heading);
      rutQ.setFromAxisAngle(UPV, car.heading);
      for (const side of [0.78, -0.78]) {
        const rx = car.position.x - fx * 1.3 + lx * side, rz = car.position.z - fz * 1.3 + lz * side;
        rutP.set(rx, inAlbertPark(rx, rz) ? OPEN_PARK_LAWN_Y + 0.012 : 0.418, rz); // on the grass: level ground in Albert Park, a raised lawn elsewhere
        rutMesh.setMatrixAt(rutNext, rutM.compose(rutP, rutQ, rutS));
        rutNext = (rutNext + 1) % RUTS;
        rutMesh.count = Math.min(RUTS, rutMesh.count + 1);
      }
      rutMesh.instanceMatrix.needsUpdate = true;
    }

    // effects
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.visible = false; }
    for (const tr of tracers) if (tr.visible) { tr.userData.t -= dt; if (tr.userData.t <= 0) tr.visible = false; }
    for (const sp of sparks) if (sp.visible) { sp.userData.t -= dt; if (sp.userData.t <= 0) sp.visible = false; }

    // chat bubbles over the speaker
    if (chat) {
      chat.t += dt;
      if (chat.t > (chat.lines[chat.k]?.[2] || 2.6)) { chat.k++; chat.t = 0; }
      if (chat.k !== chat.spoken && chat.k < chat.lines.length) { chat.spoken = chat.k; chat.lines[chat.k][3]?.(); }
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
      if (r && r.dist < 5) { act = 'enter'; label = r.kind === 'taxi' ? 'Get in your taxi' : r.kind === 'sports' ? `Drive the ${sports.def.name}` : 'Take this car'; }
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
      if (armed) {
        const hint = document.createElement('span');
        hint.className = 'gp-hint';
        hint.textContent = 'Right click or Q: aim · Left click or J: shoot · E: next target · Tab: change';
        elWeapon.append(b, document.createTextNode(w.name), hint);
      } else elWeapon.append(b, document.createTextNode('G to draw your gun'));
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
    /** The speedo's full scale for the car being driven (km/h) */
    get topSpeedKmh() { return cm.activeMode === 'car' ? Math.round(((car.drive && car.drive.speed) || 36) * 3.6 / 10) * 10 + 20 : 0; },
    summonSports, summon, cycleCar, placeCar, leaveCarNow,
    /** One more of the player's cars ({ id, name, root, line, wheelbase }): in the car button's cycle from now on */
    addCar(def) {
      CUSTOM_CARS.push({ id: def.id, name: def.name, root: def.root, drive: drive(54, 6.6, 11.5, { wheelbase: def.wheelbase || 2.8 }), line: def.line || `Your ${def.name}.` });
    },
    /** The player's parked sports car (or the parked taxi), for the player on foot to bump into */
    sportsBox() {
      if (riding !== 'sports' && sports.mesh && sports.mesh.visible && sports.mesh.parent) return { x: sports.x, z: sports.z, yaw: sports.heading, halfL: 2.3, halfW: 0.95 };
      if (taxiClone && taxiClone.visible && taxiClone.parent) return { x: taxiClone.position.x, z: taxiClone.position.z, yaw: taxiClone.rotation.y, halfL: 2.25, halfW: 0.92 };
      return null;
    },
    // for scripted checks
    fire, talk, tryEnter, exitCar,
    get state() { return { armed, wi, ammo: ammo[wi], cooldown, reloading, mode: cm.activeMode }; }
  };
}
