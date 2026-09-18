#!/usr/bin/env python3
"""refine_plots.py - square up the unit plots so they tile each block.

The unit shapes came from fitting v1's per-unit highlight SVGs onto the
plan, with a per-unit nudge: every plot is a rectangle, but each one is
rotated a degree or two differently, so neighbours overlap along shared
walls, opposite walls are not parallel, and the outer walls miss the block
outline the background paints. This rebuilds them as true rectangles in the
block's own frame:

  1. rotate the block hull and its units by -theta (the hull's dominant
     edge direction, ~62.5 deg on this plan) so the block is axis-aligned
  2. clean the hull: axis-align every edge, drop jogs shorter than JOG
     (staircase artefacts of the original union of tilted rectangles)
  3. each unit = the axis-aligned box of its fitted shape
  4. resolve overlaps: a pair that overlaps is split down the middle of
     the overlap, across its thinner dimension
  5. grow: an edge that has the hull or a neighbour within REACH moves onto
     it (closes the gaps to the outline and between units); an edge facing
     open core does not move
  6. clip to the cleaned hull, add T-junction vertices so shared walls are
     one vertex chain, rotate back

Wing-tip shafts (the small box the fit left between two units) are filled;
the wall between the two units runs straight through. Parking (floor 0),
blocks and features are untouched; labels are re-centred.

  python3 refine_plots.py in.svg out.svg
"""
import re, sys, json, math, itertools
import numpy as np
import shapely
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from shapely import affinity
from shapely.validation import make_valid

JOG = 5.0      # plan units: hull edges shorter than this are staircase noise
WALL = 2.5     # plan units: unit walls closer than this are the same wall
REACH = 8.0    # plan units: an edge this close to the hull / a neighbour snaps onto it
G = 0.01       # output grid
LETTERS = 'abcdefghijkl'

src, dst = sys.argv[1], sys.argv[2]
svg = open(src).read()

def parse_pts(s): return [tuple(map(float, p.split(','))) for p in s.split()]
def to_poly(pts):
    P = Polygon(pts)
    if not P.is_valid: P = make_valid(P)
    if P.geom_type != 'Polygon':
        P = max([g for g in P.geoms if g.geom_type == 'Polygon'], key=lambda g: g.area)
    return P
def fmt(P):
    return ' '.join((f'{x:.2f},{y:.2f}').replace('.00', '') for x, y in list(P.exterior.coords)[:-1])

blocks = {}
blk_layer = re.search(r'<g data-layer="blocks">(.*?)</g>', svg, re.S).group(1)
for m in re.finditer(r'<polygon id="(block-[a-l])" points="([^"]+)"', blk_layer):
    blocks[m.group(1)] = to_poly(parse_pts(m.group(2)))
floors = {}
for fm in re.finditer(r'<g data-floor="([1-4])">(.*?)(?=<g data-floor=|</svg>)', svg, re.S):
    floors[fm.group(1)] = {m.group(1): to_poly(parse_pts(m.group(2)))
                           for m in re.finditer(r'<polygon id="(unit-[^"]+)" points="([^"]+)"', fm.group(2))}

# ---- block frame ----
def theta(P):
    c = list(P.exterior.coords); w = []; a = []
    for (x0, y0), (x1, y1) in zip(c, c[1:]):
        w.append(math.hypot(x1 - x0, y1 - y0)); a.append(math.atan2(y1 - y0, x1 - x0) * 4)
    w, a = np.array(w), np.array(a)
    return math.degrees(math.atan2((w * np.sin(a)).sum(), (w * np.cos(a)).sum()) / 4)

