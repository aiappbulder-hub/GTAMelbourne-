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
- Roads follow the real curves, with footpaths, kerbs, lane markings, stop lines and tram tracks. Buildings line up with the street: towers in the CBD, mid-rise round it, shops on the main roads and houses in the suburbs.
- The West Gate and Bolte bridges climb over the Yarra on piers, with cable-stay pylons.
- 3D Melbourne landmarks: Eureka Tower, Rialto Towers, Flinders Street Station, St Paul's, Federation Square, the Arts Centre spire, Crown, the Melbourne Star, the Royal Exhibition Building, the Shrine of Remembrance, Luna Park, the MCG with its light towers, and the West Gate Bridge pylons.
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
