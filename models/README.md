# Vehicle models

All vehicle models are by **Kenney (www.kenney.nl)** and licensed [CC0](https://creativecommons.org/publicdomain/zero/1.0/), so they're free to use without credit (credit is still appreciated).

| Folder | Source | Used for |
|---|---|---|
| `car-kit/` | Kenney **Car Kit 3.1** (`License.txt` included) | Sedans, hatches, sports cars, race cars, SUVs, vans, delivery vans, taxis, police, utes, ambulances, fire trucks, garbage trucks |
| `kenney/` | Kenney **Starter Kit Racing** | 4x4 utes in red, yellow, green and purple |

The original `.glb` files were converted to glTF JSON (`.json`) so any static host can serve them, including GitHub Pages and artifact hosting (which won't serve `.glb`). All the Car Kit models share `car-kit/colormap.png`. The game repaints the red body panels of everyday cars to give traffic a range of colours. Taxis, police and emergency vehicles keep their own colours.

Models load when the game is served over http(s). If you open `index.html` straight from disk, the game falls back to its built-in blocky cars.
