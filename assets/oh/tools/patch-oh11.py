#!/usr/bin/env python3
# patch-oh11.py - two things:
#
# 1. The sheet's fallback button gets the component's arrow. Capturing the
#    live instance is a race we lose about as often as we win (Wized removes
#    the panel's Reserve button ~840ms in, deferred scripts run right around
#    there), so the hand-built copy has to be a faithful one: the component's
#    markup is wrapper > label-button > button-text, then icon-button > img.
#    It still upgrades to a real clone the first time a unit is opened.
#
# 2. ?unitType=<id|code> on /unit-selection-v2 applies the Type filter, so
#    "Select on Map" on the home page can land on the plan already narrowed
#    to that type. Tolerant of either spelling because the home page has the
#    numeric oh_unit_types id to hand, not the letter. A coming-soon type is
#    ignored rather than filtering the plan down to nothing.
#   python3 patch-oh11.py heartland-oh.js
import sys
js_path = sys.argv[1]
s = open(js_path).read()

def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:100])
    s = s.replace(old, new)

# ---- 1. the fallback carries the arrow ----
rep("""      el = document.createElement('a');
      el.className = 'button primary w-inline-block';
      el.setAttribute('data-oh-btn', 'fallback');
      el.innerHTML = '<div class="button-wrapper"><div class="label-button"><div class="button-text text-color-white"></div></div></div>';""",
"""      el = document.createElement('a');
      el.className = 'button primary w-inline-block';
      el.setAttribute('data-oh-btn', 'fallback');
      /* the component's own markup, arrow included - prefer an arrow already
         on the page, fall back to the site asset the component uses */
      var arrow = document.querySelector('img.button-icon[src*="arrow-right.svg"]:not([src*="brown"])');
      var src = (arrow && arrow.getAttribute('src')) ||
        'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/697218be46b9ea795299899d_icon-arrow-right.svg';
      el.innerHTML =
        '<div class="button-wrapper">' +
          '<div class="label-button"><div class="button-text text-color-white"></div></div>' +
          '<div class="icon-button"><img src="' + src + '" alt="" class="button-icon"></div>' +
        '</div>';""")

# ---- 2. ?unitType= applies the Type filter ----
rep("""    /* ?type=A selects that tab in the unit types section and scrolls to it;""",
"""    /* ?unitType=<id|code> lands with the Type filter already applied - the
       home page's "Select on Map" buttons carry the oh_unit_types id, the
       plan filters on the letter, so take either. A type that is coming soon
       is ignored: its chip is inert and filtering to it shows an empty plan. */
    var wantUnitType = param('unitType');
    if (wantUnitType) {
      var raw = String(wantUnitType).trim();
      waitFor(function(){
        var sp = window.ohSitePlan;
        return (sp && sp.units().length) ? sp : null;
      }, function(sp){
        var match = sp.units().filter(function(u){
          return String(u.unit_type_id) === raw ||
                 String(u.type_code || '').toLowerCase() === raw.toLowerCase();
        })[0];
        if (!match) return;
        var chip = document.querySelector('[data-filter="type"][data-value="' + match.type_code + '"], [data-filter="type"][data-value="' + String(match.type_code).toLowerCase() + '"]');
        if (chip && (chip.classList.contains('is-coming-soon') || chip.classList.contains('is-disabled'))) return;
        try { sp.toggle('type', match.type_code); } catch (e) {}
      });
    }

    /* ?type=A selects that tab in the unit types section and scrolls to it;""")

open(js_path, 'w').write(s)
print('ok')
