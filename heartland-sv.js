/* ============================================================================
   heartland-sv.js — Stellenbosch Village
   Home page behaviour. Source of truth; the Webflow copy lives in
   Home > Page Settings > Footer Code.

   Consolidated 2026-08-13:
   - the detail-panel gallery and the unit types slider now share ONE lightbox
     (was: a panel-only gallery, plus an appended v2 copy of it)
   - Swiper is mounted on the unit types slider, which never had one
   - removed: the duplicate sub-nav scroll handler, the dead `activeImage`
     write, and a console.log of the buyer's contact details

   2026-09-02: added the "View badges + context" module (map edge badges,
   tooltip position line, detail-panel Position & views block). It reads
   /units (position, aspect, view_tags, view_summary, position_detail) and
   /views. The same code ships as a Webflow embed on Home until this file is
   pushed - the module guards on window.__svViews so both can coexist.
   ============================================================================ */


/* ============================================================
   Interactive site plan controller - filters, map, detail panel
   ============================================================ */
window.Wized = window.Wized || [];
  window.Wized.push((Wized) => {
    const FACETS = {
      status: { key: 'status' },
      type: { key: 'type_code' },
      beds: { key: 'bedrooms', cast: Number },
      baths: { key: 'bathrooms', cast: Number },
    };

    const RANGES = {
      price: {
        key: 'price',
        bands: {
          'under-6': [0, 6e6],
          '6-8': [6e6, 8e6],
          '8-11': [8e6, 11e6],
          '11-plus': [11e6, Infinity],
        },
      },
      size: {
        key: 'total_area',
        bands: {
          'under-200': [0, 200],
          '200-250': [200, 250],
          '250-300': [250, 300],
          '300-350': [300, 350],
          '350-plus': [350, Infinity],
        },
      },
    };

    const TOGGLES = {
      'patio-covered': { test: (u) => u.patio_type === 'covered' },
    };

    const LEGEND_GROUPS = {
      availability: 'status',
      type: 'type',
    };

    let units = [];
    let booted = false;

    const state = { colourBy: 'status', sort: 'price' };
    Object.keys(FACETS).forEach((f) => (state[f] = new Set()));
    Object.keys(RANGES).forEach((f) => (state[f] = new Set()));

    const toggles = {};
    Object.keys(TOGGLES).forEach((t) => (toggles[t] = false));

    const NBSP = ' ';

    function formatPrice(p) {
      const n = Number(p);
      if (!isFinite(n) || n <= 0) return '';
      return (
        'R' +
        NBSP +
        Math.round(n)
          .toString()
          .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
      );
    }

    const LIST_HIDE = new Set(['unreleased']);

    function boot(rawList) {
      if (booted) return;
      let list = rawList;
      if (!list) {
        const req = Wized.data.r.getUnits;
        if (!req || !Array.isArray(req.data)) return;
        list = req.data;
      }
      booted = true;
      console.log('[site-plan] booted with', list.length, 'units');

      units = list.map((u) => {
        const flat = { ...(u.unit_variant || {}), ...u };
        // Honour the global price switch. When site_settings.prices_visible is
        // off, /units already sends the placeholder ("TBC") in price_display and
        // sets prices_hidden - overwriting it here put the real figure back on
        // every card and in the detail panel, which is exactly what the switch
        // exists to prevent. Only reformat when prices are actually on.
        if (!flat.prices_hidden) flat.price_display = formatPrice(flat.price);
        return flat;
      });

      if (!units.length) console.warn('getUnits returned an empty array');

      units.forEach((u) => {
        if (!u.type_code) console.warn('Unit with no variant data:', u.plot_id);
      });

      initMap();
      bindControls();
      updateLegend();
      apply();
    }

    console.log('[site-plan] controller loaded');
    if (Wized.data.r.getUnits && Wized.data.r.getUnits.hasRequested) boot();
    Wized.on('requestend', (result) => {
      if (result.name === 'getUnits') boot();
    });

    // Self-heal: if no Wized event performs getUnits on this page,
    // execute the request ourselves; last resort = direct Xano fetch.
    setTimeout(() => {
      try {
        const req = Wized.data.r.getUnits;
        if (!booted && (!req || !req.hasRequested)) {
          console.warn('[site-plan] getUnits never requested - executing directly');
          Wized.requests.execute('getUnits').then(() => boot()).catch((e) => console.error('[site-plan] execute failed', e));
        }
      } catch (e) {}
    }, 1500);
    setTimeout(() => {
      if (booted) return;
      console.warn('[site-plan] falling back to direct Xano fetch');
      fetch('https://x7aj-untn-pq4t.n7e.xano.io/api:p34ccxq4/units')
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) boot(data); })
        .catch((e) => console.error('[site-plan] fetch failed', e));
    }, 5000);

    function initMap() {
      units.forEach((u) => {
        const path = document.getElementById(u.plot_id);
        if (!path) {
          console.warn('No SVG path for unit', u.plot_id);
          return;
        }
        path.setAttribute('data-status', u.status);
        path.setAttribute('data-type', u.type_code);
        path.classList.add('site-plan_plot');
        if (!LIST_HIDE.has(u.status)) {
          path.addEventListener('click', () => openUnit(u));
        }
      });

      document.querySelectorAll('.site-plan_map-svg path').forEach((p) => {
        if (!units.some((u) => u.plot_id === p.id)) console.warn('SVG path with no unit:', p.id);
      });
    }

    function updateLegend() {
      document.querySelectorAll('[data-legend]').forEach((el) => {
        const key = el.getAttribute('data-legend');
        const isType = key.startsWith('type-');
        const want = isType ? key.slice(5) : key;
        el.textContent = units.filter((u) => (isType ? u.type_code === want : u.status === want)).length;
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

    function matches(u) {
      for (const [facet, cfg] of Object.entries(FACETS)) {
        const set = state[facet];
        if (!set.size) continue;
        const val = cfg.cast ? cfg.cast(u[cfg.key]) : u[cfg.key];
        if (!set.has(val)) return false;
      }
      for (const [facet, cfg] of Object.entries(RANGES)) {
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
        if (toggles[name] && !cfg.test(u)) return false;
      }
      return true;
    }

    const sortFn = {
      price: (a, b) => a.price - b.price,
      size: (a, b) => b.total_area - a.total_area,
      newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
    };

    function matchesExcept(u, skip) {
      for (const [f, cfg] of Object.entries(FACETS)) {
        if (f === skip) continue;
        const set = state[f];
        if (!set.size) continue;
        const val = cfg.cast ? cfg.cast(u[cfg.key]) : u[cfg.key];
        if (!set.has(val)) return false;
      }
      for (const [f, cfg] of Object.entries(RANGES)) {
        if (f === skip) continue;
        const set = state[f];
        if (!set.size) continue;
        const val = Number(u[cfg.key]);
        if (
          ![...set].some((k) => {
            const b = cfg.bands[k];
            return b && val >= b[0] && val < b[1];
          })
        )
          return false;
      }
      for (const [name, cfg] of Object.entries(TOGGLES)) {
        if (name === skip) continue;
        if (toggles[name] && !cfg.test(u)) return false;
      }
      return true;
    }

    function writeCount(el, n) {
      const c = el.querySelector('.unit-filter_count');
      if (c) c.textContent = n;
      el.classList.toggle('is-disabled', n === 0 && !el.classList.contains('is-active'));
    }

    function updateCounts() {
      document.querySelectorAll('[data-filter][data-value]').forEach((el) => {
        const facet = el.getAttribute('data-filter');
        const raw = el.getAttribute('data-value');
        const pool = units.filter((u) => matchesExcept(u, facet));

        let n = 0;
        if (FACETS[facet]) {
          const cfg = FACETS[facet];
          const key = cfg.cast ? cfg.cast(raw) : raw;
          n = pool.filter((u) => (cfg.cast ? cfg.cast(u[cfg.key]) : u[cfg.key]) === key).length;
        } else if (RANGES[facet]) {
          const band = RANGES[facet].bands[raw];
          const k = RANGES[facet].key;
          if (band) n = pool.filter((u) => Number(u[k]) >= band[0] && Number(u[k]) < band[1]).length;
        }
        writeCount(el, n);
      });

      document.querySelectorAll('[data-toggle]').forEach((el) => {
        const name = el.getAttribute('data-toggle');
        const cfg = TOGGLES[name];
        if (!cfg) return;
        const n = units.filter((u) => matchesExcept(u, name) && cfg.test(u)).length;
        writeCount(el, n);
      });
    }

    function apply() {
      const sorter = sortFn[state.sort] || sortFn.price;
      const visible = units.filter(matches).sort(sorter);
      const listed = visible.filter((u) => !LIST_HIDE.has(u.status));
      const ids = new Set(visible.map((u) => u.plot_id));

      Wized.data.v.visibleUnits = listed;

      units.forEach((u) => {
        const path = document.getElementById(u.plot_id);
        if (path) path.classList.toggle('is-dimmed', !ids.has(u.plot_id));
      });

      document.querySelectorAll('[data-count="results"]').forEach((el) => {
        el.textContent = listed.length;
      });

      updateCounts();
    }

    const detailWrap = () => document.querySelector('.site-plan_detail-wrap');
    const panelScroll = () => document.querySelector('.site-plan_detail-panel');
    const isOpen = () => !!detailWrap()?.classList.contains('is-open');

    function openUnit(u) {
      document.querySelectorAll('.site-plan_plot.is-selected').forEach((p) => p.classList.remove('is-selected'));
      document.getElementById(u.plot_id)?.classList.add('is-selected');

      Wized.data.v.selectedUnit = u;

      const s = panelScroll();
      if (s) s.scrollTop = 0;

      detailWrap()?.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      window.lenis?.stop();
    }

    function closeUnit() {
      if (!isOpen()) return;
      detailWrap()?.classList.remove('is-open');
      document.querySelectorAll('.site-plan_plot.is-selected').forEach((p) => p.classList.remove('is-selected'));

      document.body.style.overflow = '';
      window.lenis?.start();
    }

    function bindControls() {
      const canvas = document.querySelector('.site-plan_map-canvas');
      if (canvas) canvas.classList.add('is-colour-' + state.colourBy);

      document.querySelectorAll('[data-colourby]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.getAttribute('data-colourby') === state.colourBy);

        btn.addEventListener('click', () => {
          state.colourBy = btn.getAttribute('data-colourby');
          if (canvas) {
            canvas.classList.toggle('is-colour-type', state.colourBy === 'type');
            canvas.classList.toggle('is-colour-status', state.colourBy === 'status');
          }
          document.querySelectorAll('[data-colourby]').forEach((b) => b.classList.toggle('is-active', b === btn));
          syncLegend();
        });
      });

      syncLegend();

      document.querySelectorAll('[data-filter]').forEach((el) =>
        el.addEventListener('click', () => {
          const facet = el.getAttribute('data-filter');
          const set = state[facet];
          if (!set) return console.warn('Unknown filter facet:', facet);

          const cfg = FACETS[facet];
          const raw = el.getAttribute('data-value');
          const key = cfg && cfg.cast ? cfg.cast(raw) : raw;

          set.has(key) ? set.delete(key) : set.add(key);
          el.classList.toggle('is-active', set.has(key));
          apply();
        }),
      );

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

      document.querySelector('[data-close-detail]')?.addEventListener('click', closeUnit);
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

      overlay?.addEventListener(
        'wheel',
        (e) => {
          const s = panelScroll();
          if (!s || !isOpen()) return;
          e.preventDefault();
          e.stopPropagation();
          s.scrollTop += e.deltaY;
        },
        { passive: false },
      );
    }
  });

