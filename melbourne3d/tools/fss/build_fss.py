"""Flinders Street Station for melbourne3d, built headless in Blender 4.2 and exported as glTF.

  blender -b -P build_fss.py -- TEX_DIR OUT.glb
  (then: gltfpack -i OUT.glb -o ../../assets/landmarks/flinders-station.glb -c -kn -km)

TEX_DIR holds fss_color.png / fss_emit.png from paint_textures.py (the trim sheet; LAYOUT there must match ROWS here).
Everything is placed from the OSM footprint in js/melbourne-geodata.js (landmarks["Flinders Street Station"].ring), in the
game's frame (x = grid east, z = grid south, y up, metres) relative to ORIGIN, the site centre the game places the model at.
One mesh per level of detail and one material (the trim sheet), so the whole station is one draw call:
  FSS_LOD0  the full model (facades per 7.5 m bay, dome, clock towers, pavilions, platform canopies)
  FSS_LOD1  the far model (the same masses as plain boxes, the dome and towers simplified)
"""
import math
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['.', 'fss.glb']
TEX_DIR, OUT = argv[0], argv[1]

ORIGIN = (-177.5, 264.7)  # LANDMARK_SITES['Flinders Street Station'] (x, z)
SHEET = 2048.0
PX = 34.0
# trim sheet rows (px, top-down) from paint_textures.py
ROWS = {'A': (0, 714), 'B': (720, 1026), 'C': (1032, 1338), 'D': (1344, 1600), 'E': (1606, 1734), 'F': (1740, 2048)}
SWATCH = {'cream': (1600, 1660), 'ochre': (1666, 1726), 'red': (1732, 1792), 'dark': (1798, 1858), 'glass': (1864, 1924),
          'stone': (1930, 1990)}
BAYW = 256 / PX  # 7.53 m

# OSM footprint, game frame
FRONT_W, FRONT_E = (-332.5, 254.2), (-40.0, 249.0)  # Flinders St frontage
BACK_W, BACK_E = (-332.4, 266.6), (-71.0, 260.2)
H_MAIN = 21.0
SKIRT = 6.0


def lerp(a, b, t):
    return a + (b - a) * t


def front_z(x):
    return lerp(FRONT_W[1], FRONT_E[1], (x - FRONT_W[0]) / (FRONT_E[0] - FRONT_W[0]))


def back_z(x):
    return lerp(BACK_W[1], BACK_E[1], (x - BACK_W[0]) / (BACK_E[0] - BACK_W[0]))


