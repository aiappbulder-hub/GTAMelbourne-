import { GEO } from './melbourne-geodata.js';

// Melbourne's spatial configuration, with the same exports as js/nyc-config.js so the engine's generic modules (road
// network, buildings, street details, traffic, materials) read it unchanged. From js/melbourne-geodata.js
// (tools/melbourne/build-geodata.mjs).
//
// World frame: 1 unit = 1 m, x = Hoddle Grid east (along Collins St), z = grid south (north = -z), origin at the
// centreline intersection of Swanston St & Collins St, axes turned -19.18 degrees from true north.
//
// The Hoddle Grid stands in for Manhattan's grid: its nine north-south streets (Spencer to Spring) are the "avenues"
// (constant x) and its five main streets and four little streets the "streets" (constant z). Everything beyond it is
// driven on the street centreline graph (GEO.roadGraph). Manhattan's own features (Central Park, Broadway, the piers,
// boroughs and bridges) are empty here.

const toPts = (flat) => {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i], z: flat[i + 1] });
  return out;
};
const CUT_Z = GEO.frame.minZ;
const G = GEO.grid;
const EXT = G.extent;

// ---------------------------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------------------------
const titleCase = (n) => n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bMc(\w)/g, (_, c) => `Mc${c.toUpperCase()}`);
const shortName = (n) => n.replace(/ Street$/, ' St').replace(/ Road$/, ' Rd').replace(/ Parade$/, ' Pde').replace(/ Avenue$/, ' Ave')
  .replace(/ Lane$/, ' La').replace(/ Place$/, ' Pl').replace(/ Highway$/, ' Hwy').replace(/ Boulevard$/, ' Blvd').replace(/ Drive$/, ' Dr');
const slug = (n) => n.toLowerCase().replace(/ street$/, '').replace(/[^a-z]+/g, '_');

// ---------------------------------------------------------------------------------------------------------------------
// Named roads (the OSM centrelines): maps, labels, lookups
// ---------------------------------------------------------------------------------------------------------------------
const ROADS = GEO.roads.map(([name, w, dir, lanes, hw, flat]) => ({ name: shortName(titleCase(name)), raw: name, w, dir, lanes, highway: !!hw, pts: toPts(flat) }))
  .filter((r) => r.raw);

// One-way direction along +x (1), -x (-1) or both (0) of a grid street, voted by its OSM pieces inside the grid
function gridDir(name) {
  const votes = { '-1': 0, 0: 0, 1: 0 };
  for (const r of ROADS) {
    if (r.raw !== name.toUpperCase()) continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      if (a.x < EXT.minX || a.x > EXT.maxX) continue;
      const L = Math.abs(b.x - a.x);
      const s = r.dir === 'TW' ? 0 : Math.sign(b.x - a.x) * (r.dir === 'TF' ? -1 : 1);
      votes[s] += L;
    }
  }
  return +Object.entries(votes).sort((p, q) => q[1] - p[1])[0][0];
}

// ---------------------------------------------------------------------------------------------------------------------
// The Hoddle Grid as avenues (north-south, constant x) and streets (east-west, constant z)
// ---------------------------------------------------------------------------------------------------------------------
const AVE_MIN_Z = EXT.minZ - G.width / 2 - 2;
const AVE_MAX_Z = EXT.maxZ + G.width / 2 + 2;
const ALL_AVENUES = G.avenues.map((a) => {
  const name = shortName(a.name);
  return {
    id: slug(a.name), x: a.at, name, short: name, dir: 0, width: G.width, sidewalk: 4.6, lanes: 4,
    minZ: AVE_MIN_Z, maxZ: AVE_MAX_Z,
    segs: [{ z0: AVE_MIN_Z, z1: AVE_MAX_Z, dir: 0, w: G.width, lanes: 4, names: [[AVE_MIN_Z, AVE_MAX_Z, a.name.toUpperCase()]] }],
    hasMedian: false, isSecondary: false, splitByCentralPark: false
  };
});
const AVENUE_BY_ID = new Map(ALL_AVENUES.map((a) => [a.id, a]));
// Unknown ids (New York's avenue names in shared code) fall back to Swanston St
const avenueX = (id) => (AVENUE_BY_ID.get(String(id)) || AVENUE_BY_ID.get('swanston')).x;

