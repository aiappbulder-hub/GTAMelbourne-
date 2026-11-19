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
