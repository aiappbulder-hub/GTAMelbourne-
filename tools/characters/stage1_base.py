"""STAGE 1 - the two base characters for GTA Melbourne: the Aussie Bloke and the Aussie Girl.

Run headless with Blender's Python module (bpy 4.x/5.x):
    python tools/characters/stage1_base.py [names...]

For each character it:
  1. shapes the MakeHuman base mesh (CC0) with body targets,
  2. paints a skin texture (tone variation, lips, brows, stubble, blush, scalp shading) and bakes it to a
     2K map with Cycles,
  3. builds eyeballs with a painted iris, eyelashes, and hair grown from the scalp,
  4. dresses them in their signature outfit as separate clothing meshes cut from the body surface,
  5. saves characters/base_models/<name>.blend, exports characters/exports/<name>.glb (outfit) and
     <name>_base.glb (underwear base for the modular wardrobe), and renders previews.

Everything is described by data in CHARACTERS, so later stages add people by adding entries.
"""
import sys, os, math, random
import bpy, bmesh
from mathutils import Vector, noise as mnoise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mhbase import Base, reset, srgb, tris, ROOT, SRC   # noqa: E402
import textures   # noqa: E402

OUT = {k: os.path.join(ROOT, k) for k in ("base_models", "exports", "previews", "textures")}
for p in OUT.values():
    os.makedirs(p, exist_ok=True)

CHARACTERS = {
    "aussie_bloke": dict(
        sex="male", seed=11,
        targets={"universal-male-young-averagemuscle-averageweight": .5, "universal-male-young-maxmuscle-averageweight": .5,
                 "male-young-averagemuscle-averageweight-maxheight": .1, "caucasian-male-young": 1,
                 "male-young-averagemuscle-averageweight-idealproportions": 1},
        skin="#c08a63", lips="#a86a5c", brows="#3b2a1e", hair_col="#4a3324", eye="#5b7a3a", stubble=.75, blush=.12,
        hair="crop",
        outfit=[("tee", dict(col="#18191b", print="southerly")), ("cargo_shorts", dict(col="#3a3c3f")),
                ("sneakers", dict(col="#f2f2f2", sole="#e8e8e8", trim="#1c1c1c")), ("sunglasses", {})],
        underwear=[("briefs", dict(col="#2b3550"))]),
    "bearded_gaz": dict(
        sex="male", seed=37,
        targets={"universal-male-young-averagemuscle-averageweight": .35, "universal-male-old-averagemuscle-averageweight": .15,
                 "universal-male-young-maxmuscle-maxweight": .3, "universal-male-young-averagemuscle-maxweight": .2,
                 "male-young-averagemuscle-averageweight-maxheight": .25, "caucasian-male-young": .8, "caucasian-male-old": .2,
                 "male-young-averagemuscle-averageweight-idealproportions": .6},
        skin="#c48662", lips="#9c5f52", brows="#3a2a1e", hair_col="#3a2a1e", beard_col="#4a3426", eye="#6b5a3a", stubble=.3, blush=.18,
        hair="bald", beard=1.0,
        outfit=[("tee", dict(col="#1d2b45", print="yarra_rats")), ("cargo_shorts", dict(col="#8b7d5a")),
                ("sneakers", dict(col="#2b2d30", sole="#d8d8d8", trim="#c9a227"))],
        underwear=[("briefs", dict(col="#3b3f45"))]),
    # the player character, from Trent's reference sheet: 45, 183 cm, 69 kg, lean runner's build
    "trent": dict(
        sex="male", seed=45,
        targets={"universal-male-young-maxmuscle-minweight": .75, "universal-male-young-maxmuscle-averageweight": .7,   # muscular, still lean
                 "universal-male-old-maxmuscle-minweight": .05,
                 "male-young-averagemuscle-averageweight-maxheight": .15,
                 "caucasian-male-young": .75, "caucasian-male-old": .25, "male-young-averagemuscle-averageweight-idealproportions": 1},
        skin="#c68a62", lips="#a0614f", brows="#2e2620", hair_col="#2e2620", beard_col="#34291f", eye="#5a4630", stubble=.2, blush=.15,
        hair="bald", beard=.8,
        outfit=[("tee", dict(col="#141416", print="melb_run")), ("run_shorts", dict(col="#111113")),
                ("sneakers", dict(col="#f2f2f2", sole="#f4f4f4", trim="#ff6a2a"))],
        underwear=[("briefs", dict(col="#1c1c1e"))]),
    # ---- STAGE 4: the rest of Melbourne
    "tradie_dazza": dict(   # tradie in his 30s: Victorian hi-vis, cargo work shorts, steel caps, tool belt, cap and sunnies
        sex="male", seed=51,
        targets={"universal-male-young-maxmuscle-averageweight": .5, "universal-male-young-averagemuscle-maxweight": .3,
                 "universal-male-young-averagemuscle-averageweight": .2, "caucasian-male-young": 1, "male-young-averagemuscle-averageweight-idealproportions": .7},
        skin="#b97a52", lips="#9a5e4c", brows="#4a3220", hair_col="#5a3b22", eye="#4f6f8f", stubble=.85, blush=.25, hair="crop", tattoo=["forearm_r"],
        outfit=[("hivis", dict(col="#ff6a13")), ("cargo_shorts", dict(col="#1f2a44")), ("work_boots", dict(col="#6b4a2e")),
                ("toolbelt", dict(col="#5a3a22")), ("cap", dict(col="#1f2a44")), ("sunglasses", {})],
        underwear=[("briefs", dict(col="#2b3550"))]),
    "student_minh": dict(   # uni student, about 20: hoodie, jeans, backpack
        sex="male", seed=61,
        targets={"universal-male-young-averagemuscle-minweight": .6, "universal-male-young-minmuscle-averageweight": .4, "asian-male-young": 1},
        skin="#d9b08c", lips="#b07a66", brows="#151210", hair_col="#151210", eye="#3a2a1e", stubble=0, blush=.12, hair="crop",
        outfit=[("hoodie", dict(col="#3a3d42")), ("jeans", dict(col="#7b9cc4")), ("sneakers", dict(col="#f2f2f2", sole="#e8e8e8", trim="#f2f2f2")),
                ("backpack", dict(col="#2a2f3a"))],
        underwear=[("briefs", dict(col="#2b2b2e"))]),
    "student_amara": dict(  # uni student, about 20: graphic tee, jeans, bun, backpack
        sex="female", seed=67,
        targets={"universal-female-young-averagemuscle-averageweight": .7, "universal-female-young-averagemuscle-minweight": .3,
                 "african-female-young": .85, "caucasian-female-young": .15, "female-young-averagemuscle-averageweight-idealproportions": .6},
        skin="#7a4a30", lips="#6a3a2c", brows="#1a1210", hair_col="#1a1210", eye="#2a1a12", stubble=0, blush=.1, hair="bun",
        outfit=[("tee", dict(col="#f2efe8", print="southerly")), ("jeans", dict(col="#2e3b55")), ("sneakers", dict(col="#f4f4f4", sole="#ececec", trim="#c46a3a")),
                ("backpack", dict(col="#c46a3a"))],
        underwear=[("briefs", dict(col="#1c1c1e")), ("bra", dict(col="#1c1c1e"))]),
    "gym_jono": dict(       # fitness bloke: training singlet, shorts, watch
        sex="male", seed=71,
        targets={"universal-male-young-maxmuscle-minweight": .6, "universal-male-young-maxmuscle-averageweight": .4,
                 "caucasian-male-young": .5, "african-male-young": .5, "male-young-averagemuscle-averageweight-idealproportions": 1},
        skin="#9a6444", lips="#7a4a3a", brows="#1a120c", hair_col="#1a120c", eye="#3a2a1e", stubble=.45, blush=.1, hair="crop",
        outfit=[("singlet", dict(col="#d23b2a")), ("run_shorts", dict(col="#141416")), ("sneakers", dict(col="#1a1a1a", sole="#f2f2f2", trim="#ff6a2a")),
                ("watch", {})],
        underwear=[("briefs", dict(col="#141416"))]),
    "gym_kayla": dict(      # fitness: sports crop, leggings, ponytail
        sex="female", seed=73,
        targets={"universal-female-young-averagemuscle-minweight": .6, "universal-female-young-maxmuscle-minweight": .4, "caucasian-female-young": 1,
                 "female-young-averagemuscle-averageweight-idealproportions": 1},
        skin="#e0b48f", lips="#c07a6a", brows="#3a2416", hair_col="#3a2416", eye="#4f6f5a", stubble=0, blush=.28, hair="ponytail",
        outfit=[("bra", dict(col="#2f6bd8")), ("leggings", dict(col="#141416")), ("sneakers", dict(col="#f2f2f2", sole="#f4f4f4", trim="#ff4fa3")),
                ("watch", {})],
        underwear=[("briefs", dict(col="#141416"))]),
    "street_kai": dict(     # Melbourne streetwear: black graphic tee, cargo pants, cap backwards, chain
        sex="male", seed=79,
        targets={"universal-male-young-averagemuscle-minweight": .7, "universal-male-young-averagemuscle-averageweight": .3,
                 "asian-male-young": .5, "caucasian-male-young": .5},
        skin="#c99a72", lips="#a06a58", brows="#0f0d0c", hair_col="#0f0d0c", eye="#2a1e14", stubble=.2, blush=.1, hair="crop", tattoo=["calf_l"],
        outfit=[("tee", dict(col="#141416", print="yarra_rats")), ("cargo_pants", dict(col="#4b5240")),
                ("sneakers", dict(col="#f4f4f4", sole="#e0e0e0", trim="#141416")), ("cap", dict(col="#141416", back=True)), ("chain", {})],
        underwear=[("briefs", dict(col="#141416"))]),
    "old_bruce": dict(      # older suburban bloke at the footy: jumper over a long-sleeve, slacks, scarf and beanie
        sex="male", seed=83,
        targets={"universal-male-old-averagemuscle-averageweight": .5, "universal-male-old-averagemuscle-maxweight": .5, "caucasian-male-old": 1},
        skin="#d6a184", lips="#a8705e", brows="#b9b4ae", hair_col="#b9b4ae", eye="#5a7a9a", stubble=.35, blush=.35, hair="crop",
        outfit=[("longsleeve", dict(col="#f2f2f2")), ("footy_jumper", dict(col="#1d2b5c", col2="#f2f2f2")), ("work_pants", dict(col="#c2b38f")),
                ("work_boots", dict(col="#3a2a1e")), ("scarf", dict(col="#1d2b5c", col2="#f2f2f2")), ("beanie", dict(col="#1d2b5c"))],
        underwear=[("briefs", dict(col="#3b3f45"))]),
    "old_marg": dict(       # older suburban woman in a Melbourne rain jacket
        sex="female", seed=89,
        targets={"universal-female-old-averagemuscle-averageweight": .6, "universal-female-old-minmuscle-maxweight": .4, "caucasian-female-old": 1},
        skin="#e6c0a4", lips="#b07a70", brows="#c8c2bc", hair_col="#d8d2cc", eye="#5a6a7a", stubble=0, blush=.3, hair="short",
        outfit=[("jacket", dict(col="#e8b500", weave="nylon")), ("work_pants", dict(col="#2b3550")),
                ("sneakers", dict(col="#f2f2f2", sole="#f2f2f2", trim="#9aa0a8"))],
        underwear=[("briefs", dict(col="#5a5a60")), ("bra", dict(col="#5a5a60"))]),
    "night_jess": dict(     # night out on Chapel Street: black satin slip dress, ankle boots, long hair
        sex="female", seed=97,
        targets={"universal-female-young-averagemuscle-minweight": .7, "universal-female-young-averagemuscle-averageweight": .3,
                 "caucasian-female-young": .6, "asian-female-young": .4, "female-young-averagemuscle-averageweight-idealproportions": 1},
        skin="#e8c0a0", lips="#b2333a", brows="#2a1a12", hair_col="#2a1a12", eye="#3a2a1e", stubble=0, blush=.32, hair="long",
        outfit=[("dress", dict(col="#0d0d10", hem=.5)), ("work_boots", dict(col="#141416")), ("chain", {})],
        underwear=[("briefs", dict(col="#0d0d10")), ("bra", dict(col="#0d0d10"))]),
    "gang_tama": dict(      # street gang: black hoodie, striped trackies, beanie, chain, tattoos
        sex="male", seed=101,
        targets={"universal-male-young-maxmuscle-averageweight": .6, "universal-male-young-averagemuscle-maxweight": .4,
                 "african-male-young": .35, "caucasian-male-young": .65},
        skin="#8a5a3c", lips="#6a4030", brows="#0f0c0a", hair_col="#0f0c0a", eye="#2a1a12", stubble=.9, blush=.1, hair="crop",
        tattoo=["sleeve_r", "sleeve_l", "neck"],
        outfit=[("hoodie", dict(col="#121214")), ("trackpants", dict(col="#141416", stripe="#f2f2f2")),
                ("sneakers", dict(col="#f4f4f4", sole="#f4f4f4", trim="#141416")), ("beanie", dict(col="#141416")), ("chain", {})],
        underwear=[("briefs", dict(col="#141416"))]),
    "cop_vic": dict(        # Victoria Police: navy shirt and cargo pants, duty vest and belt, chequered cap
        sex="male", seed=107,
        targets={"universal-male-young-averagemuscle-averageweight": .5, "universal-male-young-maxmuscle-averageweight": .3,
                 "universal-male-young-averagemuscle-maxweight": .2, "caucasian-male-young": .8, "asian-male-young": .2},
        skin="#d6a37e", lips="#a8705e", brows="#2e2016", hair_col="#2e2016", eye="#4a5a6a", stubble=.3, blush=.18, hair="crop",
        outfit=[("shirt", dict(col="#1c2a48", sleeve=1.5)), ("vest", dict(col="#141c30")), ("cargo_pants", dict(col="#1c2a48")),
                ("work_boots", dict(col="#111111")), ("toolbelt", dict(col="#111111")), ("cap", dict(col="#141a2a", band=True))],
        underwear=[("briefs", dict(col="#2b3550"))]),
    "aussie_girl": dict(
        sex="female", seed=23,
        targets={"universal-female-young-averagemuscle-averageweight": .75, "universal-female-young-averagemuscle-minweight": .25,
                 "caucasian-female-young": 1, "female-young-averagemuscle-averageweight-idealproportions": 1},
        skin="#d29b74", lips="#b8786c", brows="#6b4a2c", hair_col="#c9a46a", eye="#4f7fa6", stubble=0, blush=.22,
        hair="ponytail",
        outfit=[("crop_top", dict(col="#141416")), ("denim_shorts", dict(col="#7f9fc4")),
                ("sneakers", dict(col="#f4f4f4", sole="#ececec", trim="#c9ccd1")), ("sunglasses", {})],
        underwear=[("briefs", dict(col="#1c1c1e")), ("bra", dict(col="#1c1c1e"))]),
}

