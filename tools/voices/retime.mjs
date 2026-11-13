// Re-times a speaker's recorded clips in place, pitch preserved: trims the silence at both ends, shortens long pauses,
// then speeds each clip up (atempo) to about TARGET words per second. Updates "duration" in data/character-voices.json.
// A clip is only ever processed once (it gets "retimed": true), so re-running is safe. Git has the originals.
//   node tools/voices/retime.mjs [character=player] [target=3.0]
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataPath = join(root, 'data', 'character-voices.json');
const [who = 'player', target = '3.0'] = process.argv.slice(2);
const TARGET = Number(target);
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const ff = (...a) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...a]);
const rows = [];
for (const l of data.lines) {
  if (l.character !== who || !l.file || l.retimed) continue;
  const f = join(root, 'assets', 'audio', l.file);
  const words = l.text.trim().split(/\s+/).length;
  const before = dur(f);
  const trimmed = f + '.trim.mp3', out = f + '.out.mp3';
  // leading silence off; pauses over 0.25 s cut to 0.12 s; trailing silence off
  ff('-i', f, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03:stop_periods=-1:stop_duration=0.25:stop_threshold=-45dB:stop_silence=0.12',
    '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', trimmed);
  const d1 = dur(trimmed);
  const tempo = Math.min(1.5, Math.max(1, d1 * TARGET / words));
  ff('-i', trimmed, '-filter:a', `atempo=${tempo.toFixed(3)}`, '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', out);
  renameSync(out, f);
  execFileSync('rm', ['-f', trimmed]);
  l.duration = Math.round(dur(f) * 100) / 100;
  l.retimed = true;
  rows.push({ id: l.id, words, before, trimmed: d1, tempo, after: l.duration, wpsBefore: words / before, wpsAfter: words / l.duration });
}
writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');
console.table(rows.map((r) => ({ ...r, before: r.before.toFixed(2), trimmed: r.trimmed.toFixed(2), tempo: r.tempo.toFixed(2), wpsBefore: r.wpsBefore.toFixed(2), wpsAfter: r.wpsAfter.toFixed(2) })));
const sum = (k) => rows.reduce((n, r) => n + r[k], 0), w = sum('words');
console.log(`${who}: ${rows.length} clips, ${w} words; ${(w / sum('before')).toFixed(2)} -> ${(w / sum('after')).toFixed(2)} words/s (overall); ${sum('before').toFixed(1)}s -> ${sum('after').toFixed(1)}s`);
