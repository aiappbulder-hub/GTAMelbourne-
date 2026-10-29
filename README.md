# GTA Melbourne

A 3D GTA-style game set in Melbourne. It's a single `index.html` with no build step. It loads Three.js from a CDN for the 3D view and falls back to the original 2D view if that can't load.

**Melbourne, 2004.** The underworld war between the Lygon Street Crew and the Broadmeadows mob is in its sixth year, and Taskforce Kestrel is closing in. All characters, crews and vehicles are fictional.

## Play

**Play online:** https://aiappbulder-hub.github.io/GTAMelbourne-/

Open `index.html` in a desktop or mobile browser. To serve it locally: `python3 -m http.server`, then visit http://localhost:8000.

| | Keyboard / mouse | Touch |
|---|---|---|
| Move on foot | WASD or arrows (chase camera: A/D turn, W forward, S back) | Drag on the left half |
| Drive | W gas, S brake/reverse, A/D steer, Space handbrake | ◀ ▶ arrows steer, GAS, BRAKE, REV, HB (handbrake), EXIT |
| Turn the camera | Z / C, or drag with the right mouse button | Drag the right side of the screen (anywhere while driving) |
| Shoot | Click, Space (on foot), Ctrl or J | FIRE (aims itself at the nearest target) |
| Aim | Hold the right mouse button: over-the-shoulder view, crosshair and lock-on; A/D strafe | |
| Get in / out of a car | E or F | CAR |
| Brake | Space (in a car) | BRAKE |
| Switch weapon | Q, Tab, wheel, 1–4 | GUN |
| Map / pause / horn | M / P or Esc / H | MAP / II |
| Camera | V cycles 3D chase cam, 3D overhead and classic 2D | CAM |

Prefer pointing the stick where you want to go? Switch **Driving: point** in the pause menu (overhead and 2D cameras).

## What's in it

- Traffic uses real low-poly 3D models from Kenney's CC0 Car Kit and Starter Kit Racing: sedans, sports cars, SUVs, vans, taxis, police, utes, ambulances, fire trucks and garbage trucks, with spinning wheels and repainted bodies for variety. See `models/README.md`. Models load when the game is served over http(s), such as GitHub Pages.

- The map is real Melbourne, built from OpenStreetMap: the actual streets, freeways, tram lines, railways, the Yarra, the bay, parks and suburbs, from Sunshine to Ringwood and Essendon to Dandenong. It's a fisheye, so the CBD is close to true size and the suburbs are squeezed into a short drive. The Monash runs through Glen Waverley to Dandenong and EastLink from Ringwood to Dandenong (south of the OSM extract these are filled in by hand).
- The top of the screen always shows your suburb and the real street you're on, or the freeway's name.
- Only the main streets and longer side streets are kept, and short dead ends and offshoots are pruned, so the network is easy to drive.
- In 3D the ground rolls: gentle hills that rise towards the Dandenongs in the east and settle to sea level along the bay and rivers. CBD towers step back as they rise.
- Roads follow the real curves, with footpaths, kerbs, lane markings, stop lines and tram tracks. Buildings line up with the street: towers in the CBD, mid-rise round it, shops on the main roads and houses in the suburbs.
- The West Gate and Bolte bridges climb over the Yarra on piers, with cable-stay pylons.
- Tunnels run underground: CityLink's Burnley Tunnel under the Yarra, the West Gate Tunnel, EastLink's Melba Tunnel and the North East Link (built in the game, from the Eastern Freeway at Bulleen north under Watsonia). Portals are open trenches that ramp down to a lit tunnel mouth; underground you're out of sight of the streets above, so cops on the surface lose you, and you can't get out of the car until you're back up.
- Freeways are open: drive onto one from anywhere, or use the simple diamond interchanges. Other streets cross on overpasses instead of meeting them. Freeways link up with each other, and where one runs off the edge of the map it ends at a barricade. Every street leads somewhere: dead ends and doubled-up roads are cleared out when the map is built. The Albert Park circuit runs around the lake shore. Hold right-click to aim, then steer with A/D while you shoot. Tap (or click) a baddie to lock on; fire with nothing locked and you lock on to the nearest one coming for you, even behind you. Jobs start you on full health with a vest. Trees are scenery you can drive through, and if your car gets wedged, keep the pedal down and after a moment it hops back onto the nearest road.
- Melbourne landmarks modelled in Blender and placed where they really are: Flinders Street Station with its dome and clocks, the Arts Centre spire, the MCG with its stands and light towers, Eureka Tower, Rialto, St Paul's, Federation Square, Crown, the Melbourne Star, the Royal Exhibition Building, Parliament House on Spring Street, the Shrine of Remembrance, Luna Park's face, and the West Gate and Bolte bridge pylons.
- The Albert Park Grand Prix circuit loops around the lake, with kerbs, a grandstand and a lap timer at the start/finish line. The Tan running track loops around the Botanic Gardens.

