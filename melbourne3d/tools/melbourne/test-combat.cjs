// tools/melbourne/test-combat.cjs: armed hostiles shoot the player (health drops, and stops out of range or with the player
// down), every weapon fires with its own damage, a rocket's blast kills a person beside the impact, and switching weapons
// swaps the model in the hand and the HUD. Serve the repository root (python3 -m http.server 8765; PORT= for another),
// then: node melbourne3d/tools/melbourne/test-combat.cjs. Under software rendering the game runs a frame every few
// seconds, so the checks step the game's own update (gameplay.update, cast.posePlayer) by hand in 0.05 s steps.
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 360, height: 230 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto('http://localhost:' + (process.env.PORT || 8765) + '/melbourne3d/index.html?webgl&quality=low&nointro&nofilm', { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.gameplay && __city.trafficSystem && __city.cast && __city.cast.ready, null, { timeout: 480000 }); await p.waitForTimeout(3000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  // step the game `secs` seconds of game time (0.05 s steps), the player's model too
  const sim = (secs) => p.evaluate((secs) => { for (let t = 0; t < secs; t += 0.05) { __city.gameplay.update(0.05); __city.cast.posePlayer(0.05); } }, secs);
  const SPOT = { x: -240.68, z: -221 };
  await p.evaluate((SPOT) => {
    __city.gameplay.leaveCarNow();
    __city.teleportTo(SPOT.x, SPOT.z, 0);
    const e = __city.controllerManager.entities.person;
    e.position.x = SPOT.x; e.position.z = SPOT.z; e.heading = 0; e.speed = 0;
    __city.gameplay.health = 100;
  }, SPOT);
  await p.waitForTimeout(2000);
  ok(await p.evaluate(() => __city.controllerManager.activeMode === 'person'), 'on foot');

  // ---- (a) an armed hostile fires at the player; out of range he stops ---------------------------------------------
  await p.evaluate((SPOT) => { __city.gameplay.combat.spawn({ x: SPOT.x, z: SPOT.z + 14, weapon: 'uzi', heading: Math.PI, aggro: true }); }, SPOT);
  for (let i = 0; i < 90; i++) { await sim(0.5); if (await p.evaluate(() => __city.gameplay.combat.list[0].visible)) break; await p.waitForTimeout(500); }
  const seen = await p.evaluate(() => __city.gameplay.combat.debug()[0]);
  log('hostile', JSON.stringify(seen));
  ok(seen.visible && seen.held === 'uzi', 'the hostile is drawn with an Uzi in his hands');
  await p.evaluate(() => { __city.gameplay.health = 100; });
  let hpMin = 100;
  for (let i = 0; i < 40; i++) { await sim(0.5); hpMin = Math.min(hpMin, await p.evaluate(() => __city.gameplay.state.hp)); if (hpMin < 90) break; }
  const g1 = await p.evaluate(() => __city.gameplay.combat.debug()[0]);
  log('fighting', JSON.stringify(g1), 'hp', hpMin);
  ok(g1.shots > 0 && g1.alert, 'the hostile noticed the player and fired (' + g1.shots + ' shots)');
  ok(hpMin < 100, 'the player lost health to his shots (hp ' + hpMin.toFixed(1) + ')');
  ok(hpMin > 0 && !(await p.evaluate(() => __city.gameplay.state.dying)), 'one burst does not kill (fair damage)');
  // out of range: 120 m away, he gives up and nothing more hits
  await p.evaluate(() => { const e = __city.controllerManager.entities.person, g = __city.gameplay.combat.list[0]; e.position.z = g.z - 120; e.position.x = g.x; __city.gameplay.health = 100; });
  const shotsBefore = (await p.evaluate(() => __city.gameplay.combat.debug()[0])).shots;
  await sim(12);
  const far = await p.evaluate(() => ({ g: __city.gameplay.combat.debug()[0], hp: __city.gameplay.state.hp }));
  log('far', JSON.stringify(far));
  ok(far.hp === 100 && far.g.shots === shotsBefore, 'out of range he stops shooting and the player is untouched');
  ok(!far.g.alert, 'and loses interest');
  // the player down: nobody shoots
  await p.evaluate(() => { const e = __city.controllerManager.entities.person, g = __city.gameplay.combat.list[0]; e.position.z = g.z - 12; e.position.x = g.x; });
  await sim(3);
  await p.evaluate(() => { __city.gameplay.hurtPlayer(500, 0, 0); });
  const dyingShots = (await p.evaluate(() => __city.gameplay.combat.debug()[0])).shots;
  ok(await p.evaluate(() => __city.gameplay.state.dying), 'health 0: the player is WASTED');
  await sim(2.5);
  ok((await p.evaluate(() => __city.gameplay.combat.debug()[0])).shots === dyingShots, 'the hostile stops firing at a dead player');
  await sim(2);
  const alive = await p.evaluate(() => ({ dying: __city.gameplay.state.dying, hp: __city.gameplay.state.hp, left: __city.gameplay.combat.list.length }));
  ok(!alive.dying && alive.hp === 100 && alive.left === 0, 'then the player is back on their feet at full health and the hostiles are gone');

  // ---- (b) every weapon fires with its own damage ------------------------------------------------------------------
  await p.evaluate((SPOT) => {
    const e = __city.controllerManager.entities.person;
    __city.teleportTo(SPOT.x, SPOT.z, 0);
    e.position.x = SPOT.x; e.position.z = SPOT.z; e.heading = 0; e.speed = 0;
  }, SPOT);
  await sim(1);
  const dmgOf = (slot, dist) => p.evaluate(async ({ slot, dist, SPOT }) => {
    const gp = __city.gameplay, gm = gp.combat, e = __city.controllerManager.entities.person;
    gm.clear();
    e.position.x = SPOT.x; e.position.z = SPOT.z; e.heading = 0; e.speed = 0;
    const g = gm.spawn({ x: SPOT.x, z: SPOT.z + dist, weapon: 'pistol', hp: 5000, sight: 0.1 });
    gp.selectSlot(slot);
    for (let t = 0; t < 1; t += 0.05) { gp.update(0.05); __city.cast.posePlayer(0.05); }
    const before = g.hp;
    gp.fire();
    for (let t = 0; t < 0.4; t += 0.05) { gp.update(0.05); __city.cast.posePlayer(0.05); } // (a punch lands a moment in)
    gm.clear();
    return { dmg: before - g.hp, weapon: gp.state.weapon, last: gp.state.lastShot && gp.state.lastShot.weapon };
  }, { slot, dist, SPOT });
  const res = {};
  for (const [name, slot, dist] of [['pistol', 0, 8], ['uzi', 1, 8], ['shotgun', 2, 5], ['m4', 3, 8], ['fists', 5, 1.2]]) {
    res[name] = await dmgOf(slot, dist);
    log(name, JSON.stringify(res[name]));
  }
  ok(res.pistol.dmg === 34, 'pistol: 34 per shot');
  ok(res.uzi.dmg === 16, 'Uzi: 16 per shot');
  ok(res.m4.dmg === 26, 'M4: 26 per shot');
  ok(res.shotgun.dmg >= 30 && res.shotgun.dmg % 15 === 0, 'shotgun: pellets of 15, several landing at 5 m (' + res.shotgun.dmg + ')');
  ok(res.fists.dmg === 24, 'fists: a punch for 24');
  ok(new Set(Object.values(res).map((r) => r.dmg)).size >= 4, 'the weapons differ');
  // fire rates and magazines from the table
  const tbl = await p.evaluate(() => __city.gameplay.weapons.map((w) => [w.id, w.rate, w.mag, w.reload, w.range, w.slot]));
  log('table', JSON.stringify(tbl));
  ok(tbl.length === 6 && new Set(tbl.map((t) => t[5])).size === 6, 'six weapons, each with its own slot key');
  // the rocket: a slow shot that explodes and hurts a person beside the impact
  const rocket = await p.evaluate(async (SPOT) => {
    const gp = __city.gameplay, gm = gp.combat, e = __city.controllerManager.entities.person;
    const peds = __city.trafficSystem.peds.filter((q) => q.placed && !q.dead);
    if (!peds.length) return { err: 'no pedestrians' };
    e.position.x = SPOT.x; e.position.z = SPOT.z; e.heading = 0; e.speed = 0;
    const g = gm.spawn({ x: SPOT.x, z: SPOT.z + 28, weapon: 'pistol', hp: 100, sight: 0.1 });
    const q = peds[0];
    for (const o of peds.slice(1)) if (Math.abs(o.x - SPOT.x) < 40 && Math.abs(o.z - SPOT.z) < 60) o.x += 150; // (nobody wanders into the rocket's path)
    q.x = g.x + 3; q.z = g.z + 1;
    gp.selectSlot(4);
    for (let t = 0; t < 1; t += 0.05) { gp.update(0.05); __city.cast.posePlayer(0.05); }
    const n0 = gp.blastLog.length;
    gp.fire();
    const flying = gp.state.rockets;
    let t = 0;
    for (; t < 5 && gp.blastLog.length === n0; t += 0.05) gp.update(0.05);
    const blast = gp.blastLog[gp.blastLog.length - 1];
    return { flying, t, blast, gunmanHp: g.hp, gunmanDead: g.dead, pedDead: !!q.dead, ammo: gp.state.ammo };
  }, SPOT);
  log('rocket', JSON.stringify(rocket));
  ok(rocket.flying === 1 && rocket.t > 0.3, 'the rocket is a slow projectile (it flew ' + (rocket.t || 0).toFixed(2) + ' s)');
  ok(rocket.blast && rocket.gunmanDead, 'it explodes at the hostile and kills him');
  ok(rocket.pedDead, 'the blast knocks down a person standing 3 m from the impact');
  ok(rocket.ammo === 0, 'one rocket per magazine (reload 2.6 s)');
  await p.evaluate(() => __city.gameplay.combat.clear());

  // ---- (c) switching weapons changes the model in hand and the HUD ------------------------------------------------
  await p.evaluate(() => { __city.gameplay.update(0.05); });
  const names = ['Pistol', 'Uzi', 'Shotgun', 'M4 Rifle', 'Rocket Launcher', 'Fists'];
  const ids = ['pistol', 'uzi', 'shotgun', 'm4', 'rocket', null];
  const seenModels = [];
  for (let i = 0; i < 6; i++) {
    const hud0 = await p.evaluate((i) => { __city.gameplay.selectSlot(i); const w = document.querySelector('.gp-weapon'); return { name: w.querySelector('.gp-name span').textContent, on: [...w.querySelectorAll('.gp-slot')].findIndex((b) => b.classList.contains('on')), icon: w.querySelector('.gp-icon svg') ? 1 : 0 }; }, i);
    ok(hud0.name === names[i] && hud0.on === i && hud0.icon === 1, 'HUD at once: ' + JSON.stringify(hud0));
    const early = await p.evaluate(() => { __city.gameplay.update(0.05); __city.cast.posePlayer(0.05); return __city.cast.heldGun(); });
    await sim(0.6);
    const held = await p.evaluate(() => __city.cast.heldGun());
    seenModels.push(held.held);
    ok(held.held === ids[i] && held.drawK === 1, 'slot ' + (i + 1) + ' holds ' + (ids[i] || 'nothing (fists)') + ' (' + JSON.stringify(held) + ', drawing at ' + early.drawK.toFixed(2) + ')');
    if (i === 1) ok(early.drawK < 0.5, 'the weapon is drawn over ~0.3 s, not popped in');
  }
  // keys: 3 picks the shotgun on foot, Tab goes on, G holsters (nothing in hand)
  await p.keyboard.press('Digit3');
  ok(await p.evaluate(() => __city.gameplay.state.weapon === 'shotgun' && __city.controllerManager.activeMode === 'person'), 'key 3 selects the shotgun (and stays on foot)');
  await p.keyboard.press('Tab');
  ok(await p.evaluate(() => __city.gameplay.state.weapon === 'm4'), 'Tab goes to the next weapon');
  await p.keyboard.press('KeyG');
  await sim(0.5);
  ok((await p.evaluate(() => __city.cast.heldGun())).held === null, 'holstered: nothing in hand');

  // ---- (d) a fight job: Westside Bikies' Nomads are armed, shoot back, and dying fails the job -----------------------
  const simJob = (secs) => p.evaluate((secs) => { for (let t = 0; t < secs; t += 0.05) { __city.missions.update(0.05, performance.now() / 1000 + t); __city.gameplay.update(0.05); __city.cast.posePlayer(0.05); } }, secs);
  const m5 = await p.evaluate(() => __city.missions.missions.findIndex((m) => m.name === 'Westside Bikies'));
  await p.evaluate((i) => { __city.gameplay.leaveCarNow(); __city.teleportTo(-240.68, -221, 0); __city.missions.startNow(i); }, m5);
  await simJob(1);
  await p.evaluate(() => __city.missions.skipCut());
  await simJob(1);
  const goal = await p.evaluate(() => __city.missions.debug().goal);
  await p.evaluate((g) => { __city.teleportTo(g.x, g.z, 0); }, goal);
  for (let i = 0; i < 30 && (await p.evaluate(() => __city.missions.debug().step)) < 1; i++) await simJob(1);
  const job = await p.evaluate(() => ({ d: __city.missions.debug(), hostiles: __city.gameplay.combat.debug().map((g) => g.key + ':' + g.hp), step: document.querySelector('.gm-objective').textContent }));
  log('job', JSON.stringify(job));
  ok(job.d.step === 1 && job.hostiles.length === 3, 'the Nomads step spawns three armed hostiles (' + job.hostiles.join(' ') + ')');
  ok(/3 left/.test(job.step), 'the objective counts them: ' + job.step);
  await p.evaluate(() => { __city.gameplay.health = 100; });
  let hpJob = 100;
  for (let i = 0; i < 60 && hpJob >= 100; i++) { await simJob(0.5); hpJob = await p.evaluate(() => __city.gameplay.state.hp); if (i % 8 === 7) await p.waitForTimeout(500); }
  const shooters = await p.evaluate(() => __city.gameplay.combat.debug().map((g) => ({ v: g.visible, a: g.alert, s: g.shots })));
  log('under fire', JSON.stringify(shooters), 'hp', hpJob);
  ok(shooters.some((g) => g.s > 0) && hpJob < 100, 'the Nomads shoot at the player in the job (hp ' + hpJob.toFixed(1) + ')');
  // dying fails the job and puts the player back at its start marker
  await p.evaluate(() => { __city.gameplay.hurtPlayer(500, 0, 0); });
  await simJob(5);
  const dead = await p.evaluate(() => ({ d: __city.missions.debug(), s: __city.gameplay.state, left: __city.gameplay.combat.list.length }));
  ok(!dead.d.mission && !dead.s.dying && dead.s.hp === 100 && dead.left === 0, 'dying on the job fails it, respawns the player at full health and clears the hostiles');
  await p.evaluate((i) => { __city.missions.startNow(i); }, m5);
  await simJob(1);
  await p.evaluate(() => __city.missions.skipCut());
  const goal2 = await p.evaluate(() => __city.missions.debug().goal);
  await p.evaluate((g) => { __city.teleportTo(g.x, g.z, 0); }, goal2);
  for (let i = 0; i < 30 && (await p.evaluate(() => __city.missions.debug().step)) < 1; i++) await simJob(1);
  await p.evaluate(() => { for (const g of __city.gameplay.combat.list) __city.gameplay.combat.hurt(g, 999, 0, 0); });
  await simJob(1);
  ok((await p.evaluate(() => __city.missions.debug().step)) === 2, 'killing all three passes the step');

  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 600)); process.exit(1); });
