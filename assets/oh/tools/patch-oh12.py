#!/usr/bin/env python3
# patch-oh12.py - parking level, two things (Daniel, 18 Sep):
#
# 1. Bays take the same outline treatment as the plots - a bolder shade of
#    their fill - instead of the white hairline they had.
# 2. The bays no unit owns read as "Additional" bays (visitor / extra), with
#    their own look and a legend entry that only shows on the Parking level.
#    They were plain white boxes with nothing saying what they were.
#   python3 patch-oh12.py heartland-oh.js assets/oh/oh-v2.css
import sys
js_path, css_path = sys.argv[1], sys.argv[2]
s = open(js_path).read(); c = open(css_path).read()
def rep(text, old, new, count=1):
    assert text.count(old) == count, (text.count(old), old[:90])
    return text.replace(old, new)

# ---- CSS ----
c = rep(c, """/* parking level */
.site-plan_map-svg .site-plan_bay-free{fill:#fff;fill-opacity:.35;stroke:rgba(95,77,63,.35);stroke-width:.6;pointer-events:none}
.site-plan_map-svg .site-plan_plot.is-bay{stroke:#fff;stroke-width:.6}""",
"""/* parking level. 18 Sep: a bay owned by a unit keeps that unit's fill AND its
   fill-derived outline (the stroke colour comes from the status/type rules
   above; only the width is thinner). A bay no unit owns is an Additional bay:
   a quiet sand fill with a dashed outline, and its own legend entry. */
.site-plan_map-svg .site-plan_bay-free{fill:var(--oh-sand);fill-opacity:.7;stroke:rgba(95,77,63,.55);stroke-width:.6;stroke-dasharray:2 1.4;pointer-events:none}
.site-plan_map-svg .site-plan_plot.is-bay{stroke-width:.8}
.site-plan_legend-swatch.is-additional{background:var(--oh-sand);border:1px dashed rgba(95,77,63,.7)}
.site-plan_legend-item.is-parking-only{display:none}
html.oh-parking-view .site-plan_legend-item.is-parking-only{display:inline-flex}""")

# ---- JS: html.oh-parking-view follows the level ----
s = rep(s, """    document.querySelector('.site-plan_map-canvas')?.classList.toggle('is-parking-view', isParkingLevel(level));""",
"""    document.querySelector('.site-plan_map-canvas')?.classList.toggle('is-parking-view', isParkingLevel(level));
    document.documentElement.classList.toggle('oh-parking-view', isParkingLevel(level));""")

# ---- JS: the Additional legend entry, built once the bays are wired ----
s = rep(s, """      parking.querySelectorAll('[id^="bay-"]:not(.site-plan_plot)').forEach((b) => b.classList.add('site-plan_bay-free'));""",
"""      const free = parking.querySelectorAll('[id^="bay-"]:not(.site-plan_plot)');
      free.forEach((b) => b.classList.add('site-plan_bay-free'));
      addAdditionalLegend(free.length);""")

s = rep(s, """  function updateLegend() {""",
"""  /* "Additional" = a bay on the plan that no unit owns (visitor / extra bays).
     One entry per legend group, shown only while the Parking level is up. */
  function addAdditionalLegend(count) {
    document.querySelectorAll('.site-plan_legend-group').forEach((group) => {
      let item = group.querySelector('.site-plan_legend-item.is-parking-only');
      if (!item) {
        const ref = group.querySelector('.site-plan_legend-item');
        item = document.createElement('div');
        item.className = 'site-plan_legend-item is-parking-only';
        const sw = document.createElement('span'); sw.className = 'site-plan_legend-swatch is-additional';
        const label = document.createElement('span'); label.textContent = 'Additional';
        const n = document.createElement('span'); n.className = 'site-plan_legend-count'; n.setAttribute('data-legend-additional', '');
        item.appendChild(sw); item.appendChild(label); item.appendChild(n);
        if (ref) item.className += ' ' + Array.from(ref.classList).filter((k) => !/^is-/.test(k) && k !== 'site-plan_legend-item').join(' ');
        group.appendChild(item);
        if (window.ohShortLabel) window.ohShortLabel(label, 'Extra');
      }
      item.querySelector('[data-legend-additional]').textContent = count;
    });
  }

  function updateLegend() {""")

open(js_path, 'w').write(s); open(css_path, 'w').write(c)
print('ok')
