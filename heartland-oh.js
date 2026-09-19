/* ============================================================================
   heartland-oh.js — Oak Hills Estate, unit selection v2
   Source of truth for the /unit-selection-v2 page. Forked from
   heartland-sv.js (Stellenbosch Village) on 2026-09-14 and adapted for a
   development made of blocks (A–L) with several floors each.

   What is different from the SV file
   - Data comes from the "Oak Hills v2" Xano group (api:BHoGDH-q), already
     flat: every unit carries its block, floor level, type specs and media.
     boot() does no variant flattening.
   - The map is one top-down SVG with a layer per floor:
       <g data-floor="1"> … <g data-floor="4">, each holding the unit shapes
       for that level with id = oh_units.plot_id ("unit-1-101"). Only the
       current level is shown; a floor switcher (Designer element
       [data-floor-switch], or one the script builds in .unit-filter_map)
       changes level AND sets the Floor filter so the list follows. Opening
       a unit from the list or a deep link moves the view without filtering.
     Optional block footprints (id="block-a" … "block-l", oh_buildings.plot_id)
     sit under the layers: coloured by availability, dimmed when nothing
     visible is inside, click toggles the Block filter. Without any
     [data-floor] group the plan is flat and works as before.
   - Everything Wized-facing is prefixed v2_ (requests, variables, element
     names) so nothing collides with the live page's wiring.
   - The reserve flow places the Xano hold first, then hands over to BOL.
   - Dropped: view badges, wetland strip, satellite reveal, audio unlock.
   ============================================================================ */

/* ============================================================
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
  /* desktop: filters | plan | list - the list leaves .unit-filter_main so the
     component grid can give it its own column */
  var comp = document.querySelector('.unit-filter_component');
  var listWrap = document.querySelector('.site-plan_list-wrap');
  if (comp && listWrap && listWrap.parentNode !== comp) comp.appendChild(listWrap);
  var cb = document.querySelector('.site-plan_colourby');
  if (cb && !cb.querySelector('.site-plan_switch-label')) {
    var l = document.createElement('span');
    l.className = 'site-plan_switch-label';
    l.textContent = 'Colour by';
    cb.insertBefore(l, cb.firstChild);
  }

  /* Mobile labels. The colour-by toggle, the legend and the level switch float
     on the plan on small screens, so every label carries a short form as well:
     both are in the DOM and the CSS picks one (.oh-lbl-full/.oh-lbl-short), so
     nothing has to listen for resizes or re-run after a re-render. */
  function shortLabel(el, short) {
    if (!el || el.querySelector('.oh-lbl-full')) return;
    var full = (el.textContent || '').trim();
    if (!full || !short || short === full) return;
    el.textContent = '';
    var f = document.createElement('span'); f.className = 'oh-lbl-full'; f.textContent = full;
    var t = document.createElement('span'); t.className = 'oh-lbl-short'; t.textContent = short;
    el.appendChild(f); el.appendChild(t);
  }
  window.ohShortLabel = shortLabel;
  var SHORT = { 'Availability': 'Status', 'Unit type': 'Type', 'Available': 'Avail', 'Reserved': 'Res', 'Pending': 'Pend', 'Sold': 'Sold', 'Sold out': 'Out', 'Coming soon': 'Soon', 'Directional View': 'View' };
  document.querySelectorAll('.site-plan_colourby-btn').forEach(function (b) {
    shortLabel(b, SHORT[(b.textContent || '').trim()]);
  });
  document.querySelectorAll('.site-plan_legend-item').forEach(function (item) {
    var label = Array.prototype.slice.call(item.children).filter(function (c) {
      return !c.classList.contains('site-plan_legend-swatch') && !c.classList.contains('site-plan_legend-count');
    })[0];
    if (!label) return;
    var full = (label.textContent || '').trim();
    shortLabel(label, SHORT[full] || (/^Type\s+/.test(full) ? full.replace(/^Type\s+/, '') : null));
  });

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
  /* Map reveal - the Stellenbosch Village pattern. html.oh-reveal is stamped
     before first paint (head snippet): the plan is hidden and slightly scaled
     up, the filters and the list sit off their own sides, and the floating
     controls, the mobile toolbar and the footer bar are transparent. Three
     milestones say when the map is real - the plan SVG, the unit data and the
     background image - and then the whole thing settles in, staggered from the
     plan outwards (transitions live under html.oh-reveal-go, so nothing else
     the page does later animates). A 9s timeout plays it regardless, and the
     head snippet clears the class if this file never loads at all. */
  (function mapReveal() {
    var root = document.documentElement;
    var marks = { plan: false, data: false, image: false };
    var played = false;

    /* a blurred scrim over the map with a small looping bar, so the wait reads as
       loading rather than as a plan that has not drawn itself yet */
    var host = document.querySelector('.unit-filter_map');
    var veil = null;
    if (host && root.classList.contains('oh-reveal') && !host.querySelector('.site-plan_loader')) {
      veil = document.createElement('div');
      veil.className = 'site-plan_loader';
      veil.setAttribute('role', 'status');
      veil.setAttribute('aria-label', 'Loading the site plan');
      veil.innerHTML = '<div class="site-plan_loader-bar"><span></span></div>';
      host.appendChild(veil);
    }

    function play() {
      if (played) return;
      played = true;
      root.classList.remove('oh-data-pending');
      if (veil) {
        veil.classList.add('is-out');
        setTimeout(function () { if (veil && veil.parentNode) veil.parentNode.removeChild(veil); }, 520);
      }
      if (!root.classList.contains('oh-reveal')) return;
      /* two frames: the viewport fits and centres the plan before it shows */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          root.classList.add('oh-reveal-go');
          root.classList.remove('oh-reveal');
          setTimeout(function () { root.classList.remove('oh-reveal-go'); }, 1600);
          document.dispatchEvent(new CustomEvent('oh:map-revealed'));
        });
      });
    }

    window.ohMapLoader = {
      mark: function (name) {
        if (name in marks) marks[name] = true;
        if (name === 'data') root.classList.remove('oh-data-pending');
        if (marks.plan && marks.data && marks.image) play();
      },
      play: play,
      finish: play
    };

    /* the chips, the legend and the results line all read 0 until the units
       land, which looks like "nothing matches" rather than "loading" */
    root.classList.add('oh-data-pending');

    var img = document.querySelector('.site-plan_map-image');
    if (!img || (img.complete && img.naturalWidth)) window.ohMapLoader.mark('image');
    else {
      img.addEventListener('load', function () { window.ohMapLoader.mark('image'); });
      img.addEventListener('error', function () { window.ohMapLoader.mark('image'); });
    }
    setTimeout(play, 9000);
  })();

  var pageWrap = document.querySelector('.page_wrap');
  if (pageWrap) pageWrap.classList.add('is-app');
  /* a popup previewed in the Designer can publish with its is-active combo
     still on (18 Sep: the reserve popup shipped open on load) - nothing may
     be open before someone asks for it */
  document.querySelectorAll('.popup.is-active').forEach(function (p) { p.classList.remove('is-active'); });
  /* no smooth scroll on this page: the site's Lenis instance is torn down */
  function killLenis() {
    var l = window.lenis;
    if (l && l.__ohStub) return;
    try { if (l && typeof l.destroy === 'function') l.destroy(); } catch (e) {}
    /* the site's raf loop keeps calling window.lenis.raf(): leave an inert stub */
    var noop = function () {};
    window.lenis = { __ohStub: true, raf: noop, start: noop, stop: noop, on: noop, off: noop, scrollTo: noop, destroy: noop, resize: noop };
    document.documentElement.classList.remove('lenis', 'lenis-smooth', 'lenis-scrolling', 'lenis-stopped');
  }
  killLenis();
  window.addEventListener('load', killLenis);
  setTimeout(killLenis, 1500);
  document.documentElement.classList.remove('oh-app-pending');
})();

/* ============================================================
   Site plan controller - filters, map, list, detail panel
   ============================================================ */
