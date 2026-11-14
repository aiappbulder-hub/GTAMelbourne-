// tools/melbourne/test-weapon-ui.cjs: the weapon HUD (js/gameplay.js): one compact widget (icon, name, mag / reserve), a strip that
// shows only while switching and fades after ~1.5 s, one GUN button on touch (tap cycles, long-press opens the strip); none of
// it overlaps the minimap, the health bar or the prompt. Serve the repo root (PORT, default 9079), then:
//   node tools/melbourne/test-weapon-ui.cjs [outDir]      screenshots go to outDir (default .) as weapon-desktop-*.png, weapon-phone-*.png
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const PORT = process.env.PORT || 9079;
let failed = false;
const ok = (c, w) => { console.log(c ? 'PASS' : 'FAIL', w); if (!c) failed = true; };
const overlap = (a, b) => a && b && a.width > 0 && b.width > 0 && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function run(b, name, vp, touch) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await p.goto(`http://localhost:${PORT}/melbourne3d/index.html?webgl&quality=low&nointro&nofilm`, { timeout: 120000 });
  await p.waitForFunction(() => window.__city && __city.gameplay && __city.cast && __city.cast.ready, null, { timeout: 480000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { __city.gameplay.leaveCarNow(); __city.teleportTo(-240.68, -221, 0); });
  await p.waitForTimeout(2500);
  const rect = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return cs.display === 'none' || cs.visibility === 'hidden' ? null : { x: r.x, y: r.y, width: r.width, height: r.height, op: e.classList.contains('show') ? 1 : 0 }; }, sel);
  const others = async () => ({ minimap: await rect('#minimap-card'), hp: await rect('.gp-hp'), prompt: await rect('.gp-prompt'), hud: await rect('.hud') });
  await p.keyboard.press('KeyG');
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/weapon-${name}-1-idle.png`, timeout: 180000 });
  const w = await rect(touch ? '.gp-gun' : '.gp-weapon'); // (on touch the GUN button is the widget: icon and ammo on it)
  ok(w && w.height < 70 && w.width < 230, `${name}: compact widget (${w && Math.round(w.width)}x${w && Math.round(w.height)})`);
  const strip0 = await rect('.gp-strip');
  ok(!strip0 || strip0.op < 0.05, `${name}: the strip is hidden while idle`);
  const o = await others();
  for (const k of ['minimap', 'hp', 'prompt', 'hud']) ok(!overlap(w, o[k]), `${name}: widget does not overlap ${k}`);
  if (!touch) {
    await p.keyboard.press('Digit2'); // (the real key path; the strip then fades)
    await p.waitForTimeout(2200);
    const s = await p.evaluate(() => { __city.gameplay.selectSlot(2); const e = document.querySelector('.gp-strip'); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, op: e.classList.contains('show') ? 1 : 0 }; });
    await p.evaluate(() => { document.querySelector('.gp-strip').style.opacity = '1'; }); // (a screenshot takes longer than the fade)
    await p.screenshot({ path: `${OUT}/weapon-${name}-2-switching.png`, timeout: 180000 });
    await p.evaluate(() => { document.querySelector('.gp-strip').style.opacity = ''; });
    ok(s && s.op > 0.3, `${name}: the strip shows while switching`);
    for (const k of ['minimap', 'hp', 'prompt', 'hud']) ok(!overlap(s, o[k]), `${name}: strip does not overlap ${k}`);
    ok(await p.evaluate(() => __city.gameplay.state.weapon === 'shotgun'), `${name}: key 3 selects the shotgun`);
    await p.waitForTimeout(2600);
    const s2 = await rect('.gp-strip');
    ok(!s2 || s2.op < 0.05, `${name}: the strip fades after about 1.5 s`);
  } else {
    const g = await rect('.gp-gun');
    ok(g, `${name}: one GUN button`);
    const before = await p.evaluate(() => __city.gameplay.state.weapon);
    await p.evaluate(({ x, y }) => { const e = document.querySelector('.gp-gun'); const mk = (t) => new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch', clientX: x, clientY: y }); e.dispatchEvent(mk('pointerdown')); e.dispatchEvent(mk('pointerup')); }, { x: g.x + 5, y: g.y + 5 }); // (a synthetic tap: a real one takes seconds on the software renderer)
    const s = await rect('.gp-strip');
    const after = await p.evaluate(() => __city.gameplay.state.weapon);
    ok(before !== after, `${name}: tap on GUN cycles (${before} -> ${after})`);
    await p.evaluate(() => { document.querySelector('.gp-strip').style.opacity = '1'; });
    await p.screenshot({ path: `${OUT}/weapon-${name}-2-switching.png`, timeout: 180000 });
    await p.evaluate(() => { document.querySelector('.gp-strip').style.opacity = ''; });
    ok(s && s.op > 0.3, `${name}: the strip shows after a tap`);
    for (const k of ['minimap', 'hp', 'prompt', 'hud']) ok(!overlap(s, o[k]), `${name}: strip does not overlap ${k}`);
    await p.waitForTimeout(2600);
    const s2 = await rect('.gp-strip');
    ok(!s2 || s2.op < 0.05, `${name}: the strip fades after about 1.5 s`);
    // long press: opens the strip and holds it, without cycling
    const b4 = await p.evaluate(() => __city.gameplay.state.weapon);
    await p.evaluate(({ x, y }) => { const e = document.querySelector('.gp-gun'); const mk = (t) => new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', clientX: x, clientY: y }); e.dispatchEvent(mk('pointerdown')); window.__lp = () => e.dispatchEvent(mk('pointerup')); }, { x: g.x + 5, y: g.y + 5 });
    const s3 = await p.evaluate(() => new Promise((r) => setTimeout(() => r({ op: document.querySelector('.gp-strip').classList.contains('show') ? 1 : 0 }), 700)));
    ok(s3 && s3.op > 0.3, `${name}: long-press opens the strip`);
    await p.evaluate(() => window.__lp());
    await p.waitForTimeout(300);
    ok((await p.evaluate(() => __city.gameplay.state.weapon)) === b4, `${name}: long-press does not cycle`);
    await p.screenshot({ path: `${OUT}/weapon-${name}-3-longpress.png`, timeout: 180000 });
  }
  ok(errs.length === 0, `${name}: no page errors ${errs.slice(0, 2)}`);
  await ctx.close();
}

(async () => {
  const b = await chromium.launch();
  await run(b, 'desktop', { width: 1280, height: 720 }, false);
  await run(b, 'phone', { width: 390, height: 844 }, true);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
