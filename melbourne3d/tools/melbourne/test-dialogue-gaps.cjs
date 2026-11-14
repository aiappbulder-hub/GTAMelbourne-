// tools/melbourne/test-dialogue-gaps.cjs: how long is the pause between one character finishing a line and the next one
// starting? Plays (1) the opening: the intro film (narration, then Vince's phone call and the player's answer) and
// the first job's cut scene, (2) a ride conversation (Ruby, Davo, Ruby in the car, in The Quiet Room), and logs every
// voice clip's start and real end (AudioBufferSourceNode.start and its `ended` event) with the gap to the next one.
// Serve the repository root (python3 -m http.server 9031), then:  PORT=9031 node melbourne3d/tools/melbourne/test-dialogue-gaps.cjs
// Asserts: in the intro and the cut scene, and between DIFFERENT speakers in the ride, the gap is under 0.7 s (plus the
// longest frame overlapping the gap: software rendering stalls the page for seconds and nothing runs meanwhile).
// A same-speaker pair in the ride (Davo's own lines far apart in time) is authored pacing and is only logged.
// If headless audio never fires `ended`, the clip's length (buffer duration / rate) is used for its end and it says so.
const { chromium } = require('playwright');
const URL_ = `http://localhost:${process.env.PORT || 8765}/melbourne3d/index.html?webgl&quality=low&nofilm&nointro`;
const CAP = Number(process.env.CAP_MIN || 15) * 60000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 360, height: 230 } });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); }
    window.__nodes = []; window.__calls = []; window.__frames = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) {
      const rec = { raw: this.buffer ? this.buffer.duration : 0, t: performance.now() / 1000, dur: (this.buffer ? this.buffer.duration : 0) / (this.playbackRate.value || 1), ended: null, call: window.__calls[window.__calls.length - 1] || null };
      if (this.buffer && this.buffer.duration > 0.25) { window.__nodes.push(rec); this.addEventListener('ended', () => { rec.ended = performance.now() / 1000; }); }
      return start.apply(this, a);
    };
    window.__stamps = [];
    (function tick() { window.__frames++; window.__stamps.push(performance.now() / 1000); requestAnimationFrame(tick); })();
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  if (process.env.DEBUG_LOG) p.on('console', (m) => { if (/DBG/.test(m.text())) log(m.text()); });
  const ok = (cond, what) => { log(cond ? 'PASS' : 'FAIL', what); if (!cond) process.exitCode = 1; };
  const until = (fn, ms, arg) => p.waitForFunction(fn, arg, { timeout: ms, polling: 250 });
  await p.goto(URL_, { timeout: 120000 });
  await until(() => window.__city && __city.missions && __city.gameplay && __city.voices && __city.intro, 480000);
  await p.waitForTimeout(1500);
  await p.keyboard.press('KeyW'); // a gesture, for the audio
  await p.evaluate(() => {
    const v = __city.voices, orig = v.sayText;
    v.sayText = (text, opts = {}) => {
      const line = v.lines.find((l) => l.text === text);
      window.__calls.push({ t: performance.now() / 1000, text, who: line ? line.character : (opts.who || '?'), recorded: !!line });
      return orig(text, opts);
    };
  });
  // Drawing the city in software takes seconds a frame, and nothing else runs meanwhile, which would bury the timing of the
  // dialogue under the frame time. The game logic, audio and timers run as normal; only the draw call is skipped.
  if (!process.env.DRAW) await p.evaluate(() => { __city.renderer.render = () => {}; if (__city.renderer.renderAsync) __city.renderer.renderAsync = async () => {}; });
  const fps0 = await p.evaluate(() => window.__frames); const tf0 = Date.now();
  await p.waitForTimeout(3000);
  const frameSec = (Date.now() - tf0) / 1000 / Math.max(1, (await p.evaluate(() => window.__frames)) - fps0);
  log(`audio context: ${await p.evaluate(() => __city.audio.context && __city.audio.context.state)}; one frame ~ ${frameSec.toFixed(2)} s`);

  const mark = () => p.evaluate(() => window.__nodes.length);
  // only voice clips: a clip whose raw length is a recorded line's (the music and city sounds also use buffer sources)
  const collect = async (from) => { stamps = await p.evaluate(() => window.__stamps.slice()); return collect0(from); };
  const collect0 = (from) => p.evaluate((n) => window.__nodes.slice(n).filter((r) => { const l = r.call && __city.voices.lines.find((x) => x.text === r.call.text); return l && Math.abs(l.duration - r.raw) < 0.12; }).map((r) => ({ t: r.t, dur: r.dur, ended: r.ended, who: r.call && r.call.who, text: r.call && r.call.text, recorded: r.call && r.call.recorded })), from);
  // Software rendering makes some frames take seconds, and nothing (the clip's `ended`, a timer, the next line) runs
  // while one is being drawn. So each gap is also given net of the longest frame that overlaps it ("net").
  let stamps = [];
  const stallIn = (a, b) => { let m = 0; for (let i = 1; i < stamps.length; i++) if (stamps[i] > a && stamps[i - 1] < b) m = Math.max(m, stamps[i] - stamps[i - 1]); return m; };
  const report = (name, rows, onlyDifferent) => {
    let gaps = [], raw = [], estEnds = 0;
    log(`--- ${name}: ${rows.length} clips`);
    rows.forEach((r, i) => {
      const end = r.ended != null ? r.ended : (estEnds++, r.t + r.dur);
      r.end = end;
      const nx = rows[i + 1];
      const gap = nx ? nx.t - end : null;
      const counted = nx && gap < 6 && (!onlyDifferent || nx.who !== r.who);
      const net = nx ? Math.max(0, gap - stallIn(end - 0.01, nx.t)) : 0;
      if (counted) { gaps.push(net); raw.push(gap); }
      log(`  ${(r.who || '?').padEnd(8)} start ${r.t.toFixed(2)} len ${(end - r.t).toFixed(2)}${nx ? `  gap to next ${gap.toFixed(2)} (net of frame stalls ${net.toFixed(2)})${counted ? '' : ' (not counted)'}` : ''}  ${String(r.text).slice(0, 44)}`);
    });
    const avg = gaps.length ? gaps.reduce((a, c) => a + c, 0) / gaps.length : 0, max = gaps.length ? Math.max(...gaps) : 0, min = gaps.length ? Math.min(...gaps) : 0;
    log(`  raw gaps (frame stalls included): average ${(raw.reduce((a, c) => a + c, 0) / (raw.length || 1)).toFixed(2)} s, max ${(raw.length ? Math.max(...raw) : 0).toFixed(2)} s`);
    log(`  ${name}: ${gaps.length} gaps (net), average ${avg.toFixed(2)} s, max ${max.toFixed(2)} s, min ${min.toFixed(2)} s${estEnds ? ` (${estEnds} ends from clip length: no ended event)` : ''}`);
    return { gaps, avg, max, min };
  };
  const limit = 0.7;

  // 1. the opening film: narration, then Vince's phone call and the player's answer
  let n0 = await mark();
  // (the whole film takes minutes at this frame rate: from the fifth shot, Taskforce Kestrel, on, unless FULL=1)
  if (!process.env.NOFILM) await p.evaluate((full) => { __city.intro.play(); if (!full) __city.intro.jump(4, 0); }, !!process.env.FULL);
  if (!process.env.NOFILM) await until(() => !__city.intro.active, CAP / 3);
  await p.waitForTimeout(1500);
  let rows = await collect(n0);
  const r1 = report('opening film (narration + Vince on the phone)', rows, false);
  ok(rows.length >= 4 && r1.gaps.length >= 3, `the film played ${rows.length} clips`);
  ok(r1.max < limit, `film: max net gap ${r1.max.toFixed(2)} s < ${limit.toFixed(2)} s`);

  // 2. a cut scene (The Quiet Room: Gus and You), then 3. a ride conversation in the same job
  await p.evaluate(() => { __city.intro.stop(); __city.gameplay.leaveCarNow?.(); __city.missions.startNow(8); });
  n0 = await mark();
  await until(() => __city.missions.inCut, 400000).catch(() => log('no cut scene seen'));
  await until(() => !__city.missions.inCut, CAP / 3).catch(() => {});
  await p.waitForTimeout(1500);
  rows = await collect(n0);
  const r2 = report('cut scene (Gus and You)', rows, false);
  ok(rows.length >= 4 && r2.gaps.length >= 3, `the cut scene played ${rows.length} clips`);
  ok(r2.max < limit, `cut scene: max net gap ${r2.max.toFixed(2)} s < ${limit.toFixed(2)} s`);

  // 3. Ruby, Davo, Ruby, Ruby on the drive to the Quiet Room
  if (await p.evaluate(() => typeof __city.missions.debugGotoStep === 'function')) {
    const idx = await p.evaluate(() => (__city.missions.steps || []).findIndex((s) => /Take Ruby/.test(s.text)));
    ok(idx > 0, `found the Ruby ride step (${idx})`);
    n0 = await mark();
    if (idx > 0) await p.evaluate((i) => __city.missions.debugGotoStep(i), idx);
    await p.evaluate(() => __city.missions.debugAdvance(14)); // (game time runs several times slower than real time here: on to Davo's turn, 14 s in)
    await until(() => window.__calls.filter((c) => /Six years of his books|Only when I am being paid|Before anyone says/.test(c.text)).length >= 3, CAP / 3).catch(() => log('ride lines did not all play in time'));
    await p.waitForTimeout(4000);
    rows = await collect(n0);
    const r3 = report('ride conversation (speaker changes counted)', rows, true);
    ok(r3.gaps.length >= 2, `ride: ${r3.gaps.length} speaker changes measured`);
    ok(r3.max < limit, `ride: max net gap ${r3.max.toFixed(2)} s < ${limit.toFixed(2)} s`);
  } else log('SKIP ride conversation: no debugGotoStep (old code)');

  ok(errs.length === 0, `no page errors ${JSON.stringify(errs.slice(0, 5))}`);
  await b.close();
})().catch((e) => { console.error('ERROR', e.message.slice(0, 600)); process.exit(1); });
