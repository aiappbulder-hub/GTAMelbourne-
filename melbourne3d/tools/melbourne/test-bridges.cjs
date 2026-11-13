// tools/melbourne/test-bridges.cjs: every place a road crosses water has a deck, and the player can walk and drive over each
// bridge, both ways, staying on it. Serve melbourne3d/ (python3 -m http.server 8765 from melbourne3d/, or set PORT; the
// URL root is the melbourne3d folder), then: node tools/melbourne/test-bridges.cjs
// 1. every wet stretch of every road centreline (ROADS) and of the road network's edges (?debugroads) that lies inside
//    the walkable map is over some bridge's deck (js/bridges.js, window.__city.bridges);
// 2. for each bridge: a person on the roadway, a person on each footpath and the car, each both ways, starting 10 m
//    short of the deck: stay within 0.35 m of the deck's height (no sinking into the river, no climbing the railings),
//    stay between the railings, and get past the far end. Time is stepped by hand (controllerManager.update).
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 320, height: 200 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto(`http://localhost:${process.env.PORT || 8765}/index.html?webgl&quality=low&nointro&nofilm&debugroads`, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.bridges && __city.missions, null, { timeout: 480000 });
  await p.waitForTimeout(2000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };

  // 1. coverage
  const cover = await p.evaluate(async () => {
    const m = await import('/js/melbourne-config.js');
    const bs = __city.bridges.bridges;
    const onDeck = (x, z) => bs.some((f) => { const dx = x - f.ax, dz = z - f.az, s = dx * f.ux + dz * f.uz, o = dx * f.uz - dz * f.ux; return s >= f.s0 && s <= f.s1 && Math.abs(o) <= f.half; });
    const inMap = (x, z) => { const e = m.getIslandBoundsAtZ(z); return x > e.westX + 12 && x < e.eastX - 12 && z > m.ISLAND_BOUNDS.minZ + 40; };
    const bad = [], skipped = [];
    let wetRuns = 0;
    const scan = (name, x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0);
      let run = [];
      const end = () => { if (run.length * 2 >= 6) { wetRuns++; const mid = run[run.length >> 1]; const miss = run.filter((q) => !onDeck(q.x, q.z)); if (miss.length) (inMap(mid.x, mid.z) ? bad : skipped).push(`${name} wet ${run.length * 2} m at (${mid.x.toFixed(0)}, ${mid.z.toFixed(0)}), ${miss.length * 2} m without a deck`); } run = []; };
      for (let t = 0; t <= L; t += 2) { const x = x0 + ((x1 - x0) * t) / (L || 1), z = z0 + ((z1 - z0) * t) / (L || 1); if (m.inWater(x, z)) run.push({ x, z }); else end(); }
      end();
    };
    for (const r of m.ROADS) for (let i = 0; i + 1 < r.pts.length; i++) scan(r.name, r.pts[i].x, r.pts[i].z, r.pts[i + 1].x, r.pts[i + 1].z);
    for (const e of globalThis.__roadEdges || []) scan('edge', e[0], e[1], e[2], e[3]);
    return { bad: [...new Set(bad)], skipped: [...new Set(skipped)], wetRuns, bridges: bs.length };
  });
  log(`${cover.bridges} bridges, ${cover.wetRuns} wet road stretches checked`);
  for (const s of cover.skipped) log('skipped (outside the walkable map):', s);
  for (const s of cover.bad.slice(0, 12)) log('NO DECK:', s);
  ok(cover.bad.length === 0, 'every road crossing of water in the map has a deck');

  // 2. walking and driving over each bridge
  const names = await p.evaluate(() => __city.bridges.bridges.map((f) => f.name));
  for (let bi = 0; bi < names.length; bi++) {
    for (const trip of [
      { who: 'person', o: 0, dir: 1 }, { who: 'person', o: 0, dir: -1 },
      { who: 'person', o: 'foot', dir: 1 }, { who: 'person', o: '-foot', dir: -1 },
      { who: 'car', o: 0, dir: 1 }, { who: 'car', o: 0, dir: -1 }
    ]) {
      const r = await p.evaluate(({ bi, trip }) => {
        const cm = __city.controllerManager, f = __city.bridges.bridges[bi];
        const o = trip.o === 'foot' ? f.road / 2 + f.spec.foot / 2 : trip.o === '-foot' ? -(f.road / 2 + f.spec.foot / 2) : trip.o;
        const dir = trip.dir;
        const sStart = dir > 0 ? f.s0 - 10 : f.s1 + 10, sGoal = dir > 0 ? f.s1 + 6 : f.s0 - 6;
        const P = (s) => ({ x: f.ax + f.ux * s + f.uz * o, z: f.az + f.uz * s - f.ux * o });
        const start = P(sStart), heading = Math.atan2(f.ux * dir, f.uz * dir);
        cm.resetInput && cm.resetInput();
        cm.setMode(trip.who);
        const e = cm.entities[trip.who];
        e.position.set(start.x, 0, start.z);
        e.heading = heading; e.speed = trip.who === 'car' ? 8 : 0; e.vx = e.vz = 0;
        cm.cameraYaw = heading;
        cm.keys.forward = 1; cm.keys.sprint = trip.who === 'person' ? 1 : 0;
        let minY = Infinity, maxY = -Infinity, maxO = 0, reached = false, t = 0, onDeckSteps = 0;
        for (; t < 60 && !reached; t += 0.05) {
          cm.update(0.05, t);
          const dx = e.position.x - f.ax, dz = e.position.z - f.az, s = dx * f.ux + dz * f.uz, oo = dx * f.uz - dz * f.ux;
          if (s >= f.s0 + 2 && s <= f.s1 - 2) { onDeckSteps++; minY = Math.min(minY, e.position.y); maxY = Math.max(maxY, e.position.y); maxO = Math.max(maxO, Math.abs(oo - o)); }
          if (dir > 0 ? s >= sGoal : s <= sGoal) reached = true;
        }
        cm.keys.forward = 0; cm.keys.sprint = 0; cm.resetInput && cm.resetInput();
        cm.setMode('car');
        return { reached, t: +t.toFixed(1), minY: +minY.toFixed(2), maxY: +maxY.toFixed(2), drift: +maxO.toFixed(1), onDeckSteps };
      }, { bi, trip });
      const label = `${names[bi]}: ${trip.who} ${trip.o === 0 ? 'on the roadway' : 'on the footpath'} ${trip.dir > 0 ? 'there' : 'back'}`;
      const good = r.reached && r.onDeckSteps > 10 && r.minY > -0.1 && r.maxY < 0.35 && r.drift < 6;
      ok(good, `${label} ${JSON.stringify(r)}`);
    }
  }
  // 3. the railings hold: a person on the footpath at mid-span, and the car, pushed sideways at each side for 4 s
  for (let bi = 0; bi < names.length; bi++) {
    const r = await p.evaluate((bi) => {
      const cm = __city.controllerManager, f = __city.bridges.bridges[bi];
      const worst = {};
      for (const who of ['person', 'car']) for (const side of [-1, 1]) {
        // the middle of the deck's length, on the roadway's edge nearest `side`, facing out at 90 degrees
        const sMid = (f.s0 + f.s1) / 2, o0 = side * (who === 'car' ? f.road / 2 - 2 : f.road / 2 + f.spec.foot / 2);
        const x = f.ax + f.ux * sMid + f.uz * o0, z = f.az + f.uz * sMid - f.ux * o0;
        const heading = Math.atan2(f.uz * side, -f.ux * side); // along +o
        cm.setMode(who);
        const e = cm.entities[who];
        e.position.set(x, 0, z); e.heading = heading; e.speed = who === 'car' ? 6 : 0; e.vx = e.vz = 0;
        cm.cameraYaw = heading; cm.keys.forward = 1; cm.keys.sprint = 1;
        let maxO = 0;
        for (let t = 0; t < 4; t += 0.05) { cm.update(0.05, t); maxO = Math.max(maxO, Math.abs((e.position.x - f.ax) * f.uz - (e.position.z - f.az) * f.ux)); }
        cm.keys.forward = 0; cm.keys.sprint = 0;
        worst[`${who}${side}`] = +(maxO - f.half).toFixed(2);
      }
      cm.resetInput && cm.resetInput();
      cm.setMode('car');
      return worst;
    }, bi);
    // the railing's inner face is at half + 0.22 - 0.05; the body (0.42 m person radius, the car's half-width) stays inside it
    const good = Object.values(r).every((v) => v < 0.6);
    ok(good, `${names[bi]}: railings hold (how far past the footpath edge: ${JSON.stringify(r)})`);
  }
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 3)));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 300)); process.exit(1); });
