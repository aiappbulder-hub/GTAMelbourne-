// The car's horn, and the police siren, synthesised on the game's audio context (no sound files).
//  - Horn: two sawtooth tones a major third apart (about 400 and 500 Hz) through a low-pass, held for as long as the key
//    or the button is down. Short taps give a short beep.
//  - Siren: a wail (a tone swept between 650 and 1500 Hz about once a second and a bit) whose loudness follows `level` (0..1),
//    which is how close the nearest police unit is. Level 0 switches it off.
export function createCarSounds({ audioSystem }) {
  let horn = null, siren = null;
  const ready = () => {
    const c = audioSystem?.context;
    return c && c.state === 'running' && audioSystem.master ? c : null;
  };

  function hornOn() {
    if (horn) return;
    const c = ready();
    if (!c) return;
    const out = c.createGain();
    out.gain.value = 0;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const a = c.createOscillator(), b = c.createOscillator();
    a.type = b.type = 'sawtooth';
    a.frequency.value = 405;
    b.frequency.value = 507;
    a.connect(lp);
    b.connect(lp);
    lp.connect(out);
    out.connect(audioSystem.master);
    a.start();
    b.start();
    const t = c.currentTime;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.32, t + 0.025); // a quick attack
    horn = { a, b, out, c };
  }
  function hornOff() {
    if (!horn) return;
    const { a, b, out, c } = horn;
    horn = null;
    const t = c.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.linearRampToValueAtTime(0, t + 0.06);
    a.stop(t + 0.08);
    b.stop(t + 0.08);
  }

  function sirenLevel(level) {
    if (level <= 0.01) {
      if (!siren) return;
      const { o, lfo, out, c } = siren;
      siren = null;
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.linearRampToValueAtTime(0, t + 0.15);
      o.stop(t + 0.2);
      lfo.stop(t + 0.2);
      return;
    }
    if (!siren) {
      const c = ready();
      if (!c) return;
      const out = c.createGain();
      out.gain.value = 0;
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = 1075;
      const lfo = c.createOscillator(), depth = c.createGain();
      lfo.frequency.value = 0.85;
      depth.gain.value = 425; // 1075 +- 425 Hz
      lfo.connect(depth);
      depth.connect(o.frequency);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      o.connect(lp);
      lp.connect(out);
      out.connect(audioSystem.master);
      o.start();
      lfo.start();
      siren = { o, lfo, out, c };
    }
    const t = siren.c.currentTime;
    siren.out.gain.setTargetAtTime(Math.min(1, level) * 0.07, t, 0.12);
  }

  return {
    horn(on) { if (on) hornOn(); else hornOff(); },
    get hornOn() { return !!horn; },
    siren: sirenLevel
  };
}
