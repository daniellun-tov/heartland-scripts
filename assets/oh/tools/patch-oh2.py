import re, sys
p = sys.argv[1]
s = open(p).read()

# ---- replace the zoom module wholesale ----
start = s.index('/* ============================================================\n   Site plan zoom')
end = s.index('/* ============================================================\n   Reservation flow - Xano hold')
ZOOM = r'''/* ============================================================
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
  /* width of the plan at zoom 1: fits the viewport with a little air */
  function measure() {
    var bw = box.clientWidth, bh = box.clientHeight;
    if (!bw || !bh) return;
    var r = ratio();
    baseW = Math.round(Math.min(bw * FIT, bh * FIT * r));
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
    var down = null, moved = false;
    box.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('.site-plan_zoom, .site-plan_floor-switch, .site-plan_badge, button')) return;
      down = { x: e.clientX, y: e.clientY, sl: box.scrollLeft, st: box.scrollTop, id: e.pointerId };
      moved = false;
    });
    box.addEventListener('pointermove', function (e) {
      if (!down) return;
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
    /* pinch on touch devices */
    var pinch = null;
    box.addEventListener('touchstart', function (e) { if (e.touches.length === 2) pinch = { d: dist(e), z: zoom, cx: mid(e).x, cy: mid(e).y }; }, { passive: true });
    box.addEventListener('touchmove', function (e) {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      var r = box.getBoundingClientRect(), m = mid(e);
      zoomAt(pinch.z * dist(e) / pinch.d, m.x - r.left, m.y - r.top);
    }, { passive: false });
    box.addEventListener('touchend', function () { pinch = null; }, { passive: true });
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
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { measure(); centre(); label(); }, 150);
    });
    if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(t); t = setTimeout(function () { measure(); centre(); }, 100); }).observe(box);
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


'''
s = s[:start] + ZOOM + s[end:]

# ---- layout prep: list as its own column, view class on the page wrap ----
old = """  var cb = document.querySelector('.site-plan_colourby');
  if (cb && !cb.querySelector('.site-plan_switch-label')) {"""
new = """  /* desktop: filters | plan | list - the list leaves .unit-filter_main so the
     component grid can give it its own column */
  var comp = document.querySelector('.unit-filter_component');
  var listWrap = document.querySelector('.site-plan_list-wrap');
  if (comp && listWrap && listWrap.parentNode !== comp) comp.appendChild(listWrap);
  var cb = document.querySelector('.site-plan_colourby');
  if (cb && !cb.querySelector('.site-plan_switch-label')) {"""
assert s.count(old) == 1; s = s.replace(old, new)

old = """      function setView(v) {
        component.classList.toggle('is-view-list', v === 'list');"""
new = """      function setView(v) {
        component.classList.toggle('is-view-list', v === 'list');
        var pw = document.querySelector('.page_wrap'); if (pw) pw.classList.toggle('is-view-list', v === 'list');
        if (v === 'map' && window.ohMapView) setTimeout(window.ohMapView.fit, 50);"""
assert s.count(old) == 1; s = s.replace(old, new)

# the old wrapper CSS hooks: nothing else references .site-plan_map-extension width expression
open(p, 'w').write(s)
print('ok')
