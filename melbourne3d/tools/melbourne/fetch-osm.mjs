// tools/melbourne/fetch-osm.mjs: downloads the OpenStreetMap data for the Melbourne build from the OSM editing API
// (api.openstreetmap.org/api/0.6/map.json), one small tile at a time, into tools/data/osm-tiles/. Tiles already on
// disk are kept, so the script can be stopped and run again. A tile the API refuses as too big (HTTP 400, over 50,000
// nodes) is split into four.
//
// usage: node tools/melbourne/fetch-osm.mjs [west south east north]
//
// The default box covers the Hoddle Grid, Southbank, Docklands, South Melbourne, Albert Park and its lake, the edges of
// Carlton, East Melbourne and Middle Park, and the Yarra from Docklands to Richmond. Data © OpenStreetMap contributors (ODbL).
// Please keep to the API's usage policy: the script waits a second between requests and caches everything.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../data/osm-tiles/', import.meta.url));
const BOX = process.argv.length >= 6 ? process.argv.slice(2, 6).map(Number) : [144.935, -37.867, 144.990, -37.800];
const STEP = 0.005;
const UA = 'GTAMelbourne-mapbuild/1.0 (github.com/aiappbulder-hub/GTAMelbourne-)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(DIR, { recursive: true });

const f = (v) => v.toFixed(5);
async function fetchTile(w, s, e, n, depth = 0) {
  const file = path.join(DIR, `${f(w)}_${f(s)}_${f(e)}_${f(n)}.json`);
  if (fs.existsSync(file)) return;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${f(w)},${f(s)},${f(e)},${f(n)}`;
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA } });
    } catch (err) {
      console.log(`  network error (${err.message}), retry ${attempt}`);
      await sleep(2000 * attempt);
      continue;
    }
    if (res.status === 400 && depth < 4) {
      console.log(`  ${file} too big, splitting`);
      const mx = (w + e) / 2, my = (s + n) / 2;
      for (const [a, b, c, d] of [[w, s, mx, my], [mx, s, e, my], [w, my, mx, n], [mx, my, e, n]]) await fetchTile(a, b, c, d, depth + 1);
      return;
    }
    if (res.status === 509 || res.status === 429 || res.status >= 500) {
      console.log(`  HTTP ${res.status}, waiting`);
      await sleep(10000 * attempt);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const text = await res.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data.elements)) throw new Error(`no elements in ${url}`);
    fs.writeFileSync(file, text);
    console.log(`  ${path.basename(file)}: ${data.elements.length} elements, ${(text.length / 1e6).toFixed(1)} MB`);
    await sleep(1000);
    return;
  }
  throw new Error(`gave up on tile ${w},${s},${e},${n}`);
}

const [W, S, E, N] = BOX;
const tiles = [];
for (let s = S; s < N - 1e-9; s += STEP) for (let w = W; w < E - 1e-9; w += STEP) tiles.push([w, s, Math.min(w + STEP, E), Math.min(s + STEP, N)]);
console.log(`[osm] ${tiles.length} tiles over ${BOX.join(', ')}`);
let i = 0;
for (const t of tiles) {
  i++;
  if (i % 10 === 0) console.log(`[osm] ${i}/${tiles.length}`);
  await fetchTile(...t);
}
console.log('[osm] done');