const ALL_STREETS = [
  ...G.streets.map((s) => ({ s, major: true, width: G.width, dir: 0 })),
  ...G.little.map((s) => ({ s, major: false, width: G.littleWidth, dir: gridDir(s.name) }))
].map(({ s, major, width, dir }) => ({
  number: null, name: shortName(s.name), short: shortName(s.name), z: s.at, isMajor: major, isTransverse: false, dir, width,
  westX: EXT.minX, eastX: EXT.maxX, runs: [[EXT.minX, EXT.maxX, dir, width]], splitByCentralPark: false
})).sort((a, b) => a.z - b.z);

// Inside this rect the grid corridors carry all traffic: the road network ignores the OSM centreline there (its split
// carriageways would add junctions a few metres off the grid's own intersections)
const GRID_ZONE = { minX: EXT.minX - G.width / 2 - 3, maxX: EXT.maxX + G.width / 2 + 3, minZ: EXT.minZ - G.width / 2 - 3, maxZ: EXT.maxZ + G.width / 2 + 3 };

// The "core" avenues and streets (street-details.js mounts signal heads and crosswalk details along them)
const AVENUES = ALL_AVENUES.map((a) => ({ x: a.x, name: a.name, dir: a.dir, width: a.width, sidewalk: 4.6 }));
const STREETS = ALL_STREETS.filter((s) => s.isMajor).map((s) => ({ z: s.z, name: s.name, dir: s.dir, width: s.width, sidewalk: 4.6, number: null, isMajor: true }));

// New York's numbered streets have no Melbourne meaning: shared code that still asks gets a z north of the grid, so
// anything it places lands out of the way (Manhattan's 42nd St maps to La Trobe St, ~80 m a street)
const streetZ = (n) => EXT.minZ + (42 - n) * 79.5;

// ---------------------------------------------------------------------------------------------------------------------
// Map edge ("shore"): the fetched area. Its crossing at any z bounds the land for the road network and the materials.
// ---------------------------------------------------------------------------------------------------------------------
const MAP_EDGE = toPts(GEO.bounds);
const MANHATTAN_COASTLINE = MAP_EDGE;
const ISLAND_BOUNDS = (() => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of MAP_EDGE) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  return { minX, maxX, minZ, maxZ, sidewalkHeight: 0.22, waterLevel: -1.6 };
})();
function getIslandBoundsAtZ(z) {
  z = Math.max(ISLAND_BOUNDS.minZ + 0.01, Math.min(ISLAND_BOUNDS.maxZ - 0.01, z));
  let westX = Infinity, eastX = -Infinity;
  const P = MAP_EDGE;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[j], b = P[i];
    if ((a.z > z) === (b.z > z)) continue;
    const x = a.x + ((z - a.z) * (b.x - a.x)) / (b.z - a.z);
    westX = Math.min(westX, x);
    eastX = Math.max(eastX, x);
  }
  if (westX === Infinity) return { westX: ISLAND_BOUNDS.minX, eastX: ISLAND_BOUNDS.maxX };
  return { westX, eastX };
}

// Manhattan-only features, empty
const FAR = { minX: 1e7, maxX: 1e7 + 1, minZ: 1e7, maxZ: 1e7 + 1 };
const CENTRAL_PARK_BOUNDS = { ...FAR };
const BROADWAY_LINE = [{ x: 1e7, z: -1e7 }, { x: 1e7, z: 1e7 }];
const getBroadwayX = () => 1e7;
const WATERFRONT_PIERS = [];
const ROOSEVELT_ISLAND_POLYGON = [], GOVERNORS_ISLAND_POLYGON = [], RANDALLS_ISLAND_POLYGON = [], LIBERTY_ISLAND_POLYGON = [];
const ELLIS_ISLAND_POLYGON = [], MILL_ROCK_POLYGON = [], UPPER_MANHATTAN_POLYGON = [], STATEN_ISLAND_POLYGON = [];
const NJ_SHORELINE_POLYGON = [], LONG_ISLAND_POLYGONS = [], BROOKLYN_POLYGONS = [], QUEENS_POLYGONS = [], BRONX_POLYGONS = [];
const BRONX_POLYGON = [], WESTCHESTER_POLYGON = [], NASSAU_POLYGON = [];
const LIBERTY_STATUE_POS = { x: 1e7, z: 1e7 };
const EAST_RIVER_BRIDGES = [], OUTER_BRIDGES = [];

