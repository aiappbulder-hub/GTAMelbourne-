"""Builds the game's aircraft in Blender and exports them as .glb.

Run headless with Blender's Python module:  python make_aircraft.py <out_dir>

Units are game pixels, like the landmarks. The nose points along Blender -Y and Z is up.
The helicopter's rotors are separate objects named rotor-main and rotor-tail, each with its
origin on the hub, so the game can spin them.
"""
import sys, os, math
import bpy, bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_models import mat, box, cyl, reset, export, active   # noqa: E402
from make_models import prism as _prism   # noqa: E402

WHITE = lambda: mat("Paint", "#f3f4f6", rough=.35)
GREY = lambda: mat("Wing", "#b9bec6", rough=.5, metal=.3)
DARK = lambda: mat("Windows", "#1d2733", rough=.15, metal=.5)
RUBBER = lambda: mat("Tyre", "#1a1a1a", rough=.9)
STEEL = lambda: mat("Steel", "#8d939b", rough=.4, metal=.7)


def prism(*a, **k):
    o = _prism(*a, **k)
    bpy.context.view_layer.objects.active = o
    return o


def plate(name, pts, thick, z, material):
    """A flat shape seen from above [(x, y), ...], thick in Z, its underside at z: wings and tailplanes."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z)) for x, y in pts]
    hi = [bm.verts.new((x, y, z + thick)) for x, y in pts]
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    bpy.context.view_layer.objects.active = o
    return o


def ycone(name, r1, r2, length, loc, material, back=True, verts=16):
    """A cone lying along Y: wide end r1 at loc, narrowing to r2 towards +Y (back) or -Y."""
    y = loc[1] + (length / 2 if back else -length / 2)
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=length, location=(loc[0], y, loc[2]),
                                    rotation=((-1 if back else 1) * math.pi / 2, 0, 0))
    o = active()
    o.name = name
    bpy.ops.object.transform_apply(rotation=True)
    o.data.materials.append(material)
    return o


def mirror_x(pts):
    return [(-x, y) for x, y in reversed(pts)]


def join(name, keep=()):
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH" and not o.name.startswith(keep or ("\0",))]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    active().name = name


# ------------------------------------------------------------------ twin-engine airliner (about 90 long, 86 span)
def make_jet():
    reset()
    red = mat("Tail", "#c8102e", rough=.4)
    zc = 9
    cyl("fuselage", 5.2, 70, (0, 0, zc), WHITE(), axis="Y", verts=20)
    ycone("nose", 5.2, 1.2, 11, (0, -35, zc - .8), WHITE(), back=False, verts=20)
    ycone("tailcone", 5.2, 1.0, 15, (0, 35, zc + 1), WHITE(), verts=20)
    box("belly", (7.6, 66, 2.2), (0, 0, zc - 4.4), GREY())
    box("cockpit", (6.4, 3.2, 1.6), (0, -38.5, zc + 2.4), DARK(), rot=(-.5, 0, 0))
    for sx in (-1, 1):
        box("windows", (.3, 54, 1.1), (sx * 5.15, -1, zc + 1.6), DARK())
    wing = [(4, -5), (43, 12), (43, 16.5), (4, 12)]
    plate("wing", wing + mirror_x(wing), 1.3, zc - 3.2, GREY())
    for sx in (-1, 1):
        cyl("engine", 2.8, 10, (sx * 15, 1, zc - 5), WHITE(), axis="Y", verts=16)
        cyl("intake", 2.2, .6, (sx * 15, -4.1, zc - 5), DARK(), axis="Y", verts=16)
        box("pylon", (1, 6, 2.4), (sx * 15, 3, zc - 3.2), GREY())
        box("winglet", (.6, 4, 5), (sx * 43, 15, zc + 0.5), red)
    stab = [(1, 33), (17, 41), (17, 44), (1, 41)]
    plate("tailplane", stab + mirror_x(stab), 1, zc + 2, GREY())
    prism("fin", [(31, zc + 3), (42, zc + 3), (49, zc + 23), (43.5, zc + 23)], 1.4, red)
    # undercarriage
    zcyl = lambda n, r, h, x, y: cyl(n, r, h, (x, y, h / 2 + 1.6), STEEL(), axis="Z", verts=8)
    zcyl("nose-leg", .5, 3.5, 0, -27)
    cyl("nose-wheel", 1.6, 1.4, (0, -27, 1.6), RUBBER(), axis="X", verts=12)
    for sx in (-1, 1):
        zcyl("main-leg", .6, 3.5, sx * 6, 4)
        cyl("main-wheel", 1.8, 2.2, (sx * 6, 4, 1.8), RUBBER(), axis="X", verts=12)
    join("jet")
    export("jet")


# ------------------------------------------------------------------ high-wing light plane (about 30 long, 40 span)
def make_light():
    reset()
    blue = mat("Stripe", "#1f4fa3", rough=.4)
    prism("fuselage", [(-13, 3), (-14, 7), (-8, 10.5), (2, 10.5), (15, 8.5), (15, 7), (2, 3)], 5.4, WHITE())
    box("stripe", (5.5, 26, .9), (0, 1, 6.2), blue)
    box("windscreen", (5, 3.4, 2.6), (0, -7.4, 9.2), DARK(), rot=(-.6, 0, 0))
    for sx in (-1, 1):
        box("side-window", (.3, 6, 2.2), (sx * 2.75, -3, 8.8), DARK())
    plate("wing", [(-20, -7), (20, -7), (20, -1.5), (-20, -1.5)], .9, 10.5, WHITE())
    for sx in (-1, 1):
        box("wingtip", (1.4, 5.5, 1), (sx * 19.6, -4.25, 10.9), blue)
        box("strut", (.4, .4, 7), (sx * 7, -4, 7), STEEL(), rot=(0, sx * .55, 0))
    plate("tailplane", [(-7, 12), (7, 12), (7, 15.5), (-7, 15.5)], .6, 7.6, WHITE())
    prism("fin", [(10, 8.5), (15.5, 8.5), (16, 15), (13, 15)], .8, blue)
    cyl("spinner", 1.2, 2, (0, -14.6, 6.6), STEEL(), axis="Y", verts=10)
    box("prop", (11, .4, 1.2), (0, -15.8, 6.6), mat("Prop", "#2a2a2a", rough=.6))
    for x, y in ((0, -10), (-3.4, 0), (3.4, 0)):
        cyl("wheel", 1.3, 1, (x, y, 1.3), RUBBER(), axis="X", verts=10)
        box("leg", (.4, .4, 2.6), (x, y, 3), STEEL())
    join("light")
    export("light")


# ------------------------------------------------------------------ police helicopter (about 40 long, rotor 44)
def make_heli():
    reset()
    navy = mat("Navy", "#0f2a5c", rough=.4)
    check = mat("Check", "#e8e8e8", rough=.5)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1, location=(0, -2, 8))
    o = active()
    o.name = "cabin"
    o.scale = (5.2, 9, 5.2)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(WHITE())
    box("band", (10.6, 14, 2), (0, -1, 6.4), navy)
    for i in range(6):
        box("check", (10.8, 1.6, .9), (0, -7 + i * 2.6, 7.9 + (i % 2) * .01), check if i % 2 else navy)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1, location=(0, -7.5, 9.2))
    o = active()
    o.name = "canopy"
    o.scale = (4.4, 4.2, 3.6)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(DARK())
    box("engine", (5, 9, 3), (0, 1, 13), WHITE())
    ycone("boom", 2.2, .8, 22, (0, 5, 9), WHITE(), verts=12)
    prism("fin", [(24, 9), (28.5, 9), (30, 17), (27.5, 17)], .8, navy)
    plate("stabiliser", [(-4, 22), (4, 22), (4, 24.5), (-4, 24.5)], .5, 9.4, navy)
    for sx in (-1, 1):
        box("skid", (.9, 20, .9), (sx * 5, -1, .6), STEEL())
        for y in (-6, 4):
            box("skid-strut", (.6, .6, 4.6), (sx * 4.2, y, 2.8), STEEL(), rot=(0, sx * .3, 0))
    cyl("mast", .8, 3, (0, 0, 15.5), STEEL(), axis="Z", verts=8)
    box("searchlight", (1.8, 2.2, 1.8), (0, -9, 3.6), mat("Light", "#fffbe0", emit=2.0))
    join("heli-body")
    # rotors: separate objects whose origins sit on their hubs
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 17.3))
    a = active()
    a.name = "rotor-main"
    me = a.data
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co.x *= 46
        v.co.y *= 2.2
        v.co.z *= .4
    second = bmesh.ops.create_cube(bm, size=1)["verts"]
    for v in second:
        v.co.x *= 2.2
        v.co.y *= 46
        v.co.z *= .4
    bm.to_mesh(me)
    bm.free()
    a.data.materials.append(mat("Blade", "#2b2b2b", rough=.6))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(1.2, 29, 12))
    t = active()
    t.name = "rotor-tail"
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co.x *= .3
        v.co.y *= 1
        v.co.z *= 8
    bm.to_mesh(t.data)
    bm.free()
    t.data.materials.append(mat("Blade", "#2b2b2b", rough=.6))
    export("heli")


if __name__ == "__main__":
    for build in (make_jet, make_light, make_heli):
        build()
