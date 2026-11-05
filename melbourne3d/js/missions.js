import * as THREE from 'three/webgpu';
import { getLocationLabel, ROADS, ALL_AVENUES, ALL_STREETS } from './city-config.js';

// GTA Melbourne's story, moved across from the original game (../index.html) onto the new engine's real-scale map.
//
// Melbourne, 2004. The underworld war between the Lygon Street Crew and the Broadmeadows mob is in its sixth year, and
// Taskforce Kestrel is closing in. You start out running jobs for Vince (Lygon Street Crew) and end up working for Kaz
// (Broadmeadows). The original jobs ranged over the whole metro area; this map covers the CBD and the inner suburbs, so
// each job is set where it fits here. The driving jobs play as in the original; the ones that needed guns, gangs and
// police (Westside Bikies, The Informant, Tobacco Wars, the cash van) are driving jobs for now, until those systems
// move across too.
//
// Places: { grid: ['Flinders St', 'Spencer St'] } a Hoddle Grid corner, { cross: ['STREET A', 'STREET B'] } where two
// streets meet (OSM names), { road: 'STREET' } the middle of a street.
// A job's steps: { text, at: place, r: metres, car: true (must be driving), time: seconds,
// wait: seconds standing in the marker, away: metres to get clear of the last marker, cut: [[who, line], ...] }

const MISSIONS = [
  {
    name: 'Laneway Hustle', giver: 'Vince', crew: 'Lygon Street Crew', start: { cross: ['FLINDERS LANE', 'ELIZABETH STREET'] }, reward: 1000,
    cut: [['Vince', "There you are. Six years this war's been going, and the Broadmeadows mob reckon they own the town now."],
      ['You', 'So what do you need?'],
      ['Vince', "Davo needs a lift. The trams won't cut it. Get your car and don't hang about."]],
    steps: [
      { text: 'Get in your car (the CAR button, or switch with the mode buttons).', car: true },
      { text: 'Pick up Davo outside the pub on Wellington St, Collingwood.', at: { cross: ['WELLINGTON STREET', 'GIPPS STREET'] }, r: 14, car: true,
        say: 'Davo: "West Melbourne, mate. The Broady boys are cutting in on our patch. Step on it."' },
      { text: 'Get Davo to the lock-up in West Melbourne before the Broadmeadows mob gets there first.', at: { cross: ['SPENCER STREET', 'RODEN STREET'] }, r: 16, car: true, time: 150 }
    ]
  },
  {
    name: 'Hot Lap', giver: 'Vince', crew: 'Lygon Street Crew', start: { grid: ['Collins St', 'King St'] }, reward: 1500,
    cut: [['Vince', "Before I trust you with the real work, show me you can handle the grid."],
      ['Vince', 'One lap of the city: Spencer, La Trobe, Spring and back down Flinders. Two minutes. Go.']],
    steps: [
      { text: 'Get in your car.', car: true },
      { text: 'Lap of the grid: Flinders St & Spencer St.', at: { grid: ['Flinders St', 'Spencer St'] }, r: 16, car: true, time: 120, keepTime: true },
      { text: 'Lap of the grid: La Trobe St & Spencer St.', at: { grid: ['La Trobe St', 'Spencer St'] }, r: 16, car: true, keepTime: true },
      { text: 'Lap of the grid: La Trobe St & Spring St.', at: { grid: ['La Trobe St', 'Spring St'] }, r: 16, car: true, keepTime: true },
      { text: 'Lap of the grid: Flinders St & Spring St. Bring it home.', at: { grid: ['Flinders St', 'Spring St'] }, r: 16, car: true, keepTime: true }
    ]
  },
  {
    name: 'Westside Bikies', giver: 'Kaz', crew: 'Broadmeadows', start: { grid: ['Collins St', 'Spencer St'] }, reward: 3000,
    cut: [['Kaz', "So you're the one Vince keeps sending round. Forget the Lygon lot."],
      ['You', 'I go where the money is.'],
      ['Kaz', 'Good answer. The Westside Nomads have stashed their takings on a boat in Docklands. Get there before they move it.']],
    steps: [
      { text: 'Get to the Nomads\' boat off Harbour Esplanade, Docklands.', at: { cross: ['HARBOUR ESPLANADE', 'BOURKE STREET'] }, r: 16, time: 110 },
      { text: 'Grab the bag. Stay in the marker on foot while you take it.', at: { cross: ['HARBOUR ESPLANADE', 'BOURKE STREET'] }, r: 8, wait: 4, foot: true },
      { text: 'Get the bag to Kaz\'s mechanic on Clarendon St, Southbank.', at: { cross: ['WHITEMAN STREET', 'CLARENDON STREET'] }, r: 16, car: true, time: 120 }
    ]
  },
  {
    name: 'The Informant', giver: 'Kaz', crew: 'Broadmeadows', start: { cross: ['RATHDOWNE STREET', 'QUEENSBERRY STREET'] }, reward: 4000,
    cut: [['Kaz', 'Some dog in Carlton is singing to Taskforce Kestrel. He records it all on tape.'],
      ['Kaz', 'Two drops: the phone box by the Exhibition Building, and his flat in East Melbourne. Get the tapes before Kestrel does.']],
    steps: [
      { text: 'Get the first tape from the phone box on Nicholson St, by the Exhibition Building.', at: { cross: ['NICHOLSON STREET', 'CARLTON STREET'] }, r: 12, time: 150, keepTime: true },
      { text: 'Get the other tape from the informant\'s flat on Clarendon St, East Melbourne.', at: { cross: ['CLARENDON STREET', 'GIPPS STREET'] }, r: 12, keepTime: true },
      { text: 'Burn the tapes at the lock-up in Collingwood. Kestrel is onto you.', at: { cross: ['WELLINGTON STREET', 'GIPPS STREET'] }, r: 14, time: 90 }
    ]
  },
  {
    name: 'Tobacco Wars', giver: 'Kaz', crew: 'Broadmeadows', start: { grid: ['Flinders St', 'King St'] }, reward: 6000,
    cut: [['Kaz', 'You heard about the tobacco war? Every chop shop in town is getting torched.'],
      ['You', 'Not my fight.'],
      ['Kaz', "It is now. The Nomads burnt down our shop last night. Their stock's in a warehouse at South Wharf."],
      ['Kaz', 'Set the charge, then get well clear. Make it loud.']],
    steps: [
      { text: 'Get to the Nomads\' warehouse on South Wharf Drive.', at: { road: 'SOUTH WHARF DRIVE' }, r: 16, time: 90 },
      { text: 'Set the charge: stay in the marker on foot.', at: { road: 'SOUTH WHARF DRIVE' }, r: 7, wait: 5, foot: true },
      { text: 'It\'s going to blow! Get 250 m clear.', away: 250, time: 25 }
    ]
  },
  {
    name: 'Harbour Run', giver: 'Kaz', crew: 'Broadmeadows', start: { grid: ['Flinders St', 'Queen St'] }, reward: 10000,
    cut: [['Kaz', 'Taskforce Kestrel raided the Brighton house. Both crews want you gone now.'],
      ['Kaz', "There's a boat waiting off Harbour Esplanade. Be on it in two and a half minutes, or don't bother."]],
    steps: [
      { text: 'Get to the boat off Harbour Esplanade, Docklands!', at: { cross: ['HARBOUR ESPLANADE', 'COLLINS STREET'] }, r: 14, time: 150 }
    ]
  }
];

