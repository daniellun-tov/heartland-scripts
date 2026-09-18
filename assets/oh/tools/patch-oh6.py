#!/usr/bin/env python3
# patch-oh6.py - the marker card's placement grid weights what it would cover.
#
# patch-oh5 got the card off the plots on desktop, but on a 390px screen the
# plan fills the map box and there is no gap wide enough: the search then
# returns the least-bad spot, which was still landing on a lit plot. The
# apartments the hover has just lit ARE the answer, so they cost far more
# than an ordinary plot, which in turn costs more than a floating control.
#   python3 patch-oh6.py heartland-oh.js assets/oh/oh-v2.css
import sys
js_path, css_path = sys.argv[1], sys.argv[2]
s = open(js_path).read()
c = open(css_path).read()

def rep(text, old, new, count=1):
    assert text.count(old) == count, (text.count(old), old[:100])
    return text.replace(old, new)

# the focused view changes which plots are lit, so it changes the grid
s = rep(s, """      scroller ? Math.round(scroller.scrollLeft) : 0, scroller ? Math.round(scroller.scrollTop) : 0,
      document.querySelectorAll('.site-plan_plot').length,
    ].join('|');""",
"""      scroller ? Math.round(scroller.scrollLeft) : 0, scroller ? Math.round(scroller.scrollTop) : 0,
      document.querySelectorAll('.site-plan_plot').length,
      focusKey || '',
    ].join('|');""")

# graded weights instead of one flat "plot" cost
s = rep(s, """    /* the plots on the level that is showing, plus their labels */
    var shapes = document.querySelectorAll('.site-plan_map-svg .site-plan_plot, .site-plan_map-svg .site-plan_unit-label');
    for (var i = 0; i < shapes.length; i++) {
      var el = shapes[i];
      if (!el.getClientRects().length) continue;          /* hidden level */
      stamp(el.getBoundingClientRect(), 1000);
    }
    /* the floating controls: worth avoiding, worth overlapping before a plot */
    var ui = document.querySelectorAll('.unit-filter_map .site-plan_toolbar, .unit-filter_map .site-plan_floor-switch, .unit-filter_map .site-plan_zoom, .unit-filter_map .site-plan_sheet, .site-plan_viewmark');
    for (var j = 0; j < ui.length; j++) {
      if (!ui[j].getClientRects().length) continue;
      stamp(ui[j].getBoundingClientRect(), 1);
    }""",
"""    /* What it costs to cover something, worst first. A phone's map box has no
       gap the card fits in, so the search will always be covering SOMETHING:
       make that the least useful thing on screen. The apartments this view
       just lit are the answer to the hover, so they cost most; any other plot
       next; a floating control is the cheapest thing to sit on. */
    var W_LIT = 5000, W_PLOT = 600, W_UI = 40;
    var shapes = document.querySelectorAll('.site-plan_map-svg .site-plan_plot, .site-plan_map-svg .site-plan_unit-label');
    for (var i = 0; i < shapes.length; i++) {
      var el = shapes[i];
      if (!el.getClientRects().length) continue;          /* hidden level */
      var lit = el.classList.contains('is-view-hit') ||
                (el.getAttribute('data-for') && document.getElementById(el.getAttribute('data-for')) &&
                 document.getElementById(el.getAttribute('data-for')).classList.contains('is-view-hit'));
      stamp(el.getBoundingClientRect(), lit ? W_LIT : W_PLOT);
    }
    /* the floating controls: worth avoiding, worth overlapping before a plot */
    var ui = document.querySelectorAll('.unit-filter_map .site-plan_toolbar, .unit-filter_map .site-plan_floor-switch, .unit-filter_map .site-plan_zoom, .unit-filter_map .site-plan_sheet, .site-plan_viewmark');
    for (var j = 0; j < ui.length; j++) {
      if (!ui[j].getClientRects().length) continue;
      stamp(ui[j].getBoundingClientRect(), W_UI);
    }""")

s = rep(s, """        var score = over * 1e6 + Math.sqrt(dx * dx + dy * dy);""",
           """        var score = over * 10 + Math.sqrt(dx * dx + dy * dy);""")

# a narrower card finds a gap more often - on a phone especially
c = rep(c, '  .site-plan_viewmark-tip{max-width:min(17rem,calc(100vw - 2rem))}',
           '  .site-plan_viewmark-tip{max-width:min(15.5rem,calc(100vw - 2rem))}')

open(js_path, 'w').write(s)
open(css_path, 'w').write(c)
print('ok')
