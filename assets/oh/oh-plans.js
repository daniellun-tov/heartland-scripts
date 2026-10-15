/* ============================================================
   Oak Hills - floor plan viewer (15 Oct 2026)
   Full-screen viewer for a unit type's floor plan: a 3D render and the
   architect's line drawing, each downloadable, plus the PDF. The markup is
   native Webflow on the page ([data-oh-native="fpv"], classes oh-fpv*); this
   file only adds the behaviour and knows which files belong to which type.
   Loaded on the home page (Unit Types section) and on /unit-selection (unit panel).

   window.ohPlans.open('B')            opens Type B on the plan (line drawing)
   window.ohPlans.open('A', '3d')      opens Type A on the furnished 3D view
   The viewer sits above everything, the unit side panel included (z-index in the Designer).
   window.ohPlans.close()
   ============================================================ */
(function () {
  if (window.ohPlans) return;
  var CDN = 'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/';
  var TYPES = {
    A: { title: 'Unit Type A', sub: '2 Bed · 2 Bath · 86 m²', cap: 'Type A · 86 m²',
         inside: ['2 bedrooms, each en-suite', 'Open-plan kitchen and living', 'Covered patio off the living room', '75 m² inside · 11 m² patio'],
         img3d: CDN + '6ad07ff382ff418bc8a83fb2_fp-3d-type-a.webp', plan: CDN + '6ad07ff391bbc53a819106db_fp-plan-type-a.webp', pdf: CDN + '6ad07ff499389820bad624ce_fp-plan-type-a.pdf' },
    B: { title: 'Unit Type B', sub: '2 Bed · 1 Bath · 48 to 56 m²', cap: 'Type B · 48 to 56 m²',
         inside: ['2 bedrooms', 'One bathroom', 'Open-plan kitchen and living', 'Covered patio'],
         img3d: CDN + '6ad07ff39e049abd51fb26d5_fp-3d-type-b.webp', plan: CDN + '6ad07ff38da42671bcc98522_fp-plan-type-b.webp', pdf: CDN + '6ad07ff499389820bad624e0_fp-plan-type-b.pdf' },
    C: { title: 'Unit Type C', sub: '1 Bed · 1 Bath · 36 to 49 m²', cap: 'Type C · 36 to 49 m²',
         inside: ['1 bedroom', 'One bathroom', 'Open-plan kitchen and living', 'Covered patio'],
         img3d: CDN + '6ad07ff334cd061e3b235611_fp-3d-type-c.webp', plan: CDN + '6ad07ff498236f8193eecde9_fp-plan-type-c.webp', pdf: CDN + '6ad07ff49479985a2b086b73_fp-plan-type-c.pdf' }
  };
  var root = null, cur = null, view = 'plan', lastFocus = null, scrollY = 0;

  function q(s, r) { return (r || root).querySelector(s); }
  function el() {
    if (root) return root;
    root = document.querySelector('[data-oh-native="fpv"]');
    if (!root) { console.warn('[plans] native floor plan viewer missing on the page'); return null; }
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-oh-fpv-close], [data-oh-fpv-view], [data-oh-fpv-dl]');
      if (!t) return;
      e.preventDefault();
      if (t.hasAttribute('data-oh-fpv-close')) return close();
      if (t.hasAttribute('data-oh-fpv-view')) return show(t.getAttribute('data-oh-fpv-view'));
      download(t.getAttribute('data-oh-fpv-dl'));
    });
    /* capture + stop: Escape closes the viewer only, not the unit panel underneath */
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('is-open')) { e.stopImmediatePropagation(); e.preventDefault(); close(); } }, true);
    return root;
  }
  function letter(x) {
    var m = /([ABC])\b/i.exec(String(x || '')); return m ? m[1].toUpperCase() : null;
  }
  function open(type, which, extra) {
    var k = letter(type); var d = k && TYPES[k]; if (!d || !el()) return false;
    cur = d;
    q('.oh-fpv_title').textContent = (extra && extra.title) || d.title;
    q('.oh-fpv_sub').textContent = (extra && extra.sub) || d.sub;
    var cap = q('[data-oh-fpv="cap"]'); if (cap) cap.textContent = (extra && extra.cap) || d.cap || '';
    var grid = q('[data-oh-fpv="inside-grid"]');
    if (grid) {
      var items = (extra && extra.inside) || d.inside || [];
      Array.prototype.forEach.call(grid.children, function (el, i) { el.textContent = items[i] || ''; el.style.display = items[i] ? '' : 'none'; });
    }
    var note = q('[data-oh-fpv="note"]'); if (note) note.textContent = 'Plan as drawn for Type ' + k + '. Measurements are approximate and finishes may differ.';
    show(which === '3d' ? '3d' : 'plan');
    lastFocus = document.activeElement;
    scrollY = window.pageYOffset || 0;
    root.classList.add('is-open');
    document.documentElement.classList.add('oh-fpv-open');
    root.setAttribute('aria-label', d.title + ' floor plan');
    var c = q('.oh-fpv_close'); if (c) c.focus({ preventScroll: true, focusVisible: false });
    return true;
  }
  function show(which) {
    if (!cur) return;
    view = which;
    var img = q('.oh-fpv_img');
    var src = which === 'plan' ? cur.plan : cur.img3d;
    if (img.getAttribute('src') !== src) { img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.src = src; }
    img.alt = cur.title + (which === 'plan' ? ' line drawing' : ' 3D floor plan');
    root.querySelectorAll('[data-oh-fpv-view]').forEach(function (t) {
      var on = t.getAttribute('data-oh-fpv-view') === which;
      t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var pdf = q('[data-oh-fpv-dl="pdf"]'); if (pdf) { pdf.setAttribute('href', cur.pdf); pdf.setAttribute('download', fileName('pdf')); pdf.setAttribute('target', '_blank'); pdf.setAttribute('rel', 'noopener'); }
    /* one download button (Daniel, 16 Oct): the plan as the architect's PDF, or the furnished 3D image */
    var im = q('[data-oh-fpv-dl="image"]');
    if (im) {
      im.setAttribute('href', which === 'plan' ? cur.pdf : src);
      var lab = im.querySelector('[data-oh-fpv-label]') || im.lastElementChild;
      if (lab) lab.textContent = which === 'plan' ? 'Download floor plan' : 'Download 3D floor plan';
    }
  }
  function fileName(ext) {
    return 'Oakhills ' + cur.title + (ext === 'pdf' ? ' floor plan.pdf' : (view === 'plan' ? ' line drawing' : ' 3D floor plan') + '.' + ext);
  }
  function download(kind) {
    if (!cur) return;
    if (kind !== 'pdf' && view === 'plan') kind = 'pdf';   /* the single button: plan = PDF */
    var url = kind === 'pdf' ? cur.pdf : (view === 'plan' ? cur.plan : cur.img3d);
    var name = fileName(kind === 'pdf' ? 'pdf' : 'webp');
    /* the files live on the Webflow CDN (another origin), so a plain download
       attribute would just open them: pull the bytes and save */
    fetch(url, { mode: 'cors' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }).catch(function () { window.open(url, '_blank', 'noopener'); });
  }
  function close() {
    if (!root) return;
    root.classList.remove('is-open');
    document.documentElement.classList.remove('oh-fpv-open');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }
  window.ohPlans = { open: open, close: close, show: show, types: TYPES, letter: letter };

  /* /unit-selection: the unit panel's floor plan tiles open the viewer on the unit's type */
  document.addEventListener('click', function (e) {
    var tile = e.target.closest('.unit-details_fp');
    if (!tile) return;
    var typeEl = document.querySelector('[wized="v2_udType"]');
    var k = letter(typeEl && typeEl.textContent);
    if (!k) return;
    var cap = (tile.querySelector('.unit-details_fp-caption') || {}).textContent || '';
    var num = document.querySelector('[wized="v2_udNumber"]');
    var size = document.querySelector('[wized="v2_udSize"]');
    var sub = [num ? num.textContent.trim() : '', 'Type ' + k, size ? size.textContent.trim() : ''].filter(Boolean).join(' · ');
    if (open(k, /render/i.test(cap) ? '3d' : 'plan', { title: 'Floor plan', sub: sub })) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
})();
