// tools/melbourne/build-terrain.mjs: writes js/melbourne-terrain-data.js, a baked height grid for Melbourne's gentle real
// terrain, in metres above the river level (the old flat city's y = 0).
//
// Source: ~50 hand-authored spot heights (lat, lon, metres above the Yarra), interpolated smoothly (inverse distance),
// then pinned to 0 along the river and other water, the coast, every bridge's axis and the helipad, with the slope
// capped at MAX_SLOPE (the surface can only climb that steeply away from the pinned cells). No downloaded terrain tiles
// (they have the buildings baked in).
//
// usage: node tools/melbourne/build-terrain.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toWorld } from './osm.mjs';

const OUT = process.argv[2] || fileURLToPath(new URL('../../js/melbourne-terrain-data.js', import.meta.url));
const GEO_FILE = fileURLToPath(new URL('../../js/melbourne-geodata.js', import.meta.url));
const BRIDGES_FILE = fileURLToPath(new URL('../../js/bridges.js', import.meta.url));

const CELL = 25;
const X0 = -4600, Z0 = -2600, X1 = 2600, Z1 = 6200;
const NX = Math.round((X1 - X0) / CELL) + 1, NZ = Math.round((Z1 - Z0) / CELL) + 1;
const MAX_SLOPE = 0.08;
const UNIT = 0.25; // stored as quarter metres in a byte (0 .. 63.75 m)

// [lat, lon, height above the river (m), label]
const SPOTS = [
  [-37.8183, 144.9671, 3, 'Flinders St Station'],
  [-37.8180, 144.9690, 3, 'Federation Square'],
  [-37.8215, 144.9650, 1, 'Southbank promenade'],
  [-37.8155, 144.9665, 13, 'Swanston and Collins'],
  [-37.8137, 144.9667, 19, 'Swanston and Bourke'],
  [-37.8100, 144.9640, 26, 'State Library'],
  [-37.8105, 144.9628, 13, 'Elizabeth and La Trobe'],
  [-37.8175, 144.9640, 3, 'Elizabeth and Flinders'],
  [-37.8150, 144.9622, 8, 'Elizabeth and Collins'],
  [-37.8145, 144.9575, 25, 'William and Bourke'],
  [-37.8165, 144.9570, 20, 'William and Collins'],
  [-37.8183, 144.9525, 4, 'Southern Cross'],
  [-37.8150, 144.9450, 1, 'Docklands'],
  [-37.8165, 144.9475, 2, 'Docklands stadium'],
  [-37.8110, 144.9737, 28, 'Parliament'],
  [-37.8138, 144.9728, 26, 'Spring and Collins'],
  [-37.8135, 144.9760, 23, 'Treasury Gardens'],
  [-37.8130, 144.9810, 22, 'Fitzroy Gardens'],
  [-37.8110, 144.9540, 30, 'Flagstaff Gardens'],
  [-37.8076, 144.9568, 24, 'Queen Victoria Market'],
  [-37.8047, 144.9717, 30, 'Carlton Gardens'],
  [-37.8010, 144.9660, 36, 'Carlton'],
  [-37.7963, 144.9614, 38, 'Parkville'],
  [-37.7990, 144.9560, 38, 'Royal Melbourne Hospital'],
  [-37.8000, 144.9520, 42, 'Royal Park'],
  [-37.7990, 144.9780, 30, 'Fitzroy'],
  [-37.8035, 144.9885, 25, 'Collingwood'],
  [-37.8110, 144.9850, 25, 'East Melbourne'],
  [-37.8160, 144.9850, 12, 'Jolimont'],
  [-37.8200, 144.9835, 10, 'MCG'],
  [-37.8185, 144.9900, 25, 'Richmond hill'],
  [-37.8240, 144.9860, 6, 'Swan St Richmond'],
  [-37.8305, 144.9735, 25, 'Shrine and the Domain'],
  [-37.8305, 144.9800, 14, 'Botanic Gardens'],
  [-37.8225, 144.9720, 3, 'Alexandra Gardens'],
  [-37.8350, 144.9720, 22, 'St Kilda Rd and Domain Rd'],
  [-37.8380, 144.9850, 22, 'South Yarra'],
  [-37.8250, 144.9640, 2, 'Southbank'],
  [-37.8230, 144.9580, 2, 'Crown'],
  [-37.8330, 144.9550, 3, 'South Melbourne'],
  [-37.8310, 144.9680, 5, 'Kings Way'],
  [-37.8420, 144.9680, 3, 'Albert Park'],
  [-37.8400, 144.9400, 2, 'Port Melbourne'],
  [-37.8350, 144.9400, 2, 'Port Melbourne north'],
  [-37.8650, 144.9750, 1, 'St Kilda foreshore'],
  [-37.8630, 144.9800, 12, 'St Kilda hill'],
  [-37.8580, 144.9860, 10, 'St Kilda Junction'],
  [-37.8500, 144.9880, 18, 'Prahran'],
  [-37.8500, 144.9620, 4, 'Middle Park'],
  [-37.8100, 144.9450, 4, 'West Melbourne'],
  [-37.8000, 144.9480, 12, 'North Melbourne'],
  [-37.8050, 144.9400, 8, 'Kensington'],
  [-37.8080, 144.9350, 3, 'Footscray Dynon'],
  [-37.7990, 144.9400, 6, 'Racecourse Rd'],
  [-37.8225, 144.9890, 12, 'Yarra Park'],
  [-37.8260, 144.9440, 2, 'Fishermans Bend'],
  [-37.8470, 144.9480, 2, 'Beacon Cove']
].map(([lat, lon, h, name]) => { const [x, z] = toWorld(lon, lat); return { x, z, h, name }; });

