// The wanted level: crimes raise "heat", heat is shown as 0 to 5 stars, and police come for you.
//
//  - Crimes (called from js/gameplay.js and the pedestrian hit listener): a shot fired, a person shot or run down, a
//    carjacking, a stolen parked car, a hold-up.
//  - Who knows: a person within 45 m saw it, or a police car within 55 m did (that is at least two stars at once).
//    If nobody is around, someone still reports it: a few seconds later the radio carries it and the heat goes up
//    (a little less than a witnessed crime). So there is always a response.
//  - The response: one police car a star (four at most). Each spawns well back on the route you drove and follows it
//    (js/pursuit.js: slows for bends and traffic, solid, so it can't be driven through), with a siren that grows as
//    the nearest one closes.
//  - It ends when you lose them (stay over 230 m clear for 10 s), when the heat cools (it falls while no unit is within
//    80 m), or when you are BUSTED: stopped, with a police car within 16 m, for 2.5 s. Busted costs 12% of your cash.
//
// Nothing here runs during cut scenes or the intro.
import { createPursuer } from './pursuit.js';
import { createCarSounds } from './car-sounds.js';

const STAR_AT = [5, 25, 45, 65, 85]; // the heat for 1 to 5 stars
const UNITS = [0, 1, 2, 3, 4, 4];
const HEAT = { shot: 8, kill: 24, hit: 24, carjack: 16, theft: 6, robbery: 20 };
const WITNESS_PEOPLE = 45, WITNESS_COP = 55;

const CSS = `
.gm-wanted { position: fixed; right: 18px; top: 156px; z-index: 30; pointer-events: none; text-align: right; display: none;
  font: 800 24px/1 'JetBrains Mono', monospace; letter-spacing: .08em; text-shadow: 0 2px 6px rgba(0,0,0,.75); }
.gm-wanted.on { display: block; }
.gm-wanted .s { color: #ffd23f; }
.gm-wanted .e { color: rgba(255,255,255,.28); }
.gm-wanted small { display: block; margin-top: 4px; font: 700 11px/1 Inter, system-ui, sans-serif; letter-spacing: .18em; color: #fff; opacity: .85; }
.gm-wanted.search .s { animation: wantedFlash .7s steps(2, start) infinite; }
@keyframes wantedFlash { 50% { opacity: .15; } }
`;

