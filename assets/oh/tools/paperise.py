# paperise.py - make the plan's paper read as the page's sand-50, not white.
#
# The raster's background is the SDP's paper (#f6f4ee) with near-white patches
# where the brochure wash and the edge fade sit, so it showed as a pale panel
# against the sand-50 (#f2efe6) map viewport. This maps paper exactly onto
# sand-50 with a per-channel scale (hue-safe, ~2-3% on everything darker) and
# clamps the top so nothing in the image is brighter than the page behind it.
#
#   python3 paperise.py            # bg7.png (refade output) -> bg8.png
import numpy as np
from PIL import Image

SRC, DST = 'bg7.png', 'bg8.png'
paper = np.array([246, 244, 238], np.float64)
sand = np.array([242, 239, 230], np.float64)

im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float64)
out = np.minimum(im * (sand / paper), sand)
u8 = np.clip(out + 0.5, 0, 255).astype(np.uint8)
Image.fromarray(u8).save(DST)
Image.fromarray(u8).save('oh-site-plan-bg-v8.webp', quality=82, method=6)
print('paper ->', (paper * (sand / paper)).round(1), 'white ->', np.minimum(255 * (sand / paper), sand).round(1))
