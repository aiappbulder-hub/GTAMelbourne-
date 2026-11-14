// GTA Melbourne's music: everything is synthesised in code with the Web Audio API (no audio files, no real tunes).
//
//  - Car radio: five invented stations, each its own procedural style (synthwave, lo-fi beat, driving rock, house,
//    ambient) plus "Radio off". Each is a bar-by-bar step sequencer: synth drums, bass, chords and a lead, with sections
//    and chord progressions that change every pass so it does not loop in an obvious four bars.
//  - On foot: a quiet ambient bed; a tenser track with a wanted level or fighting on a job. Tracks cross-fade.
//  - Behaviour: starts after a user gesture, ducks under dialogue and cut scenes, obeys a volume and mute setting
//    (saved in localStorage, panel on the toolbar's note button), and pauses when the tab is hidden or the sound is muted.
//  - Scheduling uses the audio clock with a look-ahead timer (not per-frame work). Each bar is queued about a second ahead.
//
// Keys: U = next radio station (Shift+U = previous) while in a car. window.__city.music exposes the state for checks.

const KEY = 'gta-melbourne3d-music';
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (...n) => n.reduce((h, v) => Math.imul(h ^ (v + 0x9e3779b9), 0x85ebca6b) >>> 0, 0x1234567);

const QUAL = { m: [0, 3, 7], M: [0, 4, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], 7: [0, 4, 7, 10], 5: [0, 7, 12], sus: [0, 5, 7], m9: [0, 3, 7, 10, 14], M9: [0, 4, 7, 11, 14] };
const MINOR = [0, 2, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11], DORIAN = [0, 2, 3, 5, 7, 9, 10], PENT = [0, 3, 5, 7, 10];

// ---------------------------------------------------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------------------------------------------------
function makeKit(ctx) {
  const sr = ctx.sampleRate;
  const noise = ctx.createBuffer(1, sr * 2, sr);
  const nd = noise.getChannelData(0);
  const r = rng(99);
  for (let i = 0; i < nd.length; i++) nd[i] = r() * 2 - 1;
  const impulse = ctx.createBuffer(2, Math.floor(sr * 2.4), sr);
  for (let c = 0; c < 2; c++) {
    const d = impulse.getChannelData(c); const rr = rng(7 + c); let lp = 0;
    for (let i = 0; i < d.length; i++) { const k = i / d.length; lp += (rr() * 2 - 1 - lp) * (0.55 - 0.45 * k); d[i] = lp * (1 - k) ** 2.6 * 1.6; }
  }
  const curve = (k) => { const a = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; a[i] = Math.tanh(k * x) / Math.tanh(k); } return a; };
  return { noise, impulse, driveCurve: curve(5), softCurve: curve(2.2) };
}

function env(g, t, peak, a, d, s, hold, r) {
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + a);
  g.setTargetAtTime(peak * s, t + a, d / 3);
  g.setValueAtTime(peak * s, t + a + hold);
  g.setTargetAtTime(0.0001, t + a + hold, r / 3);
}

/** One pitched note: stacked detuned oscillators -> lowpass (with an opening envelope) -> amp envelope -> destinations */
function tone(ctx, kit, o) {
  const dur = o.dur, a = o.a ?? 0.01, rel = o.r ?? 0.15;
  const amp = ctx.createGain();
  let head = amp;
  const lp = ctx.createBiquadFilter();
  lp.type = o.hp ? 'highpass' : 'lowpass';
  lp.Q.value = o.q ?? 0.7;
  const base = o.lp ?? 3000, top = base * (o.lpEnv ?? 1);
  lp.frequency.setValueAtTime(top, o.t);
  lp.frequency.setTargetAtTime(base, o.t + 0.005, o.lpDecay ?? 0.15);
  let node = lp;
  if (o.drive) { const ws = ctx.createWaveShaper(); ws.curve = kit.driveCurve; lp.connect(ws); node = ws; }
  node.connect(amp);
  env(amp.gain, o.t, o.vel ?? 0.2, a, o.d ?? 0.3, o.s ?? 0.7, Math.max(0.01, dur - a), rel);
  const end = o.t + dur + rel * 1.2 + 0.1;
  const dets = o.detune ?? [0];
  for (let i = 0; i < dets.length; i++) {
    const os = ctx.createOscillator();
    os.type = o.type ?? 'sawtooth';
    os.frequency.value = mtof(o.m) * (o.mul ?? 1);
    os.detune.value = dets[i];
    if (o.vib) { os.frequency.setValueAtTime(mtof(o.m), o.t); }
    const og = ctx.createGain(); og.gain.value = 1 / dets.length ** 0.7;
    os.connect(og).connect(lp);
    os.start(o.t); os.stop(end);
  }
  if (o.sub) {
    const os = ctx.createOscillator(); os.type = 'sine'; os.frequency.value = mtof(o.m - 12);
    const og = ctx.createGain(); og.gain.value = o.sub;
    os.connect(og).connect(amp); os.start(o.t); os.stop(end);
  }
  let p = head;
  if (o.pan) { const pn = ctx.createStereoPanner(); pn.pan.value = o.pan; p.connect(pn); p = pn; }
  p.connect(o.to);
  if (o.rev) { const s = ctx.createGain(); s.gain.value = o.rev; p.connect(s).connect(o.fx.rev); }
  if (o.dly) { const s = ctx.createGain(); s.gain.value = o.dly; p.connect(s).connect(o.fx.dly); }
}

