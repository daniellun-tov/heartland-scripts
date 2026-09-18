#!/usr/bin/env python3
# patch-oh4.py - 18 Sep batch: filters reorder/ranges, hatched unreleased plots,
# fill-derived unit strokes, soft block highlight, view marker copy/size,
# 360 tour modal, coming-soon tooltip type line.
#   python3 patch-oh4.py heartland-oh.js assets/oh/oh-v2.css
import sys
js_path, css_path = sys.argv[1], sys.argv[2]
s = open(js_path).read()
c = open(css_path).read()

def rep(text, old, new, count=1):
    assert text.count(old) == count, (text.count(old), old[:100])
    return text.replace(old, new)

# ---------------- controller ----------------

# 1. range bands: the real spread across the three types (B/C 1.38-1.50m,
#    A 2.44-3.13m; C 36-48 m2, B 46-56, A 86-87)
s = rep(s, """      bands: {
        'under-2': [0, 2e6],
        '2-2.5': [2e6, 2.5e6],
        '2.5-3': [2.5e6, 3e6],
        '3-plus': [3e6, Infinity],
      },""", """      bands: {
        'under-1.6': [0, 1.6e6],
        '2.4-2.6': [1.6e6, 2.6e6],
        '2.6-2.8': [2.6e6, 2.8e6],
        '2.8-plus': [2.8e6, Infinity],
      },""")
s = rep(s, """      bands: {
        'under-40': [0, 40],
        '40-50': [40, 50],
        '50-70': [50, 70],
        '70-plus': [70, Infinity],
      },""", """      bands: {
        'under-40': [0, 40],
        '40-50': [40, 50],
        '50-60': [50, 60],
        '80-plus': [60, Infinity],
      },""")

# 2. a range chip whose whole population is a coming-soon type reads
#    "Coming soon" like the type chip does, instead of a permanent 0
s = rep(s, """  const TAKEN = new Set(['reserved', 'sold', 'pending', 'sold-out']);
  function writeCount(el, n, takenOut) {""", """  const TAKEN = new Set(['reserved', 'sold', 'pending', 'sold-out']);
  const SOON_TYPE = (u) => u.type_coming_soon === true || u.type_active === false;
  /* the "Coming soon" tag on a chip - shared by the type chips and the
     price / size bands that only the coming-soon types fall into */
  function setSoonChip(el, soon) {
    el.classList.toggle('is-coming-soon', soon);
    let tag = el.querySelector('.unit-filter_soon');
    if (soon && !tag) { tag = document.createElement('span'); tag.className = 'unit-filter_soon'; tag.textContent = 'Coming soon'; el.appendChild(tag); }
    if (!soon && tag) tag.remove();
  }
  function writeCount(el, n, takenOut) {""")
s = rep(s, """      } else if (RANGES[facet]) {
        const band = RANGES[facet].bands[raw];
        const k = RANGES[facet].key;
        if (band) n = pool.filter((u) => Number(u[k]) >= band[0] && Number(u[k]) < band[1]).length;
      }
      writeCount(el, n, takenOut);""", """      } else if (RANGES[facet]) {
        const band = RANGES[facet].bands[raw];
        const k = RANGES[facet].key;
        if (band) {
          n = pool.filter((u) => Number(u[k]) >= band[0] && Number(u[k]) < band[1]).length;
          const all = units.filter((u) => Number(u[k]) >= band[0] && Number(u[k]) < band[1]);
          const soon = n === 0 && all.length > 0 && all.every(SOON_TYPE);
          setSoonChip(el, soon);
          if (soon && state[facet] && state[facet].has(raw)) { state[facet].delete(raw); el.classList.remove('is-active'); }
        }
      }
      writeCount(el, n, takenOut);""")

# 3. the View facet is "Directional View" and sits after Parking
s = rep(s, "    title.textContent = 'View';\n", "    title.textContent = 'Directional View';\n")
s = rep(s, """    /* after Orientation when it is there - the two answer the same question */
    var after = document.querySelector('[data-filter="orientation"]');
    after = after && after.closest ? after.closest('.unit-filter_group') : null;""",
"""    /* after Parking (Daniel's order: Price, Type, Block, Orientation, Parking,
       Directional View, Size); Orientation is the fallback */
    var after = document.querySelector('[data-toggle="parking-covered"]') || document.querySelector('[data-filter="orientation"]');
    after = after && after.closest ? after.closest('.unit-filter_group') : null;""")
