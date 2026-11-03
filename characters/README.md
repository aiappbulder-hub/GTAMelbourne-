# GTA Melbourne: character assets

Original, Australian-inspired 3D people for the game, built in Blender by scripts, so every asset can be rebuilt,
restyled or multiplied without hand work.

## Status

| Stage | What | State |
|---|---|---|
| 1 | Male and female base characters | **Done:** Aussie Bloke and Aussie Girl (below) |
| 2 | Shared humanoid rig, animation test | Next. Joint centres are already measured from the base mesh (`Base.joints()`) |
| 3 | Interchangeable clothing | Started. Garments are cut from the body surface by rules in `garment()`, so they fit any body shape |
| 4 | Remaining 10 characters | Not started |
| 5 | Materials, skins and colour variants | Partly done: fabrics and skin are generated from parameters |
| 6 | GLB export and browser check | Done for stage 1 (three.js r128, the game's loader) |
| 7 | Catalogue and preview scene | This file plus `previews/`. The preview scene comes with stage 4 |

## The characters

| Character | Look | Exports | Triangles (game) |
|---|---|---|---|
| **Aussie Bloke** (`aussie_bloke`) | 1.82 m, athletic. Short back and sides, stubble, green eyes. Black tee with a *Southerly Surf Co.* print, charcoal cargo shorts with patch pockets, white sneakers, black shades | `aussie_bloke.glb`, `aussie_bloke_base.glb` | 15.4k dressed, 14.0k base |
| **Aussie Girl** (`aussie_girl`) | 1.62 m, slim. Blonde, pulled back in a high ponytail, blue eyes. Black bandeau crop top with spaghetti straps, light-wash denim cut-offs, white sneakers, black shades | `aussie_girl.glb`, `aussie_girl_base.glb` | 16.3k dressed, 15.1k base |

`<name>.glb` is the character in their signature outfit, with the body hidden under clothes removed. `<name>_base.glb` is the
body in underwear, the starting point for the modular wardrobe. Both are about 0.5 to 0.75 MB, with JPEG textures embedded.

Previews (Cycles studio renders, front, back, three-quarter and face) are in `previews/`: `<name>_sheet.png` is all four
on one sheet.

*Southerly Surf Co.* and the other labels are fictional brands made for the game. No real logos are used.

## How they're made

```
python tools/characters/stage1_base.py [aussie_bloke aussie_girl]   # build .blend + .glb (Blender 4.x/5.x as a Python module)
python tools/characters/preview.py characters/base_models/<name>.blend [collection] [--tag t]   # studio renders
```

1. **Body:** the MakeHuman base mesh (CC0, `source/`) shaped with its CC0 body targets: sex, age, muscle, weight, height,
   proportions and ethnicity. The loader is our own code (`mhbase.py`). The body keeps MakeHuman's UV layout, so every
   character can share texture layouts.
2. **Skin:** masks for lips, brows, stubble, scalp, cheeks and eye sockets are computed in 3D from face landmarks the
   script finds on the mesh: eyes, nose tip, mouth line, chin and ears. They are combined with layered noise and baked by
   Cycles to a 2K colour map (`textures/skin_<name>.png`).
3. **Eyes, lashes, hair:** eyeballs are fitted to the mesh's eye sockets, with an iris we paint ourselves.
   - Hair is a shell grown from the scalp. It is fuller on top, faded into the hairline, and tufted with 3D noise, with
     strand shading baked to a 1K map.
   - Ponytails are swept tubes with a hair tie.
4. **Clothing:** each garment is a region of the body surface, chosen by rules: arm and leg position, hem and neckline
   heights. The region is lifted off the skin, given thickness and textured with a generated fabric (cotton jersey, rib
   knit, canvas or denim twill). Because garments are rules, not fixed meshes, the same tee fits every body.
   Sneakers are shaped from the convex hull of the foot. Sunglasses, straps and prints are built separately.
5. **Game export:** the body is decimated with X symmetry. Heavy parts (hair, sneakers, garments) are decimated on export
   copies against a per-part triangle budget. Skin hidden under clothes is cut away, and textures are embedded as JPEG.

## Folders

| Folder | Contents |
|---|---|
| `base_models/` | One `.blend` per character, with collections `base` (body, head, underwear) and `outfit` |
| `exports/` | Game-ready `.glb` files |
| `textures/` | Baked skin and hair maps, generated fabrics, iris maps and prints |
| `previews/` | Studio renders |
| `source/` | MakeHuman base mesh, body targets and eye texture (CC0, see `source/LICENSE.ASSETS.md`) |
| `clothing/`, `materials/`, `rigs/`, `animations/` | Filled in by later stages |

## Licences

- The MakeHuman base mesh, targets and eye texture are **CC0** (MakeHuman project, `source/LICENSE.ASSETS.md`).
  MakeHuman's AGPL application code is not used.
- Everything else (scripts, textures, models and renders) is original to this project.
