"""Builds the game's custom low-poly vehicles in Blender and exports them as .glb.

Run headless with Blender's Python module:  python make_models.py <out_dir>
(or: blender -b -P tools/make_models.py -- <out_dir>)

Conventions the game relies on: the front of each vehicle points along Blender
-Y (glTF +Z); wheels are separate objects named wheel-* with their origin on the
axle; the paint is a material called "Body" so the game can recolour it.
"""
import sys, math, os
import bpy, bmesh

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith(".py") else "."
os.makedirs(OUT, exist_ok=True)
MATS = {}


# ------------------------------------------------------------------ helpers
def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mat(name, hexcol, emit=0.0, rough=0.5, metal=0.0, alpha=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*srgb(hexcol), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*srgb(hexcol), 1)
        b.inputs["Emission Strength"].default_value = emit
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    MATS[name] = m
    return m


GLASS = lambda: mat("Glass", "#16202c", rough=0.05, metal=0.6, alpha=0.82)
TRIM = lambda: mat("Trim", "#1b1c20", rough=0.6)
PLASTIC = lambda: mat("Plastic", "#2a2b30", rough=0.8)
CHROME = lambda: mat("Chrome", "#e3e6ea", rough=0.12, metal=1.0)
INTERIOR = lambda: mat("Interior", "#25262b", rough=0.9)
HEAD = lambda: mat("HeadLight", "#fff8de", emit=2.5, rough=0.1)
DRL = lambda: mat("DRL", "#e8f4ff", emit=3.0)
TAIL = lambda: mat("TailLight", "#d0121b", emit=1.4, rough=0.2)
INDIC = lambda: mat("Indicator", "#ff9a1a", emit=0.8)
PLATE = lambda: mat("Plate", "#f4f4f2", rough=0.4)
PLATE_TXT = lambda: mat("PlateText", "#1d3c8c", rough=0.4)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()


def active():
    return bpy.context.view_layer.objects.active


def bevel(o, w, seg=2, angle=40):
    m = o.modifiers.new("bevel", "BEVEL")
    m.width = w
    m.segments = seg
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(angle)
    return o


