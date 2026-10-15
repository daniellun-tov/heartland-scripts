
/* ---------------------------------------------------------------------------
   Unit panel: the prototype's unit screens (15 Oct 2026).
   Fills the native pieces added to the panel in the Designer:
     [data-oh-native="topbar"]  back (data-close-detail), [data-oh-ud="title|meta"], share icon
                                ([data-oh-share] presses the panel's WhatsApp share button)
     [data-oh-ud="status"]      status badge on the gallery
     [data-oh-ud="dots"]        gallery dots on phones (cloned from the dot template); the stage swipes
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
    if (sz) parts.push(sz.inside + ' m² interior plus ' + (/^(8|11|18|8\d)$/.test(sz.patio) ? 'an ' : 'a ') + sz.patio + ' m² patio');
    if (of.pos && of.n) parts.push('position ' + of.pos + ' of ' + String(of.n).padStart(2, '0'));
    txt('[data-oh-ud="sub"]', parts.join(' · '));
    var o = ORIENT[(u.orientation || '').toUpperCase()] || '';
    txt('[data-oh-hl-t="facing"]', o ? o + ' facing' : 'Block ' + u.block_name);
    txt('[data-oh-hl-s="facing"]', floorWord(u) + (of.pos && of.n ? ', position ' + of.pos + ' of ' + String(of.n).padStart(2, '0') : '') + ' in Block ' + u.block_name + '.');
    var bay = u.parking_bay_number, kind = u.parking_bay_type;
    txt('[data-oh-hl-t="parking"]', bay ? (kind ? kind + ' parking, bay ' + bay : 'Parking bay ' + bay) : 'Parking');
    txt('[data-oh-hl-s="parking"]', (bay ? 'Included. ' : '') + 'Extra bays from R 200 000.');
    var levy = u.levy_display ? 'Est. levy ' + u.levy_display + ' pm' : '';
    txt('[data-oh-ud="terms"]', [levy, 'Occupation ' + OCCUPATION, 'Section 13sex applies'].filter(Boolean).join(' · '));
    syncPrice();
    mirror();
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

  /* ---- topbar title / meta and the status badge mirror the Wized-bound header ---- */
  function mirror() {
    var num = q('[wized="v2_udNumber"]'), meta = q('[wized="v2_udMeta"]'), st = q('[wized="v2_udStatus"]');
    var t = (num && num.textContent.trim()) || (cur ? 'Unit ' + cur.unit_number : '');
    txt('[data-oh-ud="title"]', t);
    txt('[data-oh-ud="meta"]', (meta && meta.textContent.trim()) || '');
    var badge = q('[data-oh-ud="status"]');
    if (badge) { var s = st ? st.textContent.trim() : ''; badge.textContent = s; badge.style.display = s ? '' : 'none'; }
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
    var phone = window.matchMedia('(max-width: 767px)').matches;
    cap.textContent = label + (n > 1 && !phone ? ' · ' + (i + 1) + ' of ' + n : '');
    dots(n, i);
    var btn = q('[data-oh-fpbtn]'); if (btn) btn.style.display = '';
  }

  /* ---- gallery dots (phones; the thumbs are hidden there) ---- */
  function dots(n, i) {
    var box = q('[data-oh-ud="dots"]'); if (!box) return;
    var tpl = box.querySelector('[data-oh-template="dot"]'); if (!tpl) return;
    tpl.style.display = 'none';
    var have = box.querySelectorAll('[data-oh-dot]');
    if (have.length !== n) {
      have.forEach(function (d) { d.remove(); });
      for (var k = 0; k < n; k++) { var d = tpl.cloneNode(true); d.removeAttribute('data-oh-template'); d.setAttribute('data-oh-dot', k); d.style.display = ''; box.appendChild(d); }
    }
    box.style.visibility = n > 1 ? '' : 'hidden';
    box.querySelectorAll('[data-oh-dot]').forEach(function (d, k) { d.classList.toggle('is-current', k === i); });
  }

  /* ---- swipe the gallery: drag the picture, let go past 50 px to step (the v1 gallery
     only knows thumb clicks, so a step presses the next thumb) ---- */
  var swiped = 0;
  function swipe(stage) {
    var x0 = null, y0 = 0, dx = 0, lock = null;
    function media() { return stage.querySelector('.ud-media'); }
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; lock = null;
    }, { passive: true });
    stage.addEventListener('touchmove', function (e) {
      if (x0 === null) return;
      var mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (lock === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) lock = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (lock !== 'x') return;
      dx = mx; stage.classList.add('is-oh-drag');
      var m = media(); if (m) m.style.transform = 'translateX(' + dx + 'px)';
    }, { passive: true });
    function end() {
      if (x0 === null) return;
      x0 = null; stage.classList.remove('is-oh-drag');
      var m = media();
      var thumbs = document.querySelectorAll('[data-gallery="thumbs"] [data-thumb]');
      if (lock === 'x' && Math.abs(dx) > 50 && thumbs.length > 1) {
        var i = 0; thumbs.forEach(function (t, k) { if (t.classList.contains('is-current')) i = k; });
        var j = (i + (dx < 0 ? 1 : -1) + thumbs.length) % thumbs.length;
        swiped = Date.now();
        thumbs[j].click();
        var n = media(); if (n) { n.style.transition = 'none'; n.style.transform = 'translateX(' + (dx < 0 ? 40 : -40) + 'px)'; n.getBoundingClientRect(); n.style.transition = ''; n.style.transform = ''; }
      } else if (m) { m.style.transform = ''; if (lock === 'x') swiped = Date.now(); }
      lock = null;
    }
    stage.addEventListener('touchend', end);
    stage.addEventListener('touchcancel', end);
  }

  /* ---- "Where you'll be": expand buttons on the two figures ---- */
  var EXPAND = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/></svg>';
  function expanders() {
    var box = q('.ud-block'); if (!box) return;
    /* only the estate figure opens something (Daniel, 16 Oct): the floor figure is a picture */
    box.querySelectorAll('.ud-block_fig[data-block-fig="estate"]').forEach(function (fig) {
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
      /* the panel is the scroller the screen sits in: park it at the top and freeze it
         while the screen is up, then put the reader back where they were */
      var aside = s.closest('.site-plan_detail-panel');
      if (aside && !s.classList.contains('is-open')) { s._scroll = aside.scrollTop; aside.scrollTop = 0; aside.classList.add('is-oh-es'); }
      s.classList.add('is-open'); s.style.display = 'flex'; s.scrollTop = 0;
      var b = s.querySelector('[data-oh-es-back]'); if (b) b.focus({ preventScroll: true });
    } else {
      var wasOpen = s.classList.contains('is-open');
      s.classList.remove('is-open'); s.style.display = '';
      var host = s.closest('.site-plan_detail-panel');
      if (host) { host.classList.remove('is-oh-es'); if (wasOpen && s._scroll) host.scrollTop = s._scroll; }
    }
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
  document.addEventListener('oh:unit-close', function () { cur = null; estateScreen(false); shareMenu(false); });
  document.addEventListener('click', function (e) {
    /* a swipe ends in a click: do not let it open the lightbox */
    if (swiped && Date.now() - swiped < 400 && e.target.closest && e.target.closest('[data-gallery="stage"]')) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    var back = e.target.closest && e.target.closest('a[data-close-detail]');
    if (back) { e.preventDefault(); return; }   /* the plan module closes the panel */
    var sh = e.target.closest && e.target.closest('[data-oh-share]');
    if (sh) { e.preventDefault(); e.stopImmediatePropagation(); share(); return; }
    var via = e.target.closest && e.target.closest('[data-oh-share-via]');
    if (via) { shareVia(via, e); return; }
    if (!(e.target.closest && e.target.closest('[data-oh-native="share"]'))) shareMenu(false);
    var t = e.target.closest && e.target.closest('[data-oh-fpbtn], .ud-block_expand, .ud-block_fig[data-block-fig="estate"], [data-oh-es-back], [data-oh-es-tab], [data-oh-es-reserve]');
    if (!t || !cur) return;
    e.preventDefault();
    if (t.hasAttribute('data-oh-fpbtn')) {
      e.stopImmediatePropagation();
      if (window.ohPlans) window.ohPlans.open(cur.type_code, 'plan', {
        title: 'Floor plan', sub: ['Unit ' + cur.unit_number, 'Type ' + cur.type_code, cur.unit_size ? Math.round(cur.unit_size) + ' m²' : ''].filter(Boolean).join(' · '),
        cap: ['Type ' + cur.type_code, cur.unit_size ? Math.round(cur.unit_size) + ' m²' : '', ORIENT[(cur.orientation || '').toUpperCase()] ? ORIENT[cur.orientation.toUpperCase()].toLowerCase() + ' facing' : ''].filter(Boolean).join(' · ')
      });
      return;
    }
    if (t.classList.contains('ud-block_expand') || t.classList.contains('ud-block_fig')) {
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
  /* ---- share: the system share sheet on phones, a small menu (email, WhatsApp, copy link) elsewhere ---- */
  function shareData() {
    var url = location.origin + location.pathname + (cur ? '?unit=' + encodeURIComponent(cur.unit_number) : '');
    var title = cur ? 'Oakhills Estate · Unit ' + cur.unit_number : 'Oakhills Estate';
    var text = cur ? 'Unit ' + cur.unit_number + ' at Oakhills Estate, Stellenbosch (Block ' + cur.block_name + ', ' + (cur.floor_label || '') + ' floor, Type ' + cur.type_code + ')' : 'Oakhills Estate, Stellenbosch';
    return { url: url, title: title, text: text };
  }
  function shareMenu(on) {
    var m = q('[data-oh-native="share"]'); if (!m) return;
    m.classList.toggle('is-open', !!on);
    var b = q('[data-oh-share]'); if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (!on) { var c = m.querySelector('[data-oh-share-copied]'); if (c) c.textContent = 'Copy link'; }
  }
  function share() {
    var d = shareData();
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      navigator.share({ title: d.title, text: d.text, url: d.url }).catch(function () {});
      return;
    }
    var m = q('[data-oh-native="share"]'); if (!m) return;
    m.querySelector('[data-oh-share-via="email"]').setAttribute('href', 'mailto:?subject=' + encodeURIComponent(d.title) + '&body=' + encodeURIComponent(d.text + '\n\n' + d.url));
    var wa = m.querySelector('[data-oh-share-via="whatsapp"]');
    wa.setAttribute('href', 'https://wa.me/?text=' + encodeURIComponent(d.text + ' ' + d.url)); wa.setAttribute('target', '_blank'); wa.setAttribute('rel', 'noopener');
    shareMenu(!m.classList.contains('is-open'));
  }
  function shareVia(el, e) {
    var how = el.getAttribute('data-oh-share-via');
    if (how === 'copy') {
      e.preventDefault();
      var d = shareData(), lab = el.querySelector('[data-oh-share-copied]');
      var done = function () { if (lab) lab.textContent = 'Link copied'; setTimeout(function () { shareMenu(false); }, 1200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(d.url).then(done, function () { window.prompt('Copy this link', d.url); });
      else { window.prompt('Copy this link', d.url); }
      return;
    }
    setTimeout(function () { shareMenu(false); }, 50);   /* email / WhatsApp: let the link open */
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { var sm = q('[data-oh-native="share"].is-open'); if (sm) { e.stopImmediatePropagation(); shareMenu(false); return; } }
    if (e.key !== 'Escape') return;
    var s = q('[data-oh-native="estate-screen"]'); if (s && s.classList.contains('is-open')) { e.stopImmediatePropagation(); estateScreen(false); }
  }, true);
  /* the gallery re-renders its stage on every thumb tap: follow it */
  function watch() {
    var stage = q('[data-gallery="stage"]'); if (!stage) { setTimeout(watch, 300); return; }
    new MutationObserver(function () { if (cur) caption(); }).observe(stage, { childList: true });
    var price = q('[wized="v2_udPrice"]'); if (price) new MutationObserver(syncPrice).observe(price, { childList: true, characterData: true, subtree: true });
    ['v2_udNumber', 'v2_udMeta', 'v2_udStatus'].forEach(function (k) { var el = q('[wized="' + k + '"]'); if (el) new MutationObserver(mirror).observe(el, { childList: true, characterData: true, subtree: true }); });
    swipe(stage);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  window.ohUnitScreens = { estate: estateScreen, amenity: amenity, current: function () { return cur; } };
})();
