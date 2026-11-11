// tools/melbourne/test-calls.cjs: between jobs. The phone call that sends you to the next job, the Book on K, and New
// game. Serve the repository root on port 8765 (python3 -m http.server 8765), then: node tools/melbourne/test-calls.cjs
const { chromium } = require('playwright');
const URL_ = 'http://localhost:8765/melbourne3d/index.html?webgl&quality=low&nointro&nofilm';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 360, height: 230 } });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('gta-melbourne3d-save-v2', JSON.stringify({ version: 2, story: 2, money: 44500, progress: 12,
        flags: { quiet_room: 'fair', bug: 'kept', carlton: 'books', kaz: 'partner', doors: 'take' } }));
    }
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  const ok = (cond, what) => { log(cond ? 'PASS' : 'FAIL', what); if (!cond) process.exitCode = 1; };
  const ready = async () => { await p.waitForFunction(() => window.__city && __city.missions && __city.gameplay && __city.empire, null, { timeout: 480000 }); await p.waitForTimeout(2000); };
  const call = () => p.evaluate(() => { const e = document.querySelector('.gm-call'); return { on: e.classList.contains('on'), text: e.textContent }; });

  await p.goto(URL_, { timeout: 120000 }); await ready();
  await p.evaluate(() => { __city.gameplay.leaveCarNow(); __city.teleportTo(-900, -300, 0); });
  await p.waitForFunction(() => document.querySelector('.gm-call').classList.contains('on'), null, { timeout: 400000 });
  let c = await call(); ok(/Ruby calling/.test(c.text) && /Next job: The Ferryman's Toll/.test(c.text) && /\d+ (m|km) /.test(c.text), `the next job's call rings with where to go: "${c.text}"`);
  await p.keyboard.press('KeyK'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => __city.empire.isOpen && /The Grid/.test(document.querySelector('.bk-body').textContent)), 'K opens the Book on the ledger');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  ok(!(await p.evaluate(() => __city.empire.isOpen)), 'Esc closes it');
  ok(await p.evaluate(() => !!document.getElementById('btn-new-game')), 'there is a New game button');
  await Promise.all([p.waitForEvent('load', { timeout: 120000 }), p.evaluate(() => document.getElementById('btn-new-game').click())]);
  await ready();
  const st = await p.evaluate(() => ({ prog: __city.missions.progress, money: __city.missions.money, flags: __city.missions.flags, mode: __city.controllerManager.activeMode,
    at: (({ x, z }) => [Math.round(x), Math.round(z)])(__city.controllerManager.getActiveEntity().position), till: __city.empire.debug().till, bookOpen: __city.empire.debug().open }));
  ok(st.prog === 0 && st.money === 500 && JSON.stringify(st.flags) === '{}' && st.till === 0 && !st.bookOpen, `New game: cash, progress, choices and the till are wiped ${JSON.stringify(st)}`);
  ok(st.mode === 'person' && Math.hypot(st.at[0] + 1812, st.at[1] - 14) < 40, `New game: on foot by Harbour Esplanade, where the story starts (${st.at})`);
  await p.waitForFunction(() => document.querySelector('.gm-call').classList.contains('on'), null, { timeout: 400000 });
  c = await call(); ok(/Davo calling/.test(c.text) && /Low Tide/.test(c.text), `Davo rings about the first job: "${c.text}"`);
  ok(errs.length === 0, `no page errors ${JSON.stringify(errs.slice(0, 5))}`);
  await b.close();
})().catch((e) => { console.error('ERROR', e.message.slice(0, 600)); process.exit(1); });
