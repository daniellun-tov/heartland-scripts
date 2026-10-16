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
