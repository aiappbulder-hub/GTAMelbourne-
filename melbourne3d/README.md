# Melbourne 3D (based on Slop New York)

This folder is the start of GTA Melbourne's next engine: **Slop New York** by mrdoob and contributors
(https://github.com/mrdoob/slop-newyork, MIT licence, see `LICENSE`), vendored at upstream commit `6b191ee`, to be fed
Melbourne instead of Manhattan. It runs on three.js r187's WebGPU renderer (falling back to WebGL2) with TSL node
materials: procedural facades with lit interiors, road and pavement shaders, a physical sky with clouds, two-cascade sun
shadows, screen-space reflections, bloom and a filmic grade.

## Plan

1. **Data in Melbourne, in the engine's formats.** *(done: see below)*
2. **The engine on Melbourne.** *(running: see "The city switch")* Still to do: join the suburbs' road networks to the
   CBD's everywhere (St Kilda Rd and Kings Way don't connect yet), Melbourne street furniture in place of New York's
   (subway entrances, steam stacks, hot-dog carts are parked off the map), laneways inside the grid, and the minimap's
   water and labels.
3. **Melbourne's own pieces:** trams on the real routes, Flinders Street Station, Eureka, the MCG and the other
   landmarks, the bridges over the Yarra, and the freeways (CityLink and the West Gate run on viaducts and in tunnels,
   so they are left out of the at-grade road graph for now).
4. **The game:** GTA Melbourne's missions, police, weapons and characters move across from the WebGL game (`../index.html`).

## The city switch

`index.html` builds Melbourne. Add `?nyc` to build Slop New York's Manhattan, the reference the port is checked against,
and `?webgl` to force three's WebGL2 backend (for browsers without stable WebGPU, and for headless testing).

- `js/city.js` picks the city. `js/city-config.js` re-exports `js/melbourne-config.js` or `js/nyc-config.js` (the same
  exports), and `js/geodata.js`, `js/city-buildings.js` and `js/city-trees.js` pick the data files.
- Melbourne's config maps the Hoddle Grid onto the engine's grid: its nine north-south streets are the "avenues", its
  five main streets and four little streets the "streets". Everything beyond the grid is driven on the OSM centreline
  graph. Manhattan's features (Central Park, Broadway, piers, boroughs, bridges) are empty.
- `buildCityGrid` hands Melbourne to `buildMelbourneGrid` (in `js/city-grid.js`): the land deck with the Yarra,
  Victoria Harbour and the lakes cut out, bluestone quay walls, every kerb island's footpath, and the parks.
  `boroughs.js` and Slop New York's hand-built landmarks are skipped.
- The road network keeps every strongly connected network of 12 edges or more in Melbourne (New York keeps the largest
  only). `?debugroads` leaves its inputs and edges on `globalThis.__roadInputs` / `__roadEdges` for checking.
- `window.__city` exposes the scene, controllers, cameras, traffic and `teleportTo` for scripted checks.

## Game

- **Story missions** (`js/missions.js`): the original game's story (the Lygon Street Crew against the Broadmeadows
  mob, Taskforce Kestrel closing in) with Vince and Kaz's six jobs, set on this map: Laneway Hustle, Hot Lap, Westside
  Bikies, The Informant, Tobacco Wars and Harbour Run. Pink beam: the next job; yellow beam: the objective, with the
  GPS route on the map. Cutscene dialogue (Enter or click), timers, cash and progress are saved. The teleport menu's
  Jobs list goes straight to any job. The jobs that needed guns, gangs and police are driving jobs until those move
  across.
- **On foot and behind the wheel** (`js/gameplay.js`, `js/controllers.js`):
  - Movement as in GTA: the keys go where the camera looks; jog by default, Shift to sprint, a light touch of the stick
    walks; the body turns smoothly into the direction of travel and slows into sharp turns; the camera swings round
    behind lazily.
  - **F** gets into your taxi or takes any car in the traffic (walking to the driver's door, the right-hand side,
    from a few metres away), and gets out again. A taken car keeps its own body and paint and stays parked where you
    leave it.
  - Guns: pistol, Uzi, shotgun (**Tab** to change, **G** to holster, **R** to reload). Hold the right mouse button to
    aim (crosshair, lock-on), click or **J** (or FIRE on touch) to shoot; without aiming, shots lock on to the nearest
    person or car in front. People fall and stay down a while; everyone nearby runs; shot cars flee, then stall.
  - **T** talks to the person in front of you (they stop, turn and answer); **T** while aiming robs them.
