"""Brings third-party OBJ models into the game's format (glTF JSON with an embedded buffer).

    python tools/import_models.py eureka <Eureka Tower .obj>     -> models/landmarks/eureka.json
    python tools/import_models.py jet <airliner .obj>            -> models/aircraft/jet.json
    python tools/import_models.py oldcar <Generic_Old_Car.obj>   -> models/custom/oldcar.json (the classic car)
    python tools/import_models.py citypack <city+models+byothers.obj> -> models/towers/*.json (CBD building looks)

Run with Blender's Python module (bpy). The OBJ files came without their .mtl, so materials are assigned here by
position: Eureka Tower's podium, blue glass shaft and gold crown; the airliner's white body and grey wings.

Sources (see models/README.md): both are free downloads from CGTrader, added at the project owner's request. The
Eureka Tower listing is titled "Eureka Tower (not mine)": its uploader is not its author, so its licence is unclear.
"""
import sys, os, math, json, base64, struct
import bpy, bmesh
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def mat(name, col, rough, metal=0.):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    c = tuple(int(col[i:i + 2], 16) / 255 for i in (1, 3, 5))
    b.inputs["Base Color"].default_value = tuple(v ** 2.2 for v in c) + (1,)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def load(path, drop=("Man_Standing", "Bryce")):
    """Import the OBJ (Y up, converted to Blender's Z up), drop SketchUp's sample people, join into one mesh."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=path)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in objs:
        if any(k in o.name for k in drop):
            bpy.data.objects.remove(o)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.materials.clear()
    return o


def fit(o, sx, sy, sz):
    """Scale about the footprint's centre and stand it on z = 0."""
    vs = [v.co for v in o.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    c = (lo + hi) / 2
    for v in o.data.vertices:
        v.co = Vector(((v.co.x - c.x) * sx, (v.co.y - c.y) * sy, (v.co.z - lo.z) * sz))
    return max(v.co.z for v in o.data.vertices)


def paint(o, mats, pick):
    """Give each face a material slot chosen by pick(face centre, normal)."""
    for m in mats:
        o.data.materials.append(m)
    for p in o.data.polygons:
        p.material_index = pick(p.center, p.normal)


def export(o, name, out):
    o.name = name
    for p in o.data.polygons:
        p.use_smooth = False
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    glb = out[:-5] + ".glb"
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    to_json(glb, out)
    os.remove(glb)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    print("wrote", out, os.path.getsize(out) // 1024, "KB,", tris, "tris")


def to_json(glb, out):
    """GLB -> glTF JSON with the binary embedded as a data URI (static hosts and artifacts serve .json, not .glb)."""
    b = open(glb, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    g = json.loads(b[20:20 + n])
    off = 20 + n
    blen = struct.unpack("<I", b[off:off + 4])[0]
    data = b[off + 8:off + 8 + blen]
    g["buffers"] = [{"byteLength": len(data), "uri": "data:application/octet-stream;base64," + base64.b64encode(data).decode()}]
    json.dump(g, open(out, "w"), separators=(",", ":"))


def eureka(path):
    o = load(path)
    # real footprint at the map's scale (1.6 game units a metre; the OBJ is in inches), with the game's tower height
    k = 1.6 * .0254
    vs = [v.co.z for v in o.data.vertices]
    H = max(vs) - min(vs)
    top = fit(o, k, k, 902 / H)
    paint(o, [mat("Concrete", "#8d9095", .8), mat("BlueGlass", "#1c2a40", .12, .55), mat("Gold", "#d4a83a", .28, .95)],
          lambda c, n: 0 if c.z < top * .124 else 2 if c.z > top * .855 else 1)
    export(o, "eureka", os.path.join(ROOT, "models", "landmarks", "eureka.json"))


def jet(path):
    o = load(path)
    # the nose faces Blender -Y (the OBJ's +Z), like the other vehicles; the same length as the old airliner
    vs = [v.co for v in o.data.vertices]
    L = max(v.y for v in vs) - min(v.y for v in vs)
    k = 96 / L
    fit(o, k, k, k)
    r = max(abs(v.co.x) for v in o.data.vertices if abs(v.co.y) < 5) * 1.25   # the fuselage's half width mid-ships
    paint(o, [mat("Body", "#f4f5f7", .35, .1), mat("Wing", "#b9bec6", .45, .3)],
          lambda c, n: 1 if abs(c.x) > r else 0)
    d = o.modifiers.new("dec", "DECIMATE")
    d.ratio = min(1., 12000 / max(1, sum(len(p.vertices) - 2 for p in o.data.polygons)))
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=d.name)
    export(o, "jet", os.path.join(ROOT, "models", "aircraft", "jet.json"))


def oldcar(path):
    """The classic car: in metres, front at -Y, each tyre with its rim and hubcap as a spinning wheel-N part."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=path, use_split_groups=True)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    ctr = lambda o: sum((o.matrix_world @ Vector(b) for b in o.bound_box), Vector()) / 8
    tyres = [o for o in objs if o.name.startswith("tire")]
    groups = {t.name: [t] for t in tyres}
    rest = []
    for o in objs:
        if o in tyres:
            continue
        near = min(tyres, key=lambda t: (ctr(t) - ctr(o)).length)
        (groups[near.name] if (ctr(near) - ctr(o)).length < 25 else rest).append(o)

    def join(parts, name):
        bpy.ops.object.select_all(action="DESELECT")
        for o in parts:
            o.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active
        o.name = name
        return o

    def dec(o, target):
        d = o.modifiers.new("dec", "DECIMATE")
        d.ratio = min(1., target / max(1, sum(len(p.vertices) - 2 for p in o.data.polygons)))
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=d.name)

    body = join(rest, "body")
    dec(body, 14000)
    wheels = []
    for i, parts in enumerate(groups.values()):
        w = join(parts, "wheel-%d" % (i + 1))
        dec(w, 700)
        wheels.append(w)
    # centimetres to metres; each wheel's origin on its axle so it spins in place
    for o in [body] + wheels:
        o.data.transform(__import__("mathutils").Matrix.Scale(.01, 4))
    for w in wheels:
        bpy.ops.object.select_all(action="DESELECT")
        w.select_set(True)
        bpy.context.view_layer.objects.active = w
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    # the game's material names: Body is repainted per car, lights glow after dark
    names = {"body": "Body", "glass": "Glass", "chrome": "Chrome", "headlight": "HeadLight", "redlight": "TailLight",
             "orange_light_": "IndicatorLight", "white_light": "Reverse", "tire": "Tyre", "plate": "Plate"}
    glow = {"HeadLight": (1., .95, .85), "TailLight": (1., .08, .05), "IndicatorLight": (1., .45, .05), "Reverse": (1., 1., 1.)}
    for m in bpy.data.materials:
        m.name = names.get(m.name, m.name)
        if m.name in glow and m.use_nodes:
            b = m.node_tree.nodes.get("Principled BSDF")
            if b:
                b.inputs["Emission Color"].default_value = glow[m.name] + (1,)
                b.inputs["Emission Strength"].default_value = 1.
                for l in list(m.node_tree.links):   # the lamp texture's Windows path doesn't come with the files
                    if l.to_node == b and l.to_socket.name == "Base Color":
                        m.node_tree.links.remove(l)
    for o in [body] + wheels:
        for p in o.data.polygons:
            p.use_smooth = True
    bpy.ops.object.select_all(action="DESELECT")
    for o in [body] + wheels:
        o.select_set(True)
    out = os.path.join(ROOT, "models", "custom", "oldcar.json")
    glb = out[:-5] + ".glb"
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_image_format="JPEG")
    to_json(glb, out)
    os.remove(glb)
    print("wrote", out, os.path.getsize(out) // 1024, "KB,", sum(len(p.vertices) - 2 for o in [body] + wheels for p in o.data.polygons), "tris")


# the city pack's complete buildings: (name in the pack, game id, role). The game fits each to a building's footprint
# and height, so only the shape matters; there are no textures, so one plain material, tinted per building in the game.
CITYPACK = [("hirise13", "tower-a", "tower"), ("hirise8", "tower-b", "tower"), ("hivizcayne", "tower-c", "tower"),
            ("hirise12", "tower-d", "tower"), ("hirise7", "tower-e", "tower"), ("45building", "mid-a", "mid"),
            ("AIT01W2W2", "mid-b", "mid"), ("AIT01W2W8", "mid-c", "mid"), ("AIT01W2W1", "mid-d", "mid"),
            ("AIT01W2W6", "mid-e", "mid"), ("LOWRISEMODERNCONDO2", "mid-f", "mid"), ("Plane001", "mid-g", "mid"),
            ("nationalarchives", "heritage-a", "heritage")]


def citypack(path):
    import re
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=path)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    out_dir = os.path.join(ROOT, "models", "towers")
    os.makedirs(out_dir, exist_ok=True)
    facade = mat("Facade", "#ffffff", .55, .15)
    for src, gid, role in CITYPACK:
        cand = [o for o in objs if re.split(r"[._]", o.name)[0] == src]
        if not cand:
            print("missing", src)
            continue
        o = max(cand, key=lambda o: len(o.data.polygons))   # the complete one (the others are copies or pieces)
        o.data = o.data.copy()
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        o.data.materials.clear()
        o.data.materials.append(facade)
        fit(o, 1, 1, 1)
        n = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if n > 6000:
            d = o.modifiers.new("dec", "DECIMATE")
            d.ratio = 6000 / n
            bpy.ops.object.modifier_apply(modifier=d.name)
        export(o, gid, os.path.join(out_dir, gid + ".json"))


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    {"eureka": eureka, "jet": jet, "oldcar": oldcar, "citypack": citypack}[args[0]](args[1])
