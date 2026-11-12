import * as THREE from 'three/webgpu';
import { ROADS, blockAt } from './city-config.js';
import { STORY_CAST } from './people.js';
import { PLACES } from './story/places.js';

// The opening: wide shots of Melbourne at golden hour, letterboxed, with the player's own voice setting up the story
// over them and Vince on the phone, ending on the player at the first job's marker, all to a synthesised score. Every
// time the game starts it waits on a title card for a key or a tap (browsers only play sound after one), then plays;
// It is off by default now: ?intro plays it; ?nointro is kept for the test scripts. "Watch the intro" in the teleport menu plays it again. Esc, Enter or Skip end it.
// Before the shots, the title film (assets/video/intro.mp4, 15 s) plays full screen, ending on the GTA MELBOURNE
// title; Esc, Enter, Space or Skip end the film and go on to the shots. ?nofilm leaves the film out.
//
// Each shot moves the camera from `from` to `to` (eye) while looking from `lookFrom` to `lookTo`, over `secs`, eased.
// World metres (x = east along Collins St, z = south). 'sun' as a look target points the camera into the sunset.

const KEY = 'gta-melbourne3d-intro-seen';

const SHOTS = [
  { // the skyline from over Yarra Park and the MCG
    from: [1550, 260, 1250], to: [1150, 190, 930], lookFrom: [-150, 70, -60], lookTo: [-200, 60, -80], secs: 7.5,
    lines: [['', 'Melbourne. Four seasons in one day, and somebody fighting over every one of them.']]
  },
  { // Flinders Street Station from over the Yarra
    from: [-30, 42, 390], to: [10, 34, 360], lookFrom: [-180, 16, 262], lookTo: [-165, 14, 262], secs: 7,
    lines: [['', 'Twenty-two years ago I left this city by boat, with a book that two gangs and the police would have killed for.']]
  },
  { // Lygon Street, Carlton
    from: [700, 120, -880], to: [575, 85, -1060], lookFrom: [470, 0, -1420], lookTo: [480, 0, -1430], secs: 7,
    lines: [['', 'Vince Lombardo kept that book. His Lygon Street Crew ran Carlton and Fitzroy. Old families, old rules, good coffee.']]
  },
  { // Docklands, into the sunset
    from: [-1750, 32, -180], to: [-1900, 38, -360], lookFrom: 'sun', lookTo: 'sun', secs: 7.5,
    lines: [['', 'Out west, the Broadmeadows firm wanted the lot. Six years of war: chop shops torched, tobacco trucks gone.']]
  },
  { // up at Eureka from the river
    from: [-260, 5, 430], to: [-300, 7, 455], lookFrom: [-381, 120, 597], lookTo: [-381, 230, 597], secs: 6.5,
    lines: [['', 'And Taskforce Kestrel was closing in on all of them.']]
  },
  { // down Swanston Street to the station
    from: [-5, 7, -560], to: [-5, 6, -330], lookFrom: [-5, 16, 262], lookTo: [-5, 14, 262], secs: 11, // room for Vince's recorded call
    lines: [['Vince (phone)', "So you're back. I haven't got long, and there's something we never finished."],
      ['Vince (phone)', "Davo will meet you at the water. Don't be seen."],
      ['You', 'Twenty-two years, and he still tells me where to stand.']]
  },
  { // down onto the player at the job
    from: 'player-high', to: 'player-chase', lookFrom: 'player', lookTo: 'player', secs: 5.5, title: true,
    lines: [['', 'Davo is waiting on Harbour Esplanade. Walk to the pink marker.']]
  }
];

