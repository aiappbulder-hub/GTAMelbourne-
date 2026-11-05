"""Put a character on the Quaternius Universal Animation Library skeleton (CC0), so the library's professionally keyframed
clips play exactly as authored, with no retargeting maths between the animator and the game.

    python ual_rig.py <UAL1.glb>  one-off: writes characters/source/ual_clips.glb (the skeleton, the clips we use, a stand-in mesh)
    convert(arm, objs, body)     per character, during the build (stage1_base.py)

convert():
  1. poses our measured rig into the library skeleton's rest pose (a T-pose) only to measure the joints there; the meshes
     are not re-posed;
  2. copies the library skeleton and moves each joint onto those joints, keeping every bone's orientation, then makes an
     A-pose copy (each bone moved rigidly with its part back to the pose the meshes were built in) and bakes every clip
     onto it so each bone's posed transform equals the original's: the animator's motion, exactly;
  3. carries every mesh's skin weights from our rig onto the library's bones by name (WMAP), sharing a weight where one
     of our bones spans two of theirs; the library's bone shapes would mislead automatic weighting, so it isn't redone;
  4. attaches the clips as NLA tracks, named for the game.
"""
import os, math, json
import bpy
from mathutils import Vector, Matrix
import rig

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "characters"))
CLIPS_GLB = os.path.join(ROOT, "source", "ual_clips.glb")
UAL_JSON = os.path.join(ROOT, "animations", "ual_retarget.json")

# game clip -> library clip
CLIPS = {"idle": "Idle_Loop", "walk": "Walk_Loop", "run": "Jog_Fwd_Loop", "sprint": "Sprint_Loop", "aim": "Pistol_Aim_Neutral",
         "aimIdle": "Pistol_Idle_Loop", "shoot": "Pistol_Shoot", "reload": "Pistol_Reload", "punch": "Punch_Cross", "jump": "Jump_Start",
         "die": "Death01", "hit": "Hit_Chest", "crouch": "Crouch_Idle_Loop", "talk": "Idle_Talking_Loop"}

# library bone -> (our bone, 'head' | 'tail') whose position it takes
JOINTS = {"pelvis": ("Hips", "head"), "spine_01": ("Spine", "head"), "spine_03": ("Chest", "head"), "neck_01": ("Neck", "head"),
          "Head": ("Head", "head")}
for s, x in (("L", "l"), ("R", "r")):
    JOINTS.update({"clavicle_" + x: ("Shoulder." + s, "head"), "upperarm_" + x: ("UpperArm." + s, "head"),
                   "lowerarm_" + x: ("LowerArm." + s, "head"), "hand_" + x: ("Wrist." + s, "head"),
                   "thigh_" + x: ("UpperLeg." + s, "head"), "calf_" + x: ("LowerLeg." + s, "head"),
                   "foot_" + x: ("Foot." + s, "head"), "ball_" + x: ("Toes." + s, "head"), "ball_leaf_" + x: ("Toes." + s, "tail")})
# our skin weights carried onto the library's bones (fractions where one of ours spans two of theirs)
WMAP = {"Hips": {"pelvis": 1.}, "Spine": {"spine_01": .55, "spine_02": .45}, "Chest": {"spine_02": .3, "spine_03": .7},
        "Neck": {"neck_01": 1.}, "Head": {"Head": 1.}}
for s, x in (("L", "l"), ("R", "r")):
    WMAP.update({"Shoulder." + s: {"clavicle_" + x: 1.}, "UpperArm." + s: {"upperarm_" + x: 1.}, "LowerArm." + s: {"lowerarm_" + x: 1.},
                 "Wrist." + s: {"hand_" + x: 1.}, "Fingers." + s: {"hand_" + x: 1.}, "UpperLeg." + s: {"thigh_" + x: 1.},
                 "LowerLeg." + s: {"calf_" + x: 1.}, "Foot." + s: {"foot_" + x: 1.}, "Toes." + s: {"ball_" + x: 1.}})


