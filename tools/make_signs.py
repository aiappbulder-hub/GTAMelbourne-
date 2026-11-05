"""Builds Australian street signs as game props: a galvanised post with the sign face on it.

    python tools/make_signs.py          (with Blender's Python module) -> models/props/sign-*.json

The sign faces are textures/signs/*: images from a South Australian road-sign pack the project owner supplied
(standard Australian sign designs, which Victoria uses too). Cut-out shapes (stop, give way, the kangaroo diamond)
use the image's alpha. Units are game pixels like the other props (about 14 to the metre); each sign stands on its
origin and its face looks along -Y (glTF +Z), so the game turns it to face the traffic it's meant for.
"""
import os, sys, json, struct, base64
import bpy, bmesh

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "textures", "signs")
OUT = os.path.join(ROOT, "models", "props")
M = 14.   # game pixels to the metre

# name: (image, width in metres, height of the face's bottom edge in metres)
SIGNS = {
    "stop": ("stop.png", .75, 1.6), "giveway": ("giveway.png", .9, 1.6), "60": ("60.jpg", .6, 1.6), "50": ("50.jpg", .6, 1.6),
    "nostanding": ("nostanding.jpg", .4, 1.9), "2p": ("2p.jpg", .3, 1.9), "1p": ("1p.jpg", .3, 1.9), "buszone": ("buszone.jpg", .3, 1.9),
    "clearway": ("clearway.jpg", .45, 1.9), "noparking": ("noparking.jpg", .3, 1.9), "kangaroo": ("kangaroo.png", .75, 1.5), "bikelane": ("bikelane.jpg", .45, 1.8),
}


def material(name, img, tint=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    if tint:   # the sign's back: plain grey metal, cut to the same outline
        b.inputs["Base Color"].default_value = tint + (1,)
        b.inputs["Metallic"].default_value = .7
        b.inputs["Roughness"].default_value = .45
    else:
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = .55   # retroreflective sheeting: a soft sheen
    if img.depth == 32 or img.channels == 4:
        nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    return m


def quad(bm, x0, x1, z0, z1, y, flip, uv):
    vs = [bm.verts.new((x0, y, z0)), bm.verts.new((x1, y, z0)), bm.verts.new((x1, y, z1)), bm.verts.new((x0, y, z1))]
    f = bm.faces.new(vs if not flip else vs[::-1])
    uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
    if flip:   # the same image placement, wound the other way: the back's outline matches the face
        uvs = uvs[::-1]
    for l, u in zip(f.loops, uvs):
        l[uv].uv = u
    return f


def build(name, file, w, z0):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    img = bpy.data.images.load(os.path.join(SRC, file))
    aw, ah = img.size
    W, H, Z0 = w * M, w * ah / aw * M, z0 * M
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    f = quad(bm, -W / 2, W / 2, Z0, Z0 + H, -.75, False, uv)   # the face, towards -Y
    f.material_index = 0
    b = quad(bm, -W / 2, W / 2, Z0, Z0 + H, -.55, True, uv)    # the back plate
    b.material_index = 1
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(material(name + "-face", img))
    me.materials.append(material(name + "-back", img, (.55, .57, .6)))
    # the post: a galvanised steel tube from the ground to the top of the sign
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=.03 * M * 1.4, depth=Z0 + H + .05 * M, location=(0, 0, (Z0 + H + .05 * M) / 2))
    post = bpy.context.active_object
    pm = bpy.data.materials.new("Pole")
    pm.use_nodes = True
    pb = pm.node_tree.nodes["Principled BSDF"]
    pb.inputs["Base Color"].default_value = (.5, .52, .55, 1)
    pb.inputs["Metallic"].default_value = .8
    pb.inputs["Roughness"].default_value = .4
    post.data.materials.append(pm)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    post.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.join()
    path = os.path.join(OUT, "sign-" + name)
    bpy.ops.export_scene.gltf(filepath=path + ".glb", export_format="GLB", use_selection=True, export_yup=True,
                              export_image_format="AUTO")
    to_json(path + ".glb", path + ".json")
    os.remove(path + ".glb")
    print("sign-" + name, os.path.getsize(path + ".json") // 1024, "KB")


def to_json(glb, out):
    """GLB -> glTF JSON with the binary embedded; cut-out signs use alpha MASK (sharp edges, no sorting)."""
    b = open(glb, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    g = json.loads(b[20:20 + n])
    off = 20 + n
    blen = struct.unpack("<I", b[off:off + 4])[0]
    data = b[off + 8:off + 8 + blen]
    for m in g.get("materials", []):
        if m.get("alphaMode") == "BLEND":
            m["alphaMode"], m["alphaCutoff"] = "MASK", .5
    g["buffers"] = [{"byteLength": len(data), "uri": "data:application/octet-stream;base64," + base64.b64encode(data).decode()}]
    json.dump(g, open(out, "w"), separators=(",", ":"))


if __name__ == "__main__":
    for k, (f, w, z) in SIGNS.items():
        build(k, f, w, z)
