"""Builds the game's Melbourne landmarks in Blender and exports them as .glb.

Run headless with Blender's Python module:  python make_landmarks.py <out_dir>

Units are game pixels (a car is about 45 long), so each model drops straight onto its site.
The length of each building runs along Blender X, its front faces -Y (glTF +Z), and Z is up.
"""
import sys, os, math
import bpy, bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_models import mat, box, cyl, reset, export, bevel, active   # noqa: E402
from make_models import prism as _prism   # noqa: E402


def prism(*a, **k):
    o = _prism(*a, **k)
    bpy.context.view_layer.objects.active = o
    return o

TAU = math.tau

# ------------------------------------------------------------------ palette
OCHRE = lambda: mat("Ochre", "#d39a3c", rough=.8)
CREAM = lambda: mat("Cream", "#efe2bd", rough=.8)
COPPER = lambda: mat("Copper", "#5f9c84", rough=.5, metal=.3)
STONE = lambda: mat("Stone", "#cfc4ad", rough=.9)
SAND = lambda: mat("Sandstone", "#b9a98c", rough=.9)
SLATE = lambda: mat("Slate", "#4b5058", rough=.7)
WHITE = lambda: mat("White", "#f2f3f4", rough=.5)
STEEL = lambda: mat("Steel", "#c2c6cc", rough=.4, metal=.6)
CONCRETE = lambda: mat("Concrete", "#b8bcc2", rough=.9)
DARKWIN = lambda: mat("Windows", "#1e2a36", rough=.15, metal=.5)
GLASSB = lambda: mat("BlueGlass", "#2c4c74", rough=.1, metal=.6)
GOLD = lambda: mat("Gold", "#e3b341", emit=.4, rough=.25, metal=.9)
RED = lambda: mat("Red", "#b8261e", rough=.6)
CLOCK = lambda: mat("ClockFace", "#fbf8ee", emit=.6, rough=.4)
BLACK = lambda: mat("Black", "#141414", rough=.7)
LAMP = lambda: mat("Lamp", "#fffbe0", emit=3.0)


def cone(name, r1, r2, h, loc, material, verts=16):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=h, location=(loc[0], loc[1], loc[2] + h / 2))
    o = active()
    o.name = name
    o.data.materials.append(material)
    return o


def dome(name, r, loc, material, squash=1.0, segs=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, radius=r, location=loc)
    o = active()
    o.name = name
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context="VERTS")
    for v in bm.verts:
        v.co.z *= squash
    bm.to_mesh(o.data)
    bm.free()
    o.data.materials.append(material)
    return o


def zcyl(name, r, h, loc, material, verts=16):
    """Vertical cylinder standing on loc."""
    return cyl(name, r, h, (loc[0], loc[1], loc[2] + h / 2), material, axis="Z", verts=verts)


def strut(name, a, b, t, material):
    """A thin bar between two 3D points."""
    dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    bpy.ops.mesh.primitive_cube_add(size=1, location=((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2))
    o = active()
    o.name = name
    o.scale = (t, t, L)
    o.rotation_mode = "QUATERNION"
    from mathutils import Vector
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((dx, dy, dz)))
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    o.data.materials.append(material)
    return o


def arch_window(x, y, z, w, h, material, depth=2):
    box("win", (w, depth, h - w / 2), (x, y, z + (h - w / 2) / 2), material)
    cyl("win-top", w / 2, depth, (x, y, z + h - w / 2), material, axis="Y", verts=12)


def join_all(name):
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    active().name = name


def done(name):
    join_all(name)
    export(name)


