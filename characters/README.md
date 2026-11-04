# GTA Melbourne: character assets

Original, Australian-inspired 3D people for the game, all built in Blender by scripts. Every asset can be rebuilt,
restyled or multiplied without hand work, and adding a character means adding one entry of data.

**Catalogue:** open `characters/catalogue.html` (it reads `catalogue.json`). It shows an animated lineup of every
character, with a button for each clip and a card per character listing the outfit and files. The lineup render is
`previews/catalogue_lineup.jpg`.

## Status

| Stage | What | State |
|---|---|---|
| 1 | Male and female base characters | Done: Aussie Bloke and Aussie Girl |
| 2 | Shared humanoid rig and animations | Done: one skeleton, 9 clips, all characters |
| 3 | Interchangeable clothing | Done: 30 garment and accessory kinds, tattoos, 6 hair styles |
| 4 | The remaining 10 character types | Done: 14 characters in all |
| 5 | Materials, skins and colour variations | Done: recolourable garments, skin, hair, iris and print textures |
| 6 | GLB export and browser check | Done: three.js r128 and r170 both load them. They run in the game |
| 7 | Catalogue and preview scene | Done: `catalogue.html`, `catalogue.json`, `previews/` |

## The cast

| Character | Type | Look | Triangles (full / crowd) |
|---|---|---|---|
| `trent` | **The player** | 1.83 m, lean runner, bald, dark beard going grey. Black tee with a *Melbourne Run Club* print, black running shorts, white runners | 14.3k / 5.1k |
| `aussie_bloke` | Everyday male | Short back and sides, stubble. Black *Southerly* tee, cargo shorts, sneakers, shades | 15.3k / 5.7k |
| `aussie_girl` | Everyday female | Blonde ponytail. Bandeau crop top, denim cut-offs, sneakers, shades | 16.0k / 5.3k |
| `bearded_gaz` | Bald and bearded | Big build, full beard. Navy *Yarra Rats* tee, khaki cargo shorts | 14.5k / 5.3k |
| `tradie_dazza` | Tradie | Fluoro orange Victorian hi-vis with silver tape, navy cargo work shorts, steel caps, tool belt, cap and sunnies, forearm tattoo | 16.5k / 6.4k |
| `student_minh` | Uni student (male) | Charcoal hoodie, light-wash jeans, backpack | 15.8k / 6.2k |
| `student_amara` | Uni student (female) | Hair in a bun. Graphic tee, dark jeans, backpack | 15.7k / 5.9k |
| `gym_jono` | Fitness (male) | Muscular. Mesh training singlet, run shorts, watch | 14.4k / 5.0k |
| `gym_kayla` | Fitness (female) | Ponytail. Sports crop, leggings, watch | 18.7k / 6.5k |
| `street_kai` | Streetwear | Black graphic tee, olive cargo pants, cap on backwards, gold chain, calf tattoo | 15.8k / 6.0k |
| `old_bruce` | Older male | Off to the footy: hooped jumper over a long-sleeve, scarf and beanie, slacks, brown shoes | 17.0k / 6.7k |
| `old_marg` | Older female | Short grey hair. Yellow Melbourne rain jacket, navy slacks | 14.5k / 5.8k |
| `night_jess` | Nightlife | Long dark hair, red lips. Black satin slip dress, ankle boots, chain | 16.3k / 5.7k |
| `gang_tama` | Street gang | Black hoodie, black trackies with white stripes, beanie, chain, tattooed sleeves and neck | 19.2k / 7.4k |

Each character has three exports in `exports/`:
- `<name>.glb`: dressed, at full detail. The skin hidden under clothes is cut away.
- `<name>_base.glb`: the body in underwear, the starting point for new outfits.
- `<name>_crowd.glb`: the crowd LOD. About a third of the triangles and 512 px textures, merged into one skinned mesh so a
  pedestrian costs few draw calls.

All three are rigged and carry all 9 clips. The full exports are 1.0 to 1.5 MB and the crowd versions about 0.6 MB.

## Stage 2: the rig (`tools/characters/rig.py`)

One skeleton for everyone, built from the joint centres measured on each body:

```
Hips > Spine > Chest > Neck > Head
               Chest > Shoulder.L > UpperArm.L > LowerArm.L > Wrist.L > Fingers.L   (and .R)
Hips > UpperLeg.L > LowerLeg.L > Foot.L > Toes.L                                    (and .R)
```

How it binds:
- **Body:** automatic (bone heat) weights.
- **Everything else** (clothes, hair, beard, eyes, glasses): copies its weights from the nearest point on the body, so it
  moves with the skin.
- **Shoes and boots:** bound rigidly to the foot and toes.
- **Gaps:** any vertex left unweighted takes its nearest bone.

**Clips:** `idle`, `walk`, `run`, `aim`, `shoot`, `runShoot`, `punch`, `jump` and `die`.
- They're authored in world terms: legs and spine as rotations, and arms by the direction they should point.
- They're baked to every character, so the clips are identical across the cast and interchangeable.

**Standalone files:** `rigs/aussie_rig.blend` is the rig with its actions, and `animations/aussie_clips.glb` holds the
clips alone.