/* ============================================================
   Extra facets (View / Position / Garage Type) refining the controller's output
   ============================================================ */
(function(){
  window.Wized=window.Wized||[];
  window.Wized.push(function(Wized){
    var FACETS=[
      {key:'view',label:'View',fields:['view']},
      {key:'position',label:'Position',fields:['aspect','position']},
      {key:'garage',label:'Garage Type',fields:['garage_type','garageType']}
    ];
    var state={},lastBase=null;
    FACETS.forEach(function(f){state[f.key]=new Set();});
    function units(){try{return (Wized.data.r.getUnits&&Wized.data.r.getUnits.data)||[];}catch(e){return [];}}
    function val(u,f){for(var i=0;i<f.fields.length;i++){var v=u[f.fields[i]];if(v!=null&&v!=='')return String(v);}return null;}
    function anyActive(){return FACETS.some(function(f){return state[f.key].size>0;});}
    function matches(u){
      return FACETS.every(function(f){
        if(!state[f.key].size)return true;
        var v=val(u,f);
        return !!v&&state[f.key].has(v);
      });
    }
    function setCount(n){
      var c=document.querySelector('[data-count="results"]');
      if(c)c.textContent=n;
    }
    function refine(){
      if(lastBase===null){try{lastBase=Wized.data.v.visibleUnits||[];}catch(e){lastBase=[];}}
      var keep=anyActive()?lastBase.filter(matches):lastBase;
      try{Wized.data.v.visibleUnits=keep;}catch(e){}
      var keepIds={};keep.forEach(function(u){if(u.plot_id)keepIds[u.plot_id]=1;});
      lastBase.forEach(function(u){
        if(!u.plot_id)return;
        var p=document.getElementById(u.plot_id);
        if(p)p.classList.toggle('is-dimmed',!keepIds[u.plot_id]);
      });
      setCount(keep.length);
    }
    /* after any click on the main controller's own controls, re-capture its output as our base */
    document.addEventListener('click',function(e){
      if(e.target.closest('[data-filter],[data-toggle],[data-single-level],[data-sort],[data-reset]')&&!e.target.closest('[data-svx-filter]')){
        setTimeout(function(){
          try{lastBase=Wized.data.v.visibleUnits||[];}catch(err){lastBase=[];}
          if(e.target.closest('[data-reset]')){
            FACETS.forEach(function(f){state[f.key].clear();});
            document.querySelectorAll('[data-svx-filter].is-active').forEach(function(ch){ch.classList.remove('is-active');});
          }
          refine();
        },30);
      }
    });
    function build(){
      var host=document.querySelector('.unit-filter_more-list');
      if(!host||host.querySelector('[data-svx]'))return;
      var list=units();
      if(!list.length)return;
      FACETS.forEach(function(f){
        var vals={};
        list.forEach(function(u){var v=val(u,f);if(v)vals[v]=(vals[v]||0)+1;});
        var keys=Object.keys(vals).sort();
        if(!keys.length)return; /* no data for this facet yet - skip group */
        var title=document.createElement('p');
        title.className='unit-filter_group-title text-style-label';
        title.setAttribute('data-svx',f.key);
        title.textContent=f.label;
        var chips=document.createElement('div');
        chips.className='unit-filter_chips';
        chips.setAttribute('data-svx',f.key);
        keys.forEach(function(k){
          var chip=document.createElement('div');
          chip.className='unit-filter_chip';
          chip.setAttribute('data-svx-filter',f.key);
          chip.setAttribute('data-svx-value',k);
          var lbl=document.createElement('div');
          lbl.textContent=k.charAt(0).toUpperCase()+k.slice(1);
          chip.appendChild(lbl);
          var cnt=document.createElement('div');
          cnt.className='unit-filter_count';
          cnt.textContent=vals[k];
          chip.appendChild(cnt);
          chip.addEventListener('click',function(){
            var set=state[f.key];
            if(set.has(k)){set.delete(k);}else{set.add(k);}
            chip.classList.toggle('is-active',set.has(k));
            refine();
          });
          chips.appendChild(chip);
        });
        host.appendChild(title);
        host.appendChild(chips);
      });
    }
    Wized.on('requestend',function(r){
      if(r.name==='getUnits'){
        setTimeout(function(){
          try{lastBase=Wized.data.v.visibleUnits||[];}catch(e){lastBase=[];}
          build();
        },250);
      }
    });
    /* fallback in case the request already finished before this ran */
    setTimeout(function(){build();},4000);
  });
})();