// ---------------------------------------------------------------------------------------------------------------------
// Nearest-road index (labels, sidewalk tests): uniform grid of road segments
// ---------------------------------------------------------------------------------------------------------------------
const ROAD_CELL = 64;
const ROAD_GRID = new Map();
for (const r of ROADS) {
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i], b = r.pts[i + 1];
    const seg = { r, ax: a.x, az: a.z, bx: b.x, bz: b.z };
    const ix0 = Math.floor(Math.min(a.x, b.x) / ROAD_CELL), ix1 = Math.floor(Math.max(a.x, b.x) / ROAD_CELL);
    const iz0 = Math.floor(Math.min(a.z, b.z) / ROAD_CELL), iz1 = Math.floor(Math.max(a.z, b.z) / ROAD_CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const k = ix * 100000 + iz;
      if (!ROAD_GRID.has(k)) ROAD_GRID.set(k, []);
      ROAD_GRID.get(k).push(seg);
    }
  }
}
/** Nearest roads to (x, z) within `radius`: [{ road, dist, horizontal }] sorted by distance (one entry per name) */
function nearestRoads(x, z, radius = 60) {
  const best = new Map();
  const ix0 = Math.floor((x - radius) / ROAD_CELL), ix1 = Math.floor((x + radius) / ROAD_CELL);
  const iz0 = Math.floor((z - radius) / ROAD_CELL), iz1 = Math.floor((z + radius) / ROAD_CELL);
  for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
    const list = ROAD_GRID.get(ix * 100000 + iz);
    if (!list) continue;
    for (const s of list) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
      const d = Math.hypot(s.ax + t * dx - x, s.az + t * dz - z);
      if (d > radius) continue;
      const prev = best.get(s.r.name);
      if (!prev || d < prev.dist) best.set(s.r.name, { road: s.r, dist: d, horizontal: Math.abs(dx) > Math.abs(dz) });
    }
  }
  return [...best.values()].sort((a, b) => a.dist - b.dist);
}

// ---------------------------------------------------------------------------------------------------------------------
// Blocks (the same records as js/nyc-config.js)
// ---------------------------------------------------------------------------------------------------------------------
const BLOCKS = GEO.blocks.map(([flat, rects, park, parkName, isRect, frames], id) => {
  const poly = toPts(flat);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, a = 0, cx = 0, cz = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[i], q = poly[j];
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    const c = q.x * p.z - p.x * q.z;
    a += c; cx += (q.x + p.x) * c; cz += (q.z + p.z) * c;
  }
  a *= 0.5;
  return {
    id, poly, rects, frames: frames || null, park, parkName, rect: !!isRect, area: Math.abs(a),
    minX, maxX, minZ, maxZ,
    cx: a ? cx / (6 * a) : (minX + maxX) / 2,
    cz: a ? cz / (6 * a) : (minZ + maxZ) / 2,
    median: Math.min(maxX - minX, maxZ - minZ) < 9
  };
});
const BLOCK_CELL = 64;
const BLOCK_GRID = new Map();
for (const b of BLOCKS) {
  for (let ix = Math.floor(b.minX / BLOCK_CELL); ix <= Math.floor(b.maxX / BLOCK_CELL); ix++) {
    for (let iz = Math.floor(b.minZ / BLOCK_CELL); iz <= Math.floor(b.maxZ / BLOCK_CELL); iz++) {
      const k = ix * 100000 + iz;
      if (!BLOCK_GRID.has(k)) BLOCK_GRID.set(k, []);
      BLOCK_GRID.get(k).push(b);
    }
  }
}
function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
/** The block (kerb island) under (x, z), or null on the roadway / in the water */
function blockAt(x, z) {
  const list = BLOCK_GRID.get(Math.floor(x / BLOCK_CELL) * 100000 + Math.floor(z / BLOCK_CELL));
  if (!list) return null;
  for (const b of list) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (b.rect || pointInPoly(b.poly, x, z)) return b;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Neighbourhoods
// ---------------------------------------------------------------------------------------------------------------------
const WATER = GEO.water.map((w) => ({ name: w.name, ring: toPts(w.rings[0]), holes: w.rings.slice(1).map(toPts) }));
const inWater = (x, z) => WATER.some((w) => pointInPoly(w.ring, x, z) && !w.holes.some((h) => pointInPoly(h, x, z)));
// The Yarra's line at x (its northern bank), for telling Southbank from the city
const yarraNorthZ = (() => {
  const rings = WATER.filter((w) => w.name === 'Yarra River').map((w) => w.ring);
  return (x) => {
    let best = Infinity;
    for (const r of rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[j], b = r[i];
        if ((a.x > x) === (b.x > x)) continue;
        best = Math.min(best, a.z + ((x - a.x) * (b.z - a.z)) / (b.x - a.x));
      }
    }
    return best === Infinity ? 600 : best;
  };
})();
function districtAt(x, z) {
  const m = 12;
  if (x > EXT.minX - m && x < EXT.maxX + m && z > EXT.minZ - m && z < EXT.maxZ + m) return 'cbd';
  if (x < EXT.minX - 120 && z > -700) return 'docklands';
  if (z > yarraNorthZ(x)) return x > 900 ? 'domain' : x < -1100 ? 'south_wharf' : 'southbank';
  if (x > EXT.maxX + 400 && z > -300) return 'richmond';
  if (x > EXT.maxX) return z < -900 ? 'fitzroy' : 'east_melbourne';
  if (z < EXT.minZ) return x < -700 ? 'north_melbourne' : 'carlton';
  return 'cbd';
}
for (const b of BLOCKS) b.district = districtAt(b.cx, b.cz);
const DISTRICT_NAMES = {
  cbd: 'Melbourne CBD', docklands: 'Docklands', southbank: 'Southbank', south_wharf: 'South Wharf', domain: 'Kings Domain',
  richmond: 'Richmond', fitzroy: 'Fitzroy', east_melbourne: 'East Melbourne', north_melbourne: 'North Melbourne', carlton: 'Carlton'
};

