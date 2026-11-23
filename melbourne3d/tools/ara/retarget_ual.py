"""Retarget Quaternius' Universal Animation Library (CC0) clips onto the Ara player rig, in place, and export them as a
small clips-only GLB (assets/ara/ual-clips.glb) that js/people.js loads next to the CMU clips in player.glb.

  blender -b -P tools/ara/retarget_ual.py -- <player.glb> <UAL1_Standard.glb> <out.glb>

Method: per frame, every mapped bone's WORLD orientation = (source pose * source rest^-1) * target rest, where the
target rest is first turned to the source's rest direction (UAL is in a T pose, Ara in an A pose, so without that the
arms would end up 40 degrees too low). The pelvis height is scaled by the hip-height ratio; its ground travel is
dropped (in place). Fingers stay as the player's rest pose.
"""
import bpy, sys, json
from mathutils import Matrix, Vector

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
src_act = {a.name.split('_Armature')[0]: a for a in bpy.data.actions if a.name.endswith('_Armature.001')}

def rest3(arm, name): return (arm.matrix_world @ arm.data.bones[name].matrix_local).to_3x3()
def bdir(m3): return m3 @ Vector((0, 1, 0))
# the target's rest turned to the source's rest direction
R0 = {}
for t in ORDER:
    rt, rs = rest3(tgt, t), rest3(src, INV[t])
    R0[t] = bdir(rt).rotation_difference(bdir(rs)).to_matrix() @ rt
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
    for i, f in enumerate(frames):
        P = poses[i]
        for t in ORDER:
            s = INV[t]
            Rs = P[s].to_3x3(); Rs0 = rest3(src, s)
            R = (Rs @ Rs0.inverted()) @ R0[t]
            pb = tgt.pose.bones[t]
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
