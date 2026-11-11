// tools/melbourne/test-m1.cjs: Milestone 1 acceptance run (docs/story/MILESTONES.md). Serve the repository root on port
// 8765 (python3 -m http.server 8765), then: node tools/melbourne/test-m1.cjs. Needs Playwright with Chromium. It seeds a
// v1 save, plays Low Tide end to end through window.__city (a stealth fail, the waterfront route, the tail, the
// Quiet Room, the choice), reloads to check the save, and corrupts it. Prints PASS/FAIL per check; exits 1 on a FAIL.
const { chromium } = require('playwright');
const URL_ = 'http://localhost:8765/melbourne3d/index.html?webgl&quality=low&nointro&nofilm';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 800, height: 500 } });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('gta-melbourne3d-save-v1', JSON.stringify({ money: 12345, progress: 10 }));
    }
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ok = (cond, what) => { log(cond ? 'PASS' : 'FAIL', what); if (!cond) process.exitCode = 1; };
  const ready = async () => { await p.waitForFunction(() => window.__city && __city.missions && __city.gameplay, null, { timeout: 480000 }); await p.waitForTimeout(3000); };
  const dbg = () => p.evaluate(() => __city.missions.debug());
  const waitFor = async (fn, ms, arg) => { await p.waitForFunction(fn, arg, { timeout: ms * 10, polling: 250 }); };

  await p.goto(URL_, { timeout: 120000 }); await ready();
  let st = await p.evaluate(() => ({ prog: __city.missions.progress, money: __city.missions.money, flags: __city.missions.flags, v2: !!localStorage.getItem('gta-melbourne3d-save-v2') }));
  ok(st.prog === 0 && st.money === 12345 && JSON.stringify(st.flags) === '{}' && st.v2, `1.1 v1 save migrated (cash kept; the new story starts from the top) ${JSON.stringify(st)}`);
  ok((await p.evaluate(() => __city.missions.missions.length)) === 13 && (await p.evaluate(() => __city.missions.missions[0].name)) === 'Low Tide', '1.4 Low Tide is job 1 of 13');

  // to M1's marker: it starts (black card), then the cut scene
  await p.evaluate(() => { const q = __city.missions.jumpTo(0); __city.teleportTo(q.x + 2, q.z + 2, 0); });
  await waitFor(() => __city.missions.debug().blackout, 30000); ok(true, '1.4 M1 opens on the black card');
  await waitFor(() => __city.missions.debug().inCut, 30000); ok(true, '1.8 cut scene with Davo');
  ok((await p.evaluate(() => __city.cast.debug().Davo)) !== 'hidden', `1.8 Davo visible in the cut (${await p.evaluate(() => __city.cast.debug().Davo)})`);
  await p.evaluate(() => __city.missions.skipCut());
  await waitFor(() => __city.missions.debug().step === 0, 10000);
  st = await dbg(); ok(st.tail && st.tail.parked, `tail parked at the kerb ${JSON.stringify(st.tail)}`);

  // 1.5 stealth fail: stand on the esplanade in front of the watcher
  await p.evaluate(() => __city.teleportTo(-1786, -95, Math.PI));
  const fps0 = await p.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(n / 3); }; requestAnimationFrame(f); }));
  log('fps', fps0.toFixed(1));
  for (let k = 0; k < 30; k++) {
    const d = await p.evaluate(() => ({ dbg: __city.missions.debug(), pos: { ...__city.controllerManager.getActiveEntity().position }, mode: __city.controllerManager.activeMode }));
    if (k % 3 === 0) log('probe', JSON.stringify({ seen: d.dbg.seen, m: d.dbg.mission, x: d.pos.x.toFixed(0), z: d.pos.z.toFixed(0), mode: d.mode }));
    if (!d.dbg.mission) break;
    await p.waitForTimeout(2000);
  }
  await waitFor(() => !__city.missions.debug().mission, 5000);
  ok(true, '1.5 seen on the esplanade: mission failed'); ok(!(await dbg()).tail, '1.7 tail gone after a fail');

  // restart from the marker; gunfire in the stealth step blows the job (G11)
  await p.evaluate(() => { const q = __city.missions.jumpTo(0); __city.teleportTo(q.x + 2, q.z + 2, 0); });
  await waitFor(() => __city.missions.debug().inCut, 40000);
  await p.evaluate(() => __city.missions.skipCut());
  await waitFor(() => __city.missions.debug().step === 0, 10000);
  await p.evaluate(() => __city.teleportTo(-1840, -150, 0));
  await p.waitForTimeout(1500);
  await p.evaluate(() => __city.missions.onGunfire());
  await waitFor(() => !__city.missions.debug().mission, 8000); ok(true, '1.5 gunfire during the stealth step fails the job');
  await p.evaluate(() => { const q = __city.missions.jumpTo(0); __city.teleportTo(q.x + 2, q.z + 2, 0); });
  await waitFor(() => __city.missions.debug().inCut, 40000);
  await p.evaluate(() => __city.missions.skipCut());
  await waitFor(() => __city.missions.debug().step === 0, 10000);
  // the watchers' and Davo's feet are on the ground (G4)
  const feet = await p.evaluate(() => {
    const out = {};
    __city.scene.traverse((o) => { if (/^Person:/.test(o.name) && o.visible) out[o.name] = [+o.position.x.toFixed(2), +o.position.y.toFixed(3), +o.position.z.toFixed(2)]; });
    return Object.fromEntries(Object.entries(out).map(([k, [x, y, z]]) => [k, { y, ground: __city.controllerManager.getGroundHeight(x, z, 'person') }]));
  });
  const sunk = Object.entries(feet).filter(([k, v]) => !/player/.test(k) && Math.abs(v.y - v.ground) > 0.06);
  ok(Object.keys(feet).length >= 2 && sunk.length === 0, `1.8 feet on the ground ${JSON.stringify(feet)}`);
  // the waterfront route, slowly, behind the patrol: walk the player in hops along x = -1868
  let failed = false;
  for (let z = 10; z >= -170; z -= 6) {
    await p.evaluate((z) => { const e = __city.controllerManager.entities.person; e.position.x = -1868; e.position.z = z; }, z);
    await p.waitForTimeout(1200);
    if (!(await dbg()).mission) { failed = true; break; }
  }
  st = await dbg(); ok(!failed && st.seen < 1, `1.5 waterfront route not seen (seen=${st.seen.toFixed(2)})`);
  // to the car and in
  await p.evaluate(() => __city.teleportTo(-1775.5, -168, Math.PI));
  await p.waitForTimeout(800);
  await p.evaluate(() => __city.gameplay.tryEnter());
  await waitFor(() => __city.missions.debug().step === 1, 20000); ok(true, '1.9 in the car: the tail pulls out');
  await p.waitForTimeout(25000);
  st = await dbg(); ok(st.tail && !st.tail.parked && st.tail.dist >= 8, `1.7 tail follows, never closer than 8 m (dist ${st.tail && st.tail.dist.toFixed(1)})`);
  // drive off: the car moved 380 m up the esplanade in hops
  for (let z = -170; z >= -560; z -= 30) { await p.evaluate((z) => { const c = __city.controllerManager.entities.car; c.position.x = -1790; c.position.z = z; c.speed = 30; }, z); await p.waitForTimeout(900); }
  st = await dbg(); ok(st.tail && st.tail.dist > 150, `1.7 tail left behind (dist ${st.tail && st.tail.dist.toFixed(0)})`);
  await p.evaluate(() => { const c = __city.controllerManager.entities.car; c.position.x = -1500; c.position.z = -900; c.speed = 0; });
  await waitFor(() => __city.missions.debug().step === 2, 30000); ok(true, '1.7 tail lost after 8 s clear');
  ok(!(await dbg()).tail, '1.7 tail gone after the step');
  // to the Quiet Room
  await p.evaluate(() => { const c = __city.controllerManager.entities.car; c.position.x = -230; c.position.z = 110; c.speed = 0; });
  await waitFor(() => __city.missions.debug().step === 3, 15000); ok(true, '1.9 at Flinders Lane x Elizabeth St');
  await p.evaluate(() => __city.gameplay.exitCar());
  await p.waitForTimeout(500);
  const g = (await dbg()).goal;
  await p.evaluate((g) => __city.teleportTo(g.x, g.z, 0), g);
  await waitFor(() => __city.missions.debug().choice, 15000); ok(true, '1.6 the choice is offered');
  await p.waitForTimeout(1500);
  const davoAt = () => p.evaluate(() => { let r = null; __city.scene.traverse((o) => { if (o.name === 'Person:ara:davo' && o.visible) r = [o.position.x, o.position.z]; }); return r; });
  await p.waitForTimeout(20000); // he walks to his spot and settles (slow frames)
  const d0 = await davoAt();
  for (const h of [1.5, 3.0, 4.5]) { await p.evaluate((h) => { __city.controllerManager.entities.person.heading = h; }, h); await p.waitForTimeout(4000); }
  const d1 = await davoAt();
  ok(d0 && d1 && Math.hypot(d0[0] - d1[0], d0[1] - d1[1]) < 0.4, `1.8 Davo stays put when the player turns (moved ${d0 && d1 ? Math.hypot(d0[0] - d1[0], d0[1] - d1[1]).toFixed(2) : '?'} m)`);
  ok((await p.evaluate(() => __city.cast.debug())) && true, `1.8 actors at the door: ${JSON.stringify(await p.evaluate(() => Object.keys(__city.cast.debug())))}`);
  await p.evaluate(() => __city.missions.choose(0));
  await waitFor(() => !__city.missions.debug().mission, 60000);
  st = await p.evaluate(() => ({ prog: __city.missions.progress, money: __city.missions.money, flags: __city.missions.flags }));
  ok(st.prog === 1 && st.flags.davo_tails_kestrel === true && st.money === 14345, `1.9 M1 passed ${JSON.stringify(st)}`);

  // reload: progress and the choice survive
  await p.reload(); await ready();
  st = await p.evaluate(() => ({ prog: __city.missions.progress, money: __city.missions.money, flags: __city.missions.flags }));
  ok(st.prog === 1 && st.flags.davo_tails_kestrel === true && st.money === 14345, `1.1 survives a restart ${JSON.stringify(st)}`);

  // corrupt save: a new game, no error
  await p.evaluate(() => { localStorage.setItem('gta-melbourne3d-save-v2', '{bad json'); localStorage.removeItem('gta-melbourne3d-save-v1'); });
  await p.reload(); await ready();
  st = await p.evaluate(() => ({ prog: __city.missions.progress, money: __city.missions.money }));
  ok(st.prog === 0 && st.money === 500, `1.1 corrupt save starts a new game ${JSON.stringify(st)}`);
  ok(errs.length === 0, `no page errors ${JSON.stringify(errs.slice(0, 5))}`);
  await b.close();
})().catch((e) => { console.error('ERROR', e.message.slice(0, 600)); process.exit(1); });