/* ============================================================
   Plot tooltip controller
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

    const PILL_CLASSES = ['is-available', 'is-reserved', 'is-sold'];
    const OFFSET = 14;
    const EDGE = 8;
    const money = new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      maximumFractionDigits: 0,
    });

    let byPlot = new Map();
    let active = null;

    function indexUnits() {
      let units = [];
      try {
        const raw = (Wized.data.r.getUnits && Wized.data.r.getUnits.data) || [];
        units = raw
          .filter((u) => u.status !== 'unreleased')
          .map((u) => ({ ...u.unit_variant, ...u }));
      } catch (_) {}
      byPlot = new Map(units.map((u) => [u.plot_id, u]));
    }
    Wized.on('requestend', (result) => {
      if (result.name === 'getUnits') indexUnits();
    });
    indexUnits();

    function fill(u) {
      field.id.textContent = 'Unit ' + u.unit_number;
      field.status.textContent = u.status;
      field.status.classList.remove(...PILL_CLASSES);
      field.status.classList.add('is-' + String(u.status).toLowerCase());

      field.type.textContent = 'Type ' + u.type_code + (u.levels === 'single' ? ' · Single level' : '');

      field.specs.textContent = [u.bedrooms + ' bed', u.bathrooms + ' bath', Math.round(u.total_area) + ' m²'].join(' · ');

      // Same switch as the cards: when prices are hidden the endpoint's
      // placeholder wins over the real figure.
      field.price.textContent = u.prices_hidden
        ? u.price_display || 'Price on request'
        : u.price
          ? money.format(u.price)
          : 'Price on request';
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

    function hide() {
      active = null;
      tip.classList.remove('is-visible');
    }

    canvas.addEventListener('mouseover', (e) => {
      const path = e.target.closest && e.target.closest('path[id]');
      if (!path) return hide();
      if (path === active) return;

      const u = byPlot.get(path.id);
      if (!u) return hide();

      active = path;
      fill(u);
      place(e);
      tip.classList.add('is-visible');
    });

    canvas.addEventListener('mousemove', (e) => {
      if (active) place(e);
    });
    canvas.addEventListener('mouseleave', hide);
    window.addEventListener('scroll', hide, { passive: true });
  });

/* ============================================================
   View badges + context — map edge badges, tooltip position line,
   detail-panel "Position & views" block. Data: /units (position,
   aspect, view_tags, view_summary, position_detail) and /views.
   ============================================================ */
