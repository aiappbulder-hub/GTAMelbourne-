"""Slims an exported character GLB: drops animation channels that never move.

Blender's glTF exporter writes translation, rotation and scale for every bone in every clip, even a bone that stays at its
rest pose throughout (all the scales, and the translations of everything below the pelvis on a skeleton like the
animation library's). For a 65-bone skeleton that is thousands of no-op channels, mostly JSON.

A bone/path is dropped only when it equals the node's rest value in *every* clip, so a crossfade can never leave a bone
stuck in another clip's pose. Unused accessors and buffer views are then compacted away.

    python glb_slim.py file.glb [...]
"""
import json, struct, sys, os

EPS = 1e-4
COMP = {5126: ("f", 4), 5123: ("H", 2), 5125: ("I", 4), 5121: ("B", 1), 5122: ("h", 2), 5120: ("b", 1)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def _read(path):
    b = open(path, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    g = json.loads(b[20:20 + n])
    off = 20 + n
    blen = struct.unpack("<I", b[off:off + 4])[0]
    return g, bytearray(b[off + 8:off + 8 + blen])


def _values(g, binb, ai):
    a = g["accessors"][ai]
    v = g["bufferViews"][a["bufferView"]]
    fmt, size = COMP[a["componentType"]]
    k = NCOMP[a["type"]]
    start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    flat = struct.unpack_from("<%d%s" % (a["count"] * k, fmt), binb, start)
    if a.get("normalized") and fmt == "h":
        flat = [max(x / 32767., -1.) for x in flat]
    return [flat[i * k:(i + 1) * k] for i in range(a["count"])]


def _rest(node, path):
    return node.get(path, {"translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1]}[path])


def _same(a, b, path):
    if path == "rotation" and sum(x * y for x, y in zip(a, b)) < 0:   # q and -q are the same turn
        b = [-x for x in b]
    return all(abs(x - y) < EPS for x, y in zip(a, b))


def slim(path):
    g, binb = _read(path)
    before = os.path.getsize(path)
    moving = set()
    for an in g.get("animations", []):
        for ch in an["channels"]:
            t = ch["target"]
            key = (t["node"], t["path"])
            if key in moving or t["path"] == "weights":
                moving.add(key)
                continue
            rest = _rest(g["nodes"][t["node"]], t["path"])
            if any(not _same(v, rest, t["path"]) for v in _values(g, binb, an["samplers"][ch["sampler"]]["output"])):
                moving.add(key)
    dropped = 0
    for an in g.get("animations", []):
        keep_ch, keep_s, remap = [], [], {}
        for ch in an["channels"]:
            t = ch["target"]
            if (t["node"], t["path"]) not in moving:
                dropped += 1
                continue
            s = ch["sampler"]
            if s not in remap:
                remap[s] = len(keep_s)
                keep_s.append(an["samplers"][s])
            keep_ch.append(dict(ch, sampler=remap[s]))
        an["channels"], an["samplers"] = keep_ch, keep_s
    _compact(g, binb, path)
    print("  slimmed %s: %d static channels dropped, %d -> %d KB" % (os.path.basename(path), dropped, before // 1024,
                                                                     os.path.getsize(path) // 1024))


def _compact(g, binb, path):
    """Keep only the accessors and buffer views something still points at, and rewrite the file."""
    used_acc = set()
    for m in g.get("meshes", []):
        for p in m["primitives"]:
            used_acc.update(p["attributes"].values())
            if "indices" in p:
                used_acc.add(p["indices"])
            for t in p.get("targets", []):
                used_acc.update(t.values())
    for s in g.get("skins", []):
        if "inverseBindMatrices" in s:
            used_acc.add(s["inverseBindMatrices"])
    for an in g.get("animations", []):
        for s in an["samplers"]:
            used_acc.update((s["input"], s["output"]))
    acc_map = {old: new for new, old in enumerate(sorted(used_acc))}
    used_bv = {g["accessors"][a]["bufferView"] for a in used_acc if "bufferView" in g["accessors"][a]}
    used_bv |= {im["bufferView"] for im in g.get("images", []) if "bufferView" in im}
    bv_map, out, views = {}, bytearray(), []
    for old in sorted(used_bv):
        v = dict(g["bufferViews"][old])
        o = v.get("byteOffset", 0)
        while len(out) % 4:
            out.append(0)
        data = binb[o:o + v["byteLength"]]
        v["byteOffset"] = len(out)
        out += data
        bv_map[old] = len(views)
        views.append(v)
    accs = []
    for old in sorted(used_acc):
        a = dict(g["accessors"][old])
        if "bufferView" in a:
            a["bufferView"] = bv_map[a["bufferView"]]
        accs.append(a)
    g["accessors"], g["bufferViews"] = accs, views
    for im in g.get("images", []):
        if "bufferView" in im:
            im["bufferView"] = bv_map[im["bufferView"]]
    for m in g.get("meshes", []):
        for p in m["primitives"]:
            p["attributes"] = {k: acc_map[v] for k, v in p["attributes"].items()}
            if "indices" in p:
                p["indices"] = acc_map[p["indices"]]
            if "targets" in p:
                p["targets"] = [{k: acc_map[v] for k, v in t.items()} for t in p["targets"]]
    for s in g.get("skins", []):
        if "inverseBindMatrices" in s:
            s["inverseBindMatrices"] = acc_map[s["inverseBindMatrices"]]
    for an in g.get("animations", []):
        for s in an["samplers"]:
            s["input"], s["output"] = acc_map[s["input"]], acc_map[s["output"]]
    while len(out) % 4:
        out.append(0)
    g["buffers"] = [{"byteLength": len(out)}]
    js = json.dumps(g, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(out), 0x004E4942) + bytes(out))


if __name__ == "__main__":
    for p in sys.argv[1:]:
        slim(p)
