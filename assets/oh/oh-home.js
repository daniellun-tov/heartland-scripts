/* ============================================================
   Oak Hills - home page Unit Types section (15 Oct 2026)
   Replaces the four inline page scripts ohUnitTypes1-4. Wized v1 renders the
   accordion and the details panel; this file adds what v1 does not know:
     - coming-soon types: a View button, price "On release", Register Interest
       instead of Select on Map, size range from the v2 /units feed
     - an Occupation row next to the price
     - a Floor Plan button that opens the floor plan viewer (oh-plans.js)
     - types with only a flythrough (B, C): the video fills the gallery width
   Nothing here touches Xano or the Wized wirings.
   ============================================================ */
(function () {
  var t = window.ohUT = window.ohUT || {};
  if (t.v === 2) return;
  t.v = 2;
  t.V2 = 'https://x7aj-untn-pq4t.n7e.xano.io/api:BHoGDH-q/units';
  var OCCUPATION = 'February 2027';

  /* the state CSS (oh-home.css) sits next to this file in the repo: load it from the same
     pinned commit so the home page has one release pin instead of two */
  (function () {
    var me = document.currentScript && document.currentScript.src;
    if (!me || document.querySelector('link[data-oh-home-css]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = me.replace(/oh-home\.js(\?.*)?$/, 'oh-home.css'); l.setAttribute('data-oh-home-css', '');
    document.head.appendChild(l);
  })();

  t.q = function (s, r) { return (r || document).querySelector(s); };
  t.qa = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  t.wz = function () { return window.Wized && window.Wized.data ? window.Wized : null; };
  t.txt = function (el, s) { if (el && el.textContent !== s) el.textContent = s; };
  t.soon = function (item) { return !!t.q('[wized="unit_type_coming_soon_tag"]', item); };
  t.det = function () { var w = t.wz(), r = w && w.data.r.get_unit_type_details; return r && r.data; };
  t.letter = function (x) { var m = /([ABC])\b/i.exec(String(x || '')); return m ? m[1].toUpperCase() : ''; };
  t.btn = function (label, attr) {
    var src = t.q('.unit-accordion-view-btn:not([data-oh-view]):not([data-oh-fp-btn])');
    if (!src) return null;
    var b = src.cloneNode(true);
    b.removeAttribute('wized'); b.removeAttribute('data-w-id');
    b.style.display = ''; b.setAttribute(attr, '');
    t.txt(t.q('.button-text', b), label);
    return b;
  };

  /* ---- accordion items ---- */
  t.items = function () {
    t.qa('[wized="unit_type_item"]').forEach(function (item) {
      var soon = t.soon(item);
      var title = t.q('.unit-accordion-title', item);
      var letterEl = t.q('[wized="unit_type_letter"]', item);
      if (soon && title && !t.q('.unit-accordion-view-btn', item)) {
        var v = t.btn('View', 'data-oh-view');
        if (v) { if (item.classList.contains('is-open')) v.style.display = 'none'; title.appendChild(v); }
      }
      var price = t.q('[wized="unit_type_price"]', item);
      if (price) {
        if (soon) { t.txt(price, 'On release'); t.txt(price.previousElementSibling, 'Price'); }
        if (!t.q('[data-oh-occ]', item)) {
          var occ = price.parentNode.cloneNode(true);
          occ.setAttribute('data-oh-occ', '');
          t.qa('[wized]', occ).forEach(function (n) { n.removeAttribute('wized'); });
          price.parentNode.parentNode.appendChild(occ);
        }
        var o = t.q('[data-oh-occ]', item);
        t.txt(o.children[0], 'Occupation');
        t.txt(o.children[1], soon ? 'On release' : OCCUPATION);
      }
      var desc = t.q('[wized="unit_type_description"]', item);
      if (desc) desc.style.display = soon ? 'none' : '';
      /* Wized's empty template item (letter "-") carries the Coming Soon tag too, and the
         first real item (Type A) reuses that node: so undo the swap when a type turns out
         not to be coming soon, and only store a real letter. */
      var k = t.letter(letterEl && letterEl.textContent);
      t.qa('a.button.primary', item).forEach(function (a) {
        var tx = t.q('.button-text', a);
        if (soon && tx && /Select on Map|Register Interest/.test(tx.textContent)) {
          t.txt(tx, 'Register Interest');
          a.setAttribute('href', '#contact-us');
          a.setAttribute('data-oh-swapped', '');
          if (k) a.setAttribute('data-oh-interest', k); else a.removeAttribute('data-oh-interest');
        } else if (!soon && k && a.hasAttribute('data-oh-swapped')) {
          a.removeAttribute('data-oh-swapped'); a.removeAttribute('data-oh-interest');
          a.setAttribute('href', '#');
          t.txt(tx, 'Select on Map');
        }
      });
    });
  };

  /* ---- details panel ---- */
  var units = null, fetching = false;
  function sizeRange(type) {
    if (!units) {
      if (!fetching) {
        fetching = true;
        fetch(t.V2, { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { if (Array.isArray(j)) { units = j; t.queue(); } }).catch(function () {});
      }
      return null;
    }
    var s = units.filter(function (u) { return u.type_code === type; }).map(function (u) { return Number(u.unit_size); }).filter(Boolean);
    if (!s.length) return null;
    var lo = Math.floor(Math.min.apply(0, s)), hi = Math.ceil(Math.max.apply(0, s));
    return lo === hi ? String(lo) : lo + ' to ' + hi;
  }
  t.details = function () {
    var d = t.det(); if (!d) return;
    var ut = d.unit_type || {};
    var item = t.q('[wized="unit_type_item"][data-unit-type-id="' + ut.id + '"]');
    if (!item) return;
    var soon = t.soon(item);
    var letter = t.letter(ut.type) || t.letter((t.q('[wized="details_unit_type_letter"]') || {}).textContent);
    var wrap = t.q('.unit-right-details .buttons-wrapper');
    var map = t.q('[wized="select_unit_type_map"]');

    /* Floor Plan button: opens the viewer (3D render / line drawing / downloads) */
    var fp = t.q('[data-oh-fp-btn]');
    if (!fp && wrap && (fp = t.btn('Floor Plan', 'data-oh-fp-btn'))) wrap.insertBefore(fp, wrap.firstChild);
    if (fp) {
      var has = !!(window.ohPlans && window.ohPlans.types[letter]);
      fp.style.display = has ? '' : 'none';
      fp.setAttribute('href', '#'); fp.setAttribute('role', 'button');
      fp.setAttribute('data-oh-fp-type', letter);
      fp.removeAttribute('download'); fp.removeAttribute('target');
      fp.setAttribute('aria-label', 'View the Unit Type ' + letter + ' floor plan');
    }

    if (map) {
      var tx = t.q('.button-text', map);
      if (!map.hasAttribute('data-oh-href')) { map.setAttribute('data-oh-href', map.getAttribute('href') || ''); map.setAttribute('data-oh-label', tx ? tx.textContent : ''); }
      if (soon) { t.txt(tx, 'Register Interest'); map.setAttribute('href', '#contact-us'); map.setAttribute('data-oh-interest', ut.type || ''); }
      else { t.txt(tx, map.getAttribute('data-oh-label')); map.setAttribute('href', map.getAttribute('data-oh-href')); map.removeAttribute('data-oh-interest'); }
    }
    if (soon) { var r = sizeRange(ut.type); if (r) t.txt(t.q('[wized="details_unit_type_area"]'), r); }

    /* gallery: flythrough only (no interior renders) fills the width */
    var sw = t.q('#unit-types-swiper');
    if (sw) {
      var media = t.qa('[wized="unit_type_media_item"]', sw).filter(function (m) {
        var img = t.q('img', m); return img && !/unit-type-placeholder/.test(img.getAttribute('src') || '');
      });
      var full = media.length === 0 || /^[BC]$/.test(letter);
      if (sw.classList.contains('is-oh-full') !== full) {
        sw.classList.toggle('is-oh-full', full);
        if (window.reinitUnitTypesSwiper) window.reinitUnitTypesSwiper();
      }
      if (full) t.qa('[wized="unit_type_media_item"]', sw).forEach(function (m) { m.style.display = 'none'; });
      else t.qa('[wized="unit_type_media_item"]', sw).forEach(function (m) { m.style.display = ''; });
    }
  };

  /* ---- scheduling ---- */
  var queued = false;
  function run() { queued = false; t.items(); t.details(); }
  t.queue = function () { if (!queued) { queued = true; requestAnimationFrame(run); } };

  document.addEventListener('click', function (e) {
    var fpb = e.target.closest('[data-oh-fp-btn]');
    if (fpb) {
      e.preventDefault(); e.stopImmediatePropagation();
      var k = fpb.getAttribute('data-oh-fp-type');
      if (window.ohPlans && k) window.ohPlans.open(k);
      return;
    }
    var v = e.target.closest('[data-oh-view]');
    if (v) {
      var w = t.wz(); if (!w) return;
      var vars = w.data.v;
      vars.selected_unit_type_id = Number(v.closest('[data-unit-type-id]').getAttribute('data-unit-type-id'));
      vars.selected_building_id = 0; vars.selected_floor_id = 0; vars.selected_onfloor_number_id = 0; vars.selected_unit_id = 0;
      w.requests.execute('get_unit_type_details').then(function () {
        var ut = (t.det() || {}).unit_type || {};
        vars.selected_unit_vr_url = ut.vr_url || '';
        var fpl = ut.unit_type_floorplan; vars.selected_unit_floorplan_url = (fpl && fpl[0] && fpl[0].url) || '';
        window.dispatchEvent(new Event('oakhills:unitDetailsRendered'));
        if (window.reinitUnitTypesSwiper) window.reinitUnitTypesSwiper();
        setTimeout(t.queue, 120);
      });
      return;
    }
    var ri = e.target.closest('[data-oh-interest]');
    if (ri) {
      e.preventDefault(); e.stopImmediatePropagation();
      var msg = document.querySelector('[wized="interest_message"]'), sec = document.getElementById('contact-us');
      /* read the type from where the button sits, not from what was stored on it */
      var it = ri.closest('[wized="unit_type_item"]');
      var k2 = it ? t.letter((t.q('[wized="unit_type_letter"]', it) || {}).textContent)
                  : t.letter((t.q('[wized="details_unit_type_letter"]') || {}).textContent) || t.letter(ri.getAttribute('data-oh-interest'));
      if (msg && /^I would like to register my interest in Unit Type .*\.$/.test(msg.value)) msg.value = '';
      if (msg && !msg.value && k2) { msg.value = 'I would like to register my interest in Unit Type ' + k2 + '.'; msg.dispatchEvent(new Event('input', { bubbles: true })); }
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, true);

  ['oakhills:unitDetailsRendered', 'oakhills:unitTypesRendered'].forEach(function (ev) {
    window.addEventListener(ev, function () { setTimeout(t.queue, 150); });
  });
  (function wait(n) {
    var list = document.querySelector('[wized="unit_types_list"]');
    if (list) {
      new MutationObserver(t.queue).observe(list.closest('.unit-wrap') || list.parentNode, { childList: true, subtree: true, characterData: true });
      t.queue();
    } else if (n < 50) setTimeout(function () { wait(n + 1); }, 200);
  })(0);

  /* 16 Oct: flythrough thumbnails. The video (wized unit_type_flythrough) shipped with preload=none,
     so the slide stayed black until played. Ask for metadata and seek to 0.1s so the first frame
     paints (iOS Safari needs the #t fragment), every time Wized sets a new src. */
  (function () {
    function fix(v) {
      if (v.getAttribute('preload') !== 'metadata') v.setAttribute('preload', 'metadata');
      var src = v.getAttribute('src') || '';
      if (src && src.indexOf('#') === -1) v.setAttribute('src', src + '#t=0.1');
    }
    function all() { t.qa('video.flythrough-video, video[wized="unit_type_flythrough"]').forEach(fix); }
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.type === 'attributes' && m.target.tagName === 'VIDEO' && m.target.matches('.flythrough-video, [wized="unit_type_flythrough"]')) fix(m.target);
        else if (m.type === 'childList' && m.addedNodes.length) { all(); break; }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all); else all();
  })();
})();
