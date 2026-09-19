#!/usr/bin/env python3
"""Parking level fixes, 19 Sep 2026 - the two runs beside units 1-101..106 / 1-301..306.

Measured against oh-site-plan-bg-v8.webp (raster = 2 x plan units), not eyeballed.

1. PB45-PB48 sat 5.6 units off their row: PB41-44 lie at t=0 in the row frame,
   PB45-48 at t=-5.6, so those four straddled the kerb line instead of sitting in
   the drawn cells. An across-row profile at PB46 puts the drawn cell at
   t in [-16.0, +16.0]. Fix = translate the four by +5.6 along the row normal.

2. PB49-PB51 were spread down the run as three equal bays. The raster says
   otherwise: after PB52 comes a WIDE disabled bay (21.0 along the run, it carries
   the wheelchair mark), then a planted island 12.5 long with no bay at all, then
   two ordinary 14.6 bays. PB50 was sitting on the island. Fix = rebuild all three
   on the measured cell boundaries, with PB51 on the disabled bay.

All seven are unallocated Extra bays, so no unit's parking_bay_number is affected.

Run once, from the repo root:  python3 assets/oh/tools/fix_bays_p1.py
"""
import io, re, sys
import numpy as np

SVG = sys.argv[1] if len(sys.argv) > 1 else 'assets/oh/oh-site-plan.svg'
src = io.open(SVG, encoding='utf-8').read()

def pts_of(name):
    m = re.search(r'<polygon id="bay-%s"[^>]*points="([^"]+)"' % name, src)
    if not m: sys.exit('missing ' + name)
    return [tuple(map(float, p.split(','))) for p in m.group(1).split()]

def cen(name):
    p = pts_of(name)
    return np.array([sum(x for x, y in p)/len(p), sum(y for x, y in p)/len(p)])

def write(name, pts):
    global src
    s = ' '.join('%.1f,%.1f' % (x, y) for x, y in pts)
    new, n = re.subn(r'(<polygon id="bay-%s"[^>]*points=")[^"]+(")' % name,
                     lambda m: m.group(1) + s + m.group(2), src)
    if n != 1: sys.exit('expected 1 write for %s, got %d' % (name, n))
    src = new

# ---- 1. shift PB45-48 back onto their row -------------------------------
u = cen('PB44') - cen('PB41'); u /= np.linalg.norm(u)
v = np.array([-u[1], u[0]])
for n in ('PB45', 'PB46', 'PB47', 'PB48'):
    write(n, [tuple(np.array(p) + v * 5.6) for p in pts_of(n)])

# ---- 2. rebuild PB49/50/51 on the measured cells ------------------------
u2 = cen('PB52') - cen('PB56'); u2 /= np.linalg.norm(u2)
v2 = np.array([-u2[1], u2[0]])
o2 = cen('PB52')
T, HD = -0.25, 15.75                      # across-run centre, half depth
for n, (sc, hw) in {'PB51': (19.00, 10.50),   # disabled bay - wide
                    'PB50': (49.35, 7.30),
                    'PB49': (64.35, 7.30)}.items():
    c = o2 + u2 * sc + v2 * T
    write(n, [tuple(q) for q in (c - u2*hw - v2*HD, c + u2*hw - v2*HD,
                                 c + u2*hw + v2*HD, c - u2*hw + v2*HD)])

io.open(SVG, 'w', encoding='utf-8').write(src)
print('patched', SVG)
