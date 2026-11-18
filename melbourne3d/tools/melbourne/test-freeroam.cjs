// tools/melbourne/test-freeroam.cjs: free roam is the default. Serve the repo root (python3 -m http.server 8765), then
// node tools/melbourne/test-freeroam.cjs. Fresh load spawns in a car, no job, no phone ring; the area card shows after a
// teleport to St Kilda; a rideshare shift starts and generates a fare. Screenshot: SHOT env or the default path.
const { chromium } = require('playwright');
const URL_ = `http://localhost:${process.env.PORT || 8765}/melbourne3d/index.html?webgl&quality=low&nofilm`;
const SHOT = process.env.SHOT || '/tmp/claude-0/-home-user-GTAMelbourne-/84b0ea80-0da6-56ae-9d81-972de89b72c7/scratchpad/spawn.png';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ok = (c, w) => { log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  await p.goto(URL_, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.missions && __city.gameplay && __city.rideshare && document.querySelector('#loading-overlay.hidden, .loading.hidden') !== undefined, null, { timeout: 480000 });
  await p.waitForTimeout(8000);
  let st = await p.evaluate(() => ({ mode: __city.controllerManager.activeMode, onJob: __city.missions.onJob, story: __city.missions.storyMode, intro: __city.intro.active, film: __city.intro.filmPlaying,
    pos: (({ x, z }) => ({ x: Math.round(x), z: Math.round(z) }))(__city.controllerManager.getActiveEntity().position), activePreset: __city.areaCards.current }));
  log(JSON.stringify(st));
  ok(st.mode === 'car' && !st.onJob && !st.story && !st.intro && !st.film, 'fresh load: in a car, no job, no intro, free roam');
  await p.screenshot({ path: SHOT, timeout: 240000 });
  await p.waitForTimeout(20000);
  st = await p.evaluate(() => ({ call: document.querySelector('.gm-call')?.classList.contains('on'), obj: document.querySelector('.gm-objective')?.textContent, onJob: __city.missions.onJob, pink: __city.scene.children.some(() => false) }));
  ok(!st.call && !st.obj && !st.onJob, `no phone ring or objective after ~28 s ${JSON.stringify(st)}`);
  await p.evaluate(() => __city.teleportTo(-700, 4960, 0));
  await p.waitForFunction(() => __city.areaCards.visible && /St Kilda/i.test(__city.areaCards.text), null, { timeout: 30000, polling: 250 }).then(() => ok(true, 'area card shows St Kilda'), () => ok(false, 'area card St Kilda'));
  await p.evaluate(() => __city.teleportTo(-178, 237, Math.PI / 2));
  await p.keyboard.press('KeyP');
  await p.waitForFunction(() => __city.rideshare.state.on && __city.rideshare.state.fare, null, { timeout: 20000, polling: 250 }).then(() => ok(true, 'rideshare shift started with a fare'), () => ok(false, 'rideshare fare'));
  await p.evaluate(() => __city.rideshare.debugCompletePickup());
  const s2 = await p.evaluate(() => __city.rideshare.state);
  ok(s2.phase === 'drop' && s2.fare.drop, `pickup then drop-off ${JSON.stringify(s2.fare && s2.fare.drop)}`);
  const m0 = await p.evaluate(() => __city.missions.money);
  await p.evaluate(() => __city.rideshare.debugCompleteDrop());
  ok((await p.evaluate(() => __city.missions.money)) > m0, 'fare paid into cash');
  await p.keyboard.press('KeyP');
  ok(!(await p.evaluate(() => __city.rideshare.state.on)), 'P ends the shift');
  ok(errs.length === 0, `no page errors ${errs.slice(0, 3)}`);
  await b.close();
})();
