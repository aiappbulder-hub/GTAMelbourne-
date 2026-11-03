"""Shared helpers for the GTA Melbourne character pipeline.

Loads the MakeHuman base mesh (CC0, characters/source/base.obj), blends its CC0 body-shape targets,
finds the joint centres the mesh carries, and builds Blender objects from its groups. Everything here
is our own code; only the mesh and target data come from MakeHuman.

Coordinates: MakeHuman is Y-up in decimetres facing +Z. Blender objects are built Z-up in metres,
facing -Y (so glTF exports face +Z), with the feet on Z = 0.
"""
import os, math, collections
import bpy, bmesh
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "characters"))
SRC = os.path.join(ROOT, "source")


class Base:
    """The base mesh: vertices, UVs and faces tagged with their group."""

    def __init__(self, path=os.path.join(SRC, "base.obj")):
        self.v, self.vt, self.faces = [], [], []   # faces: (group, [vi], [ti])
        g = None
        with open(path) as f:
            for line in f:
                if line.startswith("v "):
                    _, x, y, z = line.split()[:4]
                    self.v.append([float(x), float(y), float(z)])
                elif line.startswith("vt "):
                    _, u, w = line.split()[:3]
                    self.vt.append((float(u), float(w)))
                elif line.startswith("g "):
                    g = line.split()[1]
                elif line.startswith("f "):
                    vi, ti = [], []
                    for tok in line.split()[1:]:
                        a = tok.split("/")
                        vi.append(int(a[0]) - 1)
                        ti.append(int(a[1]) - 1 if len(a) > 1 and a[1] else -1)
                    self.faces.append((g, vi, ti))
        self.rest = [list(p) for p in self.v]

    def apply_targets(self, weights):
        """weights: {target file name (no extension): weight}. Offsets add onto the rest shape."""
        self.v = [list(p) for p in self.rest]
        for name, w in weights.items():
            if not w:
                continue
            with open(os.path.join(SRC, "targets", name + ".target")) as f:
                for line in f:
                    if not line.strip() or line[0] == "#":
                        continue
                    i, dx, dy, dz = line.split()
                    p = self.v[int(i)]
                    p[0] += float(dx) * w
                    p[1] += float(dy) * w
                    p[2] += float(dz) * w

    def world(self, i):
        """Vertex i in Blender metres (Z up, facing -Y), before the ground offset."""
        x, y, z = self.v[i]
        return Vector((x * .1, -z * .1, y * .1))

    def joints(self):
        """Centre of every joint-* group, in Blender metres with the feet on the ground."""
        acc = collections.defaultdict(list)
        for g, vi, _ in self.faces:
            if g and g.startswith("joint-"):
                acc[g[6:]].extend(vi)
        J = {k: sum((self.world(i) for i in set(v)), Vector()) / len(set(v)) for k, v in acc.items()}
        self.ground = min(self.world(i).z for g, vi, _ in self.faces if g == "body" for i in vi)
        for k in J:
            J[k].z -= self.ground
        return J

    def build(self, name, groups, keep=None):
        """A mesh object from the faces in `groups` (with UVs); keep(face_vertex_positions) can filter faces."""
        used, faces = {}, []
        for g, vi, ti in self.faces:
            if g not in groups:
                continue
            if keep and not keep([self.world(i) for i in vi]):
                continue
            faces.append((vi, ti))
            for i in vi:
                used.setdefault(i, len(used))
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        verts = [None] * len(used)
        for i, k in used.items():
            p = self.world(i)
            p.z -= self.ground
            verts[k] = bm.verts.new(p)
        uvl = bm.loops.layers.uv.new("UVMap")
        for vi, ti in faces:
            try:
                f = bm.faces.new([verts[used[i]] for i in vi])
            except ValueError:
                continue
            for loop, t in zip(f.loops, ti):
                if t >= 0:
                    loop[uvl].uv = self.vt[t]
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(o)
        for p in me.polygons:
            p.use_smooth = True
        o["mh_index"] = ",".join(str(i) for i in sorted(used, key=used.get))   # base-mesh vertex index of each vertex
        return o


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)
