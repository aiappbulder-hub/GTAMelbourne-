// tools/melbourne/test-anim.cjs: character animation (js/people.js).
//  1. foot sliding: a walker at walking, mixed, running and jogging speed; the planted foot's world speed stays under 0.3 m/s
//  2. aim pitch bends the spine (and the arms still point where the gun is aimed)
//  3. changing weapon lowers then raises the gun (at least 0.25 s)
//  4. death: the body ends on the ground (hips about 0.2 m above terrainHeight), on a slope too
//  5. no page errors
// Serve the repo root (python3 -m http.server 9047), then: PORT=9047 node melbourne3d/tools/melbourne/test-anim.cjs
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 360, height: 230 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto('http://localhost:' + (process.env.PORT || 8765) + '/melbourne3d/index.html?webgl&quality=low&nointro&nofilm', { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.gameplay && __city.cast && __city.cast.ready, null, { timeout: 480000 });
  await p.waitForTimeout(3000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  await p.evaluate(async () => {
    __city.controllerManager.setMode('person');
    for (let i = 0; i < 90 && !__city.cast.actor('player'); i++) await new Promise((r) => setTimeout(r, 1000));
    window.__sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  });
  ok(await p.evaluate(() => !!__city.cast.actor('player')), 'the player actor exists');

  // ---- 1. foot sliding: a walker (a scene actor driven by hand at a fixed step, so the game loop's own frames don't interleave)
  const speeds = [1.4, 2.4, 3.0, 5.4];
  const slide = await p.evaluate(async (speeds) => {
    const cast = __city.cast, out = {};
    for (let i = 0; i < 60 && !cast.loaded.includes('ara:vince'); i++) { cast.preload(['ara:vince']); await __sleep(500); }
    const dt = 1 / 30;
    for (const v of speeds) {
      let x = 300, z = 300;
      const heading = 0.7, hx = Math.sin(heading), hz = Math.cos(heading);
      const pose = () => ({ x, y: 0, z, heading, speed: v });
      for (let k = 0; k < 90; k++) { x += hx * v * dt; z += hz * v * dt; cast.setActor('walker', 'ara:vince', pose()); cast.tick(dt); } // (settle into the gait)
      const a = cast.actor('walker');
      const feet = ['LeftFoot', 'RightFoot'].map((n) => a.root.getObjectByName(n));
      const prev = [null, null], rows = [];
      for (let k = 0; k < 60; k++) {
        x += hx * v * dt; z += hz * v * dt;
        cast.setActor('walker', 'ara:vince', pose()); cast.tick(dt);
        a.group.updateMatrixWorld(true);
        const cur = feet.map((f) => f.getWorldPosition(new f.position.constructor()));
        rows.push(cur.map((c, i) => ({ y: c.y, v: prev[i] ? Math.hypot(c.x - prev[i].x, c.z - prev[i].z) / dt : null })));
        cur.forEach((c, i) => { prev[i] = c; });
      }
      const speedsStance = [];
      for (let i = 0; i < 2; i++) {
        const minY = Math.min(...rows.map((r) => r[i].y));
        for (const r of rows) if (r[i].v !== null && r[i].y < minY + 0.025) speedsStance.push(r[i].v);
      }
      speedsStance.sort((q, w) => q - w);
      const mean = speedsStance.reduce((q, w) => q + w, 0) / Math.max(1, speedsStance.length);
      out[v] = { n: speedsStance.length, mean: +mean.toFixed(3), p90: +(speedsStance[Math.floor(speedsStance.length * 0.9)] || 0).toFixed(3), clip: a.cur?.getClip().name };
    }
    cast.setActor('walker', 'ara:vince', null);
    return out;
  }, speeds);
  for (const v of speeds) { log('stance foot speed at', v, 'm/s:', JSON.stringify(slide[v])); ok(slide[v].n >= 4 && slide[v].mean < 0.3, `no foot sliding at ${v} m/s (planted foot mean ${slide[v].mean} m/s)`); }

  // ---- 2. aim pitch bends the spine
  await p.evaluate(() => {
    const cast = __city.cast, orig = cast.setPlayerWeapon;
    window.__pitch = null;
    cast.setPlayerWeapon = (w) => orig({ ...w, pitch: window.__pitch ?? w.pitch });
    __city.teleportTo(-242, -221, 0);
    __city.gameplay.selectSlot(3); // the M4
  });
  await p.keyboard.down('KeyQ');
  await p.waitForTimeout(3000);
  const spineAt = async (pitch) => {
    await p.evaluate((pitch) => { window.__pitch = pitch; }, pitch);
    await p.waitForTimeout(3500);
    return p.evaluate(() => {
      const a = __city.cast.actor('player'), V = a.group.position.constructor, q = (n) => { const o = a.root.getObjectByName(n); return [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w]; };
      const w = (n) => a.root.getObjectByName(n).getWorldPosition(new V());
      const hips = w('Hips'), neck = w('Neck'), hand = w('RightHand'), h = a.heading;
      const d = neck.clone().sub(hips);
      // the torso's lean from the vertical (degrees, positive forward)
      const lean = Math.atan2(d.x * Math.sin(h) + d.z * Math.cos(h), d.y) * 180 / Math.PI;
      return { spine: q('Spine'), spine1: q('Spine1'), spine2: q('Spine2'), lean, handUp: hand.y - a.group.position.y, aiming: __city.cast.gunState().aiming, raise: __city.cast.gunState().raise };
    });
  };
  const level = await spineAt(0), up = await spineAt(0.55), down = await spineAt(-0.45);
  const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  log('aiming', level.aiming, 'raise', level.raise.toFixed(2), 'torso lean (deg) level/up/down', level.lean.toFixed(1), up.lean.toFixed(1), down.lean.toFixed(1), 'hand height above feet', level.handUp.toFixed(2), up.handUp.toFixed(2), down.handUp.toFixed(2));
  ok(level.aiming && level.raise > 0.8, 'the aim pose is up');
  ok(['spine', 'spine1', 'spine2'].every((n) => diff(level[n], up[n]) > 0.01 && diff(level[n], down[n]) > 0.01), 'aim pitch changes the spine bones (up and down)');
  ok(up.lean < level.lean - 5 && down.lean > level.lean + 4, 'the torso leans back to aim up and forward to aim down');
  ok(up.handUp > level.handUp + 0.1 && down.handUp < level.handUp - 0.1, 'the hands follow the aim up and down');
  await p.evaluate(() => { window.__pitch = null; });

  // ---- 3. switching weapon lowers then raises the gun
  const sw = await p.evaluate(async () => {
    const cast = __city.cast, g = __city.gameplay, gs = cast.gunState(), rows = [];
    g.selectSlot(3); await __sleep(4000);
    g.selectSlot(2);
    const t0 = performance.now();
    while (performance.now() - t0 < 60000) { rows.push({ t: gs.t, k: gs.drawK, shown: gs.shownId, id: gs.id }); await new Promise((r) => requestAnimationFrame(r)); if (gs.shownId === 'shotgun' && gs.drawK >= 1) break; }
    return rows;
  });
  const low = sw.filter((r) => r.k < 0.95);
  const span = low.length ? low[low.length - 1].t - low[0].t : 0, minK = Math.min(...sw.map((r) => r.k));
  log('switch: lowest', minK.toFixed(2), 'time below 0.95:', span.toFixed(2), 's game time; ends with', sw[sw.length - 1].shown, 'frames', sw.length);
  ok(minK < 0.15 && span >= 0.25 && sw[sw.length - 1].k >= 1 && sw[sw.length - 1].shown === 'shotgun', 'switching weapon lowers then raises the gun over at least 0.25 s');
  await p.keyboard.up('KeyQ');

  // ---- 4. death on a slope ends on the ground
  const spot = await p.evaluate(async () => {
    const { terrainHeight } = await import('/melbourne3d/js/terrain.js');
    const cm = __city.controllerManager;
    let best = null;
    for (let x = -900; x <= 900; x += 25) for (let z = -900; z <= 900; z += 25) {
      const s = Math.abs(terrainHeight(x + 1, z) - terrainHeight(x - 1, z)) / 2 + Math.abs(terrainHeight(x, z + 1) - terrainHeight(x, z - 1)) / 2;
      if (s > 0.03 && (!best || s > best.s) && !cm.nearColliders(x, z, 4).length) best = { x, z, s };
    }
    return best;
  });
  log('slope spot', JSON.stringify(spot));
  if (spot) await p.evaluate((s) => __city.teleportTo(s.x, s.z, 0), spot);
  await p.waitForTimeout(2500);
  await p.evaluate(() => { __city.gameplay.hurtPlayer(500, 0, 0); });
  let dead = null;
  for (let i = 0; i < 90 && !dead; i++) {
    await p.waitForTimeout(500);
    dead = await p.evaluate(async () => {
      const a = __city.cast.actor('player'), e = __city.controllerManager.entities.person;
      if (!a || !a.cur || !/Death/.test(a.cur.getClip().name) || a.cur.time < a.cur.getClip().duration - 0.05) return null;
      const { terrainHeight } = await import('/melbourne3d/js/terrain.js');
      const hips = a.root.getObjectByName('Hips').getWorldPosition(new (a.group.position.constructor)());
      return { hipsY: hips.y, ground: terrainHeight(hips.x, hips.z), pos: [e.position.x, e.position.y, e.position.z] };
    });
  }
  log('death', JSON.stringify(dead));
  ok(!!dead && Math.abs(dead.hipsY - dead.ground - 0.2) < 0.15, `after the fall the hips are near terrainHeight + 0.2 m (${dead ? (dead.hipsY - dead.ground).toFixed(2) : '-'} m)`);

  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 600)); process.exit(1); });
