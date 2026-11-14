// tools/melbourne/test-music.cjs: the synthesised music. Serve melbourne3d/ (python3 -m http.server 8963), then:
//   node tools/melbourne/test-music.cjs      (PORT=8963 by default)
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8963;
const URL_ = `http://localhost:${PORT}/index.html?webgl&nofilm&nointro&quality=low`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 360, height: 230 } });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('m')) { sessionStorage.setItem('m', '1'); localStorage.removeItem('gta-melbourne3d-music'); } } catch (e) {} });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ok = (cond, what) => { log(cond ? 'PASS' : 'FAIL', what); if (!cond) process.exitCode = 1; };
  const st = () => p.evaluate(() => __city.music.state);
  const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { const s = await st(); if (fn(s)) return s; await p.waitForTimeout(300); } return st(); };

  await p.goto(URL_, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.music && __city.gameplay, null, { timeout: 480000 });
  // offline mix check, per style: not silent, no clipping, and the styles differ
  const feats = await p.evaluate(async () => {
    const m = await import('/js/music.js');
    const out = {};
    for (const id of ['synthwave', 'lofi', 'rock', 'house', 'ambient', 'foot', 'tense']) {
      const x = await m.renderStyle(id, 8);
      let peak = 0, s = 0, z = 0, hi = 0;
      for (let i = 0; i < x.length; i++) { const v = x[i]; peak = Math.max(peak, Math.abs(v)); s += v * v; if (i && (x[i - 1] < 0) !== (v < 0)) z++; if (i) hi += (v - x[i - 1]) ** 2; }
      out[id] = { peak, rms: Math.sqrt(s / x.length), zcr: z / x.length, bright: Math.sqrt(hi / x.length) };
    }
    return out;
  });
  for (const [id, f] of Object.entries(feats)) {
    log(id, JSON.stringify(f));
    ok(f.peak < 1 && f.peak > 0.05, `${id}: peak ${f.peak.toFixed(3)} under 1 and not silent`);
    ok(f.rms > 0.01 && f.rms < 0.4, `${id}: rms ${f.rms.toFixed(3)} sensible`);
  }
  const ids = Object.keys(feats);
  let same = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = feats[ids[i]], c = feats[ids[j]];
    const d = Math.abs(a.rms - c.rms) / (a.rms + c.rms) + Math.abs(a.zcr - c.zcr) / (a.zcr + c.zcr) + Math.abs(a.bright - c.bright) / (a.bright + c.bright);
    if (d < 0.05) { same++; log('too similar', ids[i], ids[j], d); }
  }
  ok(same === 0, 'every style measures differently');

  // in-game: nothing before a gesture; a click, then a car starts the radio
  let s = await st();
  ok(!s.playing && s.context === 'none', 'no audio context before a user gesture');
  await p.keyboard.press('Digit1'); await p.waitForTimeout(600);
  await p.mouse.click(180, 115);
  s = await until((x) => x.scene === 'foot');
  ok(s.scene === 'foot', `on foot after a click: ambient bed (${s.scene})`);
  s = await until((x) => x.playing && x.level > 0.0005, 30000);
  ok(s.playing && s.level > 0, `foot ambience audible (level ${s.level.toFixed(4)})`);
  await p.evaluate(() => document.querySelector('[data-mode=car]').click());
  s = await until((x) => x.inCar && x.scene.startsWith('radio:') && x.level > 0.001, 30000);
  ok(s.playing && s.station && s.scene.startsWith('radio:'), `radio on in the car: ${JSON.stringify(s)}`);
  ok(s.level > 0.001, `analyser level above zero (${s.level.toFixed(4)})`);
  const first = s.station;
  await p.keyboard.press('KeyU');
  s = await until((x) => x.station !== first, 8000);
  ok(s.station !== first, `U changes station (${first} -> ${s.station})`);
  s = await until((x) => x.playing && x.level > 0.001, 30000);
  ok(s.level > 0.001, `new station audible (${s.level.toFixed(4)})`);
  ok(await p.evaluate(() => document.querySelector('.mu-toast').textContent.includes('♪')), 'station toast shown');
  await p.evaluate(() => __city.music.setMuted(true));
  s = await until((x) => x.level < 0.0005, 8000);
  ok(!s.playing && s.level < 0.0005, `mute silences it (level ${s.level.toFixed(5)})`);
  await p.evaluate(() => __city.music.setMuted(false));
  s = await until((x) => x.playing && x.level > 0.001, 30000);
  ok(s.playing, 'unmute brings it back');
  await p.evaluate(() => document.querySelector('[data-mode=person]').click());
  s = await until((x) => !x.inCar && x.scene === 'foot', 10000);
  ok(!s.inCar && !/^radio/.test(s.scene), `leaving the car stops the radio (scene ${s.scene})`);
  ok(errs.length === 0, `no page errors ${JSON.stringify(errs.slice(0, 5))}`);
  await b.close();
})().catch((e) => { console.error('ERROR', e.message.slice(0, 600)); process.exit(1); });