# ------------------------------------------------------------------ Flinders Street Station (210 x 64)
def make_flinders():
    reset()
    L, D, Hb = 200, 54, 34
    box("hall", (L, D, Hb), (0, 0, Hb / 2), OCHRE())
    for z in (12, Hb - 1):
        box("band", (L + 2, D + 2, 2.4), (0, 0, z), CREAM())
    box("parapet", (L + 1, D + 1, 3), (0, 0, Hb + 1.5), CREAM())
    for x in range(-92, 93, 11):
        if -34 < x - 40 < 34:
            continue
        arch_window(x, -D / 2 - .6, 3, 6, 9, DARKWIN())
        arch_window(x, -D / 2 - .6, 17, 5, 11, DARKWIN())
        arch_window(x, D / 2 + .6, 17, 5, 11, DARKWIN())
    for x in range(-96, 97, 22):
        box("pilaster", (2.2, 1.2, Hb - 2), (x, -D / 2 - .7, Hb / 2), CREAM())
    # the grand entrance under the dome, with "the clocks" above the steps
    ex = 40
    box("porch", (54, 8, 30), (ex, -D / 2 - 3, 15), CREAM())
    arch_window(ex, -D / 2 - 7.2, 0, 22, 24, DARKWIN(), depth=1.5)
    for k in range(-3, 4):
        box("clocks", (4.5, 1, 4.5), (ex + k * 6, -D / 2 - 7.6, 26), CLOCK())
    zcyl("drum", 21, 12, (ex, 0, Hb), CREAM(), verts=16)
    for k in range(16):
        a = k / 16 * TAU
        box("drum-win", (2, 2, 7), (ex + math.cos(a) * 21, math.sin(a) * 21, Hb + 6), DARKWIN())
    dome("dome", 21, (ex, 0, Hb + 12), COPPER(), squash=1.1)
    zcyl("lantern", 4, 8, (ex, 0, Hb + 34), CREAM(), verts=8)
    dome("lantern-cap", 4.4, (ex, 0, Hb + 42), COPPER())
    # the clock tower at the other end
    tx = -78
    box("tower", (20, 20, 86), (tx, 0, 43), OCHRE())
    for z in (34, 60, 84):
        box("tower-band", (22, 22, 2.4), (tx, 0, z), CREAM())
    for sx, sy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        x, y = tx + sx * 10.6, sy * 10.6
        cyl("clock", 6.5, 1, (x, y, 72), CLOCK(), axis="X" if sx else "Y", verts=20)
        hx, hy = x + sx * .8, y + sy * .8
        box("hour-hand", (.8 if not sx else .6, .6 if not sx else .8, 4.6), (hx, hy, 73.8), BLACK())
        box("minute-hand", (4 if not sx else .6, .6 if not sx else 4, .8), (hx + (2 if not sx else 0), hy + (2 if sx else 0), 72), BLACK())
        if not sx:
            arch_window(x, y + sy * .4, 40, 6, 14, DARKWIN(), depth=1.2)
    cone("spire-roof", 13, 2, 24, (tx, 0, 86), COPPER(), verts=4)
    zcyl("flagpole", .7, 22, (tx, 0, 108), STEEL(), verts=6)
    for x in (-L / 2 + 6, L / 2 - 6):
        for y in (-D / 2 + 6, D / 2 - 6):
            zcyl("turret", 5, 10, (x, y, Hb), OCHRE(), verts=8)
            dome("turret-dome", 5.4, (x, y, Hb + 10), COPPER())
    done("flinders")


