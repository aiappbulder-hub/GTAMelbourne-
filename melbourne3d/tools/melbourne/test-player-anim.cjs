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
  const p = await (await b.newContext({ viewport: { width: 640, height: 400 } })).newPage();
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
  const state = () => p.evaluate(() => {
    const a = __city.cast.actor('player'), pe = __city.controllerManager.entities.person;
    const w = Object.entries(a.acts).filter(([, x]) => x.isRunning() && x.getEffectiveWeight() > 0.02).map(([k, x]) => `${k}:${x.getEffectiveWeight().toFixed(2)}`).join(' ');
    return { speed: +Math.abs(pe.speed).toFixed(2), y: +pe.position.y.toFixed(2), acts: w, ual: !!a.acts.jog };
  });
  const shot = async (n) => p.screenshot({ path: `${OUT}/${n}.png` });
  const fps = () => p.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) r(n / ((performance.now() - t0) / 1000)); else requestAnimationFrame(f); }; f(); }));
  const s0 = await state();
  ok(s0.ual, 'UAL clips are on the player');
  const base = await fps(); log('idle fps', base.toFixed(1));
  await shot('00-idle');
  // locomotion: hold W (jog), then walk-ish is by stick only; sprint with shift
  await p.keyboard.down('KeyW');
  for (let i = 0; i < 4; i++) { await p.waitForTimeout(700); log('jog', JSON.stringify(await state())); await shot(`01-jog-${i}`); }
  const jogFps = await fps(); log('jog fps', jogFps.toFixed(1));
  await p.keyboard.down('ShiftLeft');
  for (let i = 0; i < 5; i++) { await p.waitForTimeout(500); log('sprint', JSON.stringify(await state())); await shot(`02-sprint-${i}`); }
  const spFps = await fps(); log('sprint fps', spFps.toFixed(1));
  const st = await state();
  ok(/sprint_ual/.test(st.acts), 'sprint clip plays at sprint speed');
  // a turn at sprint: lean
  await p.keyboard.down('KeyA');
  for (let i = 0; i < 3; i++) { await p.waitForTimeout(350); await shot(`03-sprintturn-${i}`); }
  await p.keyboard.up('KeyA');
  await p.keyboard.up('ShiftLeft');
  // jump while jogging
  await p.keyboard.down('Space');
  const air = [];
  for (let i = 0; i < 10; i++) { air.push(await state()); await shot(`04-jump-${i}`); await p.waitForTimeout(90); }
  await p.keyboard.up('Space');
  log('jump', JSON.stringify(air.map((s) => `${s.y}|${s.acts}`)));
  ok(air.some((s) => /jump_start/.test(s.acts)) && air.some((s) => /jump_air/.test(s.acts)), 'jump start then air clips play');
  await p.keyboard.up('KeyW');
  await p.waitForTimeout(1200);
  // standing jump: landing clip
  await p.keyboard.down('Space'); await p.waitForTimeout(120); await p.keyboard.up('Space');
  let landSeen = false;
  for (let i = 0; i < 14; i++) { await p.waitForTimeout(80); const s = await state(); if (/jump_land/.test(s.acts)) landSeen = true; if (i % 2 === 0) await shot(`05-standjump-${i}`); }
  ok(landSeen, 'landing clip plays after a standing jump');
  // fists: 6, then punch (J / click)
  await p.keyboard.press('Digit6');
  await p.waitForTimeout(700);
  await shot('06-fists');
  let punchSeen = false;
  for (let k = 0; k < 4; k++) {
    await p.keyboard.press('KeyJ');
    for (let i = 0; i < 6; i++) { await p.waitForTimeout(70); const s = await p.evaluate(() => { const a = __city.cast.actor('player'); return !!a.layerAct; }); if (s) punchSeen = true; if (i === 1) await shot(`07-punch-${k}`); }
    await p.waitForTimeout(300);
  }
  ok(punchSeen, 'punch clip plays on the upper body');
  // punching while jogging
  await p.keyboard.down('KeyW');
  await p.waitForTimeout(900);
  await p.keyboard.press('KeyJ');
  await p.waitForTimeout(150); await shot('08-punch-jog-0'); await p.waitForTimeout(150); await shot('08-punch-jog-1');
  await p.keyboard.up('KeyW');
  // pistol aim
  await p.keyboard.press('Digit1');
  await p.waitForTimeout(800);
  await p.keyboard.down('KeyQ');
  await p.waitForTimeout(700); await shot('09-aim-idle');
  await p.keyboard.down('KeyW');
  await p.waitForTimeout(800); await shot('09-aim-walk');
  const aimFps = await fps(); log('aim-walk fps', aimFps.toFixed(1));
  await p.keyboard.up('KeyW'); await p.keyboard.up('KeyQ');
  // hit reaction
  await p.evaluate(() => __city.cast.flinch());
  await p.waitForTimeout(120); await shot('10-hit');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs.slice(0, 5)));
  ok(Math.min(base, jogFps, spFps, aimFps) > 0.6 * base, `no fps drop (idle ${base.toFixed(1)}, jog ${jogFps.toFixed(1)}, sprint ${spFps.toFixed(1)}, aim ${aimFps.toFixed(1)})`);
  await b.close();
})();
