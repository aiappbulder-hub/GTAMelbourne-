// Build one character in Ara 3D Gen's hosted app (ara3dgen.com, MIT; CC0 MakeHuman assets, CMU motion capture) and
// download it as a rigged, animated GLB with facial blend shapes. Run: LOOK='Man|Adult · 35|...' node tools/ara/export.cjs <out.glb>
const { chromium } = require('playwright');
const fs = require('fs');

// the look: the builder's quick-build buttons, in order (default: the test player)
const LOOK = (process.env.LOOK || 'Man|Adult · 35|Athletic|Caucasian|Casual|Short crop|Stubble').split('|');
// the clips the game maps (js/people.js ARA_CLIPS)
const CLIPS = ['Idle', 'Walk', 'Run', 'Walk backwards', 'Strafe left', 'Strafe right', 'Turn left 90°', 'Turn right 90°', 'Talk',
  'Wave', 'Cheer', 'Laugh', 'Sit idle (chair)', 'Pistol idle (low ready)', 'Pistol aim', 'Pistol fire', 'Hit from front',
  'Death (fall backward)', 'Get up (from back)'];

(async () => {
  const out = process.argv[2];
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto('https://ara3dgen.com/app/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForTimeout(20000);
  const status = () => p.evaluate(() => (document.body.innerText.match(/\d+ cm · [^\n]*/) || [''])[0]);
  for (const name of LOOK) {
    const btn = p.getByRole('button', { name, exact: true }).first();
    await btn.click({ timeout: 20000 });
    await p.waitForTimeout(9000); // the character rebuilds
    console.log('chose', name, '->', await status());
  }
  // the export panel: rigged + animations, GLB, just our clips
  await p.getByRole('button', { name: /· Rigged/ }).first().click();
  await p.waitForTimeout(2500);
  await p.getByText('Rigged + animations', { exact: true }).click();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'None', exact: true }).first().click();
  await p.waitForTimeout(800);
  const ticked = await p.evaluate((names) => {
    const done = [];
    for (const name of names) {
      // only the export panel's clip checkboxes (the builder has buttons with the same names)
      const boxes = [...document.querySelectorAll('input[type=checkbox]')];
      const box = boxes.find((x) => { const row = x.closest('label') || x.parentElement; return row && row.textContent.trim().replace(/\s+/g, ' ').startsWith(name) && row.textContent.trim().length < name.length + 12; });
      if (box && !box.checked) { box.click(); done.push(name); }
    }
    return done;
  }, CLIPS);
  console.log('ticked', ticked.join(', '));
  await p.getByRole('button', { name: 'GLB', exact: true }).first().click();
  await p.waitForTimeout(1500);
  console.log(await p.evaluate(() => { const t = document.body.innerText; const i = t.indexOf('YOU WILL DOWNLOAD'); return t.slice(i, i + 400).replace(/\n+/g, ' | '); }));
  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 300000 }),
    p.getByRole('button', { name: /Download .*\.glb/ }).first().click()
  ]);
  await dl.saveAs(out);
  console.log('saved', out, (fs.statSync(out).size / 1e6).toFixed(2), 'MB');
  await p.screenshot({ path: out.replace(/\.glb$/, '.png'), timeout: 120000 });
  await b.close();
})();
