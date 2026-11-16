/* Stellenbosch Village: "Already taking shape" progress section + lightbox.
   Markup is native Webflow (Collection List "Site progress" in section.section_homev2-progress).
   This file only adds behaviour and builds the media nodes, because Webflow cannot bind an R2 URL
   to a <video> or <img> src. Monthly update = edit the CMS items; nothing here changes.
   Item contract (custom attributes bound in the Designer on .homev2-progress_item):
     data-type=video|photo, data-order, data-loop, data-full, data-poster, data-photo, data-captured (ISO date) */
(function () {
  'use strict';
  var root = document.querySelector('.homev2-progress_component');
  if (!root) return;
  var items = [].slice.call(root.querySelectorAll('.homev2-progress_item'));
  if (!items.length) return;
  var reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  var SHOWN = 5; /* hero + 4 bento tiles; the rest sit behind the "+N View all" tile */
  var data = items.map(function (el) {
    var d = el.dataset;
    return { el: el, type: d.type === 'video' ? 'video' : 'photo', loop: d.loop, full: d.full, poster: d.poster, photo: d.photo };
  });

  /* ---- tile media ---- */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting && !reduce) { if (!v.src) v.src = v.dataset.src; v.play().catch(function () {}); }
      else v.pause();
    });
  }, { rootMargin: '200px' }) : null;

  data.forEach(function (it, i) {
    var holder = it.el.querySelector('.homev2-progress_media');
    if (!holder) return;
    var img = new Image();
    img.className = 'homev2-progress_img';
    img.alt = '';
    img.decoding = 'async';
    if (i > 0) img.loading = 'lazy';
    img.src = it.type === 'video' ? it.poster : it.photo;
    holder.appendChild(img);
    if (it.type === 'video' && it.loop) {
      var v = document.createElement('video');
      v.className = 'homev2-progress_video';
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.dataset.src = it.loop; v.poster = it.poster;
      v.addEventListener('playing', function () { v.classList.add('is-playing'); });
      holder.appendChild(v);
      if (io) io.observe(v);
    }
    if (i >= SHOWN) it.el.classList.add('is-extra');
    it.el.setAttribute('role', 'button'); it.el.tabIndex = 0;
    it.el.setAttribute('aria-label', (it.type === 'video' ? 'View full video ' : 'View photo ') + (i + 1) + ' of ' + data.length);
    it.el.addEventListener('click', function (e) { e.preventDefault(); open(i); });
    it.el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } });
  });

  /* "+N View all" tile (native element in the section) and the Last updated month */
  var more = root.querySelector('.homev2-progress_more');
  if (more) {
    var n = data.length - SHOWN;
    if (n > 0) {
      var num = more.querySelector('[data-progress-count]'); if (num) num.textContent = '+' + n;
      more.addEventListener('click', function (e) { e.preventDefault(); open(SHOWN); });
    } else more.hidden = true;
  }
  var stamp = root.querySelector('[data-progress-updated]');
  if (stamp) {
    var latest = 0;
    data.forEach(function (it) { var t = Date.parse(it.el.dataset.captured || ''); if (t > latest) latest = t; });
    if (latest) stamp.textContent = 'Last updated · ' + new Date(latest).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  /* ---- lightbox ---- */
  var box, stage, counter, thumbs, cur = 0, lastFocus, startX = null;
  function build() {
    box = document.createElement('div');
    box.className = 'homev2-lightbox'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Site progress gallery');
    box.innerHTML = '<div class="homev2-lightbox_top"><span class="homev2-lightbox_count" aria-live="polite"></span>' +
      '<button type="button" class="homev2-lightbox_btn" data-lb="close" aria-label="Close">Close</button></div>' +
      '<div class="homev2-lightbox_stage"></div>' +
      '<button type="button" class="homev2-lightbox_nav is-prev" data-lb="prev" aria-label="Previous"></button>' +
      '<button type="button" class="homev2-lightbox_nav is-next" data-lb="next" aria-label="Next"></button>' +
      '<div class="homev2-lightbox_thumbs"></div>';
    document.body.appendChild(box);
    stage = box.querySelector('.homev2-lightbox_stage');
    counter = box.querySelector('.homev2-lightbox_count');
    thumbs = box.querySelector('.homev2-lightbox_thumbs');
    data.forEach(function (it, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'homev2-lightbox_thumb';
      b.setAttribute('aria-label', 'Item ' + (i + 1));
      var t = new Image(); t.alt = ''; t.loading = 'lazy'; t.src = it.type === 'video' ? it.poster : it.photo;
      b.appendChild(t); b.addEventListener('click', function () { show(i); }); thumbs.appendChild(b);
    });
    box.addEventListener('click', function (e) {
      var a = e.target.closest('[data-lb]'); if (a) { var k = a.dataset.lb; if (k === 'close') close(); else show(cur + (k === 'next' ? 1 : -1)); }
      else if (e.target === box || e.target === stage) close();
    });
    box.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (startX == null) return; var dx = e.changedTouches[0].clientX - startX; startX = null;
      if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
    });
    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') show(cur + 1);
      else if (e.key === 'ArrowLeft') show(cur - 1);
      else if (e.key === 'Tab') { /* focus trap */
        var f = [].slice.call(box.querySelectorAll('button')).filter(function (b) { return b.offsetParent !== null; });
        if (!f.length) return; var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }
  function show(i) {
    cur = (i + data.length) % data.length;
    var it = data[cur];
    stage.textContent = '';
    if (it.type === 'video') {
      var v = document.createElement('video');
      v.className = 'homev2-lightbox_media'; v.controls = true; v.playsInline = true; v.autoplay = true;
      v.poster = it.poster; v.src = it.full; stage.appendChild(v); v.play().catch(function () {});
    } else {
      var im = new Image(); im.className = 'homev2-lightbox_media'; im.alt = ''; im.src = it.photo; stage.appendChild(im);
    }
    counter.textContent = (cur + 1) + ' / ' + data.length;
    [].forEach.call(thumbs.children, function (b, k) { b.classList.toggle('is-on', k === cur); b.setAttribute('aria-current', k === cur ? 'true' : 'false'); });
    var on = thumbs.children[cur]; if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    /* warm the neighbouring photos so arrows feel instant */
    [cur + 1, cur - 1].forEach(function (k) { var n = data[(k + data.length) % data.length]; if (n.type === 'photo') new Image().src = n.photo; });
  }
  function open(i) {
    if (!box) build();
    lastFocus = document.activeElement;
    box.hidden = false; document.documentElement.classList.add('homev2-lightbox-open');
    show(i);
    requestAnimationFrame(function () { box.classList.add('is-open'); box.querySelector('[data-lb=close]').focus(); });
  }
  function close() {
    box.classList.remove('is-open'); box.hidden = true; stage.textContent = '';
    document.documentElement.classList.remove('homev2-lightbox-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
})();
