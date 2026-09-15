import sys
p = sys.argv[1]
s = open(p).read()

def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

# ---- page prep: app shell ----
rep("""  var cb = document.querySelector('.site-plan_colourby');
  if (cb && !cb.querySelector('.site-plan_switch-label')) {
    var l = document.createElement('span');
    l.className = 'site-plan_switch-label';
    l.textContent = 'Colour by';
    cb.insertBefore(l, cb.firstChild);
  }
})();""",
"""  var cb = document.querySelector('.site-plan_colourby');
  if (cb && !cb.querySelector('.site-plan_switch-label')) {
    var l = document.createElement('span');
    l.className = 'site-plan_switch-label';
    l.textContent = 'Colour by';
    cb.insertBefore(l, cb.firstChild);
  }

  /* app shell (15 Sep): the page is a fixed-height app - sidebar (brand +
     filters), plan, list, footer bar. Nothing scrolls but the filter chips,
     the cards and the map itself. */
  var mapWrap = document.querySelector('.unit-filter_map');
  var toolbar = document.querySelector('.site-plan_toolbar');
  if (mapWrap && toolbar && toolbar.parentNode !== mapWrap) mapWrap.insertBefore(toolbar, mapWrap.firstChild);
  var inner = document.querySelector('.unit-filter_filters .unit-filter_inner');
  if (inner && !inner.querySelector('.unit-filter_scroll')) {
    var head = inner.querySelector('.unit-filter_head');
    var scroll = document.createElement('div');
    scroll.className = 'unit-filter_scroll';
    scroll.setAttribute('data-lenis-prevent', '');
    Array.prototype.slice.call(inner.children).forEach(function (c) { if (c !== head) scroll.appendChild(c); });
    inner.appendChild(scroll);
  }
  var pageWrap = document.querySelector('.page_wrap');
  if (pageWrap) pageWrap.classList.add('is-app');
  /* no smooth scroll on this page: the site's Lenis instance is torn down */
  function killLenis() {
    try { if (window.lenis && typeof window.lenis.destroy === 'function') window.lenis.destroy(); } catch (e) {}
    window.lenis = null;
    document.documentElement.classList.remove('lenis', 'lenis-smooth', 'lenis-scrolling', 'lenis-stopped');
  }
  killLenis();
  window.addEventListener('load', killLenis);
  setTimeout(killLenis, 1500);
  document.documentElement.classList.remove('oh-app-pending');
})();""")

# ---- coming soon: driven by oh_unit_types.coming_soon ----
rep("""  /* unit types switched off in Xano (oh_unit_types.is_active = false) show as
     "Coming soon" in the Type filter and the legend, and cannot be selected */
  function markComingSoonTypes() {
    const codes = new Set(units.map((u) => String(u.type_code || '')).filter(Boolean));
    codes.forEach((code) => {
      const soon = units.filter((u) => String(u.type_code) === code).every((u) => u.type_active === false);""",
"""  /* unit types flagged in Xano (oh_unit_types.coming_soon, or is_active off)
     show "Coming soon" instead of a count in the Type filter and the legend,
     and cannot be selected */
  function markComingSoonTypes() {
    const codes = new Set(units.map((u) => String(u.type_code || '')).filter(Boolean));
    codes.forEach((code) => {
      const soon = units.filter((u) => String(u.type_code) === code).every((u) => u.type_coming_soon === true || u.type_active === false);""")

# ---- block chips: "Reserved/Sold" when every unit in the block is taken ----
rep("""  function writeCount(el, n) {
    const c = el.querySelector('.unit-filter_count');
    if (c) c.textContent = n;
    const off = (n === 0 && !el.classList.contains('is-active')) || el.classList.contains('is-coming-soon');
    el.classList.toggle('is-disabled', off);
    el.setAttribute('aria-disabled', String(off));
  }""",
"""  const TAKEN = new Set(['reserved', 'sold', 'pending', 'sold-out']);
  function writeCount(el, n, takenOut) {
    const c = el.querySelector('.unit-filter_count');
    if (c) c.textContent = takenOut ? 'Reserved/Sold' : n;
    el.classList.toggle('is-taken', !!takenOut);
    const off = (n === 0 && !el.classList.contains('is-active')) || el.classList.contains('is-coming-soon');
    el.classList.toggle('is-disabled', off);
    el.setAttribute('aria-disabled', String(off));
  }""")
