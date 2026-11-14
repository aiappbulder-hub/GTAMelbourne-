// tools/melbourne/test-terrain.cjs: Melbourne's terrain (js/terrain.js).
// Serve the repo root (python3 -m http.server 9013 from the worktree root, or set PORT; URLs are /melbourne3d/...), then:
//   node tools/melbourne/test-terrain.cjs
// 1. terrainHeight: a hill spot > 15 m, Docklands < 4 m, the Yarra and a bridge's ends 0, the slope under 9%;
// 2. a person teleported to a hill stands on the surface and walks downhill without floating or sinking;
// 3. a car driven up a slope stays on the surface;
// 4. a building on a slope has no gap under it (a ray from the low side meets the wall or its skirt);
// 5. ?flat gives 0 everywhere.
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const PORT = process.env.PORT || 9013;
const URL = (q) => `http://localhost:${PORT}/melbourne3d/index.html?webgl&quality=low&nointro&nofilm${q || ''}`;
let failed = false;
const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) failed = true; };

async function load(b, q) {
  const ctx = await b.newContext({ viewport: { width: 360, height: 230 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto(URL(q), { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.missions && __city.bridges, null, { timeout: 480000 });
  await p.waitForTimeout(1500);
  p.errs = errs;
  return p;
}

(async () => {
  const b = await chromium.launch();
  const p = await load(b, '');
  // 1. the function
  const f = await p.evaluate(async () => {
    const T = await import('/melbourne3d/js/terrain.js');
    const m = await import('/melbourne3d/js/melbourne-config.js');
    const out = { flat: T.TERRAIN_FLAT };
    out.parliament = T.terrainHeight(759, -264);
    out.carlton = T.terrainHeight(483, -1535);
    out.docklands = T.terrainHeight(-1774, -674);
    out.flinders = T.terrainHeight(-56, 311);
    // the river: every sampled water point is 0, and the steepest 5 m step anywhere in the CBD
    let wetHigh = 0, wet = 0, wetMax = 0, steep = 0, maxH = 0;
    for (let x = -3000; x < 2400; x += 7) for (let z = -2000; z < 4000; z += 7) {
      const h = T.terrainHeight(x, z);
      maxH = Math.max(maxH, h);
      if (m.inWater(x, z)) { wet++; if (h > 0.3) wetHigh++; if (h > wetMax) { wetMax = h; out.wetAt = [x, z]; } }
      steep = Math.max(steep, Math.abs(h - T.terrainHeight(x + 5, z)) / 5, Math.abs(h - T.terrainHeight(x, z + 5)) / 5);
    }
    out.wet = wet; out.wetHigh = wetHigh; out.wetMax = wetMax; out.steep = steep; out.maxH = maxH;
    // each bridge's deck ends
    const bs = __city.bridges.bridges;
    out.bridgeEnds = Math.max(...bs.map((f) => Math.max(
      T.terrainHeight(f.ax + f.ux * f.s0, f.az + f.uz * f.s0), T.terrainHeight(f.ax + f.ux * f.s1, f.az + f.uz * f.s1))));
    return out;
  });
  log(JSON.stringify(f));
  ok(!f.flat, 'terrain is on by default');
  ok(f.parliament > 15 && f.carlton > 15, `hill spots are high (Parliament ${f.parliament.toFixed(1)}, Carlton ${f.carlton.toFixed(1)})`);
  ok(f.docklands < 4 && f.flinders < 4, `Docklands (${f.docklands.toFixed(1)}) and Flinders St (${f.flinders.toFixed(1)}) are low`);
  log('highest wet sample at', f.wetAt);
  // (the Yarra, the harbour and the bay are at 0; a few small garden ponds sit on hills)
  ok(f.wetHigh / f.wet < 0.01, `the water is at 0 (${f.wet} samples, ${f.wetHigh} above 0.3 m, max ${f.wetMax.toFixed(1)} at ${f.wetAt})`);
  ok(f.bridgeEnds < 0.5, `bridge ends meet the banks (max ${f.bridgeEnds.toFixed(2)} m)`);
  ok(f.steep < 0.09, `steepest slope ${(f.steep * 100).toFixed(1)}% < 9%`);

  if (process.env.STAGE_MAX && +process.env.STAGE_MAX < 2) { await b.close(); process.exit(failed ? 1 : 0); }

  // 2. on foot: stands on the hill, then walks downhill (down the slope's gradient) without floating or sinking
  const walk = await p.evaluate(async () => {
    const T = await import('/melbourne3d/js/terrain.js');
    const cm = __city.controllerManager;
    cm.setMode('person');
    __city.teleportTo(400, -344, Math.PI / 2); // Little Bourke St towards Spring St: the hill
    cm.setMode('person');
    for (let i = 0; i < 20; i++) cm.update(0.05, i * 0.05);
    const e = cm.entities.person;
    const res = { startY: e.position.y, startH: T.terrainHeight(e.position.x, e.position.z) };
    // along the street (it runs east-west), the way that goes down
    const heading = T.terrainHeight(e.position.x + 60, e.position.z) < T.terrainHeight(e.position.x - 60, e.position.z) ? Math.PI / 2 : -Math.PI / 2;
    cm.cameraYaw = heading; e.heading = heading;
    cm.keys.forward = 1; cm.keys.sprint = 1;
    let worstAbove = -9, worstBelow = 9, t = 0;
    for (; t < 12; t += 0.05) {
      cm.update(0.05, 1 + t);
      const g = cm.getGroundHeight(e.position.x, e.position.z, 'person');
      worstAbove = Math.max(worstAbove, e.position.y - g); worstBelow = Math.min(worstBelow, e.position.y - g);
    }
    cm.keys.forward = 0; cm.keys.sprint = 0;
    res.worstAbove = worstAbove; res.worstBelow = worstBelow;
    res.drop = res.startH - T.terrainHeight(e.position.x, e.position.z);
    res.dist = Math.hypot(e.position.x - 400, e.position.z + 344);
    return res;
  });
  log('walk', JSON.stringify(walk));
  ok(walk.startH > 15, `the hill spot is high (${walk.startH.toFixed(1)} m)`);
  ok(Math.abs(walk.startY - walk.startH) < 0.3, `the person stands on the hill (y ${walk.startY.toFixed(2)}, ground ${walk.startH.toFixed(2)})`);
  ok(walk.dist > 20 && walk.drop > 0.5, `and walks downhill (${walk.dist.toFixed(0)} m, down ${walk.drop.toFixed(1)} m)`);
  ok(walk.worstAbove < 0.3 && walk.worstBelow > -0.1, `without floating or sinking (${walk.worstBelow.toFixed(2)} .. ${walk.worstAbove.toFixed(2)} m from the ground)`);

  // 3. a car driven up a slope stays on the surface and pitches nose-up
  const drive = await p.evaluate(async () => {
    const T = await import('/melbourne3d/js/terrain.js');
    const cm = __city.controllerManager;
    cm.setMode('car');
    __city.teleportTo(-300, -344, 1.5708);
    cm.setMode('car');
    const c = cm.entities.car;
    // along the street, the way that goes up
    const heading = T.terrainHeight(c.position.x + 60, c.position.z) > T.terrainHeight(c.position.x - 60, c.position.z) ? Math.PI / 2 : -Math.PI / 2;
    c.heading = heading; c.speed = 6; c.vx = c.vz = 0;
    cm.cameraYaw = heading;
    cm.keys.forward = 1;
    let worstAbove = -9, worstBelow = 9, minPitch = 0, t = 0;
    const h0 = T.terrainHeight(c.position.x, c.position.z);
    for (; t < 10; t += 0.05) {
      cm.update(0.05, t);
      const g = T.terrainHeight(c.position.x, c.position.z);
      worstAbove = Math.max(worstAbove, c.position.y - g); worstBelow = Math.min(worstBelow, c.position.y - g);
      minPitch = Math.min(minPitch, c.kerbPitch || 0);
    }
    cm.keys.forward = 0; cm.resetInput && cm.resetInput();
    return { rise: T.terrainHeight(c.position.x, c.position.z) - h0, worstAbove, worstBelow, minPitch, dist: Math.hypot(c.position.x + 300, c.position.z + 344) };
  });
  log('drive', JSON.stringify(drive));
  ok(drive.dist > 30, `the car drove ${drive.dist.toFixed(0)} m`);
  ok(drive.worstAbove < 0.7 && drive.worstBelow > -0.15, `and stayed on the surface (${drive.worstBelow.toFixed(2)} .. ${drive.worstAbove.toFixed(2)} m)`);
  ok(drive.rise < 0.5 || drive.minPitch < -0.004, `and pitched with the slope (rose ${drive.rise.toFixed(1)} m, nose ${(drive.minPitch * 57.3).toFixed(1)} deg)`);

  // 4. buildings on slopes: a horizontal ray at the low corner, from outside, meets the wall or its skirt
  const gap = await p.evaluate(async () => {
    const THREE = await import('three/webgpu');
    const T = await import('/melbourne3d/js/terrain.js');
    const cm = __city.controllerManager;
    const meshes = [];
    __city.scene.traverse((o) => { if (o.name === 'SurveyedBuildingChunk') meshes.push(o); });
    const cands = [];
    for (const c of cm.colliders) {
      if (!c.polygon || c.groundY === undefined || c.maxY - c.minY < 8) continue;
      const ring = c.polygon.outer;
      let lo = Infinity, hi = -Infinity, low = null;
      for (const q of ring) { const h = T.terrainHeight(q.x, q.z); if (h < lo) { lo = h; low = q; } hi = Math.max(hi, h); }
      if (hi - lo > 1.0) cands.push({ c, low, lo, hi });
    }
    cands.sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo));
    const rc = new THREE.Raycaster();
    let hits = 0, tested = 0;
    const misses = [];
    for (const k of cands.slice(0, 40)) {
      const q = k.low, ring = k.c.polygon.outer;
      let cx = 0, cz = 0; for (const r of ring) { cx += r.x; cz += r.z; } cx /= ring.length; cz /= ring.length;
      // the ray starts 0.15 m above the ground, 0.4 m outside the corner, aimed at the building's middle
      const dx = q.x - cx, dz = q.z - cz, L = Math.hypot(dx, dz) || 1;
      const ox = q.x + (dx / L) * 0.4, oz = q.z + (dz / L) * 0.4;
      const oy = T.terrainHeight(ox, oz) + 0.15;
      rc.set(new THREE.Vector3(ox, oy, oz), new THREE.Vector3(-dx / L, 0, -dz / L));
      rc.far = 3;
      tested++;
      const h = rc.intersectObjects(meshes, false);
      if (h.length) hits++; else misses.push([+q.x.toFixed(0), +q.z.toFixed(0), +(k.hi - k.lo).toFixed(1)]);
    }
    return { cands: cands.length, tested, hits, misses: misses.slice(0, 5) };
  });
  log('buildings', JSON.stringify(gap));
  ok(gap.cands > 20, `${gap.cands} buildings stand on slopes over 1 m`);
  ok(gap.tested > 0 && gap.hits / gap.tested >= 0.85, `a ray at the low corner meets a wall or skirt (${gap.hits}/${gap.tested})`);

  // 5. ?flat
  const pf = await load(b, '&flat');
  const flat = await pf.evaluate(async () => {
    const T = await import('/melbourne3d/js/terrain.js');
    return { flat: T.TERRAIN_FLAT, h: [T.terrainHeight(759, -264), T.terrainHeight(483, -1535)], g: __city.controllerManager.getGroundHeight(759, -264, 'car') };
  });
  ok(flat.flat && flat.h.every((v) => v === 0) && flat.g === 0, '?flat gives 0 everywhere');
  await b.close();
  process.exit(failed ? 1 : 0);
})();