def rectilinear(P, jog):
    """Axis-align a nearly rectilinear polygon and remove jogs shorter than `jog`."""
    c = list(P.exterior.coords)[:-1]; n = len(c)
    cls = ['H' if abs(c[(i + 1) % n][0] - c[i][0]) >= abs(c[(i + 1) % n][1] - c[i][1]) else 'V' for i in range(n)]
    # merge runs of the same class into one line with a mean coordinate
    runs = []  # (cls, coord)
    i0 = 0
    while i0 < n and cls[i0] == cls[i0 - 1]: i0 += 1     # start at a class change
    i = i0
    for _ in range(n):
        j = i; pts = [c[i]]
        while cls[(j + 1) % n] == cls[i] and (j + 1) % n != i0:
            j = (j + 1) % n; pts.append(c[j])
        pts.append(c[(j + 1) % n])
        vals = [p[1] if cls[i] == 'H' else p[0] for p in pts]
        runs.append([cls[i], sum(vals) / len(vals)])
        i = (j + 1) % n
        if i == i0: break
    # corners: between consecutive lines (alternating H/V)
    def corners(runs):
        cs = []
        for i in range(len(runs)):
            a, b = runs[i - 1], runs[i]
            cs.append([a[1], b[1]] if a[0] == 'V' else [b[1], a[1]])
        return cs
    cs = corners(runs)
    # drop jogs: edge i runs cs[i] -> cs[i+1]; a short one is replaced by merging its
    # two (parallel) neighbours at a length-weighted mean
    while len(cs) > 4:
        k = len(cs)
        def L(i):
            p, q = cs[i], cs[(i + 1) % k]
            return abs(q[0] - p[0]) + abs(q[1] - p[1])
        ls = [L(i) for i in range(k)]
        i = int(np.argmin(ls))
        if ls[i] >= jog: break
        horiz = abs(cs[(i + 1) % k][0] - cs[i][0]) >= abs(cs[(i + 1) % k][1] - cs[i][1])
        ax = 0 if horiz else 1            # the short edge runs along this axis, so the
        # neighbours are perpendicular to it and share the OTHER coordinate after merging
        la, lb = ls[i - 1], ls[(i + 1) % k]
        pa = cs[i][ax]; pb = cs[(i + 1) % k][ax]
        m = (pa * la + pb * lb) / (la + lb) if la + lb else (pa + pb) / 2
        for j in (i - 1, i, (i + 1) % k, (i + 2) % k): cs[j][ax] = m
        for j in sorted({i, (i + 1) % k}, reverse=True): cs.pop(j)
    return Polygon([tuple(p) for p in cs]).buffer(0)

def r2(v): return round(v, 2)
def grow(rects, hull, i):
    """Move each edge of rect i onto the hull or a neighbour if one is within REACH."""
    x0, y0, x1, y1 = rects[i].bounds
    others = unary_union([r for j, r in enumerate(rects) if j != i])
    outside = box(*hull.bounds).buffer(REACH + 2).difference(hull)
    obst = unary_union([others, outside])
    def reach(corridor, edge):
        hit = obst.intersection(corridor)
        if hit.is_empty or hit.area < 1e-9: return 0.0
        return r2(hit.distance(edge))          # exact gap to the nearest obstacle
    nx1 = x1 + reach(box(x1, y0, x1 + REACH, y1), shapely.LineString([(x1, y0), (x1, y1)]))
    nx0 = x0 - reach(box(x0 - REACH, y0, x0, y1), shapely.LineString([(x0, y0), (x0, y1)]))
    ny1 = y1 + reach(box(x0, y1, x1, y1 + REACH), shapely.LineString([(x0, y1), (x1, y1)]))
    ny0 = y0 - reach(box(x0, y0 - REACH, x1, y0), shapely.LineString([(x0, y0), (x1, y0)]))
    return box(r2(nx0), r2(ny0), r2(nx1), r2(ny1))