// ---------------------------------------------------------------------------------------------------------------------
// Landmarks & places
// ---------------------------------------------------------------------------------------------------------------------
const LANDMARK_SITES = GEO.landmarks;
const site = (name, fallback) => LANDMARK_SITES[name] || fallback;
const NYC_LANDMARKS = [
  ['flinders', 'Flinders Street Station', 'Flinders St Stn', 'Flinders Street Station'],
  ['fedsquare', 'Federation Square', 'Fed Square', 'Federation Square'],
  ['eureka', 'Eureka Tower', 'Eureka', 'Eureka Tower'],
  ['stpauls', "St Paul's Cathedral", "St Paul's", "St Paul's Cathedral"],
  ['townhall', 'Melbourne Town Hall', 'Town Hall', 'Melbourne Town Hall'],
  ['statelibrary', 'State Library Victoria', 'State Library', 'State Library Victoria'],
  ['melbcentral', 'Melbourne Central & Shot Tower', 'Melb Central', 'Melbourne Central'],
  ['qvm', 'Queen Victoria Market', 'Vic Market', 'Queen Victoria Market'],
  ['southerncross', 'Southern Cross Station', 'Southern Cross', 'Southern Cross Station'],
  ['parliament', 'Parliament House', 'Parliament', 'Parliament House'],
  ['exhibition', 'Royal Exhibition Building', 'Exhibition Bldg', 'Royal Exhibition Building'],
  ['mcg', 'Melbourne Cricket Ground', 'MCG', 'Melbourne Cricket Ground'],
  ['artscentre', 'Arts Centre Melbourne', 'Arts Centre', 'Arts Centre Melbourne'],
  ['crown', 'Crown Melbourne', 'Crown', 'Crown Melbourne'],
  ['marvel', 'Marvel Stadium', 'Marvel Stadium', 'Marvel Stadium'],
  ['shrine', 'Shrine of Remembrance', 'Shrine', 'Shrine of Remembrance'],
  ['star', 'Melbourne Star', 'Melbourne Star', 'Melbourne Star']
].map(([id, name, short, osm]) => {
  const s = site(osm, { x: 0, z: 0 });
  return { id, name, short, x: s.x, z: s.z, district: DISTRICT_NAMES[districtAt(s.x, s.z)] };
});

