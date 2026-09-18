#!/usr/bin/env python3
"""snap_bays.py - fit the parking bays to the bay lines drawn in the background.

Reads the straightened plan (rows already grouped and made rectangular) and
the background raster, and for each row finds in the raster:
  * the two long lines of the row (front and back), from the darkness profile
    across the row - the bay fill is a light plateau between two thin lines
  * the dividers, from the profile along the row - a comb of period ~ bay
    width; pitch and phase are fitted with the current pitch as the prior
then rebuilds every bay to fill the drawn cell nearest its centre. Rows that
share a drawn line (a run the OCR split because two labels were off) are
merged first, so their dividers come from one fit.

  python3 snap_bays.py in.svg out.svg bg.webp
"""
import re, sys, math, json, numpy as np
from PIL import Image
from scipy import ndimage, signal

src, dst, bgp = sys.argv[1], sys.argv[2], sys.argv[3]
BG = np.array(Image.open(bgp).convert('L')).astype(float)   # 2 px per plan unit
SCALE = BG.shape[1] / 1690.0
RES = 0.5

svg = open(src).read()
fm = re.search(r'<g data-floor="0"[^>]*>(.*?)(?=<g data-floor=|</svg>)', svg, re.S)
bays = {}
for m in re.finditer(r'<polygon id="bay-PB(\d+)"[^>]*points="([^"]+)"', fm.group(1)):
    pts = np.array([tuple(map(float, p.split(','))) for p in m.group(2).split()])
    e01, e12 = pts[1] - pts[0], pts[2] - pts[1]
    l01, l12 = np.linalg.norm(e01), np.linalg.norm(e12)
    t = e01 / l01 if l01 < l12 else e12 / l12
    bays[int(m.group(1))] = dict(n=int(m.group(1)), c=pts.mean(0), w=min(l01, l12), d=max(l01, l12), t=t, pts=pts)
order = sorted(bays)

# ---- rows: consecutive bays that share a line (same test as refine_bays) ----
def same_row(a, b):
    v = b['c'] - a['c']; dist = np.linalg.norm(v)
    if dist > 1.9 * max(a['w'], b['w']): return False
    if abs(np.dot(a['t'], b['t'])) < math.cos(math.radians(6)): return False
    if abs(np.dot(v / dist, a['t'])) < math.cos(math.radians(15)): return False
    nn = np.array([-a['t'][1], a['t'][0]])
    return abs(np.dot(v, nn)) <= 0.35 * a['w']
# rows the geometry test cannot see as one (a label the OCR put well off the
# line, a tree over the middle) but the drawing shows as one line of cells
FORCE_ROWS = [(230, 237), (364, 368), (266, 293), (294, 297), (253, 264)]
def forced(n): return next((f for f in FORCE_ROWS if f[0] <= n <= f[1]), None)
runs = []; cur = [bays[order[0]]]
for a, b in zip(order, order[1:]):
    fa, fb = forced(a), forced(b)
    if (fa is not None or fb is not None):
        joined = fa == fb
    else:
        joined = same_row(bays[a], bays[b])
    if joined: cur.append(bays[b])
    else: runs.append(cur); cur = [bays[b]]
runs.append(cur)

def frame(group):
    C = np.array([b['c'] for b in group]); m = C.mean(0)
    ref = group[0]['t']; acc = np.zeros(2)
    for b in group: acc += b['t'] if np.dot(b['t'], ref) >= 0 else -b['t']
    u = acc / np.linalg.norm(acc)
    if len(group) > 1 and np.dot(C[-1] - C[0], u) < 0: u = -u
    return m, u, np.array([-u[1], u[0]]), C

def strip(m, u, nrm, ulo, uhi, nlo, nhi):
    us = np.arange(ulo, uhi, RES); ns = np.arange(nlo, nhi, RES)
    U, N = np.meshgrid(us, ns)
    X = (m[0] + U * u[0] + N * nrm[0]) * SCALE; Y = (m[1] + U * u[1] + N * nrm[1]) * SCALE
    return 255 - ndimage.map_coordinates(BG, [Y, X], order=1, mode='nearest'), us, ns

