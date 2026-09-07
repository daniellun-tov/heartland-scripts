/* ==========================================================================
   CHS Residence — bed selector
   Page: /chs-dev  ·  Collection: Beds (6979edfd95680d336656abed)

   DESIGN RULE: this file holds NO data and NO styling.
     · Every colour, border, radius and space is a Webflow class.
     · Every value — bed geometry, floor, room type, rate, status — is a CMS
       field, read at runtime from the hidden chs_bed_data nodes.
     · Every piece of copy — floor labels and notes — is an attribute on the
       floor tab elements, editable in the Designer.
   If you find yourself adding a number or a sentence to this file, it belongs
   in Webflow instead.

   What it actually does:
     1. positions each bed over the plan from the CMS percentages
     2. swaps the state combo class on a bed
     3. shows one floor at a time
     4. fills the panel, prefills the form, draws the snapshot

   Styling lives in these Webflow classes — edit them in the Designer:
     chs_selector_wrap  chs_floors_switch  chs_floors_tab (+ is-chs-active)
     chs_floors_count   chs_plan_caption   chs_plan_caption-floor/-note
     chs_plan_stage     chs_plan_image     chs_plan_hotspots  chs_plan_list
     chs_bed (+ is-chs-selected / is-chs-taken / is-chs-unreleased)
     chs_bed_number     chs_legend  chs_legend_item  chs_legend_swatch
     chs_chip (+ is-chs-active / is-chs-empty)  chs_chip_count
     chs_filters_form/_group/_label
     chs_panel  chs_panel_bed  chs_panel_row  chs_panel_rate
     chs_snapshot  chs_snapshot_canvas  chs_snapshot_meta
     chs_empty

   All state classes are chs-prefixed on purpose. `is-active`, `is-selected`
   etc. already exist site-wide on Heartland — never reuse them here.

   Snapshot colours are the only literals here: canvas has no classes. They
   mirror the CHS variable collection (CHS Gold / CHS Navy / CHS Cream).
   ========================================================================== */

