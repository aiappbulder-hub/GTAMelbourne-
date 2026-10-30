# Vehicle models

All vehicle models are by **Kenney (www.kenney.nl)** and licensed [CC0](https://creativecommons.org/publicdomain/zero/1.0/), so they're free to use without credit (credit is still appreciated).

| Folder | Source | Used for |
|---|---|---|
| `car-kit/` | Kenney **Car Kit 3.1** (`License.txt` included) | Sedans, hatches, sports cars, race cars, SUVs, vans, delivery vans, taxis, police, utes, ambulances, fire trucks, garbage trucks |
| `kenney/` | Kenney **Starter Kit Racing** | 4x4 utes in red, yellow, green and purple, and the motorbike |
| `custom/` | Made for this game in Blender by `tools/make_models.py` (CC0, do what you like) | Comodo sedan, Barrina hatch, HSB Clubbie muscle car, Fjord Territorial SUV, Fjord Strainger ute, Victoria Police car, taxi, Melbourne tram |
| `landmarks/` | Made for this game in Blender by `tools/make_landmarks.py` (CC0) | Flinders Street Station, Arts Centre spire, MCG, West Gate and Bolte bridge pylons, Eureka Tower, Shrine of Remembrance, Federation Square, Melbourne Star, St Paul's Cathedral, Royal Exhibition Building, Luna Park, Crown, Rialto, Parliament House |
| `people/` | **Quaternius** (CC0), from the per-model GLBs Quaternius uploaded to Poly Pizza | Animated people: `worker` (everyday men), `woman` (the hooded adventurer, sword removed) and `adventurer` (you, cops, gangs and guards; backpack removed). Unpacked from meshopt compression and trimmed to the animations the game uses |
| `aircraft/` | Made for this game in Blender by `tools/make_aircraft.py` (CC0) | The airliner, the light plane and the police helicopter (its rotors are separate parts named `rotor-main` and `rotor-tail` so they spin) |
| `city/` | Kenney **Starter Kit City Builder** | Shops and flats on inner-suburb lots (Fitzroy, Carlton, Richmond and so on) |

The original `.glb` files were converted to glTF JSON (`.json`) so any static host can serve them, including GitHub Pages and artifact hosting (which won't serve `.glb`). All the Car Kit models share `car-kit/colormap.png`. The game repaints the red body panels of everyday cars to give traffic a range of colours. Taxis, police and emergency vehicles keep their own colours.

Models load when the game is served over http(s). If you open `index.html` straight from disk, the game falls back to its built-in blocky cars.

## Rebuilding the custom models

`tools/make_models.py` builds the `custom/` vehicles in Blender. Run it with Blender's Python module (`pip install bpy`) or with `blender -b -P tools/make_models.py -- <out_dir>`. It writes `.glb` files; convert them to `.json` (glTF with embedded buffers) the same way as the other models. Vehicles face Blender −Y, the wheels are objects named `wheel-*`, and paint uses a material called `Body` so the game can recolour it.

`tools/make_landmarks.py` builds the `landmarks/` models the same way, in game units (pixels) so each one sits straight on its site. The front of each building faces Blender −Y.
