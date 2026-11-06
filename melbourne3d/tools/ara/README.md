# Ara 3D Gen character pipeline

Realistic people for the cast, made with [Ara 3D Gen](https://github.com/olatunde85/3d-gen) (code MIT; body, skin,
hair and clothes from MakeHuman, CC0; motion capture from CMU, free to use in games). An exported GLB needs no credit.

What a character file holds: the body's parts as skinned meshes (Mixamo-named skeleton, 69 bones) and the face's blend
shapes the game uses (blinks, jaw, smile, frown, brows and 8 visemes for lip sync). The player's file also carries the
cast's clips (Idle, Walk, Run, Walk backwards, Strafe left/right, Turn left/right 90°, Talk, Wave, Cheer, Laugh, Sit idle,
Pistol idle/aim/fire, Hit, Death, Get up); everyone else borrows them, scaled to their leg length (js/people.js).

## The cast

| Who | Model id | Look (`LOOK`) |
|---|---|---|
| The player | `ara:player` | `Man\|Adult · 35\|Athletic\|Caucasian\|Casual\|Short crop\|Stubble` |
| Vince (Lygon Street Crew) | `ara:vince` | `Man\|Middle-aged · 52\|Heavy\|Caucasian\|Smart casual\|Short side part\|Short beard\|Gold watch\|Gold signet ring` |
| Kaz (Broadmeadows) | `ara:kaz` | `Woman\|Adult · 35\|Athletic\|Caucasian\|Smart casual\|Ponytail\|Small hoops` |
| Mick (Kaz's fence) | `ara:mick` | `Man\|Middle-aged · 52\|Heavy\|Caucasian\|Casual\|Bald\|Mustache & stubble` |
| Davo (the first job's pickup) | `ara:davo` | `Man\|Young adult · 24\|Slim\|Caucasian\|Sporty\|Buzz cut\|Stubble\|Fine gold chain & pendant` |

`?classic` in the URL brings back the earlier Rocketbox cast.

## Making a character

1. **Build and export** (headless, in the hosted app at ara3dgen.com):

   ```
   LOOK='Man|Adult · 35|Athletic|Caucasian|Casual|Short crop|Stubble' node tools/ara/export.cjs /tmp/raw.glb
   ```

   `LOOK` is the builder's quick-build buttons in order: sex, age, build, ethnicity, outfit, hair, facial hair.
   Avoid the Streetwear outfit (heavy, 72k triangles) and the plain T-shirt (it prints a logo).
2. **Fit it for the game**: textures resized (2048 px → 1024/512/256), the parts split so each carries only its own
   vertices and blend shapes (unsplit, three.js would build ~30 MB of blend-shape texture per part), skin weights as bytes.
   Everyone but the player without clips (`--no-anims`):

   ```
   python3 tools/ara/optimize.py /tmp/raw.glb assets/ara/<name>.glb --no-anims
   python3 tools/ara/optimize.py /tmp/raw.glb assets/ara/<name>-low.glb --no-anims --scale 0.5
   ```
3. **Cast it**: `ara:<name>` is a model id for `js/people.js` (`STORY_CAST`, or `cast.setActor` for a scene's extra).

The `-low` copies (low settings) have half-size textures and only the blink and jaw shapes.
