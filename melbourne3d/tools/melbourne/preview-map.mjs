// tools/melbourne/preview-map.mjs: draws js/melbourne-geodata.js (and the buildings) to an SVG for checking a build.
// usage: node tools/melbourne/preview-map.mjs out.svg [x0 z0 x1 z1]
import fs from 'node:fs';
globalThis.fetch = async (u) => new Response(fs.readFileSync(new URL(u)));
const { GEO } = await import('../../js/melbourne-geodata.js');
const { REAL_BUILDINGS } = await import('../../js/melbourne-building-geodata.js');
const [out = 'map.svg', ...v] = process.argv.slice(2);
const [X0, Z0, X1, Z1] = v.length === 4 ? v.map(Number) : [GEO.frame.minX, GEO.frame.minZ, GEO.frame.maxX, GEO.frame.maxZ];
const S = 2000 / (X1 - X0);
const P = (f) => { let s = ''; for (let i = 0; i < f.length; i += 2) s += `${i ? 'L' : 'M'}${((f[i] - X0) * S).toFixed(1)},${((f[i + 1] - Z0) * S).toFixed(1)}`; return s; };
const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="${Math.round((Z1 - Z0) * S)}" style="background:#ddd">`];
parts.push(`<path d="${P(GEO.bounds)}Z" fill="#cfcfcf" stroke="#999"/>`);
for (const y of GEO.railYards) parts.push(`<path d="${P(y.ring)}Z" fill="#c9b9a6"/>`);
for (const b of GEO.blocks) parts.push(`<path d="${P(b[0])}Z" fill="${b[2] > 0.5 ? '#9c6' : b[4] ? '#f5e9c8' : '#eee'}" stroke="#777" stroke-width="0.6"/>`);
for (const b of GEO.blocks) {
  for (const r of b[1]) if (!b[5]) parts.push(`<rect x="${(r[0] - X0) * S}" y="${(r[2] - Z0) * S}" width="${(r[1] - r[0]) * S}" height="${(r[3] - r[2]) * S}" fill="none" stroke="#c96" stroke-width="0.5"/>`);
}
for (const w of GEO.water) parts.push(`<path d="${w.rings.map((r) => P(r) + 'Z').join('')}" fill="#6ad" fill-rule="evenodd"/>`);
for (const b of REAL_BUILDINGS) for (const p of b.polygons) {
  const f = p.outer.flatMap((q) => [q.x, q.z]);
  const g = Math.max(0, 200 - b.height * 1.2);
  parts.push(`<path d="${P(f)}Z" fill="rgb(${g},${g},${g + 30})" fill-opacity="0.55"/>`);
}
for (const r of GEO.roads) parts.push(`<path d="${P(r[5])}" fill="none" stroke="${r[4] ? '#e80' : '#c33'}" stroke-width="${Math.max(0.6, r[1] * S * 0.15)}"/>`);
for (const s of GEO.grid.streets) parts.push(`<path d="${P([GEO.grid.extent.minX, s.at, GEO.grid.extent.maxX, s.at])}" stroke="#00f" stroke-width="1" stroke-dasharray="4 4"/>`);
for (const s of GEO.grid.avenues) parts.push(`<path d="${P([s.at, GEO.grid.extent.minZ, s.at, GEO.grid.extent.maxZ])}" stroke="#00f" stroke-width="1" stroke-dasharray="4 4"/>`);
for (const [n, l] of Object.entries(GEO.landmarks)) parts.push(`<text x="${(l.x - X0) * S}" y="${(l.z - Z0) * S}" font-size="11" font-family="sans-serif" fill="#000">${n}</text>`);
parts.push('</svg>');
fs.writeFileSync(out, parts.join('\n'));
console.log('wrote', out);
