#!/usr/bin/env python3
# patch-oh17.py - the welcome CTA is the site's button component, and the
# number/price row aligns properly (Daniel, 19 Sep).
#
# 1. Daniel's standing preference: use the real component wherever one exists
#    and suits the job. The sheet already clones the panel's Reserve button
#    (with a faithful hand-built fallback for when Wized has stripped it), so
#    that factory becomes window.ohButton and the welcome modal uses it rather
#    than restating the filled-merlot look a third time.
# 2. align-items:baseline did not line the price up with the unit number -
#    their line-heights differ (31.2/24 vs 20/22) and the observed offset was
#    17px the wrong way. `center` puts the two baselines within half a pixel
#    here and is geometry-based, so it holds for any price length.
#   python3 patch-oh17.py heartland-oh.js assets/oh/oh-v2.css
import sys
js_path, css_path = sys.argv[1], sys.argv[2]
s = open(js_path).read(); c = open(css_path).read()
def rep(t, old, new, n=1):
    assert t.count(old) == n, (t.count(old), old[:90])
    return t.replace(old, new)

# ---- 1a. the sheet's factory becomes a shared one -------------------------
s = rep(s, "  function makeBtn() {\n    var src = captureBtn();",
           "  function makeBtn(cls) {\n    var src = captureBtn();")
s = rep(s, "    el.classList.add('site-plan_sheet-btn');\n    return el;",
           "    el.classList.add(cls || 'site-plan_sheet-btn');\n    return el;")
s = rep(s, "  window.ohSheet = { open: open, close: close, shouldUse: shouldUse, current: function () { return current; } };",
"""  window.ohSheet = { open: open, close: close, shouldUse: shouldUse, current: function () { return current; } };
  /* the site's button, for anything else that needs one: make(cls) returns the
     component (cloned while Wized still has it on the page, else built from the
     same markup) and label() writes into whichever of the two it handed back */
  window.ohButton = { make: makeBtn, label: btnLabel };""")

# ---- 1b. the welcome modal uses it ---------------------------------------
s = rep(s, """          '<button type="button" class="oh-welcome_cta" data-welcome-close>Start exploring</button>' +""",
           """          '<div class="oh-welcome_action"></div>' +""")
s = rep(s, """    document.body.appendChild(el);
    el.addEventListener('click', function (e) {""",
"""    document.body.appendChild(el);
    /* the CTA is the site's button component (see window.ohButton), so it can
       never drift from the one in the panel; the fallback is the same markup */
    var slot = el.querySelector('.oh-welcome_action');
    var cta;
    if (window.ohButton) {
      cta = window.ohButton.make('oh-welcome_cta');
      window.ohButton.label(cta, 'Start exploring');
    } else {
      cta = document.createElement('button');
      cta.type = 'button'; cta.className = 'oh-welcome_cta'; cta.textContent = 'Start exploring';
    }
    cta.setAttribute('data-welcome-close', '');
    slot.appendChild(cta);
    el.addEventListener('click', function (e) {""")
s = rep(s, """      if (e.target.closest('[data-welcome-close]')) close();""",
           """      if (e.target.closest('[data-welcome-close]')) { e.preventDefault(); close(); }""")

# ---- 2. the header row -----------------------------------------------------
c = rep(c, ".unit-details_header{flex-direction:row;flex-wrap:wrap;align-items:baseline;justify-content:space-between;column-gap:1rem}",
           ".unit-details_header{flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between;column-gap:1rem}")

# ---- the CTA is layout only now; the component brings the look -------------
c = rep(c, """.oh-welcome_cta{display:inline-flex;align-items:center;justify-content:center;width:100%;padding:.85rem 1.25rem;border:0;border-radius:999px;background:var(--oh-accent);color:#fff;font:inherit;font-size:.9375rem;font-weight:600;cursor:pointer;transition:filter .15s}
.oh-welcome_cta:hover{filter:brightness(1.06)}""",
"""/* the CTA IS the site's button component (cloned in heartland-oh.js): these
   are layout rules only, so the component keeps its own fill, type and arrow */
.oh-welcome_action{display:flex}
.oh-welcome_cta{display:flex;width:100%;cursor:pointer}
.oh-welcome_cta .button-wrapper{width:100%;justify-content:center}""")

open(js_path, 'w').write(s); open(css_path, 'w').write(c)
print('ok')
