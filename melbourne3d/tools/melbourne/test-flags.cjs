// tools/melbourne/test-flags.cjs: the saved Davo choice changes Harbour Run's closing line, and chapter-card delays run on game time.
// Serve the repository root on 8765, then: node tools/melbourne/test-flags.cjs
const { chromium } = require('playwright');
const URL_ = 'http://localhost:8765/melbourne3d/index.html?webgl&quality=low&nointro&nofilm';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 640, height: 400 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ok = (c, w) => { console.log(c ? 'PASS' : 'FAIL', w); if (!c) process.exitCode = 1; };
  await p.goto(URL_); await p.waitForFunction(() => window.__city?.missions, null, { timeout: 120000 });
  await p.evaluate(() => window.__city.voices?.pause?.());
  for (const [flag, word] of [[true, 'Kestrel\'s'], [false, 'let Kestrel watch']]) {
    const r = await p.evaluate((f) => {
      const m = window.__city.missions; m.setFlag('davo_tails_kestrel', f); m.showChapter(7);
      const before = JSON.stringify(m.lastCard);
      m.update(2.0, 0); const early = !!m.lastCard && JSON.stringify(m.lastCard) !== before; // 2 s of game time: not yet
      m.update(1.0, 0); // 3 s: the card is up
      return { early, line: m.lastCard && m.lastCard.line, black: document.querySelector('.gm-black, #gm-black, [class*=black]')?.className || '' };
    }, flag);
    ok(!r.early, `flag=${flag}: nothing shown after 2 s of game time`);
    ok(r.line && r.line.includes(word), `flag=${flag} -> "${r.line}"`);
    await p.evaluate(() => { for (let i = 0; i < 80; i++) window.__city.missions.update(0.1, 0); }); // run the card out (6.5 s)
  }
  ok(errs.length === 0, 'no page errors ' + errs.join('|'));
  await b.close();
})();