// --- clamp inputs ----------------------------------------------------------------------------------------------------
const geoSrc = fs.readFileSync(GEO_FILE, 'utf8');
const GEO = JSON.parse(geoSrc.slice(geoSrc.indexOf('= {') + 2).replace(/;\s*$/, ''));
const bridgeSrc = fs.readFileSync(BRIDGES_FILE, 'utf8');
const BRIDGE_AXES = [...bridgeSrc.matchAll(/a: \[(-?[\d.]+), (-?[\d.]+)\], b: \[(-?[\d.]+), (-?[\d.]+)\], road: (\d+)/g)]
  .map((m) => ({ a: [+m[1], +m[2]], b: [+m[3], +m[4]], road: +m[5] }));
const HELIPAD = { x: -1196, z: 440, r: 40 };

const idx = (i, j) => j * NX + i;
const pinned = new Uint8Array(NX * NZ);
const cellAt = (x, z) => [Math.round((x - X0) / CELL), Math.round((z - Z0) / CELL)];
const pin = (x, z, r = 0) => {
  const [ci, cj] = cellAt(x, z), n = Math.ceil(r / CELL);
  for (let j = cj - n; j <= cj + n; j++) for (let i = ci - n; i <= ci + n; i++) {
    if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
    const dx = X0 + i * CELL - x, dz = Z0 + j * CELL - z;
    if (dx * dx + dz * dz <= (r + CELL * 0.75) ** 2) pinned[idx(i, j)] = 1;
  }
};
const inRing = (ring, x, z) => {
  let c = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
// the sea: outside the land outline (GEO.landOuter)
{
  const L = GEO.landOuter;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) if (!inRing(L, X0 + i * CELL, Z0 + j * CELL)) pinned[idx(i, j)] = 1;
  // and the shore itself
  for (let k = 0; k + 3 < L.length; k += 2) edge(L[k], L[k + 1], L[k + 2], L[k + 3], 12);
}
function edge(ax, az, bx, bz, r) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 10));
  for (let t = 0; t <= n; t++) pin(ax + ((bx - ax) * t) / n, az + ((bz - az) * t) / n, r);
}
// water bodies: inside, and along their outlines (a narrow creek can fall between cell centres)
for (const ring of GEO.waterOutlines) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let k = 0; k < ring.length; k += 2) { x0 = Math.min(x0, ring[k]); x1 = Math.max(x1, ring[k]); z0 = Math.min(z0, ring[k + 1]); z1 = Math.max(z1, ring[k + 1]); }
  const [i0, j0] = cellAt(x0, z0), [i1, j1] = cellAt(x1, z1);
  for (let j = Math.max(0, j0); j <= Math.min(NZ - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(NX - 1, i1); i++) {
    if (inRing(ring, X0 + i * CELL, Z0 + j * CELL)) pinned[idx(i, j)] = 1;
  }
  for (let k = 0; k + 3 < ring.length; k += 2) edge(ring[k], ring[k + 1], ring[k + 2], ring[k + 3], 12);
}
// bridges: the whole axis, a deck-and-footpath wide, and 60 m beyond each end so the roads meet the deck level
for (const b of BRIDGE_AXES) {
  const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  edge(b.a[0] - ux * 60, b.a[1] - uz * 60, b.b[0] + ux * 60, b.b[1] + uz * 60, b.road / 2 + 12);
}
pin(HELIPAD.x, HELIPAD.z, HELIPAD.r);
// the grid's own border: the terrain ends at 0, so nothing steps where the data stops
for (let i = 0; i < NX; i++) { pinned[idx(i, 0)] = 1; pinned[idx(i, NZ - 1)] = 1; }
for (let j = 0; j < NZ; j++) { pinned[idx(0, j)] = 1; pinned[idx(NX - 1, j)] = 1; }