(function () {
  'use strict';

  var STATE_CLASS = {
    selected:   'is-chs-selected',
    taken:      'is-chs-taken',
    unreleased: 'is-chs-unreleased',
    activeTab:  'is-chs-active',
    emptyChip:  'is-chs-empty'
  };

  var SELECTABLE  = 'Available';
  var UNRELEASED  = 'Unreleased';

  // Canvas cannot use Webflow classes. Keep in step with the CHS variables.
  var INK = { gold: '#B79A63', navy: '#171B54', wash: 'rgba(246,243,236,.55)',
              muted: 'rgba(32,34,84,.28)', mutedInk: 'rgba(255,255,255,.85)' };

  var state = { floor: 'first', selectedId: null, beds: [] };

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- read the Collection List ----------------------------------
     Webflow cannot bind a CMS field to a custom ATTRIBUTE on a Collection
     Item, so each bed carries a hidden .chs_bed_data block of CMS-bound text
     nodes instead. Those same nodes double as the Finsweet filter fields
     (fs-list-field), so there is one source of truth per value.            */
  function val(el, key) {
    var n = el.querySelector('[data-chs-val="' + key + '"]');
    return n ? n.textContent.trim() : '';
  }

  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }

  function readBeds() {
    return $$('[data-chs="bed-item"]').map(function (el) {
      var b = {
        el: el,
        id:        val(el, 'id'),
        slug:      val(el, 'slug'),
        num:       val(el, 'number'),
        name:      val(el, 'name'),
        apartment: val(el, 'apartment'),
        gender:    val(el, 'gender'),
        roomType:  val(el, 'room-type'),
        status:    val(el, 'status'),
        phase:     val(el, 'phase'),
        rate:      val(el, 'rate-display'),
        size:      val(el, 'room-size'),
        share:     val(el, 'beds-in-room'),
        floor:     val(el, 'floor').toLowerCase(),
        x: num(val(el, 'plan-x')),
        y: num(val(el, 'plan-y')),
        w: num(val(el, 'plan-w')),
        h: num(val(el, 'plan-h'))
      };
      b.room = b.roomType;
      // A bed with no geometry or no floor cannot be placed — skip it rather
      // than guess a position and put a hotspot over the wrong room.
      if (b.x === null || b.y === null || b.w === null || b.h === null) return null;
      if (b.floor !== 'ground' && b.floor !== 'first') return null;
      return b;
    }).filter(Boolean);
  }

  /* ---------- floor copy, read off the Designer --------------------------
     The tab element carries its own label and note as attributes, so the
     wording is edited in Webflow, never here.                               */
  function floorMeta(key) {
    var tab = $('[data-chs-floor-tab="' + key + '"]');
    return {
      label: (tab && tab.getAttribute('data-chs-floor-label')) || '',
      note:  (tab && tab.getAttribute('data-chs-floor-note'))  || ''
    };
  }

  /* ---------- paint ------------------------------------------------------ */
  function paint() {
    state.beds.forEach(function (b) {
      var el = b.el;

      // plan-x / plan-y are the CENTRE of the plot, as % of the floor image
      el.style.left   = (b.x - b.w / 2) + '%';
      el.style.top    = (b.y - b.h / 2) + '%';
      el.style.width  = b.w + '%';
      el.style.height = b.h + '%';

      // state combo — remove all three, then add the one that applies
      el.classList.remove(STATE_CLASS.taken, STATE_CLASS.unreleased, STATE_CLASS.selected);
      var selectable = b.status === SELECTABLE;
      if (b.status === UNRELEASED)   el.classList.add(STATE_CLASS.unreleased);
      else if (!selectable)          el.classList.add(STATE_CLASS.taken);
      if (b.id === state.selectedId) el.classList.add(STATE_CLASS.selected);

      // only the active floor is visible
      el.style.display = b.floor === state.floor ? '' : 'none';

      // a11y — the item is a link/div in Webflow, so give it button semantics
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', label(b));
      if (selectable) {
        el.setAttribute('tabindex', '0');
        el.removeAttribute('aria-disabled');
      } else {
        el.setAttribute('tabindex', '-1');
        el.setAttribute('aria-disabled', 'true');
      }
    });

    paintFloorCounts();
    paintEmpty();
  }

  function label(b) {
    var where = 'Apartment ' + apt(b.apartment) + ', ' + b.room + ', bed ' + b.num;
    if (b.status === UNRELEASED)  return where + ' — releasing in Phase 2, not yet available';
    if (b.status !== SELECTABLE)  return where + ' — already taken';
    return where + ', ' + b.rate + ' per month. Choose this bed.';
  }

  function apt(a) { return (a || '').replace(/^Apartment\s*/i, ''); }

  function paintFloorCounts() {
    $$('[data-chs-floor-tab]').forEach(function (tab) {
      var key = tab.getAttribute('data-chs-floor-tab');
      var free = state.beds.filter(function (b) {
        return b.floor === key && b.status === SELECTABLE;
      }).length;
      var out = $('.chs_floors_count', tab);
      if (out) out.textContent = free === 0 ? 'none free' : free + ' free';
    });
  }

  function paintEmpty() {
    var box = $('[data-chs="empty"]');
    if (!box) return;
    var anyOnFloor = state.beds.some(function (b) { return b.floor === state.floor; });
    box.style.display = anyOnFloor ? 'none' : '';
  }

  /* ---------- floors ----------------------------------------------------- */
  function setFloor(key) {
    state.floor = key;

    $$('[data-chs-plan]').forEach(function (img) {
      img.style.display = img.getAttribute('data-chs-plan') === key ? '' : 'none';
    });
    $$('[data-chs-floor-tab]').forEach(function (tab) {
      var on = tab.getAttribute('data-chs-floor-tab') === key;
      tab.classList.toggle(STATE_CLASS.activeTab, on);
      tab.setAttribute('aria-pressed', String(on));
    });

    var f = floorMeta(key);
    var cap  = $('[data-chs-field="floor-label"]'); if (cap)  cap.textContent  = f.label;
    var note = $('[data-chs-field="floor-note"]');  if (note) note.textContent = f.note;

    state.beds.forEach(function (b) {
      b.el.style.display = b.floor === key ? '' : 'none';
    });
    paintEmpty();
  }

  /* ---------- selection -------------------------------------------------- */
  function select(id) {
    var bed = state.beds.filter(function (b) { return b.id === id; })[0];
    if (!bed || bed.status !== SELECTABLE) return;

    state.selectedId = id;
    state.beds.forEach(function (b) {
      b.el.classList.toggle(STATE_CLASS.selected, b.id === id);
    });
    if (bed.floor !== state.floor) setFloor(bed.floor);

    fillPanel(bed);
    fillForm(bed);
    drawSnapshot(bed);

    try {
      var u = new URL(window.location.href);
      u.searchParams.set('bed', bed.slug);
      history.replaceState(null, '', u);
    } catch (e) {}

    document.dispatchEvent(new CustomEvent('chs:bedSelected', { detail: bed }));
  }

  function fillPanel(bed) {
    var p = $('[data-chs="detail-panel"]');
    if (!p) return;
    put(p, 'bed-name',  bed.name);
    put(p, 'apartment', bed.apartment);
    put(p, 'room',      bed.room);
    put(p, 'floor',     floorMeta(bed.floor).label);
    put(p, 'rate',      bed.rate);
    put(p, 'size',      bed.size ? bed.size + ' m²' : '');
    put(p, 'sharing',   bed.share === '1' ? 'Private room' : 'You would share with 1 other');
    put(p, 'gender',    bed.gender ? bed.gender + ' apartment' : '');
    p.style.display = '';
  }

  function put(root, field, val) {
    var el = $('[data-chs-field="' + field + '"]', root);
    if (el) el.textContent = val || '';
  }

  /* ---------- form prefill ----------------------------------------------- */
  function fillForm(bed) {
    var form = $('[data-chs="reserve-form"]');
    if (!form) return;
    var vals = {
      'bed-item-id': bed.id,               // Make finds the CMS record on this
      'bed-name':    bed.name,
      'bed-number':  bed.num,
      'apartment':   bed.apartment,
      'room':        bed.room,
      'room-type':   bed.roomType,
      'floor':       floorMeta(bed.floor).label,
      'gender':      bed.gender,
      'rate':        bed.rate,
      'bed-link':    window.location.origin + window.location.pathname + '?bed=' + bed.slug
    };
    Object.keys(vals).forEach(function (n) {
      var i = form.querySelector('[name="' + n + '"]');
      if (i) i.value = vals[n] || '';
    });
  }

  /* ---------- snapshot ---------------------------------------------------
     The chosen bed drawn on its own floor, others muted. Shown on the form so
     the student confirms what they are asking for. Deliberately not posted as
     a data URL — a 100 KB string makes the notification email unusable; sales
     gets the deep link in `bed-link` instead. */
  function drawSnapshot(bed) {
    var wrap = $('[data-chs="snapshot"]');
    if (!wrap) return;
    var canvas = $('canvas', wrap);
    var img = $('[data-chs-plan="' + bed.floor + '"]');
    if (!canvas || !img) return;

    function draw() {
      var W = img.naturalWidth, H = img.naturalHeight;
      if (!W || !H) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.aspectRatio = W + ' / ' + H;

      var c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.drawImage(img, 0, 0, W, H);
      c.fillStyle = INK.wash;
      c.fillRect(0, 0, W, H);

      state.beds.filter(function (b) { return b.floor === bed.floor; })
        .forEach(function (b) {
          var on = b.id === bed.id;
          var w = b.w / 100 * W, h = b.h / 100 * H;
          var x = b.x / 100 * W - w / 2, y = b.y / 100 * H - h / 2;
          c.fillStyle = on ? INK.gold : INK.muted;
          rr(c, x, y, w, h, 6); c.fill();
          if (on) { c.lineWidth = 5; c.strokeStyle = INK.navy; rr(c, x, y, w, h, 6); c.stroke(); }
          c.fillStyle = on ? INK.navy : INK.mutedInk;
          c.font = (on ? 'bold ' : '') + Math.round(h * .34) + 'px Inter, sans-serif';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(b.num, x + w / 2, y + h / 2);
        });

      var cap = floorMeta(bed.floor).label + ' · Apartment ' + apt(bed.apartment);
      c.font = 'bold ' + Math.round(H * .045) + 'px Inter, sans-serif';
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      var pad = H * .03, tw = c.measureText(cap).width;
      c.fillStyle = INK.navy; rr(c, pad, pad, tw + pad * 1.6, H * .085, 4); c.fill();
      c.fillStyle = '#FFFFFF'; c.fillText(cap, pad + pad * .8, pad + H * .062);
    }

    if (img.complete && img.naturalWidth) draw();
    else img.addEventListener('load', draw, { once: true });

    put(wrap, 'snap-bed', bed.name);
    put(wrap, 'snap-where', bed.apartment + ' · ' + floorMeta(bed.floor).label + ' · ' + bed.room);
    put(wrap, 'snap-rate', bed.rate + ' per month');
    wrap.style.display = '';
  }

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);         c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ---------- wiring ----------------------------------------------------- */
  function refresh() {
    state.beds = readBeds();
    if (state.selectedId && !state.beds.some(function (b) { return b.id === state.selectedId; })) {
      state.selectedId = null;
    }
    paint();
  }

  function init() {
    $$('[data-chs-floor-tab]').forEach(function (tab) {
      tab.addEventListener('click', function (e) {
        e.preventDefault();
        setFloor(tab.getAttribute('data-chs-floor-tab'));
      });
    });

    // Delegated so it survives Finsweet re-rendering the list.
    document.addEventListener('click', function (e) {
      var item = e.target.closest ? e.target.closest('[data-chs="bed-item"]') : null;
      if (item) { e.preventDefault(); select(item.getAttribute('data-bed-id')); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var item = e.target.closest ? e.target.closest('[data-chs="bed-item"]') : null;
      if (item) { e.preventDefault(); select(item.getAttribute('data-bed-id')); }
    });

    refresh();
    setFloor(state.floor);

    var want = new URLSearchParams(window.location.search).get('bed');
    if (want) {
      var m = state.beds.filter(function (b) { return b.slug === want; })[0];
      if (m) select(m.id);
    }

    // Repaint after Finsweet filters.
    window.FinsweetAttributes = window.FinsweetAttributes || [];
    window.FinsweetAttributes.push(['list', function (lists) {
      (lists || []).forEach(function (l) {
        if (l && l.effect) l.effect(function () { l.items.value; refresh(); });
      });
    }]);

    var host = $('[data-chs="plan-stage"]');
    if (host && window.MutationObserver) {
      var t;
      new MutationObserver(function () { clearTimeout(t); t = setTimeout(refresh, 60); })
        .observe(host, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.CHSSelector = { refresh: refresh, select: select, setFloor: setFloor, state: state };
})();
