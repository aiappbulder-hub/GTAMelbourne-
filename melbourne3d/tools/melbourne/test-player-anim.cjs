// tools/melbourne/test-player-anim.cjs: the player's locomotion clips (CMU walk/run + UAL jog/sprint/jump/punch/hit, js/people.js).
// Walks, jogs, sprints, jumps, punches and aims for real (key presses), saves a screenshot sequence, logs which clip(s) play at what
// weight, checks the console for errors and the frame rate. Serve the repo root (python3 -m http.server 9047), then:
//   PORT=9047 OUT=/some/dir node melbourne3d/tools/melbourne/test-player-anim.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.OUT || '/tmp/player-anim';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: +(process.env.W || 240), height: +(process.env.H || 150) } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto('http://localhost:' + (process.env.PORT || 9047) + '/melbourne3d/index.html?webgl&quality=low&nointro&nofilm', { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.gameplay && __city.cast && __city.cast.ready, null, { timeout: 480000 });
  await p.waitForTimeout(3000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  await p.evaluate(async () => {
    __city.controllerManager.setMode('person');
    for (let i = 0; i < 90 && !__city.cast.actor('player'); i++) await new Promise((r) => setTimeout(r, 1000));
  });
  ok(await p.evaluate(() => !!__city.cast.actor('player')), 'the player actor exists');
  if (process.env.CLEAN) await p.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' }); // (screenshots without the HUD)
  const state = () => p.evaluate(() => {
    const a = __city.cast.actor('player'), pe = __city.controllerManager.entities.person;
    const w = Object.entries(a.acts).filter(([, x]) => x.isRunning() && x.getEffectiveWeight() > 0.02).map(([k, x]) => `${k}:${x.getEffectiveWeight().toFixed(2)}`).join(' ');
    return { speed: +Math.abs(pe.speed).toFixed(2), y: +pe.position.y.toFixed(2), acts: w, ual: !!a.acts.jog };
  });
  const shot = async (n) => p.screenshot({ timeout: 120000, path: `${OUT}/${n}.png` });
  const fps = () => p.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) r(n / ((performance.now() - t0) / 1000)); else requestAnimationFrame(f); }; f(); }));
  // (software rendering runs a few frames a second and the game clamps each frame's dt, so everything below waits in FRAMES, not seconds)
  const frames = (n) => p.evaluate((n) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); f(); }), n);
  const frameMs = async (n = 8) => { const t = Date.now(); await frames(n); return (Date.now() - t) / n; };
  const s0 = await state();
  ok(s0.ual, 'UAL clips are on the player');
  const base = await frameMs(); log('idle ms/frame', base.toFixed(0));
  await shot('00-idle');
  await p.keyboard.down('KeyW');
  for (let i = 0; i < 3; i++) { await frames(14); log('jog', JSON.stringify(await state())); await shot(`01-jog-${i}`); }
  const jogMs = await frameMs(); log('jog ms/frame', jogMs.toFixed(0));
  const jogS = await state();
  ok(/jog/.test(jogS.acts), 'the jog clip plays at jogging speed');
  await p.keyboard.down('ShiftLeft');
  for (let i = 0; i < 4; i++) { await frames(14); log('sprint', JSON.stringify(await state())); await shot(`02-sprint-${i}`); }
  const spMs = await frameMs(); log('sprint ms/frame', spMs.toFixed(0));
  ok(/sprint_ual/.test((await state()).acts) || /sprint/.test((await state()).acts), 'a sprint clip plays at sprint speed');
  await p.keyboard.down('KeyA');
  for (let i = 0; i < 2; i++) { await frames(8); await shot(`03-sprintturn-${i}`); }
  await p.keyboard.up('KeyA');
  await p.keyboard.up('ShiftLeft');
  // jump while jogging
  await p.keyboard.down('Space');
  const air = [];
  for (let i = 0; i < 12; i++) { air.push(await state()); if (i % 2 === 0) await shot(`04-jump-${i}`); await frames(1); }
  await p.keyboard.up('Space');
  log('jump', JSON.stringify(air.map((x) => `${x.y}|${x.acts}`)));
  ok(air.some((x) => /jump_start/.test(x.acts)) && air.some((x) => /jump_air/.test(x.acts)), 'jump start then air clips play');
  await p.keyboard.up('KeyW');
  await frames(30);
  await p.keyboard.down('Space'); await frames(2); await p.keyboard.up('Space');
  let landSeen = false;
  for (let i = 0; i < 20; i++) { await frames(1); const x = await state(); if (/jump_land/.test(x.acts)) landSeen = true; if (i % 3 === 0) await shot(`05-standjump-${i}`); }
  ok(landSeen, 'landing clip plays after a standing jump');
  await p.keyboard.press('Digit6');
  await frames(14); await shot('06-fists');
  let punchSeen = false;
  for (let k = 0; k < 3; k++) {
    await p.keyboard.press('KeyJ');
    for (let i = 0; i < 8; i++) { await frames(1); if (await p.evaluate(() => !!__city.cast.actor('player').layerAct)) punchSeen = true; if (i === 2) await shot(`07-punch-${k}`); }
    await frames(8);
  }
  ok(punchSeen, 'punch clip plays on the upper body');
  await p.keyboard.down('KeyW');
  await frames(30);
  await p.keyboard.press('KeyJ');
  await frames(3); await shot('08-punch-jog-0'); await frames(3); await shot('08-punch-jog-1');
  await p.keyboard.up('KeyW');
  await p.keyboard.press('Digit1');
  await frames(16);
  await p.keyboard.down('KeyQ');
  await frames(14); await shot('09-aim-idle');
  await p.keyboard.down('KeyW');
  await frames(20); await shot('09-aim-walk');
  const aimMs = await frameMs(); log('aim-walk ms/frame', aimMs.toFixed(0));
  await p.keyboard.up('KeyW'); await p.keyboard.up('KeyQ');
  await p.evaluate(() => __city.cast.flinch());
  await frames(3); await shot('10-hit');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs.slice(0, 5)));
  ok(Math.max(jogMs, spMs, aimMs) < 1.4 * base, `no frame-time rise (idle ${base.toFixed(0)}, jog ${jogMs.toFixed(0)}, sprint ${spMs.toFixed(0)}, aim ${aimMs.toFixed(0)} ms)`);
  await b.close();
})();