def across_lines(dark, us, ns, ulo, uhi, d):
    """front/back edge positions (in n) of the bay fill nearest n=0.
    The fill is a flat plateau; its two sides are the strongest steps in the
    across profile (a thin drawn line, a wall band or the aisle - either way a
    step), about one bay depth apart and bracketing the row's own centre."""
    sel = (us > ulo) & (us < uhi)
    prof = dark[:, sel].mean(1)
    sm = ndimage.uniform_filter1d(prof, 3)
    g = np.abs(np.gradient(sm, RES))
    peaks, _ = signal.find_peaks(g, prominence=1.5, height=2.5)
    if len(peaks) == 0: return None
    best = None
    for i in peaks:
        for j in peaks:
            if j <= i: continue
            n1, n2 = ns[i], ns[j]
            if not (0.75 * d <= n2 - n1 <= 1.3 * d): continue
            if not (n1 - 3 <= 0 <= n2 + 3): continue
            inner = sm[i + 4:j - 3]
            if len(inner) < 4: continue
            flat = inner.max() - inner.min()
            score = g[i] + g[j] - 0.8 * flat - 1.0 * abs((n1 + n2) / 2) - 2.5 * abs((n2 - n1) - d)
            if best is None or score > best[0]: best = (score, n1, n2)
    if best is not None and best[0] > 4: return (best[1], best[2], best[0])
    # fallback: one strong edge (the wall band) and the row's own depth from it,
    # for rows whose aisle side is the same tone as the bay fill
    strong = [i for i in peaks if abs(ns[i]) <= 0.8 * d and g[i] >= 6]
    if not strong: return None
    i = max(strong, key=lambda i: g[i] - 0.3 * abs(abs(ns[i]) - d / 2))
    sc = g[i] * 0.5
    return (ns[i], ns[i] + d, sc) if ns[i] < 0 else (ns[i] - d, ns[i], sc)

def divider_ends(dark, us, ns, phase, pitch, ulo, uhi, d):
    """Front/back lines from the drawn dividers: each divider is a short dark
    segment across the row whose two ends ARE the front and back corners. Trace
    every divider's dark run along n, then fit a line through the front ends and
    one through the back ends - that gives the depth, the offset and the row's
    real tilt in one go. Returns (n1, n2, tilt_rad, count) or None."""
    fill_band = (ns > -0.35 * d) & (ns < 0.35 * d)
    ks = np.arange(-3, 80)
    cols = phase + ks * pitch
    cols = cols[(cols > ulo - pitch * 0.6) & (cols < uhi + pitch * 0.6)]
    ends = []
    for cu in cols:
        j = int(round((cu - us[0]) / RES))
        if j < 2 or j > len(us) - 3: continue
        c = dark[:, j - 1:j + 2].mean(1)
        # fill level: the cell interiors either side of this divider
        jl, jr = int(round((cu - pitch / 2 - us[0]) / RES)), int(round((cu + pitch / 2 - us[0]) / RES))
        inter = []
        for jj in (jl, jr):
            if 1 <= jj < len(us) - 1: inter.append(dark[fill_band, jj - 1:jj + 2].mean())
        if not inter: continue
        f = np.mean(inter)
        on = c > f + 7
        # longest run of "dark" through the row's centre, tolerating 1.5-unit gaps
        i0 = int(np.argmin(np.abs(ns)))
        if not on[max(0, i0 - 3):i0 + 4].any(): continue
        lo = i0; gap = 0
        while lo > 0:
            if on[lo - 1]: lo -= 1; gap = 0
            elif gap < 3: lo -= 1; gap += 1
            else: break
        lo += gap
        hi = i0; gap = 0
        while hi < len(on) - 1:
            if on[hi + 1]: hi += 1; gap = 0
            elif gap < 3: hi += 1; gap += 1
            else: break
        hi -= gap
        n1, n2 = ns[lo], ns[hi]
        if 0.55 * d <= n2 - n1 <= 1.6 * d: ends.append((cu, n1, n2))
    if len(ends) < 2: return None
    E = np.array(ends)
    # robust lines through the ends: median offsets, slope from a least-squares fit
    # over the ends within 3 units of the median (so one bad divider cannot tilt the row)
    def fit(col):
        med = np.median(E[:, col]); ok = np.abs(E[:, col] - med) < 3.0
        if ok.sum() >= 3 and (E[ok, 0].max() - E[ok, 0].min()) > 2 * pitch:
            b, a = np.polyfit(E[ok, 0], E[ok, col], 1); return a, b
        return med, 0.0
    a1, b1 = fit(1); a2, b2 = fit(2)
    tilt = math.atan((b1 + b2) / 2) if abs(b1 - b2) < math.tan(math.radians(1.5)) else 0.0
    return a1, a2, tilt, len(ends)

