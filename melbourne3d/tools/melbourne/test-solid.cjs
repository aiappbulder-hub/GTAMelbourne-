// tools/melbourne/test-solid.cjs: the player's car can't be driven through an AI traffic car or the parked Low Tide tail car.
// Serve the repo root on port 8765, then: node tools/melbourne/test-solid.cjs
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 640, height: 400 } });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.clear(); localStorage.setItem('gta-melbourne3d-save-v1', JSON.stringify({ money: 1, progress: 10 })); } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto(`http://localhost:${process.env.PORT || 8765}/melbourne3d/index.html?webgl&quality=low&nointro&nofilm`, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.missions && __city.gameplay, null, { timeout: 480000 }); await p.waitForTimeout(3000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  // 1. an AI traffic car on the road: drive the player's car into its side/rear and see if we end up past it
  await p.evaluate(() => __city.teleportTo(-224, 120, 0));
  let target = null;
  for (let i = 0; i < 40 && !target; i++) { await p.waitForTimeout(4000); target = await p.evaluate(() => { const c = __city.trafficSystem.cars.find((c) => c.edge && !c.driven && !c.bus && Math.hypot(c.x + 224, c.z - 120) < 120); return c ? { id: __city.trafficSystem.cars.indexOf(c) } : null; }); }
  ok(!!target, 'an AI car is on the road');
  const run = await p.evaluate(({ id }) => {
    const c = __city.trafficSystem.cars[id], cm = __city.controllerManager, car = cm.entities.car;
    const fx = c.tx ?? Math.sin(c.yaw), fz = c.tz ?? Math.cos(c.yaw); // its direction of travel
    const heading = Math.atan2(fx, fz);
    cm.setMode('car'); car.position.x = c.x - fx * 7; car.position.z = c.z - fz * 7; car.heading = heading; car.speed = 25; car.vx = 0; car.vz = 0;
    window.__solid = { id, along0: 0 };
    return { x: c.x, z: c.z, heading };
  }, target);
  let worst = null;
  for (let k = 0; k < 14; k++) {
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => { const c = __city.trafficSystem.cars[__solid.id], car = __city.controllerManager.entities.car; const fx = Math.sin(car.heading), fz = Math.cos(car.heading); const along = (car.position.x - c.x) * fx + (car.position.z - c.z) * fz; const side = Math.abs((car.position.x - c.x) * fz - (car.position.z - c.z) * fx); return { along: +along.toFixed(1), side: +side.toFixed(1), speed: +car.speed.toFixed(1) }; });
    worst = worst ? { ...r, minAbsAlongOverlap: Math.min(worst.minAbsAlongOverlap, Math.abs(r.along)) } : { ...r, minAbsAlongOverlap: Math.abs(r.along) };
    if (r.along > 3 && r.side < 1.5) { log('THROUGH', JSON.stringify(r)); break; }
  }
  log('traffic car contact', JSON.stringify(worst));
  // 2. the tail car (Low Tide): parked at the kerb, then driven into
  await p.evaluate(() => { const q = __city.missions.jumpTo(0); __city.teleportTo(q.x + 2, q.z + 2, 0); });
  await p.waitForFunction(() => __city.missions.debug().inCut, null, { timeout: 200000, polling: 250 });
  await p.evaluate(() => __city.missions.skipCut());
  await p.waitForFunction(() => __city.missions.debug().step === 0, null, { timeout: 60000, polling: 250 });
  const tailPos = await p.evaluate(() => __city.missions.debug().tail);
  await p.evaluate((t) => { const cm = __city.controllerManager, car = cm.entities.car; cm.setMode('car'); car.position.x = t.x; car.position.z = t.z - 8; car.heading = 0; car.speed = 18; car.vx = 0; car.vz = 0; }, tailPos);
  let tail = null;
  for (let k = 0; k < 10; k++) { await p.waitForTimeout(1500); tail = await p.evaluate((t) => { const car = __city.controllerManager.entities.car; return { dz: +(car.position.z - t.z).toFixed(1), dx: +(car.position.x - t.x).toFixed(1), speed: +car.speed.toFixed(1), mission: __city.missions.debug().mission }; }, tailPos); if (tail.dz > 3.5) break; }
  log('tail car contact', JSON.stringify(tail));
  ok(tail.dz < 3.5 || Math.abs(tail.dx) > 1.5, 'the player cannot drive through the parked tail car');
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 3)));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 300)); process.exit(1); });
