// tools/melbourne/test-gps.cjs: the minimap's GPS route (js/gps.js, drawn by js/nyc-map.js). Serve melbourne3d/ (python3 -m
// http.server 8947 from melbourne3d/, or set PORT), then: node tools/melbourne/test-gps.cjs
// 1. a job's objective gives the map a waypoint and a route to it
// 2. every route point lies on a street (within 12 m of a street centreline, js/melbourne-config.js ROADS)
// 3. it starts within 30 m of the player and ends within 30 m of the target
// 4. a route from the north bank of the Yarra to the south bank crosses a bridge deck (js/bridges.js), and isn't a detour
// 5. the route shortens as the player advances along it
// 6. it is recomputed by the throttle, not every frame, and not at all while nothing changes
// 7. it clears on arrival and when the waypoint is cleared; a new objective gives a new route
// 8. the radar draws it (screenshot to /tmp/gps-minimap.png for a look)
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 230 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto(`http://localhost:${process.env.PORT || 8947}/index.html?webgl&quality=low&nointro&nofilm`, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.bridges && __city.missions && __city.map, null, { timeout: 480000 });
  await p.waitForTimeout(2000);
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  const waitRoute = (ms = 30000) => p.waitForFunction(() => __city.map.route && __city.map.route.pts.length > 1, null, { timeout: ms }).then(() => true, () => false);
  const state = () => p.evaluate(() => {
    const e = __city.controllerManager.getActiveEntity(), m = __city.map, r = m.route;
    return { px: e.position.x, pz: e.position.z, wp: m.waypoint && { x: m.waypoint.x, z: m.waypoint.z, job: m.waypoint.job },
      route: r && { n: r.pts.length, len: r.length, found: r.found, first: r.pts[0], last: r.pts[r.pts.length - 1] } };
  });

  // 1. a job's objective
  await p.evaluate(() => { __city.missions.jumpTo(3); __city.teleportTo(5, 250, 0); });
  await p.waitForFunction(() => __city.map.waypoint && __city.map.waypoint.job === 3, null, { timeout: 30000 }).catch(() => {});
  const got = await waitRoute();
  let s = await state();
  log('player', s.px.toFixed(0), s.pz.toFixed(0), 'objective', s.wp && [s.wp.x | 0, s.wp.z | 0], 'route', s.route && [s.route.n, s.route.len | 0]);
  ok(got && s.wp && s.wp.job === 3, 'the next job gives the map a waypoint and a route to it');
  ok(s.route && s.route.found, 'the route was found along the streets');

  // 2 & 3. on the streets, ends near player and target
  const chk = await p.evaluate(async () => {
    const m = await import('/js/melbourne-config.js');
    const r = __city.map.route, e = __city.controllerManager.getActiveEntity(), wp = __city.map.waypoint;
    const dRoad = (x, z) => { let best = 1e9; for (const rd of m.ROADS) for (let i = 0; i + 1 < rd.pts.length; i++) { const a = rd.pts[i], c = rd.pts[i + 1], dx = c.x - a.x, dz = c.z - a.z, L2 = dx * dx + dz * dz || 1e-9; const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)); best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z)); } return best; };
    let worst = 0;
    for (let i = 0; i < r.pts.length; i += Math.max(1, Math.floor(r.pts.length / 80))) worst = Math.max(worst, dRoad(r.pts[i].x, r.pts[i].z));
    return { worst, startD: Math.hypot(r.pts[0].x - e.position.x, r.pts[0].z - e.position.z), endD: Math.hypot(r.pts[r.pts.length - 1].x - wp.x, r.pts[r.pts.length - 1].z - wp.z) };
  });
  log('worst distance from a street', chk.worst.toFixed(1), 'm; start', chk.startD.toFixed(1), 'end', chk.endD.toFixed(1));
  ok(chk.worst < 12, 'every route point lies on a street');
  ok(chk.startD < 30, 'it starts within 30 m of the player');
  ok(chk.endD < 30, 'it ends within 30 m of the target');

  // 4. across the Yarra
  const cross = await p.evaluate(async () => {
    __city.teleportTo(5, 300, 0); // Flinders St, north bank
    __city.map.waypoint = { x: -700, z: 660, job: (__city.map.waypoint || {}).job };
    await new Promise((r) => setTimeout(r, 6000));
    const r = __city.map.route;
    if (!r || !r.pts.length) return null;
    const bs = __city.bridges.bridges;
    const onDeck = (x, z) => bs.find((f) => { const dx = x - f.ax, dz = z - f.az, s = dx * f.ux + dz * f.uz, o = dx * f.uz - dz * f.ux; return s >= f.s0 && s <= f.s1 && Math.abs(o) <= f.half; });
    const used = new Set();
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], c = r.pts[i + 1], L = Math.hypot(c.x - a.x, c.z - a.z);
      for (let t = 0; t <= L; t += 2) { const f = onDeck(a.x + ((c.x - a.x) * t) / (L || 1), a.z + ((c.z - a.z) * t) / (L || 1)); if (f) used.add(f.name); }
    }
    const e = __city.controllerManager.getActiveEntity();
    return { bridges: [...used], len: r.length, straight: Math.hypot(-700 - e.position.x, 660 - e.position.z), from: [e.position.x | 0, e.position.z | 0] };
  });
  log('cross-river route', JSON.stringify(cross));
  ok(cross && cross.bridges.length > 0, 'a route across the Yarra goes over a bridge deck');
  ok(cross && cross.len < cross.straight * 2.5, 'and is not a huge detour');

  // 5. shortens as the player advances
  const adv = await p.evaluate(async () => {
    const m = __city.map, r0 = m.route, len0 = r0.length;
    let acc = 0, target = null;
    for (let i = 0; i + 1 < r0.pts.length; i++) { acc += Math.hypot(r0.pts[i + 1].x - r0.pts[i].x, r0.pts[i + 1].z - r0.pts[i].z); if (acc > 250) { target = r0.pts[i + 1]; break; } }
    if (!target) return null;
    __city.teleportTo(target.x, target.z, 0);
    await new Promise((r) => setTimeout(r, 6000));
    return { len0, len1: __city.map.route ? __city.map.route.length : null };
  });
  log('after advancing ~250 m', JSON.stringify(adv));
  ok(adv && adv.len1 !== null && adv.len1 < adv.len0 - 150, 'the route shortens as the player advances');

  // 6. throttle
  const thr = await p.evaluate(async () => {
    const m = __city.map;
    const orig = m.gps.route.bind(m.gps);
    let calls = 0;
    m.gps.route = (...a) => { calls++; const t = performance.now(); const r = orig(...a); m.routeMs = Math.max(m.routeMs || 0, performance.now() - t); return r; };
    const f0 = (window.__frames = 0);
    let frames = 0; const tick = () => { frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, 5000));
    return { calls, frames, ms: m.routeMs || 0, f0 };
  });
  log('stationary 5 s:', JSON.stringify(thr));
  ok(thr.calls <= 1, 'the route is not recomputed while the player stands still');
  const thr2 = await p.evaluate(async () => {
    const m = __city.map, e = __city.controllerManager.getActiveEntity();
    let calls = 0; const orig = m.gps.route; m.gps.route = (...a) => { calls++; return orig(...a); };
    let frames = 0; const tick = () => { frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    for (let i = 0; i < 10; i++) { e.position.x += 4; await new Promise((r) => setTimeout(r, 400)); } // a 40 m crawl over 4 s
    return { calls, frames, ms: m.routeMs || 0 };
  });
  log('moving 40 m in 4 s:', JSON.stringify(thr2));
  ok(thr2.calls <= 8 && thr2.calls < thr2.frames, 'recomputed by the throttle, not every frame');
  ok(thr.ms < 60, `one route takes ${thr.ms.toFixed(1)} ms (< 60)`);

  // 7. objective changes, arrival, clearing
  const ch = await p.evaluate(async () => {
    const m = __city.map;
    __city.teleportTo(5, 300, 0);
    m.waypoint = { x: -700, z: 660, job: m.waypoint && m.waypoint.job };
    await new Promise((r) => setTimeout(r, 4000));
    const a = m.route && m.route.key;
    m.waypoint = { x: 560, z: 700, job: m.waypoint && m.waypoint.job };
    await new Promise((r) => setTimeout(r, 4000));
    const b2 = m.route && m.route.key;
    const wp = m.waypoint;
    __city.teleportTo(wp.x, wp.z, 0);
    const e = __city.controllerManager.getActiveEntity();
    await new Promise((r) => setTimeout(r, 4000));
    const arrived = { route: m.route, d: Math.hypot(e.position.x - wp.x, e.position.z - wp.z) };
    m.waypoint = { x: -700, z: 660, job: m.waypoint && m.waypoint.job };
    await new Promise((r) => setTimeout(r, 3000));
    const again = !!m.route;
    m.waypoint = null;
    m.updateRoute(__city.controllerManager.getActiveEntity());
    return { a, b2, arrivedRoute: arrived.route, d: arrived.d, again, cleared: m.route === null };
  });
  log('changes', JSON.stringify(ch));
  ok(ch.a && ch.b2 && ch.a !== ch.b2, 'a new objective gives a new route');
  ok(ch.arrivedRoute === null, `the route clears on arrival (${ch.d.toFixed(0)} m from the target)`);
  ok(ch.again, 'a new waypoint after arriving routes again');
  ok(ch.cleared, 'clearing the waypoint clears the route');

  // 8. look at the radar
  await p.evaluate(() => { __city.teleportTo(5, 300, 0); __city.map.waypoint = { x: -700, z: 660, job: (__city.map.waypoint || {}).job }; });
  await p.waitForTimeout(5000);
  await p.setViewportSize({ width: 900, height: 560 });
  await p.waitForTimeout(6000);
  const el = await p.$('#minimap-canvas');
  const box = el && await el.boundingBox();
  if (box) await p.screenshot({ path: '/tmp/gps-minimap.png', clip: box });
  await p.screenshot({ path: '/tmp/gps-screen.png' });
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