function kick(ctx, to, t, vel = 1, o = {}) {
  const os = ctx.createOscillator(), g = ctx.createGain();
  os.frequency.setValueAtTime(o.f0 ?? 150, t);
  os.frequency.exponentialRampToValueAtTime(o.f1 ?? 46, t + (o.sweep ?? 0.09));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel * (o.vol ?? 0.9), t + 0.004);
  g.gain.setTargetAtTime(0.0001, t + 0.01, (o.decay ?? 0.16) / 3.5);
  os.connect(g).connect(to); os.start(t); os.stop(t + (o.decay ?? 0.16) * 1.6 + 0.05);
}
function noiseHit(ctx, kit, to, t, o) {
  const src = ctx.createBufferSource(); src.buffer = kit.noise; src.loopStart = 0;
  const f = ctx.createBiquadFilter(); f.type = o.type ?? 'highpass'; f.frequency.value = o.f; f.Q.value = o.q ?? 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vel, t + (o.a ?? 0.002));
  g.gain.setTargetAtTime(0.0001, t + (o.a ?? 0.002), o.decay / 3);
  src.connect(f).connect(g).connect(to);
  src.start(t, (t * 7.31) % 1.5); src.stop(t + o.decay * 1.8 + 0.05);
  return g;
}
function snare(ctx, kit, B, t, vel = 1, o = {}) {
  noiseHit(ctx, kit, B.dry, t, { f: o.f ?? 1800, vel: vel * (o.noise ?? 0.5), decay: o.decay ?? 0.17, type: 'highpass' });
  const os = ctx.createOscillator(), g = ctx.createGain();
  os.type = 'triangle'; os.frequency.setValueAtTime(o.tone ?? 200, t); os.frequency.exponentialRampToValueAtTime((o.tone ?? 200) * 0.6, t + 0.08);
  g.gain.setValueAtTime(vel * 0.45, t); g.gain.setTargetAtTime(0.0001, t, 0.03);
  os.connect(g).connect(B.dry); os.start(t); os.stop(t + 0.3);
  if (o.rev) { const s = ctx.createGain(); s.gain.value = o.rev; g.connect(s).connect(B.fx.rev); }
}
function hat(ctx, kit, B, t, vel = 0.3, open = false) {
  noiseHit(ctx, kit, B.dry, t, { f: 7500, vel, decay: open ? 0.22 : 0.04, q: 0.9 });
}
function clap(ctx, kit, B, t, vel = 0.6) {
  for (let i = 0; i < 3; i++) noiseHit(ctx, kit, B.dry, t + i * 0.011, { f: 1500, q: 1.2, type: 'bandpass', vel: vel * 0.7, decay: 0.03 });
  noiseHit(ctx, kit, B.dry, t + 0.033, { f: 1400, q: 1, type: 'bandpass', vel, decay: 0.16 });
  const s = ctx.createGain(); s.gain.value = 0.25; // a little room
  noiseHit(ctx, kit, s, t + 0.033, { f: 1400, q: 1, type: 'bandpass', vel: 0.4, decay: 0.12 }); s.connect(B.fx.rev);
}
function crash(ctx, kit, B, t, vel = 0.3) { noiseHit(ctx, kit, B.dry, t, { f: 5200, vel, decay: 1.6, a: 0.005 }); }

// ---------------------------------------------------------------------------------------------------------------------
// Harmony and melody helpers
// ---------------------------------------------------------------------------------------------------------------------
const chordNotes = (key, [root, q], oct = 0) => (QUAL[q] || QUAL.M).map((n) => key + root + n + oct);
function scaleNotes(key, scale, lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (scale.includes((((m - key) % 12) + 12) % 12)) out.push(m);
  return out;
}
/** A 16-step melody for one bar: a random walk over the scale that lands on chord tones */
function melody(r, pool, chord, key, density, steps) {
  const tones = chord.map((n) => ((n % 12) + 12) % 12);
  let idx = Math.floor(pool.length * (0.35 + r() * 0.3));
  const out = new Array(16).fill(null);
  for (const s of steps) {
    if (r() > density) continue;
    const move = [-2, -1, -1, 0, 1, 1, 2][Math.floor(r() * 7)];
    idx = clamp(idx + move, 0, pool.length - 1);
    if ((s % 8 === 0 || r() < 0.3) && !tones.includes(pool[idx] % 12)) {
      for (let k = 1; k < 4; k++) { const c = [idx + k, idx - k].find((i) => i >= 0 && i < pool.length && tones.includes(pool[i] % 12)); if (c !== undefined) { idx = c; break; } }
    }
    out[s] = pool[idx];
  }
  return out;
}
const P = (s) => [...s].map((c) => (c === 'x' ? 1 : c === 'o' ? 0.5 : 0));

// ---------------------------------------------------------------------------------------------------------------------
// Styles. Each has sections (4 bars apiece), chord progressions (one chord per bar unless noted) and a bar() that schedules
// all the notes of one bar. B carries: ctx, kit, t0, spb (seconds per beat), s16, bar, sec, chord, next, r (this bar's random),
// bus nodes dry (straight out), sc (ducked by the kick), fx.rev / fx.dly (sends), and kickAt(t) to register a kick for ducking.
// ---------------------------------------------------------------------------------------------------------------------
const at = (B, i, swing = 0) => B.t0 + (i + (i % 2 ? swing : 0)) * B.s16;

