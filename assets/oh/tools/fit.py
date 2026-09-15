import json, math
import numpy as np, cv2
from PIL import Image

P = '/tmp/claude-0/-home-claude/35b4216c-9add-5c92-8377-b6843a9019d0/scratchpad/plans/'
img = np.array(Image.open(P + 'ground-1.png').convert('RGB'))
H, W = img.shape[:2]
R, G, B = [img[..., i].astype(int) for i in range(3)]

# unit fills: dark blue, light blue, pink, red
dark = (B > 90) & (R < 60) & (G > 70) & (G < 150)
light = (R < G - 12) & (R < B - 12) & (G > 190) & (R > 150)
pink = (R > 220) & (G > 150) & (G < 215) & (B > 160) & (B < 225) & (R - G > 25)
red = (R > 150) & (G < 90) & (B < 90)
mask = (dark | light | pink | red).astype(np.uint8)
print('mask px', int(mask.sum()))
k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)          # drop thin text/lines
dil = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61)))
n, lab, stats, cent = cv2.connectedComponentsWithStats(dil)
sc = 3380 / 1400
labels = {1: (780, 297), 2: (1020, 127), 3: (1163, 318), 4: (1263, 493), 5: (1005, 578), 6: (823, 668), 7: (648, 768), 8: (480, 877), 9: (258, 948), 10: (130, 773), 11: (311, 626), 12: (475, 502)}
labels = {b: (x * sc, y * sc) for b, (x, y) in labels.items()}
comps = [(i, stats[i, cv2.CC_STAT_AREA], cent[i]) for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] > 40000]
print('components', [(i, int(a), tuple(int(v) for v in c)) for i, a, c in comps])
block_comp = {}
for b, (lx, ly) in labels.items():
    best = min(comps, key=lambda c: (c[2][0] - lx) ** 2 + (c[2][1] - ly) ** 2)
    block_comp[b] = best[0]
print('block->comp', block_comp)

units = json.load(open(P + 'unit_paths.json'))
SETS = {'A': ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], 'B1': ['B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'B17'], 'B2': ['B21', 'B22', 'B23', 'B24', 'B25', 'B26', 'B27']}
BLOCK_SET = {1: 'A', 2: 'B1', 3: 'B2', 4: 'B2', 5: 'A', 6: 'A', 7: 'A', 8: 'A', 9: 'A', 10: 'A', 11: 'A', 12: 'B1'}

def fp_polys(setname):
    return [np.array(units[u], dtype=np.float64) for u in SETS[setname]]

def transform(polys, s, ang, mirror, cx, cy, fcx, fcy):
    a = math.radians(ang); ca, sa = math.cos(a), math.sin(a)
    out = []
    for p in polys:
        q = p.copy()
        q[:, 0] -= fcx; q[:, 1] -= fcy
        if mirror: q[:, 0] = -q[:, 0]
        x = q[:, 0] * ca - q[:, 1] * sa; y = q[:, 0] * sa + q[:, 1] * ca
        out.append(np.stack([x * s + cx, y * s + cy], 1))
    return out

def iou(polys, target, x0, y0):
    canvas = np.zeros_like(target)
    for p in polys:
        cv2.fillPoly(canvas, [np.round(p - [x0, y0]).astype(np.int32)], 1)
    inter = np.logical_and(canvas, target).sum(); uni = np.logical_or(canvas, target).sum()
    return inter / uni if uni else 0

results = {}
for b, ci in block_comp.items():
    x, y, w, h = stats[ci, cv2.CC_STAT_LEFT], stats[ci, cv2.CC_STAT_TOP], stats[ci, cv2.CC_STAT_WIDTH], stats[ci, cv2.CC_STAT_HEIGHT]
    pad = 60; x0, y0 = max(0, x - pad), max(0, y - pad); x1, y1 = min(W, x + w + pad), min(H, y + h + pad)
    target = (mask[y0:y1, x0:x1] * (lab[y0:y1, x0:x1] == ci)).astype(np.uint8)
    ys, xs = np.nonzero(target); cx, cy = xs.mean() + x0, ys.mean() + y0
    area_r = target.sum()
    polys = fp_polys(BLOCK_SET[b])
    allpts = np.concatenate(polys); fcx, fcy = allpts[:, 0].mean(), allpts[:, 1].mean()
    fmask = np.zeros((1100, 1110), np.uint8)
    for p in polys: cv2.fillPoly(fmask, [np.round(p).astype(np.int32)], 1)
    area_f = fmask.sum(); s0 = math.sqrt(area_r / area_f)
    # centroid of filled area (not vertices) for better centering
    fy, fx = np.nonzero(fmask); fcx, fcy = fx.mean(), fy.mean()
    best = (0, None)
    for mirror in (False, True):
        for ang in range(0, 360, 3):
            v = iou(transform(polys, s0, ang, mirror, cx, cy, fcx, fcy), target, x0, y0)
            if v > best[0]: best = (v, (s0, ang, mirror, cx, cy))
    # refine
    v0, (s, ang, mirror, cx, cy) = best
    for it in range(3):
        step_a, step_s, step_p = 1.5 / (it + 1), 0.02 / (it + 1), 8 / (it + 1)
        improved = True
        while improved:
            improved = False
            for da, ds, dx, dy in [(step_a, 0, 0, 0), (-step_a, 0, 0, 0), (0, step_s, 0, 0), (0, -step_s, 0, 0), (0, 0, step_p, 0), (0, 0, -step_p, 0), (0, 0, 0, step_p), (0, 0, 0, -step_p)]:
                v = iou(transform(polys, s * (1 + ds), ang + da, mirror, cx + dx, cy + dy, fcx, fcy), target, x0, y0)
                if v > v0 + 1e-4: v0, s, ang, cx, cy, improved = v, s * (1 + ds), ang + da, cx + dx, cy + dy, True
    results[b] = dict(iou=round(v0, 3), s=s, ang=ang, mirror=mirror, cx=cx, cy=cy, fcx=fcx, fcy=fcy, set=BLOCK_SET[b])
    print(b, results[b])

json.dump(results, open(P + 'fit.json', 'w'), indent=1)

# preview overlay
ov = img.copy()
for b, r in results.items():
    polys = transform(fp_polys(r['set']), r['s'], r['ang'], r['mirror'], r['cx'], r['cy'], r['fcx'], r['fcy'])
    for i, p in enumerate(polys):
        cv2.polylines(ov, [np.round(p).astype(np.int32)], True, (255, 0, 0), 4)
        c = p.mean(0); cv2.putText(ov, SETS[r['set']][i][-1] if r['set'] == 'A' else SETS[r['set']][i][-1], (int(c[0]) - 10, int(c[1]) + 10), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (200, 0, 0), 3)
Image.fromarray(ov).resize((1690, 1490)).save(P + 'fit-preview.png')