const CSS = `
.intro-bar { position: fixed; left: 0; right: 0; height: 11vh; background: #000; z-index: 60; transition: transform .8s ease; pointer-events: none; }
.intro-bar.top { top: 0; transform: translateY(-100%); }
.intro-bar.bottom { bottom: 0; transform: translateY(100%); }
body.cinematic .intro-bar { transform: none; }
body.cinematic .hud, body.cinematic .gm-objective, body.cinematic .gm-timer, body.cinematic .gm-money, body.cinematic .gp-prompt,
body.cinematic .gp-weapon, body.cinematic .gp-fire, body.cinematic .gp-cross, body.cinematic .gp-speedo, body.cinematic .race-hud, body.cinematic [class*="touch-"] { visibility: hidden !important; }
.intro-fade { position: fixed; inset: 0; background: #000; opacity: 0; z-index: 59; pointer-events: none; transition: opacity .45s ease; }
.intro-line { position: fixed; left: 50%; bottom: calc(11vh + 18px); transform: translateX(-50%); width: min(820px, 92vw); z-index: 61; text-align: center;
  color: #fff; font: 500 clamp(15px, 2.1vw, 20px)/1.45 Inter, system-ui, sans-serif; text-shadow: 0 2px 8px rgba(0,0,0,.9); pointer-events: none;
  transition: opacity .35s; }
.intro-line.narration { font-style: italic; }
.intro-line b { display: block; color: #ffcf6e; font-size: .7em; letter-spacing: .14em; text-transform: uppercase; margin-bottom: 2px; }
.intro-title { position: fixed; left: 50%; top: 38%; transform: translate(-50%, -50%); z-index: 61; text-align: center; color: #fff; pointer-events: none;
  font: 900 clamp(38px, 8vw, 92px)/1 Inter, system-ui, sans-serif; letter-spacing: .06em; text-shadow: 0 6px 30px rgba(0,0,0,.6); opacity: 0; transition: opacity 1s; }
.intro-title small { display: block; margin-top: 10px; font-size: .2em; letter-spacing: .3em; color: #ffcf6e; }
.intro-card { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(40, 20, 6, .55), rgba(0, 0, 0, .9)); color: #fff; cursor: pointer; text-align: center; }
.intro-card[hidden] { display: none; }
.intro-card h1 { margin: 0; font: 900 clamp(40px, 9vw, 104px)/1 Inter, system-ui, sans-serif; letter-spacing: .06em; }
.intro-card p { margin: 14px 0 0; font: 600 13px/1 Inter, system-ui, sans-serif; letter-spacing: .3em; color: #ffcf6e; }
.intro-card span { margin-top: 42px; font: 600 15px/1 Inter, system-ui, sans-serif; opacity: .85; animation: introPulse 1.6s ease-in-out infinite; }
@keyframes introPulse { 50% { opacity: .35; } }
.intro-skip { position: fixed; right: 18px; top: calc(11vh + 12px); z-index: 62; padding: 7px 14px; border: 1px solid rgba(255,255,255,.5); border-radius: 999px;
  background: rgba(0,0,0,.45); color: #fff; font: 600 13px/1 Inter, system-ui, sans-serif; cursor: pointer; display: none; }
body.cinematic .intro-skip { display: block; }
.intro-film { position: fixed; inset: 0; z-index: 80; background: #000; display: flex; align-items: center; justify-content: center;
  opacity: 1; transition: opacity .6s ease; }
.intro-film[hidden] { display: none; }
.intro-film.out { opacity: 0; }
.intro-film video { width: 100%; height: 100%; object-fit: contain; background: #000; }
.intro-film button { position: absolute; right: 18px; top: 18px; padding: 7px 14px; border: 1px solid rgba(255,255,255,.5); border-radius: 999px;
  background: rgba(0,0,0,.45); color: #fff; font: 600 13px/1 Inter, system-ui, sans-serif; cursor: pointer; }
`;
const FILM_URL = 'assets/video/intro.mp4';

const ease = (t) => t * t * (3 - 2 * t);

