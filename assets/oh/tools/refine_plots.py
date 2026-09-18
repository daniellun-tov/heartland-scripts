#!/usr/bin/env python3
"""refine_plots.py - re-cut the unit plots so they tile each block cleanly.

The unit shapes came from fitting v1's per-unit highlight SVGs onto the
plan; the fit is close but neighbours overlap along shared walls (31 pairs
per floor, up to 20% of a unit) and every unit over- or under-shoots the
block outline the background paints. This re-partitions each block hull
among its units:

  fillable = block hull - core          core = the big residual region that
                                        no unit claims (stairs/lifts/corridor)
  unit_i'  = { p in fillable : unit_i is the nearest unit to p }

"nearest" is measured to each unit eroded by ~1.5 plan units, so an overlap
strip is split down its middle rather than handed to whichever unit comes
first, and gaps between a unit and the outline are absorbed by the unit
beside them. Done on a 4x raster per block, vectorised, simplified to 0.5
plan units. Labels are re-centred on the new shapes. Parking (floor 0),
blocks and features are untouched.

  python3 refine_plots.py in.svg out.svg
"""
import re, sys, json
import numpy as np
import shapely
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage import measure
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely.validation import make_valid

S = 4            # raster scale (px per plan unit)
ERODE = 6        # px at scale S = 1.5 plan units
CORE_MIN = 1000  # plan units^2: residual components at least this big are core
SIMPLIFY = 0.5   # plan units
LETTERS = 'abcdefghijkl'

src, dst = sys.argv[1], sys.argv[2]
svg = open(src).read()

def parse_pts(s):
    return [tuple(map(float, p.split(','))) for p in s.split()]
def to_poly(pts):
    P = Polygon(pts)
    if not P.is_valid: P = make_valid(P)
    if isinstance(P, MultiPolygon) or P.geom_type == 'GeometryCollection':
        polys = [g for g in getattr(P, 'geoms', [P]) if g.geom_type == 'Polygon']
        P = max(polys, key=lambda g: g.area)
    return P
def fmt(P):
    return ' '.join(f'{x:.2f},{y:.2f}'.replace('.00','') for x, y in list(P.exterior.coords)[:-1])

# ---- read blocks and units per floor, straight from the markup ----
blocks = {}
blk_layer = re.search(r'<g data-layer="blocks">(.*?)</g>', svg, re.S).group(1)
for m in re.finditer(r'<polygon id="(block-[a-l])" points="([^"]+)"', blk_layer):
    blocks[m.group(1)] = to_poly(parse_pts(m.group(2)))

floors = {}
for fm in re.finditer(r'<g data-floor="([1-4])">(.*?)(?=<g data-floor=|</svg>)', svg, re.S):
    fl = fm.group(1)
    units = {}
    for m in re.finditer(r'<polygon id="(unit-[^"]+)" points="([^"]+)"', fm.group(2)):
        units[m.group(1)] = to_poly(parse_pts(m.group(2)))
    floors[fl] = units

def draw_mask(geoms, W, H, ox, oy):
    im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im)
    for g in geoms:
        for p in (g.geoms if hasattr(g, 'geoms') else [g]):
            if p.geom_type != 'Polygon' or p.is_empty: continue
            d.polygon([((x - ox) * S, (y - oy) * S) for x, y in p.exterior.coords], fill=255)
            for ring in p.interiors:
                d.polygon([((x - ox) * S, (y - oy) * S) for x, y in ring.coords], fill=0)
    return np.array(im) > 0

def vectorise(mask, ox, oy):
    lab, n = ndimage.label(mask)
    if n == 0: return None, []
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = int(np.argmax(sizes)) + 1
    dropped = [float(s) / (S * S) for i, s in enumerate(sizes, 1) if i != keep]
    m = (lab == keep)
    pad = np.pad(m, 1).astype(float)
    cs = measure.find_contours(pad, 0.5)
    cs.sort(key=lambda c: -len(c))
    ring = [((c - 1) / S + ox, (r - 1) / S + oy) for r, c in cs[0]]
    P = Polygon(ring).buffer(0).simplify(SIMPLIFY, preserve_topology=True)
    if P.geom_type != 'Polygon': P = max(P.geoms, key=lambda g: g.area)
    return P, dropped

