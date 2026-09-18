#!/usr/bin/env python3
# patch-oh9.py - the mobile peek sheet uses the site's button component.
#
# .site-plan_sheet-btn was a hand-rolled pill: merlot fill, no arrow, its own
# radius and type scale. Next to the panel's "Reserve this unit" (the
# Btn / Filled Merlot / Icon Right component) it read as a different button.
#
# Rather than restate the component's look in CSS a third time (the popups
# already do that), the sheet CLONES the live instance - `.button.primary`
# with its wrapper, label and arrow - strips the bindings that must not be
# duplicated (wized, defijn-modal, data-w-id, id, href) and keeps only its
# own layout class. Whatever the Designer does to that component, the sheet
# follows. A hand-built copy with the same classes is the fallback.
#   python3 patch-oh9.py heartland-oh.js assets/oh/oh-v2.css
import sys
js_path, css_path = sys.argv[1], sys.argv[2]
s = open(js_path).read()
c = open(css_path).read()

def rep(text, old, new, count=1):
    assert text.count(old) == count, (text.count(old), old[:100])
    return text.replace(old, new)

# ---- build: the action is the site's button component ----
s = rep(s, """      '<div class="site-plan_sheet-meta"></div>' +
      '<button type="button" class="site-plan_sheet-btn"></button>';
    sheet.querySelector('.site-plan_sheet-close').addEventListener('click', close);
    sheet.querySelector('.site-plan_sheet-btn').addEventListener('click', function () {
      var u = current;
      if (!u) return;
      close();""",
"""      '<div class="site-plan_sheet-meta"></div>';
    sheet.appendChild(makeBtn());
    sheet.querySelector('.site-plan_sheet-close').addEventListener('click', close);
    sheet.querySelector('.site-plan_sheet-btn').addEventListener('click', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var u = current;
      if (!u) return;
      close();""")

# ---- the clone, the fallback, and one place that knows how to label either ----
s = rep(s, """  /* the shape behind the sheet keeps an outline, so it is obvious which one
     this is about - the bay and the unit share a plot_id, so mark the one
     that was actually tapped */""",
"""  /* The sheet's action is the same component as the panel's Reserve button,
     cloned from the live instance so it cannot drift from it. The bindings
     that only belong to the original come off: wized (Wized would write the
     unit into two elements), defijn-modal (it would open the reserve popup),
     data-w-id (an IX2 binding is not ours to duplicate), id and href. */
  var BTN_SRC = '[wized="v2_udReserveBtn"], .unit-details_actionbar-reserve .button, a.button.primary';
  function makeBtn() {
    var src = document.querySelector(BTN_SRC);
    var el;
    if (src) {
      el = src.cloneNode(true);
      ['wized', 'data-v2', 'defijn-modal', 'defijn-modal-element', 'data-w-id', 'id', 'href', 'data-actionbar-reserve']
        .forEach(function (a) { el.removeAttribute(a); });
      el.querySelectorAll('[wized],[data-w-id],[id],[defijn-modal]').forEach(function (n) {
        ['wized', 'data-v2', 'data-w-id', 'id', 'defijn-modal', 'defijn-modal-element'].forEach(function (a) { n.removeAttribute(a); });
      });
    } else {
      /* the panel is not on the page (or not built yet): same classes by hand */
      el = document.createElement('a');
      el.className = 'button primary w-inline-block';
      el.innerHTML = '<div class="button-wrapper"><div class="label-button"><div class="button-text text-color-white"></div></div></div>';
    }
    el.setAttribute('role', 'button');
    el.setAttribute('href', '#');
    el.classList.add('site-plan_sheet-btn');
    return el;
  }
  /* the component keeps its text in .button-text; a fallback <a> may not */
  function btnLabel(btn, text) {
    var t = btn.querySelector('.button-text');
    if (t) t.textContent = text; else btn.textContent = text;
  }

  /* the shape behind the sheet keeps an outline, so it is obvious which one
     this is about - the bay and the unit share a plot_id, so mark the one
     that was actually tapped */""")

s = rep(s, """    var btn = sheet.querySelector('.site-plan_sheet-btn');
    var label = soon ? 'Notify me' : taken ? '' : 'View the unit';
    btn.textContent = label;
    btn.hidden = !label;""",
"""    var btn = sheet.querySelector('.site-plan_sheet-btn');
    var label = soon ? 'Notify me' : taken ? '' : 'View the unit';
    btnLabel(btn, label);
    btn.hidden = !label;""")

# ---- CSS: layout only, the component brings its own look ----
c = rep(c, """.site-plan_sheet-btn{margin-top:.7rem;width:100%;padding:.7rem 1rem;border:0;border-radius:999px;background:var(--oh-accent);color:#fff;font:inherit;font-size:.9375rem;font-weight:600;cursor:pointer}
.site-plan_sheet-btn:active{opacity:.9}
.site-plan_sheet-btn[hidden]{display:none}""",
"""/* the sheet's action IS the site's button component (cloned in heartland-oh.js):
   everything here is layout, so the component keeps its own fill, type and arrow */
.site-plan_sheet-btn{display:flex;margin-top:.7rem;width:100%;cursor:pointer}
.site-plan_sheet-btn .button-wrapper{width:100%;justify-content:center}
.site-plan_sheet-btn[hidden]{display:none}""")

open(js_path, 'w').write(s)
open(css_path, 'w').write(c)
print('ok')
