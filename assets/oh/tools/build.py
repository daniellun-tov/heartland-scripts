import json, math
import numpy as np, cv2
from PIL import Image

P = '/tmp/claude-0/-home-claude/35b4216c-9add-5c92-8377-b6843a9019d0/scratchpad/plans/'
img = np.array(Image.open(P + 'ground-1.png').convert('RGB')).astype(np.float32)
H, W = img.shape[:2]
fit = json.load(open(P + 'fit.json'))
units = json.load(open(P + 'unit_paths.json'))
SETS = {'A': ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], 'B1': ['B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'B17'], 'B2': ['B21', 'B22', 'B23', 'B24', 'B25', 'B26', 'B27']}
LETTER = {1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'F', 7: 'G', 8: 'H', 9: 'I', 10: 'J', 11: 'K', 12: 'L'}

def transform(polys, s, ang, mirror, cx, cy, fcx, fcy):
    a = math.radians(ang); ca, sa = math.cos(a), math.sin(a)
    out = []
    for p in polys:
        q = np.array(p, dtype=np.float64).copy()
        q[:, 0] -= fcx; q[:, 1] -= fcy
        if mirror: q[:, 0] = -q[:, 0]
        x = q[:, 0] * ca - q[:, 1] * sa; y = q[:, 0] * sa + q[:, 1] * ca
        out.append(np.stack([x * s + cx, y * s + cy], 1))
    return out

# ---- unit polygons in raster coordinates ----
plots = {}   # block number -> list of (onfloor '01'.., polygon)
for b, r in fit.items():
    b = int(b)
    names = SETS[r['set']]
    polys = transform([units[n] for n in names], r['s'], r['ang'], r['mirror'], r['cx'], r['cy'], r['fcx'], r['fcy'])
    plots[b] = [(n[-1].zfill(2), p) for n, p in zip(names, polys)]

# ---- background ----
sand = np.array([242, 239, 230], np.float32)      # site --_colours---sand--s-50
paper = np.array([246, 244, 238], np.float32)
bld = np.array([236, 231, 221], np.float32)        # building fill under the plots
core = np.array([222, 217, 206], np.float32)       # cores / courtyards
R, G, B = img[..., 0], img[..., 1], img[..., 2]

# site mask: convex hull of the greenery (the boundary wall follows it) plus the road stub at the gate
hull = np.load(P + 'hull.npy').reshape(-1, 1, 2).astype(np.int32)
site = np.zeros((H, W), np.uint8)
cv2.fillPoly(site, [hull], 1)
cv2.fillPoly(site, [np.array([[1180, 640], [1400, 600], [1410, 790], [1210, 780]], np.int32)], 1)
site = cv2.erode(site, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
# soften the edge
site_f = cv2.GaussianBlur(site.astype(np.float32), (0, 0), 6)

out = img.copy()
hsv = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]

# class masks
green = ((hue > 25) & (hue < 95) & (sat > 60))                      # lawns, trees
darkgreen = green & (val < 110)
road = (sat < 40) & (val > 150) & (val < 205)                       # grey roads
bays = (sat < 40) & (val >= 100) & (val <= 150)                     # darker grey (bay markings/kerbs)
ink = (val < 90) & (sat < 90)                                       # black text / lines
magenta = (R > 150) & (B > 120) & (G < 110)                         # boundary / dimension lines
orange = (R > 220) & (G > 110) & (G < 190) & (B < 90)               # gatehouse/utilities orange
redtext = (R > 160) & (G < 120) & (B < 120) & (R - G > 60)            # red annotation text
unitfill = ((B > 90) & (R < 60) & (G > 70) & (G < 150)) | ((R < G - 12) & (R < B - 12) & (G > 190) & (R > 150)) | ((R > 220) & (G > 150) & (G < 215) & (B > 160) & (B < 225) & (R - G > 25)) | ((R > 150) & (G < 90) & (B < 90))

# 1. global: desaturate and lift toward sand
base = img * 0.55 + sand * 0.45
gray = base.mean(2, keepdims=True)
base = base * 0.55 + gray * 0.45
out = base
# 2. greens -> sage family, keep tree texture
sage_l = np.array([214, 222, 205], np.float32); sage_m = np.array([186, 200, 176], np.float32); sage_d = np.array([150, 168, 140], np.float32)
t = np.clip((val - 40) / 160, 0, 1)[..., None]
green_col = sage_d * (1 - t) + sage_l * t
out = np.where(green[..., None], green_col * 0.7 + img * 0.3 * 0.4 + sage_m * 0.3 * 0.6, out)
# 3. roads and bays
out = np.where(road[..., None], np.array([228, 225, 218], np.float32), out)
out = np.where(bays[..., None], np.array([210, 206, 197], np.float32), out)
# 4. text/lines: soften to warm grey (keeps street names readable but quiet)
out = np.where(ink[..., None], np.array([150, 140, 128], np.float32) * 0.6 + out * 0.4, out)
# 5. boundary/dimension lines and orange annotation fills fade away
out = np.where(magenta[..., None], sand * 0.7 + out * 0.3, out)
out = np.where(orange[..., None], np.array([232, 224, 208], np.float32), out)
rt = cv2.dilate(redtext.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
out = np.where(rt[..., None], sand * 0.85 + out * 0.15, out)
# 6. buildings: paint every unit polygon + a core hull per block
canvas = out.astype(np.uint8).copy()
for b, lst in plots.items():
    hull = cv2.convexHull(np.concatenate([np.round(p).astype(np.int32) for _, p in lst]))
    cv2.fillPoly(canvas, [hull], tuple(int(v) for v in core))
    for _, p in lst:
        cv2.fillPoly(canvas, [np.round(p).astype(np.int32)], tuple(int(v) for v in bld))
    for _, p in lst:
        cv2.polylines(canvas, [np.round(p).astype(np.int32)], True, (205, 198, 186), 3, cv2.LINE_AA)
out = canvas.astype(np.float32)
# 7. outside the site -> paper
out = out * site_f[..., None] + paper * (1 - site_f[..., None])
# 8. leftover unit-fill colour anywhere (legend tiles) already outside site; also mute any residual saturation
outu8 = np.clip(out, 0, 255).astype(np.uint8)
hsv2 = cv2.cvtColor(outu8, cv2.COLOR_RGB2HSV).astype(np.float32); hsv2[..., 1] *= 0.85
outu8 = cv2.cvtColor(np.clip(hsv2, 0, 255).astype(np.uint8), cv2.COLOR_HSV2RGB)
Image.fromarray(outu8).save(P + 'bg-full.png')
bg = Image.fromarray(outu8)
bg.resize((1690, 1490), Image.LANCZOS).save(P + 'bg-1690.webp', quality=82)
bg.save(P + 'bg-3380.webp', quality=80)
print('bg saved')

# ---- SVG (viewBox = raster / 2) ----
S = 0.5
def fmt(p): return ' '.join(f'{x*S:.1f},{y*S:.1f}' for x, y in p)
svg = ['<svg class="site-plan_map-svg" viewBox="0 0 1690 1490" xmlns="http://www.w3.org/2000/svg" aria-label="Blocks A to L">']
svg.append('<g data-layer="blocks">' + ''.join(
    f'<polygon id="block-{LETTER[b].lower()}" points="{fmt(cv2.convexHull(np.concatenate([np.round(p).astype(np.int32) for _, p in lst])).reshape(-1, 2))}"/>' for b, lst in sorted(plots.items())) + '</g>')
for floor in (1, 2, 3, 4):
    parts = []
    for b, lst in sorted(plots.items()):
        for on, p in lst:
            if b == 4 and floor == 1 and on in ('06', '07'): continue  # block D ground floor: estate office
            parts.append(f'<polygon id="unit-{b}-{floor}{on}" points="{fmt(p)}"/>')
    svg.append(f'<g data-floor="{floor}">' + ''.join(parts) + '</g>')
svg.append('</svg>')
open(P + 'oh-site-plan.svg', 'w').write('\n'.join(svg))
ids = [l for l in '\n'.join(svg).split('id="')[1:]]
print('svg ids', len(ids), 'units', sum(1 for i in ids if i.startswith('unit-')))

# ---- preview composite ----
prev = np.array(bg.resize((1690, 1490), Image.LANCZOS)).copy()
import json as _j
status = {u['unit_number']: u['status_key'] for u in _j.load(open(P + '../units.json'))}
col = {'available': (127, 151, 128), 'reserved': (221, 179, 101), 'sold': (126, 126, 125), 'unreleased': (181, 179, 173)}
ov = prev.copy()
for b, lst in plots.items():
    for on, p in lst:
        st = status.get(f'{b}-1{on}', 'unreleased')
        cv2.fillPoly(ov, [np.round(p * S).astype(np.int32)], col[st])
prev = (prev * 0.35 + ov * 0.65).astype(np.uint8)
for b, lst in plots.items():
    for on, p in lst:
        cv2.polylines(prev, [np.round(p * S).astype(np.int32)], True, (255, 255, 255), 1, cv2.LINE_AA)
        c = (p * S).mean(0); cv2.putText(prev, on, (int(c[0]) - 8, int(c[1]) + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (60, 50, 40), 1, cv2.LINE_AA)
    c = np.concatenate([p for _, p in lst]).mean(0) * S
    cv2.putText(prev, LETTER[b], (int(c[0]) - 8, int(c[1]) + 8), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (95, 77, 63), 2, cv2.LINE_AA)
Image.fromarray(prev).save(P + 'composite-preview.png')
print('done')
