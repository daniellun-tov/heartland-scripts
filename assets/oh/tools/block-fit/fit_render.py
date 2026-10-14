"""Fit each block type's floor-plan outline onto its 3D render's floor bands.

Inputs (scratch/blk): pos_geo.json (unit polygons per position in the 1104x1093 drawing frame),
fh-<block>-<floor>-<render>-<f>.svg floor-band overlays (860x640 frame on the 1356x1026 render).
Output: block_geo.json with, per render type: hull polygon (drawing frame), unit polygons per
position, and per floor the isometric transform (phi, theta, psi, k, tx, ty) drawing px -> render px
(1356x1026 frame).
"""
import json, re, sys, math
import numpy as np
from shapely.geometry import Polygon, box, LineString, Point
from shapely.ops import unary_union
from scipy.optimize import minimize, differential_evolution

geo = json.load(open('pos_geo.json'))
RENDERS = {  # render type -> (drawing type, a block that carries this render, floor svg prefix)
    'a1': ('a', 'E'), 'a2': ('a', 'A'), 'a3': ('a', 'K'), 'b1': ('b1', 'B'), 'b2': ('b2', 'C'),
}
RW, RH = 1356, 1026
SX, SY = RW / 860, RH / 640

def parse_path(d):
    toks = re.findall(r'[MLHVZmlhvz]|-?[\d.]+(?:e-?\d+)?', d); out = []; i = 0; cmd = None; x = y = 0
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t; i += 1; continue
        if cmd in 'ML': x = float(t); y = float(toks[i + 1]); i += 2
        elif cmd == 'H': x = float(t); i += 1
        elif cmd == 'V': y = float(t); i += 1
        elif cmd in 'ml': x += float(t); y += float(toks[i + 1]); i += 2; cmd = 'l'
        elif cmd == 'h': x += float(t); i += 1
        elif cmd == 'v': y += float(t); i += 1
        else: i += 1; continue
        out.append((x, y))
    return out

def band_polys(block, floor):
    import glob
    f = glob.glob(f'fh-{block}-{floor}-*.svg')[0]
    s = open(f).read()
    return [Polygon(parse_path(d)) for d in re.findall(r' d="([^"]+)"', s)]

def lower_envelope(poly, n=60):
    """samples of the polygon's lower boundary (max y per x), in render px"""
    minx, miny, maxx, maxy = poly.bounds
    pts = []
    for x in np.linspace(minx + 0.5, maxx - 0.5, n):
        line = LineString([(x, miny - 1), (x, maxy + 1)])
        inter = poly.exterior.intersection(line)
        ys = []
        if inter.is_empty: continue
        for g in getattr(inter, 'geoms', [inter]):
            ys.append(g.y if isinstance(g, Point) else max(c[1] for c in g.coords))
        pts.append((x * SX, max(ys) * SY))
    return pts

def drawing_hull(typ):
    polys = [box(*Polygon(p).bounds) for p in geo[typ].values()]
    u = unary_union(polys)
    minx, miny, maxx, maxy = u.bounds
    # the core + courtyard: everything between the left and right columns below the top bar
    cols = sorted(polys, key=lambda p: p.centroid.x)
    # top bar = polygons whose top is near miny
    top = [p for p in polys if p.bounds[1] < miny + 0.25 * (maxy - miny)]
    topbot = max(p.bounds[3] for p in top)
    left = [p for p in polys if p.bounds[2] < (minx + maxx) / 2 and p not in top]
    right = [p for p in polys if p.bounds[0] > (minx + maxx) / 2 and p not in top]
    lx = max(p.bounds[2] for p in left); rx = min(p.bounds[0] for p in right)
    frac = {'a': 0.56, 'b1': 0.46, 'b2': 0.46}[typ]
    colbot = max(p.bounds[3] for p in left + right)
    core = box(lx - 2, topbot - 2, rx + 2, topbot + frac * (colbot - topbot))
    hull = unary_union([u, core]).buffer(6, join_style=2).buffer(-6, join_style=2).simplify(5.0)
    if hull.geom_type != 'Polygon': hull = max(hull.geoms, key=lambda g: g.area)
    return hull