rep("""      if (FACETS[facet]) {
        const cfg = FACETS[facet];
        const want = norm(cfg, raw);
        n = pool.filter((u) => facetValues(u, cfg).some((v) => v === want)).length;
      } else if (RANGES[facet]) {
        const band = RANGES[facet].bands[raw];
        const k = RANGES[facet].key;
        if (band) n = pool.filter((u) => Number(u[k]) >= band[0] && Number(u[k]) < band[1]).length;
      }
      writeCount(el, n);""",
"""      let takenOut = false;
      if (FACETS[facet]) {
        const cfg = FACETS[facet];
        const want = norm(cfg, raw);
        n = pool.filter((u) => facetValues(u, cfg).some((v) => v === want)).length;
        /* a whole block (or any facet value) that is reserved / sold reads so
           instead of "0" - only when no filter is narrowing the pool */
        if (n === 0 && facet !== 'status') {
          const all = units.filter((u) => facetValues(u, cfg).some((v) => v === want));
          takenOut = all.length > 0 && all.every((u) => TAKEN.has(u.status_key)) && pool.length === countable.length;
        }
      } else if (RANGES[facet]) {
        const band = RANGES[facet].bands[raw];
        const k = RANGES[facet].key;
        if (band) n = pool.filter((u) => Number(u[k]) >= band[0] && Number(u[k]) < band[1]).length;
      }
      writeCount(el, n, takenOut);""")

# ---- detail panel: block section = block render + level highlight, 3D site plan + block highlight ----
rep("""    var d = fpImg('drawing'), r = fpImg('render');
    if (d) { d.src = (u && u.drawing_url) || ''; var bd = fpBox('drawing'); if (bd) bd.style.display = u && u.drawing_url ? '' : 'none'; }
    if (r) { r.src = (u && u.floorplan_url) || ''; var br = fpBox('render'); if (br) br.style.display = u && u.floorplan_url ? '' : 'none'; }
  }""",
"""    var d = fpImg('drawing'), r = fpImg('render');
    if (d) { d.src = (u && u.drawing_url) || ''; var bd = fpBox('drawing'); if (bd) bd.style.display = u && u.drawing_url ? '' : 'none'; }
    if (r) { r.src = (u && u.floorplan_url) || ''; var br = fpBox('render'); if (br) br.style.display = u && u.floorplan_url ? '' : 'none'; }
    fillBlock(u);
  }

  /* The block: the block's 3D render with the unit's level highlighted
     (oh_floors.highlight_image_url, an SVG overlay), then the whole estate in
     3D with the block highlighted (oh_buildings.highlight_image_url over the
     site render). Both overlays were drawn for v1 on the same frames. */
  var SITE_RENDER = 'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/698dc3b31548f3fe0dc66daa_img-3d-buildings-render.webp';
  function fillBlock(u) {
    var host = document.querySelector('.unit-details_block-image');
    if (!host) return;
    var box = host.querySelector('.ud-block');
    if (!box) {
      box = document.createElement('div');
      box.className = 'ud-block';
      box.innerHTML =
        '<figure class="ud-block_fig" data-block-fig="level"><div class="ud-block_stack"><img class="ud-block_base" alt=""><img class="ud-block_overlay" alt=""></div><figcaption class="ud-block_cap"></figcaption></figure>' +
        '<figure class="ud-block_fig" data-block-fig="estate"><div class="ud-block_stack"><img class="ud-block_base" alt="" src="' + SITE_RENDER + '"><img class="ud-block_overlay" alt=""></div><figcaption class="ud-block_cap"></figcaption></figure>';
      host.appendChild(box);
      host.classList.add('has-ud-block');
    }
    var lvl = box.querySelector('[data-block-fig="level"]'), est = box.querySelector('[data-block-fig="estate"]');
    var lb = lvl.querySelector('.ud-block_base'), lo = lvl.querySelector('.ud-block_overlay');
    var eo = est.querySelector('.ud-block_overlay');
    var block = u && u.block_image_url, floorHl = u && u.floor_highlight_url, blockHl = u && u.block_highlight_url;
    lb.src = block || ''; lo.src = floorHl || ''; lo.style.display = floorHl ? '' : 'none';
    lvl.style.display = block ? '' : 'none';
    lvl.querySelector('.ud-block_cap').textContent = u ? 'Block ' + u.block_name + ' · ' + (u.floor_label || '') + ' level' : '';
    eo.src = blockHl || ''; eo.style.display = blockHl ? '' : 'none';
    est.querySelector('.ud-block_cap').textContent = u ? 'Block ' + u.block_name + ' on the estate' : '';
  }""")

open(p, 'w').write(s)
print('ok')
