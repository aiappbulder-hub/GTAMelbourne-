"""Draws one texture with Pillow. Called by textures.py:  python3 -I tex_gen.py <kind> <out.png> '<json args>'

kinds:
  fabric  {weave: cotton|rib|canvas|denim, col}  512px tileable cloth, tinted to col
  iris    {col}                                   512px eyeball map for a UV sphere whose top pole looks forward
  logo    {brand}                                 512px print with transparency, for an original fictional brand
"""
import sys, json, math, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont


def hexrgb(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def tile_noise(n, scale, seed):
    """Tileable value noise in 0..1 (bilinear over a wrapped lattice)."""
    rnd = random.Random(seed)
    g = [[rnd.random() for _ in range(scale)] for _ in range(scale)]
    im = Image.new("L", (n, n))
    px = im.load()
    for y in range(n):
        fy = y * scale / n
        y0, ty = int(fy), fy - int(fy)
        for x in range(n):
            fx = x * scale / n
            x0, tx = int(fx), fx - int(fx)
            a = g[y0 % scale][x0 % scale]; b = g[y0 % scale][(x0 + 1) % scale]
            c = g[(y0 + 1) % scale][x0 % scale]; d = g[(y0 + 1) % scale][(x0 + 1) % scale]
            tx2, ty2 = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
            px[x, y] = int(255 * ((a * (1 - tx2) + b * tx2) * (1 - ty2) + (c * (1 - tx2) + d * tx2) * ty2))
    return im


def fabric(out, weave, col):
    N = 512
    r, g, b = hexrgb(col)
    base = Image.new("RGB", (N, N), (r, g, b))
    px = base.load()
    rnd = random.Random(hash(weave) & 0xffff)
    mott = tile_noise(N, 8, 3).load()
    fine = tile_noise(N, 64, 5).load()
    for y in range(N):
        for x in range(N):
            k = 1 + (mott[x, y] / 255 - .5) * .10 + (fine[x, y] / 255 - .5) * .10
            if weave == "denim":       # 3/1 twill: diagonal ridges, white weft showing through, faded high spots
                d = ((x + y * 3) // 3) % 4
                k *= (1.08 if d == 0 else .94)
                fade = mott[x, y] / 255
                w = (x * 7 + y) % 9 == 0
                cr, cg, cb = r * k, g * k, b * k
                if w:
                    cr, cg, cb = cr + 40, cg + 40, cb + 40
                cr, cg, cb = cr + (235 - cr) * fade * .22, cg + (235 - cg) * fade * .22, cb + (235 - cb) * fade * .18
                px[x, y] = (int(min(255, cr)), int(min(255, cg)), int(min(255, cb)))
                continue
            if weave == "knit":        # chunky knit: rows of V stitches
                cx, cy = x % 16, y % 12
                v = abs(cx - 8) / 8
                k *= .78 + .3 * (1 - abs(cy / 12 - v * .5 - .25) * 2) ** 2 * (0.85 + .15 * (cx // 8))
            elif weave == "fleece":    # soft brushed fleece: low contrast mottling
                k *= .97 + (fine[x, y] / 255 - .5) * .08
            elif weave == "nylon":     # ripstop: fine grid, faint sheen
                k *= (.92 if (x % 24 < 2 or y % 24 < 2) else 1.) * (1 + .06 * math.sin(y / N * 2 * math.pi * 3))
            elif weave == "hivis":     # fluoro polyester: fine birdseye mesh
                k *= .93 + .1 * (((x // 3) + (y // 3)) % 2)
            elif weave == "mesh":      # athletic mesh: little holes
                k *= .72 if ((x % 10 - 5) ** 2 + (y % 10 - 5) ** 2) < 5 else 1.
            elif weave == "satin":     # satin: smooth with soft sheen bands
                k *= .9 + .15 * math.sin((x * .3 + y) / N * 2 * math.pi * 2) ** 2
            elif weave == "lycra":     # leggings: smooth, very fine rib
                k *= .97 + .04 * (x % 4 < 2)
            elif weave == "rib":         # knitted ribs running vertically
                k *= .9 + .12 * (0.5 + 0.5 * math.cos(x / N * 2 * math.pi * 64))
            elif weave == "canvas":    # plain weave
                k *= .93 + .1 * (((x // 2) + (y // 2)) % 2)
            else:                      # cotton jersey: tiny loops
                k *= .96 + .06 * (((x // 2) % 2) ^ ((y // 3) % 2))
            px[x, y] = (int(min(255, r * k + 6)), int(min(255, g * k + 6)), int(min(255, b * k + 6)))
    base.save(out)


def iris(out, col):
    """Equirectangular map: v=0 is the top pole (looking forward), so the iris is a band at the top."""
    W, H = 512, 256
    im = Image.new("RGB", (W, H), (236, 232, 228))
    px = im.load()
    r, g, b = hexrgb(col)
    rnd = random.Random(7)
    streak = [rnd.random() for _ in range(W)]
    for y in range(H):
        lat = y / H * 180          # 0 at the front pole
        for x in range(W):
            if lat < 4.8:          # pupil
                px[x, y] = (8, 8, 10)
            elif lat < 13.5:       # iris: radial streaks, darker rim, lighter near the pupil
                t = (lat - 4.8) / 8.7
                s = .75 + .5 * streak[x] * (1 - t * .5)
                k = s * (1.25 - .55 * t) * (1 - .6 * max(0, t - .82) / .18)
                px[x, y] = (int(min(255, r * k)), int(min(255, g * k)), int(min(255, b * k)))
            elif lat < 16:         # limbal ring
                px[x, y] = (40, 34, 30)
            else:                  # sclera, a touch pinker towards the back
                t = min(1, (lat - 16) / 70)
                v = 238 - 14 * t
                px[x, y] = (int(v + 6 * t), int(v - 8 * t), int(v - 10 * t))
    im = im.filter(ImageFilter.GaussianBlur(.6))
    im.save(out)


BRANDS = {
    # original, fictional labels for the GTA Melbourne world
    "southerly": dict(word="SOUTHERLY", sub="SURF CO. - EST. 1987", mark="wave", col=(244, 244, 240)),
    "melb_run": dict(word="MELBOURNE", sub="RUN CLUB", mark="none", col=(226, 44, 40)),
    "yarra_rats": dict(word="YARRA RATS", sub="ATHLETIC", mark="bar", col=(244, 244, 240)),
}


def logo(out, brand):
    B = BRANDS[brand]
    N = 512
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    font = lambda s: ImageFont.truetype("/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf", s)
    col = B["col"] + (255,)
    if B["mark"] == "wave":    # a breaking wave in a circle
        cx, cy, R = N // 2, 170, 120
        d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=col, width=14)
        pts = []
        for i in range(60):
            t = i / 59
            x = cx - R * .85 + t * R * 1.7
            y = cy + 40 - 70 * math.sin(t * math.pi * .9) * (1 - .3 * t)
            pts.append((x, y))
        d.line(pts, fill=col, width=18, joint="curve")
        d.ellipse([cx + 10, cy - 50, cx + 70, cy + 10], outline=col, width=14)
    elif B["mark"] == "bar":
        d.rectangle([90, 120, N - 90, 150], fill=col)
    f = font(78)
    w = d.textlength(B["word"], font=f)
    d.text(((N - w) / 2, 320), B["word"], font=f, fill=col)
    f2 = font(30)
    w2 = d.textlength(B["sub"], font=f2)
    d.text(((N - w2) / 2, 418), B["sub"], font=f2, fill=col)
    # a worn screen print: knock random specks out of the ink
    a = im.split()[3].load()
    rnd = random.Random(3)
    for _ in range(9000):
        x, y = rnd.randrange(N), rnd.randrange(N)
        a[x, y] = int(a[x, y] * .3)
    im.save(out)


if __name__ == "__main__":
    kind, out, kw = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
    {"fabric": fabric, "iris": iris, "logo": logo}[kind](out, **kw)