s = rep(s, "'Sold out': 'Out', 'Coming soon': 'Soon' };", "'Sold out': 'Out', 'Coming soon': 'Soon', 'Directional View': 'View' };")

# 4. view marker copy
s = rep(s, "n + (n === 1 ? ' apartment' : ' apartments') + ' available with this view';",
           "n + (n === 1 ? ' apartment' : ' apartments') + ' available with this directional view';")

# 5. coming-soon tooltip keeps the type line
s = rep(s, """    pill(u.status_key);
    rows(!soon);
    if (soon) return;
    set(field.type, 'Type ' + u.type_code + ' · Block ' + u.block_name + ' · ' + u.floor_label + ' level');""",
"""    pill(u.status_key);
    rows(!soon);
    set(field.type, 'Type ' + u.type_code + ' · Block ' + u.block_name + ' · ' + u.floor_label + ' level');
    if (soon) { if (field.type) field.type.hidden = false; return; }""")

# 6. hatch patterns for unreleased plots, injected with the soon gradients
s = rep(s, """      defs.appendChild(lg);
    });
  }
""", """      defs.appendChild(lg);
    });
    /* unreleased plots: a light wash with a diagonal hatch (18 Sep) - the
       old solid dark wash read as heavy. userSpaceOnUse so the hatch scales
       with the plan; the hover variant is a shade darker. */
    [['oh-hatch', 0.10, 0.22], ['oh-hatch-hi', 0.18, 0.34]].forEach(([id, wash, line]) => {
      const p = document.createElementNS(NS, 'pattern');
      p.setAttribute('id', id);
      p.setAttribute('patternUnits', 'userSpaceOnUse');
      p.setAttribute('width', '7'); p.setAttribute('height', '7');
      p.setAttribute('patternTransform', 'rotate(45)');
      const bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('width', '7'); bg.setAttribute('height', '7');
      bg.setAttribute('fill', '#151714'); bg.setAttribute('fill-opacity', wash);
      const ln = document.createElementNS(NS, 'rect');
      ln.setAttribute('width', '7'); ln.setAttribute('height', '1.6');
      ln.setAttribute('fill', '#151714'); ln.setAttribute('fill-opacity', line);
      p.appendChild(bg); p.appendChild(ln);
      defs.appendChild(p);
    });
  }
""")

# 7. 360 tour modal - the panel's VR link (wized="v2_udVr") opens the tour in
#    a near-full-screen modal instead of a new tab
s = rep(s, """  var SITE_RENDER = 'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/698dc3b31548f3fe0dc66daa_img-3d-buildings-render.webp';""",
"""  /* 360 virtual tour (18 Sep): the VR link opens the tour in a modal that is
     as big as the viewport allows while still reading as a modal. */
  var tour = null;
  function tourBuild() {
    if (tour) return tour;
    tour = document.createElement('div');
    tour.className = 'ud-lightbox ud-tour';
    tour.innerHTML = '<button class="ud-lb-btn ud-lb-close" aria-label="Close">&#10005;</button><div class="ud-tour_stage"></div>';
    document.body.appendChild(tour);
    tour.querySelector('.ud-lb-close').addEventListener('click', tourClose);
    tour.addEventListener('click', function (e) { if (e.target === tour) tourClose(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && tour.classList.contains('is-open')) tourClose(); });
    return tour;
  }
  function tourOpen(url) {
    if (!url) return;
    tourBuild();
    var st = tour.querySelector('.ud-tour_stage');
    st.innerHTML = '';
    var f = document.createElement('iframe');
    f.src = url; f.allow = 'fullscreen; xr-spatial-tracking; accelerometer; gyroscope'; f.setAttribute('allowfullscreen', '');
    f.setAttribute('title', '360 virtual tour');
    st.appendChild(f);
    tour.classList.add('is-open');
    document.documentElement.classList.add('oh-tour-open');
  }
  function tourClose() {
    if (!tour) return;
    tour.classList.remove('is-open');
    tour.querySelector('.ud-tour_stage').innerHTML = '';
    document.documentElement.classList.remove('oh-tour-open');
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[wized="v2_udVr"]');
    if (!a) return;
    var href = a.getAttribute('href');
    var url = (href && href !== '#') ? href : (current && current.vr_url);
    if (!url) return;
    e.preventDefault(); e.stopPropagation();
    tourOpen(url);
  }, true);
  window.ohTour = { open: tourOpen, close: tourClose };

  var SITE_RENDER = 'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/698dc3b31548f3fe0dc66daa_img-3d-buildings-render.webp';""")

