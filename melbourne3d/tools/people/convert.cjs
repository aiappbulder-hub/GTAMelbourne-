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
// The story set (js/people.js loads it after the basics): moods for talking and listening, gestures and idles
const STORY = {
  m: { talk_angry: 'm_gestic_talk_angry_01', talk_excited: 'm_gestic_talk_excited_01', talk_assured: 'm_gestic_talk_self_assured_01',
    talk_cool: 'm_gestic_talk_cool', talk_nervous: 'm_gestic_talk_nervous_01', listen: 'm_gestic_listen_neutral_01',
    nod: 'm_gestic_listen_accept_01', deny: 'm_gestic_listen_deny_01', listen_angry: 'm_gestic_listen_angry_01', shrug: 'm_gestic_shrug_01',
    laugh: 'm_gestic_laugh_low', thoughtful: 'm_gestic_thoughtful_01', wave: 'm_wave_01', cheer: 'm_cheer_01', wait: 'm_idle_waiting_01',
    look: 'm_idle_look_around_01', text: 'm_cell_phone_textmessage', angry_idle: 'm_idle_angry_01', nervous_idle: 'm_idle_nervous_01' },
  f: { talk_angry: 'f_gestic_talk_angry_01', talk_excited: 'f_gestic_talk_excited_01', talk_assured: 'f_gestic_talk_self-assured_01',
    talk_cool: 'f_gestic_talk_cool', talk_nervous: 'f_gestic_talk_nervous_01', listen: 'f_gestic_listen_neutral_01',
    nod: 'f_gestic_listen_accept_01', deny: 'f_gestic_listen_deny_01', listen_angry: 'f_gestic_listen_angry_01', shrug: 'f_gestic_shrug_01',
    laugh: 'f_gestic_laugh_low', thoughtful: 'f_gestic_thoughtful_01', wave: 'f_wave_01', cheer: 'f_cheer_01', wait: 'f_idle_waiting_01',
    look: 'f_idle_look_around_01', text: 'f_cell_phone_textmessage', angry_idle: 'f_idle_angry_01', nervous_idle: 'f_idle_nervous_01' }
};
const SET = process.env.SET === 'story' ? STORY : CLIPS;
const PREFIX = process.env.SET === 'story' ? 'story' : 'clips';
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
      for (const [key, file] of Object.entries(SET[sex])) {
        const gait = ['walk', 'run', 'sprint'].includes(key);
        const r = await p.evaluate(([u, k, g, f]) => window.convertClip(u, k, g, f), [`${rel}/anims/${file}.fbx`, key, gait, process.env.SET === 'story' ? 10 : 0]);
        clips.push(JSON.parse(r.json));
        if (gait) speeds[key] = Math.round(r.speed * 100) / 100;
        console.log(sex, key, r.duration.toFixed(2) + 's', gait ? r.speed.toFixed(2) + ' m/s' : '');
      }
      fs.writeFileSync(path.join(out, `${PREFIX}-${sex}.json`), JSON.stringify({ speeds, clips }));
    }
  }
  await b.close();
})();
