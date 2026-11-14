// tools/melbourne/test-wanted.cjs: the wanted level and the police (js/wanted.js). Serve the repo root on port 8765
// (python3 -m http.server 8765), then: node tools/melbourne/test-wanted.cjs
//  - a witnessed crime raises stars at once and a police car comes after you along your route
//  - stand still with the police beside you: BUSTED (a fine, the level cleared)
//  - a crime nobody sees is reported a few seconds later, so there is always a response
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 360, height: 230 } });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('s')) {
      sessionStorage.setItem('s', '1');
      localStorage.clear();
      localStorage.setItem('gta-melbourne3d-save-v2', JSON.stringify({ version: 2, story: 2, money: 5000, progress: 3, flags: {} }));
    }
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto('http://localhost:' + (process.env.PORT || 8765) + '/melbourne3d/index.html?webgl&quality=low&nointro&nofilm', { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.wanted && __city.gameplay, null, { timeout: 480000 }); await p.waitForTimeout(3000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  const dbg = () => p.evaluate(() => __city.wanted.debug());
  const waitFor = (fn, ms, arg) => p.waitForFunction(fn, arg, { timeout: ms, polling: 500 });
  ok((await dbg()).stars === 0, 'starts with no wanted level');
  // a route to follow: walk the player along Bourke St, 12 m at a time (the route is recorded every 4 m)
  await p.evaluate(() => { document.querySelector('[data-mode="person"]').click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { __city.teleportTo(-600, -221, Math.PI / 2); });
  await p.waitForTimeout(25000);
  for (let i = 0; i < 24; i++) {
    await p.evaluate((i) => { const e = __city.controllerManager.entities.person; e.position.x = -600 + i * 12; e.position.z = -218; }, i);
    await p.waitForTimeout(900);
  }
  log('route', JSON.stringify(await dbg()));
  // 1. a witnessed crime: a pedestrian within 45 m
  const near = await p.evaluate(() => {
    const e = __city.controllerManager.getActiveEntity().position;
    const q = __city.trafficSystem.peds.find((q) => q.placed && !q.dead && Math.hypot(q.x - e.x, q.z - e.z) < 40);
    return q ? { x: q.x, z: q.z } : null;
  });
  log('witness', JSON.stringify(near));
  if (near) {
    await p.evaluate(() => { __city.wanted.tuning.spawnBack = [55, 65]; }); // (the headless browser runs slowly: start them close)
    await p.evaluate(() => { const e = __city.controllerManager.getActiveEntity().position; __city.wanted.crime('kill', e.x, e.z); });
    let d = await dbg();
    ok(d.stars >= 1, `a witnessed killing raises the wanted level at once (${d.stars} star, heat ${d.heat})`);
    await waitFor(() => __city.wanted.debug().units >= 1, 200000);
    d = await dbg();
    ok(d.units >= 1 && d.nearest > 40, `a police car comes, from back along your route (${Math.round(d.nearest)} m)`);
    // 2. stand still: it closes in and busts you
    const cash0 = await p.evaluate(() => __city.missions.money);
    // (the headless browser runs at ~2 fps, so the sim is stepped by hand: up to 400 s of game time at 20 Hz, stopping once BUSTED clears the stars)
    for (let k = 0; k < 8 && (await dbg()).stars > 0; k++) await p.evaluate(() => { for (let i = 0; i < 1000 && __city.wanted.debug().stars > 0; i++) __city.wanted.update(0.05); });
    const cash1 = await p.evaluate(() => __city.missions.money);
    log('after', JSON.stringify(await dbg()), 'cash', cash0, '->', cash1);
    ok(cash1 < cash0, `standing still with police beside you is BUSTED: fined $${cash0 - cash1}`);
  } else log('SKIP witnessed and busted: nobody near the player');
  // 3. nobody around: a report comes in anyway (St Kilda has no people on this map's network)
  await p.evaluate(() => __city.teleportTo(-701, 4960, 0));
  await p.waitForTimeout(20000);
  const peopleThere = await p.evaluate(() => __city.trafficSystem.peds.filter((q) => q.placed && !q.dead && Math.hypot(q.x + 701, q.z - 4960) < 45).length);
  await p.evaluate(() => __city.wanted.crime('shot', -701, 4960));
  let d = await dbg();
  if (peopleThere === 0) {
    ok(d.reports === 1 && d.stars === 0, 'a crime nobody sees is queued as a report (no stars yet)');
    await waitFor(() => __city.wanted.debug().stars >= 1, 300000);
    d = await dbg();
    ok(d.stars >= 1 && d.reports === 0, `the report comes in: ${d.stars} star`);
  } else log('SKIP report: people were around anyway', peopleThere);
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 3)));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 400)); process.exit(1); });
