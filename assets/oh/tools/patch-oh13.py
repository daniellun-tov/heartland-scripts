#!/usr/bin/env python3
# patch-oh13.py - the legend pill hugs its contents (Daniel, 19 Sep).
#
# It was pinned to one row (nowrap) with the TOOLBAR wrapping instead, so that
# a full-radius pill could never become a two-row squircle. With the Additional
# entry that is five items, and on a phone the row no longer fits: the pill was
# stretching to the toolbar's width and wrapping inside itself anyway.
#
# So: width:max-content - the pill is exactly as wide as its items, no wider -
# with max-width:100% and a shrinkable flex item. The items stay on one line
# while they fit; when they do not, the legend takes its own line under the
# toggle (the toolbar wraps first, because the item's hypothetical size is its
# content width); only when even a full-width line is too narrow do the items
# wrap inside the pill.
#   python3 patch-oh13.py assets/oh/oh-v2.css
import sys
p = sys.argv[1]
c = open(p).read()
def rep(old, new, count=1):
    global c
    assert c.count(old) == count, (c.count(old), old[:90])
    c = c.replace(old, new)

rep(""".unit-filter_map .site-plan_legend{background:rgba(255,255,255,.92);border-radius:999px;padding:.45rem 1.1rem;box-shadow:0 4px 14px rgba(21,23,20,.12);font-size:.8125rem}""",
"""/* the pill is as wide as its contents and no wider, so the items sit on one
   line until the screen runs out and then wrap */
.unit-filter_map .site-plan_legend{width:max-content;max-width:100%;background:rgba(255,255,255,.92);border-radius:999px;padding:.45rem 1.1rem;box-shadow:0 4px 14px rgba(21,23,20,.12);font-size:.8125rem}""")

rep("""  /* The legend is a real pill, so it must never wrap inside itself: it is compact
     (tighter than the Designer's 1.25rem gap) and nowrap, and the TOOLBAR wraps
     instead - on a narrow desktop the legend drops onto its own line under the
     toggle, still right-aligned, rather than becoming a two-row squircle. */
  .unit-filter_map .site-plan_legend{font-size:.75rem;padding:.4rem 1rem;flex:0 0 auto}
  .unit-filter_map .site-plan_legend-group{column-gap:.6rem;flex-wrap:nowrap}""",
"""  /* The legend hugs its items (see the base rule) and is compact - tighter than
     the Designer's 1.25rem gap. It can shrink, so the order as the window
     narrows is: one row beside the toggle, then its own row under it (the
     toolbar wraps first, since the pill's hypothetical size is its content
     width), then the items wrap inside the pill. */
  .unit-filter_map .site-plan_legend{font-size:.75rem;padding:.4rem 1rem;flex:0 1 auto}
  .unit-filter_map .site-plan_legend-group{column-gap:.6rem;row-gap:.25rem;flex-wrap:wrap}""")

# the pill's corner reads as a stadium on one row and a soft rectangle on two;
# 999px on a 2-row pill is a squircle, so cap it to half a row's height
rep(""".unit-filter_map .site-plan_legend{padding:.35rem .8rem;border-radius:999px;font-size:.6875rem}""",
""".unit-filter_map .site-plan_legend{padding:.35rem .8rem;border-radius:1.1rem;font-size:.6875rem}""")

# On a phone the toolbar was held 6rem clear of the level switch so the two
# never met. Only the toggle shares that line - the legend sits under it - so
# the cap moves to the toggle and the legend gets the width of the map.
rep(""".unit-filter_map .site-plan_toolbar{top:.5rem;right:.5rem;gap:.35rem;max-width:calc(100% - 6rem)}
  .unit-filter_map .site-plan_colourby{padding:.2rem}""",
""".unit-filter_map .site-plan_toolbar{top:.5rem;right:.5rem;gap:.35rem;max-width:calc(100% - 1rem)}
  .unit-filter_map .site-plan_colourby{padding:.2rem;max-width:calc(100% - 5rem)}""")

open(p, 'w').write(c)
print('ok')
