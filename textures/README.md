# Texture slots

Put photo-real images here as `<slot>.jpg` (or `.png`) and the game uses them instead of its painted colours. A missing file
keeps the painted look, so they can be added one at a time. The prompts for generating each one are in
`docs/art/texture-prompts.md`.

| Slot | Used for | Tiles every |
|---|---|---|
| `road_asphalt` | street and freeway surface | 200 px |
| `footpath_concrete` | footpaths, and CBD ground | 120 px |
| `grass_lawn` | parks and open ground | 260 px |
| `gravel_tan` | the Tan running track | 140 px |
| `sand_beach` | beaches round the bay | 220 px |
| `dirt_park` | ground in the inner suburbs | 220 px |
| `facade_glass_tower` | glass CBD towers | 2 storeys per image |
| `facade_office_concrete` | concrete offices | 2 storeys per image |
| `facade_red_brick` | Victorian brick buildings and shops | 2 storeys per image |
| `facade_sandstone` | heritage sandstone and bluestone | 2 storeys per image |
| `facade_weatherboard` | house walls | 1 storey per image |
| `facade_shopfront` | ground-floor shopfronts | 1 storey per image |
| `facade_warehouse` | corrugated sheds at the port | 1 image per 40 px of wall |
| `roof_terracotta` | pitched house roofs | 24 px |
| `roof_flat_gravel` | flat roofs | 48 px |

Images must be seamless (they repeat) and contain no text, logos or people. Square, 1024 px, is best.
