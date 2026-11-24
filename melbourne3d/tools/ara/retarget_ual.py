"""Retarget Quaternius' Universal Animation Library (CC0) clips onto the Ara player rig, in place, and export them as a
small clips-only GLB (assets/ara/ual-clips.glb) that js/people.js loads next to the CMU clips in player.glb.

  blender -b -P tools/ara/retarget_ual.py -- <player.glb> <UAL1_Standard.glb> <out.glb>

Method: per frame, every mapped bone's WORLD orientation = (source pose * source rest^-1) * target rest, where the
target rest of a limb bone is first turned to the source's rest direction (UAL is in a T pose, Ara in an A pose, so without
that the arms would end up 40 degrees too low); the torso and clavicles keep the target's rest (see KEEP_REST). The pelvis height is scaled by the hip-height ratio; its ground travel is
dropped (in place). Fingers stay as the player's rest pose, but for the jog and sprint (CURL: a loose fist).
"""
import bpy, sys, json, math
from mathutils import Matrix, Vector, Quaternion

player, ual, out = sys.argv[sys.argv.index('--') + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=player)
tgt = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
bpy.ops.import_scene.gltf(filepath=ual)
src = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o != tgt][0]

MAP = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
for s, t in (('l', 'Left'), ('r', 'Right')):
    MAP.update({f'clavicle_{s}': f'{t}Shoulder', f'upperarm_{s}': f'{t}Arm', f'lowerarm_{s}': f'{t}ForeArm', f'hand_{s}': f'{t}Hand',
                f'thigh_{s}': f'{t}UpLeg', f'calf_{s}': f'{t}Leg', f'foot_{s}': f'{t}Foot', f'ball_{s}': f'{t}ToeBase'})
ORDER = [b.name for b in tgt.data.bones if b.name in MAP.values()]  # parents first
INV = {v: k for k, v in MAP.items()}
for t in ORDER: assert INV[t] in src.data.bones, t

CLIPS = {  # UAL name -> (game name, loop)
    'Sprint_Loop': ('Sprint', True), 'Jog_Fwd_Loop': ('Jog', True), 'Jump_Start': ('Jump start', False), 'Jump_Loop': ('Jump air', True),
    'Jump_Land': ('Jump land', False), 'Punch_Jab': ('Punch jab', False), 'Punch_Cross': ('Punch cross', False),
    'Hit_Chest': ('Hit chest', False), 'Hit_Head': ('Hit head', False), 'Roll': ('Roll', False)}