# ------------------------------------------------------------------ Arts Centre spire (70 x 70)
def make_arts():
    reset()
    zcyl("base", 32, 28, (0, 0, 0), STONE(), verts=8)
    zcyl("base-top", 34, 3, (0, 0, 28), WHITE(), verts=8)
    for k in range(8):
        a = k / 8 * TAU + TAU / 16
        box("base-win", (14, 2, 14), (math.cos(a) * 31.5, math.sin(a) * 31.5, 14), DARKWIN(), rot=(0, 0, a + math.pi / 2))
    # the "tutu": a flared skirt of white mesh at the foot of the spire
    cone("tutu", 28, 12, 26, (0, 0, 31), WHITE(), verts=16)
    cone("tutu-inner", 24, 10, 26, (0, 0, 31.5), STEEL(), verts=16)
    # lattice spire: eight legs tapering to the tip, with rings and cross bracing
    top, z0, r0 = 300, 56, 13
    legs = []
    for k in range(8):
        a = k / 8 * TAU
        legs.append(((math.cos(a) * r0, math.sin(a) * r0, z0), (math.cos(a) * 1.5, math.sin(a) * 1.5, top)))
        strut("leg", legs[-1][0], legs[-1][1], 2.2, WHITE())
    for i in range(1, 14):
        t = i / 14
        z = z0 + (top - z0) * t
        r = r0 + (1.5 - r0) * t
        bpy.ops.mesh.primitive_torus_add(major_segments=8, minor_segments=4, major_radius=r, minor_radius=.7, location=(0, 0, z))
        active().data.materials.append(WHITE())
        if i % 2:
            for k in range(8):
                a, b = k / 8 * TAU, (k + 1) / 8 * TAU
                rr = r0 + (1.5 - r0) * ((i - 1) / 14)
                zz = z0 + (top - z0) * ((i - 1) / 14)
                strut("brace", (math.cos(a) * rr, math.sin(a) * rr, zz), (math.cos(b) * r, math.sin(b) * r, z), .8, STEEL())
    zcyl("needle", 1.2, 80, (0, 0, top), WHITE(), verts=8)
    zcyl("beacon", 1.8, 3, (0, 0, top + 70), mat("Beacon", "#ff3a2a", emit=3), verts=8)
    done("arts")


