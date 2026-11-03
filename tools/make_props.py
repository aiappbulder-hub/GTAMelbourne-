"""Builds the game's street furniture in Blender and exports it as .glb.

Run headless with Blender's Python module:  python make_props.py <out_dir>

Units are game pixels (a person is about 25 tall, so a metre is roughly 14). Each prop stands on
its origin, its front faces -Y (glTF +Z, towards the road) and Z is up. Every prop is joined into
one object so the game can instance it cheaply along the streets.
"""
import sys, os, math
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_models import mat, box, cyl, reset, export, active   # noqa: E402

POLE = lambda: mat("Pole", "#5d6168", rough=.5, metal=.6)
BLACK = lambda: mat("Housing", "#16171a", rough=.6)
STEEL = lambda: mat("Steel", "#9aa0a7", rough=.35, metal=.8)
GLASS = lambda: mat("Glass", "#9fc4d6", rough=.05, metal=.3, alpha=.45)
WOOD = lambda: mat("Wood", "#8a5a36", rough=.8)
GREEN = lambda: mat("BinGreen", "#1f4d34", rough=.6)


def join(name):
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    active().name = name


def make_traffic_light():
    """A Victorian signal post: grey pole, black three-aspect head with hoods, a pedestrian head and push-button."""
    reset()
    cyl("pole", 1.0, 46, (0, 0, 23), POLE(), axis="Z", verts=10)
    cyl("base", 1.6, 3, (0, 0, 1.5), POLE(), axis="Z", verts=10)
    box("head", (4.2, 3.0, 12.5), (0, -2.4, 38), BLACK(), bev=.4)
    box("backboard", (6.2, .3, 14.5), (0, -.8, 38), mat("Backboard", "#d9b21a", rough=.6))
    for i, (col, emit) in enumerate((("#ff2a1a", 2.2), ("#ffb01a", .25), ("#22ff66", .25))):
        z = 42 - i * 4
        cyl("lens", 1.35, .4, (0, -4.0, z), mat("Lens%d" % i, col, emit=emit, rough=.2), axis="Y", verts=14)
        box("hood", (3.2, 1.6, .35), (0, -4.6, z + 1.5), BLACK())
    box("ped-head", (3.2, 2.6, 6.2), (0, -2.2, 22), BLACK(), bev=.3)
    box("walk", (2.2, .3, 2.2), (0, -3.6, 23.6), mat("Walk", "#e8f4ff", emit=.3))
    box("dont", (2.2, .3, 2.2), (0, -3.6, 20.4), mat("Dont", "#ff3b2a", emit=1.6))
    box("button", (2.4, 1.6, 3.6), (0, -1.6, 14), mat("Button", "#d9b21a", rough=.5))
    join("traffic-light")
    export("traffic-light")


def make_street_lamp():
    """A tall street light with an arm reaching out over the road (towards -Y) and a glowing lantern."""
    reset()
    cyl("pole", 1.1, 80, (0, 0, 40), POLE(), axis="Z", verts=10)
    cyl("foot", 1.8, 4, (0, 0, 2), POLE(), axis="Z", verts=10)
    arm = 16
    box("arm", (1.2, arm, 1.2), (0, -arm / 2, 79), POLE(), rot=(math.radians(-6), 0, 0))
    box("lantern", (4.2, 8.5, 1.8), (0, -arm - 2, 77.6), STEEL(), bev=.5)
    box("glow", (3.4, 7.2, .4), (0, -arm - 2, 76.5), mat("LampGlow", "#fff3c4", emit=3.0))
    join("street-lamp")
    export("street-lamp")


