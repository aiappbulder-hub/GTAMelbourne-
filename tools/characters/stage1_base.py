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
def mat(name, col, rough=.6, metal=0., image=None, alpha=None, normal_strength=None, sss=0.):
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
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        if alpha:
            nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
            m.blend_method = "CLIP" if hasattr(m, "blend_method") else None
    return m


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
    if p.z < E.z - .1:
        return -1.
    ry = p.y - E.y
    if style == "crop":
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


def hair(body, F, C, J):
    """Hair grown out of the scalp: a shell lifted off the head, fuller on top; a ponytail for long hair."""
    h = dup(body, "hair")
    h.data.materials.clear()
    for a in list(h.data.color_attributes):
        h.data.color_attributes.remove(a)
    delete_verts(h, lambda p: hair_depth(p, F, C["hair"], J) < -.004)
    sub = h.modifiers.new("sub", "SUBSURF")   # finer shell so the hairline is a smooth curve
    sub.subdivision_type = "SIMPLE"
    sub.levels = 2
    apply_mods(h)
    E = F.E
    rnd = random.Random(C["seed"])
    normals = [v.normal.copy() for v in h.data.vertices]   # snapshot: moving a vertex re-derives its neighbours' normals
    for v in h.data.vertices:
        p = v.co.copy()
        d = hair_depth(p, F, C["hair"], J)
        top = smooth01(E.z + .02, F.head_top - .01, p.z)
        front = 1 - smooth01(.0, .05, p.y - E.y)        # a little extra at the front: a textured quiff
        if C["hair"] == "crop":     # short back and sides, longer on top with a bit of lift at the front
            lift = .0015 + .009 * top + .004 * top * front
        else:                       # pulled back: sleek, with a little volume on the crown
            lift = .0045 + .011 * top + .003 * front
        k = smooth01(-.003, .014, d)
        # tufts: clumps of hair from 3D noise, stronger on top, combed back (stretched along Y)
        q = Vector((p.x * 70, p.y * 30, p.z * 70))
        tuft = (mnoise.noise(q) * .7 + mnoise.noise(q * 2.1) * .3) * (.003 if C["hair"] == "crop" else .0012) * top
        v.co = p + normals[v.index] * ((lift + tuft) * smooth01(-.003, .022, d) - .0025 * (1 - smooth01(-.003, .004, d)))
    sol = h.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = .003
    sol.offset = -1
    apply_mods(h)
    # colour variation in the vertex colours: lighter tips on top, darker at the roots
    ca = h.data.color_attributes.new("Col", "BYTE_COLOR", "POINT")
    base = srgb(C["hair_col"])
    for v in h.data.vertices:
        k = .82 + .3 * smooth01(E.z, F.head_top, v.co.z) + rnd.uniform(-.06, .06)
        ca.data[v.index].color = (base[0] * k, base[1] * k, base[2] * k, 1)
    hm = hair_mat(C)
    h.data.materials.append(hm)
    bake_hair(h, C)
    hm = h.data.materials[0]
    parts = [h]
    if C["hair"] == "ponytail":   # the tail has its own UVs, so a plain hair-coloured material rather than the baked map
        parts += ponytail(F, C, mat("Ponytail_" + C["hair_col"].lstrip("#"), textures.shade(C["hair_col"], -.05), rough=.6))
    return parts


def bake_hair(h, C):
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
    img = bpy.data.images.new("hair_" + C["hair_col"].lstrip("#"), 1024, 1024)
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
    path = os.path.join(OUT["textures"], "hair_%s_%s.png" % (C["hair"], C["hair_col"].lstrip("#")))
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    h.data.materials.clear()
    hm = mat("HairBaked_%s_%s" % (C["hair"], C["hair_col"].lstrip("#")), "#ffffff", rough=.6, image=img)
    h.data.materials.append(hm)
    return hm


def hair_mat(C):
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
    mp.inputs["Scale"].default_value = (1, .08, 1)
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


