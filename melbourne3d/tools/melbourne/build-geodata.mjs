// tools/melbourne/build-geodata.mjs: writes js/melbourne-geodata.js, Melbourne's geography in the engine's world frame
// (tools/melbourne/osm.mjs), in the shape of js/nyc-geodata.js wherever the engine reads it generically:
//
//   frame      bearing, origin, extent, sidewalk width
//   bounds     the map's edge: the fetched box, as a ring
//   water      the Yarra, Victoria Harbour, Moonee Ponds Creek, lakes and ponds: [{ name, kind, rings: [outer, ...holes] }]
//   grid       the Hoddle Grid: its main streets (x or z of the centreline, extent) and little streets
//   roads      every drivable street as [name, kerb-to-kerb width, dir, lanes, highway?, flat pts] (NYC layout)
//   roadGraph  the drivable network as a graph (NYC layout): nodes [x, z, ...], links [a, b, name index, width, lanes,
//              dir (1: a -> b, -1: b -> a, 0: both), inner shape points], names
//   blocks     kerb-to-kerb islands with lot rects and frontage frames (NYC layout, built the way tools/geo-blocks.mjs
//              builds Manhattan's: roads stamped at their width onto a 1 m land raster, the islands left over labelled)
//   parks      [{ name, cat, rings }]
//   railYards  the railway lands (Flinders Street, Southern Cross and Jolimont yards), kept clear of blocks
//   landmarks  named footprints for the landmark builders: { name: { x, z, w, d, h, area, ring } }
//
// usage: node --max-old-space-size=8192 tools/melbourne/build-geodata.mjs   (after tools/melbourne/fetch-osm.mjs)
// Data © OpenStreetMap contributors (ODbL).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadOSM, wayPts, relationRings, toWorld, log, BEARING_DEG, LAT0, LON0 } from './osm.mjs';
import { ringArea, bbox, rdp, rdpRing, Raster } from '../geo-geometry.mjs';
import { makeBlocks } from './blocks.mjs';

const OUT = process.argv[2] || fileURLToPath(new URL('../../js/melbourne-geodata.js', import.meta.url));
const BOX = [144.935, -37.832, 144.990, -37.800]; // fetch-osm.mjs's default box
const EDGE = 60; // metres in from the box edge: no blocks beyond (tile-edge data is incomplete)
const SIDEWALK = 4.6;
const q = (v) => Math.round(v * 10) / 10;
const flat = (pts) => pts.flatMap(([x, z]) => [q(x), q(z)]);
const { nodes, ways, relations } = loadOSM();

// --- Bounds ------------------------------------------------------------------------------------------------------------
const [W, S, E, N] = BOX;
const bounds = [toWorld(W, N), toWorld(E, N), toWorld(E, S), toWorld(W, S)];
// the inner extent where blocks are built: the box shrunk by EDGE (it is a rotated rectangle in the frame)
const insideBox = (() => {
  const c = bounds.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
  const ring = bounds.map(([x, z]) => {
    const dx = x - c[0], dz = z - c[1], L = Math.hypot(dx, dz);
    return [x - (dx / L) * EDGE * Math.SQRT2, z - (dz / L) * EDGE * Math.SQRT2];
  });
  return ring;
})();

// --- Water ---------------------------------------------------------------------------------------------------------------
const isWater = (t) => t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin';
const water = [];
const inWaterRel = new Set();
for (const r of relations.values()) {
  const t = r.tags || {};
  if (t.type !== 'multipolygon' || !isWater(t)) continue;
  for (const m of r.members) inWaterRel.add(m.ref);
  const { outer, inner } = relationRings(r, ways, nodes);
  for (const o of outer) {
    const holes = inner.filter((h) => pointInRing(h[0], o));
    water.push({ name: t.name || (t.water === 'river' ? 'Yarra River' : ''), kind: t.water || 'water', rings: [o, ...holes] });
  }
}
for (const w of ways.values()) {
  const t = w.tags || {};
  if (!isWater(t) || inWaterRel.has(w.id) || w.nodes[0] !== w.nodes[w.nodes.length - 1]) continue;
  const p = wayPts(w, nodes);
  if (Math.abs(ringArea(p)) < 40) continue;
  water.push({ name: t.name || '', kind: t.water || 'water', rings: [p] });
}
// The Yarra and Victoria Harbour pieces carry no names: name them by where they lie
for (const wt of water) {
  if (wt.name) continue;
  const b = bbox(wt.rings[0]);
  if (wt.kind === 'river' && b.x1 < -1700) wt.name = 'Victoria Harbour';
  else if (wt.kind === 'river') wt.name = 'Yarra River';
}
log(`water: ${water.length} bodies (${water.filter((w) => w.kind === 'river').length} river pieces)`);