const STYLES = {
  synthwave: {
    name: 'Neon Tram FM', tag: 'Synthwave', bpm: 100, key: 45, scale: MINOR, duck: 0.45, level: 0.9, delay: 0.75,
    sections: [
      { n: 4, pad: 1, arp: 1, pg: 0 }, { n: 4, drums: 1, bass: 1, pad: 1, arp: 1, pg: 0, hat: 1 },
      { n: 4, drums: 2, bass: 2, pad: 1, lead: 1, pg: 1, hat: 1 }, { n: 4, drums: 1, bass: 1, pad: 1, arp: 1, pg: 2, hat: 1 },
      { n: 4, drums: 2, bass: 2, pad: 1, lead: 1, pg: 1, hat: 1 }, { n: 4, pad: 1, lead: 1, pg: 3, arp: 1 }
    ],
    progs: [[[0, 'm7'], [8, 'M7'], [3, 'M'], [10, 'M']], [[0, 'm'], [10, 'M'], [8, 'M7'], [10, 'M']], [[8, 'M7'], [3, 'M'], [10, 'M'], [0, 'm7']], [[0, 'm'], [0, 'm'], [8, 'M7'], [7, 'M']]],
    bar(B) {
      const { ctx, kit, sec, chord, r } = B, key = this.key;
      const sw = 0;
      const bass = Math.min(...chord) - 24 > 40 ? Math.min(...chord) - 36 : Math.min(...chord) - 24;
      if (sec.drums) {
        for (let i = 0; i < 16; i += 4) { kick(ctx, B.dry, at(B, i), 0.95, { f0: 130, f1: 48, decay: 0.2 }); B.kickAt(at(B, i)); }
        if (sec.drums === 2 && B.bar % 4 === 3) { kick(ctx, B.dry, at(B, 14), 0.7); B.kickAt(at(B, 14)); }
        snare(ctx, kit, B, at(B, 4), 1, { tone: 190, rev: 0.5, decay: 0.2 }); snare(ctx, kit, B, at(B, 12), 1, { tone: 190, rev: 0.5, decay: 0.2 });
        if (B.bar % 8 === 7) for (let i = 12; i < 16; i++) snare(ctx, kit, B, at(B, i), 0.35 + (i - 12) * 0.12, { tone: 220 });
        if (sec.hat) for (let i = 0; i < 16; i += 2) hat(ctx, kit, B, at(B, i), i % 4 === 2 ? 0.2 : 0.11, i === 14 && sec.drums === 2);
        if (B.bar % 4 === 0 && sec.drums === 2) crash(ctx, kit, B, B.t0, 0.16);
      }
      if (sec.bass) {
        const pat = sec.bass === 2 ? P('xxoxxxoxxxoxxxox') : P('x.x.x.x.x.x.x.x.'.replace(/\./g, '.'));
        for (let i = 0; i < 16; i++) {
          if (!pat[i]) continue;
          const oct = (sec.bass === 2 && i % 8 === 6) ? 12 : 0;
          tone(ctx, kit, { to: B.sc, fx: B.fx, t: at(B, i), dur: B.s16 * 0.8, m: bass + oct, type: 'sawtooth', detune: [-6, 6], lp: 380, lpEnv: 3.5, lpDecay: 0.09, q: 3, vel: 0.2, a: 0.004, s: 0.8, r: 0.05, sub: 0.7 });
        }
      }
      if (sec.pad) {
        const notes = chord.map((n) => n + 12);
        for (const m of notes) tone(ctx, kit, { to: B.sc, fx: B.fx, t: B.t0, dur: B.spb * 4 * 0.98, m, type: 'sawtooth', detune: [-14, -4, 5, 15], lp: 1500, lpEnv: 1, q: 0.5, vel: 0.05, a: 0.5, d: 1, s: 0.8, r: 0.9, rev: 0.45, pan: ((m % 5) - 2) * 0.25 });
      }
      if (sec.arp) {
        const pool = chord.concat(chord.map((n) => n + 12), chord.map((n) => n + 24));
        const order = r() < 0.5 ? [0, 1, 2, 3, 2, 1] : [0, 2, 1, 3, 4, 2];
        for (let i = 0; i < 16; i++) {
          if (sec.drums !== undefined && !sec.lead && i % 2) continue;
          const m = pool[order[i % order.length] % pool.length] + 12;
          tone(ctx, kit, { to: B.dry, fx: B.fx, t: at(B, i), dur: B.s16 * 0.7, m, type: 'square', detune: [-5, 5], lp: 1300 + 900 * Math.sin((B.bar * 16 + i) / 20), lpEnv: 1.8, lpDecay: 0.06, q: 2, vel: 0.055, a: 0.003, s: 0.5, r: 0.05, dly: 0.5, rev: 0.12, pan: (i % 2 ? 0.3 : -0.3) });
        }
      }
      if (sec.lead) {
        const pool = scaleNotes(key, MINOR, 69, 88);
        const lr = rng(hash(B.cycle, B.secIdx, B.bar % 2, 11));
        const mel = melody(lr, pool, chord, key, 0.55, [0, 3, 4, 6, 8, 10, 12, 14]);
        for (let i = 0; i < 16; i++) {
          if (mel[i] === null) continue;
          let len = 1; while (i + len < 16 && mel[i + len] === null && len < 4) len++;
          tone(ctx, kit, { to: B.dry, fx: B.fx, t: at(B, i), dur: B.s16 * (len - 0.2), m: mel[i], type: 'sawtooth', detune: [-9, 0, 9], lp: 2600, lpEnv: 1.6, lpDecay: 0.25, q: 1.2, vel: 0.085, a: 0.012, s: 0.65, r: 0.25, dly: 0.55, rev: 0.4, pan: 0.1 });
        }
      }
    }
  },

  lofi: {
    name: 'Tram Shed Beats', tag: 'Lo-fi hip-hop', bpm: 76, key: 50, scale: DORIAN, duck: 0, level: 1.0, delay: 0.75, swing: 0.28, warm: true,
    sections: [
      { n: 4, keys: 1, vinyl: 1, pg: 0 }, { n: 4, drums: 1, bass: 1, keys: 1, vinyl: 1, pg: 0 }, { n: 4, drums: 1, bass: 1, keys: 1, lead: 1, vinyl: 1, pg: 1 },
      { n: 4, drums: 1, bass: 1, keys: 1, vinyl: 1, pg: 2 }, { n: 4, drums: 2, bass: 1, keys: 1, lead: 1, vinyl: 1, pg: 1 }, { n: 4, drums: 0, keys: 1, vinyl: 1, lead: 1, pg: 3 }
    ],
    progs: [[[0, 'm9'], [5, 'M9'], [3, 'M7'], [10, 'M7']], [[0, 'm7'], [10, 'M7'], [8, 'M7'], [7, '7']], [[5, 'M9'], [4, 'm7'], [2, 'm7'], [7, '7']], [[3, 'M7'], [0, 'm9'], [5, 'M7'], [10, '7']]],
    bar(B) {
      const { ctx, kit, sec, chord, r } = B, sw = this.swing;
      if (sec.drums) {
        const kp = sec.drums === 2 ? [0, 7, 10, 14] : (B.bar % 2 ? [0, 6, 10] : [0, 9, 10]);
        for (const i of kp) kick(ctx, B.dry, at(B, i, sw), 0.9, { f0: 110, f1: 42, decay: 0.22, vol: 0.85 });
        snare(ctx, kit, B, at(B, 4, sw), 0.8, { tone: 170, noise: 0.35, f: 1200, decay: 0.2, rev: 0.4 }); snare(ctx, kit, B, at(B, 12, sw), 0.85, { tone: 170, noise: 0.35, f: 1200, decay: 0.2, rev: 0.4 });
        for (let i = 0; i < 16; i += 2) { if (r() < 0.12) continue; hat(ctx, kit, B, at(B, i, sw), (i % 4 ? 0.07 : 0.11) * (0.7 + r() * 0.6), i === 14 && r() < 0.4); }
        if (r() < 0.5) hat(ctx, kit, B, at(B, 15, sw), 0.05);
      }
      if (sec.bass) {
        const root = Math.min(...chord) - 24;
        for (const [i, off, len] of [[0, 0, 3], [6, 0, 2], [10, B.bar % 2 ? 7 : 0, 3], [14, 12, 1]]) {
          if (r() < 0.12) continue;
          tone(ctx, kit, { to: B.dry, fx: B.fx, t: at(B, i, sw), dur: B.s16 * len, m: root + off, type: 'sine', lp: 400, vel: 0.34, a: 0.01, s: 0.7, r: 0.1 });
        }
      }
      if (sec.keys) {
        // Rhodes-like: a sine plus a fast-decaying octave, played as a soft, slightly late strum
        const voicing = chord.slice();
        const hits = B.bar % 2 ? [0, 7, 10] : [0, 5, 10];
        for (const h of hits) {
          voicing.forEach((m, k) => {
            const t = at(B, h, sw) + k * 0.014 + (r() - 0.5) * 0.008;
            const len = h === 0 ? B.s16 * 6 : B.s16 * 3;
            tone(ctx, kit, { to: B.dry, fx: B.fx, t, dur: len, m, type: 'sine', vel: 0.075, a: 0.006, d: 0.8, s: 0.35, r: 0.5, lp: 3200, rev: 0.28, pan: (k - 1.5) * 0.2 });
            tone(ctx, kit, { to: B.dry, fx: B.fx, t, dur: 0.3, m: m + 12, type: 'sine', vel: 0.035, a: 0.003, d: 0.12, s: 0.05, r: 0.15, lp: 3000 });
          });
        }
      }
      if (sec.lead) {
        const pool = scaleNotes(this.key, PENT.map((n) => n + 0), 66, 84);
        const lr = rng(hash(B.cycle, B.secIdx, B.bar % 4, 5));
        const mel = melody(lr, pool, chord, this.key, 0.4, [0, 3, 6, 8, 11, 14]);
        for (let i = 0; i < 16; i++) if (mel[i] !== null) tone(ctx, kit, { to: B.dry, fx: B.fx, t: at(B, i, sw), dur: B.s16 * 2.4, m: mel[i], type: 'triangle', vel: 0.1, a: 0.01, d: 0.4, s: 0.3, r: 0.4, lp: 2200, dly: 0.5, rev: 0.45, pan: 0.2 });
      }
      if (sec.vinyl) for (let k = 0; k < 7; k++) noiseHit(ctx, kit, B.dry, B.t0 + r() * B.spb * 4, { f: 3000 + r() * 4000, vel: 0.012 + r() * 0.02, decay: 0.01, q: 0.5 });
    }
  },

  rock: {
    name: 'Westgate 104', tag: 'Driving rock', bpm: 126, key: 40, scale: MINOR, duck: 0.12, level: 0.55, delay: 0.75,
    sections: [
      { n: 4, drums: 1, gtr: 1, bass: 1, pg: 0 }, { n: 4, drums: 1, gtr: 1, bass: 1, pg: 0, lead: 0 }, { n: 4, drums: 2, gtr: 2, bass: 1, lead: 1, pg: 1 },
      { n: 4, drums: 1, gtr: 1, bass: 1, pg: 2 }, { n: 4, drums: 2, gtr: 2, bass: 1, lead: 1, pg: 1 }, { n: 4, drums: 2, gtr: 2, bass: 1, lead: 1, pg: 3 }
    ],
    progs: [[[0, '5'], [0, '5'], [8, '5'], [10, '5']], [[8, '5'], [10, '5'], [0, '5'], [0, '5']], [[0, '5'], [3, '5'], [8, '5'], [7, '5']], [[0, '5'], [10, '5'], [8, '5'], [10, '5']]],
    bar(B) {
      const { ctx, kit, sec, chord, r } = B;
      if (sec.drums) {
        const kp = sec.drums === 2 ? [0, 2, 8, 10, 11] : [0, 8, 10];
        for (const i of kp) { kick(ctx, B.dry, at(B, i), 1, { f0: 170, f1: 55, decay: 0.15, vol: 0.85 }); B.kickAt(at(B, i)); }
        snare(ctx, kit, B, at(B, 4), 1.1, { tone: 230, noise: 0.6, f: 1500, decay: 0.2, rev: 0.25 }); snare(ctx, kit, B, at(B, 12), 1.1, { tone: 230, noise: 0.6, f: 1500, decay: 0.2, rev: 0.25 });
        for (let i = 0; i < 16; i += 2) hat(ctx, kit, B, at(B, i), i % 4 === 0 ? 0.2 : 0.13, sec.drums === 2 && i === 6);
        if (B.bar % 4 === 0) crash(ctx, kit, B, B.t0, 0.22);
        if (B.bar % 4 === 3) for (let i = 12; i < 16; i++) snare(ctx, kit, B, at(B, i), 0.5 + 0.15 * (i - 12), { tone: 200 });
      }
      if (sec.bass) {
        const root = Math.min(...chord) - 12 > 46 ? Math.min(...chord) - 24 : Math.min(...chord) - 12;
        for (let i = 0; i < 16; i += 2) tone(ctx, kit, { to: B.sc, fx: B.fx, t: at(B, i), dur: B.s16 * 1.7, m: root + ((sec.bass && i === 14 && B.bar % 2) ? 7 : 0), type: 'sawtooth', lp: 520, lpEnv: 2, q: 1.5, vel: 0.2, a: 0.004, s: 0.85, r: 0.05, sub: 0.5, drive: 1 });
      }
      if (sec.gtr) {
        // distorted power chords: palm-muted eighths in verses, open ringing chords in choruses
        const g = chord.slice(0, 3);
        const muted = sec.gtr === 1;
        const steps = muted ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 6, 8, 14];
        for (const i of steps) for (const m of g) tone(ctx, kit, { to: B.dry, fx: B.fx, t: at(B, i), dur: muted ? B.s16 * 1.4 : B.s16 * 5.5, m, type: 'sawtooth', detune: [-8, 7], lp: muted ? 1400 : 2600, lpEnv: 1.3, q: 0.8, vel: muted ? 0.07 : 0.06, a: 0.004, d: 0.2, s: muted ? 0.5 : 0.85, r: muted ? 0.04 : 0.3, drive: 1, rev: 0.12, pan: m % 2 ? 0.35 : -0.35 });
      }
      if (sec.lead) {
        const pool = scaleNotes(this.key, MINOR, 64, 84);
        const lr = rng(hash(B.cycle, B.secIdx, B.bar % 2, 31));
        const mel = melody(lr, pool, chord, this.key, 0.5, [0, 3, 6, 8, 10, 12]);
        for (let i = 0; i < 16; i++) {
          if (mel[i] === null) continue;
          let len = 1; while (i + len < 16 && mel[i + len] === null && len < 5) len++;
          tone(ctx, kit, { to: B.dry, fx: B.fx, t: at(B, i), dur: B.s16 * (len - 0.1), m: mel[i], type: 'sawtooth', detune: [-6, 6], lp: 3300, lpEnv: 1.3, q: 1, vel: 0.075, a: 0.01, s: 0.8, r: 0.15, drive: 1, dly: 0.35, rev: 0.25, pan: -0.1 });
        }
      }
    }
  },

  house: {
    name: 'Docklands 124', tag: 'House', bpm: 124, key: 48, scale: MINOR, duck: 0.6, level: 0.8, delay: 0.75,
    sections: [
      { n: 4, drums: 1, pg: 0 }, { n: 4, drums: 2, bass: 1, stab: 1, pg: 0 }, { n: 4, drums: 2, bass: 1, stab: 1, pad: 1, pg: 1 }, { n: 4, drums: 0, pad: 1, riser: 1, pg: 1 },
      { n: 4, drums: 2, bass: 2, stab: 1, pad: 1, lead: 1, pg: 2 }, { n: 4, drums: 2, bass: 2, stab: 2, pad: 1, pg: 3 }
    ],
    progs: [[[0, 'm7'], [0, 'm7'], [8, 'M7'], [10, '7']], [[0, 'm9'], [5, 'm7'], [8, 'M7'], [3, 'M7']], [[0, 'm7'], [10, 'M'], [8, 'M7'], [10, 'M']], [[5, 'm7'], [0, 'm7'], [8, 'M7'], [10, '7']]],
    bar(B) {
      const { ctx, kit, sec, chord, r } = B;
      if (sec.drums) {
        for (let i = 0; i < 16; i += 4) { kick(ctx, B.dry, at(B, i), 1, { f0: 140, f1: 44, decay: 0.22, vol: 0.95 }); B.kickAt(at(B, i)); }
        if (sec.drums === 2) {
          clap(ctx, kit, B, at(B, 4), 0.55); clap(ctx, kit, B, at(B, 12), 0.55);
          for (let i = 0; i < 16; i++) { if (i % 4 === 2) hat(ctx, kit, B, at(B, i), 0.2, true); else if (i % 2 === 1) hat(ctx, kit, B, at(B, i), 0.07 + 0.04 * r()); }
          if (B.bar % 4 === 0) crash(ctx, kit, B, B.t0, 0.1);
        } else for (let i = 2; i < 16; i += 4) hat(ctx, kit, B, at(B, i), 0.16, true);
      }
      if (sec.bass) {
        const root = Math.min(...chord) - 24;
        const pat = sec.bass === 2 ? [1, 3, 6, 7, 9, 11, 14, 15] : [2, 6, 10, 14];
        for (const i of pat) tone(ctx, kit, { to: B.sc, fx: B.fx, t: at(B, i), dur: B.s16 * 1.4, m: root + (i === 15 ? 12 : i === 7 ? 7 : 0), type: 'sawtooth', lp: 300, lpEnv: 5, lpDecay: 0.1, q: 4, vel: 0.2, a: 0.003, s: 0.6, r: 0.05, sub: 0.8 });
      }
      if (sec.stab) {
        const pat = sec.stab === 2 ? [0, 3, 6, 10, 12] : (B.bar % 2 ? [3, 10] : [3, 6, 11]);
        for (const i of pat) chord.forEach((m, k) => tone(ctx, kit, { to: B.sc, fx: B.fx, t: at(B, i), dur: B.s16 * 1.3, m: m + 12, type: 'sawtooth', detune: [-10, 9], lp: 900 + 700 * Math.sin(B.bar * 0.7), lpEnv: 3, lpDecay: 0.1, q: 2, vel: 0.05, a: 0.004, s: 0.4, r: 0.12, dly: 0.5, rev: 0.25, pan: (k - 1) * 0.3 }));
      }
      if (sec.pad) for (const m of chord) tone(ctx, kit, { to: B.sc, fx: B.fx, t: B.t0, dur: B.spb * 4, m: m + 12, type: 'sawtooth', detune: [-12, 12], lp: 1100, vel: 0.035, a: 0.6, s: 0.9, r: 0.8, rev: 0.5 });
      if (sec.lead) {
        const pool = scaleNotes(this.key, MINOR, 72, 91);
        const lr = rng(hash(B.cycle, B.secIdx, B.bar % 2, 17));
        const mel = melody(lr, pool, chord, this.key, 0.45, [0, 3, 6, 10, 12, 14]);
        for (let i = 0; i < 16; i++) if (mel[i] !== null) tone(ctx, kit, { to: B.dry, fx: B.fx, t: at(B, i), dur: B.s16 * 1.5, m: mel[i], type: 'square', detune: [-4, 4], lp: 2400, lpEnv: 2, lpDecay: 0.12, q: 2, vel: 0.06, a: 0.004, s: 0.5, r: 0.2, dly: 0.6, rev: 0.3, pan: 0.2 });
      }
      if (sec.riser) {
        const g = noiseHit(ctx, kit, B.dry, B.t0, { f: 400, vel: 0.001, decay: B.spb * 4, type: 'bandpass', q: 2 });
        g.gain.cancelScheduledValues(B.t0); g.gain.setValueAtTime(0.0001, B.t0); g.gain.exponentialRampToValueAtTime(0.14, B.t0 + B.spb * 4); g.gain.setValueAtTime(0.0001, B.t0 + B.spb * 4 + 0.01);
        if (B.bar % 4 === 3) for (let i = 8; i < 16; i++) snare(ctx, kit, B, at(B, i), 0.2 + i * 0.03, { tone: 240 });
      }
    }
  },

  ambient: {
    name: 'Yarra Drift', tag: 'Chill ambient', bpm: 66, key: 52, scale: MAJOR, duck: 0, level: 1.0, delay: 0.75,
    sections: [{ n: 4, pad: 1, bell: 1, pg: 0 }, { n: 4, pad: 1, bell: 2, pg: 1 }, { n: 4, pad: 1, bell: 1, sub: 1, pg: 2 }, { n: 4, pad: 1, bell: 2, sub: 1, pg: 3 }],
    progs: [[[0, 'M9'], [9, 'm9'], [5, 'M9'], [7, 'sus']], [[0, 'M7'], [5, 'M9'], [9, 'm7'], [7, 'sus']], [[9, 'm9'], [5, 'M9'], [0, 'M9'], [7, 'M']], [[5, 'M9'], [0, 'M7'], [7, 'sus'], [9, 'm7']]],
    bar(B) {
      const { ctx, kit, sec, chord, r } = B, calm = this.calm;
      for (const [k, m] of chord.entries()) tone(ctx, kit, { to: B.dry, fx: B.fx, t: B.t0 + k * 0.03, dur: B.spb * 4 * 1.05, m: m - (calm ? 12 : 0), type: calm ? 'triangle' : 'sawtooth', detune: [-12, -3, 6, 13], lp: calm ? 700 : 1100, vel: calm ? 0.055 : 0.04, a: 1.4, d: 1, s: 0.9, r: 1.8, rev: 0.6, pan: (k % 3 - 1) * 0.3 });
      if (sec.sub || calm) tone(ctx, kit, { to: B.dry, fx: B.fx, t: B.t0, dur: B.spb * 4, m: Math.min(...chord) - 24, type: 'sine', vel: calm ? 0.12 : 0.16, a: 0.8, s: 1, r: 1, lp: 300 });
      if (sec.bell && !calm) {
        const pool = scaleNotes(this.key, MAJOR, 72, 96);
        const lr = rng(hash(B.cycle, B.secIdx, B.bar, 3));
        const mel = melody(lr, pool, chord, this.key, sec.bell === 2 ? 0.28 : 0.16, [0, 2, 3, 4, 6, 8, 10, 12, 14]);
        for (let i = 0; i < 16; i++) if (mel[i] !== null) {
          tone(ctx, kit, { to: B.dry, fx: B.fx, t: at(B, i), dur: 0.4, m: mel[i], type: 'sine', vel: 0.09, a: 0.004, d: 0.9, s: 0.02, r: 0.9, lp: 5000, dly: 0.8, rev: 0.7, pan: lr() - 0.5 });
          tone(ctx, kit, { to: B.dry, fx: B.fx, t: at(B, i), dur: 0.2, m: mel[i], mul: 2.76, type: 'sine', vel: 0.018, a: 0.002, d: 0.3, s: 0.01, r: 0.3, lp: 8000, rev: 0.5 });
        }
      }
      if (calm && r() < 0.5) { // an occasional low, distant tone
        tone(ctx, kit, { to: B.dry, fx: B.fx, t: B.t0 + r() * B.spb * 3, dur: 2, m: chord[chord.length - 1] + 12, type: 'sine', vel: 0.03, a: 0.6, d: 1.5, s: 0.1, r: 2.5, lp: 900, dly: 0.7, rev: 0.9 });
      }
    }
  },

  // not on the radio: the bed on foot, and the tenser track
  foot: {
    hidden: true, name: 'Laneway Hush', bpm: 56, key: 50, scale: MINOR, duck: 0, level: 0.4, delay: 0.5, calm: true, base: 'ambient',
    sections: [{ n: 4, pad: 1, bell: 0, pg: 0 }, { n: 4, pad: 1, bell: 0, sub: 1, pg: 1 }],
    progs: [[[0, 'm9'], [8, 'M7'], [3, 'M9'], [7, 'sus']], [[0, 'm7'], [5, 'm7'], [8, 'M7'], [10, 'sus']]]
  },
  tense: {
    hidden: true, name: 'Back Alley', tag: 'Tension', bpm: 104, key: 38, scale: MINOR, duck: 0.35, level: 0.5, delay: 0.75,
    sections: [{ n: 4, pulse: 1, hits: 1, pg: 0 }, { n: 4, pulse: 2, hits: 1, riser: 1, pg: 1 }, { n: 4, pulse: 2, hits: 2, pg: 0 }],
    progs: [[[0, '5'], [0, '5'], [1, '5'], [0, '5']], [[0, '5'], [3, '5'], [0, '5'], [1, '5']]],
    bar(B) {
      const { ctx, kit, sec, chord, r } = B;
      const root = Math.min(...chord);
      for (let i = 0; i < 16; i += 2) tone(ctx, kit, { to: B.sc, fx: B.fx, t: at(B, i), dur: B.s16 * 1.6, m: root - 12 + (sec.pulse === 2 && i % 8 === 6 ? 12 : 0), type: 'sawtooth', lp: 260 + 240 * Math.sin((B.bar * 16 + i) / 9) ** 2, lpEnv: 3, lpDecay: 0.12, q: 5, vel: 0.2, a: 0.003, s: 0.8, r: 0.05, sub: 0.8, drive: 1 });
      for (const i of [0, 8]) { kick(ctx, B.dry, at(B, i), 0.8, { f0: 100, f1: 38, decay: 0.3 }); B.kickAt(at(B, i)); }
      if (sec.pulse === 2) for (const i of [4, 12]) { kick(ctx, B.dry, at(B, i), 0.5, { f0: 90, f1: 40 }); noiseHit(ctx, kit, B.dry, at(B, i), { f: 900, type: 'bandpass', q: 1.5, vel: 0.3, decay: 0.12 }); }
      for (let i = 0; i < 16; i++) if (i % 2 || r() < 0.3) hat(ctx, kit, B, at(B, i), 0.04 + 0.04 * r());
      // dissonant stabs: root with a minor second and tritone, now and then
      if (sec.hits && (B.bar % 2 === 1 || sec.hits === 2)) for (const n of [12, 13, 18]) tone(ctx, kit, { to: B.dry, fx: B.fx, t: at(B, sec.hits === 2 ? 10 : 6), dur: 0.5, m: root + 24 + n, type: 'square', lp: 1200, lpEnv: 2, lpDecay: 0.2, vel: 0.03, a: 0.01, s: 0.4, r: 0.5, rev: 0.6, dly: 0.5 });
      if (sec.riser && B.bar % 4 === 3) {
        const g = noiseHit(ctx, kit, B.dry, B.t0, { f: 1500, vel: 0.001, decay: 3, type: 'bandpass', q: 3 });
        g.gain.cancelScheduledValues(B.t0); g.gain.setValueAtTime(0.0001, B.t0); g.gain.exponentialRampToValueAtTime(0.12, B.t0 + B.spb * 4); g.gain.setValueAtTime(0.0001, B.t0 + B.spb * 4 + 0.01);
      }
      for (const m of chord) tone(ctx, kit, { to: B.dry, fx: B.fx, t: B.t0, dur: B.spb * 4, m: m + 12, type: 'sawtooth', detune: [-18, 18], lp: 500, vel: 0.03, a: 0.8, s: 0.9, r: 1, rev: 0.4 });
    }
  }
};
STYLES.foot.bar = STYLES.ambient.bar;
export const RADIO = ['synthwave', 'lofi', 'rock', 'house', 'ambient'];
export const STATION_NAMES = RADIO.map((id) => STYLES[id].name);