SOLE = .022   # sneaker sole height: the whole character stands this much higher


# ------------------------------------------------------------------ small helpers
def mat(name, col, rough=.6, metal=0., image=None, alpha=None, normal_strength=None, sss=0., tint=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*srgb(col), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if sss:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Radius"].default_value = (1., .35, .2)
        b.inputs["Subsurface Scale"].default_value = .006
    if image:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = image if isinstance(image, bpy.types.Image) else bpy.data.images.load(image)
        if tint:   # image x colour: glTF exports the colour as baseColorFactor, so the game can recolour the garment
            mx = nt.nodes.new("ShaderNodeMix")
            mx.data_type, mx.blend_type = "RGBA", "MULTIPLY"
            mx.inputs["Factor"].default_value = 1.
            mx.inputs["B"].default_value = (*srgb(tint), 1)
            nt.links.new(t.outputs["Color"], mx.inputs["A"])
            nt.links.new(mx.outputs["Result"], b.inputs["Base Color"])
        else:
            nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        if alpha:
            nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
            m.blend_method = "CLIP" if hasattr(m, "blend_method") else None
    return m


def cloth(name, weave, col, rough=.82, metal=0.):
    """A garment material: a neutral fabric weave texture tinted to col. Named Cloth_* so the game can recolour it."""
    img = textures.fabric(weave, "#e4e4e4", os.path.join(OUT["textures"], "fabric_%s.png" % weave))
    return mat("Cloth_%s_%s" % (name, col.lstrip("#")), "#ffffff", rough=rough, metal=metal, image=img, tint=col)


def smooth01(a, b, x):
    t = max(0., min(1., (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def delete_verts(o, test):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if test(v.co)], context="VERTS")
    bm.to_mesh(o.data)
    bm.free()


def dup(o, name):
    c = o.copy()
    c.data = o.data.copy()
    c.name = name
    bpy.context.collection.objects.link(c)
    return c


def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def scale_uv(o, k):
    uv = o.data.uv_layers.active.data
    for d in uv:
        d.uv = d.uv * k


# ------------------------------------------------------------------ landmarks
class Face:
    """Face landmarks found on the shaped body: eye centres, nose tip, mouth line, chin, ears."""

    def __init__(self, body, J):
        P = [v.co.copy() for v in body.data.vertices]
        self.eyeL, self.eyeR = J["l-eye"], J["r-eye"]
        E = (self.eyeL + self.eyeR) / 2
        self.E = E
        bands = {}
        for p in P:   # the outermost skin per 2 mm band down the centre line (the mouth and nostrils have insides)
            if abs(p.x) < .006 and p.y < E.y + .03 and E.z - .17 < p.z < E.z - .01:
                k = round(p.z / .002)
                bands[k] = min(bands.get(k, 1), p.y)
        prof = sorted((k * .002, y) for k, y in bands.items())
        # nose tip: the most forward point within 7 cm under the eyes
        nose = min((y, z) for z, y in prof if z > E.z - .07)
        self.nose = Vector((0, nose[0], nose[1]))
        below = [(z, y) for z, y in prof if z < nose[1] - .012]
        below.sort(reverse=True)   # top to bottom
        # walk down: subnasale (back), upper lip (forward), mouth line (back), lower lip (forward), chin fold (back), chin (forward)
        ys = [y for _, y in below]
        zs = [z for z, _ in below]
        sm = [sum(ys[max(0, i - 2):i + 3]) / len(ys[max(0, i - 2):i + 3]) for i in range(len(ys))]
        ext = []
        for i in range(1, len(sm) - 1):
            if sm[i] < sm[i - 1] and sm[i] <= sm[i + 1]:
                ext.append(("fwd", zs[i], sm[i]))
            elif sm[i] > sm[i - 1] and sm[i] >= sm[i + 1]:
                ext.append(("back", zs[i], sm[i]))
        fw = [e for e in ext if e[0] == "fwd"]
        if len(fw) >= 2:
            ul, ll = fw[0], fw[1]
            self.mouth = Vector((0, max(ul[2], ll[2]) + .004, (ul[1] + ll[1]) / 2))
            self.lip_h = min(.017, max(.012, abs(ul[1] - ll[1]) * .95))
        else:
            self.mouth = Vector((0, nose[0] + .025, E.z - .072))
            self.lip_h = .016
        self.chin = min(zs) if zs else E.z - .12
        # ears: the widest points of the head at eye level
        band = [p for p in P if abs(p.z - E.z) < .03 and p.y > E.y + .03]
        self.earx = max(abs(p.x) for p in band) if band else .075
        self.head_top = max(p.z for p in P)
        self.head_back = max(p.y for p in P if p.z > E.z)
        print("  face: eyes z %.3f, nose tip y %.3f, mouth z %.3f (lip h %.3f), chin %.3f, ear x %.3f" %
              (E.z, self.nose.y, self.mouth.z, self.lip_h, self.chin, self.earx))


def hair_depth(p, F, style, J):
    """How far inside the hair-covered scalp a point is, in metres (negative outside): crown and back of the
    head, the sides above the ears, down to the nape. The hairline follows smooth curves so edges can fade."""
    E = F.E
    if style == "bald" or p.z < E.z - .1:
        return -1.
    ry = p.y - E.y
    if style in ("crop", "short"):
        front = E.z + .05 - .012 * smooth01(.025, .06, abs(p.x))                 # hairline, receding a touch at the temples
        side = E.z + .012 + .012 * (1 - smooth01(.035, .07, ry))                  # above the ear, down to sideburns
        back = E.z - .075 + .06 * (1 - smooth01(.06, .1, ry))                    # nape
    else:
        front = E.z + .046 - .014 * smooth01(.025, .06, abs(p.x))
        side = E.z + .006 + .01 * (1 - smooth01(.035, .07, ry))
        back = E.z - .085 + .065 * (1 - smooth01(.06, .1, ry))
    t1, t2 = smooth01(.0, .045, ry), smooth01(.045, .095, ry)
    line = front * (1 - t1) + side * t1
    line = line * (1 - t2) + back * t2
    d = p.z - line
    ear = math.hypot(abs(p.x) - (F.earx - .01), (p.z - (E.z - .006)) * .8, (p.y - (E.y + .086)) * .9)
    return min(d, ear - .028)


def hair_region(p, F, style, J):
    return hair_depth(p, F, style, J) > 0


def is_ear(p, F):
    return abs(abs(p.x) - (F.earx - .012)) < .03 and abs(p.z - (F.E.z - .005)) < .035 and abs(p.y - (F.E.y + .085)) < .035


# ------------------------------------------------------------------ skin
def paint_skin(body, F, C, J):
    """Vertex masks for the skin shader, then a 2K bake of the full colour map."""
    hi = dup(body, body.name + "_bake")
    sub = hi.modifiers.new("sub", "SUBSURF")
    sub.subdivision_type = "SIMPLE"
    sub.levels = sub.render_levels = 2
    apply_mods(hi)
    me = hi.data
    m1 = me.color_attributes.new("mask1", "FLOAT_COLOR", "POINT")   # R lips, G brows, B stubble
    m2 = me.color_attributes.new("mask2", "FLOAT_COLOR", "POINT")   # R scalp, G blush, B eye shadow / socket
    m3 = me.color_attributes.new("mask3", "FLOAT_COLOR", "POINT")   # R tattoo regions
    fitT = Fit(J, F)
    tat = set(C.get("tattoo", ()))

    def tattoo(p):
        t, s_ = fitT.arm_t(p), (1 if p.x > 0 else -1)
        v = 0.
        if ("sleeve_r" in tat and s_ < 0 or "sleeve_l" in tat and s_ > 0) and .15 < t < 1.9:
            v = 1.
        if ("forearm_r" in tat and s_ < 0) and 1.1 < t < 1.85:
            v = 1.
        if "neck" in tat and t < 0 and fitT.neck - .02 < p.z < F.chin - .01 and abs(p.x) < .06:
            v = 1.
        if "chest" in tat and t < 0 and fitT.neck - .2 < p.z < fitT.neck - .07 and p.y < J["neck"].y and .03 < abs(p.x) < .14:
            v = 1.
        if ("calf_l" in tat and s_ > 0 or "calf_r" in tat and s_ < 0) and t < 0 and 1.15 < fitT.leg_t(p) < 1.7:
            v = 1.
        return v
    E, M = F.E, F.mouth
    for v in me.vertices:
        p = v.co
        front = 1 - smooth01(E.y + .0, E.y + .03, p.y)
        dx = abs(p.x)
        lw = .023 if C["sex"] == "male" else .025
        lh = F.lip_h * .6 * max(.25, 1 - (dx / lw) ** 2)            # lips thin out towards the corners
        lips = math.exp(-(dx / lw) ** 4) * math.exp(-((p.z - M.z) / lh) ** 2) * (1 - smooth01(M.y + .004, M.y + .016, p.y))
        brows = 0.
        for e in (F.eyeL, F.eyeR):
            u = (p.x - e.x) * (1 if e.x > 0 else -1) + .004
            zc = e.z + .021 + .0045 * (1 - min(1, (u / .024) ** 2)) - .003 * smooth01(.0, .028, u)
            thick = (.0068 if C["sex"] == "male" else .0048) * (1.15 - .55 * smooth01(-.01, .028, u))
            brows = max(brows, math.exp(-((p.z - zc) / thick) ** 2) * math.exp(-((u - .004) / .025) ** 8) * front)
        stub = 0.
        if C["stubble"]:
            jaw = smooth01(F.chin - .045, F.chin - .01, p.z) * (1 - smooth01(M.z + .022, M.z + .03, p.z))
            cheek = 1 - smooth01(E.z - .055, E.z - .035, p.z)
            side = 1 - smooth01(E.y + .055, E.y + .075, p.y)
            not_nose = 1 - (1 - smooth01(.012, .02, dx)) * smooth01(M.z + .016, M.z + .024, p.z)
            stub = max(0, min(jaw, 1) * cheek * side * not_nose - lips * 1.2) * C["stubble"]
            if p.z > M.z + .005 and p.z < M.z + .026 and dx < .03 and p.y < E.y + .02:   # moustache shadow
                stub = max(stub, .7 * C["stubble"] * (1 - lips))
        scalp = smooth01(-.002, .005, hair_depth(p, F, C["hair"], J))
        blush = 0.
        for s in (-1, 1):
            d = math.hypot(p.x - s * .036, p.z - (E.z - .034))
            blush = max(blush, math.exp(-(d / .02) ** 2) * front)
        shadow = 0.
        for e in (F.eyeL, F.eyeR):
            d = math.hypot(p.x - e.x, (p.z - e.z) * 1.3)
            shadow = max(shadow, math.exp(-(d / .02) ** 2) * front)
        m1.data[v.index].color = (lips, brows, stub, 1)
        m2.data[v.index].color = (scalp, blush * C["blush"] / .2, shadow, 1)
        m3.data[v.index].color = (tattoo(p) if tat else 0., 0, 0, 1)

    # bake material: emission = the colour we want, built from the masks and object-space noise
    bm = bpy.data.materials.new("bake_" + body.name)
    bm.use_nodes = True
    nt = bm.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    N = nt.nodes.new
    out = N("ShaderNodeOutputMaterial")
    em = N("ShaderNodeEmission")
    nt.links.new(em.outputs[0], out.inputs[0])
    a1 = N("ShaderNodeAttribute"); a1.attribute_name = "mask1"
    a2 = N("ShaderNodeAttribute"); a2.attribute_name = "mask2"
    s1 = N("ShaderNodeSeparateColor"); nt.links.new(a1.outputs["Color"], s1.inputs[0])
    s2 = N("ShaderNodeSeparateColor"); nt.links.new(a2.outputs["Color"], s2.inputs[0])
    tc = N("ShaderNodeTexCoord")

    def noise(scale, detail=4, rough=.6):
        n = N("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
        return n

    def rgb(col):
        c = N("ShaderNodeRGB")
        c.outputs[0].default_value = (*srgb(col), 1)
        return c.outputs[0]

    def mix(a, b, fac, mode="MIX"):
        m = N("ShaderNodeMix")
        m.data_type = "RGBA"
        m.blend_type = mode
        nt.links.new(fac, m.inputs["Factor"])
        nt.links.new(a, m.inputs["A"])
        nt.links.new(b, m.inputs["B"])
        return m.outputs["Result"]

    def mathn(op, a, b=None, v=None):
        m = N("ShaderNodeMath")
        m.operation = op
        nt.links.new(a, m.inputs[0])
        if b is not None:
            nt.links.new(b, m.inputs[1])
        if v is not None:
            m.inputs[1].default_value = v
        return m.outputs[0]

    skin = C["skin"]
    # large blotchy tone variation, fine mottling, and freckle-ish speckle
    big = noise(18, 3, .5)
    fine = noise(220, 2, .5)
    col = mix(rgb(skin), rgb(textures.shade(skin, -.12)), mathn("MULTIPLY", big.outputs["Fac"], v=.55))
    col = mix(col, rgb(textures.shade(skin, .08)), mathn("MULTIPLY", fine.outputs["Fac"], v=.35))
    redder = textures.blend(skin, "#d0645a", .35)
    col = mix(col, rgb(redder), s2.outputs["Green"])                        # cheeks
    col = mix(col, rgb(textures.shade(skin, -.18)), mathn("MULTIPLY", s2.outputs["Blue"], v=.35))   # eye sockets
    col = mix(col, rgb(C["lips"]), mathn("MINIMUM", mathn("MULTIPLY", s1.outputs["Red"], v=1.25), None, 1.))
    # brows: hairs streaked sideways
    streak = N("ShaderNodeTexNoise")
    streak.inputs["Scale"].default_value = 900
    streak.inputs["Detail"].default_value = 1
    mp = N("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1, 8, 1)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs[0], streak.inputs["Vector"])
    bro = mathn("MULTIPLY", s1.outputs["Green"], mathn("ADD", streak.outputs["Fac"], v=.75))
    col = mix(col, rgb(C["brows"]), mathn("MINIMUM", bro, None, 1.))
    # stubble: dense dark dots
    dots = noise(1400, 1, .3)
    st = mathn("MULTIPLY", s1.outputs["Blue"], mathn("ADD", mathn("MULTIPLY", dots.outputs["Fac"], v=.7), v=.25))
    col = mix(col, rgb(textures.blend(C["hair_col"], "#20160f", .5)), mathn("MINIMUM", st, None, .85))
    # scalp under the hair takes the hair colour so no skin shows through gaps
    col = mix(col, rgb(textures.shade(C["hair_col"], -.2)), mathn("MULTIPLY", s2.outputs["Red"], v=.95))
    if C.get("tattoo"):   # ink: bold swirling linework from wave and noise patterns inside the tattoo regions
        a3 = N("ShaderNodeAttribute"); a3.attribute_name = "mask3"
        s3 = N("ShaderNodeSeparateColor"); nt.links.new(a3.outputs["Color"], s3.inputs[0])
        wv = N("ShaderNodeTexWave")
        wv.wave_type = "RINGS"
        wv.inputs["Scale"].default_value = 28
        wv.inputs["Distortion"].default_value = 9
        wv.inputs["Detail"].default_value = 3
        nt.links.new(tc.outputs["Object"], wv.inputs["Vector"])
        ramp = N("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[1].position = .62, .72
        nt.links.new(wv.outputs["Fac"], ramp.inputs[0])
        ink = mathn("MULTIPLY", s3.outputs["Red"], ramp.outputs["Color"])
        col = mix(col, rgb("#1d2430"), mathn("MULTIPLY", ink, v=.85))
    nt.links.new(col, em.inputs["Color"])

    img = bpy.data.images.new("skin_" + body.name, 2048, 2048)
    tex = N("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    hi.data.materials.clear()
    hi.data.materials.append(bm)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 4
    sc.cycles.device = "CPU"
    sc.render.bake.margin = 12
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    hi.select_set(True)
    bpy.context.view_layer.objects.active = hi
    bpy.ops.object.bake(type="EMIT")
    bpy.data.objects.remove(hi)
    path = os.path.join(OUT["textures"], "skin_%s.png" % body.name.replace("_body", ""))
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    # the real skin material
    body.data.materials.clear()
    sk = mat("Skin_" + body.name, "#ffffff", rough=.52, image=img, sss=.15)
    body.data.materials.append(sk)
    return img


# ------------------------------------------------------------------ eyes, lashes, hair
def eyes(B, C, F):
    """Eyeballs fitted to the base mesh's eye helpers, with our own painted iris."""
    objs = []
    iris = textures.iris(C["eye"], os.path.join(OUT["textures"], "eye_%s.png" % C["eye"].lstrip("#")))
    em = mat("Eye_" + C["eye"].lstrip("#"), "#ffffff", rough=.05, image=iris)
    for side in ("l", "r"):
        ps = [B.world(i) for g, vi, _ in B.faces if g == "helper-%s-eye" % side for i in vi]
        c = sum(ps, Vector()) / len(ps)
        c.z -= B.ground
        r = sum((p - (c + Vector((0, 0, B.ground)))).length for p in ps) / len(ps)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=r * .97, location=c, rotation=(math.radians(90), 0, 0))
        o = bpy.context.view_layer.objects.active
        o.name = "eye_" + side
        bpy.ops.object.transform_apply(rotation=True)
        o.data.materials.append(em)
        bpy.ops.object.shade_smooth()
        objs.append(o)
    lash = B.build("eyelashes", {"helper-l-eyelashes-1", "helper-l-eyelashes-2", "helper-r-eyelashes-1", "helper-r-eyelashes-2"})
    lash.data.materials.append(mat("Lashes", "#141010", rough=.8))
    return objs + [lash]


def grow_shell(body, name, depth, lift, tuft_amp, C, col, flow, key, tuft_scale=(70, 30, 70)):
    """Grow a hair shell out of the skin wherever depth(p) > 0: lifted by lift(p), tufted with 3D noise, faded and
    tucked under the skin at its edge, thickened, shaded root-to-tip, and baked to a texture for the game."""
    h = dup(body, name)
    h.data.materials.clear()
    for a in list(h.data.color_attributes):
        h.data.color_attributes.remove(a)
    delete_verts(h, lambda p: depth(p) < -.004)
    sub = h.modifiers.new("sub", "SUBSURF")   # finer shell so the edge is a smooth curve
    sub.subdivision_type = "SIMPLE"
    sub.levels = 2
    apply_mods(h)
    rnd = random.Random(C["seed"] + len(name))
    normals = [v.normal.copy() for v in h.data.vertices]   # snapshot: moving a vertex re-derives its neighbours' normals
    ts = Vector(tuft_scale)
    for v in h.data.vertices:
        p = v.co.copy()
        d = depth(p)
        q = Vector((p.x * ts.x, p.y * ts.y, p.z * ts.z))
        tuft = (mnoise.noise(q) * .7 + mnoise.noise(q * 2.1) * .3) * tuft_amp(p)
        v.co = p + normals[v.index] * ((lift(p) + tuft) * smooth01(-.003, .022, d) - .0025 * (1 - smooth01(-.003, .004, d)))
    sol = h.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = .003
    sol.offset = -1
    apply_mods(h)
    ca = h.data.color_attributes.new("Col", "BYTE_COLOR", "POINT")
    base = srgb(col)
    for v in h.data.vertices:
        k = col_k(v.co) if (col_k := getattr(lift, "shade", None)) else 1.
        k *= 1 + rnd.uniform(-.06, .06)
        ca.data[v.index].color = (base[0] * k, base[1] * k, base[2] * k, 1)
    h.data.materials.append(hair_mat(C, flow))
    bake_hair(h, C, key, col)
    return h


def hair(body, F, C, J):
    """Hair grown out of the scalp: fuller on top, a quiff for the crop; a ponytail for long hair; nothing if bald."""
    parts = []
    E = F.E
    top = lambda p: smooth01(E.z + .02, F.head_top - .01, p.z)
    front = lambda p: 1 - smooth01(.0, .05, p.y - E.y)
    if C["hair"] != "bald":
        if C["hair"] == "crop":     # short back and sides, longer on top with a bit of lift at the front
            lift = lambda p: .0015 + .009 * top(p) + .004 * top(p) * front(p)
        elif C["hair"] == "short":  # a full short cut: volume all over, curled (older women)
            lift = lambda p: .008 + .012 * top(p) + .004 * front(p)
        else:                       # pulled back: sleek, with a little volume on the crown
            lift = lambda p: .0045 + .011 * top(p) + .003 * front(p)
        lift.shade = lambda c: .82 + .3 * smooth01(E.z, F.head_top, c.z)   # lighter tips on top, darker at the roots
        amp = lambda p: (.003 if C["hair"] == "crop" else .0012) * top(p)
        parts.append(grow_shell(body, "hair", lambda p: hair_depth(p, F, C["hair"], J), lift, amp, C, C["hair_col"], "y", C["hair"]))
    if C.get("beard"):
        parts.append(beard(body, F, C))
    if C["hair"] in ("ponytail", "long", "bun"):   # the tail has its own UVs, so a plain hair-coloured material rather than the baked map
        parts += ponytail(F, C, mat("Ponytail_" + C["hair_col"].lstrip("#"), textures.shade(C["hair_col"], -.05), rough=.6), C["hair"])
    return parts


def beard_depth(p, F):
    """Inside a full beard: jaw, chin, cheeks below the cheekbones, a moustache, down under the jaw to the neck;
    in front of the ears; clear of the lips. Metres inside (negative outside)."""
    E, M = F.E, F.mouth
    ry, ax = p.y - E.y, abs(p.x)
    if ry > .085:
        return -1.
    # upper edge: moustache line in the middle, rising to the cheekbones, up to the ear at the side
    top = M.z + .024 + (E.z - .035 - (M.z + .024)) * smooth01(.02, .05, ax)
    top = top + (E.z - .012 - top) * smooth01(.05, .075, ry)
    # lower edge: under the chin, back along the jaw and down the neck to the Adam's apple
    bot = F.chin - .05 + .02 * smooth01(.0, .07, ry)
    ear = math.hypot(ax - (F.earx - .01), (p.z - (E.z - .006)) * .8, (p.y - (E.y + .086)) * .9) - .034
    d = min(top - p.z, p.z - bot, .078 - ry, ear)
    # keep the lips and the nostrils clear
    lip = math.hypot(p.x / .03, (p.z - M.z) / .011) - 1
    d = min(d, lip * .012)
    nose = math.hypot(p.x / .02, (p.z - (M.z + .03)) / .01) - 1
    return min(d, nose * .01 + .002)


def beard(body, F, C):
    """A full, trimmed beard: thickest at the chin, combed down."""
    M = F.mouth
    full = C["beard"]
    chin = lambda p: (1 - smooth01(.0, .05, abs(p.x))) * (1 - smooth01(F.chin - .03, M.z, p.z))   # 1 at the point of the chin
    lift = lambda p: (.006 + .007 * chin(p)) * full
    lift.shade = lambda c: .85 + .25 * smooth01(F.chin - .05, M.z, c.z)
    amp = lambda p: .0035 * full
    return grow_shell(body, "beard", lambda p: beard_depth(p, F), lift, amp, C, C.get("beard_col", C["hair_col"]), "z", "beard", (90, 90, 40))


def bake_hair(h, C, key, col):
    """Bake the hair shading (vertex-colour root-to-tip variation times combed-back strands) into a 1K map on the
    head's UVs, and switch the hair to a plain image material that survives glTF export."""
    m = h.data.materials[0]
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    em = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes["Material Output"]
    src = b.inputs["Base Color"].links[0].from_socket
    nt.links.new(src, em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    img = bpy.data.images.new("%s_%s" % (key, col.lstrip("#")), 1024, 1024)
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    nt.nodes.active = t
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 4
    sc.render.bake.margin = 8
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    h.select_set(True)
    bpy.context.view_layer.objects.active = h
    bpy.ops.object.bake(type="EMIT")
    path = os.path.join(OUT["textures"], "hair_%s_%s.png" % (key, col.lstrip("#")))
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    h.data.materials.clear()
    hm = mat("HairBaked_%s_%s" % (key, col.lstrip("#")), "#ffffff", rough=.6, image=img)
    h.data.materials.append(hm)
    return hm


def hair_mat(C, flow="y"):
    m = bpy.data.materials.new("Hair_" + C["hair_col"].lstrip("#"))
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Roughness"].default_value = .62
    at = nt.nodes.new("ShaderNodeVertexColor")
    at.layer_name = "Col"
    # fine strands combed back: noise stretched along Y (front to back)
    w = nt.nodes.new("ShaderNodeTexNoise")
    w.inputs["Scale"].default_value = 260
    w.inputs["Detail"].default_value = 3
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1, .08, 1) if flow == "y" else (1, 1, .08)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs[0], w.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = .3
    ramp.color_ramp.elements[0].color = (.55, .55, .55, 1)
    ramp.color_ramp.elements[1].position = .7
    ramp.color_ramp.elements[1].color = (1.25, 1.25, 1.25, 1)
    nt.links.new(w.outputs["Fac"], ramp.inputs[0])
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    mx.blend_type = "MULTIPLY"
    mx.inputs["Factor"].default_value = 1.
    nt.links.new(at.outputs["Color"], mx.inputs["A"])
    nt.links.new(ramp.outputs["Color"], mx.inputs["B"])
    nt.links.new(mx.outputs["Result"], b.inputs["Base Color"])
    return m


def ponytail(F, C, hm, style="ponytail"):
    """Hair beyond the scalp: a high ponytail (a tapered tube swept back and down, with a hair tie), long loose hair
    (a wide flat fall down the back to the shoulder blades), or a bun (a knot at the back of the crown)."""
    E = F.E
    root = Vector((0, F.head_back - .018, E.z + .062))
    pts = [root, root + Vector((0, .045, -.005)), root + Vector((0, .07, -.07)), root + Vector((0, .06, -.15)), root + Vector((0, .045, -.23))]
    if style == "bun":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=.042, location=root + Vector((0, .03, .005)))
        o = bpy.context.view_layer.objects.active
        o.name = "longhair"
        o.scale = (1.15, .9, .85)
        bpy.ops.object.transform_apply(scale=True)
        o.data.materials.append(hm)
        bpy.ops.object.shade_smooth()
        return [o]
    if style == "long":
        root = Vector((0, F.head_back - .03, E.z + .03))
        pts = [root, root + Vector((0, .02, -.08)), root + Vector((0, .03, -.17)), root + Vector((0, .02, -.27)), root + Vector((0, .005, -.33))]
    cu = bpy.data.curves.new("ponytail", "CURVE")
    cu.dimensions = "3D"
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for bp, p, r in zip(sp.bezier_points, pts, (1., 1.15, 1.05, .8, .25) if style != "long" else (1., 1., 1., .95, .7)):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
        bp.radius = r
    cu.bevel_depth = .026 if style != "long" else .045
    cu.bevel_resolution = 3
    cu.resolution_u = 6
    cu.use_fill_caps = True
    o = bpy.data.objects.new("ponytail" if style != "long" else "longhair", cu)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.view_layer.objects.active
    o.scale = (.8, 1, 1) if style != "long" else (2.6, .45, 1)
    bpy.ops.object.transform_apply(scale=True)
    ca = o.data.color_attributes.new("Col", "BYTE_COLOR", "POINT")
    base = srgb(C["hair_col"])
    for v in o.data.vertices:
        k = .95 + .2 * smooth01(root.z - .23, root.z, v.co.z)
        ca.data[v.index].color = (base[0] * k, base[1] * k, base[2] * k, 1)
    o.data.materials.append(hm)
    bpy.ops.object.shade_smooth()
    if style == "long":
        return [o]
    bpy.ops.mesh.primitive_torus_add(major_segments=16, minor_segments=6, major_radius=.021, minor_radius=.006, location=pts[1] + Vector((0, -.005, .002)), rotation=(math.radians(80), 0, 0))
    tie = bpy.context.view_layer.objects.active
    tie.name = "hair_tie"
    tie.data.materials.append(mat("HairTie", "#121212", rough=.4))
    return [o, tie]


# ------------------------------------------------------------------ clothing cut from the body surface
class Fit:
    """Body measurements the garments are cut against."""

    def __init__(self, J, F):
        self.J, self.F = J, F
        self.pel, self.neck = J["pelvis"].z, J["neck"].z
        self.sh = {1: J["l-shoulder"], -1: J["r-shoulder"]}
        self.el = {1: J["l-elbow"], -1: J["r-elbow"]}
        self.wr = {1: J["l-hand"], -1: J["r-hand"]}
        self.cover = []   # what the garments made so far cover, for hide_under
        self.hip = {1: J["l-upper-leg"], -1: J["r-upper-leg"]}
        self.knee = {1: J["l-knee"], -1: J["r-knee"]}
        self.ank = {1: J["l-ankle"], -1: J["r-ankle"]}

    def arm_t(self, p):
        """How far along the arm a point is: 0 shoulder, 1 elbow, 2 wrist, more for the hand; -1 if not on the arm."""
        s = 1 if p.x > 0 else -1
        S, El, Wr = self.sh[s], self.el[s], self.wr[s]
        ax, fa = El - S, Wr - El
        t = (p - S).dot(ax) / ax.length_squared
        u = (p - El).dot(fa) / fa.length_squared
        if p.z < self.pel - .12:   # hands never hang below the hips in the rest pose; this is a leg
            return -1
        if t > .85 and u > 0:   # past the elbow: along the forearm
            q = El + fa * min(u, 1.6)
            if (p - q).length < .075 or abs(p.x) > abs(S.x) * 1.08:
                return 1 + u
        if abs(p.x) > abs(S.x) * 1.08 and p.z < S.z + .05:
            return max(min(t, 1.), 0.)
        if t < -.05:
            return -1
        q = S + ax * min(max(t, 0), 1.2)
        r = (p - q).length
        if abs(p.x) < abs(S.x) * .8 or r > .09 * (1.2 if t < .2 else 1):
            return -1
        return min(t, 1.)

    def leg_t(self, p):
        """0 at the hip joint, 1 at the knee, 2 at the ankle."""
        s = 1 if p.x > 0 else -1
        H, K, A = self.hip[s], self.knee[s], self.ank[s]
        if p.z > H.z:
            return (p.z - H.z) / (H.z - K.z) * -1
        if p.z > K.z:
            return (H.z - p.z) / (H.z - K.z)
        return 1 + (K.z - p.z) / (K.z - A.z)


def smooth_edges(o, iters):
    """Relax the open borders of a mesh along themselves: averages each border vertex with its border neighbours."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    border = [v for v in bm.verts if v.is_boundary]
    nb = {v: [e.other_vert(v) for e in v.link_edges if e.is_boundary] for v in border}
    for _ in range(iters):
        new = {v: (v.co + sum((u.co for u in n), Vector())) / (1 + len(n)) for v, n in nb.items() if len(n) == 2}
        for v, c in new.items():
            v.co = v.co * .3 + c * .7
    bm.to_mesh(o.data)
    bm.free()


def cut(body, name, include, offset, thick, material, smooth=0, decimate=None, uv_scale=None):
    g = dup(body, name)
    g.data.materials.clear()
    for a in list(g.data.color_attributes):
        g.data.color_attributes.remove(a)
    delete_verts(g, lambda p: not include(p))
    smooth_edges(g, 30)   # (decimation happens on export copies, so the .blend keeps clean hems)
    normals = [v.normal.copy() for v in g.data.vertices]
    for v in g.data.vertices:
        v.co = v.co + normals[v.index] * offset(v.co)
    if smooth:
        m = g.modifiers.new("smooth", "SMOOTH")
        m.factor = .6
        m.iterations = smooth
    s = g.modifiers.new("thick", "SOLIDIFY")
    s.thickness = thick
    s.offset = -1
    s.use_rim = True
    apply_mods(g)
    if uv_scale:
        scale_uv(g, uv_scale)
    g.data.materials.append(material)
    return g


def garment(kind, body, fit, C, o):
    F, J = fit.F, fit.J
    rnd = random.Random(C["seed"] + len(kind))
    if kind == "tee":
        m = cloth("tee", "cotton", o["col"], .85)

        def inc(p):
            t = fit.arm_t(p)
            if t >= 0:
                return t < .42
            neckline = fit.neck - (.03 if p.y < J["neck"].y else .01) - .012 * (1 - smooth01(.03, .07, abs(p.x)))
            return fit.pel - .085 < p.z < neckline

        def off(p):
            t = fit.arm_t(p)
            base = .006 + .01 * smooth01(fit.pel + .12, fit.pel - .06, p.z)
            return base + (.008 * smooth01(.1, .4, t) if t >= 0 else 0)
        fit.cover += [("torso", fit.pel - .085, fit.neck - .03), ("arm", .42)]
        parts = [cut(body, "tee", inc, off, .003, m, smooth=2, decimate=.3, uv_scale=6)]
        if o.get("print"):
            parts.append(chest_print(parts[0], fit, o["print"]))
        return parts
    if kind == "bra":
        return garment("crop_top", body, fit, C, dict(o, lo=.6, name="bra"))
    if kind == "crop_top":
        m = cloth("crop", "rib", o["col"], .8)
        lo = fit.pel + o.get("lo", .52) * (fit.neck - fit.pel)

        def inc(p):
            if fit.arm_t(p) >= 0:
                return False
            if p.z < lo or p.z > fit.neck:
                return False
            ax = abs(p.x)
            front = p.y < fit.J["neck"].y
            if p.z > fit.neck - (.105 if front else .085):   # above the neckline: the straps are separate
                return False
            return ax < abs(fit.sh[1].x) * .92
        top = cut(body, o.get("name", "crop_top"), inc, lambda p: .0035, .002, m, smooth=1, decimate=.5, uv_scale=8)
        return [top] + [strap(body, fit, s, m) for s in (1, -1)]
    if kind in ("cargo_shorts", "denim_shorts", "run_shorts", "briefs"):
        if kind == "cargo_shorts":
            top, hem, loose = fit.pel + .07, .82, .016
        elif kind == "run_shorts":   # light running shorts: loose, mid-thigh, split hem
            top, hem, loose = fit.pel + .05, .42, .012
        elif kind == "denim_shorts":
            top, hem, loose = fit.pel + .045, .38, .008
        else:
            top, hem, loose = fit.pel + .06, -.02, 0
        m = cloth(kind, {"cargo_shorts": "canvas", "denim_shorts": "denim"}.get(kind, "cotton"), o["col"], .8)

        def inc(p):
            if fit.arm_t(p) >= 0 or p.z > top:
                return False
            lt = fit.leg_t(p)
            if kind == "briefs":   # hip line to just under the buttocks, through the crotch
                return lt < .2 or (abs(p.x) < .06 and p.z > fit.hip[1].z - .13)
            return lt < hem
        off = lambda p: (.004 if kind == "briefs" else .007) + loose * smooth01(0, .8, fit.leg_t(p))
        if kind != "briefs":
            fit.cover.append(("leg", -.3, hem))
        parts = [cut(body, kind, inc, off, .003, m, smooth=2, decimate=.32, uv_scale=6)]
        if kind == "cargo_shorts":   # patch pockets on the outer thighs, sewn on a few mm proud of the shorts
            def pocket(p):
                lt = fit.leg_t(p)
                s = 1 if p.x > 0 else -1
                return .33 < lt < .68 and abs(p.y - fit.knee[s].y) < .05 and abs(p.x) > abs(fit.hip[s].x) + .03
            dark = m
            parts.append(cut(body, "pockets", pocket, lambda p: off(p) + .006, .003, dark, smooth=1, decimate=.6, uv_scale=6))
        return parts
    if kind == "sneakers":
        up = mat("SneakerUpper_" + o["col"].lstrip("#"), o["col"], rough=.55)
        so = mat("SneakerSole_" + o["sole"].lstrip("#"), o["sole"], rough=.7)
        tr = mat("SneakerTrim_" + o["trim"].lstrip("#"), o["trim"], rough=.5)
        fit.cover.append(("foot", fit.ank[1].z + .02))
        return [sneaker(body, fit, s, up, so, tr) for s in (1, -1)]
    if kind == "sunglasses":
        return sunglasses(F)
    return wardrobe(kind, body, fit, C, o)


# ------------------------------------------------------------------ STAGE 3: the wardrobe
# Every garment is a rule over the body (which part of the surface, how far off the skin, how thick, which fabric),
# so the same garment fits any character. Colours are material tints (recolourable in the game).
def top_garment(body, fit, name, sleeve, hem, loose, weave, col, rough=.82, vneck=0., armhole=False, neck_drop=0., dec=.3):
    """A top: torso from hem (relative to the pelvis) to the neckline, sleeves to arm_t = sleeve (2 = wrist)."""
    J = fit.J

    def inc(p):
        t = fit.arm_t(p)
        if t >= 0:
            return (not armhole) and t < sleeve
        if armhole and abs(p.x) > abs(fit.sh[1].x) * .78 and p.z > fit.neck - .2:
            return False
        front = p.y < J["neck"].y
        neckline = fit.neck - neck_drop - (.03 if front else .01) - .012 * (1 - smooth01(.03, .07, abs(p.x)))
        if front and vneck:
            neckline -= vneck * (1 - smooth01(0., .06, abs(p.x)))
        return fit.pel + hem < p.z < neckline

    def off(p):
        t = fit.arm_t(p)
        base = .006 + loose + .008 * smooth01(fit.pel + .12, fit.pel - .06, p.z)
        return base + (loose * .6 * smooth01(.1, .6, t) if t >= 0 else 0)
    fit.cover += [("torso", fit.pel + hem, fit.neck - neck_drop - .03)] + ([] if armhole else [("arm", sleeve)])
    return cut(body, name, inc, off, .003, cloth(name, weave, col, rough), smooth=2, decimate=dec, uv_scale=6)


def pants_garment(body, fit, name, hem, loose, weave, col, top=.06, rough=.82):
    """Trousers or leggings: waist (pelvis + top) down to leg_t = hem (1 knee, 2 ankle)."""
    def inc(p):
        return fit.arm_t(p) < 0 and p.z < fit.pel + top and fit.leg_t(p) < hem
    off = lambda p: .007 + loose * smooth01(0, 1.6, fit.leg_t(p))
    fit.cover.append(("leg", -.3, hem))
    return cut(body, name, inc, off, .003, cloth(name, weave, col, rough), smooth=2, decimate=.3, uv_scale=6)


def band(body, fit, name, inc, off, m, dec=.6):
    return cut(body, name, inc, off, .002, m, smooth=1, decimate=dec, uv_scale=6)


def by_z_stripes(o, period, z0=0.):
    """Alternate faces between the object's two materials in horizontal bands (footy hoops)."""
    for poly in o.data.polygons:
        poly.material_index = int((poly.center.z - z0) / period) % 2


def ring(name, center, radius, minor, m, rot=(0, 0, 0), seg=24):
    bpy.ops.mesh.primitive_torus_add(major_segments=seg, minor_segments=8, major_radius=radius, minor_radius=minor, location=center, rotation=rot)
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return o


def box_obj(name, size, loc, m, bev=.01):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    b = o.modifiers.new("bev", "BEVEL")
    b.width, b.segments = bev, 2
    apply_mods(o)
    o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return o


def neck_ring(body, fit, dz=0.):
    """Centre and radius of the neck at its base."""
    z = fit.neck - .02 + dz
    pts = [v.co for v in body.data.vertices if abs(v.co.z - z) < .012 and abs(v.co.x) < .09 and fit.arm_t(v.co) < 0]
    c = sum(pts, Vector()) / max(1, len(pts))
    r = sum(Vector((p.x - c.x, p.y - c.y, 0)).length for p in pts) / max(1, len(pts))
    return Vector((c.x, c.y, z)), r


def wardrobe(kind, body, fit, C, o):
    F, J, E = fit.F, fit.J, fit.F.E
    col = o.get("col", "#444444")
    if kind == "longsleeve":     # plain long-sleeve tee or work shirt
        return [top_garment(body, fit, "longsleeve", o.get("sleeve", 1.86), -.085, .002, "cotton", col)]
    if kind == "singlet":
        return [top_garment(body, fit, "singlet", 0, -.09, .001, o.get("weave", "mesh"), col, armhole=True, neck_drop=.03, vneck=.03)]
    if kind == "shirt":          # button-up shirt, sleeves rolled to the forearm
        return [top_garment(body, fit, "shirt", o.get("sleeve", 1.55), -.1, .004, "cotton", col, .7, vneck=.05)]
    if kind == "hoodie":
        h = top_garment(body, fit, "hoodie", 1.85, -.07, .014, "fleece", col, .95, dec=.28)
        c, r = neck_ring(body, fit, .01)
        hood = ring("hood", c + Vector((0, .035, -.005)), r + .035, .03, cloth("hoodie", "fleece", col, .95), rot=(math.radians(14), 0, 0))
        hood.scale = (1.05, 1.25, 1.)
        bpy.ops.object.transform_apply(scale=True)
        return [h, hood]
    if kind == "jacket":         # zip jacket: denim, leather, or a nylon rain jacket
        weave = o.get("weave", "nylon")
        j = top_garment(body, fit, "jacket", 1.86, -.07, .013, weave, col, {"leather": .45, "nylon": .5}.get(weave, .85), dec=.28)
        c, r = neck_ring(body, fit, .015)
        collar = ring("collar", c, r + .03, .018, cloth("jacket", weave, col, .6))
        zip_ = band(body, fit, "zip", lambda p: abs(p.x) < .006 and p.y < J["neck"].y and fit.pel - .06 < p.z < fit.neck - .04 and fit.arm_t(p) < 0,
                    lambda p: .028, mat("Zip", "#2a2a2c", rough=.3, metal=.8))
        return [j, collar, zip_]
    if kind == "hivis":          # Victorian hi-vis work shirt: fluoro with silver reflective tape round the chest and arms
        sleeve = o.get("sleeve", 1.86)
        h = top_garment(body, fit, "hivis", sleeve, -.1, .008, "hivis", col, .7)
        tape = mat("HiVisTape", "#c9ccd0", rough=.25, metal=.6)
        zc = fit.pel + .32
        chest = band(body, fit, "hivis_tape", lambda p: fit.arm_t(p) < 0 and zc - .02 < p.z < zc + .02, lambda p: .02, tape)
        parts = [h, chest]
        if sleeve > 1.3:
            parts.append(band(body, fit, "hivis_tape", lambda p: 1.25 < fit.arm_t(p) < 1.38, lambda p: .02, tape))
        return parts
    if kind == "footy_jumper":   # sleeveless guernsey in hoops; generic colours, no club emblem
        g = top_garment(body, fit, "jumper", 0, -.1, .006, "knit", o.get("col", "#1d2b5c"), .9, armhole=True, vneck=.05)
        g.data.materials.append(cloth("jumper", "knit", o.get("col2", "#f2f2f2"), .9))
        by_z_stripes(g, .075, fit.pel)
        return [g]
    if kind == "vest":           # police duty vest over the shirt
        return [top_garment(body, fit, "vest", 0, -.06, .016, "nylon", col, .6, armhole=True, neck_drop=.03, vneck=.06)]
    if kind == "cardigan":
        return [top_garment(body, fit, "cardigan", 1.85, -.08, .012, "knit", col, .95, vneck=.12)]
    if kind == "dress":          # a slip dress: bodice from the bust plus a skirt from the base mesh's skirt helper
        top = top_garment(body, fit, "dress", 0, -.06, .002, "satin", col, .35, armhole=True, neck_drop=.09)
        sk = skirt(fit, "dress", col, "satin", o.get("hem", .55), .35)
        return [top, sk] + [strap(body, fit, s_, cloth("dress", "satin", col, .35)) for s_ in (1, -1)]
    if kind == "skirt":
        return [skirt(fit, "skirt", col, o.get("weave", "denim"), o.get("hem", .6), .8)]
    if kind in ("jeans", "cargo_pants", "work_pants", "trackpants", "leggings"):
        spec = {"jeans": (1.92, .006, "denim", .8), "cargo_pants": (1.9, .016, "canvas", .85), "work_pants": (1.92, .012, "canvas", .85),
                "trackpants": (1.95, .02, "fleece", .9), "leggings": (1.88, -.003, "lycra", .5)}[kind]
        p_ = pants_garment(body, fit, kind, spec[0], spec[1], spec[2], col, rough=spec[3])
        parts = [p_]
        if kind == "trackpants":   # side stripes
            p_.data.materials.append(cloth(kind, "fleece", o.get("stripe", "#f2f2f2"), .8))
            for poly in p_.data.polygons:   # faces facing straight out from the leg's axis
                c = poly.center
                s_ = 1 if c.x > 0 else -1
                lt = fit.leg_t(c)
                a_, b_, k_ = (fit.hip[s_], fit.knee[s_], max(0., lt)) if lt < 1 else (fit.knee[s_], fit.ank[s_], lt - 1)
                ax_ = a_.lerp(b_, min(1., k_))
                if abs(math.atan2(c.y - ax_.y, (c.x - ax_.x) * s_)) < .2:
                    poly.material_index = 1
        if kind == "cargo_pants":
            parts.append(cut(body, "pockets", lambda p: .45 < fit.leg_t(p) < .8 and abs(p.y - fit.knee[1 if p.x > 0 else -1].y) < .05
                             and abs(p.x) > abs(fit.hip[1].x) + .03, lambda p: .025, .003, p_.data.materials[0], smooth=1, decimate=.6, uv_scale=6))
        return parts
    if kind == "work_boots":
        up = mat("Boot_" + col.lstrip("#"), col, rough=.6)
        so = mat("BootSole", "#1c1a18", rough=.9)
        fit.cover.append(("foot", fit.ank[1].z + .06))
        return [sneaker(body, fit, s_, up, so, so, height=.11, name="boot", grow=.011) for s_ in (1, -1)]
    if kind == "cap":            # baseball cap, peak forward (or back to front)
        m = cloth("cap", "canvas", col, .8)
        crown = cut(body, "cap", lambda p: p.z > E.z + .035 and abs(abs(p.x) - (F.earx - .012)) > .02 - 1 and not is_ear(p, F) and fit.arm_t(p) < 0,
                    lambda p: .02, .003, m, smooth=2, decimate=.4)
        back = o.get("back", False)
        sg = 1 if back else -1
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.085, depth=.006, location=(0, E.y + sg * .02 + (F.head_back - E.y) * (1 if back else 0), E.z + .045))
        peak = bpy.context.view_layer.objects.active
        peak.name = "cap_peak"
        bm = bmesh.new()
        bm.from_mesh(peak.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y * sg < 0], context="VERTS")
        bm.to_mesh(peak.data)
        bm.free()
        peak.scale = (.95, 1.1, 1)
        peak.rotation_euler.x = math.radians(-12 * sg)
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        peak.data.materials.append(m)
        parts = [crown, peak]
        if o.get("band"):   # police cap: a band of blue-and-white chequer round the crown
            bnd = cut(body, "cap_band", lambda p: E.z + .036 < p.z < E.z + .058 and not is_ear(p, F) and fit.arm_t(p) < 0, lambda p: .0225, .002,
                      mat("CapCheckBlue", "#1c3f94", rough=.6), smooth=1, decimate=.6)
            bnd.data.materials.append(mat("CapCheckWhite", "#f2f2f2", rough=.6))
            cxy = sum((v.co for v in bnd.data.vertices), Vector()) / max(1, len(bnd.data.vertices))
            for poly in bnd.data.polygons:
                a = math.atan2(poly.center.y - cxy.y, poly.center.x - cxy.x)
                poly.material_index = (int((a + math.pi) / (2 * math.pi) * 22) + int(poly.center.z > E.z + .047)) % 2
            parts.append(bnd)
        return parts
    if kind == "beanie":
        m = cloth("beanie", "knit", col, .95)
        b = cut(body, "beanie", lambda p: p.z > E.z + .02 and not is_ear(p, F) and fit.arm_t(p) < 0, lambda p: .02 + .006 * smooth01(E.z + .05, F.head_top, p.z), .004, m, smooth=2, decimate=.4)
        cuff = cut(body, "beanie", lambda p: E.z + .02 < p.z < E.z + .05 and not is_ear(p, F) and fit.arm_t(p) < 0, lambda p: .028, .004, m, smooth=1, decimate=.5)
        return [b, cuff]
    if kind == "backpack":
        m = cloth("backpack", "nylon", col, .6)
        back_y = max(v.co.y for v in body.data.vertices if abs(v.co.x) < .05 and abs(v.co.z - (fit.neck - .2)) < .02)
        bag = box_obj("backpack", (.3, .14, .4), (0, back_y + .075, fit.neck - .24), m, .035)
        straps = band(body, fit, "backpack_strap", lambda p: abs(abs(p.x) - .085) < .018 and fit.neck - .32 < p.z < fit.neck - .01 and fit.arm_t(p) < 0, lambda p: .016, m)
        return [bag, straps]
    if kind == "scarf":          # footy scarf in two-colour bars
        c, r = neck_ring(body, fit, .0)
        sc = ring("scarf", c, r + .028, .026, cloth("scarf", "knit", col, .95), seg=28)
        sc.data.materials.append(cloth("scarf", "knit", o.get("col2", "#f2f2f2"), .95))
        for poly in sc.data.polygons:
            a = math.atan2(poly.center.y - c.y, poly.center.x - c.x)
            poly.material_index = int((a + math.pi) / (2 * math.pi) * 10) % 2
        tail = box_obj("scarf", (.07, .02, .3), (.06, J["neck"].y - r - .03, fit.neck - .17), sc.data.materials[0], .01)
        return [sc, tail]
    if kind == "toolbelt":       # leather tool belt with pouches on both hips
        m = mat("Leather_" + col.lstrip("#"), col, rough=.55)
        belt = band(body, fit, "toolbelt", lambda p: fit.arm_t(p) < 0 and fit.pel - .01 < p.z < fit.pel + .035, lambda p: .03, m)
        side = max(abs(v.co.x) for v in body.data.vertices if abs(v.co.z - fit.pel) < .02 and fit.arm_t(v.co) < 0)
        pouches = [box_obj("toolbelt", (.05, .11, .12), (s_ * (side + .04), fit.J["pelvis"].y, fit.pel - .05), m, .012) for s_ in (1, -1)]
        return [belt] + pouches
    if kind == "chain":
        c, r = neck_ring(body, fit, -.035)
        ch = ring("chain", c + Vector((0, -.012, 0)), r + .018, .0035, mat("Gold", "#d4a83a", rough=.25, metal=1.), seg=32)
        ch.scale = (1., 1.15, 1.)
        ch.rotation_euler.x = math.radians(-14)
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        return [ch]
    if kind == "watch":
        W = fit.wr[1]
        d = (fit.wr[1] - fit.el[1]).normalized()
        w = ring("watch", W - d * .04, .03, .008, mat("Watch", "#151515", rough=.4), seg=16)
        w.rotation_mode = "QUATERNION"
        w.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
        bpy.ops.object.transform_apply(rotation=True)
        return [w]
    raise ValueError(kind)


def skirt(fit, name, col, weave, hem, rough):
    """A skirt from the MakeHuman skirt helper: waist down to leg_t = hem (0.5 mid-thigh, 1 the knee)."""
    hz = fit.hip[1].z - (fit.hip[1].z - fit.knee[1].z) * hem
    o = fit.B.build(name + "_skirt", {"helper-skirt"}, keep=lambda pts: min(p.z - fit.B.ground for p in pts) > hz)
    o.name = name + "_skirt"
    for p_ in o.data.polygons:
        p_.use_smooth = True
    s_ = o.modifiers.new("thick", "SOLIDIFY")
    s_.thickness = .003
    apply_mods(o)
    o.data.materials.append(cloth(name, weave, col, rough))
    fit.cover.append(("leg", -.3, hem - .1))
    return o


def strap(body, fit, s, m):
    """A spaghetti strap: from the top's front edge, over the shoulder, down to its back edge, 4 mm off the skin."""
    x = s * .07
    V = [v.co for v in body.data.vertices if abs(v.co.x - x) < .012]

    def near_z(z, front, pick):
        for tol in (.006, .012, .025, .05):
            c = [p for p in V if abs(p.z - z) < tol and (p.y < ny) == front]
            if c:
                return pick(c, key=lambda p: p.y)
        raise ValueError("no skin near the strap")
    ny, nz = fit.J["neck"].y, fit.neck
    zf, zb = nz - .105, nz - .085                                   # where the top's front and back edges are
    fr = near_z(zf, True, min)
    bk = near_z(zb, False, max)
    tp = max((p for p in V if abs(p.y - ny) < .03 and p.z < nz + .02), key=lambda p: p.z)
    mf = near_z((zf + tp.z) / 2 + .01, True, min)
    mb = near_z((zb + tp.z) / 2, False, max)
    pts = [fr + Vector((0, -.004, 0)), mf + Vector((0, -.004, .002)), tp + Vector((0, 0, .004)), mb + Vector((0, .004, .002)), bk + Vector((0, .004, 0))]
    cu = bpy.data.curves.new("strap", "CURVE")
    cu.dimensions = "3D"
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = (p.x, p.y, p.z)
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    cu.resolution_u = 4
    cu.bevel_depth = .0035
    cu.bevel_resolution = 0
    o = bpy.data.objects.new("strap", cu)
    o.scale = (1, 1, 1)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.view_layer.objects.active
    o.data.materials.append(m)
    return o


def sneaker(body, fit, s, up, so, tr, height=.05, name="sneaker", grow=.007):
    """One shoe: the convex hull of the foot (so no toes), pushed out, smoothed, with a flat sole under it."""
    top = fit.ank[s].z + height
    pts = [v.co + v.normal * grow for v in body.data.vertices if v.co.z < top and v.co.x * s > 0 and abs(v.co.x) > .03]
    pts += [Vector((p.x, p.y, -SOLE + .006)) for p in pts if p.z < .012]        # extend down into the sole
    me = bpy.data.meshes.new("sneaker")
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    bmesh.ops.convex_hull(bm, input=vs)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    # open the collar: drop the top cap so the leg goes in
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z > top - .012 and f.normal.z > .5], context="FACES")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name + "_" + ("l" if s > 0 else "r"), me)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    r = o.modifiers.new("remesh", "REMESH")
    r.mode = "SMOOTH"
    r.octree_depth = 6
    r.scale = .9
    sm = o.modifiers.new("sm", "SMOOTH")
    sm.factor = .5
    sm.iterations = 4
    d = o.modifiers.new("dec", "DECIMATE")
    d.ratio = .5
    apply_mods(o)
    for m in (up, so, tr):
        o.data.materials.append(m)
    zs = [v.co.z for v in o.data.vertices]
    lo = min(zs)
    for poly in o.data.polygons:
        c = poly.center
        if c.z < lo + .02:
            poly.material_index = 1                      # sole

    bpy.ops.object.shade_smooth()
    return o