function pointInRing([x, z], r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const ringsOf = (e) => {
  if (e.type === 'way') return e.nodes[0] === e.nodes[e.nodes.length - 1] ? [wayPts(e, nodes)] : [];
  return relationRings(e, ways, nodes).outer;
};

// --- Railway lands -------------------------------------------------------------------------------------------------------
const railYards = [];
for (const e of [...ways.values(), ...relations.values()]) {
  const t = e.tags || {};
  if (t.landuse !== 'railway' || (e.type === 'relation' && t.type !== 'multipolygon')) continue;
  for (const r of ringsOf(e)) if (Math.abs(ringArea(r)) > 2000) railYards.push({ name: t.name || '', ring: r });
}
log(`rail yards: ${railYards.length}`);

// --- Hoddle Grid ---------------------------------------------------------------------------------------------------------
// Main streets (30 m road reserves, 1 chain = 20.1 m kerb to kerb) and the little streets between them. Each line's
// position is the length-weighted median of its OSM centreline pieces (dual carriageways average out).
const GRID_EW = ['Flinders Street', 'Collins Street', 'Bourke Street', 'Lonsdale Street', 'La Trobe Street'];
const GRID_NS = ['Spencer Street', 'King Street', 'William Street', 'Queen Street', 'Elizabeth Street', 'Swanston Street', 'Russell Street', 'Exhibition Street', 'Spring Street'];
const LITTLE_EW = ['Flinders Lane', 'Little Collins Street', 'Little Bourke Street', 'Little Lonsdale Street'];
const wmedian = (vals) => {
  vals.sort((a, b) => a[0] - b[0]);
  const tot = vals.reduce((t, v) => t + v[1], 0);
  let acc = 0;
  for (const [v, w] of vals) { acc += w; if (acc >= tot / 2) return v; }
  return NaN;
};
function gridLine(name, axis) {
  // axis 'z': an east-west street (z constant); 'x': a north-south one
  const vals = [], span = [];
  for (const w of ways.values()) {
    const t = w.tags || {};
    if (!t.highway || t.name !== name || /footway|steps|corridor|cycleway|path/.test(t.highway)) continue;
    const p = wayPts(w, nodes);
    for (let i = 0; i + 1 < p.length; i++) {
      const [x0, z0] = p[i], [x1, z1] = p[i + 1];
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 2) continue;
      const along = axis === 'z' ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
      if (along / L < 0.97) continue; // grid-aligned pieces only
      vals.push([axis === 'z' ? (z0 + z1) / 2 : (x0 + x1) / 2, L]);
      span.push(axis === 'z' ? x0 : z0, axis === 'z' ? x1 : z1);
    }
  }
  if (!vals.length) return null;
  const at = wmedian(vals);
  return { name, at: q(at), from: q(Math.min(...span)), to: q(Math.max(...span)) };
}
const grid = {
  // east-west streets: z of the centreline; north-south streets: x
  streets: GRID_EW.map((n) => gridLine(n, 'z')).filter(Boolean),
  avenues: GRID_NS.map((n) => gridLine(n, 'x')).filter(Boolean),
  little: LITTLE_EW.map((n) => gridLine(n, 'z')).filter(Boolean),
  width: 20.1, littleWidth: 8, reserve: 30.2
};
// The grid's extent: Flinders to La Trobe, Spencer to Spring
const gx0 = grid.avenues[0].at, gx1 = grid.avenues[grid.avenues.length - 1].at;
const gz0 = grid.streets[grid.streets.length - 1].at, gz1 = grid.streets[0].at;
grid.extent = { minX: gx0, maxX: gx1, minZ: gz0, maxZ: gz1 };
log(`Hoddle Grid: ${grid.streets.map((s) => `${s.name.split(' ')[0]} z=${s.at}`).join(', ')}`);
log(`             ${grid.avenues.map((s) => `${s.name.split(' ')[0]} x=${s.at}`).join(', ')}`);
const inGrid = (x, z, m = 0) => x > gx0 - m && x < gx1 + m && z > gz0 - m && z < gz1 + m;

