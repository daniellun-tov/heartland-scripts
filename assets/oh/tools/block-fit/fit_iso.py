"""Isometric fit: camera fixed (phi 0, tilt 54.74 deg), building azimuth psi in one of four
quadrants (+-6 deg), scale and translation free. Scored by the lower-envelope cost."""
import json, sys, math
import numpy as np
from scipy.optimize import minimize
exec(open('fit_aff.py').read().split('def solve3(src, dst):')[0])

TH = math.radians(54.74)
def mat(psi, k, tx, ty):
    c, s = math.cos(psi), math.sin(psi)
    L = k * np.array([[1, 0], [0, math.cos(TH)]]) @ np.array([[c, -s], [s, c]])
    return np.array([L[0, 0], L[0, 1], tx, L[1, 0], L[1, 1], ty])

def fit(rt):
    typ, blk = RENDERS[rt]
    hull = drawing_hull(typ)
    H = np.array(hull.exterior.coords)[:-1]
    cen = H.mean(0); Hc = H - cen
    bands = band_polys(blk, 1)
    allS = np.array(sum([lower_envelope(b, 80) for b in bands], [])); xr = (allS[:, 0].min(), allS[:, 0].max())
    if rt == 'a3': bands = [b for b in bands if b.centroid.x * SX > 540]
    S = np.array(sum([lower_envelope(b, 80) for b in bands], []))
    best = None
    for q in range(4):
        psi0 = math.radians(45 + 90 * q)
        P = (np.array([[math.cos(psi0), -math.sin(psi0)], [math.sin(psi0), math.cos(psi0)]]) @ Hc.T).T
        k0 = (xr[1] - xr[0]) / (P[:, 0].max() - P[:, 0].min())
        P = P * [k0, k0 * math.cos(TH)]
        ye = env_y(P, np.linspace(P[:, 0].min() + 1, P[:, 0].max() - 1, 40))
        tx0 = (xr[0] + xr[1]) / 2 - (P[:, 0].max() + P[:, 0].min()) / 2
        ty0 = allS[:, 1].mean() - np.nanmean(ye) if rt != 'a3' else S[:, 1].mean() - np.nanmean(ye)
        def c(v):
            dpsi, k, tx, ty = v
            if abs(dpsi) > math.radians(8) or k <= 0: return 1e9
            return acost(mat(psi0 + dpsi, k, tx, ty), Hc, S, xr)
        for dpsi in (-0.05, 0, 0.05):
            for dy in (-30, 0, 30):
                r = minimize(c, [dpsi, k0, tx0, ty0 + dy], method='Powell', options={'maxiter': 4000, 'xtol': 1e-4, 'ftol': 1e-7})
                if best is None or r.fun < best[0]: best = (r.fun, q, r.x)
    cost0, q, v = best
    psi = math.radians(45 + 90 * q) + v[0]
    m = mat(psi, v[1], v[2], v[3])
    # shift so the matrix maps H (not Hc)
    m[2] -= m[0] * cen[0] + m[1] * cen[1]; m[5] -= m[3] * cen[0] + m[4] * cen[1]
    floors = {1: {'m': m.tolist(), 'cost': cost0}}
    for fl in (2, 3, 4):
        bf = band_polys(blk, fl)
        if rt == 'a3': bf = [b for b in bf if b.centroid.x * SX > 540]
        Sf = np.array(sum([lower_envelope(b, 80) for b in bf], []))
        def c2(t):
            mm = m.copy(); mm[2] = t[0]; mm[5] = t[1]; return acost(mm, H, Sf, xr)
        r = minimize(c2, [m[2], m[5]], method='Powell', options={'xtol': 1e-3})
        mm = m.copy(); mm[2] = r.x[0]; mm[5] = r.x[1]
        floors[fl] = {'m': mm.tolist(), 'cost': float(r.fun)}
    floors['cam'] = {'psi': math.degrees(psi), 'k': float(v[1])}
    print(rt, 'quadrant', q, 'psi %.1f k %.4f' % (math.degrees(psi), v[1]), file=sys.stderr)
    return hull, floors

out = {}
for rt in RENDERS:
    hull, floors = fit(rt)
    cam = floors.pop('cam')
    print(rt, {f: round(math.sqrt(max(v['cost'], 0)), 1) for f, v in floors.items()}, file=sys.stderr)
    out[rt] = {'drawing': RENDERS[rt][0], 'hull': [[round(x, 1), round(y, 1)] for x, y in np.array(hull.exterior.coords)[:-1]],
               'floors': {f: [round(v, 5) for v in fl['m']] for f, fl in floors.items()}, 'cam': cam}
json.dump(out, open('block_fit3.json', 'w'), indent=1)
