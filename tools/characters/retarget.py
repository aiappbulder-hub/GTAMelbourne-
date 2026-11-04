"""Retargets professional animation (Quaternius Universal Animation Library, CC0) onto the GTA Melbourne rig.

    python tools/characters/retarget.py <UAL1.glb> [out.json]

The source skeleton (Unreal-style names, its own rest pose) differs from ours (A-pose, our own names), so clips can't be
copied bone for bone. Instead, per frame and per body part, we record two world-space vectors from the source:
  f - the part's direction (e.g. upper arm: shoulder joint -> elbow joint)
  s - a side axis that carries its twist (the source bone's own X axis, made perpendicular to f)
plus the same pair in the source's rest pose. rig.py turns these into rotations for any of our characters: the rotation
that takes our part's rest frame to the source's posed frame, after matching the two rest frames by the smallest turn.
That keeps the motion's directions and twists while ignoring the difference in rest poses and proportions.
The hips also carry a vertical bob, scaled by leg length. Output: characters/animations/ual_retarget.json.
"""
import sys, os, json, math
import bpy
from mathutils import Vector

src = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else sys.argv[1]
out = (sys.argv[sys.argv.index("--") + 2] if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 2 else
       os.path.join(os.path.dirname(__file__), "..", "..", "characters", "animations", "ual_retarget.json"))

# our part -> (owner bone in the source, segment from joint a to joint b in the source)
PARTS = {
    "Hips": ("pelvis", "pelvis", "spine_02"), "Spine": ("spine_01", "spine_01", "spine_03"), "Chest": ("spine_03", "spine_03", "neck_01"),
    "Neck": ("neck_01", "neck_01", "Head"), "Head": ("Head", "Head", "Head:tail"),
}
for s, x in (("L", "l"), ("R", "r")):
    PARTS.update({
        "Shoulder." + s: ("clavicle_" + x, "clavicle_" + x, "upperarm_" + x),
        "UpperArm." + s: ("upperarm_" + x, "upperarm_" + x, "lowerarm_" + x),
        "LowerArm." + s: ("lowerarm_" + x, "lowerarm_" + x, "hand_" + x),
        "Wrist." + s: ("hand_" + x, "hand_" + x, "middle_01_" + x),
        "Fingers." + s: ("middle_01_" + x, "middle_01_" + x, "middle_04_leaf_" + x),
        "UpperLeg." + s: ("thigh_" + x, "thigh_" + x, "calf_" + x),
        "LowerLeg." + s: ("calf_" + x, "calf_" + x, "foot_" + x),
        "Foot." + s: ("foot_" + x, "foot_" + x, "ball_" + x),
        "Toes." + s: ("ball_" + x, "ball_" + x, "ball_leaf_" + x),
    })

# our clip -> source clip(s). runShoot takes the legs of one clip and the upper body of another.
CLIPS = {"idle": "Idle_Loop", "walk": "Walk_Loop", "run": "Jog_Fwd_Loop", "sprint": "Sprint_Loop", "aim": "Pistol_Aim_Neutral",
         "shoot": "Pistol_Shoot", "punch": "Punch_Cross", "jump": "Jump_Start", "die": "Death01", "reload": "Pistol_Reload",
         "hit": "Hit_Chest", "crouch": "Crouch_Idle_Loop", "walkGun": ("Walk_Loop", "Pistol_Idle_Loop"),
         "runShoot": ("Jog_Fwd_Loop", "Pistol_Aim_Neutral")}
LOOP = {"idle", "walk", "run", "sprint", "aim", "crouch", "walkGun", "runShoot"}
UPPER = {"Spine", "Chest", "Neck", "Head"} | {b + "." + s for b in ("Shoulder", "UpperArm", "LowerArm", "Wrist", "Fingers") for s in "LR"}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
mw = arm.matrix_world
acts = {a.name: a for a in bpy.data.actions}
print("source clips:", len(acts))


def joint(mats, name):
    if name.endswith(":tail"):
        return mats[name[:-5]][1]
    return mats[name][0]


def frames(get):
    """{part: (f, s)} using get(bone) -> (head, tail, x-axis) in world."""
    mats = {b: get(b) for b in {p[0] for p in PARTS.values()} | {p[1] for p in PARTS.values()} | {p[2].split(":")[0] for p in PARTS.values()}}
    out = {}
    for part, (own, a, b) in PARTS.items():
        f = (joint(mats, b) - joint(mats, a)).normalized()
        x = mats[own][2]
        s = (x - f * x.dot(f))
        if s.length < 1e-4:
            s = Vector((1, 0, 0)) - f * f.x
        out[part] = (f, s.normalized())
    return out


def rest_get(name):
    b = arm.data.bones[name]
    m = mw @ b.matrix_local
    return (mw @ b.head_local, mw @ b.tail_local, m.to_3x3().col[0].normalized())


def pose_get(name):
    pb = arm.pose.bones[name]
    m = mw @ pb.matrix
    return (mw @ pb.head, mw @ pb.tail, m.to_3x3().col[0].normalized())


rest = frames(rest_get)
pel0 = rest_get("pelvis")[0]
leg = (rest_get("thigh_l")[0] - rest_get("foot_l")[0]).length
ad = arm.animation_data_create()
sc = bpy.context.scene


def sample(name):
    act = acts[name]
    ad.action = act
    f0, f1 = (int(round(v)) for v in act.frame_range)
    rows = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        fr = frames(pose_get)
        pel = pose_get("pelvis")[0]
        rows.append({"p": {k: [list(v[0]), list(v[1])] for k, v in fr.items()}, "h": list((pel - pel0) / leg)})
    return rows, (f1 - f0) / (sc.render.fps or 30)


data = {"rest": {k: [list(v[0]), list(v[1])] for k, v in rest.items()}, "clips": {}}
for ours, theirs in CLIPS.items():
    if isinstance(theirs, tuple):
        lo, d = sample(theirs[0])
        up, _ = sample(theirs[1])
        rows = []
        for i, r in enumerate(lo):
            u = up[min(len(up) - 1, round(i / max(1, len(lo) - 1) * (len(up) - 1)))]
            rows.append({"p": {k: (u["p"][k] if k in UPPER else r["p"][k]) for k in r["p"]}, "h": r["h"]})
    else:
        rows, d = sample(theirs)
    data["clips"][ours] = {"dur": d, "loop": ours in LOOP, "frames": rows}
    print("  %-9s <- %-32s %3d frames %.2fs" % (ours, theirs, len(rows), d))
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
json.dump(data, open(out, "w"), separators=(",", ":"))
print("wrote", out, os.path.getsize(out) // 1024, "KB")