def chest_print(tee, fit, brand):
    """A screen-printed logo of an original brand on the chest, shrink-wrapped onto the tee."""
    img = textures.logo(brand, os.path.join(OUT["textures"], "print_%s.png" % brand))
    m = mat("Print_" + brand, "#ffffff", rough=.8, image=img, alpha=True)
    m.blend_method = "CLIP"
    z = fit.neck - .17
    front = min(v.co.y for v in tee.data.vertices if abs(v.co.x) < .02 and abs(v.co.z - z) < .02)
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=10, y_subdivisions=10, size=1, location=(0, front - .02, z), rotation=(math.radians(90), 0, 0))
    o = bpy.context.view_layer.objects.active
    o.name = "tee_print"
    o.scale = (.16, .16, 1)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    sw = o.modifiers.new("wrap", "SHRINKWRAP")
    sw.target = tee
    sw.wrap_method = "PROJECT"
    sw.use_project_y = True
    sw.use_negative_direction = True
    sw.use_positive_direction = True
    sw.offset = .0012
    apply_mods(o)
    o.data.materials.append(m)
    return o


def beam(name, a, b, w, h, material):
    """A thin box from point a to point b."""
    d = b - a
    bpy.ops.mesh.primitive_cube_add(size=1, location=(a + b) / 2)
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.scale = (w, d.length, h)
    o.rotation_euler = d.to_track_quat("Y", "Z").to_euler()
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    o.data.materials.append(material)
    return o