window.Wized = window.Wized || [];
window.Wized.push((Wized) => {
  const API_BASE = 'https://x7aj-untn-pq4t.n7e.xano.io/api:BHoGDH-q';
  const REQ = 'v2_getUnits';

  /* Facets are declarative. A new one needs an entry here plus chips in the
     Designer carrying data-filter="<name>" data-value="<value>" - counts,
     click handling, dimming and reset are all generic from there. */
  const FACETS = {
    status: { key: 'status_key' },
    type: { key: 'type_code' },
    beds: { key: 'bedrooms', cast: Number },
    baths: { key: 'bathrooms', cast: Number },
    block: { key: 'block_name' },
    floor: { key: 'floor_level', cast: Number },
    orientation: { key: 'orientation' },
    /* multi: one unit carries several oh_views keys in view_tags[] */
    view: { key: 'view_tags', multi: true },
    parking: { key: 'parking_bay_type' },
  };

  const RANGES = {
    price: {
      key: 'price_value',
      bands: {
        'under-1.6': [0, 1.6e6],
        '2.4-2.6': [1.6e6, 2.6e6],
        '2.6-2.8': [2.6e6, 2.8e6],
        '2.8-plus': [2.8e6, Infinity],
      },
    },
    size: {
      key: 'unit_size',
      bands: {
        'under-40': [0, 40],
        '40-50': [40, 50],
        '50-60': [50, 60],
        '80-plus': [60, Infinity],
      },
    },
  };

  const TOGGLES = {
    'parking-covered': { test: (u) => String(u.parking_bay_type || '').toLowerCase() === 'covered' },
  };

  const LEGEND_GROUPS = { availability: 'status', type: 'type' };

  /* Units the list never shows and that never open the detail panel. They
     stay on the map in their status colour with a tooltip (a block still
     counts them for its footprint): reserved/sold/pending are shown but not
     selectable, unreleased ("coming soon") opens the notify-me form instead. */
  const LIST_HIDE = new Set(['unreleased', 'reserved', 'sold', 'pending', 'sold-out']);

  let units = [];
  let blocks = [];
  let booted = false;

  /* Floor layers. The SVG carries one <g data-floor="N"> per level with the
     unit shapes (id = plot_id) inside; only the current level is shown.
     A plan without [data-floor] groups behaves as before (flat). */
  let floorView = null;
  let floorLevels = [];

  const state = { colourBy: 'status', sort: 'price' };
  Object.keys(FACETS).forEach((f) => (state[f] = new Set()));
  Object.keys(RANGES).forEach((f) => (state[f] = new Set()));
  const toggles = {};
  Object.keys(TOGGLES).forEach((t) => (toggles[t] = false));

  const listeners = [];

  const NBSP = ' ';
  function formatPrice(p) {
    const n = Number(p);
    if (!isFinite(n) || n <= 0) return '';
    return 'R' + NBSP + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }

  const sortFn = {
    price: (a, b) => (a.price_value || 0) - (b.price_value || 0),
    'price-desc': (a, b) => (b.price_value || 0) - (a.price_value || 0),
    size: (a, b) => (b.unit_size || 0) - (a.unit_size || 0),
    block: (a, b) =>
      (a.block_sort - b.block_sort) ||
      (a.floor_level - b.floor_level) ||
      String(a.unit_number).localeCompare(String(b.unit_number), undefined, { numeric: true }),
    floor: (a, b) => (a.floor_level - b.floor_level) || (a.block_sort - b.block_sort),
  };

  function norm(cfg, v) {
    if (cfg && cfg.cast) return cfg.cast(v);
    return typeof v === 'string' ? v.trim().toLowerCase() : v;
  }

  function facetValues(u, cfg) {
    let raw;
    if (cfg.multi) {
      raw = u[cfg.key];
      if (typeof raw === 'string') raw = raw.split(',');
      if (!Array.isArray(raw)) raw = raw == null ? [] : [raw];
    } else if (cfg.keys) {
      raw = [];
      for (const k of cfg.keys) {
        if (u[k] != null && u[k] !== '') { raw = [u[k]]; break; }
      }
    } else {
      raw = [u[cfg.key]];
    }
    return raw
      .map((v) => norm(cfg, v))
      .filter((v) => v != null && v !== '' && !(typeof v === 'number' && isNaN(v)));
  }

  /* Public surface - the deep-link module, the tooltip and anything else
     outside this closure talk to the controller through here. */
  window.ohSitePlan = {
    units: () => units,
    blocks: () => blocks,
    open(key) {
      const k = String(key);
      const u = units.find((x) => String(x.unit_number) === k || String(x.plot_id) === k || String(x.id) === k);
      if (!u || LIST_HIDE.has(u.status_key)) return false;
      openUnit(u);
      return true;
    },
    close: () => closeUnit(),
    toggle(facet, value, on) {
      const set = state[facet];
      if (!set) return false;
      const cfg = FACETS[facet];
      const v = norm(cfg, value);
      const want = on === undefined ? !set.has(v) : !!on;
      if (want) set.add(v); else set.delete(v);
      document.querySelectorAll(`[data-filter="${facet}"][data-value]`).forEach((el) => {
        if (norm(cfg, el.getAttribute('data-value')) === v) el.classList.toggle('is-active', want);
      });
      apply();
      return want;
    },
    isActive: (facet, value) => !!(state[facet] && state[facet].has(norm(FACETS[facet], value))),
    active: (facet) => (state[facet] ? Array.from(state[facet]) : []),
    floors: () => floorLevels.slice(),
    floor: () => floorView,
    notify(key) {
      const k = String(key);
      const u = units.find((x) => String(x.unit_number) === k || String(x.plot_id) === k || String(x.id) === k);
      if (!u || !window.ohNotify) return false;
      window.ohNotify.open(u);
      return true;
    },
    /* setFloor(level) also filters the list to that level; pass false to move the view only */
    setFloor: (level, syncFacet) => setFloor(Number(level), syncFacet !== false),
    onChange(fn) { listeners.push(fn); fn(state); },
    /* re-run the filter pass: for chips added to the DOM after boot (the View
       facet is built from /views, so it misses the first apply()) */
    refresh: () => apply(),
  };

  function boot(rawList) {
    if (booted) return;
    let list = rawList;
    if (!list) {
      const req = Wized.data.r[REQ];
      if (!req || !Array.isArray(req.data)) return;
      list = req.data;
    }
    booted = true;
    console.log('[site-plan] booted with', list.length, 'units');

    units = list.map((u) => {
      const flat = { ...u };
      flat.status_key = String(flat.status_key || flat.status || 'unreleased').toLowerCase();
      flat.floor_level = Number(flat.floor_level) || 0;
      flat.block_sort = Number(flat.block_sort) || 0;
      // Honour the global price switch: only reformat when prices are on.
      if (!flat.prices_hidden) flat.price_display = formatPrice(flat.price_value) || flat.price_display || '';
      return flat;
    });
    if (!units.length) console.warn('[site-plan] v2_getUnits returned an empty array');

    /* block summaries derive from the units - no second request needed */
    const byBlock = new Map();
    units.forEach((u) => {
      const key = u.block_plot_id || ('block-' + String(u.block_name || '').toLowerCase());
      if (!byBlock.has(key)) byBlock.set(key, { plot_id: key, name: u.block_name, sort: u.block_sort, units: [] });
      byBlock.get(key).units.push(u);
    });
    blocks = Array.from(byBlock.values()).sort((a, b) => a.sort - b.sort);

    svgReady.then(() => {
      initMap();
      bindControls();
      updateLegend();
      apply();
      if (window.ohMapLoader) window.ohMapLoader.mark('data');
    });
  }

  /* External plan: <svg class="site-plan_map-svg" data-svg-src="https://..."> is swapped for the
     fetched file (per-floor groups + unit polygons) so the plan can be regenerated without
     touching Webflow. Starts at load so it overlaps the units request. */
  /* "Coming soon" plots are a graded dark wash over the plan rather than a flat
     grey, so the drawing underneath still reads. SVG gradients cannot be
     declared in CSS, so they are injected once into the plan we fetch. */
  function ensureSoonGradients(svg) {
    if (!svg || svg.querySelector('#oh-soon')) return;
    const NS = 'http://www.w3.org/2000/svg';
    let defs = svg.querySelector('defs');
    if (!defs) { defs = document.createElementNS(NS, 'defs'); svg.insertBefore(defs, svg.firstChild); }
    [['oh-soon', 0.5, 0.24], ['oh-soon-hi', 0.66, 0.4]].forEach(([id, a, b]) => {
      const lg = document.createElementNS(NS, 'linearGradient');
      lg.setAttribute('id', id);
      lg.setAttribute('gradientUnits', 'userSpaceOnUse');
      lg.setAttribute('x1', '0'); lg.setAttribute('y1', '0');
      lg.setAttribute('x2', '1690'); lg.setAttribute('y2', '1490');
      [[0, a], [1, b]].forEach(([offset, op]) => {
        const stop = document.createElementNS(NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', '#151714');
        stop.setAttribute('stop-opacity', op);
        lg.appendChild(stop);
      });
      defs.appendChild(lg);
    });
    /* unreleased plots: a light wash with a diagonal hatch (18 Sep) - the
       old solid dark wash read as heavy. userSpaceOnUse so the hatch scales
       with the plan; the hover variant is a shade darker. */
    [['oh-hatch', 0.10, 0.22], ['oh-hatch-hi', 0.18, 0.34]].forEach(([id, wash, line]) => {
      const p = document.createElementNS(NS, 'pattern');
      p.setAttribute('id', id);
      p.setAttribute('patternUnits', 'userSpaceOnUse');
      p.setAttribute('width', '9'); p.setAttribute('height', '9');
      p.setAttribute('patternTransform', 'rotate(45)');
      const bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('width', '9'); bg.setAttribute('height', '9');
      bg.setAttribute('fill', '#151714'); bg.setAttribute('fill-opacity', wash);
      const ln = document.createElementNS(NS, 'rect');
      ln.setAttribute('width', '9'); ln.setAttribute('height', '1.8');
      ln.setAttribute('fill', '#151714'); ln.setAttribute('fill-opacity', line);
      p.appendChild(bg); p.appendChild(ln);
      defs.appendChild(p);
    });
  }

  const svgReady = (function () {
    const el = document.querySelector('.site-plan_map-svg[data-svg-src]');
    if (!el) return Promise.resolve();
    const src = el.getAttribute('data-svg-src');
    return fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((txt) => {
        const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
        const svg = doc.documentElement;
        if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error('not an svg');
        const node = document.importNode(svg, true);
        node.classList.add('site-plan_map-svg');
        Array.from(el.attributes).forEach((a) => { if (a.name !== 'data-svg-src' && !node.hasAttribute(a.name)) node.setAttribute(a.name, a.value); });
        el.replaceWith(node);
        ensureSoonGradients(node);
        console.log('[site-plan] plan loaded from', src);
      })
      .catch((e) => console.error('[site-plan] plan load failed, using inline svg', e));
  })();

  svgReady.then(() => { if (window.ohMapLoader) window.ohMapLoader.mark('plan'); });

  console.log('[site-plan] controller loaded');
  if (Wized.data.r[REQ] && Wized.data.r[REQ].hasRequested) boot();
  Wized.on('requestend', (result) => {
    if (result.name === REQ) boot();
  });

  // Self-heal: if no Wized event performs the request on this page, execute it
  // ourselves; last resort = direct Xano fetch.
  setTimeout(() => {
    try {
      const req = Wized.data.r[REQ];
      if (!booted && (!req || !req.hasRequested)) {
        console.warn('[site-plan] ' + REQ + ' never requested - executing directly');
        Wized.requests.execute(REQ).then(() => boot()).catch((e) => console.error('[site-plan] execute failed', e));
      }
    } catch (e) {}
  }, 1500);
  setTimeout(() => {
    if (booted) return;
    console.warn('[site-plan] falling back to direct Xano fetch');
    fetch(API_BASE + '/units')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) boot(data); })
      .catch((e) => console.error('[site-plan] fetch failed', e));
  }, 5000);

  /* ---- map ---- */
  function blockAvailability(list) {
    if (!list.length) return 'unreleased';
    if (list.some((u) => u.status_key === 'available')) return 'available';
    if (list.every((u) => u.status_key === 'unreleased')) return 'unreleased';
    return 'sold-out';
  }

  /* every shape that stands for a unit: its plot on the unit's level and,
     when the plan has a parking level, the bay allocated to it */
  const unitShapes = new Map();   /* plot_id -> [elements] */
  const bayOfUnit = new Map();    /* plot_id -> bay element */
  const unitOfBay = new Map();    /* bay id -> unit */
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* isBay: the same unit is wired twice - its apartment shape on its own floor
     and its parking bay on the parking level - and on mobile the bay peeks
     rather than jumping into the panel, so the two need telling apart. */
  function wireShape(el, u, isBay) {
    el.setAttribute('data-status', u.status_key);
    el.setAttribute('data-type', u.type_code);
    el.setAttribute('data-unit', u.plot_id);
    el.classList.add('site-plan_plot');
    /* mobile: a small bottom sheet first, so the map and the tapped shape stay
       visible and the panel or the form is one more tap. Desktop is direct. */
    const peek = (mode) => window.ohSheet && window.ohSheet.shouldUse() && window.ohSheet.open(u, mode, el);
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
      });
    else {
      el.classList.add('is-static'); /* reserved / sold: visible, tooltip, no click */
      /* except a bay, where the only question is which unit owns it - and
         there is no tooltip on a touch screen to answer it */
      if (isBay) el.addEventListener('click', () => { if (!ruledOut()) peek('bay'); });
    }
    if (!unitShapes.has(u.plot_id)) unitShapes.set(u.plot_id, []);
    unitShapes.get(u.plot_id).push(el);
  }

  /* centre of a polygon/rect for a label */
  function shapeCentre(el) {
    const pts = el.getAttribute('points');
    if (pts) {
      const xy = pts.trim().split(/\s+/).map((p) => p.split(',').map(Number));
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
        wireShape(bay, u, true);
        bayOfUnit.set(u.plot_id, bay);
        unitOfBay.set(bay.id, u);
        const t = addLabel(parking, bay, u, 'is-bay');
        t.setAttribute('data-status', u.status_key);
      });
      const free = parking.querySelectorAll('[id^="bay-"]:not(.site-plan_plot)');
      free.forEach((b) => b.classList.add('site-plan_bay-free'));
      addAdditionalLegend(free.length);
    }

    /* block-level footprints */
    blocks.forEach((b) => {
      const path = document.getElementById(b.plot_id);
      if (!path) {
        console.warn('[site-plan] no SVG path for block', b.plot_id);
        return;
      }
      path.classList.add('site-plan_block');
      path.setAttribute('data-block', b.name);
      path.setAttribute('data-availability', blockAvailability(b.units));
      path.setAttribute('data-available', b.units.filter((u) => u.status_key === 'available').length);
      path.addEventListener('click', () => {
        const on = window.ohSitePlan.toggle('block', b.name);
        document.querySelectorAll('.site-plan_block.is-selected').forEach((p) => p.classList.remove('is-selected'));
        if (on) path.classList.add('is-selected');
        const list = document.querySelector('.site-plan_list');
        if (on && list && window.matchMedia('(max-width: 991px)').matches) {
          list.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    document.querySelectorAll('.site-plan_map-svg [id^="block-"]').forEach((p) => {
      if (!blocks.some((b) => b.plot_id === p.id)) console.warn('[site-plan] SVG block with no units:', p.id);
    });

    initFloors();
  }

  /* ---- floor layers ---- */
  const floorGroups = () => Array.from(document.querySelectorAll('.site-plan_map-svg [data-floor]'));
  const floorLabel = (level) => {
    const g = document.querySelector('.site-plan_map-svg [data-floor="' + level + '"][data-level-label]');
    if (g) return g.getAttribute('data-level-label');
    if (level === 0) return 'Parking';
    const u = units.find((x) => x.floor_level === level && x.floor_label);
    return u ? u.floor_label : String(level);
  };
  const isParkingLevel = (level) => level === 0 && !units.some((u) => u.floor_level === 0);

  function initFloors() {
    const groups = floorGroups();
    if (!groups.length) return;
    const drawn = new Set(groups.map((g) => Number(g.getAttribute('data-floor'))));
    floorLevels = Array.from(new Set(units.map((u) => u.floor_level).concat(Array.from(drawn)))).sort((a, b) => a - b);
    floorLevels.forEach((l) => { if (!drawn.has(l)) console.warn('[site-plan] no <g data-floor="' + l + '"> in the SVG'); });
    document.querySelector('.site-plan_map-canvas')?.classList.add('has-floors');

    /* switcher: use the Designer's [data-floor-switch] if present, else build one in the map wrap */
    let host = document.querySelector('[data-floor-switch]');
    if (!host) {
      host = document.createElement('div');
      host.className = 'site-plan_floor-switch';
      host.setAttribute('data-floor-switch', '');
      const wrap = document.querySelector('.unit-filter_map') || document.querySelector('.site-plan_map-canvas')?.parentNode;
      wrap?.appendChild(host);
    }
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', 'Level');
    if (!host.querySelector('[data-floor-btn]')) {
      host.innerHTML = '<span class="site-plan_switch-label">Level</span>' + floorLevels.map((l) => {
        const label = floorLabel(l);
        const digits = String(label).match(/\d+/);
        const short = digits ? digits[0] : String(label).charAt(0).toUpperCase();
        return '<button type="button" class="site-plan_floor-btn" data-floor-btn="' + l + '">' +
          '<span class="site-plan_floor-label"><span class="oh-lbl-full">' + label + '</span>' +
          '<span class="oh-lbl-short">' + short + '</span></span>' +
          '<span class="site-plan_floor-count" data-floor-count="' + l + '"></span></button>';
      }).join('');
    }
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-floor-btn]');
      if (btn) setFloor(Number(btn.getAttribute('data-floor-btn')), true);
    });

    const first = floorLevels.find((l) => drawn.has(l) && !isParkingLevel(l));
    setFloor(first != null ? first : floorLevels[0], false);
  }

  /* Show one level. With syncFacet the Floor facet becomes exactly that level
     so the list follows the plan; without it only the drawing changes (deep
     links, opening a unit from the list). */
  function setFloor(level, syncFacet) {
    if (!floorLevels.length || !isFinite(level)) return;
    floorView = level;
    floorGroups().forEach((g) => {
      const on = Number(g.getAttribute('data-floor')) === level;
      g.classList.toggle('is-current', on);
      g.setAttribute('aria-hidden', String(!on));
    });
    document.querySelector('.site-plan_map-canvas')?.setAttribute('data-floor-view', level);
    document.querySelectorAll('[data-floor-btn]').forEach((b) =>
      b.classList.toggle('is-active', Number(b.getAttribute('data-floor-btn')) === level)
    );
    document.querySelector('.site-plan_map-canvas')?.classList.toggle('is-parking-view', isParkingLevel(level));
    document.documentElement.classList.toggle('oh-parking-view', isParkingLevel(level));
    document.dispatchEvent(new CustomEvent('oh:floor-change', { detail: { level, label: floorLabel(level) } }));
    /* the parking level shows every unit's bay: it never narrows the list */
    if (syncFacet && !isParkingLevel(level)) {
      const set = state.floor;
      const already = set.size === 1 && set.has(level);
      if (!already) {
        set.clear();
        set.add(level);
        document.querySelectorAll('[data-filter="floor"][data-value]').forEach((el) =>
          el.classList.toggle('is-active', norm(FACETS.floor, el.getAttribute('data-value')) === level)
        );
        apply();
      }
    }
  }

  /* called from apply(): the plan follows a single-level Floor facet, and the
     switcher shows how many units on each level match the other filters */
  function syncFloors() {
    if (!floorLevels.length) return;
    if (state.floor.size === 1) {
      const only = Array.from(state.floor)[0];
      if (only !== floorView && floorLevels.includes(only)) setFloor(only, false);
    }
    document.querySelectorAll('[data-floor-count]').forEach((el) => {
      const l = Number(el.getAttribute('data-floor-count'));
      if (isParkingLevel(l)) { el.textContent = ''; return; }
      el.textContent = units.filter((u) => u.floor_level === l && !LIST_HIDE.has(u.status_key) && matches(u, 'floor')).length;
    });
  }

  /* unit types flagged in Xano (oh_unit_types.coming_soon, or is_active off)
     show "Coming soon" instead of a count in the Type filter and the legend,
     and cannot be selected */
  function markComingSoonTypes() {
    const codes = new Set(units.map((u) => String(u.type_code || '')).filter(Boolean));
    codes.forEach((code) => {
      const soon = units.filter((u) => String(u.type_code) === code).every((u) => u.type_coming_soon === true || u.type_active === false);
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
        if (soon && !tag) {
          tag = document.createElement('span'); tag.className = 'site-plan_legend-soon'; tag.textContent = 'Coming soon';
          if (window.ohShortLabel) window.ohShortLabel(tag, 'Soon');
          item.appendChild(tag);
        }
        if (!soon && tag) tag.remove();
      });
    });
  }

  /* "Additional" = a bay on the plan that no unit owns (visitor / extra bays).
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

  function updateLegend() {
    markComingSoonTypes();
    document.querySelectorAll('[data-legend]').forEach((el) => {
      const key = el.getAttribute('data-legend');
      const isType = key.startsWith('type-');
      const want = isType ? key.slice(5).toLowerCase() : key.toLowerCase();
      el.textContent = units.filter((u) =>
        isType ? String(u.type_code).toLowerCase() === want : u.status_key === want
      ).length;
    });
    /* per-block counters, e.g. a label on the map: data-block-count="A" */
    document.querySelectorAll('[data-block-count]').forEach((el) => {
      const b = blocks.find((x) => String(x.name).toLowerCase() === el.getAttribute('data-block-count').toLowerCase());
      el.textContent = b ? b.units.filter((u) => u.status_key === 'available').length : 0;
    });
  }

  function syncLegend() {
    document.documentElement.classList.add('legends-ready');
    const want = LEGEND_GROUPS[state.colourBy] || state.colourBy;
    document.querySelectorAll('[data-legend-group]').forEach((el) => {
      const on = el.getAttribute('data-legend-group') === want;
      el.classList.toggle('is-legend-hidden', !on);
      el.setAttribute('aria-hidden', String(!on));
    });
  }

  /* ---- matching ---- */
  function matches(u, skip) {
    for (const [facet, cfg] of Object.entries(FACETS)) {
      if (facet === skip) continue;
      const set = state[facet];
      if (!set.size) continue;
      if (!facetValues(u, cfg).some((v) => set.has(v))) return false;
    }
    for (const [facet, cfg] of Object.entries(RANGES)) {
      if (facet === skip) continue;
      const set = state[facet];
      if (!set.size) continue;
      const val = Number(u[cfg.key]);
      const hit = [...set].some((k) => {
        const band = cfg.bands[k];
        return band && val >= band[0] && val < band[1];
      });
      if (!hit) return false;
    }
    for (const [name, cfg] of Object.entries(TOGGLES)) {
      if (name === skip) continue;
      if (toggles[name] && !cfg.test(u)) return false;
    }
    return true;
  }

  const TAKEN = new Set(['reserved', 'sold', 'pending', 'sold-out']);
  const SOON_TYPE = (u) => u.type_coming_soon === true || u.type_active === false;
  /* the "Coming soon" tag on a chip - shared by the type chips and the
     price / size bands that only the coming-soon types fall into */
  function setSoonChip(el, soon) {
    el.classList.toggle('is-coming-soon', soon);
    let tag = el.querySelector('.unit-filter_soon');
    if (soon && !tag) { tag = document.createElement('span'); tag.className = 'unit-filter_soon'; tag.textContent = 'Coming soon'; el.appendChild(tag); }
    if (!soon && tag) tag.remove();
  }
  function writeCount(el, n, takenOut) {
    const c = el.querySelector('.unit-filter_count');
    if (c) c.textContent = takenOut ? 'Reserved/Sold' : n;
    el.classList.toggle('is-taken', !!takenOut);
    const off = (n === 0 && !el.classList.contains('is-active')) || el.classList.contains('is-coming-soon');
    el.classList.toggle('is-disabled', off);
    el.setAttribute('aria-disabled', String(off));
  }

  function updateCounts() {
    const countable = units.filter((u) => !LIST_HIDE.has(u.status_key));
    document.querySelectorAll('[data-filter][data-value]').forEach((el) => {
      const facet = el.getAttribute('data-filter');
      const raw = el.getAttribute('data-value');
      const pool = countable.filter((u) => matches(u, facet));
      let n = 0;
      let takenOut = false;
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
        if (band) {
          n = pool.filter((u) => Number(u[k]) >= band[0] && Number(u[k]) < band[1]).length;
          const all = units.filter((u) => Number(u[k]) >= band[0] && Number(u[k]) < band[1]);
          const soon = n === 0 && all.length > 0 && all.every(SOON_TYPE);
          setSoonChip(el, soon);
          if (soon && state[facet] && state[facet].has(raw)) { state[facet].delete(raw); el.classList.remove('is-active'); }
        }
      }
      writeCount(el, n, takenOut);
    });
    document.querySelectorAll('[data-toggle]').forEach((el) => {
      const name = el.getAttribute('data-toggle');
      const cfg = TOGGLES[name];
      if (!cfg) return;
      writeCount(el, countable.filter((u) => matches(u, name) && cfg.test(u)).length);
    });
  }

  function apply() {
    const sorter = sortFn[state.sort] || sortFn.price;
    const visible = units.filter((u) => matches(u)).sort(sorter);
    const listed = visible.filter((u) => !LIST_HIDE.has(u.status_key));
    const ids = new Set(visible.map((u) => u.plot_id));

    Wized.data.v.v2_visibleUnits = listed;

    /* unit plots, bays and their labels */
    units.forEach((u) => {
      const off = !ids.has(u.plot_id);
      (unitShapes.get(u.plot_id) || []).forEach((el) => el.classList.toggle('is-dimmed', off));
      labelsFor(u.plot_id).forEach((t) => t.classList.toggle('is-dimmed', off));
    });
    /* block footprints: dim when nothing listed is inside; selected follows the Block facet */
    blocks.forEach((b) => {
      const path = document.getElementById(b.plot_id);
      if (!path) return;
      const inside = listed.filter((u) => (u.block_plot_id || '') === b.plot_id || u.block_name === b.name).length;
      path.classList.toggle('is-dimmed', inside === 0);
      path.classList.toggle('is-selected', state.block.has(norm(FACETS.block, b.name)));
      path.setAttribute('data-matching', inside);
    });

    document.querySelectorAll('[data-count="results"]').forEach((el) => { el.textContent = listed.length; });

    updateCounts();
    syncFloors();
    listeners.forEach((fn) => { try { fn(state); } catch (e) {} });
  }

  /* ---- detail panel ---- */
  const detailWrap = () => document.querySelector('.site-plan_detail-wrap');
  const panelScroll = () => document.querySelector('.site-plan_detail-panel');
  const isOpen = () => !!detailWrap()?.classList.contains('is-open');

  function openUnit(u) {
    if (floorLevels.length && u.floor_level !== floorView && !isParkingLevel(floorView)) setFloor(u.floor_level, false);
    document.querySelectorAll('.site-plan_plot.is-selected').forEach((p) => p.classList.remove('is-selected'));
    (unitShapes.get(u.plot_id) || []).forEach((el) => el.classList.add('is-selected'));

    Wized.data.v.v2_selectedUnit = u;

    const s = panelScroll();
    if (s) s.scrollTop = 0;
    detailWrap()?.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    window.lenis?.stop();
    document.dispatchEvent(new CustomEvent('oh:unit-open', { detail: { unit: u } }));
  }

  function closeUnit() {
    if (!isOpen()) return;
    detailWrap()?.classList.remove('is-open');
    document.querySelectorAll('.site-plan_plot.is-selected').forEach((p) => p.classList.remove('is-selected'));
    document.body.style.overflow = '';
    window.lenis?.start();
    document.dispatchEvent(new CustomEvent('oh:unit-close'));
  }

  function setColourBy(mode) {
    state.colourBy = mode;
    const canvas = document.querySelector('.site-plan_map-canvas');
    if (canvas) {
      canvas.classList.toggle('is-colour-type', mode === 'type');
      canvas.classList.toggle('is-colour-status', mode === 'status');
    }
    document.querySelectorAll('[data-colourby]').forEach((b) =>
      b.classList.toggle('is-active', b.getAttribute('data-colourby') === mode)
    );
    syncLegend();
  }

  /* Sales phase: oh_site_settings.sales_open, mirrored by the page as
     html.sales-open. Off = register-interest mode: availability UI hidden by
     the [data-sales-ui] CSS, plan coloured by type only. */
  function salesOpen() {
    return document.documentElement.classList.contains('sales-open');
  }

  function bindControls() {
    setColourBy(salesOpen() ? 'status' : 'type');
    document.addEventListener('oh:sales-phase', (e) => {
      setColourBy(e.detail && e.detail.open ? 'status' : 'type');
    });

    document.addEventListener('click', (e) => {
      const link = e.target.closest && e.target.closest('[data-close-detail]');
      if (!link) return;
      let u = null;
      try { u = Wized.data.v.v2_selectedUnit; } catch (_) {}
      closeUnit();
      if (!link.hasAttribute('data-prelaunch-ui')) return;
      const msg = document.querySelector('#contact textarea');
      if (u && msg && !msg.value.trim()) {
        msg.value = 'I am interested in Unit ' + u.unit_number + ' (Block ' + u.block_name + ', Type ' + u.type_code + '). Please let me know when sales open.';
      }
    });

    document.querySelectorAll('[data-colourby]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!salesOpen()) return;
        setColourBy(btn.getAttribute('data-colourby'));
      });
    });

    /* delegated, not bound per chip: the View facet's chips are built from
       /views after this runs, and a per-element listener would miss them */
    function chipClick(el) {
      if (!el || el.classList.contains('is-coming-soon') || el.classList.contains('is-disabled')) return;
      const facet = el.getAttribute('data-filter');
      const set = state[facet];
      if (!set) return console.warn('Unknown filter facet:', facet);
      const key = norm(FACETS[facet], el.getAttribute('data-value'));
      set.has(key) ? set.delete(key) : set.add(key);
      el.classList.toggle('is-active', set.has(key));
      apply();
    }
    document.addEventListener('click', (e) => {
      chipClick(e.target.closest && e.target.closest('[data-filter]'));
    });
    /* the chips are divs with role="button", which fire no click from the
       keyboard - honour the role rather than leaving it a broken promise */
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      const el = e.target.closest && e.target.closest('[data-filter],[data-toggle],[data-reset]');
      if (!el) return;
      e.preventDefault();
      el.click();
    });

    document.querySelectorAll('[data-toggle]').forEach((el) =>
      el.addEventListener('click', () => {
        const name = el.getAttribute('data-toggle');
        if (!(name in TOGGLES)) return console.warn('Unknown toggle:', name);
        toggles[name] = !toggles[name];
        el.classList.toggle('is-active', toggles[name]);
        apply();
      }),
    );

    document.querySelectorAll('[data-sort]').forEach((el) => {
      el.classList.toggle('is-active', el.getAttribute('data-sort') === state.sort);
      el.addEventListener('click', () => {
        state.sort = el.getAttribute('data-sort');
        document.querySelectorAll('[data-sort]').forEach((s) => s.classList.toggle('is-active', s === el));
        apply();
      });
    });

    document.querySelector('[data-reset]')?.addEventListener('click', () => {
      Object.keys(FACETS).forEach((f) => state[f].clear());
      Object.keys(RANGES).forEach((f) => state[f].clear());
      Object.keys(TOGGLES).forEach((t) => (toggles[t] = false));
      document.querySelectorAll('[data-filter],[data-toggle]').forEach((el) => el.classList.remove('is-active'));
      apply();
    });

    document.querySelector('.site-plan_detail-overlay')?.addEventListener('click', closeUnit);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) closeUnit();
    });

    document.querySelector('.site-plan_list')?.addEventListener('click', (e) => {
      const card = e.target.closest('[data-plot]');
      if (!card) return;
      const u = units.find((x) => x.plot_id === card.getAttribute('data-plot'));
      if (u) openUnit(u);
    });

    const overlay = document.querySelector('.site-plan_detail-overlay');
    overlay?.addEventListener('wheel', (e) => {
      const s = panelScroll();
      if (!s || !isOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      s.scrollTop += e.deltaY;
    }, { passive: false });
  }
});