def along_comb(dark, us, ns, n1, n2, w, with_score=False):
    """divider phase and pitch: a comb of period ~w that best matches the profile."""
    band = (ns > n1 + 2.5) & (ns < n2 - 2.5)
    prof = dark[band, :].mean(0)
    sm = ndimage.uniform_filter1d(prof, 2)
    sm = sm - ndimage.uniform_filter1d(sm, int(1.5 * w / RES))   # remove slow trend
    best = None
    for pitch in np.arange(0.9 * w, 1.1 * w + 1e-9, 0.1):
        for phase in np.arange(0, pitch, 0.25):
            pos = phase + np.arange(-2, 60) * pitch
            pos = pos[(pos >= us[0]) & (pos <= us[-1])]
            idx = np.round((pos - us[0]) / RES).astype(int)
            score = sm[idx].mean()
            if best is None or score > best[0]: best = (score, phase, pitch)
    return best if with_score else (best[1], best[2])

def rot(u, a):
    ca, sa = math.cos(a), math.sin(a)
    v = np.array([u[0] * ca - u[1] * sa, u[0] * sa + u[1] * ca]); v /= np.linalg.norm(v)
    return v, np.array([-v[1], v[0]])

new = {}; log = []; det = {}
def build(group, m, u, nrm, n1, n2, tag):
    C = np.array([b['c'] for b in group]); proj = (C - m) @ u
    w = float(np.median([b['w'] for b in group]))
    dark, us, ns = strip(m, u, nrm, proj.min() - 1.5 * w, proj.max() + 1.5 * w, min(n1, n2) - 2, max(n1, n2) + 2)
    phase, pitch = along_comb(dark, us, ns, min(n1, n2), max(n1, n2), w)
    # cells: consecutive bays take consecutive cells (a gap in the original
    # stays a gap), and the whole run slides to the integer offset that fits best
    order_ = np.argsort(proj); rel = [0]
    for a, b in zip(order_, order_[1:]):
        step = (proj[b] - proj[a]) / pitch
        rel.append(rel[-1] + (0 if step < 0.5 else max(1, int(round(step)))))   # a duplicate label shares the cell
    rel = np.array(rel, float)
    k0 = int(round(np.mean([(proj[i] - phase) / pitch - 0.5 - r for i, r in zip(order_, rel)])))
    cells = {int(i): k0 + int(r) for i, r in zip(order_, rel)}
    for idx, (b, p) in enumerate(zip(group, proj)):
        k = cells[idx]
        cu = phase + (k + 0.5) * pitch
        c = m + u * cu + nrm * (n1 + n2) / 2
        hw = pitch / 2; lo = c - nrm * abs(n2 - n1) / 2; hi = c + nrm * abs(n2 - n1) / 2
        new[b['n']] = [lo - u * hw, lo + u * hw, hi + u * hw, hi - u * hw]
    log.append((tag, f'lines {n1:+.1f}/{n2:+.1f} depth {abs(n2-n1):.1f} pitch {pitch:.2f} phase {phase:.2f}'))

