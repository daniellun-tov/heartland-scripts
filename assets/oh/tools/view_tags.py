#!/usr/bin/env python3
"""Derive oh_units.view_tags from the site plan geometry.

Why this exists: the developer's data gives every unit a compass orientation
(NE / SE / SW / NW) but nothing about what it can actually see. This works the
rest out from the plan drawing, so the tags are reproducible rather than
hand-typed, and re-runnable when the plan or the unit list changes.

How it works
------------
1. Plan rotation. The site plan is drawn rotated. Solve for the rotation by
   taking, for every unit, the direction from its block's centroid to its own
   centroid (which is the facade it faces, in plan space) and finding the angle
   that makes the nearest of {NE, SE, SW, NW} agree with the unit's recorded
   orientation for as many units as possible. The fit is exact for all 302
   units over a 3 deg plateau; the midpoint is used:

       compass bearing = plan bearing + 348 deg          (plan-up = 348 deg true)

2. Line of sight. For each unit x each view, skip the view if it falls more
   than 67.5 deg off the facade normal (past that it is behind the wall). Then
   cast rays from the unit's centroid towards the view's true bearing at
   -12 / 0 / +12 deg and see whether any other block's footprint is in the way.
   Floors 1-2 need the centre ray clear; floors 3-4 need only one of the three,
   which is how a unit sees a peak obliquely past the corner of the block in
   front of it.

3. MIN_FLOOR holds views that need height regardless (Drakenstein is 20 km of
   horizon over the vineyards - not a ground-floor view).

The bearings in VIEWS were measured from the site centre (-33.9010, 18.8460 -
Welgevonden Boulevard and Lang Road, Stellenbosch) to each landmark:
Simonsberg -33.884046/18.927082, Stellenbosch Mountain -33.96778/18.90389,
Helderberg Dome -34.03085/18.880231, Paarl Rock -33.74045/18.949199.

Usage: python3 view_tags.py path/to/oh-site-plan.svg units.json > tags.json
where units.json is the GET /units response. The output maps unit id -> tags,
ready for a bulk patch of oh_units.view_tags.
"""
import collections
import json
import math
import re
import sys

ROTATION = 348.0          # compass = plan bearing + ROTATION
ARC = 67.5                # half the field of view from a facade
REACH = 1100              # ray length in plan units (the plan is 1690 x 1490)
SAMPLES = (-12, 0, 12)
MIN_FLOOR = {'drakenstein': 3}

VIEWS = {                 # oh_views.key -> true bearing from the site centre
    'simonsberg': 75.9,
    'stellenbosch_mountain': 144.3,
    'helderberg': 167.7,
    'drakenstein': 28.1,
    'bottelary': 278.8,
    'vineyards': 10.0,    # the whole northern boundary, over Welgevonden Blvd
}
ORIENTATION = {'NE': 45, 'SE': 135, 'SW': 225, 'NW': 315}


def points(raw):
    n = [float(x) for x in re.findall(r'-?\d+\.?\d*', raw)]
    return list(zip(n[0::2], n[1::2]))


def centroid(ps):
    """Area-weighted, so an L-shaped plot does not pull towards its long leg."""
    a = cx = cy = 0.0
    for i in range(len(ps)):
        x0, y0 = ps[i]
        x1, y1 = ps[(i + 1) % len(ps)]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(a) < 1e-9:
        return (sum(p[0] for p in ps) / len(ps), sum(p[1] for p in ps) / len(ps))
    a *= 0.5
    return (cx / (6 * a), cy / (6 * a))


def load_plan(path):
    svg = open(path).read()
    poly, cent = {}, {}
    for m in re.finditer(r'<polygon[^>]*id="([^"]+)"[^>]*points="([^"]+)"', svg):
        poly[m.group(1)] = points(m.group(2))
        cent[m.group(1)] = centroid(poly[m.group(1)])
    blocks = {k: v for k, v in poly.items() if k.startswith('block-')}
    return cent, blocks


