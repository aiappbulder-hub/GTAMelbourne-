# GTA Melbourne

A top-down, GTA 2-style game set in Melbourne. It's a single `index.html` with no build step and no dependencies. Open it in a browser and play.

**Melbourne, 2004.** The underworld war between the Lygon Street Crew and the Broadmeadows mob is in its sixth year, and Taskforce Kestrel is closing in. All characters, crews and vehicles are fictional.

## Play

Open `index.html` in a desktop or mobile browser. To serve it locally: `python3 -m http.server`, then visit http://localhost:8000.

| | Keyboard / mouse | Touch |
|---|---|---|
| Move / drive | WASD or arrows: hold the direction you want to go and the car turns itself around | Drag on the left half toward where you want to go |
| Shoot | Click, Space (on foot), Ctrl or J | FIRE |
| Get in / out of a car | E or F | CAR |
| Brake | Space (in a car) | BRAKE |
| Switch weapon | Q, Tab, wheel, 1–4 | GUN |
| Map / pause / horn | M / P or Esc / H | MAP / II |

Prefer tank-style driving (W/S gas and brake, A/D steer)? Switch **Driving: classic** in the pause menu.

## What's in it

- The city is generated from `reference-map.png`. It includes Port Phillip Bay, the Yarra and Maribyrnong rivers, the freeway network (M1, M2, M3, M80), Tullamarine Airport, the Port of Melbourne, St Kilda Pier, the MCG, parks and beaches, with the CBD towers giving way to suburban houses further out.
- Traffic drives on the left, follows the street grid and freeways, and queues behind trams on the Swanston St / St Kilda Rd and Flinders St lines.
- The wanted level runs from 1 to 5 stars. Patrol cars come first, then unmarked cars and Highway Patrol, then AFP SUVs at 5 stars. Cops get out on foot and can bust you, but they only shoot from 3 stars and they aren't good shots. Health slowly regenerates once you're out of trouble. You lose them by staying out of sight, or pay $250 at a Mod Shop for a respray.
- Weapons are fists, pistol, Uzi and shotgun, with drive-bys forward from the car. Cars smoke, catch fire and explode, with chain reactions.
- There are five story missions, timed checkpoints, Ammu-Nation shops (plus a $20 pie for health), hospitals, police stations, safe houses that save to localStorage, and pickups.
- Street crews hold their turf: the Lygon Street Crew in Carlton/Fitzroy, the Broadmeadows mob up north and the Westside Nomads in Sunshine. They leave you alone until you start something.
- Cars carry parody Aussie badges (Holdan Comodo, FPB Typhoon F6, HSB Clubbie R8, Holdan Ute SS, Fjord Territorial, Toyoda Tarrago, and more).
