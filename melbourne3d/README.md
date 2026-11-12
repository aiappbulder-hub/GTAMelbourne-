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

## The city

`index.html` builds Melbourne. Add `?webgl` to force three's WebGL2 backend (for browsers without stable WebGPU, and for
headless testing). The engine began as Slop New York and its Manhattan code and data (`?nyc`, the boroughs, the
hand-built landmarks, the subway entrances, the fire escapes, the New York geodata) have been removed. A few shared
modules still carry an `IS_MELBOURNE` branch for it (`js/city.js` is now a constant), which can be cleaned up in time.

- `js/city-config.js` re-exports `js/melbourne-config.js`, and `js/geodata.js`, `js/city-buildings.js` and
  `js/city-trees.js` load Melbourne's data files.
- Melbourne's config maps the Hoddle Grid onto the engine's grid: its nine north-south streets are the "avenues", its
  five main streets and four little streets the "streets". Everything beyond the grid is driven on the OSM centreline
  graph. The features the engine inherited from Manhattan (Central Park, Broadway, piers, boroughs, bridges) are empty.
- `buildCityGrid` hands Melbourne to `buildMelbourneGrid` (in `js/city-grid.js`): the land deck with the Yarra,
  Victoria Harbour and the lakes cut out, bluestone quay walls, every kerb island's footpath, and the parks.
- The road network keeps every strongly connected network of 12 edges or more. `?debugroads` leaves its inputs and edges on `globalThis.__roadInputs` / `__roadEdges` for checking.
- `window.__city` exposes the scene, controllers, cameras, traffic and `teleportTo` for scripted checks.

## Game

- **Characters** (`js/character-presets.js`): five named Melbourne presets (a local, a street criminal, a local woman,
  a bikie, a Victoria Police officer) on the shared person rig, given to the first five pedestrians.
- **The story: "The Ferryman"** (`js/missions.js`; the design is in `docs/story/SYNOPSIS.md`, `EMPIRE_DESIGN.md`, and the
  milestones with their tests in `MILESTONES.md`). Tonight Callum Reid (you) comes back to Melbourne by boat, twenty-two
  years after he left the same way with Vince Lombardo's black book (who paid whom: police, a developer, a minister's
  office). Thirteen jobs, one thread:
  - **Tonight:** *Low Tide*. A black card, Davo on Harbour Esplanade, a stealth walk past two Kestrel watchers (red view
    cones; a SEEN meter fails the job when full; gunfire fails it too), a grey Comodo to lose (it follows the route you
    actually drive; stay 200 m clear for 8 s), the drive to the Quiet Room (Flinders Lane × Elizabeth St), and a choice
    (keys 1–2). Then a card: **2004**.
  - **2004, as he remembers it:** *Laneway Hustle* (Davo and the last of the book to Carlton), *Word on the Street*
    (who is selling pages?), *The Informant* (Kaz's offer; the tapes), *Westside Bikies* (the pages on a boat in
    Docklands), *Tobacco Wars* (the rest of the pages at South Wharf), *Short Black* (a sit-down in St Kilda with Mick,
    and the photograph), *Harbour Run* (Kestrel raids; the boat). Then a card: **2026**.
  - **Act I, 2026:** *The Quiet Room* (buy Gus's bar three ways, get Ruby out of Southbank with Golden Reef's driver
    behind you, sweep the bar for Kestrel's bug), *Sunday Lunch* (Vince and Nico at Argyle Square, a car chase after the
    hatch that shoots up the table, who inherits Carlton), *Market Day* (photograph three utes at the Queen Victoria
    Market, tail one to the Dudley St yards without being seen, and Kaz), *Doors* (King St's bouncers, a foot chase
    after Bianca Rowe, Terry Maguire), *The Ferryman's Toll* (the raid: out past the uniforms, lose Kestrel, vanish
    into the crowd at Federation Square, Sully, and who keeps the ledger). Then a card: **Act II**.
  - Choices cost money where they should, are saved as story flags, and some change what comes next (Sully greets
    you differently if Davo asked about the grey Comodo; "all of it" on King St means running for it).
  - Someone rides with you: on the way to each Act I job, Davo or Ruby talks it through in the car, and they keep
    talking on the drives inside the jobs.
  - Cut scenes play through by themselves (Enter or a click moves on sooner, Esc skips), and you can't shoot, aim or
    hold anyone up while one is playing or a choice is on screen.
  - Pink beam: the next job; yellow beam: the objective, with the GPS route on the map. Between jobs, the objective line
    says where the next one is (distance and direction) and the map's waypoint points to it.
  - An on-screen pointer shows the distance to the marker that matters: the next job (pink), the objective (yellow)
    or the nearest target (red). The marker beams are 140 m tall. The minimap and its GPS route stay on phones.
  - The Albert Park Grand Prix is no longer a job: it is under "Race" in the Jobs list.
- **Between jobs**: a few seconds after a job (or after the game loads) your phone rings: a card says who is calling,
  what they want and where the pink marker is (distance and compass direction). It comes up again if you stand about.
