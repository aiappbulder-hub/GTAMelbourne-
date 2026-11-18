// Rideshare: a light, repeatable side activity ("Welcome to Melbourne. Your estimated wait time is 530 seconds.").
// P in a car goes on shift. A fare appears nearby with a pickup marker; stop in it and the passenger gets in, then drive to a
// named Melbourne spot (the GPS route is the map's waypoint). Pay = distance + a speed bonus; the rating (1-5 stars) drops
// on a hard crash. Fares chain until P ends the shift. Cash goes to missionSystem.addMoney (the save).
// Tunables live in CONFIG.
import * as THREE from 'three/webgpu';
import { createGps } from './gps.js';
import { PLACES } from './story/places.js';

export const CONFIG = {
  key: 'KeyP',
  pickupMin: 140, pickupMax: 380, // metres from the player to the next pickup
  pickupRadius: 12, dropRadius: 32, stopSpeed: 5, // m/s: slower than this inside the radius counts as stopped
  baseFare: 6, perKm: 14, minFare: 8, // dollars
  bonusMax: 0.5, // up to +50% for beating the expected time
  idealSpeed: 12, // m/s average the speed bonus is measured against
  crashDrop: 7, // m/s lost in one frame = a hard crash
  crashStars: 1, startStars: 5, minStars: 1,
  startWait: 530 // the joke: the first pickup's quoted wait, shown as a flavour line
};
const DESTS = [
  ['MCG', 'the MCG'], ['QVM', 'Queen Vic Market'], ['CROWN', 'Crown'], ['ESPL_FITZROY', 'St Kilda Pier'], ['FEDSQ_PLAZA', 'Fed Square'],
  ['LYGON_QB', 'Lygon St'], ['EUREKA', 'Eureka Tower'], ['SHRINE', 'the Shrine'], ['FSS', 'Flinders Street Station'], ['STATELIB', 'State Library'],
  ['EXHIB', 'the Exhibition Building'], ['MARVEL', 'Marvel Stadium'], ['STHCROSS', 'Southern Cross'], ['PARLIAMENT', 'Parliament House'],
  ['AP_PITS', 'Albert Park'], ['FAWKNER', 'Fawkner Park'], ['FLAGSTAFF', 'Flagstaff Gardens'], ['STPATS', "St Patrick's Cathedral"]
].map(([id, name]) => ({ id, name, ...PLACES[id] })).filter((d) => d.x !== undefined);