# ------------------------------------------------------------------ MCG (300 x 252 oval)
def make_mcg():
    reset()
    RX, RY, N = 150, 126, 72
    gates = [0, N // 4, N // 2, 3 * N // 4]
    me = bpy.data.meshes.new("stands")
    bm = bmesh.new()
    seat, conc, roofm = mat("Seats", "#4f6d93", rough=.8), CONCRETE(), mat("Roof", "#e8e9ea", rough=.5, metal=.2)
    mats = [seat, conc, roofm]
    # profile across the stand: (radius factor, height): pitch edge, lower tier, walkway, upper tier, back wall, roof
    prof = [(.74, 3), (.84, 26), (.86, 26), (.98, 62), (1.0, 64), (1.0, 0)]
    rings = []
    for k in range(N):
        a = k / N * TAU
        rings.append([bm.verts.new((math.cos(a) * RX * f, math.sin(a) * RY * f, z)) for f, z in prof])
    for k in range(N):
        if any((k - g) % N in (0, N - 1) for g in gates):
            continue      # gate gaps
        A, B = rings[k], rings[(k + 1) % N]
        for i in range(len(prof) - 1):
            f = bm.faces.new((A[i], B[i], B[i + 1], A[i + 1]))
            f.material_index = 0 if i in (0, 2) else 1
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("stands", me)
    bpy.context.collection.objects.link(o)
    for m in mats:
        o.data.materials.append(m)
    # cantilever roof ring over the upper tier
    me = bpy.data.meshes.new("roof")
    bm = bmesh.new()
    rr = []
    for k in range(N):
        a = k / N * TAU
        rr.append((bm.verts.new((math.cos(a) * RX * .86, math.sin(a) * RY * .86, 80)), bm.verts.new((math.cos(a) * RX * 1.02, math.sin(a) * RY * 1.02, 72))))
    for k in range(N):
        a, b = rr[k], rr[(k + 1) % N]
        bm.faces.new((a[0], b[0], b[1], a[1]))
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("roof", me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(roofm)
    for k in range(0, N, 6):
        a = k / N * TAU
        strut("roof-post", (math.cos(a) * RX * 1.0, math.sin(a) * RY * 1.0, 60), (math.cos(a) * RX * 1.01, math.sin(a) * RY * 1.01, 74), 2, conc)
    # the six light towers, leaning in over the ground
    for i in range(6):
        a = i / 6 * TAU + .3
        bx, by = math.cos(a) * RX * 1.08, math.sin(a) * RY * 1.08
        tx, ty = math.cos(a) * RX * .98, math.sin(a) * RY * .98
        strut("mast", (bx, by, 0), (tx, ty, 220), 4, STEEL())
        box("lamps", (34, 4, 20), (tx, ty, 226), LAMP(), rot=(math.radians(-60), 0, a + math.pi / 2))
        box("lamp-frame", (36, 2, 22), (tx + math.cos(a) * 2, ty + math.sin(a) * 2, 226), STEEL(), rot=(math.radians(-60), 0, a + math.pi / 2))
    # scoreboards at each end
    for s in (-1, 1):
        box("scoreboard", (6, 46, 22), (s * RX * .99, 0, 82), BLACK())
        box("screen", (1, 40, 16), (s * RX * .97, 0, 82), mat("Screen", "#3a7bd5", emit=1.2))
    done("mcg")


# ------------------------------------------------------------------ West Gate Bridge pylon (deck at height 72, runs along X)
def make_westgate():
    reset()
    Hd = 72
    for s in (-1, 1):   # twin legs in the median, joined above and below the deck
        strut("leg", (s * 4, -6, 0), (s * 3, -3, Hd + 150), 7, CONCRETE())
        strut("leg", (s * 4, 6, 0), (s * 3, 3, Hd + 150), 7, CONCRETE())
    box("pier-cap", (24, 26, 8), (0, 0, Hd - 12), CONCRETE())
    box("crossbeam", (12, 14, 6), (0, 0, Hd + 120), CONCRETE())
    box("top", (10, 12, 8), (0, 0, Hd + 150), CONCRETE())
    # cables fanning down to the middle of the deck both ways
    for s in (-1, 1):
        for i in range(6):
            strut("cable", (0, 0, Hd + 146 - i * 5), (s * (40 + i * 34), 0, Hd + 6), .9, WHITE())
    done("westgate")


# ------------------------------------------------------------------ Bolte Bridge: two tall square pylons beside the deck
def make_bolte():
    reset()
    for s in (-1, 1):
        y = s * 74
        cone("pylon", 10, 6, 300, (0, y, 0), mat("BoltePylon", "#cfd3d8", rough=.6, metal=.2), verts=4).rotation_euler = (0, 0, math.pi / 4)
        cone("pylon-top", 6.2, 4.5, 30, (0, y, 300), SLATE(), verts=4).rotation_euler = (0, 0, math.pi / 4)
    done("bolte")


# ------------------------------------------------------------------ Eureka Tower (60 x 60)
def make_eureka():
    reset()
    H = 820
    box("shaft", (50, 50, H), (0, 0, H / 2), GLASSB())
    for z in range(16, H - 120, 16):
        box("floor", (50.6, 50.6, 1.2), (0, 0, z), mat("Mullion", "#5a6f86", rough=.4, metal=.5))
    box("gold-crown", (50.8, 50.8, 110), (0, 0, H - 55), GOLD())
    for z in range(H - 104, H, 12):
        box("gold-floor", (51.2, 51.2, 1), (0, 0, z), mat("GoldLine", "#b98e2e", metal=.8, rough=.3))
    box("red-stripe", (3, 51.6, H - 140), (14, 0, (H - 140) / 2 + 10), RED())
    box("roof", (36, 36, 12), (0, 0, H + 6), STEEL())
    zcyl("mast", 1.6, 70, (0, 0, H + 12), STEEL(), verts=8)
    box("podium", (60, 60, 18), (0, 0, 9), mat("Podium", "#3b4656", rough=.6))
    done("eureka")


# ------------------------------------------------------------------ Shrine of Remembrance (100 x 100)
def make_shrine():
    reset()
    for i, (w, h) in enumerate(((100, 6), (90, 6), (80, 6))):
        box("step", (w, w, h), (0, 0, i * 6 + h / 2), STONE())
    z = 18
    box("hall", (60, 60, 40), (0, 0, z + 20), STONE())
    for sy in (-1, 1):   # porticos front and back: eight columns under a pediment
        for i in range(8):
            zcyl("column", 2.6, 30, (-24 + i * 6.85, sy * 36, z), mat("Column", "#e2d9c4", rough=.8), verts=10)
        box("entablature", (54, 10, 5), (0, sy * 36, z + 32.5), STONE())
        prism("pediment", [(-27, 0), (27, 0), (0, 9)], 10, STONE())
        o = active()
        o.rotation_euler = (0, 0, math.pi / 2)
        o.location = (0, sy * 36, z + 35)
    for sx in (-1, 1):
        for i in range(4):
            zcyl("side-col", 2.2, 30, (sx * 31, -15 + i * 10, z), mat("Column", "#e2d9c4", rough=.8), verts=8)
    # the stepped pyramid roof, after the Mausoleum of Halicarnassus
    for i in range(6):
        w = 54 - i * 7
        box("ziggurat", (w, w, 5), (0, 0, z + 40 + i * 5 + 2.5), STONE())
    zcyl("finial", 3, 10, (0, 0, z + 70), mat("Bronze", "#8a6a3a", metal=.6, rough=.4), verts=8)
    done("shrine")


# ------------------------------------------------------------------ Federation Square (100 x 70): fractured shards
def make_fedsq():
    reset()
    tri = [mat("Sandstone2", "#c8b48a", rough=.9), mat("Zinc", "#7f8c95", rough=.5, metal=.4), mat("Glass2", "#5d7f95", rough=.1, metal=.5), mat("Sand3", "#b39f75", rough=.9)]
    shards = [(-30, -14, 30, 22, 26, .2, 0), (-4, 10, 34, 26, 38, -.3, 1), (24, -12, 26, 30, 30, .45, 3), (34, 18, 22, 18, 46, -.1, 2),
              (-34, 18, 20, 16, 20, .7, 1), (6, -20, 22, 14, 16, -.6, 0)]
    for x, y, w, d, h, rz, m in shards:
        prism("shard", [(-w / 2, 0), (w / 2, 0), (w / 2, h * .8), (w * .1, h), (-w / 2, h * .9)], d, tri[m])
        o = active()
        o.rotation_euler = (0, 0, rz + math.pi / 2)
        o.location = (x, y, 0)
    # the glass atrium
    prism("atrium", [(-20, 0), (20, 0), (16, 30), (-14, 34)], 12, mat("AtriumGlass", "#9fc3d6", rough=.05, metal=.3))
    o = active()
    o.rotation_euler = (0, 0, math.pi / 2)
    o.location = (10, 0, 0)
    box("plaza", (100, 70, 1.5), (0, 0, .75), mat("Paving", "#b8a07a", rough=.95))
    done("fedsq")


# ------------------------------------------------------------------ Melbourne Star observation wheel (wheel in the X-Z plane)
def make_star():
    reset()
    R, hub = 82, 100
    for y in (-5, 5):
        bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=6, major_radius=R, minor_radius=1.8, location=(0, y, hub), rotation=(math.pi / 2, 0, 0))
        active().data.materials.append(WHITE())
    cyl("hub", 7, 16, (0, 0, hub), STEEL(), axis="Y", verts=16)
    n = 21
    for i in range(n):
        a = i / n * TAU
        x, z = math.cos(a) * R, hub + math.sin(a) * R
        for y in (-5, 5):
            strut("spoke", (0, y, hub), (x, y, z), .9, WHITE())
        strut("rung", (x, -5, z), (x, 5, z), 1, WHITE())
        c = ["#e05050", "#5aa0ff", "#ffcc33", "#7ed957"][i % 4]
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=5.5, location=(x, 0, z - 6))
        o = active()
        o.scale = (1, 1.3, .9)
        o.data.materials.append(mat("Gondola" + c, c, rough=.3, metal=.2))
    for sx in (-1, 1):   # the A-frame legs
        for y in (-22, 22):
            strut("leg", (sx * 34, y, 0), (sx * 2, y * .25, hub), 4.5, STEEL())
    box("base", (90, 50, 8), (0, 0, 4), CONCRETE())
    done("star")


