// Food delivery (Melbourne only): a repeatable side job modelled on js/rideshare.js. L starts a shift (L again ends it).
// A restaurant in the CBD is marked with an orange beam: get to it (any car, the bike or on foot; slow down inside the ring)
// to collect the order, then take it to the blue drop-off before the timer runs out. Pay = base + distance, plus a speed
// bonus for time left; a late order pays nothing. Orders chain until L ends the shift. Cash goes to missionSystem.addMoney.
// Tunables live in CONFIG. L is free: rideshare P, gameplay J/Q/E/B/R/..., main Y/X/V (see keydown handlers).
import * as THREE from 'three/webgpu';
import { createGps } from './gps.js';
import { PLACES } from './story/places.js';

export const CONFIG = {
  key: 'KeyL',
  pickupRadius: 14, dropRadius: 18, stopSpeed: 7, // m/s: slower than this inside the ring counts as stopped
  dropMin: 300, dropMax: 900, // metres from the restaurant to the drop-off
  baseFee: 10, perKm: 12, bonusMax: 0.6, // dollars; up to +60% for time left
  timeBase: 30, timePerM: 0.17, // s: the order's time = base + route distance * this (about 6 m/s average)
  waitAfter: 3
};
// restaurants (story places in the CBD and its edge)
const SPOTS = [
  ['HQ', 'Flinders Lane Dumplings'], ['FSS', 'Station Pizza'], ['FEDSQ_PLAZA', 'Fed Square Burgers'], ['STATELIB', 'Library Noodles'],
  ['CROWN', 'Crown Grill'], ['QVM', 'Market Souvlaki'], ['PARLIAMENT', 'Parliament Pho'], ['EXHIB', 'Exhibition Katsu'], ['FLAGSTAFF', 'Flagstaff Falafel']
].map(([id, name]) => ({ id, name, ...PLACES[id] })).filter((d) => d.x !== undefined);

