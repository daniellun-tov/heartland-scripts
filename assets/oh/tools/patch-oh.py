import re, sys
p = sys.argv[1]
s = open(p).read()
n = 0
def rep(old, new, count=1):
    global s, n
    if s.count(old) != count:
        print('MISMATCH (%d found, want %d):' % (s.count(old), count), old[:90].replace('\n', '\\n')); sys.exit(1)
    s = s.replace(old, new); n += 1

# ---- 0. map wrapper + wording helpers, run at load (script is deferred) ----
rep("""/* ============================================================
   Site plan controller - filters, map, list, detail panel
   ============================================================ */
window.Wized = window.Wized || [];
window.Wized.push((Wized) => {
  const API_BASE""",
"""/* ============================================================
   Page prep (runs at load; the script is deferred so the DOM is parsed)
   - .unit-filter_map: a positioned wrapper around the scrolling map box so
     the level switcher and zoom controls can pin to its corners. Built here
     if the Designer does not have one.
   - "Floor" -> "Level" in the few Designer labels that are plain blocks.
   ============================================================ */
(function () {
  var box = document.querySelector('.unit-filter_map-container');
  if (box && !document.querySelector('.unit-filter_map')) {
    var w = document.createElement('div');
    w.className = 'unit-filter_map';
    box.parentNode.insertBefore(w, box);
    w.appendChild(box);
  }
  document.querySelectorAll('.unit-filter_group-title-1, [data-sort="floor"]').forEach(function (el) {
    if (el.textContent.trim() === 'Floor') el.textContent = 'Level';
  });
  var cb = document.querySelector('.site-plan_colourby');
  if (cb && !cb.querySelector('.site-plan_switch-label')) {
    var l = document.createElement('span');
    l.className = 'site-plan_switch-label';
    l.textContent = 'Colour by';
    cb.insertBefore(l, cb.firstChild);
  }
})();

/* ============================================================
   Site plan controller - filters, map, list, detail panel
   ============================================================ */
window.Wized = window.Wized || [];
window.Wized.push((Wized) => {
  const API_BASE""")

# ---- 1. initMap: labels + parking bays ----
rep("""  function initMap() {
    /* unit-level paths (phase 2) */
    units.forEach((u) => {
      const path = document.getElementById(u.plot_id);
      if (!path) return;
      path.setAttribute('data-status', u.status_key);
      path.setAttribute('data-type', u.type_code);
      path.classList.add('site-plan_plot');
      if (!LIST_HIDE.has(u.status_key)) path.addEventListener('click', () => openUnit(u));
      else if (u.status_key === 'unreleased') path.addEventListener('click', () => { if (window.ohNotify) window.ohNotify.open(u); });
      else path.classList.add('is-static'); /* reserved / sold: visible, tooltip, no click */
    });
""",
"""  /* every shape that stands for a unit: its plot on the unit's level and,
     when the plan has a parking level, the bay allocated to it */
  const unitShapes = new Map();   /* plot_id -> [elements] */
  const bayOfUnit = new Map();    /* plot_id -> bay element */
  const unitOfBay = new Map();    /* bay id -> unit */
  const SVGNS = 'http://www.w3.org/2000/svg';

  function wireShape(el, u) {
    el.setAttribute('data-status', u.status_key);
    el.setAttribute('data-type', u.type_code);
    el.setAttribute('data-unit', u.plot_id);
    el.classList.add('site-plan_plot');
    if (!LIST_HIDE.has(u.status_key)) el.addEventListener('click', () => openUnit(u));
    else if (u.status_key === 'unreleased') el.addEventListener('click', () => { if (window.ohNotify) window.ohNotify.open(u); });
    else el.classList.add('is-static'); /* reserved / sold: visible, tooltip, no click */
    if (!unitShapes.has(u.plot_id)) unitShapes.set(u.plot_id, []);
    unitShapes.get(u.plot_id).push(el);
  }

  /* centre of a polygon/rect for a label */
  function shapeCentre(el) {
    const pts = el.getAttribute('points');
    if (pts) {
      const xy = pts.trim().split(/\\s+/).map((p) => p.split(',').map(Number));
      const n = xy.length;
      return [xy.reduce((a, p) => a + p[0], 0) / n, xy.reduce((a, p) => a + p[1], 0) / n];
    }
    const x = Number(el.getAttribute('x')) || 0, y = Number(el.getAttribute('y')) || 0;
    return [x + (Number(el.getAttribute('width')) || 0) / 2, y + (Number(el.getAttribute('height')) || 0) / 2];
  }
  function shortNumber(u) {
    const s = String(u.unit_number || '');
    const i = s.indexOf('-');
    return i >= 0 ? s.slice(i + 1) : s;
  }
  function addLabel(group, el, u, cls) {
    let layer = group.querySelector(':scope > [data-layer="unit-labels"]');
    if (!layer) { layer = document.createElementNS(SVGNS, 'g'); layer.setAttribute('data-layer', 'unit-labels'); group.appendChild(layer); }
    const c = shapeCentre(el);
    const t = document.createElementNS(SVGNS, 'text');
    t.setAttribute('class', 'site-plan_unit-label' + (cls ? ' ' + cls : ''));
    t.setAttribute('data-for', u.plot_id);
    t.setAttribute('x', c[0].toFixed(1));
    t.setAttribute('y', c[1].toFixed(1));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    t.textContent = shortNumber(u);
    layer.appendChild(t);
    return t;
  }
  function labelsFor(plotId) {
    return Array.from(document.querySelectorAll('.site-plan_map-svg .site-plan_unit-label[data-for="' + plotId + '"]'));
  }

  function initMap() {
    /* unit-level paths */
    units.forEach((u) => {
      const path = document.getElementById(u.plot_id);
      if (!path) return;
      wireShape(path, u);
      /* label: pre-drawn in the SVG, else generated */
      const existing = labelsFor(u.plot_id);
      if (!existing.length) {
        const g = path.closest('[data-floor]') || path.parentNode;
        addLabel(g, path, u, '');
      }
      labelsFor(u.plot_id).forEach((t) => t.setAttribute('data-status', u.status_key));
    });

    /* parking level: <g data-floor="0"> with one shape per bay, id="bay-<parking_bay_number>" */
    const parking = document.querySelector('.site-plan_map-svg [data-floor="0"]');
    if (parking) {
      units.forEach((u) => {
        const key = String(u.parking_bay_number || '').trim();
        if (!key) return;
        const bay = document.getElementById('bay-' + key);
        if (!bay) { console.warn('[site-plan] no bay shape for', key, '(' + u.unit_number + ')'); return; }
        bay.classList.add('is-bay');
        wireShape(bay, u);
        bayOfUnit.set(u.plot_id, bay);
        unitOfBay.set(bay.id, u);
        const t = addLabel(parking, bay, u, 'is-bay');
        t.setAttribute('data-status', u.status_key);
      });
      parking.querySelectorAll('[id^="bay-"]:not(.site-plan_plot)').forEach((b) => b.classList.add('site-plan_bay-free'));
    }
""")

