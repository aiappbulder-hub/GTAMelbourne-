// tools/melbourne/check-music.cjs: offline audio quality of every station (js/music.js renderStyle, OfflineAudioContext, 44.1 kHz).
// Serve the repo root (python3 -m http.server 9079; PORT, BASE=/melbourne3d), then: node tools/melbourne/check-music.cjs [seconds]
// Per station: peak (must be < 0.9), DC offset (|mean| < 0.01), clicks (a step in the sub-1.5 kHz signal much bigger than
// the signal around it (max(0.03, 8 x the mean step of the previous 64 samples)); at most 60 per 10 s allowed (note onsets and the tense track's stabs register a few)), and the nodes the engine creates per second.
const { chromium } = require('playwright');
const PORT = process.env.PORT || 9079, BASE = process.env.BASE ?? '/melbourne3d';
const SECS = +(process.argv[2] || 10);
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message.slice(0, 200)));
  await p.goto(`http://localhost:${PORT}${BASE}/js/`);
  const res = await p.evaluate(async ({ BASE, SECS, MUSIC }) => {
    const m = await import(`${BASE}/js/${MUSIC}`);
    // count the nodes created while rendering
    const proto = BaseAudioContext.prototype, counts = { n: 0 };
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (!/^create/.test(k)) continue;
      const f = proto[k];
      proto[k] = function (...a) { counts.n++; return f.apply(this, a); };
    }
    const out = {};
    for (const id of ['synthwave', 'lofi', 'rock', 'house', 'ambient', 'foot', 'tense']) {
      counts.n = 0;
      const x = await m.renderStyle(id, SECS, 44100);
      // clicks: a step in the signal below ~1.5 kHz (hats and noise bursts are not clicks, a gain or envelope jump is): the
      // sample step of a two-pole lowpass of the signal, bigger than max(0.03, 8 x the mean step of the 64 samples before)
      let peak = 0, sum = 0, clicks = 0, worst = 0, y1 = 0, y2 = 0, py = 0, win = 0, quiet = 0;
      const W = 64, ds = new Float32Array(x.length), kf = 1 - Math.exp(-2 * Math.PI * 1500 / 44100);
      for (let i = 0; i < x.length; i++) {
        const v = x[i]; peak = Math.max(peak, Math.abs(v)); sum += v;
        y1 += (v - y1) * kf; y2 += (y1 - y2) * kf;
        const d = Math.abs(y2 - py); py = y2; ds[i] = d;
        if (quiet > 0) quiet--; // (one click is one event: its edge lasts a few samples)
        else if (i > 2000 && d > Math.max(0.03, 8 * win / W)) { clicks++; worst = Math.max(worst, d); quiet = 40; }
        win += d; if (i > W) win -= ds[i - W];
      }
      out[id] = { peak: +peak.toFixed(3), dc: +(sum / x.length).toFixed(5), clicks, worstStep: +worst.toFixed(3), nodesPerSec: Math.round(counts.n / SECS) };
    }
    return out;
  }, { BASE, SECS, MUSIC: process.env.MUSIC || "music.js" });
  let bad = false;
  for (const [id, r] of Object.entries(res)) {
    const ok = r.peak < 0.9 && Math.abs(r.dc) < 0.01 && r.clicks <= 60;
    if (!ok) bad = true;
    console.log(ok ? 'PASS' : 'FAIL', id.padEnd(10), JSON.stringify(r));
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
