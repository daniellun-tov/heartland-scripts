#!/usr/bin/env python3
"""score_bays.py - pick, per row, whichever candidate geometry sits on the
drawn bay lines best, then refine it rigidly against the raster.

Score of a set of rectangles = mean darkness sampled along their outlines
(the drawn front/back lines and dividers) minus mean darkness inside them.
Candidates are the outputs of the two detectors; the better one per row is
then shifted (+-4 across, +-2 along) and tilted (+-1.5 deg) to the maximum.

  python3 score_bays.py original.svg candA.svg candB.svg bg.webp out.svg
"""
import re, sys, math, json, numpy as np
from PIL import Image
from scipy import ndimage

orig, candA, candB, bgp, dst = sys.argv[1:6]
BG = 255 - np.array(Image.open(bgp).convert('L')).astype(float)
S = BG.shape[1] / 1690.0

def load(f):
    s = open(f).read(); fm = re.search(r'<g data-floor="0"[^>]*>(.*?)(?=<g data-floor=|</svg>)', s, re.S).group(1)
    return {int(m.group(1)): np.array([tuple(map(float, p.split(','))) for p in m.group(2).split()])
            for m in re.finditer(r'<polygon id="bay-PB(\d+)"[^>]*points="([^"]+)"', fm)}
O = load(orig); A = load(candA); B = load(candB)

# ---- rows, exactly as snap_bays groups them ----
bays = {}
for n, pts in O.items():
    e01, e12 = pts[1] - pts[0], pts[2] - pts[1]; l01, l12 = np.linalg.norm(e01), np.linalg.norm(e12)
    bays[n] = dict(n=n, c=pts.mean(0), w=min(l01, l12), t=e01 / l01 if l01 < l12 else e12 / l12)
order = sorted(bays)
def same_row(a, b):
    v = b['c'] - a['c']; dist = np.linalg.norm(v)
    if dist > 1.9 * max(a['w'], b['w']): return False
    if abs(np.dot(a['t'], b['t'])) < math.cos(math.radians(6)): return False
    if abs(np.dot(v / dist, a['t'])) < math.cos(math.radians(15)): return False
    nn = np.array([-a['t'][1], a['t'][0]]); return abs(np.dot(v, nn)) <= 0.35 * a['w']
FORCE_ROWS = [(230, 237), (364, 368), (266, 293), (294, 297), (253, 264)]
def forced(n): return next((f for f in FORCE_ROWS if f[0] <= n <= f[1]), None)
runs = []; cur = [order[0]]
for a, b in zip(order, order[1:]):
    fa, fb = forced(a), forced(b)
    joined = (fa == fb) if (fa is not None or fb is not None) else same_row(bays[a], bays[b])
    if joined: cur.append(b)
    else: runs.append(cur); cur = [b]
runs.append(cur)

def samples(rects):
    """points along the outlines (1 unit in from the corners) and inside."""
    out_pts = []; in_pts = []
    for r in rects:
        for i in range(4):
            p, q = r[i], r[(i + 1) % 4]; L = np.linalg.norm(q - p); k = max(int(L / 0.5), 2)
            t = np.linspace(1.0 / L, 1 - 1.0 / L, k)[:, None]
            out_pts.append(p + t * (q - p))
        c = r.mean(0)
        for a in np.linspace(-0.6, 0.6, 7):
            for b in np.linspace(-0.6, 0.6, 7):
                in_pts.append(c + a * (r[1] - r[0]) / 2 * 1.0 + b * (r[3] - r[0]) / 2 * 1.0)
    return np.vstack(out_pts), np.array(in_pts)
def score(rects):
    o, i = samples(rects)
    vo = ndimage.map_coordinates(BG, [o[:, 1] * S, o[:, 0] * S], order=1, mode='nearest')
    vi = ndimage.map_coordinates(BG, [i[:, 1] * S, i[:, 0] * S], order=1, mode='nearest')
    return vo.mean() - vi.mean()
def transform(rects, dx, dy, ang, about):
    ca, sa = math.cos(ang), math.sin(ang); R = np.array([[ca, -sa], [sa, ca]])
    return [(r - about) @ R.T + about + np.array([dx, dy]) for r in rects]