def tf(params, P):
    phi, th, psi, k, tx, ty = params
    c, s = math.cos(psi), math.sin(psi)
    R = np.array([[c, -s], [s, c]])
    D = np.diag([1, math.cos(th)])
    c2, s2 = math.cos(phi), math.sin(phi)
    R2 = np.array([[c2, -s2], [s2, c2]])
    L = k * (R2 @ D @ R)
    return (L @ np.asarray(P).T).T + np.array([tx, ty])

def env_y(H, xs):
    """lower envelope of polygon H (max y) at each x; nan where outside"""
    P = np.asarray(H); n = len(P); out = np.full(len(xs), np.nan)
    for i in range(n):
        (x1, y1), (x2, y2) = P[i], P[(i + 1) % n]
        if x1 == x2: continue
        lo, hi = min(x1, x2), max(x1, x2)
        m = (xs >= lo) & (xs <= hi)
        if not m.any(): continue
        y = y1 + (xs[m] - x1) * (y2 - y1) / (x2 - x1)
        cur = out[m]; out[m] = np.where(np.isnan(cur), y, np.maximum(cur, y))
    return out

def cost(params, hullP, samples):
    if not (0.6 < params[1] < 1.25) or params[3] <= 0 or abs(params[0]) > 0.45: return 1e9
    H = tf(params, hullP)
    S = np.asarray(samples)
    ye = env_y(H, S[:, 0])
    d = np.where(np.isnan(ye), 300.0, np.abs(S[:, 1] - ye))
    ex = (H[:, 0].min() - S[:, 0].min()) ** 2 + (H[:, 0].max() - S[:, 0].max()) ** 2
    return float(np.mean(np.square(d)) + 0.5 * ex)

def fit_render(rt):
    typ, blk = RENDERS[rt]
    hull = drawing_hull(typ)
    hullP = np.array(hull.exterior.coords)[:-1]
    cen = hullP.mean(0)
    hullC = hullP - cen
    bands = band_polys(blk, 1)
    samples = []
    for b in bands: samples += lower_envelope(b)
    S = np.array(samples)
    best = None
    bw = S[:, 0].max() - S[:, 0].min()
    for psi in np.arange(0, 2 * math.pi, math.pi / 18):
        for th in (math.radians(50), math.radians(60)):
            test = tf([0, th, psi, 1, 0, 0], hullC)
            hw = test[:, 0].max() - test[:, 0].min()
            k0 = bw / hw
            x0 = [0, th, psi, k0, S[:, 0].mean(), S[:, 1].mean() - 0.35 * (S[:, 1].max() - S[:, 1].min())]
            r = minimize(cost, x0, args=(hullC, S), method='Powell', options={'maxiter': 3000, 'xtol': 1e-3, 'ftol': 1e-5})
            if best is None or r.fun < best.fun: best = r
    print(rt, 'best cost', round(best.fun, 1), file=sys.stderr)
    p = best.x
    # per-floor translation refit with the linear part fixed
    floors = {}
    for fl in (1, 2, 3, 4):
        bands = band_polys(blk, fl)
        samples = []
        for b in bands: samples += lower_envelope(b)
        Sf = np.array(samples)
        def c2(t): return cost([p[0], p[1], p[2], p[3], t[0], t[1]], hullC, Sf)
        r = minimize(c2, [p[4], p[5]], method='Powell', options={'xtol': 1e-3})
        floors[fl] = {'tx': float(r.x[0]), 'ty': float(r.x[1]), 'rms': float(math.sqrt(r.fun))}
    return hull, hullC, cen, p, floors

out = {}
for rt in RENDERS:
    hull, hullC, cen, p, floors = fit_render(rt)
    typ = RENDERS[rt][0]
    out[rt] = {
        'drawing': typ,
        'hull': [[round(x, 1), round(y, 1)] for x, y in np.array(hull.exterior.coords)[:-1]],
        'centre': [round(cen[0], 1), round(cen[1], 1)],
        'phi': float(p[0]), 'theta': float(p[1]), 'psi': float(p[2]), 'k': float(p[3]),
        'floors': floors,
    }
    print(rt, 'phi %.2f theta %.1f psi %.1f k %.4f' % (math.degrees(p[0]), math.degrees(p[1]), math.degrees(p[2]), p[3]),
          {f: round(v['rms'], 1) for f, v in floors.items()}, file=sys.stderr)
json.dump(out, open('block_fit.json', 'w'), indent=1)
