# Melbourne 3D (based on Slop New York)

This folder is the start of GTA Melbourne's next engine: **Slop New York** by mrdoob and contributors
(https://github.com/mrdoob/slop-newyork, MIT licence, see `LICENSE`), vendored at upstream commit `6b191ee`, to be fed
Melbourne instead of Manhattan. It runs on three.js r187's WebGPU renderer (falling back to WebGL2) with TSL node
materials: procedural facades with lit interiors, road and pavement shaders, a physical sky with clouds, two-cascade sun
shadows, screen-space reflections, bloom and a filmic grade.

## Plan

1. **Data in Melbourne, in the engine's formats.** *(done: see below)*
2. **The engine on Melbourne.** `city-config.js`, `city-grid.js`, `boroughs.js` and `nyc-map.js` are written around
   Manhattan (numbered streets, avenues, Broadway, Central Park, the island's shoreline, the boroughs). They get
   Melbourne versions that read `js/melbourne-geodata.js`: the road graph for every street, the Hoddle Grid lines for
   the CBD's signals and crossings, water rings for the Yarra and the harbour, and the blocks and lots as they are.
   `buildings.js`, `street-details.js` and the traffic, pedestrian and material code are already generic.
3. **Melbourne's own pieces:** trams on the real routes, Flinders Street Station, Eureka, the MCG and the other
   landmarks, the bridges over the Yarra, and the freeways (CityLink and the West Gate run on viaducts and in tunnels,
   so they are left out of the at-grade road graph for now).
4. **The game:** GTA Melbourne's missions, police, weapons and characters move across from the WebGL game (`../index.html`).

## Melbourne data

Everything comes from OpenStreetMap (© OpenStreetMap contributors, ODbL) through the OSM API, because Overpass and the
City of Melbourne's portal can't be reached from the build machine.

| Step | Writes |
|---|---|
| `node tools/melbourne/fetch-osm.mjs` | `tools/data/osm-tiles/` (77 tiles, about 90 MB, not committed) |
| `node tools/melbourne/build-buildings.mjs` | `js/melbourne-building-geodata.js` + `.bin.gz`: 10,659 footprints with heights (NYB1) |
| `node tools/melbourne/build-trees.mjs` | `js/melbourne-tree-geodata.js` + `.bin.gz`: 10,733 trees (NYT1) |
| `node --max-old-space-size=8192 tools/melbourne/build-geodata.mjs` | `js/melbourne-geodata.js` (about 1 MB) |
| `node tools/melbourne/preview-map.mjs out.svg [x0 z0 x1 z1]` | an SVG of the lot, for checking a build |

- **Area:** 144.935–144.990 E, 37.800–37.832 S: the Hoddle Grid, Southbank, Docklands, the edges of Carlton, Fitzroy,
  East Melbourne and South Melbourne, the Domain, Yarra Park and the MCG.
- **Frame** (`tools/melbourne/osm.mjs`): metres, x = grid east along Collins St, z = grid south, origin at Swanston and
  Collins, axes turned −19.18° (fitted from the grid's centrelines), the same convention as `js/nyc-geodata.js`.
- **Buildings:** heights come from `height` and `building:levels` tags and `building:part` pieces (about 2,000), and
  are otherwise estimated from tagged neighbours and footprint size.
- **Geodata** (`js/melbourne-geodata.js`): `roads`, `roadGraph`, `blocks` and `parks` in `nyc-geodata.js`'s layouts,
  plus `water`, `grid` (the Hoddle Grid's streets, measured), `railYards`, `bounds` and 35 `landmarks`. Blocks are made
  by the same method as Manhattan's (`tools/melbourne/blocks.mjs`, from `tools/geo-blocks.mjs`): streets, tram tracks
  and the grid's chain-wide roads stamped onto a 1 m land raster, the islands left over traced, given a property line
  and covered with lots.