const SAVE_KEY = 'gta-melbourne3d-save-v1';

const CSS = `
.gm-objective { position: fixed; left: 50%; top: 84px; transform: translateX(-50%); max-width: min(720px, 92vw); z-index: 30;
  padding: 10px 16px; border-radius: 12px; background: rgba(10, 12, 16, 0.78); color: #fff; font: 600 15px/1.35 Inter, system-ui, sans-serif;
  text-align: center; box-shadow: 0 8px 30px rgba(0,0,0,.35); pointer-events: none; }
.gm-objective:empty { display: none; }
.gm-timer { position: fixed; right: 18px; top: 84px; z-index: 30; padding: 6px 12px; border-radius: 10px; background: rgba(10,12,16,.78);
  color: #ffd23f; font: 800 22px/1 'JetBrains Mono', monospace; pointer-events: none; }
.gm-timer[hidden], .gm-cut[hidden] { display: none; }
.gm-money { position: fixed; right: 18px; top: 124px; z-index: 30; color: #8ee07a; font: 800 22px/1 'JetBrains Mono', monospace;
  text-shadow: 0 2px 6px rgba(0,0,0,.7); pointer-events: none; }
.gm-big { position: fixed; left: 50%; top: 34%; transform: translate(-50%, -50%); z-index: 31; text-align: center; pointer-events: none;
  font: 900 clamp(30px, 6vw, 64px)/1 Inter, system-ui, sans-serif; letter-spacing: .04em; text-shadow: 0 4px 18px rgba(0,0,0,.7); transition: opacity .4s; }
.gm-big small { display: block; margin-top: 10px; font-size: .42em; color: #8ee07a; }
.gm-cut { position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%); width: min(760px, 94vw); z-index: 32; padding: 14px 18px 12px;
  border-radius: 14px; background: rgba(8, 10, 14, 0.9); color: #fff; font: 500 16px/1.45 Inter, system-ui, sans-serif; cursor: pointer;
  box-shadow: 0 10px 40px rgba(0,0,0,.45); }
.gm-cut b { display: block; color: #ff4fa3; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 4px; }
.gm-cut i { display: block; margin-top: 8px; color: rgba(255,255,255,.55); font-size: 12px; font-style: normal; text-align: right; }
.gm-sub { position: fixed; left: 50%; bottom: 200px; transform: translateX(-50%); z-index: 30; max-width: 80vw; color: #fff; text-align: center;
  font: 600 16px/1.4 Inter, system-ui, sans-serif; text-shadow: 0 2px 6px rgba(0,0,0,.85); pointer-events: none; }
`;

