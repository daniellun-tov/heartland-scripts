#!/usr/bin/env python3
# patch-oh10.py - the sheet's button clone has to be TAKEN while it exists.
#
# patch-oh9 cloned [wized="v2_udReserveBtn"] when the sheet was built, but the
# sheet is built on the first plot tap and by then the button is gone: Wized
# renders the panel's Reserve only while a unit is open, so the element is in
# the DOM from ~240ms (parse) to ~1080ms (Wized's first render) and not again
# until someone opens a unit. The sheet was therefore always falling back to
# the hand-built copy - right colour, no arrow.
#
# So: keep a template the moment the component is seen (module load, which is
# inside that window, and again on oh:unit-open), and re-mount the button if a
# real template turns up after a fallback was used.
#   python3 patch-oh10.py heartland-oh.js
import sys
js_path = sys.argv[1]
s = open(js_path).read()

def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:100])
    s = s.replace(old, new)

# ---- build(): mount through one helper so the handler survives a re-mount ----
rep("""    sheet.appendChild(makeBtn());
    sheet.querySelector('.site-plan_sheet-close').addEventListener('click', close);
    sheet.querySelector('.site-plan_sheet-btn').addEventListener('click', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var u = current;
      if (!u) return;
      close();
      if (u.status_key === 'unreleased') { if (window.ohNotify) window.ohNotify.open(u); }
      else if (window.ohSitePlan) window.ohSitePlan.open(u.unit_number);
    });""",
"""    mountBtn();
    sheet.querySelector('.site-plan_sheet-close').addEventListener('click', close);""")

rep("""  var BTN_SRC = '[wized="v2_udReserveBtn"], .unit-details_actionbar-reserve .button, a.button.primary';
  function makeBtn() {
    var src = document.querySelector(BTN_SRC);
    var el;
    if (src) {""",
"""  var BTN_SRC = '[wized="v2_udReserveBtn"], .unit-details_actionbar-reserve .button, a.button.primary';
  /* Wized owns that button: it is in the DOM from parse until its first
     render (~840ms on staging) and then only while a unit is open. Take a
     copy whenever it is there - this module runs from a deferred script, so
     module load is inside the first window - and keep it. */
  var btnTpl = null;
  function captureBtn() {
    var live = document.querySelector(BTN_SRC);
    if (live && !btnTpl) btnTpl = live.cloneNode(true);
    return btnTpl;
  }
  captureBtn();
  document.addEventListener('oh:unit-open', function () { if (!btnTpl && captureBtn()) remountBtn(); });

  function act(e) {
    if (e && e.preventDefault) e.preventDefault();
    var u = current;
    if (!u) return;
    close();
    if (u.status_key === 'unreleased') { if (window.ohNotify) window.ohNotify.open(u); }
    else if (window.ohSitePlan) window.ohSitePlan.open(u.unit_number);
  }
  function mountBtn(old) {
    var el = makeBtn();
    el.addEventListener('click', act);
    if (old && old.parentNode) { el.hidden = old.hidden; old.parentNode.replaceChild(el, old); }
    else sheet.appendChild(el);
    return el;
  }
  /* a fallback was mounted before the component could be copied: upgrade it */
  function remountBtn() {
    if (!sheet) return null;
    var cur = sheet.querySelector('.site-plan_sheet-btn');
    if (!cur || cur.getAttribute('data-oh-btn') === 'clone' || !btnTpl) return cur;
    return mountBtn(cur);
  }

  function makeBtn() {
    var src = captureBtn();
    var el;
    if (src) {""")

rep("""      el = src.cloneNode(true);""", """      el = src.cloneNode(true);
      el.setAttribute('data-oh-btn', 'clone');""")

rep("""      el = document.createElement('a');
      el.className = 'button primary w-inline-block';
      el.innerHTML = '<div class="button-wrapper"><div class="label-button"><div class="button-text text-color-white"></div></div></div>';""",
"""      el = document.createElement('a');
      el.className = 'button primary w-inline-block';
      el.setAttribute('data-oh-btn', 'fallback');
      el.innerHTML = '<div class="button-wrapper"><div class="label-button"><div class="button-text text-color-white"></div></div></div>';""")

# ---- open(): upgrade the button before labelling it ----
rep("""    var btn = sheet.querySelector('.site-plan_sheet-btn');
    var label = soon ? 'Notify me' : taken ? '' : 'View the unit';""",
"""    var btn = remountBtn() || sheet.querySelector('.site-plan_sheet-btn');
    var label = soon ? 'Notify me' : taken ? '' : 'View the unit';""")

open(js_path, 'w').write(s)
print('ok')