def detect(group):
    m, u, nrm, C = frame(group)
    w = float(np.median([b['w'] for b in group])); d = float(np.median([b['d'] for b in group]))
    # coarse tilt first: the dividers read sharpest when the frame runs along the
    # drawn row, so try a fan of directions and keep the one with the crispest comb
    if len(group) >= 3:
        best = None
        for deg in np.arange(-7, 7.01, 1.0):
            u2, n2 = rot(u, math.radians(deg)); proj = (C - m) @ u2
            dark, us, ns = strip(m, u2, n2, proj.min() - 1.5 * w, proj.max() + 1.5 * w, -0.4 * d, 0.4 * d)
            sc = along_comb(dark, us, ns, -0.35 * d, 0.35 * d, w, with_score=True)[0]
            if best is None or sc > best[0]: best = (sc, u2, n2)
        u, nrm = best[1], best[2]
    for it in range(2):
        proj = (C - m) @ u
        dark, us, ns = strip(m, u, nrm, proj.min() - 1.5 * w, proj.max() + 1.5 * w, -1.4 * d, 1.4 * d)
        phase, pitch = along_comb(dark, us, ns, -0.35 * d, 0.35 * d, w)
        r = divider_ends(dark, us, ns, phase, pitch, proj.min(), proj.max(), d)
        if r is None: break
        n1, n2, tilt, cnt = r
        if abs(tilt) > math.radians(0.3) and it == 0:
            u, nrm = rot(u, tilt); continue
        return (m, u, nrm, (n1, n2, 100.0 + cnt))
    proj = (C - m) @ u
    dark, us, ns = strip(m, u, nrm, proj.min() - 1.5 * w, proj.max() + 1.5 * w, -1.3 * d, 1.3 * d)
    lines = across_lines(dark, us, ns, proj.min() - w / 2, proj.max() + w / 2, d)
    return (m, u, nrm, lines)

# pass 1: every run on its own; a run the profile cannot read as one row (the
# drawn row bends or steps) is split in half and each half read on its own
def pass1(r, tag, depth=0):
    m, u, nrm, lines = detect(r)
    # a run that reads as one row is one row - unless splitting it reads
    # clearly better (two drawn rows the OCR numbered consecutively)
    best = None
    if len(r) >= 4 and depth < 2 and forced(r[0]['n']) is None:   # a forced row is one row
        for k in range(2, len(r) - 1):
            da = detect(r[:k]); db = detect(r[k:])
            if da[3] is None or db[3] is None: continue
            sc = (da[3][2] + db[3][2]) / 2
            if best is None or sc > best[0]: best = (sc, k, da, db)
    whole = lines[2] if lines is not None else -1e9
    if best is not None and best[0] > whole + 6:
        _, k, da, db = best
        build(r[:k], da[0], da[1], da[2], da[3][0], da[3][1], tag + f'[:{k}]')
        build(r[k:], db[0], db[1], db[2], db[3][0], db[3][1], tag + f'[{k}:]')
        return da if k >= len(r) - k else db
    if lines is not None:
        build(r, m, u, nrm, lines[0], lines[1], tag); return (m, u, nrm, lines)
    log.append((tag, 'no lines')); return None
for i, r in enumerate(runs):
    res = pass1(r, f'{r[0]["n"]}-{r[-1]["n"]}')
    det[i] = res if res is not None else (None, None, None, None)

# pass 2: runs that share a drawn edge (front or back) within 2 units, run the
# same way and sit close are one row: the OCR split them because two labels
# were off the line. They get the shared edge, the depth of the bigger run
# and one set of dividers.
def edges_world(i):
    m, u, nrm, lines = det[i]
    if lines is None: return None
    return [m + nrm * lines[0], m + nrm * lines[1]], u, nrm