export function createWanted({ scene, controllerManager, trafficSystem, voices = null, missionSystem = null, audioSystem = null }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const hud = document.createElement('div');
  hud.className = 'gm-wanted';
  document.body.append(hud);
  const sounds = createCarSounds({ audioSystem });

  let heat = 0, stars = 0, clock = 0, lastShot = -99;
  const reports = []; // crimes nobody saw: { t, x, z, heat }
  const units = []; // { p: pursuer, n }
  const history = []; // the route the player drove: a point every 4 m, newest last
  let farT = 0, bustT = 0, label = '', labelT = 0, spawnWait = 0;
  const tuning = { spawnBack: [170, 210] }; // how far back along your route a police car appears (metres; tests shorten it)

  const player = () => controllerManager.getActiveEntity();
  const cinematic = () => document.body.classList.contains('cinematic');
  const starsOf = (h) => STAR_AT.filter((a) => h >= a).length;

  function say(text, secs = 3.5) { missionSystem?.sub?.(text, secs); }
  function flash(text, secs = 4) { label = text; labelT = secs; }

  // Who saw it: a person within 45 m, or a police car within 55 m
  function witness(x, z) {
    for (const c of trafficSystem.cars || []) {
      if (!c.isPolice || c.driven || !(c.edge || c.parked)) continue;
      if (Math.hypot(c.x - x, c.z - z) < WITNESS_COP) return 'cop';
    }
    for (const q of trafficSystem.peds || []) {
      if (!q.placed || q.dead) continue;
      if (Math.hypot(q.x - x, q.z - z) < WITNESS_PEOPLE) return 'people';
    }
    return null;
  }

  /** A crime at (x, z): kind is 'shot', 'kill', 'hit', 'carjack', 'theft' or 'robbery' */
  function crime(kind, x, z) {
    if (cinematic()) return;
    if (missionSystem?.onJob) return; // the police stay out of the story's jobs (a job has its own pursuers and fails)
    let add = HEAT[kind] ?? 8;
    if (kind === 'shot') { // a burst of fire is one crime
      if (clock - lastShot < 4) return;
      lastShot = clock;
    }
    const w = witness(x, z);
    if (!w) {
      // nobody around: it gets reported anyway, in a few seconds
      reports.push({ t: clock + 6 + Math.random() * 4, x, z, heat: add * 0.7, kind });
      return;
    }
    if (w === 'cop') { add *= 1.6; heat = Math.max(heat, STAR_AT[1]); } // a police car saw it: two stars at least
    raise(add);
  }
  function raise(add) {
    const before = stars;
    heat = Math.min(100, heat + add);
    stars = starsOf(heat);
    if (stars > before) flash(stars > 1 ? 'WANTED' : 'POLICE ALERTED', 3);
  }

  // The player's route (the police follow it)
  function record() {
    const p = player().position, last = history[history.length - 1];
    if (!last) { history.push({ x: p.x, y: p.y, z: p.z }); return; }
    const d = Math.hypot(p.x - last.x, p.z - last.z);
    if (d > 80) { history.length = 0; history.push({ x: p.x, y: p.y, z: p.z }); return; } // a jump (teleport): a new route
    if (d >= 4) history.push({ x: p.x, y: p.y, z: p.z });
    if (history.length > 150) history.shift();
  }
  // a point on the route about `back` metres behind the player, as { index, along }
  function routePoint(back) {
    let along = 0;
    for (let i = history.length - 1; i > 0; i--) {
      along += Math.hypot(history[i].x - history[i - 1].x, history[i].z - history[i - 1].z);
      if (along >= back) return { index: i - 1, along };
    }
    return { index: 0, along };
  }

  function spawnUnit() {
    const want = tuning.spawnBack[0] + Math.random() * (tuning.spawnBack[1] - tuning.spawnBack[0]);
    const rp = routePoint(want);
    if (rp.along < 45 && spawnWait < 12) return false; // too close to be believable: wait for the player to move (up to 12 s)
    const seed = history.slice(rp.index);
    if (seed.length < 2) return false;
    const n = units.length;
    const p = createPursuer({ scene, controllerManager, traffic: () => trafficSystem });
    p.start({ x: seed[0].x, z: seed[0].z, file: 'police', color: 0xf4f6f8, speed: 28 + stars * 3 + Math.random() * 3, stopGap: 9 + n * 4, seed: seed.slice(1) });
    units.push({ p, n });
    return true;
  }
  function clearUnits() {
    for (const u of units) u.p.stop();
    units.length = 0;
    sounds.siren(0);
  }
  function reset() {
    heat = 0;
    stars = 0;
    reports.length = 0;
    farT = bustT = spawnWait = 0;
    clearUnits();
  }

  function busted() {
    const money = missionSystem?.money ?? 0;
    const fine = Math.min(3000, Math.max(money >= 100 ? 100 : 0, Math.round((money * 0.12) / 10) * 10));
    if (fine) missionSystem?.addMoney?.(-fine);
    reset();
    flash('BUSTED', 4);
    say(`BUSTED. The fine is $${fine.toLocaleString('en-AU')}. Behave yourself.`, 5);
  }

  // The police pedestrians' hits: a car of the player's that knocks someone down is a crime
  trafficSystem.setPedHitListener?.((ped, byPlayersCar) => { if (byPlayersCar) crime('hit', ped.x, ped.z); });

  let onJobWas = false;
  function update(dt) {
    // a job starting calls the police off: stars, reports and any cars already after you are gone
    const onJob = !!missionSystem?.onJob;
    if (onJob && !onJobWas && (stars > 0 || heat > 0 || units.length)) { reset(); say('The police have lost interest.', 3); }
    onJobWas = onJob;
    if (cinematic()) return;
    dt = Math.min(dt, 0.1);
    clock += dt;
    record();
    // reports come in
    for (let i = reports.length - 1; i >= 0; i--) {
      const r = reports[i];
      if (clock < r.t) continue;
      reports.splice(i, 1);
      voices?.event?.(r.kind === 'carjack' || r.kind === 'theft' ? 'carjack' : 'gunfire', { x: r.x, y: 0, z: r.z });
      say('Police have a report of trouble nearby.', 3.5);
      flash('REPORTED', 3);
      raise(r.heat);
    }
    // the units the level calls for
    const want = UNITS[stars];
    if (units.length < want) { spawnWait += dt; if (spawnUnit()) spawnWait = 0; } else spawnWait = 0;
    if (units.length > want) { const u = units.pop(); u.p.stop(); }
    let nearest = Infinity;
    for (const u of units) { u.p.update(dt); nearest = Math.min(nearest, u.p.distance()); }
    sounds.siren(units.length ? Math.max(0, Math.min(1, 1 - (nearest - 25) / 200)) : 0);

    if (stars > 0) {
      // lose them: well clear for long enough. Cool off slowly while no unit is close.
      farT = units.length && nearest > 230 ? farT + dt : 0;
      if (farT > 10) { reset(); flash('LOST THEM', 3); say('You lost the police.', 3); }
      else if (nearest > 80) { heat = Math.max(0, heat - 1.2 * dt); stars = starsOf(heat); if (!stars) { reset(); flash('', 0); say('The heat has died down.', 3); } }
      // busted: stopped with a police car beside you
      const e = player();
      const still = Math.abs(e.speed || 0) < 2.5;
      bustT = still && nearest < 16 ? bustT + dt : 0;
      if (bustT > 2.5) busted();
    } else bustT = 0;

    // the stars
    labelT = Math.max(0, labelT - dt);
    const on = stars > 0 || labelT > 0;
    hud.classList.toggle('on', on);
    hud.classList.toggle('search', stars > 0 && nearest > 90);
    if (on) {
      const s = '★'.repeat(stars), e2 = '★'.repeat(5 - stars);
      hud.innerHTML = `<span class="s">${s}</span><span class="e">${e2}</span>${labelT > 0 && label ? `<small>${label}</small>` : ''}`;
    }
  }

  return {
    update,
    crime,
    reset,
    tuning,
    /** The police cars' footprints (for the player on foot to bump into) */
    boxes() { return units.map((u) => u.p.box()).filter(Boolean); },
    get stars() { return stars; },
    get heat() { return heat; },
    /** For scripted checks */
    debug() { return { stars, heat: +heat.toFixed(1), units: units.length, nearest: units.length ? Math.min(...units.map((u) => u.p.distance())) : null, reports: reports.length, history: history.length, speeds: units.map((u) => +u.p.speed.toFixed(1)), pos: units.map((u) => [Math.round(u.p.position.x), Math.round(u.p.position.z)]), bust: +bustT.toFixed(1), info: units.map((u) => u.p.info) }; }
  };
}
