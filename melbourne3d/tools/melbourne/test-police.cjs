// tools/melbourne/test-police.cjs: Victoria Police up close (js/police.js). Serve the repo root (python3 -m http.server 9063),
// then: PORT=9063 node melbourne3d/tools/melbourne/test-police.cjs
//  - the police car has the chequer livery and a light bar; the siren and the bars come on with the chase
//  - at 2 stars two officers get out of a stopped car and run at the player (no shooting yet)
//  - once shot at, or at 3 stars, they fire (the player's health drops)
//  - killing an officer raises the heat
//  - clearing the wanted level sends them back to their car, which drives on
//  - on a story job no police spawn and no heat accrues
// The headless browser draws a frame every few seconds, so the game is stepped by hand (0.05 s at a time).
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
  await p.goto('http://localhost:' + (process.env.PORT || 9063) + '/melbourne3d/index.html?webgl&quality=low&nointro&nofilm&story&police=1', { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.wanted && __city.gameplay && __city.police && __city.cast && __city.cast.ready, null, { timeout: 480000 }); await p.waitForTimeout(3000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  const W = () => p.evaluate(() => __city.wanted.debug());
  const PD = () => p.evaluate(() => __city.police.debug());
  const hp = () => p.evaluate(() => __city.gameplay.state.hp);
  // step the game `secs` of game time: wanted, police, the player's model and gameplay (the hostiles)
  const sim = (secs) => p.evaluate((secs) => {
    for (let t = 0; t < secs; t += 0.05) { __city.wanted.update(0.05); __city.police.update(0.05); __city.gameplay.update(0.05); __city.cast.posePlayer(0.05); }
  }, secs);
  // step until `cond` (evaluated in the page) holds, up to `max` game seconds, with real pauses so models can load
  async function until(cond, max, chunk = 1) {
    for (let t = 0; t < max; t += chunk) {
      if (await p.evaluate(cond)) return true;
      await sim(chunk);
      await p.waitForTimeout(250);
    }
    return p.evaluate(cond);
  }

  // ---- a route to follow, then trouble ------------------------------------------------------------------------------
  await p.evaluate(() => { document.querySelector('[data-mode="person"]').click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { __city.teleportTo(-600, -221, Math.PI / 2); });
  await p.waitForTimeout(25000);
  for (let i = 0; i < 24; i++) {
    await p.evaluate((i) => { const e = __city.controllerManager.entities.person; e.position.x = -600 + i * 12; e.position.z = -218; }, i);
    await p.waitForTimeout(900);
  }
  await p.evaluate(() => { __city.gameplay.leaveCarNow?.(); __city.gameplay.health = 100; __city.wanted.tuning.spawnBack = [55, 65]; __city.police.tuning.arrest = false; });
  // two stars: a killing, and (witnessed: a theft on top; nobody saw: a second killing, as two reports come in a few seconds later)
  const crime = (k) => p.evaluate((k) => { const e = __city.controllerManager.getActiveEntity().position; __city.wanted.crime(k, e.x, e.z); }, k);
  await crime('kill');
  const witnessed = (await W()).heat > 0;
  await crime(witnessed ? 'theft' : 'kill');
  await sim(12);
  let w = await W();
  log('wanted', JSON.stringify(w));
  ok(w.stars >= 2, `two stars (${w.stars}, heat ${w.heat})`);

  // ---- the car: livery, light bar, siren ---------------------------------------------------------------------------
  ok(await until(() => __city.wanted.units.length > 0 && __city.wanted.units[0].p.root, 400, 2), 'a police car comes');
  await sim(1);
  const car = await p.evaluate(() => {
    const root = __city.wanted.units[0].p.root, mats = new Set(), names = new Set();
    root.traverse((o) => { names.add(o.name); if (o.isMesh && o.material) mats.add(o.material.name); });
    return { mats: [...mats], hasChequer: [...names].some((n) => /^check/.test(n)), bar: !!root.getObjectByName('LightBar'), text: [...names].some((n) => /POLICE/.test(n)) };
  });
  log('car', JSON.stringify(car));
  ok(car.hasChequer && car.mats.includes('Livery-Blue'), 'the police car wears the chequer livery (blue and white band) with POLICE lettering: ' + car.text);
  ok(car.bar, 'the police car has a light bar');
  ok(await p.evaluate(() => __city.police.barsOn), 'the bars flash during the chase');
  ok(await p.evaluate(() => __city.police.patrolCars().length > 0), 'patrol cruisers are among the traffic');

  // ---- two stars: officers get out and run at the player ------------------------------------------------------------
  ok(await until(() => __city.police.debug().crews.length > 0, 600, 2), 'at 2+ stars the stopped car puts officers on foot');
  await p.waitForTimeout(500);
  let pd = await PD();
  log('crew', JSON.stringify(pd.crews[0]));
  ok(pd.crews[0] && pd.crews[0].officers.length === 2, 'two officers');
  const d0 = Math.min(...pd.crews[0].officers.map((o) => o.d));
  w = await W();
  ok(await until(() => { const c = __city.police.debug().crews[0]; return c && Math.min(...c.officers.map((o) => o.d)) < 4; }, 60, 1), `they run at the player (from ${d0} m to within 4 m)`);
  pd = await PD();
  if (w.stars < 3) ok(pd.crews[0].officers.every((o) => !o.fire), 'and do not shoot at two stars with nobody shooting');
  ok(await p.evaluate(() => __city.gameplay.combat.list.filter((g) => g.cop && g.visible).length) > 0, 'the officers are drawn (people rig)');

  // ---- shot at: they fire --------------------------------------------------------------------------------------------
  await p.evaluate(() => { __city.gameplay.health = 100; const g = __city.gameplay.combat.list.find((g) => g.cop && !g.dead); __city.gameplay.combat.hurt(g, 5, g.x + 3, g.z); });
  let hpMin = 100;
  for (let i = 0; i < 80 && hpMin >= 95; i++) { await sim(0.5); hpMin = Math.min(hpMin, await hp()); await p.waitForTimeout(150); }
  pd = await PD();
  log('fighting', JSON.stringify(pd.crews[0] && pd.crews[0].officers), 'hp', hpMin);
  ok(pd.crews[0] && pd.crews[0].officers.some((o) => o.shots > 0), 'an officer who is shot at fires back');
  ok(hpMin < 100, `the player lost health to their shots (hp ${hpMin.toFixed(1)})`);

  // ---- three stars: the other officer fires too ---------------------------------------------------------------------
  await p.evaluate(() => { __city.gameplay.health = 100; const e = __city.controllerManager.getActiveEntity().position; for (let i = 0; i < 3; i++) __city.wanted.crime('robbery', e.x, e.z); });
  await sim(2);
  w = await W();
  pd = await PD();
  ok(w.stars >= 3 && pd.crews[0].officers.filter((o) => !o.dead).every((o) => o.fire), `at ${w.stars} stars every officer fires`);

  // ---- killing one raises the heat ----------------------------------------------------------------------------------
  const heat0 = (await W()).heat;
  await p.evaluate(() => { const g = __city.gameplay.combat.list.find((g) => g.cop && !g.dead); __city.gameplay.combat.hurt(g, 999, g.x + 3, g.z); });
  await sim(1);
  const heat1 = (await W()).heat;
  ok(heat1 > heat0 || heat1 >= 99, `killing an officer raises the heat (${heat0} -> ${heat1})`);

  // ---- clear the wanted level: they go back to the car and it drives on ---------------------------------------------
  await p.evaluate(() => { __city.gameplay.health = 100; __city.wanted.reset(); });
  pd = await PD();
  ok(pd.crews.length >= 1 && pd.crews.every((c) => c.phase === 'back' && c.detached), 'clearing the level sends the officers back to their car');
  const gone = await until(() => __city.police.debug().crews.length === 0 && __city.gameplay.combat.list.every((g) => !g.cop || g.dead), 90, 1);
  ok(gone, 'the officers are back in their cars');
  await sim(10);
  ok(await p.evaluate(() => !__city.wanted.units.length && __city.police.debug().crews.length === 0), 'and the cars have driven on');
  ok((await W()).stars === 0, 'no wanted level left');

  // ---- a story job: no police, no heat ------------------------------------------------------------------------------
  await p.evaluate(() => { Object.defineProperty(__city.missions, 'onJob', { get: () => true, configurable: true }); });
  await p.evaluate(() => { const e = __city.controllerManager.getActiveEntity().position; for (let i = 0; i < 4; i++) { __city.wanted.crime('kill', e.x, e.z); __city.wanted.crime('carjack', e.x, e.z); } });
  await sim(60);
  w = await W();
  pd = await PD();
  ok(w.stars === 0 && w.heat === 0 && w.units === 0 && w.reports === 0 && pd.crews.length === 0, `during a job nothing accrues and no police spawn (${JSON.stringify({ stars: w.stars, heat: w.heat, units: w.units })})`);

  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 3)));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 400)); process.exit(1); });
