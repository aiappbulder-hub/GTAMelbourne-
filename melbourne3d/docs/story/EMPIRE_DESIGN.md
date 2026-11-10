# GTA Melbourne: "The Ferryman" (crime empire story and territory design)

Design document and implementation plan for the story and territory-management systems of the **Three.js engine in
`melbourne3d/`**. The old WebGL game (`../index.html`) is retired and is not touched by anything in this plan.

Companion files in this folder:

- `territory-map.svg`: the playable map drawn from `js/melbourne-geodata.js`, with the territories and mission
  locations below laid over it.
- `places.json`: every story location used in this document with its world coordinates, latitude/longitude, distance
  to the map edge, district label and road-network membership, all computed from the game's own data.

Nothing in this document puts a mission at an invented coordinate. Every location is an OSM street intersection, an
OSM landmark footprint or an OSM park centroid that exists in `js/melbourne-geodata.js`, checked to lie inside the map
boundary. Section 1 shows how this was checked.

---

## 0. Summary of the key findings

1. **The playable map is a 5 × 7.5 km rectangle:** 144.935–144.990 E by 37.800–37.867 S. It contains the CBD, Southbank,
   Docklands, South and Port Melbourne, Albert Park and Middle Park, Kings Domain and the western edge of South Yarra,
   East Melbourne and the MCG, the southern halves of Carlton and Fitzroy, and the north end of St Kilda.
2. **These places are not playable:** Ringwood, Dandenong, Broadmeadows, Alphington, Brighton, Richmond (beyond a strip
   of Punt Rd), Chapel St, Luna Park and Station Pier. The story treats all of them as off-map.
3. **The Yarra has no bridges in the game.** No bridge deck is built, and the player's car drives across the river
   surface at road height.
4. **The AI road network is split into 14 separate networks.** Only 2,821 of 7,353 centreline edges (38%) survive the
   connectivity cut. The CBD grid, Docklands, Fitzroy–Collingwood and "everything south of the river" are four
   separate traffic worlds.
5. **Carlton and East Melbourne have no AI traffic at all.** Lygon St is 330 m from the nearest kept edge. This matters
   for any mission that needs AI vehicles: chases, tails and escorts.
6. **The district labels (`districtAt`) are wrong in several places.** The MCG is labelled "Kings Domain", Jolimont
   "Richmond", Queen Victoria Market "Carlton", Harbour Esplanade "South Wharf" and Smith/Gertrude St "East Melbourne".
   Territories should not be built on these labels until they are fixed (section 7, phase 0).
7. **One existing mission is in the wrong place.** Tobacco Wars resolves "South Wharf Drive" to (−2788, −192), by the
   Bolte Bridge, about 1.2 km west of the real South Wharf precinct.
8. **The existing story already fits a sequel.** It is set in 2004 and ends with *Harbour Run*, where the player
   escapes Melbourne by boat. The map itself is present-day Melbourne (Australia 108, Marvel Stadium, the Melbourne
   Star, State Library Metro station). The empire story is therefore set **now, twenty-two years later**, when the
   player comes back. This keeps all ten existing, voiced jobs as a playable 2004 prologue, and it resolves the
   anachronism between the 2004 story and the modern skyline.

---

## 1. Map audit

### 1.1 Method

All figures come from the game's own data and code, not from memory of Melbourne:

| Source | Used for |
|---|---|
| `js/melbourne-geodata.js` (`GEO`) | bounds, 7,180 named road polylines (757 distinct names), 2,165 blocks, 339 parks, 42 water bodies, 14 rail yards, 43 tram routes, 35 landmarks |
| `tools/melbourne/osm.mjs` `toLonLat` / `toWorld` | converting between world metres and latitude/longitude |
| The engine run headless (`index.html?webgl&debugroads`, Playwright) | `globalThis.__roadEdges`: the 7,631 directed road edges and their turn moves, with the `kept` flag |
| Tarjan SCC over `__roadEdges` | the separate drivable AI networks (section 1.6) |
| `js/melbourne-config.js` (`districtAt`, `TELEPORT_LOCATIONS`, `inWater`, `fromLonLat`) | district labels and existing places |
| `js/missions.js`, `js/stkilda.js`, `js/race.js`, `js/intro.js`, `js/people.js`, `../data/character-voices.json` | existing missions, cast and voices |

### 1.2 Playable boundary

`GEO.bounds` is a quadrilateral in world metres. x runs grid-east along Collins St, z runs grid-south, and the origin
is Swanston St × Collins St.

| Corner | World (x, z) | Lon, lat |
|---|---|---|
| NW | (−2059, −2536) | 144.9350, −37.8000 |
| NE | (2515, −945) | 144.9900, −37.8000 |
| SE | (72, 6079) | 144.9900, −37.8670 |
| SW | (−4502, 4488) | 144.9350, −37.8670 |

Movement is clamped to this polygon (`controllers.js` `getIslandBoundsAtZ`). The helicopter may leave it over the
water. Port Phillip Bay fills the south-west corner.

### 1.3 Suburbs and neighbourhoods, verified

Each suburb is classified by how much of its street network is in `GEO.roads`, measured by road length and lat/lon
extent.

**Fully playable:**

| Area | Evidence (roads in data, lat range) |
|---|---|
| Melbourne CBD (Hoddle Grid) | all nine avenues (Spencer–Spring) and nine streets (Flinders–La Trobe incl. the four "little" streets), measured into `GEO.grid` |
| Southbank | Southbank Blvd, Sturt St, City Rd, Kings Way, Power St, Kavanagh St; Crown, Eureka, Arts Centre, Hamer Hall, NGV footprints |
| South Wharf | Clarendon St north end, Whiteman St, Polly Woodside Park, Seafarers Rest Park |
| Docklands | Harbour Esplanade (2.3 km), Docklands Dr, Footscray Rd, Dudley St, Wurundjeri Way, Waterfront Way, NewQuay parks; Marvel Stadium, Melbourne Star |
| West Melbourne and North Melbourne (south of −37.800) | Spencer St north, Roden, Dudley, Adderley, Errol St (−37.7994…−37.8058), Victoria St, Queensberry, Abbotsford, Arden St; the Dynon Rd / E-Gate rail yards |
| South Melbourne | Clarendon St (4.4 km), Park St, Dorcas, Coventry, Bank St, Cecil, Ferrars, York St, Montague St |
| Port Melbourne (east of 144.935) | Bay St (−37.8325…−37.8432), Beach St, Graham St, Ingles St, Bridge St, Liardet, Rouse St; Gasworks Arts Park |
| Fishermans Bend (eastern part) | Lorimer St, Normanby Rd, Boundary St, Williamstown Rd (east end), Montague St |
| Albert Park and Middle Park | Albert Park (549 acres) and its lake, the full Grand Prix circuit (`js/race-track.js`), Canterbury Rd, Beaconsfield Pde (7.3 km), Kerferd Rd, Danks St, Richardson St |
| Kings Domain and St Kilda Rd | St Kilda Rd (whole length), Kings Domain, Royal Botanic Gardens, Shrine, Government House Dr, Alexandra Ave, Birdwood Ave, Domain Rd |
| East Melbourne and Jolimont | Wellington Pde, Hotham, Albert, Gipps, Powlett, Lansdowne St; Parliament, St Patrick's, Fitzroy Gardens, Treasury Gardens |
| MCG and Melbourne Park precinct | MCG, Rod Laver Arena, AAMI Park, Yarra Park, Olympic Blvd, Batman Ave, Brunton Ave |

**Partly playable** (the map edge cuts through):

| Area | What is in | What is out |
|---|---|---|
| Carlton | Lygon St from Victoria St to just past Grattan St (−37.8070…−37.7977), Argyle Square (the Lygon St piazza), Drummond, Rathdowne, Cardigan, Pelham St, Carlton Gardens and the Exhibition Building, Melbourne Uni's southern edge (University Sq, Lincoln Sq) | the restaurant strip north of Grattan St (Faraday, Elgin St: **not in data**) |
| Fitzroy | Brunswick St from Victoria Pde to about Kerr St (−37.8085…−37.8000), Gertrude St, the Atherton Gardens estate, Napier, George, Gore St | Johnston St (Fitzroy) and everything north of it |
| Collingwood | Smith St south end, Wellington St, Langridge, Cambridge, Oxford, Peel St, Gipps St (to Hoddle St) | Johnston St, Collingwood north |
| South Yarra (west) | Toorak Rd (to 144.9907), Punt Rd, Domain Rd, Fawkner Park, Caroline St, Leopold St | Chapel St (**not in data**; it lies just east of 144.990), Como |
| Prahran and Windsor (west fringe) | Commercial Rd and Greville St to Punt Rd, High St (973 m), Upton Rd, Windsor Siding park | Chapel St, Prahran Market, Greville St east of Punt Rd |
| St Kilda | Fitzroy St (St Kilda), the Esplanade, Jacka Blvd, St Kilda Pier (built in `js/stkilda.js`), Catani Gardens, Acland St north of about −37.867, Alma Rd and Inkerman St west ends | Luna Park and the Palais Theatre (about −37.868, just south of the edge), Acland St's southern cake-shop block, Carlisle St (312 m only) |
| Richmond | 311 m of Swan St at Punt Rd, 16 m of Bridge Rd, 77 m of Hoddle St | everything east of Punt Rd / Hoddle St |
| Parkville | University Square, Grattan St, the bottom of Flemington Rd (817 m), Berkeley St | the university proper, Royal Park |

**Not playable** (verified absent: no streets in `GEO.roads` and outside the bounds):

Ringwood, Dandenong, Broadmeadows, Alphington, Brighton, Footscray, Kensington, Flemington and its racecourse,
Brunswick (Sydney Rd: not in data), Coburg, Thornbury, Northcote, Abbotsford, Hawthorn, Toorak, Prahran's Chapel St,
Elwood, Balaclava, Williamstown, Station Pier (144.930 E, outside), the West Gate Bridge, the Bolte Bridge, CityLink,
the Monash and West Gate freeways (none of these are in the data), Tullamarine and Avalon airports.

### 1.4 Streets and roads

757 distinct named roads. The longest (summed polyline length in data) are: St Kilda Rd 18.0 km, Beaconsfield Pde
7.3 km, Punt Rd 6.0 km, Collins St 5.7 km, Elizabeth St 5.3 km, Victoria St 5.2 km, Canterbury Rd 5.1 km, Queensberry
St 4.9 km, Spencer St 4.8 km, Wurundjeri Way 4.8 km, Bourke St 4.7 km, Albert St 4.6 km, Clarendon St 4.4 km, La Trobe
St 4.3 km, Kings Way 4.3 km, Flinders St 4.2 km, Albert Rd 4.2 km, Park St 4.1 km, King St 4.1 km.

Some names are reused in different suburbs and merged under one name in `GEO.roads`: Fitzroy St (Fitzroy and St
Kilda), Clarendon St (South Melbourne and East Melbourne), Smith St, Victoria St, King St. The mission resolver
`{ cross: [A, B] }` picks the closest pair of points. That works only where the intersection really exists, which is
why `places.json` records each intersection's "gap" check.

**Intersections used by the story (gap 0 m, they really meet in the data):**

- **CBD:** Flinders Lane × Elizabeth St, King St × Flinders Lane, King St × Bourke St, Russell St × La Trobe St.
- **Carlton:** Lygon St × Queensberry St, Rathdowne St × Queensberry St.
- **North Melbourne:** Errol St × Victoria St, Spencer St × Roden St, Errol × Queensberry (8.7 m).
- **Fitzroy and Collingwood:** Gertrude St × Nicholson St, Brunswick St × Victoria Pde, Smith St × Gertrude St,
  Wellington St × Gipps St.