(function () {
  if (window.__svViews) return;
  window.__svViews = true;

  var API = 'https://x7aj-untn-pq4t.n7e.xano.io/api:p34ccxq4';
  var SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">';
  var ICONS = {
    mountain: SVG + '<path d="M3 18 8.5 8l3.2 5.2 2.3-3.4L21 18z"/><path d="M8.5 8l1.8 2.7"/></svg>',
    horizon: SVG + '<path d="M2 18h20M6 18l3.5-6h5L18 18M9.5 12h5"/></svg>',
    vine: SVG + '<circle cx="9" cy="11" r="2.2"/><circle cx="14.5" cy="11" r="2.2"/><circle cx="11.75" cy="15.5" r="2.2"/><path d="M11.75 8.5V4.5c1.6 0 3 .8 4.2 2.2"/></svg>',
    tree: SVG + '<path d="M12 21v-5M6 16h12l-3-4h2l-3-4h2L12 3 8 8h2l-3 4h2z"/></svg>',
    reed: SVG + '<path d="M12 21V9M8 21v-6M16 21v-8M12 9c0-3 1-5 3-6M8 15c0-2 .5-4 2-5M16 13c0-2 1-4 3-5M3 21h18"/></svg>',
    water: SVG + '<path d="M3 11c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>',
    clubhouse: SVG + '<path d="M4 21V10l8-6 8 6v11M9 21v-6h6v6M2 21h20"/></svg>'
  };
  var views = [], byKey = {}, units = [], byPlot = {};
  var canvas, badgeHost, tip, activeKey = null, stickyKey = null;

  function icon(name) { return ICONS[name] || ICONS.mountain; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tags(u) { var t = u && u.view_tags; return Array.isArray(t) ? t : (typeof t === 'string' && t ? t.split(',').map(function (s) { return s.trim(); }) : []); }

  /* ---------- data ---------- */
  function setViews(list) {
    if (!Array.isArray(list) || !list.length) return;
    views = list.filter(function (v) { return v && v.key && v.is_active !== false; });
    byKey = {}; views.forEach(function (v) { byKey[v.key] = v; });
    renderBadges();
  }
  function setUnits(list) {
    if (!Array.isArray(list)) return;
    units = list; byPlot = {};
    units.forEach(function (u) { if (u && u.plot_id) byPlot[u.plot_id] = u; });
    if (activeKey) focus(activeKey);
  }

  /* ---------- badges ---------- */
  function chip(key, pop) {
    var v = byKey[key]; if (!v) return '';
    return '<span class="ud-chip" tabindex="0">' + icon(v.icon) + '<span>' + esc(v.label) + '</span>' +
      (pop && v.description ? '<span class="ud-chip_pop">' + esc(v.description) + '</span>' : '') + '</span>';
  }
  function renderBadges() {
    badgeHost = badgeHost || document.querySelector('[data-view-badges]');
    if (!badgeHost) return;
    badgeHost.innerHTML = '';
    views.forEach(function (v) {
      if (!v.placement || v.placement === 'none') return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'site-plan_badge' + (v.icon === 'horizon' ? ' is-hollow' : '');
      b.setAttribute('data-view', v.key);
      b.setAttribute('data-placement', v.placement);
      b.setAttribute('aria-label', v.label + (v.direction ? ' (' + v.direction + ')' : ''));
      b.innerHTML = icon(v.icon);
      b.addEventListener('mouseenter', function () { focus(v.key); showTip(b, v); });
      b.addEventListener('focus', function () { focus(v.key); showTip(b, v); });
      b.addEventListener('mouseleave', function () { if (stickyKey !== v.key) { clear(); hideTip(); } });
      b.addEventListener('blur', function () { if (stickyKey !== v.key) { clear(); hideTip(); } });
      b.addEventListener('click', function (e) {
        e.preventDefault();
        if (stickyKey === v.key) { stickyKey = null; clear(); hideTip(); return; }
        badgeHost.querySelectorAll('.site-plan_badge.is-active').forEach(function (x) { x.classList.remove('is-active'); });
        stickyKey = v.key; b.classList.add('is-active'); focus(v.key); showTip(b, v);
      });
      badgeHost.appendChild(b);
    });
  }
  function focus(key) {
    activeKey = key;
    canvas = canvas || document.querySelector('.site-plan_map-canvas');
    if (!canvas) return;
    canvas.classList.add('is-view-focus');
    units.forEach(function (u) {
      var p = u.plot_id && document.getElementById(u.plot_id);
      if (p) p.classList.toggle('is-view-hit', tags(u).indexOf(key) !== -1);
    });
  }
  function clear() {
    activeKey = null;
    if (canvas) canvas.classList.remove('is-view-focus');
    document.querySelectorAll('.site-plan_plot.is-view-hit').forEach(function (p) { p.classList.remove('is-view-hit'); });
    if (badgeHost) badgeHost.querySelectorAll('.site-plan_badge.is-active').forEach(function (x) { x.classList.remove('is-active'); });
  }
  function showTip(b, v) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'site-plan_badge-tip'; document.body.appendChild(tip); }
    var n = units.filter(function (u) { return u.status !== 'unreleased' && tags(u).indexOf(v.key) !== -1; }).length;
    tip.innerHTML = '<div class="site-plan_badge-tip_head">' + esc(v.label) + (v.direction ? '<span class="site-plan_badge-tip_dir">' + esc(v.direction) + '</span>' : '') + '</div>' +
      '<div>' + esc(v.description) + '</div>' + (n ? '<span class="site-plan_badge-tip_count">' + n + ' home' + (n === 1 ? '' : 's') + ' with this view</span>' : '');
    var r = b.getBoundingClientRect(), pad = 10;
    tip.style.left = '0px'; tip.style.top = '0px'; tip.classList.add('is-visible');
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var x = r.left + r.width / 2 > window.innerWidth / 2 ? r.left - w - pad : r.right + pad;
    var y = Math.min(Math.max(pad, r.top + r.height / 2 - h / 2), window.innerHeight - h - pad);
    tip.style.left = Math.max(pad, x) + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { if (tip) tip.classList.remove('is-visible'); }
  document.addEventListener('click', function (e) {
    if (stickyKey && !e.target.closest('.site-plan_badge')) { stickyKey = null; clear(); hideTip(); }
  });
  window.addEventListener('scroll', hideTip, { passive: true });

  /* ---------- plot tooltip extras ---------- */
  function bindTooltip() {
    canvas = canvas || document.querySelector('.site-plan_map-canvas');
    var root = document.querySelector('[data-tooltip="root"]');
    if (!canvas || !root) return;
    var pos = root.querySelector('[data-tooltip="position"]'), vw = root.querySelector('[data-tooltip="views"]');
    if (!pos && !vw) return;
    canvas.addEventListener('mouseover', function (e) {
      var path = e.target.closest && e.target.closest('path[id]');
      var u = path && byPlot[path.id];
      if (pos) pos.textContent = u && u.position ? u.position : '';
      if (vw) vw.innerHTML = u ? tags(u).slice(0, 3).map(function (k) { return chip(k, false); }).join('') : '';
    });
  }

  /* ---------- detail panel ---------- */
  function renderPanel(u) {
    var box = document.querySelector('[data-unit-context]');
    if (!box) return;
    if (!u || !(u.position || tags(u).length)) { box.hidden = true; return; }
    box.hidden = false;
    var t = box.querySelector('[data-unit-position]'), d = box.querySelector('[data-unit-position-detail]'),
        c = box.querySelector('[data-unit-views]'), s = box.querySelector('[data-unit-view-summary]');
    if (t) t.textContent = (u.position || '') + (u.aspect ? ' · ' + u.aspect : '');
    if (d) d.textContent = u.position_detail || '';
    if (c) c.innerHTML = tags(u).map(function (k) { return chip(k, true); }).join('');
    if (s) s.textContent = u.view_summary || '';
  }
  function watchSelection(Wized) {
    var last = null;
    function check() {
      var u = null; try { u = Wized.data.v.selectedUnit; } catch (e) {}
      if (u !== last) { last = u; renderPanel(u); }
    }
    try { Wized.reactivity.watch(function () { return Wized.data.v.selectedUnit; }, function (u) { last = u; renderPanel(u); }); } catch (e) {}
    var wrap = document.querySelector('.site-plan_detail-wrap');
    if (wrap && window.MutationObserver) new MutationObserver(function () { if (wrap.classList.contains('is-open')) setTimeout(check, 30); }).observe(wrap, { attributes: true, attributeFilter: ['class'] });
  }

  /* ---------- boot ---------- */
  var booted = false;
  function boot(Wized) {
    if (booted) return; booted = true;
    bindTooltip();
    watchSelection(Wized);
    renderBadges();
  }
  window.Wized = window.Wized || [];
  window.Wized.push(function (Wized) {
    function pull(name, fn) { try { var r = Wized.data.r[name]; if (r && Array.isArray(r.data)) fn(r.data); } catch (e) {} }
    pull('getViews', setViews); pull('getUnits', setUnits);
    Wized.on('requestend', function (r) {
      if (r.name === 'getViews') pull('getViews', setViews);
      if (r.name === 'getUnits') pull('getUnits', setUnits);
    });
    setTimeout(function () {
      if (!views.length) fetch(API + '/views').then(function (r) { return r.json(); }).then(setViews).catch(function () {});
      if (!units.length) fetch(API + '/units').then(function (r) { return r.json(); }).then(setUnits).catch(function () {});
    }, 4000);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(Wized); }); else boot(Wized);
  });
})();

