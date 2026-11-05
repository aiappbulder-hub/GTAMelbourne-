import * as THREE from 'three/webgpu';

// The opening: wide shots of Melbourne at golden hour, letterboxed, with Trent setting up the story over them and Vince
// on the phone, ending on the player at the first job's marker. It plays the first time the game starts (and with
// ?intro, or "Watch the intro" in the teleport menu); Esc, Enter or Skip end it.
//
// Each shot moves the camera from `from` to `to` (eye) while looking from `lookFrom` to `lookTo`, over `secs`, eased.
// World metres (x = east along Collins St, z = south). 'sun' as a look target points the camera into the sunset.

const KEY = 'gta-melbourne3d-intro-seen';

const SHOTS = [
  { // the skyline from over Yarra Park and the MCG
    from: [1550, 260, 1250], to: [1150, 190, 930], lookFrom: [-150, 70, -60], lookTo: [-200, 60, -80], secs: 7.5,
    lines: [['Trent', 'Melbourne. Four seasons in one day, and somebody fighting over every one of them.']]
  },
  { // Flinders Street Station from over the Yarra
    from: [-30, 42, 390], to: [10, 34, 360], lookFrom: [-180, 16, 262], lookTo: [-165, 14, 262], secs: 7,
    lines: [['Trent', "It's 2004. I've been gone three years. The city's grown up. So have the crooks."]]
  },
  { // Lygon Street, Carlton
    from: [700, 120, -880], to: [575, 85, -1060], lookFrom: [470, 0, -1420], lookTo: [480, 0, -1430], secs: 7,
    lines: [['Trent', 'The Lygon Street Crew run Carlton and Fitzroy. Old families, old rules, good coffee.']]
  },
  { // Docklands, into the sunset
    from: [-1750, 32, -180], to: [-1900, 38, -360], lookFrom: 'sun', lookTo: 'sun', secs: 7.5,
    lines: [['Trent', 'Out west, the Broadmeadows mob want the lot. Six years of war: chop shops torched, tobacco trucks gone.']]
  },
  { // up at Eureka from the river
    from: [-260, 5, 430], to: [-300, 7, 455], lookFrom: [-381, 120, 597], lookTo: [-381, 230, 597], secs: 6.5,
    lines: [['Trent', "And now Taskforce Kestrel, the cops' shiny new toy, is closing in on all of them."]]
  },
  { // down Swanston Street to the station
    from: [-5, 7, -560], to: [-5, 6, -330], lookFrom: [-5, 16, 262], lookTo: [-5, 14, 262], secs: 9,
    lines: [['Vince (phone)', "Trent. Heard you were back. I've got work, if you want it."],
      ['Vince (phone)', "Flinders Lane, off Elizabeth Street. Don't keep me waiting."],
      ['Trent', 'Fresh off the plane and already working. Typical.']]
  },
  { // down onto the player at the job
    from: 'player-high', to: 'player-chase', lookFrom: 'player', lookTo: 'player', secs: 5.5, title: true,
    lines: [['', 'Walk to the pink marker to meet Vince.']]
  }
];

const CSS = `
.intro-bar { position: fixed; left: 0; right: 0; height: 11vh; background: #000; z-index: 60; transition: transform .8s ease; pointer-events: none; }
.intro-bar.top { top: 0; transform: translateY(-100%); }
.intro-bar.bottom { bottom: 0; transform: translateY(100%); }
body.cinematic .intro-bar { transform: none; }
body.cinematic .hud, body.cinematic .gm-objective, body.cinematic .gm-timer, body.cinematic .gm-money, body.cinematic .gp-prompt,
body.cinematic .gp-weapon, body.cinematic .gp-fire, body.cinematic .gp-cross, body.cinematic [class*="touch-"] { visibility: hidden !important; }
.intro-fade { position: fixed; inset: 0; background: #000; opacity: 0; z-index: 59; pointer-events: none; transition: opacity .45s ease; }
.intro-line { position: fixed; left: 50%; bottom: calc(11vh + 18px); transform: translateX(-50%); width: min(820px, 92vw); z-index: 61; text-align: center;
  color: #fff; font: 500 clamp(15px, 2.1vw, 20px)/1.45 Inter, system-ui, sans-serif; text-shadow: 0 2px 8px rgba(0,0,0,.9); pointer-events: none;
  transition: opacity .35s; }
.intro-line b { display: block; color: #ffcf6e; font-size: .7em; letter-spacing: .14em; text-transform: uppercase; margin-bottom: 2px; }
.intro-title { position: fixed; left: 50%; top: 38%; transform: translate(-50%, -50%); z-index: 61; text-align: center; color: #fff; pointer-events: none;
  font: 900 clamp(38px, 8vw, 92px)/1 Inter, system-ui, sans-serif; letter-spacing: .06em; text-shadow: 0 6px 30px rgba(0,0,0,.6); opacity: 0; transition: opacity 1s; }
.intro-title small { display: block; margin-top: 10px; font-size: .2em; letter-spacing: .3em; color: #ffcf6e; }
.intro-skip { position: fixed; right: 18px; top: calc(11vh + 12px); z-index: 62; padding: 7px 14px; border: 1px solid rgba(255,255,255,.5); border-radius: 999px;
  background: rgba(0,0,0,.45); color: #fff; font: 600 13px/1 Inter, system-ui, sans-serif; cursor: pointer; display: none; }
body.cinematic .intro-skip { display: block; }
`;

