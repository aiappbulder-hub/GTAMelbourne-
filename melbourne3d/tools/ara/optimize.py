#!/usr/bin/env python3
"""Make an Ara 3D Gen character GLB fit for the game: textures resized to what they need on screen and re-encoded
(opaque ones as JPEG, ones with transparency as PNG), everything else untouched (mesh, rig, clips, blend shapes).

Ara exports skin, clothes and hair at 2048 px. Each such texture takes ~21 MB of graphics memory once loaded (with its
mipmaps): about 100 MB for one character, most of a small laptop GPU. At the sizes below one character needs ~25 MB.

usage: python3 tools/ara/optimize.py in.glb out.glb [--scale 1.0]   (--scale 0.5 makes a lighter crowd/mobile copy)
"""
import io
import json
import struct
import sys
from PIL import Image

# longest side (px) by what the texture is for (matched on the image's name)
SIZES = [('teeth', 256), ('tongue', 256), ('eyebrow', 256), ('eyelash', 256), ('roughness', 256), ('eyes', 512),
         ('hair', 1024), ('normal', 1024), ('skin', 1024), ('outfit', 1024), ('look_', 1024), ('shoe', 512)]


def target(name, scale):
    n = (name or '').lower()
    for key, px in SIZES:
        if key in n:
            return max(128, int(px * scale))
    return max(128, int(1024 * scale))


def main():
    src, dst = sys.argv[1], sys.argv[2]
    scale = float(sys.argv[sys.argv.index('--scale') + 1]) if '--scale' in sys.argv else 1.0
    b = open(src, 'rb').read()
    jlen = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jlen])
    bin0 = 20 + jlen + 8
    blen = struct.unpack('<I', b[20 + jlen:24 + jlen])[0]
    data = b[bin0:bin0 + blen]
    views = [bytes(data[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]) for v in j['bufferViews']]
    before = sum(len(views[im['bufferView']]) for im in j.get('images', []))
    for im in j.get('images', []):
        raw = views[im['bufferView']]
        img = Image.open(io.BytesIO(raw))
        alpha = img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info)
        px = target(im.get('name'), scale)
        if max(img.size) > px:
            img = img.convert('RGBA' if alpha else 'RGB').resize((px, px) if img.size[0] == img.size[1] else
                                                                 (round(img.size[0] * px / max(img.size)), round(img.size[1] * px / max(img.size))), Image.LANCZOS)
        out = io.BytesIO()
        if alpha:
            img.convert('RGBA').save(out, 'PNG', optimize=True)
            im['mimeType'] = 'image/png'
        else:
            img.convert('RGB').save(out, 'JPEG', quality=86, optimize=True)
            im['mimeType'] = 'image/jpeg'
        views[im['bufferView']] = out.getvalue()
    # repack the buffer, each view 4-byte aligned
    blob = bytearray()
    for v, d in zip(j['bufferViews'], views):
        while len(blob) % 4:
            blob.append(0)
        v['byteOffset'] = len(blob)
        v['byteLength'] = len(d)
        blob += d
    while len(blob) % 4:
        blob.append(0)
    j['buffers'] = [{'byteLength': len(blob)}]
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)) + struct.pack('<II', len(js), 0x4E4F534A) + js \
        + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    open(dst, 'wb').write(glb)
    after = sum(len(views[im['bufferView']]) for im in j.get('images', []))
    print(f'{src}: {len(b) / 1e6:.2f} MB -> {dst}: {len(glb) / 1e6:.2f} MB (textures {before / 1e6:.2f} -> {after / 1e6:.2f} MB)')


if __name__ == '__main__':
    main()