/* ============================================================
   Reservation flow - BOL / REDi
   ============================================================ */
// BOL CODE
  (function () {
    const API_ENDPOINT = 'https://bol-server-prod0.red-i.co.za/api/reservationSession/start?manualRedirect=true';
    const ACCOUNT_CODE = 'evening-shade-properties-109';
    const DEVELOPMENT_CODE = 'oakhills-estate';

    function genOrderRef() {
      const now = new Date();
      const date = now.toISOString().slice(0, 10).replace(/-/g, '');
      const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
      return `WF-${date}-${Date.now()}-${rand}`;
    }

    function get(form, name) {
      const el = form.querySelector(`[name="${name}"]`);
      return el ? el.value.trim() : '';
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

    function showMsg(form, msg, isError = false) {
      let box = form.querySelector('.reservation-status');
      if (!box) {
        box = document.createElement('div');
        box.className = 'reservation-status';
        box.style.marginTop = '8px';
        box.style.fontSize = '0.95rem';
        form.appendChild(box);
      }
      box.textContent = msg;
      box.style.color = isError ? 'crimson' : 'inherit';
    }

    function getSelectedUnitNumber(form) {
      const hiddenUnitNumber = get(form, 'unit_number');
      if (hiddenUnitNumber) return hiddenUnitNumber;

      const summaryEl = document.querySelector('[wized="get_selected_unit_number"]');
      return summaryEl ? summaryEl.textContent.trim() : '';
    }

    function buildPayload(form) {
      const firstName = get(form, 'first_name');
      const lastName = get(form, 'last_name');
      const email = get(form, 'email');
      const mobile = get(form, 'contact_number');
      const unitId = get(form, 'unit_id');
      const unit = getSelectedUnitNumber(form);

      if (!firstName || !lastName || !email || !mobile) {
        throw new Error('Please fill in all required fields before submitting.');
      }

      if (!unitId) {
        throw new Error('Missing Unit ID. Please make sure a Unit is selected.');
      }

      if (!unit) {
        throw new Error('Missing Unit reference. Please make sure a Unit is selected.');
      }

      const payload = {
        redirect: window.location.origin,
        units: [
          {
            account: ACCOUNT_CODE,
            development: DEVELOPMENT_CODE,
            unit,
            selectedPlan: '',
          },
        ],
        orderReference: genOrderRef(),
        buyerDetails: {
          people: [
            {
              id: 1,
              firstName,
              lastName,
              email,
              mobileNumber: formatPhone(mobile),
            },
          ],
        },
      };

      // Kept for debugging, commented out on purpose: this prints the buyer's
      // name, email and phone number into the browser console.
      // console.log('📦 Final Payload:', payload);

      return payload;
    }

    async function postReservation(payload) {
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = `Reservation failed (${res.status})`;
        try {
          const err = await res.json();
          msg = err.message || err.error || msg;
        } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      const redirectUrl = data.redirectUrl || data.url || data.reservationUrl;
      if (!redirectUrl) throw new Error('No redirect URL received from server');

      window.open(redirectUrl, '_blank');
    }

    document.addEventListener('DOMContentLoaded', function () {
      const form = document.getElementById('wf-form-reserve-unit-temp');
      if (!form) return console.error('❌ Form not found!');

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const btn = form.querySelector('input[type="submit"], button[type="submit"]');
        const originalLabel = btn && (btn.value || btn.textContent);

        try {
          if (btn) {
            btn.disabled = true;
            if ('value' in btn) btn.value = 'Reserving...';
            else btn.textContent = 'Reserving...';
          }

          showMsg(form, 'Submitting reservation...');

          const payload = buildPayload(form);
          await postReservation(payload);
        } catch (err) {
          console.error('❌ Reservation error:', err);
          showMsg(form, err.message || 'Something went wrong.', true);
          if (btn) {
            btn.disabled = false;
            if ('value' in btn) btn.value = originalLabel;
            else btn.textContent = originalLabel;
          }
        }
      });
    });
  })();

