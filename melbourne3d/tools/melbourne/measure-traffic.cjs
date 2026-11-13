// tools/melbourne/measure-traffic.cjs: how evenly cars are spread around several places, after the sim has run a while.
// Serve melbourne3d/ (python3 -m http.server 8801) then PORT=8801 [Q=high] [SIM=120] [SPOTS=cbd,dock] [DRIVE=1] node tools/melbourne/measure-traffic.cjs
// The page's traffic update is wrapped to run 20 fixed 0.05 s sim steps per frame, so two sim-minutes pass quickly in
// software rendering. "stand" parks the camera at each spot; DRIVE moves a virtual focus 30 m/s along +x (no view
// culling) and measures ahead of and behind it, to see whether density follows the player. Numbers per 150 m disc.
const { chromium } = require('playwright');
const log = (...a) => console.log(...a);
const SPOTS = { cbd: [-242, -221], flinders: [-224, 120], dock: [-1300, -700], carlton: [356, -1128], stkilda: [-701, 4960], edge: [-2600, 2500] };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 320, height: 200 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://localhost:${process.env.PORT || 8801}/index.html?webgl&quality=${process.env.Q || 'high'}&nointro&nofilm`, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.gameplay && __city.trafficSystem, null, { timeout: 480000 }); await p.waitForTimeout(2000);
  await p.evaluate(() => {
    const ts = __city.trafficSystem, orig = ts.update.bind(ts);
    window.__T = { t: 1000, step: 20, mode: 'stand', fx: 0, fz: 0, ev: [], on: false };
    ts.update = (dt, el, focus, ent, mode, cam) => {
      const T = window.__T;
      for (let k = 0; k < T.step; k++) {
        T.t += 0.05;
        const prev = T.on ? ts.cars.map((c) => (c.edge ? [c.x, c.z] : null)) : null;
        let f = focus, c = cam, en = ent;
        if (T.mode === 'drive') { T.fx += 1.5; f = { x: T.fx, z: T.fz }; c = null; en = null; }
        orig(0.05, T.t, f, en, mode, c);
        if (T.on) ts.cars.forEach((c, i) => { const q = prev[i]; if (q && c.edge && Math.hypot(c.x - q[0], c.z - q[1]) > 15) T.ev.push({ t: T.t, x: c.x, z: c.z }); });
      }
    };
  });
  const measure = (cx, cz) => p.evaluate(([cx, cz]) => {
    const ts = __city.trafficSystem, R = 150, edges = ts.network.edges;
    const near = (x, z) => Math.hypot(x - cx, z - cz) < R;
    const cars = ts.cars.filter((c) => c.edge && !c.driven && near(c.x, c.z));
    const all = [...cars, ...ts.buses.filter((c) => c.edge && near(c.x, c.z))];
    let laneLen = 0, gaps = [], bb = 0, queued = 0, stuck = 0, overlap = 0, empty = 0, packed = 0, roads = 0, perEdge = [];
    for (const e of edges) {
      const mx = e.sx + e.dx * e.len / 2, mz = e.sz + e.dz * e.len / 2;
      if (!near(mx, mz) || e.len < 40) continue;
      roads++; laneLen += e.len * e.lanes.length;
      let cnt = 0;
      e.occ.forEach((list) => {
        cnt += list.length;
        for (let i = 1; i < list.length; i++) { const g = list[i].s - list[i - 1].s - list[i].v.half - list[i - 1].v.half; gaps.push(g); if (g < 3) { bb++; if (list[i].v.speed < 0.5) queued++; } }
      });
      perEdge.push([cnt, e.len * e.lanes.length]);
      if (cnt === 0) empty++;
      if (cnt / (e.len * e.lanes.length) * 100 > 6) packed++;
    }
    const nn = [];
    gaps.forEach((g) => { if (g < 0) overlap++; });
    all.forEach((a, i) => { let d = 1e9; all.forEach((o, j) => { if (i === j) return; const e = Math.hypot(a.x - o.x, a.z - o.z); d = Math.min(d, e); if (false) { overlap++; if (window.__dump) (window.__pairs = window.__pairs || []).push([a, o].map((c) => ({ x: +c.x.toFixed(0), z: +c.z.toFixed(0), sp: +c.speed.toFixed(1), w: +c.wait.toFixed(0), conn: !!c.conn, lane: c.lane, s: +c.s.toFixed(0), len: +c.edge.len.toFixed(0), nl: c.edge.lanes.length, bus: !!c.bus, yl: !!c.yielding, ev: c.evade, pk: !!c.parked, dr: !!c.driven }))); } }); nn.push(d); });
    nn.sort((u, v) => u - v); gaps.sort((u, v) => u - v);
    const pc = (arr, q) => +(arr[Math.floor(arr.length * q)] ?? 0).toFixed(1);
    for (const c of all) if (c.wait > 20) stuck++;
    // the lead cars standing >20 s that are not held by a red light (or a stop sign) are the real deadlocks
    const ph = (e) => { const t = __T.t % 60; return e.axisIndex === 0 ? (t < 26 ? 'green' : t < 30 ? 'amber' : 'red') : (t < 30 ? 'red' : t < 56 ? 'green' : 'amber'); };
    let leadStuckNoRed = 0, leadStuck = 0;
    for (const e of edges) e.occ.forEach((list) => { const o = list[list.length - 1]; if (o && o.v.wait > 45 && near(o.v.x, o.v.z)) { leadStuck++; if (!e.to.signal || ph(e) === 'green') leadStuckNoRed++; } });
    if (window.__dump) for (const e of edges) e.occ.forEach((list) => { const o = list[list.length - 1]; if (o && o.v.wait > 45 && near(o.v.x, o.v.z)) { const v = o.v, m = v.move, f = m && m.to; (window.__pairs = window.__pairs || []).push({ x: +v.x.toFixed(0), z: +v.z.toFixed(0), w: +v.wait.toFixed(0), s: +v.s.toFixed(0), len: +e.len.toFixed(0), sig: !!e.to.signal, ph: ph(e), turn: m && m.turn, claimed: v.claimed, yl: v.yielding, bus: !!v.bus, toLen: f && +f.len.toFixed(0), toOcc: f && f.occ.map((l) => l.length), box: e.to.box && e.to.box.slice(), crossing: e.to.crossing && e.to.crossing.slice(), lanes: e.lanes.length, lane: v.lane }); } });
    const stuckAll = [...ts.cars, ...ts.buses].filter((c) => c.edge && c.wait > 60).length;
    perEdge.sort((u, v) => v[0] - u[0]); const top = perEdge.slice(0, Math.max(1, Math.ceil(perEdge.length * 0.1))).reduce((s, q) => s + q[0], 0);
    const totalOut = [...ts.cars, ...ts.buses].filter((c) => c.edge && !c.driven).length;
    let maxSeg = 0, small = 0;
    for (const e of edges) { let c = 0; e.occ.forEach((l) => { c += l.length; }); if (near(e.sx + e.dx * e.len / 2, e.sz + e.dz * e.len / 2)) maxSeg = Math.max(maxSeg, c); if (!(e.axis === 'ave' || e.lanes.length >= 2 || e.half >= 7)) small += c; }
    const mv = all.filter((c) => c.speed > 0.5).length;
    return { totalOut, maxSeg, onSmallStreets: small, n: all.length, per100mLane: +(all.length / laneLen * 100).toFixed(2), roads, emptyPct: +(empty / roads * 100).toFixed(0), packedPct: +(packed / roads * 100).toFixed(0),
      nnMed: pc(nn, 0.5), nnP10: pc(nn, 0.1), nnLt6Pct: +(nn.filter((d) => d < 6).length / nn.length * 100).toFixed(0), laneGapMed: pc(gaps, 0.5), laneGapP10: pc(gaps, 0.1),
      bumperPct: +(bb / Math.max(1, gaps.length) * 100).toFixed(0), queuedBB: queued, stuck20: stuck, leadStuck, leadStuckNoRed, stuck60All: stuckAll, overlap, top10roadsShare: +(top / Math.max(1, all.length) * 100).toFixed(0), movingPct: +(mv / Math.max(1, all.length) * 100).toFixed(0) };
  }, [cx, cz]);
  const raf = (fr, half) => p.evaluate(([fr, half]) => new Promise((r) => { let n = 0; const f = () => { if (half && n === half) __T.on = true; ++n < fr ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); }), [fr, half || 0]);
  const pick = (process.env.SPOTS || Object.keys(SPOTS).join(',')).split(',');
  const SIM = +(process.env.SIM || 120);
  for (const name of pick) {
    const [x, z] = SPOTS[name];
    await p.evaluate(([x, z]) => { __city.teleportTo(x, z, 0); Object.assign(__T, { mode: 'stand', on: false, ev: [] }); }, [x, z]);
    await p.waitForTimeout(500);
    const frames = Math.round(SIM / (0.05 * 20));
    await raf(4);
    await raf(Math.round(frames * 0.4), 0);
    await p.evaluate(() => { __T.on = true; });
    // four snapshots about 18 s apart (a single one depends on the light phase), averaged
    const snaps = [];
    for (let k = 0; k < 4; k++) { await raf(Math.round(frames * 0.2), 0); snaps.push(await measure(x, z)); }
    const avg = {}; for (const key of Object.keys(snaps[0])) avg[key] = +(snaps.reduce((a, q) => a + q[key], 0) / snaps.length).toFixed(2);
    if (process.env.DUMP) await p.evaluate(() => { window.__dump = true; window.__pairs = []; });
    const r = avg;
    const ev = await p.evaluate(() => { const e = __T.ev; let bunch = 0; e.forEach((a, i) => { if (e.some((o, j) => j !== i && Math.abs(o.t - a.t) < 3 && Math.hypot(o.x - a.x, o.z - a.z) < 25)) bunch++; }); return { respawns: e.length, bunchedPct: e.length ? Math.round(bunch / e.length * 100) : 0 }; });
    log(name.padEnd(8), 'stand', JSON.stringify({ ...r, ...ev }));
    if (process.env.DUMP) log(JSON.stringify(await p.evaluate(() => window.__pairs || [])));
    if (process.env.DRIVE) {
      await p.evaluate(([x, z]) => { Object.assign(__T, { mode: 'drive', fx: x, fz: z, on: false }); }, [x, z]);
      await raf(40);
      const fz = await p.evaluate(() => [__T.fx, __T.fz]);
      const ahead = await measure(fz[0] + 120, fz[1]), behind = await measure(fz[0] - 120, fz[1]);
      log(name.padEnd(8), 'drive ahead', JSON.stringify({ n: ahead.n, per100: ahead.per100mLane, empty: ahead.emptyPct }), 'behind', JSON.stringify({ n: behind.n, per100: behind.per100mLane, empty: behind.emptyPct, packed: behind.packedPct }));
      await p.evaluate(() => { __T.mode = 'stand'; });
    }
  }
  log('page errors', errs.length, errs.slice(0, 2));
  await b.close();
})().catch((e) => { console.error('ERR', e.message.slice(0, 400)); process.exit(1); });
