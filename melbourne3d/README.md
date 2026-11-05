# Melbourne 3D (based on Slop New York)

This folder is the start of GTA Melbourne's next engine: **Slop New York** by mrdoob and contributors
(https://github.com/mrdoob/slop-newyork, MIT licence, see `LICENSE`), vendored at upstream commit `6b191ee`, to be fed
Melbourne instead of Manhattan. It runs on three.js r187's WebGPU renderer (falling back to WebGL2) with TSL node
materials: procedural facades with lit interiors, road and pavement shaders, a physical sky with clouds, two-cascade sun
shadows, screen-space reflections, bloom and a filmic grade.

## Plan

1. **Data in Melbourne, in the engine's formats.** `js/nyc-geodata.js` (roads, blocks, parks, water, landmarks, in metres
   in a rotated grid frame) and `js/building-geodata.bin.gz` (every footprint with its roof height) get Melbourne
   equivalents, built from OpenStreetMap and the City of Melbourne's open data (building footprints with heights, street
   trees). The Hoddle Grid maps onto the engine's street/avenue grid (its streets run at about 21 degrees from true
   east); Southbank, Docklands and the inner suburbs use its general road and block data, as Lower Manhattan does.
2. **Melbourne's own pieces:** trams on the real routes, Flinders Street Station, Eureka, the MCG and the other
   landmarks, the Yarra and the bay.
3. **The game:** GTA Melbourne's missions, police, weapons and characters move across from the WebGL game (`../index.html`).

Needs network access to `overpass-api.de` and `data.melbourne.vic.gov.au` to fetch the Melbourne data.