# ---- 2. floors: include drawn levels (parking 0), labels, switch label ----
rep("""  const floorLabel = (level) => {
    const u = units.find((x) => x.floor_level === level && x.floor_label);
    return u ? u.floor_label : String(level);
  };""",
"""  const floorLabel = (level) => {
    const g = document.querySelector('.site-plan_map-svg [data-floor="' + level + '"][data-level-label]');
    if (g) return g.getAttribute('data-level-label');
    if (level === 0) return 'Parking';
    const u = units.find((x) => x.floor_level === level && x.floor_label);
    return u ? u.floor_label : String(level);
  };
  const isParkingLevel = (level) => level === 0 && !units.some((u) => u.floor_level === 0);""")

rep("""    floorLevels = Array.from(new Set(units.map((u) => u.floor_level))).sort((a, b) => a - b);
    floorLevels.forEach((l) => { if (!drawn.has(l)) console.warn('[site-plan] no <g data-floor="' + l + '"> in the SVG'); });""",
"""    floorLevels = Array.from(new Set(units.map((u) => u.floor_level).concat(Array.from(drawn)))).sort((a, b) => a - b);
    floorLevels.forEach((l) => { if (!drawn.has(l)) console.warn('[site-plan] no <g data-floor="' + l + '"> in the SVG'); });""")

rep("""    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', 'Floor');
    if (!host.querySelector('[data-floor-btn]')) {
      host.innerHTML = floorLevels.map((l) =>""",
"""    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', 'Level');
    if (!host.querySelector('[data-floor-btn]')) {
      host.innerHTML = '<span class="site-plan_switch-label">Level</span>' + floorLevels.map((l) =>""")

rep("""    const first = floorLevels.find((l) => drawn.has(l));
    setFloor(first != null ? first : floorLevels[0], false);""",
"""    const first = floorLevels.find((l) => drawn.has(l) && !isParkingLevel(l));
    setFloor(first != null ? first : floorLevels[0], false);""")

