"""Affine fit of the drawing hull onto each render's ground-floor bands.
Init: every hull-vertex triple mapped to (first, middle, last) band-chain corner; score with the
lower-envelope cost; polish the best few with Powell. Floors 2-4: translation refit."""
import json, sys, math, itertools
import numpy as np
from scipy.optimize import minimize
exec(open('fit_corr.py').read().split('def fit(rt, tol):')[0])

def acost(m, H, S, xr=None):
    L = np.array([[m[0], m[1]], [m[3], m[4]]])
    U, sv, Vt = np.linalg.svd(L)
    ratio = sv[1] / sv[0]
    phi = abs(math.degrees(math.atan2(U[1, 0], U[0, 0]))) % 180
    phi = min(phi, 180 - phi)
    pen = 0.0
    if ratio < 0.5: pen += (0.5 - ratio) * 1e5
    if ratio > 0.66: pen += (ratio - 0.66) * 1e5
    if phi > 4: pen += (phi - 4) * 2000
    P = apply(m, H)
    ye = env_y(P, S[:, 0])
    d = np.where(np.isnan(ye), 300.0, np.abs(S[:, 1] - ye))
    x0, x1 = xr if xr else (S[:, 0].min(), S[:, 0].max())
    ex = (P[:, 0].min() - x0) ** 2 + (P[:, 0].max() - x1) ** 2
    return float(np.mean(np.square(d)) + 0.5 * ex + pen)

def solve3(src, dst):
    A = []; b = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0]); b.append(u)
        A.append([0, 0, 0, x, y, 1]); b.append(v)
    try: return np.linalg.solve(np.array(A), np.array(b))
    except np.linalg.LinAlgError: return None

def fit(rt):
    typ, blk = RENDERS[rt]
    hull = drawing_hull(typ)
    H = np.array(hull.exterior.coords)[:-1]
    n = len(H)
    bands = band_polys(blk, 1)
    allS = np.array(sum([lower_envelope(b, 80) for b in bands], [])); xr = (allS[:, 0].min(), allS[:, 0].max())
    if rt == 'a3': bands = [b for b in bands if b.centroid.x * SX > 540]
    S = np.array(sum([lower_envelope(b, 80) for b in bands], []))
    chain = chain_of(bands)
    dst = np.array([chain[0], chain[len(chain) // 2], chain[-1]])
    cands = []
    for i, j, k in itertools.permutations(range(n), 3):
        m = solve3(H[[i, j, k]], dst)
        if m is None: continue
        det = m[0] * m[4] - m[1] * m[3]
        if det <= 0: continue
        sc = math.sqrt(det)
        if not (0.25 < sc < 1.5): continue
        cands.append((acost(m, H, S, xr), m))
    cands.sort(key=lambda c: c[0])
    best = None
    for c0, m0 in cands[:30]:
        r = minimize(acost, m0, args=(H, S, xr), method='Powell', options={'maxiter': 4000, 'xtol': 1e-3, 'ftol': 1e-6})
        if best is None or r.fun < best.fun: best = r
    m = best.x
    floors = {1: {'m': m.tolist(), 'cost': float(best.fun)}}
    for fl in (2, 3, 4):
        bf = band_polys(blk, fl)
        if rt == 'a3': bf = [b for b in bf if b.centroid.x * SX > 540]
        Sf = np.array(sum([lower_envelope(b, 80) for b in bf], []))
        def c2(t):
            mm = m.copy(); mm[2] = t[0]; mm[5] = t[1]; return acost(mm, H, Sf, xr)
        r = minimize(c2, [m[2], m[5]], method='Powell', options={'xtol': 1e-3})
        mm = m.copy(); mm[2] = r.x[0]; mm[5] = r.x[1]
        floors[fl] = {'m': mm.tolist(), 'cost': float(r.fun)}
    return hull, floors

out = {}
for rt in RENDERS:
    hull, floors = fit(rt)
    print(rt, {f: round(math.sqrt(v['cost']), 1) for f, v in floors.items()}, file=sys.stderr)
    out[rt] = {'drawing': RENDERS[rt][0], 'hull': [[round(x, 1), round(y, 1)] for x, y in np.array(hull.exterior.coords)[:-1]],
               'floors': {f: [round(v, 5) for v in fl['m']] for f, fl in floors.items()}}
json.dump(out, open('block_fit3.json', 'w'), indent=1)