new = {}; labels = {}; report = {}; new_blocks = {}
for fl, units in floors.items():
    byblock = {}
    for k, v in units.items(): byblock.setdefault(int(k.split('-')[1]), {})[k] = v
    for n, us in sorted(byblock.items()):
        B = blocks['block-' + LETTERS[n - 1]]
        th = theta(B)
        # wall coordinates within 0.6 of each other are the same wall: cluster them
        # (a hull coordinate anchors its cluster), so no micro-jogs remain
        def cluster(vals, anchors, tol=0.6):
            vals = sorted(set(vals) | set(anchors)); groups = [[vals[0]]]
            for v in vals[1:]:
                if v - groups[-1][-1] <= tol and v - groups[-1][0] <= 2 * tol: groups[-1].append(v)
                else: groups.append([v])
            m = {}
            for g in groups:
                anch = [v for v in g if v in anchors]
                target = anch[0] if anch else r2(sum(g) / len(g))
                for v in g: m[v] = target
            return m
        Br = rectilinear(affinity.rotate(B, -th, origin=(0, 0)), JOG)
        hc = [(r2(x), r2(y)) for x, y in Br.exterior.coords]
        cx = cluster([x for x, y in hc], set()); cy = cluster([y for x, y in hc], set())
        Br = Polygon([(cx[x], cy[y]) for x, y in hc]).buffer(0)
        assert Br.geom_type == 'Polygon', n
        # the block outline the page draws is the cleaned hull too, so the plots'
        # outer walls and the block stroke are one line (the painted background
        # differs from it by under 2.5 plan units - about a pixel)
        Hb = affinity.rotate(Br, th, origin=(0, 0))
        new_blocks['block-' + LETTERS[n - 1]] = Polygon([(round(x, 2), round(y, 2)) for x, y in Hb.exterior.coords])
        names = sorted(us)
        rects = [box(*[r2(v) for v in affinity.rotate(us[k], -th, origin=(0, 0)).bounds]) for k in names]
        # 4. overlaps: split down the middle of the overlap's thinner side
        for _ in range(10):
            moved = False
            for i, j in itertools.combinations(range(len(rects)), 2):
                inter = rects[i].intersection(rects[j])
                if inter.area < 1e-6: continue
                ix0, iy0, ix1, iy1 = inter.bounds
                a, b = rects[i].bounds, rects[j].bounds
                if (ix1 - ix0) <= (iy1 - iy0):          # side by side: vertical wall
                    mid = r2((ix0 + ix1) / 2)
                    if a[0] < b[0]: rects[i] = box(a[0], a[1], mid, a[3]); rects[j] = box(mid, b[1], b[2], b[3])
                    else:           rects[j] = box(b[0], b[1], mid, b[3]); rects[i] = box(mid, a[1], a[2], a[3])
                else:                                    # stacked: horizontal wall
                    mid = r2((iy0 + iy1) / 2)
                    if a[1] < b[1]: rects[i] = box(a[0], a[1], a[2], mid); rects[j] = box(b[0], mid, b[2], b[3])
                    else:           rects[j] = box(b[0], b[1], b[2], mid); rects[i] = box(a[0], mid, a[2], a[3])
                moved = True
            if not moved: break
        # 5. grow onto the hull / neighbours (two passes so chains settle)
        for _ in range(2):
            for i in range(len(rects)): rects[i] = grow(rects, Br, i)
        hx = {r2(x) for x, y in Br.exterior.coords}; hy = {r2(y) for x, y in Br.exterior.coords}
        mx = cluster([r2(v) for r in rects for v in (r.bounds[0], r.bounds[2])], hx, WALL)
        my = cluster([r2(v) for r in rects for v in (r.bounds[1], r.bounds[3])], hy, WALL)
        rects = [box(mx[r2(r.bounds[0])], my[r2(r.bounds[1])], mx[r2(r.bounds[2])], my[r2(r.bounds[3])]) for r in rects]
        # 6. clip, snap to grid
        polys = []
        for r in rects:
            P = shapely.set_precision(r.intersection(Br), G)
            if P.geom_type != 'Polygon': P = max([g for g in P.geoms if g.geom_type == 'Polygon'], key=lambda g: g.area)
            polys.append(P)
        # T-junctions: a neighbour's corner that sits on one of my walls becomes a
        # vertex of mine too, so after rotation both rings pass through the same
        # rounded point and the shared wall is one line. Done on the grid, by hand:
        # everything here is axis-aligned and snapped to G already.
        def clean(ring):
            out = []
            for p in ring:
                if not out or abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) > 0.05: out.append(p)
            if len(out) > 1 and abs(out[0][0] - out[-1][0]) + abs(out[0][1] - out[-1][1]) <= 0.05: out.pop()
            return out
        rings = [clean(list(P.exterior.coords)[:-1]) for P in polys]
        corners_all = sorted({c for r in rings for c in r} | set(clean(list(Br.exterior.coords)[:-1])))
        for i, r in enumerate(rings):
            outr = []
            for a, b in zip(r, r[1:] + r[:1]):
                outr.append(a)
                if abs(a[0] - b[0]) < 1e-9:   # vertical wall x = a[0]
                    lo, hi = sorted((a[1], b[1]))
                    ts = [c for c in corners_all if abs(c[0] - a[0]) < 1e-9 and lo + 0.05 < c[1] < hi - 0.05]
                    ts.sort(key=lambda c: c[1], reverse=(a[1] > b[1]))
                else:                          # horizontal wall y = a[1]
                    lo, hi = sorted((a[0], b[0]))
                    ts = [c for c in corners_all if abs(c[1] - a[1]) < 1e-9 and lo + 0.05 < c[0] < hi - 0.05]
                    ts.sort(key=lambda c: c[0], reverse=(a[0] > b[0]))
                outr.extend(ts)
            rings[i] = outr
        for k, ring in zip(names, rings):
            Q = affinity.rotate(Polygon(ring), th, origin=(0, 0))
            Q = Polygon([(round(x, 2), round(y, 2)) for x, y in Q.exterior.coords])
            assert Q.is_valid, k
            new[k] = Q
            c = Q.centroid
            if not Q.contains(c): c = Q.representative_point()
            labels[k] = (c.x, c.y)
            report[k] = {'old_area': round(us[k].area), 'new_area': round(Q.area),
                         'moved': round(Q.symmetric_difference(us[k]).area)}

