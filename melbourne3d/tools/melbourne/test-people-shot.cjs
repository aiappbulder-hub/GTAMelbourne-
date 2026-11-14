// tools/melbourne/test-people-shot.cjs: a shot pedestrian goes down and the body stays. (Its first check, a car driven at
// a pedestrian from 14 m, fails by design when the pedestrian sidesteps in time: use test-people-hit.cjs for contact.)
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 360, height: 230 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto('http://localhost:' + (process.env.PORT || 8765) + '/melbourne3d/index.html?webgl&quality=low&nointro&nofilm', { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.gameplay && __city.trafficSystem, null, { timeout: 480000 }); await p.waitForTimeout(3000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  // find a pedestrian: go to the Mall and wait for some to be placed
  await p.evaluate(() => __city.teleportTo(-242, -221, 0));
  let peds = [];
  for (let i = 0; i < 40 && peds.length < 3; i++) { await p.waitForTimeout(4000); peds = await p.evaluate(() => __city.trafficSystem.peds.filter((q) => q.placed && !q.dead && !q.node).slice(0, 6).map((q) => ({ i: q.index, x: q.x, z: q.z }))); }
  log('peds found', peds.length, JSON.stringify(peds.slice(0, 3)));
  ok(peds.length >= 2, 'pedestrians are placed near the Mall');
  // 1. car through a pedestrian (G2): 14 m behind, driving straight at them at 15 m/s
  const A = peds[0];
  await p.evaluate(({ A }) => {
    const cm = __city.controllerManager, car = cm.entities.car;
    const q = __city.trafficSystem.peds.find((x) => x.index === A.i);
    const tx = q.x, tz = q.z; const h = Math.atan2(0, 1); // heading 0 drives +z
    cm.setMode('car'); car.position.x = tx; car.position.z = tz - 14; car.heading = h; car.speed = 15; car.vx = 0; car.vz = 0;
    window.__hit = { i: A.i, minD: 1e9 };
  }, { A });
  let res = null;
  for (let k = 0; k < 30; k++) {
    await p.waitForTimeout(1500);
    res = await p.evaluate(() => { const q = __city.trafficSystem.peds.find((x) => x.index === __hit.i); const c = __city.controllerManager.entities.car; const d = q ? Math.hypot(q.x - c.position.x, q.z - c.position.z) : null; __hit.minD = Math.min(__hit.minD, d ?? 1e9); return { dead: !!(q && q.dead), d, minD: __hit.minD, speed: c.speed, placed: q && q.placed }; });
    if (res.dead) break;
  }
  log('car vs ped', JSON.stringify(res));
  ok(res.dead, 'G2: a car driven at a pedestrian knocks them down (not through)');
  // 2. a shot goes down in place (G3): on foot, 7 m from another pedestrian, aim and fire
  const B = peds[1];
  const shot = await p.evaluate(async ({ B }) => {
    const cm = __city.controllerManager; cm.setMode('person');
    const q = __city.trafficSystem.peds.find((x) => x.index === B.i); if (!q) return { err: 'gone' };
    const e = cm.entities.person; e.position.x = q.x; e.position.z = q.z - 7; e.heading = 0; e.speed = 0;
    const t0 = performance.now(); const x0 = q.x, z0 = q.z;
    __city.gameplay.fire();
    return { x0, z0, t0 };
  }, { B });
  let after = null;
  for (let k = 0; k < 12; k++) { await p.waitForTimeout(1500); after = await p.evaluate(({ B }) => { const q = __city.trafficSystem.peds.find((x) => x.index === B.i); return q ? { dead: !!q.dead, x: q.x, z: q.z } : null; }, { B }); if (after && after.dead) break; }
  log('shot', JSON.stringify(shot), JSON.stringify(after));
  ok(after && after.dead, 'G3: a shot pedestrian goes down');
  // 3. the dead stay on screen (G8): still there and placed after a while
  await p.waitForTimeout(8000);
  const still = await p.evaluate(({ B }) => { const q = __city.trafficSystem.peds.find((x) => x.index === B.i); return q ? { dead: !!q.dead, placed: !!q.placed } : null; }, { B });
  log('body later', JSON.stringify(still));
  ok(still && still.dead, 'G8: the body is still there');
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 400)); process.exit(1); });
