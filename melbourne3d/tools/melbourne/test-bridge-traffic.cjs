// tools/melbourne/test-bridge-traffic.cjs: do traffic cars cross the river bridges? Serve melbourne3d/ (PORT, default 8801), then
// PORT=8801 node tools/melbourne/test-bridge-traffic.cjs [Princes,Swan,...]. For each bridge the camera is put on its deck, 10 sim minutes pass at 20
// steps a frame (the page's traffic update is wrapped), and every traffic car that is seen at one end of the deck and
// later at the other counts as a crossing. Prints positions over time for the first crossing of each bridge.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 320, height: 200 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://localhost:${process.env.PORT || 8801}/index.html?webgl&quality=high&nointro&nofilm`, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.bridges && __city.trafficSystem, null, { timeout: 480000 });
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    const ts = __city.trafficSystem, orig = ts.update.bind(ts);
    window.__T = { t: 1000, step: 20, track: null };
    ts.update = (dt, el, focus, ent, mode, cam) => {
      const T = window.__T;
      for (let k = 0; k < T.step; k++) {
        T.t += 0.05;
        orig(0.05, T.t, focus, ent, mode, cam);
        if (T.track) T.track(T.t);
      }
    };
  });
  const names = (process.env.ONLY || 'Princes,Queens,Spencer,Swan,Punt,Charles Grimes').split(',');
  for (const name of names) {
    await p.evaluate((name) => {
      const f = __city.bridges.bridges.find((q) => q.name.startsWith(name));
      const mid = (f.s0 + f.s1) / 2;
      __city.teleportTo(f.ax + f.ux * (mid - 170), f.az + f.uz * (mid - 170), 0); // (spawns are 100 m or more from the camera: stand back so the deck is in range)
      const seen = new Map(), cross = [];
      window.__X = { name: f.name, cross, n: 0 };
      __T.track = (t) => {
        for (const c of __city.trafficSystem.cars) {
          if (!c.edge) { seen.delete(c); continue; }
          const dx = c.x - f.ax, dz = c.z - f.az, s = dx * f.ux + dz * f.uz, o = dx * f.uz - dz * f.ux;
          if (Math.abs(o) > f.half + 2) { seen.delete(c); continue; }
          if (s > f.s0 - 20 && s < f.s1 + 20) {
            let r = seen.get(c);
            if (!r) seen.set(c, (r = { first: s, path: [] }));
            r.path.push([+t.toFixed(0), +s.toFixed(0), +c.speed.toFixed(1)]);
            if (r.path.length > 400) r.path.shift();
            const end = s < f.s0 + 8 ? 0 : s > f.s1 - 8 ? 1 : -1;
            if (end >= 0) {
              if (r.end !== undefined && r.end !== end && !cross.some((q) => q.c === c && q.t > t - 30)) cross.push({ c, t, from: r.end ? f.s1 | 0 : f.s0 | 0, to: s | 0, path: r.path.filter((_, i) => i % 25 === 0) });
              r.end = end;
              r.path = [];
            }
          } else seen.delete(c);
        }
      };
    }, name);
    await p.evaluate((fr) => new Promise((r) => { let n = 0; const f = () => (++n < fr ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), +(process.env.FRAMES || 600));
    if (process.env.DEBUG) console.log(JSON.stringify(await p.evaluate(() => { const f = __city.bridges.bridges.find((q) => q.name.startsWith(__X.name.split(' ')[0])); return __city.trafficSystem.cars.filter((c) => c.edge).map((c) => { const dx = c.x - f.ax, dz = c.z - f.az; return [dx * f.ux + dz * f.uz | 0, dx * f.uz - dz * f.ux | 0, +c.speed.toFixed(1), c.wait | 0]; }).filter((q) => q[0] > f.s0 - 80 && q[0] < f.s1 + 80 && Math.abs(q[1]) < 30); })));
    const r = await p.evaluate(() => { __T.track = null; return { name: __X.name, crossings: __X.cross.length, first: __X.cross[0] && { from: __X.cross[0].from, to: __X.cross[0].to, path: __X.cross[0].path } }; });
    console.log(JSON.stringify(r));
  }
  console.log('page errors', errs.length, errs.slice(0, 2));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 400)); process.exit(1); });
