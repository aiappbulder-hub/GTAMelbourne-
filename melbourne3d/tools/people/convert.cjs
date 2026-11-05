// node tools/people/convert.cjs <work dir> <out dir> avatars...  (Rocketbox avatar folders under <work>/src/<name>,
// clips under <work>/anims). Needs a static server on the repository root at 8766 and Playwright's Chromium.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [work, out, ...names] = process.argv.slice(2);
const CLIPS = {
  m: { idle: 'm_idle_neutral_01', walk: 'm_walk_neutral_01', run: 'm_run_neutral_01', sprint: 'm_run_fast_01', talk: 'm_gestic_talk_neutral_01', phone: 'm_cell_phone_talk_01', crouch: 'm_crouch_idle' },
  f: { idle: 'f_idle_neutral_01', walk: 'f_walk_neutral_01', run: 'f_run_neutral_01', sprint: 'f_run_fast_01', talk: 'f_gestic_talk_neutral_01', phone: 'f_cell_phone_talk_01', crouch: 'f_crouch_idle' }
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto('http://localhost:8766/melbourne3d/tools/people/convert.html');
  await p.waitForFunction(() => document.title === 'ready');
  const rel = path.relative(path.resolve(__dirname), path.resolve(work)).split(path.sep).join('/');
  for (const n of names) {
    const r = await p.evaluate(([d, nm]) => window.convertAvatar(d, nm), [`${rel}/src/${n}`, n]);
    fs.writeFileSync(path.join(out, `${n}.glb`), Buffer.from(r.b64, 'base64'));
    console.log(n, r.verts, 'vertices', (fs.statSync(path.join(out, `${n}.glb`)).size / 1e6).toFixed(2), 'MB');
  }
  if (process.env.CLIPS !== '0') {
    for (const sex of ['m', 'f']) {
      const clips = [], speeds = {};
      for (const [key, file] of Object.entries(CLIPS[sex])) {
        const gait = ['walk', 'run', 'sprint'].includes(key);
        const r = await p.evaluate(([u, k, g]) => window.convertClip(u, k, g), [`${rel}/anims/${file}.fbx`, key, gait]);
        clips.push(JSON.parse(r.json));
        if (gait) speeds[key] = Math.round(r.speed * 100) / 100;
        console.log(sex, key, r.duration.toFixed(2) + 's', gait ? r.speed.toFixed(2) + ' m/s' : '');
      }
      fs.writeFileSync(path.join(out, `clips-${sex}.json`), JSON.stringify({ speeds, clips }));
    }
  }
  await b.close();
})();