## Stage 3: the wardrobe (`wardrobe()` in `stage1_base.py`)

A garment is a rule over the body, not a fixed mesh: which part of the surface it covers, how far off the skin it sits, how
thick it is and which fabric it uses. So every garment fits every body, from the slim student to the big tradie.

| Group | Kinds |
|---|---|
| Tops | `tee` (with optional original print), `longsleeve`, `singlet`, `shirt`, `hoodie` (with hood), `jacket` (denim, leather or nylon rain jacket, with collar and zip), `hivis` (Victorian fluoro with reflective tape), `footy_jumper` (hooped guernsey, generic colours, no emblem), `cardigan`, `crop_top`, `bra` |
| Bottoms | `cargo_shorts` (patch pockets), `denim_shorts`, `run_shorts`, `jeans`, `cargo_pants`, `work_pants`, `trackpants` (side stripes), `leggings`, `skirt`, `dress` (slip dress), `briefs` |
| Shoes | `sneakers`, `work_boots` |
| Accessories | `cap` (peak forward or back), `beanie`, `sunglasses`, `backpack`, `scarf` (two-colour footy bars), `toolbelt` (with pouches), `chain`, `watch` |
| Body | tattoos (`sleeve_l`, `sleeve_r`, `forearm_r`, `neck`, `chest`, `calf_l`, `calf_r`), baked into the skin |
| Hair | `crop`, `short`, `ponytail`, `bun`, `long`, `bald`, and an optional beard |

Fabrics are generated tileable weaves: cotton jersey, rib knit, chunky knit, canvas, denim twill, fleece, nylon ripstop,
hi-vis mesh, athletic mesh, satin and lycra.

## Stage 5: materials and variation

- **Garments:** each garment material is a neutral weave texture multiplied by a colour. The colour exports as the glTF
  `baseColorFactor` on materials named `Cloth_*`, so the game recolours them per pedestrian: half the crowd wears their
  outfit in other colours, with no extra files.
- **Skin:** each character's skin is its own 2K bake. Lips, brows, stubble, cheeks, eye sockets, scalp and tattoos come
  from 3D masks on the face, combined with layered noise.
- **Hair and eyes:** hair has a baked strand texture, and irises are painted per eye colour.
- **Variety:** skin tones, eye colours and body shapes come from the character data. MakeHuman's age, weight, muscle,
  height, proportion and ethnicity targets are blended to taste.

## Stage 6: in the game

`index.html` loads `trent.glb` for the player and the `_crowd` versions for pedestrians. Pedestrians are picked by role:
- gang members get the gang character
- runners on the Tan and the athletics track get the gym pair
- bald pedestrians get Gaz
- everyone else is drawn from the everyday cast by sex

Guns attach to the `Wrist.R` bone. Until the files load, the older Quaternius people stand in.

## Making more

```
python tools/characters/stage1_base.py [names...]      # build .blend + three GLBs per character (Blender 4.x/5.x as a Python module)
SAVE_RIG=trent python tools/characters/stage1_base.py trent   # also writes rigs/aussie_rig.blend and animations/aussie_clips.glb
python tools/characters/catalogue.py                   # refresh catalogue.json
python tools/characters/preview.py characters/base_models/<name>.blend base outfit   # studio renders
```

To add a character:
1. Add an entry to `CHARACTERS` in `stage1_base.py`, with body targets, skin, eyes, hair, beard, tattoos and an outfit list.
2. Build it.
3. Add its name to the right `AUS` pool in `index.html`.

A new garment kind is one more branch in `wardrobe()`.

## Folders

| Folder | Contents |
|---|---|
| `base_models/` | One `.blend` per character, with collections `base` (body and head), `underwear` and `outfit` |
| `exports/` | Game GLBs: outfit, base and crowd for each character |
| `rigs/` | `aussie_rig.blend`: the shared skeleton with every action |
| `animations/` | `aussie_clips.glb`: the clips on the bare skeleton |
| `textures/` | Baked skin and hair maps, fabric weaves, iris maps and prints |
| `previews/` | Studio renders (`<name>_sheet.jpg`) and the catalogue lineup |
| `source/` | MakeHuman base mesh, body targets and eye texture (CC0, see `source/LICENSE.ASSETS.md`) |
| `clothing/`, `materials/` | Not used: clothing and materials are generated by rules and data in the scripts |

## Limits

- **Faces:** they come from body-shape targets and painted detail, not hand sculpting, so they read as distinct people at
  game distance but not as portraits.
- **Skin:** it has no pore or normal detail.
- **Hair:** shells and swept tubes, not strands.
- **Boots:** simple hulls, with no laces or stitching.
- **Clothing physics:** none. Skirts and the hoodie's hem follow the legs and torso.

## Licences

- The MakeHuman base mesh, targets and eye texture are **CC0** (MakeHuman project, `source/LICENSE.ASSETS.md`).
  MakeHuman's AGPL application code is not used.
- Everything else is original to this project: the scripts, textures, rig, animations, models and renders.
- *Southerly Surf Co.*, *Yarra Rats* and *Melbourne Run Club* are fictional brands made for the game. No real logos are used.
