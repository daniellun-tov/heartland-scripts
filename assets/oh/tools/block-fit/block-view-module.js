
/* ============================================================
   Estate 3D view + block view (Variant A: block to plans) - 14 Oct
   Two more ways into the same selection engine, both rendered by this
   controller from the units the page already holds (no Wized elements).
   The markup is native Webflow (Designer classes, built on the page after
   the map container: the view switch in the toolbar, [data-oh-native=
   "estate"] and [data-oh-native="block"]); this module moves it into the
   map wrapper, clones the strip / chip / wrap / tag templates per floor
   and adds the behaviour. Without the native elements it stays off.

   - Estate view: the aerial render with the twelve blocks as clickable
     outlines, switchable with the site plan from a "View: Plan | 3D" pill
     in the map toolbar. Tap a block to open it.
   - Block view: the block's isometric render with its four floors marked;
     tap a floor (band or button) and the floor plans slide out of the
     building - each one cut to the block's outline and fitted to its floor -
     and lay flat into four strips of unit chips. Tapping a chip or a plot
     opens the existing unit panel (available), the notify form (coming
     soon) or nothing (reserved / sold). Tap the block itself to rest at the
     lifted stack; "Block" runs it back.

   Geometry (OH_BLOCK_GEO): per drawing type the unit polygons in the
   architect's floor-plan frame (1104x1093, from v1's per-position
   highlights); per render type the building outline in that frame, the
   isometric camera (tilt 54.74deg, azimuth psi, scale k) and per-floor
   translation fitted onto the floor-highlight bands (assets/oh/tools/
   block-fit/fit_iso.py), plus the band paths (860x640) themselves. The
   estate outlines are in the estate render's 1110x706 frame.
   ============================================================ */