// Street-level arrivals shared by every travel mode (teleport menu). Heading 0 faces grid south (+z), PI north.
const swan = avenueX('swanston'), eliz = avenueX('elizabeth'), spencer = avenueX('spencer'), spring = avenueX('spring');
const zOf = (name) => (G.streets.find((s) => s.name === name) || G.little.find((s) => s.name === name) || { at: 0 }).at;
const TELEPORT_LOCATIONS = {
  flinders: { x: swan + 3.6, z: zOf('Flinders Street') - 40, heading: 0, name: 'Flinders Street Station', sub: 'Swanston St · CBD' },
  bourke: { x: eliz + 3.6, z: zOf('Bourke Street') + 40, heading: Math.PI, name: 'Bourke Street', sub: 'Elizabeth St · CBD' },
  collins: { x: avenueX('william') + 40, z: zOf('Collins Street') + 3.6, heading: Math.PI * 0.5, name: 'Collins Street', sub: 'William St · CBD' },
  southerncross: { x: spencer + 3.6, z: zOf('Collins Street') - 40, heading: Math.PI, name: 'Southern Cross Station', sub: 'Spencer St · CBD' },
  parliament: { x: spring - 3.6, z: zOf('Bourke Street') + 30, heading: Math.PI, name: 'Parliament House', sub: 'Spring St · CBD' },
  latrobe: { x: swan + 3.6, z: zOf('La Trobe Street') + 40, heading: Math.PI, name: 'State Library', sub: 'Swanston St · La Trobe St' }
};
// Spawn on Swanston St between Collins and Bourke, facing south toward Flinders Street Station
const SPAWN = { x: swan, z: (zOf('Collins Street') + zOf('Bourke Street')) / 2 };

