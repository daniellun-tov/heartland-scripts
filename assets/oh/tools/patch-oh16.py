#!/usr/bin/env python3
# patch-oh16.py - two panel fixes (Daniel, 19 Sep).
#
# 1. On mobile the action bar has to be IN FRONT. It is sticky at the panel's
#    bottom on z-index 3 while the subtabs are sticky on 4, so once the body is
#    scrolled the tab row paints over the buttons and clips them. The bar goes
#    above everything else in the panel, gets a shadow so content reads as
#    passing under it, and the body gets enough bottom padding that nothing can
#    come to rest beneath it.
#
# 2. Unit number and price share a row, pushed to opposite ends. The header is
#    a flex column, so it becomes a wrapping row and every child EXCEPT those
#    two is forced to a full-width line - written as a :not() pair rather than
#    naming the spec grid, so the views row the panel injects later (and
#    anything added after it) keeps its own line without another rule.
#   python3 patch-oh16.py assets/oh/oh-v2.css
import sys
p = sys.argv[1]
c = open(p).read()
assert '.unit-details_header{flex-direction:row' not in c
CSS = '''
/* ---- panel header: number and price on one row ---------------------------- */
.unit-details_header{flex-direction:row;flex-wrap:wrap;align-items:baseline;justify-content:space-between;column-gap:1rem}
.unit-details_header>*:not(.unit-details_title):not(.unit-details_price){flex:0 0 100%}
.unit-details_title{margin:0}
.unit-details_price{white-space:nowrap}

/* ---- mobile: the action bar sits in front of the subtabs ------------------- */
@media (max-width:991px){
  .unit-details_actionbar{z-index:8;box-shadow:0 -10px 14px -10px rgba(21,23,20,.28)}
  .unit-details_scroll-nav{z-index:4}
  /* the bar is ~4.2rem plus its safe-area padding: leave room so the last
     section can always be scrolled clear of it */
  .unit-details_body{padding-bottom:calc(6rem + env(safe-area-inset-bottom,0px))}
}
'''
open(p, 'w').write(c.rstrip() + '\n' + CSS)
print('ok')
