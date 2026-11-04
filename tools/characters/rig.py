"""STAGE 2 - the shared humanoid rig and its animations.

Every character gets the same skeleton (same bone names, hierarchy and rolls), built from the joint centres measured
on its own body, so one set of animation clips drives them all:

    Hips > Spine > Chest > Neck > Head
                   Chest > Shoulder.L > UpperArm.L > LowerArm.L > Wrist.L > Fingers.L   (and .R)
    Hips > UpperLeg.L > LowerLeg.L > Foot.L > Toes.L                                    (and .R)

The body is weighted with Blender's automatic (bone heat) weights, then every other mesh (clothes, hair, beard, eyes,
shoes, glasses) copies its weights from the nearest point on the body, so everything moves together.

Clips are authored as world-space rotations per bone (easy to reason about: +X tilts a bone's top forward, so a
hanging leg swings back) and converted to each bone's local pose rotation. Because the rig has the same rest pose
on every body, the clips are identical in every export.
"""
import math
import bpy
from mathutils import Vector, Quaternion, Matrix

FPS = 30
SIDES = ("L", "R")


def _sk(s):
    return "l" if s == "L" else "r"


def joints_world(J, sole):
    return {k: v + Vector((0, 0, sole)) for k, v in J.items()}


def make_armature(J, body, name="rig"):
    """Build the armature from joint centres J (armature space = world, metres, feet on the floor)."""
    mw = body.matrix_world
    verts = [mw @ v.co for v in body.data.vertices]

    def tip(s):   # the fingertip: the body vertex farthest past the wrist along the forearm
        w, d = J[_sk(s) + "-hand"], (J[_sk(s) + "-hand"] - J[_sk(s) + "-elbow"]).normalized()
        side = [p for p in verts if (p.x > 0) == (s == "L")]
        return max(side, key=lambda p: (p - w).dot(d))

    arm_data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def bone(n, h, t, parent=None, roll_to=None):
        b = eb.new(n)
        b.head, b.tail = h, t
        if (b.tail - b.head).length < .01:
            b.tail = b.head + Vector((0, 0, .05))
        if parent:
            b.parent = eb[parent]
        b.align_roll(roll_to if roll_to is not None else Vector((0, -1, 0)))
        return b

    bone("Hips", J["pelvis"], J["spine-4"])
    bone("Spine", J["spine-4"], J["spine-2"], "Hips")
    bone("Chest", J["spine-2"], J["neck"], "Spine")
    bone("Neck", J["neck"], J["head"], "Chest")
    bone("Head", J["head"], J["head-2"], "Neck")
    for s in SIDES:
        k = _sk(s)
        ft = tip(s)
        hand = J[k + "-hand"]
        mid = hand + (ft - hand) * .45
        bone("Shoulder." + s, J[k + "-clavicle"], J[k + "-shoulder"], "Chest")
        bone("UpperArm." + s, J[k + "-shoulder"], J[k + "-elbow"], "Shoulder." + s)
        bone("LowerArm." + s, J[k + "-elbow"], hand, "UpperArm." + s)
        bone("Wrist." + s, hand, mid, "LowerArm." + s)          # the hand; guns attach here
        bone("Fingers." + s, mid, ft, "Wrist." + s)
        bone("UpperLeg." + s, J[k + "-upper-leg"], J[k + "-knee"], "Hips", Vector((0, -1, 0)))
        bone("LowerLeg." + s, J[k + "-knee"], J[k + "-ankle"], "UpperLeg." + s, Vector((0, -1, 0)))
        bone("Foot." + s, J[k + "-ankle"], J[k + "-foot-1"], "LowerLeg." + s, Vector((0, 0, 1)))
        bone("Toes." + s, J[k + "-foot-1"], J[k + "-foot-2"], "Foot." + s, Vector((0, 0, 1)))
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def _seg_dist(p, a, b):
    ab = b - a
    t = max(0., min(1., (p - a).dot(ab) / max(1e-9, ab.length_squared)))
    return (p - (a + ab * t)).length


