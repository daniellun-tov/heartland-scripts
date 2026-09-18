#!/usr/bin/env python3
# patch-oh8.py - a level tap is navigation, not a filter tag.
#
# The floor switcher sets the Level facet as well as moving the view, so the
# list follows the plan. That is still what we want - but since the Level
# chips went behind data-oh-hidden, the only trace of it is a removable
# "Level 1st" tag (and a +1 on the mobile Filters badge), which reads as a
# filter the visitor never chose. One shared exclusion so the tags and the
# badge cannot disagree; the facet itself is untouched, ready for whatever
# the Level filter becomes later.
#   python3 patch-oh8.py heartland-oh.js
import sys
js_path = sys.argv[1]
s = open(js_path).read()

def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:100])
    s = s.replace(old, new)

# one definition, used by both readers of "what is actively filtered"
rep("""(function () {
  if (window.__ohTags) return;
  window.__ohTags = true;
  var SEL = '[data-filter][data-value].is-active, [data-toggle].is-active';""",
"""(function () {
  if (window.__ohTags) return;
  window.__ohTags = true;
  /* Facets that are set by something other than a chip the visitor clicked.
     The level switcher sets `floor` so the list follows the plan; that is
     navigation, so it gets no tag and no badge count. window.ohTagSel keeps
     the Filters badge reading exactly what the tags row shows. */
  var SKIP = ['floor'];
  var SEL = SKIP.map(function (f) { return '[data-filter][data-value].is-active:not([data-filter="' + f + '"])'; })
    .concat(['[data-toggle].is-active']).join(', ');
  window.ohTagSel = SEL;""")

rep("""        var n = document.querySelectorAll('[data-filter][data-value].is-active, [data-toggle].is-active').length;""",
    """        var n = document.querySelectorAll(window.ohTagSel || '[data-filter][data-value].is-active, [data-toggle].is-active').length;""")

open(js_path, 'w').write(s)
print('ok')