def make_bus_shelter():
    """A glass shelter: steel frame, glass back and ends, a roof, a bench and a lit advertising panel at one end."""
    reset()
    W, D, H = 52, 18, 34
    for x in (-W / 2, W / 2):
        for y in (-D / 2 + 1, D / 2 - 1):
            box("post", (1.4, 1.4, H), (x, y, H / 2), STEEL())
    box("roof", (W + 4, D + 4, 1.6), (0, 0, H + .8), mat("Roof", "#3b4048", rough=.5))
    box("fascia", (W + 4, .8, 3), (0, -D / 2 - 2, H - .5), mat("Fascia", "#1d6f9a", rough=.5))
    box("back", (W, .5, H - 6), (0, D / 2 - 1, H / 2 + 2), GLASS())
    box("end", (.5, D - 4, H - 6), (-W / 2, 0, H / 2 + 2), GLASS())
    box("ad-frame", (1.6, D - 3, H - 8), (W / 2, 1, H / 2 + 1), STEEL())
    box("ad", (1.8, D - 5, H - 11), (W / 2, 1, H / 2 + 1), mat("Advert", "#f2e6c8", emit=1.2))
    box("bench", (W * .6, 5, 1.2), (-4, D / 2 - 4.5, 8), WOOD())
    for x in (-W * .25, W * .15):
        box("bench-leg", (1, 4, 7.4), (x, D / 2 - 4.5, 3.7), STEEL())
    box("sign-pole", (1, 1, 44), (-W / 2 - 6, -D / 2, 22), POLE())
    box("sign", (8, .5, 10), (-W / 2 - 6, -D / 2, 40), mat("StopSign", "#f2b705", rough=.4))
    join("bus-shelter")
    export("bus-shelter")


def make_bin():
    """A council street bin: dark green drum with a steel lid and a slot."""
    reset()
    cyl("drum", 4.2, 12, (0, 0, 6.4), GREEN(), axis="Z", verts=14)
    cyl("band", 4.4, 1.2, (0, 0, 10), STEEL(), axis="Z", verts=14)
    cyl("lid", 4.6, 1.6, (0, 0, 13.2), STEEL(), axis="Z", verts=14)
    box("slot", (4, 1, 1.6), (0, -4.3, 11.2), BLACK())
    cyl("foot", 3.2, .6, (0, 0, .3), POLE(), axis="Z", verts=10)
    join("street-bin")
    export("street-bin")


def make_bench():
    """A park bench: wooden seat and back slats on cast-iron ends."""
    reset()
    L = 26
    for i in range(3):
        box("seat", (L, 1.8, .7), (0, -2.4 + i * 2.1, 6.4), WOOD())
    for i in range(2):
        box("back", (L, .7, 1.8), (0, 3.4, 9.2 + i * 2.6), WOOD(), rot=(math.radians(-12), 0, 0))
    for x in (-L / 2 + 2, L / 2 - 2):
        box("leg", (1.2, 7, 1.2), (x, 0, 3), BLACK())
        box("leg-f", (1.2, 1.2, 6.4), (x, -3, 3.2), BLACK())
        box("leg-b", (1.2, 1.2, 12), (x, 3.6, 6), BLACK(), rot=(math.radians(-12), 0, 0))
        box("arm", (1.2, 7, 1), (x, -.4, 9.4), BLACK())
    join("bench")
    export("bench")


def make_phone_box():
    """A street payphone: open-sided aluminium cabinet with a canopy and the handset unit."""
    reset()
    box("back", (12, 1, 30), (0, 5, 15), STEEL())
    for x in (-6, 6):
        box("side", (.8, 10, 30), (x, 0, 15), GLASS())
        box("frame", (1, 10, 1), (x, 0, 29.5), STEEL())
    box("canopy", (14, 12, 1.6), (0, 0, 31), mat("Canopy", "#1d6f9a", rough=.5))
    box("unit", (6, 2.4, 9), (0, 3.6, 19), mat("Phone", "#c9cdd2", rough=.4, metal=.4))
    box("screen", (3.4, .3, 2.2), (0, 2.3, 21.5), mat("Screen", "#7fd0ff", emit=1.0))
    box("handset", (1.4, 1, 5.6), (-2.2, 2.1, 17.6), BLACK())
    join("phone-box")
    export("phone-box")


def make_bollard():
    """A short steel bollard for kerbs and plazas."""
    reset()
    cyl("post", 1.5, 11, (0, 0, 5.5), STEEL(), axis="Z", verts=10)
    cyl("cap", 1.7, 1.2, (0, 0, 11.4), BLACK(), axis="Z", verts=10)
    cyl("band", 1.55, 1.2, (0, 0, 8.5), mat("Reflect", "#ffd23a", emit=.4), axis="Z", verts=10)
    join("bollard")
    export("bollard")


if __name__ == "__main__":
    for build in (make_traffic_light, make_street_lamp, make_bus_shelter, make_bin, make_bench, make_phone_box, make_bollard):
        build()
