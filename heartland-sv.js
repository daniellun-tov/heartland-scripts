/* =========================================================
     Stellenbosch Village — Interactive site plan controller

     WHY THIS LIVES ON THE PAGE AND NOT IN THE COMPONENT:
     The unit filter section on THIS page is a detached (unlinked) copy of
     the "Section / Unit Filter" component — it carries only 7 of the
     component's 19 embeds, so none of the component's behaviour embeds
     render here. /unit-selection uses the real component instance and gets
     its scripts from the embeds. Until the Home section is re-linked to the
     component, this page code is the ONLY copy of these scripts on Home.
     Do not delete it thinking it is a duplicate. (2026-08-11)
     ========================================================= */
  
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
        flat.price_display = formatPrice(flat.price);
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
      fetch('https://x7aj-untn-pq4t.n7e.xano.io/api:gcBt2DIO/units')
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
      Wized.data.v.activeImage = 0;

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
      const scrollNav = document.querySelector('.unit-details_scroll-nav');

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

      scrollNav?.addEventListener('click', (e) => {
        const a = e.target.closest('a[href^="#"]');
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();

        const s = panelScroll();
        const target = s?.querySelector(a.getAttribute('href'));
        if (!s || !target) return;

        const navOffset = scrollNav.offsetHeight;
        const top = target.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop - navOffset;

        s.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      });
    }
  });

// Extra facets (View / Position / Garage Type) refining the controller's output

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


// Plot tooltip controller
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

      field.price.textContent = u.price ? money.format(u.price) : 'Price on request';
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

      console.log('📦 Final Payload:', payload);
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


// Tablet/Mobile: map/list view switch + filter drawer + active-count badge
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

// More filters disclosure + Lenis opt-out for the drawer 

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


// Floorplan lightbox 
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

// ?unit= URL param sync, deep-link restore, and WhatsApp share -->
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
   UNIT DETAIL PANEL + UNIT TYPES SLIDER
   1. Sticky sub-nav (+ scrollspy) inside the detail panel - unchanged.
   2. Galleries: the detail panel gallery and the unit types slider, sharing one
      lightbox. Images, mp4 and YouTube; YouTube is detected from the URL, so a
      wrong `kind` in Xano cannot break it. Nothing plays inline - a click always
      opens the lightbox.
   3. Mounts Swiper on the unit types slider. The markup is Swiper-shaped but the
      site-wide initialiser only picks up [data-swiper-container="true"], so no
      Swiper was ever started: the arrows set a slideIndex variable nothing read
      and the track could not move.
   Part 2/3 is minified to stay inside Webflow's 50,000 character page-code
   limit. Readable source: gallery-v3.js - keep the two in step.
   ============================================================ */

/* ---- 1. sticky sub-nav ---- */
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