rep("""    document.dispatchEvent(new CustomEvent('oh:floor-change', { detail: { level, label: floorLabel(level) } }));
    if (syncFacet) {""",
"""    document.querySelector('.site-plan_map-canvas')?.classList.toggle('is-parking-view', isParkingLevel(level));
    document.dispatchEvent(new CustomEvent('oh:floor-change', { detail: { level, label: floorLabel(level) } }));
    /* the parking level shows every unit's bay: it never narrows the list */
    if (syncFacet && !isParkingLevel(level)) {""")

rep("""    document.querySelectorAll('[data-floor-count]').forEach((el) => {
      const l = Number(el.getAttribute('data-floor-count'));
      el.textContent = units.filter((u) => u.floor_level === l && !LIST_HIDE.has(u.status_key) && matches(u, 'floor')).length;
    });""",
"""    document.querySelectorAll('[data-floor-count]').forEach((el) => {
      const l = Number(el.getAttribute('data-floor-count'));
      if (isParkingLevel(l)) { el.textContent = ''; return; }
      el.textContent = units.filter((u) => u.floor_level === l && !LIST_HIDE.has(u.status_key) && matches(u, 'floor')).length;
    });""")

# ---- 3. apply(): dim every shape + label of a unit ----
rep("""    /* unit paths, when they exist */
    units.forEach((u) => {
      const path = document.getElementById(u.plot_id);
      if (path) path.classList.toggle('is-dimmed', !ids.has(u.plot_id));
    });""",
"""    /* unit plots, bays and their labels */
    units.forEach((u) => {
      const off = !ids.has(u.plot_id);
      (unitShapes.get(u.plot_id) || []).forEach((el) => el.classList.toggle('is-dimmed', off));
      labelsFor(u.plot_id).forEach((t) => t.classList.toggle('is-dimmed', off));
    });""")

# ---- 4. openUnit: on the parking view, keep it ----
rep("""  function openUnit(u) {
    if (floorLevels.length && u.floor_level !== floorView) setFloor(u.floor_level, false);
    document.querySelectorAll('.site-plan_plot.is-selected').forEach((p) => p.classList.remove('is-selected'));
    document.getElementById(u.plot_id)?.classList.add('is-selected');""",
"""  function openUnit(u) {
    if (floorLevels.length && u.floor_level !== floorView && !isParkingLevel(floorView)) setFloor(u.floor_level, false);
    document.querySelectorAll('.site-plan_plot.is-selected').forEach((p) => p.classList.remove('is-selected'));
    (unitShapes.get(u.plot_id) || []).forEach((el) => el.classList.add('is-selected'));""")

# ---- 5. coming-soon types + chip states ----
rep("""  function updateLegend() {
    document.querySelectorAll('[data-legend]').forEach((el) => {""",
"""  /* unit types switched off in Xano (oh_unit_types.is_active = false) show as
     "Coming soon" in the Type filter and the legend, and cannot be selected */
  function markComingSoonTypes() {
    const codes = new Set(units.map((u) => String(u.type_code || '')).filter(Boolean));
    codes.forEach((code) => {
      const soon = units.filter((u) => String(u.type_code) === code).every((u) => u.type_active === false);
      document.querySelectorAll('[data-filter="type"][data-value="' + code + '"], [data-filter="type"][data-value="' + code.toLowerCase() + '"]').forEach((el) => {
        el.classList.toggle('is-coming-soon', soon);
        el.setAttribute('aria-disabled', String(soon));
        let tag = el.querySelector('.unit-filter_soon');
        if (soon && !tag) { tag = document.createElement('span'); tag.className = 'unit-filter_soon'; tag.textContent = 'Coming soon'; el.appendChild(tag); }
        if (!soon && tag) tag.remove();
        if (soon && state.type.has(norm(FACETS.type, code))) { state.type.delete(norm(FACETS.type, code)); el.classList.remove('is-active'); }
      });
      document.querySelectorAll('[data-legend="type-' + code + '"]').forEach((c) => {
        const item = c.closest('.site-plan_legend-item') || c.parentNode;
        item.classList.toggle('is-coming-soon', soon);
        let tag = item.querySelector('.site-plan_legend-soon');
        if (soon && !tag) { tag = document.createElement('span'); tag.className = 'site-plan_legend-soon'; tag.textContent = 'Coming soon'; item.appendChild(tag); }
        if (!soon && tag) tag.remove();
      });
    });
  }

  function updateLegend() {
    markComingSoonTypes();
    document.querySelectorAll('[data-legend]').forEach((el) => {""")

