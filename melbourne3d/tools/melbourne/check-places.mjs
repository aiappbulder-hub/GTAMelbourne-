// tools/melbourne/check-places.mjs: every story place (js/story/places.js) must be on the playable map: inside
// GEO.bounds, at least 60 m from its edge, and not on water (unless marked onWater, like the end of St Kilda Pier).
// Prints each place's district. Exits 1 on any failure. Run: node tools/melbourne/check-places.mjs
import { readFile } from 'node:fs/promises';
// the building data loads with fetch(); give node a file: fetch so it can be read here
const realFetch = globalThis.fetch;
globalThis.fetch = (u, ...a) => String(u).startsWith('file:') ? readFile(new URL(u)).then((b) => new Response(b)) : realFetch(u, ...a);
const { GEO } = await import('../../js/melbourne-geodata.js');
import { inWater, districtAt } from '../../js/melbourne-config.js';
import { PLACES } from '../../js/story/places.js';
import { polygonContains } from '../../js/building-collision.js';
const { REAL_BUILDINGS } = await import('../../js/city-buildings.js');

const B = GEO.bounds;
const poly = [[B[0], B[1]], [B[2], B[3]], [B[4], B[5]], [B[6], B[7]]];
function inside(x, z) {
  let c = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function edgeDist(x, z) {
  let m = Infinity;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    m = Math.min(m, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return m;
}
// buildings a place may sit inside on purpose (interiors, landmarks, stadiums): inside:true on the place, or a y (interior floor)
function buildingAt(x, z) {
  for (const b of REAL_BUILDINGS) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (b.polygons.some((poly) => polygonContains(poly, x, z))) return b;
  }
  return null;
}
let bad = 0;
for (const [id, p] of Object.entries(PLACES)) {
  const problems = [];
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) problems.push('no coordinates');
  else {
    if (!inside(p.x, p.z)) problems.push('outside the map');
    else if (edgeDist(p.x, p.z) < 60) problems.push(`${Math.round(edgeDist(p.x, p.z))} m from the map edge`);
    if (inWater(p.x, p.z) && !p.onWater) problems.push('on water');
    if (p.y === undefined && !p.inBuilding && buildingAt(p.x, p.z)) problems.push('inside a building');
  }
  if (problems.length) bad++;
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${id.padEnd(15)} ${String(districtAt(p.x, p.z)).padEnd(16)} ${p.label}${problems.length ? '  <- ' + problems.join(', ') : ''}`);
}
console.log(bad ? `${bad} place(s) failed` : `all ${Object.keys(PLACES).length} places on the map`);
process.exit(bad ? 1 : 0);