// Real coordinates -> world metres (the frame of tools/melbourne/osm.mjs), for missions and places placed by lon/lat
const fromLonLat = (() => {
  const { lat0, lon0, bearingDeg } = GEO.frame;
  const A = 6378137.0, E2 = 6.69437999014e-3, phi = (lat0 * Math.PI) / 180, s0 = Math.sin(phi);
  const KX = (Math.PI / 180) * (A / Math.sqrt(1 - E2 * s0 * s0)) * Math.cos(phi);
  const KY = (Math.PI / 180) * ((A * (1 - E2)) / Math.pow(1 - E2 * s0 * s0, 1.5));
  const t = (bearingDeg * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
  return (lon, lat) => {
    const e = (lon - lon0) * KX, n = (lat - lat0) * KY;
    return { x: e * c - n * sn, z: -(e * sn + n * c) };
  };
})();

// Fixed scenic cameras (cameras.js): eye and target in world metres, in place of New York's vantage points (the ids
// are the engine's preset slots)
const SCENIC_VIEWS = {
  centralPark: { name: 'Federation Square', pos: [230, 14, 330], look: [-170, 18, 262] },
  fifthAve: { name: 'Swanston St to Flinders St', pos: [swan, 6.5, zOf('La Trobe Street') + 90], look: [swan, 25, 300] },
  timesSquare: { name: 'Bourke Street Mall', pos: [swan - 15, 5.5, zOf('Bourke Street')], look: [eliz, 18, zOf('Bourke Street')] },
  chryslerGCT: { name: 'Collins St · Paris End', pos: [spring - 50, 8, zOf('Collins Street')], look: [swan + 120, 30, zOf('Collins Street')] },
  observatory: { name: 'Eureka Skydeck', pos: [-381, 288, 585], look: [0, 60, -150] },
  bryantPark: { name: 'Southbank Promenade', pos: [-450, 4, 432], look: [-50, 30, 330] },
  waterfront: { name: 'The Yarra & Skyline', pos: [500, 40, 786], look: [-200, 100, 0] },
  drone: { name: 'Aerial over the CBD', centre: [-150, 160, 150] }
};

// The old midtown superblocks (NYC landmarks.js): here the grid's blocks between its avenues and main streets
function getBlockBounds(col, row) {
  const westAve = AVENUES[Math.min(col, AVENUES.length - 2)];
  const eastAve = AVENUES[Math.min(col + 1, AVENUES.length - 1)];
  const northSt = STREETS[Math.min(row, STREETS.length - 2)];
  const southSt = STREETS[Math.min(row + 1, STREETS.length - 1)];
  const minX = westAve.x + westAve.width * 0.5 + westAve.sidewalk;
  const maxX = eastAve.x - eastAve.width * 0.5 - eastAve.sidewalk;
  const minZ = northSt.z + northSt.width * 0.5 + northSt.sidewalk;
  const maxZ = southSt.z - southSt.width * 0.5 - southSt.sidewalk;
  return {
    col, row, minX, maxX, minZ, maxZ, cx: (minX + maxX) * 0.5, cz: (minZ + maxZ) * 0.5, width: maxX - minX, depth: maxZ - minZ,
    sidewalkMinX: westAve.x + westAve.width * 0.5, sidewalkMaxX: eastAve.x - eastAve.width * 0.5,
    sidewalkMinZ: northSt.z + northSt.width * 0.5, sidewalkMaxZ: southSt.z - southSt.width * 0.5
  };
}

/** Street names (or landmark, or the river) at any world (x, z) */
function getLocationLabel(x, z) {
  for (const lm of NYC_LANDMARKS) {
    if (Math.hypot(x - lm.x, z - lm.z) < 80) {
      const near = nearestRoads(x, z, 120);
      return `${lm.name}${near.length ? ` · ${near[0].road.name}` : ''}`;
    }
  }
  if (inWater(x, z)) {
    const w = WATER.find((q) => pointInPoly(q.ring, x, z));
    return w && w.name ? w.name : 'The Yarra';
  }
  const near = nearestRoads(x, z, 160);
  const ns = near.find((r) => !r.horizontal);
  const ew = near.find((r) => r.horizontal);
  if (ns && ew && ns.dist < 40 && ew.dist < 40) return `${ns.road.name} & ${ew.road.name}`;
  if (near.length) return `${near[0].road.name} · ${DISTRICT_NAMES[districtAt(x, z)]}`;
  return DISTRICT_NAMES[districtAt(x, z)];
}

// New York's authored points (a former compressed frame) have no Melbourne equivalent: park them far away
const fromOldFrame = () => ({ x: 1e7, z: 1e7 });

function isTypingInField(e) {
  return e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
}

// Traffic signal cycle (as js/nyc-config.js): "avenues" are the grid's north-south streets
const SIGNAL_TIMING = { cycle: 60, avenueAmber: 26, avenueRed: 30, streetAmber: 56, walk: 7 };
function signalPhase(time, isAvenue) {
  const { cycle, avenueAmber, avenueRed, streetAmber } = SIGNAL_TIMING;
  const t = ((time % cycle) + cycle) % cycle;
  if (isAvenue) return t < avenueAmber ? 'green' : t < avenueRed ? 'amber' : 'red';
  return t < avenueRed ? 'red' : t < streetAmber ? 'green' : 'amber';
}
function walkSignal(time, isAvenue) {
  const { cycle, avenueRed, walk } = SIGNAL_TIMING;
  const t = (((time - (isAvenue ? 0 : avenueRed)) % cycle) + cycle) % cycle;
  return t < walk;
}

export {
  SPAWN, AVENUES, ALL_AVENUES, CENTRAL_PARK_BOUNDS, getIslandBoundsAtZ, MANHATTAN_COASTLINE, getBroadwayX, BROADWAY_LINE,
  WATERFRONT_PIERS, ROOSEVELT_ISLAND_POLYGON, GOVERNORS_ISLAND_POLYGON, NJ_SHORELINE_POLYGON, LONG_ISLAND_POLYGONS,
  BROOKLYN_POLYGONS, QUEENS_POLYGONS, BRONX_POLYGONS, WESTCHESTER_POLYGON, NASSAU_POLYGON, UPPER_MANHATTAN_POLYGON,
  BRONX_POLYGON, STATEN_ISLAND_POLYGON, RANDALLS_ISLAND_POLYGON, LIBERTY_ISLAND_POLYGON, LIBERTY_STATUE_POS,
  ELLIS_ISLAND_POLYGON, MILL_ROCK_POLYGON, EAST_RIVER_BRIDGES, OUTER_BRIDGES, STREETS, ALL_STREETS, ROADS, NYC_LANDMARKS,
  LANDMARK_SITES, TELEPORT_LOCATIONS, ISLAND_BOUNDS, BLOCKS, CUT_Z, SIGNAL_TIMING, streetZ, avenueX, districtAt, blockAt,
  nearestRoads, getBlockBounds, getLocationLabel, fromOldFrame, isTypingInField, signalPhase, walkSignal,
  WATER, inWater, GRID_ZONE, SCENIC_VIEWS, fromLonLat
};