def ponytail(F, C, hm):
    """A high ponytail: a tapered tube swept back and down from the crown, with a hair tie."""
    E = F.E
    root = Vector((0, F.head_back - .018, E.z + .062))
    pts = [root, root + Vector((0, .045, -.005)), root + Vector((0, .07, -.07)), root + Vector((0, .06, -.15)), root + Vector((0, .045, -.23))]
    cu = bpy.data.curves.new("ponytail", "CURVE")
    cu.dimensions = "3D"
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for bp, p, r in zip(sp.bezier_points, pts, (1., 1.15, 1.05, .8, .25)):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
        bp.radius = r
    cu.bevel_depth = .026
    cu.bevel_resolution = 3
    cu.resolution_u = 6
    cu.use_fill_caps = True
    o = bpy.data.objects.new("ponytail", cu)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.view_layer.objects.active
    o.scale.x = .8
    bpy.ops.object.transform_apply(scale=True)
    ca = o.data.color_attributes.new("Col", "BYTE_COLOR", "POINT")
    base = srgb(C["hair_col"])
    for v in o.data.vertices:
        k = .95 + .2 * smooth01(root.z - .23, root.z, v.co.z)
        ca.data[v.index].color = (base[0] * k, base[1] * k, base[2] * k, 1)
    o.data.materials.append(hm)
    bpy.ops.object.shade_smooth()
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
        self.hip = {1: J["l-upper-leg"], -1: J["r-upper-leg"]}
        self.knee = {1: J["l-knee"], -1: J["r-knee"]}
        self.ank = {1: J["l-ankle"], -1: J["r-ankle"]}

    def arm_t(self, p):
        """How far along the upper arm a point is (0 shoulder, 1 elbow, >1 forearm); -1 if not on the arm."""
        s = 1 if p.x > 0 else -1
        S, El = self.sh[s], self.el[s]
        ax = El - S
        t = (p - S).dot(ax) / ax.length_squared
        if abs(p.x) > abs(S.x) * 1.08 and p.z < S.z + .05:
            return max(t, 0.)
        if t < -.05:
            return -1
        q = S + ax * min(max(t, 0), 3)
        r = (p - q).length
        if abs(p.x) < abs(S.x) * .8 or r > .09 * (1.2 if t < .2 else 1):
            return -1
        return t

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
        cloth = textures.fabric("cotton", o["col"], os.path.join(OUT["textures"], "cotton_%s.png" % o["col"].lstrip("#")))
        m = mat("Tee_" + o["col"].lstrip("#"), "#ffffff", rough=.85, image=cloth)

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
        parts = [cut(body, "tee", inc, off, .003, m, smooth=2, decimate=.3, uv_scale=6)]
        if o.get("print"):
            parts.append(chest_print(parts[0], fit, o["print"]))
        return parts
    if kind == "bra":
        return garment("crop_top", body, fit, C, dict(o, lo=.6, name="bra"))
    if kind == "crop_top":
        cloth = textures.fabric("rib", o["col"], os.path.join(OUT["textures"], "rib_%s.png" % o["col"].lstrip("#")))
        m = mat("Crop_" + o["col"].lstrip("#"), "#ffffff", rough=.8, image=cloth)
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
    if kind in ("cargo_shorts", "denim_shorts", "briefs"):
        if kind == "cargo_shorts":
            cloth = textures.fabric("canvas", o["col"], os.path.join(OUT["textures"], "canvas_%s.png" % o["col"].lstrip("#")))
            top, hem, loose = fit.pel + .07, .82, .016
        elif kind == "denim_shorts":
            cloth = textures.fabric("denim", o["col"], os.path.join(OUT["textures"], "denim_%s.png" % o["col"].lstrip("#")))
            top, hem, loose = fit.pel + .045, .38, .008
        else:
            cloth = textures.fabric("cotton", o["col"], os.path.join(OUT["textures"], "cotton_%s.png" % o["col"].lstrip("#")))
            top, hem, loose = fit.pel + .06, -.02, 0
        m = mat(kind + "_" + o["col"].lstrip("#"), "#ffffff", rough=.8, image=cloth)

        def inc(p):
            if fit.arm_t(p) >= 0 or p.z > top:
                return False
            lt = fit.leg_t(p)
            if kind == "briefs":   # hip line to just under the buttocks, through the crotch
                return lt < .2 or (abs(p.x) < .06 and p.z > fit.hip[1].z - .13)
            return lt < hem
        off = lambda p: (.004 if kind == "briefs" else .007) + loose * smooth01(0, .8, fit.leg_t(p))
        parts = [cut(body, kind, inc, off, .003, m, smooth=2, decimate=.32, uv_scale=6)]
        if kind == "cargo_shorts":   # patch pockets on the outer thighs, sewn on a few mm proud of the shorts
            def pocket(p):
                lt = fit.leg_t(p)
                s = 1 if p.x > 0 else -1
                return .33 < lt < .68 and abs(p.y - fit.knee[s].y) < .05 and abs(p.x) > abs(fit.hip[s].x) + .03
            dark = mat(kind + "_pocket_" + o["col"].lstrip("#"), "#ffffff", rough=.85, image=cloth)
            dark.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .9
            parts.append(cut(body, "pockets", pocket, lambda p: off(p) + .006, .003, dark, smooth=1, decimate=.6, uv_scale=6))
        return parts
    if kind == "sneakers":
        up = mat("SneakerUpper_" + o["col"].lstrip("#"), o["col"], rough=.55)
        so = mat("SneakerSole_" + o["sole"].lstrip("#"), o["sole"], rough=.7)
        tr = mat("SneakerTrim_" + o["trim"].lstrip("#"), o["trim"], rough=.5)
        return [sneaker(body, fit, s, up, so, tr) for s in (1, -1)]
    if kind == "sunglasses":
        return sunglasses(F)
    raise ValueError(kind)


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