- **East Melbourne and Richmond fringe:** Punt Rd × Wellington Pde, Punt Rd × Swan St.
- **Docklands:** Harbour Esplanade × Collins / Bourke St, Footscray Rd × Harbour Esplanade, Dudley St × Wurundjeri Way.
- **Southbank:** Sturt St × Southbank Blvd, City Rd × Kings Way.
- **South Wharf and Fishermans Bend:** Clarendon St × Whiteman St, Lorimer St × Montague St, Normanby Rd × Montague St.
- **South Melbourne and Port Melbourne:** Montague St × Park St, Bay St × Beach St.
- **Albert Park and Middle Park:** Kerferd Rd × Beaconsfield Pde.
- **St Kilda Rd and South Yarra:** Toorak Rd × St Kilda Rd, Domain Rd × Punt Rd, Greville St × Punt Rd, Alma Rd × St
  Kilda Rd.
- **St Kilda:** Fitzroy St × Grey St, The Esplanade × Fitzroy St.

**Missing from the data:** CBD laneways (Degraves St, Hosier Lane, Centre Place, AC/DC Lane, Hardware Lane), Faraday
and Elgin St (Carlton), Chapel St, Alexandra Pde, Royal Pde, Sydney Rd, Racecourse Rd, Johnston St (Fitzroy), Marine
Pde, every freeway, and the named bridges (Queens Bridge, Sandridge, Charles Grimes, Spencer St Bridge, Swan St Bridge).
Princes Bridge *is* in the roads (230 m) but no deck is built.

### 1.5 Landmarks, buildings, parks and water

**Landmark footprints** (`GEO.landmarks`, 35 entries; world centre given):

| Area | Landmarks |
|---|---|
| CBD | Flinders Street Station (−178, 265), Federation Square (143, 346), St Paul's (42, 167), Young and Jackson (−28, 210), Town Hall (43, −43), Forum Theatre (201, 186), Block Arcade (−188, −44), Royal Arcade (−189, −167), GPO (−201, −292), Melbourne Central (−124, −580), Shot Tower (−99, −626), State Library (122, −638), Mitre Tavern (−567, −44), Rialto (−872, 76), Customs House (−629, −719), Immigration Museum (−644, 204), Old Treasury (737, −14), Princess Theatre (655, −332) |
| Docklands and West End | Southern Cross Station (−1288, −101), Marvel Stadium (−1618, −438), Melbourne Star (−2275, −1215) |
| North of the grid | Queen Victoria Market (−459, −1119), Royal Exhibition Building (725, −830) |
| East Melbourne | Parliament House (819, −282), St Patrick's Cathedral (1009, −277) |
| Southbank | Crown Melbourne (−925, 598), Eureka Tower (−381, 597), Australia 108 (−498, 732), Hamer Hall (−50, 529), Arts Centre (−61, 681), NGV (−109, 825) |
| Sporting precinct | MCG (1229, 948), Rod Laver Arena (778, 989), AAMI Park (1080, 1505) |
| Domain | Shrine of Remembrance (25, 1777) |

**3D landmark models** (`js/melbourne-landmarks.js`): Flinders St Station, Eureka, St Paul's, the MCG, Parliament, the
Exhibition Building, the Shrine, the Arts Centre spire, Rialto, Fed Square.

**Parks** (339, named ones include): Albert Park, Royal Botanic Gardens, Fawkner Park, Kings Domain, Yarra Park,
Fitzroy Gardens, Carlton Gardens, Flagstaff Gardens, Treasury Gardens, Birrarung Marr, Alexandra and Queen Victoria
Gardens, Argyle Square, University Square, Lincoln Square, Murchison Square, Atherton Reserve, Catani Gardens, St
Vincent Gardens, Gasworks Arts Park, Docklands Park, North Melbourne Recreation Reserve, Gosch's Paddock and Sidney Myer
Music Bowl Reserve.

**Water:** the Yarra River, Victoria Harbour, Albert Park Lake, the Ornamental Lake and Nymphaea Lily Lake (Botanic
Gardens), Guilfoyle's Volcano and Port Phillip Bay (the coast from Port Melbourne to St Kilda).

**Rail:** 14 rail yard areas (E-Gate / Dynon, Southern Cross approaches, Southbank Tram Depot, State Library Station).
There are no trains. The 43 tram routes run on 551 track pieces (`js/trams.js` runs 22 of them).

### 1.6 Drivable connectivity

**The player.** Ground height is 0 m off the kerbs (`controllers.js` `getGroundHeight`), there is no water collision,
and no Melbourne bridge is built. The player's car can therefore reach every point in the bounds, including across the
Yarra *on the water surface*. For a story built on real geography this is the biggest visual defect: the escape
across Princes Bridge cannot happen yet, because there is no bridge.

**The AI road network** (traffic, buses and any future pursuer that drives on `roadGraph` edges). There are 14
strongly connected networks of 12 edges or more:

| # | Edges | Area (main streets) | Status |
|---|---|---|---|
| A | 1,842 | **South**: Southbank west, South Melb, Port Melb, Albert Park, St Kilda Rd south of Albert Rd, South Yarra, Prahran edge (Punt, Queens, Park, Clarendon, Kings Way, Beaconsfield, Toorak) | main southern network |
| B | 396 | **Fitzroy–Collingwood** (Smith, Wellington, Brunswick, Gertrude, Victoria Pde) | isolated from the CBD |
| C | 318 | **CBD grid** (the 18 grid streets) | isolated: no link north, south or west |
| D | 111 | **Docklands** (Footscray Rd, Wurundjeri Way, Docklands Dr, Harbour Esplanade north, Dudley St) | isolated |
| E | 97 | **Port Melbourne / Fishermans Bend** (Boundary, Montague, Normanby, Williamstown Rd) | isolated from A |
| F | 59 | North Melbourne (Arden, Abbotsford, Queensberry west) | isolated |
| G | 51 | St Kilda East (Alma Rd, Barkly, Argyle St) | isolated |
| H | 36 | Southbank pocket (Kavanagh, City Rd east, Southbank Blvd) | isolated |
| I | 34 | Punt Rd / Olympic Blvd / Swan St | isolated |
| J | 28 | St Kilda (Fitzroy St, Beaconsfield Pde south end) | isolated |
| K | 23 | Flinders St west / Wurundjeri Way south | isolated |
| L | 16 | Wellington Pde (East Melbourne) | isolated |
| M | 12 | South Melbourne pocket (Coventry, Iffla, Normanby St) | isolated |
| N | 12 | Jolimont | isolated |

**Areas with no AI network within 60 m:** Lygon St / Argyle Square (330 m to the nearest edge), Carlton Gardens,
Queen Victoria Market (135 m), Errol St, Harbour Esplanade south (Collins/Bourke), Marvel Stadium, Flinders Street
Station frontage, Federation Square, Parliament / St Patrick's, Fitzroy Gardens, the MCG and Yarra Park, Crown and
Eureka frontages, the Albert Park pits, the Shrine, Fawkner Park, Acland St, Catani Gardens and St Kilda Pier.

**Consequence for mission design.** Chases, tails and escorts must not assume that an AI car can follow the player
across areas. Section 7 handles this with a path driver: an AI vehicle that follows a hand-authored or A*-planned
polyline, generalised from the AI cars in `js/race.js`. This works whatever the traffic network looks like. Joining
the networks (section 8) is still needed for the city to feel continuous.

### 1.7 Existing missions and their coordinates

Ten jobs in `js/missions.js`, plus the Grand Prix (`js/race.js`). Coordinates are resolved exactly as
`missions.js resolve()` does.

| # | Job | Giver | Start | Objectives (resolved world x, z) |
|---|---|---|---|---|
| 1 | Laneway Hustle | Vince | Flinders Lane × Elizabeth (−224, 120) | Wellington × Gipps, Collingwood (2058, −585), then Spencer × Roden, West Melb (−1276, −1356) |
| 2 | Hot Lap | Vince | circuit pits | five circuit checkpoints, Albert Park |
| 3 | Chop Shop | Vince | (−224, 120) | steal a ute, then Errol × Victoria St, North Melb (−1057, −1576) |
| 4 | Word on the Street | Vince | (−224, 120) | Gertrude × Nicholson (965, −853), talk to 3, then Smith × Gertrude (1701, −481) |
| 5 | Westside Bikies | Kaz | Collins × Spencer (−1168, 9) | Harbour Esplanade × Bourke (−1786, −213), 3 targets, then Clarendon × Whiteman (−1157, 739) |
| 6 | Short Black | Kaz + Mick | Acland St café (−985, 5470) | St Kilda Pier end (−1872, 5160), back to the café |
| 7 | Collection Day | Kaz | (−1168, 9) | Bourke St Mall (−242, −221), 3 hold-ups, 300 m away |
| 8 | The Informant | Kaz | Rathdowne × Queensberry (596, −995) | Nicholson × Carlton St (1152, −1259), Clarendon × Gipps, East Melb (1480, 185), Wellington × Gipps (2058, −585) |
| 9 | Clean Up | Kaz | (596, −995) | Bourke × Spencer (−1168, −221), 3 targets, 400 m away |
| 10 | Tobacco Wars | Kaz | Flinders × King (−938, 237) | "South Wharf Drive", **which resolves to (−2788, −192), by the Bolte Bridge (bug)** |
| 11 | Harbour Run | Kaz | Flinders × Queen (−468, 237) | Harbour Esplanade × Collins (−1796, 19) |
| – | Albert Park Grand Prix | – | blue marker in the pits | two laps against five AI cars |

The intro (`js/intro.js`) stages Vince's crew on Lygon St near (475, −1425), Kaz's gang in Docklands, police at
Southbank (around (−260, 430) to (−381, 597)), and ends at the first job.

### 1.8 Existing factions and named characters

| Name | Kind | Where it appears |
|---|---|---|
| **Lygon Street Crew** | gang (Carlton) | missions 1–4, intro |
| **The Broadmeadows firm** | gang (home base off-map) | missions 5–11 ("Broady boys"); the crew name on Kaz's jobs |
| **Westside Nomads** | bikie club | Westside Bikies, Short Black, Clean Up, Tobacco Wars |
| **Taskforce Kestrel** | Victoria Police taskforce | The Informant, Harbour Run, the story setup |
| **Vince** | Lygon St Crew boss | ara model `vince`, voice `mason` |
| **Kaz** | Broadmeadows | ara model `kaz`, voice `delta` |
| **Mick** | fence (St Kilda) | ara model `mick`, voice `angus` |
| **Davo** | Vince's man (Collingwood pub) | ara model `davo`, no voice yet |
| **You** (the player) | | voice `cooper` (Orpheus), narrates the intro |
| Police officer, local man, local woman | voices | `police`, `local_male`, `local_female` |
| Character presets | | Melbourne Local, Street Criminal, Female Local, Bikie, Victoria Police Officer |

The voice data holds 66 recorded lines (`../data/character-voices.json`).

### 1.9 Locations outside the playable boundary

