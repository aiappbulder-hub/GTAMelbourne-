# Graph Report - melbourne3d  (2026-11-11)

## Corpus Check
- 109 files · ~340,215 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 25 file(s) not represented in the graph (top: .glb 20, (none) 2, .gz 2)

## Summary
- 1696 nodes · 3607 edges · 76 communities (70 shown, 6 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 160 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- cars.js / controllers.js
- nyc-map.js / NYCMapSystem
- initApp() / TouchControls
- pedestrians.js / hairShellRing()
- CityAudioSystem / audio-events.js
- city-grid.js / buildCityGrid()
- melbourne-config.js / AVENUE_BY_ID
- tsl-materials.js / noise2D
- createPedestrianSystem() / pedestrian-system.js
- build-geodata.mjs / buildRoadGraph()
- buildCityBlocks() / polygonBoxOverlaps()
- ThirdPersonControllerMan / PersonCrowd
- createTrafficSystem() / update()
- build-buildings.mjs / quantRing()
- createGameplay() / update()
- trees.js / buildTreeGeometries()
- buildRoadNetwork() / curvePoint()
- createMissionSystem() / update()
- createCast() / play()
- osm.mjs / build-circuit.mjs
- buildings.js / road-network.js
- main.js / quality.js
- street-details.js / buildStreetDetails()
- race-track.js / race.js
- gameplay.js / wanted.js
- PersonRig / .solve()
- Raster / makeBlocks()
- People quality bar / G1 Davo glued to player 
- people.js / intro.js
- audio-sources.js / .collect()
- kinds / .basin()
- benchmark-pedestrians.mj / frame()
- mayEnter() / accelerate()
- createIntro() / createScore()
- ref_playwright / measure-clumping.cjs
- The Ferryman: story in o / EMPIRE_DESIGN: crime emp
- Faction bible (nine fact / Eleven territories
- check-places.mjs / Map audit (playable boun
- car-mods.js / build()
- .updateGait() / .update()
- scene-culling.js / setupSceneCulling()
- build-trees.mjs / ref_node_crypto
- optimize.py / main()
- buildPersonGeometry() / createPersonMaterial()
- createVoiceManager() / say()
- buildManhattanWaterfront / quad()
- melbourne-building-geoda / REAL_BUILDINGS
- createRace() / update()
- trams.js / createTramSystem()
- createWanted() / update()
- The Ferryman: milestones / Lieutenant management de
- M13 Neutral Ground (Act  / M12 Sundown
- Callum Reid (the Ferryma / The ledger / Vince's bla
- chooseMove() / drive()
- ref_node_fs / fetch-osm.mjs
- ref_three / melbourne-landmarks.js
- ships / .schooner()
- createPursuer() / update()
- collideTraffic() / collideWithPlayer()
- Rocketbox people assets  / Ara cast table (player, 
- export.cjs / Ara character pipeline (
- voice-manager.js / Technical integration ph
- melbourne-tree-geodata.j / city-trees.js
- ROADS / shortName()
- missions.js / stkilda.js
- districtAt() / getLocationLabel()
- convert.cjs / ref_path
- M2 The Quiet Room / M3 Sunday Lunch
- createStKilda() / buildCafe()
- createTreeMaterial() / TreeNodeMaterial
- createRoadPaintChunkBuil / createRoadPaintMaterial(
- BodyBuilder / .loft()
- Melbourne 3D README (Slo / City switch: Melbourne c
- hash01() / .constructor()
- build-cast.sh / build-cast.sh script
- {
  AVENUES,
  ALL_AVENU

## God Nodes (most connected - your core abstractions)
1. `createTrafficSystem()` - 100 edges
2. `initApp()` - 64 edges
3. `buildCityGrid()` - 42 edges
4. `createPedestrianSystem()` - 33 edges
5. `PersonRig` - 33 edges
6. `ThirdPersonControllerManager` - 32 edges
7. `createGameplay()` - 32 edges
8. `createMissionSystem()` - 29 edges
9. `createCast()` - 26 edges
10. `buildRoadNetwork()` - 26 edges

## Surprising Connections (you probably didn't know these)
- `Low Tide mission (stealth, tail, Quiet Room choice)` --semantically_similar_to--> `M1 Low Tide`  [INFERRED] [semantically similar]
  README.md → docs/story/EMPIRE_DESIGN.md
- `Role to avatar mapping table` --semantically_similar_to--> `Ara cast table (player, Vince, Kaz, Mick, Davo)`  [INFERRED] [semantically similar]
  assets/people/README.md → tools/ara/README.md
- `update()` --indirect_call--> `q()`  [INFERRED]
  js/traffic.js → tools/melbourne/build-geodata.mjs
- `Voice system (Orpheus Australian TTS, browser fallback)` --conceptually_related_to--> `Technical integration phases 0-5`  [INFERRED]
  README.md → docs/story/EMPIRE_DESIGN.md
- `Save format gta-melbourne3d-save-v2` --conceptually_related_to--> `M1 tickets 1.1-1.9 with acceptance tests`  [INFERRED]
  README.md → docs/story/MILESTONES.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **People quality bar, measured glitches and verified fixes** — docs_quality_people_bar, docs_quality_people_glitches, docs_quality_people_glitches_fixes, docs_quality_people_bar_standards [EXTRACTED 0.85]
- **Ferryman story design documents** — docs_story_synopsis, docs_story_empire_design, docs_story_milestones, readme_the_ferryman_story [EXTRACTED 0.95]
- **Character asset pipelines (Rocketbox and Ara) feeding people.js** — assets_people_readme, tools_ara_readme, js_people, tools_ara_readme_cast [INFERRED 0.85]

## Communities (76 total, 6 thin omitted)

### Community 0 - "cars.js / controllers.js"
Cohesion: 0.06
Nodes (85): buildBusSignGeometry(), buildBusWheelGeo(), buildLoftedBusBodyGeometry(), BUS_PARTS, BUS_SPEC, busRake(), createBusWheelMaterial(), createLoftedBusMaterial() (+77 more)

### Community 1 - "nyc-map.js / NYCMapSystem"
Cohesion: 0.06
Nodes (16): accessor(), addLine(), addRing(), boundsOf(), drawPlayerArrow(), drawRoute(), drawWaypoint(), footprintLayers() (+8 more)

### Community 2 - "initApp() / TouchControls"
Cohesion: 0.06
Nodes (20): CameraSystem, axis(), buttons(), buttonValue(), GamepadControls, steeringAxis(), stick(), LightingSystem (+12 more)

### Community 3 - "pedestrians.js / hairShellRing()"
Cohesion: 0.03
Nodes (61): _ankle, ARM, AX, AY, AZ, _bend, BIND, BONE (+53 more)

### Community 4 - "CityAudioSystem / audio-events.js"
Cohesion: 0.09
Nodes (36): clamp(), crashBody(), crashDebris(), crashMetal(), createEventResources(), createWindVoice(), finite(), footstep() (+28 more)

### Community 5 - "city-grid.js / buildCityGrid()"
Cohesion: 0.09
Nodes (46): addStoneArchBridge(), addStreetGround(), batchStaticGroupMeshes(), buildCityGrid(), addBench(), addBox(), addLamp(), addPavedPlaza() (+38 more)

### Community 6 - "melbourne-config.js / AVENUE_BY_ID"
Cohesion: 0.04
Nodes (42): AVENUE_BY_ID, AVENUES, BLOCK_GRID, BROADWAY_LINE, BRONX_POLYGON, BRONX_POLYGONS, BROOKLYN_POLYGONS, CENTRAL_PARK_BOUNDS (+34 more)

### Community 7 - "tsl-materials.js / noise2D"
Cohesion: 0.11
Nodes (48): apartmentInteriorBehind(), _billboardCache, boxCoverage, bumpNormal, canyonSkyAONode, _carPaintCache, createBillboardCanvasTexture(), createBillboardMaterial() (+40 more)

### Community 8 - "createPedestrianSystem() / pedestrian-system.js"
Cohesion: 0.09
Nodes (42): G7 crowd and cast pass through each other, G8 bodies vanish on camera, createMelbourneCharacterRig(), MELBOURNE_CHARACTER_PRESETS, createPedestrianRoutes(), across(), along(), canDodge() (+34 more)

### Community 9 - "build-geodata.mjs / buildRoadGraph()"
Cohesion: 0.06
Nodes (41): rdp(), addPolyline(), ALIAS, atGrade, bb, blocks, bounds, BOX (+33 more)

### Community 10 - "buildCityBlocks() / polygonBoxOverlaps()"
Cohesion: 0.09
Nodes (22): CityAcoustics, thickness(), circleContact(), polygonBoxOverlaps(), polygonContact(), polygonContains(), polygonSegmentFraction(), addBuildingDetails() (+14 more)

### Community 11 - "ThirdPersonControllerMan / PersonCrowd"
Cohesion: 0.11
Nodes (8): buildingContact(), collisionBody(), driveSpeed(), personGround(), ThirdPersonControllerManager, PersonCrowd, createCarPaintMaterial(), createContactShadowMaterial()

### Community 12 - "createTrafficSystem() / update()"
Cohesion: 0.11
Nodes (29): clamp(), createTrafficSystem(), buildOccupancy(), flagRange(), knock(), laneClear(), locate(), nearView() (+21 more)

### Community 13 - "build-buildings.mjs / quantRing()"
Cohesion: 0.06
Nodes (30): area(), body, buildings, digest, FLOOR, gz, header, hs (+22 more)

### Community 14 - "createGameplay() / update()"
Cohesion: 0.14
Nodes (30): createGameplay(), bang(), beforeMode(), board(), cycleCar(), drawTicks(), enterOwnTaxi(), enterSports() (+22 more)

### Community 15 - "trees.js / buildTreeGeometries()"
Cohesion: 0.14
Nodes (26): addCard(), addTube(), along(), buildSprays(), buildTreeGeometries(), coverageMips(), createLeafAtlas(), createTreeClearance() (+18 more)

### Community 16 - "buildRoadNetwork() / curvePoint()"
Cohesion: 0.10
Nodes (24): buildRoadNetwork(), addEdge(), addEdgeGeneral(), apart(), centrelineStreets(), junction(), inOrder(), inTheWay() (+16 more)

### Community 17 - "createMissionSystem() / update()"
Cohesion: 0.19
Nodes (25): createMissionSystem(), advanceCut(), big(), chapterCard(), cleanup(), cone(), cutActions(), fail() (+17 more)

### Community 18 - "createCast() / play()"
Cohesion: 0.18
Nodes (26): createCast(), acquire(), action(), aimArms(), animateSeated(), assign(), drop(), faceLife() (+18 more)

### Community 19 - "osm.mjs / build-circuit.mjs"
Cohesion: 0.11
Nodes (23): file, flat, loop, { nodes, ways, relations }, ordered, out, pit, rel (+15 more)

### Community 20 - "buildings.js / road-network.js"
Cohesion: 0.10
Nodes (8): CITY, IS_MELBOURNE, FAR, GEO, buildRoadPaint(), GREEN, WHITE, YELLOW

### Community 21 - "main.js / quality.js"
Cohesion: 0.12
Nodes (18): CAMERA_PRESETS, FOG_GREY, TIME_PRESETS, WEATHER, WEATHER_ORDER, choose(), detectGpu(), GPU_NAME (+10 more)

### Community 22 - "street-details.js / buildStreetDetails()"
Cohesion: 0.11
Nodes (11): buildStreetDetails(), nearbyLights(), smoothFade(), update(), createStreetSignBladeTexture(), createTrafficSignalLensMaterial(), createWalkSignalMaterial(), hashPos() (+3 more)

### Community 23 - "race-track.js / race.js"
Cohesion: 0.17
Nodes (20): pathDriver (AI driver extracted from race.js), AI road network split into 14 networks, CIRCUIT, CIRCUIT_LENGTH, PIT_LANE, PRIZES, RIVALS, BOUNDS (+12 more)

### Community 24 - "gameplay.js / wanted.js"
Cohesion: 0.11
Nodes (13): G5 snap turns, createCarSounds(), SPORTS_DRIVE, CUSTOM_CARS, GREETINGS, LINES, WEAPONS, ALBERT_PARK (+5 more)

### Community 25 - "PersonRig / .solve()"
Cohesion: 0.26
Nodes (5): ankleAt(), PersonRig, qX(), qY(), qZ()

### Community 26 - "Raster / makeBlocks()"
Cohesion: 0.16
Nodes (12): bbox(), Raster, rdpRing(), ringArea(), makeBlocks(), blockFrames(), destair(), lotRects() (+4 more)

### Community 27 - "People quality bar / G1 Davo glued to player "
Cohesion: 0.13
Nodes (18): People quality bar, Procedural crumple keyframe table (DIVE_POSES format), G11 shooting the cast does nothing, G1 Davo glued to player (P0), G2 cars pass through pedestrians (P0), G3 shot dive reads as stunt, G4 watchers and Davo sunk into ground, Hand-off plan (QA, programmers, tech artist) (+10 more)

### Community 28 - "people.js / intro.js"
Cohesion: 0.12
Nodes (17): G6 gestures lock body and loop with pop, ARRIVE, buildCastShots(), face(), footpathNear(), landNear(), SHOTS, ACTIVE (+9 more)

### Community 29 - "audio-sources.js / .collect()"
Cohesion: 0.24
Nodes (9): CityAudioSources, driveLoad(), helicopterLoad(), helicopterVerticalSpeed(), NearestSources, roadLoad(), seedAt(), unit() (+1 more)

### Community 31 - "benchmark-pedestrians.mj / frame()"
Cohesion: 0.11
Nodes (11): alwaysSolve, baseline, baselinePlayer, BaselineRig, deferred, DeferredRig, frame(), ground() (+3 more)

### Community 32 - "mayEnter() / accelerate()"
Cohesion: 0.19
Nodes (19): connector(), accelerate(), alongside(), besideTail(), canStop(), claim(), cross(), enter() (+11 more)

### Community 33 - "createIntro() / createScore()"
Cohesion: 0.20
Nodes (16): createIntro(), apply(), arrive(), endFilm(), filmKey(), play(), playFilm(), prompt() (+8 more)

### Community 34 - "ref_playwright / measure-clumping.cjs"
Cohesion: 0.11
Nodes (6): { chromium }, { chromium }, { chromium }, { chromium }, { chromium }, { chromium }

### Community 35 - "The Ferryman: story in o / EMPIRE_DESIGN: crime emp"
Cohesion: 0.15
Nodes (17): EMPIRE_DESIGN: crime empire story and territory design, M1 Low Tide, Missing map connections and geography list, Yarra has no bridges, Prologue 2004 (existing ten jobs as flashback), New mission step types (choice, sitdown, stealth, tail, evade, search, photo, lift, blend, escort, defend, heli, passenger, orders), Three-act storyline (Prologue, Low Tide, The Board, The Crossing), Three endings: Crown, Badge, Ferry (+9 more)

### Community 36 - "Faction bible (nine fact / Eleven territories"
Cohesion: 0.12
Nodes (17): Broadmeadows firm, Callum Reid, the Ferryman (protagonist), Doherty family, The Esplanade (Lenny Szabo), Faction bible (nine factions), Golden Reef (junket), Kingsgate Security, Lygon Street Crew (+9 more)

### Community 37 - "check-places.mjs / Map audit (playable boun"
Cohesion: 0.16
Nodes (12): check-places validator (guard against invented geography), districtAt label defects, Map audit (playable bounds, suburbs, defects), places.json (59 verified story places), Playable boundary 5 x 7.5 km, Tobacco Wars marker defect (South Wharf Drive), GEO, PLACES (+4 more)

### Community 38 - "car-mods.js / build()"
Cohesion: 0.24
Nodes (16): build(), material(), createCarMods(), add(), fromFile(), db(), decodeDDS(), forget() (+8 more)

### Community 39 - ".updateGait() / .update()"
Cohesion: 0.21
Nodes (9): clamp01(), clampAbs(), ease(), lerp(), reachTop(), smin(), smooth(), syncEase() (+1 more)

### Community 40 - "scene-culling.js / setupSceneCulling()"
Cohesion: 0.17
Nodes (16): _a, _b, _c, chunkInstancedMesh(), copyObjectState(), instanceSize(), isStaticMesh(), _m (+8 more)

### Community 41 - "build-trees.mjs / ref_node_crypto"
Cohesion: 0.12
Nodes (12): body, gz, header, nyc, OUT_BIN, OUT_JS, pts, raw (+4 more)

### Community 42 - "optimize.py / main()"
Cohesion: 0.20
Nodes (5): main(), read(), split_parts(), dense(), target()

### Community 43 - "buildPersonGeometry() / createPersonMaterial()"
Cohesion: 0.14
Nodes (15): armSkin(), bindJoints(), buildPersonGeometry(), createPersonMaterial(), headBump(), legSkin(), limbRing(), lobe() (+7 more)

### Community 44 - "createVoiceManager() / say()"
Cohesion: 0.31
Nodes (16): createVoiceManager(), context(), event(), load(), nearestPolice(), note(), pick(), pickVoice() (+8 more)

### Community 45 - "buildManhattanWaterfront / quad()"
Cohesion: 0.24
Nodes (10): buildManhattanWaterfrontEdge(), barrier(), belt(), jerseyCap(), paintLine(), quad(), railing(), runs() (+2 more)

### Community 46 - "melbourne-building-geoda / REAL_BUILDINGS"
Cohesion: 0.18
Nodes (9): body, count, delta(), header, metadata, REAL_BUILDINGS, uint(), xs (+1 more)

### Community 47 - "createRace() / update()"
Cohesion: 0.28
Nodes (12): createRace(), buildProfile(), collide(), end(), finish(), laneOf(), model(), placeRivals() (+4 more)

### Community 48 - "trams.js / createTramSystem()"
Cohesion: 0.24
Nodes (9): buildTracks(), createTramSystem(), blockedAhead(), place(), update(), Line, loadTramParts(), toPts() (+1 more)

### Community 49 - "createWanted() / update()"
Cohesion: 0.35
Nodes (13): createWanted(), busted(), clearUnits(), crime(), flash(), raise(), record(), reset() (+5 more)

### Community 50 - "The Ferryman: milestones / Lieutenant management de"
Cohesion: 0.18
Nodes (12): empire.js territory and lieutenant system (planned), Lieutenant management design (attributes, tick, orders), Lieutenant candidates, The mole selection rule, Repeatable territory missions, The Book (empire UI panel), The Ferryman: milestones and tickets, Event-driven betrayal (no hidden score) (+4 more)

### Community 51 - "M13 Neutral Ground (Act  / M12 Sundown"
Cohesion: 0.17
Nodes (12): M10 Short Change, M11 The Bend, M12 Sundown, M13 Neutral Ground (Act II finale), M14 The Long Way Round, M15 Red Light, M16 The Rezoning, M17 Dawn Service (+4 more)

### Community 52 - "Callum Reid (the Ferryma / The ledger / Vince's bla"
Cohesion: 0.18
Nodes (12): Gerald Ashcombe, Callum Reid (the Ferryman), Karen Kaz Whitlock, The ledger / Vince's black book, Detective Inspector Helen Marsh, The memory (2004, seven jobs), Mick Fallon, Nico Lombardo (+4 more)

### Community 53 - "chooseMove() / drive()"
Cohesion: 0.21
Nodes (12): ahead(), brake(), changeLanes(), chooseMove(), drive(), follow(), laneAcc(), laneSafe() (+4 more)

### Community 54 - "ref_node_fs / fetch-osm.mjs"
Cohesion: 0.20
Nodes (7): DIR, f(), fetchTile(), sleep(), tiles, [out = 'map.svg', ...v], parts

### Community 55 - "ref_three / melbourne-landmarks.js"
Cohesion: 0.18
Nodes (5): LANDMARKS, createPostProcessing(), LOOKS, useSedanModel(), Trams and 3D landmarks

### Community 57 - "createPursuer() / update()"
Cohesion: 0.31
Nodes (9): createPursuer(), bendAhead(), carAhead(), collide(), loadModel(), place(), start(), trailLength() (+1 more)

### Community 58 - "collideTraffic() / collideWithPlayer()"
Cohesion: 0.36
Nodes (10): collideTraffic(), collideWithPlayer(), impactSuspension(), readTrafficBody(), reportCollision(), spawnCollisionSparks(), writeTrafficVelocity(), resolveVehicleContact() (+2 more)

### Community 59 - "Rocketbox people assets  / Ara cast table (player, "
Cohesion: 0.20
Nodes (10): Rocketbox people assets README, build-cast.sh FBX to GLB conversion, Microsoft Rocketbox Avatar Library (MIT), Role to avatar mapping table, Trimmed avatar set (CROWD=false), Cut rather than fix (scope discipline), Deferred features (boats, trucks, interiors, helicopter, advanced pedestrians), Davo Kearney (+2 more)

### Community 60 - "export.cjs / Ara character pipeline ("
Cohesion: 0.20
Nodes (8): G18 three art styles side by side, { chromium }, CLIPS, fs, LOOK, Ara 3D Gen character pipeline README, Shared animation clips (CMU mocap) retargeted by leg length, Ara character pipeline (export.cjs, optimize.py)

### Community 61 - "voice-manager.js / Technical integration ph"
Cohesion: 0.24
Nodes (9): Technical integration phases 0-5, AUDIO_URL, COOLDOWN, DATA_URL, key(), PRIORITY, silent(), words() (+1 more)

### Community 62 - "melbourne-tree-geodata.j / city-trees.js"
Cohesion: 0.20
Nodes (6): body, count, header, REAL_TREES, xs, zs

### Community 63 - "ROADS / shortName()"
Cohesion: 0.20
Nodes (10): ALL_AVENUES, ALL_STREETS, BLOCKS, gridDir(), ROADS, shortName(), slug(), titleCase() (+2 more)

### Community 64 - "missions.js / stkilda.js"
Cohesion: 0.22
Nodes (4): MISSIONS, ACLAND_NEAR, PIER, PIER_END

### Community 65 - "districtAt() / getLocationLabel()"
Cohesion: 0.25
Nodes (9): blockAt(), districtAt(), getLocationLabel(), inWater(), nearestRoads(), NYC_LANDMARKS, pointInPoly(), riverZ() (+1 more)

### Community 66 - "convert.cjs / ref_path"
Cohesion: 0.22
Nodes (7): { chromium }, CLIPS, fs, path, SIT, STORY, [work, out, ...names]

### Community 67 - "M2 The Quiet Room / M3 Sunday Lunch"
Cohesion: 0.25
Nodes (8): M2 The Quiet Room, M3 Sunday Lunch, M4 Market Day, M5 Doors, M6 The Ferryman's Toll (Act I finale), M7 Gertrude Street, M8 Members Only, Milestone 2: Act I complete

### Community 68 - "createStKilda() / buildCafe()"
Cohesion: 0.39
Nodes (6): createStKilda(), buildCafe(), findCafe(), marker(), seat(), update()

### Community 69 - "createTreeMaterial() / TreeNodeMaterial"
Cohesion: 0.29
Nodes (3): createTreeMaterial(), FoliageLightingModel, TreeNodeMaterial

### Community 70 - "createRoadPaintChunkBuil / createRoadPaintMaterial("
Cohesion: 0.47
Nodes (6): createRoadPaintChunkBuilder(), build(), pushQuad(), strip3D(), createRoadPaintMaterial(), roadWetMasks()

### Community 72 - "Melbourne 3D README (Slo / City switch: Melbourne c"
Cohesion: 0.60
Nodes (5): Melbourne 3D README (Slop New York based engine), City switch: Melbourne config and grid builder, Melbourne-specific details replacing New York, Four-step plan (data, engine, Melbourne pieces, game), Slop New York engine (three.js r187 WebGPU/WebGL2, TSL)

## Knowledge Gaps
- **35 isolated node(s):** `{
  AVENUES,
  ALL_AVENUES,
  CENTRAL_PARK_BOUNDS,
  getIslandBoundsAtZ,
  MANHATTAN_COASTLINE,
  getBroadwayX,
  BROADWAY_LINE,
  WATERFRONT_PIERS,
  ROOSEVELT_ISLAND_POLYGON,
  GOVERNORS_ISLAND_POLYGON,
  NJ_SHORELINE_POLYGON,
  LONG_ISLAND_POLYGONS,
  BROOKLYN_POLYGONS,
  QUEENS_POLYGONS,
  BRONX_POLYGONS,
  WESTCHESTER_POLYGON,
  NASSAU_POLYGON,
  UPPER_MANHATTAN_POLYGON,
  BRONX_POLYGON,
  STATEN_ISLAND_POLYGON,
  RANDALLS_ISLAND_POLYGON,
  LIBERTY_ISLAND_POLYGON,
  LIBERTY_STATUE_POS,
  ELLIS_ISLAND_POLYGON,
  MILL_ROCK_POLYGON,
  EAST_RIVER_BRIDGES,
  OUTER_BRIDGES,
  STREETS,
  ALL_STREETS,
  ROADS,
  NYC_LANDMARKS,
  LANDMARK_SITES,
  TELEPORT_LOCATIONS,
  ISLAND_BOUNDS,
  BLOCKS,
  CUT_Z,
  SIGNAL_TIMING,
  streetZ,
  avenueX,
  districtAt,
  blockAt,
  nearestRoads,
  getBlockBounds,
  getLocationLabel,
  fromOldFrame,
  isTypingInField,
  signalPhase,
  walkSignal,
  SPAWN,
  GRID_ZONE,
  SCENIC_VIEWS
}`, `Road network (strongly connected, 12+ edges, debugroads)`, `Police and wanted level system`, `Save format gta-melbourne3d-save-v2`, `Title film and intro sequence` (+30 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 525 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `initApp()` connect `initApp() / TouchControls` to `cars.js / controllers.js`, `nyc-map.js / NYCMapSystem`, `CityAudioSystem / audio-events.js`, `city-grid.js / buildCityGrid()`, `buildCityBlocks() / polygonBoxOverlaps()`, `ThirdPersonControllerMan / PersonCrowd`, `createTrafficSystem() / update()`, `buildings.js / road-network.js`, `main.js / quality.js`, `street-details.js / buildStreetDetails()`, `race-track.js / race.js`, `gameplay.js / wanted.js`, `people.js / intro.js`, `car-mods.js / build()`, `scene-culling.js / setupSceneCulling()`, `trams.js / createTramSystem()`, `ref_three / melbourne-landmarks.js`, `voice-manager.js / Technical integration ph`, `missions.js / stkilda.js`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `createTrafficSystem()` (e.g. with `mayCross()` and `nearestCar()`) actually correct?**
  _`createTrafficSystem()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **What connects `{
  AVENUES,
  ALL_AVENUES,
  CENTRAL_PARK_BOUNDS,
  getIslandBoundsAtZ,
  MANHATTAN_COASTLINE,
  getBroadwayX,
  BROADWAY_LINE,
  WATERFRONT_PIERS,
  ROOSEVELT_ISLAND_POLYGON,
  GOVERNORS_ISLAND_POLYGON,
  NJ_SHORELINE_POLYGON,
  LONG_ISLAND_POLYGONS,
  BROOKLYN_POLYGONS,
  QUEENS_POLYGONS,
  BRONX_POLYGONS,
  WESTCHESTER_POLYGON,
  NASSAU_POLYGON,
  UPPER_MANHATTAN_POLYGON,
  BRONX_POLYGON,
  STATEN_ISLAND_POLYGON,
  RANDALLS_ISLAND_POLYGON,
  LIBERTY_ISLAND_POLYGON,
  LIBERTY_STATUE_POS,
  ELLIS_ISLAND_POLYGON,
  MILL_ROCK_POLYGON,
  EAST_RIVER_BRIDGES,
  OUTER_BRIDGES,
  STREETS,
  ALL_STREETS,
  ROADS,
  NYC_LANDMARKS,
  LANDMARK_SITES,
  TELEPORT_LOCATIONS,
  ISLAND_BOUNDS,
  BLOCKS,
  CUT_Z,
  SIGNAL_TIMING,
  streetZ,
  avenueX,
  districtAt,
  blockAt,
  nearestRoads,
  getBlockBounds,
  getLocationLabel,
  fromOldFrame,
  isTypingInField,
  signalPhase,
  walkSignal,
  SPAWN,
  GRID_ZONE,
  SCENIC_VIEWS
}`, `Road network (strongly connected, 12+ edges, debugroads)`, `Police and wanted level system` to the rest of the system?**
  _35 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cars.js / controllers.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05679824561403509 - nodes in this community are weakly interconnected._
- **Why does `update()` connect `cars.js / controllers.js` to `build-geodata.mjs / buildRoadGraph()`, `createTrafficSystem() / update()`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Are the 23 inferred relationships involving `initApp()` (e.g. with `.dispose()` and `.setEnabled()`) actually correct?**
  _`initApp()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **Should `nyc-map.js / NYCMapSystem` be split into smaller, more focused modules?**
  _Cohesion score 0.06349206349206349 - nodes in this community are weakly interconnected._