// ---------------------------------------------------------------------------------------------------------------------
// Engine: owns the effects chain and any number of cross-fading tracks, queues bars ahead of the audio clock
// ---------------------------------------------------------------------------------------------------------------------
export function createEngine(ctx, destination) {
  const kit = makeKit(ctx);
  const mix = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -17; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = 0.008; comp.release.value = 0.2;
  const soft = ctx.createWaveShaper(); soft.curve = kit.softCurve; // keeps peaks under full scale
  const trim = ctx.createGain(); trim.gain.value = 0.85;
  mix.connect(comp).connect(soft).connect(trim).connect(destination);
  // shared reverb and a filtered feedback delay
  const revIn = ctx.createGain(), rev = ctx.createConvolver(); rev.buffer = kit.impulse;
  const revOut = ctx.createGain(); revOut.gain.value = 0.9;
  revIn.connect(rev).connect(revOut).connect(mix);
  const dlyIn = ctx.createGain(), dly = ctx.createDelay(2), fb = ctx.createGain(), dlp = ctx.createBiquadFilter();
  dlp.type = 'lowpass'; dlp.frequency.value = 2400; fb.gain.value = 0.42; dly.delayTime.value = 0.45;
  dlyIn.connect(dly); dly.connect(dlp).connect(fb).connect(dly); dlp.connect(mix);
  const fx = { rev: revIn, dly: dlyIn };
  const tracks = [];
  let lookahead = 1.1;

  function startTrack(id, { fade = 1.5, at: t0 = ctx.currentTime + 0.05 } = {}) {
    const style = STYLES[id];
    const out = ctx.createGain(); out.gain.setValueAtTime(0.0001, t0); out.gain.linearRampToValueAtTime(style.level, t0 + fade);
    const dry = ctx.createGain(), sc = ctx.createGain();
    dry.connect(out); sc.connect(out); out.connect(mix);
    for (const t of tracks) fadeOut(t, fade);
    const tr = { id, style, out, dry, sc, next: t0 + 0.02, bar: 0, dead: false, scGain: sc.gain, lastKick: -1 };
    tr.scGain.setValueAtTime(1, t0);
    tracks.push(tr);
    dly.delayTime.setTargetAtTime(Math.min(1.9, 60 / style.bpm * (style.delay ?? 0.75)), t0, 0.3);
    return tr;
  }
  function fadeOut(tr, fade = 1.5) {
    if (tr.fading) return;
    tr.fading = true;
    const t = ctx.currentTime;
    tr.out.gain.cancelScheduledValues(t); tr.out.gain.setValueAtTime(tr.out.gain.value, t); tr.out.gain.linearRampToValueAtTime(0.0001, t + fade);
    tr.endAt = t + fade + 0.1;
  }
  function scheduleBar(tr) {
    const st = tr.style, spb = 60 / st.bpm, bar = tr.bar;
    const total = st.sections.reduce((a, s) => a + s.n, 0);
    const within = bar % total, cycle = Math.floor(bar / total);
    let secIdx = 0, acc = 0;
    while (acc + st.sections[secIdx].n <= within) acc += st.sections[secIdx++].n;
    const sec = st.sections[secIdx];
    const prog = st.progs[(sec.pg + cycle) % st.progs.length];
    const step = Math.floor((within - acc) * 1) % prog.length;
    const next = prog[(step + 1) % prog.length];
    const B = {
      ctx, kit, t0: tr.next, spb, s16: spb / 4, bar, cycle, sec, secIdx, fx, dry: tr.dry, sc: tr.sc,
      chord: chordNotes(st.key, prog[step], 12), next: chordNotes(st.key, next, 12),
      r: rng(hash(bar, cycle, secIdx, st.bpm)),
      kickAt(t) {
        if (!st.duck) return;
        const g = tr.scGain; g.setValueAtTime(1 - st.duck, t); g.linearRampToValueAtTime(1, t + 0.28);
      }
    };
    (st.bar).call(st, B);
    tr.next += spb * 4; tr.bar++;
  }
  /** Queue bars until `until` (audio-clock seconds) and retire faded-out tracks */
  function tick(until = ctx.currentTime + lookahead) {
    for (let i = tracks.length - 1; i >= 0; i--) {
      const tr = tracks[i];
      if (tr.endAt && ctx.currentTime > tr.endAt) { tr.out.disconnect(); tracks.splice(i, 1); continue; }
      if (tr.fading) continue;
      while (tr.next < until) scheduleBar(tr);
    }
  }
  return {
    ctx, fx, tracks, startTrack, fadeOut, tick, out: trim,
    stopAll(fade = 0.6) { for (const t of tracks) fadeOut(t, fade); },
    get current() { return tracks.find((t) => !t.fading)?.id ?? null; },
    setLookahead(s) { lookahead = s; }
  };
}