# ------------------------------------------------------------------ St Paul's Cathedral (70 x 60)
def make_stpauls():
    reset()
    box("nave", (66, 24, 34), (0, 0, 17), SAND())
    prism("nave-roof", [(-12, 0), (12, 0), (0, 12)], 66, SLATE())
    active().location = (0, 0, 34)
    box("transept", (22, 52, 34), (6, 0, 17), SAND())
    prism("tr-roof", [(-11, 0), (11, 0), (0, 11)], 52, SLATE())
    o = active()
    o.rotation_euler = (0, 0, math.pi / 2)
    o.location = (6, 0, 34)
    for x in range(-28, 30, 8):
        arch_window(x, -12.6, 10, 4, 16, mat("Stained", "#2b3f6b", rough=.2, metal=.3), depth=1)
    # central spire and the two western spires
    for x, y, h, r in ((6, 0, 40, 9), (-30, -9, 34, 6), (-30, 9, 34, 6)):
        box("tower", (2 * r, 2 * r, h), (x, y, 34 + h / 2), SAND())
        cone("spire", r * 1.05, .5, h * 1.6 if r > 7 else h * 1.4, (x, y, 34 + h), mat("SpireStone", "#8f8473", rough=.9), verts=8)
        for sx in (-1, 1):
            for sy in (-1, 1):
                cone("pinnacle", 1.4, .2, 9, (x + sx * r, y + sy * r, 34 + h), SAND(), verts=4)
    done("stpauls")