groups = []
for i, r in enumerate(runs):
    E = edges_world(i)
    if E is None: groups.append([i]); continue
    pts_i, u_i, n_i = E; placed = False
    for g in groups:
        j = g[0]; Ej = edges_world(j)
        if Ej is None: continue
        pts_j, u_j, n_j = Ej
        if abs(np.dot(u_i, u_j)) < math.cos(math.radians(2.5)): continue
        gap = min(np.linalg.norm(a['c'] - b['c']) for a in r for b in runs[j])
        if gap > 2.5 * r[0]['w']: continue
        # offsets of each run's two edge lines measured across run j's frame
        oi = [np.dot(p - pts_j[0], n_j) for p in pts_i]; oj = [np.dot(p - pts_j[0], n_j) for p in pts_j]
        if min(abs(a - b) for a in oi for b in oj) > 2.0: continue
        # same side of the shared line: the two fills must mostly overlap
        # (back-to-back rows share a line too, from opposite sides)
        lo, hi = max(min(oi), min(oj)), min(max(oi), max(oj))
        if hi - lo < 0.5 * min(max(oi) - min(oi), max(oj) - min(oj)): continue
        g.append(i); placed = True; break
    if not placed: groups.append([i])
merged = 0
for g in groups:
    if len(g) < 2: continue
    big = max(g, key=lambda i: len(runs[i]))
    m, u, nrm, lines = det[big]
    allb = [b for i in g for b in runs[i]]
    # which of the big run's edges is the shared one: the edge the others sit on
    votes = [0, 0]
    for i in g:
        if i == big: continue
        pts_i, _, _ = edges_world(i)
        for p in pts_i:
            o = np.dot(p - m, nrm)
            for k in (0, 1):
                if abs(o - lines[k]) < 2.0: votes[k] += 1
    shared = 0 if votes[0] >= votes[1] else 1
    ns_ = lines[shared]; nf = lines[1 - shared]
    m2, _, _, _ = frame(allb)
    u2, nrm2 = u, nrm              # the big run's measured direction (tilt included)
    # express the two lines in the merged frame
    ns_g = np.dot(m + nrm * ns_ - m2, nrm2); nf_g = np.dot(m + nrm * nf - m2, nrm2)
    build(allb, m2, u2, nrm2, ns_g, nf_g, 'merged ' + '+'.join(f'{runs[i][0]["n"]}-{runs[i][-1]["n"]}' for i in g) + f' shared={"front" if shared == 0 else "back"}')
    merged += 1

# ---- where two separately fitted groups abut, their combs can differ by a unit
# or two and the boundary cells overlap: pull both back to the midline ----
from shapely.geometry import Polygon as _P
def _rect_axes(c):
    e = np.array(c[1]) - np.array(c[0]); e2 = np.array(c[2]) - np.array(c[1])
    u = e / np.linalg.norm(e) if np.linalg.norm(e) < np.linalg.norm(e2) else e2 / np.linalg.norm(e2)
    return u, np.array([-u[1], u[0]])
DUP = {(13, 143), (74, 174), (265, 266)}
keys = sorted(new)
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

def fmtp(p): return ' '.join(f'{x:.1f},{y:.1f}' for x, y in p)
body = re.sub(r'(<polygon id="bay-PB(\d+)"[^>]*?)points="[^"]+"',
              lambda m: (m.group(1) + 'points="' + fmtp(new[int(m.group(2))]) + '"') if int(m.group(2)) in new else m.group(0), fm.group(1))
open(dst, 'w').write(svg[:fm.start(1)] + body + svg[fm.end(1):])
json.dump(log, open('snap-log.json', 'w'), indent=0)
ok = sum(1 for t, msg in log if not msg.startswith('no'))
print(f'runs {len(runs)}, snapped {len(new)} of {len(bays)} bays, merged groups {merged}, failed: {[t for t, msg in log if msg.startswith("no")]}')