new = {}; labels = {}; report = {}
for fl, units in floors.items():
    byblock = {}
    for k, v in units.items(): byblock.setdefault(int(k.split('-')[1]), {})[k] = v
    for n, us in sorted(byblock.items()):
        B = blocks['block-' + LETTERS[n - 1]]
        names = sorted(us)
        U = unary_union([us[k] for k in names])
        resid = B.difference(U)
        # void = the core, plus any compact pocket no unit claims (the shaft
        # between two units at a wing tip, ~150 units^2, which the background
        # paints as its own box) - thin slivers along the outline are NOT void,
        # they are the gaps the units grow into
        def compact(c): return c.area / (c.length ** 2) if c.length else 0
        core = [c for c in getattr(resid, 'geoms', [resid])
                if c.area >= CORE_MIN or (c.area >= 60 and compact(c) >= 0.03)]
        report.setdefault('_voids', {})[f'{fl}/{n}'] = [round(c.area) for c in core]
        minx, miny, maxx, maxy = B.bounds
        ox, oy = int(minx) - 4, int(miny) - 4
        W, H = int((maxx - ox + 4) * S), int((maxy - oy + 4) * S)
        fill = draw_mask([B], W, H, ox, oy) & ~draw_mask(core, W, H, ox, oy)
        dist = []
        for k in names:
            m = draw_mask([us[k]], W, H, ox, oy)
            me = ndimage.binary_erosion(m, iterations=ERODE)
            if not me.any(): me = m
            dist.append(ndimage.distance_transform_edt(~me))
        lab = np.argmin(np.stack(dist), axis=0)
        for i, k in enumerate(names):
            P, dropped = vectorise((lab == i) & fill, ox, oy)
            new[k] = P
            c = P.centroid
            if not P.contains(c): c = P.representative_point()
            labels[k] = (c.x, c.y)
            report[k] = {'old_area': round(us[k].area), 'new_area': round(P.area),
                         'moved': round(P.symmetric_difference(us[k]).area),
                         'dropped_fragments': [round(d) for d in dropped if d > 1]}

# ---- exact cleanup: the per-polygon simplification can leave hairline
# overlaps (< 8 units^2) and excursions past the outline; clip to the block
# and let the earlier unit in id order own any remaining shared sliver ----
import itertools
def biggest(G):
    polys = [g for g in getattr(G, 'geoms', [G]) if g.geom_type == 'Polygon' and not g.is_empty]
    return max(polys, key=lambda g: g.area) if polys else None
for fl, units in floors.items():
    ks = sorted(units)
    G = 0.01   # every set operation on a 0.01 grid, so 2-decimal output is exact
    for k in ks:
        B = shapely.set_precision(blocks['block-' + LETTERS[int(k.split('-')[1]) - 1]], G)
        P = shapely.set_precision(new[k].simplify(0.05, preserve_topology=True), G)
        new[k] = biggest(shapely.intersection(P, B, grid_size=G))
    for a, b in itertools.combinations(ks, 2):
        if new[a].intersects(new[b]) and shapely.intersection(new[a], new[b], grid_size=G).area > 0:
            new[b] = biggest(shapely.difference(new[b], new[a], grid_size=G))
    # shared walls: give both neighbours the same vertex chain, so the two
    # rings coincide exactly instead of by a hundredth (snap adds the other
    # ring's vertices onto this ring's segments when within 0.02)
    for _ in range(2):
        for a, b in itertools.combinations(ks, 2):
            if new[a].distance(new[b]) < 0.05:
                new[a] = shapely.snap(new[a], new[b], 0.02)
                new[b] = shapely.snap(new[b], new[a], 0.02)
    for k in ks:
        new[k] = shapely.set_precision(new[k], G)
        assert new[k].is_valid and new[k].geom_type == 'Polygon', k
    for k in ks:
        c = new[k].centroid
        if not new[k].contains(c): c = new[k].representative_point()
        labels[k] = (c.x, c.y)

# ---- write back: only the points / label positions change ----
def sub_poly(m):
    k = m.group(1)
    return f'<polygon id="{k}" points="{fmt(new[k])}"' if k in new else m.group(0)
out = re.sub(r'<polygon id="(unit-[^"]+)" points="[^"]+"', sub_poly, svg)
def sub_label(m):
    k = m.group(1)
    if k not in labels: return m.group(0)
    x, y = labels[k]
    return f'{m.group(0).split(" x=")[0]} x="{x:.1f}" y="{y:.1f}"'
out = re.sub(r'<text class="site-plan_unit-label" data-for="(unit-[^"]+)" x="[^"]+" y="[^"]+"', sub_label, out)
open(dst, 'w').write(out)
json.dump(report, open('refine-report.json', 'w'), indent=1)

# ---- verify: overlaps and outline fit ----
import itertools
for fl in sorted(floors):
    ks = [k for k in floors[fl]]
    worst = 0; pairs = 0; outside = 0
    for a, b in itertools.combinations(ks, 2):
        if new[a].intersects(new[b]):
            i = new[a].intersection(new[b]).area
            if i > 0: pairs += 1; worst = max(worst, i)
    for k in ks:
        B = blocks['block-' + LETTERS[int(k.split('-')[1]) - 1]]
        outside += new[k].difference(B).area
    print(f'floor {fl}: {len(ks)} units, overlapping pairs {pairs} (worst {worst:.2f}), outside block total {outside:.2f}')
frag = {k: v['dropped_fragments'] for k, v in report.items() if not k.startswith('_') and v['dropped_fragments']}
print('dropped fragments:', frag if frag else 'none')
moved = sorted([kv for kv in report.items() if not kv[0].startswith('_')], key=lambda kv: -kv[1]['moved'])[:8]
print('most changed:', [(k, v['moved']) for k, v in moved])
print('written', dst, len(out), 'bytes (was', len(svg), ')')