export function createDeliveryJob({ controllerManager: cm, missionSystem, mapSystem, scene }) {
  const style = document.createElement('style');
  style.textContent = `.gm-deliv { position: fixed; left: 18px; top: 150px; z-index: 28; max-width: 320px; pointer-events: none; padding: 6px 10px; border-radius: 8px;
  background: rgba(10,14,22,.62); color: #fff; font: 600 13px/1.35 Inter, system-ui, sans-serif; text-shadow: 0 1px 2px #000; }
.gm-deliv:empty { display: none; } .gm-deliv b { color: #ff9a2f; } .gm-deliv .late { color: #ff5a4a; }`;
  document.head.append(style);
  const hud = document.createElement('div');
  hud.className = 'gm-deliv';
  document.body.append(hud);

  const mk = (color) => {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 60, 12, 1, true), m);
    beam.position.y = 30;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), m);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.4;
    g.add(beam, ring); g.visible = false; scene.add(g);
    return g;
  };
  const pickMark = mk(0xff9a2f), dropMark = mk(0x3fa9ff);
  const place = (m, x, z, r) => { m.position.set(x, 0.2, z); m.scale.set(r, 1, r); m.visible = true; try { const h = cm.getGroundHeight?.(x, z, 'person'); if (Number.isFinite(h)) m.position.y = h + 0.2; } catch { /* flat */ } };

  const S = { on: false, phase: 'off', job: null, earned: 0, jobs: 0, late: 0, t: 0, wait: 0, msg: '', msgT: 0, speed: 0, last: null };
  let gps = null;
  const say = (m, s = 4) => { S.msg = m; S.msgT = s; };
  const ent = () => cm.getActiveEntity();
  const getGps = () => gps || (gps = createGps());
  const rideshareOn = () => !!window.__city?.rideshare?.state?.on;

  function newOrder() {
    const pp = ent().position;
    const g = getGps();
    // a restaurant not too far from the player (the nearest few, one at random)
    const spots = SPOTS.map((s) => ({ s, d: Math.hypot(s.x - pp.x, s.z - pp.z) })).sort((a, b) => a.d - b.d).slice(0, 4);
    const from = spots[(Math.random() * spots.length) | 0].s;
    let drop = null;
    for (let i = 0; i < 20 && !drop; i++) {
      const a = Math.random() * Math.PI * 2, r = CONFIG.dropMin + Math.random() * (CONFIG.dropMax - CONFIG.dropMin);
      const q = g.snap(from.x + Math.cos(a) * r, from.z + Math.sin(a) * r);
      if (q && q.d < 25) drop = q;
    }
    if (!drop) { S.phase = 'wait'; S.wait = 2; return; }
    const route = g.route(from.x, from.z, drop.x, drop.z);
    const dist = route ? route.length : Math.hypot(drop.x - from.x, drop.z - from.z) * 1.3;
    S.job = { from, drop: { x: drop.x, z: drop.z }, dist, limit: CONFIG.timeBase + dist * CONFIG.timePerM, left: 0 };
    S.phase = 'pickup';
    place(pickMark, from.x, from.z, CONFIG.pickupRadius);
    dropMark.visible = false;
    if (mapSystem) mapSystem.waypoint = { x: from.x, z: from.z, name: from.name, ride: true };
    say(`New order at ${from.name}: pick it up.`, 5);
  }
  function startDrop() {
    const j = S.job;
    j.left = j.limit;
    pickMark.visible = false;
    place(dropMark, j.drop.x, j.drop.z, CONFIG.dropRadius);
    if (mapSystem) mapSystem.waypoint = { x: j.drop.x, z: j.drop.z, name: 'Delivery', ride: true };
    S.phase = 'drop';
    say(`Got it. Deliver within ${Math.round(j.limit)} s.`, 4);
  }
  function finish(ok) {
    const j = S.job;
    if (ok) {
      const bonus = Math.max(0, Math.min(CONFIG.bonusMax, (j.left / j.limit) * CONFIG.bonusMax * 1.2));
      const pay = Math.round((CONFIG.baseFee + (j.dist / 1000) * CONFIG.perKm) * (1 + bonus));
      missionSystem?.addMoney?.(pay);
      S.earned += pay; S.jobs++;
      say(`Delivered: +$${pay}${bonus > 0.02 ? ` (speed bonus ${Math.round(bonus * 100)}%)` : ''}`, 5);
    } else { S.late++; say('Too late: the customer cancelled. No pay.', 5); }
    dropMark.visible = pickMark.visible = false;
    S.job = null; S.phase = 'wait'; S.wait = CONFIG.waitAfter;
    if (mapSystem && mapSystem.waypoint?.ride) mapSystem.waypoint = null;
  }
  function begin() { S.on = true; S.earned = 0; S.jobs = 0; S.late = 0; say('Delivery shift on. Finding an order...', 3); newOrder(); }
  function end() {
    S.on = false; S.phase = 'off'; S.job = null;
    pickMark.visible = dropMark.visible = false;
    if (mapSystem && mapSystem.waypoint?.ride) mapSystem.waypoint = null;
    say(S.jobs ? `Shift over: ${S.jobs} deliver${S.jobs > 1 ? 'ies' : 'y'}, $${S.earned}.` : 'Shift over.', 4);
  }
  const toggle = () => {
    if (S.on) end();
    else if (cm.activeMode === 'helicopter') say('Land first to start deliveries.', 3);
    else if (missionSystem?.onJob || missionSystem?.busy || rideshareOn()) say('Finish the other job first (rideshare: P).', 3);
    else begin();
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
    const pp = ent().position;
    if (S.last && dt > 0) S.speed = Math.hypot(pp.x - S.last.x, pp.z - S.last.z) / dt;
    S.last = { x: pp.x, z: pp.z };
    if (S.on) {
      if (missionSystem?.onJob || rideshareOn()) end();
      else if (S.phase === 'wait') { S.wait -= dt; if (S.wait <= 0) newOrder(); }
      else if (S.phase === 'pickup') {
        if (Math.hypot(pp.x - S.job.from.x, pp.z - S.job.from.z) < CONFIG.pickupRadius && S.speed < CONFIG.stopSpeed) startDrop();
      } else if (S.phase === 'drop') {
        const j = S.job;
        j.left -= dt;
        if (Math.hypot(pp.x - j.drop.x, pp.z - j.drop.z) < CONFIG.dropRadius && S.speed < CONFIG.stopSpeed) finish(true);
        else if (j.left <= 0) finish(false);
      }
    }
    for (const m of [pickMark, dropMark]) if (m.visible) m.children[0].material.opacity = 0.4 + Math.sin(S.t * 3) * 0.1;
    let txt = '';
    if (S.on) {
      const j = S.job;
      let line = 'Waiting for an order...';
      if (S.phase === 'pickup' && j) line = `Pick up: <b>${j.from.name}</b> (${Math.round(Math.hypot(pp.x - j.from.x, pp.z - j.from.z) / 10) * 10} m)`;
      else if (S.phase === 'drop' && j) line = `Deliver: <b>${Math.round(Math.hypot(pp.x - j.drop.x, pp.z - j.drop.z) / 10) * 10} m</b> to go · <span class="${j.left < 15 ? 'late' : ''}">${Math.max(0, Math.ceil(j.left))} s</span>`;
      txt = `<b>FOOD DELIVERY</b> · $${S.earned} (${S.jobs})<br>${line}`;
    }
    if (S.msgT > 0 && S.msg) txt += `${txt ? '<br>' : ''}${S.msg}`;
    if (hud.innerHTML !== txt) hud.innerHTML = txt;
  }
  return {
    update, toggle,
    get state() { return { on: S.on, phase: S.phase, earned: S.earned, jobs: S.jobs, late: S.late, job: S.job && { from: S.job.from.id, drop: S.job.drop, dist: S.job.dist, left: S.job.left } }; },
    /** For scripted checks */
    debugCompletePickup() { if (S.phase === 'pickup') startDrop(); },
    debugCompleteDrop() { if (S.phase === 'drop') finish(true); }
  };
}
