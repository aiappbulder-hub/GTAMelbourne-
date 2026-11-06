#!/usr/bin/env python3
"""Make an Ara 3D Gen character GLB fit for the game: textures resized to what they need on screen and re-encoded
(opaque ones as JPEG, ones with transparency as PNG), everything else untouched (mesh, rig, clips, blend shapes).

Ara exports skin, clothes and hair at 2048 px. Each such texture takes ~21 MB of graphics memory once loaded (with its
mipmaps): about 100 MB for one character, most of a small laptop GPU. At the sizes below one character needs ~25 MB.

Skin weights and joint indices are stored as bytes (normalised UNSIGNED_BYTE, core glTF) rather than floats.
Each part (skin, eyes, outfit, hair...) becomes its own mesh with only its own vertices, and only the parts the face
moves keep blend shapes, and only the ones the game uses (FACE below). Ara exports every part as a primitive over one
shared 60k-vertex buffer with all 34 shapes on each; three.js builds a blend-shape texture per part from that, ~30 MB of
graphics memory each, ~400 MB a character. Split, a character's face shapes take a few MB.
--no-anims leaves the clips out: every Ara character has the same rig, so the cast borrow the player's (js/people.js).

usage: python3 tools/ara/optimize.py in.glb out.glb [--scale 1.0] [--no-anims]   (--scale 0.5: a lighter low-settings copy)
"""
import io
import json
import struct
import sys
import numpy as np
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


# the blend shapes the game uses (js/people.js faceLife: blinks, lips; plus a few for expressions); the low copy: blinks and jaw
FACE = ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', 'mouthSmile', 'mouthFrown', 'browInnerUp', 'browDownLeft', 'browDownRight',
        'viseme_PP', 'viseme_FF', 'viseme_DD', 'viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U']
FACE_LOW = ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen']