def sunglasses(F):
    """Wayfarer-ish shades: two lenses wrapped slightly round the face, rims, a bridge and arms to the ears."""
    frame = mat("ShadesFrame", "#0d0d0f", rough=.3)
    lens = mat("ShadesLens", "#141a22", rough=.03, metal=.7)
    parts = []
    y = F.E.y - .024
    zc = F.E.z - .001
    for e in (F.eyeL, F.eyeR):
        s = 1 if e.x > 0 else -1
        c = Vector((e.x + s * .003, y + .002 * s * 0, zc))
        for m_, rr, depth, dy in ((lens, .0205, .0018, -.0004), (frame, .0222, .0035, .0006)):
            bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=rr, depth=depth, location=(0, 0, 0))
            o = bpy.context.view_layer.objects.active
            o.scale = (1.15, .8, 1)                        # wider than tall, in the lens plane (XY before turning)
            bpy.ops.object.transform_apply(scale=True)
            o.rotation_euler = (math.radians(90), 0, math.radians(-10 * s))   # face forward, wrapped round the face
            o.location = c + Vector((0, dy, 0))
            bpy.ops.object.transform_apply(rotation=True, location=False)
            o.data.materials.append(m_)
            parts.append(o)
        outer = Vector((e.x + s * .026, y + .004, zc + .006))
        ear = Vector((s * (F.earx - .014), F.E.y + .082, F.E.z + .002))
        parts.append(beam("arm", outer, ear, .0025, .005, frame))
    parts.append(beam("bridge", Vector((F.eyeR.x + .019, y - .001, zc + .007)), Vector((F.eyeL.x - .019, y - .001, zc + .007)), .004, .004, frame))
    for p in parts:
        p.name = "sunglasses"
    return parts


