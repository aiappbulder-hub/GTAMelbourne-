// tools/melbourne/test-people-hit.cjs: a fast car that reaches a pedestrian knocks them down (once, listener fires), a
// slow one doesn't. Serve the repo root on port 8765 (python3 -m http.server 8765), then: node tools/melbourne/test-people-hit.cjs
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 800, height: 500 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto('http://localhost:8765/melbourne3d/index.html?webgl&quality=low&nointro&nofilm', { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.gameplay && __city.trafficSystem, null, { timeout: 480000 }); await p.waitForTimeout(3000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  await p.evaluate(() => __city.teleportTo(-242, -221, 0));
  let peds = [];
  for (let i = 0; i < 40 && peds.length < 2; i++) { await p.waitForTimeout(4000); peds = await p.evaluate(() => __city.trafficSystem.peds.filter((q) => q.placed && !q.dead && !q.node).slice(0, 4).map((q) => ({ i: q.index }))); }
  ok(peds.length >= 2, 'pedestrians placed');
  await p.evaluate(() => { window.__hits = []; __city.trafficSystem.setPedHitListener((ped, byPlayer, speed) => __hits.push({ i: ped.index, byPlayer, speed: +speed.toFixed(1) })); });
  const drive = (idx, speed, gap) => p.evaluate(({ idx, speed, gap }) => {
    const cm = __city.controllerManager, car = cm.entities.car, q = __city.trafficSystem.peds.find((x) => x.index === idx);
    cm.setMode('car'); car.position.x = q.x; car.position.z = q.z - gap; car.heading = 0; car.speed = speed; car.vx = 0; car.vz = 0;
  }, { idx, speed, gap });
  const state = (idx) => p.evaluate((idx) => { const q = __city.trafficSystem.peds.find((x) => x.index === idx); return q ? { dead: !!q.dead } : null; }, idx);
  // slow car (2 m/s): no kill
  await drive(peds[1].i, 2, 1.2);
  await p.waitForTimeout(6000);
  const slow = await state(peds[1].i); log('slow car', JSON.stringify(slow), 'hits', JSON.stringify(await p.evaluate(() => __hits)));
  ok(slow && !slow.dead && (await p.evaluate(() => __hits.length)) === 0, 'a slow car (2 m/s) does not kill');
  // fast car, too close to dodge: killed once, listener fires with byPlayer
  await drive(peds[0].i, 15, 1.5);
  let st = null;
  for (let k = 0; k < 12; k++) { await p.waitForTimeout(1500); st = await state(peds[0].i); if (st && st.dead) break; }
  const hits = await p.evaluate(() => __hits);
  log('fast car', JSON.stringify(st), 'hits', JSON.stringify(hits));
  ok(st && st.dead, 'G2: a fast car that reaches a pedestrian knocks them down');
  ok(hits.length === 1 && hits[0].byPlayer === true, 'the hit listener fires once, for the player\'s car');
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 400)); process.exit(1); });