def weight_body(arm, body):
    """Automatic weights; any vertex the heat solver leaves unweighted goes to its nearest bone."""
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    except RuntimeError as e:
        print("  auto weights failed:", e)
    if body.parent is not arm:
        body.parent = arm
    if not any(m.type == "ARMATURE" for m in body.modifiers):
        body.modifiers.new("Armature", "ARMATURE").object = arm
    bones = [(b.name, b.head_local, b.tail_local) for b in arm.data.bones]
    groups = {g.index: g for g in body.vertex_groups}
    for name, _, _ in bones:
        if name not in body.vertex_groups:
            body.vertex_groups.new(name=name)
    fixed = 0
    for v in body.data.vertices:
        if sum(g.weight for g in v.groups if g.group in groups) > .01:
            continue
        p = v.co
        n = min(bones, key=lambda b: _seg_dist(p, b[1], b[2]))[0]
        body.vertex_groups[n].add([v.index], 1., "REPLACE")
        fixed += 1
    print("  weighted body: %d vertex groups, %d vertices fixed by nearest bone" % (len(body.vertex_groups), fixed))


ARM_BONES = tuple(b + s for b in ("UpperArm.", "LowerArm.", "Wrist.", "Fingers.") for s in SIDES)


def bind(arm, obj, src, on_arm=None):
    """Copy skin weights from the weighted body src onto obj (clothes, hair...) and hang it on the armature."""
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    for g in src.vertex_groups:
        obj.vertex_groups.new(name=g.name)
    m = obj.modifiers.new("weights", "DATA_TRANSFER")
    m.object = src
    m.use_vert_data = True
    m.data_types_verts = {"VGROUP_WEIGHTS"}
    m.vert_mapping = "POLYINTERP_NEAREST"
    m.layers_vgroup_select_src = "ALL"
    m.layers_vgroup_select_dst = "NAME"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=m.name)
    # off the arm (by on_arm(world point)), a garment must not follow the hands hanging next to it: drop arm weights there
    if on_arm:
        mwo = obj.matrix_world
        gi = {obj.vertex_groups[n].index: n for n in ARM_BONES if n in obj.vertex_groups}
        for v in obj.data.vertices:
            if on_arm(mwo @ v.co):
                continue
            for g in [g for g in v.groups if g.group in gi]:
                obj.vertex_groups[gi[g.group]].remove([v.index])
    # any vertex the transfer left without weight (it would collapse to the origin in the game) takes its nearest bone
    bones = [(b.name, arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones]
    mwo = obj.matrix_world
    for v in obj.data.vertices:
        if sum(g.weight for g in v.groups) > .05:
            continue
        p = mwo @ v.co
        n = min((b for b in bones if not on_arm or b[0] not in ARM_BONES or on_arm(p)), key=lambda b: _seg_dist(p, b[1], b[2]))[0]
        obj.vertex_groups[n].add([v.index], 1., "REPLACE")
    mw = obj.matrix_world.copy()
    obj.parent = arm
    obj.matrix_world = mw
    a = obj.modifiers.new("Armature", "ARMATURE")
    a.object = arm


def rigid_feet(arm, obj):
    """Shoes and boots don't bend: everything on Foot, the toe box on Toes, on the shoe's own side."""
    side = "L" if (obj.matrix_world @ sum((v.co for v in obj.data.vertices), Vector()) / max(1, len(obj.data.vertices))).x > 0 else "R"
    toe_y = (arm.matrix_world @ arm.data.bones["Toes." + side].head_local).y
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    f, t = obj.vertex_groups.new(name="Foot." + side), obj.vertex_groups.new(name="Toes." + side)
    mw = obj.matrix_world
    for v in obj.data.vertices:
        (t if (mw @ v.co).y < toe_y - .01 else f).add([v.index], 1., "REPLACE")


def rigid(obj, bone):
    """A solid prop (belt pouch, bag, cap, glasses, watch) rides on one bone instead of copying the skin's weights."""
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    obj.vertex_groups.new(name=bone).add([v.index for v in obj.data.vertices], 1., "REPLACE")


RIGID = (("toolbelt", "Hips"), ("backpack", "Chest"), ("chain", "Chest"), ("scarf", "Chest"), ("watch", "LowerArm.L"),
         ("cap", "Head"), ("beanie", "Head"), ("sunglasses", "Head"), ("hair_tie", "Head"), ("longhair", "Head"), ("hood", "Chest"), ("collar", "Chest"))


# ------------------------------------------------------------------ animation
def Rx(d):
    return Quaternion((1, 0, 0), math.radians(d))


def Ry(d):
    return Quaternion((0, 1, 0), math.radians(d))


def Rz(d):
    return Quaternion((0, 0, 1), math.radians(d))


I = Quaternion()


def clips(arm):
    """Each clip: (seconds, loop?, pose(t in 0..1) -> ({bone: world rotation}, hips offset)).
    Legs and spine are rotated from their rest pose; arms are aimed by direction, because the A-pose rest has the
    forearms reaching forward."""
    B = arm.data.bones
    rest_dir = {b.name: (b.tail_local - b.head_local).normalized() for b in B}
    pel = B["Hips"].head_local.z

    def point(bn, d):   # the world rotation that turns bone bn from its rest direction to direction d
        return rest_dir[bn].rotation_difference(Vector(d).normalized())

    def arms(w, s, up, fore, hand=None):
        """Upper arm along up, forearm along fore (world directions), hand and fingers following the forearm."""
        k = "." + s
        w["UpperArm" + k] = point("UpperArm" + k, up)
        w["LowerArm" + k] = point("LowerArm" + k, fore)
        w["Wrist" + k] = point("Wrist" + k, hand or fore)
        w["Fingers" + k] = point("Fingers" + k, Rx(-25) @ Vector(hand or fore))

    def hang(sg, swing=0., bend=10.):
        up = Rx(swing) @ Vector((.13 * sg, .02, -1)).normalized()
        return up, Rx(-bend) @ up

    def stand():
        w = {}
        for s, sg in (("L", 1), ("R", -1)):
            arms(w, s, *hang(sg))
        return w

    def gait(t, swing, knee, knee0, arm_sw, elbow, bob, lean):
        p = 2 * math.pi * t
        s, w = math.sin(p), {}
        w["Spine"] = Rx(lean * .5) @ Rz(4 * s)
        w["Chest"] = Rx(lean) @ Rz(-7 * s)
        w["Neck"] = w["Head"] = Rx(-lean * .3)
        for k, sg in (("L", 1), ("R", -1)):
            th = -swing * s * sg                                   # thigh: forward swing is negative
            bend = knee0 + knee * max(0., -math.cos(p if sg > 0 else p + math.pi))
            w["UpperLeg." + k] = Rx(th)
            w["LowerLeg." + k] = Rx(th + bend)
            w["Foot." + k] = w["Toes." + k] = Rx(min(25, max(-20, -th * .4)))
            arms(w, k, *hang(sg, arm_sw * s * sg + lean, elbow))
        return w, Vector((0, 0, -bob * (1 - math.cos(2 * p)) / 2))

    def aim_arms(w, kick=0.):
        w = dict(w)
        w["Chest"] = Rz(-8) @ w.get("Chest", I)
        rx = Rx(-kick)
        arms(w, "R", rx @ Vector((.12, -1, .02)), rx @ Vector((.18, -1, .05)))          # gun arm straight out
        arms(w, "L", rx @ Vector((-.15, -.55, -.75)), rx @ Vector((-.75, -.65, .1)))     # support hand under the gun
        return w

    def idle(t):
        w = stand()
        b = math.sin(2 * math.pi * t)
        w["Chest"] = Rx(1.2 * b)
        w["Head"] = Rz(3 * math.sin(2 * math.pi * t + 1))
        return w, Vector((0, 0, -.004 * (1 + b)))

    def die(t):
        k = min(1., t / .7)
        e = k * k * (3 - 2 * k)
        fall = Rx(-84 * e)
        w = {"Hips": fall, "Spine": fall, "Chest": fall, "Neck": Rx(-70 * e), "Head": Rx(-70 * e)}
        for k2, sg in (("L", 1), ("R", -1)):
            w["UpperLeg." + k2] = Rx(-70 * e) @ Rz(5 * e * sg)
            w["LowerLeg." + k2] = Rx(-55 * e) @ Rz(5 * e * sg)
            w["Foot." + k2] = w["Toes." + k2] = Rx(-40 * e)
            up = fall @ Vector((.13 * sg + .6 * e * sg, .02, -1)).normalized()
            arms(w, k2, up, up)
        return w, Vector((0, .25 * e, -(pel - .14) * e))

    def punch(t):
        w = stand()
        k = math.sin(math.pi * min(1., t / .6))
        up = Vector((-.13, .02, -1)).normalized().lerp(Vector((.15, -1, .05)), k)
        arms(w, "R", up, up.lerp(Vector((.25, -1, .05)), k) if k > .3 else Rx(-80) @ up)
        w["Chest"] = Rz(-14 * k)
        return w, Vector()

    def jump(t):
        k = math.sin(math.pi * t)
        w, _ = gait(.25, 10, 30, 10 + 40 * k, 0, 25, 0, 5)
        for s, sg in (("L", 1), ("R", -1)):
            arms(w, s, *hang(sg, -45 * k, 40))
        return w, Vector()

    rs = lambda t: gait(t, 42, 70, 18, 0, 0, .035, 8)
    return {
        "idle": (3.0, True, idle),
        "walk": (1.05, True, lambda t: gait(t, 24, 32, 6, 20, 18, .018, 3)),
        "run": (.7, True, lambda t: gait(t, 42, 70, 18, 38, 85, .035, 12)),
        "aim": (1.0, True, lambda t: (aim_arms(idle(t)[0]), Vector())),
        "shoot": (.25, True, lambda t: (aim_arms(idle(0)[0], 8 * math.sin(math.pi * t)), Vector())),
        "runShoot": (.7, True, lambda t: (aim_arms(rs(t)[0]), rs(t)[1])),
        "punch": (.5, False, punch),
        "jump": (.7, False, jump),
        "die": (1.2, False, die),
    }


def bake_clips(arm):
    """Key every clip onto its own NLA track (the glTF exporter turns each track into one named animation)."""
    sc = bpy.context.scene
    sc.render.fps = FPS
    pb = arm.pose.bones
    for b in pb:
        b.rotation_mode = "QUATERNION"
    rest = {b.name: b.matrix_local.to_3x3().to_quaternion() for b in arm.data.bones}
    parent = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}
    order = [b.name for b in arm.data.bones]            # parents come before children
    ad = arm.animation_data_create()
    for name, (dur, loop, fn) in clips(arm).items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        ad.action = act
        n = max(2, round(dur * FPS))
        for f in range(n + 1):
            t = (f / n) % 1. if loop else f / n
            W, hips = fn(t)
            for bn in order:
                Wb = W.get(bn, I)
                Wp = W.get(parent[bn], I) if parent[bn] else I
                M = rest[bn]
                q = M.inverted() @ Wp.inverted() @ Wb @ M
                pb[bn].rotation_quaternion = q
                pb[bn].keyframe_insert("rotation_quaternion", frame=f + 1)
            pb["Hips"].location = rest["Hips"].inverted() @ hips
            pb["Hips"].keyframe_insert("location", frame=f + 1)
        tr = ad.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 1, act)
        ad.action = None
    for b in pb:
        b.rotation_quaternion = I
        b.location = Vector()
    print("  baked %d clips" % len(ad.nla_tracks))