const ease = (t) => t * t * (3 - 2 * t);

export function createIntro({ cameraSystem, controllerManager, lightingSystem, selectTime, selectMode, missionSystem, teleportTo }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const div = (cls) => { const e = document.createElement('div'); e.className = cls; document.body.append(e); return e; };
  div('intro-bar top');
  div('intro-bar bottom');
  const fade = div('intro-fade');
  const line = div('intro-line');
  const title = div('intro-title');
  title.textContent = 'GTA MELBOURNE';
  const sm = document.createElement('small');
  sm.textContent = 'MELBOURNE · 2004';
  title.append(sm);
  const skip = document.createElement('button');
  skip.className = 'intro-skip';
  skip.type = 'button';
  skip.textContent = 'Skip ›';
  document.body.append(skip);

  let active = false, shot = 0, t = 0, lineK = -1;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), L1 = new THREE.Vector3(), L2 = new THREE.Vector3();
  const person = controllerManager.entities.person;

  function resolve(v, out, eye) {
    if (Array.isArray(v)) return out.set(v[0], v[1], v[2]);
    const p = person.position;
    if (v === 'player') return out.set(p.x, p.y + 1.4, p.z);
    if (v === 'player-high') return out.set(p.x + 60, 70, p.z + 90);
    if (v === 'player-chase') return out.set(p.x - Math.sin(person.heading) * 4.6, p.y + 2.1, p.z - Math.cos(person.heading) * 4.6);
    if (v === 'sun') {
      // into the low sun: the light's direction, flattened, from the eye
      const s = lightingSystem.sunLight.position;
      const h = Math.hypot(s.x, s.z) || 1;
      return out.set(eye.x + (s.x / h) * 600, eye.y + 25, eye.z + (s.z / h) * 600);
    }
    return out.set(0, 0, 0);
  }

  function start() {
    active = true;
    shot = 0;
    t = 0;
    lineK = -1;
    selectTime('golden');
    // the story starts on foot at the first job, unless it's further along
    if (missionSystem && missionSystem.progress === 0) {
      selectMode('person');
      teleportTo(-224 + 7, 120 + 6, Math.atan2(-7, -6));
    }
    document.body.classList.add('cinematic');
    fade.style.opacity = '1';
    setTimeout(() => { if (active) fade.style.opacity = '0'; }, 250);
  }
  function stop() {
    if (!active) return;
    active = false;
    document.body.classList.remove('cinematic');
    line.style.opacity = '0';
    title.style.opacity = '0';
    fade.style.opacity = '0';
    try { localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
  }
  skip.addEventListener('click', stop);
  window.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); stop(); }
  });

  /** Called after the camera system's own update: the intro takes the camera over while it plays */
  function apply(dt) {
    if (!active) return false;
    controllerManager.resetInput();
    const s = SHOTS[shot];
    t += dt;
    const u = ease(Math.min(1, t / s.secs));
    resolve(s.from, A, A);
    resolve(s.to, B, B);
    const eye = A.lerp(B, u);
    resolve(s.lookFrom, L1, eye);
    resolve(s.lookTo, L2, eye);
    const look = L1.lerp(L2, u);
    cameraSystem.currentPos.copy(eye);
    cameraSystem.currentLookAt.copy(look);
    cameraSystem.camera.position.copy(eye);
    cameraSystem.camera.lookAt(look);
    cameraSystem.camera.updateMatrixWorld();

    // lines spread over the shot
    const k = Math.min(s.lines.length - 1, Math.floor((t / s.secs) * s.lines.length));
    if (k !== lineK) {
      lineK = k;
      const [who, text] = s.lines[k];
      line.innerHTML = '';
      if (who) { const b = document.createElement('b'); b.textContent = who; line.append(b); }
      line.append(document.createTextNode(text));
      line.style.opacity = '1';
    }
    if (s.title) title.style.opacity = t > 0.6 ? '1' : '0';
    // fade to black over the cut
    fade.style.opacity = t > s.secs - 0.45 && shot < SHOTS.length - 1 ? '1' : '0';
    if (t >= s.secs) {
      shot++;
      t = 0;
      lineK = -1;
      line.style.opacity = '0';
      if (shot >= SHOTS.length) stop();
    }
    return true;
  }

  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch { /* storage unavailable */ }
  const forced = new URLSearchParams(location.search).has('intro');
  return {
    apply,
    start,
    stop,
    get active() { return active; },
    /** For checking a shot: show shot i, a little way in */
    jump(i, at = 2) { if (!active) start(); shot = Math.max(0, Math.min(SHOTS.length - 1, i)); t = at; lineK = -1; },
    /** Whether to play it once the city is on screen */
    shouldAutoplay: forced || !seen
  };
}