/* ---- 2 + 3. galleries, shared lightbox, slider ---- */
!function(){"use strict";var e,t,n;function r(e){var t="",n=""
;if("string"==typeof e?t=e:e&&"object"==typeof e&&(t=e.url||e.src||e.path||e.href||"",
n=e.type||e.mime||""),!t)return null;var r=function(e){
var t=String(e||"").match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/)
;return t?t[1]:""}(t);return r?{url:t,kind:"youtube",
embed:"https://www.youtube-nocookie.com/embed/"+r+"?rel=0&playsinline=1",
poster:e&&e.poster||"https://i.ytimg.com/vi/"+r+"/maxresdefault.jpg",
poster2:"https://i.ytimg.com/vi/"+r+"/hqdefault.jpg",caption:e&&e.caption||""
}:/youtube/i.test(n)||e&&"youtube"===e.kind?null:{url:t,
kind:/^video\//i.test(n)||/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(t)?"video":"image",
poster:e&&e.poster||"",caption:e&&e.caption||""}}function i(e){if(null==e)return[]
;if("string"==typeof e)try{var t=JSON.parse(e);e=Array.isArray(t)?t:[e]}catch(t){e=[e]}
return Array.isArray(e)||(e=[e]),e.map(r).filter(Boolean)}function a(e,t){
if("video"===e.kind){var n=document.createElement("video")
;return n.src=(r=e.url)+(-1===r.indexOf("#")?"#t=0.1":""),n.muted=!0,n.playsInline=!0,
n.preload="metadata",n.className=t,n}var r,i=document.createElement("img")
;return i.className=t,i.alt="","youtube"===e.kind?(i.onerror=function(){
e.poster2&&i.src!==e.poster2&&(i.src=e.poster2)},i.src=e.poster):i.src=e.url,i}
var l=[],o=0,d=null;function u(){
e||((e=document.createElement("div")).className="ud-lightbox",
e.innerHTML='<button class="ud-lb-btn ud-lb-close" aria-label="Close">&#10005;</button><button class="ud-lb-btn ud-lb-prev" aria-label="Previous">&lsaquo;</button><div class="ud-lightbox_stage" data-lb="stage"></div><button class="ud-lb-btn ud-lb-next" aria-label="Next">&rsaquo;</button><div class="ud-lb-counter" data-lb="counter"></div>',
document.body.appendChild(e),
t=e.querySelector('[data-lb="stage"]'),n=e.querySelector('[data-lb="counter"]'),
e.querySelector(".ud-lb-close").addEventListener("click",p),
e.querySelector(".ud-lb-prev").addEventListener("click",function(){v(-1)
}),e.querySelector(".ud-lb-next").addEventListener("click",function(){v(1)
}),e.addEventListener("click",function(t){t.target===e&&p()
}),document.addEventListener("keydown",function(t){
e&&e.classList.contains("is-open")&&("Escape"===t.key?p():"ArrowRight"===t.key?(t.preventDefault(),
v(1)):"ArrowLeft"===t.key&&(t.preventDefault(),v(-1)))}))}function s(){var r=l[o];if(r){
var i
;t.innerHTML="","youtube"===r.kind?((i=document.createElement("iframe")).src=r.embed+"&autoplay=1",
i.style.cssText="width:min(92vw,1180px);aspect-ratio:16/9;max-height:82vh;border:0;border-radius:8px;background:#000",
i.setAttribute("allow","autoplay; encrypted-media; fullscreen"),
i.setAttribute("allowfullscreen",""),
i.setAttribute("title",r.caption||"Video")):"video"===r.kind?((i=document.createElement("video")).src=r.url,
i.controls=!0,
i.autoplay=!0,i.playsInline=!0):((i=document.createElement("img")).src=r.url,i.alt=""),
t.appendChild(i),n.textContent=o+1+" / "+l.length;var a=l.length<2
;e.querySelector(".ud-lb-prev").style.display=a?"none":"",
e.querySelector(".ud-lb-next").style.display=a?"none":""}}function c(t,n,r){
t&&t.length&&(u(),
l=t,o=Math.max(0,Math.min(n||0,t.length-1)),d=r||null,e.classList.add("is-open"),s())}
function p(){e&&(e.classList.remove("is-open"),t.innerHTML="")}function v(e){
l.length&&(o=(o+e+l.length)%l.length,s(),d&&d(o))}function m(e){
var t=document.querySelector(".site-plan_detail-wrap"),n=document.querySelector('[data-gallery="stage"]'),r=document.querySelector('[data-gallery="thumbs"]')
;if(t&&n&&r){var l=[],o=0;r.addEventListener("click",function(e){
var t=e.target.closest("[data-thumb]");t&&u(Number(t.getAttribute("data-thumb")))}),
n.addEventListener("click",s),n.addEventListener("keydown",function(e){
if("Enter"===e.key||" "===e.key)e.preventDefault(),s();else{if(!l.length)return
;"ArrowRight"===e.key?u((o+1)%l.length):"ArrowLeft"===e.key&&u((o-1+l.length)%l.length)}
}),new MutationObserver(function(){if(t.classList.contains("is-open"))m(v());else{p()
;var e=n.querySelector("video");if(e)try{e.pause()}catch(e){}}}).observe(t,{
attributes:!0,attributeFilter:["class"]}),t.classList.contains("is-open")&&m(v())}
function d(){var e=l[o];if(n.innerHTML="",e){
if(n.appendChild(a(e,"ud-media")),"image"!==e.kind){var t=document.createElement("div")
;t.className="ud-playbtn",
t.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
n.appendChild(t)}var r=document.createElement("div")
;r.className="ud-expand",r.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/></svg>',
n.appendChild(r)}}function u(e){
o=e,d(),r.querySelectorAll("[data-thumb]").forEach(function(e){
e.classList.toggle("is-current",Number(e.getAttribute("data-thumb"))===o)})}
function s(){c(l,o,u)}function v(){return e.data&&e.data.v?e.data.v.selectedUnit:null}
function m(e){l=function(e){if(!e)return[]
;var t=i(null==e.media||Array.isArray(e.media)&&!e.media.length?e.hero_image?[e.hero_image]:[]:e.media)
;if(t.length&&"image"!==t[0].kind){var n=t.findIndex(function(e){return"image"===e.kind
});n>0&&t.unshift(t.splice(n,1)[0])}return t
}(e),o=0,d(),r.innerHTML="",l.forEach(function(e,t){var n=document.createElement("div")
;n.className="unit-details_thumbnail"+(t===o?" is-current":""),
n.setAttribute("data-thumb",t);var i=a(e,"")
;if(i.style.cssText="width:100%;height:100%;object-fit:cover;display:block;",
"youtube"===e.kind&&(i.src=e.poster2||e.poster),n.appendChild(i),"image"!==e.kind){
var l=document.createElement("div")
;l.className="unit-details_thumb-badge",l.innerHTML='<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
n.appendChild(l)}r.appendChild(n)}),r.style.display=l.length>1?"":"none"}}function f(e){
var t=document.querySelector('[wized="unitTypeSlider"]');if(t){
if(!document.getElementById("ut-swiper-css")){var n=document.createElement("style")
;n.id="ut-swiper-css",
n.textContent='[wized="unitTypeSlider"]{overflow:hidden}[wized="unitTypeSlider"]>.swiper-wrapper{display:flex;flex-direction:row}[wized="unitTypeSlider"] .swiper-slide{flex-shrink:0}',
document.head.appendChild(n)}if(l(),!t.swiper)var r=0,a=setInterval(function(){l(),
(t.swiper||++r>40)&&clearInterval(a)},250)
;t.addEventListener("click",o),t.addEventListener("keydown",function(e){
"Enter"!==e.key&&" "!==e.key||o(e)})}function l(){
t.swiper||"function"!=typeof window.Swiper||new window.Swiper(t,{slidesPerView:1,
speed:400,grabCursor:!0,rewind:!0,observer:!0,observeParents:!0,observeSlideChildren:!0,
keyboard:{enabled:!0,onlyInViewport:!0},navigation:{
prevEl:t.querySelector('[data-swiper-nav="prev"]'),
nextEl:t.querySelector('[data-swiper-nav="next"]')}})}function o(n){
var r=n.target.closest&&n.target.closest('[wized="unitTypeSlide"]');if(r){
n.preventDefault(),n.stopPropagation();var a=function(e){
var n=t.querySelectorAll('[wized="unitTypeSlide"]')
;return Array.prototype.indexOf.call(n,e)}(r);c(function(){try{
var t=e.data.v.selectedType;return i(t&&t.media)}catch(e){return[]}}(),a<0?function(){
if(t.swiper)return t.swiper.activeIndex;try{return Number(e.data.v.slideIndex)||0
}catch(e){return 0}}():a,function(n){t.swiper&&t.swiper.slideTo(n);try{
e.data.v.slideIndex=n}catch(e){}})}}}
window.Wized=window.Wized||[],window.Wized.push(function(e){m(e),f(e)})}();
