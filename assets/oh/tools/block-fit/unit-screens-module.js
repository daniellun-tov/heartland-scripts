
/* ---------------------------------------------------------------------------
   Unit panel: the prototype's unit screens (15 Oct 2026).
   Fills the native pieces added to the panel in the Designer:
     [data-oh-fpbtn]            floor plan pill on the hero (opens the viewer)
     [data-oh-ud="cap"]         hero caption pill
     [data-oh-ud="sub"]         "75 m2 interior plus an 11 m2 patio · position 06 of 07"
     [data-oh-native="hls"]     facing / lift and fibre / parking rows
     [data-oh-ud="terms"]       levy · occupation · Section 13sex
     [data-oh-native="pricebar"] price in the sticky action bar
     [data-oh-native="estate-screen"]  "On the estate": the clubhouse walk, amenities, distances
   and adds an expand button to the two "Where you'll be" figures (the floor of
   the block opens the block view on that floor, the estate opens the screen).
--------------------------------------------------------------------------- */
(function () {
  var q = function (s, r) { return (r || document).querySelector(s); };
  var ESTATE_IMG = 'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/6ad07dd846fd3fd8d358d1ff_img-3d-estate-render-v2.webp';
  var CLUB = { x: 405, y: 362 };                 /* the clubhouse on the 1110x706 estate frame */
  var OCCUPATION = 'Feb 2027';
  var ORIENT = { N: 'North', NE: 'North-east', E: 'East', SE: 'South-east', S: 'South', SW: 'South-west', W: 'West', NW: 'North-west' };
  var ORD = { 1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', 5: 'Fifth' };
  var CDN = 'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/';
  var AMENITIES = {
    deli: { img: CDN + '6ad09a8eb679a54cbe8d1ffa_oh-amenity-deli.webp', alt: 'The deli in the clubhouse', h: 'The deli, in the clubhouse',
      p: 'Gourmet treats, fresh locally sourced ingredients and proper coffee, a short walk from your own front door rather than a drive into town.' },
    gym: { img: CDN + '6ad09a8de4d21b81a7923878_oh-amenity-gym.webp', alt: 'The gym in the clubhouse', h: 'The gym, in the clubhouse',
      p: 'A fully equipped gym inside the clubhouse: cardio, weights and space to stretch, open to residents every day without a membership or a drive.' },
    cowork: { img: CDN + '6ad09a8d65681c6e1919a365_oh-amenity-coworking.webp', alt: 'The co-working lounge in the clubhouse', h: 'Co-working, in the clubhouse',
      p: 'A quiet, connected lounge with fibre and good coffee next door, for the days you work from the estate instead of commuting into Stellenbosch.' },
    security: { img: CDN + '69d5fe15f421c777840831c4_img-why-oakhills-safety-security.webp', alt: 'The gatehouse at Oakhills', h: 'Secure, from the gate to your door',
      p: 'A manned gatehouse, perimeter security and access control across the estate, so the clubhouse, the lawns and your block are for residents and their guests.' }
  };
  var cur = null;

  function units() { return (window.ohSitePlan && window.ohSitePlan.units && window.ohSitePlan.units()) || []; }
  function txt(sel, s, root) { var el = q(sel, root); if (el && el.textContent !== s) el.textContent = s; }
  function interior(u) {
    var m = /(\d+)\s*m²\s*of interior space and a\s*(\d+)\s*m²\s*patio/i.exec(u.description || '');
    return m ? { inside: m[1], patio: m[2] } : null;
  }
  function onFloor(u) {
    var n = units().filter(function (x) { return x.block_name === u.block_name && x.floor_level === u.floor_level; }).length;
    return { pos: u.onfloor_label || '', n: n };
  }
  function floorWord(u) { return (ORD[u.floor_level] || u.floor_label || '') + ' floor'; }

  /* ---- fill the panel ---- */
  function fill(u) {
    cur = u || null; if (!u) return;
    var sz = interior(u), of = onFloor(u);
    var parts = [];
    if (sz) parts.push(sz.inside + ' m² interior plus ' + (/^[aeiou8]/i.test(sz.patio) ? 'an ' : 'a ') + sz.patio + ' m² patio');
    if (of.pos && of.n) parts.push('position ' + of.pos + ' of ' + String(of.n).padStart(2, '0'));
    txt('[data-oh-ud="sub"]', parts.join(' · '));
    var o = ORIENT[(u.orientation || '').toUpperCase()] || '';
    txt('[data-oh-hl-t="facing"]', o ? o + ' facing' : 'Block ' + u.block_name);
    txt('[data-oh-hl-s="facing"]', floorWord(u) + (of.pos && of.n ? ', position ' + of.pos + ' of ' + String(of.n).padStart(2, '0') : '') + ' in Block ' + u.block_name + '.');
    var bay = u.parking_bay_number, kind = u.parking_bay_type;
    txt('[data-oh-hl-t="parking"]', bay ? (kind ? kind + ' parking, bay ' + bay : 'Parking bay ' + bay) : 'Parking');
    txt('[data-oh-hl-s="parking"]', (bay ? 'Included. ' : '') + 'Extra bays from R 200 000.');
    var levy = u.levy_display ? 'Levy ' + u.levy_display + ' pm' : '';
    txt('[data-oh-ud="terms"]', [levy, 'Occupation ' + OCCUPATION, 'Section 13sex applies'].filter(Boolean).join(' · '));
    syncPrice();
    caption();
    expanders();
    estateScreen(false);
  }
  function syncPrice() {
    var src = q('[wized="v2_udPrice"]'), bar = q('[data-oh-native="pricebar"]');
    if (!src || !bar) return;
    var hidden = cur && cur.prices_hidden;
    txt('[data-oh-ud="price"]', src.textContent.trim() || (cur && cur.price_display) || '');
    txt('[data-oh-ud="price-sub"]', hidden ? '' : 'incl. VAT · no transfer duty');
  }

  /* ---- hero caption follows the gallery ---- */
  function caption() {
    var cap = q('[data-oh-ud="cap"]'); if (!cap || !cur) return;
    var stage = q('[data-gallery="stage"]');
    var media = stage && stage.querySelector('.ud-media');
    var thumbs = document.querySelectorAll('[data-gallery="thumbs"] [data-thumb]');
    var i = 0, n = thumbs.length;
    thumbs.forEach(function (t, k) { if (t.classList.contains('is-current')) i = k; });
    var isVideo = media && media.tagName !== 'IMG';
    var label = isVideo ? 'Flythrough · Type ' + cur.type_code : 'Type ' + cur.type_code + ' render';
    cap.textContent = label + (n > 1 ? ' · ' + (i + 1) + ' of ' + n : '');
    var btn = q('[data-oh-fpbtn]'); if (btn) btn.style.display = '';
  }

  /* ---- "Where you'll be": expand buttons on the two figures ---- */
  var EXPAND = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/></svg>';
  function expanders() {
    var box = q('.ud-block'); if (!box) return;
    box.querySelectorAll('.ud-block_fig').forEach(function (fig) {
      if (fig.querySelector('.ud-block_expand')) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ud-block_expand'; b.innerHTML = EXPAND;
      b.setAttribute('aria-label', fig.getAttribute('data-block-fig') === 'estate' ? 'See the block on the estate' : 'Open this floor in the block view');
      fig.querySelector('.ud-block_stack').appendChild(b);
    });
    /* the estate figure: the new render with the block outlined from the shared geometry,
       instead of the v1 highlight png (drawn on a different camera) */
    var est = box.querySelector('[data-block-fig="estate"]');
    if (est && cur) {
      var base = est.querySelector('.ud-block_base'), png = est.querySelector('.ud-block_overlay');
      if (base && base.getAttribute('src') !== ESTATE_IMG) base.src = ESTATE_IMG;
      if (png) png.style.display = 'none';
      var svg = est.querySelector('svg.ud-block_outline');
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'ud-block_outline'); svg.setAttribute('viewBox', '0 0 1110 706'); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.innerHTML = '<path fill="#af6042" fill-opacity=".4" stroke="#af6042" stroke-width="3" stroke-linejoin="round"/>';
        est.querySelector('.ud-block_stack').appendChild(svg);
      }
      svg.querySelector('path').setAttribute('d', pathFor(cur.block_name));
    }
  }
  function pathFor(name) {
    var g = window.ohBlockView && window.ohBlockView.geo; var d = g && g.estate && g.estate.paths && g.estate.paths[name];
    if (d) return d;
    var p = document.querySelector('.oh-estate_block[data-block="' + name + '"]');
    return p ? p.getAttribute('d') : '';
  }
  function centroid(d) {
    var nums = (d.match(/-?\d+\.?\d*/g) || []).map(Number); var xs = [], ys = [];
    for (var i = 0; i + 1 < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
    if (!xs.length) return null;
    return { x: xs.reduce(function (a, b) { return a + b; }) / xs.length, y: ys.reduce(function (a, b) { return a + b; }) / ys.length };
  }

  /* ---- "On the estate" screen ---- */
  function estateScreen(on) {
    var s = q('[data-oh-native="estate-screen"]'); if (!s) return;
    if (on && cur) {
      txt('[data-oh-es="title"]', 'Unit ' + cur.unit_number, s);
      txt('[data-oh-es="sub"]', 'Block ' + cur.block_name + ' on the estate', s);
      var d = pathFor(cur.block_name), c = centroid(d) || CLUB;
      var block = s.querySelector('[data-oh-es="block"]'), walk = s.querySelector('[data-oh-es="walk"]');
      if (block) block.setAttribute('d', d);
      var door = s.querySelector('[data-oh-es="pin-door"]'), club = s.querySelector('[data-oh-es="pin-club"]');
      if (door) door.setAttribute('transform', 'translate(' + c.x.toFixed(1) + ' ' + c.y.toFixed(1) + ')');
      if (club) club.setAttribute('transform', 'translate(' + CLUB.x + ' ' + CLUB.y + ')');
      if (walk) { var mx = (c.x + CLUB.x) / 2, my = (c.y + CLUB.y) / 2 + 30; walk.setAttribute('d', 'M' + c.x.toFixed(1) + ' ' + c.y.toFixed(1) + ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + CLUB.x + ' ' + CLUB.y); }
      /* the label of whichever pin sits to the right would run off the frame: flip it */
      [door, club].forEach(function (pin, i) {
        if (!pin) return; var x = i ? CLUB.x : c.x; var lab = pin.querySelector('rect:nth-of-type(2)'), t = pin.querySelector('text');
        var w = Number(lab.getAttribute('width')); var right = x + 34 + w > 1090;
        lab.setAttribute('x', right ? -34 - w : 34); t.setAttribute('x', right ? -34 - w / 2 : 34 + w / 2);
      });
      amenity(s.querySelector('[data-oh-es-tab].is-active') ? s.querySelector('[data-oh-es-tab].is-active').getAttribute('data-oh-es-tab') : 'deli');
      s.classList.add('is-open'); s.style.display = 'flex'; s.scrollTop = 0;
      var b = s.querySelector('[data-oh-es-back]'); if (b) b.focus({ preventScroll: true });
    } else { s.classList.remove('is-open'); s.style.display = ''; }
  }
  function amenity(key) {
    var s = q('[data-oh-native="estate-screen"]'), a = AMENITIES[key]; if (!s || !a) return;
    s.querySelectorAll('[data-oh-es-tab]').forEach(function (t) { var on = t.getAttribute('data-oh-es-tab') === key; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
    var img = s.querySelector('[data-oh-es="img"]');
    if (img && img.getAttribute('src') !== a.img) { img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.src = a.img; img.alt = a.alt; }
    txt('[data-oh-es="h"]', a.h, s); txt('[data-oh-es="p"]', a.p, s);
  }

  /* ---- wiring ---- */
  document.addEventListener('oh:unit-open', function (e) { fill(e.detail && e.detail.unit); setTimeout(syncPrice, 50); setTimeout(syncPrice, 400); });
  document.addEventListener('oh:unit-close', function () { cur = null; estateScreen(false); });
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-oh-fpbtn], .ud-block_expand, [data-oh-es-back], [data-oh-es-tab], [data-oh-es-reserve]');
    if (!t || !cur) return;
    e.preventDefault();
    if (t.hasAttribute('data-oh-fpbtn')) {
      e.stopImmediatePropagation();
      if (window.ohPlans) window.ohPlans.open(cur.type_code, '3d', {
        title: 'Unit ' + cur.unit_number, sub: 'Block ' + cur.block_name + ' · ' + (cur.floor_label || '') + ' floor · Type ' + cur.type_code,
        cap: ['Type ' + cur.type_code, cur.unit_size ? Math.round(cur.unit_size) + ' m²' : '', ORIENT[(cur.orientation || '').toUpperCase()] ? ORIENT[cur.orientation.toUpperCase()].toLowerCase() + ' facing' : ''].filter(Boolean).join(' · ')
      });
      return;
    }
    if (t.classList.contains('ud-block_expand')) {
      e.stopImmediatePropagation();
      var fig = t.closest('.ud-block_fig');
      if (fig.getAttribute('data-block-fig') === 'estate') { estateScreen(true); return; }
      if (window.ohBlockView) {
        if (window.matchMedia('(max-width: 991px)').matches && window.ohSitePlan) window.ohSitePlan.close();
        window.ohBlockView.open(cur.block_name, { floor: String(cur.floor_level) });
      }
      return;
    }
    if (t.hasAttribute('data-oh-es-back')) { estateScreen(false); return; }
    if (t.hasAttribute('data-oh-es-tab')) { amenity(t.getAttribute('data-oh-es-tab')); return; }
    if (t.hasAttribute('data-oh-es-reserve')) {
      estateScreen(false);
      var r = q('[data-actionbar-reserve] a, [wized="v2_udReserveBtn"]'); if (r) r.click();
    }
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var s = q('[data-oh-native="estate-screen"]'); if (s && s.classList.contains('is-open')) { e.stopImmediatePropagation(); estateScreen(false); }
  }, true);
  /* the gallery re-renders its stage on every thumb tap: follow it */
  function watch() {
    var stage = q('[data-gallery="stage"]'); if (!stage) { setTimeout(watch, 300); return; }
    new MutationObserver(function () { if (cur) caption(); }).observe(stage, { childList: true });
    var price = q('[wized="v2_udPrice"]'); if (price) new MutationObserver(syncPrice).observe(price, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  window.ohUnitScreens = { estate: estateScreen, amenity: amenity };
})();
