// tools/melbourne/find-bridges.mjs: find where the road centrelines (ROADS) cross the Yarra's water (GEO.water), the
// stretches js/bridges.js has to build decks over. Walks every road polyline in 1 m steps, keeps the runs that lie over
// water inside the river's reach (x -2000..1700, z 200..1700), and prints each crossing: the road's name, the two bank
// points (where the centreline leaves the land), its length, width and heading. Runs on one road that touch the same
// water run are one crossing (GEO.roads splits roads at every graph node); parallel carriageways of the same bridge
// are listed separately. Roads with a gap in the data over the river (King St / Kings Way, the eastern carriageway of
// Charles Grimes Bridge) don't show up: see js/bridges.js.
// Run: node tools/melbourne/find-bridges.mjs [--json]
import { ROADS, inWater } from '../../js/melbourne-config.js';

const REACH = process.argv.includes("--all") ? { minX: -1e5, maxX: 1e5, minZ: -1e5, maxZ: 1e5 } : { minX: -2000, maxX: 1700, minZ: 200, maxZ: 1700 };
const STEP = 1;
const MIN_LEN = 6; // shorter wet runs are kerb wiggles along a quay, not crossings

const crossings = [];
for (const r of ROADS) {
  // the polyline resampled every metre, remembering whether each sample is wet
  const s = [];
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i], b = r.pts[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(L / STEP));
    for (let k = 0; k < n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      s.push({ x, z, wet: inWater(x, z) });
    }
  }
  const last = r.pts[r.pts.length - 1];
  s.push({ x: last.x, z: last.z, wet: inWater(last.x, last.z) });
  for (let i = 0; i < s.length; i++) {
    if (!s[i].wet) continue;
    let j = i;
    while (j + 1 < s.length && s[j + 1].wet) j++;
    const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, j + 1)];
    const mid = s[(i + j) >> 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const inReach = mid.x > REACH.minX && mid.x < REACH.maxX && mid.z > REACH.minZ && mid.z < REACH.maxZ;
    // a run that starts or ends the polyline over water has only one bank in this road: still report it
    if (len >= MIN_LEN && inReach) {
      crossings.push({
        name: r.name, raw: r.raw, w: r.w, lanes: r.lanes,
        a: { x: +a.x.toFixed(1), z: +a.z.toFixed(1) }, b: { x: +b.x.toFixed(1), z: +b.z.toFixed(1) },
        len: +len.toFixed(1),
        heading: +((Math.atan2(b.x - a.x, b.z - a.z) * 180) / Math.PI).toFixed(1),
        openEnded: i === 0 || j === s.length - 1
      });
    }
    i = j;
  }
}
// GEO.roads splits a road at every graph node, so one crossing can come as several wet runs that end over the water:
// join runs of the same road whose ends meet, so each carriageway's crossing is one bank-to-bank stretch
for (let joined = true; joined;) {
  joined = false;
  for (const p of crossings) {
    const q = crossings.find((c) => c !== p && c.raw === p.raw && Math.hypot(c.a.x - p.b.x, c.a.z - p.b.z) < 2);
    if (!q) continue;
    p.b = q.b;
    p.len = +(p.len + q.len).toFixed(1);
    p.heading = +((Math.atan2(p.b.x - p.a.x, p.b.z - p.a.z) * 180) / Math.PI).toFixed(1);
    p.openEnded = p.openEnded && q.openEnded;
    crossings.splice(crossings.indexOf(q), 1);
    joined = true;
    break;
  }
}
crossings.sort((p, q) => (p.a.x + p.b.x) - (q.a.x + q.b.x));
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(crossings, null, 1));
} else {
  for (const c of crossings) {
    console.log(`${(c.raw || c.name).padEnd(34)} ${String(c.len).padStart(6)} m  w ${String(c.w).padStart(4)}  ` +
      `(${c.a.x}, ${c.a.z}) -> (${c.b.x}, ${c.b.z})  hdg ${c.heading}`);
  }
  console.log(`${crossings.length} crossings (one line per carriageway)`);
}
