import * as THREE from 'three/webgpu';
import { ROADS, blockAt } from './city-config.js';

// The opening: wide shots of Melbourne at golden hour, letterboxed, with the player's own voice setting up the story
// over them and Vince on the phone, ending on the player at the first job's marker, all to a synthesised score. The first
// time the game starts it waits on a title card for a key or a tap (browsers only play sound after one); it also plays
// with ?intro, or "Watch the intro" in the teleport menu. Esc, Enter or Skip end it.
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
    lines: [['', "It's 2004. I've been gone three years. The city's grown up. So have the crooks."]]
  },
  { // Lygon Street, Carlton
    from: [700, 120, -880], to: [575, 85, -1060], lookFrom: [470, 0, -1420], lookTo: [480, 0, -1430], secs: 7,
    lines: [['', 'The Lygon Street Crew run Carlton and Fitzroy. Old families, old rules, good coffee.']]
  },
  { // Docklands, into the sunset
    from: [-1750, 32, -180], to: [-1900, 38, -360], lookFrom: 'sun', lookTo: 'sun', secs: 7.5,
    lines: [['', 'Out west, the Broadmeadows mob want the lot. Six years of war: chop shops torched, tobacco trucks gone.']]
  },
  { // up at Eureka from the river
    from: [-260, 5, 430], to: [-300, 7, 455], lookFrom: [-381, 120, 597], lookTo: [-381, 230, 597], secs: 6.5,
    lines: [['', "And now Taskforce Kestrel, the cops' shiny new toy, is closing in on all of them."]]
  },
  { // down Swanston Street to the station
    from: [-5, 7, -560], to: [-5, 6, -330], lookFrom: [-5, 16, 262], lookTo: [-5, 14, 262], secs: 11, // room for Vince's recorded call
    lines: [['Vince (phone)', "Heard you were back. I've got work, if you want it."],
      ['Vince (phone)', "Flinders Lane, off Elizabeth Street. Don't keep me waiting."],
      ['You', 'Fresh off the plane and already working. Typical.']]
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
`;

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

// The arrival: fresh from the airport, the taxi comes down Elizabeth Street (southbound, in the left lane) and pulls
// up at the kerb short of Flinders Lane, where Vince's first job is; then the player gets out
const ARRIVE = { x: -224 + 9, z0: 66, z1: 100, heading: 0 }; // heading 0 = facing +z (grid south)

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
  sm.textContent = 'MELBOURNE · 2004';
  title.append(sm);
  const card = div('intro-card');
  card.hidden = true;
  const h1 = document.createElement('h1');
  h1.textContent = 'GTA MELBOURNE';
  const cp = document.createElement('p');
  cp.textContent = 'MELBOURNE · 2004';
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
    const A = cast.active || {}, male = A.male || [], gang = A.gang || [], police = A.police || [];
    const V = 'Male_Adult_03', K = 'Female_Adult_04';
    // Lygon Street, Carlton
    const ly = footpathNear('LYGON STREET', { x: 475, z: -1425 });
    const vince = ly.at(0, 1.3), c1 = ly.at(1.5, 1.7), c2 = ly.at(-1.2, 2.0);
    const toRoad = { x: -ly.nx, z: -ly.nz };
    const camA = ly.at(7, -5), camB = ly.at(3.8, -3);
    Object.assign(SHOTS[2], {
      from: [camA.x, 1.8, camA.z], to: [camB.x, 1.65, camB.z], lookFrom: [vince.x, 1.75, vince.z], lookTo: [vince.x, 1.7, vince.z],
      actors: [
        { key: 'vince', id: V, pose: { ...vince, heading: face(vince, { x: (c1.x + c2.x) / 2, z: (c1.z + c2.z) / 2 }) }, anim: 'talk_assured' },
        { key: 'crew1', id: male[0], pose: { ...c1, heading: face(c1, vince) }, anim: 'listen' },
        { key: 'crew2', id: male[1] || male[0], pose: { ...c2, heading: face(c2, vince) }, anim: 'laugh' }
      ]
    });
    // Docklands at sunset: they stand between the camera and the sun
    const s = lightingSystem.sunLight.position, sh = Math.hypot(s.x, s.z) || 1, sx = s.x / sh, sz = s.z / sh;
    const D = landNear(-1820, -260);
    const kaz = { ...D, heading: Math.atan2(-sx, -sz) };
    const side = { x: -sz, z: sx };
    Object.assign(SHOTS[3], {
      from: [D.x - sx * 9 + side.x * 1.5, 1.5, D.z - sz * 9 + side.z * 1.5], to: [D.x - sx * 6.5 + side.x * 0.8, 1.55, D.z - sz * 6.5 + side.z * 0.8],
      lookFrom: [D.x + sx * 30, 3, D.z + sz * 30], lookTo: [D.x + sx * 30, 2.4, D.z + sz * 30],
      actors: [
        { key: 'kaz', id: K, pose: kaz, anim: 'angry_idle' },
        { key: 'gang1', id: gang[0], pose: { x: D.x + side.x * 1.3 + sx * 0.6, y: D.y, z: D.z + side.z * 1.3 + sz * 0.6, heading: kaz.heading + 0.25 }, anim: 'text' },
        { key: 'gang2', id: gang[1] || gang[0], pose: { x: D.x - side.x * 1.4 + sx * 0.5, y: D.y, z: D.z - side.z * 1.4 + sz * 0.5, heading: kaz.heading - 0.2 }, anim: 'look' }
      ]
    });
    // Southbank: two officers in the foreground, then up the tower
    const c0 = { x: -260, z: 430 }, top = { x: -381, z: 597 };
    const ux = top.x - c0.x, uz = top.z - c0.z, ul = Math.hypot(ux, uz), dx = ux / ul, dz = uz / ul;
    const cops = landNear(c0.x + dx * 8, c0.z + dz * 8);
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
    // the player's line goes over the city, a shot of its own before the taxi
    const you = SHOTS[5].lines.filter((l) => l[0] === 'You');
    SHOTS[5].lines = SHOTS[5].lines.filter((l) => l[0] !== 'You');
    if (you.length && !SHOTS.some((x) => x.youShot)) {
      SHOTS.splice(6, 0, { youShot: true, from: [-5, 7, -560], to: [-5, 6, -420], lookFrom: [-5, 16, 262], lookTo: [-5, 14, 262], secs: 4.5, lines: you });
    }
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
    // a new story starts with the taxi ride in from the airport (the last shot); further along, where you are
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

    // the taxi ride: placed as the last shot begins, then rolling to a stop at the kerb
    if (arriving && s.title) {
      const car = controllerManager.entities.car;
      if (!rolling) {
        rolling = true;
        selectMode('car');
        teleportTo(ARRIVE.x, ARRIVE.z0, ARRIVE.heading);
      }
      // speed falling linearly to nothing over the shot covers z1 - z0
      const T = s.secs - 0.8, v0 = (2 * (ARRIVE.z1 - ARRIVE.z0)) / T;
      car.heading = ARRIVE.heading;
      car.angularVel = 0;
      car.vx = car.vz = 0;
      car.speed = Math.max(0, v0 * (1 - t / T));
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
      voices?.sayText(text, { subtitle: false, phone: /phone/i.test(who), tag: 'intro' });
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

  // The arrival's end state: the taxi at the kerb on Elizabeth Street and the player out of it, on the footpath.
  // fromSkip: nothing drove it there (the intro was skipped), so put the taxi there first
  let arriving = false, rolling = false;
  function arrive(fromSkip) {
    arriving = false;
    if (fromSkip || !rolling) {
      selectMode('car');
      teleportTo(ARRIVE.x, ARRIVE.z1, ARRIVE.heading);
    }
    rolling = false;
    const car = controllerManager.entities.car;
    car.speed = 0;
    car.vx = car.vz = 0;
    if (gameplay) {
      setTimeout(() => {
        if (controllerManager.activeMode !== 'car') return;
        gameplay.exitCar();
        // a passenger: out on the kerb side (the left), facing up the street towards the job
        const h = car.heading, person = controllerManager.entities.person;
        person.position.set(car.position.x + Math.cos(h) * 2.6, person.position.y, car.position.z - Math.sin(h) * 2.6);
        person.heading = h;
      }, 50);
    }
    missionSystem?.sub?.("Fresh off the plane. Vince's job is just up the road: the pink marker.", 6);
  }

  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch { /* storage unavailable */ }
  const forced = new URLSearchParams(location.search).has('intro');
  /** The title card: waits for a key or a tap, then plays (with sound: the gesture lets the browser start audio) */
  function prompt() {
    card.hidden = false;
    const begin = (e) => {
      if (card.hidden) return;
      if (e && e.type === 'keydown' && e.code === 'Escape') {
        card.hidden = true;
        try { localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
        if (missionSystem && missionSystem.progress === 0) arrive(true); // still dropped off by the taxi
        return;
      }
      window.removeEventListener('keydown', begin, true);
      start();
    };
    window.addEventListener('keydown', begin, true);
    card.addEventListener('pointerdown', begin, { once: true });
  }

  return {
    apply,
    start,
    prompt,
    stop,
    get active() { return active; },
    /** For checking a shot: show shot i, a little way in */
    jump(i, at = 2) { if (!active) start(); shot = Math.max(0, Math.min(SHOTS.length - 1, i)); t = at; lineK = -1; },
    /** Whether to play it once the city is on screen */
    shouldAutoplay: forced || !seen
  };
}