new = {}; log = []
for r in runs:
    ra = [A[n] for n in r]; rb = [B[n] for n in r]
    sa, sb = score(ra), score(rb)
    base, tag = (ra, 'A') if sa >= sb else (rb, 'B')
    if forced(r[0]) is not None: base, tag = rb, 'B(forced)'   # a row Daniel says is straight stays one straight row
    # rigid refinement in the row's own frame
    about = np.mean([x.mean(0) for x in base], 0)
    t = bays[r[0]]['t']; nn = np.array([-t[1], t[0]])
    best = (score(base), 0, 0, 0)
    for dn in np.arange(-4, 4.01, 0.5):
        for du in np.arange(-2, 2.01, 0.5):
            for deg in np.arange(-1.5, 1.51, 0.5):
                d = t * du + nn * dn
                sc = score(transform(base, d[0], d[1], math.radians(deg), about))
                if sc > best[0]: best = (sc, du, dn, deg)
    _, du, dn, deg = best; d = t * du + nn * dn
    final = transform(base, d[0], d[1], math.radians(deg), about)
    for n, rect in zip(r, final): new[n] = rect
    log.append((f'{r[0]}-{r[-1]}', tag, round(sa, 1), round(sb, 1), round(best[0], 1), du, dn, deg))

# ---- where two separately fitted groups abut, their combs can differ by a unit
# or two and the boundary cells overlap: pull both back to the midline ----
from shapely.geometry import Polygon as _P
def _rect_axes(c):
    e = np.array(c[1]) - np.array(c[0]); e2 = np.array(c[2]) - np.array(c[1])
    u = e / np.linalg.norm(e) if np.linalg.norm(e) < np.linalg.norm(e2) else e2 / np.linalg.norm(e2)
    return u, np.array([-u[1], u[0]])
DUP = {(13, 143), (74, 174), (265, 266)}
keys = sorted(new)
new = {k: [tuple(map(float, p)) for p in v] for k, v in new.items()}
for _ in range(3):
    fixed = 0
    for a in keys:
        for b in keys:
            if b <= a or (a, b) in DUP: continue
            A = _P(new[a]); B_ = _P(new[b])
            if not A.intersects(B_): continue
            I = A.intersection(B_)
            if I.area < 0.5: continue
            u, nrm = _rect_axes(new[a])
            ca, cb = np.mean(new[a], 0), np.mean(new[b], 0)
            along = abs(np.dot(cb - ca, u)) >= abs(np.dot(cb - ca, nrm))   # side by side, or front/back
            ax = u if along else nrm
            # overlap extent along that axis, and the direction from a to b
            pts = np.array(I.exterior.coords); pr = (pts - ca) @ ax
            ow = pr.max() - pr.min(); sgn = 1 if np.dot(cb - ca, ax) > 0 else -1
            for key, s_ in ((a, sgn), (b, -sgn)):
                c = np.array(new[key]); ctr = c.mean(0); p = (c - ctr) @ ax
                far = p > 0 if s_ > 0 else p < 0
                c[far] -= ax * (ow / 2) * s_
                new[key] = [tuple(x) for x in c]
            fixed += 1
    if not fixed: break


svg = open(candA).read()
fm = re.search(r'<g data-floor="0"[^>]*>(.*?)(?=<g data-floor=|</svg>)', svg, re.S)
def fmtp(p): return ' '.join(f'{x:.1f},{y:.1f}' for x, y in p)
body = re.sub(r'(<polygon id="bay-PB(\d+)"[^>]*?)points="[^"]+"', lambda m: m.group(1) + 'points="' + fmtp(new[int(m.group(2))]) + '"', fm.group(1))
open(dst, 'w').write(svg[:fm.start(1)] + body + svg[fm.end(1):])
json.dump(log, open('score-log.json', 'w'), indent=0)
picks = sum(1 for l in log if l[1] == 'A'); print(f'runs {len(runs)}: chose A {picks}, B {len(runs) - picks}; mean score before {np.mean([max(l[2], l[3]) for l in log]):.1f} after {np.mean([l[4] for l in log]):.1f}')
