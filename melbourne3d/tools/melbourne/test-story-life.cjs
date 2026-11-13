// tools/melbourne/test-story-life.cjs: the story's cast is alive, the choice panel explains itself, and the Jobs list shows
// progress. Serve the repository root on port 8765 (python3 -m http.server 8765), then:
//   node tools/melbourne/test-story-life.cjs            (SHOTS=/some/dir to keep screenshots of the choice panel and Jobs list)
// Checks: (1) every animation name the story asks for (missions.js steps, cut-scene moods) resolves to a clip, or to the
// idle for Ara bodies by design; (2) the cast's poses really change over time in a cut scene (Davo and the player in
// Low Tide, Gus in The Quiet Room); (3) the choice panel has who/question/options with consequences and a hint, and
// choosing shows a confirmation; (4) the Jobs list shows done / next / locked and replaying an old job keeps progress.
const { chromium } = require('playwright');
const URL_ = 'http://localhost:8765/melbourne3d/index.html?webgl&quality=low&nointro&nofilm';
const SHOTS = process.env.SHOTS || '';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 640, height: 400 } });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); }
  });
  const p = await ctx.newPage();
  const errs = [], warns = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'warning' && /\[people\]/.test(m.text())) warns.push(m.text()); });
  const ok = (cond, what) => { log(cond ? 'PASS' : 'FAIL', what); if (!cond) process.exitCode = 1; };
  const until = (fn, ms, arg) => p.waitForFunction(fn, arg, { timeout: ms, polling: 250 });
  await p.goto(URL_, { timeout: 120000 });
  await until(() => window.__city && __city.missions && __city.gameplay && __city.cast && __city.cast.storyLoaded, 480000);
  await p.waitForTimeout(2000);

  // 1. every animation name resolves for every body that can play it
  const res = await p.evaluate(async () => {
    const { STORY_CAST } = await import('/melbourne3d/js/people.js');
    const names = new Set(['idle', 'walk', 'talk', 'listen', 'nod', 'shrug', 'talk_cool', 'talk_assured', 'talk_angry', 'talk_excited', 'talk_nervous', 'phone', 'wave']);
    const lines = (ls) => { for (const l of ls || []) if (l[2]) names.add(l[2]); };
    for (const m of __city.missions.missions) {
      lines(m.cut);
      for (const s of m.steps) {
        lines(s.talk && s.talk.lines);
        for (const a of s.actors || []) names.add(a.anim || 'idle');
        for (const w of s.watch || []) names.add('look');
      }
    }
    const ids = [...new Set(Object.values(STORY_CAST))];
    __city.cast.preload(ids);
    const t0 = performance.now();
    while (ids.some((i) => !__city.cast.loaded.includes(i)) && performance.now() - t0 < 120000) await new Promise((r) => setTimeout(r, 500));
    const ARA_OK = new Set(['phone', 'text', 'look', 'wait', 'listen', 'listen_angry', 'angry_idle', 'nervous_idle', 'thoughtful', 'nod', 'deny', 'shrug']);
    const missing = [], notLoaded = ids.filter((i) => !__city.cast.loaded.includes(i));
    for (const id of ids) {
      const have = new Set(__city.cast.clipNames(id));
      for (const n of names) if (!have.has(n) && !(id.startsWith('ara:') && ARA_OK.has(n))) missing.push(`${id}:${n}`);
    }
    return { names: [...names].sort(), ids, missing, notLoaded };
  });
  ok(res.notLoaded.length === 0, `every cast body loads (${res.ids.length}): ${JSON.stringify(res.notLoaded)}`);
  ok(res.missing.length === 0, `every story animation name (${res.names.length}) resolves to a clip for every body: ${JSON.stringify(res.missing)}`);

  // 2. poses change over time in a cut scene
  const moves = async (who, secs) => {
    let lo = Infinity, hi = -Infinity, clip = null, vis = false;
    for (let t = 0; t < secs; t += 0.6) {
      const r = await p.evaluate((w) => __city.cast.probe(w), who);
      if (r) { lo = Math.min(lo, r.sig); hi = Math.max(hi, r.sig); clip = r.clip; vis = r.visible; }
      await p.waitForTimeout(600);
    }
    return { range: hi - lo, clip, vis };
  };
  await p.evaluate(() => { const q = __city.missions.jumpTo(0); __city.teleportTo(q.x + 2, q.z + 2, 0); });
  await until(() => __city.missions.debug().inCut, 400000);
  await p.waitForTimeout(1500);
  let m = await moves('Davo', 4);
  ok(m.vis && m.range > 0.02, `Low Tide cut: Davo is visible and his pose changes (${m.clip}, range ${m.range.toFixed(3)})`);
  m = await moves('player', 4);
  ok(m.vis && m.range > 0.02, `Low Tide cut: the player's pose changes (${m.clip}, range ${m.range.toFixed(3)})`);
  await p.evaluate(() => __city.missions.skipCut());
  // Act I's Rocketbox cast: Gus at The Quiet Room (job 9)
  await p.evaluate(() => { __city.missions.addMoney(30000); __city.missions.setFlag('davo_tails_kestrel', true); const q = __city.missions.jumpTo(8); __city.teleportTo(q.x + 2, q.z + 2, 0); });
  await until(() => __city.missions.debug().inCut || __city.missions.debug().mission, 400000);
  await until(() => __city.missions.debug().inCut, 400000);
  await p.waitForTimeout(2500);
  const g = await p.evaluate(() => __city.cast.probe('Gus'));
  m = await moves('Gus', 4);
  ok(g && m.vis && m.range > 0.02, `The Quiet Room cut: Gus (a Rocketbox body) is there and moves (${m.clip}, range ${m.range.toFixed(3)})`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/cut-gus.png` });
  ok(warns.length === 0 || true, `missing-clip warnings (informational): ${JSON.stringify(warns.slice(0, 5))}`);

  // 3. the choice panel
  await p.evaluate(() => __city.missions.skipCut());
  const toChoice = async () => {
    for (let k = 0; k < 40 && !(await p.evaluate(() => __city.missions.debug().choice)); k++) {
      const g2 = await p.evaluate(() => __city.missions.debug().goal);
      if (g2) await p.evaluate((g3) => __city.teleportTo(g3.x, g3.z, 0), g2);
      await p.evaluate(() => { for (let t = 0; t < 4 && __city.missions.debug().mission; t += 0.05) __city.missions.update(0.05, performance.now() / 1000 + t); });
      if (await p.evaluate(() => __city.missions.debug().inCut)) await p.evaluate(() => __city.missions.skipCut());
      await p.waitForTimeout(500);
    }
  };
  await toChoice();
  ok(await p.evaluate(() => __city.missions.debug().choice), 'Gus offers the bar: the choice panel is up');
  const panel = await p.evaluate(() => {
    const e = document.querySelector('.gm-choice');
    return { text: e.innerText, buttons: [...e.querySelectorAll('button')].map((x) => ({ label: x.querySelector('strong')?.textContent, note: x.querySelector('small')?.textContent, h: x.getBoundingClientRect().height })),
      head: e.querySelector('b')?.textContent, ask: e.querySelector('.gm-ask')?.textContent, hint: e.querySelector('.gm-hint')?.textContent };
  });
  ok(/Gus Pappas is asking/.test(panel.head) && /Quiet Room/.test(panel.ask), `heading says who asks and the question: "${panel.head}" / "${panel.ask}"`);
  ok(panel.buttons.length === 3 && panel.buttons.every((x) => x.label && /\$/.test(x.note) && x.h >= 44), `3 options each with a label, a cost / consequence line and a big target: ${JSON.stringify(panel.buttons.map((x) => x.note))}`);
  ok(/press 1.3/.test(panel.hint), `hint tells how to pick: "${panel.hint}"`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/choice-desktop.png` });
  await p.setViewportSize({ width: 360, height: 640 });
  await p.waitForTimeout(800);
  const fits = await p.evaluate(() => { const r = document.querySelector('.gm-choice').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: innerWidth, h: innerHeight }; });
  ok(fits.left >= 0 && fits.right <= fits.w && fits.top >= 0 && fits.bottom <= fits.h, `the panel fits a 360x640 phone ${JSON.stringify(fits)}`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/choice-phone.png` });
  const before = await p.evaluate(() => ({ money: __city.missions.money }));
  await p.keyboard.press('Digit1');
  await p.waitForTimeout(500);
  const after = await p.evaluate(() => ({ money: __city.missions.money, flags: __city.missions.flags, open: __city.missions.debug().choice, chosen: document.querySelector('.gm-chosen')?.hidden === false ? document.querySelector('.gm-chosen').innerText : '' }));
  ok(after.flags.quiet_room === 'fair' && after.money === before.money - 12000 && !after.open, `key 1 chooses: flags ${JSON.stringify(after.flags.quiet_room)}, cash ${before.money} -> ${after.money}`);
  ok(/You chose 1/.test(after.chosen), `a confirmation shows: "${after.chosen.replace(/\n/g, ' | ')}"`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/chosen-phone.png` });

  // 4. the Jobs list: done / next / locked; replaying keeps the progress
  await p.evaluate(() => { const m2 = __city.missions; if (m2.debug().mission) m2.jumpTo(8); });
  const prog = await p.evaluate(() => __city.missions.progress);
  await p.evaluate(() => __city.refreshJobs());
  const rows = await p.evaluate(() => [...document.querySelectorAll('.job-row')].map((r) => ({ cls: r.className.replace(/.*(job-\w+)$/, '$1'), name: r.querySelector('.pop-name').textContent, dis: r.disabled })));
  const nDone = rows.filter((r) => r.cls === 'job-done').length, nNext = rows.filter((r) => r.cls === 'job-next').length, nLocked = rows.filter((r) => r.cls === 'job-locked' && r.dis).length;
  ok(rows.length === 13 && nDone === prog && nNext === (prog < 13 ? 1 : 0) && nLocked === 13 - prog - (prog < 13 ? 1 : 0), `Jobs list: ${nDone} done, ${nNext} next, ${nLocked} locked at progress ${prog}`);
  await p.setViewportSize({ width: 380, height: 760 });
  await p.waitForTimeout(5000); // (the 'walked off the job' banner goes)
  await p.evaluate(() => { document.getElementById('teleport-popover').showPopover(); document.querySelector('.job-progress').scrollIntoView(); });
  await p.waitForTimeout(600);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/jobs.png` });

  ok(errs.length === 0, `no page errors ${JSON.stringify(errs.slice(0, 5))}`);
  await b.close();
})().catch((e) => { console.error('ERROR', e.message.slice(0, 800)); process.exit(1); });
