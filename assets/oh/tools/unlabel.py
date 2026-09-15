# unlabel.py - strip the baked-in labels from the site-plan background.
#
# The background raster carries the SDP's own text (street names, Gatehouse,
# Utilities & Refuse, BUILDING LINE annotations, the utility plaques) and the
# brochure's (WELGEVONDEN BOULEVARD, ATTENUATION POND, servitude notes). Every
# label we want on the plan is an SVG <text> in oh-site-plan.svg's
# [data-layer="features"] group, so the baked copies are duplicates we cannot
# style: this removes them and inpaints what was underneath.
#
# Two detectors, both conservative:
#   A  a dark label on a near-white halo box -> fill its min-area rect
#   B  thin-stroke glyph clusters within 230px of a curated seed (the labels
#      with no halo box: white-on-grey brochure text, the faded notes)
# Block footprints from the plan SVG are excluded: the only things that look
# like glyphs inside them are the courtyard slivers between unit polygons.
#
#   python3 unlabel.py            # oh-site-plan-bg.webp (v5) -> bg6.png + webp
import cv2, numpy as np, re
from PIL import Image

rgb = np.array(Image.open('../oh-site-plan-bg-v5.webp').convert('RGB'))
img = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR); H, W = img.shape[:2]
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
sat = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[..., 1]
K = lambda n: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (n, n))
S = 2.0

# ---- block footprints (courtyard slivers live inside them; no label does) ----
svg = open('../oh-site-plan.svg').read()
blocks = np.zeros((H, W), np.uint8)
for m in re.finditer(r'<(?:polygon|path)[^>]*id="block-[a-l]"[^>]*>', svg):
    tag = m.group(0)
    pts = re.search(r'points="([^"]+)"', tag)
    if pts:
        p = np.array([[float(v) for v in pair.split(',')] for pair in pts.group(1).split()]) * S
    else:
        d = re.search(r'\sd="([^"]+)"', tag)
        if not d: continue
        p = np.array([float(x) for x in re.findall(r'-?\d+\.?\d*', d.group(1))]).reshape(-1, 2) * S
    cv2.fillPoly(blocks, [np.round(p).astype(np.int32)], 1)
blocks = cv2.dilate(blocks, K(9))

# ---- A: dark label on a near-white halo box -> fill its min-area rect ----
white = ((rgb.min(2) > 236) & (sat < 34)).astype(np.uint8)
ink = gray < 180
boxm = cv2.morphologyEx(white, cv2.MORPH_CLOSE, K(15))
n, lab, stats, _ = cv2.connectedComponentsWithStats(boxm, 8)
maskA = np.zeros((H, W), np.uint8); nA = 0
for i in range(1, n):
    x, y, w, h, a = stats[i]
    if a < 2200 or a > 60000: continue
    if min(w, h) < 22 or w > 700 or h > 700: continue
    sub = (lab[y:y+h, x:x+w] == i).astype(np.uint8)
    inksub = int((ink[y:y+h, x:x+w] & (sub > 0)).sum())
    if inksub < 300 or inksub / float(a) > 0.55: continue
    cnt = cv2.findContours(sub, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]
    cnt = max(cnt, key=cv2.contourArea) + np.array([[[x, y]]])
    rect = cv2.minAreaRect(cnt)
    (rc, rs, ra) = rect
    rect = (rc, (rs[0] + 10, rs[1] + 10), ra)          # a little margin
    cv2.fillPoly(maskA, [np.int32(cv2.boxPoints(rect))], 1)
    nA += 1
print('A labels', nA)

# ---- glyph mask (thin dark or thin bright strokes) ----
bh = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, K(41))
th = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, K(41))
def build_glyphs(tb, tt):
  g = np.zeros((H, W), np.uint8)
  for m0 in (((bh > tb) & (sat < 70)), ((th > tt) & (sat < 70))):
    m1 = cv2.morphologyEx(m0.astype(np.uint8), cv2.MORPH_CLOSE, K(3))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m1, 8)
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if a < 20 or a > 4000 or w > 110 or h > 110: continue
        sub = (lab[y:y+h, x:x+w] == i).astype(np.uint8)
        dt = cv2.distanceTransform(cv2.copyMakeBorder(sub, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0), cv2.DIST_L2, 3)
        if dt.max() > 7.5: continue
        g[y:y+h, x:x+w] |= sub
  g[blocks > 0] = 0
  return g
glyph = build_glyphs(14, 12)

# ---- B: curated seeds - every glyph component within R of a seed ----
SEEDS = [(446, 2624), (550, 2701),        # ATTENUATION POND
         (2473, 950),                     # ELEC KIOSK
         (2812, 410),                     # top-edge annotation
         (3208, 977), (3145, 1503),       # faded brochure notes
         (1056, 707), (1255, 480), (1420, 400),   # WELGEVONDEN BOULEVARD
         (1255, 908),                     # MINI SUB plaque
         (2348, 70), (3150, 1000), (3210, 1040)]   # faint servitude / brochure notes
R = 230
seedmap = np.zeros((H, W), np.uint8)
for x, y in SEEDS: cv2.circle(seedmap, (x, y), R, 1, -1)
# near a seed the text is often very faint: look with a lower threshold there
glyph = ((glyph | (build_glyphs(7, 6) & seedmap)) > 0).astype(np.uint8)
n, lab, stats, cent = cv2.connectedComponentsWithStats(cv2.dilate(glyph, cv2.getStructuringElement(cv2.MORPH_RECT, (25, 15))), 8)
maskB = np.zeros((H, W), np.uint8); nB = 0
for i in range(1, n):
    x, y, w, h, a = stats[i]
    sub = lab[y:y+h, x:x+w] == i
    gpx = glyph[y:y+h, x:x+w] & sub.astype(np.uint8)
    if int(gpx.sum()) < 120: continue
    if not (seedmap[y:y+h, x:x+w][sub] > 0).any(): continue
    maskB[y:y+h, x:x+w] |= gpx
    nB += 1
print('B clusters', nB)
maskB = cv2.dilate(maskB, K(11))

# the boulevard band text also gets an explicit rotated strip (white on grey)
band = np.zeros((H, W), np.uint8)
p0, p1 = np.array([915, 760]), np.array([1610, 350])
d = (p1 - p0) / np.linalg.norm(p1 - p0); nvec = np.array([-d[1], d[0]]) * 42
poly = np.array([p0 + nvec, p1 + nvec, p1 - nvec, p0 - nvec])
cv2.fillPoly(band, [np.int32(poly)], 1)
bandtext = ((gray > cv2.medianBlur(gray, 61).astype(int) + 8) & (band > 0)).astype(np.uint8)
bandtext = cv2.dilate(bandtext, K(7))

mask = ((maskA | maskB | bandtext) > 0).astype(np.uint8)
print('mask px', int(mask.sum()))
out = cv2.inpaint(img, mask, 6, cv2.INPAINT_TELEA)
# a touch of blur only inside the patched area, so inpaint streaks do not read as detail
soft = cv2.GaussianBlur(out, (0, 0), 1.6)
m3 = cv2.dilate(mask, K(3))[..., None] > 0
out = np.where(m3, soft, out)
cv2.imwrite('bg6.png', out)
Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB)).resize((1014, 894), Image.LANCZOS).save('bg6_preview.png')
np.save('mask2.npy', mask)
vis = img.copy(); vis[mask > 0] = (0, 0, 255)
Image.fromarray(cv2.cvtColor(vis, cv2.COLOR_BGR2RGB)).resize((1014, 894)).save('vis5.png')
