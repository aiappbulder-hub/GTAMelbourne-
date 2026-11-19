# Draws the PWA icons (assets/icons/*.png): bold "GTA" over "MELB", dark background, yellow accent. A fan homage.
# Run: python3 melbourne3d/tools/pwa/make-icons.py   (needs Pillow)
import os
from PIL import Image, ImageDraw, ImageFont
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'icons')
FONTS = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']
font_path = next(f for f in FONTS if os.path.exists(f))
def make(size, safe):  # safe: fraction of the canvas the artwork may use (maskable keeps it inside the centre 80%)
    im = Image.new('RGB', (size, size), (14, 16, 24))
    d = ImageDraw.Draw(im)
    d.rectangle([0, int(size * .86), size, size], fill=(245, 197, 24))
    d.polygon([(0, int(size * .70)), (size, int(size * .55)), (size, int(size * .6)), (0, int(size * .75))], fill=(245, 197, 24))
    def fit(text, w, h):
        px = 10
        while True:
            f = ImageFont.truetype(font_path, px + 4); b = d.textbbox((0, 0), text, font=f)
            if b[2] - b[0] > w or b[3] - b[1] > h: return ImageFont.truetype(font_path, px)
            px += 4
    box = size * safe
    cx = size / 2
    f1 = fit('GTA', box, box * .42); f2 = fit('MELB', box * .8, box * .22)
    for text, f, cy, col in (('GTA', f1, size * .36, (255, 255, 255)), ('MELB', f2, size * .66, (245, 197, 24))):
        b = d.textbbox((0, 0), text, font=f)
        d.text((cx - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2), text, font=f, fill=col)
    return im
os.makedirs(OUT, exist_ok=True)
make(192, .74).save(os.path.join(OUT, 'icon-192.png'))
make(512, .74).save(os.path.join(OUT, 'icon-512.png'))
make(512, .56).save(os.path.join(OUT, 'icon-maskable-512.png'))
make(180, .74).save(os.path.join(OUT, 'apple-touch-icon.png'))
