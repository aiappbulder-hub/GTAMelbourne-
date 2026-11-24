// tools/melbourne/test-vehicle-solids.cjs: the player's car can't be driven through a tram, a traffic car or a police car,
// and a police car driving into the player's stopped car shoves it (js/vehicle-solids.js, js/traffic.js).
// Serve the repo root, then: PORT=8823 [SHOTS=dir] node melbourne3d/tools/melbourne/test-vehicle-solids.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PE ' + e.message.slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CE ' + m.text().slice(0, 200)); });
  await p.goto(`http://localhost:${process.env.PORT || 8823}/melbourne3d/index.html?webgl&quality=low&nointro&nofilm&freeroam`, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.gameplay && __city.solids, null, { timeout: 600000 });
  log('loaded');
  await p.waitForTimeout(3000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  const shot = async (name) => {
    if (!process.env.SHOTS) return;
    const url = await p.evaluate(() => new Promise((res) => {
      const r = __city.renderer, orig = r.render.bind(r); let n = 0;
      r.render = (...a) => { const o = orig(...a); if (++n >= 2) { r.render = orig; res(r.domElement.toDataURL('image/png')); } return o; };
    }));
    fs.writeFileSync(`${process.env.SHOTS}/col-${name}.png`, Buffer.from(url.split(',')[1] || '', 'base64'));
  };
  // Watch the player's car against a body for `secs` (in the body's frame, every frame): did it ever get inside the
  // body further than `tol`, or come out on the far side?
  const watch = (get, secs, tol = 0.3) => p.evaluate(([get, secs, tol]) => new Promise((res) => {
    const body = new Function('return ' + get)();
    const car = __city.controllerManager.entities.car;
    let worst = -Infinity, through = false, s0 = null, frames = 0, minSpeed = Infinity;
    const t0 = performance.now(), start = { x: car.position.x, z: car.position.z };
    const tick = () => {
      const o = body();
      if (o) {
        const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
        const dx = car.position.x - o.x, dz = car.position.z - o.z;
        const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
        // overlap of the car's footprint (as a circle-ish 0.86 m half width) with the body's box, along the hit axis
        const ax = o.axis === 'along' ? along : side, ext = o.axis === 'along' ? o.halfL : o.halfW;
        if (s0 === null) s0 = Math.sign(ax);
        worst = Math.max(worst, ext + 0.86 - Math.abs(ax));
        if (Math.sign(ax) !== s0 && Math.abs(o.axis === 'along' ? side : along) < (o.axis === 'along' ? o.halfW : o.halfL)) through = true;
      }
      minSpeed = Math.min(minSpeed, Math.abs(car.speed));
      frames++;
      if (performance.now() - t0 < secs * 1000) requestAnimationFrame(tick);
      else res({ penetration: +worst.toFixed(2), through, frames, moved: +Math.hypot(car.position.x - start.x, car.position.z - start.z).toFixed(1), speed: +car.speed.toFixed(1), minSpeed: +minSpeed.toFixed(1), hits: __city.solids.stats.hits, last: __city.solids.stats.last });
    };
    requestAnimationFrame(tick);
  }), [get, secs, tol]);
  await p.evaluate(() => { __city.teleportTo(-224, 120, Math.PI / 2); __city.controllerManager.setMode('car'); });
  await p.waitForTimeout(4000);

  // 1. a tram: the car is put 9 m off its side, aimed square at it, at 20 m/s
  const t1 = await p.evaluate(() => {
    const ts = __city.tramSystem, cm = __city.controllerManager, car = cm.entities.car;
    let best = null, bd = 1e9;
    for (const t of ts.trams) { if (t.cx === undefined) continue; const d = Math.hypot(t.cx + 224, t.cz - 120); if (d < bd) { bd = d; best = t; } }
    window.__tram = best;
    best.v = 0; best.dwell = 30; // (standing at a stop)
    const fx = Math.sin(best.yaw), fz = Math.cos(best.yaw);
    __city.teleportTo(best.cx + fz * 9, best.cz - fx * 9, Math.atan2(-fz, fx));
    cm.setMode('car');
    return { d: Math.round(bd), x: Math.round(best.cx), z: Math.round(best.cz) };
  });
  log('tram at', JSON.stringify(t1));
  await p.waitForTimeout(2500);
  await p.evaluate(() => {
    const t = __tram, car = __city.controllerManager.entities.car, fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
    car.position.x = t.cx + fz * 9; car.position.z = t.cz - fx * 9; car.heading = Math.atan2(-fz, fx); car.speed = 20; car.vx = car.vz = car.angularVel = 0;
  });
  const r1 = await watch('() => ({ x: __tram.cx, z: __tram.cz, yaw: __tram.yaw, halfL: 6.5, halfW: 1.4, axis: "side" })', 4);
  log('tram', JSON.stringify(r1));
  ok(!r1.through && r1.penetration < 0.35, 'the car stops at the tram\'s side (no drive-through)');
  ok(r1.minSpeed < 6, 'the car loses its speed in the hit');
  await shot('tram');

  // 2. a traffic car: from 8 m behind it at 25 m/s
  let id = -1;
  await p.evaluate(() => __city.teleportTo(-242, -221, 0));
  for (let i = 0; i < 30 && id < 0; i++) {
    await p.waitForTimeout(3000);
    id = await p.evaluate(() => { const P = __city.controllerManager.entities.car.position; return __city.trafficSystem.cars.findIndex((c) => c.edge && !c.driven && Math.hypot(c.x - P.x, c.z - P.z) < 150 && c.edge.len - c.s > 40); });
  }
  ok(id >= 0, 'a traffic car to hit');
  if (id >= 0) {
    await p.evaluate((id) => {
      const c = __city.trafficSystem.cars[id], cm = __city.controllerManager, car = cm.entities.car;
      window.__tc = c;
      const h = Math.atan2(c.tx, c.tz);
      __city.teleportTo(c.x - c.tx * 9, c.z - c.tz * 9, h); cm.setMode('car');
      car.position.x = c.x - c.tx * 9; car.position.z = c.z - c.tz * 9; car.heading = h; car.speed = 25 + c.speed; car.vx = car.vz = 0;
    }, id);
    const r2 = await watch('() => ({ x: __tc.x, z: __tc.z, yaw: Math.atan2(__tc.tx, __tc.tz), halfL: __tc.halfL || 2.18, halfW: __tc.halfWidth, axis: "along" })', 3);
    log('traffic car', JSON.stringify(r2));
    ok(!r2.through && r2.penetration < 0.6, 'the car does not pass through the traffic car');
    await shot('traffic');
  }

  // 3. a police car (a pursuer, as the wanted level sends): parked across the road, driven into at 22 m/s; then it is
  // driven into the player's stopped car
  const pol = await p.evaluate(async () => {
    const { createPursuer } = await import('/melbourne3d/js/pursuit.js');
    const cm = __city.controllerManager, car = cm.entities.car;
    __city.teleportTo(-224, 120, Math.PI / 2); cm.setMode('car');
    const P = car.position;
    const u = createPursuer({ scene: __city.scene, controllerManager: cm, traffic: () => __city.trafficSystem });
    window.__cop = u;
    await u.start({ x: P.x + 14, z: P.z, heading: 0, file: 'police', color: 0xf4f6f8, wait: true });
    __city.solids.addProvider((x, z, r, out) => { const bx = u.box(); if (bx) out.push(bx); });
    const loop = () => { u.update(1 / 30); requestAnimationFrame(loop); }; loop();
    return { x: P.x + 14, z: P.z, box: !!u.box() };
  });
  log('police car', JSON.stringify(pol));
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const car = __city.controllerManager.entities.car, c = __cop.position; car.position.x = c.x - 9; car.position.z = c.z; car.heading = Math.PI / 2; car.speed = 22; car.vx = car.vz = car.angularVel = 0; });
  const r3 = await watch('() => { const b = __cop.box(); return b && { ...b, axis: "side" }; }', 3);
  log('police car hit', JSON.stringify(r3));
  ok(!r3.through && r3.penetration < 0.35, 'the car stops at the police car (no drive-through)');
  await shot('police');
  // the police car rams the stopped player
  const ram = await p.evaluate(async () => {
    const u = __cop, car = __city.controllerManager.entities.car;
    u.stop();
    car.speed = 0; car.vx = car.vz = car.angularVel = 0; car.heading = Math.PI / 2;
    const P = car.position;
    await u.start({ x: P.x - 12, z: P.z, heading: Math.PI / 2, file: 'police', color: 0xf4f6f8, wait: true });
    u.driveOff();
    return { x0: P.x };
  });
  const r4 = await watch('() => { const b = __cop.box(); return b && { ...b, axis: "along" }; }', 4);
  log('police ram', JSON.stringify(r4), 'player pushed', r4.moved);
  ok(!r4.through && r4.moved > 0.5, 'the police car driving into the stopped car shoves it and does not pass through');
  await shot('ram');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs.slice(0, 5)));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 300)); process.exit(1); });
