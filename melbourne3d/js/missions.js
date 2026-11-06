import * as THREE from 'three/webgpu';
import { getLocationLabel, ROADS, ALL_AVENUES, ALL_STREETS } from './city-config.js';
import { circuitPoint } from './race-track.js';
import { blockAt } from './city-config.js';

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
// streets meet (OSM names), { road: 'STREET' } the middle of a street, { circuit: u } the point a fraction u of the
// way round the Albert Park Grand Prix circuit from its start line (js/race-track.js), off: metres in towards the lake.
// Steps can also ask for: targets: n (take out the n people nearest the player, red beams over them), steal: 'pickup'
// (be driving a car of that kind taken from the traffic, or 'any'), talkTo: n (talk to n people), rob: n (hold up n
// people: aim and T).
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
    name: 'Hot Lap', giver: 'Vince', crew: 'Lygon Street Crew', start: { circuit: 0.006, off: 14 }, reward: 1500,
    cut: [['Vince', 'Every Sunday the Broady boys race their hotted-up cars round the Albert Park circuit.'],
      ['Vince', "Their best lap is three and a half minutes. Beat it and they'll know whose town this is."],
      ['You', 'One lap?'],
      ['Vince', 'One lap. Lakeside Drive, Aughtie Drive, back to the pits. Go.']],
    steps: [
      { text: 'Get in your car.', car: true },
      { text: 'Hot lap: round the circuit, clockwise. Up Aughtie Drive.', at: { circuit: 0.2 }, r: 16, car: true, time: 210, keepTime: true },
      { text: 'Hot lap: across the top on Albert Road Drive.', at: { circuit: 0.4 }, r: 16, car: true, keepTime: true },
      { text: 'Hot lap: down Lakeside Drive.', at: { circuit: 0.6 }, r: 16, car: true, keepTime: true },
      { text: 'Hot lap: through the bottom of the park.', at: { circuit: 0.8 }, r: 16, car: true, keepTime: true },
      { text: 'Hot lap: the pit straight. Bring it home across the line.', at: { circuit: 0 }, r: 16, car: true, keepTime: true }
    ]
  },
  {
    name: 'Chop Shop', giver: 'Vince', crew: 'Lygon Street Crew', start: { cross: ['FLINDERS LANE', 'ELIZABETH STREET'] }, reward: 2500,
    cut: [['Vince', 'The Broady boys love their utes. So do the buyers at my chop shop.'],
      ['Vince', "Nick one off the street. Walk up, pull the driver out, done. Then get it to North Melbourne."],
      ['You', 'Any ute?'],
      ['Vince', "Any ute. Just don't bring it back with bullet holes."]],
    steps: [
      { text: 'Steal a ute: walk up to one in the traffic and press F.', steal: 'pickup' },
      { text: 'Take the ute to the chop shop on Errol St, North Melbourne.', at: { cross: ['ERROL STREET', 'VICTORIA STREET'] }, r: 16, steal: 'pickup', time: 180 }
    ]
  },
  {
    name: 'Word on the Street', giver: 'Vince', crew: 'Lygon Street Crew', start: { cross: ['FLINDERS LANE', 'ELIZABETH STREET'] }, reward: 2000,
    cut: [['Vince', "Somebody's telling the Broadmeadows mob where our trucks go. I want to know who."],
      ['Vince', 'Go to Fitzroy and ask around. Locals talk if you ask nicely.']],
    steps: [
      { text: 'Get to Gertrude St, Fitzroy.', at: { cross: ['GERTRUDE STREET', 'NICHOLSON STREET'] }, r: 30 },
      { text: 'Ask around: talk to three locals (T next to someone).', talkTo: 3,
        say: 'A local: "The bloke you want drinks at the pub on Smith Street. Didn\'t hear it from me."' },
      { text: 'Check out the pub on Smith St.', at: { cross: ['SMITH STREET', 'GERTRUDE STREET'] }, r: 16, time: 90 }
    ]
  },
  {
    name: 'Westside Bikies', giver: 'Kaz', crew: 'Broadmeadows', start: { grid: ['Collins St', 'Spencer St'] }, reward: 3000,
    cut: [['Kaz', "So you're the one Vince keeps sending round. Forget the Lygon lot."],
      ['You', 'I go where the money is.'],
      ['Kaz', 'Good answer. The Westside Nomads have stashed their takings on a boat in Docklands. Get there before they move it.']],
    steps: [
      { text: 'Get to the Nomads\' boat off Harbour Esplanade, Docklands.', at: { cross: ['HARBOUR ESPLANADE', 'BOURKE STREET'] }, r: 16, time: 110 },
      { text: 'The Nomads are guarding it. Take them out.', targets: 3 },
      { text: 'Grab the bag. Stay in the marker on foot while you take it.', at: { cross: ['HARBOUR ESPLANADE', 'BOURKE STREET'] }, r: 8, wait: 4, foot: true },
      { text: 'Get the bag to Kaz\'s mechanic on Clarendon St, Southbank.', at: { cross: ['WHITEMAN STREET', 'CLARENDON STREET'] }, r: 16, car: true, time: 120 }
    ]
  },
  {
    // a sit-down over coffee in St Kilda (js/stkilda.js plays the scene at the café's front table)
    name: 'Short Black', giver: 'Kaz', crew: 'Broadmeadows', scene: 'cafe', start: { cafe: true }, reward: 3500,
    cut: [['Kaz', "Sit down. You're making the locals nervous."],
      ['Mick', 'Best flat white south of the river, and you lot want to talk shop.'],
      ['Kaz', 'This is Mick. Mick moves things. Watches, phones, whatever falls off a truck.'],
      ['Mick', "There's a bag in a locker at the end of St Kilda Pier. Twenty Rolexes. The Nomads' stash."],
      ['You', 'And the Nomads just leave it lying about?'],
      ['Mick', 'Till tonight. Grab it before they do, and we split it three ways.'],
      ['Kaz', "Bring it back here. And don't stop to look at the penguins."]],
    outro: ['Mick', "Good man. The coffee's on me."],
    steps: [
      { text: 'Get out to the end of St Kilda Pier, by the kiosk.', at: { pier: true }, r: 8 },
      { text: 'Find the locker and grab the bag. Stay in the marker on foot.', at: { pier: true }, r: 5, wait: 3, foot: true },
      { text: 'Get the watches back to the café on Acland Street before the Nomads catch on.', at: { cafe: true }, r: 7, time: 150 }
    ]
  },
  {
    name: 'Collection Day', giver: 'Kaz', crew: 'Broadmeadows', start: { grid: ['Collins St', 'Spencer St'] }, reward: 3500,
    cut: [['Kaz', 'Half the corner boys in the city owe us money and think we forgot.'],
      ['Kaz', 'Go to the Bourke Street Mall and remind three of them. Point the piece, ask for the wallet.']],
    steps: [
      { text: 'Get to the Bourke Street Mall.', at: { grid: ['Bourke St', 'Elizabeth St'] }, r: 40 },
      { text: 'Hold up three people: aim (right mouse) and press T next to them.', rob: 3 },
      { text: 'Lose yourself: get 300 m from the Mall.', away: 300, time: 60 }
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
    name: 'Clean Up', giver: 'Kaz', crew: 'Broadmeadows', start: { cross: ['RATHDOWNE STREET', 'QUEENSBERRY STREET'] }, reward: 5000,
    cut: [['Kaz', 'Three Nomads are dealing outside Southern Cross like they own the place.'],
      ['Kaz', "They don't. Go and make that clear."]],
    steps: [
      { text: 'Get to Southern Cross Station.', at: { grid: ['Bourke St', 'Spencer St'] }, r: 40, time: 150 },
      { text: 'Take out the three Nomads.', targets: 3 },
      { text: 'Get away: 400 m clear of the station.', away: 400, time: 45 }
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
.gm-pointer { position: fixed; left: 0; top: 0; z-index: 31; pointer-events: none; display: none; transform: translate(-50%, -50%);
  font: 800 13px/1 'JetBrains Mono', monospace; color: #fff; text-align: center; text-shadow: 0 1px 3px rgba(0,0,0,.9); }
.gm-pointer.on { display: block; }
.gm-pointer i { display: block; width: 0; height: 0; margin: 0 auto 4px; border-left: 11px solid transparent; border-right: 11px solid transparent;
  border-top: 18px solid var(--pc, #ff3d9a); filter: drop-shadow(0 2px 4px rgba(0,0,0,.6)); }
.gm-pointer span { display: inline-block; padding: 3px 7px; border-radius: 8px; background: rgba(10,12,16,.72); }
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
body.cutscene .gm-cut { bottom: max(10px, calc(11vh - 64px)); width: min(660px, 92vw); z-index: 61; background: rgba(0,0,0,.42); padding: 10px 16px 8px; }
body.cutscene .gm-pointer, body.cutscene .intro-skip, body.cutscene .gm-big { display: none !important; }
.gm-cut { position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%); width: min(760px, 94vw); z-index: 32; padding: 14px 18px 12px;
  border-radius: 14px; background: rgba(8, 10, 14, 0.9); color: #fff; font: 500 16px/1.45 Inter, system-ui, sans-serif; cursor: pointer;
  box-shadow: 0 10px 40px rgba(0,0,0,.45); }
.gm-cut b { display: block; color: #ff4fa3; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 4px; }
.gm-cut i { display: block; margin-top: 8px; color: rgba(255,255,255,.55); font-size: 12px; font-style: normal; text-align: right; }
.gm-sub { position: fixed; left: 50%; bottom: 200px; transform: translateX(-50%); z-index: 30; max-width: 80vw; color: #fff; text-align: center;
  font: 600 16px/1.4 Inter, system-ui, sans-serif; text-shadow: 0 2px 6px rgba(0,0,0,.85); pointer-events: none; }
`;

export function createMissionSystem({ scene, controllerManager, mapSystem, cameraSystem = null, voices = null, cast = null, stkilda = null }) {
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
  // A pointer to the marker that matters (the next job, or the objective): over it when it's on screen, pinned to
  // the screen's edge and turned towards it when it isn't
  const elPointer = el('gm-pointer');
  const elPointerArrow = document.createElement('i');
  const elPointerText = document.createElement('span');
  elPointer.append(elPointerArrow, elPointerText);
  const _pv = new THREE.Vector3();
  function point(target, colour) {
    const cam = cameraSystem?.camera;
    if (!target || !cam) { elPointer.classList.remove('on'); return; }
    const p = playerPos();
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    _pv.set(target.x, 3, target.z).applyMatrix4(cam.matrixWorldInverse);
    const behind = _pv.z > 0; // camera space looks down -z
    _pv.set(target.x, 3, target.z).project(cam);
    let nx = _pv.x, ny = _pv.y;
    if (behind) { nx = -nx; ny = -Math.abs(ny) - 1; }
    const W = window.innerWidth, H = window.innerHeight, M = 46;
    let sx = ((nx + 1) / 2) * W, sy = ((1 - ny) / 2) * H, angle = 0;
    const inside = !behind && sx > M && sx < W - M && sy > M + 60 && sy < H - M;
    if (!inside) {
      // pin to the edge, along the line from the centre of the screen
      const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
      const k = Math.min((W / 2 - M) / Math.max(1e-3, Math.abs(dx)), (H / 2 - M - 30) / Math.max(1e-3, Math.abs(dy)));
      sx = cx + dx * k; sy = cy + dy * k;
      angle = Math.atan2(dy, dx) * 180 / Math.PI - 90; // the arrow (pointing down at rest) turned towards the marker
    }
    elPointer.style.setProperty('--pc', colour);
    elPointer.style.left = `${sx}px`;
    elPointer.style.top = `${sy}px`;
    elPointerArrow.style.transform = `rotate(${angle}deg)`;
    elPointerText.textContent = d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
    elPointer.classList.add('on');
  }
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
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 140, 24, 1, true), mat); // tall enough to see over the buildings
    beam.position.y = 70;
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
  const targetMarkers = Array.from({ length: 4 }, () => makeMarker(0xff2a2a));

  // the player's game (js/gameplay.js) and the traffic (people, cars), attached once they exist
  let gameplay = null, traffic = null;
  const counters = { talk: 0, rob: 0 };
  const placeMarker = (m, p, r) => {
    m.position.set(p.x, 0.2, p.z);
    m.scale.set(r, 1, r);
    m.visible = true;
  };

  // Where a job's giver stands: on the footpath nearest the job's marker (not out in the road)
  const giverCache = new Map();
  function giverSpot(def) {
    if (giverCache.has(def)) return giverCache.get(def);
    const st = resolve(def.start);
    let best = { x: st.x, y: 0, z: st.z };
    if (!blockAt(st.x, st.z)) {
      search: for (let r = 2; r <= 24; r += 1.5) {
        for (let a = 0; a < 16; a++) {
          const x = st.x + Math.cos((a / 16) * Math.PI * 2) * r, z = st.z + Math.sin((a / 16) * Math.PI * 2) * r;
          const b = blockAt(x, z);
          if (b && !(b.park > 0.6)) { best = { x, y: 0.22, z }; break search; }
        }
      }
    } else best.y = 0.22;
    giverCache.set(def, best);
    return best;
  }

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
    } else if (at.cafe) {
      p = stkilda ? stkilda.marker() : { x: -985, z: 5470 };
    } else if (at.pier) {
      p = stkilda ? stkilda.pierEnd : { x: -1872, z: 5160 };
    } else if (typeof at.circuit === 'number') {
      // a point round the Albert Park Grand Prix circuit, moved `off` metres in towards the middle (a start marker
      // beside the track rather than on the racing line)
      p = circuitPoint(at.circuit);
      if (at.off) {
        const nx = -Math.cos(p.heading), nz = Math.sin(p.heading); // across the track, to the inside (it runs clockwise)
        p = { x: p.x + nx * at.off, z: p.z + nz * at.off };
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
  // The body language of a cut-scene line (an optional third entry in the line overrides it): anger at the war and
  // the betrayals, Vince sure of himself, Kaz cool, the player's questions with a shrug
  function moodOf(who, text, given) {
    if (given) return given;
    const t = text.toLowerCase();
    if (who === 'You') return /\?$/.test(text.trim()) ? 'shrug' : 'talk_cool';
    if (/war|torched|burnt|raided|singing|dog|bullet|gone now|loud|forgot/.test(t)) return 'talk_angry';
    if (/!|go\.|don't keep|bring it home|whose town/.test(t)) return 'talk_excited';
    return who === 'Kaz' ? 'talk_cool' : 'talk_assured';
  }
  // A job's cut scene is played out between the player and the giver (Vince or Kaz): letterbox bars, the player walks
  // up to the giver (on foot), and the camera cuts over the shoulder of whoever is listening to whoever is speaking
  function showCut(lines, done) {
    cut = { lines, k: 0, done, giver: null, scene: !!mission?.def?.scene };
    const def = mission?.def;
    if (def && cast && !def.scene) {
      const at = giverSpot(def);
      cut.giver = at;
      const person = controllerManager.entities.person;
      if (controllerManager.activeMode === 'person') {
        // stand 1.7 m in front of the giver, facing them
        const p = playerPos();
        const d = Math.hypot(p.x - at.x, p.z - at.z) || 1;
        person.position.set(at.x + ((p.x - at.x) / d) * 1.7, at.y ?? person.position.y, at.z + ((p.z - at.z) / d) * 1.7);
        person.heading = Math.atan2(at.x - person.position.x, at.z - person.position.z);
        person.speed = 0;
      }
    }
    document.body.classList.add('cinematic', 'cutscene');
    renderCut();
  }
  // who does what on the current line: the speaker in their mood, the listener listening (a nod on the last line)
  function cutActions() {
    const [who, text, given] = cut.lines[cut.k];
    const last = cut.k === cut.lines.length - 1;
    const mood = moodOf(who, text, given);
    if (who === 'You') return { player: mood, giver: /\?$/.test(text.trim()) ? 'listen' : 'nod' };
    return { player: last ? 'nod' : 'listen', giver: mood };
  }
  // The camera for the line being spoken (called after the follow camera each frame; see main.js)
  const _eye = new THREE.Vector3(), _look = new THREE.Vector3();
  function applyCamera(dt) {
    if (cut && cut.scene && stkilda && cameraSystem) {
      controllerManager.resetInput();
      const shot = stkilda.camera(cut.k, cut.lines[cut.k][0], dt);
      if (!shot) return false;
      const cam = cameraSystem.camera;
      cameraSystem.currentPos.copy(shot.eye);
      cameraSystem.currentLookAt.copy(shot.look);
      cam.position.copy(shot.eye);
      cam.lookAt(shot.look);
      cam.updateMatrixWorld();
      return true;
    }
    if (!cut || !cut.giver || !cameraSystem) return false;
    controllerManager.resetInput();
    const me = controllerManager.getActiveEntity().position, g = cut.giver;
    const onFoot = controllerManager.activeMode === 'person';
    const [who] = cut.lines[cut.k];
    const youSpeak = who === 'You';
    // from the listener's side, a little to the right of their shoulder, looking at the speaker's face
    const from = youSpeak ? g : me, to = youSpeak ? me : g;
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz) || 1;
    const fx = dx / d, fz = dz / d, rx = -fz, rz = fx;
    const headTo = (youSpeak ? (onFoot ? me.y : me.y + 0.2) : (g.y ?? 0)) + 1.62;
    const headFrom = (youSpeak ? (g.y ?? 0) : me.y) + 1.66;
    _eye.set(from.x - fx * 0.9 + rx * 0.55, headFrom + 0.08, from.z - fz * 0.9 + rz * 0.55);
    _look.set(to.x, headTo - 0.05, to.z);
    const cam = cameraSystem.camera;
    // a straight cut on each new line, then a slow push in (the shot keeps its own state: the follow camera would
    // pull it back every frame)
    if (cut.cutTo !== cut.k) {
      cut.cutTo = cut.k;
      cut.eye = _eye.clone().addScaledVector(new THREE.Vector3(fx, 0, fz), -0.35);
      cut.look = _look.clone();
    }
    cut.eye.lerp(_eye, Math.min(1, dt * 0.6));
    cut.look.lerp(_look, Math.min(1, dt * 3));
    cameraSystem.currentPos.copy(cut.eye);
    cameraSystem.currentLookAt.copy(cut.look);
    cam.position.copy(cut.eye);
    cam.lookAt(cut.look);
    cam.updateMatrixWorld();
    return true;
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
    // the line spoken, when it has a recording (the panel already shows the words)
    voices?.sayText(line, { subtitle: false });
  }
  function advanceCut(skip = false) {
    if (!cut) return;
    cut.k++;
    if (skip || cut.k >= cut.lines.length) {
      const done = cut.done, cut0 = cut;
      cut = null;
      elCut.hidden = true;
      document.body.classList.remove('cinematic', 'cutscene');
      cast?.setPlayerAction(null);
      if (cut0.scene) stkilda?.standUp();
      voices?.stopStory();
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
    m.count0 = { talk: counters.talk, rob: counters.rob };
    m.targets = null;
    if (s.targets && traffic) {
      // the people nearest the player become the targets
      const p = playerPos();
      m.targets = traffic.peds.filter((q) => q.placed && !q.dead)
        .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, s.targets);
    }
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
    if (def.outro) { voices?.sayText(def.outro[1]); sub(`${def.outro[0]}: ${def.outro[1]}`, 5); }
    save.money += def.reward;
    save.progress = Math.max(save.progress, mission.i + 1);
    persist();
    showMoney();
    mission = null;
    elObjective.textContent = '';
    elTimer.hidden = true;
    goalMarker.visible = false;
    for (const t of targetMarkers) t.visible = false;
    if (mapSystem) mapSystem.waypoint = null;
    if (save.progress >= MISSIONS.length) {
      big('MELBOURNE IS YOURS', '#ffd23f', 5, `+$${def.reward.toLocaleString('en-AU')}`);
      sub("The war is over and you're the last one standing. The city is yours to roam.", 7);
    } else big('MISSION PASSED', '#ffd23f', 3.5, `+$${def.reward.toLocaleString('en-AU')}`);
    // a cheer on passing a job (on foot)
    if (cast && controllerManager.activeMode === 'person') { cast.setPlayerAction('cheer'); setTimeout(() => cast.setPlayerAction(null), 3500); }
  }
  function fail(why) {
    mission = null;
    elObjective.textContent = '';
    elTimer.hidden = true;
    goalMarker.visible = false;
    for (const t of targetMarkers) t.visible = false;
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
    // the job's giver (Vince or Kaz) waits at the next job's marker and talks through its cut scene
    if (cast) {
      const def = mission ? mission.def : MISSIONS[save.progress];
      const inScene = !!(def && def.scene);
      if (stkilda) {
        // the café: Kaz and Mick at their table before the job (and when you bring the watches back), all three in it
        const st = def && inScene ? resolve(def.start) : null;
        const near = st && Math.hypot(p.x - st.x, p.z - st.z) < 140;
        const returning = mission && inScene && mission.si === def.steps.length - 1;
        stkilda.update(dt, inScene && cut ? 'cut' : inScene && near && (!mission || returning) ? 'waiting' : 'off', cut ? cut.lines[cut.k] : null);
      }
      const show = def && !inScene && (!mission || cut) && (cut || !document.body.classList.contains('cinematic'));
      if (inScene) cast.setGiver(null);
      if (show) {
        const at = giverSpot(def);
        const acts = cut ? cutActions() : null;
        if (acts && acts.player !== cut.playerAct) { cut.playerAct = acts.player; cast.setPlayerAction(acts.player); }
        cast.setGiver(def.giver, at, p, acts && acts.giver, dt);
      } else cast.setGiver(null);
    }
    // the pointer: the objective's marker, or the nearest target, or the next job's
    if (cut || document.body.classList.contains('cinematic')) point(null);
    else if (mission && goalMarker.visible) point(goalMarker.position, '#ffd23f');
    else if (mission && targetMarkers.some((t) => t.visible)) {
      const t = targetMarkers.filter((q) => q.visible).sort((a, b) => Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z))[0];
      point(t.position, '#ff2a2a');
    } else if (!mission && startMarker.visible) point(startMarker.position, '#ff3d9a');
    else point(null);

    if (!mission) {
      // the next job's marker
      if (save.progress < MISSIONS.length) {
        const def = MISSIONS[save.progress];
        const st = resolve(def.start);
        placeMarker(startMarker, st, 5);
        const d = Math.hypot(p.x - st.x, p.z - st.z);
        if (!cut && d < 8) start(save.progress);
        else if (!cut) {
          // say where the next job is, and put it on the map
          const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
          // world z is grid south and the grid is turned ~19° off north
          const bearing = (Math.atan2(st.x - p.x, -(st.z - p.z)) * 180) / Math.PI - 19.18;
          const dir = dirs[(Math.round((((bearing % 360) + 360) % 360) / 45)) % 8];
          const dist = d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 10) * 10} m`;
          const text = `Next job: ${def.name} (${def.giver}). Go to the pink marker, ${dist} ${dir}.`;
          if (elObjective.textContent !== text) elObjective.textContent = text;
          if (mapSystem && (!mapSystem.waypoint || mapSystem.waypoint.job !== save.progress)) mapSystem.waypoint = { x: st.x, z: st.z, name: def.name, job: save.progress };
        }
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
    const stealOk = !s.steal || (gameplay && gameplay.driving && (s.steal === 'any' || gameplay.driving.bodyType === s.steal));
    if (s.targets && m.targets) {
      const left = m.targets.filter((q) => !q.dead);
      targetMarkers.forEach((tm, i) => {
        const q = left[i];
        if (q) placeMarker(tm, { x: q.x, z: q.z }, 0.8);
        else tm.visible = false;
      });
      if (left[0] && mapSystem) mapSystem.waypoint = { x: left[0].x, z: left[0].z, name: 'Target' };
      elObjective.textContent = `${s.text} ${left.length} left.`;
      done = left.length === 0;
      if (done) for (const tm of targetMarkers) tm.visible = false;
    } else if (s.talkTo) {
      const n = counters.talk - m.count0.talk;
      elObjective.textContent = `${s.text} ${n} / ${s.talkTo}`;
      done = n >= s.talkTo;
    } else if (s.rob) {
      const n = counters.rob - m.count0.rob;
      elObjective.textContent = `${s.text} ${n} / ${s.rob}`;
      done = n >= s.rob;
    } else if (s.steal && !s.at) {
      done = stealOk;
    } else if (s.at && s.steal && !stealOk) {
      elObjective.textContent = `${s.text} (You need the ute.)`;
    } else if (s.at) {
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
    sub,
    /** gameplay.js and the traffic, once they exist; gameplay reports talks and hold-ups here */
    attach(g, t) { gameplay = g; traffic = t; },
    onTalk(robbed) { if (robbed) counters.rob++; else counters.talk++; },
    addMoney(n) { save.money += n; persist(); showMoney(); },
    missions: MISSIONS,
    get progress() { return save.progress; },
    get money() { return save.money; },
    start,
    applyCamera,
    get inCut() { return !!cut; },
    /** Start a job now, wherever the player is (the Jobs list) */
    startNow(i) {
      if (mission) fail('You walked off the job.');
      save.progress = i;
      persist();
      start(i);
      return resolve(MISSIONS[i].start);
    },
    /** Jump to a job: its start marker becomes the next one (the pause/jobs list) */
    jumpTo(i) {
      if (mission) fail('You walked off the job.');
      save.progress = i;
      persist();
      return resolve(MISSIONS[i].start);
    }
  };
}
