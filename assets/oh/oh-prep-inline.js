/* ============================================================
   Page prep (runs at load; the script is deferred so the DOM is parsed)
   - .unit-filter_map: a positioned wrapper around the scrolling map box so
     the level switcher and zoom controls can pin to its corners. Built here
     if the Designer does not have one.
   - "Floor" -> "Level" in the few Designer labels that are plain blocks.
   ============================================================ */
(function () {
  if (window.ohPrepDone) return; window.ohPrepDone = true;
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
  var cb = document.querySelector('.site-plan_toolbar .site-plan_colourby:not(.oh-viewswitch)');
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
  /* 16 Oct (page speed): this module may now run inline, before the rest of the bundle. Give the plan
     its final size and position straight away (the same maths as the viewport module's measure() and
     centre(), which re-run later and land on the same numbers), and on phones set the 3D landing
     class the block view will set, so the page does not move when the bundle takes over. */
  (function prefit() {
    var root = document.documentElement, q = location.search;
    var phone = window.matchMedia('(max-width: 991px)').matches;
    var block = /[?&]block=/.test(q), view3d = /[?&]view=3d/.test(q);
    if ((!block && view3d) || (phone && !/[?&](unit|unitType|type|view|block)=/.test(q))) root.classList.add('oh-estate-on');
    var canvas = document.querySelector('.site-plan_map-canvas'), box = document.querySelector('.unit-filter_map-container'), stage = document.querySelector('.site-plan_map');
    if (!canvas || !box || !stage) return;
    var im = canvas.querySelector('img');
    if (im && im.loading === 'lazy') im.loading = 'eager';
    var bw = box.clientWidth, bh = box.clientHeight; if (!bw || !bh) return;
    var r = im && im.naturalWidth ? im.naturalWidth / im.naturalHeight : 3380 / 2981;
    var fill = phone && bh > bw * 1.15;
    var w = fill ? Math.round(Math.max(bw, bh * r)) : Math.round(Math.min(bw * 0.94, bh * 0.94 * r));
    stage.style.padding = Math.round(bh * 0.5) + 'px ' + Math.round(bw * 0.5) + 'px';
    canvas.style.width = w + 'px';
    canvas.style.setProperty('--oh-zoom', 1);
    box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
    box.scrollTop = (box.scrollHeight - box.clientHeight) / 2;
  })();
  document.documentElement.classList.remove('oh-app-pending');
})();