// --- The score: a minor-key build at 84 bpm, synthesised (no audio files). Am, F, C, G bars: pads from the start, bass
// and a plucked arpeggio through a delay from bar 5, drums from bar 9, the last bars held under the title. Every note is
// scheduled ahead on the audio clock; stop() fades it out.
function createScore() {
  let ctx = null, master = null, duckGain = null, started = false;
  const BPM = 84, BEAT = 60 / BPM, BAR = BEAT * 4;
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G (MIDI)
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function reverb() {
    const len = ctx.sampleRate * 2.6;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    return conv;
  }
  function start(totalSecs) {
    if (started) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
    started = true;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + 0.15;
    master = ctx.createGain();
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(0.55, t0 + 3);
    const verb = reverb();
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    verb.connect(wet).connect(master);
    // under a spoken line the music drops away (duck(), see apply())
    duckGain = ctx.createGain();
    master.connect(duckGain).connect(ctx.destination);
    const out = (node, dry = 1) => { const g = ctx.createGain(); g.gain.value = dry; node.connect(g); g.connect(master); node.connect(verb); };
    const delay = ctx.createDelay(1);
    delay.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    delay.connect(fb).connect(delay);
    out(delay, 0.6);

    const bars = Math.ceil(totalSecs / BAR) + 1;
    for (let b = 0; b < bars; b++) {
      const tb = t0 + b * BAR;
      const chord = CHORDS[b % 4];
      const last = b >= bars - 2;
      // pad: detuned saws through a lowpass opening over the piece
      for (const n of chord) for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(n);
        o.detune.value = det;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 500 + Math.min(1, b / bars) * 1400;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, tb);
        g.gain.linearRampToValueAtTime(0.028, tb + 0.9);
        g.gain.setValueAtTime(0.028, tb + BAR - 0.3);
        g.gain.linearRampToValueAtTime(last ? 0.02 : 0, tb + BAR + 0.4);
        o.connect(f).connect(g);
        out(g);
        o.start(tb);
        o.stop(tb + BAR + 0.5);
      }
      if (b >= 4 && !last) {
        // bass: the root in eighths, accented on the beat
        for (let i = 0; i < 8; i++) {
          const t = tb + i * BEAT / 2;
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = hz(chord[0] - 24);
          const g = ctx.createGain();
          g.gain.setValueAtTime(i % 2 ? 0.07 : 0.12, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + BEAT * 0.45);
          o.connect(g);
          out(g, 1);
          o.start(t);
          o.stop(t + BEAT / 2);
        }
        // plucked arpeggio into the delay
        const arp = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 12];
        for (let i = 0; i < 8; i++) {
          const t = tb + i * BEAT / 2;
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = hz(arp[i % 4]);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.05, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          o.connect(g);
          g.connect(delay);
          out(g, 0.8);
          o.start(t);
          o.stop(t + 0.4);
        }
      }
      if (b >= 8 && !last) {
        for (let beat = 0; beat < 4; beat++) {
          const t = tb + beat * BEAT;
          if (beat % 2 === 0) { // kick
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.frequency.setValueAtTime(110, t);
            o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
            g.gain.setValueAtTime(0.5, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            o.connect(g);
            out(g, 1);
            o.start(t);
            o.stop(t + 0.32);
          } else { // snare: a noise burst
            const len = Math.floor(ctx.sampleRate * 0.2);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass';
            f.frequency.value = 1800;
            const g = ctx.createGain();
            g.gain.value = 0.22;
            src.connect(f).connect(g);
            out(g, 1);
            src.start(t);
          }
          for (const half of [0, 0.5]) { // hats
            const th = t + half * BEAT;
            const len = Math.floor(ctx.sampleRate * 0.05);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'highpass';
            f.frequency.value = 7000;
            const g = ctx.createGain();
            g.gain.value = 0.05;
            src.connect(f).connect(g);
            g.connect(master);
            src.start(th);
          }
        }
      }
    }
  }
  function stop() {
    if (!ctx || !started) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 1.6);
    const c = ctx;
    setTimeout(() => c.close().catch(() => {}), 2000);
    ctx = null;
    started = false;
  }
  function duck(on) {
    if (!ctx || !duckGain) return;
    duckGain.gain.setTargetAtTime(on ? 0.22 : 1, ctx.currentTime, on ? 0.12 : 0.6);
  }
  return { start, stop, duck };
}

