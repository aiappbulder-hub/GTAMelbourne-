"""Studio previews of a character .blend: front, back, three-quarter and a face close-up, rendered with Cycles.

    python tools/characters/preview.py characters/base_models/<name>.blend [collection ...] [--out dir] [--tag x]

Collections default to every collection in the file (base + outfit). Writes <name>[_tag]_front.png etc.
"""
import sys, os, math
import bpy
from mathutils import Vector

args = sys.argv[1:]
blend = args[0]
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(blend))), "previews")
tag = ""
show = []
i = 1
while i < len(args):
    if args[i] == "--out":
        out = args[i + 1]; i += 2
    elif args[i] == "--tag":
        tag = "_" + args[i + 1]; i += 2
    else:
        show.append(args[i]); i += 1
os.makedirs(out, exist_ok=True)
name = os.path.splitext(os.path.basename(blend))[0] + tag

bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
if show:
    for c in bpy.data.collections:
        lc = bpy.context.view_layer.layer_collection.children.get(c.name)
        if lc:
            lc.exclude = c.name not in show

# frame on the character (measured before the studio goes in)
top = max((o.matrix_world @ Vector(c)).z for o in sc.objects if o.type == "MESH" and o.visible_get() for c in o.bound_box)

# studio: dark grey floor and backdrop, key, fill and rim lights
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 4, 0))
floor = bpy.context.view_layer.objects.active
m = bpy.data.materials.new("Sweep")
m.use_nodes = True
m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.05, .05, .055, 1)
m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .8
floor.data.materials.append(m)
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 6, 5), rotation=(math.radians(90), 0, 0))
bpy.context.view_layer.objects.active.data.materials.append(m)


def light(name, kind, energy, loc, size=1.5, col=(1, 1, 1)):
    L = bpy.data.lights.new(name, kind)
    L.energy = energy
    L.color = col
    if kind == "AREA":
        L.size = size
    o = bpy.data.objects.new(name, L)
    sc.collection.objects.link(o)
    o.location = loc
    d = Vector((0, 0, 1.1)) - Vector(loc)
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return o


light("key", "AREA", 420, (-2.2, -2.8, 2.8), 2.2, (1, .96, .9))
light("fill", "AREA", 140, (2.6, -2.4, 1.6), 3, (.85, .9, 1))
light("rim", "AREA", 320, (1.2, 2.6, 2.6), 1.5)
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (.03, .03, .035, 1)

sc.render.engine = "CYCLES"
sc.cycles.samples = 96
sc.cycles.use_denoising = True
sc.cycles.device = "CPU"
sc.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in sc.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
sc.render.film_transparent = False

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam


def shot(suffix, yaw, dist, z, look_z, lens, res=(900, 1200)):
    sc.render.resolution_x, sc.render.resolution_y = res
    cam.data.lens = lens
    a = math.radians(yaw)
    cam.location = (math.sin(a) * dist, -math.cos(a) * dist, z)
    d = Vector((0, 0, look_z)) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(out, "%s_%s.png" % (name, suffix))
    bpy.ops.render.render(write_still=True)
    print("rendered", sc.render.filepath)


shot("front", 0, 5.2, top * .55, top * .5, 60)
shot("back", 180, 5.2, top * .55, top * .5, 60)
shot("three_quarter", -35, 5.2, top * .6, top * .5, 60)
shot("face", -20, 1.0, top - .1, top - .13, 85, (900, 900))
