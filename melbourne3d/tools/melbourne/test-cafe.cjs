// tools/melbourne/test-cafe.cjs: the Short Black café (js/stkilda.js) sits on land, on the footpath, at the terrain's height.
// Serve the repo root (python3 -m http.server 9079; set PORT), then: node tools/melbourne/test-cafe.cjs [shot.png]
// Checks the marker and the front table: not in water, on a kerb block (not a building), props at the ground's height
// (a person's ground height), and takes a screenshot of the street from above the table.
const { chromium } = require('playwright');
const PORT = process.env.PORT || 9079;
let failed = false;
const ok = (c, w) => { console.log(c ? 'PASS' : 'FAIL', w); if (!c) failed = true; };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 900, height: 560 } })).newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message.slice(0, 200)));
  await p.goto(`http://localhost:${PORT}/melbourne3d/index.html?webgl&quality=low&nointro&nofilm&story`, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.missions && __city.stkilda, null, { timeout: 480000 });
  const r = await p.evaluate(async () => {
    const m = await import('/melbourne3d/js/melbourne-config.js');
    const c = await import('/melbourne3d/js/city-config.js');
    const T = await import('/melbourne3d/js/terrain.js');
    const k = __city.stkilda, mk = k.marker(), t = k.table;
    const gy = (x, z) => __city.controllerManager.getGroundHeight(x, z, 'person');
    return { mk, t, water: m.inWater(mk.x, mk.z) || m.inWater(t.x, t.z), block: !!c.blockAt(mk.x, mk.z), terrain: T.terrainHeight(t.x, t.z), ground: gy(t.x, t.z) };
  });
  console.log(JSON.stringify(r));
  ok(!r.water, 'marker and table are not in water');
  ok(r.block, 'marker is on a footpath block');
  ok(r.terrain > 0.5, 'terrain above the water here (' + r.terrain.toFixed(2) + ' m)');
  ok(Math.abs(r.t.y - r.ground) < 0.3, 'table at the ground height (' + r.t.y.toFixed(2) + ' vs ' + r.ground.toFixed(2) + ')');
  await p.evaluate((mk) => { __city.teleportTo(mk.x + 2, mk.z + 2, 0); }, r.mk);
  await p.waitForTimeout(6000);
  await p.screenshot({ path: process.argv[2] || 'cafe.png' });
  await b.close();
  process.exit(failed ? 1 : 0);
})();