rep("""  function writeCount(el, n) {
    const c = el.querySelector('.unit-filter_count');
    if (c) c.textContent = n;
    el.classList.toggle('is-disabled', n === 0 && !el.classList.contains('is-active'));
  }""",
"""  function writeCount(el, n) {
    const c = el.querySelector('.unit-filter_count');
    if (c) c.textContent = n;
    const off = (n === 0 && !el.classList.contains('is-active')) || el.classList.contains('is-coming-soon');
    el.classList.toggle('is-disabled', off);
    el.setAttribute('aria-disabled', String(off));
  }""")

rep("""    document.querySelectorAll('[data-filter]').forEach((el) =>
      el.addEventListener('click', () => {
        const facet = el.getAttribute('data-filter');""",
"""    document.querySelectorAll('[data-filter]').forEach((el) =>
      el.addEventListener('click', () => {
        if (el.classList.contains('is-coming-soon') || el.classList.contains('is-disabled')) return;
        const facet = el.getAttribute('data-filter');""")

# ---- 6. tooltip: bays, level wording ----
rep("""    set(field.type, 'Type ' + u.type_code + ' · Block ' + u.block_name + ' · ' + u.floor_label + ' floor');
    set(field.specs, [u.bedrooms + ' bed', u.bathrooms + ' bath', Math.round(u.unit_size) + ' m²'].join(' · '));""",
"""    set(field.type, 'Type ' + u.type_code + ' · Block ' + u.block_name + ' · ' + u.floor_label + ' level');
    const bay = u.parking_bay_number ? ' · Bay ' + u.parking_bay_number + (u.parking_bay_type ? ' (' + String(u.parking_bay_type).toLowerCase() + ')' : '') : '';
    set(field.specs, [u.bedrooms + ' bed', u.bathrooms + ' bath', Math.round(u.unit_size) + ' m²'].join(' · ') + bay);""")

rep("""    set(field.type, (types.length ? 'Type ' + types.join(', ') : '') + (floors ? ' · ' + floors + ' floors' : ''));""",
"""    set(field.type, (types.length ? 'Type ' + types.join(', ') : '') + (floors ? ' · ' + floors + ' levels' : ''));""")

rep("""    const u = sp.units().find((x) => x.plot_id === path.id);
    const b = !u && sp.blocks().find((x) => x.plot_id === path.id);""",
"""    const unitId = path.getAttribute('data-unit') || path.id;
    const u = sp.units().find((x) => x.plot_id === unitId);
    const b = !u && sp.blocks().find((x) => x.plot_id === path.id);""")

rep("""    if (label) label.textContent = 'Unit ' + u.unit_number + ' · Block ' + u.block_name + ' · ' + (u.floor_label || '') + ' floor';""",
"""    if (label) label.textContent = 'Unit ' + u.unit_number + ' · Block ' + u.block_name + ' · ' + (u.floor_label || '') + ' level';""")

# ---- 7. zoom: wrapper fallback, zoom-out below fit, wheel zoom ----
rep("""  function minZoom() {
    if (!baseW || !box) return 1;
    var fit = box.clientWidth / baseW;                 /* 1 when the map already fits */
    if (fit >= 1) return 1;
    return Math.max(0.5, Math.floor(fit / STEP) * STEP || 0.5);
  }""",
"""  var MIN = 0.5;
  function minZoom() {
    if (!baseW || !box) return MIN;
    var fit = box.clientWidth / baseW;                 /* 1 when the map already fits */
    if (fit >= 1) return MIN;                          /* zooming out past the fit shrinks the plan in place */
    return Math.max(MIN, Math.floor(fit / STEP) * STEP || MIN);
  }""")

rep("""    zoom = next;
    setZoomVar(zoom);
    box.classList.toggle('is-zoomed', zoom !== 1 || box.scrollWidth > box.clientWidth);""",
"""    zoom = next;
    setZoomVar(zoom);
    box.classList.toggle('is-zoomed', zoom !== 1 || box.scrollWidth > box.clientWidth);
    box.classList.toggle('is-zoomed-out', zoom < 0.999);
    box.setAttribute('data-zoom', zoom.toFixed(2));""")

rep("""  function boot() {
    if (booted) return true;
    canvas = document.querySelector('.site-plan_map-canvas');
    box = document.querySelector('.unit-filter_map-container');
    wrap = document.querySelector('.unit-filter_map');
    if (!canvas || !box || !wrap) return false;
    booted = true;
    measure();
    build();
    bindPan();""",
"""  function bindWheel() {
    /* ctrl/cmd + wheel (and trackpad pinch, which browsers report the same way) zooms the plan */
    box.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      set(zoom + (e.deltaY < 0 ? STEP / 2 : -STEP / 2));
    }, { passive: false });
  }

  function boot() {
    if (booted) return true;
    canvas = document.querySelector('.site-plan_map-canvas');
    box = document.querySelector('.unit-filter_map-container');
    wrap = document.querySelector('.unit-filter_map') || (box && box.parentNode);
    if (!canvas || !box || !wrap) return false;
    booted = true;
    measure();
    build();
    bindPan();
    bindWheel();""")

