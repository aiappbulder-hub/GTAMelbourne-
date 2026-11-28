import { sharedAudioContext } from './audio-context.js';
import * as THREE from 'three/webgpu';
import { ALBERT_PARK, OPEN_PARK_LAWN_Y } from './race-track.js';
import { createCarSounds } from './car-sounds.js';
import { SPORTS_DRIVE } from './controllers.js';
import { travelDrive, DISPLAY_DIV } from './travel-scale.js';
import { WEAPONS, WEAPON_BY_ID, weaponIconSVG } from './weapons.js';
import { createCombat } from './combat.js';
import { terrainHeight } from './terrain.js';
import { settings } from './settings.js';
const inAlbertPark = (x, z) => x > ALBERT_PARK.minX && x < ALBERT_PARK.maxX && z > ALBERT_PARK.minZ && z < ALBERT_PARK.maxZ;

// The player's own cars (the car button cycles: the taxi, then these). Handling as controllers.js reads it.
// (v36: every car about 40% quicker in top speed and pull, with 15% more grip to keep it stable)
const SPEED_K = 1.4, GRIP_K = 1.15;
const drive = (speed0, acceleration0, grip0, extra = {}) => {
  const speed = speed0 * SPEED_K, acceleration = acceleration0 * SPEED_K, grip = grip0 * GRIP_K;
  return travelDrive({
    speed, reverseSpeed: 11.5, acceleration, powerSpeed: 16 + acceleration * 1.6,
    rolling: 0.17, drag: 0.0011 - acceleration0 * 0.00006, coast: 0.6, brake: 9 + grip * 0.25,
    wheelbase: 2.76, grip, cornering: grip * 1.05, ...extra
  });
};
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

const WALK_REACH = 9; // metres: walk to the door first
// Getting in (seconds of game time): turn to the car, open the door, get in; with a driver in it, they're dragged out
// first. Getting out: a short climb out of the seat (not for a mission's leaveCarNow, which is instant)
const BOARD_TIME = 1.25;
const BOARD_STEPS = { turn: 0.3, pull: 0.75, sink: 1.25 };
const JACK_TIME = 1.7;
const JACK_STEPS = { turn: 0.25, pull: 0.6, aside: 0.95, back: 1.2, sink: 1.7 };
const STEP_OUT_TIME = 0.6;
// The driver dragged out: pulled out by 0.55 s, on their back by 1.0 s, up again by 2.7 s, then running; gone by 8 s
const JACKED_LIFE = 8;
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, k) => a + wrapAngle(b - a) * k;
const TALK_REACH = 3.6;
const CROSS_Y = 0.5; // the crosshair's height on screen (fraction from the top), see .gp-cross
const LOCK_CONE = 0.62; // radians either side of the facing for lock-on without aiming
const LOCK_RANGE = 40;

import { MELBOURNE_LINES } from './melbourne-lines.js';
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
LINES.push(...MELBOURNE_LINES);
const GREETINGS = ["G'day.", 'Excuse me, mate.', "How ya going?", 'Oi, got a sec?', 'Hey there.'];

