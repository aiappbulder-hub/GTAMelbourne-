// tools/melbourne/test-audio-live.cjs: is there real sound? Every AudioContext is tapped on the node that feeds its
// destination, by an AudioWorklet on the audio thread (software rendering stalls the page for seconds, so polling an
// AnalyserNode from the page misses short clips). Asserts, after a real mouse click: every context is running, a
// recorded voice line is audible, the car radio is audible, on-foot music is audible, no page errors.
// Serve the repository root (python3 -m http.server 9093), then:
//   PORT=9093 node melbourne3d/tools/melbourne/test-audio-live.cjs            (a real click is the only gesture)
//   PORT=9093 AUTOPLAY=1 node ...                                              (autoplay policy off)
//   PORT=9093 FILM=1 node ...                                                  (the live default: with the intro film)
const { chromium } = require('playwright');
const PORT = process.env.PORT || 9093;
const URL_ = `http://localhost:${PORT}/melbourne3d/index.html?webgl&quality=low${process.env.FILM ? '' : '&nofilm'}`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const args = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'];
  if (process.env.AUTOPLAY) args.push('--autoplay-policy=no-user-gesture-required');
  const b = await chromium.launch({ args });
  const c = await b.newContext({ viewport: { width: 360, height: 230 } });
  await c.addInitScript(() => {
    try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); } } catch (e) { /* ignore */ }
    const WORKLET = `registerProcessor('tap', class extends AudioWorkletProcessor {
      constructor() { super(); this.s = 0; this.n = 0; }
      process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) { for (let i = 0; i < ch.length; i++) this.s += ch[i] * ch[i]; this.n += ch.length;
        if (this.n >= 2048) { this.port.postMessage(Math.sqrt(this.s / this.n)); this.s = 0; this.n = 0; } } return true; } });`;
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    window.__taps = [];
    const Orig = window.AudioContext;
    window.AudioContext = class extends Orig {
      constructor(...a) { super(...a); window.__taps.push({ ctx: this, max: 0, where: (new Error().stack.split('\n')[2] || '').trim().slice(0, 100) }); }
    };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...r) {
      const res = connect.call(this, dest, ...r);
      try {
        const e = dest instanceof AudioDestinationNode && window.__taps.find((x) => x.ctx === this.context);
        if (e && !e.tapped) {
          e.tapped = true;
          const src = this;
          this.context.audioWorklet.addModule(url).then(() => {
            const n = new AudioWorkletNode(this.context, 'tap', { numberOfOutputs: 0 });
            n.port.onmessage = (m) => { e.max = Math.max(e.max, m.data); };
            connect.call(src, n);
          }).catch(() => {});
        }
      } catch (er) { /* ignore */ }
      return res;
    };
    // the loudest block any context produced since the last call
    window.__peak = () => { let m = 0; for (const e of window.__taps) { m = Math.max(m, e.max); e.max = 0; } return m; };
    window.__states = () => window.__taps.map((e) => e.ctx.state);
  });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ok = (cond, what) => { log(cond ? 'PASS' : 'FAIL', what); if (!cond) process.exitCode = 1; };
  const sleep = (ms) => p.waitForTimeout(ms);
  // wait up to ms for any context to produce a block louder than min; returns the loudest seen
  const heard = async (min, ms) => { let m = 0; const t = Date.now(); while (Date.now() - t < ms && m <= min) { await sleep(300); m = Math.max(m, await p.evaluate(() => __peak())); } return m; };

  await p.goto(URL_, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.music && __city.gameplay && __city.voices, null, { timeout: 480000 });
  if (process.env.FILM) { await p.mouse.click(180, 115); await sleep(500); await p.keyboard.press('Escape'); await sleep(1500); }
  await p.mouse.click(180, 115);
  const t0 = Date.now(); let st = [];
  while (Date.now() - t0 < 20000) { st = await p.evaluate(() => __states()); if (st.length && st.every((s) => s === 'running')) break; await sleep(300); }
  log('contexts', JSON.stringify(await p.evaluate(() => __taps.map((e) => [e.ctx.state, e.where]))));
  ok(st.length > 0 && st.every((s) => s === 'running'), `every AudioContext is running after a click (${st})`);
  ok((await p.evaluate(() => __city.audio.context && __city.audio.context.state)) === 'running', 'the shared game context is running');

  // on foot: the ambient music bed
  await p.keyboard.press('Digit1'); await p.evaluate(() => __peak());
  // the on-foot bed is sparse (and the city's wind is about 0.003), so read the music's own level meter until it speaks
  let m = 0; for (let t = Date.now(); Date.now() - t < 60000 && m < 0.004; await sleep(250)) m = Math.max(m, await p.evaluate(() => __city.music.state.level));
  log('music', JSON.stringify(await p.evaluate(() => __city.music.state)));
  ok(m > 0.004, `on-foot music is audible (rms ${m.toFixed(4)})`);

  // a recorded voice line (a story line: Davo from the first job; falls back to any recorded line)
  const line = await p.evaluate(() => { const l = __city.voices.lines.find((x) => x.character === 'davo') || __city.voices.lines.find((x) => x.category !== 'radio'); return l && l.text; });
  await p.evaluate(() => { __city.music.setMuted(true); __peak(); }); // isolate the voice from the music bed
  await sleep(1500); await p.evaluate(() => __peak());
  const base = await heard(1, 1500);
  await p.evaluate((t) => { __city.voices.sayText(t); }, line);
  const v = await heard(Math.max(0.02, base * 3), 30000);
  ok(v > Math.max(0.02, base * 3), `a recorded voice line is audible: "${String(line).slice(0, 40)}" (rms ${v.toFixed(4)}, bed ${base.toFixed(4)})`);
  const stuck = await p.evaluate(() => __city.voices.active.length);
  await sleep(5000);
  ok((await p.evaluate(() => __city.voices.active.length)) === 0, `the voice line ended and freed its slot (was ${stuck})`);
  await p.evaluate(() => __city.music.setMuted(false));

  // the browser's own speech for an unrecorded line must not block the next recorded one
  await p.evaluate(() => { __city.voices.sayText('This line has no recording at all, mate.', { who: 'Davo' }); });
  await sleep(500); await p.evaluate(() => __peak());
  await p.evaluate((t) => { __city.voices.sayText(t); }, line);
  const v2 = await heard(0.02, 30000);
  ok(v2 > 0.02, `a recorded line still plays after a speech-synthesis line (rms ${v2.toFixed(4)})`);

  // in the car: the radio
  await p.evaluate(() => __peak());
  await p.evaluate(() => document.querySelector('[data-mode=car]').click());
  const rs = await p.evaluate(async () => { const t = Date.now(); while (Date.now() - t < 30000 && !(__city.music.state.scene || '').startsWith('radio')) await new Promise((r) => setTimeout(r, 300)); return __city.music.state; });
  log('radio state', JSON.stringify(rs));
  const r = await heard(0.01, 40000);
  ok(r > 0.01, `the car radio is audible (rms ${r.toFixed(4)})`);
  await p.evaluate(() => document.querySelector('[data-mode=person]').click());
  ok(errs.length === 0, `no page errors ${JSON.stringify(errs.slice(0, 5))}`);
  await b.close();
})().catch((e) => { console.error('ERROR', e.message.slice(0, 600)); process.exit(1); });