def split_parts(j, views, read, put_unused, scale):
    acc, bvs = j['accessors'], j['bufferViews']
    def dense(ai):
        a = acc[ai]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        out = read(ai).astype(np.float32) if 'bufferView' in a else np.zeros((a['count'], n), np.float32)
        sp = a.get('sparse')
        if sp:
            it = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32}[sp['indices']['componentType']]
            iv = sp['indices']; vv = sp['values']
            idx = np.frombuffer(views[iv['bufferView']], dtype=it, count=sp['count'], offset=iv.get('byteOffset', 0))
            val = np.frombuffer(views[vv['bufferView']], dtype=np.float32, count=sp['count'] * n, offset=vv.get('byteOffset', 0)).reshape(-1, n)
            out[idx.astype(np.int64)] = val
        return out
    def new_acc(arr, ctype, typ, normalized=False, minmax=False):
        views.append(np.ascontiguousarray(arr).tobytes())
        bvs.append({'buffer': 0, 'byteOffset': 0, 'byteLength': len(views[-1])})
        a = {'bufferView': len(bvs) - 1, 'componentType': ctype, 'count': len(arr), 'type': typ}
        if normalized: a['normalized'] = True
        if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        acc.append(a)
        return len(acc) - 1
    def sparse_acc(d):
        # only the vertices the shape moves (glTF sparse accessor: zeros elsewhere)
        nz = np.nonzero(np.abs(d).max(1) > 1e-7)[0]
        it = np.uint16 if len(d) < 65536 else np.uint32
        views.append(nz.astype(it).tobytes()); bvs.append({'buffer': 0, 'byteOffset': 0, 'byteLength': len(views[-1])}); iv = len(bvs) - 1
        views.append(np.ascontiguousarray(d[nz]).tobytes()); bvs.append({'buffer': 0, 'byteOffset': 0, 'byteLength': len(views[-1])}); vv = len(bvs) - 1
        acc.append({'componentType': 5126, 'count': len(d), 'type': 'VEC3', 'min': d.min(0).tolist(), 'max': d.max(0).tolist(),
                    'sparse': {'count': int(len(nz)), 'indices': {'bufferView': iv, 'componentType': 5123 if it == np.uint16 else 5125},
                               'values': {'bufferView': vv}}})
        return len(acc) - 1
    wanted = FACE_LOW if scale < 1 else FACE
    for ni, node in enumerate(list(j['nodes'])):
        if 'mesh' not in node: continue
        mesh = j['meshes'][node['mesh']]
        if len(mesh['primitives']) < 2: continue
        names = mesh.get('extras', {}).get('targetNames', [])
        keep_t = [i for i, n in enumerate(names) if n in wanted]
        kids = []
        for pr in mesh['primitives']:
            ind = read(pr['indices']).ravel().astype(np.int64)
            uniq, inv = np.unique(ind, return_inverse=True)
            attrs = {}
            for k, ai in pr['attributes'].items():
                a = acc[ai]; arr = read(ai)[uniq]
                attrs[k] = new_acc(arr, a['componentType'], a['type'], a.get('normalized', False), k == 'POSITION')
            idx_arr = inv.astype(np.uint16 if len(uniq) < 65536 else np.uint32)
            np_ = {'attributes': attrs, 'indices': new_acc(idx_arr, 5123 if idx_arr.dtype == np.uint16 else 5125, 'SCALAR'),
                   'material': pr['material']}
            targets, tnames = [], []
            for ti in keep_t:
                d = dense(pr['targets'][ti]['POSITION'])[uniq]
                if np.abs(d).max() > 1e-6:
                    targets.append(d); tnames.append(names[ti])
            m = {'name': j['materials'][pr['material']].get('name', 'part'), 'primitives': [np_]}
            if targets:
                np_['targets'] = [{'POSITION': sparse_acc(t.astype(np.float32))} for t in targets]
                m['weights'] = [0.0] * len(targets)
                m['extras'] = {'targetNames': tnames}
            j['meshes'].append(m)
            j['nodes'].append({'name': f"{node.get('name', 'body')}_{m['name'].replace(' ', '_')}", 'mesh': len(j['meshes']) - 1, 'skin': node['skin']})
            kids.append(len(j['nodes']) - 1)
        # the original node becomes the parts' parent (same place, so the same bind)
        node.pop('mesh'); node.pop('skin', None)
        node['children'] = node.get('children', []) + kids
        mesh['primitives'] = []


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
    # skin weights and joints as bytes
    acc = j['accessors']
    CT = {5126: np.float32, 5123: np.uint16, 5121: np.uint8, 5125: np.uint32}
    def read(ai):
        a = acc[ai]; v = j['bufferViews'][a['bufferView']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        dt = np.dtype(CT[a['componentType']])
        stride = v.get('byteStride', 0) or dt.itemsize * n
        raw = np.frombuffer(views[a['bufferView']], dtype=np.uint8)
        off = a.get('byteOffset', 0)
        rows = np.lib.stride_tricks.as_strided(raw[off:], shape=(a['count'], dt.itemsize * n), strides=(stride, 1)).copy()
        return rows.view(dt).reshape(a['count'], n)
    def put(ai, arr, ctype, normalized=False):
        views.append(arr.tobytes())
        j['bufferViews'].append({'buffer': 0, 'byteOffset': 0, 'byteLength': len(views[-1])})
        a = acc[ai]
        a['bufferView'] = len(j['bufferViews']) - 1; a['byteOffset'] = 0; a['componentType'] = ctype
        a.pop('min', None); a.pop('max', None)
        if normalized: a['normalized'] = True
    done = set()
    for m in j['meshes']:
        for pr in m['primitives']:
            at = pr['attributes']
            if 'WEIGHTS_0' in at and at['WEIGHTS_0'] not in done and acc[at['WEIGHTS_0']]['componentType'] == 5126:
                w = read(at['WEIGHTS_0']).astype(np.float64)
                q = np.round(w * 255).astype(np.int32)
                # the four still add up to exactly 255: the rounding error goes on the biggest
                err = 255 - q.sum(1)
                q[np.arange(len(q)), q.argmax(1)] += err
                put(at['WEIGHTS_0'], np.clip(q, 0, 255).astype(np.uint8), 5121, True)
                done.add(at['WEIGHTS_0'])
            if 'JOINTS_0' in at and at['JOINTS_0'] not in done and acc[at['JOINTS_0']]['componentType'] != 5121:
                jt = read(at['JOINTS_0'])
                if jt.max() < 256:
                    put(at['JOINTS_0'], jt.astype(np.uint8), 5121)
                done.add(at['JOINTS_0'])
    split_parts(j, views, read, put, scale)
    if '--no-anims' in sys.argv:
        j.pop('animations', None)
    for an in j.get('animations', []):
        # the clips' own face track drove all 34 shapes on the one mesh: the game drives the face itself (blinks, lips)
        keep = [i for i, ch in enumerate(an['channels']) if ch['target']['path'] != 'weights']
        an['channels'] = [an['channels'][i] for i in keep]
    # drop what nothing uses any more (the shared buffer the parts were cut from, the float weights, the clips with
    # --no-anims), then repack, each view 4-byte aligned
    keep_acc = set()
    for m in j['meshes']:
        for pr in m['primitives']:
            keep_acc |= set(pr['attributes'].values())
            if 'indices' in pr: keep_acc.add(pr['indices'])
            for t in pr.get('targets', []): keep_acc |= set(t.values())
    for sk in j.get('skins', []):
        if 'inverseBindMatrices' in sk: keep_acc.add(sk['inverseBindMatrices'])
    for an in j.get('animations', []):
        for smp in an['samplers']: keep_acc |= {smp['input'], smp['output']}
    kept_views = {im['bufferView'] for im in j.get('images', [])}
    for i in keep_acc:
        a = acc[i]
        if 'bufferView' in a: kept_views.add(a['bufferView'])
        if 'sparse' in a: kept_views |= {a['sparse']['indices']['bufferView'], a['sparse']['values']['bufferView']}
    for i in range(len(views)):
        if i not in kept_views: views[i] = b''
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
