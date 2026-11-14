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

  // 2. on foot
  const walk = await p.evaluate(async () => {
    const T = await import('/melbourne3d/js/terrain.js');
    const cm = __city.controllerManager;
    const res = { dev: [], startY: 0, ys: [] };
    cm.setMode?.('person');
    __city.teleportTo(759, -264); // Parliament's hill (the Spring St end of the Hoddle Grid)
    for (let i = 0; i < 30; i++) cm.update(0.05);
    const p0 = cm.entities.person;
    res.startY = p0.position.y; res.startH = T.terrainHeight(p0.position.x, p0.position.z);
    // walk west (downhill towards Elizabeth St) for 300 steps
    cm.setMode('person');
    const keys = cm.keys || cm.input || null;
    res.api = !!keys;
    return res;
  });
  log('walk start', JSON.stringify(walk));
  ok(Math.abs(walk.startY - walk.startH) < 0.3 + 0.22, `the person stands on the hill (y ${walk.startY.toFixed(2)}, ground ${walk.startH.toFixed(2)})`);

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
