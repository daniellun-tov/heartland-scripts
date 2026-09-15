# refade.py - relax the edge fade on the site-plan background.
#
# bg4.py (v5) faded the outer 11% of each axis to sand-50 with a smoothstep,
# which eats real detail in the corners (lawns, tree canopies, the buildings
# that sit close to the edge). The fade is a known, invertible blend, so this
# recovers the unfaded raster and re-applies a narrow one.
#
#   v5/v6:  out = im*a + sand*(1-a),  a = smoothstep(min(dx,dy)), band 11%
#   here:   im  = (out - sand*(1-a)) / a   for a > A_MIN, then a 3.5% band
#
# The very outer ~1% carries no recoverable signal (a -> 0); it stays sand,
# which is what the map viewport is anyway, so the plan still has no border.
import numpy as np
from PIL import Image

SRC, DST = 'bg6.png', 'bg7.png'   # bg6.png = unlabel.py's output (v5 with the baked labels removed)
OLD_BAND, NEW_BAND = 0.11, 0.035
A_MIN = 0.10

im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float64)
h, w = im.shape[:2]
sand = np.array([242, 239, 230], np.float64)

def alpha(band):
    y = np.arange(h)[:, None]; x = np.arange(w)[None, :]
    dx = np.minimum(x, w - 1 - x) / (band * w)
    dy = np.minimum(y, h - 1 - y) / (band * h)
    d = np.minimum(np.minimum(dx, dy), 1.0)
    return (d * d * (3 - 2 * d))[..., None]

a_old = alpha(OLD_BAND)
safe = np.maximum(a_old, A_MIN)
un = (im - sand * (1 - a_old)) / safe          # recovered raster
un = np.where(a_old >= A_MIN, un, sand)         # outermost sliver: no signal
un = np.clip(un, 0, 255)
# dividing by a small alpha amplifies the webp noise; that zone is flat paper,
# so smooth it in proportion to how much it was amplified
import cv2
blur = cv2.GaussianBlur(un, (0, 0), 2.2)
k = np.clip((0.40 - a_old) / 0.30, 0, 1)
un = un * (1 - k) + blur * k

a_new = alpha(NEW_BAND)
out = un * a_new + sand * (1 - a_new)
u8 = np.clip(out + 0.5, 0, 255).astype(np.uint8)
Image.fromarray(u8).save(DST)
Image.fromarray(u8).save('oh-site-plan-bg-v7.webp', quality=82, method=6)
Image.fromarray(u8).resize((1014, 894), Image.LANCZOS).save('bg7_preview.png')
print(u8.shape, 'a_old min/max', round(float(a_old.min()),3), round(float(a_old.max()),3))
