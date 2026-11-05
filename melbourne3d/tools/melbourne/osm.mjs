// tools/melbourne/osm.mjs: the Melbourne world frame, and the OSM tiles from fetch-osm.mjs merged into one data set.
//
// Frame (the same convention as Slop New York's js/nyc-geodata.js): 1 unit = 1 m, x = grid east (along Collins St),
// z = grid south (towards the Yarra), north = -z. The origin is the centreline intersection of Swanston St and
// Collins St. The axes are turned to the Hoddle Grid: its streets run about 20 degrees anticlockwise of true east, so
// the grid's north lies west of true north and frame.bearingDeg is negative. BEARING_DEG is measured from the OSM
// centrelines of Collins, Bourke, Swanston and Elizabeth Streets (run this file to print the fit).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA = process.env.GEO_DATA || fileURLToPath(new URL('../data/', import.meta.url));
export const log = (...a) => console.log('[melbourne]', ...a);

export const LAT0 = -37.815488;
export const LON0 = 144.966545;
export let BEARING_DEG = -19.18; // grid north, degrees east of true north (measureGrid() prints the fit)

const A = 6378137.0, E2 = 6.69437999014e-3;
const PHI0 = (LAT0 * Math.PI) / 180, SIN0 = Math.sin(PHI0);
const KX = (Math.PI / 180) * (A / Math.sqrt(1 - E2 * SIN0 * SIN0)) * Math.cos(PHI0);
const KY = (Math.PI / 180) * ((A * (1 - E2)) / Math.pow(1 - E2 * SIN0 * SIN0, 1.5));
export const enu = (lon, lat) => [(lon - LON0) * KX, (lat - LAT0) * KY];
export function toWorld(lon, lat) {
  const [e, n] = enu(lon, lat);
  const t = (BEARING_DEG * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return [e * c - n * s, -(e * s + n * c)];
}
export function toLonLat(x, z) {
  const t = (BEARING_DEG * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const e = x * c - z * s, n = -(x * s + z * c);
  return [LON0 + e / KX, LAT0 + n / KY];
}

// --- OSM tiles -> { nodes: Map id -> [lon, lat], ways: Map id -> way, relations: Map id -> relation } -------------
let cache = null;
export function loadOSM() {
  if (cache) return cache;
  const dir = path.join(DATA, 'osm-tiles');
  const nodes = new Map(), ways = new Map(), relations = new Map(), treeNodes = new Map();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    const { elements } = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const e of elements) {
      if (e.type === 'node') {
        nodes.set(e.id, [e.lon, e.lat]);
        if (e.tags) treeNodes.set(e.id, e);
      } else if (e.type === 'way') ways.set(e.id, e);
      else if (e.type === 'relation') relations.set(e.id, e);
    }
  }
  log(`${files.length} tiles: ${nodes.size} nodes, ${ways.size} ways, ${relations.size} relations`);
  cache = { nodes, ways, relations, taggedNodes: treeNodes };
  return cache;
}
// A way's points in the world frame (missing nodes dropped)
export function wayPts(way, nodes) {
  const out = [];
  for (const id of way.nodes) {
    const ll = nodes.get(id);
    if (ll) out.push(toWorld(ll[0], ll[1]));
  }
  return out;
}
// A multipolygon relation's outer and inner rings, with member ways chained end to end
export function relationRings(rel, ways, nodes) {
  const chain = (role) => {
    const parts = rel.members.filter((m) => m.type === 'way' && m.role === role && ways.has(m.ref)).map((m) => ways.get(m.ref).nodes.slice());
    const rings = [];
    while (parts.length) {
      let ring = parts.shift();
      for (let guard = 0; guard < 1000 && ring[0] !== ring[ring.length - 1]; guard++) {
        const end = ring[ring.length - 1];
        const i = parts.findIndex((p) => p[0] === end || p[p.length - 1] === end);
        if (i < 0) break;
        const p = parts.splice(i, 1)[0];
        ring = ring.concat(p[0] === end ? p.slice(1) : p.reverse().slice(1));
      }
      if (ring[0] === ring[ring.length - 1] && ring.length >= 4) rings.push(wayPts({ nodes: ring }, nodes));
    }
    return rings;
  };
  return { outer: chain('outer'), inner: chain('inner') };
}

// --- Measure the Hoddle Grid's bearing from its street centrelines --------------------------------------------------
export function measureGrid() {
  const { nodes, ways } = loadOSM();
  const EW = new Set(['Collins Street', 'Bourke Street', 'Flinders Street', 'Lonsdale Street', 'La Trobe Street']);
  const NS = new Set(['Swanston Street', 'Elizabeth Street', 'William Street', 'Queen Street', 'Russell Street', 'Exhibition Street', 'King Street']);
  // Length-weighted mean of the doubled angle of each segment (EW as-is, NS turned by 90 degrees)
  let sx = 0, sy = 0;
  for (const w of ways.values()) {
    const t = w.tags || {};
    if (!t.highway || !(EW.has(t.name) || NS.has(t.name))) continue;
    for (let i = 0; i + 1 < w.nodes.length; i++) {
      const a = nodes.get(w.nodes[i]), b = nodes.get(w.nodes[i + 1]);
      if (!a || !b) continue;
      const [e0, n0] = enu(...a), [e1, n1] = enu(...b);
      const ex = e1 - e0, ny = n1 - n0, L = Math.hypot(ex, ny);
      if (L < 5) continue;
      let ang = Math.atan2(ny, ex); // anticlockwise from east
      if (NS.has(t.name)) ang -= Math.PI / 2;
      sx += L * Math.cos(4 * ang); sy += L * Math.sin(4 * ang); // 4x: 90-degree symmetric
    }
  }
  const gridAng = Math.atan2(sy, sx) / 4; // grid east, radians anticlockwise from true east
  return (-gridAng * 180) / Math.PI; // grid north, degrees east of true north
}

if (process.argv[1] && process.argv[1].endsWith('osm.mjs')) {
  log(`Hoddle Grid bearing: ${measureGrid().toFixed(2)} degrees (BEARING_DEG = ${BEARING_DEG})`);
  const { nodes, ways } = loadOSM();
  // Where Swanston and Collins cross: shared nodes
  const ids = (name) => new Set([...ways.values()].filter((w) => w.tags && w.tags.highway && w.tags.name === name).flatMap((w) => w.nodes));
  const sw = ids('Swanston Street'), co = ids('Collins Street');
  for (const id of sw) if (co.has(id)) log(`Swanston x Collins node ${id}: ${nodes.get(id)} -> ${toWorld(...nodes.get(id)).map((v) => v.toFixed(1))}`);
}