def sub_poly(m):
    k = m.group(1)
    return f'<polygon id="{k}" points="{fmt(new[k])}"' if k in new else m.group(0)
out = re.sub(r'<polygon id="(unit-[^"]+)" points="[^"]+"', sub_poly, svg)
out = re.sub(r'<polygon id="(block-[a-l])" points="[^"]+"',
             lambda m: f'<polygon id="{m.group(1)}" points="{fmt(new_blocks[m.group(1)])}"' if m.group(1) in new_blocks else m.group(0), out)
def sub_label(m):
    k = m.group(1)
    if k not in labels: return m.group(0)
    x, y = labels[k]
    return f'{m.group(0).split(" x=")[0]} x="{x:.1f}" y="{y:.1f}"'
out = re.sub(r'<text class="site-plan_unit-label" data-for="(unit-[^"]+)" x="[^"]+" y="[^"]+"', sub_label, out)
open(dst, 'w').write(out)
json.dump(report, open('refine-report.json', 'w'), indent=1)

# ---- verify from the written geometry ----
for fl in sorted(floors):
    ks = list(floors[fl]); worst = 0; pairs = 0; outside = 0; angles = []
    for a, b in itertools.combinations(ks, 2):
        if new[a].intersects(new[b]):
            i = new[a].intersection(new[b]).area
            if i > 0: pairs += 1; worst = max(worst, i)
    for k in ks:
        B = blocks['block-' + LETTERS[int(k.split('-')[1]) - 1]]
        outside += new[k].difference(B.buffer(JOG)).area
        c = list(new[k].exterior.coords)
        for i in range(len(c) - 1):
            p, q, r = c[i - 1], c[i], c[i + 1]
            v1 = (p[0] - q[0], p[1] - q[1]); v2 = (r[0] - q[0], r[1] - q[1])
            l1, l2 = math.hypot(*v1), math.hypot(*v2)
            if l1 > 1 and l2 > 1:
                ang = math.degrees(math.acos(max(-1, min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))))
                if abs(ang - 180) > 0.5: angles.append(ang)
    off = [round(a, 1) for a in angles if abs(a - 90) > 0.5]
    print(f'floor {fl}: {len(ks)} units, overlapping pairs {pairs} (worst {worst:.3f}), beyond hull+{JOG:.0f} {outside:.2f}, corners {len(angles)}, not 90deg: {off[:6]}')
moved = sorted(report.items(), key=lambda kv: -kv[1]['moved'])[:6]
print('most changed:', [(k, v['moved']) for k, v in moved])
print('written', dst, len(out), 'bytes')