/* ============================================================
   Map tooltip - block footprints and (phase 2) unit plots
   ============================================================ */
window.Wized = window.Wized || [];
window.Wized.push((Wized) => {
  if (window.matchMedia('(hover: none)').matches) return;

  const tip = document.querySelector('[data-tooltip="root"]');
  const canvas = document.querySelector('.site-plan_map-canvas');
  if (!tip || !canvas) return;
  document.body.appendChild(tip);

  const field = {
    id: tip.querySelector('[data-tooltip="id"]'),
    status: tip.querySelector('[data-tooltip="status"]'),
    type: tip.querySelector('[data-tooltip="type"]'),
    specs: tip.querySelector('[data-tooltip="specs"]'),
    price: tip.querySelector('[data-tooltip="price"]'),
  };
  const PILL_CLASSES = ['is-available', 'is-reserved', 'is-sold', 'is-sold-out', 'is-unreleased', 'is-pending'];
  const OFFSET = 14;
  const EDGE = 8;
  const set = (el, text) => { if (el) el.textContent = text; };
  const pill = (cls) => {
    if (!field.status) return;
    field.status.classList.remove(...PILL_CLASSES);
    field.status.classList.add('is-' + cls);
  };
  let active = null;

  const rows = (on) => [field.type, field.specs, field.price].forEach((el) => { if (el) el.hidden = !on; });
  function fillUnit(u) {
    const soon = u.status_key === 'unreleased';
    set(field.id, 'Unit ' + u.unit_number);
    set(field.status, soon ? 'Coming soon' : u.status);
    pill(u.status_key);
    rows(!soon);
    set(field.type, 'Type ' + u.type_code + ' · Block ' + u.block_name + ' · ' + u.floor_label + ' level');
    if (soon) { if (field.type) field.type.hidden = false; return; }
    const bay = u.parking_bay_number ? ' · Bay ' + u.parking_bay_number + (u.parking_bay_type ? ' (' + String(u.parking_bay_type).toLowerCase() + ')' : '') : '';
    set(field.specs, [u.bedrooms + ' bed', u.bathrooms + ' bath', Math.round(u.unit_size) + ' m²'].join(' · ') + bay);
    set(field.price, u.prices_hidden ? (u.price_display || 'Price on request') : (u.price_display || 'Price on request'));
  }

  function fillBlock(b) {
    rows(true);
    const avail = b.units.filter((u) => u.status_key === 'available');
    const prices = avail.map((u) => Number(u.price_value) || 0).filter((p) => p > 0);
    const types = Array.from(new Set(b.units.map((u) => u.type_code).filter(Boolean))).sort();
    const floors = Math.max(0, ...b.units.map((u) => u.floor_level || 0));
    const status = avail.length ? avail.length + ' available' : (b.units.every((u) => u.status_key === 'unreleased') ? 'Coming soon' : 'Sold out');
    set(field.id, 'Block ' + b.name);
    set(field.status, status);
    pill(avail.length ? 'available' : (b.units.every((u) => u.status_key === 'unreleased') ? 'unreleased' : 'sold-out'));
    set(field.type, (types.length ? 'Type ' + types.join(', ') : '') + (floors ? ' · ' + floors + ' levels' : ''));
    set(field.specs, b.units.length + ' apartments');
    const hidden = b.units.some((u) => u.prices_hidden);
    set(field.price, hidden ? (b.units[0].price_display || '') : (prices.length ? 'From ' + formatPrice(Math.min(...prices)) : ''));
  }

  const NBSP = ' ';
  function formatPrice(p) {
    const n = Number(p);
    if (!isFinite(n) || n <= 0) return '';
    return 'R' + NBSP + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }

  function place(e) {
    const r = tip.getBoundingClientRect();
    let x = e.clientX + OFFSET;
    let y = e.clientY + OFFSET;
    if (x + r.width > window.innerWidth - EDGE) x = e.clientX - r.width - OFFSET;
    if (y + r.height > window.innerHeight - EDGE) y = e.clientY - r.height - OFFSET;
    tip.style.left = Math.max(EDGE, x) + 'px';
    tip.style.top = Math.max(EDGE, y) + 'px';
  }
  function hide() { active = null; tip.classList.remove('is-visible'); }

  canvas.addEventListener('mouseover', (e) => {
    const path = e.target.closest && e.target.closest('[id]');
    if (!path || path === canvas) return hide();
    if (path === active) return;
    const sp = window.ohSitePlan;
    if (!sp) return hide();
    if (path.classList.contains('is-dimmed') && path.classList.contains('site-plan_plot')) return hide();
    const unitId = path.getAttribute('data-unit') || path.id;
    const u = sp.units().find((x) => x.plot_id === unitId);
    const b = !u && sp.blocks().find((x) => x.plot_id === path.id);
    if (!u && !b) return hide();
    active = path;
    if (u) fillUnit(u); else fillBlock(b);
    place(e);
    tip.classList.add('is-visible');
  });
  canvas.addEventListener('mousemove', (e) => { if (active) place(e); });
  canvas.addEventListener('mouseleave', hide);
  window.addEventListener('scroll', hide, { passive: true });
});


/* ============================================================
   Mobile match count — mirrors the filters drawer's "N unit(s) match"
   into the mobile toolbar, so the number is still readable once the
   drawer is closed (map view shows no count otherwise).
   ============================================================ */
