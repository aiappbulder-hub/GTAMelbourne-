"""Procedural textures for the character pipeline: fabrics, irises and original brand prints.

The images are drawn with Pillow in the system Python (Blender's bundled Python may not have it), so
each call shells out to `python3 -I tex_gen.py`. Colour helpers are plain Python.
"""
import os, subprocess, json, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def _hex(c):
    c = c.lstrip("#")
    return [int(c[i:i + 2], 16) for i in (0, 2, 4)]


def _to(c):
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(v))) for v in c)


def shade(col, k):
    """Lighten (k > 0) or darken (k < 0) a hex colour."""
    c = _hex(col)
    return _to([v + (255 - v) * k if k > 0 else v * (1 + k) for v in c])


def blend(a, b, t):
    A, Bc = _hex(a), _hex(b)
    return _to([x + (y - x) * t for x, y in zip(A, Bc)])


def _gen(kind, path, **kw):
    if not os.path.exists(path):
        subprocess.run([os.environ.get("TEX_PYTHON", "python3"), "-I", os.path.join(HERE, "tex_gen.py"), kind, path, json.dumps(kw)], check=True)
    return path


def fabric(weave, col, path):
    return _gen("fabric", path, weave=weave, col=col)


def iris(col, path):
    return _gen("iris", path, col=col)


def logo(brand, path):
    return _gen("logo", path, brand=brand)