class MeshB:
    def __init__(self):
        self.v, self.f, self.uv = [], [], []

    def vert(self, x, y, z):
        self.v.append((x - ORIGIN[0], -(z - ORIGIN[1]), y))
        return len(self.v) - 1

    def face(self, pts, uvs):
        """pts: game (x, y, z) in counter-clockwise order seen from outside; uvs: per point (px_x, px_y) on the sheet"""
        idx = [self.vert(*p) for p in pts]
        self.f.append(idx)
        self.uv.append([(u / SHEET, 1.0 - w / SHEET) for (u, w) in uvs])

    # --- helpers -----------------------------------------------------------------------------------------------
    def quad(self, p0, p1, y0, y1, u0, u1, r0, r1):
        """vertical quad from plan point p0 to p1 (outside on the left when walking p0 -> p1 seen from above, i.e. the
        face looks at the viewer standing outside with p0 on their left... see wall()), heights y0..y1,
        sheet px u0..u1 and rows r0 (top, at y1) .. r1 (bottom, at y0)"""
        (x0, z0), (x1, z1) = p0, p1
        self.face([(x0, y0, z0), (x1, y0, z1), (x1, y1, z1), (x0, y1, z0)], [(u0, r1), (u1, r1), (u1, r0), (u0, r0)])

    def wall(self, p0, p1, y0, y1, strip, inside, m0=None, m1=None, variants=6, start=0, bay=BAYW, u_off=0):
        """A wall split into whole bays of the strip. inside: a plan point inside the building (fixes the winding).
        m0..m1: the strip's metres (from its bottom) shown between y0..y1 (default: 0..y1-y0)."""
        (x0, z0), (x1, z1) = p0, p1
        # outward normal of p0->p1 must point away from inside
        nx, nz = (z1 - z0), -(x1 - x0)
        mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
        if nx * (mx - inside[0]) + nz * (mz - inside[1]) < 0:
            # we want the face's front (CCW from outside); with Blender's Y flip, swapping keeps the rule simple
            pass
        L = math.hypot(x1 - x0, z1 - z0)
        if y0 == 0:
            # a stone skirt 6 m into the ground: the game lifts the model rigidly to the highest ground under it
            t0, t1 = SWATCH['stone']
            self.oriented_quad(p0, p1, -SKIRT, 0.0, t0 + 2, t1 - 2, 1882, 2038, inside)
        n = max(1, round(L / bay))
        rt, rb = ROWS[strip]
        if m0 is None:
            m0, m1 = 0.0, y1 - y0
        r_top, r_bot = rb - m1 * PX, rb - m0 * PX
        for k in range(n):
            a, b = k / n, (k + 1) / n
            q0 = (lerp(x0, x1, a), lerp(z0, z1, a))
            q1 = (lerp(x0, x1, b), lerp(z0, z1, b))
            v = (start + k) % variants
            u0, u1 = u_off + v * 256 + 0.5, u_off + (v + 1) * 256 - 0.5
            self.oriented_quad(q0, q1, y0, y1, u0, u1, r_top, r_bot, inside)

    def oriented_quad(self, q0, q1, y0, y1, u0, u1, r_top, r_bot, inside):
        """vertical quad q0 -> q1 facing away from the plan point inside"""
        self.quad(q0, q1, y0, y1, u0, u1, r_top, r_bot)
        bx, by = inside[0] - ORIGIN[0], -(inside[1] - ORIGIN[1])
        self._fix(lambda c: (c[0] - bx, c[1] - by, 0.0))

    def swatch_box(self, cx, cz, hx, hz, y0, y1, sw, ang=0.0, top=True, bottom=False, top_sw=None):
        """an axis-aligned (or turned by ang radians about y) box painted with a flat swatch"""
        ca, sa = math.cos(ang), math.sin(ang)
        P = lambda lx, lz: (cx + lx * ca - lz * sa, cz + lx * sa + lz * ca)
        c = [P(-hx, -hz), P(hx, -hz), P(hx, hz), P(-hx, hz)]
        s0, s1 = SWATCH[sw]
        u0, u1, r0, r1 = s0 + 2, s1 - 2, 1882, 2038
        for i in range(4):
            self.oriented_quad(c[i], c[(i + 1) % 4], y0, y1, u0, u1, r0, r1, (cx, cz))
        if top:
            t0, t1 = SWATCH[top_sw or sw]
            self.flat(c, y1, (t0 + 2, t1 - 2, 1882, 2038), up=True)
        if bottom:
            self.flat(c, y0, (u0, u1, r0, r1), up=False)

    def flat(self, ring, y, uvbox, up=True):
        """horizontal polygon (plan points), facing up or down, painted with one swatch / region"""
        u0, u1, r0, r1 = uvbox
        xs = [p[0] for p in ring]
        zs = [p[1] for p in ring]
        mnx, mxx, mnz, mxz = min(xs), max(xs), min(zs), max(zs)
        uv = [(lerp(u0, u1, (p[0] - mnx) / max(1e-6, mxx - mnx)), lerp(r0, r1, (p[1] - mnz) / max(1e-6, mxz - mnz))) for p in ring]
        pts = [(p[0], y, p[1]) for p in ring]
        # seen from above (+y) with x east and z south, a ring with positive signed area in (x, z) is clockwise...
        area = sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))
        ccw_from_above = area < 0
        if ccw_from_above != up:
            pts, uv = pts[::-1], uv[::-1]
        self.face(pts, uv)

    def revolve(self, cx, cz, prof, n, strip_rows, u_span=(0, 2048), cap=True, ang0=0.0):
        """surface of revolution: prof = [(radius, y), ...] bottom to top; rows map bottom->top of strip_rows"""
        rt, rb = strip_rows
        # arc-length parameter along the profile for v
        acc = [0.0]
        for i in range(1, len(prof)):
            acc.append(acc[-1] + math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]))
        tot = acc[-1] or 1
        for j in range(n):
            a0 = ang0 + 2 * math.pi * j / n
            a1 = ang0 + 2 * math.pi * (j + 1) / n
            u0 = lerp(u_span[0], u_span[1], j / n)
            u1 = lerp(u_span[0], u_span[1], (j + 1) / n)
            for i in range(len(prof) - 1):
                (ra, ya), (rb_, yb) = prof[i], prof[i + 1]
                va, vb = lerp(rb, rt, acc[i] / tot), lerp(rb, rt, acc[i + 1] / tot)
                p00 = (cx + ra * math.cos(a0), ya, cz + ra * math.sin(a0))
                p10 = (cx + ra * math.cos(a1), ya, cz + ra * math.sin(a1))
                p11 = (cx + rb_ * math.cos(a1), yb, cz + rb_ * math.sin(a1))
                p01 = (cx + rb_ * math.cos(a0), yb, cz + rb_ * math.sin(a0))
                if rb_ < 1e-4:
                    self.face([p00, p10, p01], [(u0, va), (u1, va), ((u0 + u1) / 2, vb)])
                    self.fix_tri_winding(cx, cz)
                    continue
                self.face([p00, p01, p11, p10], [(u0, va), (u0, vb), (u1, vb), (u1, va)])
                self.fix_winding(cx, ya, cz)

    def fix_winding(self, cx, cy, cz):
        """make the last face's normal point away from the axis (cx, *, cz)"""
        self._fix(lambda c: (c[0] - (cx - ORIGIN[0]), c[1] - (-(cz - ORIGIN[1])), 0.0))

    def fix_tri_winding(self, cx, cz):
        self._fix(lambda c: (c[0] - (cx - ORIGIN[0]), c[1] - (-(cz - ORIGIN[1])), 0.3))

    def _fix(self, out_of):
        f = self.f[-1]
        P = [self.v[i] for i in f]
        ax, ay, az = (P[1][k] - P[0][k] for k in range(3))
        bx, by, bz = (P[2][k] - P[0][k] for k in range(3))
        n = (ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx)
        c = [sum(p[k] for p in P) / len(P) for k in range(3)]
        o = out_of(c)
        if n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0:
            f.reverse()
            self.uv[-1].reverse()

    def to_object(self, name, mat):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        uvl = me.uv_layers.new(name='UVMap')
        li = 0
        for poly, uvs in zip(me.polygons, self.uv):
            for k, loop in enumerate(poly.loop_indices):
                uvl.data[loop].uv = uvs[k]
        me.materials.append(mat)
        for p in me.polygons:
            p.use_smooth = False
        me.validate()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def material():
    m = bpy.data.materials.new('FSS')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    col = nt.nodes.new('ShaderNodeTexImage')
    col.image = bpy.data.images.load(TEX_DIR + '/fss_color.png')
    col.extension = 'EXTEND'
    emi = nt.nodes.new('ShaderNodeTexImage')
    emi.image = bpy.data.images.load(TEX_DIR + '/fss_emit.png')
    emi.image.colorspace_settings.name = 'sRGB'
    emi.extension = 'EXTEND'
    nt.links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(emi.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = 0.82
    bsdf.inputs['Metallic'].default_value = 0.0
    return m


def sw_uv(name):
    s0, s1 = SWATCH[name]
    return (s0 + 2, s1 - 2, 1882, 2038)


# ---------------------------------------------------------------------------------------------------------------
DOME_C = (-39.0, 265.5)  # the dome's axis: behind the corner entrance (the chamfer from (-36.2,250.4) to (-23.3,263.2))
CLOCK_X = -96.0  # the main clock tower on the Flinders St front, west of the dome pavilion
ELIZ_X = -242.1  # Elizabeth St
PAVILIONS = [-318.0, -276.0, -205.0, -160.0, -128.0]  # projecting pavilions along the front with copper caps


def tower(mb, cx, cz, half, y0, y1, clock_y, cap_h, lod=0, strip='B'):
    """square red-brick tower shaft, clock faces on 4 sides, cornice, copper ogee cap with a finial"""
    c = [(cx - half, cz - half), (cx + half, cz - half), (cx + half, cz + half), (cx - half, cz + half)]
    # shaft in strip B, 9 m rows stacked
    y = y0
    k = 0
    while y < y1 - 0.01:
        top = min(y1, y + 9.0)
        for i in range(4):
            mb.wall(c[i], c[(i + 1) % 4], y, top, strip, (cx, cz), 0.0, top - y, variants=8, start=k + i, bay=half * 2 + 0.01)
        y, k = top, k + 1
    # cornice band
    mb.swatch_box(cx, cz, half + 0.35, half + 0.35, y1, y1 + 0.9, 'cream')
    if lod == 0 and clock_y is not None:
        r = min(half * 0.72, 2.3)
        # clock faces, 0.12 m proud of each side, on the tower clock region of strip F
        u0, u1, v0, v1 = 12, 288, 1756, 2032
        for (nx, nz) in ((0, -1), (1, 0), (0, 1), (-1, 0)):
            px_, pz_ = cx + nx * (half + 0.12), cz + nz * (half + 0.12)
            tx, tz = -nz, nx  # along the face
            q0 = (px_ - tx * r, pz_ - tz * r)
            q1 = (px_ + tx * r, pz_ + tz * r)
            mb.oriented_quad(q0, q1, clock_y - r, clock_y + r, u0, u1, v0, v1, (cx, cz))
    # cap: square base, ogee profile in copper (4 or 8 sides)
    yb = y1 + 0.9
    prof = [(half * 1.42, yb), (half * 1.3, yb + cap_h * 0.18), (half * 1.0, yb + cap_h * 0.45), (half * 0.55, yb + cap_h * 0.75),
            (half * 0.22, yb + cap_h * 0.9), (0.0, yb + cap_h)]
    mb.revolve(cx, cz, prof, 4 if lod else 8, ROWS['D'], (0, 512), ang0=math.pi / 4 if lod else math.pi / 8)
    if lod == 0:
        mb.swatch_box(cx, cz, 0.12, 0.12, yb + cap_h, yb + cap_h + 2.4, 'dark')


def build(lod):
    mb = MeshB()
    inside_wing = lambda x: (x, (front_z(x) + back_z(x)) / 2)
    xw, xe = FRONT_W[0], -71.0
    # ---- the long Flinders St wing ----------------------------------------------------------------------------
    # frontage, split around the projecting pavilions and towers so their faces carry the bays
    fz = front_z
    if lod == 0:
        mb.wall((xw, fz(xw)), (xe, fz(xe)), 0, H_MAIN, 'A', inside_wing(-200), m0=0, m1=21)
    else:
        mb.wall((xw, fz(xw)), (xe, fz(xe)), 0, H_MAIN, 'A', inside_wing(-200), m0=0, m1=21, bay=BAYW * 3)
    # back and west end: strip C stacked (0-9, 9-18), then 18-21 plain ochre
    for (y0, y1, m0, m1) in ((0, 9, 0, 9), (9, 18, 0, 9)):
        mb.wall((xw, back_z(xw)), (xe, back_z(xe)), y0, y1, 'C', inside_wing(-200), m0, m1, variants=8, bay=BAYW * (1 if lod == 0 else 3))
        mb.wall((xw, fz(xw)), (xw, back_z(xw)), y0, y1, 'C', inside_wing(-300), m0, m1, variants=8)
    s0, s1 = SWATCH['ochre']
    mb.oriented_quad((xw, back_z(xw)), (xe, back_z(xe)), 18, H_MAIN, s0 + 2, s1 - 2, 1882, 2038, inside_wing(-200))
    mb.oriented_quad((xw, fz(xw)), (xw, back_z(xw)), 18, H_MAIN, s0 + 2, s1 - 2, 1882, 2038, inside_wing(-300))
    # hipped roof over the wing (slate), ridge 3.2 m above the parapet, set back 0.6 m inside it
    e0, e1 = ROWS['E']
    ins = 0.6
    a = (xw + ins, fz(xw) + ins)
    b = (xe, fz(xe) + ins)
    c = (xe, back_z(xe) - ins)
    d = (xw + ins, back_z(xw) - ins)
    rh = H_MAIN + 3.2
    ra = (xw + 6, (a[1] + d[1]) / 2)
    rb = (xe - 5, (b[1] + c[1]) / 2)
    E = (0, 2048, e0 + 2, e1 - 2)

    def tri_or_quad(pts3, out):
        uvs = [(lerp(E[0], E[1], (p[0] - xw) / (xe - xw)), lerp(E[3], E[2], (p[1] - H_MAIN) / 3.2)) for p in pts3]
        mb.face(pts3, uvs)
        mb._fix(lambda cc: out)
    # (blender frame: game north (-z) is +y)
    tri_or_quad([(a[0], H_MAIN, a[1]), (b[0], H_MAIN, b[1]), (rb[0], rh, rb[1]), (ra[0], rh, ra[1])], (0.0, 1.0, 0.3))
    tri_or_quad([(d[0], H_MAIN, d[1]), (c[0], H_MAIN, c[1]), (rb[0], rh, rb[1]), (ra[0], rh, ra[1])], (0.0, -1.0, 0.3))
    tri_or_quad([(a[0], H_MAIN, a[1]), (d[0], H_MAIN, d[1]), (ra[0], rh, ra[1])], (-1.0, 0.0, 0.3))
    tri_or_quad([(b[0], H_MAIN, b[1]), (c[0], H_MAIN, c[1]), (rb[0], rh, rb[1])], (1.0, 0.0, 0.3))
    # parapet top (the wall's thickness is not modelled: a cream cap strip on the front only)
    if lod == 0:
        # projecting cornice along the front: a long cream box at 17.6-18.7 m, 0.55 m proud
        ang = math.atan2(FRONT_E[1] - FRONT_W[1], FRONT_E[0] - FRONT_W[0])
        L = math.hypot(xe - xw, fz(xe) - fz(xw))
        mx, mz = (xw + xe) / 2, (fz(xw) + fz(xe)) / 2
        nx, nz = math.sin(ang), -math.cos(ang)  # outward (north, -z)
        mb.swatch_box(mx + nx * 0.25, mz + nz * 0.25, L / 2, 0.3, 17.6, 18.7, 'cream', ang=ang, bottom=True)
        mb.swatch_box(mx + nx * 0.1, mz + nz * 0.1, L / 2, 0.25, H_MAIN - 0.01, H_MAIN + 0.35, 'cream', ang=ang)
        # stringcourse ledge at 6.8 m
        mb.swatch_box(mx + nx * 0.12, mz + nz * 0.12, L / 2, 0.2, 6.8, 7.3, 'cream', ang=ang, bottom=True)
    # ---- pavilions: project 1.2 m, 2 bays wide, attic storey in red brick and a copper cap -----------------------
    for px_ in PAVILIONS + [ELIZ_X]:
        w = BAYW * 1.25
        z_f = fz(px_)
        p0, p1 = (px_ - w, z_f), (px_ + w, z_f)
        f0, f1 = (px_ - w, z_f - 1.2), (px_ + w, z_f - 1.2)
        inside = (px_, z_f + 3)
        top = H_MAIN + (4.0 if px_ != ELIZ_X else 0.0)
        if lod == 0:
            mb.wall(f0, f1, 0, H_MAIN, 'A', inside, 0, 21, start=2)
            mb.wall(p0, f0, 0, H_MAIN, 'A', inside, 0, 21, bay=1.2, start=1)
            mb.wall(f1, p1, 0, H_MAIN, 'A', inside, 0, 21, bay=1.2, start=1)
        else:
            mb.wall(f0, f1, 0, H_MAIN, 'A', inside, 0, 21, start=2, bay=w * 2)
        if px_ == ELIZ_X:
            continue
        # attic storey (red brick) above the parapet, on the pavilion's full depth (to 6 m back)
        bz0, bz1 = z_f - 1.2, z_f + 6.0
        cx, cz = px_, (bz0 + bz1) / 2
        hx, hz = w, (bz1 - bz0) / 2
        cc = [(cx - hx, cz - hz), (cx + hx, cz - hz), (cx + hx, cz + hz), (cx - hx, cz + hz)]
        for i in range(4):
            mb.wall(cc[i], cc[(i + 1) % 4], H_MAIN, top, 'B', (cx, cz), 4.6, 8.6, variants=8, start=i, bay=hx * 2 + 0.01)
        mb.swatch_box(cx, cz, hx + 0.3, hz + 0.3, top, top + 0.6, 'cream')
        # a low copper mansard (4 sides) to a short finial
        prof = [(math.hypot(hx, hz) + 0.3, top + 0.6), (math.hypot(hx, hz) * 0.8, top + 2.0), (1.0, top + 2.9), (0.0, top + 3.4)]
        mb.revolve(cx, cz, prof, 4, ROWS['D'], (0, 512), ang0=math.atan2(hz, hx))
    # ---- the Elizabeth St clock tower -----------------------------------------------------------------------------
    ez = fz(ELIZ_X) + 2.6
    tower(mb, ELIZ_X, ez, 3.2, H_MAIN, 30.0, 27.2 if lod == 0 else None, 6.0, lod, 'C')
    # ---- the main clock tower ---------------------------------------------------------------------------------
    cz_ = fz(CLOCK_X) + 3.2
    # tower base projects from the facade
    tower(mb, CLOCK_X, cz_, 4.4, 0.0 if lod == 0 else H_MAIN, 36.0, 33.0 if lod == 0 else None, 9.0, lod, 'C')
    # ---- the dome pavilion at Flinders and Swanston -----------------------------------------------------------
    ring = [(-71.0, 260.2), (-71.1, 262.7), (-67.3, 266.3), (-66.5, 280.3), (-22.5, 279.4), (-22.6, 270.2),
            (-26.5, 266.4), (-23.3, 263.2), (-36.2, 250.4), (-40.0, 249.0)]
    # clean: square off the small kinks
    ring = [(-71.0, fz(-71.0)), (-71.0, 280.3), (-22.5, 280.3), (-22.5, 263.2), (-23.3, 263.2), (-36.2, 250.4), (-40.0, fz(-40.0))]
    inside = (-45.0, 268.0)
    n = len(ring)
    for i in range(n):
        p0, p1 = ring[i], ring[(i + 1) % n]
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        if L < 1.0:
            mb.wall(p0, p1, 0, H_MAIN, 'C', inside, 0, 9, variants=8)
            continue
        is_portal = abs(p0[0] + 23.3) < 0.01 and abs(p1[0] + 36.2) < 0.01
        is_front = p0[1] < 252.0 and p1[1] < 252.0  # Flinders St face
        is_swan = abs(p0[0] + 22.5) < 0.01 and abs(p1[0] + 22.5) < 0.01  # Swanston St face
        if is_portal:
            # one portal panel, the full 21 m
            mb.oriented_quad(p0, p1, 0, H_MAIN, 1536.5, 2047.5, 0, 714, inside)
            mb.oriented_quad(p0, p1, -SKIRT, 0.0, SWATCH['stone'][0] + 2, SWATCH['stone'][1] - 2, 1882, 2038, inside)
        elif is_front or is_swan:
            mb.wall(p0, p1, 0, H_MAIN, 'A', inside, 0, 21, bay=BAYW if lod == 0 else L)
        else:
            for (y0, y1) in ((0, 9), (9, 18)):
                mb.wall(p0, p1, y0, y1, 'C', inside, 0, 9, variants=8, bay=BAYW if lod == 0 else L)
            mb.oriented_quad(p0, p1, 18, H_MAIN, s0 + 2, s1 - 2, 1882, 2038, inside)
    # flat roof of the pavilion (dark), the drum sits on it
    mb.flat(ring, H_MAIN, sw_uv('dark'), up=True)
    dcx, dcz = DOME_C
    R = 10.5
    # square base under the drum: a cream-capped attic ring (octagon), 21 -> 23.5
    prof_attic = [(R + 1.6, H_MAIN), (R + 1.6, 23.5)]
    mb.revolve(dcx, dcz, prof_attic, 8, (ROWS['A'][0] + 30, ROWS['A'][0] + 30 + 2.5 * PX), (0, 1536), ang0=math.pi / 8)
    mb.flat([(dcx + (R + 1.6) * math.cos(math.pi / 8 + k * math.pi / 4), dcz + (R + 1.6) * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)], 23.5, sw_uv('cream'))
    # drum with arched windows (strip C, its upper storey), 23.5 -> 29.5
    nd = 16 if lod == 0 else 8
    mb.revolve(dcx, dcz, [(R, 23.5), (R, 30.5)], nd, (ROWS['C'][1] - 9.0 * PX, ROWS['C'][1] - 2.0 * PX), (0, 2048 if lod == 0 else 1024))
    # cornice ring
    mb.revolve(dcx, dcz, [(R, 30.5), (R + 0.6, 30.8), (R + 0.6, 31.4), (R, 31.6)], nd, (1882, 2038), (SWATCH['cream'][0] + 2, SWATCH['cream'][1] - 2))
    # the dome: a raised (slightly pointed) profile in copper with 32 ribs
    prof = []
    steps = 9 if lod == 0 else 4
    for i in range(steps + 1):
        t = i / steps
        ang = t * math.pi / 2
        r = R * math.cos(ang)
        y = 31.6 + 12.5 * math.sin(ang) ** 0.85
        prof.append((max(r, 1.5 if i == steps else r), y))
    prof[-1] = (1.5, prof[-1][1])
    mb.revolve(dcx, dcz, prof, 32 if lod == 0 else 12, ROWS['D'], (0, 2048))
    ytop = prof[-1][1]
    # lantern: a small drum and cap
    if lod == 0:
        mb.revolve(dcx, dcz, [(1.5, ytop), (1.5, ytop + 2.4)], 8, (ROWS['C'][1] - 9.0 * PX, ROWS['C'][1] - 5.0 * PX), (0, 512))
        mb.revolve(dcx, dcz, [(1.9, ytop + 2.4), (1.2, ytop + 3.4), (0.0, ytop + 5.2)], 8, ROWS['D'], (0, 512))
        # four small turrets around the drum's base, on the pavilion roof corners
        for k in range(4):
            a = k * math.pi / 2  # on the axes: two flank the corner portal, none stands in front of it
            tx, tz = dcx + (R + 3.4) * math.cos(a), dcz + (R + 3.4) * math.sin(a)
            mb.revolve(tx, tz, [(1.3, H_MAIN), (1.3, 26.0)], 8, (ROWS['B'][1] - 5 * PX, ROWS['B'][1]), (0, 256))
            mb.revolve(tx, tz, [(1.6, 26.0), (1.6, 26.5), (1.0, 27.8), (0.0, 29.6)], 8, ROWS['D'], (0, 256))
        # entrance steps in front of the corner portal
        for k in range(3):
            o = 2.4 - k * 0.8
            q0, q1 = (-36.2, 250.4), (-23.3, 263.2)
            nx, nz = 0.7071, -0.7071
            pts = [(q0[0] + nx * o, q0[1] + nz * o), (q1[0] + nx * o, q1[1] + nz * o), q1, q0]
            mb.flat(pts, 0.18 * (k + 1) - 0.1, sw_uv('stone'))
    # ---- platform canopies behind (lod 0 only; far away they are not visible behind the building) -----------------
    if lod == 0:
        for k in range(6):
            z0 = 284.0 + k * 10.0
            x0, x1 = -320.0, -78.0 if k < 2 else -30.0
            # roof: a shallow gable of corrugated iron (strip E), eaves at 5.6 m, ridge 6.4 m
            ya, yb_, w = 5.6, 6.4, 3.8
            for side in (-1, 1):
                pe = [(x0, ya, z0 + side * w), (x1, ya, z0 + side * w), (x1, yb_, z0), (x0, yb_, z0)]
                mb.face(pe, [(0, e1 - 2), (2048, e1 - 2), (2048, e0 + 2), (0, e0 + 2)])
                mb._fix(lambda cc, s=side: (0.0, -0.4 * s, 1.0))
                # underside
                mb.face(pe[::-1], [(SWATCH['dark'][0] + 2, 1882), (SWATCH['dark'][1] - 2, 1882), (SWATCH['dark'][1] - 2, 2038), (SWATCH['dark'][0] + 2, 2038)][::-1])
                mb._fix(lambda cc: (0.0, 0.0, -1.0))
            # posts every 18 m
            xx = x0 + 6
            while xx < x1 - 3:
                mb.swatch_box(xx, z0, 0.15, 0.15, 0.0, ya, 'dark', top=False)
                xx += 18.0
    return mb


def main():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    mat = material()
    o0 = build(0).to_object('FSS_LOD0', mat)
    o1 = build(1).to_object('FSS_LOD1', mat)
    for o in (o0, o1):
        print(o.name, 'verts', len(o.data.vertices), 'tris', sum(len(p.vertices) - 2 for p in o.data.polygons))
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False,
                              export_image_format='JPEG', export_jpeg_quality=86, export_normals=True,
                              export_materials='EXPORT')
    print('exported', OUT)


main()
