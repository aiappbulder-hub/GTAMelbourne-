// tools/melbourne/test-act1.cjs: Act I's five jobs after the memory (The Quiet Room, Sunday Lunch, Market Day, Doors,
// The Ferryman's Toll) played end to end through window.__city. Serve the repository root on port 8765
// (python3 -m http.server 8765), then: node tools/melbourne/test-act1.cjs. Needs Playwright with Chromium.
// Prints PASS/FAIL per check; exits 1 on a FAIL. (A small window: under software rendering the game runs at a frame or
// two a second, and the jobs' timers count game time; ff() runs the mission system's own clock forward between frames.)
const { chromium } = require('playwright');
const URL_ = 'http://localhost:8765/melbourne3d/index.html?webgl&quality=low&nointro&nofilm';
// FROM=12 node tools/melbourne/test-act1.cjs starts at that job (0-based) with the choices the earlier ones would have made
const FROM = Math.max(8, Math.min(12, +process.env.FROM || 8));
const SEED = [{ quiet_room: 'fair', bug: 'kept' }, { lunch_shooter: 'talked', carlton: 'books' }, { kaz: 'partner' }, { doors_first: 'lean', doors: 'take' }];
const MONEY = [40000, 31000, 35000, 39500, 44500];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 360, height: 230 } });
  await ctx.addInitScript((save) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('gta-melbourne3d-save-v2', JSON.stringify(save));
    }
  }, { version: 2, story: 2, money: MONEY[FROM - 8], progress: FROM, flags: Object.assign({ davo_tails_kestrel: true }, ...SEED.slice(0, FROM - 8)) });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ok = (cond, what) => { log(cond ? 'PASS' : 'FAIL', what); if (!cond) process.exitCode = 1; };
  const ready = async () => { await p.waitForFunction(() => window.__city && __city.missions && __city.gameplay, null, { timeout: 480000 }); await p.waitForTimeout(3000); };
  const dbg = () => p.evaluate(() => __city.missions.debug());
  const state = () => p.evaluate(() => ({ prog: __city.missions.progress, money: __city.missions.money, flags: __city.missions.flags }));
  const step = async (n, ms = 30000) => {
    try { await p.waitForFunction((n) => __city.missions.debug().step === n, n, { timeout: ms * 10, polling: 250 }); }
    catch (e) { log('stuck waiting for step', n, JSON.stringify(await p.evaluate(() => ({ mode: __city.controllerManager.activeMode, d: __city.missions.debug(), obj: document.querySelector('.gm-objective').textContent })))); throw e; }
  };
  const until = async (fn, ms = 30000) => { await p.waitForFunction(fn, null, { timeout: ms * 10, polling: 250 }); };
  const begin = async (i, x, z) => {
    await p.evaluate(([i, x, z]) => { __city.gameplay.leaveCarNow(); __city.teleportTo(x, z, 0); __city.missions.startNow(i); }, [i, x, z]);
    log('job', i, JSON.stringify(await p.evaluate(() => ({ mode: __city.controllerManager.activeMode, d: __city.missions.debug() }))).slice(0, 200));
    await until(() => __city.missions.debug().inCut, 40000);
  };
  // game time forward `secs` for the mission system (its timers, the tail, the lead), without waiting for frames
  const ff = (secs) => p.evaluate((secs) => { for (let t = 0; t < secs && __city.missions.debug().mission; t += 0.05) __city.missions.update(0.05, performance.now() / 1000 + t); }, secs);
  const choose = async (i) => { await p.evaluate((i) => __city.missions.choose(i), i); await ff(9); }; // (the reply is heard out before the job moves on)
  const skip = () => p.evaluate(() => __city.missions.skipCut());
  const tp = (x, z) => p.evaluate(([x, z]) => __city.teleportTo(x, z, 0), [x, z]);
  const toGoal = async () => { const g = (await dbg()).goal; await tp(g.x, g.z); await p.waitForTimeout(600); await ff(4); };
  const car = (x, z) => p.evaluate(([x, z]) => { const c = __city.controllerManager.entities.car; c.position.x = x; c.position.z = z; c.speed = 0; }, [x, z]);
  // into a car: one of the player's own, parked beside them
  const intoCar = async () => {
    await p.evaluate(async () => { const e = __city.controllerManager.entities.person.position; await __city.gameplay.placeCar('comodo', e.x + 3.5, e.z + 2, 0); });
    await p.waitForTimeout(800);
    await p.evaluate(() => __city.gameplay.tryEnter());
    await until(() => __city.controllerManager.activeMode === 'car', 30000);
  };
  const outOfCar = async () => { await p.evaluate(() => __city.gameplay.exitCar()); await until(() => __city.controllerManager.activeMode === 'person', 10000); await p.waitForTimeout(400); };
  // keep (dx, dz) from the lead until it has stopped
  const follow = async (dx, dz, mode) => {
    for (let k = 0; k < 400; k++) {
      const d = await dbg();
      if (!d.mission || !d.lead || d.lead.arrived) return d;
      await p.evaluate(([x, z, mode]) => { const e = __city.controllerManager.entities[mode]; e.position.x = x; e.position.z = z; if (mode === 'car') e.speed = 0; }, [d.lead.x + dx, d.lead.z + dz, mode]);
      await ff(1.5);
    }
    return dbg();
  };

  await p.goto(URL_, { timeout: 120000 }); await ready();
  let d, st = await state();
  ok(st.prog === FROM && (await p.evaluate(() => __city.missions.missions.length)) === 13, `13 jobs; the save starts at job ${FROM + 1} ${JSON.stringify(st)}`);
  ok((await p.evaluate(() => __city.missions.missions.slice(8).map((m) => m.name).join(', '))) === "The Quiet Room, Sunday Lunch, Market Day, Doors, The Ferryman's Toll", 'Act I jobs in order');

  // --- The Quiet Room ---------------------------------------------------------------------------------------------
  if (FROM <= 8) {
  await begin(8, -221, 123);
  ok(await p.evaluate(() => __city.missions.busy), 'cut scene: the game is busy (no shooting)');
  await until(() => __city.missions.debug().cutLine >= 1 || !__city.missions.debug().inCut, 60000); ok(true, 'cut scene lines play on by themselves');
  await skip(); await until(() => __city.missions.debug().choice, 10000);
  await choose(0);
  await step(1); st = await state(); ok(st.money === 28000 && st.flags.quiet_room === 'fair', `QR the fair price costs $12,000 ${JSON.stringify(st)}`);
  await intoCar(); await step(2); ok(true, 'QR in a car: Ruby at Southbank');
  await car(-455, 681); await p.waitForTimeout(1500); await ff(3); await step(3, 20000); ok((await dbg()).tail, 'QR Ruby picked up: the Territorial is behind');
  await car(-1500, -900); await p.waitForTimeout(1500); await ff(12); await step(4, 20000); ok(!(await dbg()).tail, 'QR tail lost');
  await car(-230, 118); await step(5); await outOfCar();
  for (const n of [6, 7, 8]) { await toGoal(); await step(n, 30000); }
  ok((await dbg()).choice, 'QR three spots searched: the bug');
  await choose(1);
  await until(() => !__city.missions.debug().mission, 10000);
  st = await state(); ok(st.prog === 9 && st.flags.bug === 'kept' && st.money === 31000, `QR passed ${JSON.stringify(st)}`);
  await p.waitForTimeout(5000);
  }

  // --- Sunday Lunch -----------------------------------------------------------------------------------------------
  if (FROM <= 9) {
  await begin(9, 410, -1355); await skip(); await step(0);
  d = await dbg(); ok(d.lead && !d.lead.moving, `SL the hatch waits on Lygon St ${JSON.stringify(d.lead)}`);
  await intoCar(); await step(1);
  d = await follow(8, 8, 'car'); ok(d.lead && d.lead.arrived, 'SL the hatch runs its route and stops');
  await step(2, 20000); await outOfCar(); await toGoal(); await until(() => __city.missions.debug().choice, 15000);
  await choose(0); await step(4);
  await tp(407, -1358); await until(() => __city.missions.debug().choice, 15000);
  await choose(1);
  await until(() => !__city.missions.debug().mission, 10000);
  st = await state(); ok(st.prog === 10 && st.flags.lunch_shooter === 'talked' && st.flags.carlton === 'books', `SL passed ${JSON.stringify(st)}`);
  await p.waitForTimeout(5000);
  }

  // --- Market Day -------------------------------------------------------------------------------------------------
  if (FROM <= 10) {
  await begin(10, -342, -1209); await skip(); await step(0);
  for (const n of [1, 2, 3]) { await toGoal(); await step(n, 30000); }
  ok(true, 'MD three utes photographed');
  await intoCar(); await step(4);
  // too close for too long: seen
  d = await dbg();
  await car(d.lead.x + 6, d.lead.z + 6);
  for (let k = 0; k < 40 && (await dbg()).mission; k++) { const q = (await dbg()).lead; if (q) await car(q.x + 6, q.z + 6); await ff(0.5); }
  ok(!(await dbg()).mission, 'MD sitting on the ute\'s bumper: seen, job failed');
  await p.waitForTimeout(4000);
  await begin(10, -342, -1209); await skip(); await step(0);
  for (const n of [1, 2, 3]) { await toGoal(); await step(n, 30000); }
  await intoCar(); await step(4);
  d = await follow(30, 30, 'car'); ok(d.mission && d.lead && d.lead.arrived, `MD tailed to the yards ${JSON.stringify(d.lead)}`);
  await step(5, 20000); await outOfCar(); await toGoal();
  await until(() => __city.missions.debug().inCut, 20000); ok(true, 'MD Kaz at the gate: the conversation');
  await skip(); await until(() => __city.missions.debug().choice, 10000);
  await choose(0);
  await until(() => !__city.missions.debug().mission, 10000);
  st = await state(); ok(st.prog === 11 && st.flags.kaz === 'partner', `MD passed ${JSON.stringify(st)}`);
  await p.waitForTimeout(5000);
  }

  // --- Doors ------------------------------------------------------------------------------------------------------
  if (FROM <= 11) {
  await begin(11, -935, 123); await skip(); await step(0);
  await toGoal(); await until(() => __city.missions.debug().choice, 15000);
  await choose(1); await step(2);
  await ff(2);
  d = await dbg(); ok(d.lead && d.lead.moving, `D Bianca runs ${JSON.stringify(d.lead)}`);
  await follow(12, 0, 'person'); // behind her to the end
  d = await dbg(); if (d.lead) { await tp(d.lead.x + 1.5, d.lead.z); await p.waitForTimeout(800); await ff(1); }
  await until(() => __city.missions.debug().inCut, 20000); ok(true, 'D caught: Terry');
  await skip(); await until(() => __city.missions.debug().choice, 10000);
  await choose(1); await step(5); ok(true, 'D "all of it": the branch step plays');
  await tp(-722, 400); await p.waitForTimeout(800); await ff(1);
  await until(() => !__city.missions.debug().mission, 15000);
  st = await state(); ok(st.prog === 12 && st.flags.doors === 'take', `D passed ${JSON.stringify(st)}`);
  await p.waitForTimeout(5000);
  }

  // --- The Ferryman's Toll ----------------------------------------------------------------------------------------
  if (FROM <= 12) {
  await begin(12, -221, 123); await skip(); await step(0);
  await tp(-229, 150); await p.waitForTimeout(800); await ff(4); // the east footpath, in front of the uniform on the corner
  await until(() => !__city.missions.debug().mission, 30000); ok(true, 'FT seen on the east footpath: failed');
  await p.waitForTimeout(4000);
  await begin(12, -221, 123); await skip(); await step(0);
  let alive = true;
  for (const [x, z] of [[-236, 118], [-246, 118], [-254, 118], ...Array.from({ length: 18 }, (_, k) => [-254, 124 + k * 6])]) {
    await p.evaluate(([x, z]) => { const e = __city.controllerManager.entities.person; e.position.x = x; e.position.z = z; }, [x, z]);
    await ff(1.4);
    if (!(await dbg()).mission) { alive = false; break; }
  }
  d = await dbg(); ok(alive && d.seen < 1, `FT the far side of Elizabeth St: not seen (seen=${d.seen.toFixed(2)})`);
  await tp(-271.5, 238.5); await p.waitForTimeout(800);
  await p.evaluate(() => __city.gameplay.tryEnter());
  await step(1, 30000); ok(true, 'FT in Davo\'s car: Kestrel behind');
  await car(-1500, -900); await p.waitForTimeout(1500); await ff(12); await step(2, 20000);
  await car(228, 237); await step(3); await outOfCar();
  await tp(120, 270); await p.waitForTimeout(800); await ff(11);
  await until(() => __city.missions.debug().inCut, 40000); ok((await dbg()).step === 4, 'FT blended in; Sully (the Davo-asked-around version)');
  await skip(); await until(() => __city.missions.debug().choice, 10000);
  await p.keyboard.press('Digit4'); await ff(9);
  await until(() => !__city.missions.debug().mission, 10000);
  st = await state(); ok(st.prog === 13 && st.flags.ledger === 'self', `FT passed; key 4 picks the fourth option ${JSON.stringify(st)}`);
  }

  // The Book: what the choices bought, and the till
  let bk = await p.evaluate(() => __city.empire.debug());
  ok(bk.open && bk.shares.GRID === 40 && bk.shares.CARLTON === 30 && bk.shares.NWM === 20 && bk.daily === 4600, `Book: shares and the daily take ${JSON.stringify(bk)}`);
  await p.keyboard.press('KeyK'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __city.empire.isOpen && /The Grid/.test(document.querySelector('.bk-body').textContent)), 'Book: K opens it on the ledger');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(!(await p.evaluate(() => __city.empire.isOpen)), 'Book: Esc closes it');
  await p.evaluate(() => { __city.empire.setTill(1234); __city.teleportTo(-224, 122, 0); });
  await p.waitForFunction(() => __city.empire.debug().till < 100, null, { timeout: 120000 });
  const st3 = await state(); ok(st3.money === st.money + 1230, `Book: the take is collected at the Quiet Room (${st.money} -> ${st3.money})`);
  st = st3;

  await p.reload(); await ready();
  const st2 = await state(); ok(st2.prog === 13 && st2.flags.ledger === 'self' && st2.money === st.money, `survives a restart ${JSON.stringify(st2)}`);
  ok(errs.length === 0, `no page errors ${JSON.stringify(errs.slice(0, 5))}`);
  await b.close();
})().catch((e) => { console.error('ERROR', e.message.slice(0, 600)); process.exit(1); });