# ------------------------------------------------------------------ assembly
def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    return o


def hide_under(body, garments, fit):
    """Remove body faces well inside what the outfit covers (fit.cover), to save triangles and stop skin poking through."""
    C = fit.cover

    def hidden(p):
        t = fit.arm_t(p)
        for c in C:
            if c[0] == "torso" and t < 0 and c[1] + .05 < p.z < c[2] - .05:
                return True
            if c[0] == "arm" and 0 <= t < c[1] - .18:
                return True
            if c[0] == "leg" and t < 0 and p.z < fit.pel and c[1] + .1 < fit.leg_t(p) < c[2] - .12:
                return True
            if c[0] == "foot" and p.z < c[1]:
                return True
        return False
    delete_verts(body, hidden)


def decimate_to(o, target):
    d = o.modifiers.new("dec", "DECIMATE")
    d.ratio = max(.02, target / max(1, tris(o)))
    apply_mods(o)


def decimate(o, ratio):
    d = o.modifiers.new("dec", "DECIMATE")
    d.ratio = ratio
    d.use_symmetry = True
    d.symmetry_axis = "X"
    apply_mods(o)


def build(name):
    C = CHARACTERS[name]
    print("== %s" % name)
    reset()
    B = Base()
    B.apply_targets(C["targets"])
    J = B.joints()
    body = B.build(name + "_body", {"body"})
    F = Face(body, J)
    fit = Fit(J, F)
    fit.B = B
    paint_skin(body, F, C, J)
    head = eyes(B, C, F) + hair(body, F, C, J)

    def dress(items):
        out = []
        for kind, o in items:
            out += garment(kind, body, fit, C, o)
        return out

    under = dress(C["underwear"])
    fit.cover = []
    outfit = dress(C["outfit"])
    # collections: base (body + head + underwear) and outfit
    # collections: base (body + head), underwear, outfit. Preview "base underwear" or "base outfit".
    for cname, objs in (("base", [body] + head), ("underwear", under), ("outfit", outfit)):
        col = bpy.data.collections.new(cname)
        bpy.context.scene.collection.children.link(col)
        for o in objs:
            for c in o.users_collection:
                c.objects.unlink(o)
            col.objects.link(o)
    # everyone stands on their soles
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            o.location.z += SOLE
    blend = os.path.join(OUT["base_models"], name + ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    print("  saved", blend)

    # ---- game exports: decimated to a triangle budget, rigged (stage 2), skin hidden under clothes dropped.
    # <name>.glb dressed, <name>_base.glb in underwear, <name>_crowd.glb a light version for pedestrians (LOD1).
    import rig
    report = {}
    budget = {"hair": 1800, "beard": 1500, "sneaker_l": 700, "sneaker_r": 700, "boot_l": 800, "boot_r": 800, "ponytail": 400,
              "longhair": 500, "tee": 2200, "hoodie": 2600, "jacket": 2600, "hivis": 2400, "jumper": 2400, "singlet": 1600,
              "cargo_shorts": 1300, "pockets": 160, "denim_shorts": 900, "run_shorts": 900, "jeans": 2000, "cargo_pants": 2000,
              "work_pants": 2000, "crop_top": 900, "briefs": 700, "bra": 700, "dress": 2000, "cap": 400, "beanie": 400, "longsleeve": 1800, "shirt": 2000, "cardigan": 2200, "hood": 300, "collar": 200, "zip": 80,
              "dress_skirt": 900, "skirt_skirt": 900, "hivis_tape": 300, "vest": 1400, "cap_band": 300, "scarf": 400, "chain": 200, "watch": 120,
              "backpack": 300, "scarf": 300, "toolbelt": 300}

    def game_copy(o, lod):
        k = o.name.split(".")[0]
        c = dup(o, k)
        lim = budget.get(k)
        if lod:
            lim = int((lim or tris(c)) * .35)
        if lim and tris(c) > lim * 1.1:
            decimate_to(c, lim)
        return c

    body_lo = dup(body, name + "_body_lod0")
    decimate(body_lo, .4)
    arm = rig.make_armature(rig.joints_world(J, SOLE), body_lo, name + "_rig")
    rig.bake_clips(arm)
    ghead, gunder, gout = ([game_copy(o, 0) for o in L] for L in (head, under, outfit))
    def on_arm(w):   # near the shoulder-elbow-wrist chain and not below the wrist (the whole arm is above it in the rest pose)
        p = w - Vector((0, 0, SOLE))
        s_ = 1 if p.x > 0 else -1
        S_, E_, W_ = fit.sh[s_], fit.el[s_], fit.wr[s_]
        tip = W_ + (W_ - E_).normalized() * .21                       # the hand carries on past the wrist
        if p.z > E_.z:   # the shoulders: no hand is up here, and the skin moves with the arm when it's raised to the T-pose
            return True
        return min(rig._seg_dist(p, S_, E_), rig._seg_dist(p, E_, W_)) < .1 and p.z > W_.z - .06 or rig._seg_dist(p, W_, tip) < .065
    rig.weight_body(arm, body_lo)
    for o in ghead + gunder + gout:
        rig.bind(arm, o, body_lo, None if o in ghead else on_arm)
        if o.name.startswith(("sneaker", "boot")):
            rig.rigid_feet(arm, o)
        for pre, bone in rig.RIGID:
            if o.name.startswith(pre) and not o.name.startswith("backpack_strap"):
                rig.rigid(o, bone)

    # move onto the animation library's own skeleton (stage 2b): its keyframed clips then play exactly as authored
    dressed = dup(body_lo, name + "_body_dressed")
    hide_under(dressed, C["outfit"], fit)
    import ual_rig
    arm = ual_rig.convert(arm, [body_lo, dressed] + ghead + gunder + gout, body_lo)

    def export(objs, path):
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False,
                                  export_yup=True, export_image_format="JPEG", export_jpeg_quality=86,
                                  export_skins=True, export_animations=True, export_animation_mode="NLA_TRACKS")
        t = sum(tris(o) for o in objs)
        import glb_slim
        glb_slim.slim(path)   # drop the animation channels that never move
        report[os.path.basename(path)] = (t, os.path.getsize(path))
        print("  exported %s: %d tris, %d KB" % (path, t, os.path.getsize(path) // 1024))

    export([body_lo] + ghead + gunder, os.path.join(OUT["exports"], name + "_base.glb"))
    export([dressed] + ghead + gout, os.path.join(OUT["exports"], name + ".glb"))
    # crowd LOD: a third of the triangles and 512px textures
    small = {}

    def shrink(o):
        o.data = o.data.copy()
        for i, m in enumerate(o.data.materials):
            if m is None:
                continue
            if m.name not in small:
                c = m.copy()
                for n in c.node_tree.nodes:
                    if n.type == "TEX_IMAGE" and n.image and n.image.size[0] > 512:
                        im = n.image.copy()
                        im.scale(512, 512)
                        n.image = im
                small[m.name] = c
            o.data.materials[i] = small[m.name]
        return o

    def lod1(o, target):
        c = dup(o, o.name.split(".")[0] + "_lod1")
        d = c.modifiers.new("dec", "DECIMATE")
        d.ratio = max(.05, target / max(1, tris(c)))
        bpy.context.view_layer.objects.active = c
        bpy.ops.object.modifier_move_to_index(modifier=d.name, index=0)
        bpy.ops.object.modifier_apply(modifier=d.name)
        return shrink(c)

    crowd = [lod1(dressed, 2600)] + [lod1(o, max(60, int(tris(o) * .35))) for o in ghead + gout if not o.name.startswith("eyelash")]
    # one skinned mesh for the whole crowd character: fewer objects and draw calls per pedestrian in the game
    for o in crowd:
        for m in list(o.modifiers):
            if m.type == "ARMATURE":
                o.modifiers.remove(m)
    bpy.ops.object.select_all(action="DESELECT")
    for o in crowd:
        o.select_set(True)
    bpy.context.view_layer.objects.active = crowd[0]
    bpy.ops.object.join()
    one = bpy.context.view_layer.objects.active
    one.name = name + "_crowd"
    one.modifiers.new("Armature", "ARMATURE").object = arm
    export([one], os.path.join(OUT["exports"], name + "_crowd.glb"))
    if os.environ.get("SAVE_RIG") == name:   # the shared rig on its own (armature + every clip), and the clips as a GLB
        for o in [o for o in bpy.data.objects if o is not arm]:
            bpy.data.objects.remove(o)
        os.makedirs(os.path.join(ROOT, "rigs"), exist_ok=True)
        os.makedirs(os.path.join(ROOT, "animations"), exist_ok=True)
        arm.name = "aussie_rig"
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "rigs", "aussie_rig.blend"), copy=True)
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, "animations", "aussie_clips.glb"), export_format="GLB", use_selection=True,
                                  export_animations=True, export_animation_mode="NLA_TRACKS")
        print("  saved the shared rig and clips")
    return report


if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in CHARACTERS] or list(CHARACTERS)
    for n in names:
        print(build(n))
