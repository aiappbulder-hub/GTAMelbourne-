// tools/voices/sync-lines.mjs: keeps data/character-voices.json in step with the story. It reads every spoken line from
// js/missions.js (cut scenes, timed lines, choices, outros, chapter cards) and js/intro.js (narration, Vince's call), adds
// the ones the voice data lacks (without a file: tools/voices/generate.py records them), and with --prune removes story
// lines nothing says any more (and their MP3s). Run from the repo root: node tools/voices/sync-lines.mjs [--prune]
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DATA = path.join(root, 'data/character-voices.json');
const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const slice = (file, from, to) => {
  const s = fs.readFileSync(path.join(root, 'melbourne3d/js', file), 'utf8');
  const a = s.indexOf(from), b = s.indexOf(to, a);
  return s.slice(a, b);
};
const evalArr = (src, name) => new Function('Math', src.replace(`const ${name} =`, 'return '))(Math);
const MISSIONS = evalArr(slice('missions.js', 'const MISSIONS = [', "const SAVE_KEY"), 'MISSIONS');
const SHOTS = evalArr(slice('intro.js', 'const SHOTS = [', '\nconst CSS'), 'SHOTS');

// who speaks → character in the voice data
const CHAR = { Vince: 'vince', 'Vince (phone)': 'vince', Kaz: 'kaz', Mick: 'mick', Davo: 'davo', You: 'player', '': 'player' };
const want = []; // { character, folder, text }
const add = (who, text, folder) => { if (text && CHAR[who] !== undefined) want.push({ character: CHAR[who], folder, text, phone: /phone/i.test(who) }); };
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
for (const m of MISSIONS) {
  const f = `dialogue/${slug(m.name)}`;
  for (const [who, text] of m.cut || []) add(who, text, f);
  if (m.outro) add(m.outro[0], m.outro[1], f);
  if (m.after?.line) add(m.after.line[0], m.after.line[1], f);
  for (const st of m.steps || []) {
    for (const [, who, text] of st.lines || []) add(who, text, f);
    const sm = /^(\w+): "(.*)"$/.exec(st.say || ''); if (sm) add(sm[1], sm[2].replace(/\\'/g, "'"), f); // 'Davo: "..."' on a step is spoken too
    if (st.choice) { add(st.choice.who, st.choice.text, f); for (const o of st.choice.options) add(st.choice.who, o.reply, f); }
  }
}
for (const sh of SHOTS) for (const [who, text] of sh.lines || []) add(who, text, 'dialogue/intro');

// the voice of a character that has none yet
if (!data.characters.davo) {
  data.characters.davo = { name: 'Davo', role: 'mission', crew: 'The Crossing', voice: { speaker: 'flynn', gender: 'male', temperature: 0.6, seed: 83 }, gain: 1, refDistance: 6, maxDistance: 60 };
}
const key = (t) => t.toLowerCase().replace(/[-–]/g, ' ').replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean).join(' ');
const have = new Map(data.lines.map((l) => [key(l.text), l]));
const used = new Set();
let added = 0;
const counters = {};
for (const w of want) {
  const k = key(w.text);
  used.add(k);
  if (have.has(k)) continue;
  const base = `${w.character}_${path.basename(w.folder)}`;
  counters[base] = (counters[base] || data.lines.filter((l) => l.id.startsWith(base + '_')).length) + 1;
  const line = { id: `${base}_${counters[base]}`, character: w.character, category: 'story', folder: w.folder, text: w.text };
  data.lines.push(line);
  have.set(k, line);
  added++;
}
let pruned = 0;
if (process.argv.includes('--prune')) {
  data.lines = data.lines.filter((l) => {
    if (l.category !== 'story' || used.has(key(l.text))) return true;
    if (l.file) { try { fs.unlinkSync(path.join(root, 'assets/audio', l.file)); } catch { /* already gone */ } }
    pruned++;
    return false;
  });
}
fs.writeFileSync(DATA, JSON.stringify(data, null, 2) + '\n');
const todo = data.lines.filter((l) => !l.file);
console.log(`lines wanted by the story: ${new Set(want.map((w) => key(w.text))).size}; added ${added}; pruned ${pruned}; to record: ${todo.length}`);
