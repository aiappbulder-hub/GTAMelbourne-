// tools/melbourne/test-interior.cjs: the Quiet Room (js/interiors.js). Walks to the street door, goes in with F, checks the
// player is inside and can't walk through the bar or the walls, goes out, saves inside (comes back at the door), is moved
// out by the Jobs list, then plays The Quiet Room's inside steps to the pass and collects the till from Ruby at the bar.
// Serve the repository root (python3 -m http.server 8765), then: node tools/melbourne/test-interior.cjs
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
const URL_ = `http://localhost:${PORT}/melbourne3d/index.html?webgl&quality=low&nointro&nofilm`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 360, height: 230 } });
  await ctx.addInitScript((save) => {
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); localStorage.setItem('gta-melbourne3d-save-v2', JSON.stringify(save)); }
  }, { version: 2, story: 2, money: 40000, progress: 8, flags: { davo_tails_kestrel: true } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  await p.goto(URL_, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.missions && __city.gameplay && __city.interiors, null, { timeout: 480000 });
  await p.waitForTimeout(3000);
  const until = (fn, ms = 30000, arg) => p.waitForFunction(fn, arg, { timeout: ms * 10, polling: 250 });
  const pos = () => p.evaluate(() => { const e = __city.controllerManager.entities.person.position; return { x: e.x, y: e.y, z: e.z }; });
  const dbg = () => p.evaluate(() => __city.missions.debug());
  const ii = () => p.evaluate(() => __city.interiors.debug());
  const ff = (secs) => p.evaluate((secs) => { for (let t = 0; t < secs && __city.missions.debug().mission; t += 0.05) __city.missions.update(0.05, performance.now() / 1000 + t); }, secs);
  const step = (n) => until((n) => __city.missions.debug().step === n, 30000, n);
  const inRoom = (q) => q.y > 1400 && q.x > -214.6 && q.x < -200.4 && q.z > 131.4 && q.z < 141.6;
  const at = (x, z, h) => p.evaluate(([x, z, h]) => { __city.gameplay.leaveCarNow(); __city.teleportTo(x, z, h); }, [x, z, h]);
  const place = (x, z, h) => p.evaluate(([x, z, h]) => { __city.controllerManager.placePerson(x, 1500, z, h); __city.cameraSystem.resetForTeleport(); }, [x, z, h]);

  // --- the door ------------------------------------------------------------------------------------------------
  await at(-224, 137, Math.PI / 2);
  await p.waitForTimeout(1500);
  ok((await ii()).door === null, 'no prompt away from the door');
  await p.keyboard.down('KeyW');
  await until(() => document.querySelector('.in-prompt') && !document.querySelector('.in-prompt').hidden, 60000);
  await p.keyboard.up('KeyW');
  ok(/Go in/.test(await p.evaluate(() => document.querySelector('.in-prompt').textContent)), 'prompt "F Go in" beside the door');
  const y0 = (await pos()).y;
  ok(y0 < 5 && Math.abs(y0 - (await p.evaluate(() => __city.controllerManager.getGroundHeight(__city.controllerManager.entities.person.position.x, __city.controllerManager.entities.person.position.z, 'person')))) < 0.05, `outside the door on the ground (y ${y0.toFixed(2)})`);
  await p.keyboard.press('KeyF');
  await until(() => __city.interiors.inside, 30000);
  await p.waitForTimeout(1500);
  let q = await pos();
  ok(inRoom(q), `inside the room ${JSON.stringify(q)}`);
  ok(Math.abs(q.y - 1500) < 0.05, 'standing on the room floor (extraGround)');
  ok(await p.evaluate(() => document.body.classList.contains('in-room') && getComputedStyle(document.getElementById('minimap-card')).display === 'none'), 'minimap hidden');
  ok((await ii()).lit, 'indoor light on');
  // wanted: a crime inside is called off
  await p.evaluate(() => __city.wanted.crime('kill', -205, 136));
  await p.waitForTimeout(2500);
  ok((await p.evaluate(() => __city.wanted.stars)) === 0, 'no wanted level inside');
  // walls and furniture: east along the room hits the bar
  await p.keyboard.down('KeyW');
  await p.waitForTimeout(25000);
  await p.keyboard.up('KeyW');
  q = await pos();
  ok(inRoom(q) && q.x < -204.0, `stopped by the bar/stools (x ${q.x.toFixed(2)})`);
  const cam = await p.evaluate(() => { const c = __city.cameraSystem.camera.position; return { x: c.x, y: c.y, z: c.z }; });
  ok(cam.x > -214.5 && cam.x < -200.5 && cam.z > 131.5 && cam.z < 141.5 && cam.y > 1500 && cam.y < 1503.2, `camera inside the room ${JSON.stringify(cam)}`);
  await place(-213.2, 134.8, Math.PI / 2); await p.waitForTimeout(1500);
  await p.keyboard.down('KeyS');
  await p.waitForTimeout(12000);
  await p.keyboard.up('KeyS');
  q = await pos();
  ok(inRoom(q) && q.x < -213.2 && q.x > -214.5, `stopped by the west wall (x ${q.x.toFixed(2)})`);
  await place(-213.4, 136.5, -Math.PI / 2);
  await p.waitForTimeout(1500);
  ok((await ii()).door === 'out', 'prompt at the inside door');
  // saved inside: back at the door
  await p.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const sv = await p.evaluate(() => JSON.parse(localStorage.getItem('melbourne-player-state')).entities.person);
  ok(sv.y < 5 && Math.abs(sv.x + 218.3) < 0.2 && Math.abs(sv.z - 137) < 0.2, `a save made inside puts you at the street door ${JSON.stringify(sv)}`);
  await p.keyboard.press('KeyF');
  await until(() => !__city.interiors.inside, 30000);
  await p.waitForTimeout(1500);
  q = await pos();
  ok(q.y < 5 && Math.hypot(q.x + 218.3, q.z - 137) < 1.5, `out on the footpath ${JSON.stringify(q)}`);
  ok(await p.evaluate(() => !document.body.classList.contains('in-room')) && !(await ii()).lit, 'indoor state cleared');
  // the Jobs list while inside: teleported out, nothing left on
  await p.evaluate(() => __city.interiors.enter());
  await p.waitForTimeout(800);
  await p.evaluate(() => __city.teleportTo(-300, 100, 0));
  await p.waitForTimeout(2000);
  q = await pos();
  ok(!(await ii()).inside && q.y < 5 && !(await ii()).lit, 'teleported out from inside (the Jobs list): not stuck in the room');

  // --- The Quiet Room's inside steps ------------------------------------------------------------------------------------
  await p.evaluate(() => { __city.gameplay.leaveCarNow(); __city.teleportTo(-221, 123, 0); __city.missions.startNow(8); });
  await until(() => __city.missions.debug().inCut, 40000);
  await p.evaluate(() => __city.missions.skipCut());
  await step(0);
  ok(true, 'job 9 step 0: go in');
  await at(-218.3, 137, Math.PI / 2);
  await p.waitForTimeout(800);
  await p.keyboard.press('KeyF');
  await step(1);
  ok((await ii()).inside, 'the door was the step: now inside, walk up to Gus');
  await place(-205.9, 136.5, Math.PI / 2); await p.waitForTimeout(800); await ff(1);
  await until(() => __city.missions.debug().choice, 15000);
  await p.evaluate(() => __city.missions.choose(0)); await ff(9);
  await step(3);
  await until(() => !__city.interiors.inside, 30000);
  ok(true, 'the choice made, the next step is outside: shown out to the street');
  // the drive part
  const intoCar = async () => {
    await p.evaluate(async () => { const e = __city.controllerManager.entities.person.position; await __city.gameplay.placeCar('comodo', e.x + 3.5, e.z + 2, 0); });
    await p.waitForTimeout(800);
    await p.evaluate(() => __city.gameplay.tryEnter());
    await until(() => __city.controllerManager.activeMode === 'car', 90000);
  };
  const car = (x, z) => p.evaluate(([x, z]) => { const c = __city.controllerManager.entities.car; c.position.x = x; c.position.z = z; c.speed = 0; }, [x, z]);
  await intoCar(); await step(4);
  await car(-455, 681); await p.waitForTimeout(1500); await ff(3); await step(5);
  await car(-1500, -900); await p.waitForTimeout(1500); await ff(12); await step(6);
  await car(-230, 118); await step(7);
  await p.evaluate(() => __city.gameplay.exitCar());
  await until(() => __city.controllerManager.activeMode === 'person', 10000);
  await at(-218.3, 137, Math.PI / 2); await p.waitForTimeout(800);
  await p.keyboard.press('KeyF');
  await step(8);
  for (const [n, [x, z]] of [[9, [-205.9, 137.2]], [10, [-210.4, 137.0]], [11, [-205.2, 132.6]]]) {
    // (each spot: stand in it; the next step follows after a few seconds)
    const spot = n === 9 ? [-205.9, 137.2] : n === 10 ? [-210.4, 137.0] : [-205.2, 132.6];
    void x; void z;
    await place(spot[0], spot[1], 0); await p.waitForTimeout(600); await ff(4);
    await step(n);
  }
  await until(() => __city.missions.debug().choice, 15000);
  ok(true, 'the bug sweep: under the bar, the booth lamp, the office phone');
  await p.evaluate(() => __city.missions.choose(1)); await ff(9);
  await until(() => !__city.missions.debug().mission, 15000);
  ok((await p.evaluate(() => __city.missions.progress)) === 9, 'The Quiet Room passed');
  // the till, at the bar
  await p.evaluate(() => { __city.empire.setTill(1234); });
  const m0 = await p.evaluate(() => __city.missions.money);
  await at(-224, 122, 0); await p.waitForTimeout(2000);
  ok((await p.evaluate(() => __city.empire.debug().till)) > 1000, 'outside the door the till is not handed over');
  await p.evaluate(() => __city.interiors.enter());
  await place(-205.9, 135.5, Math.PI / 2);
  await p.waitForFunction(() => __city.empire.debug().till < 100, null, { timeout: 120000 });
  ok((await p.evaluate(() => __city.missions.money)) === m0 + 1230, 'Ruby hands the till over at the bar');
  ok(errs.length === 0, `no page errors ${JSON.stringify(errs.slice(0, 5))}`);
  await b.close();
})().catch((e) => { console.error('ERROR', e.message.slice(0, 600)); process.exit(1); });
