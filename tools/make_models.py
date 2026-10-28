"""Builds the game's custom low-poly vehicles in Blender and exports them as .glb.

Run headless with Blender's Python module:  python make_models.py <out_dir>
Conventions (what the game expects): front of the vehicle along Blender -Y
(glTF +Z), wheels are separate objects named wheel-* with their origin on the
axle, and the paint is a material called "Body" so the game can recolour it.
"""
import sys, math, os
import bpy, bmesh

OUT = sys.argv[-1] if len(sys.argv) > 1 else "."
os.makedirs(OUT, exist_ok=True)
MATS = {}


def mat(name, rgb, emit=0.0, rough=0.55, metal=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*rgb, 1)
        b.inputs["Emission Strength"].default_value = emit
    MATS[name] = m
    return m


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()


def link(obj):
    bpy.context.collection.objects.link(obj)
    return obj


def prism(name, profile, width, material, x=0.0, bevel=0.0):
    """Extrude a side profile [(y, z), ...] across the car's width (X)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    left = [bm.verts.new((x - width / 2, y, z)) for y, z in profile]
    right = [bm.verts.new((x + width / 2, y, z)) for y, z in profile]
    bm.faces.new(left[::-1])
    bm.faces.new(right)
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((left[i], left[j], right[j], right[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.data.materials.append(material)
    if bevel:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
    return o


def box(name, size, loc, material, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(material)
    if bevel:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return o


def cyl(name, r, depth, loc, material, axis="X", verts=16):
    rot = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.transform_apply(rotation=True)
    o.data.materials.append(material)
    return o


def wheel(name, r, w, loc, rim_rgb="#c9ccd1"):
    """Tyre + rim joined into one object named wheel-*, origin on the axle."""
    t = cyl(name, r, w, loc, mat("Tyre", srgb("#1c1d20"), rough=0.9), verts=18)
    rim = cyl(name + "-rim", r * 0.58, w * 1.06, loc, mat("Rim", srgb(rim_rgb), rough=0.3, metal=0.6), verts=10)
    hub = cyl(name + "-hub", r * 0.2, w * 1.12, loc, mat("Hub", srgb("#3b3d42")), verts=8)
    for o in (rim, hub):
        o.select_set(True)
    t.select_set(True)
    bpy.context.view_layer.objects.active = t
    bpy.ops.object.join()
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    t.name = name
    return t


def wheels(r, w, front, rear, half_track, z=None):
    z = r if z is None else z
    for side, sx in (("left", -1), ("right", 1)):
        wheel(f"wheel-front-{side}", r, w, (sx * half_track, front, z))
        wheel(f"wheel-back-{side}", r, w, (sx * half_track, rear, z))


def lights(front_y, rear_y, z_front, z_rear, half, size=(0.28, 0.06, 0.12)):
    head = mat("HeadLight", srgb("#fff6d0"), emit=2.0)
    tail = mat("TailLight", srgb("#c4161c"), emit=1.2)
    for sx in (-1, 1):
        box("headlight", size, (sx * half, front_y, z_front), head)
        box("taillight", (size[0], 0.06, size[2] * 1.2), (sx * half, rear_y, z_rear), tail)


def export(name):
    for o in bpy.context.scene.objects:
        for m in o.modifiers:
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=m.name)
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, export_yup=True)
    print("exported", path, os.path.getsize(path))


GLASS = lambda: mat("Glass", srgb("#1d2a38"), rough=0.15, metal=0.3)
DARK = lambda: mat("Trim", srgb("#1f2024"), rough=0.7)
CHROME = lambda: mat("Chrome", srgb("#d5d8dd"), rough=0.25, metal=0.8)


# --------------------------------------------------------------- sedan family
def sedan_body(paint, length=4.6, width=1.82):
    L = length / 2
    body = mat("Body", srgb(paint), rough=0.35, metal=0.3)
    prism("body", [(-L, .32), (-L, .72), (-L + .18, .84), (-.95, .94), (1.35, .98), (L - .12, .92),
                   (L, .78), (L, .32), (L - .55, .28), (-L + .55, .28)], width, body, bevel=.06)
    # glasshouse: raked windscreen, flat roof, sloping rear screen
    prism("glass", [(-.95, .92), (-.22, 1.36), (.92, 1.38), (1.42, .96)], width - .2, GLASS(), bevel=.03)
    prism("roof", [(-.18, 1.33), (.9, 1.35), (.86, 1.42), (-.14, 1.41)], width - .24, body, bevel=.02)
    for sx in (-1, 1):  # pillars and sills in body colour
        box("pillar", (.05, .5, .06), (sx * (width / 2 - .1), .4, 1.12), body, rot=(0, 0, 0))
        box("mirror", (.16, .1, .1), (sx * (width / 2 + .04), -.72, 1.0), body, bevel=.02)
    box("grille", (width * .6, .05, .16), (0, -L - .01, .58), DARK(), bevel=.01)
    box("bumper-f", (width * .96, .14, .14), (0, -L + .02, .36), DARK(), bevel=.03)
    box("bumper-r", (width * .96, .14, .14), (0, L - .02, .36), DARK(), bevel=.03)
    lights(-L - .01, L + .01, .7, .78, width / 2 - .22)
    wheels(.34, .24, -L + .82, L - .78, width / 2 - .1)
    return body


def make_sedan():
    reset()
    sedan_body("#c0392b")
    box("badge", (.18, .03, .08), (0, -2.31, .62), CHROME())
    export("comodo")


def make_police():
    reset()
    sedan_body("#f4f6f8")
    blue, yel = mat("Livery-Blue", srgb("#1b3c8c")), mat("Livery-Yellow", srgb("#ffcc33"))
    # Battenburg-style checker band along both sides
    n = 10
    for sx in (-1, 1):
        for i in range(n):
            y = -1.9 + i * (3.8 / n)
            box("check", (.02, 3.8 / n, .16), (sx * .92, y + 3.8 / n / 2, .64), blue if i % 2 == 0 else yel)
    box("lightbar", (1.1, .24, .1), (0, .25, 1.48), DARK(), bevel=.02)
    box("light-red", (.48, .2, .09), (-.27, .25, 1.55), mat("PoliceRed", srgb("#e02020"), emit=1.5), bevel=.02)
    box("light-blue", (.48, .2, .09), (.27, .25, 1.55), mat("PoliceBlue", srgb("#2a6bff"), emit=1.5), bevel=.02)
    export("police")


def make_taxi():
    reset()
    sedan_body("#f2c81f")
    box("sign", (.6, .22, .2), (0, .3, 1.53), mat("TaxiSign", srgb("#fff6c8"), emit=.8), bevel=.03)
    box("sign-base", (.66, .26, .05), (0, .3, 1.43), DARK())
    for sx in (-1, 1):
        box("taxi-stripe", (.02, 3.6, .07), (sx * .92, .1, .74), DARK())
    export("taxi")


def make_hatch():
    reset()
    L, width = 1.95, 1.72
    body = mat("Body", srgb("#2980b9"), rough=0.35, metal=0.3)
    prism("body", [(-L, .32), (-L, .7), (-L + .2, .82), (-.75, .92), (L - .1, .98), (L, .8), (L, .32),
                   (L - .5, .28), (-L + .5, .28)], width, body, bevel=.06)
    prism("glass", [(-.75, .9), (-.05, 1.34), (1.45, 1.36), (L - .08, .96)], width - .2, GLASS(), bevel=.03)
    prism("roof", [(-.02, 1.31), (1.42, 1.33), (1.4, 1.4), (0, 1.39)], width - .24, body, bevel=.02)
    box("spoiler", (width * .8, .14, .05), (0, L - .14, 1.39), body, bevel=.02)
    box("grille", (width * .55, .05, .14), (0, -L - .01, .56), DARK(), bevel=.01)
    box("bumper-f", (width * .96, .14, .14), (0, -L + .02, .36), DARK(), bevel=.03)
    box("bumper-r", (width * .96, .14, .14), (0, L - .02, .36), DARK(), bevel=.03)
    for sx in (-1, 1):
        box("mirror", (.15, .1, .1), (sx * (width / 2 + .04), -.55, .98), body, bevel=.02)
    lights(-L - .01, L + .01, .68, .82, width / 2 - .2)
    wheels(.32, .22, -L + .65, L - .6, width / 2 - .1)
    export("barrina")


# --------------------------------------------------------------- dual-cab 4x4 ute
def make_ute():
    reset()
    L, width = 2.6, 1.9
    body = mat("Body", srgb("#e8e8e8"), rough=0.4, metal=0.25)
    blk = DARK()
    # cab + bonnet section (front), raised 4x4 stance
    prism("cab", [(-L, .55), (-L, 1.02), (-L + .22, 1.16), (-.95, 1.26), (-.95, 1.2), (.85, 1.2), (.85, .55)], width, body, bevel=.06)
    prism("glass", [(-.95, 1.24), (-.38, 1.86), (.78, 1.88), (.82, 1.24)], width - .16, GLASS(), bevel=.03)
    prism("roof", [(-.34, 1.83), (.76, 1.85), (.74, 1.93), (-.3, 1.92)], width - .2, body, bevel=.02)
    # tub
    prism("tub-floor", [(.9, .55), (.9, .78), (L, .78), (L, .55)], width, body, bevel=.04)
    for sx in (-1, 1):
        box("tub-side", (.08, L - .9, .44), (sx * (width / 2 - .04), (L + .9) / 2, 1.0), body, bevel=.02)
        box("door-line-1", (.01, .02, .55), (sx * (width / 2 + .005), -.4, .95), blk)
        box("door-line-2", (.01, .02, .55), (sx * (width / 2 + .005), .32, .95), blk)
        box("mirror", (.18, .12, .12), (sx * (width / 2 + .06), -.82, 1.32), blk, bevel=.02)
        # chunky arch flares
        for y in (-L + .78, L - .78):
            box("flare", (.14, .98, .2), (sx * (width / 2 + .02), y, 1.0), blk, bevel=.04)
    box("tailgate", (width, .08, .44), (0, L - .04, 1.0), body, bevel=.02)
    box("tub-liner", (width - .2, L - 1.0, .02), (0, (L + .9) / 2, .8), blk)
    # sports bar
    for sx in (-1, 1):
        box("sportsbar-post", (.07, .07, .62), (sx * (width / 2 - .12), .98, 1.5), blk)
    box("sportsbar-top", (width - .2, .08, .07), (0, .98, 1.8), blk)
    # bull bar, snorkel, roof rack + light bar
    box("bullbar-low", (width * .98, .12, .12), (0, -L - .1, .7), blk, bevel=.03)
    box("bullbar-top", (width * .7, .1, .1), (0, -L - .1, 1.08), blk, bevel=.03)
    for x in (-.65, -.2, .2, .65):
        box("bullbar-upright", (.08, .08, .44), (x, -L - .1, .9), blk)
    box("snorkel", (.1, .1, .78), (width / 2 + .07, -.98, 1.44), blk, bevel=.02)
    box("snorkel-head", (.12, .26, .12), (width / 2 + .07, -1.06, 1.86), blk, bevel=.02)
    box("roofrack", (width - .3, .9, .05), (0, .2, 1.98), blk)
    box("lightbar", (width - .5, .12, .1), (0, -.22, 2.04), mat("LightBar", srgb("#ffd23f"), emit=1.4), bevel=.02)
    box("grille", (width * .6, .05, .26), (0, -L - .01, .9), blk, bevel=.02)
    lights(-L - .01, L + .01, 1.0, 1.05, width / 2 - .26, size=(.32, .06, .14))
    wheels(.44, .32, -L + .8, L - .8, width / 2 - .08)
    export("strainger")


# --------------------------------------------------------------- Melbourne tram (E-class style)
def make_tram():
    reset()
    L, width = 6.4, 2.6
    white = mat("TramWhite", srgb("#eef0ec"), rough=0.5)
    green = mat("TramGreen", srgb("#2f8f5b"), rough=0.5)
    blk = DARK()
    nose = [(-L, .5), (-L, 2.1), (-L + .35, 3.0), (L - .35, 3.0), (L, 2.1), (L, .5)]
    prism("body", nose, width, white, bevel=.08)
    prism("skirt", [(-L + .02, .45), (-L + .02, 1.0), (L - .02, 1.0), (L - .02, .45)], width + .04, green, bevel=.03)
    prism("windows", [(-L - .01, 1.55), (-L + .3, 2.6), (L - .3, 2.6), (L + .01, 1.55)], width + .04, GLASS(), bevel=.02)
    prism("roof-band", [(-L + .4, 2.62), (L - .4, 2.62), (L - .4, 2.72), (-L + .4, 2.72)], width + .05, white)
    for y in (-L / 3, L / 3):  # articulation joints
        box("joint", (width + .06, .2, 2.5), (0, y, 1.75), blk)
    for y in (-L + 1.2, 0, L - 1.2):
        box("bogie", (width * .8, 1.2, .4), (0, y, .3), blk, bevel=.05)
    box("roof-pod", (width * .6, 2.0, .3), (0, 0, 3.12), white, bevel=.06)
    # pantograph
    box("panto-arm-1", (.06, .06, 1.3), (0, -.3, 3.7), blk, rot=(.6, 0, 0))
    box("panto-arm-2", (.06, .06, 1.3), (0, .3, 3.7), blk, rot=(-.6, 0, 0))
    box("panto-head", (1.4, .1, .06), (0, 0, 4.2), blk)
    head = mat("HeadLight", srgb("#fff6d0"), emit=2.0)
    for sx in (-1, 1):
        box("tram-light", (.24, .06, .14), (sx * .8, -L - .02, .9), head)
        box("tram-light", (.24, .06, .14), (sx * .8, L + .02, .9), head)
    box("dest-front", (1.3, .05, .22), (0, -L + .3, 2.78), mat("DestSign", srgb("#ffb000"), emit=1.0))
    box("dest-back", (1.3, .05, .22), (0, L - .3, 2.78), mat("DestSign", srgb("#ffb000"), emit=1.0))
    export("tram")


for build in (make_sedan, make_police, make_taxi, make_hatch, make_ute, make_tram):
    build()