// --- interpolate -----------------------------------------------------------------------------------------------------
let h = new Float32Array(NX * NZ);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const x = X0 + i * CELL, z = Z0 + j * CELL;
  let sw = 0, sh = 0;
  for (const s of SPOTS) {
    const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
    const w = 1 / (d2 + 200 * 200) ** 1.25;
    sw += w; sh += w * s.h;
  }
  h[idx(i, j)] = sh / sw;
}

// slope cap away from the pinned cells (a chamfer sweep: h <= neighbour + slope * distance), and light smoothing
const D = [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1], [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2]];
function capSlope() {
  for (let pass = 0; pass < 6; pass++) {
    const fwd = pass % 2 === 0;
    for (let jj = 0; jj < NZ; jj++) for (let ii = 0; ii < NX; ii++) {
      const i = fwd ? ii : NX - 1 - ii, j = fwd ? jj : NZ - 1 - jj, k = idx(i, j);
      if (pinned[k]) { h[k] = 0; continue; }
      let v = h[k];
      for (const [di, dj, c] of D) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
        v = Math.min(v, h[idx(a, b)] + MAX_SLOPE * 0.92 * CELL * c);
      }
      h[k] = v;
    }
  }
}
function blur() {
  const o = new Float32Array(h);
  for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) {
    const k = idx(i, j);
    if (pinned[k]) continue;
    let s = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) s += h[idx(i + a, j + b)] * (a === 0 && b === 0 ? 4 : a === 0 || b === 0 ? 2 : 1);
    o[k] = s / 16;
  }
  h = o;
}
capSlope();
blur(); blur(); blur();
capSlope();

// --- measure and write -----------------------------------------------------------------------------------------------
let maxH = 0, maxS = 0;
for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
  const k = idx(i, j);
  maxH = Math.max(maxH, h[k]);
  maxS = Math.max(maxS, Math.abs(h[k] - h[k + 1]) / CELL, Math.abs(h[k] - h[k + NX]) / CELL);
}
const bytes = Buffer.alloc(NX * NZ);
for (let k = 0; k < bytes.length; k++) bytes[k] = Math.max(0, Math.min(255, Math.round(h[k] / UNIT)));
const src = `// js/melbourne-terrain-data.js: GENERATED by tools/melbourne/build-terrain.mjs, do not edit by hand.
// Melbourne's terrain as a height grid in metres above the river level, in the world frame (x east along Collins St,
// z grid south): cell (i, j) is at (x0 + i * cell, z0 + j * cell); heights are bytes in units of \`unit\` metres, row by
// row (z), base64. Read it with js/terrain.js.
export const TERRAIN_DATA = ${JSON.stringify({ x0: X0, z0: Z0, cell: CELL, nx: NX, nz: NZ, unit: UNIT, data: bytes.toString('base64') })};
`;
fs.writeFileSync(OUT, src);
console.log(`terrain ${NX}x${NZ} cells of ${CELL} m, max ${maxH.toFixed(1)} m, steepest ${(maxS * 100).toFixed(1)}%, ${(src.length / 1024).toFixed(0)} KB, ${BRIDGE_AXES.length} bridge axes`);