- **New game** (toolbar): asks first, then wipes cash, progress, choices and the till and starts the story again from
  the intro, on foot by Harbour Esplanade.
- **Taking a car** (`js/gameplay.js`): you walk to the door, reach for it and sit before you can drive (about 1.3 s).
  A car with someone in it brakes to a stop, the driver is pulled out, goes down, gets up and runs. Getting out is a
  short step from the seat. F beside your own car (or one a job left for you) takes that one, not a passing car.
- **Bridges** (`js/bridges.js`, `tools/melbourne/find-bridges.mjs`): Princes Bridge (three iron arches, bluestone piers,
  lamp standards), Queens Bridge (five girder spans), Spencer St, Swan St and Charles Grimes bridges have decks, kerbs,
  footpaths and solid railings. Decks are flat at road level, because traffic, trams and lane paint are drawn at a
  fixed height. Kings Way's crossing isn't in the road data, and the footbridges aren't built yet.
- **The Book** (`js/empire.js`): press **K** or the Book button once the Quiet Room is yours.
  - *Ledger:* the eleven territories, your share of each (the Grid from the bar and the King St doors, Carlton from
    Vince, North Melbourne from Kaz), what that pays a day, and Kestrel's interest in you.
  - *People:* who is with you, wary of you or against you, and why. *Record:* what you chose, in order.
  - The take builds up while you play (a game day is 48 minutes) and the till holds three days of it. Walk into the
    Quiet Room between jobs and Ruby hands it over.
  - All of it is worked out from the story's saved choices; lieutenants and orders come with Act II.
- **Police and the wanted level** (`js/wanted.js`): shoot someone, run someone down, take a car or hold someone up and you
  get stars (up to 5). A person or a police car that sees it counts at once (a police car seeing it is two stars). If
  nobody is around, it is reported a few seconds later anyway. One police car per star (four at most) spawns well back on
  the route you drove and follows it with a siren; they are solid, you can't drive through them. Lose them (stay
  230 m clear for 10 s), cool off, or get BUSTED (stopped with a police car within 16 m for 2.5 s: 12% of your cash).
  There are twice as many police cars in the traffic.
- **Horn** (`js/car-sounds.js`): hold **B** in a car, or the HORN button on touch screens. A two-tone horn for as long
  as you hold it.
- **Voices** (`js/voice-manager.js`, `data/character-voices.json`): recorded lines play where they exist; any line without
  a recording is spoken by the browser's own voice (an Australian one where the device has it). Tools:
  `node tools/voices/sync-lines.mjs [--prune]` finds every line the story says and adds the missing ones to the voice
  data; `tools/voices/generate.py` records them offline.
- **Save** (`gta-melbourne3d-save-v2`): cash, progress and story choices (`flags`). A save from the older ten-job story
  keeps its cash and choices and starts the new story from the top; an unreadable one starts a new game.
- **Story places** (`js/story/places.js`): missions use `{ place: 'ID' }`.
  `node tools/melbourne/check-places.mjs` fails on any place off the map, near its edge or on water, and prints each
  place's neighbourhood (`districtAt`, now along the real boundaries: the Yarra, Victoria Pde, Nicholson St, Punt Rd).
- **The start**: the title film, then the intro (Callum's voice-over over the city, Vince's call), ending with you on
  Harbour Esplanade by the first job's marker. Skipping the intro puts you there too. Walk or drive into the pink marker
  to start. Cutscene dialogue is advanced with Enter or a click. Timers, cash and progress are saved. The teleport
  menu's Jobs list takes you to any job and starts it.
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
  - The **sports car**: the old game's HSB Clubbie R8 in red, parked on Elizabeth St by the first job ("Get the
    sports car" in the teleport menu brings it beside you). 0-100 km/h in 3 s, 281 km/h flat out, harder brakes, more
    grip; the view widens with speed and the speedo reads to 300.
  - **Car** button (or **X**): cycles your own cars: the taxi, the HSB Clubbie R8 (281 km/h), the Holdan Comodo SS,
    a Victoria Police pursuit car, the Fjord Strainger ute, the Barrina hatch and the Fjord Territorial (the old game's
    Blender models, each with its own handling); in a car it swaps on the spot, on foot it brings the next one round.
  - **Weather** button (or **Y**): clear, overcast, rain (falling rain, wet roads) and fog, over any time of day.
  - A speedo dial while driving; on grass the wheels dig in (the car sinks, slows, loses grip, bounces and leaves ruts).
  - **T** talks to the person in front of you (they stop, turn and answer); **T** while aiming robs them.
- **Title film** (`assets/video/intro.mp4`, 15 s): after the first key or tap it plays full screen, ending on the GTA MELBOURNE
  title, then hands on to the intro's shots; Esc, Enter, Space or Skip end it, and `?nofilm` leaves it out.