/** Render `seconds` of one style offline (for checks): returns the mono samples */
export async function renderStyle(id, seconds = 8, rate = 22050) {
  const ctx = new OfflineAudioContext(1, Math.floor(seconds * rate), rate);
  const eng = createEngine(ctx, ctx.destination);
  eng.startTrack(id, { fade: 0.2, at: 0 });
  eng.tick(seconds + 0.5);
  const buf = await ctx.startRendering();
  return Array.from(buf.getChannelData(0));
}

// ---------------------------------------------------------------------------------------------------------------------
// The in-game controller
// ---------------------------------------------------------------------------------------------------------------------
const CSS = `
.mu-toast { position: fixed; top: 74px; left: 50%; transform: translate(-50%, -6px); z-index: 36; padding: 7px 16px; border-radius: 999px; background: rgba(8,10,16,.78); color: #fff;
  font: 600 14px/1.2 Inter, system-ui, sans-serif; letter-spacing: .02em; pointer-events: none; opacity: 0; transition: opacity .25s, transform .25s; white-space: nowrap; }
.mu-toast.on { opacity: 1; transform: translate(-50%, 0); }
.mu-toast small { opacity: .6; font-weight: 500; margin-left: 8px; }
.mu-panel { position: fixed; z-index: 40; right: 12px; top: 56px; width: 220px; padding: 12px; border-radius: 12px; background: rgba(12,14,22,.94); color: #fff; font: 13px/1.4 Inter, system-ui, sans-serif;
  box-shadow: 0 8px 28px rgba(0,0,0,.45); display: none; }
.mu-panel.on { display: block; }
.mu-panel h4 { margin: 0 0 8px; font-size: 13px; letter-spacing: .04em; }
.mu-panel label { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
.mu-panel input[type=range] { flex: 1; }
.mu-panel button { margin-top: 6px; width: 100%; padding: 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #fff; font: inherit; cursor: pointer; }
.mu-touch { position: fixed; right: 14px; top: 130px; z-index: 35; display: none; padding: 8px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,.35); background: rgba(8,10,16,.7); color: #fff; font: 600 13px Inter, system-ui, sans-serif; }
body.touch-enabled .mu-touch.car { display: block; }
`;

