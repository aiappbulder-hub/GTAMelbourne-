// tools/melbourne/test-alive.cjs: ambient city events. Serve the repo root (python3 -m http.server 8765), then
// node melbourne3d/tools/melbourne/test-alive.cjs. Checks every event spawns/despawns
// without page errors, and takes 3 screenshots (960x540) into SHOTDIR.
const { chromium } = require('playwright');
const fs = require('fs');
const URL_ = `http://localhost:${process.env.PORT || 8765}/melbourne3d/index.html?webgl&quality=low&nofilm`;
const DIR = process.env.SHOTDIR || '/tmp/claude-0/-home-user-GTAMelbourne-/84b0ea80-0da6-56ae-9d81-972de89b72c7/scratchpad/alive';
fs.mkdirSync(DIR, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); 
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  await p.goto(URL_, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.events && __city.missions, null, { timeout: 480000 });
  await p.waitForFunction(() => document.getElementById('loading-overlay')?.classList.contains('hidden'), null, { timeout: 900000, polling: 1000 });
  await p.waitForTimeout(4000);
  const shot = async (n) => { log('errs so far', errs.slice(0, 3).join(' | ')); await p.screenshot({ path: `${DIR}/${n}.png`, timeout: 500000 }).catch((e) => ok(false, `screenshot ${n}: ${e.message.split('\n')[0]}`)); };
  const setTime = (id) => p.evaluate((i) => { document.querySelector(`[data-time="${i}"]`)?.click(); }, id);
  for (const name of await p.evaluate(() => __city.events.names)) {
    await setTime('midnight');
    const n = await p.evaluate((nm) => { __city.events.trigger(nm); return __city.events.active.filter((e) => e.name === nm).length; }, name);
    ok(n === 1, `event ${name} spawns`);
    await p.waitForTimeout(3500);
    const info = await p.evaluate((nm) => ({ a: __city.events.active.find((e) => e.name === nm), actors: __city.events.actorCount }), name);
    log(name, JSON.stringify(info));
    if (name === 'busker' || name === 'footy') { await setTime('twilight'); await p.waitForTimeout(1500); await shot(name); }
    await p.evaluate(() => __city.events.despawnAll());
    const left = await p.evaluate(() => ({ n: __city.events.active.length, actors: __city.events.actorCount }));
    ok(left.n === 0 && left.actors === 0, `event ${name} despawns ${JSON.stringify(left)}`);
  }
  // shopfront street at dusk (Flinders Lane / Elizabeth), then Chinatown at night
  await setTime('twilight');
  await p.evaluate(() => __city.teleportTo(-242 + 3, 118, 0));
  await p.waitForTimeout(5000); await shot('shopfront-dusk');
  await setTime('midnight');
  await p.evaluate(() => __city.teleportTo(150, -344 + 2.5, Math.PI / 2));
  await p.waitForTimeout(5000); await shot('chinatown-night');
  ok(errs.length === 0, `no page errors ${errs.slice(0, 4).join(' | ')}`);
  await b.close();
})();