open(js_path, 'w').write(s)

# ---------------- CSS ----------------

# filters column a little wider, price/size chips two per row, hidden groups
c = rep(c, '.unit-filter_component{grid-template-columns:16rem minmax(0,1fr) 20rem;',
           '.unit-filter_component{grid-template-columns:19rem minmax(0,1fr) 20rem;')
c = rep(c, '@media (min-width:1280px){.unit-filter_component{grid-template-columns:17rem minmax(0,1fr) 22rem}}',
           '@media (min-width:1280px){.unit-filter_component{grid-template-columns:20rem minmax(0,1fr) 22rem}}')
c = rep(c, '.unit-filter_more-list.svx-more-collapsed{max-height:0!important;margin:0}',
"""/* 18 Sep: every group sits in the main flow (Price, Type, Block, Orientation, Parking, Directional View, Size);
   the More-filters disclosure is empty and hidden, Level is kept in the Designer for a later version */
.unit-filter_more-button,.unit-filter_more-list,.unit-filter_group[data-oh-hidden]{display:none!important}
.unit-filter_group:has([data-filter="price"]) .unit-filter_chips,.unit-filter_group:has([data-filter="size"]) .unit-filter_chips{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
.unit-filter_group:has([data-filter="price"]) .unit-filter_chip-1,.unit-filter_group:has([data-filter="size"]) .unit-filter_chip-1{width:100%;justify-content:space-between}
.unit-filter_more-list.svx-more-collapsed{max-height:0!important;margin:0}""")

# blocks: soft shadow highlight instead of a hard ink stroke
c = rep(c, """.site-plan_map-svg .site-plan_block{fill:var(--oh-ink);fill-opacity:.07;stroke:#fff;stroke-width:2;cursor:pointer;transition:fill-opacity .2s,stroke .2s}
.site-plan_map-svg .site-plan_block:hover{fill-opacity:.14}
.site-plan_map-svg .site-plan_block.is-selected{stroke:var(--oh-ink);stroke-width:3;fill-opacity:.12}""",
""".site-plan_map-svg .site-plan_block{fill:var(--oh-ink);fill-opacity:.07;stroke:rgba(255,255,255,.75);stroke-width:1.5;cursor:pointer;transition:fill-opacity .2s,stroke .2s,filter .25s}
.site-plan_map-svg .site-plan_block:hover{fill-opacity:.14}
/* 18 Sep: the selected / filtered block glows instead of taking a hard outline - softer, and it reads at any zoom */
.site-plan_map-svg .site-plan_block.is-selected{stroke:var(--oh-ink);stroke-opacity:.55;stroke-width:1.5;fill-opacity:.1;filter:drop-shadow(0 0 5px rgba(95,77,63,.55)) drop-shadow(0 3px 6px rgba(21,23,20,.28))}""")