# ------------------------------------------------------------------ Royal Exhibition Building (150 x 90)
def make_reb():
    reset()
    box("hall", (140, 46, 34), (0, 0, 17), mat("Brick", "#c9b08a", rough=.9))
    box("transept", (46, 86, 34), (0, 0, 17), mat("Brick", "#c9b08a", rough=.9))
    for w, d in ((140, 46), (46, 86)):
        box("cornice", (w + 2, d + 2, 3), (0, 0, 34), CREAM())
    prism("roof", [(-23, 0), (23, 0), (0, 10)], 140, mat("Slate2", "#7b7f86", rough=.6))
    active().location = (0, 0, 35)
    prism("roof", [(-23, 0), (23, 0), (0, 10)], 86, mat("Slate2", "#7b7f86", rough=.6))
    o = active()
    o.rotation_euler = (0, 0, math.pi / 2)
    o.location = (0, 0, 35)
    for x in range(-64, 65, 9):
        if abs(x) < 26:
            continue
        arch_window(x, -23.6, 8, 5, 16, DARKWIN(), depth=1)
    zcyl("drum", 22, 18, (0, 0, 40), CREAM(), verts=24)
    for k in range(16):
        a = k / 16 * TAU
        box("drum-win", (3, 2, 10), (math.cos(a) * 22, math.sin(a) * 22, 49), DARKWIN())
    dome("dome", 22, (0, 0, 58), mat("Dome", "#8c9a8c", rough=.5, metal=.3), squash=1.35)
    zcyl("lantern", 4, 10, (0, 0, 87), CREAM(), verts=8)
    dome("lantern-cap", 4.5, (0, 0, 97), mat("Dome", "#8c9a8c", rough=.5, metal=.3))
    for x in (-66, 66):
        for y in (-20, 20):
            zcyl("corner", 5, 42, (x, y, 0), mat("Brick", "#c9b08a", rough=.9), verts=8)
            cone("corner-cap", 5.6, .5, 10, (x, y, 42), mat("Slate2", "#7b7f86", rough=.6), verts=8)
    for x in (-18, 18):
        zcyl("flagpole", .6, 30, (x, -42, 34), STEEL(), verts=6)
        box("flag", (12, .4, 7), (x + 6, -42, 60), RED())
    done("reb")


