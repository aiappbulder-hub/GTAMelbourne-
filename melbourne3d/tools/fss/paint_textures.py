#!/usr/bin/env python3
"""Flinders Street Station trim sheet (colour + night emission), painted from scratch with Pillow.

Usage: python3 paint_textures.py OUT_DIR
Writes fss_color.png and fss_emit.png (2048 x 2048). The layout (pixel rows and the metres they stand for) is shared with
build_fss.py through LAYOUT below: keep the two in step. 34 px = 1 m everywhere on the sheet.

Strips (top of the image = y 0):
  A  main Flinders St facade, 21 m tall: bays 0-5 (7.53 m each, u 0 .. 0.75) and the corner portal (u 0.75 .. 1)
  B  red brick with cream bands (pavilions, towers), 9 m tall, 8 bays (even: arched window, odd: plain)
  C  ochre side/back wall with small windows, 9 m tall, 8 bays
  D  copper patina with dome ribs
  E  roof (slate / corrugated iron)
  F  clocks: the indicator row, a single tower clock face, and flat swatches (cream, ochre, red, dark, glass)
"""
import math
import random
import sys
from PIL import Image, ImageDraw, ImageFilter

W = H = 2048
PX = 34  # pixels per metre
BAY = 256  # px, = 7.53 m

LAYOUT = {
    'A': (0, 714), 'B': (720, 1026), 'C': (1032, 1338), 'D': (1344, 1600), 'E': (1606, 1734), 'F': (1740, 2048)
}
# swatches in strip F (x0, x1), each spans the strip's rows 1880..2040
SWATCH = {'cream': (1600, 1660), 'ochre': (1666, 1726), 'red': (1732, 1792), 'dark': (1798, 1858), 'glass': (1864, 1924),
          'stone': (1930, 1990)}

OCHRE = (214, 160, 74)
OCHRE_D = (188, 136, 58)
CREAM = (236, 222, 186)
CREAM_D = (204, 190, 156)
RED = (150, 66, 44)
RED_D = (118, 50, 34)
GLASS = (38, 46, 52)
FRAME = (226, 214, 184)
DARK = (34, 30, 28)
STONE = (120, 116, 108)

rnd = random.Random(1910)