export function createMusic({ audioSystem = null, controllerManager, voices = null, missionSystem = null, wanted = null, gameplay = null, isCinematic = () => document.body.classList.contains('cinematic') } = {}) {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* storage is optional */ }
  const settings = { volume: clamp(saved.volume ?? 0.7, 0, 1), muted: !!saved.muted, station: Number.isInteger(saved.station) ? saved.station : null };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ } };
  const api = { supported: !!Ctor };
  if (!Ctor) return Object.assign(api, { state: { playing: false, station: null, level: 0 } });

  let ctx = null, eng = null, master = null, duckG = null, analyser = null, buf = null;
  let gestured = false, timer = 0, scene = 'none', station = settings.station, inCar = false, ducked = 1;
  let toastEl = null, toastT = 0, suspended = false, wantSuspend = false;

  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  toastEl = document.createElement('div'); toastEl.className = 'mu-toast'; document.body.append(toastEl);
  function toast(name, sub = '') {
    toastEl.innerHTML = `♪ ${name}${sub ? `<small>${sub}</small>` : ''}`;
    toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2600);
  }

  function ensure() {
    if (ctx) return true;
    if (!gestured) return false;
    ctx = new Ctor({ latencyHint: 'playback' });
    master = ctx.createGain(); master.gain.value = 0;
    duckG = ctx.createGain();
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; buf = new Float32Array(1024);
    eng = createEngine(ctx, duckG);
    duckG.connect(master); master.connect(ctx.destination); master.connect(analyser);
    return true;
  }
  const level = () => { if (!analyser || ctx.state !== 'running') return 0; analyser.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };

  const silent = () => settings.muted || (audioSystem && audioSystem.supported && audioSystem.enabled === false) || document.hidden;
  const wantedScene = () => {
    const mode = controllerManager?.activeMode;
    if (mode === 'car' && station !== null && station >= 0) return `radio:${station}`;
    const tense = (wanted?.stars > 0) || (missionSystem?.onJob && (gameplay?.combat?.alive ?? 0) > 0);
    return tense ? 'tense' : (mode === 'car' ? 'none' : 'foot');
  };
  function applyScene(next) {
    if (next === scene) return;
    scene = next;
    if (!eng) return;
    if (next === 'none') eng.stopAll(1.2);
    else eng.startTrack(next.startsWith('radio:') ? RADIO[+next.slice(6)] : next, { fade: next.startsWith('radio') ? 0.8 : 2.5 });
  }
  function pump() {
    if (!ensure()) return;
    const mute = silent();
    if (mute && !suspended) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      if (!wantSuspend) { wantSuspend = true; setTimeout(() => { if (wantSuspend && silent()) { ctx.suspend().catch(() => {}); suspended = true; } wantSuspend = false; }, 250); }
    } else if (!mute && (suspended || ctx.state === 'suspended')) {
      suspended = false; wantSuspend = false;
      ctx.resume().catch(() => {});
    }
    if (mute) return;
    if (ctx.state !== 'running') { ctx.resume().catch(() => {}); return; }
    const mode = controllerManager?.activeMode;
    const nowCar = mode === 'car';
    if (nowCar !== inCar) {
      inCar = nowCar;
      if (inCar) {
        if (station === null) { station = Math.floor(Math.random() * RADIO.length); settings.station = station; persist(); }
        toast(station >= 0 ? STATION_NAMES[station] : 'Radio off', station >= 0 ? STYLES[RADIO[station]].tag : '[U] station');
      }
      touchBtn.classList.toggle('car', inCar);
    }
    applyScene(wantedScene());
    const target = (voices?.speaking || missionSystem?.busy || isCinematic()) ? 0.3 : 1;
    if (target !== ducked) { ducked = target; duckG.gain.setTargetAtTime(target, ctx.currentTime, target < 1 ? 0.12 : 0.6); }
    master.gain.setTargetAtTime(settings.volume * 0.9, ctx.currentTime, 0.1);
    eng.tick();
  }

  function setStation(i, announce = true) {
    const n = RADIO.length;
    station = (((i + 1) % (n + 1)) + n + 1) % (n + 1) - 1; // -1 is Radio off
    settings.station = station; persist();
    if (announce) toast(station >= 0 ? STATION_NAMES[station] : 'Radio off', station >= 0 ? STYLES[RADIO[station]].tag : '');
    if (ctx && inCar) applyScene(wantedScene());
    return station;
  }
  const next = (d = 1) => { if (inCar) setStation(station + d); };

  // ---- UI: toolbar note button + panel, touch button, U key
  const touchBtn = document.createElement('button');
  touchBtn.className = 'mu-touch'; touchBtn.type = 'button'; touchBtn.textContent = '♪ Next station';
  document.body.append(touchBtn);
  touchBtn.addEventListener('click', () => { gestured = true; next(1); });
  const panel = document.createElement('div'); panel.className = 'mu-panel';
  panel.innerHTML = '<h4>MUSIC</h4><label>Volume <input type="range" min="0" max="100" step="1" data-mu="vol"></label><label><input type="checkbox" data-mu="mute"> Mute music</label><button type="button" data-mu="next">Next station [U]</button>';
  document.body.append(panel);
  const volEl = panel.querySelector('[data-mu=vol]'), muteEl = panel.querySelector('[data-mu=mute]');
  volEl.value = Math.round(settings.volume * 100); muteEl.checked = settings.muted;
  volEl.addEventListener('input', () => { settings.volume = volEl.value / 100; persist(); });
  muteEl.addEventListener('change', () => { settings.muted = muteEl.checked; persist(); pump(); });
  panel.querySelector('[data-mu=next]').addEventListener('click', () => next(1));
  const soundBtn = document.getElementById('btn-sound');
  if (soundBtn) {
    const b = document.createElement('button');
    b.id = 'btn-music'; b.className = 'tool-btn icon-only'; b.type = 'button'; b.title = 'Music: volume, mute, radio [U]'; b.setAttribute('aria-label', 'Music settings'); b.textContent = '♪';
    soundBtn.after(b);
    b.addEventListener('click', () => panel.classList.toggle('on'));
  }
  const typing = (e) => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  window.addEventListener('keydown', (e) => {
    gestured = true;
    if (e.code === 'KeyU' && !e.repeat && !typing(e) && !e.ctrlKey && !e.metaKey && !e.altKey) next(e.shiftKey ? -1 : 1);
  });
  for (const ev of ['pointerdown', 'touchstart', 'click']) window.addEventListener(ev, () => { gestured = true; }, { capture: true, passive: true });

  timer = setInterval(() => { try { pump(); } catch (e) { console.warn('[music]', e); } }, 100);
  document.addEventListener('visibilitychange', () => { try { pump(); } catch { /* ignore */ } });

  Object.defineProperties(api, {
    state: { get: () => ({
      station: station !== null && station >= 0 ? STATION_NAMES[station] : null, stationIndex: station, scene,
      playing: !!ctx && ctx.state === 'running' && !silent() && scene !== 'none' && !!eng?.current,
      level: level(), muted: settings.muted, volume: settings.volume, inCar, context: ctx?.state ?? 'none'
    }) }
  });
  Object.assign(api, {
    nextStation: next, setStation, setMuted(m) { settings.muted = !!m; muteEl.checked = settings.muted; persist(); pump(); },
    setVolume(v) { settings.volume = clamp(v, 0, 1); volEl.value = Math.round(settings.volume * 100); persist(); },
    get engine() { return eng; }, stations: STATION_NAMES, dispose() { clearInterval(timer); ctx?.close().catch(() => {}); }
  });
  return api;
}
