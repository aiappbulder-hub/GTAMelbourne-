// tools/melbourne/test-bikies.cjs: a pack of bikies (js/bikies.js). Force-spawns a pack near the player, checks 4+ choppers
// with riders that ride along the road lanes, that a shot at them turns the pack hostile, that they pull up, get off and fire at
// the player, and that killing them all ends the encounter. Serve melbourne3d/ (python3 -m http.server 8977; PORT= for another;
// PAGE=/melbourne3d/index.html if serving the repository root), then: node tools/melbourne/test-bikies.cjs. Under software
// rendering the game runs a frame every few seconds, so the checks step the game's own updates by hand in 0.05 s steps.
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 360, height: 230 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto('http://localhost:' + (process.env.PORT || 8977) + (process.env.PAGE || '/index.html') + '?webgl&quality=low&nointro&nofilm', { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.gameplay && __city.bikies && __city.cast && __city.cast.ready, null, { timeout: 480000 });
  await p.waitForTimeout(3000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  const sim = (secs) => p.evaluate((secs) => { for (let t = 0; t < secs; t += 0.05) { __city.gameplay.update(0.05); __city.bikies.update(0.05); __city.cast.posePlayer(0.05); } }, secs);
  const SPOT = { x: -240.68, z: -221 };
  await p.evaluate((SPOT) => {
    __city.gameplay.leaveCarNow();
    __city.teleportTo(SPOT.x, SPOT.z, 0);
    const e = __city.controllerManager.entities.person;
    e.position.x = SPOT.x; e.position.z = SPOT.z; e.heading = 0; e.speed = 0;
    __city.gameplay.health = 100;
    // the two bikie bodies are fetched on the first spawn: have them before the checks
    const c = __city.gameplay.combat; c.spawn({ x: 0, z: 0, model: 'Male_Adult_04' }); c.spawn({ x: 0, z: 0, model: 'Male_Adult_10' }); c.clear();
  }, SPOT);
  for (let i = 0; i < 90; i++) { if (await p.evaluate(() => __city.cast.loaded.includes('Male_Adult_04') && __city.cast.loaded.includes('Male_Adult_10'))) break; await p.waitForTimeout(1000); }

  // ---- (a) a pack of choppers with riders, riding the road ----------------------------------------------------------------
  const n = await p.evaluate(() => __city.bikies.spawnPack({ n: 5, range: [40, 80], hidden: false }).length);
  const d0 = await p.evaluate(() => __city.bikies.debug());
  ok(n >= 4 && d0.bikes.length >= 4 && d0.bikes.every((k) => k.mounted), 'a pack of ' + d0.bikes.length + ' bikes, every one with a rider');
  const samples = [];
  const first = (await p.evaluate(() => __city.bikies.debug())).bikes.map((k) => [k.x, k.z]);
  for (let i = 0; i < 16; i++) {
    await sim(1);
    const d = await p.evaluate(() => __city.bikies.debug());
    if (!d) break;
    samples.push(d.bikes.map((k) => [k.x, k.z]));
  }
  ok(samples.length >= 12, 'the pack kept riding for ' + samples.length + ' s');
  const last = samples[samples.length - 1];
  const moved = last.map((q, i) => Math.hypot(q[0] - first[i][0], q[1] - first[i][1]));
  ok(moved.every((m) => m > 25), 'every bike advanced along the road (' + moved.map((m) => m.toFixed(0)).join(', ') + ' m)');
  const dists = await p.evaluate(`(${((pts) => pts.map((q) => { let best = 1e9; for (const e of __city.trafficSystem.network.edges) { const dx = q[0] - e.sx, dz = q[1] - e.sz, s = dx * e.dx + dz * e.dz; if (s < -14 || s > e.len + 14) continue; for (const o of e.lanes) best = Math.min(best, Math.abs(dx * e.rx + dz * e.rz - o)); } return best; })).toString()})(${JSON.stringify(samples.flat())})`);
  const onRoad = dists.filter((v) => v < 4.5).length / dists.length;
  log('lane distance: max', Math.max(...dists).toFixed(1), 'on road', (onRoad * 100).toFixed(0) + '%');
  ok(onRoad >= 0.9, 'the bikes stay within 4.5 m of a lane (' + (onRoad * 100).toFixed(0) + '% of samples)');
  ok((await p.evaluate(() => __city.bikies.state())).hostile === false, 'a peaceful pack is not hostile');

  // ---- (b) shoot at one: the pack turns hostile, pulls up, dismounts and fires -------------------------------------------
  await p.evaluate(() => {
    const g = __city.gameplay, pk = __city.bikies.pack, bk = pk.bikes[0];
    const e = __city.controllerManager.entities.person;
    const fx = Math.sin(bk.heading), fz = Math.cos(bk.heading);
    e.position.x = bk.x - fx * 12; e.position.z = bk.z - fz * 12; e.heading = bk.heading; e.speed = 0;
    g.selectSlot(0);
  });
  await sim(0.4);
  await p.evaluate(() => { const bk = __city.bikies.pack.bikes[0], e = __city.controllerManager.entities.person; e.position.x = bk.x - Math.sin(bk.heading) * 12; e.position.z = bk.z - Math.cos(bk.heading) * 12; e.heading = bk.heading; __city.gameplay.fire(); });
  const shot = await p.evaluate(() => __city.gameplay.state.lastShot ? __city.gameplay.state.lastShot.kind : null);
  log('player shot, lastShot kind:', shot);
  await sim(0.2);
  const st = await p.evaluate(() => __city.bikies.state());
  ok(st.hostile, 'shooting at the pack turned it hostile (' + st.why + ')');
  await p.evaluate(() => { __city.gameplay.health = 100; });
  let dismounted = 0, hpMin = 100, shots = 0, riders = [];
  for (let i = 0; i < 160; i++) {
    await sim(0.5);
    const d = await p.evaluate(() => { const g = __city.gameplay; return { dbg: __city.bikies.debug(), hp: g.state.hp, comb: g.combat.debug() }; });
    hpMin = Math.min(hpMin, d.hp);
    dismounted = d.dbg.bikes.filter((k) => !k.mounted).length;
    shots = d.dbg.bikes.reduce((a, k) => a + (k.shots || 0), 0);
    riders = d.dbg.bikes;
    if (d.hp < 40) await p.evaluate(() => { __city.gameplay.health = 100; });
    if (dismounted >= 2 && (hpMin < 100 || shots > 0) && i > 20) break;
  }
  log('fight', JSON.stringify(riders.map((k) => k.state + ':' + k.phase + ':' + k.shots)), 'hp min', hpMin.toFixed(1));
  ok(dismounted >= 2, 'the bikes pulled up and the riders got off (' + dismounted + ' on foot)');
  ok(shots > 0, 'the dismounted bikies fired at the player (' + shots + ' shots)');
  ok(hpMin < 100, 'the player lost health to them (hp ' + hpMin.toFixed(1) + ')');

  // ---- (c) kill them all: the encounter ends -----------------------------------------------------------------------------
  await p.evaluate(() => { for (const g of __city.gameplay.combat.list) __city.gameplay.combat.hurt(g, 999, 0, 0); });
  await sim(2);
  const over = await p.evaluate(() => __city.bikies.state());
  ok(over.over && over.alive === 0, 'every rider dead: the encounter is over');
  await sim(25);
  ok(!(await p.evaluate(() => __city.bikies.state())).active, 'and the pack is cleared away');

  // ---- (d) a rider killed on the bike comes off it ----------------------------------------------------------------------
  await p.evaluate((SPOT) => { const e = __city.controllerManager.entities.person; e.position.x = SPOT.x; e.position.z = SPOT.z; __city.gameplay.health = 100; __city.bikies.spawnPack({ n: 4, range: [40, 80], hidden: false }); }, SPOT);
  await sim(4);
  await p.evaluate(() => { const g = __city.bikies.pack.bikes[2].g; __city.gameplay.combat.hurt(g, 999, 0, 0); });
  await sim(2);
  const down = await p.evaluate(() => __city.bikies.debug().bikes[2]);
  ok(down.state === 'down' && !down.mounted && down.dead, 'a rider shot off his bike: the bike goes down (' + down.state + ')');
  await p.evaluate(() => __city.bikies.cancel());
  await p.evaluate(() => __city.gameplay.combat.clear());

  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 600)); process.exit(1); });