# ------------------------------------------------------------------ Luna Park (90 x 60): Mr Moon's face and the towers
def make_luna():
    reset()
    face = mat("MoonFace", "#f3e3a6", rough=.7)
    cyl("face", 30, 6, (0, -24, 34), face, axis="Y", verts=32)
    for s in (-1, 1):
        cyl("eye", 7, 2, (s * 12, -27.5, 44), WHITE(), axis="Y", verts=16)
        cyl("pupil", 3.5, 2, (s * 12, -28.7, 44), mat("Pupil", "#1d5fa8"), axis="Y", verts=12)
        box("brow", (10, 1.5, 2), (s * 12, -28, 52), BLACK(), rot=(0, s * .2, 0))
    box("nose", (5, 4, 8), (0, -29, 36), mat("Nose", "#e05a2a"))
    box("mouth", (34, 3, 14), (0, -28, 18), RED())
    for i in range(9):
        box("tooth", (3, 1, 5), (-14 + i * 3.5, -29.8, 22), WHITE())
    for k in range(14):   # rays round the face
        a = k / 14 * math.pi
        strut("ray", (math.cos(a) * 30, -24, 34 + math.sin(a) * 30), (math.cos(a) * 42, -24, 34 + math.sin(a) * 42), 3, mat("Ray", "#f2a33a"))
    for s in (-1, 1):
        zcyl("tower", 8, 60, (s * 40, -18, 0), mat("TowerRed", "#d84b3a"), verts=12)
        for z in (20, 40):
            zcyl("tower-band", 8.6, 3, (s * 40, -18, z), GOLD(), verts=12)
        dome("onion", 9, (s * 40, -18, 60), GOLD(), squash=1.5)
        cone("tip", 2, .2, 10, (s * 40, -18, 73), GOLD(), verts=6)
    box("wall", (60, 8, 24), (0, -16, 12), mat("LunaWall", "#f3e3a6"))
    # the Scenic Railway's timber frame behind
    wood = mat("Timber", "#e9e2d0", rough=.9)
    for x in range(-40, 41, 8):
        h = 22 + 10 * math.sin(x / 9)
        strut("trestle", (x, 14, 0), (x, 14, h), 1.4, wood)
        strut("trestle", (x, 22, 0), (x, 22, h), 1.4, wood)
        box("track", (8.5, 9, 1.4), (x, 18, h), mat("Track", "#5a4a3a"))
    done("luna")


# ------------------------------------------------------------------ Crown (170 x 70) and Rialto (70 x 60)
def make_crown():
    reset()
    box("podium", (166, 60, 40), (0, 0, 20), mat("CrownGlass", "#2f3640", rough=.2, metal=.5))
    box("gold-band", (168, 62, 7), (0, 0, 31), GOLD())
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=30, depth=250, location=(-40, 6, 165))
    o = active()
    o.scale = (1.4, .6, 1)
    o.data.materials.append(mat("CrownTower", "#7d8a97", rough=.2, metal=.5))
    box("crown-top", (80, 30, 10), (-40, 6, 295), GOLD())
    for i in range(6):   # the gas brigades along the river
        x = -70 + i * 28
        box("brigade", (6, 6, 34), (x, -38, 17), mat("Brigade", "#2b2b2b"))
        box("flame", (5, 5, 5), (x, -38, 37), mat("Flame", "#ff9a1f", emit=3))
    done("crown")


def make_rialto():
    reset()
    box("north", (56, 26, 640), (0, -13, 320), mat("RialtoA", "#1f3550", rough=.1, metal=.6))
    box("south", (48, 28, 560), (4, 14, 280), mat("RialtoB", "#24405f", rough=.1, metal=.6))
    for z in range(20, 640, 20):
        box("line", (56.6, 26.6, 1), (0, -13, z), mat("Mullion2", "#4a6585"))
    box("crown", (40, 20, 30), (0, -13, 655), STEEL())
    done("rialto")