def solve_rotation(cent, blocks, units):
    """Recompute the rotation from the data; a sanity check on ROTATION."""
    rows = []
    for u in units:
        pid, bid = u['plot_id'], u['block_plot_id']
        o = (u.get('orientation') or '').upper()
        if pid not in cent or bid not in cent or o not in ORIENTATION:
            continue
        dx = cent[pid][0] - cent[bid][0]
        dy = cent[pid][1] - cent[bid][1]
        if dx or dy:
            rows.append((math.degrees(math.atan2(dx, -dy)) % 360, o))
    best, plateau = (0, -1), []
    for tenths in range(3600):
        r = tenths / 10
        def nearest(p):
            return min(ORIENTATION, key=lambda k: angle_between(ORIENTATION[k], p + r))
        ok = sum(1 for p, o in rows if nearest(p) == o)
        if ok > best[1]:
            best, plateau = (r, ok), [r]
        elif ok == best[1]:
            plateau.append(r)
    return best, (min(plateau), max(plateau)), len(rows)


def blocked(origin, compass, own_block, blocks):
    """Distance along the ray to the nearest other block, or None if clear."""
    plan = math.radians((compass - ROTATION) % 360)
    dx, dy = math.sin(plan), -math.cos(plan)
    end = (origin[0] + dx * REACH, origin[1] + dy * REACH)
    nearest = None
    for bid, ps in blocks.items():
        if bid == own_block:
            continue
        for i in range(len(ps)):
            p3, p4 = ps[i], ps[(i + 1) % len(ps)]
            den = (end[0] - origin[0]) * (p4[1] - p3[1]) - (end[1] - origin[1]) * (p4[0] - p3[0])
            if abs(den) < 1e-12:
                continue
            t = ((p3[0] - origin[0]) * (p4[1] - p3[1]) - (p3[1] - origin[1]) * (p4[0] - p3[0])) / den
            s = ((p3[0] - origin[0]) * (end[1] - origin[1]) - (p3[1] - origin[1]) * (end[0] - origin[0])) / den
            if 0 < t <= 1 and 0 <= s <= 1 and (nearest is None or t < nearest):
                nearest = t
    return None if nearest is None else nearest * REACH


def angle_between(a, b):
    return abs(((a - b + 180) % 360) - 180)


def derive(cent, blocks, units):
    out = {}
    for u in units:
        pid, bid = u['plot_id'], u['block_plot_id']
        o = (u.get('orientation') or '').upper()
        if pid not in cent or bid not in blocks or o not in ORIENTATION:
            out[u['id']] = []
            continue
        facade, floor, tags = ORIENTATION[o], u['floor_level'], []
        for key, bearing in VIEWS.items():
            if angle_between(bearing, facade) > ARC:
                continue
            clear = [blocked(cent[pid], bearing + d, bid, blocks) is None for d in SAMPLES]
            seen = clear[SAMPLES.index(0)] if floor <= 2 else any(clear)
            if seen and floor >= MIN_FLOOR.get(key, 0):
                tags.append(key)
        out[u['id']] = sorted(tags, key=list(VIEWS).index)
    return out


def main():
    plan_path, units_path = sys.argv[1], sys.argv[2]
    cent, blocks = load_plan(plan_path)
    units = json.load(open(units_path))
    (r, agree), window, n = solve_rotation(cent, blocks, units)
    print('rotation %.1f deg, %d/%d units agree, exact over %.1f-%.1f (using %.1f)'
          % (r, agree, n, window[0], window[1], ROTATION), file=sys.stderr)
    tags = derive(cent, blocks, units)
    per = collections.Counter(t for v in tags.values() for t in v)
    print('units per view: %s' % dict(per), file=sys.stderr)
    print('untagged (interior outlook only): %d' % sum(1 for v in tags.values() if not v), file=sys.stderr)
    json.dump({str(k): v for k, v in tags.items()}, sys.stdout, indent=1)


if __name__ == '__main__':
    main()
