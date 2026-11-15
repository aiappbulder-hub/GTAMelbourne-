// tools/melbourne/test-voices-recorded.cjs: do the RECORDED character voices play (and not the browser's speech voice)?
// Serves from the REPOSITORY ROOT (the clips are /assets/audio and /data/character-voices.json, outside melbourne3d/; a
// server rooted in melbourne3d/ cannot reach them, which is how a missing-voices bug once went unnoticed):
//   python3 -m http.server 9107       (in the repository root)
//   PORT=9107 node melbourne3d/tools/melbourne/test-voices-recorded.cjs         (a real mouse click is the only gesture)
// Plays the opening film (from its fifth shot, or all of it with FULL=1) and the first job's cut scene. For every line
// that has a recording asserts: its clip was fetched (200) and decoded, an AudioBufferSourceNode of the clip's length was
// started, speechSynthesis.speak was NOT called for it, and the voice output had RMS > 0 while it played. Any failed or
// non-200 request for the data or a clip, and any page error, fails the test.
const { chromium } = require('playwright');
// (BASE=https://aiappbulder-hub.github.io/GTAMelbourne- runs it against the live site instead)
const URL_ = `${process.env.BASE || `http://localhost:${process.env.PORT || 9107}`}/melbourne3d/index.html?webgl&quality=low&nofilm&nointro`;
const CAP = Number(process.env.CAP_MIN || 15) * 60000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const args = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'];
  if (process.env.AUTOPLAY) args.push('--autoplay-policy=no-user-gesture-required');
  const b = await chromium.launch({ args });
  const ctx = await b.newContext({ viewport: { width: 360, height: 230 } });
  await ctx.addInitScript(() => {
    try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); } } catch (e) { /* ignore */ }
    window.__speech = []; window.__starts = []; window.__decoded = 0; window.__calls = []; window.__rms = []; window.__warn = [];
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (u) => { window.__speech.push({ t: performance.now() / 1000, text: u.text }); try { speak(u); } catch (e) { /* none installed */ } };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) {
      if (this.buffer) window.__starts.push({ t: performance.now() / 1000, raw: this.buffer.duration, state: this.context.state });
      return start.apply(this, a);
    };
    const dec = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (...a) { window.__decoded++; return dec.apply(this, a); };
  });
  const p = await ctx.newPage();
  const errs = [], net = [], warns = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (/\[voices\]/.test(m.text())) warns.push(m.text()); });
  p.on('response', (r) => { if (/character-voices\.json|assets\/audio\//.test(r.url())) net.push({ url: r.url(), status: r.status() }); });
  p.on('requestfailed', (r) => { if (/character-voices\.json|assets\/audio\//.test(r.url())) net.push({ url: r.url(), status: 0 }); });
  const ok = (cond, what) => { log(cond ? 'PASS' : 'FAIL', what); if (!cond) process.exitCode = 1; };
  const until = (fn, ms, arg) => p.waitForFunction(fn, arg, { timeout: ms, polling: 250 });
  await p.goto(URL_, { timeout: 120000 });
  // A real click is the only gesture. By default it comes while the city is still loading (as a player's does), before the
  // audio system exists to hear it: the voices must still play. LATE=1 clicks once everything has loaded instead.
  if (!process.env.LATE) { await p.waitForTimeout(2500); await p.mouse.click(180, 115); }
  await until(() => window.__city && __city.missions && __city.gameplay && __city.voices && __city.intro && __city.audio, 480000);
  await p.waitForTimeout(1500);
  if (process.env.LATE) await p.mouse.click(180, 115);
  await until(() => __city.audio.context && __city.audio.context.state === 'running', 30000).catch(() => {});
  log(`voices ready: ${await p.evaluate(() => __city.voices.ready)}; audio context: ${await p.evaluate(() => __city.audio.context && __city.audio.context.state)}`);
  await p.evaluate(() => {
    const v = __city.voices, orig = v.sayText;
    v.sayText = (text, opts = {}) => {
      const line = v.lines.find((l) => l.text === text);
      window.__calls.push({ t: performance.now() / 1000, text, recorded: !!line, raw: line ? line.duration : 0, file: line ? line.file : null });
      return orig(text, opts);
    };
    // the loudness of the voice bus, sampled every 50 ms
    setInterval(() => window.__rms.push([performance.now() / 1000, v.level]), 50);
  });
  // software drawing stalls the page for seconds: skip only the draw call; the game logic, audio and timers run as normal
  await p.evaluate(() => { __city.renderer.render = () => {}; if (__city.renderer.renderAsync) __city.renderer.renderAsync = async () => {}; });

  const scene = async (name, from, minLines) => {
    const calls = await p.evaluate((n) => window.__calls.slice(n), from);
    const rec = calls.filter((c) => c.recorded);
    const speech = await p.evaluate(() => window.__speech.slice());
    const starts = await p.evaluate(() => window.__starts.slice());
    const rms = await p.evaluate(() => window.__rms.slice());
    log(`--- ${name}: ${calls.length} lines, ${rec.length} with a recording`);
    ok(rec.length >= minLines, `${name}: at least ${minLines} lines have a recording (${rec.length})`);
    for (const c of rec) {
      // the first buffer source started at/after the call with this clip's raw length
      const s = starts.find((x) => x.t >= c.t - 0.05 && Math.abs(x.raw - c.raw) < 0.12);
      const said = speech.filter((x) => x.text === c.text).length;
      const loud = s ? Math.max(0, ...rms.filter((r) => r[0] >= s.t && r[0] <= s.t + c.raw + 1.5).map((r) => r[1])) : 0;
      const pass = !!s && said === 0 && loud > 0;
      log(`  ${pass ? 'PASS' : 'FAIL'} ${c.file} source:${s ? 'yes' : 'NO'} speech:${said} rms:${loud.toFixed(4)}  ${c.text.slice(0, 40)}`);
      if (!pass) process.exitCode = 1;
    }
    return rec.length;
  };

  // 1. the opening film (narration, Vince's phone call, the player's answer)
  let n0 = await p.evaluate(() => window.__calls.length);
  await p.evaluate((full) => { __city.intro.play(); if (!full) __city.intro.jump(4, 0); }, !!process.env.FULL);
  await until(() => !__city.intro.active, CAP / 3).catch(() => log('the film did not finish in time'));
  await p.waitForTimeout(1500);
  await scene('opening film', n0, 3);

  // 2. the first job's cut scene (The Quiet Room: Gus and You)
  await p.evaluate(() => { __city.intro.stop(); __city.gameplay.leaveCarNow?.(); __city.missions.startNow(8); });
  n0 = await p.evaluate(() => window.__calls.length);
  await until(() => __city.missions.inCut, 400000).catch(() => log('no cut scene seen'));
  await until(() => !__city.missions.inCut, CAP / 3).catch(() => {});
  await p.waitForTimeout(1500);
  await scene('first cut scene', n0, 3);

  const bad = net.filter((x) => x.status !== 200 && x.status !== 304);
  log(`network: ${net.length} requests for voice data and clips, ${net.filter((x) => /character-voices/.test(x.url)).length} for the data`);
  ok(net.some((x) => /character-voices\.json/.test(x.url) && x.status === 200), 'character-voices.json loaded (200)');
  ok(bad.length === 0, `no failed or non-200 voice request ${JSON.stringify(bad.slice(0, 4))}`);
  ok(await p.evaluate(() => window.__decoded) > 0, `clips were decoded (${await p.evaluate(() => window.__decoded)})`);
  if (warns.length) log('voice warnings:', JSON.stringify(warns.slice(0, 5)));
  ok(errs.length === 0, `no page errors ${JSON.stringify(errs.slice(0, 5))}`);
  await b.close();
})().catch((e) => { console.error('ERROR', e.message.slice(0, 600)); process.exit(1); });
