#!/usr/bin/env python3
# patch-oh7.py - a unit the filters have ruled out is not a target any more.
#
# Dimming was cosmetic: a filtered-out plot still took the hover (tooltip) and
# still opened the panel on click, so the plan answered for apartments the
# filters had just excluded. CSS makes the shape and its label inert; the
# handlers check too, because pointer-events is one `!important` away from
# being someone else's problem, and a keyboard/synthetic click never obeys it.
#   python3 patch-oh7.py heartland-oh.js assets/oh/oh-v2.css
import sys
js_path, css_path = sys.argv[1], sys.argv[2]
s = open(js_path).read()
c = open(css_path).read()

def rep(text, old, new, count=1):
    assert text.count(old) == count, (text.count(old), old[:100])
    return text.replace(old, new)

# ---- controller: the click handlers stand down for a dimmed shape ----
s = rep(s, """    const peek = (mode) => window.ohSheet && window.ohSheet.shouldUse() && window.ohSheet.open(u, mode, el);
    if (!LIST_HIDE.has(u.status_key))
      el.addEventListener('click', () => { if (!(isBay && peek('bay'))) openUnit(u); });
    else if (u.status_key === 'unreleased')
      el.addEventListener('click', () => {
        if (peek(isBay ? 'bay' : 'soon')) return;
        if (window.ohNotify) window.ohNotify.open(u);
      });""",
"""    const peek = (mode) => window.ohSheet && window.ohSheet.shouldUse() && window.ohSheet.open(u, mode, el);
    /* the filters have ruled this one out: it stays on the plan as context,
       but it is not a target. CSS already lifts pointer-events off it - this
       is the guard for a synthetic or keyboard-driven click. */
    const ruledOut = () => el.classList.contains('is-dimmed');
    if (!LIST_HIDE.has(u.status_key))
      el.addEventListener('click', () => { if (ruledOut()) return; if (!(isBay && peek('bay'))) openUnit(u); });
    else if (u.status_key === 'unreleased')
      el.addEventListener('click', () => {
        if (ruledOut()) return;
        if (peek(isBay ? 'bay' : 'soon')) return;
        if (window.ohNotify) window.ohNotify.open(u);
      });""")

s = rep(s, """      if (isBay) el.addEventListener('click', () => peek('bay'));""",
           """      if (isBay) el.addEventListener('click', () => { if (!ruledOut()) peek('bay'); });""")

# ---- the plot tooltip skips a dimmed shape ----
s = rep(s, """    const unitId = path.getAttribute('data-unit') || path.id;
    const u = sp.units().find((x) => x.plot_id === unitId);""",
"""    if (path.classList.contains('is-dimmed') && path.classList.contains('site-plan_plot')) return hide();
    const unitId = path.getAttribute('data-unit') || path.id;
    const u = sp.units().find((x) => x.plot_id === unitId);""")

# ---- and so does the views row inside it ----
s = rep(s, """      var shape = e.target.closest && e.target.closest('.site-plan_plot[id]');
      var u = shape && units().filter(function (x) { return x.plot_id === shape.id; })[0];""",
"""      var shape = e.target.closest && e.target.closest('.site-plan_plot[id]');
      if (shape && shape.classList.contains('is-dimmed')) shape = null;
      var u = shape && units().filter(function (x) { return x.plot_id === shape.id; })[0];""")

# ---- CSS: dimmed plots and their labels take no pointer ----
c = rep(c, '.site-plan_plot.is-dimmed{opacity:.2}',
"""/* 18 Sep: a filtered-out unit is context, not a target - no hover, no click.
   The block underneath still answers, which is the right fallback. */
.site-plan_plot.is-dimmed{opacity:.2;pointer-events:none;cursor:default}
.site-plan_unit-label.is-dimmed{pointer-events:none}""")

open(js_path, 'w').write(s)
open(css_path, 'w').write(c)
print('ok')
