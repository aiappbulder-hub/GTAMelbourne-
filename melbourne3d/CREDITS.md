# Credits

## PBR textures (assets/pbr/)

All CC0 1.0 (public domain) from ambientCG (https://ambientcg.com), 1K-JPG downloads, resized to 512 px and
re-compressed (colour, NormalGL normal and roughness maps only).

| Folder | ambientCG asset ID | Used for | Licence |
|---|---|---|---|
| asphalt | Asphalt031 | roads | CC0 |
| paver | PavingStones128 | footpaths | CC0 |
| cobble | PavingStones049 | kerbs, dark stone setts | CC0 |
| grass | Grass004 | parks and lawns | CC0 |
| brick | Bricks097 | low-rise brick facades, roof gable ends | CC0 |
| render | Plaster001 | rendered/sandstone facades | CC0 |
| concrete | Concrete034 | concrete (reserved, unused so far) | CC0 |
| tiles | RoofingTiles014A | terracotta tile roofs | CC0 |
| sandstone | Bricks084 | sandstone / limestone facades (style 0), 1K | CC0 |
| bluestone | Bricks076A | bluestone (grey basalt block) warehouses and banks (style 6), 1K | CC0 |
| panel | Concrete042A | post-war concrete panel facades (style 7), 1K | CC0 |
| paint | PaintedPlaster017 | painted render facades (style 5), 1K | CC0 |
| glass | Facade001 | glass curtain-wall panes on towers (styles 2-4), 1K | CC0 |
| corrugated | CorrugatedSteel009 | corrugated iron roofs | CC0 |

## Roof shapes (js/roofs.js)

Gabled, hipped and pyramidal roof construction is ported from Streets-GL (https://github.com/StrandedKitty/streets-gl),
MIT licence:

> MIT License
>
> Copyright (c) 2020-2023 StrandedKitty
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
> rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
> persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and
> this permission notice shall be included in all copies or substantial portions of the Software.
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
## Code and assets from other projects

- **rezvivo** (https://github.com/thpg/rezvivo), GPL-3.0-or-later. Ported to JavaScript: the walker gait maths from `AvatarGait.pas` (cadence, duty, step length, pelvis and shoulder yaw, 32-sample pelvis height curve) into `js/procedural-gait.js`; the cyclist motion layer from `RiderMotion.pas` (seated/standing/sprint blend, breathing, ankle flex, spine and scapula layering), the turn lean from `RiderDynamics.pas` and standing turns from `RiderGroundTurn.pas` into `js/procedural-rider.js`. Used by `js/pedestrians.js` and `js/controllers.js`. The GPL-3.0 text is in the repo root `LICENSE`; mrdoob's MIT notice stays in `melbourne3d/LICENSE`.
## Trees
Tree species (London plane, elm, eucalypt/gum, palm, honey locust) are generated procedurally at load time by
`js/trees.js` (own code, no third-party meshes or textures). Tree positions: OpenStreetMap contributors (ODbL),
see `js/melbourne-tree-geodata.js`.
- `assets/textures/water_normal.png`: water normal map from streets-gl (https://github.com/StrandedKitty/streets-gl),
  MIT licence, Copyright (c) 2020-2023 StrandedKitty. Used by `js/water.js`, whose normal-map layering and sun-glint
  approach follow streets-gl's water shader.
- `js/water.js` was written with Osm3dWaterShader.pas (GPL-3) in mind for ideas only; no code was ported.

## Quaternius Universal Animation Library (Standard)

- Project: Universal Animation Library by Quaternius (https://quaternius.com/packs/universalanimationlibrary.html), licence CC0 1.0.
- Used: the Jog, Sprint, Jump start/loop/land, Punch jab/cross, Hit chest/head and Roll clips, retargeted onto the Ara player rig by
  `tools/ara/retarget_ual.py` into `assets/ara/ual-clips.glb` and played by `js/people.js`. (Not verified whether they were captured or hand-keyed.)


## Street art decals (assets/streetart/, js/street-art.js)

Photographs of real Melbourne street art (Hosier Lane, AC/DC Lane and other laneways), found through Openverse, each under a
licence that allows reuse and modification (CC BY 2.0, CC BY-SA 2.0 or public domain). Every photo was cropped to the painted
wall, resized to 512 px and packed into two 2048x2048 WebP atlases (`atlas0.webp`: items 1-16, `atlas1.webp`: items 17-24).
The murals are the work of street artists the photographers did not name. If you are an artist or a photographer and want a
piece removed or credited differently, ask and it will be taken out. CC BY-SA images stay CC BY-SA 2.0 (the atlases combine
them; the rest of the game is GPL-3.0).

| # | Title | Photographer | Artist | Licence | File page | Changes |
|---|---|---|---|---|---|---|
| 1 | Melbourne, Hosier Lane 2012 | Tiws | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/43164453@N08/6859457547 | cropped, resized |
| 2 | Graffiti, Hosier Lane | Shiny Things | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/33389938@N00/17180367409 | cropped, resized |
| 3 | Shy | Mike Hauser | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/35314767@N00/9004013896 | cropped, resized |
| 4 | 46 melbourne street art | Looking Glass | not named by photographer | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) | https://www.flickr.com/photos/31157339@N00/5163734734 | cropped, resized |
| 5 | Hosier Lane Street Art | feral arts | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/35080419@N04/3452605400 | cropped, resized |
| 6 | Hosier Lane Street Art | feral arts | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/35080419@N04/3448731029 | cropped, resized |
| 7 | Hosier Lane Street Art | feral arts | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/35080419@N04/3451840607 | cropped, resized |
| 8 | Hosier Lane Street Art | feral arts | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/35080419@N04/3448736789 | cropped, resized |
| 9 | trippy | jonolist | not named by photographer | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) | https://www.flickr.com/photos/46635911@N00/2994894886 | cropped, resized |
| 10 | street art 006 | kennythemap | not named by photographer | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) | https://www.flickr.com/photos/68347377@N08/8572615227 | cropped, resized |
| 11 | ACDC Lane Bon Scott with lightning bolts | ultrakml | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/34948727@N00/5949768181 | cropped, resized |
| 12 | ACDC Lane Angus in a circle | ultrakml | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/34948727@N00/5950329698 | cropped, resized |
| 13 | hippo in acdc lane | annieb | not named by photographer | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) | https://www.flickr.com/photos/92828317@N00/5739325344 | cropped, resized |
| 14 | AC/DC Lane, Melbourne | Bex.Walton | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/7831824@N04/37631640295 | cropped, resized |
| 15 | A Street of Colour | Jocey K | not named by photographer | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) | https://www.flickr.com/photos/48627921@N05/10317262743 | cropped, resized |
| 16 | Angel Wings | Jocey K | not named by photographer | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) | https://www.flickr.com/photos/48627921@N05/10303983796 | cropped, resized |
| 17 | Melbourne Street Art | sneetchbeach | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/63168233@N06/6779033888 | cropped, resized |
| 18 | Graffiti-IMGP7526_queen-of-hearts | RaeAllen | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/30628871@N00/6844884111 | cropped, resized |
| 19 | Melbourne Street Art | wharman | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/96763131@N00/6526498525 | cropped, resized |
| 20 | Laneway graffiti | RaeAllen | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/30628871@N00/6813423957 | cropped, resized |
| 21 | TAG - DOES & NASH - LOVE LETTERS | bixentro | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/82947612@N00/6704254929 | cropped, resized |
| 22 | Street art in Melbourne, Australia | atlai | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/10815162@N07/9159172136 | cropped, resized |
| 23 | 3D Kardashians ...in graffiti, Melbourne Laneways | Angel Lite Photography | not named by photographer | [Public Domain Mark 1.0](https://creativecommons.org/publicdomain/mark/1.0/) | https://www.flickr.com/photos/136038519@N08/25773618252 | cropped, resized |
| 24 | Be Free | Derek Midgley | not named by photographer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/26258401@N03/12561362133 | cropped, resized |

## Flinders Street Station (assets/landmarks/flinders-station.glb)

- Modelled for this game by `tools/fss/build_fss.py` (Blender 4.2, headless) on the station's OpenStreetMap footprint
  (© OpenStreetMap contributors, ODbL) and packed with gltfpack (meshoptimizer, MIT, https://github.com/zeux/meshoptimizer).
- Its trim sheet (facade bays, the corner portal with the row of clocks, red brick, copper, roof, clock face, night
  windows) is painted from scratch by `tools/fss/paint_textures.py` (Pillow); no photographs or third-party textures are
  in it. The look follows the real building as it appears in public photos (Wikimedia Commons, Category:Flinders Street
  railway station); none of those photos are shipped.
- Decoded in the browser with three.js's `meshopt_decoder.module.js` (meshoptimizer, MIT).
