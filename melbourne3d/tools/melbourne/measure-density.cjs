// tools/melbourne/measure-density.cjs: cars and pedestrians per city block (road piece between junctions, 40 m or longer)
// round the player at a few places, sampled over 60 s of simulated time. Serve the repo root, then
// PORT=8823 [SPOTS=cbd,flinders,carlton] [SIM=60] node melbourne3d/tools/melbourne/measure-density.cjs
const { chromium } = require('playwright');
const SPOTS = { cbd: [-242, -221], flinders: [-224, 120], carlton: [76, -1160], sbank: [-456, 814] };
const R = 200; // m: the disc the blocks and the people are counted in
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 200 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CE ' + m.text().slice(0, 200)); });
  await p.goto(`http://localhost:${process.env.PORT || 8823}/melbourne3d/index.html?webgl&quality=${process.env.Q || 'high'}&nointro&nofilm`, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.gameplay && __city.trafficSystem, null, { timeout: 600000 });
  console.log('loaded'); await p.waitForTimeout(2000);
  await p.evaluate(() => {
    const ts = __city.trafficSystem, orig = ts.update.bind(ts);
    window.__T = { t: 1000, step: 6 };
    ts.update = (dt, el, focus, ent, mode, cam) => { for (let k = 0; k < __T.step; k++) { __T.t += 0.05; orig(0.05, __T.t, focus, ent, mode, cam); } };
  });
  const sample = (cx, cz) => p.evaluate(([cx, cz, R]) => {
    const ts = __city.trafficSystem, near = (x, z) => Math.hypot(x - cx, z - cz) < R;
    let blocks = 0, main = 0, occupied = 0, multi = 0, maxSeg = 0;
    for (const e of ts.network.edges) {
      if (e.len < 40 || !near(e.sx + e.dx * e.len / 2, e.sz + e.dz * e.len / 2)) continue;
      blocks++;
      if (e.axis === 'ave' || e.lanes.length >= 2 || e.half >= 4) main++;
      let n = 0; for (const l of e.occ) n += l.length;
      if (n) occupied++; if (n > 1) multi++; maxSeg = Math.max(maxSeg, n);
    }
    const cars = [...ts.cars, ...ts.buses].filter((c) => c.edge && !c.driven && near(c.x, c.z)).length;
    const carsAll = [...ts.cars, ...ts.buses].filter((c) => c.edge && !c.driven).length;
    const peds = ts.peds.filter((q) => q.placed && !q.dead && near(q.x, q.z)).length;
    const pedsAll = ts.peds.filter((q) => q.placed && !q.dead).length;
    // pedestrians' spread: largest number within 25 m of any one of them
    const pp = ts.peds.filter((q) => q.placed && !q.dead && near(q.x, q.z));
    let clump = 0; for (const a of pp) { let n = 0; for (const o of pp) if (Math.hypot(a.x - o.x, a.z - o.z) < 25) n++; clump = Math.max(clump, n); }
    return { blocks, main, cars, carsAll, peds, pedsAll, occupied, multi, maxSeg, pedClump25: clump };
  }, [cx, cz, R]);
  const out = {};
  for (const name of (process.env.SPOTS || 'cbd,flinders,carlton').split(',')) {
    const [x, z] = SPOTS[name];
    await p.evaluate(([x, z]) => __city.teleportTo(x, z, 0), [x, z]);
    await p.waitForTimeout(1500);
    const t0 = await p.evaluate(() => __T.t), rows = [];
    while ((await p.evaluate(() => __T.t)) - t0 < +(process.env.SIM || 60)) { await p.waitForTimeout(2500); rows.push(await sample(x, z)); }
    const avg = (k) => +(rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(1);
    const max = (k) => Math.max(...rows.map((r) => r[k]));
    out[name] = { samples: rows.length, blocks: avg('blocks'), mainBlocks: avg('main'), cars: avg('cars'), peds: avg('peds'), carsPerBlock: +(avg('cars') / avg('blocks')).toFixed(2), pedsPerBlock: +(avg('peds') / avg('blocks')).toFixed(2), carsOutAll: avg('carsAll'), pedsAll: avg('pedsAll'), blocksWith2plusCars: avg('multi'), maxCarsOnABlock: max('maxSeg'), pedClump25: max('pedClump25') };
    console.log(name, JSON.stringify(out[name]));
  }
  console.log('ERRS', JSON.stringify(errs.slice(0, 10)));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 300)); process.exit(1); });