def prism(name, profile, width, material, x=0.0, taper=None):
    """Extrude a side profile [(y, z), ...] across X. taper=(z_from, factor) pulls the
    upper part of the sides inward so cabins lean in like real cars."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    L = [bm.verts.new((x - width / 2, y, z)) for y, z in profile]
    Rv = [bm.verts.new((x + width / 2, y, z)) for y, z in profile]
    bm.faces.new(L[::-1])
    bm.faces.new(Rv)
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((L[i], L[j], Rv[j], Rv[i]))
    if taper:
        z0, f = taper
        zmax = max(z for _, z in profile)
        for v in bm.verts:
            if v.co.z > z0:
                t = (v.co.z - z0) / max(1e-6, zmax - z0)
                v.co.x = x + (v.co.x - x) * (1 - (1 - f) * t)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def box(name, size, loc, material, bev=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = active()
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(material)
    if bev:
        bevel(o, bev, 2, 30)
    return o


def cyl(name, r, depth, loc, material, axis="X", verts=16, rot_extra=(0, 0, 0)):
    rot = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc,
                                        rotation=(rot[0] + rot_extra[0], rot[1] + rot_extra[1], rot[2] + rot_extra[2]))
    o = active()
    o.name = name
    bpy.ops.object.transform_apply(rotation=True)
    o.data.materials.append(material)
    return o


def beam(name, a, b, thick, material, x):
    """A thin bar from point a=(y,z) to b=(y,z) at side x, e.g. a windscreen pillar."""
    dy, dz = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dy, dz)
    ang = math.atan2(dz, dy)
    return box(name, (thick, length, thick), (x, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2), material, rot=(ang, 0, 0))


def text(name, s, size, loc, rot, material, depth=0.01):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = s
    cu.size = size
    cu.extrude = depth
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o = active()
    o.data.materials.clear()
    o.data.materials.append(material)
    o.select_set(False)
    return o


def cut_arches(body, wheels_at, r, width):
    for i, (y, z) in enumerate(wheels_at):
        c = cyl(f"arch-cutter-{i}", r, width + 0.6, (0, y, z), TRIM(), verts=20)
        m = body.modifiers.new(f"arch{i}", "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.object = c
        m.solver = "EXACT"
        c.hide_set(True)
    bpy.context.view_layer.objects.active = body
    for m in list(body.modifiers):
        if m.type == "BOOLEAN":
            bpy.ops.object.modifier_apply(modifier=m.name)
    for o in list(bpy.context.scene.objects):
        if o.name.startswith("arch-cutter"):
            bpy.data.objects.remove(o, do_unlink=True)


def wheel(name, r, w, loc, rim="#c9ccd1", spokes=5):
    parts = []
    t = cyl(name, r, w, loc, mat("Tyre", "#1a1b1e", rough=0.95), verts=24)
    bevel(t, r * 0.12, 2, 30)
    parts.append(t)
    rm = mat("Rim-" + rim, rim, rough=0.25, metal=0.85)
    side = 1 if loc[0] > 0 else -1
    face = loc[0] + side * (w / 2)
    parts.append(cyl(name + "-disc", r * 0.5, w * 0.6, (loc[0], loc[1], loc[2]), mat("Brake", "#5a5d63", rough=0.5, metal=0.6), verts=16))
    parts.append(cyl(name + "-lip", r * 0.66, 0.04, (face - side * 0.02, loc[1], loc[2]), rm, verts=20))
    parts.append(cyl(name + "-hub", r * 0.16, 0.06, (face, loc[1], loc[2]), rm, verts=10))
    for k in range(spokes):
        a = k / spokes * math.tau
        parts.append(box(name + f"-spoke{k}", (0.03, r * 0.11, r * 0.5),
                         (face - side * 0.015, loc[1] + math.sin(a) * r * 0.32, loc[2] + math.cos(a) * r * 0.32), rm, rot=(-a, 0, 0)))
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = t
    for o in parts:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = t
    for o in parts:
        o.select_set(True)
    bpy.ops.object.join()
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    t.name = name
    t.select_set(False)
    return t


def four_wheels(r, w, front_y, rear_y, half, rim="#c9ccd1", spokes=5):
    for side, sx in (("left", -1), ("right", 1)):
        wheel(f"wheel-front-{side}", r, w, (sx * half, front_y, r), rim, spokes)
        wheel(f"wheel-back-{side}", r, w, (sx * half, rear_y, r), rim, spokes)


def plates(front_y, rear_y, zf, zr, txt="1AB 2CD"):
    for y, z, rot in ((front_y, zf, (math.pi / 2, 0, 0)), (rear_y, zr, (math.pi / 2, 0, math.pi))):
        box("plate", (0.52, 0.02, 0.13), (0, y, z), PLATE())
        off = 0.012 if rot[2] else -0.012
        text("plate-text", txt, 0.085, (0, y + off, z), rot, PLATE_TXT(), 0.004)


def export(name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in list(bpy.context.scene.objects):
        if o.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
        # flat-shaded low poly, with smooth shading on rounded parts
        o.select_set(True)
        bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
        o.select_set(False)
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, export_yup=True)
    tris = sum(len(p.vertices) - 2 for o in bpy.context.scene.objects if o.type == "MESH" for p in o.data.polygons)
    print("exported", path, os.path.getsize(path), "bytes", tris, "tris")


# ------------------------------------------------------------------ lofted body shell
# A station is (y, width factor, bottom z, belt z, roof z or None, code for the gap to the next station):
#   'n' painted (bonnet/boot)  'w' windscreen: glass across the top  's' side windows  'p' black B-pillar
def loft(name, stations, hw, paint, tumble=.74):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for y, f, zb, belt, top, _ in stations:
        w = hw * f
        if top is None:
            side = [(w * .93, belt + .02), (w * .8, belt + .045), (w * .45, belt + .06)]
            crown = belt + .065
        else:
            side = [(w * .92, belt + .03), (w * tumble, top - .05), (w * tumble * .66, top - .006)]
            crown = top
        pts = [(w * .9, zb), (w, zb + .16), (w, belt - .1), (w * .975, belt)] + side
        ring = [bm.verts.new((0, y, zb))]
        ring += [bm.verts.new((x, y, z)) for x, z in pts]
        ring.append(bm.verts.new((0, y, crown)))
        ring += [bm.verts.new((-x, y, z)) for x, z in reversed(pts)]
        rings.append(ring)
    n = len(rings[0])
    bm.verts.ensure_lookup_table()
    mats = {"Body": 0, "Glass": 1, "Trim": 2, "Under": 3}
    for i in range(len(rings) - 1):
        code = stations[i][5]
        for j in range(n):
            k = (j + 1) % n
            f = bm.faces.new((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]))
            strip = j if j < 8 else 15 - j
            m = 0
            if strip == 0:
                m = 3
            elif strip == 5:
                m = {"s": 1, "p": 2}.get(code, 0)
            elif strip in (6, 7) and code == "w":
                m = 1
            f.material_index = m
    bm.faces.new(rings[0][::-1]).material_index = 0
    bm.faces.new(rings[-1]).material_index = 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    for m in (paint, GLASS(), TRIM(), mat("Under", "#141416", rough=1)):
        o.data.materials.append(m)
    return o


def body_at(stations, y):
    """Interpolated (width factor, belt) of the shell at y, for placing trim on the surface."""
    for a, b in zip(stations, stations[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return a[1] + (b[1] - a[1]) * t, a[3] + (b[3] - a[3]) * t
    s = stations[0] if y < stations[0][0] else stations[-1]
    return s[1], s[3]


def car(spec):
    """spec: stations, W, paint, wr/ww wheel radius/width, front/rear axle y, doors (seam ys), mirror y, extras."""
    st, W, s = spec["stations"], spec["W"], spec
    hw = W / 2
    paint = mat("Body", s["paint"], rough=0.22, metal=0.45)
    fa, ra, wr = s["front"], s["rear"], s["wr"]
    L0, L1 = st[0][0], st[-1][0]
    b = loft("body", st, hw, paint, s.get("tumble", .74))
    cut_arches(b, [(fa, wr), (ra, wr)], wr + .07, W)
    for y in (fa, ra):  # dark wheel wells so the arches don't show the inside of the shell
        cyl("arch-well", wr + .065, W - .2, (0, y, wr), mat("Under", "#141416", rough=1), verts=20)
    ws = next(x[0] for x in st if x[5] == "w")
    wz = st[[x[0] for x in st].index(ws)][3]
    flo = wz - .35
    box("cabin-floor", (W - .2, (st[-1][0] - st[0][0]) * .7, .05), (0, (L0 + L1) / 2, flo), INTERIOR())
    cab_end = max(x[0] for x in st if x[4] is not None)
    # interior: seats, steering wheel, dash
    for sx in (-1, 1):
        box("seat-f", (.44, .4, .55), (sx * .36, ws + .95, flo + .32), INTERIOR(), bev=.05)
        if cab_end - ws > 1.6:
            box("seat-r", (.5, .38, .5), (sx * .36, ws + 1.75, flo + .3), INTERIOR(), bev=.05)
    box("dash", (W - .3, .3, .16), (0, ws + .3, wz - .02), INTERIOR(), bev=.04)
    bpy.ops.mesh.primitive_torus_add(major_radius=.16, minor_radius=.022, location=(-.36, ws + .55, flo + .64), rotation=(1.1, 0, 0))
    active().data.materials.append(TRIM())
    # side details: door shut lines, handles, mirrors, skirts, arch lips
    for sx in (-1, 1):
        for y in s["doors"]:
            f, belt = body_at(st, y)
            box("seam", (.012, .014, belt - .45), (sx * (hw * f + .002), y, (belt + .32) / 2 + .02), TRIM())
        for y in s["handles"]:
            f, belt = body_at(st, y)
            box("handle", (.03, .15, .035), (sx * (hw * f + .01), y, belt - .14), CHROME(), bev=.01)
        f, belt = body_at(st, s["mirror"])
        box("mirror-arm", (.14, .06, .04), (sx * (hw * f + .04), s["mirror"], belt + .07), TRIM())
        box("mirror", (.07, .14, .11), (sx * (hw * f + .12), s["mirror"] + .02, belt + .1), paint, bev=.025)
        box("mirror-glass", (.01, .1, .07), (sx * (hw * f + .12), s["mirror"] + .095, belt + .1), CHROME())
        box("skirt", (.05, (ra - fa) - 2 * wr - .25, .07), (sx * (hw - .005), (fa + ra) / 2, st[2][2] + .06), PLASTIC(), bev=.015)
        for y in (fa, ra):
            bpy.ops.mesh.primitive_torus_add(major_radius=wr + .085, minor_radius=.025, location=(sx * (hw - .01), y, wr), rotation=(0, math.pi / 2, 0))
            o = active()
            bm = bmesh.new(); bm.from_mesh(o.data)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.x > .012], context="VERTS")  # keep the upper half
            bm.to_mesh(o.data); bm.free()
            o.data.materials.append(PLASTIC())
    # front: headlights wrapping the corners, grille, badge, fogs, splitter
    f0, b0 = body_at(st, L0 + .01)
    hz = s.get("hz", b0 - .1)
    for sx in (-1, 1):
        box("headlight", (.34, .14, .11), (sx * (hw * f0 - .24), L0 + .045, hz), HEAD(), bev=.03, rot=(0, 0, -sx * .2))
        box("headlight-inner", (.12, .02, .07), (sx * (hw * f0 - .2), L0 - .03, hz), CHROME())
        box("drl", (.3, .02, .02), (sx * (hw * f0 - .24), L0 - .03, hz - .08), DRL())
        cyl("foglight", .045, .04, (sx * (hw * f0 - .2), L0 - .005, st[0][2] + .1), HEAD(), axis="Y", verts=12)
        fl, bl = body_at(st, L1 - .01)
        box("taillight", (.36, .14, .1), (sx * (hw * fl - .23), L1 - .045, s.get("tz", bl - .1)), TAIL(), bev=.03, rot=(0, 0, sx * .2))
        box("reverse", (.1, .02, .05), (sx * (hw * fl - .42), L1 + .025, s.get("tz", bl - .1)), mat("Reverse", "#f2f2f2", emit=.3))
        box("reflector", (.12, .02, .04), (sx * (hw * fl - .2), L1 + .01, st[-1][2] + .12), TAIL())
    gw = s.get("grille", .9)
    gh = s.get("grille_h", .12)
    box("grille", (gw, .06, gh), (0, L0 + .005, hz - .02 - gh / 2), TRIM(), bev=.02)
    for k in range(int(gh / .045)):
        box("grille-slat", (gw - .06, .02, .014), (0, L0 - .028, hz - .04 - k * .045), mat("Slat", "#3a3c42", metal=.5, rough=.4))
    box("grille-frame", (gw + .04, .03, .022), (0, L0 - .03, hz - .01), CHROME())
    box("badge", (.12, .02, .06), (0, L0 - .045, hz - .02 - gh / 2), CHROME(), bev=.012)
    if s.get("splitter", True):
        box("splitter", (W * .8, .14, .04), (0, L0 + .06, st[0][2] - .02), PLASTIC(), bev=.01)
    box("diffuser", (W * .55, .12, .06), (0, L1 - .05, st[-1][2] - .02), PLASTIC(), bev=.01)
    for ex in s.get("exhaust", [.45]):
        cyl("exhaust", .045, .2, (ex, L1 - .03, st[-1][2] + .02), CHROME(), axis="Y", verts=12)
    box("cowl", (W * .8, .1, .02), (0, ws + .02, wz + .055), TRIM())
    for x in (-.25, .3):
        box("wiper", (.5, .018, .012), (x, ws + .1, wz + .085), TRIM(), rot=(.3, 0, .1))
    roof_top = max(x[4] or 0 for x in st)
    box("antenna", (.03, .12, .06), (0, cab_end - .2, roof_top - .01), TRIM(), bev=.01)
    plates(L0 - .03, L1 + .03, s.get("fpz", st[0][2] + .06), s.get("pz", st[-1][3] - .32), s.get("plate", "1AB 2CD"))
    four_wheels(wr, s["ww"], fa, ra, hw - s["ww"] / 2 - .015, s.get("rim", "#c9ccd1"), s.get("spokes", 5))
    return paint


def sedan_stations(L=2.35, roof=1.42, belt=.9, nose=.7):
    return [(-L, .85, .38, nose, None, "n"), (-L + .07, .95, .3, nose + .06, None, "n"), (-L + .3, 1, .26, nose + .12, None, "n"),
            (-1.5, 1, .26, belt - .03, None, "n"), (-.95, 1, .26, belt, None, "w"), (-.3, 1, .26, belt + .02, roof, "s"),
            (.12, 1, .26, belt + .03, roof + .01, "p"), (.24, 1, .26, belt + .03, roof + .01, "s"), (.8, 1, .26, belt + .04, roof - .01, "w"),
            (1.45, 1, .26, belt + .05, None, "n"), (L - .3, .99, .28, belt + .04, None, "n"), (L - .08, .95, .32, belt, None, "n"),
            (L, .86, .4, belt - .08, None, "n")]


SEDAN = dict(stations=sedan_stations(), W=1.84, paint="#b71c1c", wr=.34, ww=.24, front=-1.5, rear=1.45,
             doors=(-.9, .18, .95), handles=(-.2, .55), mirror=-.82)


def make_sedan():
    reset()
    car(SEDAN)
    export("comodo")


def side_text(s, size, y, z, hwx, material):
    for sx in (-1, 1):
        text("side-" + s, s, size, (sx * hwx, y, z), (math.pi / 2, 0, sx * math.pi / 2), material, .006)


def make_police():
    reset()
    car(dict(SEDAN, paint="#f6f7f9", rim="#9aa0a8", plate="VICPOL"))
    blue, yel = mat("Livery-Blue", "#173a8f", rough=.3), mat("Livery-Yellow", "#ffcc22", rough=.3)
    n, y0, y1 = 14, -2.1, 2.1
    for sx in (-1, 1):  # two-row Battenburg check along each side
        for i in range(n):
            y = y0 + (i + .5) * (y1 - y0) / n
            f, belt = body_at(SEDAN["stations"], y)
            for row in (0, 1):
                c = blue if (i + row) % 2 == 0 else yel
                box("check", (.012, (y1 - y0) / n, .1), (sx * (.92 * f + .004), y, .5 + row * .1), c)
    side_text("POLICE", .19, -.15, .8, .925, blue)
    for sx in (-1, 1):
        box("bonnet-check", (.25, .25, .006), (sx * .35, -1.75, .845), blue)
    box("pushbar", (1.15, .08, .08), (0, -2.47, .62), TRIM(), bev=.02)
    for x in (-.45, .45):
        box("pushbar-post", (.06, .1, .4), (x, -2.43, .45), TRIM())
    box("spotlight", (.08, .16, .08), (-.9, -.7, 1.08), CHROME(), bev=.02)
    export("police")


def make_taxi():
    reset()
    car(dict(SEDAN, paint="#f5c518", plate="T 1234"))
    box("sign", (.62, .22, .2), (0, .3, 1.55), mat("TaxiSign", "#fff4c2", emit=1.0), bev=.04)
    for y, r in ((.18, 0), (.42, math.pi)):
        text("taxi-text", "TAXI", .13, (0, y, 1.56), (math.pi / 2, 0, r), TRIM(), .004)
    side_text("13 CABS", .12, .25, .62, .925, TRIM())
    for sx in (-1, 1):
        box("taxi-stripe", (.01, 3.6, .05), (sx * .924, 0, .72), TRIM())
    export("taxi")


def make_hatch():
    reset()
    L = 2.0
    st = [(-L, .85, .36, .66, None, "n"), (-L + .07, .95, .28, .72, None, "n"), (-L + .28, 1, .24, .78, None, "n"),
          (-1.25, 1, .24, .84, None, "n"), (-.85, 1, .24, .86, None, "w"), (-.2, 1, .24, .88, 1.44, "s"),
          (.15, 1, .24, .9, 1.45, "p"), (.27, 1, .24, .9, 1.45, "s"), (1.45, 1, .24, .92, 1.42, "w"),
          (1.9, .98, .26, .92, 1.25, "n"), (L, .9, .34, .86, None, "n")]
    car(dict(stations=st, W=1.74, paint="#1f6fb2", wr=.32, ww=.22, front=-1.3, rear=1.3, doors=(-.8, .2, 1.0),
             handles=(-.15, .65), mirror=-.72, exhaust=[-.45], grille=.7))
    box("spoiler", (1.2, .22, .05), (0, 1.86, 1.43), mat("Body", "#1f6fb2"), bev=.02)
    export("barrina")


def make_clubbie():
    reset()
    L = 2.45
    st = [(-L, .86, .32, .64, None, "n"), (-L + .07, .96, .24, .7, None, "n"), (-L + .35, 1, .2, .76, None, "n"),
          (-1.0, 1, .2, .83, None, "n"), (-.75, 1, .2, .84, None, "w"), (-.05, 1, .2, .85, 1.3, "s"),
          (.6, 1, .2, .86, 1.29, "w"), (1.55, 1, .2, .88, None, "n"), (L - .25, 1, .22, .9, None, "n"),
          (L - .06, .96, .26, .86, None, "n"), (L, .9, .34, .8, None, "n")]
    car(dict(stations=st, W=1.92, paint="#d32f2f", wr=.36, ww=.3, front=-1.55, rear=1.5, doors=(-.7, .65), handles=(.35,),
             mirror=-.62, rim="#2b2d33", spokes=10, exhaust=[-.62, -.48, .48, .62], tumble=.7, plate="CLUBBY"))
    white = mat("Stripe", "#f2f2f2", rough=.3)
    for x in (-.17, .17):
        box("stripe-bonnet", (.13, 1.7, .008), (x, -1.55, .855), white)
        box("stripe-roof", (.13, .7, .008), (x, .27, 1.305), white)
        box("stripe-boot", (.13, .75, .008), (x, 2.0, .915), white)
    box("scoop", (.5, .6, .07), (0, -1.45, .87), TRIM(), bev=.03)
    for x in (-.7, .7):
        box("wing-post", (.06, .1, .2), (x, 2.2, 1.0), TRIM())
    box("wing", (1.8, .32, .04), (0, 2.25, 1.11), mat("Body", "#d32f2f"), bev=.015)
    for sx in (-1, 1):
        box("side-vent", (.02, .3, .1), (sx * .965, -1.0, .62), TRIM())
    export("clubbie")


def make_suv():
    reset()
    L = 2.4
    st = [(-L, .86, .5, .92, None, "n"), (-L + .08, .96, .4, 1.0, None, "n"), (-L + .3, 1, .36, 1.06, None, "n"),
          (-1.4, 1, .36, 1.1, None, "n"), (-.95, 1, .36, 1.12, None, "w"), (-.35, 1, .36, 1.14, 1.82, "s"),
          (.15, 1, .36, 1.15, 1.83, "p"), (.28, 1, .36, 1.15, 1.83, "s"), (2.1, 1, .36, 1.16, 1.8, "w"),
          (L - .03, .97, .38, 1.14, 1.55, "n"), (L, .92, .46, 1.08, None, "n")]
    car(dict(stations=st, W=1.94, paint="#4a5a6a", wr=.41, ww=.28, front=-1.5, rear=1.5, doors=(-.9, .21, 1.05),
             handles=(-.25, .65), mirror=-.8, exhaust=[.5], tumble=.8, grille=1.0, plate="TERR 01"))
    for sx in (-1, 1):
        box("roof-rail", (.05, 2.0, .05), (sx * .6, .65, 1.86), CHROME(), bev=.015)
        for y in (-.3, 1.6):
            box("rail-foot", (.06, .1, .06), (sx * .6, y, 1.82), PLASTIC())
        for y in (-1.5, 1.5):
            box("cladding", (.08, 1.1, .2), (sx * .985, y, .86), PLASTIC(), bev=.04)
    box("skid-plate", (1.1, .3, .06), (0, -2.42, .42), CHROME(), bev=.02)
    bevel(cyl("spare", .36, .22, (0, 2.5, 1.1), mat("Tyre", "#1a1b1e", rough=.95), axis="Y", verts=24), .05, 2)
    cyl("spare-cover", .25, .24, (0, 2.5, 1.1), mat("Body", "#4a5a6a"), axis="Y", verts=20)
    export("territorial")


# ------------------------------------------------------------------ dual-cab 4x4 ute
def make_ute():
    reset()
    L, W = 2.65, 1.92
    hw = W / 2
    st = [(-L, .86, .52, .98, None, "n"), (-L + .08, .96, .44, 1.06, None, "n"), (-L + .3, 1, .42, 1.12, None, "n"),
          (-1.6, 1, .42, 1.17, None, "n"), (-1.0, 1, .42, 1.18, None, "w"), (-.42, 1, .42, 1.18, 1.88, "s"),
          (.15, 1, .42, 1.18, 1.89, "p"), (.27, 1, .42, 1.18, 1.89, "s"), (.85, 1, .42, 1.18, 1.86, "w"),
          (.9, 1, .42, 1.16, None, "n"), (L - .05, 1, .42, 1.16, None, "n"), (L, .97, .46, 1.14, None, "n")]
    paint = car(dict(stations=st, W=W, paint="#e8e8e8", wr=.44, ww=.34, front=-1.75, rear=1.6, doors=(-.95, .21, .88),
                     handles=(-.3, .6), mirror=-.85, rim="#3a3c42", spokes=6, exhaust=[.6], tumble=.84, grille=1.1,
                     plate="4WD 4AU", hz=.98, grille_h=.26, splitter=False, fpz=.62))
    blk, plas = TRIM(), PLASTIC()
    belt = 1.16
    # tub: walls, liner, tailgate
    tl = L - .95
    box("tub-liner", (W - .22, tl - .1, .05), (0, (L + .95) / 2, belt + .07), plas)
    for sx in (-1, 1):
        box("tub-side", (.07, tl, .36), (sx * (hw - .035), (L + .95) / 2, belt + .24), paint, bev=.015)
        box("tub-rail", (.1, tl, .03), (sx * (hw - .05), (L + .95) / 2, belt + .43), blk)
        box("sportsbar-post", (.07, .07, .6), (sx * (hw - .14), 1.05, belt + .5), blk)
        for y in (-1.75, 1.6):
            box("flare", (.13, 1.12, .18), (sx * (hw + .03), y, belt - .1), plas, bev=.045)
        box("side-step", (.16, 1.85, .05), (sx * (hw + .02), -.08, .5), plas, bev=.01)
        box("mudflap", (.25, .02, .3), (sx * (hw - .2), 1.6 + .44 + .14, .5), plas)
        cyl("bullbar-light", .08, .07, (sx * .42, -L - .27, belt + .05), HEAD(), axis="Y", verts=14)
    box("tailgate", (W, .08, .4), (0, L - .02, belt + .22), paint, bev=.015)
    text("tailgate-badge", "STRAINGER", .14, (0, L + .025, belt + .24), (math.pi / 2, 0, math.pi), CHROME(), .006)
    box("sportsbar-top", (W - .24, .08, .07), (0, 1.05, belt + .8), blk, bev=.02)
    box("bullbar-low", (W * .98, .12, .12), (0, -L - .15, .78), blk, bev=.03)
    box("bullbar-top", (W * .72, .1, .1), (0, -L - .2, belt + .05), blk, bev=.03)
    for x in (-.6, -.2, .2, .6):
        box("bullbar-post", (.07, .07, .45), (x, -L - .17, belt - .2), blk)
    box("snorkel", (.11, .11, .85), (hw + .08, -1.05, belt + .38), blk, bev=.02)
    box("snorkel-head", (.13, .28, .13), (hw + .08, -1.13, belt + .82), blk, bev=.03)
    box("roof-rack", (W - .3, .95, .05), (0, .22, 1.98), blk)
    for x in (-.6, .6):
        box("rack-foot", (.06, .9, .06), (x, .22, 1.93), blk)
    box("light-bar", (W - .5, .12, .1), (0, -.26, 2.04), mat("LightBar", "#ffe38a", emit=1.8), bev=.02)
    box("tow-hitch", (.08, .25, .08), (0, L + .12, .55), CHROME())
    export("strainger")


# ------------------------------------------------------------------ Melbourne tram (E-class style)
def make_tram():
    reset()
    L, W = 6.4, 2.6
    white = mat("TramWhite", "#f1f2ee", rough=0.4)
    green = mat("TramGreen", "#2e8b57", rough=0.4)
    teal = mat("TramTeal", "#1aa39a", rough=0.4)
    blk = TRIM()
    bevel(prism("body", [(-L, .5), (-L - .05, 1.9), (-L + .4, 3.0), (L - .4, 3.0), (L + .05, 1.9), (L, .5)], W, white, taper=(2.4, .92)), .06, 2)
    prism("skirt", [(-L + .02, .45), (-L + .02, 1.0), (L - .02, 1.0), (L - .02, .45)], W + .04, green)
    prism("stripe", [(-L, 1.0), (-L, 1.12), (L, 1.12), (L, 1.0)], W + .045, teal)
    prism("windows", [(-L - .06, 1.5), (-L + .32, 2.62), (L - .32, 2.62), (L + .06, 1.5)], W + .04, GLASS())
    for k in range(-14, 15):  # window mullions
        y = k * (2 * L - 1.0) / 28
        if abs(abs(y) - L / 3) < .3:
            continue
        box("mullion", (W + .07, .06, 1.1), (0, y, 2.05), white)
    for y in (-L / 3, L / 3):
        box("joint", (W + .06, .22, 2.5), (0, y, 1.75), blk)
    for y in (-L + 1.8, -1.3, 1.3, L - 1.8):  # doors
        for sx in (-1, 1):
            box("door", (.02, .9, 1.6), (sx * (W / 2 + .03), y, 1.3), mat("Door", "#3d4a52", rough=.3))
            box("door-glass", (.02, .7, .9), (sx * (W / 2 + .045), y, 1.7), GLASS())
    for y in (-L + 1.2, 0, L - 1.2):
        box("bogie", (W * .8, 1.3, .4), (0, y, .3), blk, bev=.05)
    box("roof-pod", (W * .6, 2.2, .3), (0, 0, 3.12), white, bev=.08)
    for y in (-L + 1.2, L - 1.2):
        box("ac-unit", (W * .55, 1.0, .22), (0, y, 3.1), white, bev=.06)
    box("panto-base", (.8, .4, .1), (0, 0, 3.3), blk)
    box("panto-arm-1", (.06, .06, 1.3), (0, -.3, 3.85), blk, rot=(.6, 0, 0))
    box("panto-arm-2", (.06, .06, 1.3), (0, .3, 3.85), blk, rot=(-.6, 0, 0))
    box("panto-head", (1.5, .1, .06), (0, 0, 4.4), blk)
    dest = mat("DestSign", "#ffb000", emit=1.4)
    for y, r in ((-L + .25, 0), (L - .25, math.pi)):
        box("dest", (1.4, .05, .26), (0, y, 2.8), blk)
        text("route", "96 EAST BRUNSWICK", .13, (0, y + (.03 if r else -.03), 2.8), (math.pi / 2, 0, r), dest, .005)
        for sx in (-1, 1):
            box("tram-light", (.26, .06, .14), (sx * .85, y + (.15 if r else -.15), .95), HEAD(), bev=.02)
    export("tram")


if __name__ == "__main__":
    for build in (make_sedan, make_police, make_taxi, make_hatch, make_clubbie, make_suv, make_ute, make_tram):
        build()
