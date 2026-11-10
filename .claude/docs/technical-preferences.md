# Technical Preferences: GTA Melbourne

What the studio agents in `.claude/agents/` should assume about this project.

**The only active game is the Three.js engine in `melbourne3d/`.** The old WebGL game (`index.html` at the repository
root, `map/`, `models/`, `tools/build_map.py`) is retired: don't change it, revive it or move anything back into it.
Story design and milestones are in `melbourne3d/docs/story/` (`EMPIRE_DESIGN.md`, `MILESTONES.md`).

## Engine & Language

- **Engine**: Slop New York by mrdoob (MIT), ported to Melbourne, on **three.js r187** (WebGPU renderer, WebGL2
  fallback) with TSL node materials. Three comes from an import map in `melbourne3d/index.html` (cdn.jsdelivr.net).
- **Language**: plain JavaScript ES modules in `melbourne3d/js/`. No bundler and no build step.
- **Entry point**: `melbourne3d/js/main.js`. `js/city.js` and `js/city-config.js` pick Melbourne (default) or Manhattan
  (`?nyc`, a reference only).
- **Systems to reuse, not duplicate**:
  - missions and cut scenes: `js/missions.js`, `js/stkilda.js`
  - characters: `js/people.js`, `js/character-presets.js`
  - voices: `js/voice-manager.js` and `data/character-voices.json`
  - driving, guns, taking cars: `js/gameplay.js`, `js/controllers.js`
  - traffic and roads: `js/traffic.js`, `js/road-network.js`
  - the tail car: `js/pursuit.js`
  - the Grand Prix: `js/race.js`
  - the intro: `js/intro.js`

## World and assets

- **Map**: OpenStreetMap (ODbL, credit required). Built by `melbourne3d/tools/melbourne/*.mjs` into
  `js/melbourne-geodata.js` and the building and tree `.bin.gz` files. Playable area: 144.935–144.990 E,
  37.800–37.867 S. World frame: metres, x = Hoddle Grid east, z = grid south, origin Swanston × Collins St.
- **Story places**: `js/story/places.js`. Missions use `{ place: 'ID' }`. Run `node tools/melbourne/check-places.mjs`
  (from `melbourne3d/`) after changing any place: it rejects places off the map, near its edge or on water.
- **Not on the map** (mention in dialogue only): Broadmeadows, Ringwood, Dandenong, Alphington, Brighton, Chapel St,
  Luna Park, the freeways, any bridge over the Yarra (none is built yet).
- **Characters**: Microsoft Rocketbox (MIT) and the "ara" cast (`assets/ara/`), animated from motion capture.
- **Licences**: only CC0, CC-BY or MIT assets, because the repo is public. Never real brands or logos: invent fictional
  ones.

## Input & Platform

- **Platforms**: desktop and mobile browsers, hosted on GitHub Pages from the main branch
  (`https://aiappbulder-hub.github.io/GTAMelbourne-/melbourne3d/`).
- **Input**: keyboard and mouse on desktop, on-screen touch controls on mobile, gamepad supported
  (`js/gamepad-controls.js`).

## Conventions

- Match the surrounding code: dense functions, short names, comments only where the reason isn't obvious.
- Missions are data in `MISSIONS` (`js/missions.js`): steps such as `at`, `car`, `time`, `wait`, `targets`, `watch`,
  `evade`, `choice`. Add a step type there rather than a second mission system.
- The save is `gta-melbourne3d-save-v2` (`money`, `progress`, `flags`). A v1 save migrates on load.
- Test hooks are on `window.__city` (teleport, missions, gameplay, cast, voices).

## Milestone discipline

Progress is what the player can do, not files created or mechanics listed. Work one milestone at a time from
`melbourne3d/docs/story/MILESTONES.md`, with its acceptance tests. Deferred for now: boats, trucks, interiors,
the helicopter escape and advanced pedestrian behaviour.

## Performance

- 60 fps on a mid-range laptop, 30 or more on phones. Graphics quality levels are in `js/quality.js`.
- Characters about 15k triangles, textures 1K to 2K.

## Testing

- **Framework**: headless Playwright against `python3 -m http.server 8765` run at the repository root, loading
  `/melbourne3d/index.html?webgl&quality=low&nointro&nofilm`. Chromium is preinstalled. 3D runs on swiftshader at about
  1–2 fps, so allow minutes for the city to load and use generous waits.
- **Checks**: `node tools/melbourne/test-m1.cjs` (Milestone 1, end to end) and `node tools/melbourne/check-places.mjs`.
- **Required**: the game loads without page errors. Look at a screenshot of anything visual before shipping it.

## Forbidden Patterns

- Changing the retired root game.
- Real brand names, logos or trade dress in game content.
- Assets that can't be redistributed in a public repo.
- Bundlers, or a build step.
- A mission placed at a coordinate that isn't in `js/story/places.js` or a real OSM street intersection.
