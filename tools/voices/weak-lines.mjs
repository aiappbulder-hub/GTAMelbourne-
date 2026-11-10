// tools/voices/weak-lines.mjs: lists (or drops) recorded lines whose take did not match the script.
//   node tools/voices/weak-lines.mjs [--below 0.85]            print the ids, comma separated, for generate.py --only ... --force
//   node tools/voices/weak-lines.mjs --below 0.75 --drop       remove the recording (file and MP3) of every line under 0.75,
//                                                               so the game speaks it with the browser voice instead of playing
//                                                               a take that says the wrong words
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DATA = path.join(root, 'data/character-voices.json');
const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const i = process.argv.indexOf('--below');
const below = i > 0 ? parseFloat(process.argv[i + 1]) : 0.85;
const weak = data.lines.filter((l) => l.file && l.check && l.check.score < below);
if (process.argv.includes('--drop')) {
  for (const l of weak) {
    try { fs.unlinkSync(path.join(root, 'assets/audio', l.file)); } catch { /* already gone */ }
    delete l.file; delete l.duration; delete l.check;
  }
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2) + '\n');
  console.error(`dropped ${weak.length} recordings under ${below}`);
} else {
  console.log(weak.map((l) => l.id).join(','));
  console.error(`${weak.length} recorded lines under ${below}`);
}