// The arrival: tonight, on foot on Harbour Esplanade in Docklands, where the first job (Low Tide) starts
// (facing Davo, who waits at the first job's marker a few steps away)
const ARRIVE = { x: PLACES.M1_PLAYER.x, z: PLACES.M1_PLAYER.z, heading: Math.atan2(PLACES.DOCK_COLLINS.x - PLACES.M1_PLAYER.x, PLACES.DOCK_COLLINS.z - PLACES.M1_PLAYER.z) };

// --- The people in the intro's ground-level shots -------------------------------------------------------------------
// the footpath beside a named street nearest a point: the street's direction (ux, uz), the way from the road into the
// footpath (nx, nz), and at(along, out): a point `along` the street and `out` metres in from the kerb (negative: the road)
function footpathNear(name, near) {
  let best = null;
  for (const r of ROADS) {
    if (r.raw !== name) continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
      const t = Math.max(0, Math.min(L, (near.x - a.x) * ux + (near.z - a.z) * uz));
      const px = a.x + ux * t, pz = a.z + uz * t, d = Math.hypot(px - near.x, pz - near.z);
      if (!best || d < best.d) best = { d, px, pz, ux, uz };
    }
  }
  if (!best) best = { px: near.x, pz: near.z, ux: 1, uz: 0 };
  const { px, pz, ux, uz } = best;
  let side = 1, kerb = 8;
  for (let off = 3; off < 20; off += 0.5) {
    if (blockAt(px + uz * off, pz - ux * off)) { side = 1; kerb = off; break; }
    if (blockAt(px - uz * off, pz + ux * off)) { side = -1; kerb = off; break; }
  }
  const nx = uz * side, nz = -ux * side;
  return { ux, uz, nx, nz, at: (along, out) => ({ x: px + ux * along + nx * (kerb + out), z: pz + uz * along + nz * (kerb + out), y: out >= 0 ? 0.22 : 0 }) };
}
// the nearest land to a point (a kerb island), searched outwards
function landNear(x, z) {
  for (let r = 0; r < 60; r += 2) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (blockAt(px, pz)) return { x: px, z: pz, y: 0.22 };
      if (r === 0) break;
    }
  }
  return { x, z, y: 0 };
}
const face = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

