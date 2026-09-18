#!/usr/bin/env python3
"""refine_bays.py - straighten the parking bays into aligned rows.

The bays were placed one at a time from the brochure's OCR'd labels, each
with its own depth scan, so a row of bays wanders off its line by up to 4
plan units, the pitch drifts and the depths differ bay to bay. This makes
each row a grid: a straight line through the row's centres, one pitch, one
width, one depth (a tandem bay keeps its own depth), every bay centred on
the line. Gaps inside a row (a pillar, a tree) are kept.

Rows are runs of consecutive PB numbers whose centres step along the bay's
short axis; runs that continue the same line are fitted together so no kink
appears where a tree interrupts a row. Single bays are left alone.

  python3 refine_bays.py in.svg out.svg
"""
import re, sys, math, numpy as np

src, dst = sys.argv[1], sys.argv[2]
svg = open(src).read()
fm = re.search(r'<g data-floor="0"[^>]*>(.*?)(?=<g data-floor=|</svg>)', svg, re.S)
bays = []
for m in re.finditer(r'<polygon id="bay-PB(\d+)"[^>]*points="([^"]+)"', fm.group(1)):
    pts = np.array([tuple(map(float, p.split(','))) for p in m.group(2).split()])
    e01, e12 = pts[1] - pts[0], pts[2] - pts[1]
    l01, l12 = np.linalg.norm(e01), np.linalg.norm(e12)
    short = e01 / l01 if l01 < l12 else e12 / l12
    bays.append(dict(n=int(m.group(1)), c=pts.mean(0), w=min(l01, l12), d=max(l01, l12), t=short))
bays.sort(key=lambda b: b['n'])

# ---- runs of consecutive bays along one line ----
runs = []; cur = [bays[0]]
def same_row(a, b):
    v = b['c'] - a['c']; dist = np.linalg.norm(v)
    if dist > 1.9 * max(a['w'], b['w']): return False
    if abs(np.dot(a['t'], b['t'])) < math.cos(math.radians(10)): return False   # same orientation
    d = v / dist
    if abs(np.dot(d, a['t'])) < math.cos(math.radians(25)): return False        # step runs along the row
    n = np.array([-a['t'][1], a['t'][0]])
    if abs(np.dot(v, n)) > 0.5 * a['w']: return False                            # centres on one line
    return True
for a, b in zip(bays, bays[1:]):
    if same_row(a, b): cur.append(b)
    else: runs.append(cur); cur = [b]
runs.append(cur); cur = [b]
runs.append(cur)

def fit(C, T=None):
    """Row line: through the mean centre, along the mean of the bays' own short axes
    (a bay's drawn orientation is steadier than the wobble of its centre); with 6+
    bays the centres themselves fix the direction."""
    m = C.mean(0)
    if T is not None and len(C) < 6:
        ref = T[0]; acc = np.zeros(2)
        for t in T: acc += t if np.dot(t, ref) >= 0 else -t
        u = acc / np.linalg.norm(acc)
    else:
        _, _, vt = np.linalg.svd(C - m); u = vt[0]
    return m, u, np.array([-u[1], u[0]])

# ---- join runs that continue the same line (a tree or pillar broke them) ----
lines = []  # each: list of runs
for r in runs:
    if len(r) < 2: lines.append([r]); continue
    C = np.array([b['c'] for b in r]); m, u, nrm = fit(C, [b['t'] for b in r])
    joined = False
    for L in lines:
        if len(L[0]) < 2: continue
        CL = np.array([b['c'] for rr in L for b in rr]); mL, uL, nL = fit(CL, [b['t'] for rr in L for b in rr])
        if abs(np.dot(u, uL)) < math.cos(math.radians(3)): continue
        if abs(np.dot(m - mL, nL)) > 2.0: continue
        gap = min(np.linalg.norm(a['c'] - b['c']) for rr in L for a in rr for b in r)
        if gap > 3.5 * r[0]['w']: continue
        L.append(r); joined = True; break
    if not joined: lines.append([r])

new = {}; stats = dict(rows=0, bays=0, moved=[])
for L in lines:
    allb = [b for r in L for b in r]
    if len(allb) < 2:
        continue
    C = np.array([b['c'] for b in allb]); m, u, nrm = fit(C, [b['t'] for b in allb])
    res = np.abs((C - m) @ nrm)
    if res.max() > 7.0 and len(allb) > 2:
        keep = res <= 7.0
        stats.setdefault('outliers', []).extend(int(b['n']) for b, k in zip(allb, keep) if not k)
        L = [[b for b in r if res[allb.index(b)] <= 7.0] for r in L]; L = [r for r in L if r]
        allb = [b for r in L for b in r]
        if len(allb) < 2: continue
        C = np.array([b['c'] for b in allb]); m, u, nrm = fit(C, [b['t'] for b in allb])
    if np.dot(u, allb[0]['t']) < 0: u = -u; nrm = np.array([-u[1], u[0]])
    w = float(np.median([b['w'] for b in allb]))
    ds = np.array([b['d'] for b in allb]); dmed = float(np.median(ds))
    for r in L:
        proj = np.array([np.dot(b['c'] - m, u) for b in r])
        # ideal positions: pitch w, gaps kept where the original spacing was a real gap
        pos = [proj[0]]
        for a, b in zip(proj, proj[1:]):
            step = b - a
            pos.append(pos[-1] + (w if abs(step) < 1.35 * w else step))
        pos = np.array(pos); pos += proj.mean() - pos.mean()   # keep the run where it was
        for b, p in zip(r, pos):
            d = b['d'] if abs(b['d'] - dmed) > 0.25 * dmed else dmed   # tandem keeps its depth
            c = m + u * p
            corners = [c - u * w / 2 - nrm * d / 2, c + u * w / 2 - nrm * d / 2, c + u * w / 2 + nrm * d / 2, c - u * w / 2 + nrm * d / 2]
            new[b['n']] = corners
            stats['moved'].append(float(np.linalg.norm(c - b['c'])))
            stats['bays'] += 1
    stats['rows'] += 1

def sub(m):
    n = int(m.group(1))
    if n not in new: return m.group(0)
    pts = ' '.join(f'{x:.1f},{y:.1f}' for x, y in new[n])
    return f'{m.group(2)}points="{pts}"'
body = re.sub(r'(<polygon id="bay-PB(\d+)"[^>]*?)points="[^"]+"', lambda m: (lambda n: (m.group(1) + 'points="' + ' '.join(f'{x:.1f},{y:.1f}' for x, y in new[n]) + '"') if n in new else m.group(0))(int(m.group(2))), fm.group(1))
out = svg[:fm.start(1)] + body + svg[fm.end(1):]
open(dst, 'w').write(out)
mv = np.array(stats['moved'])
print('left alone (off their row line):', stats.get('outliers', []))
print(f"rows {stats['rows']}, bays aligned {stats['bays']} of {len(bays)} (singles left: {len(bays) - stats['bays']}), centre moved med {np.median(mv):.2f} max {mv.max():.2f}")