// --- Streets -------------------------------------------------------------------------------------------------------------
const DRIVABLE = new Set(['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'motorway', 'motorway_link']);
const DEFAULT_W = { motorway: 11, motorway_link: 7, trunk: 14, trunk_link: 7, primary: 14, primary_link: 7, secondary: 12, secondary_link: 7, tertiary: 11, tertiary_link: 7, unclassified: 8, residential: 8, living_street: 6, pedestrian: 7 };
const num = (v) => { const m = /^\s*([0-9.]+)/.exec(v || ''); return m ? parseFloat(m[1]) : NaN; };
function streetWidth(t, oneway, pts) {
  const tw = num(t.width);
  const lanes = num(t.lanes);
  let w;
  if (tw > 3 && tw < 60) w = tw;
  else if (lanes > 0) w = lanes * 3.3 + (oneway ? 1.5 : 2.5);
  else w = (DEFAULT_W[t.highway] || 8) * (oneway && !/link|motorway/.test(t.highway) ? 0.65 : 1);
  // Hoddle Grid main streets are a chain wide kerb to kerb; their little streets about 6.5 m
  const mid = pts[pts.length >> 1];
  if (mid && inGrid(mid[0], mid[1], 15)) {
    if (GRID_EW.includes(t.name) || GRID_NS.includes(t.name)) w = oneway ? Math.max(w, 7) : grid.width;
    else if (/^Little |Flinders Lane/.test(t.name || '')) w = grid.littleWidth;
  }
  return w;
}
const streets = []; // { id, name, hw, w, lanes, dir, nodes, pts, bridge, tunnel, cls }
for (const w of ways.values()) {
  const t = w.tags || {};
  const cls = t.highway;
  if (!cls || !(DRIVABLE.has(cls) || cls === 'pedestrian') || t.area === 'yes') continue;
  if (t.access === 'no' && cls !== 'pedestrian') continue;
  const pts = wayPts(w, nodes);
  if (pts.length < 2) continue;
  const ow = t.oneway === 'yes' || t.oneway === '1' || t.oneway === 'true' || t.oneway === '-1' || t.junction === 'roundabout' || /motorway/.test(cls);
  const dir = t.oneway === '-1' ? -1 : ow ? 1 : 0;
  streets.push({
    id: w.id, name: t.name || t.ref || '', cls, hw: /motorway|trunk/.test(cls), w: streetWidth(t, ow, pts), lanes: num(t.lanes) || 0, dir,
    nodes: w.nodes, pts, bridge: !!t.bridge && t.bridge !== 'no', tunnel: !!t.tunnel && t.tunnel !== 'no', layer: num(t.layer) || 0
  });
}
log(`${streets.length} street ways (${streets.filter((s) => s.cls === 'pedestrian').length} pedestrian)`);

// At grade and drivable: the streets the road graph and maps use. Freeways (CityLink, the West Gate) run on viaducts
// and in tunnels here, so they are left for later; river bridges (bridge=yes on ordinary streets) are at grade enough.
const atGrade = streets.filter((s) => !s.tunnel && !/motorway/.test(s.cls) && s.layer >= 0 && s.layer <= 1);
const drivable = atGrade.filter((s) => s.cls !== 'pedestrian');

const roads = drivable.map((s) => [s.name.toUpperCase(), q(s.w), s.dir > 0 ? 'FT' : s.dir < 0 ? 'TF' : 'TW', s.lanes, s.hw ? 1 : 0, flat(rdp(s.pts, 0.8))]);

// --- Road graph: OSM ways split at shared nodes ---------------------------------------------------------------------------
function buildRoadGraph() {
  const use = new Map();
  for (const s of drivable) for (let i = 0; i < s.nodes.length; i++) {
    const id = s.nodes[i];
    use.set(id, (use.get(id) || 0) + (i === 0 || i === s.nodes.length - 1 ? 2 : 1));
  }
  const nodeIdx = new Map(), outNodes = [];
  const idx = (id) => {
    if (!nodeIdx.has(id)) {
      const ll = nodes.get(id);
      const [x, z] = toWorld(ll[0], ll[1]);
      nodeIdx.set(id, outNodes.length / 2);
      outNodes.push(q(x), q(z));
    }
    return nodeIdx.get(id);
  };
  const names = [], nameIds = new Map();
  const nameId = (n) => { if (!nameIds.has(n)) { nameIds.set(n, names.length); names.push(n); } return nameIds.get(n); };
  const links = [];
  for (const s of drivable) {
    let start = 0;
    for (let i = 1; i < s.nodes.length; i++) {
      if (i < s.nodes.length - 1 && use.get(s.nodes[i]) < 2) continue;
      const a = s.nodes[start], b = s.nodes[i];
      if (a !== b && nodes.has(a) && nodes.has(b)) {
        const line = s.nodes.slice(start, i + 1).filter((id) => nodes.has(id)).map((id) => toWorld(...nodes.get(id)));
        const inner = rdp(line, 0.4).slice(1, -1);
        links.push([idx(a), idx(b), nameId(s.name.toUpperCase()), q(s.w), s.lanes, s.dir, flat(inner)]);
      }
      start = i;
    }
  }
  log(`road graph: ${outNodes.length / 2} nodes, ${links.length} links`);
  return { nodes: outNodes, links, names };
}
const roadGraph = buildRoadGraph();

// --- Parks -----------------------------------------------------------------------------------------------------------------
const PARK = (t) => t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'recreation_ground' || t.leisure === 'nature_reserve' || (t.landuse === 'grass' && t.name);
const parks = [];
for (const e of [...ways.values(), ...relations.values()]) {
  const t = e.tags || {};
  if (!PARK(t) || (e.type === 'relation' && t.type !== 'multipolygon')) continue;
  const rings = ringsOf(e).filter((r) => Math.abs(ringArea(r)) > 300);
  if (!rings.length) continue;
  const area = rings.reduce((a, r) => a + Math.abs(ringArea(r)), 0);
  parks.push({ name: t.name || '', cat: t.leisure || t.landuse, acres: Math.round((area / 4046.86) * 10) / 10, rings });
}
log(`parks: ${parks.length} (${parks.filter((p) => p.name).length} named)`);

// --- Blocks ------------------------------------------------------------------------------------------------------------------
const bb = bbox(bounds);
const land = new Raster(bb.x0 - 4, bb.z0 - 4, bb.x1 + 4, bb.z1 + 4, 1);
land.fillRing(insideBox, 1);
for (const wt of water) {
  land.fillRing(wt.rings[0], 0);
  for (const h of wt.rings.slice(1)) land.fillRing(h, 1); // islands
}
for (const y of railYards) land.fillRing(y.ring, 0);
// Roadways that bound blocks: at-grade streets (pedestrian malls too), the grid's own lines at full width, and tram
// tracks (the median between Melbourne's split carriageways)
const cut = [];
// Inside the Hoddle Grid (out to its edge streets' far kerbs) only the grid's own measured lines are stamped, so its
// blocks come out exactly rectangular; OSM's carriageways, tram tracks and laneways there are left out.
const GRID_ZONE = { x0: gx0 - grid.width / 2 - 1, x1: gx1 + grid.width / 2 + 1, z0: gz0 - grid.width / 2 - 1, z1: gz1 + grid.width / 2 + 1 };
const inZone = (x, z) => x > GRID_ZONE.x0 && x < GRID_ZONE.x1 && z > GRID_ZONE.z0 && z < GRID_ZONE.z1;
const addPolyline = (pts, r, name, gridLine = false) => {
  for (let i = 0; i + 1 < pts.length; i++) {
    if (!gridLine && inZone((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2)) continue;
    cut.push({ x0: pts[i][0], z0: pts[i][1], x1: pts[i + 1][0], z1: pts[i + 1][1], r, name });
  }
};
for (const s of atGrade) addPolyline(s.pts, s.w / 2, s.name);
for (const st of grid.streets) addPolyline([[GRID_ZONE.x0 - 15, st.at], [GRID_ZONE.x1 + 15, st.at]], grid.width / 2, st.name, true);
for (const av of grid.avenues) addPolyline([[av.at, GRID_ZONE.z0 - 15], [av.at, GRID_ZONE.z1 + 15]], grid.width / 2, av.name, true);
for (const st of grid.little) addPolyline([[gx0, st.at], [gx1, st.at]], grid.littleWidth / 2, st.name, true);
for (const w of ways.values()) {
  const t = w.tags || {};
  if (t.railway === 'tram' && !(t.tunnel && t.tunnel !== 'no')) addPolyline(wayPts(w, nodes), 3.5, 'tram');
  if ((t.railway === 'rail' || t.railway === 'light_rail') && !(t.tunnel && t.tunnel !== 'no') && !(t.bridge && t.bridge !== 'no')) addPolyline(wayPts(w, nodes), 6, 'rail');
}
const blocks = makeBlocks({ land, roads: cut, sidewalk: SIDEWALK, log });

// --- Water outlines: every water body merged into separate, non-touching rings ---------------------------------------------
// OSM draws the Yarra as several pieces that share edges; cut straight out of the land deck, touching holes break its
// triangulation. Rasterised at 1 m over the map (plus a margin) and traced one connected body at a time (makeBlocks with
// no roads traces the islands of a mask), they come out as clean outlines. Islands inside the water are left out.
const waterOutlines = (() => {
  const M = 220;
  const wr = new Raster(bb.x0 - M, bb.z0 - M, bb.x1 + M, bb.z1 + M, 1);
  for (const wt of water) wr.fillRing(wt.rings[0], 1);
  const bodies = makeBlocks({ land: wr, roads: [], sidewalk: 1, log: () => {} });
  return bodies.filter((b) => b.area > 150).map((b) => rdpRing(b.poly, 0.6));
})();
log(`water outlines: ${waterOutlines.length} bodies`);
// Park share of each block, by the block's centre points sampled on a 4 m lattice
for (const p of parks) p.bb = bbox(p.rings.flat());
for (const b of blocks) {
  const bx = bbox(b.poly);
  const cand = parks.filter((p) => p.bb.x0 < bx.x1 && p.bb.x1 > bx.x0 && p.bb.z0 < bx.z1 && p.bb.z1 > bx.z0);
  let tot = 0;
  const hits = new Map();
  for (let z = bx.z0 + 2; z < bx.z1; z += 4) for (let x = bx.x0 + 2; x < bx.x1; x += 4) {
    if (!pointInRing([x, z], b.poly)) continue;
    tot++;
    for (const p of cand) if (p.rings.some((r) => pointInRing([x, z], r))) { hits.set(p, (hits.get(p) || 0) + 1); break; }
  }
  let best = null, bn = 0, all = 0;
  for (const [p, n] of hits) { all += n; if (n > bn) { bn = n; best = p; } }
  b.park = tot ? Math.round((all / tot) * 100) / 100 : 0;
  b.parkName = best && b.park > 0.3 ? best.name : '';
}
log(`${blocks.filter((b) => b.park > 0.5).length} blocks mostly park`);

// --- Trams ---------------------------------------------------------------------------------------------------------------------
// Routes from the route=tram relations (member ways chained in order, split where the extract leaves gaps; depot and
// short-working variants left out), and every at-grade track for the rails. Inside the Hoddle Grid the lines are moved
// onto the grid's straightened streets: a track running along a grid street sits 1.75 m to the left of its centreline
// (trams keep left), so the two directions lie side by side down the middle of the road.
const TRACK_OFF = 1.75;
function snapToGrid(pts) {
  const out = pts.map((p) => p.slice());
  for (let i = 0; i < out.length; i++) {
    const [x, z] = pts[i];
    if (!inZone(x, z)) continue;
    // direction of travel here (from the neighbouring points)
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    if (Math.abs(dx) / L > 0.9) {
      const st = [...grid.streets, ...grid.little].reduce((m, s) => (Math.abs(s.at - z) < Math.abs(m.at - z) ? s : m));
      if (Math.abs(st.at - z) < 16) out[i][1] = st.at + (dx > 0 ? -TRACK_OFF : TRACK_OFF);
    } else if (Math.abs(dz) / L > 0.9) {
      const av = grid.avenues.reduce((m, s) => (Math.abs(s.at - x) < Math.abs(m.at - x) ? s : m));
      if (Math.abs(av.at - x) < 16) out[i][0] = av.at + (dz > 0 ? TRACK_OFF : -TRACK_OFF);
    }
  }
  return out;
}
const tramRoutes = [];
for (const r of relations.values()) {
  const t = r.tags || {};
  if (t.type !== 'route' || t.route !== 'tram' || !t.ref) continue;
  if (/Tram \d+[a-z]\b/.test(t.name || '')) continue; // depot runs and short workings
  const members = r.members.filter((m) => m.type === 'way' && !/platform|stop/.test(m.role));
  let cur = [];
  const pieces = [];
  for (const m of members) {
    const w = ways.get(m.ref);
    if (!w) { if (cur.length) pieces.push(cur); cur = []; continue; }
    let ids = w.nodes.filter((id) => nodes.has(id));
    if (ids.length < 2) continue;
    if (cur.length) {
      const last = cur[cur.length - 1];
      if (ids[ids.length - 1] === last) ids = ids.slice().reverse();
      if (ids[0] !== last) {
        // reversing the previous piece fixes a chain started the wrong way round
        if (cur.length === w.nodes.length || false) { /* keep */ }
        const first = cur[0];
        if ((ids[0] === first || ids[ids.length - 1] === first) && pieces.length === 0 && cur.length > 1) {
          cur.reverse();
          if (ids[ids.length - 1] === cur[cur.length - 1]) ids = ids.slice().reverse();
        }
      }
      if (ids[0] === cur[cur.length - 1]) { cur.push(...ids.slice(1)); continue; }
      pieces.push(cur);
      cur = ids.slice();
    } else cur = ids.slice();
  }
  if (cur.length) pieces.push(cur);
  for (const pc of pieces) {
    const pts = pc.map((id) => toWorld(...nodes.get(id)));
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (len < 400) continue;
    tramRoutes.push({ ref: t.ref, name: t.name || `Tram ${t.ref}`, len: Math.round(len), pts: snapToGrid(rdp(pts, 0.5)) });
  }
}
const tramTracks = [];
for (const w of ways.values()) {
  const t = w.tags || {};
  if (t.railway !== 'tram' || (t.tunnel && t.tunnel !== 'no')) continue;
  const pts = wayPts(w, nodes);
  if (pts.length >= 2) tramTracks.push(snapToGrid(rdp(pts, 0.3)));
}
log(`trams: ${tramRoutes.length} route lines (${[...new Set(tramRoutes.map((r) => r.ref))].length} routes), ${tramTracks.length} track pieces`);

// --- Landmarks ------------------------------------------------------------------------------------------------------------------
const LANDMARKS = ['Flinders Street Station', 'Eureka Tower', 'Federation Square', "St Paul's Cathedral", 'Arts Centre Melbourne', 'Hamer Hall',
  'Melbourne Town Hall', 'Rialto', 'Southern Cross Station', 'State Library Victoria', 'Parliament House', 'Royal Exhibition Building',
  'Melbourne Cricket Ground', 'Marvel Stadium', 'Queen Victoria Market', 'Melbourne Central', 'Shrine of Remembrance', 'Australia 108',
  'Crown Melbourne', 'Old Treasury Building', "St Patrick's Cathedral", 'Princess Theatre', 'Forum Theatre', 'General Post Office',
  'Melbourne Star', 'Rod Laver Arena', 'AAMI Park', 'National Gallery of Victoria', 'Block Arcade', 'Royal Arcade', 'Shot Tower',
  'Immigration Museum', 'Customs House', 'Mitre Tavern', 'Young and Jackson'];
// OSM's own names where they differ, and the unnamed station building by its way id
const ALIAS = {
  'Southern Cross': 'Southern Cross Station', "Saint Paul's Cathedral": "St Paul's Cathedral", "Saint Patrick's Cathedral": "St Patrick's Cathedral",
  'Forum Melbourne': 'Forum Theatre', "Melbourne's GPO": 'General Post Office', "Coop's Shot Tower": 'Shot Tower', 'Young & Jacksons': 'Young and Jackson'
};
const BY_ID = { 271939456: 'Flinders Street Station' };
const landmarkKey = (e) => {
  const t = e.tags || {};
  if (BY_ID[e.id] && e.type === 'way') return BY_ID[e.id];
  if (!t.name) return null;
  if (ALIAS[t.name]) return ALIAS[t.name];
  return LANDMARKS.find((n) => t.name === n || t.name.startsWith(n + ' ') || t.name === `The ${n}`) || null;
};
const landmarks = {};
for (const e of [...ways.values(), ...relations.values()]) {
  const t = e.tags || {};
  const key = landmarkKey(e);
  if (!key) continue;
  if (!(t.building || t.tourism || t.amenity || t.leisure || t.railway || t.public_transport || t.historic || t.shop === 'mall' || t['building:part'])) continue;
  if (/^(tram|rail|platform|stop)/.test(t.railway || '') || t.public_transport === 'stop_area') continue;
  const rs = ringsOf(e);
  if (!rs.length) continue;
  const r = rs.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a));
  const area = Math.abs(ringArea(r));
  if (landmarks[key] && landmarks[key].area >= area) continue;
  const b = bbox(r);
  landmarks[key] = { x: q((b.x0 + b.x1) / 2), z: q((b.z0 + b.z1) / 2), w: q(b.x1 - b.x0), d: q(b.z1 - b.z0), h: num(t.height) || null, area: Math.round(area), ring: flat(rdpRing(r.slice(0, -1), 0.4)) };
}
log(`landmarks: ${Object.keys(landmarks).length} of ${LANDMARKS.length} (missing: ${LANDMARKS.filter((n) => !landmarks[n]).join(', ') || 'none'})`);

// --- Assemble --------------------------------------------------------------------------------------------------------------
const GEO = {
  version: 1,
  city: 'melbourne',
  frame: { bearingDeg: BEARING_DEG, origin: 'Swanston St & Collins St (centreline)', lat0: LAT0, lon0: LON0, units: 'm', sidewalk: SIDEWALK, edge: EDGE,
    minX: q(bb.x0), maxX: q(bb.x1), minZ: q(bb.z0), maxZ: q(bb.z1) },
  bounds: flat(bounds),
  water: water.map((w) => ({ name: w.name, kind: w.kind, rings: w.rings.map((r) => flat(rdpRing(r.slice(0, -1), 0.5))) })),
  waterOutlines: waterOutlines.map(flat),
  grid,
  roads,
  roadGraph,
  blocks: blocks.map((b) => [flat(b.poly), b.rects.map((r) => r.map(q)), b.park || 0, b.parkName || '', b.rect ? 1 : 0,
    b.frames ? b.frames.map(([th, px, pz, rs]) => [Math.round(th * 1e4) / 1e4, q(px), q(pz), rs.map((r) => r.map(q))]) : 0]),
  parks: parks.map((p) => ({ name: p.name, cat: p.cat, acres: p.acres, rings: p.rings.map((r) => flat(rdpRing(r.slice(0, -1), 0.6))) })),
  railYards: railYards.map((y) => ({ name: y.name, ring: flat(rdpRing(y.ring.slice(0, -1), 0.6)) })),
  trams: tramRoutes.map((r) => ({ ref: r.ref, name: r.name, len: r.len, pts: flat(r.pts) })),
  tramTracks: tramTracks.map(flat),
  landmarks
};
const header = `// js/melbourne-geodata.js: GENERATED by tools/melbourne/build-geodata.mjs, do not edit by hand.
// Melbourne's geography in the simulation's world frame: 1 unit = 1 m, x = Hoddle Grid east (along Collins St),
// z = grid south, origin at the centreline intersection of Swanston St & Collins St, axes turned ${BEARING_DEG} degrees
// from true north (the grid's measured bearing). Polygons and polylines are flat [x0, z0, x1, z1, ...] arrays.
// Source: OpenStreetMap (© OpenStreetMap contributors, ODbL).
`;
fs.writeFileSync(OUT, `${header}export const GEO = ${JSON.stringify(GEO)};\n`);
log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
for (const [k, v] of Object.entries(GEO)) log(`  ${k}: ${(JSON.stringify(v).length / 1024).toFixed(0)} KB`);