export function createIntro({ cameraSystem, controllerManager, lightingSystem, selectTime, selectMode, missionSystem, teleportTo, voices = null, gameplay = null, cast = null }) {
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
  sm.textContent = 'MELBOURNE · TONIGHT';
  title.append(sm);
  const card = div('intro-card');
  card.hidden = true;
  const h1 = document.createElement('h1');
  h1.textContent = 'GTA MELBOURNE';
  const cp = document.createElement('p');
  cp.textContent = 'MELBOURNE · TONIGHT';
  const go = document.createElement('span');
  go.textContent = 'Press any key or tap to start';
  card.append(h1, cp, go);
  const score = createScore();
  let totalSecs = SHOTS.reduce((t, s) => t + s.secs, 0);
  const skip = document.createElement('button');
  skip.className = 'intro-skip';
  skip.type = 'button';
  skip.textContent = 'Skip ›';
  document.body.append(skip);

  // The title film: full screen over the city, then hands on to the shots (`then`)
  const film = div('intro-film');
  film.hidden = true;
  let filmDone = null;
  function endFilm() {
    if (!filmDone) return;
    const then = filmDone;
    filmDone = null;
    window.removeEventListener('keydown', filmKey, true);
    film.classList.add('out');
    setTimeout(() => {
      film.hidden = true;
      film.classList.remove('out');
      const v = film.querySelector('video');
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); }
    }, 600);
    then();
  }
  function filmKey(e) {
    if (['Escape', 'Enter', 'NumpadEnter', 'Space'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); endFilm(); }
  }
  function playFilm(then) {
    if (new URLSearchParams(location.search).has('nofilm')) { then(); return; }
    filmDone = then;
    film.textContent = '';
    const v = document.createElement('video');
    v.src = FILM_URL;
    v.playsInline = true;
    v.preload = 'auto';
    v.addEventListener('ended', endFilm);
    v.addEventListener('error', endFilm);
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Skip ›';
    b.addEventListener('click', endFilm);
    film.append(v, b);
    film.hidden = false;
    window.addEventListener('keydown', filmKey, true);
    // (called from a key or a tap, so the browser lets it play with sound; if it still refuses, try it muted)
    v.play().catch(() => { v.muted = true; return v.play(); }).catch(endFilm);
  }
  /** The whole opening: the title film, then the shots */
  function play() {
    card.hidden = true;
    playFilm(start);
  }

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

  // The ground-level shots with people in them, worked out once (they need the streets and the sun): Vince with two of
  // his crew outside on Lygon Street; Kaz and two of her gang at the water in Docklands, against the sunset; two police
  // officers in the foreground at Southbank before the camera tilts up Eureka; Vince on the phone
  let castShots = false;
  function buildCastShots() {
    if (castShots || !cast) return;
    castShots = true;
    const A = cast.active || {}, police = A.police || [];
    const V = STORY_CAST.Vince, K = STORY_CAST.Kaz;
    // Lygon Street, Carlton
    const ly = footpathNear('LYGON STREET', { x: 475, z: -1425 });
    const vince = ly.at(0, 1.3), c1 = ly.at(1.5, 1.7), c2 = ly.at(-1.2, 2.0);
    const toRoad = { x: -ly.nx, z: -ly.nz };
    const camA = ly.at(5.4, -3.6), camB = ly.at(3.4, -2.6); // (close: medium shots, not specks)
    Object.assign(SHOTS[2], {
      from: [camA.x, 1.8, camA.z], to: [camB.x, 1.65, camB.z], lookFrom: [vince.x, 1.75, vince.z], lookTo: [vince.x, 1.7, vince.z],
      actors: [
        { key: 'vince', id: V, pose: { ...vince, heading: face(vince, { x: (c1.x + c2.x) / 2, z: (c1.z + c2.z) / 2 }) }, anim: 'talk_assured' },
        // (only the story's own people: Davo is Vince's driver)
        { key: 'crew1', id: STORY_CAST.Davo, pose: { ...c1, heading: face(c1, vince) }, anim: 'listen' } // (the laugh clip shook him and froze head-back: he listens)
      ]
    });
    // Docklands at sunset: they stand between the camera and the sun
    const s = lightingSystem.sunLight.position, sh = Math.hypot(s.x, s.z) || 1, sx = s.x / sh, sz = s.z / sh;
    const D = landNear(-1820, -260);
    const kaz = { ...D, heading: Math.atan2(-sx, -sz) };
    const side = { x: -sz, z: sx };
    Object.assign(SHOTS[3], {
      from: [D.x - sx * 6.4 + side.x * 1.4, 1.5, D.z - sz * 6.4 + side.z * 1.4], to: [D.x - sx * 4.4 + side.x * 0.8, 1.55, D.z - sz * 4.4 + side.z * 0.8],
      lookFrom: [D.x + sx * 30, 3, D.z + sz * 30], lookTo: [D.x + sx * 30, 2.4, D.z + sz * 30],
      actors: [
        { key: 'kaz', id: K, pose: kaz, anim: 'angry_idle' },
        // (Mick, her fence, beside her)
        { key: 'gang1', id: STORY_CAST.Mick, pose: { x: D.x + side.x * 1.3 + sx * 0.6, y: D.y, z: D.z + side.z * 1.3 + sz * 0.6, heading: kaz.heading + 0.25 }, anim: 'phone' }
      ]
    });
    // Southbank: two officers in the foreground, then up the tower
    const c0 = { x: -260, z: 430 }, top = { x: -381, z: 597 };
    const ux = top.x - c0.x, uz = top.z - c0.z, ul = Math.hypot(ux, uz), dx = ux / ul, dz = uz / ul;
    const cops = landNear(c0.x + dx * 5.5, c0.z + dz * 5.5);
    const p1 = { x: cops.x - dz * 0.8, y: cops.y, z: cops.z + dx * 0.8 }, p2 = { x: cops.x + dz * 0.9, y: cops.y, z: cops.z - dx * 0.9 };
    Object.assign(SHOTS[4], {
      from: [c0.x, 1.7, c0.z], to: [c0.x - dx * 2, 2.6, c0.z - dz * 2], lookFrom: [cops.x, 1.6, cops.z], lookTo: [top.x, 230, top.z],
      actors: [
        { key: 'cop1', id: police[0], pose: { ...p1, heading: face(p1, c0) + 0.4 }, anim: 'look' },
        { key: 'cop2', id: police[1] || police[0], pose: { ...p2, heading: face(p2, c0) - 0.5 }, anim: 'idle' }
      ]
    });
    // Vince's call: close on him, on the phone, outside on Lygon Street
    const vp = { ...vince, heading: face(vince, ly.at(2, -3)) };
    const e0 = { x: vince.x + toRoad.x * 2.4 + ly.ux * 1.0, z: vince.z + toRoad.z * 2.4 + ly.uz * 1.0 };
    const e1 = { x: vince.x + toRoad.x * 1.7 + ly.ux * 0.6, z: vince.z + toRoad.z * 1.7 + ly.uz * 0.6 };
    Object.assign(SHOTS[5], {
      from: [e0.x, 1.8, e0.z], to: [e1.x, 1.78, e1.z], lookFrom: [vince.x, 1.78, vince.z], lookTo: [vince.x, 1.76, vince.z],
      actors: [{ key: 'vince', id: V, pose: vp, anim: 'phone' }]
    });
    // the player's line goes over the city, a shot of its own before the last one
    const you = SHOTS[5].lines.filter((l) => l[0] === 'You');
    SHOTS[5].lines = SHOTS[5].lines.filter((l) => l[0] !== 'You');
    if (you.length && !SHOTS.some((x) => x.youShot)) {
      SHOTS.splice(6, 0, { youShot: true, from: [-5, 7, -560], to: [-5, 6, -420], lookFrom: [-5, 16, 262], lookTo: [-5, 14, 262], secs: 4.5, lines: you });
    }
    // the extras' models, fetched now (the first shot with them is a quarter of a minute in)
    cast.preload?.(SHOTS.flatMap((sh) => (sh.actors || []).map((a) => a.id)));
    // each shot long enough for its recorded lines
    for (const sh of SHOTS) {
      const need = sh.lines.reduce((n, [, text]) => n + (voices?.lines?.find((l) => l.text === text)?.duration || 0) + 0.7, 0.4);
      sh.secs = Math.max(sh.secs, need);
    }
    totalSecs = SHOTS.reduce((n, sh) => n + sh.secs, 0);
  }
  function showActors() {
    const want = new Set();
    for (const a of SHOTS[shot]?.actors || []) {
      if (!a.id) continue;
      want.add(a.key);
      cast?.setActor(a.key, a.id, a.pose, a.anim);
    }
    for (const k of ['vince', 'crew1', 'crew2', 'kaz', 'gang1', 'gang2', 'cop1', 'cop2']) if (!want.has(k)) cast?.setActor(k, null, null);
  }

  function start() {
    buildCastShots();
    card.hidden = true;
    score.start(totalSecs);
    active = true;
    shot = 0;
    t = 0;
    lineK = -1;
    selectTime('golden');
    // a new story ends the intro with the player on Harbour Esplanade (the last shot); further along, where you are
    arriving = !!(missionSystem && missionSystem.progress === 0);
    document.body.classList.add('cinematic');
    fade.style.opacity = '1';
    setTimeout(() => { if (active) fade.style.opacity = '0'; }, 250);
  }
  function stop() {
    if (!active) return;
    active = false;
    shot = -1;
    showActors(); // (nobody)
    score.stop();
    if (arriving) arrive(false);
    voices?.stopStory('intro'); // only the intro's own lines, never a cut scene's
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
    if (filmDone) controllerManager.resetInput(); // nothing moves under the film
    if (!active) return false;
    controllerManager.resetInput();
    showActors();
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

    // the last shot finds the player on the esplanade, tonight (placed as it begins)
    if (arriving && s.title && !rolling) {
      rolling = true;
      selectMode('person');
      teleportTo(ARRIVE.x, ARRIVE.z, ARRIVE.heading);
    }

    // the music dips under a recorded line
    score.duck(!!voices?.speaking);

    // lines spread over the shot
    const k = Math.min(s.lines.length - 1, Math.floor((t / s.secs) * s.lines.length));
    if (k !== lineK) {
      lineK = k;
      const [who, text] = s.lines[k];
      line.innerHTML = '';
      line.classList.toggle('narration', !who);
      if (who) { const b = document.createElement('b'); b.textContent = who; line.append(b); }
      line.append(document.createTextNode(text));
      line.style.opacity = '1';
      // Vince's call, recorded (down the phone line)
      voices?.sayText(text, { subtitle: false, phone: /phone/i.test(who), tag: 'intro', who: /^vince/i.test(who) ? 'Vince' : 'You' });
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

  // The arrival's end state: the player on foot on Harbour Esplanade, by the first job's marker.
  // fromSkip: nothing placed them there (the intro was skipped), so do it now
  let arriving = false, rolling = false;
  function arrive(fromSkip) {
    arriving = false;
    if (fromSkip || !rolling) {
      selectMode('person');
      teleportTo(ARRIVE.x, ARRIVE.z, ARRIVE.heading);
    }
    rolling = false;
    // a new story goes straight on into the first job (one scene, not an intro, a walk, a call and another scene)
    if (missionSystem && missionSystem.progress === 0 && !missionSystem.onJob) missionSystem.start(0, { fromIntro: true });
    else missionSystem?.sub?.("Tonight. Davo is waiting on Harbour Esplanade: the pink marker.", 6);
  }

  const forced = new URLSearchParams(location.search).has('intro');
  /** The title card: waits for a key or a tap, then plays (with sound: the gesture lets the browser start audio) */
  function prompt() {
    card.hidden = false;
    const begin = (e) => {
      if (card.hidden) return;
      if (e && e.type === 'keydown' && e.code === 'Escape') {
        card.hidden = true;
        try { localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
        if (missionSystem && missionSystem.progress === 0) arrive(true); // still put on the esplanade
        return;
      }
      window.removeEventListener('keydown', begin, true);
      play();
    };
    window.addEventListener('keydown', begin, true);
    card.addEventListener('pointerdown', begin, { once: true });
  }

  return {
    apply,
    start,
    play,
    /** Whether the title film is on screen */
    get filmPlaying() { return !!filmDone; },
    prompt,
    stop,
    get active() { return active; },
    /** For checking a shot: show shot i, a little way in */
    jump(i, at = 2) { if (!active) start(); shot = Math.max(0, Math.min(SHOTS.length - 1, i)); t = at; lineK = -1; },
    /** Whether to play it once the city is on screen */
    /** The intro is off: only ?intro (or "Watch the intro" in the teleport menu) plays it */
    shouldAutoplay: forced,
    /** No intro: a new game starts on the esplanade, in the player's hands. (?nointro leaves the player where the city loads) */
    skip() { if (!new URLSearchParams(location.search).has('nointro') && missionSystem && missionSystem.progress === 0) arrive(true); }
  };
}
