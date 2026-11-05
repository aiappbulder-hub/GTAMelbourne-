#!/bin/bash
# Downloads the chosen Microsoft Rocketbox avatars (MIT) and converts them for the game into assets/people/.
# usage: tools/people/build-cast.sh <work dir>   (needs python3 with Pillow, node with Playwright, and a static server
# on the repository root at port 8766)
set -e
WORK=${1:-tools/people/work}
OUT=assets/people
R=https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars
cd "$(dirname "$0")/../.."
mkdir -p "$WORK/src" "$OUT"
# name:category:texture size
CAST="Male_Adult_09:Adults:1024 Male_Adult_03:Adults:1024 Female_Adult_04:Adults:1024
Male_Adult_01:Adults:512 Male_Adult_02:Adults:512 Male_Adult_04:Adults:512 Male_Adult_05:Adults:512 Male_Adult_06:Adults:512
Male_Adult_07:Adults:512 Male_Adult_08:Adults:512 Male_Adult_10:Adults:512 Male_Adult_11:Adults:512 Male_Adult_12:Adults:512
Male_Adult_14:Adults:512 Male_Adult_16:Adults:512 Male_Adult_17:Adults:512 Male_Adult_18:Adults:512 Male_Adult_20:Adults:512
Female_Adult_01:Adults:512 Female_Adult_02:Adults:512 Female_Adult_03:Adults:512 Female_Adult_05:Adults:512 Female_Adult_06:Adults:512
Female_Adult_07:Adults:512 Female_Adult_08:Adults:512 Female_Adult_09:Adults:512 Female_Adult_11:Adults:512 Female_Adult_12:Adults:512
Female_Adult_13:Adults:512 Female_Adult_14:Adults:512 Female_Adult_15:Adults:512 Female_Adult_17:Adults:512
Business_Male_01:Professions:512 Business_Male_02:Professions:512 Business_Male_05:Professions:512
Business_Female_01:Professions:512 Business_Female_02:Professions:512
Construction_Male_07:Professions:512 Construction_Male_08:Professions:512
Police_Male_01:Professions:512 Police_Male_03:Professions:512"
for entry in $CAST; do
  IFS=: read -r name cat size <<< "$entry"
  [ -f "$OUT/$name.glb" ] && continue
  d="$WORK/src/$name"; mkdir -p "$d"
  curl -sf --max-time 180 -o "$d/$name.fbx" "$R/$cat/$name/Export/$name.fbx"
  # the texture names come from the FBX (e.g. m014_body_color.tga)
  for t in $(grep -aoE '[a-z]+[0-9]+_(body|head|opacity)_(color|normal)\.tga' "$d/$name.fbx" | sort -u); do
    curl -sf --max-time 300 -o "$d/$t" "$R/$cat/$name/Textures/$t" || true
  done
  python3 - "$d" "$size" <<'PY'
import sys, glob, os
from PIL import Image
d, size = sys.argv[1], int(sys.argv[2])
for f in glob.glob(d + '/*.tga'):
    b = f[:-4]; im = Image.open(f)
    if 'opacity' in b: im.convert('RGBA').resize((size, size), Image.LANCZOS).save(b + '.png', optimize=True)
    else: im.convert('RGB').resize((size, size), Image.LANCZOS).save(b + '.jpg', quality=86)
    os.remove(f)
PY
  CLIPS=0 node tools/people/convert.cjs "$WORK" "$OUT" "$name"
done
node tools/people/convert.cjs "$WORK" "$OUT"   # the animation clips (men's and women's)
ls -la "$OUT"
