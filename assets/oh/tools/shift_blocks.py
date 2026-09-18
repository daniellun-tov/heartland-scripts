#!/usr/bin/env python3
"""shift_blocks.py - move each block (plots, hull, labels, and its painted
building in the background) onto the SDP's building footprint.

Measured against the council SDP rendered into the background's own frame
(the v8 raster sits (+13.5, +22.5) plan units from a fresh 160 dpi render of
the C-1000 PDF cropped at -x 1180 -y 150 - measure that offset first or every
block looks off by it), the plots already sit on the SDP's buildings to within
1-3 plan units for nine blocks; B, D and H were 5-8 units off (about a metre).
There is no global scale or shift to correct. block_shifts.json holds the
per-block residuals to apply (zero for the blocks that are right). For each
block with a shift:

  * svg: every unit polygon on floors 1-4, the block hull and the unit labels
    of a block move by its shift; parking bays and feature labels stay (they
    are in the road frame already)
  * background: the painted building (hull + wall band) is cut out, the hole
    filled from the surrounding ground, and the cut-out pasted at the new
    position - so the building keeps its look and lands where the SDP has it

  python3 shift_blocks.py in.svg out.svg bg_in.webp bg_out.webp block_shifts.json
"""
import re, sys, json, numpy as np, cv2
from PIL import Image, ImageDraw
from shapely.geometry import Polygon

src, dst, bgi, bgo, shp = sys.argv[1:6]
shifts = {k: tuple(v) for k, v in json.load(open(shp)).items()}
LET = 'abcdefghijkl'
svg = open(src).read()

def blk_of_unit(uid): return 'block-' + LET[int(uid.split('-')[1]) - 1]
def move_pts(pts, dx, dy):
    return ' '.join(f'{float(x) + dx:.2f},{float(y) + dy:.2f}'.replace('.00', '') for x, y in (p.split(',') for p in pts.split()))

def sub_unit(m):
    dx, dy = shifts[blk_of_unit(m.group(1))]
    return f'<polygon id="{m.group(1)}" points="{move_pts(m.group(2), dx, dy)}"'
out = re.sub(r'<polygon id="(unit-[^"]+)" points="([^"]+)"', sub_unit, svg)
def sub_block(m):
    dx, dy = shifts[m.group(1)]
    return f'<polygon id="{m.group(1)}" points="{move_pts(m.group(2), dx, dy)}"'
out = re.sub(r'<polygon id="(block-[a-l])" points="([^"]+)"', sub_block, out)
def sub_label(m):
    dx, dy = shifts[blk_of_unit(m.group(1))]
    return f'{m.group(0).split(" x=")[0]} x="{float(m.group(2)) + dx:.1f}" y="{float(m.group(3)) + dy:.1f}"'
out = re.sub(r'<text class="site-plan_unit-label" data-for="(unit-[^"]+)" x="([^"]+)" y="([^"]+)"', sub_label, out)
open(dst, 'w').write(out)

# ---- background ----
hulls = {m.group(1): Polygon([tuple(map(float, p.split(','))) for p in m.group(2).split()])
         for m in re.finditer(r'<polygon id="(block-[a-l])" points="([^"]+)"', svg)}
bg = np.array(Image.open(bgi).convert('RGB'))
H, W = bg.shape[:2]; S = W / 1690.0
BAND = 4.0   # plan units around the hull that belong to the painted building (its wall band)
def mask(P, pad):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon([(x * S, y * S) for x, y in P.buffer(pad, join_style=2).exterior.coords], fill=255)
    return np.array(m) > 0
# The ground uncovered when a building moves (a strip along its south-east
# side) is filled by copying the ground from just beyond the building's old
# edge, perpendicular to that edge: a parking row runs parallel to the
# building, so its dividers continue straight across the strip, a road stays
# the same road and a lawn stays lawn. (Inpainting smears the row into brown.)
from scipy import ndimage
old_all = np.zeros((H, W), bool); new_all = np.zeros((H, W), bool)
cut = {}
for k, P in hulls.items():
    dx, dy = shifts[k]
    if dx == 0 and dy == 0: continue
    mo = mask(P, BAND); mn = mask(Polygon([(x + dx, y + dy) for x, y in P.exterior.coords]), BAND)
    cut[k] = (mo, dx, dy); old_all |= mo; new_all |= mn
vac = old_all & ~new_all
# outward direction: away from the nearest new-building pixel, snapped to the
# block's own axes so a whole side copies in one constant direction (bay
# dividers then continue straight instead of scrambling)
import math
def axes(P):
    c = list(P.exterior.coords); w = []; a = []
    for (x0, y0), (x1, y1) in zip(c, c[1:]):
        w.append(math.hypot(x1 - x0, y1 - y0)); a.append(math.atan2(y1 - y0, x1 - x0) * 4)
    w, a = np.array(w), np.array(a); th = math.atan2((w * np.sin(a)).sum(), (w * np.cos(a)).sum()) / 4
    return [(math.cos(th), math.sin(th)), (-math.sin(th), math.cos(th)), (-math.cos(th), -math.sin(th)), (math.sin(th), -math.cos(th))]
_, idx = ndimage.distance_transform_edt(~new_all, return_indices=True)
ys, xs = np.nonzero(vac)
qy, qx = idx[0][ys, xs], idx[1][ys, xs]
vx, vy = (xs - qx).astype(float), (ys - qy).astype(float)
# which block's strip is this pixel in
owner = np.zeros((H, W), np.int16) - 1
for i, (k, (mo, dx, dy)) in enumerate(cut.items()): owner[mo & vac] = i
ux, uy = np.zeros(len(xs)), np.zeros(len(xs))
for i, k in enumerate(cut):
    sel = owner[ys, xs] == i
    if not sel.any(): continue
    cands = np.array(axes(hulls[k]))
    dots = np.stack([vx[sel] * cx + vy[sel] * cy for cx, cy in cands], 1)
    best = cands[np.argmax(dots, 1)]
    ux[sel], uy[sel] = best[:, 0], best[:, 1]
# march outward until clear of every old building, then 26 px further (clear of the wall band and the setback line beside it)
sx, sy = xs.astype(float), ys.astype(float); done = np.zeros(len(xs), bool)
for step in range(120):
    ix = np.clip(np.round(sx).astype(int), 0, W - 1); iy = np.clip(np.round(sy).astype(int), 0, H - 1)
    inside = old_all[iy, ix] & ~done
    done |= ~inside
    sx[inside] += ux[inside]; sy[inside] += uy[inside]
sx += ux * 26; sy += uy * 26
ix = np.clip(np.round(sx).astype(int), 0, W - 1); iy = np.clip(np.round(sy).astype(int), 0, H - 1)
outbg = bg.copy()
outbg[ys, xs] = bg[iy, ix]
# soften the seam between copied ground and the ground it meets
blur = cv2.GaussianBlur(outbg, (0, 0), 1.2)
edge = ndimage.binary_dilation(vac, iterations=2) & ~ndimage.binary_erosion(vac, iterations=2)
outbg[edge] = blur[edge]
# paste the buildings at their new places, from the untouched original
for k, (mo, dx, dy) in cut.items():
    ys, xs = np.nonzero(mo)
    nx = np.round(xs + dx * S).astype(int); ny = np.round(ys + dy * S).astype(int)
    ok = (nx >= 0) & (nx < W) & (ny >= 0) & (ny < H)
    outbg[ny[ok], nx[ok]] = bg[ys[ok], xs[ok]]
Image.fromarray(outbg).save(bgo, quality=92, method=6)
print('svg written', dst, '| background written', bgo, outbg.shape)