(function () {
  if (window.__ohCount) return;
  window.__ohCount = true;

  function boot() {
    var src = document.querySelector('.unit-filter_match');
    /* the app shell hides the site navbar, so the count sits in the Plan|List
       toolbar row itself (the map meta strip below it is gone on mobile - the
       plan controls float on the map instead); the strip is still the fallback */
    var toolbar = document.querySelector('.unit-filter_mobile-toolbar');
    var meta = toolbar ? null : document.querySelector('.unit-filter_mobile-map-meta');
    var bar = toolbar || meta;
    if (!bar || !src) return false;
    if (document.querySelector('.unit-filter_mobile-match')) return true;

    var el = document.createElement('div');
    el.className = 'unit-filter_mobile-match';
    el.setAttribute('aria-live', 'polite');
    /* in the toolbar row: between the Plan|List switch and the Filters button */
    if (meta) bar.appendChild(el);
    else bar.insertBefore(el, bar.querySelector('[data-drawer="open"]') || null);

    function sync() {
      /* the number only: .unit-filter_match may wrap the counter in a sentence */
      var counter = src.matches('[data-count="results"]') ? src : src.querySelector('[data-count="results"]');
      var n = ((counter || src).textContent || '').trim().match(/\d+/);
      n = n ? n[0] : '';
      el.textContent = n ? n + (n === '1' ? ' unit' : ' units') : '';
      /* mirror into the other results counters, never into anything inside
         src itself - that would re-trigger the observer forever */
      document.querySelectorAll('[data-count="results"]').forEach(function (c) {
        if (c !== src && !src.contains(c) && c.textContent.trim() !== n) c.textContent = n;
      });
    }
    sync();
    if (window.MutationObserver) new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
    return true;
  }

  function ready() {
    if (boot()) return;
    var n = 0, iv = setInterval(function () { if (boot() || ++n > 40) clearInterval(iv); }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();

/* ============================================================
   Active filter tags — one removable tag per active chip, in the filters
   header under the "Filters" / Reset row. The tag's X clicks the chip it
   came from, so facets, the price/size bands and the toggles all go
   through the same handler as the chips themselves and nothing here has
   to know about the controller's state.
   ============================================================ */
(function () {
  if (window.__ohTags) return;
  window.__ohTags = true;
  /* Facets that are set by something other than a chip the visitor clicked.
     The level switcher sets `floor` so the list follows the plan; that is
     navigation, so it gets no tag and no badge count. window.ohTagSel keeps
     the Filters badge reading exactly what the tags row shows. */
  var SKIP = ['floor'];
  var SEL = SKIP.map(function (f) { return '[data-filter][data-value].is-active:not([data-filter="' + f + '"])'; })
    .concat(['[data-toggle].is-active']).join(', ');
  window.ohTagSel = SEL;

  function host() {
    var head = document.querySelector('.unit-filter_filters .unit-filter_head') || document.querySelector('.unit-filter_head');
    if (!head) return null;
    var box = head.querySelector('.unit-filter_tags');
    if (!box) {
      box = document.createElement('div');
      box.className = 'unit-filter_tags';
      box.setAttribute('role', 'list');
      box.setAttribute('aria-label', 'Active filters');
      head.appendChild(box);
    }
    return box;
  }

  /* the chip's own label, and its group when the value alone is cryptic ("A") */
  function labelFor(chip) {
    var full = chip.querySelector('.oh-lbl-full');
    var txt = '';
    if (full) txt = full.textContent;
    else {
      var spans = [].slice.call(chip.querySelectorAll('span')).filter(function (sp) {
        return !sp.classList.contains('unit-filter_count') && !sp.classList.contains('unit-filter_soon') &&
               !sp.classList.contains('oh-lbl-short') && !sp.classList.contains('unit-filter_chip-icon') &&
               (sp.textContent || '').trim() !== '';
      });
      txt = spans.length ? spans[0].textContent : chip.textContent;
    }
    txt = (txt || '').replace(/\s+/g, ' ').trim();
    var group = chip.closest ? chip.closest('.unit-filter_group') : null;
    var title = group && group.querySelector('.unit-filter_group-title-1');
    title = title ? title.textContent.trim() : '';
    if (title === 'Unit type') title = 'Type';
    if (title && txt.length <= 3 && txt.toLowerCase() !== title.toLowerCase()) txt = title + ' ' + txt;
    return txt;
  }

  function render() {
    var box = host();
    if (!box) return;
    var chips = [].slice.call(document.querySelectorAll(SEL));
    box.textContent = '';
    box.hidden = !chips.length;
    chips.forEach(function (chip) {
      var text = labelFor(chip);
      var tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'unit-filter_tag';
      tag.setAttribute('role', 'listitem');
      tag.setAttribute('aria-label', 'Remove filter: ' + text);
      tag.innerHTML = '<span class="unit-filter_tag-label"></span><span class="unit-filter_tag-x" aria-hidden="true">\u00d7</span>';
      tag.querySelector('.unit-filter_tag-label').textContent = text;
      tag.addEventListener('click', function (e) {
        e.preventDefault();
        chip.click();          /* the chip owns the state; this only undoes it */
      });
      box.appendChild(tag);
    });
  }

  function boot() {
    if (!window.ohSitePlan || !window.ohSitePlan.onChange) return false;
    window.ohSitePlan.onChange(render);      /* fires now and on every apply() */
    return true;
  }
  function ready() {
    if (boot()) return;
    var n = 0, iv = setInterval(function () { if (boot() || ++n > 40) clearInterval(iv); }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();

/* ============================================================
   Views — the estate's distant views as markers on the map edge, a View
   filter facet, chips in the unit panel and a line in the plot tooltip.

   Data: GET /views (the oh_views taxonomy) and view_tags[] on each unit.
   The bearings and distances in oh_views were measured from the site
   centre (-33.9010, 18.8460). The plan drawing is rotated - plan-up is
   348° true - so a view's marker sits on the map edge named in its
   placement column rather than at its raw compass bearing.

   A marker click toggles the matching chip in the View facet through
   window.ohSitePlan, so the map and the filter panel are one control and
   the removable filter tags pick it up for free. Hover is a preview and
   changes no state.
   ============================================================ */
(function () {
  if (window.__ohViews) return;
  window.__ohViews = true;

  var API = 'https://x7aj-untn-pq4t.n7e.xano.io/api:BHoGDH-q';
  var S = '<svg viewBox="0 0 24 24" aria-hidden="true">';
  var ICONS = {
    mountain: S + '<path d="M3 18 8.5 8l3.2 5.2 2.3-3.4L21 18z"/><path d="M8.5 8l1.8 2.7"/></svg>',
    horizon: S + '<path d="M2 18h20M6 18l3.5-6h5L18 18M9.5 12h5"/></svg>',
    vine: S + '<circle cx="9" cy="11" r="2.2"/><circle cx="14.5" cy="11" r="2.2"/><circle cx="11.75" cy="15.5" r="2.2"/><path d="M11.75 8.5V4.5c1.6 0 3 .8 4.2 2.2"/></svg>',
    tree: S + '<path d="M12 21v-5M6 16h12l-3-4h2l-3-4h2L12 3 8 8h2l-3 4h2z"/></svg>',
    water: S + '<path d="M3 11c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>',
    clubhouse: S + '<path d="M4 21V10l8-6 8 6v11M9 21v-6h6v6M2 21h20"/></svg>'
  };
  var PLACED = { north: 1, 'north-east': 1, east: 1, 'south-east': 1, south: 1, 'south-west': 1, west: 1, 'north-west': 1 };

  var views = [], byKey = {}, markHost = null, tip = null, focusKey = null, hooked = false;

  function icon(name) { return ICONS[name] || ICONS.mountain; }
  function tags(u) {
    var t = u && u.view_tags;
    if (Array.isArray(t)) return t;
    return typeof t === 'string' && t ? t.split(',').map(function (s) { return s.trim(); }) : [];
  }
  function units() { try { return window.ohSitePlan ? window.ohSitePlan.units() : []; } catch (e) { return []; } }
  function facetOn() { try { return window.ohSitePlan.active('view').length > 0; } catch (e) { return false; } }
  function isOn(key) { try { return !!window.ohSitePlan.isActive('view', key); } catch (e) { return false; } }

  /* ---------- data ---------- */
  function setViews(list) {
    if (!Array.isArray(list) || !list.length || views.length) return;
    views = list.filter(function (v) { return v && v.key && v.is_active !== false; })
                .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
    byKey = {};
    views.forEach(function (v) { byKey[v.key] = v; });
    buildChips();
    buildMarkers();
    hook();
  }

  /* ---------- the View facet: chips in the filters panel ----------
     The controller's facets are declarative, so chips carrying
     data-filter="view" data-value="<key>" get counts, dimming, click
     handling and Reset for nothing. They are built here rather than in the
     Designer so that adding a row to oh_views adds a chip. */
  function buildChips() {
    var scroll = document.querySelector('.unit-filter_filters .unit-filter_scroll') ||
                 document.querySelector('.unit-filter_filters .unit-filter_inner');
    if (!scroll || scroll.querySelector('[data-filter="view"]')) return;

    var group = document.createElement('div');
    group.className = 'unit-filter_group is-views';
    var title = document.createElement('div');
    title.className = 'unit-filter_group-title-1';
    title.textContent = 'Directional View';
    var chips = document.createElement('div');
    chips.className = 'unit-filter_chips';
    views.forEach(function (v) {
      var c = document.createElement('div');
      c.className = 'unit-filter_chip-1 unit-filter_chip-view';
      c.setAttribute('data-filter', 'view');
      c.setAttribute('data-value', v.key);
      c.setAttribute('tabindex', '0');
      c.setAttribute('role', 'button');
      c.setAttribute('aria-disabled', 'false');
      c.innerHTML = '<span class="unit-filter_chip-icon">' + icon(v.icon) + '</span><span></span><span class="unit-filter_count">0</span>';
      c.querySelectorAll('span')[1].textContent = v.label;
      chips.appendChild(c);
    });
    group.appendChild(title);
    group.appendChild(chips);

    /* after Parking (Daniel's order: Price, Type, Block, Orientation, Parking,
       Directional View, Size); Orientation is the fallback */
    var after = document.querySelector('[data-toggle="parking-covered"]') || document.querySelector('[data-filter="orientation"]');
    after = after && after.closest ? after.closest('.unit-filter_group') : null;
    if (after && after.parentNode) after.parentNode.insertBefore(group, after.nextSibling);
    else scroll.appendChild(group);

    /* the chips missed the last apply(), so ask for the counts */
    try { window.ohSitePlan.refresh(); } catch (e) {}
  }

  /* ---------- markers on the map edge ---------- */
  function buildMarkers() {
    markHost = document.querySelector('.site-plan_viewmarks');
    if (!markHost) {
      var host = document.querySelector('.unit-filter_map');
      if (!host) return;
      markHost = document.createElement('div');
      markHost.className = 'site-plan_viewmarks';
      markHost.setAttribute('aria-label', 'Views from the estate');
      host.appendChild(markHost);
    }
    markHost.textContent = '';
    layout();
    views.forEach(function (v) {
      if (!PLACED[v.placement]) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'site-plan_viewmark';
      b.setAttribute('data-view', v.key);
      b.setAttribute('data-placement', v.placement);
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', 'Show apartments with a ' + v.label + ' view' + (v.direction ? ' (' + v.direction + ')' : ''));
      b.innerHTML = icon(v.icon) + '<span class="site-plan_viewmark-label">' + v.label + '</span>';
      b.addEventListener('mouseenter', function () { preview(v); });
      b.addEventListener('focus', function () { preview(v); });
      b.addEventListener('mouseleave', function () { clear(); hideTip(); });
      b.addEventListener('blur', function () { clear(); hideTip(); });
      b.addEventListener('click', function (e) {
        e.preventDefault();
        try { window.ohSitePlan.toggle('view', v.key); } catch (err) { return; }
        clear();                 /* the filter's own dimming takes over */
        showTip(b, v);
      });
      markHost.appendChild(b);
    });
    syncMarkers();
  }

  /* The toolbar floats over the top of the map - a right-aligned column on
     desktop, a full-width row (sometimes two, when the legend wraps) on
     mobile. Publish its height so the north marker can sit under it instead
     of behind the legend. */
  function layout() {
    if (!markHost) return;
    var bar = document.querySelector('.unit-filter_map .site-plan_toolbar');
    var h = bar ? Math.round(bar.getBoundingClientRect().height) : 0;
    markHost.style.setProperty('--oh-marks-top', (h ? h + 20 : 12) + 'px');
  }
  window.addEventListener('resize', layout);
  document.addEventListener('oh:sales-phase', layout);

  /* markers mirror the facet, however it was changed - chip, tag or Reset */
  function syncMarkers() {
    if (!markHost) return;
    markHost.querySelectorAll('.site-plan_viewmark').forEach(function (b) {
      var key = b.getAttribute('data-view');
      var on = isOn(key);
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
      /* a view with nothing available reads as inert, exactly as its chip does -
         otherwise the marker invites a click that returns "0 units match" */
      var chip = document.querySelector('[data-filter="view"][data-value="' + key + '"]');
      var off = !!(chip && chip.classList.contains('is-disabled'));
      b.classList.toggle('is-muted', off);
      b.disabled = off;
    });
  }

  /* ---------- hover preview ---------- */
  function preview(v) {
    if (!facetOn()) focus(v.key);      /* no double-dimming once a filter is on */
    var b = markHost && markHost.querySelector('.site-plan_viewmark[data-view="' + v.key + '"]');
    if (b) showTip(b, v);
  }
  function focus(key) {
    focusKey = key;
    var canvas = document.querySelector('.site-plan_map-canvas');
    if (!canvas) return;
    canvas.classList.add('is-view-focus');
    units().forEach(function (u) {
      var p = u.plot_id && document.getElementById(u.plot_id);
      if (p) p.classList.toggle('is-view-hit', tags(u).indexOf(key) !== -1);
    });
  }
  function clear() {
    focusKey = null;
    var canvas = document.querySelector('.site-plan_map-canvas');
    if (canvas) canvas.classList.remove('is-view-focus');
    document.querySelectorAll('.site-plan_plot.is-view-hit').forEach(function (p) { p.classList.remove('is-view-hit'); });
  }

  /* ---------- hover card ---------- */
  function showTip(b, v) {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'site-plan_viewmark-tip';
      document.body.appendChild(tip);
    }
    /* the number the click will actually leave on the list, so the card and the
       chip count agree */
    var n = units().filter(function (u) { return u.is_available && tags(u).indexOf(v.key) !== -1; }).length;
    var dist = Number(v.distance_km) || 0;
    var sub = [v.direction, dist ? (dist < 1 ? Math.round(dist * 1000) + ' m' : dist + ' km') : ''].filter(Boolean).join(' · ');
    tip.innerHTML =
      '<div class="site-plan_viewmark-tip_head"><span></span>' + (sub ? '<span class="site-plan_viewmark-tip_dir"></span>' : '') + '</div>' +
      '<div class="site-plan_viewmark-tip_body"></div>' +
      (n ? '<span class="site-plan_viewmark-tip_count"></span>' : '') +
      '<span class="site-plan_viewmark-tip_hint"></span>';
    tip.querySelector('.site-plan_viewmark-tip_head span').textContent = v.label;
    if (sub) tip.querySelector('.site-plan_viewmark-tip_dir').textContent = sub;
    tip.querySelector('.site-plan_viewmark-tip_body').textContent = v.description || '';
    if (n) tip.querySelector('.site-plan_viewmark-tip_count').textContent = n + (n === 1 ? ' apartment' : ' apartments') + ' available with this directional view';
    tip.querySelector('.site-plan_viewmark-tip_hint').textContent = isOn(v.key) ? 'Click to clear this filter' : 'Click to filter to these apartments';

    tip.style.left = '0px';
    tip.style.top = '0px';
    tip.classList.add('is-visible');
    place(b);
  }
  /* ---------- where the card goes ----------
     Never over a plot. The markers live on the map's edge, so "the side with
     the most room" always pointed inwards, across the plan - and the card
     then covered the very apartments the hover had just lit up.

     Instead: a coarse occupancy grid of what is on screen (CELL px cells),
     summed into an integral image so any candidate rectangle costs O(1) to
     score, then the nearest position to the marker that sits on nothing.
     Plots are a hard cost, the floating controls a soft one (better to
     overlap the zoom pill than an apartment), and the search is confined to
     the map box so the card cannot stray over the filters or the list. */
  var CELL = 14, PAD = 12, occ = null;

  function mapBox() {
    var el = document.querySelector('.unit-filter_map') || document.querySelector('.site-plan_map-canvas');
    return el ? el.getBoundingClientRect() : null;
  }

  /* one string that changes whenever the pixels under the card could have:
     which level, the pan/zoom of the map box, and the box itself */
  function signature(box) {
    var canvas = document.querySelector('.site-plan_map-canvas');
    var scroller = document.querySelector('.unit-filter_map-container');
    return [
      Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height),
      canvas ? canvas.style.width : '', canvas ? (canvas.className || '') : '',
      scroller ? Math.round(scroller.scrollLeft) : 0, scroller ? Math.round(scroller.scrollTop) : 0,
      document.querySelectorAll('.site-plan_plot').length,
      focusKey || '',
    ].join('|');
  }

  function buildOcc() {
    var box = mapBox();
    if (!box || box.width < 40 || box.height < 40) return null;
    var sig = signature(box);
    if (occ && occ.sig === sig) return occ;

    var cols = Math.ceil(box.width / CELL) + 1, rows = Math.ceil(box.height / CELL) + 1;
    var grid = new Float32Array(cols * rows);

    function stamp(r, weight) {
      var x0 = Math.floor((Math.max(r.left, box.left) - box.left) / CELL);
      var x1 = Math.ceil((Math.min(r.right, box.right) - box.left) / CELL);
      var y0 = Math.floor((Math.max(r.top, box.top) - box.top) / CELL);
      var y1 = Math.ceil((Math.min(r.bottom, box.bottom) - box.top) / CELL);
      if (x1 <= x0 || y1 <= y0) return;
      for (var y = Math.max(0, y0); y < Math.min(rows, y1); y++) {
        for (var x = Math.max(0, x0); x < Math.min(cols, x1); x++) {
          var i = y * cols + x;
          if (grid[i] < weight) grid[i] = weight;
        }
      }
    }

    /* What it costs to cover something, worst first. A phone's map box has no
       gap the card fits in, so the search will always be covering SOMETHING:
       make that the least useful thing on screen. The apartments this view
       just lit are the answer to the hover, so they cost most; any other plot
       next; a floating control is the cheapest thing to sit on. */
    var W_LIT = 5000, W_PLOT = 600, W_UI = 40;
    var shapes = document.querySelectorAll('.site-plan_map-svg .site-plan_plot, .site-plan_map-svg .site-plan_unit-label');
    for (var i = 0; i < shapes.length; i++) {
      var el = shapes[i];
      if (!el.getClientRects().length) continue;          /* hidden level */
      var lit = el.classList.contains('is-view-hit') ||
                (el.getAttribute('data-for') && document.getElementById(el.getAttribute('data-for')) &&
                 document.getElementById(el.getAttribute('data-for')).classList.contains('is-view-hit'));
      stamp(el.getBoundingClientRect(), lit ? W_LIT : W_PLOT);
    }
    /* the floating controls: worth avoiding, worth overlapping before a plot */
    var ui = document.querySelectorAll('.unit-filter_map .site-plan_toolbar, .unit-filter_map .site-plan_floor-switch, .unit-filter_map .site-plan_zoom, .unit-filter_map .site-plan_sheet, .site-plan_viewmark');
    for (var j = 0; j < ui.length; j++) {
      if (!ui[j].getClientRects().length) continue;
      stamp(ui[j].getBoundingClientRect(), W_UI);
    }

    /* integral image: sum of any cell rect in four lookups */
    var sat = new Float64Array((cols + 1) * (rows + 1));
    for (var y2 = 0; y2 < rows; y2++) {
      var run = 0;
      for (var x2 = 0; x2 < cols; x2++) {
        run += grid[y2 * cols + x2];
        sat[(y2 + 1) * (cols + 1) + (x2 + 1)] = sat[y2 * (cols + 1) + (x2 + 1)] + run;
      }
    }
    occ = { sig: sig, box: box, cols: cols, rows: rows, sat: sat };
    return occ;
  }

  function cost(o, x, y, w, h) {
    var x0 = Math.max(0, Math.floor((x - o.box.left) / CELL));
    var x1 = Math.min(o.cols, Math.ceil((x + w - o.box.left) / CELL));
    var y0 = Math.max(0, Math.floor((y - o.box.top) / CELL));
    var y1 = Math.min(o.rows, Math.ceil((y + h - o.box.top) / CELL));
    if (x1 <= x0 || y1 <= y0) return 0;
    var W = o.cols + 1;
    return o.sat[y1 * W + x1] - o.sat[y0 * W + x1] - o.sat[y1 * W + x0] + o.sat[y0 * W + x0];
  }

  function place(b) {
    var q = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    var cx = q.left + q.width / 2, cy = q.top + q.height / 2;
    var o = buildOcc();

    /* no grid (no map yet): the old behaviour, clamped to the viewport */
    if (!o) {
      var x = Math.min(Math.max(PAD, cx - w / 2), Math.max(PAD, window.innerWidth - w - PAD));
      var y = Math.min(Math.max(PAD, cy - h / 2), Math.max(PAD, window.innerHeight - h - PAD));
      tip.style.left = Math.round(x) + 'px';
      tip.style.top = Math.round(y) + 'px';
      return;
    }

    var minX = o.box.left + PAD, maxX = o.box.right - w - PAD;
    var minY = o.box.top + PAD, maxY = o.box.bottom - h - PAD;
    /* a card wider or taller than the box still has to land somewhere */
    if (maxX < minX) maxX = minX;
    if (maxY < minY) maxY = minY;

    var best = null;
    for (var y3 = minY; y3 <= maxY + 0.5; y3 += CELL) {
      for (var x3 = minX; x3 <= maxX + 0.5; x3 += CELL) {
        var px = Math.min(x3, maxX), py = Math.min(y3, maxY);
        var over = cost(o, px, py, w, h);
        /* distance from the marker keeps the card attached to what it explains */
        var dx = px + w / 2 - cx, dy = py + h / 2 - cy;
        var score = over * 10 + Math.sqrt(dx * dx + dy * dy);
        if (!best || score < best.score) best = { x: px, y: py, score: score, over: over };
      }
    }
    tip.style.left = Math.round(best.x) + 'px';
    tip.style.top = Math.round(best.y) + 'px';
  }
  /* the grid is only valid for the frame it was measured in */
  function dropOcc() { occ = null; }
  window.addEventListener('resize', dropOcc);
  document.addEventListener('oh:floor-change', dropOcc);
  document.addEventListener('oh:map-revealed', dropOcc);
  function hideTip() { if (tip) tip.classList.remove('is-visible'); }
  window.addEventListener('scroll', hideTip, { passive: true });

  /* ---------- chips, shared by the panel and the tooltip ---------- */
  function chipHtml(key, withLabel) {
    var v = byKey[key];
    if (!v) return '';
    return '<span class="oh-viewchip" title="' + esc(v.description) + '">' + icon(v.icon) +
      (withLabel ? '<span>' + esc(v.label) + '</span>' : '') + '</span>';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- the unit panel: a "Views" row under the spec tiles ---------- */
  function paintPanel(u) {
    var head = document.querySelector('#ud-overview');
    if (!head) return;
    var box = head.querySelector('.unit-details_views');
    var list = tags(u).filter(function (k) { return byKey[k]; });
    if (!list.length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.className = 'unit-details_views';
      box.innerHTML = '<span class="unit-details_views-label">Views</span><span class="unit-details_views-chips"></span>';
      var specs = head.querySelector('.unit-details_specs');
      if (specs) specs.parentNode.insertBefore(box, specs.nextSibling);
      else head.appendChild(box);
    }
    box.querySelector('.unit-details_views-chips').innerHTML = list.map(function (k) { return chipHtml(k, true); }).join('');
  }

  /* ---------- the plot tooltip: icon chips under the specs ---------- */
  function bindTooltip() {
    var canvas = document.querySelector('.site-plan_map-canvas');
    var root = document.querySelector('[data-tooltip="root"]');
    if (!canvas || !root || root.__ohViewsBound) return;
    root.__ohViewsBound = true;
    var row = document.createElement('div');
    row.className = 'site-plan_tooltip-views';
    row.hidden = true;
    root.appendChild(row);
    canvas.addEventListener('mouseover', function (e) {
      var shape = e.target.closest && e.target.closest('.site-plan_plot[id]');
      if (shape && shape.classList.contains('is-dimmed')) shape = null;
      var u = shape && units().filter(function (x) { return x.plot_id === shape.id; })[0];
      var list = u ? tags(u).filter(function (k) { return byKey[k]; }) : [];
      row.hidden = !list.length;
      row.innerHTML = list.map(function (k) { return chipHtml(k, true); }).join('');
    });
  }

  /* ---------- boot ---------- */
  function hook() {
    if (hooked || !window.ohSitePlan || !window.ohSitePlan.onChange) return;
    hooked = true;
    window.ohSitePlan.onChange(function () { syncMarkers(); layout(); });   /* fires now and on every apply() */
    bindTooltip();
  }
  document.addEventListener('oh:unit-open', function (e) {
    if (e.detail && e.detail.unit) paintPanel(e.detail.unit);
  });
  document.addEventListener('oh:map-revealed', function () { if (views.length) buildMarkers(); else layout(); });

  /* ask for the taxonomy the moment this file runs - six rows, and the markers
     should land with the rest of the map rather than seconds later */
  fetch(API + '/views').then(function (r) { return r.json(); }).then(setViews).catch(function () {});

  function ready() {
    if (views.length) { buildChips(); buildMarkers(); }
    hook();
    var n = 0, iv = setInterval(function () { hook(); if ((hooked && views.length) || ++n > 40) clearInterval(iv); }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();

/* ============================================================
   Mobile peek sheet
   ------------------------------------------------------------
   On a phone there is no hover, so the plan's tooltip never runs and a tap
   had to commit to something: a coming-soon plot threw the full notify-me
   popup over the whole screen, and a parking bay jumped straight into the
   unit panel. Either way you lost the map and could not see what you had
   just tapped. Both now raise a small sheet from the bottom instead - what
   this plot is, and one button to go further:

     soon  coming-soon plot -> Coming soon pill, unit, type -> Notify me
     bay   parking bay      -> Bay pill, the unit it belongs to -> View the
                               unit (Notify me if it is coming soon, and no
                               button at all if it is already taken)

   The tapped shape stays outlined behind the sheet. Desktop is untouched:
   the plan's handlers ask shouldUse() first, so the popup and the panel
   still open directly and the sheet is never even built.
   ============================================================ */
(function () {
  if (window.__ohSheet) return;
  window.__ohSheet = true;

  var MOBILE = '(max-width: 991px)';
  var TAKEN = ['reserved', 'sold', 'sold-out', 'pending'];
  var sheet = null, current = null;

  function shouldUse() {
    return window.matchMedia(MOBILE).matches;
  }

  function build() {
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.className = 'site-plan_sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Selected plot');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML =
      '<button type="button" class="site-plan_sheet-close" aria-label="Close">\u00d7</button>' +
      '<span class="site-plan_sheet-pill"></span>' +
      '<div class="site-plan_sheet-title"></div>' +
      '<div class="site-plan_sheet-meta"></div>';
    mountBtn();
    sheet.querySelector('.site-plan_sheet-close').addEventListener('click', close);
    /* a tap inside the sheet is never a tap on the map behind it */
    sheet.addEventListener('click', function (e) { e.stopPropagation(); });
    (document.querySelector('.unit-filter_component') || document.body).appendChild(sheet);
    return sheet;
  }

  /* The sheet's action is the same component as the panel's Reserve button,
     cloned from the live instance so it cannot drift from it. The bindings
     that only belong to the original come off: wized (Wized would write the
     unit into two elements), defijn-modal (it would open the reserve popup),
     data-w-id (an IX2 binding is not ours to duplicate), id and href. */
  var BTN_SRC = '[wized="v2_udReserveBtn"], .unit-details_actionbar-reserve .button, a.button.primary';
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

  function makeBtn(cls) {
    var src = captureBtn();
    var el;
    if (src) {
      el = src.cloneNode(true);
      el.setAttribute('data-oh-btn', 'clone');
      ['wized', 'data-v2', 'defijn-modal', 'defijn-modal-element', 'data-w-id', 'id', 'href', 'data-actionbar-reserve']
        .forEach(function (a) { el.removeAttribute(a); });
      el.querySelectorAll('[wized],[data-w-id],[id],[defijn-modal]').forEach(function (n) {
        ['wized', 'data-v2', 'data-w-id', 'id', 'defijn-modal', 'defijn-modal-element'].forEach(function (a) { n.removeAttribute(a); });
      });
    } else {
      /* the panel is not on the page (or not built yet): same classes by hand */
      el = document.createElement('a');
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
        '</div>';
    }
    el.setAttribute('role', 'button');
    el.setAttribute('href', '#');
    el.classList.add(cls || 'site-plan_sheet-btn');
    return el;
  }
  /* the component keeps its text in .button-text; a fallback <a> may not */
  function btnLabel(btn, text) {
    var t = btn.querySelector('.button-text');
    if (t) t.textContent = text; else btn.textContent = text;
  }

  /* the shape behind the sheet keeps an outline, so it is obvious which one
     this is about - the bay and the unit share a plot_id, so mark the one
     that was actually tapped */
  function mark(el) {
    document.querySelectorAll('.site-plan_plot.is-peek').forEach(function (p) { p.classList.remove('is-peek'); });
    if (el) el.classList.add('is-peek');
  }

  /* the zoom control sits at the map's bottom-right, which is where the
     sheet lands - lift it by the sheet's height while it is up */
  function lift(on) {
    var map = document.querySelector('.unit-filter_map');
    if (!map) return;
    if (on && sheet) map.style.setProperty('--oh-sheet-h', Math.round(sheet.getBoundingClientRect().height) + 'px');
    else map.style.removeProperty('--oh-sheet-h');
    map.classList.toggle('has-sheet', !!on);
  }

  function place(u) {
    return [u.type_code ? 'Type ' + u.type_code : '', u.block_name ? 'Block ' + u.block_name : '',
            u.floor_label ? u.floor_label + ' level' : ''].filter(Boolean).join(' \u00b7 ');
  }

  function open(u, mode, el) {
    if (!u) return false;
    build();
    current = u;
    var soon = u.status_key === 'unreleased';
    var taken = TAKEN.indexOf(u.status_key) !== -1;
    var bay = mode === 'bay';

    sheet.setAttribute('data-mode', bay ? 'bay' : 'soon');
    sheet.querySelector('.site-plan_sheet-pill').textContent = bay
      ? 'Bay ' + (u.parking_bay_number || '') + (u.parking_bay_type ? ' \u00b7 ' + u.parking_bay_type : '')
      : 'Coming soon';
    sheet.querySelector('.site-plan_sheet-title').textContent = 'Unit ' + u.unit_number;
    /* on a bay the status is the thing you cannot see from the plan colour */
    sheet.querySelector('.site-plan_sheet-meta').textContent =
      [place(u), bay ? (soon ? 'Coming soon' : taken ? u.status : 'Available') : ''].filter(Boolean).join(' \u00b7 ');

    var btn = remountBtn() || sheet.querySelector('.site-plan_sheet-btn');
    var label = soon ? 'Notify me' : taken ? '' : 'View the unit';
    btnLabel(btn, label);
    btn.hidden = !label;

    sheet.setAttribute('aria-hidden', 'false');
    /* let the element land before the transition so it always animates */
    requestAnimationFrame(function () {
      sheet.classList.add('is-open');
      lift(true);
    });
    mark(el || document.querySelector('[data-unit="' + u.plot_id + '"]'));
    document.dispatchEvent(new CustomEvent('oh:peek', { detail: { unit: u, mode: bay ? 'bay' : 'soon' } }));
    return true;
  }

  function close() {
    if (!sheet || !sheet.classList.contains('is-open')) return;
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    current = null;
    mark(null);
    lift(false);
  }

  /* dismiss: a tap anywhere else, Escape, opening a unit, switching view,
     opening the filters drawer, or growing past the mobile breakpoint */
  document.addEventListener('click', function (e) {
    if (!sheet || !sheet.classList.contains('is-open')) return;
    if (sheet.contains(e.target)) return;
    /* a tap on another peekable plot re-opens it through the plan's own
       handler, which runs after this one - only close on everything else */
    if (e.target.closest && e.target.closest('.site-plan_plot')) return;
    close();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  document.addEventListener('oh:unit-open', close);
  document.addEventListener('oh:notify-open', close);
  window.matchMedia(MOBILE).addEventListener('change', function (e) { if (!e.matches) close(); });

  window.ohSheet = { open: open, close: close, shouldUse: shouldUse, current: function () { return current; } };
  /* the site's button, for anything else that needs one: make(cls) returns the
     component (cloned while Wized still has it on the page, else built from the
     same markup) and label() writes into whichever of the two it handed back */
  window.ohButton = { make: makeBtn, label: btnLabel };
  /* the first name this shipped under, before parking bays used it too */
  window.ohSoonSheet = window.ohSheet;
})();

/* ============================================================
   Site plan viewport — fit, centre, zoom, pan.

   Layout: .unit-filter_map-container is the viewport (fixed height, overflow
   hidden, scrolls programmatically). Inside it .site-plan_map is a stage with
   padding of half the viewport on every side, so the plan can be dragged
   until any edge sits in the middle of the box. .site-plan_map-canvas gets an
   explicit pixel width: fit-to-viewport ("contain", 94%) × zoom. Zoom drives
   --oh-zoom too (labels read it). Wheel zooms towards the pointer; +/- zoom
   around the viewport centre; drag pans; the plan starts centred.
   ============================================================ */
(function () {
  if (window.__ohZoom) return;
  window.__ohZoom = true;

  var STEP = 0.25, MAX = 4, MIN = 0.5, FIT = 0.94;
  var SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">';
  var ICON = {
    out: SVG + '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.7-4.7M7.5 10.5h6"/></svg>',
    "in": SVG + '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.7-4.7M7.5 10.5h6M10.5 7.5v6"/></svg>',
    reset: SVG + '<path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4"/></svg>'
  };

  var canvas, box, stage, wrap, ui, level, btnIn, btnOut, btnReset, img;
  var zoom = 1, baseW = 0, aspect = 0, booted = false;

  function ratio() {
    if (aspect) return aspect;
    if (img && img.naturalWidth) aspect = img.naturalWidth / img.naturalHeight;
    else { var svg = canvas.querySelector('svg'); var vb = svg && (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number); if (vb && vb[2]) aspect = vb[2] / vb[3]; }
    return aspect || 1690 / 1490;
  }
  /* Mobile portrait: the box is much taller than the plan's aspect, so a
     "contain" fit leaves a dead band above and below it. Fill the box instead
     (the sides overflow and pan), which is what the freed-up height was for.
     Zoom 1 is still "the default view", so the % readout and Reset are
     unchanged, and a rotation re-measures through the ResizeObserver. */
  function fillsBox() {
    return window.matchMedia('(max-width: 991px)').matches && box.clientHeight > box.clientWidth * 1.15;
  }
  /* width of the plan at zoom 1: fits the viewport with a little air */
  function measure() {
    var bw = box.clientWidth, bh = box.clientHeight;
    if (!bw || !bh) return;
    var r = ratio();
    baseW = fillsBox() ? Math.round(Math.max(bw, bh * r))
                       : Math.round(Math.min(bw * FIT, bh * FIT * r));
    stage.style.padding = Math.round(bh * 0.5) + 'px ' + Math.round(bw * 0.5) + 'px';
    setWidth();
  }
  function setWidth() {
    var w = Math.round(baseW * zoom);
    canvas.style.width = w + 'px';
    canvas.style.setProperty('--oh-zoom', zoom);
    var ext = document.querySelector('.site-plan_map-extension');
    if (ext) { ext.style.width = w + 'px'; ext.style.setProperty('--oh-zoom', zoom); }
  }
  function label() {
    if (level) level.textContent = Math.round(zoom * 100) + '%';
    if (btnIn) btnIn.disabled = zoom >= MAX - 0.001;
    if (btnOut) btnOut.disabled = zoom <= MIN + 0.001;
    if (btnReset) btnReset.disabled = Math.abs(zoom - 1) < 0.001;
    box.classList.toggle('is-zoomed', zoom > 1.001);
    box.classList.toggle('is-zoomed-out', zoom < 0.999);
    box.setAttribute('data-zoom', zoom.toFixed(2));
  }
  function centre() {
    box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
    box.scrollTop = (box.scrollHeight - box.clientHeight) / 2;
  }
  /* zoom keeping the plan point under (px,py) — viewport coords — fixed */
  function zoomAt(next, px, py) {
    next = Math.max(MIN, Math.min(MAX, Math.round(next * 100) / 100));
    if (next === zoom) { label(); return; }
    var padL = parseFloat(stage.style.paddingLeft) || 0, padT = parseFloat(stage.style.paddingTop) || 0;
    var oldW = canvas.offsetWidth, oldH = canvas.offsetHeight;
    var fx = (box.scrollLeft + px - padL) / oldW, fy = (box.scrollTop + py - padT) / oldH;
    zoom = next;
    setWidth();
    var newW = canvas.offsetWidth, newH = canvas.offsetHeight;
    box.scrollLeft = fx * newW + padL - px;
    box.scrollTop = fy * newH + padT - py;
    label();
    if (ui) ui.setAttribute('data-zoom-value', zoom);
  }
  function set(next) { zoomAt(next, box.clientWidth / 2, box.clientHeight / 2); }

  function build() {
    ui = document.createElement('div');
    ui.className = 'site-plan_zoom';
    ui.setAttribute('role', 'group');
    ui.setAttribute('aria-label', 'Map zoom');
    ui.innerHTML =
      '<button type="button" class="site-plan_zoom-btn" data-zoom="out" aria-label="Zoom out" title="Zoom out">' + ICON.out + '</button>' +
      '<span class="site-plan_zoom-level" aria-live="polite">100%</span>' +
      '<button type="button" class="site-plan_zoom-btn" data-zoom="in" aria-label="Zoom in" title="Zoom in">' + ICON['in'] + '</button>' +
      '<button type="button" class="site-plan_zoom-btn" data-zoom="reset" aria-label="Reset zoom" title="Reset zoom">' + ICON.reset + '</button>';
    wrap.appendChild(ui);
    level = ui.querySelector('.site-plan_zoom-level');
    btnOut = ui.querySelector('[data-zoom="out"]');
    btnIn = ui.querySelector('[data-zoom="in"]');
    btnReset = ui.querySelector('[data-zoom="reset"]');
    ui.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-zoom]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var a = b.getAttribute('data-zoom');
      if (a === 'reset') { zoom = 1; setWidth(); centre(); label(); }
      else set(a === 'in' ? zoom + STEP : zoom - STEP);
    });
  }

  function bindPan() {
    var down = null, moved = false, pinching = false;
    box.addEventListener('pointerdown', function (e) {
      /* the second finger of a pinch is not the start of a new drag */
      if (pinching) return;
      if (e.button !== 0 || e.target.closest('.site-plan_zoom, .site-plan_floor-switch, .site-plan_badge, button')) return;
      down = { x: e.clientX, y: e.clientY, sl: box.scrollLeft, st: box.scrollTop, id: e.pointerId };
      moved = false;
    });
    box.addEventListener('pointermove', function (e) {
      /* While a pinch is in flight the pinch owns the scroll offsets. The box
         is touch-action:none, so every finger also arrives here as a pointer
         event: this handler used to keep writing box.scrollLeft = down.sl - dx
         from the FIRST finger's displacement, overwriting the offsets zoomAt
         had just set to hold the midpoint still. As the fingers spread, dx
         grew, the scroll was pushed to 0 and clamped there - which is why
         pinch-zoom read as anchored to the plan's top-left corner. */
      if (pinching || !down) return;
      var dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      if (!moved) { moved = true; box.classList.add('is-panning'); try { box.setPointerCapture(down.id); } catch (_) {} }
      box.scrollLeft = down.sl - dx;
      box.scrollTop = down.st - dy;
      e.preventDefault();
    });
    function end() { if (down && moved) { try { box.releasePointerCapture(down.id); } catch (_) {} } down = null; box.classList.remove('is-panning'); setTimeout(function () { moved = false; }, 0); }
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    /* a drag must not read as a click on a plot */
    box.addEventListener('click', function (e) { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);
    /* wheel zooms towards the pointer (plain wheel and ctrl/⌘ + wheel / trackpad pinch) */
    box.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = box.getBoundingClientRect();
      var k = (e.ctrlKey || e.metaKey) ? 0.0125 : 0.0025;
      var factor = Math.exp(-e.deltaY * k);
      zoomAt(zoom * factor, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    /* pinch on touch devices: zooms towards the midpoint of the two fingers.
       Scale is measured against the span at gesture start, so it cannot drift. */
    var pinch = null;
    box.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 2) return;
      pinch = { d: dist(e), z: zoom };
      pinching = true;
      /* stand the pan down and forget the drag the first finger began */
      down = null;
      box.classList.remove('is-panning');
    }, { passive: true });
    box.addEventListener('touchmove', function (e) {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      var r = box.getBoundingClientRect(), m = mid(e);
      zoomAt(pinch.z * dist(e) / pinch.d, m.x - r.left, m.y - r.top);
    }, { passive: false });
    function endPinch(e) {
      if (e.touches && e.touches.length >= 2) return;
      pinch = null;
      pinching = false;
      /* one finger still down: carry on panning from where it is now, rather
         than from wherever the pinch started */
      if (e.touches && e.touches.length === 1) {
        var t = e.touches[0];
        down = { x: t.clientX, y: t.clientY, sl: box.scrollLeft, st: box.scrollTop, id: null };
        moved = true;   /* already a gesture, so no 5px threshold and no click */
      }
    }
    box.addEventListener('touchend', endPinch, { passive: true });
    box.addEventListener('touchcancel', endPinch, { passive: true });
    function dist(e) { var a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1; }
    function mid(e) { var a = e.touches[0], b = e.touches[1]; return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }; }
  }

  /* the view badges (if any) dock on the wrapper */
  function dock() {
    var host = document.querySelector('[data-view-badges]');
    if (host && host.parentNode !== wrap) { wrap.appendChild(host); host.style.cssText = 'position:absolute;inset:0;z-index:6;pointer-events:none;'; }
  }

  function boot() {
    if (booted) return true;
    canvas = document.querySelector('.site-plan_map-canvas');
    box = document.querySelector('.unit-filter_map-container');
    stage = document.querySelector('.site-plan_map');
    wrap = document.querySelector('.unit-filter_map') || (box && box.parentNode);
    img = canvas && canvas.querySelector('img');
    if (img && img.loading === 'lazy') img.loading = 'eager'; /* the viewport needs its size now */
    if (!canvas || !box || !stage || !wrap) return false;
    booted = true;
    box.classList.add('is-viewport');
    measure();
    build();
    bindPan();
    label();
    dock();
    centre();
    requestAnimationFrame(centre);
    if (img && !img.complete) img.addEventListener('load', function () { aspect = 0; measure(); centre(); });
    var t, lastW = box.clientWidth;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { lastW = box.clientWidth; measure(); centre(); label(); }, 150);
    });
    /* re-fit when the column changes width; a height-only change can be our own
       stage padding echoing back through an auto-height ancestor, so ignore it */
    if (window.ResizeObserver) new ResizeObserver(function () { if (box.clientWidth === lastW) return; lastW = box.clientWidth; clearTimeout(t); t = setTimeout(function () { measure(); centre(); }, 100); }).observe(box);
    window.ohMapView = { zoom: function () { return zoom; }, set: set, centre: centre, fit: function () { zoom = 1; setWidth(); centre(); label(); } };
    return true;
  }

  function ready() {
    if (boot()) return;
    var n = 0, iv = setInterval(function () { if (boot() || ++n > 40) clearInterval(iv); }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();


/* ============================================================
   Reservation flow - Xano hold, then BOL / REDi

   Order matters: the 30-minute hold is placed in Xano FIRST (the existing
   v1 endpoint units/{id}/hold - it is the one thing v2 still calls on the
   old API group, on purpose, because holds and SIMS live there until
   cutover). Only once the hold is confirmed does the buyer go to BOL. A
   409-style refusal ("being reserved by someone else", "no longer
   available") stops the flow with the message from Xano and never opens
   BOL. The v1 page did these two in parallel via a Wized submit action;
   here it is one explicit chain, no Wized involvement.

   Form: #wf-form-reserve-unit-v2 with first_name, last_name, email,
   contact_number and hidden unit_id / unit_number (bound by Wized from
   v2_selectedUnit, or filled here from the controller as a fallback).
   ============================================================ */
/* Hand a form to Webflow's own submit handler (Webflow Forms → LeadConnector),
   the same path the home-page Register Interest form takes. Our capture-phase
   handlers see __ohNative and step aside for that one event. A synthetic submit
   event has no default action, so if Webflow's handler is missing nothing
   navigates. Optional doneText replaces the wrapper's success message. */
window.ohNativeSubmit = async function (form, doneText) {
  if (!form) return false;
  try {
    const wrap = form.closest('.w-form');
    const done = wrap && wrap.querySelector('.w-form-done');
    if (done && doneText) { const inner = done.querySelector('div') || done; inner.textContent = doneText; }
    /* Turnstile: Webflow renders the widget only once the form is on screen
       (forms in popups get it when the popup opens) and posts without a
       token if asked too early, which Webflow rejects with a 422. Give the
       token up to 8s to arrive. */
    if (form.hasAttribute('data-turnstile-sitekey') && window.jQuery) {
      const t0 = Date.now();
      while (Date.now() - t0 < 8000) {
        const d = window.jQuery.data(form, '.w-form');
        if (d && d.turnstileToken) break;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    form.__ohNative = true;
    try { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
    finally { form.__ohNative = false; }
    return true;
  } catch (e) { console.warn('[native-submit]', e); return false; }
};

(function () {
  const HOLD_ENDPOINT = 'https://x7aj-untn-pq4t.n7e.xano.io/api:5xvncF1S/units/{id}/hold';
  /* 19 Sep 2026: back on BOL PROD. test0 was unreachable (its load balancer returned a
     bare 503 with no CORS headers, so the browser reported only "Failed to fetch"), so the
     handoff is verified against prod0 instead. Swap the two lines to return to test. */
  const API_ENDPOINT = 'https://bol-server-prod0.red-i.co.za/api/reservationSession/start?manualRedirect=true';
  // const API_ENDPOINT = 'https://bol-server-test0.red-i.co.za/api/reservationSession/start?manualRedirect=true';
  const ACCOUNT_CODE = 'evening-shade-properties-109';
  const DEVELOPMENT_CODE = 'oakhills-estate';
  const FORM_ID = 'wf-form-reserve-unit-v2';

  function genOrderRef() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `WF-${date}-${Date.now()}-${rand}`;
  }

  function get(form, name) {
    const el = form.querySelector(`[name="${name}"]`);
    return el ? String(el.value || '').trim() : '';
  }

  function formatPhone(phone) {
    if (!phone) return '';
    phone = phone.replace(/[\s\-\(\)]/g, '');
    if (!phone.startsWith('+27') && !phone.startsWith('27')) {
      if (phone.startsWith('0')) phone = phone.substring(1);
      phone = '+27' + phone;
    } else if (phone.startsWith('27') && !phone.startsWith('+')) {
      phone = '+' + phone;
    }
    return phone;
  }

  /* The box sits on the .w-form WRAPPER, not inside the <form>: Webflow hides the
     form element when it swaps in its success block, so a message written inside it
     disappears exactly when a buyer most needs to read it. */
  function showMsg(form, msg, isError) {
    const host = form.closest('.w-form') || form.parentNode || form;
    let box = host.querySelector('.reservation-status');
    if (!box) {
      box = document.createElement('div');
      box.className = 'reservation-status';
      box.style.marginTop = '8px';
      box.style.fontSize = '0.95rem';
      host.appendChild(box);
    }
    box.textContent = msg;
    box.style.color = isError ? 'crimson' : 'inherit';
  }

  function selectedUnit() {
    try {
      const v = window.Wized && window.Wized.data && window.Wized.data.v;
      if (v && v.v2_selectedUnit) return v.v2_selectedUnit;
    } catch (_) {}
    return null;
  }

  function collect(form) {
    const u = selectedUnit() || {};
    const lead = {
      first_name: get(form, 'first_name'),
      last_name: get(form, 'last_name'),
      email: get(form, 'email'),
      contact_number: get(form, 'contact_number'),
    };
    const unitId = get(form, 'unit_id') || (u.id != null ? String(u.id) : '');
    const unitNumber = get(form, 'unit_number') || (u.unit_number != null ? String(u.unit_number) : '');

    if (!lead.first_name || !lead.last_name || !lead.email || !lead.contact_number) {
      throw new Error('Please fill in all required fields before submitting.');
    }
    if (!unitId || !unitNumber) {
      throw new Error('Please select a unit first.');
    }
    return { lead, unitId, unitNumber };
  }

  async function placeHold(unitId, lead) {
    const res = await fetch(HOLD_ENDPOINT.replace('{id}', encodeURIComponent(unitId)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        units_id: Number(unitId),
        lead_first_name: lead.first_name,
        lead_last_name: lead.last_name,
        lead_email: lead.email,
        lead_contact_number: lead.contact_number,
      }),
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      throw new Error((data && (data.message || data.error)) || 'This unit could not be held. Please try again.');
    }
    return data;
  }

  async function startBol(unitNumber, lead) {
    const payload = {
      redirect: window.location.origin,
      units: [{ account: ACCOUNT_CODE, development: DEVELOPMENT_CODE, unit: unitNumber, selectedPlan: '' }],
      orderReference: genOrderRef(),
      buyerDetails: {
        people: [{
          id: 1,
          firstName: lead.first_name,
          lastName: lead.last_name,
          email: lead.email,
          mobileNumber: formatPhone(lead.contact_number),
        }],
      },
    };
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let msg = `Reservation failed (${res.status})`;
      try { const err = await res.json(); msg = err.message || err.error || msg; } catch (_) {}
      throw new Error(msg);
    }
    const data = await res.json();
    const redirectUrl = data.redirectUrl || data.url || data.reservationUrl;
    if (!redirectUrl) throw new Error('No redirect URL received from server');
    return redirectUrl;
  }

  function bind() {
    const form = document.getElementById(FORM_ID);
    if (!form) return;
    if (form.__ohReserve) return;
    form.__ohReserve = true;

    form.addEventListener('submit', async function (e) {
      if (form.__ohNative) return; /* Webflow's turn */
      e.preventDefault();
      e.stopImmediatePropagation();
      const btn = form.querySelector('input[type="submit"], button[type="submit"]');
      const originalLabel = btn && (btn.value || btn.textContent);
      const setLabel = (t) => { if (!btn) return; if ('value' in btn) btn.value = t; else btn.textContent = t; };

      try {
        if (btn) { btn.disabled = true; setLabel('Reserving...'); }
        const { lead, unitId, unitNumber } = collect(form);

        showMsg(form, 'Holding your unit...');

        /* Both at once, the way v1 does it - v1's page script never stops propagation,
           so Wized's reserve_unit_form submit (add_user_reservation +
           change_unit_status_reserved) runs alongside the BOL POST. Serialising them
           in v2 broke the handoff: the hold flips the unit in Xano first, and BOL then
           will not open a session for a unit that is no longer clear. */
        const [holdRes, bolRes] = await Promise.allSettled([
          placeHold(unitId, lead),
          startBol(unitNumber, lead),
        ]);

        /* A refused hold wins over a successful BOL answer: someone else took the
           unit, so the buyer must not be sent on to pay for it. */
        if (holdRes.status === 'rejected') throw holdRes.reason;
        if (bolRes.status === 'rejected') throw bolRes.reason;

        document.dispatchEvent(new CustomEvent('oh:hold-placed', { detail: { unitId } }));

        /* Only now, with a redirect URL in hand, hand the form to Webflow Forms
           (LeadConnector). Doing this before BOL answered swapped in the success
           block and hid every error behind a false "Thank you". */
        showMsg(form, 'Taking you to the secure reservation page...');
        await window.ohNativeSubmit(form, 'Taking you to the secure reservation page...');
        await new Promise((r) => setTimeout(r, 400));

        /* same tab: window.open is blocked by Safari and in-app browsers */
        window.location.href = bolRes.value;
      } catch (err) {
        console.error('[reserve]', err);
        showMsg(form, err.message || 'Something went wrong.', true);
        if (btn) { btn.disabled = false; setLabel(originalLabel); }
      }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  /* the form may be inside the panel Wized renders later */
  document.addEventListener('oh:unit-open', bind);
})();


/* ============================================================
   Notify me — register interest in a unit that is not released yet
   ------------------------------------------------------------
   Unreleased units never open the detail panel; clicking one on the plan
   opens the "notify-unit-v2" popup instead (the site's defijn-modal
   pattern, triggered through a hidden [data-notify-trigger] element so
   the modal library does the opening/closing). The summary rows are bound
   by Wized from v2_notifyUnit; the hidden unit_id/unit_number inputs are
   filled here as well so the submit works without Wized.
   Form: #wf-form-notify-unit-v2 → POST Oak Hills v2 /interest.
   ============================================================ */
(function () {
  const ENDPOINT = 'https://x7aj-untn-pq4t.n7e.xano.io/api:BHoGDH-q/interest';
  const FORM_ID = 'wf-form-notify-unit-v2';
  const TRIGGER = '[data-notify-trigger]';
  let current = null;

  function setVar(u) {
    try { if (window.Wized && window.Wized.data && window.Wized.data.v) window.Wized.data.v.v2_notifyUnit = u; } catch (_) {}
  }
  function fillFallbacks(u) {
    const form = document.getElementById(FORM_ID);
    if (!form) return;
    const set = (n, v) => { const el = form.querySelector('[name="' + n + '"]'); if (el) el.value = v == null ? '' : String(v); };
    set('unit_id', u.id);
    set('unit_number', u.unit_number);
    const label = form.closest('.popup') && form.closest('.popup').querySelector('[data-notify="unit"]');
    if (label) label.textContent = 'Unit ' + u.unit_number + ' · Block ' + u.block_name + ' · ' + (u.floor_label || '') + ' level';
  }
  function reset(form) {
    const box = form.querySelector('.reservation-status');
    if (box) box.remove();
    const btn = form.querySelector('input[type="submit"], button[type="submit"]');
    if (btn) { btn.disabled = false; if (btn.__ohLabel) { if ('value' in btn) btn.value = btn.__ohLabel; else btn.textContent = btn.__ohLabel; } }
    form.querySelectorAll('[data-notify="fields"]').forEach((el) => { el.style.display = ''; });
    form.querySelectorAll('[data-notify="done"]').forEach((el) => { el.style.display = 'none'; });
  }
  function open(u) {
    current = u;
    setVar(u);
    fillFallbacks(u);
    const form = document.getElementById(FORM_ID);
    if (form) reset(form);
    const trigger = document.querySelector(TRIGGER);
    if (trigger) trigger.click();
    else console.warn('[notify] no ' + TRIGGER + ' element on the page');
    document.dispatchEvent(new CustomEvent('oh:notify-open', { detail: { unit: u } }));
  }

  function showMsg(form, msg, isError) {
    let box = form.querySelector('.reservation-status');
    if (!box) {
      box = document.createElement('div');
      box.className = 'reservation-status';
      box.style.marginTop = '8px';
      form.appendChild(box);
    }
    box.textContent = msg;
    box.style.color = isError ? 'crimson' : 'inherit';
  }
  const get = (form, n) => { const el = form.querySelector('[name="' + n + '"]'); return el ? String(el.value || '').trim() : ''; };

  function bind() {
    const form = document.getElementById(FORM_ID);
    if (!form || form.__ohNotify) return;
    form.__ohNotify = true;
    form.addEventListener('submit', async (e) => {
      if (form.__ohNative) return; /* Webflow's turn */
      e.preventDefault();
      e.stopImmediatePropagation();
      const btn = form.querySelector('input[type="submit"], button[type="submit"]');
      if (btn && !btn.__ohLabel) btn.__ohLabel = btn.value || btn.textContent;
      const setLabel = (t) => { if (!btn) return; if ('value' in btn) btn.value = t; else btn.textContent = t; };
      const u = current || {};
      const payload = {
        unit_id: Number(get(form, 'unit_id') || u.id || 0) || null,
        unit_number: get(form, 'unit_number') || u.unit_number || '',
        first_name: get(form, 'first_name'),
        last_name: get(form, 'last_name'),
        email: get(form, 'email'),
        contact_number: get(form, 'contact_number'),
        message: get(form, 'message'),
        source: 'unit-selection-v2',
        page_url: location.href.split('#')[0],
      };
      if (!payload.first_name || !payload.last_name || !payload.email) return showMsg(form, 'Please fill in your name and email.', true);
      if (!payload.unit_number) return showMsg(form, 'Please pick a unit on the plan first.', true);
      try {
        if (btn) { btn.disabled = true; setLabel('Sending...'); }
        const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        let data = null; try { data = await res.json(); } catch (_) {}
        if (!res.ok) throw new Error((data && data.message) || 'We could not save that. Please try again.');
        const doneText = 'Thank you — you are on the list for unit ' + payload.unit_number + '. We will be in touch the moment it is released.';
        /* Webflow Forms copy (feeds LeadConnector, unit_number/unit_id included); Webflow then shows its success block */
        const native = await window.ohNativeSubmit(form, doneText);
        form.querySelectorAll('[data-notify="fields"]').forEach((el) => { el.style.display = 'none'; });
        const done = form.querySelector('[data-notify="done"]');
        if (done && !native) { done.style.display = 'block'; const n = done.querySelector('[data-notify="done-unit"]'); if (n) n.textContent = payload.unit_number; }
        else if (!done && !native) showMsg(form, doneText);
        setLabel('Registered');
        document.dispatchEvent(new CustomEvent('oh:interest-registered', { detail: { unit: u, lead: payload } }));
      } catch (err) {
        console.error('[notify]', err);
        showMsg(form, err.message || 'Something went wrong.', true);
        if (btn) { btn.disabled = false; setLabel(btn.__ohLabel); }
      }
    }, true);
  }

  window.ohNotify = { open, current: () => current };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();


/* ============================================================
   Tablet/Mobile: map/list view switch + filter drawer + active-count badge
   ============================================================ */
(function () {
    function boot() {
      var component = document.querySelector('.unit-filter_component');
      if (!component) return;
      var filters = component.querySelector('.unit-filter_filters');
      var backdrop = document.querySelector('.unit-filter_backdrop');
      var viewLinks = [].slice.call(document.querySelectorAll('[data-view]'));

      // ---- map/list view switch ----
      function setView(v) {
        component.classList.toggle('is-view-list', v === 'list');
        var pw = document.querySelector('.page_wrap'); if (pw) pw.classList.toggle('is-view-list', v === 'list');
        if (v === 'map' && window.ohMapView) setTimeout(window.ohMapView.fit, 50);
        viewLinks.forEach(function (l) {
          l.classList.toggle('is-current', l.getAttribute('data-view') === v);
        });
      }
      viewLinks.forEach(function (l) {
        l.addEventListener('click', function (e) {
          e.preventDefault();
          setView(l.getAttribute('data-view'));
        });
      });
      // default to map view on load
      setView('map');

      // ---- filter drawer ----
      function openDrawer() {
        if (filters) filters.classList.add('is-open');
        if (backdrop) backdrop.classList.add('is-open');
        document.body.style.overflow = 'hidden';
      }
      function closeDrawer() {
        if (filters) filters.classList.remove('is-open');
        if (backdrop) backdrop.classList.remove('is-open');
        document.body.style.overflow = '';
      }
      document.querySelectorAll('[data-drawer="open"]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.preventDefault();
          openDrawer();
        });
      });
      document.querySelectorAll('[data-drawer="close"]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.preventDefault();
          closeDrawer();
        });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeDrawer();
      });

      /* ---- Filters button active count ----
         It counts the same elements the removable filter tags do, so the
         badge, the tags and the chips can never disagree. It used to look
         for `.unit-filter_chip`, which is not a class on this page (the
         Designer's is `.unit-filter_chip-1`), so it always read 0 and the
         badge never appeared. It also polled on click; now it rides
         ohSitePlan.onChange, which fires on boot and after every apply()
         however the state changed - chip, marker, tag, Reset or deep link.
         The Designer ships it with an inline display:none, so the inline
         style is what has to be written back. */
      var badge = document.querySelector('[data-active-count]');
      function updateBadge() {
        if (!badge) return;
        var n = document.querySelectorAll(window.ohTagSel || '[data-filter][data-value].is-active, [data-toggle].is-active').length;
        badge.textContent = String(n);
        badge.style.display = n ? '' : 'none';
        badge.setAttribute('aria-label', n + (n === 1 ? ' active filter' : ' active filters'));
      }
      updateBadge();
      (function subscribe() {
        if (window.ohSitePlan && window.ohSitePlan.onChange) return window.ohSitePlan.onChange(updateBadge);
        var n = 0, iv = setInterval(function () {
          if (window.ohSitePlan && window.ohSitePlan.onChange) { clearInterval(iv); window.ohSitePlan.onChange(updateBadge); }
          else if (++n > 40) clearInterval(iv);
        }, 250);
      })();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  })();

/* ============================================================
   More filters disclosure + Lenis opt-out for the drawer
   ============================================================ */
(function () {
  function boot() {
    var drawer = document.querySelector('.unit-filter_filters');
    var list = document.querySelector('.unit-filter_more-list');
    var wrap = document.querySelector('.unit-filter_more-button');

    /* Lenis hijacks wheel/touch globally - this opts the drawer out so it
       scrolls natively while the page behind stays locked. */
    if (drawer && !drawer.hasAttribute('data-lenis-prevent')) {
      drawer.setAttribute('data-lenis-prevent', '');
    }

    /* Page scroll lock tied to drawer state (no lenis.stop - that would also
       block touch scrolling inside the drawer). */
    if (drawer && !drawer.__ohxLock) {
      drawer.__ohxLock = true;
      var sync = function () {
        var open = drawer.classList.contains('is-open');
        document.documentElement.style.overflow = open ? 'hidden' : '';
        document.body.style.overflow = open ? 'hidden' : '';
      };
      new MutationObserver(sync).observe(drawer, { attributes: true, attributeFilter: ['class'] });
      sync();
    }

    if (!list || !wrap || list.__ohxMore) return;
    list.__ohxMore = true;

    function clearInline() {
      list.style.removeProperty('height');
      list.style.removeProperty('display');
      list.style.removeProperty('opacity');
    }

    function setLabel(isOpen) {
      var next = isOpen ? 'Fewer Filters' : 'More Filters';
      var nodes = wrap.querySelectorAll('*');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.children.length) continue;
        var t = (el.textContent || '').trim();
        if (t === 'More Filters' || t === 'Fewer Filters') el.textContent = next;
      }
    }

    clearInline();
    list.classList.add('svx-more-collapsed');
    setLabel(false);

    wrap.addEventListener('click', function (e) {
      e.preventDefault();
      clearInline();
      var willOpen = list.classList.contains('svx-more-collapsed');
      list.classList.toggle('svx-more-collapsed', !willOpen);
      list.classList.toggle('svx-more-open', willOpen);
      wrap.classList.toggle('is-open', willOpen);
      setLabel(willOpen);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ============================================================
   Floorplan lightbox
   ============================================================ */
(function () {
  function boot() {
    var box = document.createElement('div');
    box.className = 'fp-lightbox';
    /* the .fp-zoom wrapper is the tap-to-zoom viewer (module below) */
    box.innerHTML = '<button class="fp-lightbox_close" aria-label="Close">&#10005;</button>' +
      '<div class="fp-zoom" data-lenis-prevent><img alt="Floor plan"></div>';
    document.body.appendChild(box);
    var img = box.querySelector('img');

    function open(src, alt) {
      if (!src) return;
      img.src = src;
      img.alt = alt || 'Floor plan';
      box.classList.add('is-open');
    }
    function close() {
      box.classList.remove('is-open');
      img.removeAttribute('src');
    }

    box.addEventListener('click', function (e) {
      /* the backdrop, the letterbox around the plan, or the close button.
         A tap on the plan itself is the zoom module's (it stops propagation
         when it acts, so a zoomed-in plan never closes by accident). */
      if (e.target === box || e.target.classList.contains('fp-zoom') || e.target.closest('.fp-lightbox_close')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && box.classList.contains('is-open')) close();
    });

    /* Capture phase: takes over before Webflow's own lightbox handler, which
       still references the static placeholder asset rather than the Wized src. */
    document.addEventListener('click', function (e) {
      var hit = e.target.closest('.unit-details_floorplan-lightbox, .unit-details_floorplan-image');
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      var pic = hit.matches('img') ? hit : hit.querySelector('img');
      if (pic) open(pic.currentSrc || pic.src, pic.alt);
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ============================================================
   Floor plan viewer: fill + tap zoom

   Two places show a plan full-screen - the unit-details lightbox above and
   the unit types "View Floor Plan" modal (Webflow's custom-modal popup) - and
   both get the same viewer: the plan fills whatever room it has (the modal is
   a full-screen sheet below 992px, see the page head CSS), one tap zooms in
   on the spot that was tapped, one tap zooms out.

   Zooming is layout, not transform: the .fp-zoom wrapper turns into a plain
   scroll container and the image is laid out at the zoomed size, so panning
   is the browser's own touch scrolling (momentum and all) and needs no
   gesture code. A pan never produces a click, so dragging around a zoomed
   plan cannot zoom it back out. Both viewers reset when they close or when
   the plan changes.
   ============================================================ */
(function () {
  var MIN = 2, MAX = 3;                /* zoom to the plan's real pixels, within this band */
  var MODAL = '.popup[defijn-modal-element="unit-floorplan"] .modal-content, .popup[custom-modal-element="unit-floorplan"] .modal-content';

  function wrap(img) {
    if (!img) return null;
    if (img.parentNode.classList.contains('fp-zoom')) return img.parentNode;
    var w = document.createElement('div');
    w.className = 'fp-zoom';
    w.setAttribute('data-lenis-prevent', '');
    img.parentNode.insertBefore(w, img);
    w.appendChild(img);
    return w;
  }

  function zoomOut(w) {
    var img = w.querySelector('img');
    w.classList.remove('is-zoomed');
    if (img) { img.style.width = ''; img.style.marginTop = ''; }
    w.scrollLeft = 0;
    w.scrollTop = 0;
  }

  function zoomIn(w, img, x, y) {
    var r = img.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var fx = (x - r.left) / r.width;    /* where they tapped, as a fraction of the plan */
    var fy = (y - r.top) / r.height;
    var scale = img.naturalWidth ? img.naturalWidth / r.width : MIN;
    scale = Math.max(MIN, Math.min(MAX, scale));
    var W = r.width * scale, H = r.height * scale;
    w.classList.add('is-zoomed');
    img.style.width = W + 'px';
    var cw = w.clientWidth, ch = w.clientHeight;
    /* a plan shorter than the viewer stays vertically centred */
    img.style.marginTop = H < ch ? ((ch - H) / 2) + 'px' : '';
    /* and the tapped spot lands in the middle of the viewer */
    w.scrollLeft = Math.max(0, fx * W - cw / 2);
    w.scrollTop = Math.max(0, fy * H - ch / 2);
  }

  /* reset when the viewer closes (lightbox: is-open, modal: is-active) or
     when the plan itself changes (a new unit, another type) */
  function watch(w, root) {
    var img = w.querySelector('img');
    new MutationObserver(function () {
      if (!root.classList.contains('is-open') && !root.classList.contains('is-active')) zoomOut(w);
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
    if (img) new MutationObserver(function () { zoomOut(w); }).observe(img, { attributes: true, attributeFilter: ['src'] });
  }

  document.addEventListener('click', function (e) {
    var w = e.target.closest('.fp-zoom');
    if (!w) return;
    var img = w.querySelector('img');
    if (w.classList.contains('is-zoomed')) {
      e.preventDefault();
      e.stopPropagation();
      zoomOut(w);
    } else if (img && e.target === img) {
      e.preventDefault();
      e.stopPropagation();
      zoomIn(w, img, e.clientX, e.clientY);
    }
    /* a tap on the letterbox around an unzoomed plan is left to the viewer
       (the lightbox closes on it) */
  }, true);

  function boot() {
    var lb = document.querySelector('.fp-lightbox .fp-zoom');
    if (lb) watch(lb, lb.closest('.fp-lightbox'));
    var modal = document.querySelector(MODAL);
    var img = modal && modal.querySelector('img');
    if (img) watch(wrap(img), modal.closest('.popup'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();


/* ============================================================
   Deep links + WhatsApp sharing

   Two things are shareable and they work the same way: a URL param that
   reopens what the sender was looking at, and a WhatsApp button that wraps
   that link in a sentence. So they share one module, one link builder and
   one click handler rather than a copy each.

     [wized="v2_shareWhatsapp"]  a unit          ?unit=<unit number>
     [wized="v2_shareFloorplan"] a type's plan   ?type=<type code>&floorplan=1

   Only ?unit= is written to the address bar as you browse, and only while
   the detail panel is open. ?type= is built at share time instead: a type is
   always selected, so syncing it would stamp a param on the landing URL of
   every visit - including the ad traffic that arrives on / - for no gain.
   ============================================================ */
(function(){
  var UNIT = 'unit', TYPE = 'type', FLOORPLAN = 'floorplan';
  var ESTATE = 'Oakhills Estate, Stellenbosch';
  window.Wized = window.Wized || [];
  window.Wized.push(function(Wized){

    function units(){ try { return (Wized.data.r.v2_getUnits && Wized.data.r.v2_getUnits.data) || []; } catch(e){ return []; } }
    function selected(){ try { return Wized.data.v.v2_selectedUnit || null; } catch(e){ return null; } }
    function selectedType(){ try { return Wized.data.v.v2_selectedType || null; } catch(e){ return null; } }
    function unitKey(u){ return u ? String(u.unit_number != null ? u.unit_number : u.plot_id) : null; }
    function param(name){ return new URL(window.location.href).searchParams.get(name); }

    /* poll for something that only exists once Wized has rendered; the unit
       list and the type tabs both arrive well after DOMContentLoaded */
    function waitFor(test, done, tries){
      var n = 0, max = tries || 60;
      var t = setInterval(function(){
        var got = test();
        if (got || ++n > max) { clearInterval(t); if (got) done(got); }
      }, 200);
    }

    /* ---- 1. URL param sync: ?unit=<unit_number> follows the selection ---- */
    function setParam(u){
      var url = new URL(window.location.href);
      var key = unitKey(u);
      if (key) { url.searchParams.set(UNIT, key); } else { url.searchParams.delete(UNIT); }
      window.history.replaceState({}, '', url.toString());
    }
    var wrap = document.querySelector('.site-plan_detail-wrap');
    if (wrap) {
      new MutationObserver(function(){
        setParam(wrap.classList.contains('is-open') ? selected() : null);
      }).observe(wrap, { attributes:true, attributeFilter:['class'] });
    }
    /* selecting another unit while the panel is already open */
    document.addEventListener('click', function(e){
      if (e.target.closest('.site-plan_plot, [data-plot]')) {
        setTimeout(function(){ if (wrap && wrap.classList.contains('is-open')) setParam(selected()); }, 0);
      }
    });

    /* ---- 2. Deep links ---- */
    /* ?unit=... re-opens that unit's detail panel */
    var wantUnit = param(UNIT);
    if (wantUnit) {
      waitFor(function(){
        var sp = window.ohSitePlan;
        return (sp && sp.units().length) ? sp : null;
      }, function(sp){ sp.open(wantUnit); });
    }

    /* ?unitType=<id|code> lands with the Type filter already applied - the
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

    /* ?type=A selects that tab in the unit types section and scrolls to it;
       &floorplan=1 then opens the floor plan modal through the section's own
       "View Floor Plan" button, so the site's modal script stays the only
       thing that knows how to open it. */
    var wantType = param(TYPE);
    if (wantType) {
      var code = String(wantType).trim().toLowerCase();
      waitFor(function(){
        var tabs = document.querySelectorAll('[wized="v2_unitTypeTabLink"]');
        if (!tabs.length) return null;
        return Array.prototype.filter.call(tabs, function(el){
          var t = (el.textContent || '').trim().toLowerCase();
          return t === code || t === 'type ' + code;
        })[0] || null;
      }, function(tab){
        if (!tab.classList.contains('is-active')) tab.click();
        var section = document.getElementById('unit-types');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (param(FLOORPLAN) !== '1') return;
        /* wait for the pane to rebind to the newly selected type */
        setTimeout(function(){
          var open = document.querySelector('.unit-types_actions [defijn-modal="open"][defijn-modal-element="unit-floorplan"], .unit-types_actions [custom-modal="open"][custom-modal-element="unit-floorplan"]');
          if (open) open.click();
        }, 700);
      });
    }

    /* ---- 3. Share on WhatsApp ---- */
    /* each entry adds its own params to the outgoing URL and returns the
       sentence that goes in front of it */
    var SHARE = {
      v2_shareWhatsapp: function(url){
        var u = selected();
        var key = unitKey(u);
        /* the sender may have arrived on a shared floor-plan link; don't pass
           its params on, or the recipient gets a modal over the unit panel */
        url.searchParams.delete(TYPE);
        url.searchParams.delete(FLOORPLAN);
        url.hash = '';
        if (key) url.searchParams.set(UNIT, key);
        var what = u
          ? 'Unit ' + (u.unit_number != null ? u.unit_number : '') + (u.type_code ? ' (Type ' + u.type_code + ', Block ' + u.block_name + ')' : '')
          : 'this home';
        return 'Take a look at ' + what + ' at ' + ESTATE + ': ';
      },
      v2_shareFloorplan: function(url){
        var t = selectedType();
        var code = t && t.type_code ? String(t.type_code) : null;
        url.searchParams.delete(UNIT);
        if (code) { url.searchParams.set(TYPE, code); url.searchParams.set(FLOORPLAN, '1'); }
        url.hash = 'unit-types';
        var specs = [];
        if (t && t.bedrooms) specs.push(t.bedrooms + ' bed');
        if (t && t.bathrooms) specs.push(t.bathrooms + ' bath');
        if (t && t.total_area) specs.push(t.total_area + ' m²');
        return 'The floor plan for ' + (code ? 'Type ' + code : 'this home') +
          (specs.length ? ' (' + specs.join(', ') + ')' : '') + ' at ' + ESTATE + ': ';
      }
    };
    function hit(e){
      if (!e.target.closest) return null;
      for (var k in SHARE) {
        if (e.target.closest('[wized="' + k + '"]')) return k;
      }
      return null;
    }
    document.addEventListener('click', function(e){
      var kind = hit(e);
      if (!kind) return;
      e.preventDefault();
      e.stopPropagation();
      var url = new URL(window.location.href);
      var msg = SHARE[kind](url);
      window.open('https://wa.me/?text=' + encodeURIComponent(msg + url.toString()), '_blank', 'noopener');
    }, true);
    /* both share controls are divs with role="button" - a div doesn't fire a
       click from the keyboard, so honour the role rather than leaving it a
       promise the element can't keep */
    document.addEventListener('keydown', function(e){
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var kind = hit(e);
      if (!kind) return;
      e.preventDefault();
      e.target.closest('[wized="' + kind + '"]').click();
    });
  });
})();


/* ============================================================
   Unit detail panel - sticky sub-nav (+ scrollspy)
   ============================================================ */

(function () {
  'use strict';

  function initSubnav() {
    var panel = document.querySelector('.site-plan_detail-panel');
    var nav = document.querySelector('.unit-details_scroll-nav');
    if (!panel || !nav) return;

    var wrap = document.querySelector('.site-plan_detail-wrap');
    var links = [].slice.call(nav.querySelectorAll('a'));

    /* Reserve / Share: on desktop they ride with the subtabs in one sticky block
       at the top of the panel, so the actions stay reachable at any scroll depth
       and always sit above the tabs; on mobile they go back to being the sticky
       bar at the bottom of the panel, within thumb reach. The elements MOVE -
       cloning would duplicate the Wized bindings and the modal attributes. */
    var bar = panel.querySelector('[data-actionbar]');
    var stickyHead = null;
    if (bar) {
      var mq = window.matchMedia('(min-width: 992px)');
      var place = function () {
        if (mq.matches) {
          if (!stickyHead) {
            stickyHead = document.createElement('div');
            stickyHead.className = 'unit-details_stickyhead';
          }
          if (stickyHead.parentNode !== nav.parentNode) nav.parentNode.insertBefore(stickyHead, nav);
          if (bar.parentNode !== stickyHead) stickyHead.appendChild(bar);
          if (nav.parentNode !== stickyHead) stickyHead.appendChild(nav);
        } else {
          if (stickyHead && stickyHead.parentNode) {
            stickyHead.parentNode.insertBefore(nav, stickyHead);
            stickyHead.parentNode.removeChild(stickyHead);
          }
          if (bar.parentNode !== panel || panel.lastElementChild !== bar) panel.appendChild(bar);
        }
      };
      place();
      if (mq.addEventListener) mq.addEventListener('change', place);
      else if (mq.addListener) mq.addListener(place);
      var headHeight = function () { return (stickyHead && stickyHead.offsetParent ? stickyHead : nav).offsetHeight; };
      window.__ohPanelHeadHeight = headHeight;
    }

    function scroller() {
      if (panel.scrollHeight > panel.clientHeight + 5) return panel;
      return (wrap && wrap.scrollHeight > wrap.clientHeight + 5) ? wrap : panel;
    }

    function sectionFor(link) {
      var href = link.getAttribute('href') || '';
      var id = href.indexOf('#') !== -1 ? href.split('#').pop() : '';
      return id ? document.getElementById(id) : null;
    }

    links.forEach(function (l) {
      l.addEventListener('click', function (e) {
        var s = sectionFor(l);
        if (!s) return;
        e.preventDefault();
        var sc = scroller();
        var head = window.__ohPanelHeadHeight ? window.__ohPanelHeadHeight() : nav.offsetHeight;
        var top = s.getBoundingClientRect().top
                - sc.getBoundingClientRect().top
                + sc.scrollTop
                - (head + 8);
        sc.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
      });
    });

    function spy() {
      var navB = nav.getBoundingClientRect().bottom + 12;   /* the nav is the bottom of the sticky block */
      var currentIdx = 0;
      links.forEach(function (l, i) {
        var s = sectionFor(l);
        if (s && s.getBoundingClientRect().top <= navB) currentIdx = i;
      });
      links.forEach(function (l, i) { l.classList.toggle('is-active', i === currentIdx); });
    }

    panel.addEventListener('scroll', spy, { passive: true });
    if (wrap) wrap.addEventListener('scroll', spy, { passive: true });
    spy();

    if (wrap) {
      new MutationObserver(function () {
        if (wrap.classList.contains('is-open')) setTimeout(spy, 50);
      }).observe(wrap, { attributes: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSubnav);
  } else {
    initSubnav();
  }
})();


/* ============================================================
   Galleries - detail panel + unit types slider, one shared lightbox
   ============================================================ */

(function () {
  'use strict';

  /* ==========================================================
     Shared media handling for the Oak Hills galleries.

     Two consumers, one lightbox:
       1. the unit detail panel gallery (site plan -> unit)
       2. the unit types slider on the home page

     Items may arrive from Xano as plain URL strings or as objects
     ({url|src|path|href, type|mime, kind, poster, caption}). YouTube is
     detected from the URL, so a wrong or missing `kind` cannot break it.
     ========================================================== */

  var PLAY_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var BADGE_SVG = '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var EXPAND_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/></svg>';

  /* watch?v= | youtu.be | embed | shorts -> video id */
  function ytId(url) {
    var m = String(url || '').match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : '';
  }

  function norm(it) {
    var url = '', type = '';
    if (typeof it === 'string') {
      url = it;
    } else if (it && typeof it === 'object') {
      url = it.url || it.src || it.path || it.href || '';
      type = it.type || it.mime || '';
    }
    if (!url) return null;

    var yt = ytId(url);
    if (yt) return {
      url: url,
      kind: 'youtube',
      embed: 'https://www.youtube-nocookie.com/embed/' + yt + '?rel=0&playsinline=1',
      poster: (it && it.poster) || 'https://i.ytimg.com/vi/' + yt + '/maxresdefault.jpg',
      poster2: 'https://i.ytimg.com/vi/' + yt + '/hqdefault.jpg',
      caption: (it && it.caption) || ''
    };
    if (/youtube/i.test(type) || (it && it.kind === 'youtube')) return null;

    var isVid = /^video\//i.test(type) || /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url);
    return { url: url, kind: isVid ? 'video' : 'image', poster: (it && it.poster) || '', caption: (it && it.caption) || '' };
  }

  /* Order preserved - callers that index into the source array depend on it. */
  function normList(raw) {
    if (raw == null) return [];
    if (typeof raw === 'string') {
      try {
        var p = JSON.parse(raw);
        raw = Array.isArray(p) ? p : [raw];
      } catch (e) {
        raw = [raw];
      }
    }
    if (!Array.isArray(raw)) raw = [raw];
    return raw.map(norm).filter(Boolean);
  }

  /* first frame of an mp4, without loading the whole file */
  function stillOf(url) {
    return url + (url.indexOf('#') === -1 ? '#t=0.1' : '');
  }

  /* A still frame for any kind, so nothing ever points an <img> at a video URL. */
  function stillNode(it, className) {
    if (it.kind === 'video') {
      var v = document.createElement('video');
      v.src = stillOf(it.url);
      v.muted = true;
      v.playsInline = true;
      v.preload = 'metadata';
      v.className = className;
      return v;
    }
    var im = document.createElement('img');
    im.className = className;
    im.alt = '';
    if (it.kind === 'youtube') {
      /* maxres exists only for HD uploads - fall back to the always-there frame */
      im.onerror = function () { if (it.poster2 && im.src !== it.poster2) im.src = it.poster2; };
      im.src = it.poster;
    } else {
      im.src = it.url;
    }
    return im;
  }

  /* ==========================================================
     Shared lightbox. Playback always happens here - never inline -
     so the panel and the slider behave the same for every media kind.
     ========================================================== */

  var lb, lbStage, lbCounter;
  var items = [];
  var index = 0;
  var onIndex = null;

  function build() {
    if (lb) return;
    lb = document.createElement('div');
    lb.className = 'ud-lightbox';
    lb.innerHTML =
      '<button class="ud-lb-btn ud-lb-close" aria-label="Close">&#10005;</button>' +
      '<button class="ud-lb-btn ud-lb-prev" aria-label="Previous">&lsaquo;</button>' +
      '<div class="ud-lightbox_stage" data-lb="stage"></div>' +
      '<button class="ud-lb-btn ud-lb-next" aria-label="Next">&rsaquo;</button>' +
      '<div class="ud-lb-counter" data-lb="counter"></div>';
    document.body.appendChild(lb);

    lbStage = lb.querySelector('[data-lb="stage"]');
    lbCounter = lb.querySelector('[data-lb="counter"]');

    lb.querySelector('.ud-lb-close').addEventListener('click', close);
    lb.querySelector('.ud-lb-prev').addEventListener('click', function () { step(-1); });
    lb.querySelector('.ud-lb-next').addEventListener('click', function () { step(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });

    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    });
  }

  function isOpen() {
    return !!lb && lb.classList.contains('is-open');
  }

  function render() {
    var it = items[index];
    if (!it) return;
    lbStage.innerHTML = '';

    var node;
    if (it.kind === 'youtube') {
      node = document.createElement('iframe');
      node.src = it.embed + '&autoplay=1';
      node.style.cssText = 'width:min(92vw,1180px);aspect-ratio:16/9;max-height:82vh;border:0;border-radius:8px;background:#000';
      node.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
      node.setAttribute('allowfullscreen', '');
      node.setAttribute('title', it.caption || 'Video');
    } else if (it.kind === 'video') {
      node = document.createElement('video');
      node.src = it.url;
      node.controls = true;
      node.autoplay = true;
      node.playsInline = true;
    } else {
      node = document.createElement('img');
      node.src = it.url;
      node.alt = '';
    }
    lbStage.appendChild(node);

    lbCounter.textContent = (index + 1) + ' / ' + items.length;
    var single = items.length < 2;
    lb.querySelector('.ud-lb-prev').style.display = single ? 'none' : '';
    lb.querySelector('.ud-lb-next').style.display = single ? 'none' : '';
  }

  function open(list, i, sync) {
    if (!list || !list.length) return;
    build();
    items = list;
    index = Math.max(0, Math.min(i || 0, list.length - 1));
    onIndex = sync || null;
    lb.classList.add('is-open');
    render();
  }

  function close() {
    if (!lb) return;
    lb.classList.remove('is-open');
    lbStage.innerHTML = '';   /* destroys the iframe / video, stopping playback */
  }

  function step(d) {
    if (!items.length) return;
    index = (index + d + items.length) % items.length;
    render();
    if (onIndex) onIndex(index);
  }
  window.ohLightbox = { open: open, close: close };

  /* ==========================================================
     Consumer 1 - unit detail panel gallery
     ========================================================== */

  function initPanel(Wized) {
    var wrap = document.querySelector('.site-plan_detail-wrap');
    var stage = document.querySelector('[data-gallery="stage"]');
    var thumbs = document.querySelector('[data-gallery="thumbs"]');
    if (!wrap || !stage || !thumbs) return;

    var media = [];
    var current = 0;

    /* A still image reads better as the opening frame than a video poster. */
    function itemsFor(u) {
      if (!u) return [];
      var raw = (u.media == null || (Array.isArray(u.media) && !u.media.length))
        ? (u.card_image ? [u.card_image] : [])
        : u.media;
      var out = normList(raw);
      if (out.length && out[0].kind !== 'image') {
        var i = out.findIndex(function (m) { return m.kind === 'image'; });
        if (i > 0) out.unshift(out.splice(i, 1)[0]);
      }
      return out;
    }

    function renderStage() {
      var it = media[current];
      stage.innerHTML = '';
      if (!it) return;

      stage.appendChild(stillNode(it, 'ud-media'));

      /* both video kinds get a play affordance; the stage itself always opens
         the lightbox, which is where playback happens */
      if (it.kind !== 'image') {
        var play = document.createElement('div');
        play.className = 'ud-playbtn';
        play.innerHTML = PLAY_SVG;
        stage.appendChild(play);
      }

      var exp = document.createElement('div');
      exp.className = 'ud-expand';
      exp.innerHTML = EXPAND_SVG;
      stage.appendChild(exp);
    }

    function renderThumbs() {
      thumbs.innerHTML = '';
      media.forEach(function (it, i) {
        var t = document.createElement('div');
        t.className = 'unit-details_thumbnail' + (i === current ? ' is-current' : '');
        t.setAttribute('data-thumb', i);

        var node = stillNode(it, '');
        node.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        if (it.kind === 'youtube') node.src = it.poster2 || it.poster;   /* small frame is plenty */
        t.appendChild(node);

        if (it.kind !== 'image') {
          var b = document.createElement('div');
          b.className = 'unit-details_thumb-badge';
          b.innerHTML = BADGE_SVG;
          t.appendChild(b);
        }
        thumbs.appendChild(t);
      });
      thumbs.style.display = media.length > 1 ? '' : 'none';
    }

    function markThumbs() {
      thumbs.querySelectorAll('[data-thumb]').forEach(function (t) {
        t.classList.toggle('is-current', Number(t.getAttribute('data-thumb')) === current);
      });
    }

    function show(i) {
      current = i;
      renderStage();
      markThumbs();
    }

    function openHere() {
      open(media, current, show);
    }

    thumbs.addEventListener('click', function (e) {
      var t = e.target.closest('[data-thumb]');
      if (t) show(Number(t.getAttribute('data-thumb')));
    });

    stage.addEventListener('click', openHere);
    stage.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHere(); }
      else if (!media.length) return;
      else if (e.key === 'ArrowRight') show((current + 1) % media.length);
      else if (e.key === 'ArrowLeft') show((current - 1 + media.length) % media.length);
    });

    function selected() {
      return (Wized.data && Wized.data.v) ? Wized.data.v.v2_selectedUnit : null;
    }

    function load(u) {
      media = itemsFor(u);
      current = 0;
      renderStage();
      renderThumbs();
    }

    new MutationObserver(function () {
      if (wrap.classList.contains('is-open')) {
        load(selected());
      } else {
        close();
        var v = stage.querySelector('video');
        if (v) { try { v.pause(); } catch (e) {} }
      }
    }).observe(wrap, { attributes: true, attributeFilter: ['class'] });

    if (wrap.classList.contains('is-open')) load(selected());
  }

  /* ==========================================================
     Consumer 2 - unit types slider

     The slide's contents are rendered by Wized (unitTypeSlideImage /
     unitTypeSlideYoutube / unitTypeSlideVideo). This only adds the lightbox:
     a click anywhere on the slide opens the selected type's full media set
     at the current slide, and playback happens there.
     ========================================================== */

  function initTypeSlider(Wized) {
    var slider = document.querySelector('[wized="v2_unitTypeSlider"]');
    if (!slider) return;

    /* The markup is Swiper-shaped (.swiper > .swiper-wrapper > .swiper-slide) but
       nothing ever started a Swiper on it: the site-wide initialiser only picks up
       [data-swiper-container="true"]. So every slide rendered stacked in the track,
       the arrows set a slideIndex variable nothing reads, and dragging did nothing.
       Swiper 11 is already loaded site-wide, so just mount it. */
    function mountSwiper() {
      if (typeof window.Swiper !== 'function') return;
      if (slider.swiper) {
        if (slider.swiper.__oh) return;
        /* The site-wide footer initialiser mounts anything carrying
           data-swiper-container="true" with the generic config baked into
           data-swiper-config: loop + autoplay + touchStartPreventDefault, and no
           observer, so it counts the slides before Wized renders them (one),
           kills the taps, and autoplays. That is the "slider stopped working
           again" state. Take it over: tear its instance down and mount ours. */
        try { slider.swiper.destroy(true, true); } catch (e) {}
        slider.swiper = null;
      }
      /* and make sure a re-run of that initialiser skips this element */
      slider.removeAttribute('data-swiper-container');
      slider.removeAttribute('data-swiper-config');
      new window.Swiper(slider, {
        slidesPerView: 1,
        speed: 400,
        grabCursor: true,
        rewind: true,              /* wraps around WITHOUT cloning the Wized-bound slides */
        observer: true,            /* the slides are a render list - they change on tab switch */
        observeParents: true,
        observeSlideChildren: true,
        /* Swiper calls preventDefault on touchstart by default, which cancels the
           click that a tap would otherwise produce - that is why tapping a slide
           did nothing on mobile while clicking worked on desktop. */
        touchStartPreventDefault: false,
        keyboard: { enabled: true, onlyInViewport: true },
        navigation: {
          prevEl: slider.querySelector('[data-swiper-nav="prev"]'),
          nextEl: slider.querySelector('[data-swiper-nav="next"]')
        }
      });
      slider.swiper.__oh = true;   /* never autoplays, on any device */

      /* Second, independent path to the lightbox. Swiper's own tap event fires
         for mouse and touch alike, and deliberately does NOT fire when the
         gesture turned out to be a swipe. openHere() is idempotent, so it does
         not matter if this and the delegated click below both land. */
      slider.swiper.on('tap', function (s, e) { openHere(e); });
    }

    /* No Swiper stylesheet is loaded on this page, so the track needs the two
       rules Swiper cannot do without. Scoped to this slider only. */
    if (!document.getElementById('ut-swiper-css')) {
      var st = document.createElement('style');
      st.id = 'ut-swiper-css';
      st.textContent =
        '[wized="v2_unitTypeSlider"]{overflow:hidden}' +
        '[wized="v2_unitTypeSlider"]>.swiper-wrapper{display:flex;flex-direction:row}' +
        '[wized="v2_unitTypeSlider"] .swiper-slide{flex-shrink:0}';
      document.head.appendChild(st);
    }

    mountSwiper();
    if (!slider.swiper) {
      /* Swiper's script is async and the slides arrive with the render list */
      var tries = 0;
      var timer = setInterval(function () {
        mountSwiper();
        if (slider.swiper || ++tries > 40) clearInterval(timer);
      }, 250);
    }

    function media() {
      try {
        var t = Wized.data.v.v2_selectedType;
        return normList(t && t.media);
      } catch (e) {
        return [];
      }
    }

    /* Slide order matches the media array (no loop, so no cloned slides). */
    function indexOf(el) {
      var all = slider.querySelectorAll('[wized="v2_unitTypeSlide"]');
      return Array.prototype.indexOf.call(all, el);
    }

    function current() {
      if (slider.swiper) return slider.swiper.activeIndex;
      try { return Number(Wized.data.v.v2_slideIndex) || 0; } catch (e) { return 0; }
    }

    function openHere(e) {
      if (isOpen()) return;   /* already showing - a second trigger must be a no-op */
      /* Nav buttons sit outside the slides, so they are excluded by this test.
         Swiper suppresses the click that ends a drag (preventClicks). */
      var el = e.target.closest && e.target.closest('[wized="v2_unitTypeSlide"]');
      if (!el) return;
      /* stop the site-wide [data-youtube-facade] handler mounting an inline player */
      e.preventDefault();
      e.stopPropagation();
      var i = indexOf(el);
      open(media(), i < 0 ? current() : i, function (n) {
        /* leave the slider on whatever they stopped at */
        if (slider.swiper) slider.swiper.slideTo(n);
        try { Wized.data.v.v2_slideIndex = n; } catch (err) {}
      });
    }

    slider.addEventListener('click', openHere);
    slider.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') openHere(e);
    });
  }

  window.Wized = window.Wized || [];
  window.Wized.push(function (Wized) {
    initPanel(Wized);
    initTypeSlider(Wized);
  });
})();



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
  function fpImg(kind) { return document.querySelector('[data-fp-img="' + kind + '"], [data-fp="' + kind + '"] img'); }
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
    fillBlock(u);
  }

  /* The block: the block's 3D render with the unit's level highlighted
     (oh_floors.highlight_image_url, an SVG overlay), then the whole estate in
     3D with the block highlighted (oh_buildings.highlight_image_url over the
     site render). Both overlays were drawn for v1 on the same frames. */
  /* 360 virtual tour (18 Sep): the VR link opens the tour in a modal that is
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

/* ---------------------------------------------------------------------------
   Welcome modal. One per visitor per week: localStorage keeps the timestamp of
   the last dismissal and anything sooner than WEEK skips it. It waits for the
   map to reveal (oh:map-revealed, with a timeout in case that never fires) so
   it does not land on top of the reveal animation, and it never appears for a
   deep link. window.ohWelcome.reset() clears the stamp, for testing.
--------------------------------------------------------------------------- */
(function () {
  if (window.ohWelcome) return;
  var KEY = 'oh_welcome_v1';
  var WEEK = 7 * 24 * 60 * 60 * 1000;
  var IMG = 'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/6aaa47dfc9788e45271cdedf_3DR517%20-%20AoA%20Oakhills%20-%20Exteriors.RGB_color.0001%20copy%201';

  function stamp(v) {
    try {
      if (v === null) localStorage.removeItem(KEY);
      else if (v === undefined) return Number(localStorage.getItem(KEY)) || 0;
      else localStorage.setItem(KEY, String(v));
    } catch (e) { return 0; }   /* private mode: treat as never seen, never throw */
    return 0;
  }
  function seenRecently() { var t = stamp(); return !!t && (Date.now() - t) < WEEK; }
  /* a visitor who arrived at a specific unit or type is here for that, not for us */
  function deepLinked() { return /[?&](unit|unitType|type)=/.test(location.search); }

  var el = null, lastFocus = null;

  function build() {
    el = document.createElement('div');
    el.className = 'oh-welcome';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'oh-welcome-title');
    el.hidden = true;
    el.innerHTML =
      '<div class="oh-welcome_scrim" data-welcome-close></div>' +
      '<div class="oh-welcome_card" role="document" tabindex="-1">' +
        '<button type="button" class="oh-welcome_close" data-welcome-close aria-label="Close">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
        '</button>' +
        '<div class="oh-welcome_figure">' +
          '<img src="' + IMG + '-p-1080.avif"' +
            ' srcset="' + IMG + '-p-800.avif 800w, ' + IMG + '-p-1080.avif 1080w, ' + IMG + '-p-1600.avif 1600w"' +
            ' sizes="(max-width: 640px) 100vw, 560px"' +
            ' width="1600" height="900" decoding="async"' +
            ' alt="The entrance to Oakhills Estate, Stellenbosch">' +
        '</div>' +
        '<div class="oh-welcome_body">' +
          '<p class="oh-welcome_eyebrow">Oakhills Estate &middot; Stellenbosch</p>' +
          '<h2 class="oh-welcome_title" id="oh-welcome-title">Find your apartment on the plan</h2>' +
          '<p class="oh-welcome_lede">Every apartment at Oakhills, with live availability and pricing &mdash; explore the estate, or filter straight to what you are after.</p>' +
          '<ul class="oh-welcome_list">' +
            '<li><strong>Explore the estate.</strong> Tap any block or apartment for its price, size, orientation and outlook.</li>' +
            '<li><strong>Narrow it down.</strong> Filter by price, type, level, parking or the view you want to wake up to.</li>' +
            '<li class="oh-welcome_sales"><strong>Reserve online.</strong> Found the one? Reserve it and complete your details in a few steps.</li>' +
          '</ul>' +
          '<div class="oh-welcome_action"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
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
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-welcome-close]')) { e.preventDefault(); close(); }
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return el;
  }

  function open() {
    if (!el) build();
    lastFocus = document.activeElement;
    el.hidden = false;
    document.documentElement.classList.add('oh-welcome-open');
    requestAnimationFrame(function () {
      el.classList.add('is-open');
      var card = el.querySelector('.oh-welcome_card');
      if (card) card.focus({ preventScroll: true });
    });
    document.dispatchEvent(new CustomEvent('oh:welcome-open'));
  }

  function close() {
    if (!el || el.hidden) return;
    stamp(Date.now());
    el.classList.remove('is-open');
    document.documentElement.classList.remove('oh-welcome-open');
    var done = function () { el.hidden = true; };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else setTimeout(done, 260);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    lastFocus = null;
    document.dispatchEvent(new CustomEvent('oh:welcome-close'));
  }

  var fired = false;
  function maybeOpen() {
    if (fired) return;
    fired = true;
    if (seenRecently() || deepLinked()) return;
    setTimeout(open, 350);   /* let the reveal settle before it lands */
  }
  document.addEventListener('oh:map-revealed', maybeOpen);
  setTimeout(maybeOpen, 9000);   /* the reveal never fired: show it anyway */

  window.ohWelcome = {
    open: function () { if (!el) build(); open(); },
    close: close,
    reset: function () { stamp(null); fired = false; }
  };
})();