# Posture: Quaternius' jog and sprint are stylised, the torso pitched 25 and 39 degrees over (hips to neck) and the shoulders
# shrugged 7 cm up. A runner leans 5-12 degrees (a little more sprinting) with the shoulders down and relaxed. So for these clips the
# torso is turned back about the body's side axis by TRUNK degrees (spread up the spine; the arms go with the chest, the head only
# partly: the source looks down at the ground over its stoop), the clavicles keep only CLAV of their motion relative to the chest, and the arms swing nearer the sides (TUCK)
TRUNK = {'Jog': -24.0, 'Sprint': -34.0}
CLAV = {'Jog': 0.35, 'Sprint': 0.35}
# running hands: a loose fist (each finger joint bent CURL degrees about its own x axis; the rig's rest hand is open)
CURL = {'Jog': (50.0, 70.0, 45.0, 20.0), 'Sprint': (55.0, 75.0, 50.0, 20.0)}  # knuckle, middle, tip, thumb
FINGERS = [f'{s}Hand{f}{i}' for s in ('Left', 'Right') for f in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb') for i in (1, 2, 3)]
TUCK = {'Jog': 14.0, 'Sprint': 12.0}  # the upper arms brought in towards the sides (degrees; the clip holds the elbows out wide)
TRUNK_SHARE = {'Hips': 0.3, 'Spine': 0.6, 'Spine1': 0.85, 'Spine2': 1.0, 'Neck': 0.7, 'Head': 0.4}
ARMS = {'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand'}
src_act = {a.name.split('_Armature')[0]: a for a in bpy.data.actions if a.name.endswith('_Armature.001')}

def rest3(arm, name): return (arm.matrix_world @ arm.data.bones[name].matrix_local).to_3x3()
def bdir(m3): return m3 @ Vector((0, 1, 0))
# The reference both rigs are compared in: each target bone's rest, turned to the source's rest direction only for the limbs
# (UAL's arms are out in a T, Ara's down in an A). The pelvis, spine, neck, head and clavicles keep Ara's own rest: both rigs stand
# neutral there, and their bones just sit differently in the body (UE's clavicle runs back from the sternum, 30 degrees off Ara's
# sideways one; its pelvis bone points 35 degrees off), so aligning those would pull the shoulders back and bend the torso over
KEEP_REST = {'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder'}
R0 = {}
for t in ORDER:
    rt, rs = rest3(tgt, t), rest3(src, INV[t])
    R0[t] = rt if t in KEEP_REST else bdir(rt).rotation_difference(bdir(rs)).to_matrix() @ rt
hipsS = src.data.bones['pelvis'].head_local.z
hipsT = tgt.data.bones['Hips'].head_local.z
scale = hipsT / hipsS
tgt.animation_data_create()
new = []
bpy.context.view_layer.objects.active = tgt
bpy.ops.object.mode_set(mode='POSE')
src.animation_data_create()
for uname, (gname, loop) in CLIPS.items():
    act = src_act.get(uname)
    if not act: print('MISSING', uname); continue
    src.animation_data.action = act
    f0, f1 = (int(round(x)) for x in act.frame_range)
    frames = list(range(f0, f1 + 1))
    na = bpy.data.actions.new(gname); tgt.animation_data.action = na
    poses = []
    for f in frames:
        bpy.context.scene.frame_set(f)
        poses.append({b.name: (src.matrix_world @ b.matrix).copy() for b in src.pose.bones})
    # (UAL's loops already end on their first pose: that last key stays, so the clip's length is the whole cycle)
    ref = poses[0]['pelvis'].translation
    trunk = math.radians(TRUNK.get(gname, 0.0))
    clav = CLAV.get(gname, 1.0)
    tuck = math.radians(TUCK.get(gname, 0.0))
    for i, f in enumerate(frames):
        P = poses[i]
        for t in ORDER:
            s = INV[t]
            Rs = P[s].to_3x3(); Rs0 = rest3(src, s)
            R = (Rs @ Rs0.inverted()) @ R0[t]
            share = TRUNK_SHARE.get(t, 1.0 if t in ARMS else 0.0)
            if trunk and share: R = Matrix.Rotation(trunk * share, 3, 'X') @ R
            if tuck and t in ARMS and 'Shoulder' not in t: R = Matrix.Rotation(tuck if t.startswith('Left') else -tuck, 3, 'Y') @ R
            pb = tgt.pose.bones[t]
            if clav < 1 and t in ('LeftShoulder', 'RightShoulder'):
                # the clavicle at rest on the chest as it is now, then CLAV of the way to the clip's
                rest_on = pb.parent.matrix.to_3x3() @ (pb.parent.bone.matrix_local.to_3x3().inverted() @ pb.bone.matrix_local.to_3x3())
                R = rest_on.to_quaternion().slerp(R.to_quaternion(), clav).to_matrix()
            if pb.parent:
                rel = pb.parent.bone.matrix_local.inverted() @ pb.bone.matrix_local
                head = (pb.parent.matrix @ rel).translation
            else:
                rest_h = pb.bone.matrix_local.translation
                head = Vector((rest_h.x, rest_h.y, rest_h.z + (P[s].translation.z - hipsS) * scale))  # in place: height only
            pb.matrix = Matrix.Translation(head) @ R.to_4x4()
            bpy.context.view_layer.update()
            pb.keyframe_insert('rotation_quaternion', frame=i)
            if not pb.parent: pb.keyframe_insert('location', frame=i)
        if gname in CURL:
            k1, k2, k3, kt = (math.radians(x) for x in CURL[gname])
            for n in FINGERS:
                pb = tgt.pose.bones.get(n)
                if not pb: continue
                ang = (kt * (0.5 if n.endswith('1') else 1.0)) if 'Thumb' in n else (k1, k2, k3)[int(n[-1]) - 1]
                pb.rotation_mode = 'QUATERNION'
                pb.rotation_quaternion = Quaternion((1, 0, 0), ang)
                pb.keyframe_insert('rotation_quaternion', frame=i)
    na.use_fake_user = True
    new.append(na)
    print('CLIP', gname, len(frames), 'frames')
# export only the armature with the new actions
for a in list(bpy.data.actions):
    if a not in new: bpy.data.actions.remove(a)
bpy.ops.object.mode_set(mode='OBJECT')
for o in list(bpy.data.objects):
    if o != tgt: bpy.data.objects.remove(o)
tgt.animation_data.action = None
for tr in list(tgt.animation_data.nla_tracks): tgt.animation_data.nla_tracks.remove(tr)
for a in new:
    tr = tgt.animation_data.nla_tracks.new(); tr.name = a.name; tr.strips.new(a.name, 0, a)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=False, export_force_sampling=True, export_optimize_animation_size=True,
                          export_frame_range=False, export_yup=True)