# unit plots: stroke is a bolder shade of the fill, not white; unreleased hatched
c = rep(c, """.site-plan_map-svg .site-plan_plot{cursor:pointer;stroke:#fff;stroke-width:1}
.is-colour-status .site-plan_plot[data-status="available"]{fill:var(--oh-available)}
.is-colour-status .site-plan_plot[data-status="reserved"],.is-colour-status .site-plan_plot[data-status="pending"]{fill:var(--oh-reserved)}
.is-colour-status .site-plan_plot[data-status="sold"]{fill:var(--oh-sold)}
.is-colour-status .site-plan_plot[data-status="unreleased"]{fill:url(#oh-soon)}
.is-colour-type .site-plan_plot[data-type="A"]{fill:var(--oh-type-a)}
.is-colour-type .site-plan_plot[data-type="B"]{fill:var(--oh-type-b)}
.is-colour-type .site-plan_plot[data-type="C"]{fill:var(--oh-type-c)}""",
""".site-plan_map-svg .site-plan_plot{cursor:pointer;stroke:rgba(255,255,255,.9);stroke-width:1;stroke-linejoin:round}
/* 18 Sep: outlines are a bolder shade of the fill (color-mix), not white */
.is-colour-status .site-plan_plot[data-status="available"]{fill:var(--oh-available);stroke:color-mix(in srgb,var(--oh-available) 72%,#1f1911)}
.is-colour-status .site-plan_plot[data-status="reserved"],.is-colour-status .site-plan_plot[data-status="pending"]{fill:var(--oh-reserved);stroke:color-mix(in srgb,var(--oh-reserved) 72%,#1f1911)}
.is-colour-status .site-plan_plot[data-status="sold"]{fill:var(--oh-sold);stroke:color-mix(in srgb,var(--oh-sold) 72%,#1f1911)}
.is-colour-status .site-plan_plot[data-status="unreleased"]{fill:url(#oh-hatch);stroke:rgba(21,23,20,.28)}
.is-colour-type .site-plan_plot[data-type="A"]{fill:var(--oh-type-a);stroke:color-mix(in srgb,var(--oh-type-a) 72%,#1f1911)}
.is-colour-type .site-plan_plot[data-type="B"]{fill:var(--oh-type-b);stroke:color-mix(in srgb,var(--oh-type-b) 72%,#1f1911)}
.is-colour-type .site-plan_plot[data-type="C"]{fill:var(--oh-type-c);stroke:color-mix(in srgb,var(--oh-type-c) 72%,#1f1911)}""")
c = rep(c, """.is-colour-status .site-plan_plot[data-status="unreleased"]:hover{fill:url(#oh-soon-hi)}""",
           """.is-colour-status .site-plan_plot[data-status="unreleased"]:hover{fill:url(#oh-hatch-hi)}""")
c = rep(c, """.site-plan_legend-swatch.is-unreleased{background:linear-gradient(135deg,rgba(21,23,20,.6),rgba(21,23,20,.26)),var(--oh-sand)}""",
           """.site-plan_legend-swatch.is-unreleased{background:repeating-linear-gradient(135deg,rgba(21,23,20,.32) 0 1.5px,transparent 1.5px 5px),rgba(21,23,20,.1),var(--oh-sand)}""")

# view markers: larger, darker on hover
c = rep(c, """.site-plan_viewmark{position:absolute;pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;""",
           """.site-plan_viewmark{position:absolute;pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;width:2.5rem;height:2.5rem;""")
c = rep(c, """.site-plan_viewmark:hover,.site-plan_viewmark:focus-visible{transform:scale(1.08);box-shadow:0 4px 16px rgba(21,23,20,.2);outline:none}""",
           """.site-plan_viewmark:hover,.site-plan_viewmark:focus-visible{background:#e9e3d6;border-color:rgba(95,77,63,.45);transform:scale(1.08);box-shadow:0 4px 16px rgba(21,23,20,.22);outline:none}""")
c = rep(c, """  .site-plan_viewmark{width:1.75rem;height:1.75rem}""", """  .site-plan_viewmark{width:2.125rem;height:2.125rem}""")
c = rep(c, """.site-plan_viewmark svg{width:1.05rem;height:1.05rem;""", """.site-plan_viewmark svg{width:1.3rem;height:1.3rem;""")

# 360 tour modal
c = rep(c, """.ud-lightbox_stage iframe{width:100%;height:100%}""",
""".ud-lightbox_stage iframe{width:100%;height:100%}
/* 360 tour: as big as the viewport allows while still reading as a modal */
.ud-tour_stage{width:min(96vw,1700px);height:min(92vh,1080px);border-radius:12px;overflow:hidden;background:#000;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.ud-tour_stage iframe{display:block;width:100%;height:100%;border:0}
@media (max-width:767px){.ud-tour_stage{width:100vw;height:100dvh;border-radius:0}}
html.oh-tour-open{overflow:hidden}""")

open(css_path, 'w').write(c)
print('ok')
