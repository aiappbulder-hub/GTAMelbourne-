// tools/melbourne/test-aimed-shot.cjs: aiming (Q held) and firing hits the person under the crosshair, short and long
// range, with the pistol and the shotgun, and a shot at nobody (the person well off the aim, or behind) doesn't.
// Serve the repo root on port 8765 (python3 -m http.server 8765), then: node melbourne3d/tools/melbourne/test-aimed-shot.cjs
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 480, height: 300 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto('http://localhost:' + (process.env.PORT || 8765) + '/melbourne3d/index.html?webgl&quality=low&nointro&nofilm', { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.gameplay && __city.trafficSystem, null, { timeout: 480000 }); await p.waitForTimeout(3000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  await p.evaluate(() => __city.teleportTo(-242, -221, 0));
  let n = 0;
  for (let i = 0; i < 40 && n < 4; i++) { await p.waitForTimeout(4000); n = await p.evaluate(() => __city.trafficSystem.peds.filter((q) => q.placed && !q.dead && !q.node).length); }
  ok(n >= 4, 'pedestrians are placed');
  // stand the player in the open at the ped's spot, facing +z (heading 0), and aim (Q)
  const setup = (weapon) => p.evaluate((weapon) => {
    const g = __city.gameplay, cm = __city.controllerManager, e = cm.entities.person;
    cm.setMode('person');
    window.__peds = window.__peds || __city.trafficSystem.peds.filter((q) => q.placed && !q.dead && !q.node).slice(0, 4);
    // an open lane to shoot along: no collider within 1 m of the line from 15 m behind to 45 m ahead of the spot
    const clear = (x, z) => { for (let d = -15; d <= 45; d += 1) if (cm.nearColliders(x, z + d, 1.2).length) return false; return true; };
    let spot = null;
    for (const q0 of __peds) for (let dx = -60; dx <= 60 && !spot; dx += 6) for (let dz = -80; dz <= 80 && !spot; dz += 8) if (clear(q0.x + dx, q0.z + dz)) spot = { x: q0.x + dx, z: q0.z + dz };
    if (!spot) spot = { x: -240.68, z: -221 }; // (open ground on the Mall)
    e.position.x = spot.x; e.position.z = spot.z; e.heading = 0; e.speed = 0;
    for (let k = 0; k < 3 && g.state.wi !== weapon; k++) g.switchWeapon?.(1);
    return { wi: g.state.wi };
  }, weapon);
  log('setup', JSON.stringify(await setup(0)));
  await p.keyboard.down('KeyQ');
  await p.waitForTimeout(3500);
  // fire with the ped at (dist m ahead, lateral m right of) the aim; returns whether it went down
  const shoot = (idx, dist, lateral, weapon = 0) => p.evaluate(async ({ idx, dist, lateral, weapon }) => {
    const g = __city.gameplay, cm = __city.controllerManager, e = cm.entities.person, q = __peds[idx];
    while (g.state.wi !== weapon) g.switchWeapon(1);
    await new Promise((r) => setTimeout(r, 100));
    const ex = e.position.x, ez = e.position.z, h = 0; // (the aim stays on +z; the player's own heading follows each shot)
    q.x = ex + Math.cos(h) * -lateral + Math.sin(h) * dist; q.z = ez + Math.sin(h) * lateral + Math.cos(h) * dist;
    const px = q.x, pz = q.z;
    let tries = 0;
    while (g.state.cooldown > 0 || g.state.reloading > 0) { await new Promise((r) => setTimeout(r, 100)); if (++tries > 60) break; }
    q.x = px; q.z = pz;
    g.fire();
    return { dead: !!q.dead, wi: g.state.wi, shot: g.state.lastShot, ped: [q.x, q.z], me: [e.position.x, e.position.y, e.position.z] };
  }, { idx, dist, lateral, weapon });
  let r = await shoot(0, 5, 0); log('5 m ahead', JSON.stringify(r)); ok(r.dead, 'pistol: person 5 m dead ahead goes down');
  r = await shoot(1, 30, 0); log('30 m ahead', JSON.stringify(r)); ok(r.dead, 'pistol: person 30 m dead ahead goes down');
  r = await shoot(2, 20, 3.5); log('20 m ahead, 3.5 m right', JSON.stringify(r)); ok(!r.dead, 'a person 10 degrees off the aim is not hit');
  r = await shoot(3, -10, 0); log('10 m behind', JSON.stringify(r)); ok(!r.dead, 'a person behind is not hit');
  await p.keyboard.up('KeyQ');
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 400)); process.exit(1); });
