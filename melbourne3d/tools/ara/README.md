# Ara 3D Gen character pipeline

Realistic people for the cast, made with [Ara 3D Gen](https://github.com/olatunde85/3d-gen) (code MIT; body, skin,
hair and clothes from MakeHuman, CC0; motion capture from CMU, free to use in games). An exported GLB needs no credit.

What each character file holds: one skinned mesh (Mixamo-named skeleton, 69 bones), 34 facial blend shapes (blinks,
brows, jaw, smile, frown and 15 visemes for lip sync), and its own clips (Idle, Walk, Run, Turn left/right 90°, Talk,
Pistol aim, Death).

## Making a character

1. **Build and export** (headless, in the hosted app at ara3dgen.com):

   ```
   LOOK='Man|Adult · 35|Athletic|Caucasian|Casual|Short crop|Stubble' node tools/ara/export.cjs /tmp/raw.glb
   ```

   `LOOK` is the builder's quick-build buttons in order: sex, age, build, ethnicity, outfit, hair, facial hair.
   Avoid the Streetwear outfit (heavy, 72k triangles) and the plain T-shirt (it prints a logo).
2. **Fit it for the game** (textures to the sizes they need on screen: 2048 px → 1024/512/256):

   ```
   python3 tools/ara/optimize.py /tmp/raw.glb assets/ara/<name>.glb
   python3 tools/ara/optimize.py /tmp/raw.glb assets/ara/<name>-low.glb --scale 0.5
   ```
3. **Check the look**: `tools/ara/look.html?f=<name>.glb` (front walking, back, face close-up with expressions).
4. **Cast it**: `ara:<name>` is a model id in `js/people.js`. The player uses `ara:player` with `?ara` in the URL.

Sizes: ~6.5 MB a character (~25 MB of graphics memory), ~5 MB for the `-low` copy used on low settings.
