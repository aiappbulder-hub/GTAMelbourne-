# GTA Melbourne

A 3D GTA-style game set in Melbourne. It's a single `index.html` with no build step. It loads Three.js from a CDN for the 3D view and falls back to the original 2D view if that can't load.

**Melbourne, 2004.** The underworld war between the Lygon Street Crew and the Broadmeadows mob is in its sixth year, and Taskforce Kestrel is closing in. All characters, crews and vehicles are fictional.

## Play

**Play online:** https://aiappbulder-hub.github.io/GTAMelbourne-/

Open `index.html` in a desktop or mobile browser. To serve it locally: `python3 -m http.server`, then visit http://localhost:8000.

| | Keyboard / mouse | Touch |
|---|---|---|
| Move on foot | WASD or arrows | Drag on the left half |
| Drive | W gas, S brake/reverse, A/D steer, Space handbrake | ◀ ▶ arrows steer, GAS, BRAKE, REV, HB (handbrake), EXIT |
| Turn the camera | Z / C, or drag with the right mouse button | Drag the right side of the screen (anywhere while driving) |
| Shoot | Click, Space (on foot), Ctrl or J | FIRE |
| Get in / out of a car | E or F | CAR |
| Brake | Space (in a car) | BRAKE |
| Switch weapon | Q, Tab, wheel, 1–4 | GUN |
| Map / pause / horn | M / P or Esc / H | MAP / II |
| Camera | V cycles 3D chase cam, 3D overhead and classic 2D | CAM |

Prefer pointing the stick where you want to go? Switch **Driving: point** in the pause menu (overhead and 2D cameras).

## What's in it

- Traffic uses real low-poly 3D models from Kenney's CC0 Car Kit and Starter Kit Racing: sedans, sports cars, SUVs, vans, taxis, police, utes, ambulances, fire trucks and garbage trucks, with spinning wheels and repainted bodies for variety. See `models/README.md`. Models load when the game is served over http(s), such as GitHub Pages.

- The West Gate Bridge climbs over the Yarra on piers, with cable-stay pylons.
- 3D Melbourne landmarks: Eureka Tower, Rialto Towers, Flinders Street Station, St Paul's, Federation Square, the Arts Centre spire, Crown, the Melbourne Star, the Royal Exhibition Building, the Shrine of Remembrance, Luna Park, the MCG with its light towers, and the West Gate Bridge pylons.
- The Albert Park Grand Prix circuit loops around the lake, with kerbs, a grandstand and a lap timer at the start/finish line. The Tan running track loops around the Botanic Gardens.

- In 3D, buildings rise from the map: CBD towers, a Southbank skyline, houses with backyards, the MCG bowl and shipping containers at the port. Buildings and trams go see-through when they come between the camera and you.

- The city is generated from `reference-map.png`. It includes Port Phillip Bay, the Yarra and Maribyrnong rivers, the freeway network (M1, M2, M3, M80), Tullamarine Airport, the Port of Melbourne, St Kilda Pier, the MCG, parks and beaches, with the CBD towers giving way to suburban houses further out.
- Traffic drives on the left, follows the street grid and freeways, and queues behind trams on the Swanston St / St Kilda Rd and Flinders St lines.
- The wanted level runs from 1 to 5 stars. Patrol cars come first, then unmarked cars and Highway Patrol, then AFP SUVs at 5 stars. Cops get out on foot and can bust you, but they only shoot from 3 stars and they aren't good shots. Health slowly regenerates once you're out of trouble. You lose them by staying out of sight, or pay $250 at a Mod Shop for a respray.
- Weapons are fists, pistol, Uzi and shotgun, with drive-bys forward from the car. Cars smoke, catch fire and explode, with chain reactions.
- There are five story missions, timed checkpoints, Ammu-Nation shops (plus a $20 pie for health), hospitals, police stations, safe houses that save to localStorage, and pickups.
- Street crews hold their turf: the Lygon Street Crew in Carlton/Fitzroy, the Broadmeadows mob up north and the Westside Nomads in Sunshine. They leave you alone until you start something.
- Cars carry parody Aussie badges (Holdan Comodo, FPB Typhoon F6, HSB Clubbie R8, Holdan Ute SS, Fjord Territorial, Toyoda Tarrago, and more).
