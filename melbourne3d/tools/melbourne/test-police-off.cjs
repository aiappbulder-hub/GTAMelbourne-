// With Police OFF (the default) a shot and a carjack give no wanted level and spawn no police.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext()).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:' + (process.env.PORT || 8765) + '/melbourne3d/index.html?webgl&quality=low&nointro&nofilm', { timeout: 120000 });
  await p.waitForFunction(() => window.__city && window.__city.wanted, null, { timeout: 120000 }).catch(() => {});
  const r = await p.evaluate(async () => {
    const c = window.__city, w = c.wanted;
    const pos = c.controllerManager.getActiveEntity().position;
    w.crime('shot', pos.x, pos.z); w.crime('carjack', pos.x, pos.z); w.crime('kill', pos.x, pos.z);
    await new Promise((r) => setTimeout(r, 12000));
    return { stars: w.stars, heat: w.heat, units: w.units.length, opt: localStorage.getItem('gta-melbourne3d-opt-police') };
  });
  console.log(JSON.stringify(r), errs.slice(0, 3));
  const ok = r.stars === 0 && r.heat === 0 && r.units === 0 && !errs.length;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close(); process.exit(ok ? 0 : 1);
})();