- **Intro** (`js/intro.js`): golden-hour wide shots (the skyline over Yarra Park, Flinders Street Station, Lygon
  Street, Docklands into the sunset, Eureka, down Swanston Street) letterboxed, with Trent setting up the story and
  Vince's phone call, ending on the player at the first job. Plays the first time; Esc / Enter / Skip end it; replay
  it from the teleport menu or with `?intro`.
- **Trams** (`js/trams.js`): 22 real routes from OpenStreetMap with rails and overhead wire, the old game's tram model.
- **Landmarks** (`js/melbourne-landmarks.js`): the old game's models of Flinders Street Station, Eureka, St Paul's,
  the MCG, Parliament, the Exhibition Building, the Shrine, the Arts Centre spire, Rialto and Fed Square, sized to the
  real buildings.
- **Graphics quality** (`js/quality.js`): High by default on every device; the GFX menu in the toolbar picks High, Medium or Low (saved), or `?quality=`;
  dynamic resolution keeps any level playable.
- **Melbourne, not New York:** Victoria Police chequers, PTV bus colours, Victorian plates, a Melbourne taxi, white
  Australian lane lines, charcoal signals, Australia Post boxes, blue street signs, km/h; no subway entrances, steam
  stacks, hot-dog carts, hydrants, water towers or fire escapes.

## Melbourne data

Everything comes from OpenStreetMap (© OpenStreetMap contributors, ODbL) through the OSM API, because Overpass and the
City of Melbourne's portal can't be reached from the build machine.

| Step | Writes |
|---|---|
| `node tools/melbourne/fetch-osm.mjs` | `tools/data/osm-tiles/` (154 tiles, about 180 MB, not committed) |
| `node tools/melbourne/build-buildings.mjs` | `js/melbourne-building-geodata.js` + `.bin.gz`: 26,590 footprints with heights (NYB1) |
| `node tools/melbourne/build-trees.mjs` | `js/melbourne-tree-geodata.js` + `.bin.gz`: 15,853 trees (NYT1) |
| `node --max-old-space-size=8192 tools/melbourne/build-geodata.mjs` | `js/melbourne-geodata.js` (about 1.8 MB) |
| `node tools/melbourne/preview-map.mjs out.svg [x0 z0 x1 z1]` | an SVG of the lot, for checking a build |

- **Area:** 144.935–144.990 E, 37.800–37.867 S: the Hoddle Grid, Southbank, Docklands, South Melbourne, Albert Park
  and its lake and Grand Prix circuit, St Kilda Road, the edges of Carlton, Fitzroy, East Melbourne, Middle Park and
  St Kilda, the Domain, Yarra Park and the MCG, and Port Phillip Bay's shore (the sea built from the OSM coastline).
- **Frame** (`tools/melbourne/osm.mjs`): metres, x = grid east along Collins St, z = grid south, origin at Swanston and
  Collins, axes turned −19.18° (fitted from the grid's centrelines), the same convention as `js/nyc-geodata.js`.
- **Buildings:** heights come from `height` and `building:levels` tags and `building:part` pieces (about 2,000), and
  are otherwise estimated from tagged neighbours and footprint size.
- **Geodata** (`js/melbourne-geodata.js`): `roads`, `roadGraph`, `blocks` and `parks` in `nyc-geodata.js`'s layouts,
  plus `water`, `grid` (the Hoddle Grid's streets, measured), `railYards`, `bounds` and 35 `landmarks`. Blocks are made
  by the same method as Manhattan's (`tools/melbourne/blocks.mjs`, from `tools/geo-blocks.mjs`): streets, tram tracks
  and the grid's chain-wide roads stamped onto a 1 m land raster, the islands left over traced, given a property line
  and covered with lots. Inside the Hoddle Grid only the grid's own measured street lines are stamped, so its blocks are
  exact rectangles, and the buildings there are clipped to their blocks' property lines (the real streets wander a few
  metres off the straight lines).