These may be **mentioned** in dialogue but never used as mission locations: Broadmeadows (the firm's home turf),
Brighton (the "Brighton house" raided in Harbour Run), Ringwood, Dandenong, Alphington, Footscray, Flemington
racecourse, Station Pier, Williamstown, Tullamarine, Lorne, the Mornington Peninsula, Geelong, Tasmania.

### 1.10 Defects found during the audit

| Defect | Detail | Fix (phase 0) |
|---|---|---|
| Tobacco Wars marker | `{ road: 'SOUTH WHARF DRIVE' }` takes the middle point of all OSM ways of that name, which lands at (−2788, −192) | use an explicit point in South Wharf, e.g. near Polly Woodside Park (−1338, 554) or Clarendon × Whiteman (−1157, 739) |
| `districtAt` labels | the MCG, Yarra Park and Shrine are "Kings Domain"; Fitzroy Gardens, Jolimont and Punt × Wellington Pde are "Richmond"; QVM is "Carlton"; the Exhibition Building, Gertrude St, Smith St and Wellington St are "East Melbourne"; Harbour Esplanade × Collins, Footscray Rd and Lorimer St are "South Wharf"; there is no Collingwood, West Melbourne, Fishermans Bend or South Yarra | replace the rule chain with polygons along real streets (the territory polygons in `territory-map.svg` are a first draft) |
| No bridges | the player drives on the Yarra | section 8 |
| Mixed-up street names | Clarendon St and Fitzroy St each exist in two suburbs | resolve story places from `places.json` ids, not names |

---

## 2. Territory design

There are eleven territories. Their boundaries follow streets and the river (see `territory-map.svg`):

| # | Territory | Boundaries | Controlled at the start by | Income type |
|---|---|---|---|---|
| 1 | **The Grid** (CBD) | La Trobe St, Spring St, the Yarra, Spencer St | contested: Kingsgate holds the King St doors | nightlife, protection, laundering through hospitality |
| 2 | **Carlton** | Victoria St, Nicholson St, the map edge, Elizabeth St | Lygon Street Crew | restaurants, cafés, construction, SP bookmaking |
| 3 | **North and West Melbourne** | Elizabeth St / Victoria St, the map edge, Footscray Rd, Dudley St, Spencer St | Broadmeadows firm (via the rail yards) | freight, illicit tobacco, chop shops, the market |
| 4 | **Docklands** | Dudley St, Footscray Rd, the Yarra, Spencer St / Wurundjeri Way | Westside Nomads (marinas), Broadmeadows pushing in | marinas, waterfront clubs, stadium events, imports |
| 5 | **Fitzroy and Collingwood** | Victoria Pde, Nicholson St, the map edge (Hoddle St side) | the Doherty family | pubs, live music, tattoo and vintage, the estate trade |
| 6 | **East Melbourne and the MCG** | Spring St, Victoria Pde, Punt Rd, the Yarra | The Members | event ticketing, corporate boxes, political access |
| 7 | **Southbank and South Wharf** | the Yarra, St Kilda Rd, Kings Way / City Rd, Montague St | Golden Reef (junket) | high-roller junkets, apartment money, the convention trade |
| 8 | **The Westside** (South Melb, Port Melb, Fishermans Bend) | the Yarra, Kings Way, Albert Rd, Kerferd Rd, the bay | Westside Nomads | towing, smash repairs, warehouses, the market, the rezoning |
| 9 | **Kings Domain and South Yarra** | St Kilda Rd, the Yarra, Punt Rd, Queens Way | The Members | St Kilda Rd professional money, South Yarra property |
| 10 | **Albert Park and Middle Park** | St Kilda Rd / Queens Rd, Albert Rd, Kerferd Rd, Beaconsfield Pde, Fitzroy St | **neutral ground** | none; a sit-down venue |
| 11 | **St Kilda** | Fitzroy St, Queens Way, the map edge, the bay | Lenny Szabo's Esplanade | nightclubs, the "Fitzroy St book", the pier |

### 2.1 Territory profiles

**1. The Grid (CBD).** *Identity:* bluestone, laneways, King St's nightclub strip, the Paris End's lawyers.
*Controller:* nobody completely. Kingsgate Security (Terry Maguire) owns the doors on King St. Kestrel's office looks
down from a Flinders St tower.
*Legitimate businesses:* the Quiet Room (the player's laneway bar, Flinders Lane × Elizabeth), a dry cleaner on
Little Collins St, a Bourke St security firm.
*Locations:* Flinders St Station, Fed Square, Bourke St Mall, the State Library, the Mitre Tavern's Bank Place,
Melbourne Central and the Shot Tower, the old Russell St police HQ (Russell × La Trobe).
*Reason to hold it:* it is the hub. Every other territory's cash is laundered through Grid hospitality. Holding it
gives +25% to laundering capacity for the whole empire.
*Rival pressure:* the highest Kestrel heat anywhere. Raids happen here first.

**2. Carlton.** *Identity:* Little Italy, espresso, bocce at Argyle Square, the university, old-family honour.
*Controller:* the Lygon Street Crew. Vince Lombardo is ageing and ill; his nephew Nico circles.
*Legitimate businesses:* Pasticceria Lombardo (Lygon × Queensberry), the Argyle Square bocce club, Lombardo
Constructions (Rathdowne St).
*Locations:* Lygon St, Argyle Square / Argyle Pl North, Carlton Gardens and the Exhibition Building, University Square,
Drummond St terraces.
*Reason to hold it:* construction contracts. These are the key to the Act III rezoning plot.
*Rival pressure:* Broadmeadows from the west, and Nico from inside.

**3. North and West Melbourne.** *Identity:* warehouses, the market at dawn, the rail yards, Errol St's working pubs.
*Controller:* the Broadmeadows firm, run on-map by Kaz Whitlock.
*Legitimate businesses:* Whitlock Freight (Dudley St), a market produce wholesaler (QVM), a smash repairer (Errol ×
Victoria, the 2004 chop shop).
*Locations:* Queen Victoria Market, Flagstaff Gardens, Errol St, Spencer × Roden (the old West Melbourne lock-up), the
Dynon Rd / E-Gate yards.
*Reason to hold it:* logistics. Everything that moves through the empire moves through here.
*Rival pressure:* the Nomads' tobacco runs, and Kestrel's freight watch.

**4. Docklands.** *Identity:* glass towers, wind off the harbour, marinas full of boats nobody sails.
*Controller:* the Westside Nomads hold the marina berths; Broadmeadows wants the container side.
*Legitimate businesses:* a charter-boat company (Harbour Esplanade), a stadium catering contract (Marvel).
*Locations:* Harbour Esplanade, NewQuay, Marvel Stadium, Footscray Rd container gates, the Melbourne Star, Victoria
Harbour.
*Reason to hold it:* the water. Imports, exits and the boat the player came back on.
*Rival pressure:* the Nomads against Broadmeadows.

**5. Fitzroy and Collingwood.** *Identity:* the oldest working-class Irish-Catholic families meet live music, vintage
shops and the Atherton Gardens towers.
*Controller:* the Doherty family (Shiv Doherty), from the Gipps Arms (Wellington × Gipps, the pub where Davo was picked
up in 2004).
*Legitimate businesses:* the Gipps Arms, a Smith St tattoo studio, a Gertrude St music venue.
*Locations:* Brunswick St, Gertrude St, Smith St, Wellington St, Atherton Reserve and the estate, Victoria Pde.
*Reason to hold it:* loyalty and people. The best place to recruit muscle and drivers.
*Rival pressure:* gentrification money (the Members) and the estate's drug trade.

**6. East Melbourne and the MCG.** *Identity:* the Establishment. Parliament, St Patrick's, plane trees, Members' tickets.
*Controller:* The Members: Gerald Ashcombe's network of developer, MP's chief of staff, silk and club officials.
*Legitimate businesses:* Ashcombe Fenwick Group (property), corporate hospitality at the MCG.
*Locations:* Parliament House, St Patrick's, Fitzroy Gardens, the MCG and Yarra Park, Rod Laver, AAMI Park, Punt Rd ×
Wellington Pde.
*Reason to hold it:* influence. Holding it unlocks police and planning favours, lowering heat everywhere.
*Rival pressure:* you cannot take it by force. It must be won through leverage.

**7. Southbank and South Wharf.** *Identity:* apartment towers, the casino's glare, the arts precinct, money with no
fixed address.
*Controller:* Golden Reef, a fictional Gold Coast junket operator run by Marcus Vellacott out of a Southbank hotel
suite. The casino itself is a backdrop and is never named as a party to crime.
*Legitimate businesses:* a Southbank Blvd restaurant, an apartment short-stay company, a chauffeur fleet.
*Locations:* the Crown and Eureka frontages, Southbank Blvd × Sturt St, City Rd × Kings Way, Clarendon × Whiteman (Kaz's
2004 mechanic), Polly Woodside Park.
*Reason to hold it:* laundering volume (+40%).
*Rival pressure:* AUSTRAC-style audits (a heat type), Vellacott's interstate backers.

**8. The Westside.** *Identity:* South Melbourne terraces and the market, Port Melbourne's bayside, Fishermans Bend's
empty sheds about to be worth billions.
*Controller:* the Westside Nomads MC (president Col Ferris), clubhouse at Normanby × Montague.
*Legitimate businesses:* Ferris Towing, a Bay St gym, Montague St storage units.
*Locations:* Lorimer × Montague (Ashcombe's site office), Normanby × Montague (the clubhouse), Montague × Park, Bay ×
Beach St, Gasworks Arts Park.
*Reason to hold it:* **land.** The Fishermans Bend rezoning is the Act III prize.
*Rival pressure:* the most violent territory; war with the Nomads.

**9. Kings Domain and South Yarra.** *Identity:* St Kilda Rd's office towers, the Shrine, the Botanic Gardens, old
money at Domain Rd.
*Controller:* The Members.
*Legitimate businesses:* St Kilda Rd accountancy and law offices, a Toorak Rd wine bar.
*Locations:* the Shrine, Toorak × St Kilda Rd, Domain × Punt Rd, Fawkner Park, Greville × Punt Rd.
*Reason to hold it:* clean money. Fronts here wash income at the lowest heat.
*Rival pressure:* scrutiny. A single headline costs influence.

**10. Albert Park and Middle Park (neutral ground).** *Identity:* the lake, the Grand Prix circuit, rowing sheds,
golf. Nobody shoots here; that is the rule.
*Controller:* none. Breaking the truce costs reputation with every faction.
*Locations:* the GP pits (−1341, 2717), Lakeside Dr, Kerferd Rd × Beaconsfield Pde.
*Reason to hold it:* it cannot be held. It is where sit-downs and the Sunday races happen.

**11. St Kilda.** *Identity:* faded glamour, Fitzroy St nightclubs, the pier at sunset, Acland St coffee.
*Controller:* Lenny Szabo, the last of the old vice kings, from the Esplanade.
*Legitimate businesses:* the Esplanade Lounge (Fitzroy × Grey), the Short Black café (Acland St), a pier kiosk lease.
*Locations:* Fitzroy × Grey, The Esplanade × Fitzroy, St Kilda Pier, Catani Gardens, Alma × St Kilda Rd.
*Reason to hold it:* Lenny's "book" of compromising information on half the city.
*Rival pressure:* everybody wants the book.

### 2.2 Territory state

```
territory = {
  id, name, polygon,            // world-metre polygon (from places/territory data, validated against GEO.bounds)
  controller,                   // faction id or 'player' or null (neutral)
  influence: { [faction]: 0..100 },   // the player's share decides control at >= 60
  lieutenant,                   // appointed lieutenant id or null
  businesses: [ { id, kind, legit, income, laundering } ],
  heat: 0..100,                 // Kestrel and media attention
  stability: 0..100,            // falls with violence, rises with a competent lieutenant
  baseIncome                    // per tick at 100% influence
}
```

Control changes only through story missions or territory missions (section 6.6). Passive drift moves influence by at
most ±2 per tick, so ownership is never lost without the player being warned.

---

## 3. Faction and character bible

All characters and organisations are fictional. Real places appear as settings only. No real person, real company
(including the casino operator) or real criminal case is depicted or alluded to.

### 3.1 The protagonist

**Callum Reid, "the Ferryman."** In 2004 he was a driver who worked both sides of the Lygon–Broadmeadows war (the
prologue jobs). He left on a boat off Harbour Esplanade the night Kestrel raided the Brighton house, and he took
something with him: the rumour is a ledger. Twenty-two years later he comes back the same way he left, by water.

- *Manner:* he speaks little, never raises his voice, and is always the last to sit down and the first to leave. He
  repays debts precisely and remembers slights for decades. Violence is a tool he dislikes using himself.
- *Voice-over:* the existing `cooper` voice, older and slower. His narration frames each act, as the intro already
  does.
- *Goal:* not money. He wants to own the thing that owns Melbourne: the place where the money, the land and the
  permits meet. By Act III that is the Fishermans Bend rezoning.
- *Mystery:* where he was (Tasmania? Manila? Fremantle?) is never confirmed. Each lieutenant tells a different story
  about him, and he corrects none of them.

### 3.2 The player's organisation: "the Crossing"

The player's organisation has no patch and no name on any door. The underworld calls it "the Crossing" because
everything goes through the Ferryman. Its headquarters is **the Quiet Room**, a failing laneway bar at Flinders Lane ×
Elizabeth St (−224, 120), the exact spot where the prologue began.

### 3.3 Factions

| Faction | Leader | Supporting characters | Style | Wants |
|---|---|---|---|---|
| **Lygon Street Crew** | Vince Lombardo, 66, ill with emphysema and still in a cardigan | Nico Lombardo (nephew, 34, ambitious); Nonna Pina (Vince's sister, runs the pasticceria and the books); Sal Ferrante (enforcer, 50) | old-world honour, Sunday lunch, never in public | an orderly succession and a respected exit |
| **Broadmeadows firm** | Karen "Kaz" Whitlock, 49 (on-map), answering to her uncle Ray (off-map, Broadmeadows) | Jonno Pike (yard boss, Dynon Rd); Leila Haddad (fixer, QVM wholesaler); the "Broady boys" (drivers) | freight, volume, family loyalty to the north | take North Melbourne outright; Kaz wants to replace Ray |
| **Westside Nomads MC** | Colin "Col" Ferris, 58, president | Hamish "Hammer" Kowalczyk (sergeant-at-arms, 41, wants out); Dean "Tunnel" Mayer (treasurer, crypto); prospects | patches, rules, retaliation, towing contracts | hold the Westside and sell their land to the highest bidder |
| **The Doherty family** | Siobhan "Shiv" Doherty, 55, publican of the Gipps Arms | Fergal Doherty (brother, 44, unreliable); Tess Doherty (daughter, 24, law student); Father Lenehan (parish priest, St Patrick's) | community, grudges, protection of their own | keep Fitzroy for Fitzroy |
| **Kingsgate Security** | Terry "Doors" Maguire, 52, ex-boxer | head bouncers on King St; Bianca Rowe (licensing compliance, actually his bagwoman) | doors, crowd control, what gets let in | the CBD nightlife monopoly |
| **Golden Reef** (junket) | Marcus Vellacott, 47, Gold Coast | Ruby Achterberg (his accountant, until Act I); a rotating cast of "VIP hosts" | suites, chauffeurs, cash counted by machine | a clean channel for interstate money |
| **The Members** | Gerald Ashcombe, 63, developer (Ashcombe Fenwick Group) | Philippa Crane (chief of staff to a fictional minister); Justice-in-waiting Hugh Barrington KC; Graeme Lowe (sports club board) | lunches, boards, planning panels, the MCG members' bar | the Fishermans Bend rezoning, and nobody looking |
| **The Esplanade** | Lenny Szabo, 74, St Kilda | Mick Fallon (fence, from the prologue); Dolly (Lenny's carer and minder); the Fitzroy St doormen | old vice, photographs, favours owed since 1979 | to retire alive and sell "the book" |
| **Taskforce Kestrel** (police) | Detective Inspector Helen Marsh, 51 | Sgt Ollie Tan (surveillance); DS Priya Raman (forensic accountant) | patient, under-resourced, under political pressure | to finish what Kestrel failed to do in 2004 |

### 3.4 Lieutenant candidates

The full statistics and systems are in section 6.

| Lieutenant | Who | Introduced | Best fit | Personal objective |
|---|---|---|---|---|
| **Davo Kearney** | Vince's driver in 2004, now 50, grey, sober, still driving | M1 | Docklands / the Westside (logistics) | buy back his late mum's Collingwood house; keep his daughter Chloe out of it |
| **Kaz Whitlock** | the Broadmeadows boss on-map | M4 | North and West Melbourne | overthrow Uncle Ray and go legit with the freight company |
| **Mick Fallon** | the 2004 fence, now a pawnbroker in St Kilda | M12 (cameo M2) | St Kilda / the Grid | clear his gambling debt to Golden Reef and retire to Lorne |
| **Ruby Achterberg** | Vellacott's accountant, defects in M2 | M2 | Southbank / the Grid (laundering) | free her brother Joost from a remand charge Vellacott engineered |
| **Hamish "Hammer" Kowalczyk** | Nomads sergeant-at-arms | M11 | the Westside | patch out of the Nomads alive; win custody of his son |
| **Nico Lombardo** | Vince's nephew | M3 | Carlton | become the Lygon St don, with or without his uncle's blessing |
| **Tess Doherty** | Shiv's daughter, law student | M7 | Fitzroy and Collingwood, or Kings Domain (fronts) | get her family clean before it is too late |
| **Brendan "Sully" Sullivan** | ex-Kestrel detective, sacked in 2005 | M6 | intelligence (no territory: the "eyes" role) | prove Marsh buried evidence in 2004, or settle with her |

### 3.5 Voices

New Orpheus voice identities would be added to `../data/character-voices.json` with the existing generator. Use one
speaker per principal and keep the existing seeds for Vince, Kaz, Mick and the player:

- male: Nico, Davo, Hammer, Col, Terry, Marcus, Gerald, Lenny, Sully
- female: Shiv, Tess, Ruby, Marsh, Philippa, Pina

---

## 4. The three-act storyline

**Setting:** Melbourne, now. A spring that runs from the AFL Grand Final to the Spring Racing Carnival (both off-map
events referred to only). The prologue is the existing ten jobs, set in 2004.

### Prologue (existing, 2004): "Year One"

The ten existing jobs play unchanged as a flashback, opened by the existing intro. *Harbour Run* ends it: the player
reaches the boat off Harbour Esplanade. The "MELBOURNE IS YOURS" card is replaced by a title card, **"Twenty-two years
later,"** and Act I begins at the same spot.

### Act I: "Low Tide" (5 missions)

The Ferryman comes back to a city that has moved on. Vince is dying. Kaz runs the Broadmeadows freight. King St's
doors belong to a boxer. A junket counts money in a Southbank suite. Kestrel still exists, and it has a new inspector
who has read the 2004 file. He buys a failing laneway bar, picks up a defector (Ruby) and a driver (Davo), sits down
with Vince, and gets his foot into the North Melbourne yards. By the end he is noticed. Kestrel raids the Quiet Room,
and someone told them where to look.

**Act I ends** with the player escaping with the ledger and learning that the raid was tipped from inside.

### Act II: "The Board" (7 missions)

He builds the board. Lieutenants are appointed and given territories, which unlocks the lieutenant system. He settles
Fitzroy's family trouble, puts a hand into the Members' pockets at the MCG, runs a container across the Yarra,
swindles the junket, faces down the Nomads, and buys or loses St Kilda's book. Every faction comes to a truce summit at
Albert Park, neutral ground. Someone is killed there. The truce breaks.

**Act II ends** with the war, and a mole confirmed among the lieutenants. The game state decides who the mole is.

### Act III: "The Crossing" (6 missions)

Kestrel pulls him in. The war hits three of his territories at once. He breaks into Ashcombe's Fishermans Bend site
office for the bribe ledger and escapes by helicopter. He confronts the mole at the Shrine at dawn. In the finale he
does not fire a shot: three lieutenants carry out his plan at once while he sits across a table from Ashcombe in
Parliament's shadow. The player then chooses one of three endings:

- **The Crown (Godfather):** take Ashcombe's seat. The Members admit you, and the empire becomes the Establishment.
- **The Badge (Mr Inbetween):** give Ashcombe and the ledger to Marsh. You keep your territories under an uneasy
  arrangement with Kestrel and lose the Members.
- **The Ferry (Yellowstone):** burn it all. Divide the territories among the loyal lieutenants and leave by water,
  the way you came.

---

## 5. Mission-by-mission breakdown

**Legend.** *Place* gives a `places.json` id with world (x, z) and lat/lon. *Net* is the AI road network at the
place, from section 1.6. *New mechanic* names the new step type, defined in section 7.3. Each opening cinematic uses
the existing cut-scene system (`showCut`); seated scenes generalise `js/stkilda.js`.

### ACT I: LOW TIDE

#### M1 "Low Tide"

- **Purpose:** the return. Establishes the tone, Davo and Kestrel.
- **Place:** `DOCK_COLLINS`, Harbour Esplanade × Collins St (−1796, 19), −37.82097, 144.94735. It ends at `HQ`,
  Flinders Lane × Elizabeth (−224, 120).
- **Characters:** the Ferryman, Davo, a Kestrel surveillance pair (Sgt Ollie Tan).
- **Opening cinematic:** night. A charter boat noses into Victoria Harbour under the Docklands towers, with the
  Melbourne Star (−2275, −1215) lit in the distance. VO: *"Twenty-two years. The skyline's taller. The river's the same
  colour."* On the esplanade, Davo leans on an old Holdan Comodo. Wide shot, then over the shoulder.
- **Dialogue:**
  - Davo: "You got old."
  - You: "You got sober."
  - Davo: "Someone had to. ... There's a van on Bourke Street been there since Tuesday. Coppers or real estate, can't
    tell anymore."
  - You: "Both."
- **Objectives:**
  1. On foot, reach Davo's car without entering the view cones of the two Kestrel watchers in the parked van near
     Harbour Esplanade × Bourke (`DOCK_BOURKE`). New mechanic: `stealth`.
  2. Drive out by Collins St to the Grid. An unmarked car tails you. Lose it by getting 250 m clear for 20 s. New
     mechanics: `evade` and a `pathDriver` pursuer, because Docklands and the CBD are separate AI networks.
  3. Park on Elizabeth St at Flinders Lane, walk into the Quiet Room.
- **Choice:** when the tail is lost, Davo asks: "Want me to find out whose car that was?" A yes sets the flag
  `davo_tailed_kestrel`, so Sully is introduced earlier in M6.
- **Consequences:** reputation (unknown) starts at 0. Davo's loyalty +5 if you let him drive the evasion yourself
  (you hand him the wheel). New mechanic: `passenger`, the player in the passenger seat.
- **Closing:** the bar is dark and smells of old beer. VO: *"Every empire starts with a lease nobody else wants."*

#### M2 "The Quiet Room"

- **Purpose:** headquarters, Ruby, the empire screen tutorial, and the seed of the mole plot.
- **Place:** `HQ` (−224, 120), −37.81717, 144.96459. Interior is staged on the footpath and laneway frontage (no
  interiors exist). The second location is `EUREKA` (−381, 597), across the river.
- **Characters:** the owner, Gus Pappas (fictional, broke); Ruby Achterberg; Mick (cameo phone call).
- **Opening cinematic:** morning. Degraves-style laneway bustle (laneways need map work, section 8). Gus is stacking
  chairs and won't look up.
- **Dialogue (negotiation):**
  - Gus: "Thirty years. My father's bar. You want it for what, a front?"
  - Choice A, *fair*: "For what it's worth, and you keep the name on the window." Costs $60k; Grid stability +10.
  - Choice B, *lean*: "Your bank wants it Friday. I want it today." Costs $25k; Grid stability −5; Gus later talks to
    Kestrel (flag).
  - Choice C, *partner*: "Stay on. Run the bar. I'll run the rest." Costs $40k; Gus becomes a minor informant for
    *you*, which unlocks bar gossip tips.
- **Objectives:**
  1. Negotiate (new mechanic: `choice` in a cut scene).
  2. Ruby calls: she needs extraction from Vellacott's suite at Southbank. Drive across the river to the Eureka
     frontage `EUREKA` (−381, 597) and pick her up as Golden Reef's chauffeur pulls in. Mechanic: `escort`, a timed
     pickup with Ruby running to the car.
  3. Return. Ruby sweeps the bar: **search** three spots (the bar cooler, the fuse box and the jukebox) for a listening
     device. New mechanic: `search`.
- **Choice:** what to do with the bug. *Destroy* it, or *keep* it and feed Kestrel lies. Keeping it unlocks a deception
  option in M14, but if the bug is not found (the player skips the search) it becomes the "no mole" explanation in
  Act II.
- **Consequences:** HQ unlocked; empire screen ("The Book") tutorial; Ruby joins (loyalty 60).
- **Closing:** Ruby counts the till twice. "You don't have enough money to be this calm." "Not yet."

#### M3 "Sunday Lunch"

- **Purpose:** the Godfather beat. Vince, succession, Nico and the first real choice of allegiance.
- **Place:** `ARGYLE_SQ`, Argyle Square / the Lygon St piazza (407, −1358), −37.80273, 144.96584. A secondary location
  is `LYGON_QB`, Lygon × Queensberry (356, −1128).
- **Characters:** Vince, Nico, Nonna Pina, Sal Ferrante.
- **Opening cinematic:** a seated lunch at a long table on the piazza (generalise the St Kilda café scene to any table
  location). Bocce clacks in the background. Vince is on oxygen.
- **Dialogue:**
  - Vince: "Twenty-two years, and you walk in at the primo. You always had manners."
  - Nico: "Manners. He ran for Kaz, Zio. I remember."
  - Vince: "You were twelve. You remember gelato." (to you) "I'm dying. Slowly, which is the expensive way. When I go,
    Carlton goes to someone. I'd rather it went to someone who sits still."
- **Objectives:**
  1. The sit-down (`sitdown` + `choice`).
  2. A scooter rider fires at the table from Lygon St. **Chase the scooter on foot then in a car:** Lygon → Pelham →
     Drummond → Grattan. Carlton has no AI network, so the scooter is a `pathDriver` on an authored route.
  3. Corner the rider in University Square (`places`: University Square park centroid (−28, −1630) / (1, −1664)).
     Choice: *interrogate* (learn it was a Broadmeadows yard hand, which points to M4) or *let Sal handle it* (Sal's
     relationship with you +; you learn nothing; M4 has less intel).
- **Choice (the big one):**
  - *Back Nico's succession:* Carlton stays with the Lygon St Crew and becomes your ally. Nico is available as a
    lieutenant later, ambition high.
  - *Offer to "keep Carlton's books":* you become Vince's hidden partner, gaining 30% influence in Carlton. Nico's
    relationship with you is −40.
- **Consequences:** Carlton influence; Lygon St relationship; Nico's stats.
- **Closing:** Vince, alone with you: "The kid will try you. When he does, do it kindly. For his mother." VO: *"In
  Carlton, a promise to a dying man outranks a contract."*

#### M4 "Market Day"

- **Purpose:** surveillance and investigation; reintroduces Kaz; logistics.
- **Place:** `QVM`, Queen Victoria Market (−459, −1119), −37.80732, 144.95745, then `DUDLEY_WURU`, Dudley St ×
  Wurundjeri Way (−1653, −978), −37.81206, 144.94517 (the yards).
- **Characters:** Kaz, Leila Haddad, Jonno Pike, Sully (voice only, if `davo_tailed_kestrel`).
- **Opening cinematic:** 5 a.m. Forklifts and pallets of produce. A truck with no plates. VO: *"Fruit and veg goes in
  at dawn. So does everything else."*
- **Objectives:**
  1. **Photograph** three no-plate trucks loading at the market. Aim with the camera, as the gun's aim-and-T flow does,
     but with a phone (new mechanic: `photo`). Don't be seen: `stealth` lite.
  2. **Tail** the third truck to the yards without falling more than 150 m behind or coming within 25 m (new
     mechanic: `tail`). The truck is a `pathDriver` along Victoria St → Peel St → Dudley St.
  3. At the yards, Kaz is waiting. She knew you were following. Sit-down in her ute.
- **Dialogue:**
  - Kaz: "Twenty-two years and you still follow trucks."
  - You: "You still load them at the market."
  - Kaz: "Uncle Ray's tobacco. Pays for the yard, pays for the boys. Pays for nothing I want." (beat) "What do you
    want?"
  - You: "Ten percent of what goes through this gate, and nothing that goes through it in my name."
- **Choice:** *partner with Kaz* (she gets protection in the Grid; you get 20% North Melbourne influence), *threaten*
  (show her the photographs; she pays, loyalty starts at 25), or *inform* (pass the photographs to Kestrel through
  Gus/the bug; lowers Grid heat, earns Kaz's lasting enmity, and opens the "The Badge" ending earlier).
- **Consequences:** Kaz becomes a lieutenant candidate in the first two choices.
- **Closing:** a train of empty containers rolls by. Kaz: "You were always the quiet one. It scared Vince more than me."

#### M5 "Doors"

- **Purpose:** take a slice of the Grid's nightlife; Lock-Stock-style comedy of errors.
- **Place:** `KING_FL`, King St × Flinders Lane (−938, 120), −37.81929, 144.95693, and `KING_BOURKE` (−938, −221).
- **Characters:** Terry Maguire, three head bouncers, Bianca Rowe.
- **Opening cinematic:** Friday, 11 p.m. Queues on King St, a bouncer refusing a footballer. Terry watches from a Merc.
- **Objectives:**
  1. Talk to three head bouncers (`talkTo`, extended with `choice`): bribe, intimidate (aim; reuses `rob`) or appeal
     (if you have Fitzroy influence: "Shiv says hello").
  2. Bianca runs with the night's envelopes. Chase her on foot through the grid streets (she is a pedestrian with a
     scripted route, `pathRunner`).
  3. Terry arrives with four men. **Choose:** fight (targets: 4) or **negotiate**. The negotiation is a three-step
     choice tree where a wrong answer escalates to the fight.
- **Choice:** *split the doors 50/50 with Terry* (stable, lower income), *take the doors* (Terry becomes an enemy and
  later sides with the Nomads in the war) or *let Bianca keep the envelopes* (Bianca becomes your informant inside
  Kingsgate).
- **Consequences:** Grid nightlife income; Kingsgate's attitude; the Bianca flag.
- **Closing:** dawn on King St. A street sweeper passes the doors you own now.

#### M6 "The Ferryman's Toll" (Act I finale)

- **Purpose:** the raid, the escape, the revelation of a leak, and Sully.
- **Place:** `HQ` (−224, 120) → `FSS`, Flinders Street Station (−178, 265) → `FEDSQ`, Federation Square (143, 346),
  −37.81801, 144.96937.
- **Characters:** DI Helen Marsh (first appearance), Ruby, Davo, Sully.
- **Opening cinematic:** the Quiet Room at closing. Ruby is counting. Headlights sweep the window, three cars. Marsh
  comes in alone and orders a lemonade.
- **Dialogue:**
  - Marsh: "I read your file on the plane back from a conference. Twelve pages. Ten of them say 'unknown.'"
  - You: "Sounds like a short conference."
  - Marsh: "The warrant's for the ledger. Not you. Not yet."
- **Objectives:**
  1. Ruby slips the ledger to you. **Escape** on foot through the back into Flinders Lane while uniforms come through
     the front (`stealth` + timer).
  2. Davo is at Flinders St × Elizabeth. Drive and **evade** two unmarked cars in the grid. The grid is one AI network,
     so normal traffic plus `pathDriver` pursuers can be used.
  3. Dump the car near the station and **blend** into the Fed Square crowd: stand still among pedestrians in the
     marker for 10 s while heat decays (new mechanic: `blend`).
- **Revelation:** Sully steps out of the crowd. "They knew which floorboard. Someone told them which floorboard."
- **Choice:** who keeps the ledger: *Ruby*, *Davo*, *Sully* or *yourself* (stash it). This sets the Act III
  vulnerability: the keeper's loyalty decides whether the ledger survives M15.
- **Consequences:** Grid heat +30; Sully is available as the intelligence lieutenant; the mole flag is armed.
- **Closing:** VO over Princes Bridge at night (requires the bridge deck, section 8): *"Someone inside wanted me
  caught. Not killed. Caught. That narrows it."* **Title card: Act II, "The Board."**

### ACT II: THE BOARD

On entry to Act II the lieutenant system unlocks. The player appoints up to four lieutenants, one per held territory
(section 6).

#### M7 "Gertrude Street"

- **Purpose:** Fitzroy; family loyalty; a community-facing moral choice.
- **Place:** `WELL_GIPPS`, the Gipps Arms, Wellington × Gipps (2058, −585), −37.80442, 144.98644, and `ATHERTON`,
  Atherton Reserve and estate (1516, −939), −37.80301, 144.9793.
- **Characters:** Shiv, Fergal, Tess, Father Lenehan, Davo (whose mum's house was on Oxford St).
- **Opening cinematic:** a wake in the Gipps Arms. A fiddle. Shiv behind the bar, flinty.
- **Dialogue:**
  - Shiv: "Davo vouches for you. Davo's vouched for some right mongrels."
  - You: "He's consistent."
  - Shiv: "My brother's dealing out of the towers. Not our rule. Never was. I can't touch him. Family. You can."
- **Objectives:**
  1. At the estate, **talk to** four residents (`talkTo` with authored answers) to find where Fergal's runners stash.
  2. **Search** two stairwell spots and a car boot on Napier St.
  3. Fergal bolts in a hatchback. **Chase** it inside the Fitzroy–Collingwood network (AI traffic exists there), and
     box him in on Smith St (`SMITH_GERT`).
- **Choice:** *hand Fergal to Shiv* (Doherty alliance +40), *hand Fergal to Kestrel* via Sully (Grid heat −15; Shiv
  hates you; Tess is quietly impressed) or *recruit Fergal* (cheap muscle; Doherty relationship −20; he is a mole
  candidate with low loyalty).
- **Consequences:** Fitzroy influence; Tess becomes a lieutenant candidate if the Doherty relationship is ≥ 0.
- **Closing:** Tess, on the pub step: "You know Mum'll never thank you." "I'm not here for thanks."

#### M8 "Members Only"

- **Purpose:** introduce the Members and the Fishermans Bend rezoning plot.
- **Place:** `YARRA_PARK` (1336, 881), −37.81903, 144.98416, beside the `MCG` (1229, 948), on game day.
- **Characters:** Gerald Ashcombe, Philippa Crane, Graeme Lowe; Ruby on comms.
- **Opening cinematic:** Yarra Park full of scarves. The crowd system dense, with chants as voice barks. Ashcombe's
  chauffeur waits under the elms.
- **Objectives:**
  1. In the crowd, **pickpocket** Philippa's second phone: approach unseen and press T while she is distracted (new
     mechanic: `lift`, a stealth variant of `rob`).
  2. Ruby clones it remotely: **stay within 20 m of Philippa for 60 s** as she moves through the crowd (`tail` on foot).
  3. Return the phone before she notices (the reverse `lift`).
  4. Ashcombe invites you to his car. A sit-down in the back seat.
- **Dialogue:**
  - Ashcombe: "You're the Lombardo fellow's ... what are you, exactly?"
  - You: "A neighbour."
  - Ashcombe: "Melbourne's a small town with tall buildings. Everyone's a neighbour. Fishermans Bend is going to be the
    largest urban renewal in the country. Neighbours who help, prosper."
- **Choice:** *partner* (Ashcombe offers a slice for "smoothing" the Nomads off the land) or *leverage* (keep Philippa's
  messages and say nothing yet).
- **Consequences:** East Melbourne influence +10 either way; the rezoning plot opens; Members' relationship.
- **Closing:** the siren for the first bounce carries over the park. VO: *"Ashcombe thinks the Nomads are his
  problem. They're his alibi."*

#### M9 "Container Seven"

- **Purpose:** the logistics heist; showcase the vehicles; Docklands to the Westside.
- **Place:** `DOCK_FOOTSCRAY`, Footscray Rd × Harbour Esplanade (−1834, −955), −37.81279, 144.94331 → `LORIMER_MONT`,
  Lorimer × Montague (−1908, 497), −37.82536, 144.94793.
- **Characters:** Davo (or the Docklands lieutenant), Kaz or Jonno, Hammer (first glimpse).
- **Opening cinematic:** a crane lifts a container stencilled "7". Kaz (if partnered): "Uncle Ray's tobacco. He thinks
  it's going to Dandenong."
- **Objectives:**
  1. Steal the prime mover at the container gate (`steal`, extended with a vehicle class `truck`; this needs a truck
     model).
  2. Drive the truck to the Westside **across the Yarra by the Charles Grimes Bridge** (Wurundjeri Way → Montague St).
     **This requires the bridge (section 8).** Fallback until it is built: deliver to the Southern Cross yards.
  3. Nomads intercept on Lorimer St. Ram one bike off; reach the warehouse with health above 40%.
- **Choice:** *keep the tobacco* (cash +$80k, North Melbourne influence −10, Kaz loyalty −) or *burn it on Lorimer St*
  (a bonfire visible from the Docklands; Uncle Ray blames the Nomads, which accelerates the war; Kaz loyalty +).
- **Consequences:** Docklands influence; Nomads hostility +.
- **Closing:** the container's doors open on cartons. Hammer is waiting inside with a cigarette. "Col sent me to kill
  whoever opened this." (beat) "I'm on a smoko."

#### M10 "Short Change"

- **Purpose:** a con (Lock Stock); Ruby's revenge; Southbank.
- **Place:** `STURT_SBB`, Southbank Blvd × Sturt St (−226, 858), −37.82346, 144.96732, and `CROWN` frontage (−925,
  598), −37.82331, 144.95885.
- **Characters:** Ruby, Marcus Vellacott, a chauffeur, Mick (who owes Golden Reef).
- **Opening cinematic:** a hotel suite (staged as a balcony shot from the Eureka frontage). Vellacott counts money by
  machine. Ruby, on a bench across Southbank Blvd: "Every Thursday the float goes from the suite to the restaurant in
  a chauffeur car. He never checks the bag twice."
- **Objectives:**
  1. **Tail** the chauffeur on foot along the riverside promenade and Southbank Blvd (`tail`).
  2. At the restaurant, **swap** the bag. Wait 4 s in the marker while Mick causes a scene (Mick's line plays; this
     reuses `wait`).
  3. Deliver the bag to Clarendon × Whiteman (`CLAR_WHITE`) without being followed (`evade` against a chauffeur
     `pathDriver`).
- **Choice:** *keep the money* (Ruby's loyalty +20, Mick's debt cleared, Vellacott hunts you), *give it back
  anonymously with a note* (Vellacott respects you and opens a laundering channel; Ruby's loyalty −15) or *frame
  Kingsgate* (only if M5 ended badly; Golden Reef and Kingsgate go to war).
- **Consequences:** Southbank influence; laundering capacity; Ruby's personal objective progresses (Joost's charge).
- **Closing:** Vellacott on the phone, to no one: "Somebody's swimming in my river."

#### M11 "The Bend"

- **Purpose:** the Nomads' clubhouse; Hammer's defection; war or deal.
- **Place:** `NORMANBY_MONT`, the clubhouse at Normanby × Montague (−1995, 890), −37.82897, 144.94847.
- **Characters:** Col Ferris, Hammer, Tunnel Mayer.
- **Opening cinematic:** the clubhouse yard, bikes in a row. Col on a milk crate.
- **Dialogue:**
  - Col: "You burnt my tobacco, mate." (or: "You kept my tobacco.")
  - You: "It wasn't yours. It was Ray's. You were just storing it, for a man who's been paying you less every year."
  - Col: "Ashcombe wants my land. Ray wants my roads. What do you want?"
  - You: "Your treasurer."
- **Objectives** depend on the approach:
  - *Deal:* a negotiation tree. Then **escort** Tunnel (the treasurer) out alive past prospects who do not know about
    the deal: `escort` + `defend`.
  - *War:* clear the clubhouse yard (targets: 6; extend the target-marker pool from 4), then hold the gate for 60 s
    (`defend`).
  - *Flip Hammer:* in a private moment, Hammer offers to hand you the clubhouse. A dialogue with high stakes.
- **Consequences:** Westside control or war; Hammer becomes a lieutenant candidate (the flip or deal routes).
- **Closing:** Hammer cuts the patch off his vest with a Stanley knife and drops it in the bay off Bay St (`BAY_BEACH`,
  a short epilogue drive).

#### M12 "Sundown"

- **Purpose:** St Kilda; Lenny's book; an auction farce with a hit.
- **Place:** `FITZROY_GREY`, the Esplanade Lounge, Fitzroy × Grey (−701, 4960), −37.85977, 144.97753, then `PIER_END`,
  the St Kilda Pier kiosk (−1872, 5160), −37.86494, 144.96572 (the existing pier deck from `js/stkilda.js`), and `CAFE`
  (−985, 5470).
- **Characters:** Lenny Szabo, Dolly, Mick, Kaz (bidding), Ruby, a Golden Reef proxy, Philippa (bidding for the
  Members).
- **Opening cinematic:** Lenny in a velvet booth. "Forty-seven years of photographs. I'm selling them on the pier at
  sunset, like a gentleman."
- **Objectives:**
  1. Escort Lenny's wheelchair along the Esplanade to the pier (`escort`, on foot).
  2. The auction on the pier is played as dialogue choices: bid, bluff or expose a rival bidder using information
     from M8 or M10.
  3. A hit: two men in a dinghy (a boat; until boats exist, gunmen on the breakwater). **Defend** Lenny for 45 s.
  4. Get Lenny back to the Short Black café (`CAFE`) before the gunmen's car arrives (`time`).
- **Choice:** *buy the book* (−$150k, St Kilda influence +40, the book unlocks leverage options in Act III), *let Kaz
  win it* (Kaz's ambition +15; she owes you) or *burn it on the pier* (St Kilda loves you; everyone with something
  in the book owes you quietly).
- **Consequences:** St Kilda influence; Mick's loyalty; Lenny retires (or dies, if the defence fails, with a Mick
  loyalty penalty).
- **Closing:** Mick, over a short black: "Best coffee south of the river. Still."

#### M13 "Neutral Ground" (Act II finale)

- **Purpose:** the summit; a betrayal; the truce breaks.
- **Place:** `AP_PITS`, the Albert Park Grand Prix pits (−1341, 2717), −37.84258, 144.9623, on the existing circuit
  (`js/race-track.js`).
- **Characters:** every faction head or proxy: Vince or Nico, Kaz (and Uncle Ray, his only on-map appearance), Col or
  Hammer, Shiv, Terry, Vellacott, Ashcombe (who sends Philippa), Lenny's successor; all appointed lieutenants.
- **Opening cinematic:** a Sunday with the circuit closed. A trestle table in the pit garage. Each boss arrives in
  their own car (a showcase of the vehicle roster). VO: *"Albert Park. Nobody shoots here. That's the rule. Rules are
  just things that haven't happened yet."*
- **Dialogue:** a round-table, played as authored choices that set the terms of the truce. Uncle Ray, to you: "You
  took a boat out in '04 with something that belonged to all of us."
- **Objectives:**
  1. The summit (`sitdown` with several speakers).
  2. A shot from Lakeside Dr kills Uncle Ray (or Vince, if Ray is absent because Kaz has already moved against him).
  3. **Search** the shooter's position: shell casing, a car-park ticket and a phone. This reveals the shooter's car.
  4. **Chase** it round the circuit. The fleeing car is a race AI driver from `js/race.js`, steered off the racing
     line and onto the exit at Albert Rd.
- **The mole revealed:** the phone found in step 3 has messages from the mole (section 6.5 chooses who).
- **Choice:** *publicly blame the Nomads* (everyone turns on Col; easier war), *the truth* (expose the mole now;
  loyalty shock across all lieutenants) or *say nothing* (keep the mole in place and feed them lies through Act III,
  the deception route).
- **Consequences:** the war starts; Albert Park stops being neutral for Act III.
- **Closing:** **title card: Act III, "The Crossing."**

### ACT III: THE CROSSING

#### M14 "The Long Way Round"

- **Purpose:** Marsh's interrogation; Kestrel's offer; a moving cut scene.
- **Place:** a pickup at `RUSSELL_LT` (Russell × La Trobe, the old police HQ corner) (228, −694), −37.80891, 144.9664,
  then a driven interrogation through the grid and down St Kilda Rd, ending at `TOORAK_SKR`, Toorak × St Kilda Rd (7,
  2448), −37.8363, 144.97575 (Kestrel's South Yarra safe flat).
- **Characters:** Marsh, Sgt Tan, Sully (on comms).
- **Opening cinematic:** you are bundled into an unmarked car. Marsh is in the back with you.
- **Dialogue (interrogation tree, about 8 nodes):**
  - Marsh: "In 2004 a ledger left on a boat. In 2026 someone at Albert Park dies with your name in his mouth. I'm
    starting to think you're bad luck."
  - Options: *deny*, *deflect* (use the M2 bug intelligence if you kept it), *offer* (give up a rival: Col, Terry or
    Vellacott) or *ask what she wants*.
  - Marsh (if asked): "Ashcombe. The man's bought three planning panels and a minister. I can't touch him. You can."
- **Objectives:**
  1. The interrogation, played as the car drives a scripted route (camera in the car; the player cannot drive; uses a
     `pathDriver` with the player as passenger).
  2. Released at Toorak Rd. A second Kestrel team tails you: **evade** in the South network (AI traffic exists there).
- **Choice:** *agree to deliver Ashcombe* (opens the Badge ending), *refuse* or *double* (agree, then plan to give her
  the mole instead).
- **Consequences:** heat; the Marsh relationship; ending availability.

#### M15 "Red Light"

- **Purpose:** the war hits three territories at once. This is the lieutenant system's showcase.
- **Places:** `ARGYLE_SQ` (Carlton, the bocce club), `WELL_GIPPS` (Fitzroy, the Gipps Arms), `HQ` (the Grid, the Quiet
  Room).
- **Characters:** all appointed lieutenants; the attackers from the factions at war (Nomads, Kingsgate or Golden Reef,
  depending on earlier choices).
- **Opening cinematic:** three split-screen phone calls arriving at once.
- **Objectives:**
  1. **Choose** which attack to defend personally.
  2. Defend it (`defend`, targets: 6, in three waves).
  3. The other two are **resolved by their lieutenants**: success = `competence × 0.6 + loyalty × 0.2 + territory
     stability × 0.2 + a random factor of ±15 > 55`. A failure loses that business and influence; a loyalty below 30
     means the lieutenant *abandons* the position.
  4. Whoever holds the ledger (M6) has it attacked: the keeper's loyalty and competence decide whether it survives.
- **Consequences:** territory losses or holds; lieutenant deaths are possible (only if the lieutenant's competence is
  below 40 and the attack is severe).
- **Closing:** VO: *"You learn more about people in one bad night than in twenty good years."*

#### M16 "The Rezoning"

- **Purpose:** the heist on Ashcombe's site office, with a helicopter escape.
- **Place:** `LORIMER_MONT`, the Ashcombe Fenwick site office at Lorimer × Montague (−1908, 497), −37.82536, 144.94793.
  The exit is by helicopter (`js/helicopter.js`) over the Yarra to a pad near `CROWN` (−925, 598).
- **Characters:** Ruby (on comms), Hammer or Davo (driver), Sully (watching Kestrel's scanner), Tess (who drafted the
  legal threat that gets Ashcombe's lawyer out of the office).
- **Opening cinematic:** a model of the Fishermans Bend masterplan under a site-office spotlight. VO: *"Every great
  fortune in this city started with a field someone said was worthless."*
- **Objectives:**
  1. **Stealth** past two security guards and a CCTV mast. The mast is a `stealth` cone that sweeps.
  2. **Search** the office for the ledger safe, then crack it (`wait` 8 s; the stillness is the tension).
  3. Alarm. Nomads (or Ashcombe's private security) arrive. Reach the helicopter on the site's vacant lot.
  4. Fly out over the river and land on the Southbank pad (`heli` step: the player in helicopter mode, landing in a
     marker).
- **Choice:** *copy the ledger and leave the original* (Ashcombe does not know yet; the leverage route) or *take the
  original* (Ashcombe knows; the finale is harder).
- **Consequences:** the Westside rezoning leverage; Members hostility.

#### M17 "Dawn Service"

- **Purpose:** the mole confrontation, Mr Inbetween style: quiet and final.
- **Place:** `SHRINE`, the Shrine of Remembrance (25, 1777), −37.83054, 144.97344, at first light.
- **Characters:** the mole (section 6.5), the Ferryman and Davo (always present, whatever his role).
- **Opening cinematic:** the Shrine's forecourt in grey light, an eternal-flame glow. The mole arrives believing it is
  a routine meet.
- **Dialogue:** one authored scene per mole variant (Ruby, Sully, Nico, Kaz, Fergal), plus a "no mole" variant where
  the leak was Gus or the M2 bug, and the confrontation is with Marsh's informant handler instead. Each scene shares
  the same skeleton:
  1. "Why" (their personal objective, turned against you).
  2. "When" (the moment their loyalty broke; quoted from flags the game recorded).
  3. "What now."
- **Choice:** *execute* (Davo does it, off-screen; reputation +fear, everyone's loyalty −5), *exile* (they leave
  Melbourne; the dialogue references off-map places only) or *forgive* (that lieutenant's loyalty is fixed at 90 for
  the rest of the game, everyone else's +5, Marsh learns of it).
- **Consequences:** a vacant territory to reassign before the finale.

#### M18 "The Ferryman" (finale)

- **Purpose:** the orchestrated finale and one of three endings.
- **Place:** `PARLIAMENT`, Parliament House (819, −282), −37.81066, 144.97428 (a meeting at a Spring St restaurant
  facing the steps), with simultaneous operations at the other locations.
- **Characters:** Ashcombe, Philippa, Marsh, all lieutenants, Vince (if alive, by phone).
- **Opening cinematic:** a white tablecloth on Spring St. Ashcombe arrives; Parliament is lit behind him. The
  intercut shows three lieutenants moving into position.
- **Objectives:**
  1. **Orders.** Before the meeting, assign three operations to three lieutenants: *seize the Nomads' clubhouse*
     (Westside), *pull Kingsgate's doors* (the Grid) and *deliver the ledger copy* (to Marsh or to the press). Each
     resolves with the M15 formula and is shown as an intercut.
  2. **The table.** A long negotiation tree with Ashcombe. The player uses leverage gathered across the game: the
     ledger (M16), Lenny's book (M12), Philippa's phone (M8) and the bug (M2). Every item unlocks lines.
  3. **The walk.** Leave the restaurant and cross Spring St. What happens next depends on the ending.
- **Endings:**
  - **The Crown:** Ashcombe concedes and you join the Members. Epilogue: the MCG members' bar, a handshake with a
    minister. VO: *"They let me in. They always let in the ones who scare them."*
  - **The Badge:** Marsh arrests Ashcombe on the steps. You keep your territories and owe Kestrel forever. Epilogue:
    Marsh in the Quiet Room, ordering a lemonade again.
  - **The Ferry:** you give each territory to its loyal lieutenant and walk to Harbour Esplanade (`DOCK_COLLINS`), where
    a boat waits. The final shot mirrors M1 in reverse. VO: *"Some men build an empire. Some men are the river."*
- **Post-game:** free roam continues with the territory system running and the lieutenants' personal favours open.

### 5.1 Mission coverage

| Territory | Missions |
|---|---|
| The Grid | M1 (end), M2, M5, M6, M14 (start), M15 |
| Carlton | M3, M15 |
| North and West Melbourne | M4 |
| Docklands | M1, M4 (end), M9 |
| Fitzroy and Collingwood | M7, M15 |
| East Melbourne and the MCG | M8, M18 |
| Southbank and South Wharf | M2 (Eureka), M10, M16 (landing) |
| The Westside | M9, M11, M16 |
| Kings Domain and South Yarra | M14 (end), M17 |
| Albert Park and Middle Park | M13 |
| St Kilda | M12 |

**Mechanic variety across the 18 missions:** stealth ×4, tail ×4, evade ×5, search ×5, negotiation/choice in every
mission, chases ×4, defend ×4, escort ×3, photo, pickpocket, blend, helicopter, an orchestrated multi-lieutenant
finale, and three endings. Only M2's Ruby pickup and M9's truck delivery are "drive to a marker," and both carry a
twist.

---

## 6. Lieutenant management design

> **Superseded in part (after review):** the loyalty, income and independent-action rules are simplified and made
> event-driven, and the mole is chosen by logged events rather than a hidden score. See `MILESTONES.md`, milestones 3
> and 4. Boats, trucks, interiors and the helicopter escape are deferred; restaged missions are listed there too.

### 6.1 Attributes (0–100)

| Attribute | Effect |
|---|---|
| **Loyalty** | obeys orders; reduces skimming; resists approaches from rivals and Kestrel |
| **Ambition** | drives independent expansion and the wish to be promoted; with low loyalty it drives betrayal |
| **Greed** | skims income; can be bought by rivals |
| **Intelligence** | lowers the heat their actions generate; spots informants; plans better |
| **Competence** | income multiplier; wins fights and resolves operations (M15, M18) |
| **Relationships** | an affinity of −100 to 100 with every other character, the player included |
| **Personal objective** | a multi-stage goal (section 3.4) that opens favour missions; completing it gives loyalty +25 |

### 6.2 Starting statistics

| Lieutenant | Loy | Amb | Greed | Int | Comp | Notable relationships |
|---|---|---|---|---|---|---|
| Davo | 85 | 20 | 30 | 45 | 70 | Shiv +40, Ruby −20, Hammer +10 |
| Kaz | 40* | 90 | 55 | 85 | 85 | Nico −50, Ray −30, Mick +20 |
| Mick | 55 | 30 | 85 | 65 | 50 | Lenny +60, Vellacott −60 (debt) |
| Ruby | 60 | 75 | 45 | 95 | 80 | Vellacott −80, Sully −10, Tess +20 |
| Hammer | 50 | 60 | 40 | 55 | 90 | Col −40, Davo +10 |
| Nico | 35* | 95 | 70 | 60 | 55 | Vince +30, Kaz −50 |
| Tess | 65 | 60 | 15 | 90 | 45 (+5 per act) | Shiv +50, Fergal −30 |
| Sully | 45 | 40 | 55 | 80 | 75 | Marsh −70, Ruby −10 |

\* modified by mission choices (M3 and M4).

### 6.3 Appointment and orders

- Each held territory takes one lieutenant (the Sully "eyes" role takes none). Appointing gives loyalty +5 ("trusted").
  Moving a lieutenant out of a territory they want gives −10 ("slighted").
- **Fit bonus:** each lieutenant has preferred territories (section 3.4). A fit is ×1.2 competence; a mismatch (e.g.
  Ruby running the Westside) is ×0.8.
- **Posture** per territory, set from The Book:
  - **Earn:** default income.
  - **Expand:** +influence in adjacent rival territories, +heat, −stability.
  - **Enforce:** +stability, −income, +heat if competence is low.
  - **Lie low:** −heat, −income, −influence drift.
- **Cut:** each lieutenant's share is 10–30%, set by the player. Below their greed/4 + 10 the lieutenant is "unpaid"
  (loyalty −2 per tick). Above it, loyalty +1 per tick (capped).

### 6.4 The tick

The empire advances one **tick** per in-game day. Use `js/lighting.js` time of day if it advances; otherwise a tick
happens every 12 real minutes of play and whenever the player rests at HQ. Missions in progress pause ticks.

For each territory, per tick:

```
skim      = clamp((greed - loyalty) / 200 + (cut < greed/4+10 ? 0.05 : 0), 0, 0.35)
income    = baseIncome * influence/100 * (0.5 + competence*fit/200) * postureMul * (1 - skim)
heat     += activity(posture) * (1.2 - intelligence/125) - decay(5)
stability+= (competence - 50)/25 + (posture==Enforce ? 3 : 0) - recentViolence
```

For each lieutenant, per tick, there is **at most one independent decision**, rolled if `ambition/100 * (1 -
loyalty/150) > rand()`. The candidate actions are weighted:

| Action | Weight | Effect |
|---|---|---|
| Expand into an adjacent territory | ambition × competence | influence +3 there; may start a skirmish; the player is phoned |
| Skim extra | greed × (100 − loyalty) | hidden; Ruby (if Int > 80 and appointed) or Sully may detect it |
| Side deal with a rival faction | ambition × (100 − loyalty) | the rival's relationship +; may become the mole (6.5) |
| Talk to Kestrel | (100 − loyalty) × heat × intelligence | only when heat > 60; a mole candidate |
| Recruit | competence | +stability next ticks |
| Ask a favour | always eligible when the personal objective has an open stage | creates a favour mission (marker on the map) |
| Feud | when the relationship with another lieutenant < −40 | both lose stability; may escalate to violence between them |

Every decision produces a **report**: a phone call (a voiced line on the existing voice manager, priority below
story), a text in The Book, or nothing at all (hidden skims and side deals). Hidden actions leave **clues** that the
player can investigate: an income discrepancy, a sighting reported by Sully, or a bar rumour from Gus (M2 choice C).

### 6.5 The mole

At the end of M12 the game picks the mole:

```
score(l) = ambition + greed - loyalty + 20*[side deal taken] + 30*[talked to Kestrel] - 15*[personal objective done]
mole     = argmax over appointed lieutenants with score >= 60
```

- If no lieutenant reaches 60, the leak was the **M2 bug** (if it was not found) or **Gus** (choice B in M2).
- Authored variants exist for **Ruby, Sully, Nico, Kaz and Fergal**, plus the bug/Gus variant. Davo, Hammer, Tess and
  Mick cannot be the mole. Their maximum score is capped by story (each has a scene in M15 or M17 that depends on
  being loyal).
- Dialogue in M13 and M17 quotes the mole's recorded flags (for example "the night you skimmed the Westside take"),
  so the reveal feels earned.

### 6.6 Territory missions (repeatable)

These are short, systemic, procedurally placed jobs built from existing step types: protect a business (`defend`),
collect from a defaulter (`rob`/`talkTo`), intercept a rival shipment (`tail` + `targets`), and chase out a rival crew
(`targets` + `away`). They spawn when a territory's influence is contested (between 40 and 60) or its stability is
below 30. Places are drawn **only from `places.json` ids or OSM intersections in that territory** that pass the
validator (section 7.2).

### 6.7 Relationships between characters

- The affinity matrix covers the lieutenants and the faction heads.
- Events adjust it. Being saved by someone: +20. Being passed over for someone: −15. Working the same operation
  successfully: +5. A feud: −10 per tick.
- High affinity (> 50) between two lieutenants:
  - they cooperate: +10% to each other's operations in adjacent territories;
  - they cover for each other's skims.
- Low affinity (< −40) between two lieutenants:
  - they feud;
  - neither will take an order that helps the other.
- Lieutenant–faction affinity drives side deals. Kaz with Mick (+20) makes a St Kilda–North Melbourne side channel
  likely.

### 6.8 The Book (UI)

The Book is a panel opened from the toolbar (or with B). It has four tabs:

1. **Map:** territory tint over the existing minimap/full map (`js/nyc-map.js`'s map system), showing control,
   contested borders, heat and the lieutenant's portrait.
2. **People:** a card per lieutenant with stats (Intelligence-dependent fog: low-intelligence lieutenants' hidden
   actions are visible only as "?"), cut slider, posture and relationship lines.
3. **Ledger:** income by territory, laundering capacity, heat.
4. **Messages:** reports and clues.

The Book uses the same overlay style as the teleport popover (DOM only, no framework).

---

## 7. Technical integration plan

**Principles:** no new engine; no duplicate mission system; no map rebuild. Extend `js/missions.js`, `js/stkilda.js`,
`js/race.js`, `js/people.js`, `js/voice-manager.js` and `js/melbourne-config.js` in place.

### 7.1 Phase 0: map and data fixes (before story work)

1. **Tobacco Wars place.** Replace `{ road: 'SOUTH WHARF DRIVE' }` with an explicit point in South Wharf.
2. **District labels.** Replace `districtAt`'s rule chain with polygon tests along real streets (the territory polygons
   in `territory-map.svg` are the starting point), and add `west_melbourne`, `collingwood`, `fishermans_bend` and
   `south_yarra`. Minimap labels improve as a side effect.
3. **The Yarra bridges** (section 8 #1), at least Princes Bridge, Queens Bridge, the Spencer St Bridge and Charles
   Grimes Bridge: deck meshes plus `getGroundHeight` and road-graph links.
4. **Water as an obstacle for cars.** `inWater` exists in `melbourne-config.js`: cars entering water should stall and
   sink (a mission failure), so that bridges matter.
5. **Join the AI road networks**, at least Grid↔South (St Kilda Rd / Princes Bridge, Kings Way / Queens Bridge),
   Grid↔Docklands (La Trobe, Collins and Bourke St extensions, Dudley St) and Grid↔Fitzroy (Victoria Pde / Spring St).
   Use `?debugroads` and the SCC check from this audit as a regression test.

### 7.2 Phase 1: the places registry and its validator

- Add `js/story/places.js`, generated from `docs/story/places.json`. Missions reference places by id:
  `{ at: { place: 'ARGYLE_SQ' } }`. Add a `place` branch to `resolve()` in `missions.js`. Keep `grid`, `cross`,
  `circuit`, `cafe` and `pier`. Add `lonlat`, using the existing exported `fromLonLat`.
- Add `tools/melbourne/check-places.mjs`, a Node script that fails if a place:
  - lies outside `GEO.bounds`, or within 60 m of the edge;
  - is in water (`inWater`), unless it is flagged `onWater`, like the pier;
  - is inside a building footprint;
  - has a `cross` reference whose two roads are more than 15 m apart.

  It also reports each place's road-network component, so a mission that needs AI cars knows whether they can reach
  it. **This is the guard against invented geography.**

### 7.3 Phase 2: mission step types

All of these extend the step loop in `missions.js` `update()`. Most reuse existing pieces:

| Step | What it does | Reuses |
|---|---|---|
| `choice` | a cut-scene line with 2–4 options; sets `save.flags` and calls effect hooks (influence, loyalty, money) | `showCut` / `renderCut`, the Enter/click handler |
| `sitdown` | a seated scene at any table location (generalise `stkilda.js`'s café: table, seats and shot list as data) | `stkilda.js` scene code, `cast.setSeated` |
| `stealth` | fail if inside a watcher's view cone (angle, range, line of sight blocked by buildings) | `building-collision.js` for line of sight, cast actors as watchers |
| `tail` | keep the target within [min, max] metres for t seconds | marker and pointer code |
| `evade` | get more than R m from all pursuers for t s | `away` logic |
| `search` | N interactable spots (yellow markers, small radius); T to inspect | the `talkTo` / T key path in `gameplay.js` |
| `photo` | aim at N target actors while holding T | the aim and lock-on code in `gameplay.js` |
| `lift` | `rob` without the gun, fails if the target faces you | `rob` |
| `blend` | stand still within R of at least 5 pedestrians for t s | `traffic.peds` |
| `escort` / `defend` | keep a cast actor alive and in range / keep attackers out of a zone | `targets`, cast actors |
| `heli` | be in helicopter mode, then land in a marker | `controllers.js` helicopter mode |
| `passenger` | the player rides while a `pathDriver` drives; the camera stays in the car | `cameras.js`, `pathDriver` |
| `orders` | the M15/M18 lieutenant operations; resolved by `empire.js` and shown as intercut cuts | `empire.js` |

**`pathDriver` (new, small).** Extract the AI driver from `js/race.js`: a curvature speed profile along a polyline
that passes slower cars. Make it drive along:

- an authored polyline (Carlton scooter, M3);
- an A* path on `__roadEdges`-style graph data, where a network exists.

It is used by every chase, tail and pursuit, and it removes the dependency on traffic-network connectivity. The target
markers grow from 4 to 8.

### 7.4 Phase 3: `js/empire.js` (the territory and lieutenant system)

`createEmpire({ missionSystem, mapSystem, voices, cast })` owns territories, factions, lieutenants, ticks, decisions,
reports and The Book UI. `missions.js` calls `empire.apply(effects)` from `choice` steps. `empire` calls
`missionSystem.offer(job)` for favour and territory missions.

- **Data** in `js/story/territories.js`, `js/story/factions.js`, `js/story/lieutenants.js` (stats, preferences,
  objectives) and `js/story/act1.js`, `act2.js`, `act3.js` (mission definitions in the existing `MISSIONS` format,
  plus the new step types). The existing ten jobs move unchanged to `js/story/prologue.js`.
- **Save:** bump `SAVE_KEY` to `gta-melbourne3d-save-v2`, migrating from v1 (`money`, `progress`):

  ```json
  { "money": 0, "prologue": 11, "act": 1, "mission": "M3", "flags": {},
    "territories": { "CARLTON": { "controller": "lygon", "influence": { "player": 30 }, "lieutenant": null,
                                  "heat": 10, "stability": 70, "posture": "earn" } },
    "lieutenants": { "ruby": { "loyalty": 60, "ambition": 75, "greed": 45, "intelligence": 95, "competence": 80,
                               "territory": "SBANK", "cut": 0.2, "objective": { "stage": 1 }, "alive": true } },
    "relationships": { "ruby|sully": -10 },
    "reports": [] }
  ```

- **Map overlay:** add a territory tint layer and border lines to the existing map system (`mapSystem` in
  `nyc-map.js`), drawing the territory polygons.
- **Jobs menu:** the teleport menu's Jobs list (`main.js`) groups by act and adds "Favours" and "Territory jobs."

### 7.5 Phase 4: cast, animation and voices

- **`STORY_CAST`** (`people.js`) gains the new principals, mapped to the existing Rocketbox pool until Ara models
  exist, for example:
  - Ruby → `Business_Female_01`, Ashcombe → `Business_Male_01`, Marsh → `Female_Adult_09`, Shiv → `Female_Adult_05`
  - Hammer → `Male_Adult_18` (gang pool), Nico → `Male_Adult_11`, Sully → `Male_Adult_14`
- **Ageing the 2004 cast** for the present day: greying textures for Vince, Davo, Kaz and Mick, from
  `tools/ara` / `characters/`.
- **Voices:** add identities and lines to `../data/character-voices.json` and generate them offline with
  `tools/voices/generate.py`, as for the existing 66 lines. Until lines are generated, `sayText` shows subtitles only.
- **Moods:** the existing `moodOf()` heuristics work; add explicit moods to authored lines where it matters
  (interrogation, reveal).

### 7.6 Phase 5: content, in order of dependency

1. Act I (M1–M6). It needs `choice`, `sitdown`, `stealth`, `evade`, `tail`, `search`, `photo`, `blend`, `passenger`
   and `pathDriver`, plus the bridges for M6's closing shot.
2. Act II (M7–M13). It needs `lift`, `escort`, `defend`, a truck vehicle class and Charles Grimes Bridge (M9), boats
   (M12, optional), and the race-AI reuse (M13). The lieutenant system goes live here.
3. Act III (M14–M18). It needs `heli` and `orders`, and the ending branches.

### 7.7 Testing

- `tools/melbourne/check-places.mjs` in CI (Node only, fast).
- Playwright scripted checks through `window.__city`: teleport to each mission start, assert the marker resolves within
  the bounds and not in water, run each step type's unit scenario, and assert the save migrates from v1 to v2.
- A road-network regression: the number of SCCs and the kept-edge ratio from `?debugroads`, which should rise as phase
  0 joins networks.

---

## 8. Missing map connections and geography to expand

These are listed in priority order for the story.

| # | Missing | Why the story needs it | Notes |
|---|---|---|---|
| 1 | **Yarra bridges: Princes Bridge, Queens Bridge, Spencer St Bridge, Charles Grimes Bridge, Swan St Bridge**; pedestrian: Sandridge, Evan Walker, Southbank footbridge, Webb, Seafarers | M2, M6, M9, M10, M16; any south-of-river travel | no bridge is built; the player drives on the river. Princes Bridge is in `GEO.roads` (230 m) but has no deck |
| 2 | **AI road network joins** | chases, tails and believable traffic everywhere | 14 separate networks; only 38% of centreline edges kept. CBD↔South (St Kilda Rd, Kings Way: already noted in the README), CBD↔Docklands, CBD↔Fitzroy, South↔Port Melbourne/Fishermans Bend, South↔St Kilda |
| 3 | **AI traffic in Carlton, East Melbourne, North Melbourne, the St Kilda core** | M3, M4, M8, M12 street life | Lygon St is 330 m from any kept edge |
| 4 | **CBD laneways** (Degraves St, Centre Place, Hosier Lane, AC/DC Lane, Hardware Lane, Bank Place) | M2 and M6: the Quiet Room's back door, the laneway escape | the README lists "laneways inside the grid" as a to-do; not in `GEO.roads` |
| 5 | **Water: cars sink; boats** | M1, M12, the Ferry ending | `inWater()` exists but is not used for cars; no boat vehicle exists |
| 6 | **A truck vehicle** (prime mover with a container) | M9 | the traffic has utes, sedans and buses only |
| 7 | **Lygon St north of Grattan St** (Faraday, Elgin St: the restaurant strip proper) | Carlton's identity | the map edge is −37.800; extending it 400 m north takes in the strip |
| 8 | **Luna Park, the Palais Theatre, Acland St's southern block** | St Kilda's identity | about 100–200 m south of −37.867 |
| 9 | **Richmond: Swan St, Bridge Rd, Church St** | MCG game-day spill-over, a possible 12th territory | east of Punt Rd: only 311 m of Swan St are in |
| 10 | **Chapel St** (South Yarra/Prahran) | Kings Domain and South Yarra nightlife | lies just east of 144.990 |
| 11 | **Brunswick St and Smith St north of Johnston St**, and Johnston St | Fitzroy's identity | the edge is about Kerr St |
| 12 | **Station Pier** | a possible Ferry ending at the Spirit of Tasmania terminal | 144.930 E, about 400 m west of the edge |
| 13 | **Freeways** (CityLink, West Gate, the Bolte Bridge) | out-of-town escapes, Ray's trucks "to Dandenong" | deliberately excluded (viaducts and tunnels); keep off-map |
| 14 | **Landmark footprints/models**: South Melbourne Market, Old Melbourne Gaol, Melbourne Museum, the Convention Centre, Polly Woodside's ship, the Atherton Gardens towers as named landmarks | flavour; mission staging | add to `GEO.landmarks` via `tools/melbourne/build-geodata.mjs` |
| 15 | **Interiors** (the Quiet Room, the Gipps Arms, the MCG members' area, the site office) | cut scenes are staged outside until they exist | a stretch goal |

**Not to be added for the story:** Ringwood, Dandenong, Broadmeadows, Alphington and Brighton stay off-map and are
mentioned in dialogue only.

---

## Appendix A: verified story places

See `places.json` for the full table (59 places), which includes the world coordinates, lat/lon, the distance to the
edge, the current district label and the AI-network membership.