const CSS = `
.gp-prompt { position: fixed; left: 50%; bottom: 160px; transform: translateX(-50%); z-index: 30; padding: 7px 14px; border-radius: 999px;
  background: rgba(10,12,16,.78); color: #fff; font: 600 14px/1 Inter, system-ui, sans-serif; pointer-events: auto; cursor: pointer; white-space: nowrap; }
.gp-prompt:empty { display: none; }
.gp-prompt kbd { display: inline-block; min-width: 18px; margin-right: 6px; padding: 2px 5px; border-radius: 5px; background: #ffd23f; color: #111; font: 800 12px/1.2 Inter, sans-serif; text-align: center; }
.gp-weapon { position: fixed; left: 14px; top: 84px; z-index: 30; display: flex; align-items: center; gap: 8px; padding: 4px 10px 4px 8px; border-radius: 10px; background: rgba(10,12,16,.72);
  color: #fff; font: 700 12px/1.15 Inter, system-ui, sans-serif; pointer-events: none; }
.gp-weapon .gp-icon { width: 42px; height: 20px; color: #ffd23f; flex: none; }
.gp-weapon .gp-icon svg { width: 100%; height: 100%; }
.gp-weapon .gp-name { text-align: left; white-space: nowrap; }
.gp-weapon b { display: block; font: 800 15px/1.1 'JetBrains Mono', monospace; color: #ffd23f; }
.gp-weapon b small { font-size: 11px; opacity: .7; font-weight: 700; }
.gp-weapon[hidden] { display: none; }
.gp-strip { position: fixed; left: 14px; top: 126px; z-index: 31; display: flex; gap: 4px; padding: 5px; border-radius: 10px; background: rgba(10,12,16,.8);
  opacity: 0; pointer-events: none; transition: opacity .25s; }
.gp-strip.show { opacity: 1; pointer-events: auto; }
body.cinematic .gp-strip { visibility: hidden; }
body.touch-enabled .gp-strip { left: 10px; top: auto; bottom: 380px; }
body.touch-enabled .gp-weapon { display: none; }
.gp-slot { position: relative; width: 44px; height: 30px; padding: 2px 3px; border: 1px solid rgba(255,255,255,.18); border-radius: 7px; background: rgba(255,255,255,.06);
  color: rgba(255,255,255,.55); cursor: pointer; }
.gp-slot svg { width: 100%; height: 100%; }
.gp-slot i { position: absolute; left: 3px; top: 1px; font: 800 9px/1 'JetBrains Mono', monospace; font-style: normal; color: rgba(255,255,255,.7); }
.gp-slot.on { border-color: #ffd23f; background: rgba(255,210,63,.18); color: #ffd23f; }
.gp-gun .gp-icon { width: 100%; height: 20px; color: #ffd23f; }
.gp-gun .gp-icon svg { width: 100%; height: 100%; }
.gp-gun small { display: block; font: 800 12px/1.1 'JetBrains Mono', monospace; color: #fff; }
.gp-hp { position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%); width: min(220px, 70vw); height: 14px; z-index: 30; border-radius: 7px; background: rgba(10,12,16,.72); border: 1px solid rgba(255,255,255,.25); overflow: hidden; pointer-events: none; }
.gp-hp i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; background: linear-gradient(#e5483b, #b4231a); transition: width .12s; }
.gp-hp span { position: absolute; left: 6px; top: 0; font: 800 9px/14px Inter, sans-serif; letter-spacing: .12em; color: #fff; text-shadow: 0 1px 2px #000; }
.gp-hp.low i { background: linear-gradient(#ff2a1a, #a00); }
.gp-hp[hidden] { display: none; }
.gp-hurt { position: fixed; inset: 0; z-index: 28; pointer-events: none; opacity: 0; background: radial-gradient(ellipse at center, rgba(180,0,0,0) 45%, rgba(180,0,0,.75) 100%); }
.gp-wasted { position: fixed; inset: 0; z-index: 60; pointer-events: none; opacity: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  background: radial-gradient(ellipse at center, rgba(40,0,0,.55), rgba(0,0,0,.92)); }
.gp-wasted b { font: 900 clamp(48px, 12vw, 120px)/1 Inter, system-ui, sans-serif; letter-spacing: .08em; color: #c8201a; text-shadow: 0 3px 20px #000; }
.gp-wasted small { font: 700 16px Inter, sans-serif; color: #ddd; letter-spacing: .1em; text-transform: uppercase; }
.gp-wasted[hidden] { display: none; }
.gp-gun { position: fixed; right: 20px; bottom: 296px; z-index: 31; width: 92px; height: 50px; padding: 2px 4px; border-radius: 14px; border: 0; display: none; touch-action: none;
  background: rgba(10,12,16,.7); color: #ffd23f; font: 800 13px/1 Inter, sans-serif; border: 2px solid rgba(255,255,255,.5); }
body.touch-enabled .gp-gun.on { display: block; }
.gp-cross { position: fixed; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; z-index: 29; pointer-events: none;
  border: 2px solid rgba(255,255,255,.85); border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
.gp-cross::after { content: ''; position: absolute; left: 8px; top: 8px; width: 2px; height: 2px; background: #fff; border-radius: 1px; }
.gp-cross.lock { border-color: #ff4040; }
.gp-cross.hit::before { content: ''; position: absolute; left: -7px; top: -7px; width: 32px; height: 32px; background: linear-gradient(45deg, transparent 46%, #ff3b30 46%, #ff3b30 54%, transparent 54%), linear-gradient(-45deg, transparent 46%, #ff3b30 46%, #ff3b30 54%, transparent 54%); }
.gp-cross[hidden] { display: none; }
.gp-horn { position: fixed; right: 20px; bottom: 214px; z-index: 31; width: 74px; height: 74px; border-radius: 50%; border: 0; display: none; touch-action: none;
  background: rgba(255,210,63,.86); color: #111; font: 800 15px/1 Inter, system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.45); }
body.touch-enabled .gp-horn.on { display: block; }
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

export function createGameplay({ scene, renderer, controllerManager, cameraSystem, trafficSystem, missionSystem, selectMode, voices = null, cast = null, audioSystem = null, wanted = null }) {
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
  const hornBtn = document.createElement('button');
  hornBtn.className = 'gp-horn';
  hornBtn.type = 'button';
  hornBtn.textContent = 'HORN';
  document.body.append(hornBtn);
  const gunBtn = document.createElement('button');
  gunBtn.className = 'gp-gun';
  gunBtn.type = 'button';
  gunBtn.textContent = 'GUN';
  document.body.append(gunBtn);
  // The weapon panel: the six slots (tap or click one), then the weapon in hand: its icon, name and ammo
  const elSlots = div('gp-strip'); // the weapon strip: shown only while switching
  const slotBtns = WEAPONS.map((w, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gp-slot';
    b.title = `${w.slot}: ${w.name}`;
    b.innerHTML = `<i>${w.slot}</i>${weaponIconSVG(w.id)}`;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); selectSlot(i); });
    elSlots.append(b);
    return b;
  });
  const elIcon = document.createElement('div');
  elIcon.className = 'gp-icon';
  const elNameBox = document.createElement('div');
  elNameBox.className = 'gp-name';
  const elAmmo = document.createElement('b');
  const elName = document.createElement('span');
  elNameBox.append(elName, elAmmo);
  elWeapon.append(elIcon, elNameBox);
  elWeapon.title = '1-6 or Tab: change weapon. Right click or Q: aim. Left click or J: fire. R: reload. G: holster';
  let stripT = 0;
  function showStrip(hold = false) {
    elSlots.classList.add('show');
    clearTimeout(stripT);
    if (!hold) stripT = setTimeout(() => elSlots.classList.remove('show'), 1500);
  }
  let hudKey = '', hudIcon = '';
  function drawHud() {
    const w = WEAPONS[wi];
    const ammoText = !armed ? 'Holstered' : w.melee ? '\u2014' : reloading > 0 ? 'Reloading' : `${ammo[wi]} / \u221E`;
    const key = `${armed ? wi : -1}|${ammoText}`;
    if (key === hudKey) return;
    hudKey = key;
    slotBtns.forEach((b, i) => b.classList.toggle('on', armed && i === wi));
    const iconId = armed ? w.id : '';
    if (iconId !== hudIcon) { hudIcon = iconId; elIcon.innerHTML = iconId ? weaponIconSVG(iconId) : ''; }
    gunBtn.innerHTML = `<span class="gp-icon">${armed ? weaponIconSVG(w.id) : ''}</span><small>${armed ? (w.melee ? w.name : ammoText.replace(' / \u221E', ' / \u221E')) : 'GUN'}</small>`;
    elAmmo.innerHTML = ammoText.replace(/ \/ (.*)$/, ' <small>/ $1</small>');
    elName.textContent = armed ? w.name : 'G to draw';
  }
  const sounds = createCarSounds({ audioSystem });
  let hornHinted = false;

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
      root.userData.panels = def.root.userData.panels || null; // (js/car-damage.js uses a car's own hood and door groups)
      const entry = { root, wheels: def.wheels || {} };
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
    taxiClone.rotation.order = 'YXZ';
    taxiClone.rotation.set(car.kerbPitch || 0, car.heading, car.kerbRoll || 0);
    taxiClone.name = 'ParkedTaxi';
    scene.add(taxiClone);
    taxiClone.updateMatrixWorld(true);
  }
  function placeCarEntity(x, z, heading) {
    car.position.set(x, cm.getGroundHeight(x, z, 'car'), z);
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
  // a point by car c ({ x, z, h }): `along` metres forward of its middle, `out` metres out on the driver's side
  const besideCar = (c, along, out) => ({ x: c.x + Math.sin(c.h) * along - Math.cos(c.h) * out, z: c.z + Math.cos(c.h) * along + Math.sin(c.h) * out });
  let seq = null; // getting in: turning to the car, opening the door, (dragging the driver out,) sitting down
  let stepOut = null; // getting out: climbing out of the seat
  let halted = null; // { v, s }: a car in the traffic the player is going for, braking to a stop (s m/s)
  let jacked = null; // the driver dragged out of it, on the ground and then running off

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
  // jack: the getting-in sequence has already reported the crime ({ dragged: whether a driver was pulled out });
  // without it (the HUD's car button going back to the last car taken) it's reported here
  function enterTrafficCar(v, jack = null) {
    const wasMoving = jack ? jack.dragged : v.edge && v.speed > 0.5;
    if (!jack) {
      if (!missionSystem?.onJob) voices?.event('carjack', v); // (no police chatter on a job)
      wanted?.crime(wasMoving ? 'carjack' : 'theft', v.x, v.z);
    }
    v.hasDriver = false; // (nobody at the wheel of it now but the player)
    if (riding !== v) parkCurrent();
    trafficSystem.takeCar(v);
    riding = lastRide = v;
    placeCarEntity(v.x, v.z, v.yaw);
    car.drive = null;
    car.label = `Stolen ${/pickup/.test(v.bodyType) ? 'ute' : v.bodyType.replace(/^rcc/, '')}`;
    go('car');
    // (setMode shows the active vehicle's own body: here the taken car is drawn by the traffic instead)
    carMesh.visible = false;
    if (wasMoving || v.edge === null) trafficSystem.scarePeds(v.x, v.z, 18, 6);
    missionSystem?.sub?.(wasMoving ? 'You dragged the driver out and took the car.' : 'You took the car.', 2.5);
  }
  // instant: straight out on to the footpath (a mission taking over); otherwise the player is shown climbing out of the
  // seat (the mode changes at once all the same: only the drawing catches up)
  function exitCar(instant = false) {
    if (Math.abs(car.speed) > 9) { missionSystem?.sub?.('Slow down before you get out.', 1.5); return; }
    const d = doorOf(car.position.x, car.position.z, car.heading, 1.6);
    const h = car.heading, seat = besideCar({ x: car.position.x, z: car.position.z, h }, 0.05, 0.38);
    if (riding !== 'taxi') {
      parkCurrent();
      // the car entity is nobody's now: keep the taxi's body hidden where it stood
      carMesh.visible = false;
    } else {
      lastRide = 'taxi';
    }
    go('person');
    if (riding === null && lastRide !== 'taxi') carMesh.visible = false;
    person.position.set(d.x, cm.getGroundHeight(d.x, d.z, 'person'), d.z);
    person.speed = 0;
    if (instant || !cast) { person.heading = car.heading + Math.PI / 2; return; }
    // out of the seat and up beside the door, facing the way the car faces
    person.heading = h;
    stepOut = { t: 0, seat, door: { x: d.x, z: d.z }, h };
  }
  /** One of the player's cars, brought round to the kerb beside the player ('taxi' or a CUSTOM_CARS id) */
  async function summon(id = 'clubbie') {
    const p = cm.activeMode === 'person' ? person.position : car.position;
    const h = cm.activeMode === 'person' ? person.heading : car.heading;
    // 3.5 m to the player's left, facing the same way
    const x = p.x + Math.cos(h) * 3.5, z = p.z - Math.sin(h) * 3.5;
    if (id === 'taxi') {
      if (cm.activeMode === 'car' && riding === 'taxi') return;
      if (taxiClone) { taxiClone.position.set(x, cm.getGroundHeight(x, z, 'car'), z); taxiClone.rotation.set(0, h, 0); taxiClone.updateMatrixWorld(true); }
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
    sports.y = cm.getGroundHeight(x, z, 'car');
    sports.pitch = sports.roll = 0;
    placeSports();
    return def;
  }
  /** Out of the car at once, wherever it is (a mission taking over): it stops where it stands */
  function leaveCarNow() {
    if (cm.activeMode !== 'car') return;
    car.speed = 0;
    car.vx = car.vz = 0;
    exitCar(true);
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
    // (a car of the player's own, or one a job has left for them, wins over a passing car that is only a little
    // nearer: F beside Davo's car must not carjack whoever is driving by)
    const rank = (r) => r.dist + (r.kind === 'traffic' ? 3.5 : 0);
    const consider = (r) => { if (!best || rank(r) < rank(best)) best = r; };
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
    if (missionSystem?.busy || document.body.classList.contains('in-room')) return; // not during a cut scene or with a choice up, nor indoors
    if (seq) return; // already getting in
    const r = nearestRide();
    if (!r) return;
    if (r.kind === 'traffic') {
      // someone at the wheel (a car in the traffic, or one stopped for the player before): they brake and stop where
      // they are, and get dragged out
      const v = r.v;
      r.occupied = !!v.edge || !!v.hasDriver;
      if (r.occupied) {
        haltCar(v);
        cast?.preload([driverModel(v)]);
      }
    }
    // (always to the door first, however close: the sequence starts there)
    if (r.dist <= 0.7 && !(halted && halted.v === r.v)) return board(r);
    approach = { ride: r, t: 0 };
  }
  function board(r) {
    approach = null;
    startSeq(r);
  }
  // at the end of the sequence: in, and driving
  function boardNow(r, s) {
    if (r.kind === 'taxi') enterOwnTaxi();
    else if (r.kind === 'sports') enterSports();
    else enterTrafficCar(r.v, { dragged: s.jack });
  }
  /** A car in the traffic out of it, coming to a stop where it is (it stays there as a parked car until taken) */
  function haltCar(v) {
    if (!v.edge) return;
    const s = Math.max(0, v.speed || 0);
    trafficSystem.takeCar(v); // (off its lane)
    trafficSystem.parkCar(v); // (left standing: the traffic draws it where it is)
    v.hasDriver = true;
    halted = s > 0.05 ? { v, s } : null;
  }
  /** Who drives car v (a model the game's crowd and cast use already): a police officer in a police car */
  function driverModel(v) {
    const act = cast?.active;
    if (!act) return null;
    if (v.isPolice && act.police?.length) return act.police[0];
    const i = Math.max(0, trafficSystem.cars.indexOf(v));
    const pool = i % 3 === 1 && act.female?.length ? act.female : act.male?.length ? act.male : null;
    return pool ? pool[i % pool.length] : 'Male_Adult_01';
  }
  // The car being got into, where it stands: { x, z, h }
  function carPose(r) {
    if (r.kind === 'taxi') return taxiClone ? { x: taxiClone.position.x, z: taxiClone.position.z, h: taxiClone.rotation.y } : { x: car.position.x, z: car.position.z, h: car.heading };
    if (r.kind === 'sports') return { x: sports.x, z: sports.z, h: sports.heading };
    return { x: r.v.x, z: r.v.z, h: r.v.yaw };
  }
  function startSeq(r) {
    stepOut = null;
    const jack = r.kind === 'traffic' && !!r.occupied;
    seq = { r, t: 0, c: carPose(r), jack, total: jack ? JACK_TIME : BOARD_TIME, steps: jack ? JACK_STEPS : BOARD_STEPS,
      x0: person.position.x, z0: person.position.z, h0: person.heading, px: person.position.x, pz: person.position.z, reported: false };
  }
  function endSeq() {
    seq = null;
    cast?.setPlayerPose(null);
  }
  // The crime, once, as the door comes open (a car in the traffic): the driver is dragged out at the same moment
  function reportTheft(s) {
    if (s.reported || s.r.kind !== 'traffic') return;
    s.reported = true;
    const v = s.r.v;
    if (!missionSystem?.onJob) voices?.event('carjack', v); // (no police chatter on a job)
    wanted?.crime(s.jack ? 'carjack' : 'theft', v.x, v.z);
    if (s.jack) {
      spawnJacked(v, s.c);
      trafficSystem.scarePeds(v.x, v.z, 18, 6);
    }
  }
  // One frame of getting in. The player is drawn by the sequence (cast.setPlayerPose) and held where it puts them;
  // the movement keys do nothing meanwhile, and at the end of the timer they're in the car
  function stepSeq(dt) {
    const s = seq, c = s.c, T = s.steps;
    s.t += dt;
    const t = s.t;
    const face = c.h + Math.PI / 2; // facing the car's side
    const stand = besideCar(c, -0.3, 1.45), seat = besideCar(c, 0.05, 0.38);
    const handle = besideCar(c, -0.2, 0.95), open = besideCar(c, 0.25, 1.35); // (the door hinges at its front edge)
    const handY = person.position.y + 0.95;
    let x = stand.x, z = stand.z, heading = face, anim = 'idle', timeScale = 1, reach = null, inside = false;
    if (t < T.turn) {
      // round to the door, turning to face the car
      const k = smooth(t / T.turn), dh = wrapAngle(face - s.h0);
      x = lerp(s.x0, stand.x, k);
      z = lerp(s.z0, stand.z, k);
      heading = lerpAngle(s.h0, face, k);
      if (Math.abs(dh) > 0.6) anim = dh > 0 ? 'turn_left' : 'turn_right';
    } else if (t < T.pull) {
      // the right hand to the handle, then the door pulled open (out and towards the front)
      const k = (t - T.turn) / (T.pull - T.turn), kk = smooth((k - 0.5) / 0.5);
      reach = { x: lerp(handle.x, open.x, kk), y: handY, z: lerp(handle.z, open.z, kk), w: Math.min(1, k / 0.45) };
      if (k > 0.6) reportTheft(s);
    } else if (s.jack && t < T.back) {
      // a step back along the car while the driver is hauled out past, a hand on them, and back to the door
      reportTheft(s);
      const aside = besideCar(c, -1.0, 1.55);
      const first = t < T.aside, k = first ? smooth((t - T.pull) / (T.aside - T.pull)) : smooth((t - T.aside) / (T.back - T.aside));
      x = first ? lerp(stand.x, aside.x, k) : lerp(aside.x, stand.x, k);
      z = first ? lerp(stand.z, aside.z, k) : lerp(aside.z, stand.z, k);
      anim = first ? 'strafe_left' : 'strafe_right';
      timeScale = 1.2;
      if (jacked && jacked.at) reach = { x: jacked.at.x, y: person.position.y + 1.15, z: jacked.at.z, w: first ? 1 : 1 - k };
    } else if (t < T.sink) {
      // in: into the seat, turning to face the front, sitting down; the door let go of
      reportTheft(s);
      const t0 = s.jack ? T.back : T.pull, k = smooth((t - t0) / (T.sink - t0));
      x = lerp(stand.x, seat.x, k);
      z = lerp(stand.z, seat.z, k);
      heading = lerpAngle(face, c.h, k);
      anim = 'sit';
      inside = true;
      if (!s.jack) reach = { x: open.x, y: handY, z: open.z, w: 1 - Math.min(1, k * 2.5) };
    } else {
      const r = s.r;
      reportTheft(s);
      endSeq();
      boardNow(r, s);
      return;
    }
    // the player's own position stays outside the car (the camera follows it; nothing pushes it out of the body)
    const px = inside ? stand.x : x, pz = inside ? stand.z : z;
    person.position.x = s.px = px;
    person.position.z = s.pz = pz;
    person.heading = heading;
    person.speed = 0;
    cast?.setPlayerPose({ x, y: person.position.y, z, heading, anim, timeScale, reach });
  }

  // The driver dragged out (a model of the game's own, cast.setActor): out of the seat, on their back on the road a
  // moment, up, and running off. Gone after a few seconds, or as soon as the player is far away
  function spawnJacked(v, c) {
    if (jacked) cast?.setActor(jacked.key, jacked.id, null);
    jacked = null;
    const id = driverModel(v);
    if (!cast || !id) return;
    const fx = Math.sin(c.h), fz = Math.cos(c.h), ox = -Math.cos(c.h), oz = Math.sin(c.h);
    // away from the car and back along it (not in front of where the player will drive)
    const rx = ox - fx * 0.6, rz = oz - fz * 0.6;
    jacked = { id, key: `carjack:${id}`, t: 0, c, y: v.y ?? cm.getGroundHeight(v.x, v.z, 'person'), seat: besideCar(c, 0.05, 0.38), out1: besideCar(c, 0.1, 1.9), out2: besideCar(c, 0.1, 2.6),
      runH: Math.atan2(rx, rz), at: null, run: null };
  }
  function stepJacked(dt) {
    const j = jacked;
    j.t += dt;
    const t = j.t, c = j.c, face = c.h + Math.PI / 2;
    const me = cm.getActiveEntity?.()?.position || person.position;
    if (t > JACKED_LIFE || (j.at && Math.hypot(j.at.x - me.x, j.at.z - me.z) > 70)) {
      cast?.setActor(j.key, j.id, null);
      jacked = null;
      return;
    }
    let x, z, heading = face, fall = 0, anim = 'idle', speed;
    if (t < 0.15) { x = j.seat.x; z = j.seat.z; heading = c.h; anim = 'sit'; } // still at the wheel
    else if (t < 0.55) {
      // hauled out of the seat, turned round to the player
      const k = smooth((t - 0.15) / 0.4);
      x = lerp(j.seat.x, j.out1.x, k);
      z = lerp(j.seat.z, j.out1.z, k);
      heading = lerpAngle(c.h, face, k);
    } else if (t < 2.7) {
      // stumbling back, down on their back, and up again
      const k = smooth((t - 0.55) / 0.45);
      x = lerp(j.out1.x, j.out2.x, k);
      z = lerp(j.out1.z, j.out2.z, k);
      fall = t < 2.2 ? k : 1 - smooth((t - 2.2) / 0.5);
    } else {
      // and off, running
      if (!j.run) j.run = { x: j.out2.x, z: j.out2.z };
      const sp = 4.4;
      j.run.x += Math.sin(j.runH) * sp * dt;
      j.run.z += Math.cos(j.runH) * sp * dt;
      x = j.run.x;
      z = j.run.z;
      heading = j.runH;
      speed = sp;
    }
    j.at = { x, z };
    // (running, they swing round to the way they run rather than snapping to it)
    cast?.setActor(j.key, j.id, { x, y: j.y, z, heading, fall, ...(speed !== undefined ? { speed, ease: 7 } : {}) }, anim);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Guns
  // ------------------------------------------------------------------------------------------------------------------
  let armed = true;
  let wi = 0;
  const ammo = WEAPONS.map((w) => w.mag);
  let lastShot = null, hitMarkT = 0, cooldown = 0, reloading = 0, triggerHeld = false, aimHeld = false, raisedT = 0;
  let lockTarget = null, cycleTarget = false, freeYaw = null, freePitch = 0, armPitch = 0, armYaw = null, lastFireT = -1, aimFrame = 0;
  // Mouse aim: holding aim captures the mouse (pointer lock) and moving it turns the aim; letting go frees it
  // mouse sensitivity, radians per pixel: the Options slider (js/settings.js 'aimSens'); 0.0026 by default (0.0042 before
  // v42 was far too fast: a short flick turned the view right round)
  const aimSens = () => settings.num('aimSens');
  const AIM_SENS_TOUCH = 0.0055; // radians per pixel of a finger drag
  const AIM_PITCH = (70 * Math.PI) / 180; // free pitch, 70 degrees up or down
  const STICKY_AIM = 3; // seconds the aim stays up after a left click / touch drag / FIRE, so clicking to shoot also aims
  let keyAim = false, stickyT = 0, touchDrag = null, aimBtn = false, assistCone = 0; // (aim assist: off with a mouse, gentle on touch)
  // where the camera is looking (the aim starts from it, so raising the gun never jerks the view)
  const camYaw = () => (cameraSystem.personYaw ?? person.heading) + (cameraSystem.orbitYawOffset || 0);
  const PITCH_TOL = 0.14; // aim assist only draws to a target whose chest is within this of the crosshair's elevation
  const canvasEl = renderer.domElement;
  const grabMouse = () => { try { if (document.pointerLockElement !== canvasEl) canvasEl.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not allowed */ } };
  const freeMouse = () => { try { if (document.pointerLockElement === canvasEl) document.exitPointerLock(); } catch { /* fine */ } };
  let lastMouseX = null, lastMouseY = null, aimByMouse = false, lockFresh = false;
  const stopMouseAim = () => { if (aimByMouse) { aimByMouse = false; aimHeld = false; freeMouse(); } };
  // The mouse turns the aim. Captured (pointer lock): by the event's movement. Not captured: by how far the pointer went
  // since the last move, with no carry-over (the first move after the aim comes up, or after the capture starts or
  // ends, only sets the starting point). The movement a browser reports can spike: Chrome on Windows sometimes sends
  // hundreds of pixels at once as the capture starts or the cursor wraps. So:
  // - the first captured move after the lock is dropped
  // - a move over MOUSE_SPIKE px is dropped
  // - any other move is held to MOUSE_STEP px
  const MOUSE_STEP = 80, MOUSE_SPIKE = 300;
  const resetMouse = () => { lastMouseX = lastMouseY = null; };
  document.addEventListener('pointerlockchange', () => { resetMouse(); lockFresh = document.pointerLockElement === canvasEl; });
  window.addEventListener('mousemove', (e) => {
    if (!aimHeld || cm.activeMode !== 'person') { resetMouse(); return; }
    let dx, dy;
    if (document.pointerLockElement === canvasEl) {
      if (lockFresh) { lockFresh = false; return; }
      dx = e.movementX || 0; dy = e.movementY || 0;
    } else {
      const fresh = lastMouseX === null;
      dx = fresh ? 0 : e.clientX - lastMouseX; dy = fresh ? 0 : e.clientY - lastMouseY;
      lastMouseX = e.clientX; lastMouseY = e.clientY;
    }
    if (Math.abs(dx) > MOUSE_SPIKE || Math.abs(dy) > MOUSE_SPIKE) return;
    dx = Math.max(-MOUSE_STEP, Math.min(MOUSE_STEP, dx)); dy = Math.max(-MOUSE_STEP, Math.min(MOUSE_STEP, dy));
    if (freeYaw === null) freeYaw = camYaw();
    const k = aimSens();
    freeYaw = wrapAngle(freeYaw - dx * k); // (kept within +-pi)
    freePitch = Math.max(-AIM_PITCH, Math.min(AIM_PITCH, freePitch - dy * k));
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
  elAim.addEventListener('pointerdown', (e) => { e.preventDefault(); aimHeld = true; aimBtn = true; });
  elAim.addEventListener('pointerup', () => { aimHeld = false; aimBtn = false; });
  elAim.addEventListener('pointercancel', () => { aimHeld = false; aimBtn = false; });

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
  const flashes = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), flashMat);
    m.visible = false;
    m.userData.t = 0;
    scene.add(m);
    return m;
  });
  let flashNext = 0;
  const sparkMat = new THREE.MeshBasicNodeMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparks = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), sparkMat);
    m.visible = false;
    m.userData.t = 0;
    scene.add(m);
    return m;
  });
  let sparkNext = 0;

  // gunshots synthesised with Web Audio (a filtered noise burst and a thump)
  let audio = null;
  function bang(kind, dist = 0) {
    try {
      audio = sharedAudioContext(); // (the game's one context; null until the first gesture)
      if (!audio) return;
      const t = audio.currentTime;
      const att = 1 / (1 + dist / 25);
      // a burst of noise through a filter, fading out
      const noise = (len, freq, gain, power, type = 'lowpass') => {
        const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * len), audio.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, power);
        const src = audio.createBufferSource();
        src.buffer = buf;
        const filter = audio.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        const g = audio.createGain();
        g.gain.setValueAtTime(gain, t);
        src.connect(filter).connect(g).connect(audio.destination);
        src.start(t);
      };
      // a falling tone (the thump of the shot)
      const thump = (f0, f1, len, gain, at = 0, wave = 'sine') => {
        const osc = audio.createOscillator();
        const og = audio.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(f0, t + at);
        osc.frequency.exponentialRampToValueAtTime(f1, t + at + len);
        og.gain.setValueAtTime(gain, t + at);
        og.gain.exponentialRampToValueAtTime(0.001, t + at + len + 0.03);
        osc.connect(og).connect(audio.destination);
        osc.start(t + at);
        osc.stop(t + at + len + 0.05);
      };
      const far = 1 + dist / 60;
      switch (kind) {
        case 'draw': // a metal click-clack
          thump(1900, 900, 0.025, 0.12, 0, 'square');
          thump(1300, 600, 0.03, 0.1, 0.07, 'square');
          return;
        case 'hurt':
          thump(150, 55, 0.14, 0.4);
          noise(0.1, 700, 0.25, 2);
          return;
        case 'punch':
          noise(0.08, 900, 0.35, 2.5);
          thump(120, 55, 0.09, 0.4);
          return;
        case 'boom':
          noise(1.3, 520 / far, 1.0 * Math.max(0.25, att * 1.4), 1.6);
          thump(70, 24, 0.7, 0.9 * Math.max(0.25, att * 1.4));
          return;
        case 'rocket':
          noise(0.7, 900, 0.5, 1.2, 'bandpass');
          thump(90, 40, 0.3, 0.5);
          return;
        case 'm4':
          noise(0.16, 3800 / far, 0.65 * att, 3.2);
          thump(130, 45, 0.11, 0.5 * att);
          return;
        case 'shotgun':
          noise(0.5, 2400 / far, 0.9 * att, 2.2);
          thump(90, 40, 0.12, 0.5 * att);
          return;
        case 'uzi':
          noise(0.12, 4200 / far, 0.6 * att, 3.5);
          thump(140, 40, 0.12, 0.5 * att);
          return;
        default: // pistol
          noise(0.28, 3400 / far, 0.6 * att, 3.5);
          thump(140, 40, 0.12, 0.5 * att);
      }
    } catch { /* no audio */ }
  }

  // Where a shot from (ox, oy, oz) along the unit vector (dx, dy, dz) stops: the first person, car, wall or the ground
  // within range, in 3D (so a shot can pass over a head or a car roof, or go into the road). Starts `s0` m along.
  // `solid`: walls, cars and the ground only (the hostiles' line-of-sight checks and their shots, js/combat.js).
  // Exact tests, not steps along the ray:
  // - people: three capsules on their current spot (legs, torso, head), see BODY
  // - cars: a box their own length, width and height, turned with them
  // - buildings: their footprint (box or polygon) between floor and roof
  // - the ground: sampled every 0.5 m, then refined
  // The nearest hit wins, and a shot hits one thing.
  function trace(ox, oy, oz, dx, dy, dz, range, s0 = 0.3, solid = false) {
    let best = range, hit = null;
    // buildings: the colliders along the ray (gathered in 40 m stretches)
    const seen = new Set();
    for (let s = s0; s < best + 20; s += 40) {
      const m = s + 20;
      for (const c of cm.nearColliders(ox + dx * m, oz + dz * m, 22)) seen.add(c);
    }
    for (const c of seen) {
      const t = rayCollider(c, ox, oy, oz, dx, dy, dz, s0, best);
      if (t !== null) { best = t; hit = { kind: 'wall' }; }
    }
    // people and cars (a quick reject first: how far they stand from the ray's line on the map)
    const hl2 = Math.hypot(dx, dz), hx = hl2 > 1e-4 ? dx / hl2 : 0, hz = hl2 > 1e-4 ? dz / hl2 : 0;
    const near = (x, z, r) => {
      const vx = x - ox, vz = z - oz;
      if (hl2 <= 1e-4) return vx * vx + vz * vz < r * r;
      const a = vx * hx + vz * hz;
      return a > s0 * hl2 - r && a < best * hl2 + r && Math.abs(vx * hz - vz * hx) < r;
    };
    if (!solid) {
      for (const p of trafficSystem.peds) {
        if (!p.placed || p.dead || !near(p.x, p.z, 0.6)) continue;
        const b = rayBody(p.x, cm.getGroundHeight(p.x, p.z, 'person') ?? 0, p.z, ox, oy, oz, dx, dy, dz, s0, best);
        if (b) { best = b.t; hit = { kind: 'ped', p, part: b.part }; }
      }
      for (const g of combat.list) {
        if (g.dead || !near(g.x, g.z, 0.6)) continue;
        const b = rayBody(g.x, g.y, g.z, ox, oy, oz, dx, dy, dz, s0, best);
        if (b) { best = b.t; hit = { kind: 'gunman', g, part: b.part }; }
      }
    }
    for (const v of trafficSystem.cars) {
      if (v.driven || !(v.edge || v.parked)) continue;
      const hl = v.halfL ?? 2.2, hw = (v.halfWidth ?? 0.9) + 0.05;
      if (!near(v.x, v.z, hl + hw)) continue;
      const t = rayCar(v, cm.getGroundHeight(v.x, v.z, 'person') ?? 0, hl, hw, ox, oy, oz, dx, dy, dz, s0, best);
      if (t !== null) { best = t; hit = { kind: 'car', v }; }
    }
    // the ground, up to the nearest hit so far
    let prev = s0;
    for (let s = s0; s <= best + 1e-6; s += 0.5) {
      const t = Math.min(s, best);
      const px = ox + dx * t, pz = oz + dz * t;
      if (oy + dy * t < (cm.getGroundHeight(px, pz, 'person') ?? 0)) {
        let lo = prev, hi = t;
        for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2; if (oy + dy * mid < (cm.getGroundHeight(ox + dx * mid, oz + dz * mid, 'person') ?? 0)) hi = mid; else lo = mid; }
        best = hi; hit = { kind: 'ground' };
        break;
      }
      prev = t;
      if (t >= best) break;
    }
    const x = ox + dx * best, y = oy + dy * best, z = oz + dz * best;
    if (!hit) return { kind: 'none', x, y, z, dist: best };
    if (hit.kind === 'ground') return { kind: 'ground', x, y: cm.getGroundHeight(x, z, 'person') ?? y, z, dist: best };
    return Object.assign(hit, { x, y, z, dist: best });
  }
  // A person's hit shape, above their feet (m): the legs, the torso and the head as upright capsules [bottom, top, radius],
  // sized to the cast's figures (about 1.75 m tall, 0.5 m across the shoulders)
  const BODY = [['legs', 0.1, 0.84, 0.17], ['torso', 0.92, 1.38, 0.23], ['head', 1.54, 1.7, 0.12]];
  function rayBody(x, y, z, ox, oy, oz, dx, dy, dz, t0, t1) {
    let out = null;
    for (const [part, a, b, r] of BODY) {
      const t = rayCapsule(ox - x, oy - (y + a), oz - z, dx, dy, dz, b - a, r);
      if (t !== null && t >= t0 && t < t1) { t1 = t; out = { t, part }; }
    }
    return out;
  }
  // A ray from o (relative to the capsule's bottom point) against an upright capsule of length L and radius r: the
  // distance to where it enters, or null
  function rayCapsule(ox, oy, oz, dx, dy, dz, L, r) {
    let best = null;
    const a = dx * dx + dz * dz;
    if (a > 1e-9) {
      const b = ox * dx + oz * dz, c = ox * ox + oz * oz - r * r, h = b * b - a * c;
      if (h < 0) return null; // misses the infinite upright cylinder, so the caps too
      const t = (-b - Math.sqrt(h)) / a, y = oy + dy * t;
      if (y >= 0 && y <= L) return t;
    }
    for (const cy of [0, L]) { // the end caps (spheres)
      const qx = ox, qy = oy - cy, qz = oz;
      const b = qx * dx + qy * dy + qz * dz, c = qx * qx + qy * qy + qz * qz - r * r, h = b * b - c;
      if (h < 0) continue;
      const t = -b - Math.sqrt(h);
      if (best === null || t < best) best = t;
    }
    return best;
  }
  // a ray through the slab lo..hi along one axis: narrows [t0, t1], or returns false when it misses
  function slab(o, d, lo, hi, r) {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
    let a = (lo - o) / d, b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    if (a > r[0]) r[0] = a;
    if (b < r[1]) r[1] = b;
    return r[0] <= r[1];
  }
  const _sr = [0, 0];
  // the ray against a car: a box turned with it, from just over the road to its roof
  const CAR_TOP = { taxi: 1.5, sedan: 1.45, suv: 1.72, minivan: 1.75, pickup: 1.85, van: 2.1 };
  function rayCar(v, fy, hl, hw, ox, oy, oz, dx, dy, dz, t0, t1) {
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const rx = ox - v.x, rz = oz - v.z;
    const oa = rx * fx + rz * fz, oc = rx * fz - rz * fx, da = dx * fx + dz * fz, dc = dx * fz - dz * fx;
    _sr[0] = t0; _sr[1] = t1;
    if (!slab(oa, da, -hl, hl, _sr) || !slab(oc, dc, -hw, hw, _sr) || !slab(oy, dy, fy + 0.15, fy + (CAR_TOP[String(v.bodyType).replace(/^rcc/, '')] ?? 1.55), _sr)) return null;
    return _sr[0] < t1 ? _sr[0] : null;
  }
  // the ray against a building: its box between floor and roof, then (a polygon footprint) the first point in the polygon
  function rayCollider(c, ox, oy, oz, dx, dy, dz, t0, t1) {
    _sr[0] = t0; _sr[1] = t1;
    if (!slab(ox, dx, c.minX, c.maxX, _sr) || !slab(oz, dz, c.minZ, c.maxZ, _sr) || !slab(oy, dy, c.minY ?? 0, c.maxY ?? Infinity, _sr)) return null;
    const a = _sr[0], b = _sr[1];
    if (a >= t1) return null;
    if (!c.polygon) return a;
    if (insidePoly(c.polygon.outer, ox + dx * a, oz + dz * a)) return a;
    // the nearest crossing of the footprint's edge within [a, b]
    const poly = c.polygon.outer;
    let best = null;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = poly[j], q = poly[i];
      const ex = q.x - p.x, ez = q.z - p.z, den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-12) continue;
      const wx = p.x - ox, wz = p.z - oz;
      const t = (wx * ez - wz * ex) / den, u = (wx * dz - wz * dx) / den;
      if (u >= 0 && u <= 1 && t >= a && t <= b && (best === null || t < best)) best = t;
    }
    return best;
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
  function findTarget(yaw, cone, pedsOnly = false, skip = null, pitch = null) {
    const p = person.position;
    let best = null, bestScore = Infinity;
    const consider = (x, z, t) => {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.8 || d > LOCK_RANGE) return;
      let a = Math.atan2(dx, dz) - yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) > cone) return;
      if (skip && t[t.kind === 'ped' ? 'q' : 'v'] === skip) return;
      // aim assist never pulls the aim off where the crosshair points up or down: the target's chest (above ITS ground,
      // not world y 0: the terrain has hills) must be near the crosshair's elevation
      if (pitch !== null) {
        const gy = cm.getGroundHeight(x, z, 'person') ?? p.y;
        if (Math.abs(Math.atan2(gy + (t.kind === 'ped' ? 1.25 : 0.9) - (p.y + 1.5), d) - pitch) > PITCH_TOL) return;
      }
      const score = d * (1 + Math.abs(a) * 2);
      if (score < bestScore) { bestScore = score; best = t; }
    };
    for (const q of trafficSystem.peds) if (q.placed && !q.dead) consider(q.x, q.z, { kind: 'ped', q, get x() { return q.x; }, get z() { return q.z; } });
    for (const q of combat.list) if (!q.dead) consider(q.x, q.z, { kind: 'ped', q, get x() { return q.x; }, get z() { return q.z; } });
    if (!pedsOnly) for (const v of trafficSystem.cars) if (!v.driven && (v.edge || v.parked)) consider(v.x, v.z, { kind: 'car', v, get x() { return v.x; }, get z() { return v.z; } });
    return best;
  }

  // ---- The crosshair and the aim: one source for the crosshair drawn, the shot, the arms and the facing ----
  const _co = new THREE.Vector3(), _cd = new THREE.Vector3(), _cn = { x: 0, y: 1 - 2 * CROSS_Y };
  // Where the crosshair is, in the canvas's normalised device coordinates. That's the middle of the .gp-cross element as
  // laid out, or, while it's hidden, where its CSS puts it (the middle of the window). It's measured afresh for each shot
  // and every 20 frames for the arms (a layout read).
  function crossNDC() {
    const r = canvasEl.getBoundingClientRect();
    let cx = window.innerWidth / 2, cy = window.innerHeight * CROSS_Y;
    if (!elCross.hidden) {
      const b = elCross.getBoundingClientRect();
      if (b.width > 0) { cx = b.left + b.width / 2; cy = b.top + b.height / 2; }
    }
    if (r.width > 0 && r.height > 0) { _cn.x = ((cx - r.left) / r.width) * 2 - 1; _cn.y = 1 - ((cy - r.top) / r.height) * 2; }
    return _cn;
  }
  // The crosshair's ray, into o (origin) and d (unit direction). Once the view is in its aim framing (cameras.js
  // aimSettled), it comes from the camera as drawn, with that frame's matrices: what the player sees is what they hit.
  // Before then (the view still gliding in from behind, or a click from the hip with no crosshair up yet), it comes from
  // the aim view the camera is going to.
  function crosshairRay(o, d, fresh = true) {
    const cam = cameraSystem.camera;
    if (cameraSystem.aimSettled || !cameraSystem.aimPose || cm.activeMode !== 'person') {
      cam.updateMatrixWorld();
      cam.getWorldPosition(o);
      const n = fresh ? crossNDC() : _cn;
      d.set(n.x, n.y, 0.5).unproject(cam).sub(o).normalize();
    } else cameraSystem.aimPose(person, freeYaw ?? camYaw(), freePitch, o, d);
  }
  // What the crosshair is on: the first person, car, wall or ground along its ray. The ray starts level with the muzzle
  // (mx, my, mz), so whatever is between the camera and the gun is left out. If the ray meets nothing, the point is the far
  // end of it. On a touch screen with nobody under the crosshair, a person in plain sight within assistCone of it is used.
  function aimAt(range, mx, my, mz, fresh = true) {
    crosshairRay(_co, _cd, fresh);
    const from = Math.max(0, (mx - _co.x) * _cd.x + (my - _co.y) * _cd.y + (mz - _co.z) * _cd.z);
    const h = trace(_co.x, _co.y, _co.z, _cd.x, _cd.y, _cd.z, range + from, from);
    const point = new THREE.Vector3(h.x, h.y, h.z);
    let kind = h.kind, assist = null;
    if (h.kind === 'ped' || h.kind === 'gunman' || h.kind === 'car') point.addScaledVector(_cd, 0.05); // (just inside it: the muzzle's ray can't graze past)
    else if (assistCone > 0) {
      assist = assistTarget(_co, _cd, from, range + from);
      if (assist) { point.copy(assist.point); kind = assist.hit; }
    }
    return { point, kind, assist, hit: h, o: _co.clone(), d: _cd.clone() };
  }
  // Aim assist (touch only): the person, within assistCone of the crosshair's ray as seen from the camera, whose chest the
  // camera can see (the ray to it meets them first). The aim goes to their chest; the camera itself never moves.
  function assistTarget(o, d, from, range) {
    let best = null, bestA = assistCone;
    const consider = (obj, x, y, z, kind) => {
      const vx = x - o.x, vy = y - o.y, vz = z - o.z, L = Math.hypot(vx, vy, vz);
      if (L < from + 0.5 || L > range) return;
      const ang = Math.acos(Math.min(1, (vx * d.x + vy * d.y + vz * d.z) / L));
      if (ang >= bestA) return;
      const h = trace(o.x, o.y, o.z, vx / L, vy / L, vz / L, L + 0.5, from);
      if ((h.kind === 'ped' && h.p === obj) || (h.kind === 'gunman' && h.g === obj)) {
        bestA = ang;
        best = { kind: 'ped', hit: kind, q: obj, point: new THREE.Vector3(x, y, z), get x() { return obj.x; }, get z() { return obj.z; } };
      }
    };
    for (const g of combat.list) if (!g.dead) consider(g, g.x, g.y + 1.15, g.z, 'gunman');
    for (const p of trafficSystem.peds) if (p.placed && !p.dead) consider(p, p.x, (cm.getGroundHeight(p.x, p.z, 'person') ?? 0) + 1.15, p.z, 'ped');
    return best;
  }

  // Shots and blasts, drawn for anyone: the player's own and the hostiles' (js/combat.js)
  const fx = {
    tracer(ax, ay, az, bx, by, bz) {
      const tr = tracers[tracerNext++ % tracers.length];
      const pos = tr.geometry.attributes.position;
      pos.setXYZ(0, ax, ay, az);
      pos.setXYZ(1, bx, by, bz);
      pos.needsUpdate = true;
      tr.visible = true;
      tr.userData.t = 0.06;
    },
    flash(x, y, z) {
      const f = flashes[flashNext++ % flashes.length];
      f.position.set(x, y, z);
      f.visible = true;
      f.userData.t = 0.05;
    },
    spark(x, y, z) {
      const sp = sparks[sparkNext++ % sparks.length];
      sp.position.set(x, y, z);
      sp.visible = true;
      sp.userData.t = 0.08;
    },
    bang: (kind, dist = 0) => bang(kind, dist)
  };

  function fire() {
    if (missionSystem?.busy || document.body.classList.contains('cutscene') || document.body.classList.contains('cinematic')) return; // no shooting in a cut scene, the intro, or with a choice up
    if (seq || dying) return; // (getting into a car: both hands busy)
    if (!armed || cm.activeMode !== 'person' || reloading > 0 || cooldown > 0) return;
    const w = WEAPONS[wi];
    if (w.melee) return punch(w);
    if (ammo[wi] <= 0) { reloading = w.reload; return; }
    ammo[wi]--;
    cooldown = w.rate;
    // Where the shot is aimed. Aiming: the point under the crosshair. A ray from the camera drawn, through the crosshair,
    // meets the first person, car, wall or ground; on a touch screen with nobody under it, a hostile or local just off it
    // is taken instead (in plain sight only). Not aiming (J): the nearest person or car in front, else straight ahead.
    // The bullet then flies from the muzzle to that point, and whatever is in its way takes it.
    const pp = person.position;
    let yaw = person.heading;
    const aimPt = new THREE.Vector3();
    let haveAim = false, cross = null;
    const mz0 = cast?.muzzle();
    let mx = mz0 ? mz0.x : pp.x + Math.sin(yaw) * 0.55, my = mz0 ? mz0.y : pp.y + 1.38, mz = mz0 ? mz0.z : pp.z + Math.cos(yaw) * 0.55;
    // a click from the hip (the gun only now coming up: no crosshair on screen yet) takes the nearest person or car in
    // front that the muzzle can see, as a shot without aiming does
    const hip = aimHeld && !cameraSystem.aimSettled ? findTarget(freeYaw ?? camYaw(), LOCK_CONE) : null;
    const hipPt = hip && new THREE.Vector3(hip.x, (cm.getGroundHeight(hip.x, hip.z, 'person') ?? pp.y) + (hip.kind === 'ped' ? 1.15 : 0.9), hip.z);
    const hipSeen = hipPt && (() => {
      const vx = hipPt.x - mx, vy = hipPt.y - my, vz = hipPt.z - mz, L = Math.hypot(vx, vy, vz) || 1;
      const h = trace(mx, my, mz, vx / L, vy / L, vz / L, L + 0.5, 0);
      return (h.p || h.g || h.v) === (hip.q || hip.v);
    })();
    if (hipSeen) {
      aimPt.copy(hipPt);
      haveAim = true;
    } else if (aimHeld && cameraSystem.camera) {
      const a = aimAt(w.range, mx, my, mz);
      aimPt.copy(a.point);
      cross = a;
      haveAim = true;
    } else {
      const t = findTarget(person.heading, LOCK_CONE);
      if (t) {
        const gy = cm.getGroundHeight(t.x, t.z, 'person') ?? pp.y;
        aimPt.set(t.x, gy + (t.kind === 'ped' ? 1.2 : 0.9), t.z);
        haveAim = true;
      }
    }
    if (haveAim && Math.hypot(aimPt.x - pp.x, aimPt.z - pp.z) > 0.6) yaw = Math.atan2(aimPt.x - pp.x, aimPt.z - pp.z);
    person.heading = yaw;
    if (!mz0) { mx = pp.x + Math.sin(yaw) * 0.55; mz = pp.z + Math.cos(yaw) * 0.55; }
    raisedT = 0.7; // the gun comes up to fire, and stays up a moment
    kickNow = true;
    fx.flash(mx, my, mz);
    bang(w.sound);
    if (!missionSystem?.onJob) voices?.event('gunfire', pp); // (no police chatter on a job)
    missionSystem?.onGunfire?.();
    wanted?.crime('shot', pp.x, pp.z);
    // the shot's direction: from the muzzle to the aim point (straight along the facing if there is none)
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    if (haveAim) { dir.set(aimPt.x - mx, aimPt.y - my, aimPt.z - mz); if (dir.lengthSq() < 0.25) dir.set(Math.sin(yaw), 0, Math.cos(yaw)); }
    dir.normalize();
    // the spread: an aimed single shot after a pause goes exactly where the crosshair is; held or rapid fire spreads
    const spread = aimHeld && w.pellets === 1 && clock - lastFireT > w.rate * 1.6 ? 0 : w.spread;
    lastFireT = clock;
    const baseYaw = Math.atan2(dir.x, dir.z), basePitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const kick = w.kick ?? (w.id === 'shotgun' ? 0.05 : 0.012);
    if (w.id === 'rocket') {
      launchRocket(mx, my, mz, dir, w);
      if (aimHeld) freePitch = Math.min(AIM_PITCH, freePitch + kick);
      if (ammo[wi] <= 0) reloading = w.reload;
      return;
    }
    let hitKind = null;
    const shotAt = new Set();
    for (let k = 0; k < w.pellets; k++) {
      const a = baseYaw + (Math.random() - 0.5) * 2 * spread;
      const pa = basePitch + (Math.random() - 0.5) * 2 * spread * 0.6;
      const cp = Math.cos(pa);
      // (from the muzzle itself, to past the aim point: the first thing on the way takes the hit)
      const hit = trace(mx, my, mz, Math.sin(a) * cp, Math.sin(pa), Math.cos(a) * cp, w.range, 0);
      if (k === 0) lastShot = { kind: hit.kind, part: hit.part, x: hit.x, y: hit.y, z: hit.z, aim: haveAim ? [aimPt.x, aimPt.y, aimPt.z] : null, from: [mx, my, mz], weapon: w.id,
        cross: cross && { kind: cross.kind, o: cross.o.toArray(), d: cross.d.toArray(), assist: cross.assist } };
      fx.tracer(mx, my, mz, hit.x, hit.y, hit.z);
      if (hit.kind !== 'none') fx.spark(hit.x, hit.y, hit.z);
      if (hit.kind === 'ped') {
        hitKind = 'ped';
        if (!hit.p.dead) { trafficSystem.killPed(hit.p, pp.x, pp.z); wanted?.crime('kill', hit.p.x, hit.p.z); }
      } else if (hit.kind === 'gunman') {
        hitKind = 'ped';
        combat.hurt(hit.g, w.dmg, pp.x, pp.z);
      } else if (hit.kind === 'car') {
        hitKind = hitKind || 'car';
        if (w.pellets === 1 || !shotAt.has(hit.v)) trafficSystem.shootCar(hit.v);
        shotAt.add(hit.v);
      }
    }
    // recoil: the aim kicks up a little (the camera follows), more for the shotgun
    if (aimHeld) freePitch = Math.min(AIM_PITCH, freePitch + kick);
    if (hitKind) { hitMarkT = 0.18; elCross.classList.add('hit'); }
    trafficSystem.scarePeds(pp.x, pp.z, 40, 10);
    if (ammo[wi] <= 0) reloading = w.reload;
  }
  // A punch: the swing takes 0.3 s and lands a moment in; whoever is nearest in front (a person, a hostile) takes it
  let punchT = 0, punchLeft = false, punchPending = 0, kickNow = false;
  function punch(w) {
    cooldown = w.rate;
    punchT = 0.3;
    punchLeft = !punchLeft;
    punchPending = 0.12;
    bang('punch');
  }
  function punchLands() {
    const w = WEAPON_BY_ID.fists, p = person.position;
    let best = null, bd = w.range;
    const consider = (o, kind) => {
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
      if (d > bd) return;
      let a = Math.atan2(dx, dz) - person.heading;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) > 0.95) return;
      bd = d; best = { o, kind };
    };
    for (const q of trafficSystem.peds) if (q.placed && !q.dead) consider(q, 'ped');
    for (const g of combat.list) if (!g.dead) consider(g, 'gunman');
    wanted?.crime('hit', p.x, p.z);
    if (!best) return;
    hitMarkT = 0.18;
    elCross.classList.add('hit');
    lastShot = { kind: best.kind === 'gunman' ? 'gunman' : 'ped', x: best.o.x, y: p.y + 1.2, z: best.o.z, aim: null, from: [p.x, p.y + 1.2, p.z], weapon: 'fists' };
    if (best.kind === 'gunman') combat.hurt(best.o, w.dmg, p.x, p.z);
    else {
      best.o.punches = (best.o.punches || 0) + 1;
      if (best.o.punches >= 2) { trafficSystem.killPed(best.o, p.x, p.z); wanted?.crime('kill', best.o.x, best.o.z); }
      else trafficSystem.scarePeds(best.o.x, best.o.z, 12, 10);
    }
  }

  // Rockets: a slow projectile that explodes where it first meets a person, car, wall or the ground, or after 5 s
  const rockets = [];
  const rocketBody = new THREE.MeshStandardNodeMaterial({ color: 0x4a5a3a, roughness: 0.6, metalness: 0.3 });
  const glowMat = new THREE.MeshBasicNodeMaterial({ color: 0xffa030, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const smokeMat = new THREE.MeshBasicNodeMaterial({ color: 0xb8b8b8, transparent: true, opacity: 0.55, depthWrite: false });
  const puffs = Array.from({ length: 28 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), smokeMat); m.visible = false; m.userData.t = 0; scene.add(m); return m; });
  let puffNext = 0;
  function launchRocket(mx, my, mz, dir, w) {
    const m = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8), rocketBody);
    body.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), rocketBody);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.35;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glowMat);
    glow.position.z = -0.34;
    m.add(body, tip, glow);
    m.position.set(mx, my, mz);
    m.lookAt(mx + dir.x, my + dir.y, mz + dir.z);
    scene.add(m);
    rockets.push({ m, x: mx, y: my, z: mz, dx: dir.x, dy: dir.y, dz: dir.z, v: w.speed, t: 0, puffT: 0, w });
    bang('rocket');
  }
  function stepRockets(dt) {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.t += dt;
      const step = r.v * dt;
      const h = trace(r.x, r.y, r.z, r.dx, r.dy, r.dz, step + 0.3, 0.0);
      if ((h.kind !== 'none' && h.dist <= step + 0.3) || r.t > 5) {
        const at = h.kind !== 'none' ? h : { x: r.x, y: r.y, z: r.z };
        scene.remove(r.m);
        rockets.splice(i, 1);
        explode(at.x, at.y, at.z, r.w.blast);
        continue;
      }
      r.x += r.dx * step; r.y += r.dy * step; r.z += r.dz * step;
      r.m.position.set(r.x, r.y, r.z);
      r.puffT -= dt;
      if (r.puffT <= 0) {
        r.puffT = 0.035;
        const pf = puffs[puffNext++ % puffs.length];
        pf.position.set(r.x - r.dx * 0.4, r.y - r.dy * 0.4, r.z - r.dz * 0.4);
        pf.scale.setScalar(1);
        pf.visible = true;
        pf.userData.t = 0.8;
      }
    }
    for (const pf of puffs) if (pf.visible) { pf.userData.t -= dt; pf.scale.setScalar(Math.max(0.05, pf.userData.t / 0.8) * 1.6); if (pf.userData.t <= 0) pf.visible = false; }
  }
  // The blast: a fireball and a scorch mark, the boom, and damage to everyone and everything inside the radius
  const fireballs = [0, 1, 2].map(() => {
    const mat = new THREE.MeshBasicNodeMaterial({ color: 0xff8a20, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat);
    m.visible = false; m.userData.t = 0; scene.add(m);
    return m;
  });
  const scorches = [0, 1, 2, 3].map(() => {
    const mat = new THREE.MeshBasicNodeMaterial({ color: 0x111111, transparent: true, opacity: 0.55, depthWrite: false });
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), mat);
    m.visible = false; m.renderOrder = 2; m.userData.t = 0; scene.add(m);
    return m;
  });
  let fireNext = 0, scorchNext = 0;
  const blastLog = []; // for checks: the blasts so far
  function explode(x, y, z, b) {
    const f = fireballs[fireNext++ % fireballs.length];
    f.position.set(x, y + 0.4, z);
    f.visible = true;
    f.userData.t = 0.5;
    f.userData.r = b.r * 0.55;
    const sc = scorches[scorchNext++ % scorches.length];
    sc.position.set(x, (cm.getGroundHeight(x, z, 'person') ?? 0) + 0.04, z);
    sc.scale.setScalar(b.r * 0.4);
    sc.visible = true;
    sc.userData.t = 9;
    bang('boom', Math.hypot(person.position.x - x, person.position.z - z));
    const R = b.r;
    let kills = 0;
    for (const q of trafficSystem.peds) {
      if (!q.placed || q.dead) continue;
      if (Math.hypot(q.x - x, q.z - z) < R * 0.8) { trafficSystem.killPed(q, x, z); kills++; }
    }
    let cars = 0;
    for (const v of trafficSystem.cars) {
      if (v.driven || !(v.edge || v.parked)) continue;
      if (Math.hypot(v.x - x, v.z - z) < R) { for (let k = 0; k < 8; k++) trafficSystem.shootCar(v); cars++; } // wrecked: it stalls where it is
    }
    combat.blast(x, y, z, R, b.dmg);
    const pd = Math.hypot(person.position.x - x, person.position.z - z);
    if (cm.activeMode === 'person' && pd < R * 0.75) hurtPlayer(b.dmg * 0.55 * (1 - pd / (R * 0.75)), x, z);
    trafficSystem.scarePeds(x, z, 60, 10);
    if (kills) wanted?.crime('kill', x, z);
    wanted?.crime('shot', x, z);
    missionSystem?.onGunfire?.();
    blastLog.push({ x, y, z, r: R, kills, cars });
  }
  function stepBlasts(dt) {
    for (const f of fireballs) if (f.visible) {
      f.userData.t -= dt;
      const k = 1 - Math.max(0, f.userData.t) / 0.5;
      f.scale.setScalar(Math.max(0.1, f.userData.r * (0.25 + 0.75 * Math.sqrt(k))));
      f.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (f.userData.t <= 0) f.visible = false;
    }
    for (const s of scorches) if (s.visible) { s.userData.t -= dt; s.material.opacity = Math.max(0, Math.min(0.55, s.userData.t / 9 * 0.8)); if (s.userData.t <= 0) s.visible = false; }
  }
  function switchTo(i) {
    if (i === wi && armed) return;
    wi = i;
    armed = true;
    reloading = 0;
    cooldown = Math.max(cooldown, 0.3); // (the draw)
    bang('draw');
    drawHud();
    showStrip();
  }
  function switchWeapon(d) {
    switchTo((wi + d + WEAPONS.length) % WEAPONS.length);
  }
  const selectSlot = (i) => { if (i >= 0 && i < WEAPONS.length) switchTo(i); };

  // ------------------------------------------------------------------------------------------------------------------
  // Health, the hostiles (js/combat.js) and dying
  // ------------------------------------------------------------------------------------------------------------------
  // 100 health; a hit takes 4-14 (what the hostile's gun does: js/weapons.js `npc.dmg`); 6 s without a hit and it comes
  // back at 5 a second. At 0: WASTED. On a job that fails it and puts you back at the job's start marker; otherwise you
  // wake where you fell, a little poorer, with the police off you.
  const HP_MAX = 100;
  let hp = HP_MAX, lastHurt = -99, hurtGlow = 0, dying = null, hpShown = -1;
  const elHp = div('gp-hp');
  elHp.innerHTML = '<i></i><span>HEALTH</span>';
  const elHpFill = elHp.firstChild;
  const elHurt = div('gp-hurt');
  const elWasted = div('gp-wasted');
  elWasted.innerHTML = '<b>WASTED</b><small></small>';
  const document_ = document.body.classList;
  function hurtPlayer(dmg, fromX, fromZ) {
    if (dying || dmg <= 0 || document_.contains('cinematic') || document_.contains('in-room')) return;
    hp = Math.max(0, hp - dmg);
    lastHurt = clock;
    hurtGlow = Math.min(1, hurtGlow + 0.45);
    bang('hurt');
    if (fromX !== undefined) cast?.flinch?.(Math.sign(Math.sin(Math.atan2(fromX - person.position.x, fromZ - person.position.z) - person.heading)) || 1);
    else cast?.flinch?.();
    if (hp <= 0) die();
  }
  function die() {
    const onJob = !!missionSystem?.onJob;
    if (cm.activeMode === 'car') leaveCarNow();
    triggerHeld = false;
    stopMouseAim();
    aimHeld = false;
    dying = { t: 0, x: person.position.x, y: person.position.y, z: person.position.z, h: person.heading, onJob };
    elWasted.querySelector('small').textContent = onJob ? 'The job is lost' : '';
  }
  function respawn() {
    const d = dying;
    dying = null;
    cast?.setPlayerPose(null);
    combat.clear();
    for (const r of rockets.splice(0)) scene.remove(r.m);
    let spot = { x: d.x, z: d.z, h: d.h };
    if (d.onJob) {
      const s = missionSystem.respawnSpot?.();
      if (s) spot = { x: s.x, z: s.z, h: d.h };
      missionSystem.failJob?.('You were shot.');
    } else {
      const money = missionSystem?.money ?? 0;
      const fee = Math.min(500, Math.round((money * 0.08) / 10) * 10);
      if (fee > 0) missionSystem.addMoney(-fee);
      wanted?.reset?.();
    }
    const out = cm.teleportActiveTo(spot.x, spot.z, spot.h);
    cameraSystem.resetForTeleport?.();
    hp = HP_MAX;
    lastHurt = -99;
    ammo.forEach((_, i) => { ammo[i] = WEAPONS[i].mag; });
    reloading = 0;
    return out;
  }
  function stepHealth(dt) {
    hurtGlow = Math.max(0, hurtGlow - dt * 0.9);
    elHurt.style.opacity = String(Math.min(0.85, hurtGlow + (hp < 30 ? 0.18 + 0.08 * Math.sin(clock * 6) : 0)));
    if (dying) {
      dying.t += dt;
      person.position.set(dying.x, dying.y, dying.z);
      person.speed = 0;
      cast?.setPlayerPose({ x: dying.x, y: dying.y, z: dying.z, heading: dying.h, anim: 'die', timeScale: 1, fade: 0.12, fall: smooth(dying.t / 0.55) });
      const k = Math.min(1, Math.max(0, (dying.t - 0.5) / 1.5));
      elWasted.style.opacity = String(k);
      elWasted.hidden = false;
      if (dying.t > 3.6) respawn();
      return;
    }
    if (!elWasted.hidden) {
      elWasted.style.opacity = String(Math.max(0, +elWasted.style.opacity - dt * 1.5));
      if (+elWasted.style.opacity <= 0) elWasted.hidden = true;
    }
    if (clock - lastHurt > 6 && hp < HP_MAX) hp = Math.min(HP_MAX, hp + 5 * dt);
    const shown = Math.round(hp);
    if (shown !== hpShown) {
      hpShown = shown;
      elHpFill.style.width = `${shown}%`;
      elHp.classList.toggle('low', shown < 30);
    }
    elHp.hidden = !(cm.activeMode === 'person' || cm.activeMode === 'car') || (hp >= HP_MAX && clock - lastHurt > 4 && !combat.alive);
  }
  // the aim accuracy test (js/aim-test.js): `calm` holds the hostiles' fire, `pre(dt)` runs at the top of each frame
  const testHooks = { calm: false, pre: null, crossNDC };
  const world = {
    player() {
      const inCar = cm.activeMode === 'car';
      const e = inCar ? car : person;
      return { x: e.position.x, y: e.position.y, z: e.position.z, speed: Math.abs(e.speed || 0), inCar, dead: !!dying };
    },
    // no shooting at you in a cut scene or with a choice up, in the intro, or indoors
    holdFire: () => !!missionSystem?.busy || document_.contains('cutscene') || document_.contains('cinematic') || document_.contains('in-room') || !!dying || testHooks.calm,
    hurtPlayer
  };
  const combat = createCombat({ cm, cast, trafficSystem, trace, fx, world });

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
    if (missionSystem?.busy || document.body.classList.contains('in-room')) return; // not during a cut scene or with a choice up, nor indoors
    if (cm.activeMode !== 'person' || seq) return;
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
      wanted?.crime('robbery', q.x, q.z);
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
      case 'KeyB':
        honk(true);
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
        drawHud();
        break;
      case 'KeyR':
        if (ammo[wi] < WEAPONS[wi].mag && !dying) { reloading = WEAPONS[wi].reload; bang('draw'); }
        break;
    }
  });
  // 1-6 pick a weapon on foot (Shift+1-6 stay the mode and camera keys; before main.js's mode and camera keys see them; with a choice up they pick the answer)
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || typing(e) || cm.activeMode !== 'person' || missionSystem?.busy || document.body.classList.contains('cinematic')) return;
    const m = /^Digit([1-6])$/.exec(e.code);
    if (!m) return;
    e.stopImmediatePropagation();
    if (!dying) selectSlot(+m[1] - 1);
  }, true);
  // the GUN button: a tap cycles the weapon, a long press holds the strip open to pick one (it fades 1.5 s after you let go)
  let gunHold = 0, gunLong = false;
  gunBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    gunLong = false;
    clearTimeout(gunHold);
    gunHold = setTimeout(() => { gunLong = true; showStrip(true); }, 450);
  });
  const gunUp = () => {
    if (!gunHold) return;
    clearTimeout(gunHold); gunHold = 0;
    if (gunLong) showStrip(); else switchWeapon(1);
    gunLong = false;
  };
  gunBtn.addEventListener('pointerup', gunUp);
  gunBtn.addEventListener('pointercancel', () => { clearTimeout(gunHold); gunHold = 0; if (gunLong) showStrip(); gunLong = false; });
  window.addEventListener('keyup', (e) => { if (e.code === 'KeyJ') triggerHeld = false; if (e.code === 'KeyB') honk(false); });
  // the horn: B (held) in a car, or the HORN button on touch screens; people just ahead of a moving car take the hint
  function honk(on) {
    if (on && cm.activeMode !== 'car') return;
    sounds.horn(on);
  }
  window.addEventListener('blur', () => honk(false));
  hornBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); honk(true); });
  hornBtn.addEventListener('pointerup', () => honk(false));
  hornBtn.addEventListener('pointercancel', () => honk(false));
  const canvas = renderer.domElement;
  let down = null;
  // aim with the right mouse button anywhere off the menus (the camera's own handlers can take the canvas's events),
  // or hold Q (touchpads); fire with a left click or J
  const offUi = (e) => !(e.target instanceof Element && e.target.closest('button, input, select, a, [role=dialog], .pop-item, .gm-cut, .intro-card'));
  window.addEventListener('pointerdown', (e) => {
    if (!offUi(e)) return;
    // right button: aim (held)
    if (e.button === 2) { if (!aimHeld) resetMouse(); aimHeld = true; aimByMouse = true; e.preventDefault(); if (cm.activeMode === 'person') grabMouse(); return; }
    // (a mouse click shoots; a finger on the screen never does: on touch screens only the FIRE button fires)
    if (e.button === 0 && e.pointerType === 'mouse') {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      assistCone = 0; // (a mouse aims exactly: no aim assist)
      // on foot with a gun a click captures the mouse (pointer lock) and aims, so you can turn right round and shoot
      if (armed && cm.activeMode === 'person' && e.target === canvas) { engageSticky(); grabMouse(); }
    }
  }, true);
  window.addEventListener('contextmenu', (e) => { if (offUi(e)) e.preventDefault(); });
  // Sticky aim: a left click (mouse, pointer lock) or a finger on the view brings the gun up for a few seconds
  const engageSticky = () => { if (armed && cm.activeMode === 'person') { if (!aimHeld) resetMouse(); stickyT = STICKY_AIM; aimHeld = true; } };
  // Touch: drag anywhere on the view (not on a button or the stick) to aim; the drag turns the aim, the FIRE button shoots
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !armed || cm.activeMode !== 'person' || touchDrag) return;
    touchDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    assistCone = 0.1; // a finger is rough: a gentle magnet (about 6 degrees), only when nobody is under the crosshair
    engageSticky();
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (!touchDrag || e.pointerId !== touchDrag.id) return;
    const dx = e.clientX - touchDrag.x, dy = e.clientY - touchDrag.y;
    touchDrag.x = e.clientX; touchDrag.y = e.clientY;
    if (!aimHeld || cm.activeMode !== 'person') return;
    if (freeYaw === null) freeYaw = camYaw();
    freeYaw = wrapAngle(freeYaw - Math.max(-MOUSE_STEP, Math.min(MOUSE_STEP, dx)) * AIM_SENS_TOUCH);
    freePitch = Math.max(-AIM_PITCH, Math.min(AIM_PITCH, freePitch - Math.max(-MOUSE_STEP, Math.min(MOUSE_STEP, dy)) * AIM_SENS_TOUCH));
    stickyT = STICKY_AIM;
  });
  for (const t of ['pointerup', 'pointercancel']) window.addEventListener(t, (e) => { if (touchDrag && e.pointerId === touchDrag.id) touchDrag = null; });
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    if (e.code === 'KeyQ' && !aimHeld) { resetMouse(); aimHeld = true; keyAim = true; if (cm.activeMode === 'person') grabMouse(); }
    if (e.code === 'KeyE' && aimHeld && !e.repeat) cycleTarget = true; // the next target
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'KeyQ' && !aimByMouse) { keyAim = false; aimHeld = false; freeMouse(); } });
  // quick turn: V spins the aim 180 degrees (brings the gun up if it was down)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyV' || e.repeat || typing(e) || !armed || cm.activeMode !== 'person') return;
    if (freeYaw === null) freeYaw = camYaw();
    freeYaw = wrapAngle(freeYaw + Math.PI);
    engageSticky();
  });
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
  fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); triggerHeld = true; assistCone = 0.1; engageSticky(); fire(); });
  fireBtn.addEventListener('pointerup', () => { triggerHeld = false; });
  fireBtn.addEventListener('pointercancel', () => { triggerHeld = false; });
  fireBtn.addEventListener('pointerleave', () => { triggerHeld = false; });
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
    testHooks.pre?.(dt);
    cooldown = Math.max(0, cooldown - dt);
    stepRockets(dt);
    stepBlasts(dt);
    if (punchT > 0) punchT = Math.max(0, punchT - dt);
    if (punchPending > 0 && (punchPending -= dt) <= 0) punchLands();
    stepHealth(dt);
    combat.update(dt);
    if (reloading > 0) {
      reloading -= dt;
      if (reloading <= 0) ammo[wi] = WEAPONS[wi].mag;
    }
    const onFoot = cm.activeMode === 'person';
    // aiming: face where the camera looks, crosshair on, lock on to whoever is under it
    // sticky aim runs out (unless a held aim input keeps it): the gun goes down, the mouse is freed
    if (stickyT > 0 && !aimByMouse && !aimBtn && !touchDrag && !keyAim && !triggerHeld && (stickyT -= dt) <= 0) { stickyT = 0; aimHeld = false; freeMouse(); }
    cm.aiming = onFoot && armed && aimHeld && !missionSystem?.busy && !seq && !dying;
    // menus, cars and cut scenes get the mouse back
    if (!cm.aiming && document.pointerLockElement === canvasEl) freeMouse();
    if (cm.aiming) {
      // free aim, turned by the mouse or a finger (see the pointer handlers); E jumps the aim to the next one along.
      // (on touch only, a gentle magnet: see assistTarget)
      if (freeYaw === null) freeYaw = camYaw();
      if (cycleTarget) {
        cycleTarget = false;
        const cur = lockTarget && (lockTarget.q || lockTarget.v);
        const next = findTarget(freeYaw, 1.4, true, cur, freePitch);
        if (next) freeYaw = Math.atan2(next.x - person.position.x, next.z - person.position.z);
      }
      cm.aimCamYaw = freeYaw; // (the view looks exactly along the mouse's yaw: aim assist never moves it)
      cm.aimPitch = freePitch;
      // what the crosshair is on (the same ray the shot takes): the body turns to it and the arms point the gun at it,
      // eased (a jump from a far wall to someone near swings them round rather than snapping). The camera is over the
      // shoulder, so this isn't the mouse's own yaw: at 5 m the point under the crosshair is ~8 degrees right of it
      if (aimFrame++ % 20 === 0) crossNDC();
      const pp = person.position, sy = pp.y + 1.4;
      const a = aimAt(120, pp.x, sy, pp.z, false);
      lockTarget = a.assist;
      const hd = Math.hypot(a.point.x - pp.x, a.point.z - pp.z);
      const wantYaw = hd > 2.5 ? Math.atan2(a.point.x - pp.x, a.point.z - pp.z) : freeYaw;
      const wantPitch = hd > 2.5 ? Math.max(-AIM_PITCH, Math.min(AIM_PITCH, Math.atan2(a.point.y - sy, hd))) : freePitch;
      const ek = 1 - Math.exp(-dt * 18);
      armYaw = armYaw === null ? lerpAngle(person.heading, wantYaw, ek) : lerpAngle(armYaw, wantYaw, ek);
      armPitch += (wantPitch - armPitch) * ek;
      cm.aimYaw = armYaw;
    } else { lockTarget = null; freeYaw = null; freePitch = 0; cm.aimPitch = 0; armPitch = 0; armYaw = null; cm.aimCamYaw = null; }
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
    cast?.setPlayerWeapon({ id: WEAPONS[wi].id, armed: armed && onFoot && !seq && !stepOut && !dying, aiming: cm.aiming || raisedT > 0,
      yaw: cm.aiming ? cm.aimYaw ?? person.heading : person.heading, pitch: cm.aiming ? armPitch : 0,
      punch: punchT > 0 ? 1 - punchT / 0.3 : 0, punchLeft, kick: kickNow, reload: reloading > 0 && WEAPONS[wi].reload > 0 ? 1 - reloading / WEAPONS[wi].reload : 0 });
    kickNow = false;
    elCross.classList.toggle('lock', !!lockTarget);
    if (hitMarkT > 0 && (hitMarkT -= dt) <= 0) elCross.classList.remove('hit');
    if (triggerHeld && WEAPONS[wi].auto) fire();
    gunBtn.classList.toggle('on', onFoot);

    // a car in the traffic the player is going for, braking to a stop
    if (halted) {
      const v = halted.v;
      if (!v.parked || v.driven) halted = null;
      else {
        halted.s = Math.max(0, halted.s - 8 * dt);
        const yaw = v.yaw + (v.yawOffset || 0);
        v.x += Math.sin(yaw) * halted.s * dt;
        v.z += Math.cos(yaw) * halted.s * dt;
        if (halted.s <= 0) halted = null;
      }
    }
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
        // (at the door once the car has stopped; or, if something's in the way, after a few seconds whatever)
        if ((d < 0.7 && !(halted && halted.v === r.v)) || approach.t > 4) board(r);
        else if (d < 0.7) { person.speed = 0; person.heading = Math.atan2(dx, dz); }
        else {
          person.heading = Math.atan2(dx, dz);
          const sp = Math.min(4.3, d * 3);
          person.speed = sp;
          person.position.x += (dx / d) * sp * dt;
          person.position.z += (dz / d) * sp * dt;
        }
      }
    }
    // getting in: on a timer, so it always ends. Something else moving the player (a teleport, a mission) or changing
    // the mode calls it off
    if (seq) {
      const r = seq.r;
      const moved = Math.hypot(person.position.x - seq.px, person.position.z - seq.pz) > 2.5;
      const carGone = r.kind === 'traffic' && (r.v.driven || r.v.edge || !r.v.parked);
      if (!onFoot || moved || carGone) endSeq();
      else stepSeq(dt);
    }
    // getting out: up out of the seat to beside the door (a key, or anything moving the player, ends it at once)
    if (stepOut) {
      const so = stepOut;
      so.t += dt;
      const anyKey = cm.keys.forward || cm.keys.backward || cm.keys.left || cm.keys.right;
      if (!onFoot || anyKey || so.t >= STEP_OUT_TIME || Math.hypot(person.position.x - so.door.x, person.position.z - so.door.z) > 1) {
        stepOut = null;
        cast?.setPlayerPose(null);
      } else {
        const k = smooth((so.t - 0.15) / (STEP_OUT_TIME - 0.15));
        cast?.setPlayerPose({ x: lerp(so.seat.x, so.door.x, k), y: person.position.y, z: lerp(so.seat.z, so.door.z, k), heading: so.h, anim: k < 0.35 ? 'sit' : 'idle' });
      }
    }
    if (jacked) stepJacked(dt);

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
      const top = Math.round((((car.drive && car.drive.speed) || 50) * 3.6 / DISPLAY_DIV) / 20) * 20 + 20;
      drawTicks(top);
      const kmh = Math.abs(car.speed) * 3.6 / DISPLAY_DIV;
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
        rutP.set(rx, terrainHeight(rx, rz) + (inAlbertPark(rx, rz) ? OPEN_PARK_LAWN_Y + 0.012 : 0.418), rz); // on the grass (over the hill under it): level ground in Albert Park, a raised lawn elsewhere
        rutMesh.setMatrixAt(rutNext, rutM.compose(rutP, rutQ, rutS));
        rutNext = (rutNext + 1) % RUTS;
        rutMesh.count = Math.min(RUTS, rutMesh.count + 1);
      }
      rutMesh.instanceMatrix.needsUpdate = true;
    }

    // effects
    for (const f of flashes) if (f.visible) { f.userData.t -= dt; if (f.userData.t <= 0) f.visible = false; }
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
    if (onFoot && !approach && !seq && !document.body.classList.contains('in-room')) {
      const r = nearestRide();
      if (r && r.kind === 'traffic' && r.dist < 5 && cast) cast.preload([driverModel(r.v)]); // (whoever's driving, ready to be dragged out)
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
    if (!onFoot) elSlots.classList.remove('show');
    fireBtn.classList.toggle('on', onFoot && armed);
    hornBtn.classList.toggle('on', cm.activeMode === 'car');
    if (cm.activeMode === 'car' && !hornHinted && !document.body.classList.contains('cinematic')) { hornHinted = true; missionSystem?.sub?.('Hold B (or the HORN button) to sound the horn.', 3.5); }
    if (cm.activeMode !== 'car' && sounds.hornOn) sounds.horn(false);
    if (onFoot) drawHud();
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

  const api = {
    update, beforeMode, weapons: WEAPONS,
    get driving() { return driving(); },
    get inSports() { return riding === 'sports' && cm.activeMode === 'car'; },
    /** The speedo's full scale for the car being driven (km/h) */
    get topSpeedKmh() { return cm.activeMode === 'car' ? Math.round(((car.drive && car.drive.speed) || 50) * 3.6 / DISPLAY_DIV / 10) * 10 + 20 : 0; },
    summonSports, summon, cycleCar, placeCar, leaveCarNow,
    /** The body root drawn for the car being driven (js/car-damage.js hangs its panels on it); null for a car taken from the traffic */
    activeBody() { return riding === 'sports' ? sports.mesh : riding === 'taxi' ? carMesh : null; },
    /** One more of the player's cars ({ id, name, root, line, wheelbase }): in the car button's cycle from now on */
    addCar(def) {
      CUSTOM_CARS.splice(Math.min(1, CUSTOM_CARS.length), 0, { id: def.id, name: def.name, root: def.root, drive: def.handling ? drive(...def.handling, { wheelbase: def.wheelbase || 2.8 }) : drive(54, 6.6, 11.5, { wheelbase: def.wheelbase || 2.8 }), wheels: def.wheels, line: def.line || `Your ${def.name}.` });
    },
    /** The player's parked sports car (or the parked taxi), for the player on foot to bump into */
    sportsBox() {
      if (riding !== 'sports' && sports.mesh && sports.mesh.visible && sports.mesh.parent) return { x: sports.x, z: sports.z, yaw: sports.heading, halfL: 2.3, halfW: 0.95 };
      if (taxiClone && taxiClone.visible && taxiClone.parent) return { x: taxiClone.position.x, z: taxiClone.position.z, yaw: taxiClone.rotation.y, halfL: 2.25, halfW: 0.92 };
      return null;
    },
    // for scripted checks
    get aimSens() { return aimSens(); },
    fire, switchWeapon, selectSlot, talk, tryEnter, exitCar, combat, hurtPlayer, explode, blastLog,
    get health() { return hp; },
    set health(v) { hp = v; },
    get state() {
      return { lastShot, armed, wi, weapon: WEAPONS[wi].id, hp, dying: !!dying, rockets: rockets.length, ammo: ammo[wi], cooldown, reloading, mode: cm.activeMode, approaching: !!approach, boarding: seq ? { t: seq.t, jack: seq.jack, kind: seq.r.kind } : null,
        aimYaw: freeYaw, aimPitch: freePitch, aimHeld, steppingOut: !!stepOut, jacked: jacked ? { id: jacked.id, t: jacked.t, at: jacked.at } : null };
    }
  };
  api.aimTest = (o) => import('./aim-test.js').then((m) => m.runAimTest({ cm, cameraSystem, trafficSystem, combat, canvas: renderer.domElement, api, hooks: testHooks }, o));
  if (/[?&]aimtest\b/.test(location.search)) setTimeout(() => api.aimTest().then((r) => console.log('[aimtest]', JSON.stringify(r))), 8000);
  return api;
}
