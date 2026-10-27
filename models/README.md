# Vehicle models

## `kenney/`: bundled

These are the four 4x4 utes from Kenney's [Starter Kit Racing](https://github.com/KenneyNL/Starter-Kit-Racing), converted to self-contained glTF JSON. The mesh and colour texture are embedded in each file, so any static host can serve them. They're licensed [CC0](https://creativecommons.org/publicdomain/zero/1.0/), so you can use them freely without crediting anyone (credit is still appreciated: **Kenney, www.kenney.nl**). The game uses them for every ute on the road.

## `car-kit/`: drop-in slot for real city cars

Kenney's free **Car Kit** (CC0, 40+ cars) gives the rest of the traffic real models.

1. Download it from https://kenney.nl/assets/car-kit (or https://kenney-assets.itch.io/car-kit).
2. In the zip, open `Models/GLB format/`.
3. Copy these files into this `car-kit/` folder:
   `sedan.glb`, `sedan-sports.glb`, `hatchback-sports.glb`, `race.glb`, `suv.glb`, `suv-luxury.glb`, `van.glb`, `taxi.glb`, `police.glb`, `truck.glb`
4. Copy the zip's `Textures/colormap.png` into `car-kit/Textures/`.

The game checks for `car-kit/sedan.glb` at start-up. If it's there, cars are swapped for these models. Any file that's missing just keeps the built-in blocky car.

Models only load when the game is served over http(s), such as GitHub Pages or `python3 -m http.server`. Opening `index.html` straight from disk uses the built-in cars.
