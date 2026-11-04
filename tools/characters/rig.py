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
import math, os, json
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


def weight_body(arm, body, on_arm=None):
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
    # in the A-pose the hands hang beside the thighs, so the heat solver lets them pull hip and thigh skin: keep arm
    # influence on the arm only, and give anything left without weight its nearest non-arm bone
    if on_arm:
        mw = body.matrix_world
        gi = {body.vertex_groups[n].index: n for n in ARM_BONES if n in body.vertex_groups}
        for v in body.data.vertices:
            p = mw @ v.co
            if on_arm(p):
                continue
            for g in [g for g in v.groups if g.group in gi]:
                body.vertex_groups[gi[g.group]].remove([v.index])
            if sum(g.weight for g in v.groups) < .05:
                n = min((b for b in bones if b[0] not in ARM_BONES), key=lambda b: _seg_dist(p, b[1], b[2]))[0]
                body.vertex_groups[n].add([v.index], 1., "REPLACE")
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
    # smooth the weights so no edge spans two bones that move apart (the crotch of shorts between the legs), then normalise
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=.6, repeat=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    bpy.ops.object.mode_set(mode="OBJECT")
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

    def gait(t, swing, knee, knee0, arm_sw, elbow, bob, lean, run=False):
        """One stride. For the left leg the thigh swings forward while cos(p) > 0 (the swing phase): that's when the knee
        folds most, just after toe-off. In stance the knee stays nearly straight, the heel strikes with the toes up and
        the foot pushes off toes-down before it lifts. Arms counter-swing, the pelvis and chest twist against each other."""
        p = 2 * math.pi * t
        s, w = math.sin(p), {}
        w["Hips"] = Rz(-5 * s)
        w["Spine"] = Rx(lean * .5) @ Rz(3 * s)
        w["Chest"] = Rx(lean) @ Rz(8 * s)
        w["Neck"] = w["Head"] = Rx(-lean * .4) @ Rz(-4 * s)
        for k, sg in (("L", 1), ("R", -1)):
            q = p if sg > 0 else p + math.pi
            sq, cq = math.sin(q), math.cos(q)
            th = -swing * sq                                       # thigh: forward is negative
            sw = max(0., math.cos(q + .35)) ** 1.6                 # swing-phase knee fold, peaking just after toe-off
            bend = knee0 * (1 - sw) + knee * sw
            push = max(0., -sq) * max(0., -cq) * 2                 # late stance: heel lifts, toes push
            heel = max(0., sq) ** 6                                # heel strike: toes up
            w["UpperLeg." + k] = Rx(th)
            shin = th + bend
            w["LowerLeg." + k] = Rx(shin)
            foot = max(-25., min(45., shin * .6 * sw + 22 * push - 14 * heel))
            w["Foot." + k] = Rx(foot)
            w["Toes." + k] = Rx(foot - 18 * push)
            arms(w, k, *hang(sg, arm_sw * s * sg + lean * .6, elbow))
        b = (1 + math.cos(2 * p)) / 2 if run else (1 - math.cos(2 * p)) / 2   # running is lowest at mid-stance, walking highest
        return w, Vector((0, 0, -bob * b))

    def aim_arms(w, kick=0.):
        w = dict(w)
        w["Chest"] = Rz(-8) @ w.get("Chest", I)
        rx = Rx(-kick)
        arms(w, "R", rx @ Vector((.12, -1, .02)), rx @ Vector((.18, -1, .05)))          # gun arm straight out
        arms(w, "L", rx @ Vector((-.35, -.75, -.55)), rx @ Vector((-.48, -.8, .34)))     # support hand up on the fore-grip
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

    rs = lambda t: gait(t, 36, 100, 18, 0, 0, .04, 8, True)
    return {
        "idle": (3.0, True, idle),
        "walk": (1.1, True, lambda t: gait(t, 22, 58, 5, 16, 14, .02, 2)),
        "run": (.72, True, lambda t: gait(t, 38, 105, 18, 34, 88, .045, 11, True)),
        "aim": (1.0, True, lambda t: (aim_arms(idle(t)[0]), Vector())),
        "shoot": (.25, True, lambda t: (aim_arms(idle(0)[0], 8 * math.sin(math.pi * t)), Vector())),
        "runShoot": (.7, True, lambda t: (aim_arms(rs(t)[0]), rs(t)[1])),
        "punch": (.5, False, punch),
        "jump": (.7, False, jump),
        "die": (1.2, False, die),
    }


UAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "characters", "animations", "ual_retarget.json")


def _basis(f, s):
    f = Vector(f).normalized()
    s = Vector(s)
    s = (s - f * s.dot(f)).normalized()
    return Matrix((f, s, f.cross(s))).transposed()     # columns f, s, f x s


def retargeted(arm):
    """Clips from the retargeted Quaternius library (retarget.py), as world rotations for this rig, or {} if absent."""
    if not os.path.exists(UAL):
        return {}
    D = json.load(open(UAL))
    B = arm.data.bones
    leg = (B["UpperLeg.L"].head_local - B["LowerLeg.L"].tail_local).length
    ours = {}
    for bn, (fs, ss) in D["rest"].items():
        if bn not in B:
            continue
        ft = (B[bn].tail_local - B[bn].head_local).normalized()
        st = Vector(fs).normalized().rotation_difference(ft) @ Vector(ss)      # the source's twist axis carried onto our bone
        ours[bn] = _basis(ft, st).inverted()
    # proportion fix: the source mannequin's bulky shoulders hold its relaxed arms ~23 degrees out from the body, which on
    # our slimmer people reads as arms held out. Turn each whole arm in about the forward axis (Y) so the idle arm hangs
    # 7 degrees out; arms reaching forward (aiming) lie along that axis and are untouched.
    f0 = D["clips"]["idle"]["frames"][0]["p"]
    corr = {}
    for sd, sg in (("L", 1), ("R", -1)):
        d = Vector(f0["UpperArm." + sd][0])
        ab = math.atan2(abs(d.x), -d.z)
        corr[sd] = Quaternion((0, 1, 0), sg * (ab - math.radians(7)))
    armb = lambda bn: bn.split(".")[0] in ("UpperArm", "LowerArm", "Wrist", "Fingers")
    out = {}
    for name, c in D["clips"].items():
        rows = c["frames"]

        def pose(t, rows=rows):
            r = rows[min(len(rows) - 1, int(round(t * (len(rows) - 1))))]
            W = {}
            for bn, inv in ours.items():
                if bn not in r["p"]:
                    continue
                f, sv = (Vector(v) for v in r["p"][bn])
                if armb(bn):
                    q = corr[bn[-1]]
                    f, sv = q @ f, q @ sv
                W[bn] = (_basis(f, sv) @ inv).to_quaternion()
            return W, Vector(r["h"]) * leg
        out[name] = (max(.1, c["dur"]), c["loop"], pose)
    return out


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
    C = clips(arm)
    RT = retargeted(arm)        # professional motion where we have it; the procedural clips fill any gaps
    hold, kickhold = C["aim"][2], C["shoot"][2]
    for k in ("aim", "shoot", "reload"):
        RT.pop(k, None)         # the library's pistol stance crosses the arms; our two-handed rifle hold reads better
    ARMS = [b.name for b in arm.data.bones if b.name.split(".")[0] in ("Shoulder", "UpperArm", "LowerArm", "Wrist", "Fingers")]

    def with_hold(base, kick=None):
        def fn(t):
            W, h = base(t)
            A, _ = (kickhold if kick else hold)(t)
            W = dict(W)
            for bn in ARMS + ["Chest"]:
                if bn in A:
                    W[bn] = A[bn]
            return W, h
        return fn
    for k, src in (("runShoot", "run"), ("walkGun", "walk")):
        if src in RT:
            d, lp, fn = RT[src]
            RT[k] = (d, lp, with_hold(fn, k == "runShoot"))
    if "idle" in RT:   # aim and shoot stand on the real idle legs
        d, lp, fn = RT["idle"]
        RT["aim"] = (1., True, with_hold(fn))
        RT["shoot"] = (C["shoot"][0], True, with_hold(fn, True))
    C.update(RT)
    for name, (dur, loop, fn) in C.items():
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