export function createRideshare({ controllerManager, missionSystem, mapSystem, scene, isBlocked = () => false }) {
  const style = document.createElement('style');
  style.textContent = `.gm-ride { position: fixed; left: 18px; top: 150px; z-index: 28; max-width: 300px; pointer-events: none; padding: 6px 10px; border-radius: 8px;
  background: rgba(10,14,22,.62); color: #fff; font: 600 13px/1.35 Inter, system-ui, sans-serif; text-shadow: 0 1px 2px #000; }
.gm-ride:empty { display: none; } .gm-ride b { color: #ffd23f; } .gm-ride i { font-style: normal; color: #ffd23f; letter-spacing: 1px; }`;
  document.head.append(style);
  const hud = document.createElement('div');
  hud.className = 'gm-ride';
  document.body.append(hud);

  const mk = (color) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 60, 12, 1, true), mat);
    beam.position.y = 30;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), mat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.4;
    g.add(beam, ring); g.visible = false; scene.add(g);
    return g;
  };
  const pickMark = mk(0x44e07a), dropMark = mk(0xffd23f);
  // the passenger: a simple figure at the pickup
  const ped = new THREE.Group();
  const pm = new THREE.MeshStandardMaterial({ color: 0x3b6ea8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 4, 8), pm); body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe0b090 })); head.position.y = 1.7;
  ped.add(body, head); ped.visible = false; scene.add(ped);
  const place = (m, x, z, r) => { m.position.set(x, 0.2, z); m.scale.set(r, 1, r); m.visible = true; try { const h = controllerManager.getGroundHeight?.(x, z, 'car'); if (Number.isFinite(h)) m.position.y = h + 0.2; } catch { /* flat */ } };

  const S = { on: false, phase: 'off', fare: null, stars: 5, earned: 0, trips: 0, t: 0, wait: 0, lastSpeed: 0, msg: '', msgT: 0 };
  let gps = null;
  const car = () => controllerManager.entities.car;
  const inCar = () => controllerManager.activeMode === 'car';
  const say = (m, s = 4) => { S.msg = m; S.msgT = s; };
  const stars = () => '★'.repeat(Math.round(S.stars)) + '☆'.repeat(5 - Math.round(S.stars));

  function newFare() {
    gps = gps || mapSystem?.gps || (mapSystem ? (mapSystem.gps = createGps()) : createGps());
    const c = car().position;
    let spot = null;
    for (let i = 0; i < 12 && !spot; i++) {
      const a = Math.random() * Math.PI * 2, r = CONFIG.pickupMin + Math.random() * (CONFIG.pickupMax - CONFIG.pickupMin);
      const q = gps.snap(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r);
      if (q && q.d < 30 && !isBlocked(q.x, q.z)) spot = q;
    }
    if (!spot) { S.phase = 'wait'; S.wait = 3; return; }
    S.fare = { pick: { x: spot.x, z: spot.z }, drop: null, t0: 0, dist: 0 };
    S.phase = 'pickup';
    place(pickMark, spot.x, spot.z, CONFIG.pickupRadius);
    ped.position.set(spot.x + 2, controllerManager.getGroundHeight?.(spot.x, spot.z, 'car') || 0, spot.z); ped.visible = true;
    dropMark.visible = false;
    if (mapSystem) mapSystem.waypoint = { x: spot.x, z: spot.z, name: 'Pickup', ride: true };
    say(S.trips === 0 ? `Fare request. Your estimated wait time is ${CONFIG.startWait} seconds. (Just kidding: they're close.)` : 'New fare request: drive to the green marker.', 5);
  }
  function startDrop() {
    const f = S.fare, c = car().position;
    // a named spot a good way off, not the one we're standing at
    const opts = DESTS.filter((d) => Math.hypot(d.x - c.x, d.z - c.z) > 500).sort(() => Math.random() - 0.5);
    const d = opts[0] || DESTS[0];
    f.drop = d;
    const r = (gps || (gps = createGps())).route(c.x, c.z, d.x, d.z);
    f.dist = r ? r.length : Math.hypot(d.x - c.x, d.z - c.z) * 1.3;
    f.t0 = S.t; f.crashed = 0;
    pickMark.visible = false; ped.visible = false;
    place(dropMark, d.x, d.z, CONFIG.dropRadius);
    if (mapSystem) mapSystem.waypoint = { x: d.x, z: d.z, name: d.name, ride: true };
    S.phase = 'drop';
    say(`Passenger in. Take me to ${d.name}.`, 5);
  }
  function finishDrop() {
    const f = S.fare, dt = Math.max(1, S.t - f.t0);
    const ideal = f.dist / CONFIG.idealSpeed;
    const bonus = Math.max(0, Math.min(CONFIG.bonusMax, (ideal - dt) / ideal));
    const base = Math.max(CONFIG.minFare, CONFIG.baseFare + (f.dist / 1000) * CONFIG.perKm);
    const tip = Math.round(base * (S.stars - 1) / 8); // a good rating tips
    const pay = Math.round(base * (1 + bonus)) + tip;
    missionSystem?.addMoney?.(pay);
    S.earned += pay; S.trips++;
    say(`Dropped at ${f.drop.name}: +$${pay}${bonus > 0.02 ? ` (speed bonus ${Math.round(bonus * 100)}%)` : ''}  ${stars()}`, 5);
    dropMark.visible = false; S.fare = null;
    S.phase = 'wait'; S.wait = 3;
    if (mapSystem && mapSystem.waypoint?.ride) mapSystem.waypoint = null;
  }
  function begin() {
    S.on = true; S.stars = CONFIG.startStars; S.earned = 0; S.trips = 0; S.t = 0;
    say('On shift. Finding a fare...', 3);
    newFare();
  }
  function end() {
    S.on = false; S.phase = 'off'; S.fare = null;
    pickMark.visible = dropMark.visible = ped.visible = false;
    if (mapSystem && mapSystem.waypoint?.ride) mapSystem.waypoint = null;
    say(S.trips ? `Shift over: ${S.trips} fare${S.trips > 1 ? 's' : ''}, $${S.earned}.` : 'Shift over.', 4);
  }
  const toggle = () => {
    if (S.on) end();
    else if (inCar() && !missionSystem?.onJob && !missionSystem?.busy) begin();
    else say('Get in a car (F) to go on shift.', 3);
  };
  window.addEventListener('keydown', (e) => {
    if (e.code !== CONFIG.key || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    toggle();
  });

  function update(dt) {
    S.t += dt;
    if (S.msgT > 0) S.msgT -= dt;
    if (S.on) {
      const c = car();
      if (!inCar() || missionSystem?.onJob) { if (S.on && missionSystem?.onJob) end(); }
      else {
        const sp = Math.abs(c.speed || 0);
        if (S.phase === 'drop' && dt < 0.2 && S.lastSpeed - sp > CONFIG.crashDrop) {
          S.stars = Math.max(CONFIG.minStars, S.stars - CONFIG.crashStars);
          say(`Ouch! Rating down to ${stars()}`, 3);
        }
        S.lastSpeed = sp;
        if (S.phase === 'wait') { S.wait -= dt; if (S.wait <= 0) newFare(); }
        else if (S.phase === 'pickup') {
          if (Math.hypot(c.position.x - S.fare.pick.x, c.position.z - S.fare.pick.z) < CONFIG.pickupRadius && sp < CONFIG.stopSpeed) startDrop();
        } else if (S.phase === 'drop') {
          const d = S.fare.drop;
          if (Math.hypot(c.position.x - d.x, c.position.z - d.z) < CONFIG.dropRadius && sp < CONFIG.stopSpeed) finishDrop();
        }
      }
    }
    for (const m of [pickMark, dropMark]) if (m.visible) m.children[0].material.opacity = 0.4 + Math.sin(S.t * 3) * 0.1;
    // HUD text
    let txt = '';
    if (S.on) {
      const f = S.fare;
      const meter = S.phase === 'drop' && f ? ` · meter $${Math.max(CONFIG.minFare, Math.round(CONFIG.baseFare + (f.dist / 1000) * CONFIG.perKm))}` : '';
      const line = S.phase === 'pickup' ? 'Pickup: drive to the green marker' : S.phase === 'drop' && f ? `Drop-off: <b>${f.drop.name}</b> (${Math.max(0, Math.round(Math.hypot(car().position.x - f.drop.x, car().position.z - f.drop.z) / 10) * 10)} m)${meter}` : 'Waiting for a fare...';
      txt = `<b>RIDESHARE</b> <i>${stars()}</i> · $${S.earned} (${S.trips})<br>${line}`;
    }
    if (S.msgT > 0 && S.msg) txt += `${txt ? '<br>' : ''}${S.msg}`;
    if (hud.innerHTML !== txt) hud.innerHTML = txt;
  }
  return {
    update, toggle,
    get state() { return { on: S.on, phase: S.phase, stars: S.stars, earned: S.earned, trips: S.trips, fare: S.fare && { pick: S.fare.pick, drop: S.fare.drop && S.fare.drop.id, dist: S.fare.dist } }; },
    /** For scripted checks */
    debugCompletePickup() { if (S.phase === 'pickup') startDrop(); },
    debugCompleteDrop() { if (S.phase === 'drop') finishDrop(); }
  };
}