export function createMissionSystem({ scene, controllerManager, mapSystem }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const el = (cls, parent = document.body) => {
    const e = document.createElement('div');
    e.className = cls;
    parent.append(e);
    return e;
  };
  const elObjective = el('gm-objective');
  const elTimer = el('gm-timer');
  elTimer.hidden = true;
  const elMoney = el('gm-money');
  const elBig = el('gm-big');
  const elSub = el('gm-sub');
  const elCut = el('gm-cut');
  elCut.hidden = true;

  // Save: cash and how far through the story
  let save = { money: 500, progress: 0 };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s.money === 'number') save = s;
  } catch { /* storage unavailable */ }
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage unavailable */ } };
  const showMoney = () => { elMoney.textContent = `$${save.money.toLocaleString('en-AU')}`; };
  showMoney();

  // Markers: a glowing ring with a beam of light (pink: a job to start, yellow: the objective)
  function makeMarker(colorHex) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicNodeMaterial({ color: colorHex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40, 24, 1, true), mat);
    beam.position.y = 20;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.4;
    g.add(beam, ring);
    g.visible = false;
    g.renderOrder = 10;
    scene.add(g);
    return g;
  }
  const startMarker = makeMarker(0xff3d9a);
  const goalMarker = makeMarker(0xffd23f);
  const placeMarker = (m, p, r) => {
    m.position.set(p.x, 0.2, p.z);
    m.scale.set(r, 1, r);
    m.visible = true;
  };

  const placeCache = new Map();
  function resolve(at) {
    if (placeCache.has(at)) return placeCache.get(at);
    let p = null;
    if (at.grid) {
      const st = ALL_STREETS.find((s) => s.name === at.grid[0]), av = ALL_AVENUES.find((a) => a.name === at.grid[1]);
      if (st && av) p = { x: av.x, z: st.z };
    } else if (at.cross) {
      const A = ROADS.filter((r) => r.raw === at.cross[0]), B = ROADS.filter((r) => r.raw === at.cross[1]);
      let best = Infinity;
      for (const r of A) for (const a of r.pts) for (const q of B) for (const b of q.pts) {
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < best) { best = d; p = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }; }
      }
    } else if (at.road) {
      const pts = ROADS.filter((r) => r.raw === at.road).flatMap((r) => r.pts);
      if (pts.length) p = pts[pts.length >> 1];
    } else if (typeof at.x === 'number') p = at;
    if (!p) { console.warn('[missions] no such place', at); p = { x: 0, z: 0 }; }
    placeCache.set(at, p);
    return p;
  }
  const playerPos = () => controllerManager.getActiveEntity().position;
  const driving = () => controllerManager.activeMode === 'car';

  let mission = null; // { def, i, si, timer, data }
  let cut = null; // { lines, k, done }
  let bigT = 0, subT = 0;

  function big(text, color, secs, small = '') {
    elBig.innerHTML = '';
    elBig.textContent = text;
    elBig.style.color = color;
    if (small) {
      const s = document.createElement('small');
      s.textContent = small;
      elBig.append(s);
    }
    elBig.style.opacity = '1';
    bigT = secs;
  }
  function sub(text, secs = 4) {
    elSub.textContent = text;
    subT = secs;
  }
  function showCut(lines, done) {
    cut = { lines, k: 0, done };
    renderCut();
  }
  function renderCut() {
    const [who, line] = cut.lines[cut.k];
    elCut.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = who;
    const t = document.createElement('span');
    t.textContent = line;
    const hint = document.createElement('i');
    hint.textContent = 'Enter or click: next · Esc: skip';
    elCut.append(b, t, hint);
    elCut.hidden = false;
  }
  function advanceCut(skip = false) {
    if (!cut) return;
    cut.k++;
    if (skip || cut.k >= cut.lines.length) {
      const done = cut.done;
      cut = null;
      elCut.hidden = true;
      done();
    } else renderCut();
  }
  elCut.addEventListener('click', () => advanceCut());
  window.addEventListener('keydown', (e) => {
    if (!cut) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); advanceCut(); }
    if (e.code === 'Escape') { e.preventDefault(); advanceCut(true); }
  });

  function start(i) {
    const def = MISSIONS[i];
    if (!def) return;
    mission = { def, i, si: -1, timer: 0, data: {} };
    startMarker.visible = false;
    big(def.name, '#ff4fa3', 2.5, `${def.giver} · ${def.crew}`);
    const go = () => { if (mission && mission.def === def) nextStep(); };
    if (def.cut) showCut(def.cut, go);
    else go();
  }
  function nextStep() {
    const m = mission;
    m.si++;
    if (m.si >= m.def.steps.length) return pass();
    const s = m.def.steps[m.si];
    if (s.time && !(s.keepTime && m.timer > 0)) m.timer = s.time;
    if (!s.time && !s.keepTime) m.timer = 0;
    m.wait = 0;
    m.from = { x: playerPos().x, z: playerPos().z };
    elObjective.textContent = s.text;
    if (s.at) {
      const p = resolve(s.at);
      placeMarker(goalMarker, p, s.r);
      if (mapSystem) mapSystem.waypoint = { x: p.x, z: p.z, name: getLocationLabel(p.x, p.z) };
    } else {
      goalMarker.visible = false;
    }
  }
  function pass() {
    const def = mission.def;
    save.money += def.reward;
    save.progress = Math.max(save.progress, mission.i + 1);
    persist();
    showMoney();
    mission = null;
    elObjective.textContent = '';
    elTimer.hidden = true;
    goalMarker.visible = false;
    if (mapSystem) mapSystem.waypoint = null;
    if (save.progress >= MISSIONS.length) {
      big('MELBOURNE IS YOURS', '#ffd23f', 5, `+$${def.reward.toLocaleString('en-AU')}`);
      sub("The war is over and you're the last one standing. The city is yours to roam.", 7);
    } else big('MISSION PASSED', '#ffd23f', 3.5, `+$${def.reward.toLocaleString('en-AU')}`);
  }
  function fail(why) {
    mission = null;
    elObjective.textContent = '';
    elTimer.hidden = true;
    goalMarker.visible = false;
    if (mapSystem) mapSystem.waypoint = null;
    big('MISSION FAILED', '#e5383b', 3);
    sub(why, 4);
  }

  function update(dt, elapsed) {
    if (bigT > 0) { bigT -= dt; if (bigT <= 0) elBig.style.opacity = '0'; }
    if (subT > 0) { subT -= dt; if (subT <= 0) elSub.textContent = ''; }
    // markers pulse
    const pulse = 0.45 + Math.sin(elapsed * 3) * 0.12;
    startMarker.children[0].material.opacity = pulse;
    goalMarker.children[0].material.opacity = pulse;
    const p = playerPos();

    if (!mission) {
      // the next job's marker
      if (save.progress < MISSIONS.length) {
        const st = resolve(MISSIONS[save.progress].start);
        placeMarker(startMarker, st, 5);
        if (!cut && Math.hypot(p.x - st.x, p.z - st.z) < 5.5) start(save.progress);
      } else startMarker.visible = false;
      return;
    }
    if (cut || mission.si < 0) return;
    const m = mission, s = m.def.steps[m.si];
    if (m.timer > 0) {
      m.timer -= dt;
      elTimer.hidden = false;
      const t = Math.max(0, Math.ceil(m.timer));
      elTimer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      if (m.timer <= 0) return fail('Out of time.');
    } else elTimer.hidden = true;

    let done = false;
    if (s.at) {
      const g = resolve(s.at);
      const inside = Math.hypot(p.x - g.x, p.z - g.z) < s.r;
      const modeOk = (!s.car || driving()) && (!s.foot || controllerManager.activeMode === 'person');
      if (inside && !modeOk && s.foot) elObjective.textContent = `${s.text} (Get out of the car first.)`;
      if (inside && modeOk) {
        if (s.wait) {
          m.wait += dt;
          elObjective.textContent = `${s.text} ${Math.max(0, s.wait - m.wait).toFixed(1)} s`;
          done = m.wait >= s.wait;
        } else done = true;
      } else if (s.wait) m.wait = 0;
    } else if (s.away) {
      done = Math.hypot(p.x - m.from.x, p.z - m.from.z) > s.away;
    } else if (s.car) {
      done = driving();
    }
    if (done) {
      if (s.say) sub(s.say, 5);
      nextStep();
    }
  }

  return {
    update,
    missions: MISSIONS,
    get progress() { return save.progress; },
    get money() { return save.money; },
    start,
    /** Jump to a job: its start marker becomes the next one (the pause/jobs list) */
    jumpTo(i) {
      if (mission) fail('You walked off the job.');
      save.progress = i;
      persist();
      return resolve(MISSIONS[i].start);
    }
  };
}
