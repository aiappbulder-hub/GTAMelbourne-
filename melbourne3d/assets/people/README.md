# People

Realistic rigged characters from the **Microsoft Rocketbox Avatar Library** (https://github.com/microsoft/Microsoft-Rocketbox),
released by Microsoft under the **MIT licence**, with their motion-captured animations from the same library.

`tools/people/build-cast.sh` downloads the chosen avatars and converts them (tools/people/convert.html, run in a
headless browser): the FBX (centimetres, TGA textures) becomes a GLB in metres with JPEG/PNG textures and PBR
materials. The player, Vince and Kaz have 1024 px textures; the crowd has 512 px. `clips-m.json` and `clips-f.json`
hold the clips by bone name (idle, walk, run, sprint, talk, phone, crouch), shared by every man or woman.

| Role | Avatar |
|---|---|
| The player | Male_Adult_09 |
| Vince | Male_Adult_03 |
| Kaz | Female_Adult_04 |
| Police | Police_Male_01, Police_Male_03 |
| Gangs | Male_Adult_18, 04, 10, 17 |
| Everyday locals, office workers, tradies | the other Male/Female_Adult avatars, Business_*, Construction_Male_07/08 |

`js/people.js` puts them in the game.


## Trimmed

Only the Rocketbox people the game can still fetch are kept: the two intro police (`Police_Male_01`, `Police_Male_03`), the two
Kestrel watchers (`Male_Adult_14`, `Female_Adult_09`), and the six the `?classic` switch uses (`Male_Adult_03`, `04`, `05`, `09`,
`10`, `Female_Adult_04`). The street crowd is the procedural one (`CROWD = false` in `js/people.js`), so the other 31 were never
loaded. They are in git history: `git checkout 1d90ec3 -- melbourne3d/assets/people`.