def noise_fill(img, box, base, amp=10, grain=3):
    """Fill box with base colour and blotchy noise (painted render / weathering)."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    small = Image.new('RGB', (max(1, w // grain), max(1, h // grain)))
    px = small.load()
    for j in range(small.size[1]):
        for i in range(small.size[0]):
            d = rnd.randint(-amp, amp)
            px[i, j] = tuple(max(0, min(255, c + d)) for c in base)
    small = small.resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(0.6))
    img.paste(small, (x0, y0))


def brick_courses(d, box, col, every=9, alpha_col=None):
    x0, y0, x1, y1 = box
    for y in range(y0 + every, y1, every):
        d.line([(x0, y), (x1, y)], fill=col, width=1)


def arch_window(d, e, cx, top, bot, w, glass=GLASS, frame=FRAME, surround=CREAM, lit=None, bars=2, keystone=True):
    """Round-headed window: cream archivolt, glazing with bars. top = y of arch crown (px), bot = sill (px)."""
    r = w / 2
    sw = max(3, int(w * 0.16))  # surround width
    # surround
    d.rectangle([cx - r - sw, top + r, cx + r + sw, bot], fill=surround)
    d.pieslice([cx - r - sw, top - sw, cx + r + sw, top + 2 * r + sw], 180, 360, fill=surround)
    # sill
    d.rectangle([cx - r - sw - 3, bot, cx + r + sw + 3, bot + max(3, sw // 2)], fill=surround)
    # reveal shadow then glass
    d.rectangle([cx - r, top + r, cx + r, bot], fill=(70, 60, 50))
    d.pieslice([cx - r, top, cx + r, top + 2 * r], 180, 360, fill=(70, 60, 50))
    ins = max(1, int(w * 0.07))
    d.rectangle([cx - r + ins, top + r, cx + r - ins // 2, bot - 1], fill=glass)
    d.pieslice([cx - r + ins, top + ins, cx + r - ins // 2, top + 2 * r - ins], 180, 360, fill=glass)
    # glazing bars
    fw = max(1, int(w * 0.05))
    d.line([(cx, top + ins), (cx, bot)], fill=frame, width=fw)
    for k in range(1, bars + 1):
        y = top + r + (bot - top - r) * k / (bars + 1)
        d.line([(cx - r + ins, y), (cx + r - ins, y)], fill=frame, width=fw)
    d.line([(cx - r + ins, top + r), (cx + r - ins, top + r)], fill=frame, width=fw)
    if keystone:
        d.polygon([(cx - sw * 0.6, top - sw), (cx + sw * 0.6, top - sw), (cx + sw * 0.4, top + ins), (cx - sw * 0.4, top + ins)], fill=CREAM_D)
    if lit is not None and e is not None:
        e.rectangle([cx - r + ins, top + r, cx + r - ins // 2, bot - 1], fill=lit)
        e.pieslice([cx - r + ins, top + ins, cx + r - ins // 2, top + 2 * r - ins], 180, 360, fill=lit)
        e.line([(cx, top + ins), (cx, bot)], fill=(0, 0, 0), width=fw)
        for k in range(1, bars + 1):
            y = top + r + (bot - top - r) * k / (bars + 1)
            e.line([(cx - r + ins, y), (cx + r - ins, y)], fill=(0, 0, 0), width=fw)


def lit_colour():
    if rnd.random() < 0.3:
        return (0, 0, 0)
    k = 0.55 + rnd.random() * 0.45
    return (int(255 * k), int(196 * k), int(120 * k))


def band(d, y0, y1, x0, x1, col=CREAM, shadow=True):
    d.rectangle([x0, y0, x1, y1], fill=col)
    if shadow:
        d.line([(x0, y1 + 1), (x1, y1 + 1)], fill=OCHRE_D, width=2)
        d.line([(x0, y1 + 3), (x1, y1 + 3)], fill=(200, 148, 66), width=1)


def quoins(d, x, y0, y1, w=14, left=True):
    """Cream rusticated quoin strip / pilaster at x."""
    d.rectangle([x, y0, x + w, y1], fill=CREAM)
    for y in range(y0, y1, 12):
        d.line([(x, y), (x + w, y)], fill=CREAM_D, width=1)
    d.line([(x + (w if left else 0), y0), (x + (w if left else 0), y1)], fill=CREAM_D, width=1)


def strip_a(img, d, e):
    y0, y1 = LAYOUT['A']
    my = lambda m: int(y1 - m * PX)  # metres above ground -> px row
    noise_fill(img, (0, y0, W, y1), OCHRE, 9)
    d = ImageDraw.Draw(img)
    brick_courses(d, (0, y0, W, y1), (204, 150, 68), 3)
    for b in range(6):
        x0, x1 = b * BAY, (b + 1) * BAY
        cx = (x0 + x1) / 2
        # plinth (bluestone)
        d.rectangle([x0, my(0.9), x1, y1], fill=STONE)
        d.line([(x0, my(0.9)), (x1, my(0.9))], fill=(150, 146, 138), width=2)
        # pilasters at the bay edges
        quoins(d, x0, my(17.6), my(0.9), 16)
        quoins(d, x1 - 16, my(17.6), my(0.9), 16, left=False)
        # ground floor: the arcade arch (shopfront)
        aw = 3.9 * PX
        arch_window(d, e, cx, my(6.2), my(0.9), aw, glass=(46, 40, 34), lit=(255, 200, 120) if rnd.random() < 0.8 else (150, 110, 70), bars=1)
        # shop sign band inside the arch
        d.rectangle([cx - aw / 2 + 6, my(3.6), cx + aw / 2 - 6, my(3.1)], fill=(30, 52, 40))
        e.rectangle([cx - aw / 2 + 6, my(3.6), cx + aw / 2 - 6, my(3.1)], fill=(60, 50, 30))
        # stringcourse
        band(d, my(7.3), my(6.8), x0, x1)
        # first floor: paired arched windows
        for k in (-1, 1):
            arch_window(d, e, cx + k * 1.35 * PX, my(11.8), my(7.9), 1.45 * PX, lit=lit_colour(), bars=2)
        band(d, my(12.95), my(12.55), x0, x1)
        # second floor: paired, a little shorter
        for k in (-1, 1):
            arch_window(d, e, cx + k * 1.35 * PX, my(16.9), my(13.6), 1.3 * PX, lit=lit_colour(), bars=1)
        # cornice: cream with dentils and a shadow under it
        d.rectangle([x0, my(18.7), x1, my(17.6)], fill=CREAM)
        d.rectangle([x0, my(17.75), x1, my(17.6)], fill=(150, 112, 60))
        for x in range(x0, x1, 8):
            d.rectangle([x, my(18.0), x + 4, my(17.75)], fill=CREAM_D)
        # parapet with a balustrade
        d.rectangle([x0, my(21), x1, my(18.7)], fill=OCHRE)
        d.rectangle([x0, my(21), x1, my(20.6)], fill=CREAM)
        d.rectangle([x0 + 22, my(20.4), x1 - 22, my(19.0)], fill=(120, 96, 64))
        for x in range(x0 + 26, x1 - 26, 11):
            d.ellipse([x, my(20.4), x + 7, my(19.0)], fill=CREAM)
        d.rectangle([x0, my(21), x0 + 20, my(18.7)], fill=CREAM)
        d.rectangle([x1 - 20, my(21), x1, my(18.7)], fill=CREAM)
    # corner portal: u 0.75..1 (x 1536..2048, 15.06 m wide): a great arch over the entrance, clocks under it
    x0, x1 = 1536, 2048
    cx = (x0 + x1) / 2
    d.rectangle([x0, y0, x1, y1], fill=OCHRE)
    d.rectangle([x0, my(0.9), x1, y1], fill=STONE)
    quoins(d, x0, my(17.6), my(0.9), 22)
    quoins(d, x1 - 22, my(17.6), my(0.9), 22, left=False)
    # the arch: 9.4 m wide, crown 16.8 m
    aw, crown = 9.4 * PX, my(16.8)
    r = aw / 2
    sw = 26
    d.rectangle([cx - r - sw, crown + r, cx + r + sw, my(0.9)], fill=CREAM)
    d.pieslice([cx - r - sw, crown - sw, cx + r + sw, crown + 2 * r + sw], 180, 360, fill=CREAM)
    # voussoirs
    for k in range(0, 19):
        a = math.pi + math.pi * k / 18
        d.line([(cx + (r) * math.cos(a), crown + r + r * math.sin(a)), (cx + (r + sw) * math.cos(a), crown + r + (r + sw) * math.sin(a))], fill=CREAM_D, width=2)
    d.rectangle([cx - r, crown + r, cx + r, my(0.9)], fill=(60, 50, 40))
    d.pieslice([cx - r, crown, cx + r, crown + 2 * r], 180, 360, fill=(60, 50, 40))
    # fanlight glazing (radial bars) in the arch's upper part
    fr = r - 10
    d.pieslice([cx - fr, crown + 10, cx + fr, crown + 10 + 2 * fr], 180, 360, fill=GLASS)
    e.pieslice([cx - fr, crown + 10, cx + fr, crown + 10 + 2 * fr], 180, 360, fill=(200, 150, 90))
    d.rectangle([cx - fr, crown + 10 + fr, cx + fr, my(7.6)], fill=GLASS)
    e.rectangle([cx - fr, crown + 10 + fr, cx + fr, my(7.6)], fill=(200, 150, 90))
    for k in range(1, 8):
        a = math.pi + math.pi * k / 8
        d.line([(cx, crown + 10 + fr), (cx + fr * math.cos(a), crown + 10 + fr + fr * math.sin(a))], fill=FRAME, width=3)
        e.line([(cx, crown + 10 + fr), (cx + fr * math.cos(a), crown + 10 + fr + fr * math.sin(a))], fill=(0, 0, 0), width=3)
    for k in range(1, 6):
        x = cx - fr + 2 * fr * k / 6
        d.line([(x, crown + 10 + fr), (x, my(7.6))], fill=FRAME, width=3)
        e.line([(x, crown + 10 + fr), (x, my(7.6))], fill=(0, 0, 0), width=3)
    d.line([(cx - fr, crown + 10 + fr), (cx + fr, crown + 10 + fr)], fill=FRAME, width=4)
    # the row of clocks on a dark board, 6.2 .. 7.6 m
    d.rectangle([cx - fr, my(7.6), cx + fr, my(5.9)], fill=(28, 24, 20))
    for k in range(7):
        ccx = cx - fr + (k + 0.5) * 2 * fr / 7
        clock(d, e, ccx, my(6.75), 0.55 * PX)
    # doors below
    d.rectangle([cx - fr, my(5.9), cx + fr, my(0.9)], fill=(48, 38, 30))
    e.rectangle([cx - fr + 6, my(5.0), cx + fr - 6, my(0.9)], fill=(255, 200, 120))
    for k in range(1, 5):
        x = cx - fr + 2 * fr * k / 5
        d.rectangle([x - 4, my(5.9), x + 4, my(0.9)], fill=CREAM_D)
        e.rectangle([x - 4, my(5.9), x + 4, my(0.9)], fill=(0, 0, 0))
    # side windows beside the arch
    for k in (-1, 1):
        sx = cx + k * (r + sw + 1.4 * PX)
        arch_window(d, e, sx, my(11.8), my(7.9), 1.3 * PX, lit=lit_colour(), bars=2)
        arch_window(d, e, sx, my(5.0), my(1.6), 1.3 * PX, lit=lit_colour(), bars=1)
    d.rectangle([x0, my(18.7), x1, my(17.6)], fill=CREAM)
    d.rectangle([x0, my(17.75), x1, my(17.6)], fill=(150, 112, 60))
    d.rectangle([x0, my(21), x1, my(18.7)], fill=OCHRE)
    d.rectangle([x0, my(21), x1, my(20.6)], fill=CREAM)
    # words over the arch
    d.rectangle([cx - 3.6 * PX, my(18.55), cx + 3.6 * PX, my(17.8)], fill=CREAM_D)
    for k in range(18):
        d.rectangle([cx - 3.3 * PX + k * 0.37 * PX, my(18.4), cx - 3.3 * PX + k * 0.37 * PX + 6, my(17.95)], fill=(70, 50, 30))


def clock(d, e, cx, cy, r, hands=None):
    d.ellipse([cx - r - 3, cy - r - 3, cx + r + 3, cy + r + 3], fill=(170, 150, 110))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(246, 240, 222))
    e.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 238, 190))
    for k in range(12):
        a = k * math.pi / 6
        d.line([(cx + r * 0.78 * math.cos(a), cy + r * 0.78 * math.sin(a)), (cx + r * 0.92 * math.cos(a), cy + r * 0.92 * math.sin(a))], fill=(30, 30, 30), width=max(1, int(r / 10)))
    h = hands if hands is not None else rnd.random() * 2 * math.pi
    for a, l, wdt in ((h, 0.5, max(2, int(r / 7))), (h * 12 % (2 * math.pi), 0.75, max(1, int(r / 10)))):
        d.line([(cx, cy), (cx + r * l * math.sin(a), cy - r * l * math.cos(a))], fill=(20, 20, 20), width=wdt)
        e.line([(cx, cy), (cx + r * l * math.sin(a), cy - r * l * math.cos(a))], fill=(0, 0, 0), width=wdt)


def strip_b(img, d, e):
    y0, y1 = LAYOUT['B']
    my = lambda m: int(y1 - m * PX)
    noise_fill(img, (0, y0, W, y1), RED, 12, 2)
    d = ImageDraw.Draw(img)
    for y in range(y0, y1, 3):
        d.line([(0, y), (W, y)], fill=RED_D, width=1)
    for b in range(8):
        x0, x1 = b * BAY, (b + 1) * BAY
        cx = (x0 + x1) / 2
        quoins(d, x0, y0, y1, 14)
        quoins(d, x1 - 14, y0, y1, 14, left=False)
        for m in (0.0, 4.4, 8.6):
            band(d, my(m + 0.4), my(m), x0, x1)
        if b % 2 == 0:
            arch_window(d, e, cx, my(3.9), my(1.0), 1.3 * PX, lit=lit_colour(), bars=1)
            arch_window(d, e, cx, my(8.1), my(5.2), 1.3 * PX, lit=lit_colour(), bars=1)
        else:
            # blind roundel
            d.ellipse([cx - 22, my(6.9) - 22, cx + 22, my(6.9) + 22], fill=CREAM)
            d.ellipse([cx - 14, my(6.9) - 14, cx + 14, my(6.9) + 14], fill=RED_D)


def strip_c(img, d, e):
    y0, y1 = LAYOUT['C']
    my = lambda m: int(y1 - m * PX)
    noise_fill(img, (0, y0, W, y1), OCHRE, 9)
    d = ImageDraw.Draw(img)
    brick_courses(d, (0, y0, W, y1), (204, 150, 68), 3)
    for b in range(8):
        x0, x1 = b * BAY, (b + 1) * BAY
        cx = (x0 + x1) / 2
        quoins(d, x0, y0, y1, 10)
        band(d, my(4.6), my(4.3), x0, x1)
        band(d, my(8.9), my(8.6), x0, x1)
        for k in (-1, 1):
            arch_window(d, e, cx + k * 1.6 * PX, my(3.6), my(1.2), 1.1 * PX, lit=lit_colour(), bars=1, keystone=False)
            arch_window(d, e, cx + k * 1.6 * PX, my(8.0), my(5.4), 1.1 * PX, lit=lit_colour(), bars=1, keystone=False)


def strip_d(img, d):
    y0, y1 = LAYOUT['D']
    noise_fill(img, (0, y0, W, y1), (98, 160, 136), 16, 4)
    d = ImageDraw.Draw(img)
    # streaks and ribs
    for x in range(0, W, 3):
        if rnd.random() < 0.25:
            c = rnd.choice([(80, 136, 116), (120, 178, 152), (70, 112, 96)])
            d.line([(x, y0), (x, y1)], fill=c, width=1)
    for x in range(0, W, 64):
        d.rectangle([x, y0, x + 5, y1], fill=(130, 186, 162))
        d.line([(x + 6, y0), (x + 6, y1)], fill=(60, 104, 88), width=2)


def strip_e(img, d):
    y0, y1 = LAYOUT['E']
    noise_fill(img, (0, y0, W, y1), (74, 78, 82), 8, 3)
    d = ImageDraw.Draw(img)
    for x in range(0, W, 12):
        d.line([(x, y0), (x, y1)], fill=(58, 60, 64), width=2)


def strip_f(img, d, e):
    y0, y1 = LAYOUT['F']
    d.rectangle([0, y0, W, y1], fill=(28, 24, 20))
    # the single tower clock face: x 0..300, centred
    clock(d, e, 150, (y0 + y1) / 2, 140, hands=1.1)
    # swatches
    for name, col in (('cream', CREAM), ('ochre', OCHRE), ('red', RED), ('dark', DARK), ('glass', GLASS), ('stone', STONE)):
        sx0, sx1 = SWATCH[name]
        noise_fill(img, (sx0, 1880, sx1, 2040), col, 6)
    d = ImageDraw.Draw(img)
    # lit glass swatch on the emissive sheet
    sx0, sx1 = SWATCH['glass']
    e.rectangle([sx0, 1880, sx1, 2040], fill=(255, 205, 130))


def main(out):
    img = Image.new('RGB', (W, H), OCHRE)
    emi = Image.new('RGB', (W, H), (0, 0, 0))
    e = ImageDraw.Draw(emi)
    strip_a(img, ImageDraw.Draw(img), e)
    strip_b(img, ImageDraw.Draw(img), e)
    strip_c(img, ImageDraw.Draw(img), e)
    strip_d(img, ImageDraw.Draw(img))
    strip_e(img, ImageDraw.Draw(img))
    strip_f(img, ImageDraw.Draw(img), e)
    img.save(out + '/fss_color.png')
    emi.save(out + '/fss_emit.png')
    print('painted', out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