- Buildings and trams go see-through when they come between the camera and you.
- Traffic drives on the left along the real road network, picks turns at junctions and queues behind trams. Trams run back and forth along real tram routes, and pedestrians walk the footpaths.
- Map data © OpenStreetMap contributors (ODbL), via the extract in [k-dhingra/melbourne-street-directory](https://github.com/k-dhingra/melbourne-street-directory). `tools/build_map.py` turns it into `map/melbourne.js`.
- The wanted level runs from 1 to 5 stars. Patrol cars come first, then unmarked cars and Highway Patrol, then AFP SUVs at 5 stars. Cops get out on foot and can bust you, but they only shoot from 3 stars and they aren't good shots. Gangsters and cops are poor shots and their bullets do modest damage. Health regenerates quickly a few seconds after you stop taking hits, and you respawn with half armour and a few seconds of protection. You lose them by staying out of sight, or pay $250 at a Mod Shop for a respray.
- Weapons are fists, pistol, Uzi and shotgun, with drive-bys forward from the car. Cars smoke, catch fire and explode, with chain reactions.
- There are five story missions, timed checkpoints, Ammu-Nation shops (plus a $20 pie for health), hospitals, police stations, safe houses that save to localStorage, and pickups.
- Street crews hold their turf: the Lygon Street Crew in Carlton/Fitzroy, the Broadmeadows mob in Essendon and Coburg, and the Westside Nomads in Sunshine. They leave you alone until you start something.
- Custom low-poly vehicles modelled in Blender (`tools/make_models.py`): Comodo sedan, Barrina hatch, Victoria Police car with checker band, taxi, E-class style tram and the Fjord Strainger Wildtrak, a dual-cab 4x4 ute with flares, bull bar, snorkel, sports bar and roof light bar.
- Cars carry parody Aussie badges (Holdan Comodo, FPB Typhoon F6, HSB Clubbie R8, Holdan Ute SS, Fjord Territorial, Toyoda Tarrago, and more).

### Graphics

On desktop the 3D view adds screen-space ambient occlusion (three.js's own `SSAOPass`, loaded on demand) and a light colour grade; it switches itself off if the frame rate can't keep up. Everywhere, walls darken towards their base and buildings and trees leave soft contact shadows on the ground.

### Essendon Airport

An airliner and a light plane fly circuits out of Essendon Airport: they taxi out, take off, loop over the city and the bay, come back on approach, land and taxi in again (and they'll stop for you if you park on the runway). A police helicopter takes off from its pad on the apron to visit the landmarks, and once you have three wanted stars it comes and circles over you. The aircraft are modelled in Blender by `tools/make_aircraft.py`.

### Around town

- **Talk to people**: walk up to someone and press <kbd>T</kbd> (or TALK on touch). Locals have plenty to say; gangs and cops less so, and nobody's chatty if you've just been shooting.
- **Cutscenes**: missions open with a short scene where the job giver steps up and briefs you, spoken aloud with your device's own speech voice (an Australian one where available). <kbd>Space</kbd> or a tap moves on, <kbd>Esc</kbd> skips.
- **Tobacco Wars**: a new mission against the Westside Nomads. Kaz hands you a **rocket launcher** (weapon 5, or buy one at the Gun Shop).
- **Cash Van Heist**: a side job (the gold **H** in the CBD) you can do any time you're not on a mission: stop the Armourcorp van, deal with the guards, grab the cash and get it to Collingwood.
- **Footy at the G**: two teams kick the ball around the MCG while you're nearby.
- **Crown's fire towers** on the Southbank promenade light up every so often.
