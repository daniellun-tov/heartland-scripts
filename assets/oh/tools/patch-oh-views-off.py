"""Views are not confirmed yet (23 Sep, client): no View filter, no view chips
in the plot tooltip or the unit panel, and the edge markers stop filtering or
lighting plots - they keep their info card (label, direction, distance, copy)."""
import re, sys
p = 'heartland-oh.js'; s = open(p).read()
def rep(a, b, n=1):
    global s
    c = s.count(a)
    if c != n: sys.exit('expected %d of %r, found %d' % (n, a[:70], c))
    s = s.replace(a, b)

rep("""    /* multi: one unit carries several oh_views keys in view_tags[] */
    view: { key: 'view_tags', multi: true },
""", """    /* view: { key: 'view_tags', multi: true } - off until the views are
       confirmed (23 Sep); restore it with the View chips in the views module */
""")
# no chips
rep("""    views.forEach(function (v) { byKey[v.key] = v; });
    buildChips();
    buildMarkers();""", """    views.forEach(function (v) { byKey[v.key] = v; });
    buildMarkers();""")
rep("""    if (views.length) { buildChips(); buildMarkers(); }""", """    if (views.length) buildMarkers();""")
# markers: info only
rep("""      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', 'Show apartments with a ' + v.label + ' view' + (v.direction ? ' (' + v.direction + ')' : ''));""",
"""      b.setAttribute('aria-label', v.label + (v.direction ? ' (' + v.direction + ')' : ''));""")
rep("""      b.addEventListener('click', function (e) {
        e.preventDefault();
        try { window.ohSitePlan.toggle('view', v.key); } catch (err) { return; }
        clear();                 /* the filter's own dimming takes over */
        showTip(b, v);
      });""", """      /* info only (23 Sep): a click/tap shows the card, it no longer filters */
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (tip && tip.classList.contains('is-visible') && tip.__key === v.key) hideTip();
        else showTip(b, v);
      });""")
rep("""  function preview(v) {
    if (!facetOn()) focus(v.key);      /* no double-dimming once a filter is on */
    var b""", """  function preview(v) {
    /* no plot highlighting - it would read as "these units have this view" */
    var b""")
# card: no count, no filter hint
rep("""    var n = units().filter(function (u) { return u.is_available && tags(u).indexOf(v.key) !== -1; }).length;""",
    """    var n = 0;   /* per-unit views are not confirmed - no count */
    tip.__key = v.key;""")
rep("""      '<span class="site-plan_viewmark-tip_hint"></span>';""", """      '';""")
rep("""    tip.querySelector('.site-plan_viewmark-tip_hint').textContent = isOn(v.key) ? 'Click to clear this filter' : 'Click to filter to these apartments';
""", "")
rep("""  window.addEventListener('scroll', hideTip, { passive: true });""",
"""  window.addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('click', function (e) {
    if (!(e.target.closest && e.target.closest('.site-plan_viewmark'))) hideTip();
  });""")
# no panel row, no tooltip row, no facet sync
rep("""    window.ohSitePlan.onChange(function () { syncMarkers(); layout(); });   /* fires now and on every apply() */
    bindTooltip();""", """    window.ohSitePlan.onChange(function () { layout(); });   /* fires now and on every apply() */
    /* bindTooltip() / paintPanel() off until the views are confirmed (23 Sep) */""")
rep("""  document.addEventListener('oh:unit-open', function (e) {
    if (e.detail && e.detail.unit) paintPanel(e.detail.unit);
  });
""", "")
# welcome copy
rep("price, size, orientation and outlook.", "price, size and orientation.")
rep("Filter by price, type, level, parking or the view you want to wake up to.", "Filter by price, type, block, orientation or parking.")
open(p, 'w').write(s)

c = 'assets/oh/oh-v2.css'; t = open(c).read()
t = t.replace("background:#fff;color:var(--oh-ink);cursor:pointer;box-shadow:0 2px 10px rgba(21,23,20,.14)",
              "background:#fff;color:var(--oh-ink);cursor:default;box-shadow:0 2px 10px rgba(21,23,20,.14)", 1)
open(c, 'w').write(t)
print('ok')