- **Intro** (`js/intro.js`): golden-hour wide shots (the skyline over Yarra Park, Flinders Street Station, Lygon
  Street, Docklands into the sunset, Eureka, down Swanston Street) letterboxed, with the player's own voice setting up the story and
  Vince's phone call, to a synthesised score, ending on the player at the first job. The first time, a title card
  waits for a key or a tap (so the music can play); Esc / Enter / Skip end it; replay it from the teleport menu or
  with `?intro`.
- **Albert Park** (`js/race-track.js`): the real 5.3 km Grand Prix loop, from OSM's "Albert Park Circuit" relation via
  `tools/melbourne/build-circuit.mjs` into `js/albert-park-circuit.js`.
  - The track is an 11 m asphalt ribbon following Aughtie Drive, Albert Road Drive, Lakeside Drive, Ross Gregory Drive
    and the raceway-only links. It has white edge lines, red and white kerbs on the corners, a chequered start/finish
    line on the pit straight and a grandstand.
  - The car counts the track as asphalt, never grass.
  - The park itself is open grass right up to the kerb: no paved walks and no lamp posts. Lakes inside park blocks are
    cut out of the lawn.
  - Hot Lap is one clockwise lap of it, with five checkpoints.
- **St Kilda** (`js/stkilda.js`): the job "Short Black" (after Westside Bikies).
  - Kaz and her fence, Mick, sit at the front table of the Short Black café on Acland Street's café strip. The
    café has parasols, cups and an A-frame board.
  - In the cut scene the player sits with them. The camera opens wide on the street, then cuts over the listener's
    shoulder to each speaker, all in seated animation.
  - The job sends you out along St Kilda Pier to the kiosk at its end. The pier is built from its real OSM outline
    and you can walk on it.
- **Character animation**: Rocketbox motion capture for the story.
  - Cut-scene lines carry a mood (angry, excited, self-assured, cool), with listening, nods and shrugs.
  - Givers phone, wave and wait at their markers.
  - The crowd waits, texts, looks round and takes turns in conversation.
  - The player looks about when idle and cheers on passing a job.
- **The Albert Park Grand Prix** (`js/race.js`): two laps against five AI cars on the real circuit.
  - Start it from the Jobs list or the blue marker in the pits. There's a grid and a 3-2-1 countdown.
  - Rivals follow a curvature speed profile set against your car, pass slower cars and tuck in behind.
  - The HUD shows lap, position and time; the top three places pay a prize.
- **Guns in hand**: the player holds the pistol, Uzi or shotgun.
  - Aiming (right mouse or Q) or firing raises the arms to point it, two-handed for the long guns.
  - Shots flash from the muzzle.
- **The intro**:
  - Narrated in the player's own voice (Orpheus `cooper`, who also speaks your cut-scene lines).
  - Ground-level shots with the cast: Vince and his crew on Lygon Street, Kaz and her gang in Docklands at sunset,
    two police officers at Southbank, and Vince making his call.
- **Trams** brake for anyone, or anything, on the track ahead.
- **Steering**: more grip and a lock that falls off more gently with speed. The standard car turns a ~26 m circle at
  70 km/h, and both cars corner at about 1–1.4 g.
- **Trams** (`js/trams.js`): 22 real routes from OpenStreetMap with rails and overhead wire, the old game's tram model.
- **Landmarks** (`js/melbourne-landmarks.js`): the old game's models of Flinders Street Station, Eureka, St Paul's,
  the MCG, Parliament, the Exhibition Building, the Shrine, the Arts Centre spire, Rialto and Fed Square, sized to the
  real buildings.
- **Graphics quality** (`js/quality.js`): High by default on every device; the GFX menu in the toolbar picks High, Medium or Low (saved), or `?quality=`;
  dynamic resolution keeps any level playable.
- **Melbourne, not New York:** Victoria Police chequers, PTV bus colours, Victorian plates, a Melbourne taxi, white
  Australian lane lines, charcoal signals, Australia Post boxes, blue street signs, km/h; no subway entrances, steam
  stacks, hot-dog carts, hydrants, water towers or fire escapes.
- **Voices** (`js/voice-manager.js`): recorded Australian-English voices, made offline with the Orpheus Australian
  TTS (Apache-2.0) from `../data/character-voices.json` into `../assets/audio/`.
  - The cast: Vince, Kaz, a Victoria Police officer, and male and female locals.
  - Where they speak: the intro call, mission cut scenes, people you talk to (T), overheard street conversations,
    police barks and radio after gunfire or a carjacking.
  - How they play: positional, with word-by-word subtitles, priorities and interruptions, and no repeats.
  - See `../assets/audio/README.md` for the licences and how to make more.

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
  by the method Slop New York used (`tools/melbourne/blocks.mjs`, which uses `tools/geo-geometry.mjs`): streets, tram tracks
  and the grid's chain-wide roads stamped onto a 1 m land raster, the islands left over traced, given a property line
  and covered with lots. Inside the Hoddle Grid only the grid's own measured street lines are stamped, so its blocks are
  exact rectangles, and the buildings there are clipped to their blocks' property lines (the real streets wander a few
  metres off the straight lines).