/* ============================================================
   AudioContext unlock on first interaction
   ============================================================ */
let audioContext;
  let started = false;

  function startAudio() {
    if (started) return;
    started = true;

    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    console.log('AudioContext started');
  }

  document.addEventListener('click', startAudio, { once: true });
  document.addEventListener('touchstart', startAudio, { once: true });
  document.addEventListener('keydown', startAudio, { once: true });

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

      // ---- filters active-count badge (mirrors chip is-active state) ----
      var badge = document.querySelector('[data-active-count]');
      function updateBadge() {
        if (!badge) return;
        var n = document.querySelectorAll('.unit-filter_chip.is-active, [data-toggle].is-active').length;
        badge.textContent = n;
        badge.style.display = n ? '' : 'none';
      }
      updateBadge();
      // recompute after any chip / reset click (fires after the main controller's own handler)
      document.addEventListener('click', function (e) {
        if (e.target.closest('[data-filter], [data-toggle], [data-reset]')) {
          setTimeout(updateBadge, 0);
        }
      });
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
    if (drawer && !drawer.__svxLock) {
      drawer.__svxLock = true;
      var sync = function () {
        var open = drawer.classList.contains('is-open');
        document.documentElement.style.overflow = open ? 'hidden' : '';
        document.body.style.overflow = open ? 'hidden' : '';
      };
      new MutationObserver(sync).observe(drawer, { attributes: true, attributeFilter: ['class'] });
      sync();
    }

    if (!list || !wrap || list.__svxMore) return;
    list.__svxMore = true;

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
    box.innerHTML = '<button class="fp-lightbox_close" aria-label="Close">&#10005;</button><img alt="Floor plan">';
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
      if (e.target === box || e.target.closest('.fp-lightbox_close')) close();
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
   ?unit= URL param sync, deep-link restore, and WhatsApp share
   ============================================================ */