# ------------------------------------------------------------------ Parliament House, Spring Street (130 x 80)
# The great west front: a sweep of steps up to a colonnade of eight giant columns under a flat balustraded
# parapet (the planned dome was never built), with lower colonnaded wings either side and the big bronze lamps.
def make_parliament():
    reset()
    blue = mat("Bluestone", "#59595a", rough=.95)
    col = mat("Column", "#e6dcc4", rough=.8)
    win = mat("Windows", "#26303a", rough=.2, metal=.4)
    bronze = mat("Bronze", "#5a4a2e", metal=.6, rough=.4)
    box("plinth", (130, 70, 8), (0, 6, 4), blue)
    box("chamber-block", (118, 46, 44), (0, 16, 8 + 22), SAND())
    box("roof", (112, 40, 6), (0, 16, 8 + 44 + 3), SLATE())
    # the steps: the full width of the centre, falling to the footpath
    for i in range(7):
        box("step", (78 + i * 2, 3.2, 8 - i * 1.15), (0, -29 - i * 3.2, (8 - i * 1.15) / 2), STONE())
    # main colonnade: eight giant columns with bases and capitals
    z, h = 8, 34
    for i in range(8):
        x = -31.5 + i * 9
        box("base", (7, 7, 2), (x, -25, z + 1), STONE())
        zcyl("column", 2.9, h - 4, (x, -25, z + 2), col, verts=14)
        box("capital", (7.4, 7.4, 2), (x, -25, z + h - 1), STONE())
    box("portico-back", (78, 4, h), (0, -8, z + h / 2), SAND())
    for x in range(-28, 32, 9):
        arch_window(x - 4.5 + 4.5, -10.2, z + 6, 4, 16, win, depth=1)
    box("architrave", (80, 16, 4), (0, -18, z + h + 2), STONE())
    box("frieze", (80, 16, 3), (0, -18, z + h + 5.5), SAND())
    box("cornice", (84, 18, 2), (0, -18, z + h + 8), STONE())
    # balustrade along the top of the portico
    top = z + h + 9
    box("rail", (82, 2, 1.4), (0, -26, top + 5), STONE())
    box("rail-base", (82, 2, 1.2), (0, -26, top + .6), STONE())
    for k in range(27):
        zcyl("baluster", .55, 4, (-39 + k * 3, -26, top + 1), STONE(), verts=6)
    for x in (-41, -14, 14, 41):
        box("pier", (3, 3, 7), (x, -26, top + 3.5), STONE())
    # the two wings: a storey lower, each with a small colonnade and two rows of windows
    for sx in (-1, 1):
        cx = sx * 52
        box("wing", (26, 50, 34), (cx, 2, 8 + 17), SAND())
        box("wing-cornice", (28, 52, 2.5), (cx, 2, 8 + 34 + 1.2), STONE())
        box("wing-parapet", (27, 51, 3), (cx, 2, 8 + 34 + 4), SAND())
        for i in range(4):
            zcyl("wing-col", 1.6, 22, (cx - 9 + i * 6, -24.5, 8 + 6), col, verts=10)
        box("wing-podium", (26, 3, 6), (cx, -24, 8 + 3), STONE())
        box("wing-entab", (26, 4, 3), (cx, -24.5, 8 + 29.5), STONE())
        for x in (-8, 0, 8):
            arch_window(cx + x, -23.2, 8 + 10, 3.4, 12, win, depth=1)
        for y in (-8, 6, 20):
            for zz in (12, 26):
                box("side-win", (1, 4, 7), (cx + sx * 13.1, y, 8 + zz), win)
    # side windows along the main block
    for x in range(-50, 52, 10):
        for zz in (14, 30):
            box("rear-win", (4, 1, 8), (x, 39.1, 8 + zz), win)
    # the great bronze lamps flanking the steps
    for sx in (-1, 1):
        box("lamp-plinth", (6, 6, 6), (sx * 42, -42, 3), STONE())
        zcyl("lamp-post", 1, 16, (sx * 42, -42, 6), bronze, verts=8)
        for dx in (-2.5, 2.5):
            box("lamp", (2.4, 2.4, 3.4), (sx * 42 + dx, -42, 23), LAMP())
        box("lamp-cap", (7, 3, 1), (sx * 42, -42, 25.2), bronze)
    done("parliament")


if __name__ == "__main__":
    for build in (make_flinders, make_arts, make_mcg, make_westgate, make_bolte, make_eureka, make_shrine, make_fedsq,
                  make_star, make_stpauls, make_reb, make_luna, make_crown, make_rialto, make_parliament):
        build()
