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
     3. stacks both floors so ground and first are visible at once
     4. shows one apartment at a time (all six share the same five plots)
     5. fills the panel, prefills the form, draws the snapshot

   Styling lives in these Webflow classes — edit them in the Designer:
     chs_selector_wrap  chs_floors_switch  chs_floors_tab (+ is-chs-active)
     chs_floors_count   chs_plan_caption   chs_plan_caption-floor/-note
     chs_plan_stage     chs_plan_image     chs_plan_hotspots  chs_plan_list
     chs_bed (+ is-chs-selected / is-chs-taken / is-chs-unreleased)
     chs_bed_number     chs_bed_rate (+ is-chs-short, phones only)
     chs_legend  chs_legend_item  chs_legend_swatch
     chs_view  chs_view_label / chs_view_stage (+ is-chs-open on phones)
     chs_chip (+ is-chs-active / is-chs-empty / is-chs-unreleased)  chs_chip_count
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
    shown:      'is-chs-shown',
    hidden:     'is-chs-hidden',
    open:       'is-chs-open'
    /* Chips with no matches are handled by Finsweet's own .is-list-emptyfacet
       class - styled as a combo on .chs_chip. Nothing to do here. */
  };

  var SELECTABLE  = 'Available';
  var UNRELEASED  = 'Unreleased';

  // Canvas cannot use Webflow classes. Keep in step with the CHS variables.
  var INK = { gold: '#B79A63', navy: '#171B54', wash: 'rgba(246,243,236,.55)',
              muted: 'rgba(32,34,84,.28)', mutedInk: 'rgba(255,255,255,.85)' };

  // bands: each floor's vertical slice of the stacked stage, 0-1 of stage height.
  // Measured from the plan images themselves - no hardcoded dimensions.
  var state = { apartment: null, selectedId: null, beds: [], bands: null, sig: '', all: {} };

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

  /* ---------- stacked floors ---------------------------------------------
     Both plans are shown at once, ground above first, in normal document
     flow inside .chs_plan_stage. A bed's CMS coordinates are percentages of
     ITS OWN floor image, so they have to be remapped into the taller stacked
     box. The split comes from the images' natural sizes, measured at runtime
     - if the plans are re-exported at a different height it still lines up. */
  function measureBands() {
    var g = $('[data-chs-plan="ground"]'), f = $('[data-chs-plan="first"]');
    if (!g || !f || !g.naturalWidth || !f.naturalWidth) return null;
    var gh = g.naturalHeight / g.naturalWidth;   // height as a fraction of width
    var fh = f.naturalHeight / f.naturalWidth;
    var total = gh + fh;
    return {
      ground: { top: 0,          scale: gh / total },
      first:  { top: gh / total, scale: fh / total }
    };
  }

  /* Webflow ships these images with loading="lazy". Below the fold they stay
     unloaded, naturalWidth is 0, and anything that waited on their load event
     never ran - which silently killed positioning, the snapshot and the whole
     panel. So: never gate rendering on the images. Render now, re-measure and
     repaint whenever a plan actually arrives, and force them to load. */
  function watchPlans(onReady) {
    var imgs = $$('[data-chs-plan]');
    imgs.forEach(function (img) {
      img.setAttribute('loading', 'eager');
      if (img.decoding) img.decoding = 'sync';
      if (img.complete && img.naturalWidth) return;
      img.addEventListener('load', onReady, { once: true });
      // Nudge a lazy image that the browser has not started yet.
      if (!img.complete && img.src) { var u = img.src; img.src = u; }
    });
    if (window.ResizeObserver) {
      var host = $('[data-chs="plan-stage"]');
      if (host) new ResizeObserver(onReady).observe(host);
    }
  }


  /* Re-measure the floor bands and repaint. Safe to call repeatedly. */
  function remeasure() {
    var bands = measureBands();
    if (bands) state.bands = bands;
    var sig = planSignature();
    if (sig.indexOf('x') !== -1) return;        // plans not laid out yet
    var changed = sig !== state.sig;
    state.sig = sig;
    if (changed) {
      paint();
      if (state.selectedId) {
        var bed = state.beds.filter(function (b) { return b.id === state.selectedId; })[0];
        if (bed) drawSnapshot(bed);
      }
    }
  }

  /* Where a floor's image actually sits inside the stage, as percentages of
     the stage box. Everything on the plan is positioned against THIS rather
     than against the stage itself, because the stage can hold other things -
     the floor labels go static on mobile so they no longer overlay the plan -
     and the moment it does, a percentage of the stage stops being a
     percentage of the drawing. Measured from the laid-out DOM, so it holds
     whatever else is in there and whatever the breakpoint does.            */
  function planBox(floor) {
    var img   = $('[data-chs-plan="' + floor + '"]');
    var stage = $('[data-chs="plan-stage"]');
    if (!img || !stage) return null;
    var sw = stage.offsetWidth, sh = stage.offsetHeight;
    if (!sw || !sh || !img.offsetWidth || !img.offsetHeight) return null;
    return {
      left:   img.offsetLeft / sw * 100,
      top:    img.offsetTop  / sh * 100,
      wScale: img.offsetWidth  / sw,   // one % of the image, in % of the stage
      hScale: img.offsetHeight / sh
    };
  }

  function place(b) {
    var box = planBox(b.floor);
    if (!box) return null;
    return {
      left:   box.left + (b.x - b.w / 2) * box.wScale,
      width:  b.w * box.wScale,
      top:    box.top  + (b.y - b.h / 2) * box.hScale,
      height: b.h * box.hScale
    };
  }

  // Changes whenever the plan's box inside the stage moves or resizes - a
  // breakpoint switch, a label wrapping onto a second line, an image loading.
  function planSignature() {
    return ['ground', 'first'].map(function (f) {
      var b = planBox(f);
      return b ? [b.left, b.top, b.wScale, b.hScale].join(',') : 'x';
    }).join('|');
  }

  /* ---------- which apartment ---------------------------------------------
     All six apartments are the same plan, so every apartment's bed 3 sits on
     exactly the same spot. Drawing them all stacks six hotspots per plot and
     the top one wins - which is why an unreleased Phase 2 bed used to cover
     an available one. Only ever show one apartment at a time.              */
  function apartmentsPresent() {
    var seen = [], out = [];
    state.beds.forEach(function (b) {
      if (b.apartment && seen.indexOf(b.apartment) === -1) { seen.push(b.apartment); out.push(b.apartment); }
    });
    out.sort(function (a, c) { return (parseInt(apt(a), 10) || 0) - (parseInt(apt(c), 10) || 0); });
    return out;
  }

  /* ---------- 3D view overlays -------------------------------------------
     The highlights live in the Beds CMS (field apartment-highlight, carried by
     all five beds of an apartment). A Collection List filtered to bed-number 1
     renders exactly one overlay per apartment. Webflow cannot bind a CMS field
     to a custom attribute on a Collection Item, so each item pairs the image
     with a hidden apartment-name node - the same trick the hotspots use.
     No image URLs live in this file.                                        */
  function paintOverlays(name) {
    $$('[data-chs-overlay-img]').forEach(function (el) {
      var item  = (el.closest && el.closest('.w-dyn-item')) || el.parentElement;
      var owner = item ? val(item, 'apartment') : '';
      var on    = !!name && owner === name;
      // The overlay is a Webflow Lightbox link wrapping the CMS image, so pull
      // the image out to load it eagerly the moment its apartment is chosen.
      if (on) {
        var pic = el.tagName === 'IMG' ? el : el.querySelector('img');
        if (pic) pic.setAttribute('loading', 'eager');
      }
      el.classList.toggle(STATE_CLASS.shown, on);
    });
    // Legacy static overlays, kept working if any are still on the page.
    $$('[data-chs-overlay]').forEach(function (img) {
      img.classList.toggle(STATE_CLASS.shown, img.getAttribute('data-chs-overlay') === name);
    });
  }

  function setApartment(name) {
    state.apartment = name;
    paint();
    paintOverlays(name);

    var cap  = $('[data-chs-field="floor-label"]');
    var note = $('[data-chs-field="floor-note"]');
    // Fall back to the inventory: with a gender filter on a mismatched
    // apartment the list is empty, and the labels must still read.
    var one  = state.beds.filter(function (b) { return b.apartment === name; })[0] ||
               inventory().filter(function (b) { return b.apartment === name; })[0];
    if (cap)  cap.textContent  = name || '';
    if (note) note.textContent = one ? [one.gender && one.gender + ' apartment', one.phase].filter(Boolean).join(' \u00b7 ') : '';
    document.dispatchEvent(new CustomEvent('chs:apartmentChanged', { detail: name }));
  }

  function visible(b) { return b.apartment === state.apartment; }

  /* ---------- paint ------------------------------------------------------ */
  /* ---------- room plots -------------------------------------------------
     The three room outlines and their four labels are Designer elements, not
     CMS items: they are identical in all six apartments, so their geometry
     rides on data attributes rather than costing five CMS fields we do not
     have. They are placed with the same band remapping the beds get, and the
     layer sits under the hotspot list so a bed always wins the click.
     Percentages are of the floor image the room sits on, exactly as for beds:
     x / y are the CENTRE, w / h the size. Edit them in Webflow, not here.   */
  function geom(el) {
    var g = {
      floor: (el.getAttribute('data-chs-floor') || '').toLowerCase(),
      x: num(el.getAttribute('data-chs-x')),
      y: num(el.getAttribute('data-chs-y')),
      w: num(el.getAttribute('data-chs-w')),
      h: num(el.getAttribute('data-chs-h'))
    };
    if (g.x === null || g.y === null) return null;
    if (g.floor !== 'ground' && g.floor !== 'first') return null;
    return g;
  }

  // Label type scales with the plan, so publish the plan's rendered width and
  // let the stylesheet do the arithmetic. Keeps the ratio out of this file.
  function publishPlanWidth() {
    var stage = $('[data-chs="plan-stage"]');
    if (!stage) return;
    // On mobile the plan is drawn wider than the screen inside a horizontal
    // scroller, so size the labels from what is actually visible - otherwise
    // the type would grow with the pannable canvas rather than the viewport.
    var scroll = $('[data-chs="plan-scroll"]');
    var w = (scroll && scroll.clientWidth) || stage.clientWidth;
    stage.style.setProperty('--chs-plan-w', w + 'px');
  }

  function paintRooms() {
    publishPlanWidth();

    var sel  = state.beds.filter(function (b) { return b.id === state.selectedId; })[0];
    var room = sel ? sel.room : null;

    $$('[data-chs-room]').forEach(function (el) {
      var g = geom(el);
      if (!g || g.w === null || g.h === null) return;
      var pos = place(g);
      if (!pos) return;
      el.style.left   = pos.left + '%';
      el.style.top    = pos.top + '%';
      el.style.width  = pos.width + '%';
      el.style.height = pos.height + '%';
      // Selecting a bed lifts its room from the resting 0.7 to full strength.
      el.classList.toggle(STATE_CLASS.selected,
        !!room && el.getAttribute('data-chs-room') === room);
    });

    // Labels are anchored on their centre and translated, so only x / y apply.
    $$('[data-chs-room-label]').forEach(function (el) {
      var g = geom(el);
      if (!g) return;
      var box = planBox(g.floor);
      if (!box) return;
      el.style.left = (box.left + g.x * box.wScale) + '%';
      el.style.top  = (box.top  + g.y * box.hScale) + '%';
    });
  }

  /* ---------- hero counters ----------------------------------------------
     Three counters sit in the hero, well above the selector. They are keyed by
     the DOM ids set in the Designer and are filled from the CMS, so the numbers
     cannot drift from the inventory.

     Phase 2 stock is left out on purpose. An Unreleased bed is neither
     available nor reserved, and counting it would advertise stock nobody can
     book - see "Front-end rules for Phase 2 stock" in the CMS contract. So
     TOTAL means beds released for booking, and total = available + reserved
     always holds. Releasing Phase 2 moves those ten into the totals by itself.

     "Reserved" carries Reserved and Occupied together: both mean taken, and
     keeping them in one bucket is what makes the three numbers reconcile.     */
  var COUNTER = {
    totals_TotalBedsWrapper:          function ()  { return true; },
    totals_TotalBedsAvailableWrapper: function (s) { return s === SELECTABLE; },
    totals_TotalBedsReservedWrapper:  function (s) { return s !== SELECTABLE; }
  };

  /* ---------- the whole inventory ----------------------------------------
     The hotspot list is Finsweet-filtered and starts filtered to one
     apartment, so it can never answer "how many beds are there". A hidden
     Collection List of every CHS bed (data-chs="totals-source") does. Counts,
     facets and the gender lookup all read from here. If that list is ever
     removed, fall back to the union of beds seen since load - degraded, for
     the same reason, but better than nothing.                                */
  function tot(item, key) {
    var n = item.querySelector('[data-chs-total="' + key + '"]');
    return n ? n.textContent.trim() : '';
  }

  function inventory() {
    var items = $$('[data-chs="totals-source"] .w-dyn-item');
    if (items.length) {
      return items.map(function (it) {
        return {
          apartment: tot(it, 'apartment'),
          gender:    tot(it, 'gender'),
          phase:     tot(it, 'phase'),
          status:    tot(it, 'status')
        };
      });
    }
    return Object.keys(state.all).map(function (id) {
      var b = state.all[id];
      return { apartment: b.apartment, gender: b.gender, phase: b.phase, status: b.status };
    });
  }

  // What the filter chips are currently set to, read off the checked radios so
  // it is right even when the filter matches nothing and the list is empty.
  function activeFilters() {
    var out = {};
    $$('[fs-list-field]').forEach(function (i) {
      if (i.checked) out[i.getAttribute('fs-list-field')] = i.getAttribute('fs-list-value');
    });
    return out;
  }

  function apartmentGender(name) {
    var hit = inventory().filter(function (b) { return b.apartment === name; })[0];
    return hit ? hit.gender : '';
  }

  /* ---------- facet counts ------------------------------------------------
     Finsweet's own facet counts count every matching item, which meant a bed
     going Reserved left the chip counts untouched. These count only beds a
     student can actually book, so the chips are taken off Finsweet in the
     Designer (data-chs-facet-count instead of fs-list-element) and filled
     here. Standard facet semantics otherwise: a chip counts what you would
     get if you picked it, with the OTHER active chips still applied.        */
  function paintFacets() {
    var inv = inventory();
    if (!inv.length) return;
    var active = activeFilters();

    $$('[data-chs-facet-count]').forEach(function (out) {
      var input = out.parentElement && out.parentElement.querySelector('[fs-list-field]');
      if (!input) return;
      var field = input.getAttribute('fs-list-field');
      var value = input.getAttribute('fs-list-value');

      var n = inv.filter(function (b) {
        if (b.status !== SELECTABLE) return false;
        if (b[field] !== value) return false;
        for (var f in active) {
          if (f !== field && active[f] && b[f] !== active[f]) return false;
        }
        return true;
      }).length;

      // A chip whose whole apartment is still Phase 2 is "coming", not "0
      // left" - those read very differently to a student. Flag the chip and
      // leave the count blank; the Designer decides how "coming" looks.
      var chip = out.parentElement;
      var mine = inv.filter(function (b) { return b[field] === value; });
      var coming = mine.length > 0 && mine.every(function (b) { return b.status === UNRELEASED; });
      chip.classList.toggle(STATE_CLASS.unreleased, coming);
      var text = coming ? '' : String(n);
      if (out.textContent.trim() !== text) out.textContent = text;
    });
  }

  /* ---------- gender mismatch --------------------------------------------
     Picking a Male apartment while filtering for Female used to leave a blank
     plan and no floor labels. The plan now stays put, with the floor labels
     intact, behind a blurred overlay that says what happened.                */
  function paintBlock() {
    var box = $('[data-chs="plan-block"]');
    if (!box) return;
    var active = activeFilters();
    var wanted = active.gender;
    var apt    = active.apartment;
    var has    = apt ? apartmentGender(apt) : '';
    var clash  = !!(wanted && has && wanted !== has);

    if (clash) {
      var note = $('[data-chs-field="block-note"]', box);
      if (note) {
        note.textContent = 'This apartment is a ' + has + ' Apartment. ' +
                           'You\u2019re filtering for ' + wanted + ' Apartments.';
      }
    }
    box.classList.toggle(STATE_CLASS.shown, clash);
  }

  // Until the first booking, "0 Reserved" only says the place is empty, so
  // the third tile reads "Phase 1 / 20 beds" instead. The words live on the
  // element (data-chs-zero-number, data-chs-zero-text with {n} = released
  // beds), with these defaults. The tile's own label is kept on
  // data-chs-label and put back the moment something is reserved.
  function paintReservedTile(el, reserved, total) {
    var label = el.parentElement && el.parentElement.querySelector('.counter-text');
    if (!label) return false;
    if (!label.hasAttribute('data-chs-label')) label.setAttribute('data-chs-label', label.textContent.trim());
    if (reserved > 0) {
      var own = label.getAttribute('data-chs-label');
      if (label.textContent.trim() !== own) label.textContent = own;
      return false;
    }
    var num = el.getAttribute('data-chs-zero-number') || 'Phase 1';
    var txt = (el.getAttribute('data-chs-zero-text') || '{n} beds').replace('{n}', String(total));
    if (el.textContent.trim() !== num) el.textContent = num;
    if (label.textContent.trim() !== txt) label.textContent = txt;
    return true;
  }

  function paintTotals() {
    var released = inventory()
      .map(function (b) { return b.status; })
      .filter(function (s) { return s && s !== UNRELEASED; });
    // Nothing read yet - leave whatever the Designer holds rather than flash 0.
    if (!released.length) return;

    Object.keys(COUNTER).forEach(function (key) {
      var el = document.getElementById(key);
      if (!el) return;
      var n = released.filter(COUNTER[key]).length;
      if (key === 'totals_TotalBedsReservedWrapper' && paintReservedTile(el, n, released.length)) return;
      if (el.textContent.trim() !== String(n)) el.textContent = String(n);
    });
  }

  function paint() {
    state.beds.forEach(function (b) {
      var el = b.el;
      var on = visible(b);
      el.style.display = on ? '' : 'none';
      if (!on) return;

      var pos = place(b);
      if (!pos) return;                        // plans not measured yet
      el.style.left   = pos.left + '%';
      el.style.top    = pos.top + '%';
      el.style.width  = pos.width + '%';
      el.style.height = pos.height + '%';

      // price on the plot - full on desktop, "R 5,4k" on phones; the
      // stylesheet decides which of the two is visible per breakpoint
      $$('[data-chs-bed-rate]', el).forEach(function (r) {
        var v = r.getAttribute('data-chs-bed-rate') === 'short' ? shortRate(b.rate) : (b.rate || '');
        if (r.textContent !== v) r.textContent = v;
      });

      // state combo - remove all three, then add the one that applies
      el.classList.remove(STATE_CLASS.taken, STATE_CLASS.unreleased, STATE_CLASS.selected);
      var selectable = b.status === SELECTABLE;
      if (b.status === UNRELEASED)   el.classList.add(STATE_CLASS.unreleased);
      else if (!selectable)          el.classList.add(STATE_CLASS.taken);
      if (b.id === state.selectedId) el.classList.add(STATE_CLASS.selected);

      // a11y - the item is a link/div in Webflow, so give it button semantics
      el.setAttribute('data-bed-id', b.id);
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

    positionFloorLabels();
    paintPanelState(!!state.selectedId);
    paintRooms();
    paintFloorCounts();
    paintFacets();
    paintBlock();
    paintEmpty();
  }

  /* Floor captions sit inside the stage, pinned to the top of their band. */
  function positionFloorLabels() {
    $$('[data-chs-floorlabel]').forEach(function (el) {
      // On mobile these are static and sit above the plan in normal flow;
      // pinning a top would do nothing there, and clearing it keeps the
      // inline style from leaking back when the breakpoint changes.
      if (getComputedStyle(el).position !== 'absolute') { el.style.top = ''; return; }
      var box = planBox(el.getAttribute('data-chs-floorlabel'));
      if (box) el.style.top = box.top + '%';
    });
  }

  /* "R 5 400" -> "R 5,4k" for the phone-sized hotspots. Derived from the
     display string so there is still one price source; comma decimal because
     that is how rands are written here. Trailing ",0" drops ("R 5k").       */
  function shortRate(rate) {
    var n = parseInt(String(rate || '').replace(/\D/g, ''), 10);
    if (!n) return '';
    var k = (n / 1000).toFixed(1).replace(/\.0$/, '').replace('.', ',');
    return 'R\u00a0' + k + 'k';
  }

  function label(b) {
    var where = 'Apartment ' + apt(b.apartment) + ', ' + b.room + ', bed ' + b.num;
    if (b.status === UNRELEASED)  return where + ' \u2014 releasing in Phase 2, not yet available';
    if (b.status !== SELECTABLE)  return where + ' \u2014 already taken';
    return where + ', ' + b.rate + ' per month. Choose this bed.';
  }

  function apt(a) { return (a || '').replace(/^Apartment\s*/i, ''); }

  /* Counts are per floor, within the apartment on show. */
  function paintFloorCounts() {
    $$('[data-chs-floor-tab]').forEach(function (tab) {
      var key = tab.getAttribute('data-chs-floor-tab');
      var free = state.beds.filter(function (b) {
        return visible(b) && b.floor === key && b.status === SELECTABLE;
      }).length;
      var out = $('.chs_floors_count', tab);
      if (out) out.textContent = free === 0 ? 'none free' : free + ' free';
    });
  }

  function paintEmpty() {
    var box = $('[data-chs="empty"]');
    if (!box) return;
    // The mismatch overlay already explains an empty plan - don't say it twice.
    var blocked = !!$('[data-chs="plan-block"].' + STATE_CLASS.shown);
    box.style.display = (blocked || state.beds.some(visible)) ? 'none' : '';
  }

  /* ---------- selection -------------------------------------------------- */
  function select(id) {
    var bed = state.beds.filter(function (b) { return b.id === id; })[0];
    if (!bed || bed.status !== SELECTABLE) return;

    state.selectedId = id;
    state.beds.forEach(function (b) {
      b.el.classList.toggle(STATE_CLASS.selected, b.id === id);
    });
    if (bed.apartment !== state.apartment) setApartment(bed.apartment);

    fillPanel(bed);
    fillForm(bed);
    drawSnapshot(bed);

    var panel = $('[data-chs="detail-panel"]');
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      var u = new URL(window.location.href);
      u.searchParams.set('bed', bed.slug);
      history.replaceState(null, '', u);
    } catch (e) {}

    paintRooms();                              // lift the selected bed's room
    document.dispatchEvent(new CustomEvent('chs:bedSelected', { detail: bed }));
  }

  /* ---------- the card before anything is picked --------------------------
     The selection card is always on screen; only its contents swap. Before a
     bed is chosen it shows [data-chs="panel-empty"] and hides every
     [data-chs="panel-picked"] block - the head, the rows and the CTA. Both
     halves are Designer elements, so the copy is edited in Webflow, and this
     also clears a stale card when the chosen bed is filtered away.          */
  function paintPanelState(picked) {
    var p = $('[data-chs="detail-panel"]');
    if (!p) return;
    p.classList.add(STATE_CLASS.shown);
    $$('[data-chs="panel-empty"]', p).forEach(function (el) {
      el.classList.toggle(STATE_CLASS.hidden, !!picked);
    });
    $$('[data-chs="panel-picked"]', p).forEach(function (el) {
      el.classList.toggle(STATE_CLASS.hidden, !picked);
    });
    // The snapshot only means anything next to a chosen bed.
    var snap = $('[data-chs="snapshot"]');
    if (snap) snap.classList.toggle(STATE_CLASS.hidden, !picked);
  }

  function fillPanel(bed) {
    var p = $('[data-chs="detail-panel"]');
    if (!p) return;
    // display-name reads "Bed 2 \u00b7 South room". The card shows the bed on
    // one line and the room smaller underneath, so it is split here rather
    // than adding a second CMS field. bed-name still works if anything wants
    // the whole string.
    var half = String(bed.name || '').split('\u00b7');
    put(p, 'bed-name',  bed.name);
    put(p, 'bed-label', half[0].trim());
    put(p, 'bed-room',  half.length > 1 ? half.slice(1).join('\u00b7').trim() : '');
    put(p, 'apartment', bed.apartment);
    put(p, 'room',      bed.room);
    put(p, 'floor',     floorMeta(bed.floor).label);
    put(p, 'rate',      bed.rate);
    put(p, 'size',      bed.size ? bed.size + ' m²' : '');
    put(p, 'sharing',   bed.share === '1' ? 'Private room' : 'You would share with 1 other');
    put(p, 'gender',    bed.gender ? bed.gender + ' apartment' : '');
    paintPanelState(true);
  }

  /* "Reserve this bed" in the panel: bring the form up and put the cursor in
     the first field. The delay lets the smooth scroll land before focus, and
     preventScroll stops focus() from yanking the page a second time. */
  /* How much is covered by something pinned to the top of the window. The
     navbar is fixed, so scrolling the form flush to the viewport top hides
     its heading behind it. Anything explicitly marked wins; otherwise take
     the tallest fixed/sticky bar sitting at the top, ignoring full-height
     overlays like the page transition. */
  function topCover() {
    var marked = $('[data-chs="sticky-header"]');
    var bars = marked ? [marked] : $$('body *').filter(function (el) {
      var pos = getComputedStyle(el).position;
      return pos === 'fixed' || pos === 'sticky';
    });

    var cover = 0;
    bars.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (!r.height || r.height > window.innerHeight * 0.3) return;  // not a bar
      if (r.top > 2 || r.bottom <= 0) return;                        // not at the top
      if (r.bottom > cover) cover = r.bottom;
    });
    return cover;
  }

  function goToForm() {
    var form = $('[data-chs="reserve-form"]');
    if (!form) return;
    form.classList.add(STATE_CLASS.shown);
    var first = form.querySelector('input:not([type="hidden"]), select, textarea');

    // Reading the rect after the reveal forces layout, so this is the form's
    // real position. Leave the navbar's height plus a little air above it.
    var top = form.getBoundingClientRect().top + window.pageYOffset - topCover() - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

    setTimeout(function () {
      if (first) first.focus({ preventScroll: true });
    }, 450);
  }

  /* Which bed does this hotspot belong to? Matched by element identity - the
     ids live in the hidden CMS nodes, not in an attribute. */
  function bedFor(el) {
    return state.beds.filter(function (b) { return b.el === el; })[0] || null;
  }

  function put(root, field, val) {
    var el = $('[data-chs-field="' + field + '"]', root);
    if (el) el.textContent = val || '';
  }

  /* ---------- hand-off to the lease application ---------------------------
     After the reserve form posts (Webflow and Make untouched), the student
     goes on to the lease application with everything they have already
     told us, so that form opens filled in. Reads the reserve form's own
     inputs - the hidden ones fillForm() wrote and the four the student
     typed - so there is one source of truth. The destination lives on the
     form as data-chs-lease="/chs-lease-application"; no attribute, no
     hand-off, which is also the off switch.                                */
  function leaseUrl(form) {
    var path = form.getAttribute('data-chs-lease');
    if (!path) return '';
    var v = function (n) { var i = form.querySelector('[name="' + n + '"]'); return i ? String(i.value || '').trim() : ''; };
    var p = new URLSearchParams();
    var set = function (k, val) { if (val) p.set(k, val); };
    set('student-full-name',      (v('first-name') + ' ' + v('last-name')).trim());
    set('student-email',          v('email'));
    set('student-contact-number', v('contact-number'));
    set('unit-number',            v('unit-number'));   // the form field is unit-number (as on Glenwood)
    set('bed-number',             v('bed-number'));
    set('room-type',              v('room-type'));
    set('student-gender',         v('gender'));
    set('bed-price',              v('rate').replace(/\D/g, ''));
    set('bed-item-id',            v('bed-item-id'));
    set('bed-link',               v('bed-link'));
    var q = p.toString();
    return q ? path + '?' + q : path;
  }

  // The student never sees Webflow's "thank you" state: the form stays on
  // screen with the button reading "Submitting..." (dots cycling) until the
  // lease page takes over. Webflow itself swaps the button text and hides the
  // form on success, so both are reasserted the moment they change. Only a
  // failed post, or nothing happening for HANDOFF_TIMEOUT_MS, hands the button
  // back.
  var HANDOFF_TIMEOUT_MS = 15000;

  function submittingState(form) {
    var btn = form.querySelector('[type="submit"]');
    if (!btn) return { stop: function () {} };
    var isInput = btn.tagName === 'INPUT';
    var read = function () { return isInput ? btn.value : btn.textContent; };
    var write = function (t) { if (read() !== t) { if (isInput) btn.value = t; else btn.textContent = t; } };
    var original = read(), dots = 0, alive = true;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    var tick = function () {
      if (!alive) return;
      btn.disabled = true;                                  // Webflow re-enables it on its own
      write('Submitting' + new Array((dots % 3) + 2).join('.'));
      dots++;
    };
    tick();
    var timer = setInterval(tick, 350);
    return {
      stop: function () {
        if (!alive) return;
        alive = false; clearInterval(timer);
        btn.disabled = false; btn.removeAttribute('aria-busy');
        write(original);
      }
    };
  }

  function armHandoff(form) {
    if (!form || !form.getAttribute('data-chs-lease') || form.__chsHandoff) return;
    form.__chsHandoff = true;
    var wrap = form.closest ? form.closest('.w-form') : null;
    var done = wrap && wrap.querySelector('.w-form-done');
    var fail = wrap && wrap.querySelector('.w-form-fail');
    var state = null, timeout = null, leaving = false, target = '';
    // Webflow's own "wait" text, so its swap and ours read the same.
    var submit = form.querySelector('[type="submit"]');
    if (submit && !submit.getAttribute('data-wait')) submit.setAttribute('data-wait', 'Submitting...');

    function release() {
      clearTimeout(timeout); timeout = null;
      if (state) { state.stop(); state = null; }
    }
    function leave() {
      var url = target;
      if (leaving || !url) return;
      leaving = true;
      // Webflow has just hidden the form and shown its thank-you block - undo
      // that before the frame paints, then go.
      if (done) done.style.display = 'none';
      form.style.display = '';
      window.location.assign(url);
    }

    form.addEventListener('submit', function () {
      var url = leaseUrl(form);
      if (!url) return;
      // Webflow reads the redirect it cached at init, not the attribute -
      // update both, and watch the success message as a belt-and-braces.
      form.setAttribute('data-redirect', url);
      try { var wf = window.jQuery && window.jQuery.data(form, 'w-form'); if (wf) wf.redirect = url; } catch (e) {}
      target = url;
      release();
      state = submittingState(form);
      timeout = setTimeout(release, HANDOFF_TIMEOUT_MS);
      if (!window.MutationObserver) return;
      if (done && !form.__chsDoneWatch) {
        form.__chsDoneWatch = new MutationObserver(function () {
          if (done.offsetParent !== null || form.style.display === 'none') leave();
        });
        form.__chsDoneWatch.observe(done, { attributes: true, attributeFilter: ['style', 'class'] });
        form.__chsDoneWatch.observe(form, { attributes: true, attributeFilter: ['style'] });
      }
      if (fail && !form.__chsFailWatch) {
        form.__chsFailWatch = new MutationObserver(function () {
          if (fail.offsetParent !== null) release();
        });
        form.__chsFailWatch.observe(fail, { attributes: true, attributeFilter: ['style', 'class'] });
      }
    }, true);
  }

  /* ---------- form prefill ----------------------------------------------- */
  function fillForm(bed) {
    var form = $('[data-chs="reserve-form"]');
    if (!form) return;
    form.classList.add(STATE_CLASS.shown);       // hidden until a bed is chosen
    var vals = {
      'bed-item-id': bed.id,               // Make finds the CMS record on this
      'bed-name':    bed.name,
      'bed-number':  bed.num,
      'unit-number': bed.apartment,        // form field name matches Glenwood's
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

      state.beds.filter(function (b) { return b.floor === bed.floor && b.apartment === bed.apartment; })
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
    else img.addEventListener('load', draw, { once: true });   // lazy plan

    put(wrap, 'snap-bed', bed.name);
    put(wrap, 'snap-where', bed.apartment + ' · ' + floorMeta(bed.floor).label + ' · ' + bed.room);
    put(wrap, 'snap-rate', bed.rate + ' per month');
    wrap.classList.add(STATE_CLASS.shown);
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
    // Finsweet removes filtered-out items from the DOM, so the hero counters
    // count a union of every bed seen since load, not the current view.
    state.beds.forEach(function (b) { state.all[b.id] = b; });
    paintTotals();
    if (!state.bands) state.bands = measureBands();   // may still be null; remeasure() retries

    if (state.selectedId && !state.beds.some(function (b) { return b.id === state.selectedId; })) {
      state.selectedId = null;
    }

    // A checked apartment chip wins outright - it is what the student asked
    // for, even when the gender filter leaves it with no beds to show.
    var chosen = activeFilters().apartment;
    var present = apartmentsPresent();
    var want = chosen || (present.indexOf(state.apartment) === -1
      ? (present.length ? present[0] : null)
      : state.apartment);

    if (want !== state.apartment) { setApartment(want); }   // setApartment paints
    else { paint(); }
  }

  function deepLink() {
    var want = new URLSearchParams(window.location.search).get('bed');
    if (!want) return;
    var m = state.beds.filter(function (b) { return b.slug === want; })[0];
    if (m) select(m.id);
  }

  function init() {
    // Both floors are on screen at once, so the tabs are now jump links.
    $$('[data-chs-floor-tab]').forEach(function (tab) {
      tab.addEventListener('click', function (e) {
        e.preventDefault();
        var key = tab.getAttribute('data-chs-floor-tab');
        var target = $('[data-chs-floorlabel="' + key + '"]') || $('[data-chs-plan="' + key + '"]');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    // Delegated so it survives Finsweet re-rendering the list.
    document.addEventListener('click', function (e) {
      var t = e.target;
      var cta = t.closest ? t.closest('[data-chs="reserve-cta"]') : null;
      if (cta) { e.preventDefault(); goToForm(); return; }
      var item = t.closest ? t.closest('[data-chs="bed-item"]') : null;
      var bed  = item && bedFor(item);
      if (bed) { e.preventDefault(); select(bed.id); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var item = e.target.closest ? e.target.closest('[data-chs="bed-item"]') : null;
      var bed  = item && bedFor(item);
      if (bed) { e.preventDefault(); select(bed.id); }
    });

    // "Where it sits" collapses to its heading on phones. The stylesheet does
    // the hiding at the mobile breakpoint; here we only flip the class and
    // keep the ARIA state honest. On desktop the class is inert.
    var vt = $('[data-chs="view-toggle"]'), vb = $('[data-chs="view-body"]');
    if (vt && vb) {
      vt.setAttribute('role', 'button');
      vt.setAttribute('tabindex', '0');
      vt.setAttribute('aria-expanded', 'false');
      var flipView = function () {
        var open = !vt.classList.contains(STATE_CLASS.open);
        vt.classList.toggle(STATE_CLASS.open, open);
        vb.classList.toggle(STATE_CLASS.open, open);
        vt.setAttribute('aria-expanded', String(open));
      };
      vt.addEventListener('click', flipView);
      vt.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipView(); }
      });
    }

    armHandoff($('[data-chs="reserve-form"]'));

    // Both floors are always on screen now; clear any legacy inline hiding.
    $$('[data-chs-plan]').forEach(function (img) { img.style.display = ''; });

    // Render straight away - the plans may still be loading.
    refresh();
    deepLink();
    watchPlans(function () { remeasure(); positionFloorLabels(); paintRooms(); });
    window.addEventListener('resize', function () { remeasure(); positionFloorLabels(); paintRooms(); });


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

  window.CHSSelector = {
    refresh: refresh, select: select, setApartment: setApartment,
    apartments: apartmentsPresent, state: state
  };
})();