(function(){
  var PARAM = 'unit';
  window.Wized = window.Wized || [];
  window.Wized.push(function(Wized){

    function units(){ try { return (Wized.data.r.getUnits && Wized.data.r.getUnits.data) || []; } catch(e){ return []; } }
    function selected(){ try { return Wized.data.v.selectedUnit || null; } catch(e){ return null; } }
    function unitKey(u){ return u ? String(u.unit_number != null ? u.unit_number : u.plot_id) : null; }

    /* ---- 1. URL param sync: ?unit=<unit_number> follows the selection ---- */
    function setParam(u){
      var url = new URL(window.location.href);
      var key = unitKey(u);
      if (key) { url.searchParams.set(PARAM, key); } else { url.searchParams.delete(PARAM); }
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

    /* ---- 2. Deep link: ?unit=... on load re-opens that unit ---- */
    var wanted = new URL(window.location.href).searchParams.get(PARAM);
    if (wanted) {
      var tries = 0;
      var timer = setInterval(function(){
        tries++;
        var list = units();
        if (list.length) {
          var u = list.find(function(x){ return String(x.unit_number) === wanted || String(x.plot_id) === wanted; });
          if (u) {
            var path = document.getElementById(u.plot_id);
            if (path) { path.dispatchEvent(new MouseEvent('click', { bubbles:true })); clearInterval(timer); return; }
          } else { clearInterval(timer); return; }
        }
        if (tries > 60) clearInterval(timer); /* give up after ~12s */
      }, 200);
    }

    /* ---- 3. Share on WhatsApp ---- */
    document.addEventListener('click', function(e){
      var btn = e.target.closest('[wized="shareWhatsapp"]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var u = selected();
      var url = new URL(window.location.href);
      var key = unitKey(u);
      if (key) url.searchParams.set(PARAM, key);
      var label = u
        ? 'Unit ' + (u.unit_number != null ? u.unit_number : '') + (u.type_code ? ' (Type ' + u.type_code + ')' : '')
        : 'this unit';
      var msg = 'Take a look at ' + label + ' at Oakhills Estate, Stellenbosch: ' + url.toString();
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    }, true);
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
        var top = s.getBoundingClientRect().top
                - sc.getBoundingClientRect().top
                + sc.scrollTop
                - (nav.offsetHeight + 8);
        sc.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
      });
    });

    function spy() {
      var navB = nav.getBoundingClientRect().bottom + 12;
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
     Shared media handling for the Stellenbosch Village galleries.

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
        ? (u.hero_image ? [u.hero_image] : [])
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
      return (Wized.data && Wized.data.v) ? Wized.data.v.selectedUnit : null;
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
    var slider = document.querySelector('[wized="unitTypeSlider"]');
    if (!slider) return;

    /* The markup is Swiper-shaped (.swiper > .swiper-wrapper > .swiper-slide) but
       nothing ever started a Swiper on it: the site-wide initialiser only picks up
       [data-swiper-container="true"]. So every slide rendered stacked in the track,
       the arrows set a slideIndex variable nothing reads, and dragging did nothing.
       Swiper 11 is already loaded site-wide, so just mount it. */
    function mountSwiper() {
      if (slider.swiper || typeof window.Swiper !== 'function') return;
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
        '[wized="unitTypeSlider"]{overflow:hidden}' +
        '[wized="unitTypeSlider"]>.swiper-wrapper{display:flex;flex-direction:row}' +
        '[wized="unitTypeSlider"] .swiper-slide{flex-shrink:0}';
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
        var t = Wized.data.v.selectedType;
        return normList(t && t.media);
      } catch (e) {
        return [];
      }
    }

    /* Slide order matches the media array (no loop, so no cloned slides). */
    function indexOf(el) {
      var all = slider.querySelectorAll('[wized="unitTypeSlide"]');
      return Array.prototype.indexOf.call(all, el);
    }

    function current() {
      if (slider.swiper) return slider.swiper.activeIndex;
      try { return Number(Wized.data.v.slideIndex) || 0; } catch (e) { return 0; }
    }

    function openHere(e) {
      if (isOpen()) return;   /* already showing - a second trigger must be a no-op */
      /* Nav buttons sit outside the slides, so they are excluded by this test.
         Swiper suppresses the click that ends a drag (preventClicks). */
      var el = e.target.closest && e.target.closest('[wized="unitTypeSlide"]');
      if (!el) return;
      /* stop the site-wide [data-youtube-facade] handler mounting an inline player */
      e.preventDefault();
      e.stopPropagation();
      var i = indexOf(el);
      open(media(), i < 0 ? current() : i, function (n) {
        /* leave the slider on whatever they stopped at */
        if (slider.swiper) slider.swiper.slideTo(n);
        try { Wized.data.v.slideIndex = n; } catch (err) {}
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