(function () {
  if (window.__ohBlockView) return;
  window.__ohBlockView = true;

  var GEO = __OH_BLOCK_GEO__;

  var ESTATE_IMG = 'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/6ad07dd846fd3fd8d358d1ff_img-3d-estate-render-v2.webp';
  var TILT = 54.74;
  var TONE = { 4: '#491e0d', 3: '#7e452f', 2: '#af6042', 1: '#c7907b' };
  var ORD = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
  var FILL = { available: '#99ac99', reserved: '#ddb365', pending: '#ddb365', sold: '#ef9898', 'sold-out': '#ef9898', unreleased: '#ffffff' };
  var FO = { available: 0.62, reserved: 0.6, pending: 0.6, sold: 0.6, 'sold-out': 0.6, unreleased: 0.78 };
  var LABEL = { available: 'Available', reserved: 'Reserved', pending: 'Reserved', sold: 'Sold', 'sold-out': 'Sold', unreleased: 'Coming soon' };
  var EASE = 'cubic-bezier(0.2,0.8,0.2,1)';
  var SVGNS = 'http://www.w3.org/2000/svg';

  function units() { try { return window.ohSitePlan ? window.ohSitePlan.units() : []; } catch (e) { return []; } }
  function mapWrap() { return document.querySelector('.unit-filter_map'); }
  function mapBox() { return document.querySelector('.unit-filter_map-container'); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function svgEl(tag, attrs) { var e = document.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function salesOpen() { return document.documentElement.classList.contains('sales-open'); }
  function isDimmed(u) { var p = document.getElementById(u.plot_id); return !!(p && p.classList.contains('is-dimmed')); }
  function shortNo(u) { var n = String(u.unit_number || ''); var i = n.indexOf('-'); return i >= 0 ? n.slice(i + 1) : n; }
  function renderType(u) { var m = /img-3d-block-([a-z])-(\d)/i.exec(u.block_image_url || ''); return m ? (m[1] + m[2]).toLowerCase() : null; }
  function drawingType(u) { var m = /block-([ab]\d?)-floorplan/i.exec(u.block_floorplan_url || ''); return m ? m[1].toLowerCase() : null; }
  function blockOf(name) {
    var list = units().filter(function (u) { return String(u.block_name) === String(name); });
    return list.length ? { name: String(name), units: list } : null;
  }
  function availCount(list) { return list.filter(function (u) { return u.status_key === 'available'; }).length; }
  function price(u) { return (!u.prices_hidden && u.price_display) ? u.price_display : ''; }
  function lowest(list) {
    var av = list.filter(function (u) { return u.status_key === 'available' && u.price_value; });
    av.sort(function (a, b) { return a.price_value - b.price_value; });
    return av[0] ? price(av[0]) : '';
  }
  /* what a unit does when tapped: the same rules as the plan's plots */
  function pick(u) {
    if (!u || isDimmed(u)) return;
    if (u.status_key === 'available') { window.ohSitePlan.open(u.unit_number); return; }
    if (u.status_key === 'unreleased') {
      if (window.ohSheet && window.ohSheet.shouldUse()) window.ohSheet.open(u, 'soon');
      else if (window.ohNotify) window.ohNotify.open(u);
    }
  }

  /* ------------------------------------------------------------
     View switch: "View  Plan | 3D" in the map toolbar, same pill as colour-by
     ------------------------------------------------------------ */
  var estate = null, estateOn = false, viewSwitch = null;
  function buildSwitch() {
    var bar = document.querySelector('.unit-filter_map .site-plan_toolbar');
    if (!bar || viewSwitch) return;
    viewSwitch = document.querySelector('.oh-viewswitch');
    if (!haveSwitch()) return;
    if (viewSwitch.parentNode !== bar || bar.firstElementChild !== viewSwitch) bar.insertBefore(viewSwitch, bar.firstChild);
    viewSwitch.addEventListener('click', function (e) {
      var b = e.target.closest('[data-oh-view]'); if (!b) return;
      setEstate(b.getAttribute('data-oh-view') === 'estate');
    });
    viewSwitch.addEventListener('keydown', function (e) {
      var b = e.target.closest('[data-oh-view]'); if (!b) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEstate(b.getAttribute('data-oh-view') === 'estate'); }
    });
  }
  function haveSwitch() { if (viewSwitch) return true; console.warn('[block-view] native .oh-viewswitch missing on the page'); return false; }
  function setEstate(on) {
    estateOn = !!on;
    var w = mapWrap(); if (!w) return;
    if (estateOn) buildEstate();
    w.classList.toggle('is-oh-estate', estateOn);
    if (viewSwitch) viewSwitch.querySelectorAll('[data-oh-view]').forEach(function (b) {
      b.classList.toggle('is-active', (b.getAttribute('data-oh-view') === 'estate') === estateOn);
    });
    if (estateOn) paintEstate();
    document.dispatchEvent(new CustomEvent('oh:estate-view', { detail: { on: estateOn } }));
  }

  /* ------------------------------------------------------------
     Estate view
     ------------------------------------------------------------ */
  function buildEstate() {
    if (estate) return estate;
    var w = mapWrap(); if (!w) return null;
    estate = document.querySelector('[data-oh-native="estate"]');
    if (!estate) { console.warn('[block-view] native estate view missing on the page'); return null; }
    var svg = estate.querySelector('.oh-estate_svg svg') || estate.querySelector('svg');
    var img = estate.querySelector('.oh-estate_img');
    if (img && !img.getAttribute('src')) img.src = ESTATE_IMG;
    Object.keys(GEO.estate.paths).forEach(function (name) {
      /* the outlines are in the Designer embed; add any that are missing */
      var p = svg.querySelector('[data-block="' + name + '"]');
      if (!p) { p = svgEl('path', { 'data-block': name, 'class': 'oh-estate_block', role: 'button', tabindex: '0' }); svg.appendChild(p); }
      p.setAttribute('d', GEO.estate.paths[name]);  /* the geometry file is the source of truth */
      var open = function () { if (p.classList.contains('is-phase2')) return; openBlock(name); };
      p.addEventListener('click', open);
      p.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      p.addEventListener('mouseenter', function () { caption(name); });
      p.addEventListener('mouseleave', function () { caption(null); });
    });
    /* availability markers, one per block, sitting on the building */
    var marks = svg.querySelector('.oh-estate_marks');
    if (!marks) { marks = svgEl('g', { 'class': 'oh-estate_marks', 'aria-hidden': 'true' }); svg.appendChild(marks); }
    Object.keys(GEO.estate.paths).forEach(function (name) {
      if (marks.querySelector('[data-block="' + name + '"]')) return;
      var pts = GEO.estate.paths[name].replace(/[MZ]/g, '').trim().split(/\s+/).map(function (t) { return t.split(',').map(Number); });
      var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
      var cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, cy = Math.min.apply(null, ys) + (Math.max.apply(null, ys) - Math.min.apply(null, ys)) * 0.42;
      var g = svgEl('g', { 'class': 'oh-estate_mark', 'data-block': name, transform: 'translate(' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')' });
      g.appendChild(svgEl('rect', { x: -30, y: -13, width: 60, height: 26, rx: 13 }));
      var t = svgEl('text', { x: 0, y: 5, 'text-anchor': 'middle' }); t.textContent = name;
      g.appendChild(t);
      marks.appendChild(g);
    });
    estate.addEventListener('scroll', function () { estate.setAttribute('data-oh-panned', '1'); }, { passive: true });
    if (estate.parentNode !== w) w.appendChild(estate);
    layoutEstate();
    if (window.ResizeObserver) new ResizeObserver(layoutEstate).observe(w);
    return estate;
  }
  /* phone: the render is blown up past the pane and pans; desktop: it fits */
  function layoutEstate() {
    if (!estate) return;
    var w = mapWrap(); if (!w) return;
    var frame = estate.querySelector('.oh-estate_frame'); if (!frame) return;
    var pw = w.clientWidth || 390, ph = w.clientHeight || 500;
    var pan = pw < 700;
    estate.classList.toggle('is-pan', pan);
    /* the caption pill must not pan with the picture: on phones it lives on the map wrapper */
    var cap = (estate.querySelector('.oh-estate_cap') || w.querySelector('.oh-estate_cap'));
    if (cap) { if (pan && cap.parentNode !== w) w.appendChild(cap); else if (!pan && cap.parentNode !== frame) frame.appendChild(cap); }
    if (!pan) { frame.style.cssText = ''; return; }
    var fw = Math.max(pw * 1.9, 760), fh = fw * GEO.estate.frame[1] / GEO.estate.frame[0];
    frame.style.cssText = 'position:relative;width:' + fw + 'px;height:' + Math.max(fh, ph) + 'px';
    if (!estate.getAttribute('data-oh-panned')) {
      estate.scrollLeft = (fw - pw) / 2 + fw * 0.02;
      estate.scrollTop = Math.max(0, (Math.max(fh, ph) - ph) / 2);
    }
  }
  function caption(name) {
    var cap = estate && (estate.querySelector('.oh-estate_cap') || mapWrap().querySelector('.oh-estate_cap')); if (!cap) return;
    var b = name ? blockOf(name) : null;
    if (!b) {
      var all = units(); var av = availCount(all);
      cap.textContent = salesOpen() ? (av + ' of ' + all.length + ' homes available · tap a block') : 'Tap a block to open it';
      return;
    }
    var av2 = availCount(b.units);
    cap.textContent = 'Block ' + b.name + ' · ' + (!salesOpen() ? b.units.length + ' homes' : (av2 ? av2 + ' of ' + b.units.length + ' available' : (b.units.every(function (u) { return u.status_key === 'unreleased'; }) ? 'coming soon' : 'sold out')));
  }
  function paintEstate() {
    if (!estate) return;
    var sel = (window.ohSitePlan.active('block') || []).map(function (v) { return String(v).toLowerCase(); });
    estate.querySelectorAll('.oh-estate_block').forEach(function (p) {
      var b = blockOf(p.getAttribute('data-block')); if (!b) return;
      var av = availCount(b.units);
      var soon = b.units.every(function (u) { return u.status_key === 'unreleased'; });   /* phase 2 */
      var listed = b.units.some(function (u) { return u.status_key === 'available' && !isDimmed(u); });
      var phase2 = soon && salesOpen();
      p.classList.toggle('is-phase2', phase2);
      p.classList.toggle('is-open', !phase2 && (av > 0 || !salesOpen()));
      p.classList.toggle('is-dimmed', salesOpen() && !listed && !soon);
      p.classList.toggle('is-selected', sel.indexOf(b.name.toLowerCase()) >= 0);
      if (phase2) { p.setAttribute('aria-disabled', 'true'); p.setAttribute('tabindex', '-1'); } else { p.removeAttribute('aria-disabled'); p.setAttribute('tabindex', '0'); }
      p.setAttribute('aria-label', 'Block ' + b.name + ', ' + (salesOpen() ? (phase2 ? 'phase 2, coming soon' : av + ' of ' + b.units.length + ' available') : b.units.length + ' homes'));
      var mk = estate.querySelector('.oh-estate_mark[data-block="' + b.name + '"]');
      if (mk) {
        var label = !salesOpen() ? b.name : (phase2 ? b.name : (av > 0 ? b.name + ' · ' + av : b.name + ' · 0'));
        var t = mk.querySelector('text'); t.textContent = label;
        var wdt = Math.max(60, label.length * 11 + 22); mk.querySelector('rect').setAttribute('x', -wdt / 2); mk.querySelector('rect').setAttribute('width', wdt);
        mk.classList.toggle('is-phase2', phase2); mk.classList.toggle('is-open', !phase2 && av > 0); mk.classList.toggle('is-soldout', !phase2 && salesOpen() && av === 0);
        mk.classList.toggle('is-dimmed', salesOpen() && !listed && !soon);
      }
    });
    caption(null);
  }

  /* ------------------------------------------------------------
     Block view
     ------------------------------------------------------------ */
  var bv = null, cur = null, mode = 'block', timer = null, sel = null, facetBefore = null;
  var R = {};  /* geometry for the current block */

  function hatch(P) {
    /* diagonal hatch (spacing 32 drawing px) clipped to a polygon */
    var mn = Infinity, mx = -Infinity, d = '', i;
    for (i = 0; i < P.length; i++) { var c0 = P[i][0] - P[i][1]; if (c0 < mn) mn = c0; if (c0 > mx) mx = c0; }
    for (var c = Math.ceil(mn / 32) * 32 + 8; c < mx; c += 32) {
      var hits = [];
      for (i = 0; i < P.length; i++) {
        var a = P[i], b = P[(i + 1) % P.length];
        var fa = a[0] - a[1] - c, fb = b[0] - b[1] - c;
        if ((fa < 0) !== (fb < 0)) { var t = fa / (fa - fb); hits.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      hits.sort(function (p, q) { return p[0] - q[0]; });
      for (var k = 0; k + 1 < hits.length; k += 2) d += 'M' + hits[k][0].toFixed(1) + ' ' + hits[k][1].toFixed(1) + 'L' + hits[k + 1][0].toFixed(1) + ' ' + hits[k + 1][1].toFixed(1);
    }
    return d || 'M0 0';
  }
  function centroid(P) {
    var x = 0, y = 0; P.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / P.length, y / P.length];
  }

  function build() {
    if (bv) return bv;
    var w = mapWrap(); if (!w) return null;
    bv = document.querySelector('[data-oh-native="block"]');
    if (!bv) { console.warn('[block-view] native block view missing on the page'); return null; }
    if (bv.parentNode !== w) w.appendChild(bv);
    /* templates: one of each is in the Designer; lift them out and clone per floor */
    T.strip = take(bv, '[data-oh-template="strip"]');
    T.chip = T.strip && take(T.strip, '.oh-bv_chip');
    T.wrap = take(bv, '[data-oh-template="wrap"]');
    T.tag = take(bv, '[data-oh-template="tag"]');
    if (!T.strip || !T.chip || !T.wrap || !T.tag) { console.warn('[block-view] block view templates missing'); bv = null; return null; }
    var press = function (sel, fn) {
      var n = bv.querySelector(sel); if (!n) return;
      n.addEventListener('click', function (e) { e.preventDefault(); fn(); });
      n.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
      if (!n.hasAttribute('tabindex') && n.tagName !== 'A') n.setAttribute('tabindex', '0');
    };
    press('.oh-bv_back', closeBlock);
    press('.oh-bv_mode', function () { go(mode === 'block' ? 'stack' : 'block'); });
    press('.oh-bv_cover', function () { go(mode === 'block' ? 'stack' : 'flat'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && cur && !document.querySelector('.site-plan_detail-wrap.is-open')) closeBlock(); });
    if (window.ResizeObserver) new ResizeObserver(function () { if (cur) layout(); }).observe(bv);
    return bv;
  }
  var T = {};
  function take(root, sel) {
    var n = root.querySelector(sel); if (!n) return null;
    n.parentNode.removeChild(n); n.removeAttribute('data-oh-template'); return n;
  }
  function clone(t) { return t.cloneNode(true); }
  function setText(root, sel, txt) { var n = root.querySelector(sel); if (n) n.textContent = txt; }

  /* ---- open / close ---- */
  function openBlock(name, opts) {
    var b = blockOf(name); if (!b) return false;
    var rt = renderType(b.units[0]), dt = drawingType(b.units[0]);
    if (!rt || !GEO.renders[rt] || !dt || !GEO.drawings[dt]) { console.warn('[block-view] no geometry for block', name, rt, dt); return false; }
    build();
    cur = b; sel = null;
    R = { rt: rt, dt: dt, g: GEO.renders[rt], d: GEO.drawings[dt], img: b.units[0].block_image_url, plan: b.units[0].block_floorplan_url };
    /* the list beside the plan follows the block: set the Block facet, and
       remember what was selected so Back can put it back */
    facetBefore = window.ohSitePlan.active('block').slice();
    facetBefore.forEach(function (v) { if (String(v) !== b.name) window.ohSitePlan.toggle('block', v, false); });
    if (!window.ohSitePlan.isActive('block', b.name)) window.ohSitePlan.toggle('block', b.name, true);
    populate();
    var w = mapWrap();
    w.classList.add('is-oh-block');
    bv.scrollTop = 0;
    mode = 'block';
    render();
    try { history.replaceState(null, '', setParam(location.href, 'block', b.name)); } catch (e) {}
    if (opts && opts.floor) setTimeout(function () { openFloor(Number(opts.floor)); }, 60);
    document.dispatchEvent(new CustomEvent('oh:block-open', { detail: { block: b.name } }));
    return true;
  }
  function closeBlock() {
    if (!cur) return;
    var name = cur.name;
    cur = null; if (timer) clearTimeout(timer);
    mapWrap().classList.remove('is-oh-block');
    /* restore the Block facet as it was */
    if (facetBefore) {
      if (facetBefore.indexOf(name) < 0 && window.ohSitePlan.isActive('block', name)) window.ohSitePlan.toggle('block', name, false);
      facetBefore.forEach(function (v) { if (!window.ohSitePlan.isActive('block', v)) window.ohSitePlan.toggle('block', v, true); });
      facetBefore = null;
    }
    try { history.replaceState(null, '', setParam(location.href, 'block', null)); } catch (e) {}
    if (estate) paintEstate();
    document.dispatchEvent(new CustomEvent('oh:block-close', { detail: { block: name } }));
  }
  function setParam(href, key, val) {
    var u = new URL(href); if (val == null) u.searchParams.delete(key); else u.searchParams.set(key, val);
    return u.pathname + (u.search || '') + u.hash;
  }

  /* ---- the mode sequencer ---- */
  var PATH = {
    block: { merge: ['merge'], stack: ['merge', 'stack'], flat: ['merge', 'flat'] },
    merge: { block: ['block'], stack: ['stack'], flat: ['flat'] },
    stack: { block: ['merge', 'block'], merge: ['merge'], flat: ['flat'] },
    flat: { block: ['merge', 'block'], merge: ['merge'], stack: ['stack'] }
  };
  var WAIT = { 'block>merge': 260, 'flat>merge': 1500, 'stack>merge': 1500 };
  function go(target) {
    if (!cur) return;
    if (timer) clearTimeout(timer);
    var steps = ((PATH[mode] || {})[target] || []).slice();
    var prev = mode;
    var step = function () {
      var m = steps.shift(); if (!m) return;
      mode = m; render();
      if (steps.length) timer = setTimeout(step, WAIT[prev + '>' + m] || 0);
      prev = m;
    };
    step();
  }
  function openFloor(f) {
    var us = cur.units.filter(function (u) { return u.floor_level === f; });
    var first = us.filter(function (u) { return u.status_key === 'available' && !isDimmed(u); })[0] || us[0];
    sel = first || null;
    go('flat');
    paintSelection();
  }

  /* ---- DOM for the current block (built once per open) ---- */
  function populate() {
    var floors = [4, 3, 2, 1];
    var head = bv.querySelector('.oh-bv_head');
    head.querySelector('.oh-bv_name').textContent = 'Block ' + cur.name;
    var av = availCount(cur.units);
    head.querySelector('.oh-bv_sub').textContent = salesOpen() ? (av + ' of ' + cur.units.length + ' homes available') : (cur.units.length + ' homes');
    var rimg = bv.querySelector('.oh-bv_render'); rimg.removeAttribute('srcset'); rimg.removeAttribute('sizes'); rimg.src = R.img;
    bv.querySelector('.oh-bv_render').alt = 'Isometric render of Block ' + cur.name;

    /* floor bands on the render, in the floor's tone */
    var bandsBox = bv.querySelector('.oh-bv_bands');
    var bands = bandsBox.querySelector('svg') || bandsBox; bands.innerHTML = '';
    floors.forEach(function (f) {
      (R.g.bands[String(f)] || []).forEach(function (d) {
        var p = svgEl('path', { d: d, fill: TONE[f], 'fill-opacity': '0.68', stroke: '#ffffff', 'stroke-width': '2', 'stroke-linejoin': 'round', 'data-floor': f });
        p.addEventListener('click', function () { openFloor(f); });
        bands.appendChild(p);
      });
    });

    /* slices: one plate per floor, clipped to the building outline */
    var hull = R.g.hull.map(function (p) { return (p[0] / 1104 * 100).toFixed(2) + '% ' + (p[1] / 1093 * 100).toFixed(2) + '%'; }).join(',');
    var slices = bv.querySelector('.oh-bv_slices'); slices.innerHTML = '';
    var strips = bv.querySelector('.oh-bv_strips'); strips.innerHTML = '';
    var tags = bv.querySelector('.oh-bv_tags'); tags.innerHTML = '';
    floors.forEach(function (f, i) {
      var us = cur.units.filter(function (u) { return u.floor_level === f; });
      var wrap = clone(T.wrap); wrap.setAttribute('data-floor', f); wrap.style.zIndex = 10 - i;
      var plate = wrap.querySelector('.oh-bv_plate'); plate.style.clipPath = 'polygon(' + hull + ')';
      var img = wrap.querySelector('.oh-bv_plan'); img.src = R.plan; img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.alt = 'Floor plan of the ' + ORD[f] + ' floor of Block ' + cur.name; img.draggable = false;
      var plotsBox = wrap.querySelector('.oh-bv_plots');
      var svg = plotsBox.querySelector('svg') || plotsBox; svg.innerHTML = '';
      svg.setAttribute('viewBox', '0 0 1104 1093'); svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Plan of the ' + ORD[f] + ' floor, ' + availCount(us) + ' of ' + us.length + ' homes available');
      var hp = svgEl('polygon', { points: R.g.hull.map(function (p) { return p.join(','); }).join(' '), fill: 'none', stroke: '#5f4d3f', 'stroke-width': '10', 'stroke-linejoin': 'round', 'class': 'oh-bv_outline' });
      svg.appendChild(hp);
      us.forEach(function (u) {
        var P = R.d.units[String(u.onfloor_label || '').padStart(2, '0')];
        if (!P) return;
        var g = svgEl('g', { 'data-unit': u.plot_id, 'data-status': u.status_key, 'class': 'oh-bv_plot' });
        var poly = svgEl('polygon', { points: P.map(function (p) { return p.join(','); }).join(' '), fill: FILL[u.status_key] || '#fff', 'fill-opacity': FO[u.status_key] || 0.6, stroke: '#5f4d3f', 'stroke-width': '5', 'stroke-linejoin': 'round' });
        g.appendChild(poly);
        if (u.status_key === 'unreleased') g.appendChild(svgEl('path', { d: hatch(P), fill: 'none', stroke: '#8d8b87', 'stroke-width': '6', 'pointer-events': 'none' }));
        var c = centroid(P);
        var t = svgEl('text', { x: c[0], y: c[1] + 32, 'text-anchor': 'middle', 'font-size': '92', 'class': 'oh-bv_plot-no' });
        t.textContent = String(u.onfloor_label || shortNo(u).slice(-2));
        g.appendChild(t);
        g.addEventListener('click', function () { if (mode === 'flat') pick(u); else openFloor(f); });
        svg.appendChild(g);
      });
      slices.appendChild(wrap);

      /* strip: floor summary + chips */
      var strip = clone(T.strip); strip.setAttribute('data-floor', f);
      var low = lowest(us);
      setText(strip, '.oh-bv_strip-label', ORD[f] + ' floor');
      setText(strip, '.oh-bv_strip-count', '');
      setText(strip, '.oh-bv_strip-from', low ? 'from ' + low : '');
      var chips = strip.querySelector('.oh-bv_chips'); chips.innerHTML = '';
      us.filter(function (u) { return u.status_key !== 'unreleased'; }).forEach(function (u) {
        var btn = clone(T.chip); btn.classList.add('is-' + u.status_key);
        btn.setAttribute('data-unit', u.plot_id);
        var sub = u.status_key === 'available' ? (price(u) || LABEL.available) : LABEL[u.status_key];
        setText(btn, '.oh-bv_chip-no', shortNo(u)); setText(btn, '.oh-bv_chip-sub', sub);
        btn.setAttribute('aria-label', 'Unit ' + u.unit_number + ', ' + sub);
        var hit = function (e) { e.preventDefault(); sel = u; paintSelection(); pick(u); };
        btn.addEventListener('click', hit);
        btn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') hit(e); });
        chips.appendChild(btn);
      });
      if (!chips.children.length) chips.innerHTML = '<span class="oh-bv_chips-empty">All homes on this floor are coming soon</span>';
      strips.appendChild(strip);

      /* floor button */
      var tag = clone(T.tag); tag.setAttribute('data-floor', f);
      var sw = tag.querySelector('.oh-bv_swatch'); if (sw) sw.style.background = TONE[f];
      setText(tag, '.oh-bv_tag-label', ORD[f] + ' floor'); setText(tag, '.oh-bv_tag-sub', '');
      tag.addEventListener('click', function (e) { e.preventDefault(); openFloor(f); });
      tag.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFloor(f); } });
      tags.appendChild(tag);
    });
    paintCounts();
  }

  /* counts and dimming follow the filters */
  function paintCounts() {
    if (!cur || !bv) return;
    [4, 3, 2, 1].forEach(function (f) {
      var us = cur.units.filter(function (u) { return u.floor_level === f; });
      var free = us.filter(function (u) { return u.status_key === 'available' && !isDimmed(u); }).length;
      var soon = us.length && us.every(function (u) { return u.status_key === 'unreleased'; });
      var txt = !salesOpen() ? (us.length + ' homes') : (free ? (free + ' of ' + us.length + ' available') : (soon ? 'Coming soon' : 'Sold out'));
      var strip = bv.querySelector('.oh-bv_strip[data-floor="' + f + '"] .oh-bv_strip-count'); if (strip) strip.textContent = txt;
      var tag = bv.querySelector('.oh-bv_tag[data-floor="' + f + '"] .oh-bv_tag-sub'); if (tag) { tag.textContent = !salesOpen() ? (us.length + ' homes') : (free ? (free + ' of ' + us.length + ' available') : (soon ? 'Coming soon' : 'Sold out')); tag.classList.toggle('is-sold', salesOpen() && !free && !soon); }
      if (strip) strip.classList.toggle('is-sold', salesOpen() && !free && !soon);
      var t = bv.querySelector('.oh-bv_tag[data-floor="' + f + '"]'); if (t) t.setAttribute('aria-label', 'Open the ' + ORD[f] + ' floor, ' + txt);
    });
    cur.units.forEach(function (u) {
      var off = isDimmed(u);
      bv.querySelectorAll('[data-unit="' + u.plot_id + '"]').forEach(function (n) { n.classList.toggle('is-dimmed', off); });
    });
  }
  function paintSelection() {
    if (!bv) return;
    bv.querySelectorAll('.is-selected').forEach(function (n) { n.classList.remove('is-selected'); });
    if (sel) bv.querySelectorAll('[data-unit="' + sel.plot_id + '"]').forEach(function (n) { n.classList.add('is-selected'); });
  }

  /* ---- layout + mode ---- */
  var U = 1, S = 390, RW = 420, RH = 420 * 1026 / 1356, PLATE = 124, STRIP = 168, STACK = 88, DESK = false, H = 700;
  function measure() {
    var w = bv.clientWidth || 390;
    DESK = w >= 700;
    H = bv.clientHeight || 700;
    if (DESK) {
      S = Math.min(w, 1240); U = 1.1;
      var legend = bv.querySelector('.oh-bv_legend'), head = bv.querySelector('.oh-bv_head');
      var avail = H - (head ? head.offsetHeight : 56) - (legend ? legend.offsetHeight : 28) - 110 * U;  /* room for the hint */
      RW = Math.min(S * 0.66, Math.max(400, avail * 1356 / 1026)); RH = RW * 1026 / 1356;
      PLATE = 124 * U; STRIP = 168 * U; STACK = Math.max(88 * U, Math.min(150, (H - 300) / 4));
    } else {
      S = Math.min(w, 520); U = S / 390;
      RW = 420 * U; RH = RW * 1026 / 1356; PLATE = 124 * U; STRIP = 168 * U; STACK = 88 * U;
    }
  }
  /* bbox of a floor's bands (860x640 render frame) in stage px */
  function bandBox(f, left0, top0) {
    var sx = RW / 860, sy = RH / 640, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    (R.g.bands[String(f)] || []).forEach(function (d) {
      var cx = 0, cy = 0, cmd = '';
      d.replace(/([MLHVZmlhvz])|(-?[\d.]+)(?:[ ,]+(-?[\d.]+))?/g, function (m, c, a, b) {
        if (c) { cmd = c; return ''; }
        a = parseFloat(a); b = b == null ? NaN : parseFloat(b);
        if (cmd === 'M' || cmd === 'L') { cx = a; cy = b; }
        else if (cmd === 'm' || cmd === 'l') { cx += a; cy += b; }
        else if (cmd === 'H') cx = a; else if (cmd === 'h') cx += a;
        else if (cmd === 'V') cy = a; else if (cmd === 'v') cy += a;
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        return '';
      });
    });
    if (x0 === Infinity) return null;
    return { x0: left0 + x0 * sx, x1: left0 + x1 * sx, y0: top0 + y0 * sy, y1: top0 + y1 * sy };
  }
  function linesSvg() {
    var box = bv.querySelector('.oh-bv_lines');
    if (!box) { box = el('div', 'oh-bv_lines'); bv.querySelector('.oh-bv_stage').appendChild(box); }
    var svg = box.querySelector('svg');
    if (!svg) { svg = svgEl('svg', { style: 'display:block;width:100%;height:100%;overflow:visible' }); box.appendChild(svg); }
    return svg;
  }
  /* hull bbox under the linear part of the camera, in plate px: used to place the stack */
  function hullBox(k) {
    var a = cam(k), xs = [], ys = [];
    R.g.hull.forEach(function (p) {
      var x = p[0] * PLATE / 1104, y = p[1] * PLATE / 1104;
      xs.push(a[0] * x + a[2] * y); ys.push(a[1] * x + a[3] * y);
    });
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
  }
  /* 2x2 linear part for scale k (plate px -> stage px): k * diag(1,cos tilt) * R(psi), column-major a b c d */
  function cam(k) {
    var psi = R.g.psi * Math.PI / 180, c = Math.cos(psi), s = Math.sin(psi), ct = Math.cos(TILT * Math.PI / 180);
    return [k * c, k * ct * s, -k * s, k * ct * c];
  }
  function render() {
    if (!cur || !bv) return;
    measure();
    var flat = mode === 'flat', inCtx = mode === 'block' || mode === 'merge', stack = mode === 'stack';
    var box0 = hullBox(mode === 'stack' ? R.g.k * (RW / 1356) * 1104 / PLATE * (DESK ? 1.15 : 0.78) : R.g.k * (RW / 1356) * 1104 / PLATE);
    var left0 = DESK ? S * 0.06 : (S - RW) / 2, top0 = DESK ? 24 * U : 10 * U;   /* render box in the stage */
    var sR = RW / 1356;                                        /* render px -> stage px */
    var kCtx = R.g.k * sR * 1104 / PLATE;                      /* plate px -> stage px, in context */
    var kStack = kCtx * (DESK ? 1.15 : 0.78);
    var tagsTop = top0 + RH + 14 * U;
    /* desktop flat: a 2x2 grid of floor strips */
    var CW = S / 2, CH = DESK ? Math.max(STRIP * 1.6, (H - 90) / 2) : STRIP, FW = DESK ? Math.min(CW * 0.5, 300) : PLATE;
    var stageH = flat ? (DESK ? 2 * CH : 4 * STRIP) : (stack ? (DESK ? Math.max(4 * STACK + 150 * U, H - 90) : 4 * STACK + 130 * U + 80 * U) : (DESK ? top0 + RH + 110 * U : tagsTop + 2 * 56 * U + 86 * U));
    var stackCx = DESK ? S * 0.36 : S * 0.34, stackTop = DESK ? 70 * U : 70 * U;
    var tagX = DESK ? (stack ? S * 0.68 : left0 + RW + 20 * U) : S * 0.6, tagW = DESK ? Math.min(230, S - tagX - 14 * U) : S * 0.36;
    /* desktop tag rows beside the floors, spaced at least a tag apart */
    var rows = {};
    if (DESK && !flat) {
      var ys = [4, 3, 2, 1].map(function (f) {
        var bb = stack ? null : bandBox(f, left0, top0);
        return bb ? (bb.y0 + bb.y1) / 2 : 0;
      });
      if (stack) ys = [4, 3, 2, 1].map(function (f, i) { return stackTop + i * STACK + (box0.y1 - box0.y0) / 2; });
      var minGap = 56 * U, cy = -Infinity;
      ys.forEach(function (y, i) { y = Math.max(y, cy + minGap); rows[[4, 3, 2, 1][i]] = y; cy = y; });
    }
    var lines = linesSvg(); lines.innerHTML = '';
    lines.parentNode.style.cssText = 'opacity:' + (DESK && mode === 'block' ? 1 : 0);
    var stage = bv.querySelector('.oh-bv_stage');
    if (DESK) { var head0 = bv.querySelector('.oh-bv_head'), leg0 = bv.querySelector('.oh-bv_legend'); stageH = Math.max(stageH, H - (head0 ? head0.offsetHeight : 56) - (leg0 ? leg0.offsetHeight : 28)); }
    stage.style.height = stageH + 'px';
    stage.style.width = S + 'px';
    stage.style.maxWidth = DESK ? 'none' : '';
    bv.classList.toggle('is-flat', flat); bv.classList.toggle('is-stack', stack); bv.classList.toggle('is-ctx', inCtx);
    bv.setAttribute('data-mode', mode);
    var img = bv.querySelector('.oh-bv_render');
    img.style.cssText = 'left:' + left0 + 'px;top:' + top0 + 'px;width:' + RW + 'px;height:' + RH + 'px;opacity:' + (mode === 'block' || mode === 'merge' ? 1 : 0);
    var bands = bv.querySelector('.oh-bv_bands');
    bands.style.cssText = 'left:' + left0 + 'px;top:' + top0 + 'px;width:' + RW + 'px;height:' + RH + 'px;opacity:' + (mode === 'block' ? 1 : 0) + ';pointer-events:none';
    bv.querySelector('.oh-bv_mode-label').textContent = mode === 'block' ? 'Floors' : 'Block';
    bv.querySelector('.oh-bv_mode').setAttribute('aria-label', mode === 'block' ? 'Open the block up into its floors' : 'Put the floors back into the block');
    var hint = bv.querySelector('.oh-bv_hint');
    hint.querySelector('.oh-bv_hint-title').textContent = 'Four floors, ' + cur.units.length + ' homes';
    hint.querySelector('.oh-bv_hint-text').textContent = mode === 'block' ? 'Pick a floor, or tap the block to open it up.' : 'Pick a floor, or tap to lay them all out flat.';
    hint.style.cssText = (DESK ? 'left:' + left0 + 'px;right:auto;width:' + RW + 'px;' : '') + 'top:' + (stageH - 62 * U) + 'px;opacity:' + (flat ? 0 : 1);
    var cover = bv.querySelector('.oh-bv_cover');
    cover.style.display = flat ? 'none' : '';
    cover.style.cssText += DESK ? ';left:' + left0 + 'px;top:' + top0 + 'px;width:' + RW + 'px;height:' + RH + 'px;right:auto;bottom:auto' : '';
    cover.setAttribute('aria-label', mode === 'block' ? 'Open the block up into its floors' : 'Lay the floors out as plans');

    var box = box0;
    [4, 3, 2, 1].forEach(function (f, i) {
      var wrap = bv.querySelector('.oh-bv_wrap[data-floor="' + f + '"]');
      var plate = wrap.firstChild;
      var tf, shadow;
      wrap.style.width = PLATE + 'px'; wrap.style.height = PLATE * 1093 / 1104 + 'px';
      if (flat) {
        var cellX = DESK ? (i % 2) * CW : 0, cellY = DESK ? Math.floor(i / 2) * CH : i * STRIP;
        tf = 'translate(' + (cellX + 16 * U) + 'px,' + (cellY + 36 * U) + 'px) rotateX(0deg) rotateZ(0deg) scale(' + (FW / PLATE) + ')';
        shadow = 'drop-shadow(0 0 0 rgba(0,0,0,0))';
      } else if (inCtx) {
        var tx = R.g.tx * sR + left0, ty = R.g.ty[String(f)] * sR + top0;
        tf = 'translate(' + tx + 'px,' + ty + 'px) rotateX(' + TILT + 'deg) rotateZ(' + R.g.psi + 'deg) scale(' + kCtx + ')';
        shadow = 'drop-shadow(0 4px 0 #b9b6ae)';
      } else {
        var cx = stackCx, cy = stackTop + i * STACK + (box.y1 - box.y0) / 2;
        var tx2 = cx - (box.x0 + box.x1) / 2, ty2 = cy - (box.y0 + box.y1) / 2;
        tf = 'translate(' + tx2 + 'px,' + ty2 + 'px) rotateX(' + TILT + 'deg) rotateZ(' + R.g.psi + 'deg) scale(' + kStack + ')';
        shadow = 'drop-shadow(0 8px 0 #b9b6ae) drop-shadow(0 14px 10px rgba(95,77,63,.22))';
      }
      plate.style.transform = tf;
      wrap.style.filter = shadow;
      /* no ghost: the plates appear solid on the building (merge) and only then move */
      wrap.style.transition = (mode === 'merge' || mode === 'block') ? 'none' : '';
      wrap.style.opacity = mode === 'block' ? 0 : 1;
      wrap.style.pointerEvents = mode === 'block' ? 'none' : 'auto';
      var strip = bv.querySelector('.oh-bv_strip[data-floor="' + f + '"]');
      if (DESK) strip.style.cssText = 'left:' + ((i % 2) * CW) + 'px;width:' + CW + 'px;top:' + (Math.floor(i / 2) * CH) + 'px;height:' + CH + 'px;opacity:' + (flat ? 1 : 0) + ';pointer-events:' + (flat ? 'auto' : 'none') + (i % 2 ? ';border-left:1px solid var(--oh-line)' : '');
      else strip.style.cssText = 'top:' + (i * STRIP) + 'px;height:' + STRIP + 'px;opacity:' + (flat ? 1 : 0) + ';pointer-events:' + (flat ? 'auto' : 'none');
      strip.querySelector('.oh-bv_chips').style.marginLeft = (FW + 12 * U) + 'px';
      var tag = bv.querySelector('.oh-bv_tag[data-floor="' + f + '"]');
      if (DESK && !flat) {
        var ty0 = rows[f] - 24 * U;
        tag.style.cssText = 'left:' + tagX + 'px;top:' + ty0 + 'px;width:' + tagW + 'px;opacity:1';
        if (mode === 'block') {
          var bb = bandBox(f, left0, top0);
          if (bb) {
            var ax = bb.x1 - 6 * U, ay = (bb.y0 + bb.y1) / 2, mx = tagX - 14 * U;
            lines.appendChild(svgEl('path', { d: 'M' + ax + ' ' + ay + 'L' + mx + ' ' + rows[f] + 'L' + tagX + ' ' + rows[f], fill: 'none', stroke: TONE[f], 'stroke-width': '1.5' }));
            lines.appendChild(svgEl('circle', { cx: ax, cy: ay, r: 3.5, fill: TONE[f], stroke: '#fff', 'stroke-width': '1.5' }));
          }
        }
      } else if (stack) {
        tag.style.cssText = 'left:' + tagX + 'px;top:' + (stackTop + i * STACK + (box.y1 - box.y0) / 2 - 24 * U) + 'px;width:' + tagW + 'px;opacity:1';
      } else {
        tag.style.cssText = 'left:' + (i % 2 ? S / 2 + 4 * U : 16 * U) + 'px;top:' + (tagsTop + (i < 2 ? 0 : 56 * U)) + 'px;width:' + (S / 2 - 20 * U) + 'px;opacity:' + (flat ? 0 : 1) + (flat ? ';pointer-events:none' : '');
      }
    });
    /* bands keep their tone for the plan of the same floor: tint the plate's outline */
    bv.querySelectorAll('.oh-bv_wrap').forEach(function (w) { w.querySelector('.oh-bv_outline').setAttribute('stroke', flat ? '#5f4d3f' : TONE[w.getAttribute('data-floor')]); });
    paintSelection();
  }
  function layout() { render(); }

  /* ------------------------------------------------------------
     Entry points
     ------------------------------------------------------------ */
  /* tapping a block hull on the site plan opens the block view (the plan's
     own handler toggles the Block facet; this runs first and stops it) */
  document.addEventListener('click', function (e) {
    var p = e.target.closest && e.target.closest('.site-plan_map-svg .site-plan_block');
    if (!p || !window.ohSitePlan) return;
    var name = p.getAttribute('data-block'); if (!name) return;
    if (window.ohMapView && window.ohMapView.dragging && window.ohMapView.dragging()) return;
    e.stopPropagation(); e.preventDefault();
    openBlock(name);
  }, true);

  function boot() {
    if (!window.ohSitePlan || !units().length) { setTimeout(boot, 250); return; }
    buildSwitch();
    window.ohSitePlan.onChange(function () { if (estate) paintEstate(); paintCounts(); });
    document.addEventListener('oh:sales-phase', function () { if (estate) paintEstate(); paintCounts(); });
    var q = new URLSearchParams(location.search);
    var b = q.get('block');
    if (b && blockOf(b.toUpperCase())) {
      var open = function () { openBlock(b.toUpperCase(), { floor: q.get('floor') }); };
      if (document.documentElement.classList.contains('oh-reveal')) document.addEventListener('oh:map-revealed', open, { once: true });
      else open();
    } else if (q.get('view') === '3d') setEstate(true);
  }
  window.ohBlockView = {
    open: openBlock, close: closeBlock, current: function () { return cur ? cur.name : null; },
    mode: function () { return mode; }, go: go, floor: openFloor,
    estate: setEstate, geo: GEO
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