# ---- 8. lightbox: expose ----
rep("""  function step(d) {
    if (!items.length) return;
    index = (index + d + items.length) % items.length;
    render();
    if (onIndex) onIndex(index);
  }
""",
"""  function step(d) {
    if (!items.length) return;
    index = (index + d + items.length) % items.length;
    render();
    if (onIndex) onIndex(index);
  }
  window.ohLightbox = { open: open, close: close };
""")

open(p, 'w').write(s)
print('patched', n)

# ---- 9. panel media module (appended) ----
s += r'''

/* ============================================================
   Detail panel extras (15 Sep)
   - Flythrough: a real <video> in #ud-video, loaded from the unit type's
     flythrough_url when a unit opens, stopped when it closes.
   - Floor plan: the architect's drawing (drawing_url) and the render
     (floorplan_url) side by side; either opens the shared lightbox with both.
   - Sticky action bar: the Reserve / Share buttons are Webflow button
     components inside [data-actionbar]; their href is a placeholder.
   ============================================================ */
(function () {
  if (window.__ohPanelExtras) return;
  window.__ohPanelExtras = true;

  var current = null;

  function video() { return document.querySelector('[data-ud-video]'); }
  function fpImg(kind) { return document.querySelector('[data-fp-img="' + kind + '"]'); }
  function fpBox(kind) { return document.querySelector('[data-fp="' + kind + '"]'); }

  function fill(u) {
    current = u || null;
    var v = video(), sec = document.getElementById('ud-video');
    if (v) {
      v.innerHTML = '';
      var src = u && u.flythrough_url;
      if (src && !/youtube\.com|youtu\.be/i.test(src)) {
        var el = document.createElement('video');
        el.setAttribute('controls', '');
        el.setAttribute('playsinline', '');
        el.setAttribute('preload', 'metadata');
        el.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;background:#151714';
        if (u.card_image) el.setAttribute('poster', u.card_image);
        el.src = src;
        v.appendChild(el);
      } else if (src) {
        var f = document.createElement('iframe');
        f.src = src; f.allow = 'autoplay; fullscreen; picture-in-picture'; f.setAttribute('allowfullscreen', '');
        f.style.cssText = 'display:block;width:100%;height:100%;border:0';
        v.appendChild(f);
      }
      if (sec) sec.style.display = src ? '' : 'none';
      var nav = document.querySelector('.unit-details_nav-link[href="#ud-video"]');
      if (nav) nav.style.display = src ? '' : 'none';
    }
    var d = fpImg('drawing'), r = fpImg('render');
    if (d) { d.src = (u && u.drawing_url) || ''; var bd = fpBox('drawing'); if (bd) bd.style.display = u && u.drawing_url ? '' : 'none'; }
    if (r) { r.src = (u && u.floorplan_url) || ''; var br = fpBox('render'); if (br) br.style.display = u && u.floorplan_url ? '' : 'none'; }
  }

  function items() {
    var out = [];
    if (current && current.drawing_url) out.push({ kind: 'image', url: current.drawing_url, caption: 'Type ' + current.type_code + ' floor plan' });
    if (current && current.floorplan_url) out.push({ kind: 'image', url: current.floorplan_url, caption: 'Type ' + current.type_code + ' render' });
    return out;
  }

  function bind() {
    document.addEventListener('oh:unit-open', function (e) { fill(e.detail && e.detail.unit); });
    document.addEventListener('oh:unit-close', function () {
      var v = video(); if (v) v.innerHTML = '';
    });
    document.addEventListener('click', function (e) {
      var box = e.target.closest && e.target.closest('[data-fp]');
      if (box && window.ohLightbox) {
        e.preventDefault();
        var list = items();
        var i = Math.max(0, list.findIndex(function (it) { return it.url === (box.getAttribute('data-fp') === 'drawing' ? current.drawing_url : current.floorplan_url); }));
        window.ohLightbox.open(list, i);
        return;
      }
      /* the component buttons carry placeholder hrefs - never let them scroll/navigate */
      var bar = e.target.closest && e.target.closest('[data-actionbar-reserve], [data-actionbar-share]');
      if (bar) { var a = e.target.closest('a'); if (a && /^#/.test(a.getAttribute('href') || '')) e.preventDefault(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var box = e.target.closest && e.target.closest('[data-fp]');
      if (box) { e.preventDefault(); box.click(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
'''
open(p, 'w').write(s)
print('appended panel module')
