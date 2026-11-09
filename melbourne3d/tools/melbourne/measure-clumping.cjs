// tools/melbourne/measure-clumping.cjs: how bunched people and cars are around four spots (nearest-neighbour distances).
// PORT=8765 node tools/melbourne/measure-clumping.cjs. Compare two builds by serving each on its own port. Low quality has
// few people, so this finds big clumps only; Lygon St and St Kilda have no traffic network yet and show 0.
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 640, height: 400 } })).newPage();
  await p.goto(`http://localhost:${process.env.PORT || 8765}/melbourne3d/index.html?webgl&quality=low&nointro&nofilm`, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.gameplay && __city.trafficSystem, null, { timeout: 480000 }); await p.waitForTimeout(3000);
  const spots = { MALL: [-242, -221], FLINDERS: [-224, 120], LYGON: [356, -1128], STKILDA: [-701, 4960] };
  for (const [name, [x, z]] of Object.entries(spots)) {
    await p.evaluate(([x, z]) => __city.teleportTo(x, z, 0), [x, z]);
    await p.waitForTimeout(90000); // let the street fill (slow frames)
    const r = await p.evaluate(([x, z]) => {
      const R = 140, near = (o) => Math.hypot(o.x - x, o.z - z) < R;
      const peds = __city.trafficSystem.peds.filter((q) => q.placed && !q.dead && near(q));
      const cars = __city.trafficSystem.cars.filter((c) => (c.edge || c.parked) && !c.driven && near(c));
      const stat = (arr, close) => {
        let nn = [], pairs = 0, worst = 0;
        arr.forEach((a, i) => { let d = 1e9, within = 0; arr.forEach((b, j) => { if (i === j) return; const e = Math.hypot(a.x - b.x, a.z - b.z); d = Math.min(d, e); if (e < close * 3) within++; if (j > i && e < close) pairs++; }); nn.push(d); worst = Math.max(worst, within); });
        nn.sort((u, v) => u - v);
        return { n: arr.length, meanNN: +(nn.reduce((u, v) => u + v, 0) / Math.max(1, nn.length)).toFixed(1), medianNN: +(nn[nn.length >> 1] || 0).toFixed(1), pairsClose: pairs, worstNeighbours: worst };
      };
      return { peds: stat(peds, 3), cars: stat(cars, 9) };
    }, [x, z]);
    log(name, JSON.stringify(r));
  }
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 300)); process.exit(1); });