def _import(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    return next(o for o in new if o.type == "ARMATURE"), new


def extract(src):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 24
    U, new = _import(src)
    meshes = [o for o in new if o.type == "MESH"]
    for o in new:   # keep one mesh, cut to a few hundred triangles, so the exporter writes a real skin (and so an armature)
        if o is not U and o is not meshes[0]:
            bpy.data.objects.remove(o)
    m = meshes[0]
    bpy.context.view_layer.objects.active = m
    d = m.modifiers.new("dec", "DECIMATE")
    d.ratio = .02
    bpy.ops.object.modifier_apply(modifier=d.name)
    ad = U.animation_data_create()
    ad.action = None
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    keep = set(CLIPS.values())
    for a in bpy.data.actions:
        if a.name in keep:
            tr = ad.nla_tracks.new()
            tr.name = a.name
            st = tr.strips.new(a.name, int(a.frame_range[0]), a)
    bpy.ops.object.select_all(action="DESELECT")
    U.select_set(True)
    m.select_set(True)
    bpy.context.view_layer.objects.active = U
    os.makedirs(os.path.dirname(CLIPS_GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=CLIPS_GLB, export_format="GLB", use_selection=True, export_animations=True,
                              export_animation_mode="NLA_TRACKS", export_skins=True, export_materials="NONE")
    print("wrote", CLIPS_GLB, os.path.getsize(CLIPS_GLB) // 1024, "KB")


def _tpose(arm):
    """Pose our rig into the library's rest pose (from the retarget data's rest frames)."""
    D = json.load(open(UAL_JSON))
    B = arm.data.bones
    W = {}
    for bn, (fs, ss) in D["rest"].items():
        if bn not in B:
            continue
        ft = (B[bn].tail_local - B[bn].head_local).normalized()
        st = Vector(fs).normalized().rotation_difference(ft) @ Vector(ss)
        W[bn] = (rig._basis(Vector(fs), Vector(ss)) @ rig._basis(ft, st).inverted()).to_quaternion()
    rest = {b.name: b.matrix_local.to_3x3().to_quaternion() for b in B}
    I = W.get("_none", None) or Matrix.Identity(3).to_quaternion()
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        par = B[pb.name].parent
        Wb, Wp = W.get(pb.name, I), (W.get(par.name, I) if par else I)
        M = rest[pb.name]
        pb.rotation_quaternion = M.inverted() @ Wp.inverted() @ Wb @ M
        pb.location = Vector()
    if arm.animation_data:
        arm.animation_data.action = None
        for t in arm.animation_data.nla_tracks:
            t.mute = True
    bpy.context.view_layer.update()


def _bake_pose(o):
    """Apply the armature deformation to the mesh and detach it from the old rig."""
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        if m.type == "ARMATURE":
            bpy.ops.object.modifier_apply(modifier=m.name)
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw


def _remap_weights(o):
    """Our rig's (good, A-pose) skin weights renamed and merged onto the library's bones."""
    names = {g.index: g.name for g in o.vertex_groups}
    rows = []
    for v in o.data.vertices:
        acc = {}
        for g in v.groups:
            for ual, k in WMAP.get(names.get(g.group, ""), {}).items():
                acc[ual] = acc.get(ual, 0.) + g.weight * k
        rows.append(acc)
    for g in list(o.vertex_groups):
        o.vertex_groups.remove(g)
    groups = {}
    for i, acc in enumerate(rows):
        tot = sum(acc.values()) or 1.
        for ual, w in acc.items():
            if w / tot < .005:
                continue
            if ual not in groups:
                groups[ual] = o.vertex_groups.new(name=ual)
            groups[ual].add([i], w / tot, "REPLACE")


def convert(arm, objs, body):
    if not (os.path.exists(CLIPS_GLB) and os.path.exists(UAL_JSON)):
        print("  (no library skeleton: keeping our own rig)")
        return arm
    sc = bpy.context.scene
    sc.render.fps = 24
    _tpose(arm)
    jw = {}
    XT, XA = {}, {}   # each of our parts, in the library's T-pose and in our A-pose (world matrices)
    for pb in arm.pose.bones:
        jw[pb.name] = (arm.matrix_world @ pb.head, arm.matrix_world @ pb.tail)
        XT[pb.name] = arm.matrix_world @ pb.matrix
        XA[pb.name] = arm.matrix_world @ arm.data.bones[pb.name].matrix_local
    for o in objs:   # leave the meshes in their own (A-)pose and let go of our rig
        for m in list(o.modifiers):
            if m.type == "ARMATURE":
                o.modifiers.remove(m)
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    U, new = _import(CLIPS_GLB)
    for o in new:
        if o is not U:
            bpy.data.objects.remove(o)
    acts = {a.name: a for a in bpy.data.actions}
    # fit the library skeleton to this character, keeping every bone's orientation
    bpy.ops.object.select_all(action="DESELECT")
    U.select_set(True)
    bpy.context.view_layer.objects.active = U
    inv = U.matrix_world.inverted()
    bpy.ops.object.mode_set(mode="EDIT")
    eb = U.data.edit_bones
    orig = {b.name: (b.head.copy(), b.tail.copy(), b.roll) for b in eb}
    target = {}
    for bn, (ours, end) in JOINTS.items():
        if bn in eb and ours in jw:
            target[bn] = inv @ jw[ours][0 if end == "head" else 1]
    # spine_02 between spine_01 and spine_03; the root under the pelvis, on the floor
    if "spine_02" in eb and "spine_01" in target and "spine_03" in target:
        target["spine_02"] = (target["spine_01"] + target["spine_03"]) / 2
    # fingers and thumbs keep their place relative to the hand, scaled to the hand
    for s, x in (("L", "l"), ("R", "r")):
        hand = "hand_" + x
        if hand not in target:
            continue
        uh = orig[hand][0]
        tip_ours = inv @ jw["Fingers." + s][1]
        tip_ual = orig["middle_04_leaf_" + x][0] if "middle_04_leaf_" + x in orig else orig[hand][1]
        k = (tip_ours - target[hand]).length / max(1e-6, (tip_ual - uh).length)
        for b in eb:
            if b.name.endswith("_" + x) and any(b.name.startswith(f) for f in ("index", "middle", "ring", "pinky", "thumb")):
                target[b.name] = target[hand] + (orig[b.name][0] - uh) * k
    if "root" in eb and "pelvis" in target:
        target["root"] = Vector((target["pelvis"].x, target["pelvis"].y, (inv @ Vector((0, 0, 0))).z))
    for b in eb:
        b.use_connect = False
    for b in eb:
        h, t, roll = orig[b.name]
        d = (t - h)
        n = target.get(b.name, None)
        if n is None:
            p = b.parent
            n = target.get(p.name, orig[p.name][0]) + (h - orig[p.name][0]) if p else h
            target[b.name] = n
        kids = [c for c in eb if c.parent == b and c.name in target]
        length = d.length
        if kids:
            length = max(.01, min((target[c.name] - n).length for c in kids)) if b.name not in ("root",) else d.length
        b.head = n
        b.tail = n + d.normalized() * length
        b.roll = roll
    bpy.ops.object.mode_set(mode="OBJECT")
    for b in U.data.bones:
        b.use_deform = not (b.name == "root" or b.name.endswith("_leaf_l") or b.name.endswith("_leaf_r") or b.name.endswith("leaf"))
    UA = _a_pose_copy(U, XT, XA)
    for o in objs:   # skin: our rig's weights, carried over by name (the library's bone shapes would mislead automatic weighting)
        _remap_weights(o)
        _hang(o, UA)
    ad = UA.animation_data_create()
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    n = 0
    for ours, theirs in CLIPS.items():
        a = acts.get(theirs)
        if not a:
            continue
        b = _bake(U, UA, a, ours)
        tr = ad.nla_tracks.new()
        tr.name = ours
        tr.strips.new(ours, int(b.frame_range[0]), b)
        n += 1
    ad.action = None
    bpy.data.objects.remove(U)
    for a in list(acts.values()):
        bpy.data.actions.remove(a)
    UA.name = arm.name
    bpy.data.objects.remove(arm)
    print("  on the library skeleton: %d bones, %d clips" % (len(UA.data.bones), n))
    return UA


def _part(b):
    """Which of our parts carries a library bone (walking up to the nearest mapped bone); None for the root."""
    while b is not None:
        if b.name in JOINTS:
            ours, end = JOINTS[b.name]
            return ours
        if b.name == "spine_02":
            return "Spine"
        b = b.parent
    return None


def _a_pose_copy(U, XT, XA):
    """A copy of the fitted skeleton whose rest pose is our A-pose: every bone moved rigidly with the part of ours it
    sits in, from the T-pose back to the A-pose. The meshes then bind in the shape they were built in, with no re-posing."""
    UA = U.copy()
    UA.data = U.data.copy()
    UA.animation_data_clear()
    U.users_collection[0].objects.link(UA)
    bpy.ops.object.select_all(action="DESELECT")
    UA.select_set(True)
    bpy.context.view_layer.objects.active = UA
    inv = UA.matrix_world.inverted()
    mats = {}
    for b in UA.data.bones:
        P = _part(b)
        M = UA.matrix_world @ b.matrix_local
        mats[b.name] = (inv @ XA[P] @ XT[P].inverted() @ M) if P in XT else inv @ M
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in UA.data.edit_bones:
        L = eb.length
        eb.matrix = mats[eb.name]
        eb.length = L
    bpy.ops.object.mode_set(mode="OBJECT")
    return UA


def _bake(U, UA, act, name):
    """Bake a clip from the T-pose skeleton onto the A-pose one, so every bone's posed transform is the same."""
    sc = bpy.context.scene
    ad = U.animation_data_create()
    ad.action = act
    if hasattr(ad, "action_slot") and ad.action_slot is None and len(act.slots):
        ad.action_slot = act.slots[0]
    out = bpy.data.actions.new(name)
    bd = UA.animation_data_create()
    bd.action = out
    rest = {b.name: b.matrix_local for b in UA.data.bones}
    f0, f1 = (int(round(v)) for v in act.frame_range)
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        tgt = {pb.name: pb.matrix.copy() for pb in U.pose.bones}
        for pb in UA.pose.bones:
            b = pb.bone
            if b.parent:
                base = tgt[b.parent.name] @ rest[b.parent.name].inverted() @ rest[b.name]
            else:
                base = rest[b.name]
            pb.rotation_mode = "QUATERNION"
            pb.matrix_basis = base.inverted() @ tgt[b.name]
            for path in ("location", "rotation_quaternion", "scale"):
                pb.keyframe_insert(path, frame=f, group=pb.name)
    ad.action = None
    bd.action = None
    return out


def _hang(o, U):
    mw = o.matrix_world.copy()
    o.parent = U
    o.matrix_world = mw
    o.modifiers.new("Armature", "ARMATURE").object = U


if __name__ == "__main__":
    import sys
    extract(sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else sys.argv[-1])
