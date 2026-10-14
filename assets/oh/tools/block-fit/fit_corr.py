"""Correspondence fit: the band-bottom corner chain (left->right) matches a contiguous run of
hull vertices under an affine map. Try every start index and both directions, solve least
squares, keep the best. Floors 2-4 refit translation only."""
import json, re, sys, math, glob
import numpy as np
from shapely.geometry import Polygon
exec(open('fit_render.py').read().split('def fit_render(rt):')[0])

def chain_of(bands):
    pts = []
    for b in bands:
        P = np.array(b.exterior.coords)[:-1] * [SX, SY]
        env = env_y(P, P[:, 0])
        keep = [tuple(p) for p, e in zip(P, env) if abs(p[1] - e) < 1.0]
        pts += keep
    pts.sort()
    # merge near-duplicates (the wings' paths overlap/gap at the junction)
    out = []
    for p in pts:
        if out and math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) < 18:
            out[-1] = ((out[-1][0] + p[0]) / 2, (out[-1][1] + p[1]) / 2)
        else:
            out.append(p)
    return np.array(out)

def affine_ls(src, dst):
    A = []; b = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0]); b.append(u)
        A.append([0, 0, 0, x, y, 1]); b.append(v)
    m, *_ = np.linalg.lstsq(np.array(A), np.array(b), rcond=None)
    r = np.array(A) @ m - np.array(b)
    return m, math.sqrt(np.mean(r ** 2))

def apply(m, P):
    P = np.asarray(P); return np.c_[m[0] * P[:, 0] + m[1] * P[:, 1] + m[2], m[3] * P[:, 0] + m[4] * P[:, 1] + m[5]]

def fit(rt, tol):
    typ, blk = RENDERS[rt]
    hull = drawing_hull(typ).simplify(tol)
    H = np.array(hull.exterior.coords)[:-1]
    n = len(H)
    chain = chain_of(band_polys(blk, 1))
    K = len(chain)
    best = None
    for direction in (1, -1):
        seq = H if direction == 1 else H[::-1]
        for s in range(n):
            idx = [(s + i) % n for i in range(K)]
            src = seq[idx]
            m, rms = affine_ls(src, chain)
            # reject mirrored / degenerate maps
            det = m[0] * m[4] - m[1] * m[3]
            if det <= 0: continue
            if best is None or rms < best[1]: best = (m, rms, direction, s)
    m, rms, direction, s = best
    floors = {1: {'m': m.tolist(), 'rms': rms}}
    for fl in (2, 3, 4):
        ch = chain_of(band_polys(blk, fl))
        seq = H if direction == 1 else H[::-1]
        idx = [(s + i) % n for i in range(len(ch))]
        if len(ch) != K:
            # fall back: translation by the median shift of the chain
            d = np.median(ch[:min(len(ch), K)] - chain[:min(len(ch), K)], axis=0)
            mm = m.copy(); mm[2] += d[0]; mm[5] += d[1]; floors[fl] = {'m': mm.tolist(), 'rms': float('nan')}
            continue
        src = apply(m, seq[idx])
        d = np.mean(ch - src, axis=0)
        mm = m.copy(); mm[2] += d[0]; mm[5] += d[1]
        r = apply(mm, seq[idx]) - ch
        floors[fl] = {'m': mm.tolist(), 'rms': float(math.sqrt(np.mean(r ** 2)))}
    return hull, floors, K, n

out = {}
for rt in RENDERS:
    res = None
    for tol in (6, 10, 14, 20):
        hull, floors, K, n = fit(rt, tol)
        if res is None or floors[1]['rms'] < res[1][1]['rms']: res = (hull, floors, K, n, tol)
    hull, floors, K, n, tol = res
    print(rt, 'chain', K, 'hull', n, 'tol', tol, {f: round(v['rms'], 1) for f, v in floors.items()}, file=sys.stderr)
    out[rt] = {'drawing': RENDERS[rt][0], 'hull': [[round(x, 1), round(y, 1)] for x, y in np.array(hull.exterior.coords)[:-1]],
               'floors': {f: v['m'] for f, v in floors.items()}}
json.dump(out, open('block_fit2.json', 'w'), indent=1)
