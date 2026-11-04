"""Builds the suburban train carriages in Blender and exports them as .glb (in metres, like the custom cars).

Run headless with Blender's Python module:  python make_trains.py <out_dir>

A generic Melbourne electric suburban set: stainless-steel body, dark window band, a blue livery stripe, yellow
safety front on the driving cars, plug doors, bogies, a pantograph on the motor cars. Two models:
  train_cab  - a driving car (cab at the -Y end, the front)
  train_mid  - a middle car
The front points along Blender -Y (glTF +Z), like the other vehicles; the game turns it to face its travel.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_models import mat, box, cyl, prism, reset, export, bevel, GLASS, TRIM, HEAD, TAIL   # noqa: E402

L, W = 11.5, 3.0          # half length and width in metres (a 23 m carriage)
STEEL = lambda: mat("Steel", "#c9ced4", rough=.35, metal=.75)
BAND = lambda: mat("WindowBand", "#1d232b", rough=.3)
BLUE = lambda: mat("Livery", "#1f4fa3", rough=.4)
YELLOW = lambda: mat("SafetyYellow", "#f2c230", rough=.45)


def carriage(cab):
    reset()
    blk = TRIM()
    # body: a slightly tumblehomed box; the cab end slopes back at the windscreen
    front = -L
    prof = [(-L, .95), (-L, 3.9), (L, 3.9), (L, .95)]
    if cab:
        prof = [(-L, .95), (-L - .05, 2.2), (-L + .55, 3.75), (-L + .9, 3.95), (L, 3.95), (L, .95)]
    bevel(prism("body", prof, W, STEEL(), taper=(3.0, .93)), .06, 2)
    prism("roof", [(-L + (.9 if cab else 0), 3.92), (-L + (.9 if cab else 0), 4.1), (L, 4.1), (L, 3.92)], W * .9, mat("Roof", "#7d838a", rough=.6))
    prism("skirt", [(-L + .1, .6), (-L + .1, 1.0), (L - .1, 1.0), (L - .1, .6)], W + .02, blk)
    prism("stripe", [(-L, 1.25), (-L, 1.55), (L, 1.55), (L, 1.25)], W + .03, BLUE())
    prism("window-band", [(-L + (1.3 if cab else .2), 2.15), (-L + (1.3 if cab else .2), 3.15), (L - .2, 3.15), (L - .2, 2.15)], W + .03, BAND())
    # windows set into the band, with mullions
    for k in range(10):
        y = -L + 2.3 + k * (2 * L - 3.4) / 9
        box("mullion", (W + .05, .12, 1.0), (0, y, 2.65), STEEL())
    # three plug doors a side, with their own glass
    for y in (-L * .6, 0, L * .6):
        for sx in (-1, 1):
            box("door", (.04, 1.4, 2.25), (sx * (W / 2 + .02), y, 2.05), mat("Door", "#b9bfc6", rough=.3, metal=.6))
            box("door-glass", (.03, 1.1, .95), (sx * (W / 2 + .04), y, 2.65), GLASS())
            box("door-edge", (.05, .06, 2.25), (sx * (W / 2 + .03), y, 2.05), blk)
    # bogies and wheels
    for y in (-L + 2.8, L - 2.8):
        box("bogie", (W * .78, 2.6, .55), (0, y, .55), blk, bev=.06)
        for dy in (-.85, .85):
            for sx in (-1, 1):
                cyl("wheel", .45, .18, (sx * 1.0, y + dy, .45), mat("Wheel", "#3a3a3a", rough=.5, metal=.6), axis="X", verts=14)
    # gangway at the inner ends
    for y in ((L,) if cab else (-L, L)):
        box("gangway", (W * .6, .25, 2.6), (0, y + (.1 if y > 0 else -.1), 2.2), blk)
    if cab:
        prism("cab-yellow", [(-L - .07, .95), (-L - .11, 2.25), (-L + .3, 2.25), (-L + .3, .95)], W + .05, YELLOW())
        prism("windscreen", [(-L - .1, 2.35), (-L + .46, 3.62), (-L + .52, 3.6), (-L - .03, 2.33)], W * .9, GLASS())
        prism("cab-frame", [(-L - .12, 2.25), (-L - .12, 2.38), (-L + .3, 2.38), (-L + .3, 2.25)], W + .05, mat("CabTrim", "#1d232b", rough=.4))
        box("dest", (1.6, .05, .3), (0, -L + .52, 3.72), mat("DestSign", "#ffb000", emit=1.4))
        for sx in (-1, 1):
            box("headlight", (.34, .06, .2), (sx * .95, front - .07, 1.85), HEAD(), bev=.02)
            box("taillight", (.2, .06, .14), (sx * 1.2, front - .07, 1.5), TAIL(), bev=.02)
        box("coupler", (.5, .5, .4), (0, front - .2, 1.0), blk)
    else:
        # pantograph on the middle (motor) car
        box("panto-base", (1.0, .5, .12), (0, 0, 4.18), blk)
        box("panto-arm-1", (.07, .07, 1.5), (0, -.35, 4.8), blk, rot=(.6, 0, 0))
        box("panto-arm-2", (.07, .07, 1.5), (0, .35, 4.8), blk, rot=(-.6, 0, 0))
        box("panto-head", (1.7, .12, .07), (0, 0, 5.45), blk)
    for y in (-L * .45, L * .45):
        box("ac-unit", (W * .55, 1.8, .3), (0, y, 4.2), STEEL(), bev=.08)
    export("train_cab" if cab else "train_mid")


if __name__ == "__main__":
    for cab in (True, False):
        carriage(cab)
