// tools/melbourne/test-helipad.cjs: the heliport on the Yarra's north bank by Crown (js/helipad.js). Serve melbourne3d/
// (python3 -m http.server 8947 from melbourne3d/, or set PORT), then: node tools/melbourne/test-helipad.cjs
// 1. the pad stands over the river at the quay, with the helicopter parked on it
// 2. a person walks from the quay over the gangway on to the pad without sinking (time stepped by hand)
// 3. F beside the helicopter climbs in; it flies up and out; it flies back and lands on the pad; F climbs out on the pad
// 4. a helicopter left in the air comes back to the pad
// 5. the minimap has the helipad's icon; screenshots to /tmp/helipad-*.png
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 230 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto(`http://localhost:${process.env.PORT || 8947}/index.html?webgl&quality=low&nointro&nofilm`, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.helipad && __city.map, null, { timeout: 480000 });
  await p.waitForTimeout(2000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };

  const info = await p.evaluate(async () => {
    const m = await import('/js/melbourne-config.js');
    const h = __city.helipad, e = __city.controllerManager.entities.helicopter;
    const crown = m.NYC_LANDMARKS.find((l) => l.id === 'crown');
    return { pad: h.pad, gang: h.gangway, quayZ: h.quayZ, wet: m.inWater(h.pad.x, h.pad.z), quayDry: !m.inWater(h.gangway.x, h.quayZ - 2),
      heli: [e.position.x, e.position.y, e.position.z], crown: [crown.x, crown.z], icons: __city.map.extraIcons.length };
  });
  log(JSON.stringify(info));
  ok(info.wet && info.quayDry, 'the pad is over the river and the gangway starts on the quay');
  ok(Math.hypot(info.heli[0] - info.pad.x, info.heli[2] - info.pad.z) < 1 && info.heli[1] < 1, 'the helicopter is parked on the pad');
  ok(info.icons === 1, 'the minimap has a helipad icon');

  // 2. walk from the quay over the gangway
  const walk = await p.evaluate(() => {
    const cm = __city.controllerManager, h = __city.helipad;
    const g = h.gangway;
    cm.placePerson(g.x, cm.getGroundHeight(g.x, g.z0 - 8, 'person') ?? 0, g.z0 - 8, 0);
    cm.cameraYaw = 0;
    cm.keys.forward = 1;
    const p = cm.entities.person;
    let minY = 9, t = 0, steps = 0;
    const trail = [];
    while (p.position.z < h.pad.z - 2.5 && steps < 600) { cm.update(0.05, (t += 0.05)); steps++; minY = Math.min(minY, p.position.y); if (steps % 40 === 0) trail.push([+p.position.z.toFixed(1), +p.position.y.toFixed(2)]); }
    cm.keys.forward = 0;
    for (let i = 0; i < 10; i++) cm.update(0.05, (t += 0.05));
    return { z: p.position.z, x: p.position.x, y: p.position.y, minY, steps, trail, padZ: h.pad.z, mode: cm.activeMode };
  });
  log('walk', JSON.stringify(walk));
  ok(walk.minY > 0.1 && Math.abs(walk.y - 0.2) < 0.05, 'walking over the gangway and on to the pad, no sinking (min y ' + walk.minY.toFixed(2) + ')');
  ok(walk.z > walk.padZ - 4, 'and on to the pad');

  // 3. in, up, out, back, down, out
  const fl = await p.evaluate(async () => {
    const cm = __city.controllerManager, h = __city.helipad, heli = cm.entities.helicopter;
    const F = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
    let t = 100;
    const step = (n, dt = 0.05) => { for (let i = 0; i < n; i++) cm.update(dt, (t += dt)); };
    // stand 4 m from the helicopter
    cm.placePerson(heli.position.x + 4, 0.2, heli.position.z + 1, 0);
    step(4);
    F();
    const boarded = cm.activeMode === 'helicopter';
    cm.keys.up = 1; step(80); cm.keys.up = 0; step(20);
    const alt = heli.position.y;
    // fly 80 m out
    cm.keys.forward = 1; step(60); cm.keys.forward = 0; step(40);
    const far = Math.hypot(heli.position.x - h.pad.x, heli.position.z - h.pad.z);
    // fly back: steer at the pad, descend over it
    let landedAt = null;
    for (let i = 0; i < 4000; i++) {
      const dx = h.pad.x - heli.position.x, dz = h.pad.z - heli.position.z, d = Math.hypot(dx, dz);
      let err = Math.atan2(dx, dz) - heli.heading; err = Math.atan2(Math.sin(err), Math.cos(err));
      cm.keys.left = err > 0.04 ? Math.min(1, err * 2) : 0; cm.keys.right = err < -0.04 ? Math.min(1, -err * 2) : 0;
      cm.keys.forward = d > 25 && Math.abs(err) < 0.4 ? 1 : d > 6 && Math.abs(err) < 0.4 && heli.speed < 6 ? 0.25 : 0;
      cm.keys.backward = d < 25 && heli.speed > 8 ? 1 : 0;
      cm.keys.down = d < 10 ? 1 : 0; cm.keys.up = d >= 10 && heli.position.y < 25 ? 1 : 0;
      step(1);
      if (heli.position.y < 0.5 && Math.abs(heli.speed) < 1) { landedAt = i; break; }
    }
    for (const k of ['left', 'right', 'forward', 'backward', 'up', 'down']) cm.keys[k] = 0;
    step(30);
    const end = { x: heli.position.x, y: heli.position.y, z: heli.position.z, speed: heli.speed, onPad: Math.abs(heli.position.x - h.pad.x) < h.pad.half && Math.abs(heli.position.z - h.pad.z) < h.pad.half, landed: h.landed() };
    F();
    const p = cm.entities.person;
    step(10);
    return { boarded, alt, far, landedAt, end, out: cm.activeMode === 'person', py: p.position.y, px: [p.position.x - h.pad.x, p.position.z - h.pad.z] };
  });
  log('flight', JSON.stringify(fl));
  ok(fl.boarded, 'F beside the helicopter climbs in');
  ok(fl.alt > 20, `it takes off (${fl.alt.toFixed(0)} m)`);
  ok(fl.far > 40, `and flies out (${fl.far.toFixed(0)} m)`);
  ok(fl.landedAt !== null && fl.end.onPad && fl.end.y < 0.6, 'it flies back and lands on the pad');
  ok(fl.out && Math.abs(fl.py - 0.2) < 0.1, 'F once landed climbs out, on the pad');

  // 4. left in the air: it comes back
  const lost = await p.evaluate(async () => {
    const cm = __city.controllerManager, h = __city.helipad, heli = cm.entities.helicopter;
    let t = 500;
    const step = (n, dt = 0.05) => { for (let i = 0; i < n; i++) { cm.update(dt, (t += dt)); h.update(dt); } };
    cm.setMode('helicopter');
    heli.position.set(h.pad.x + 60, 60, h.pad.z + 80);
    step(5);
    cm.setMode('person');
    step(120); // 6 s
    return { d: Math.hypot(heli.position.x - h.pad.x, heli.position.z - h.pad.z), y: heli.position.y };
  });
  log('abandoned in the air', JSON.stringify(lost));
  ok(lost.d < 1 && lost.y < 1, 'a helicopter left in the air is back on the pad');

  // 5. pictures: the pad from the quay, and the radar with its icon
  await p.evaluate(() => {
    const cm = __city.controllerManager, h = __city.helipad, g = h.gangway;
    cm.placePerson(g.x + 2, 0.2, g.z0 + 1, 0);
    __city.selectCamera('chase');
  });
  await p.waitForTimeout(6000);
  await p.setViewportSize({ width: 900, height: 560 });
  await p.waitForTimeout(8000);
  await p.screenshot({ path: '/tmp/helipad-day.png' });
  const el = await p.$('#minimap-canvas');
  const box = el && await el.boundingBox();
  if (box) await p.screenshot({ path: '/tmp/helipad-minimap.png', clip: box });
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