def sneaker(body, fit, s, up, so, tr):
    """One shoe: the convex hull of the foot (so no toes), pushed out, smoothed, with a flat sole under it."""
    top = fit.ank[s].z + .05
    pts = [v.co + v.normal * .007 for v in body.data.vertices if v.co.z < top and v.co.x * s > 0 and abs(v.co.x) > .03]
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
    o = bpy.data.objects.new("sneaker_" + ("l" if s > 0 else "r"), me)
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
        elif lo + .026 < c.z < lo + .042 and abs(poly.normal.x) > .6:
            poly.material_index = 2                      # side stripe
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
    """Remove body faces that clothing covers completely, to save triangles and stop skin poking through."""
    covered = set()
    for kind, _ in garments:
        if kind in ("tee",):
            covered |= {"torso"}
        if kind in ("cargo_shorts",):
            covered |= {"thigh"}
        if kind in ("sneakers",):
            covered |= {"foot"}
        if kind in ("denim_shorts", "briefs"):
            covered |= {"pelvis"}
    J = fit.J

    def hidden(p):
        t = fit.arm_t(p)
        if "torso" in covered and t < 0 and fit.pel - .05 < p.z < fit.neck - .06:
            return True
        if "thigh" in covered and t < 0 and p.z < fit.pel and .1 < fit.leg_t(p) < .75:
            return True
        if "pelvis" in covered and t < 0 and fit.hip[1].z - .05 < p.z < fit.pel and fit.leg_t(p) < .05:
            return True
        if "foot" in covered and p.z < fit.ank[1].z + .02:
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
    paint_skin(body, F, C, J)
    head = eyes(B, C, F) + hair(body, F, C, J)

    def dress(items):
        out = []
        for kind, o in items:
            out += garment(kind, body, fit, C, o)
        return out

    under = dress(C["underwear"])
    outfit = dress(C["outfit"])
    # collections: base (body + head + underwear) and outfit
    col_base = bpy.data.collections.new("base")
    col_out = bpy.data.collections.new("outfit")
    bpy.context.scene.collection.children.link(col_base)
    bpy.context.scene.collection.children.link(col_out)
    for o in [body] + head + under:
        for c in o.users_collection:
            c.objects.unlink(o)
        col_base.objects.link(o)
    for o in outfit:
        for c in o.users_collection:
            c.objects.unlink(o)
        col_out.objects.link(o)
    # everyone stands on their soles
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            o.location.z += SOLE
    blend = os.path.join(OUT["base_models"], name + ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    print("  saved", blend)

    # ---- game exports: decimated, hidden faces dropped
    body_lo = dup(body, name + "_body_lod0")
    decimate(body_lo, .4)
    report = {}

    budget = {"hair": 1800, "sneaker_l": 700, "sneaker_r": 700, "ponytail": 400, "tee": 2200, "cargo_shorts": 1300,
              "pockets": 160, "denim_shorts": 900, "crop_top": 900, "briefs": 700, "bra": 700}

    def export(objs, path):
        # game budget: heavy parts are decimated on copies for the export; the .blend keeps full detail
        tmp = []
        for i, o in enumerate(objs):
            k = o.name.split(".")[0]
            if k in budget and tris(o) > budget[k] * 1.1:
                c = dup(o, k)
                decimate_to(c, budget[k])
                objs[i] = c
                tmp.append(c)
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                                  export_yup=True, export_image_format="JPEG", export_jpeg_quality=88)
        t = sum(tris(o) for o in objs)
        parts = {}
        for o in objs:
            k = o.name.split(".")[0]
            parts[k] = parts.get(k, 0) + tris(o)
        print("   ", ", ".join("%s %d" % kv for kv in sorted(parts.items(), key=lambda kv: -kv[1])))
        report[os.path.basename(path)] = (t, os.path.getsize(path))
        print("  exported %s: %d tris, %d KB" % (path, t, os.path.getsize(path) // 1024))
        for c in tmp:
            bpy.data.objects.remove(c)

    export([body_lo] + head + under, os.path.join(OUT["exports"], name + "_base.glb"))
    dressed = dup(body_lo, name + "_body_dressed")
    hide_under(dressed, C["outfit"], fit)
    export([dressed] + head + outfit, os.path.join(OUT["exports"], name + ".glb"))
    for o in (body_lo, dressed):
        bpy.data.objects.remove(o)
    return report


if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in CHARACTERS] or list(CHARACTERS)
    for n in names:
        print(build(n))
