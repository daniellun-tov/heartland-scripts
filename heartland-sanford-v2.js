/* ============================================================================
   HEARTLAND — SANFORD HEART v2 brochure page  (/sanford-dev-2)

   One file, one tag. Runs only where the page carries [data-sd2-page].
   Every module below is independent: it looks for its own root element and
   does nothing when that element is absent, so partial pages and Designer
   previews never throw.

   WHAT LIVES HERE (and what does not)
     - Scroll reveals, parallax, nav state, sticky reserve bar
     - Hero + flythrough video loaders (poster owns LCP; video attaches on load)
     - "Life here" sticky scroller (600vh, scroll-progress driven)
     - Flythrough video card (plays muted on scroll-in; steps are static copy)
     - Day / sunset / night lighting toggle (ported from web/lighting-toggle.html)
     - Availability selector: pins, footprints, strip, detail card, filters,
       counts in the hero + stats + legend, hand-off into #reservation-form
     - Unit-type cards: counts and from-prices derived from the Units list
     - "Make it yours": accordion panels, option picks, previews, summary chips
     - Explore-more reveal, VR tabs, bond calculator drawer, map/aerial toggles

   WHAT IT NEVER DOES
     - It never contains a fact about the CMS. Every unit, type, floor and add-on
       is read from the Webflow Collection Lists on the page (data-* attributes
       and bound text). Add an eighth home in the CMS and nothing here changes.
     - It never owns the reservation. The form is #reservation-form and the
       hand-off is heartland-reserve.js (data-hl-entry="sanford"); this file only
       fills the hidden "Unit ID" field and the visible summary.

   CLASS CONTRACT (all Webflow-native combos toggled here)
     .sd2_reveal            + .is-inview
     .sd2_nav               + .is-scrolled
     .sd2_hero_video, .sd2_fly_video        + .is-playing
     .sd2_life_slide .is-active  .sd2_life_cap .is-on  .sd2_life_dot .is-current
     .sd2_light .is-auto   .sd2_light_img .is-on   .sd2_light_tab .is-active
     .sd2_pin  .is-active .is-hover .is-dim .is-reserved .is-sold
     .sd2_map_overlay .is-on
     .sd2_strip_btn .is-active .is-dim .is-reserved .is-sold
     .sd2_detail .is-active      .sd2_filter .is-active
     .sd2_up_panel/.sd2_up_tab/.sd2_up_title/.sd2_up_pick/.sd2_up_body .is-open
     .sd2_option .is-active .is-dim
     .sd2_explore .is-open  .sd2_calc .is-open  .sd2_calc_backdrop .is-open
     .sd2_aerial_map .is-open   .sd2_bar .is-visible

   ?sd2_debug=1 logs.
   ========================================================================== */
(function (w, d) {
  "use strict";

  var PAGE = d.querySelector("[data-sd2-page]");
  if (!PAGE) { return; }

  var DEBUG = /[?&]sd2_debug=1/.test(w.location.search);
  function log() { if (DEBUG && w.console) { console.log.apply(console, ["[sd2]"].concat([].slice.call(arguments))); } }

  var EASE_OUT = "cubic-bezier(.2,.7,.2,1)";
  var reduceMotion = w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var qs = function (sel, root) { return (root || d).querySelector(sel); };
  var qsa = function (sel, root) { return [].slice.call((root || d).querySelectorAll(sel)); };
  var on = function (el, ev, fn, opts) { if (el) { el.addEventListener(ev, fn, opts || false); } };
  var isHidden = function (el) { return !el || el.classList.contains("w-condition-invisible"); };
  var text = function (el) { return el ? String(el.textContent || "").trim() : ""; };
  var num = function (v) { var n = parseFloat(String(v === null || v === undefined ? "" : v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };

  /* Prices in the CMS are stored both as text ("R3,595,000") and as a number.
     Format the number ourselves so every place on the page agrees. */
  function money(n) { return "R" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function short(n) { return "R" + (n / 1000000).toFixed(2).replace(/0$/, "").replace(/\.0$/, "") + "m"; }

  /* PHASE. The page says which phase it is in, on .sd2_page:
       data-sd2-phase="prelaunch"   waitlist, countdown, gated availability + pricing
       data-sd2-launch="2026-09-25T12:00:00+02:00"   what the countdown counts to
       data-sd2-ms-plan="pln_..."   the Memberstack plan a waitlist sign-up joins
     Launch day is one attribute: set the phase to anything else ("live") and publish. The
     reservation hand-off comes back, prices are per home again and nothing is gated. */
  var PRE = (PAGE.getAttribute("data-sd2-phase") || "").toLowerCase() === "prelaunch";
  var LAUNCH = Date.parse(PAGE.getAttribute("data-sd2-launch") || "") || 0;
  var MS_PLAN = PAGE.getAttribute("data-sd2-ms-plan") || "";
  if (PRE) {
    d.documentElement.classList.add("sd2-prelaunch");
    /* heartland-reserve.js arms itself on [data-hl-entry] and then owns every submit of
       #reservation-form (posts to Xano, sends the buyer to /reserve-flow). Before launch
       that form is the waitlist, so the marker is parked here. This runs while the page
       is still parsing and the reserve script binds on DOMContentLoaded, so it finds no
       marker and stands aside. At launch nothing needs undoing: the phase changes and the
       marker is simply left alone. */
    qsa("[data-hl-entry]").forEach(function (el) {
      el.setAttribute("data-hl-entry-paused", el.getAttribute("data-hl-entry") || "");
      el.removeAttribute("data-hl-entry");
    });
  }
  /* The development's "from" price: the cheapest home still available. Before launch it is
     the only price the page shows — per-home prices are released at launch. */
  function fromPrice() {
    var av = UNITS.filter(function (u) { return u.status === "Available" && u.price; });
    var pool = av.length ? av : UNITS.filter(function (u) { return u.price; });
    return pool.length ? Math.min.apply(null, pool.map(function (u) { return u.price; })) : 0;
  }

  /* Scrolling is the browser's job. Anything with a destination on this page is a plain
     <a href="#id">; this helper is only for jumps JS starts itself (picking a home on a
     phone). Both land the same way, because html{scroll-padding-top} owns the nav offset
     rather than a magic number in here. */
  /* A .sd2_reveal that has not fired yet is sitting 26px low. Scroll to something inside one
     and it lands 26px off, because the reveal then animates it up under your feet. So finish
     the reveal first, without the transition, and only then measure. */
  function settleReveal(el) {
    var r = el && el.closest ? el.closest(".sd2_reveal") : null;
    if (!r || r.classList.contains("is-inview")) { return; }
    r.style.transition = "none";
    r.classList.add("is-inview");
    void r.offsetWidth;
    r.style.transition = "";
  }

  function scrollToEl(el) {
    if (!el) { return; }
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  /* Webflow's smoothScroll module delegates a click handler on `document` for every
     a[href*="#"], preventDefault()s it and runs its own easing to window.scroll(). That is
     what made in-page links feel scripted, and it also bypasses scroll-padding-top, so every
     anchor landed with the fixed nav covering the top of the section.

     Stopping propagation AT THE LINK keeps the event away from that handler on document while
     the link's own listeners still run, and nothing calls preventDefault, so the browser does
     the fragment navigation itself: native easing from `scroll-behavior`, and the offset from
     `scroll-padding-top` on <html>, which clears the fixed nav on every breakpoint.

     It has to be a BUBBLE listener. Chrome runs a target's capture listeners in the capture
     pass and its bubble listeners in the bubble pass, so stopping propagation from a capture
     listener here also kills every other handler on the same link — which silently disabled
     the explore opener. In the bubble phase the flag only stops the event reaching document. */
  (function nativeAnchors() {
    qsa('a[href^="#"]').forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href || href === "#" || !qs(href)) { return; }
      a.addEventListener("click", function (e) {
        // A .sd2_reveal that has not fired yet sits 26px low; finish it before the browser
        // measures where to land, or the anchor lands 26px short (the detail card did).
        settleReveal(qs(href));
        e.stopPropagation();
      }, false);
    });
  })();

  /* ----------------------------------------------------------- 1. reveals */
  (function reveals() {
    var els = qsa(".sd2_reveal");
    if (!els.length) { return; }
    if (!("IntersectionObserver" in w) || reduceMotion) {
      els.forEach(function (el) { el.classList.add("is-inview"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) { return; }
        e.target.classList.add("is-inview");
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el, i) {
      var r = el.getBoundingClientRect();
      if (r.top < w.innerHeight && r.bottom > 0) { el.classList.add("is-inview"); return; }
      el.style.transitionDelay = ((i % 4) * 90) + "ms";
      io.observe(el);
    });
  })();

  /* ----------------------------------------------------------- 2. parallax */
  (function parallax() {
    var els = qsa("[data-parallax]");
    if (!els.length || reduceMotion) { return; }
    var raf = null;
    function paint() {
      var vh = w.innerHeight;
      els.forEach(function (el) {
        var host = el.parentElement, r = host.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) { return; }
        var speed = parseFloat(el.getAttribute("data-parallax")) || 0;
        var progress = (r.top + r.height / 2 - vh / 2) / vh;
        el.style.transform = "translate3d(0," + (-progress * speed * r.height).toFixed(1) + "px,0)";
      });
      raf = null;
    }
    on(w, "scroll", function () { if (!raf) { raf = w.requestAnimationFrame(paint); } }, { passive: true });
    on(w, "resize", paint);
    paint();
  })();

  /* ----------------------------------------------------------- 3. nav */
  (function nav() {
    var el = qs("[data-sd2-nav]");
    if (!el) { return; }
    var cta = qs(".sd2_nav_cta", el);
    var was = null;
    function sync() {
      var scrolled = w.pageYOffset > w.innerHeight * 0.7;
      if (scrolled === was) { return; }
      was = scrolled;
      el.classList.toggle("is-scrolled", scrolled);
      if (cta) { cta.classList.toggle("is-scrolled", scrolled); }
    }
    on(w, "scroll", sync, { passive: true });
    sync();
  })();

  /* ----------------------------------------------------------- 4. videos */
  function attachVideo(v, whenVisible) {
    if (!v || v.getAttribute("src")) { return; }
    if (reduceMotion) { return; }
    if (navigator.connection && navigator.connection.saveData) { return; }
    var dsd = v.dataset, src;
    if (w.matchMedia("(max-width: 767px)").matches) { src = dsd.srcMobile || dsd.srcTablet || dsd.srcDesktop; }
    else if (w.matchMedia("(max-width: 1279px)").matches) { src = dsd.srcTablet || dsd.srcDesktop; }
    else { src = dsd.srcDesktop; }
    if (!src) { return; }
    function go() {
      if (v.getAttribute("src")) { return; }
      // Webflow drops `muted` and `loop` from custom attributes when it publishes, and an unmuted
      // video is never allowed to autoplay — so the flags are set here, before play().
      v.muted = true; v.defaultMuted = true; v.loop = true;
      v.setAttribute("muted", ""); v.setAttribute("loop", ""); v.setAttribute("playsinline", "");
      v.addEventListener("playing", function () { v.classList.add("is-playing"); }, { once: true });
      v.setAttribute("src", src);
      v.load();
      var p = v.play();
      if (p && p.catch) { p.catch(function () {}); }
      log("video attached", src);
    }
    if (whenVisible && "IntersectionObserver" in w) {
      var io = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { io.disconnect(); go(); }
      }, { rootMargin: "200px 0px" });
      io.observe(v);
    } else { go(); }
  }
  (function videos() {
    var hero = qs("[data-hero-video] video");
    // Poster: swap in the portrait crop on phones, before the browser fetches the wide one twice.
    var poster = qs("[data-hero-video] img");
    if (hero && poster && w.matchMedia("(max-width: 767px)").matches && hero.dataset.posterMobile) {
      poster.removeAttribute("srcset"); poster.removeAttribute("sizes");
      poster.src = hero.dataset.posterMobile;
    }
    function boot() {
      attachVideo(hero, false);
      qsa("[data-sd2-video]").forEach(function (v) { attachVideo(v, true); });
    }
    if (d.readyState === "complete") { boot(); } else { on(w, "load", boot); }
  })();

  /* ----------------------------------------------------------- 5. life scroller */
  (function life() {
    var root = qs("[data-sd2-life]");
    if (!root) { return; }
    var slides = qsa(".sd2_life_slide", root), caps = qsa(".sd2_life_cap", root), dots = qsa(".sd2_life_dot", root);
    var n = slides.length, cur = -1, primed = false;
    if (!n) { return; }
    // The slides are lazy <img>s stacked at the same spot inside the sticky panel, so the browser
    // only fetches them once the panel is on screen — one scroll step too late on a phone. Switch
    // them to eager as soon as the section is within two viewports.
    function prime() {
      if (primed) { return; }
      primed = true;
      slides.forEach(function (s) {
        if (s.tagName !== "IMG") { return; }
        s.setAttribute("decoding", "async");
        if (s.getAttribute("loading") === "lazy") { s.setAttribute("loading", "eager"); }
      });
    }
    function paint(i) {
      if (i === cur) { return; }
      cur = i;
      slides.forEach(function (s, k) { s.classList.toggle("is-active", k === i); });
      caps.forEach(function (c, k) { c.classList.toggle("is-on", k === i); });
      dots.forEach(function (dd, k) { dd.classList.toggle("is-current", k === i); });
    }
    function sync() {
      var r = root.getBoundingClientRect();
      if (!primed && r.top < w.innerHeight * 2 && r.bottom > 0) { prime(); }
      // the sticky panel's own height (100svh) is the stable measure on phones, where innerHeight
      // jumps as the browser toolbar collapses mid-scroll
      var panel = qs(".sd2_life_sticky", root);
      var vh = (panel && panel.offsetHeight) || w.innerHeight;
      var total = r.height - vh;
      if (total <= 0) { paint(0); return; }
      var p = Math.min(1, Math.max(0, -r.top / total));
      paint(Math.min(n - 1, Math.floor(p * n)));
    }
    dots.forEach(function (dd, i) {
      on(dd, "click", function (e) {
        e.preventDefault();
        var top = root.getBoundingClientRect().top + w.pageYOffset;
        var panel = qs(".sd2_life_sticky", root);
        var step = (root.offsetHeight - ((panel && panel.offsetHeight) || w.innerHeight)) / n;
        w.scrollTo({ top: top + step * i + step / 2, behavior: reduceMotion ? "auto" : "smooth" });
      });
    });
    /* On a phone a 480vh free-scrolling section means every flick lands mid-crossfade.
       These bands give the page something to snap to — one per slide — so a swipe up
       settles on the next picture. They are invisible and only exist under 768px;
       the snapping itself is CSS (html gets scroll-snap-type in the page head). */
    function buildSnaps() {
      if (qs(".sd2_life_snaps", root)) { return; }
      var wrap = d.createElement("div");
      wrap.className = "sd2_life_snaps";
      wrap.setAttribute("aria-hidden", "true");
      for (var i = 0; i < n; i++) {
        var band = d.createElement("div");
        band.className = "sd2_life_snap";
        band.style.top = (i * 100 / n) + "%";
        band.style.height = (100 / n) + "%";
        wrap.appendChild(band);
      }
      root.appendChild(wrap);
    }
    if (!reduceMotion && w.matchMedia("(max-width: 767px)").matches) { buildSnaps(); }

    on(w, "scroll", sync, { passive: true });
    on(w, "resize", sync);
    sync();
  })();

  /* ----------------------------------------------------------- 6. flythrough
     Static two-column section since Sep 2026: the video card plays on scroll-in (section 4),
     the 01-03 steps are plain copy. No chapter cycling. */

  /* ----------------------------------------------------------- 7. lighting toggle */
  (function lighting() {
    var ORDER = ["day", "sunset", "night"];
    qsa("[data-lighting]").forEach(function (root) {
      var imgs = {}, tabs = {};
      qsa(".sd2_light_img", root).forEach(function (el, i) { imgs[el.getAttribute("data-state") || ORDER[i]] = el; });
      qsa(".sd2_light_tab", root).forEach(function (el, i) { tabs[el.getAttribute("data-target") || ORDER[i]] = el; });
      if (!imgs.day || !tabs.day) { return; }
      var dwell = parseInt(root.getAttribute("data-dwell") || "4200", 10);
      var cur = 0, autoTimer = null, idleTimer = null, auto = false, visible = false;
      root.style.setProperty("--lt-dwell", dwell + "ms");
      function paint(i) {
        ORDER.forEach(function (k, n) {
          if (imgs[k]) { imgs[k].classList.toggle("is-on", n === i); }
          if (tabs[k]) { tabs[k].classList.toggle("is-active", n === i); tabs[k].setAttribute("aria-selected", n === i ? "true" : "false"); }
        });
        cur = i;
      }
      // Every change is a single cross-fade straight to the target, including the wrap from
      // night back to day. An earlier version stepped through the intermediate phase, which
      // made the loop stall on sunset on its way round and ignored a direct click on Day.
      function goto_(target) {
        if (target === cur) { return; }
        paint(target);
      }
      function restartProgress() {
        var bar = qs(".sd2_light_tab.is-active .sd2_light_tab_progress", root);
        if (!bar) { return; }
        bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = "";
      }
      function tick() { goto_((cur + 1) % ORDER.length); restartProgress(); }
      function startAuto() {
        if (auto || reduceMotion || !visible) { return; }
        auto = true; root.classList.add("is-auto"); restartProgress();
        autoTimer = setInterval(tick, dwell);
      }
      function stopAuto() { auto = false; root.classList.remove("is-auto"); clearInterval(autoTimer); }
      function userTook() { stopAuto(); clearTimeout(idleTimer); idleTimer = setTimeout(startAuto, 12000); }
      ORDER.forEach(function (k, i) {
        on(tabs[k], "click", function (e) { e.preventDefault(); userTook(); goto_(i); });
      });
      // Pause only over the TAB ROW, which means the visitor is about to pick a time of day.
      // Hovering the picture itself must not stop the drift: on desktop the cursor sits over
      // this section the whole time it is on screen, which used to stop autoplay dead.
      var tabRow = qs(".sd2_light_tabs", root) || root;
      on(tabRow, "pointerenter", function () { if (auto) { stopAuto(); clearTimeout(idleTimer); } });
      on(tabRow, "pointerleave", function () { clearTimeout(idleTimer); idleTimer = setTimeout(startAuto, 1200); });
      if ("IntersectionObserver" in w) {
        new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) { startAuto(); } else { stopAuto(); } }, { threshold: 0.35 }).observe(root);
      } else { visible = true; startAuto(); }
      on(d, "visibilitychange", function () { if (d.hidden) { stopAuto(); } else { startAuto(); } });
    });
  })();

  /* ----------------------------------------------------------- 8. the catalogue: read units + types off the page */
  var TYPES = {};   // slug -> {slug, letter, name, desc, baths, parking, el}
  var UNITS = [];   // [{slug, no, n, typeSlug, price, status, ...}]

  function letterOf(name) {
    var m = /(?:type\s*)?([A-Z])\s*$/i.exec(String(name || "").trim());
    return m ? m[1].toUpperCase() : "";
  }

  function readTypes() {
    qsa("[data-sd2-types] .sd2_type").forEach(function (el) {
      var slug = el.getAttribute("data-type-slug") || "";
      var name = text(qs(".sd2_type_name", el));
      var t = { slug: slug, el: el, name: name, letter: letterOf(name) || letterOf(slug),
                desc: text(qs("[data-type-field=description]", el)),
                baths: text(qs("[data-type-field=bathrooms]", el)),
                parking: text(qs("[data-type-field=parking]", el)),
                vr: el.getAttribute("data-vr") || "" };
      TYPES[slug] = t;
      var nameEl = qs(".sd2_type_name", el);
      if (nameEl && t.letter) { nameEl.textContent = "Type " + t.letter; }
    });
  }

  /* Reserved / Sold come from the CMS Switch fields through conditional visibility on the
     [data-flag] tags. Webflow has two ways of rendering a condition that is false: older
     output keeps the element and adds .w-condition-invisible, current output leaves the
     element out of the HTML altogether. Both read as "hidden" through isHidden().

     The guard below is for the state where the condition is not bound at all: every item
     then renders BOTH tags, and without it every unit would read as Sold. So the flags are
     treated as carrying signal unless every single item shows reserved AND sold at once,
     which is not a state real data can produce. Do not go back to looking for
     .w-condition-invisible — an omitted element leaves no class to find. */
  var VIS_BOUND = null;
  function visBound() {
    if (VIS_BOUND === null) {
      var items = qsa("[data-sd2-map] .sd2_map_item");
      VIS_BOUND = items.length > 0 && !items.every(function (it) {
        return !isHidden(qs("[data-flag=reserved]", it)) && !isHidden(qs("[data-flag=sold]", it));
      });
    }
    return VIS_BOUND;
  }
  function statusOf(item) {
    if (item.getAttribute("data-sold") === "true") { return "Sold"; }
    if (item.getAttribute("data-reserved") === "true") { return "Reserved"; }
    if (!visBound()) { return "Available"; }
    if (!isHidden(qs("[data-flag=sold]", item))) { return "Sold"; }
    if (!isHidden(qs("[data-flag=reserved]", item))) { return "Reserved"; }
    return "Available";
  }

  function readUnits() {
    qsa("[data-sd2-map] .sd2_map_item").forEach(function (item) {
      var slug = item.getAttribute("data-unit") || "";
      if (!slug) { return; }
      var typeSlug = item.getAttribute("data-type") || "";
      var type = TYPES[typeSlug];
      if (!type) {
        // Fall back to matching by letter when the reference slug is absent.
        var l = letterOf(typeSlug);
        Object.keys(TYPES).forEach(function (k) { if (TYPES[k].letter === l) { type = TYPES[k]; } });
      }
      var no = text(qs(".sd2_pin_no", item)) || item.getAttribute("data-no") || "";
      UNITS.push({
        slug: slug, no: no, n: String(parseInt(no, 10) || no),
        name: item.getAttribute("data-name") || "",
        typeSlug: type ? type.slug : typeSlug, letter: type ? type.letter : letterOf(typeSlug),
        price: num(item.getAttribute("data-price")),
        priceText: item.getAttribute("data-price-text") || "",
        x: num(item.getAttribute("data-x")), y: num(item.getAttribute("data-y")),
        status: statusOf(item),
        map: item,
        pin: qs(".sd2_pin", item), overlay: qs(".sd2_map_overlay", item),
        strip: qs("[data-sd2-strip] .sd2_strip_item[data-unit=\"" + slug + "\"]"),
        detail: qs("[data-sd2-details] .sd2_detail[data-unit=\"" + slug + "\"]")
      });
    });
    UNITS.sort(function (a, b) { return (parseInt(a.no, 10) || 0) - (parseInt(b.no, 10) || 0); });
  }

  /* ----------------------------------------------------------- 9. availability selector */
  var SEL = { filter: "all", selected: null, hover: null };

  function unitBy(slug) { for (var i = 0; i < UNITS.length; i++) { if (UNITS[i].slug === slug) { return UNITS[i]; } } return null; }

  function paintCounts() {
    var avail = UNITS.filter(function (u) { return u.status === "Available"; });
    var reserved = UNITS.filter(function (u) { return u.status === "Reserved"; }).length;
    var sold = UNITS.filter(function (u) { return u.status === "Sold"; }).length;
    var from = avail.length ? Math.min.apply(null, avail.map(function (u) { return u.price || Infinity; })) : 0;
    qsa("[data-sd2-count]").forEach(function (el) {
      var k = el.getAttribute("data-sd2-count");
      if (k === "available") { el.textContent = String(avail.length); }
      else if (k === "available-of") { el.textContent = avail.length + " of " + UNITS.length; }
      else if (k === "reserved") { el.textContent = String(reserved); }
      else if (k === "sold") { el.textContent = String(sold); }
      else if (k === "total") { el.textContent = String(UNITS.length); }
      else if (k === "from-price") { el.textContent = from && isFinite(from) ? short(from) : "On consultation"; }
    });
    // Type cards: "N homes · M available" and the from-price per type.
    Object.keys(TYPES).forEach(function (k) {
      var t = TYPES[k];
      var us = UNITS.filter(function (u) { return u.typeSlug === k; });
      var av = us.filter(function (u) { return u.status === "Available"; });
      var c = qs(".sd2_type_count", t.el);
      if (c) { c.textContent = us.length + (us.length === 1 ? " home" : " homes") + " · " + av.length + " available"; }
      var f = qs(".sd2_type_from_val", t.el);
      if (f) {
        var pool = av.length ? av : (PRE ? us : []);
        var m = pool.length ? Math.min.apply(null, pool.map(function (u) { return u.price || Infinity; })) : 0;
        f.textContent = m && isFinite(m) ? money(m) : "on consultation";
      }
      var fb = qs(".sd2_filter[data-filter=\"" + k + "\"]");
      if (fb && t.desc && !fb.getAttribute("data-labelled")) {
        fb.setAttribute("data-labelled", "1");
        fb.textContent = "Type " + t.letter + " · " + t.desc.replace(/rooms?$/i, "").trim().toLowerCase().replace(/^(\d+)\s*bed$/, "$1 bed");
      }
    });
  }

  /* On phones the masterplan is a drawing twice the width of its frame (.sd2_map_pan inside
     a square .sd2_map_frame), pannable on both axes. Open it in the middle of both rather
     than hard against a corner. */
  function centreMapPan() {
    var frame = qs("[data-sd2-map] .sd2_map_frame");
    if (!frame) { return; }
    var overX = frame.scrollWidth - frame.clientWidth;
    var overY = frame.scrollHeight - frame.clientHeight;
    if (overX > 4) { frame.scrollLeft = overX / 2; }
    if (overY > 4) { frame.scrollTop = overY / 2; }
  }

  function positionPins() {
    UNITS.forEach(function (u) {
      if (!u.pin) { return; }
      // The CMS positions are plain percentages of the masterplan drawing, and the pins sit
      // in the same box as the drawing (.sd2_map_pan), so any zoom is a change of that box's
      // width and both move together. Nothing to correct for here.
      u.pin.style.left = u.x.toFixed(2) + "%";
      u.pin.style.top = u.y.toFixed(2) + "%";
      u.pin.classList.toggle("is-reserved", u.status === "Reserved");
      u.pin.classList.toggle("is-sold", u.status === "Sold");
      u.pin.setAttribute("aria-label", "Home " + u.n + " — " + u.status);
      if (u.strip) {
        var b = qs(".sd2_strip_btn", u.strip);
        if (b) {
          b.classList.toggle("is-reserved", u.status === "Reserved");
          b.classList.toggle("is-sold", u.status === "Sold");
          var sub = qs(".sd2_strip_sub", b);
          if (sub) { sub.textContent = u.status === "Available" ? (u.price && !PRE ? short(u.price) : "Type " + u.letter) : u.status; }
        }
      }
      if (u.detail) {
        qsa(".sd2_detail_flags [data-status]", u.detail).forEach(function (s) {
          var k = s.getAttribute("data-status");
          s.style.display = (k === u.status.toLowerCase()) ? "" : "none";
        });
        var ty = qs("[data-sd2-detail=type]", u.detail);
        if (ty) { ty.textContent = "Type " + u.letter + " · " + u.status; }
        var lead = qs("[data-sd2-detail=price-lead]", u.detail);
        if (lead) { lead.textContent = u.status === "Sold" ? "" : "Starting at"; }
        var price = qs("[data-sd2-detail=price]", u.detail);
        if (price && u.status === "Sold") { price.textContent = "Sold"; }
        else if (price && PRE) { price.textContent = "Priced at launch"; price.classList.add("is-pending"); }
        var cta = qs("[data-sd2-detail=cta]", u.detail);
        if (cta && !PRE) {
          cta.textContent = u.status === "Sold" ? "Sold — see other homes" : u.status === "Reserved" ? "Join the waiting list" : "Reserve home " + u.n;
          cta.setAttribute("href", u.status === "Sold" ? "#sd2-select" : "#sd2-reserve");
        }
        var tlink = qs("[data-sd2-detail=type-link]", u.detail);
        if (tlink) { tlink.textContent = "Type " + u.letter + " Details"; }
        // Bring type-level facts into the card (bedrooms / bathrooms / parking).
        var t = TYPES[u.typeSlug];
        if (t) {
          qsa("[data-type-fill]", u.detail).forEach(function (el) {
            var v = t[el.getAttribute("data-type-fill")];
            if (v) { el.textContent = v; }
          });
        }
      }
    });
  }

  function focusUnit() { return (SEL.hover && unitBy(SEL.hover)) || (SEL.selected && unitBy(SEL.selected)) || null; }

  function paintSelection() {
    var f = focusUnit();
    var activeType = SEL.filter !== "all" ? SEL.filter : (f ? f.typeSlug : "");
    UNITS.forEach(function (u) {
      var dim = SEL.filter !== "all" && u.typeSlug !== SEL.filter;
      var isSel = u.slug === SEL.selected, isHov = u.slug === SEL.hover;
      if (u.pin) {
        u.pin.classList.toggle("is-active", isSel);
        u.pin.classList.toggle("is-hover", isHov && !isSel);
        u.pin.classList.toggle("is-dim", dim);
      }
      // Footprint lights for the focused home, and for every home of the active type.
      if (u.overlay) { u.overlay.classList.toggle("is-on", isSel || isHov || (!!activeType && u.typeSlug === activeType && !f)); }
      if (u.strip) {
        var b = qs(".sd2_strip_btn", u.strip);
        if (b) { b.classList.toggle("is-active", isSel); b.classList.toggle("is-dim", dim); }
      }
      if (u.detail) { u.detail.classList.toggle("is-active", f ? u.slug === f.slug : false); }
    });
    qsa(".sd2_filter").forEach(function (b) { b.classList.toggle("is-active", (b.getAttribute("data-filter") || "all") === SEL.filter); });
    var hint = qs("[data-sd2-hint]");
    if (hint) {
      // "Hover" has no meaning on a touch screen — mobile never sets SEL.hover, so this used
      // to sit on the desktop copy forever. f already falls back to the tapped/selected home,
      // so using it (not SEL.hover) here lights the hint on mobile too, and the idle copy is
      // per-device since only desktop actually has a hover to invite.
      var touchDevice = w.matchMedia("(max-width: 767px)").matches;
      hint.textContent = f
        ? "Home " + f.n + " — " + f.status
        : (touchDevice ? "Tap a marker to see a home" : "Hover a marker to light its footprint");
    }
    paintSelected();
  }

  /* The selected home is echoed in four places: the detail card, the sticky bar,
     the enquiry summary and the hidden Unit ID field the reservation entry reads. */
  function paintSelected() {
    var u = SEL.selected && unitBy(SEL.selected);
    if (!u) { return; }
    qsa("[data-sd2-selected]").forEach(function (el) {
      var k = el.getAttribute("data-sd2-selected");
      // Before launch the sticky bar carries the countdown and nothing quotes a home's price
      // or holds it; the waitlist module paints those places instead.
      if (PRE && (el.closest("[data-sd2-bar]") || /^(price|cta|ref|note|home-type)$/.test(k))) { return; }
      if (k === "n") { el.textContent = u.n; }
      else if (k === "type") { el.textContent = "Type " + u.letter; }
      else if (k === "type-line") { el.textContent = "Type " + u.letter + (TYPES[u.typeSlug] && TYPES[u.typeSlug].desc ? " · " + TYPES[u.typeSlug].desc.toLowerCase() : ""); }
      else if (k === "price") { el.textContent = u.price ? money(u.price) : (u.priceText || "On consultation"); }
      else if (k === "home-type") { el.textContent = "Home " + u.n + " · Type " + u.letter; }
      else if (k === "cta") { el.textContent = "Reserve home " + u.n; }
      else if (k === "ref") { el.textContent = "SH-" + (u.no.length < 2 ? "0" + u.no : u.no); }
      else if (k === "note") { el.textContent = "We hold home " + u.n + " for 14 days from receipt of the deposit."; }
    });
    if (PRE) { return; }
    var hidden = qs("#reservation-form input[name=\"Unit ID\"]");
    if (hidden) { hidden.value = u.name || u.slug; }
    var submit = qs("#reservation-form input[type=submit], #reservation-form button[type=submit]");
    if (submit) {
      var label = "Reserve home " + u.n;
      if (submit.tagName === "INPUT") { submit.value = label; submit.setAttribute("data-wait", "Holding home " + u.n + "…"); }
      else { submit.textContent = label; }
    }
  }

  function pick(slug, fromUser) {
    var u = unitBy(slug);
    if (!u || u.status === "Sold" || u.status === "Reserved") { return; }
    SEL.selected = slug;
    paintSelection();
    // On a phone the masterplan fills the screen and the detail card is below the fold,
    // so a tap looks like it did nothing. Bring the card to the top after the paint.
    if (fromUser && u.detail && w.matchMedia("(max-width: 767px)").matches) {
      settleReveal(u.detail);
      requestAnimationFrame(function () { scrollToEl(u.detail); });
    }
    if (fromUser) { log("picked", slug); }
  }

  function bindSelector() {
    var map = qs("[data-sd2-map]");
    if (!map) { return; }
    UNITS.forEach(function (u) {
      if (u.pin) {
        on(u.pin, "click", function (e) { e.preventDefault(); pick(u.slug, true); });
        on(u.pin, "mouseenter", function () { SEL.hover = u.slug; paintSelection(); });
        on(u.pin, "mouseleave", function () { SEL.hover = null; paintSelection(); });
        on(u.pin, "focus", function () { SEL.hover = u.slug; paintSelection(); });
        on(u.pin, "blur", function () { SEL.hover = null; paintSelection(); });
      }
      if (u.strip) {
        var b = qs(".sd2_strip_btn", u.strip) || u.strip;
        on(b, "click", function (e) { e.preventDefault(); pick(u.slug, true); });
        on(b, "mouseenter", function () { SEL.hover = u.slug; paintSelection(); });
        on(b, "mouseleave", function () { SEL.hover = null; paintSelection(); });
      }
    });
    qsa(".sd2_filter").forEach(function (b) {
      on(b, "click", function (e) {
        e.preventDefault();
        SEL.filter = b.getAttribute("data-filter") || "all";
        paintSelection();
      });
    });
    // "See Type X homes" on the type cards and the detail card's type link.
    qsa("[data-filter-type]").forEach(function (b) {
      // No preventDefault: the link carries href="#sd2-select" and the browser's own
      // anchor jump is smoother than anything scripted here.
      on(b, "click", function () {
        var t = b.getAttribute("data-filter-type") || "all";
        SEL.filter = t;
        var first = UNITS.filter(function (u) { return u.typeSlug === t && u.status === "Available"; })[0] ||
                    UNITS.filter(function (u) { return u.typeSlug === t; })[0];
        if (first && first.status !== "Sold") { SEL.selected = first.slug; }
        paintSelection();
      });
    });
    // Default: the first available home, lowest number first (the design's "07" was a placeholder).
    var def = UNITS.filter(function (u) { return u.status === "Available"; })[0] || UNITS[0];
    if (def && def.status !== "Sold") { SEL.selected = def.slug; }
    paintSelection();
    centreMapPan();
    on(w, "resize", centreMapPan);
    // At boot the drawing usually has no height yet, so there is nothing to centre against.
    // Run it again once the image has laid out.
    var mapImg = qs("[data-sd2-map] .sd2_map_base");
    if (mapImg) {
      // Webflow writes sizes="100vw", but under 768px the drawing is laid out at twice the
      // viewport, so that hint makes the browser pick a variant half the resolution it needs
      // and the plan reads soft. Webflow's API refuses to write `sizes` on an Image element,
      // so it is corrected here. If the small candidate has already arrived the browser will
      // fetch a sharper one — worth the extra request on the page's main interaction.
      if (w.matchMedia("(max-width: 767px)").matches) {
        mapImg.setAttribute("sizes", "200vw");
      }
      if (!mapImg.complete) { on(mapImg, "load", centreMapPan); }
    }
  }

  /* ----------------------------------------------------------- 10. sticky bar */
  (function bar() {
    var el = qs("[data-sd2-bar]"), sel = qs("#sd2-select"), reserve = qs("#sd2-reserve");
    if (!el || !sel) { return; }
    var was = null;
    function sync() {
      var r = sel.getBoundingClientRect();
      var show = r.top < w.innerHeight * 0.6;
      if (reserve) {
        var rr = reserve.getBoundingClientRect();
        if (rr.top < w.innerHeight * 0.8 && rr.bottom > 0) { show = false; }   // the form is on screen: no need to nag
      }
      if (show === was) { return; }
      was = show;
      el.classList.toggle("is-visible", show);
    }
    on(w, "scroll", sync, { passive: true });
    sync();
  })();

  /* ----------------------------------------------------------- 11. make it yours */
  (function upgrades() {
    var root = qs("[data-sd2-up]");
    if (!root) { return; }
    var panels = qsa(".sd2_up_panel", root);
    var wide = function () { return w.innerWidth >= 992; };
    var picks = {};   // panel key -> option label

    function openPanel(idx) {
      panels.forEach(function (p, i) {
        var open = i === idx;
        p.classList.toggle("is-open", open);
        ["sd2_up_tab", "sd2_up_title", "sd2_up_pick", "sd2_up_body"].forEach(function (c) {
          var el = qs("." + c, p); if (el) { el.classList.toggle("is-open", open); }
        });
        var tab = qs(".sd2_up_tab", p); if (tab) { tab.setAttribute("aria-expanded", open ? "true" : "false"); }
      });
    }

    function applyTypeFilter() {
      // Flooring / outdoor options are per unit type; show the ones for the selected home.
      var u = SEL.selected && unitBy(SEL.selected);
      var letter = u ? u.letter : "";
      panels.forEach(function (p) {
        var opts = qsa(".sd2_option", p);
        if (!opts.length) { return; }
        var typed = opts.some(function (o) { return letterOf(o.getAttribute("data-name") || "") || (o.getAttribute("data-types") || "").length; });
        if (!typed) { return; }
        var anyVisible = false;
        opts.forEach(function (o) {
          var l = letterOf(o.getAttribute("data-name") || "");
          var types = (o.getAttribute("data-types") || "").toLowerCase();
          var show = !letter || (l ? l === letter : (types ? types.indexOf(letter.toLowerCase()) > -1 : true));
          o.classList.toggle("is-dim", !show);
          if (show) { anyVisible = true; }
        });
        if (!anyVisible) { opts.forEach(function (o) { o.classList.remove("is-dim"); }); }
        // Keep one option active among the visible ones.
        var active = qs(".sd2_option.is-active:not(.is-dim)", p);
        if (!active) {
          var def = qsa(".sd2_option:not(.is-dim)", p).filter(isStandard)[0] || qs(".sd2_option:not(.is-dim)", p);
          if (def) { choose(p, def, true); }
        }
      });
      // Home-specific previews (garage, fireplace) follow the selected home.
      panels.forEach(function (p) {
        var a = qs(".sd2_option.is-active", p);
        if (a && /garage|fire/.test((text(qs(".sd2_option_label", a)) || "").toLowerCase())) { choose(p, a, true); }
      });
    }

    /* An option is "standard" when its CMS Default switch is on, which Webflow
       renders as the Standard tag NOT carrying .w-condition-invisible. */
    function tagsBound(panel) {
      // Same shape as visBound(): the Standard tag only means something once its condition
      // is bound, and an unbound condition shows the tag on every option. A bound one hides
      // it somewhere — either with .w-condition-invisible or by omitting the element.
      var opts = qsa(".sd2_option", panel || root);
      return opts.length > 0 && !opts.every(function (o) { return !isHidden(qs(".sd2_option_tag_std", o)); });
    }
    function isStandard(opt) {
      if (opt.getAttribute("data-default") === "true") { return true; }
      var std = qs(".sd2_option_tag_std", opt);
      if (!std) { return false; }
      var panel = opt.closest ? opt.closest(".sd2_up_panel") : null;
      return tagsBound(panel) && !isHidden(std);
    }
    function markTags(panel) {
      var bound = tagsBound(panel);
      qsa(".sd2_option", panel).forEach(function (o) {
        var up = qs(".sd2_option_tag", o), std = qs(".sd2_option_tag_std", o);
        if (!bound) { if (std) { std.style.display = "none"; } if (up) { up.style.display = ""; } return; }
        if (up) { up.style.display = isStandard(o) ? "none" : ""; }
      });
    }

    /* Big-ticket upgrades (garage, fireplace) preview the selected home's own
       render. The detail card carries four hidden images in a fixed order:
       0 garage as built, 1 garage upgraded, 2 fireplace as built, 3 fireplace upgraded. */
    function unitAsset(idx) {
      var u = SEL.selected && unitBy(SEL.selected);
      if (!u || !u.detail) { return ""; }
      var imgs = qsa(".sd2_detail_assets img", u.detail);
      var img = imgs[idx];
      var src = img ? (img.getAttribute("src") || "") : "";
      return src && !/^data:/.test(src) && !/placeholder/.test(src) ? src : "";
    }

    function previewFor(opt) {
      var label = (text(qs(".sd2_option_label", opt)) || opt.getAttribute("data-label") || "").toLowerCase();
      var own = "";
      var img = qs("img[data-preview]", opt) || qs("img.sd2_option_src", opt) || qs("img", opt);
      own = opt.getAttribute("data-preview") || (img ? (img.currentSrc || img.src) : "");
      own = own && !/^data:/.test(own) ? own : "";
      if (/garage/.test(label)) { return unitAsset(isStandard(opt) ? 0 : 1) || own; }
      if (/fire/.test(label)) { return unitAsset(isStandard(opt) ? 2 : 3) || own; }
      if (/pool/.test(label) && !own) {
        // The pool render lives on the outdoor list's Pool option.
        var pool = qsa(".sd2_option").filter(function (o) { return o !== opt && /pool/.test((text(qs(".sd2_option_label", o)) || "").toLowerCase()); })[0];
        var pimg = pool && (qs("img.sd2_option_src", pool) || qs("img", pool));
        own = pimg ? (pimg.currentSrc || pimg.src) : "";
      }
      return own;
    }

    function choose(panel, opt, silent) {
      qsa(".sd2_option", panel).forEach(function (o) { o.classList.toggle("is-active", o === opt); });
      var label = text(qs(".sd2_option_label", opt)) || opt.getAttribute("data-label") || "";
      var key = panel.getAttribute("data-up") || "";
      picks[key] = label;
      var pickEl = qs(".sd2_up_pick", panel);
      if (pickEl) { pickEl.textContent = label; }
      var pl = qs(".sd2_up_preview_label", panel);
      if (pl) { pl.textContent = label; }
      var prev = qs(".sd2_up_preview img", panel);
      var src = previewFor(opt);
      if (prev && src && prev.getAttribute("src") !== src) {
        prev.removeAttribute("srcset"); prev.removeAttribute("sizes");
        prev.style.opacity = "0";
        var tmp = new Image();
        tmp.onload = function () { prev.src = src; prev.style.transition = "opacity .5s ease"; prev.style.opacity = "1"; };
        tmp.onerror = function () { prev.style.opacity = "1"; };
        tmp.src = src;
      }
      if (!silent) { log("chose", key, label); }
      summary();
    }

    function summary() {
      var box = qs("[data-sd2-summary]");
      if (!box) { return; }
      box.innerHTML = "";
      panels.forEach(function (p) {
        var key = p.getAttribute("data-up") || "";
        var title = text(qs(".sd2_up_title", p)).split(/[\s,&]+/)[0];
        if (!picks[key]) { return; }
        var chip = d.createElement("div");
        chip.className = "sd2_up_chip";
        chip.textContent = title + ": " + picks[key];
        box.appendChild(chip);
      });
    }

    panels.forEach(function (p, i) {
      var tab = qs(".sd2_up_tab", p);
      on(tab, "click", function (e) {
        e.preventDefault();
        var open = p.classList.contains("is-open");
        if (!wide() && open) { openPanel(-1); } else { openPanel(i); }
      });
      qsa(".sd2_option", p).forEach(function (o) {
        on(o, "click", function (e) { e.preventDefault(); choose(p, o); });
      });
      // Default pick: the CMS "Default" switch (visible Standard tag), else the first option.
      markTags(p);
      var def = qsa(".sd2_option", p).filter(isStandard)[0] || qs(".sd2_option", p);
      if (def) { choose(p, def, true); }
      var carousel = qs(".sd2_apps", p);
      if (carousel) {
        // Standard/Upgrade tags on appliances are conditional-visibility bound; until
        // that is set in the Designer both render, so show neither.
        if (!qs(".w-condition-invisible", carousel)) { qsa(".sd2_app_tag, .sd2_app_tag_up", carousel).forEach(function (t) { t.style.display = "none"; }); }
        var count = qsa(".sd2_app", carousel).length;
        picks[p.getAttribute("data-up") || ""] = count + " included";
        var pickEl = qs(".sd2_up_pick", p); if (pickEl) { pickEl.textContent = count + " included"; }
      }
    });
    openPanel(wide() ? 0 : -1);
    on(w, "resize", function () { if (wide() && !qs(".sd2_up_panel.is-open", root)) { openPanel(0); } });
    summary();
    applyTypeFilter();
    d.addEventListener("sd2:selected", applyTypeFilter);
  })();

  /* ----------------------------------------------------------- 12. explore more, VR, finance */
  (function explore() {
    var openers = qsa("[data-sd2-explore-open]"), box = qs(".sd2_explore");
    openers.forEach(function (b) {
      // The button is <a href="#sd2-explore">. Reveal the block synchronously and let the
      // browser jump to it: the old scripted scroll fired 30ms later, against a page whose
      // height was still changing, which is what made it feel like it missed.
      on(b, "click", function () {
        if (!box) { return; }
        box.classList.add("is-open");
        var cta = qs("[data-sd2-explore-cta]"); if (cta) { cta.style.display = "none"; }
      });
    });

    // VR walkthrough: one tab per unit type; the XRai link comes from the type card (data-vr).
    var vrTabs = qsa(".sd2_vr_tab"), vrFrame = qs("[data-sd2-vr-frame]");
    function paintVr(slug) {
      vrTabs.forEach(function (t) { t.classList.toggle("is-active", t.getAttribute("data-type-slug") === slug); });
      if (!vrFrame) { return; }
      var t = TYPES[slug], src = t ? t.vr : "";
      var msg = qs(".sd2_vr_msg", vrFrame), iframe = qs("iframe", vrFrame), title = qs("[data-sd2-vr-title]", vrFrame);
      if (title && t) { title.textContent = "Type " + t.letter + " walkthrough"; }
      // A "coming soon" overlay in the frame means the tours are not open yet: don't pull a
      // multi-megabyte XR scene in underneath something nobody can click through.
      if (qs(".sd2_soon", vrFrame)) { src = ""; }
      if (src) {
        if (!iframe) {
          iframe = d.createElement("iframe");
          iframe.className = "sd2_vr_iframe";
          iframe.setAttribute("title", "VR walkthrough");
          iframe.setAttribute("allow", "fullscreen; xr-spatial-tracking; gyroscope; accelerometer");
          iframe.setAttribute("loading", "lazy");
          vrFrame.appendChild(iframe);
        }
        if (iframe.getAttribute("src") !== src) { iframe.setAttribute("src", src); }
        iframe.style.display = "";
        if (msg) { msg.style.display = "none"; }
      } else {
        if (iframe) { iframe.style.display = "none"; }
        if (msg) { msg.style.display = ""; }
      }
    }
    vrTabs.forEach(function (t) {
      on(t, "click", function (e) { e.preventDefault(); paintVr(t.getAttribute("data-type-slug")); });
    });
    // TYPES is read by the boot block below, so label and paint once the catalogue is in.
    d.addEventListener("sd2:catalogue", function () {
      vrTabs.forEach(function (t) {
        // The tab text is CMS-bound to the type name ("Sanford Heart A"); show the short form.
        var tt = TYPES[t.getAttribute("data-type-slug")];
        if (tt && tt.letter) { t.textContent = "Type " + tt.letter; }
      });
      if (vrTabs.length) { paintVr(vrTabs[0].getAttribute("data-type-slug")); }
    });

    // Bond calculator. Defaults come from the Properties CMS item (interest, term, deposit).
    var cfg = qs("[data-sd2-fin-config]");
    var CALC = { price: 0, dep: cfg ? num(cfg.getAttribute("data-deposit")) || 10 : 10,
                 rate: cfg ? num(cfg.getAttribute("data-rate")) || 11.25 : 11.25,
                 years: cfg ? num(cfg.getAttribute("data-years")) || 20 : 20, touched: false };
    /* Purchase price is not a free number: it can only be one of the prices the homes
       actually sell for. The slider becomes an index over that (sorted, de-duplicated)
       list, so every stop is a real price and there is nothing in between to land on. */
    var PRICES = [];
    function buildPrices() {
      var seen = {};
      PRICES = [];
      UNITS.forEach(function (u) { if (u.price && !seen[u.price]) { seen[u.price] = 1; PRICES.push(u.price); } });
      if (PRE) { PRICES = fromPrice() ? [fromPrice()] : []; }
      PRICES.sort(function (a, b) { return a - b; });
      qsa("input[data-calc=price]").forEach(function (inp) {
        if (!PRICES.length) { return; }
        inp.min = "0";
        inp.max = String(PRICES.length - 1);
        inp.step = "1";
        // One price across the whole development: nothing to choose, so don't pretend.
        inp.disabled = PRICES.length < 2;
        var host = inp.parentNode;
        if (host && host.setAttribute) { host.setAttribute("data-stops", String(PRICES.length)); }
      });
    }
    function priceAt(i) { return PRICES[Math.max(0, Math.min(PRICES.length - 1, Math.round(i)))] || 0; }
    function priceIndex(p) {
      var best = 0, gap = Infinity;
      PRICES.forEach(function (v, i) { var g = Math.abs(v - p); if (g < gap) { gap = g; best = i; } });
      return best;
    }
    function monthly(price, depPct, rate, years) {
      var loan = price - Math.round(price * depPct / 100), r = rate / 100 / 12, n = years * 12;
      return r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
    }
    function paintFinance() {
      var u = SEL.selected && unitBy(SEL.selected);
      var price = CALC.touched && CALC.price ? CALC.price : (u ? u.price : 0);
      if (PRE) { price = fromPrice(); u = null; }
      if (!price) { return; }
      var dep = Math.round(price * CALC.dep / 100), loan = price - dep, m = monthly(price, CALC.dep, CALC.rate, CALC.years);
      qsa("[data-sd2-fin]").forEach(function (el) {
        var k = el.getAttribute("data-sd2-fin");
        if (k === "price") { el.textContent = money(price); }
        else if (k === "deposit") { el.textContent = money(dep); }
        else if (k === "bond") { el.textContent = money(loan); }
        else if (k === "monthly") { el.textContent = money(m); }
        else if (k === "transfer") { el.textContent = "R0"; }
        else if (k === "dep-pct") { el.textContent = CALC.dep + "%"; }
        else if (k === "rate") { el.textContent = CALC.rate + "%"; }
        else if (k === "years") { el.textContent = CALC.years + " years"; }
        else if (k === "home") { el.textContent = u ? "Home " + u.n : ""; }
        else if (k === "levies") { el.textContent = u && u.detail ? text(qs("[data-sd2-detail=levies]", u.detail)) : ""; }
        else if (k === "rates") { el.textContent = u && u.detail ? text(qs("[data-sd2-detail=rates]", u.detail)) : ""; }
        else if (k === "note") { el.textContent = "Based on " + (PRE ? "the from price of " + money(price) : (u ? "home " + u.n : "the selected home") + " at " + money(price)) + ", " + CALC.dep + "% deposit, " + CALC.rate + "% over " + CALC.years + " years. Indicative only."; }
      });
      // "+ est. levies & rates" only when the CMS has figures for this home.
      var lev = qs("[data-sd2-fin=levies]"), rat = qs("[data-sd2-fin=rates]"), sub = qs(".sd2_calc_sub");
      if (sub) { sub.style.display = (text(lev) || text(rat)) ? "" : "none"; }
      qsa("input[data-calc]").forEach(function (inp) {
        var k = inp.getAttribute("data-calc");
        if (k === "price") { inp.value = priceIndex(price); inp.setAttribute("aria-valuetext", money(price)); }
        if (k === "deposit") { inp.value = CALC.dep; }
        if (k === "rate") { inp.value = CALC.rate; }
        if (k === "years") { inp.value = CALC.years; }
      });
    }
    qsa("input[data-calc]").forEach(function (inp) {
      on(inp, "input", function () {
        var k = inp.getAttribute("data-calc"), v = num(inp.value);
        if (k === "price") { CALC.price = priceAt(v); CALC.touched = true; }
        else if (k === "deposit") { CALC.dep = v; }
        else if (k === "rate") { CALC.rate = v; }
        else if (k === "years") { CALC.years = v; }
        paintFinance();
      });
    });
    var drawer = qs("[data-sd2-calc]"), backdrop = qs("[data-sd2-calc-backdrop]");
    function setCalc(open) {
      if (drawer) { drawer.classList.toggle("is-open", open); drawer.setAttribute("aria-hidden", open ? "false" : "true"); }
      if (backdrop) { backdrop.classList.toggle("is-open", open); }
      d.documentElement.classList.toggle("sd2-calc-open", open);
    }
    qsa("[data-sd2-calc-open]").forEach(function (b) { on(b, "click", function (e) { e.preventDefault(); paintFinance(); setCalc(true); }); });
    qsa("[data-sd2-calc-close]").forEach(function (b) { on(b, "click", function (e) { e.preventDefault(); setCalc(false); }); });
    on(backdrop, "click", function () { setCalc(false); });
    on(d, "keydown", function (e) { if (e.key === "Escape") { setCalc(false); } });
    d.addEventListener("sd2:selected", function () { CALC.touched = false; paintFinance(); });
    d.addEventListener("sd2:catalogue", function () { buildPrices(); paintFinance(); });
    buildPrices();
    paintFinance();
  })();

  /* ----------------------------------------------------------- 13. maps (click-to-load, no third-party bytes until asked) */
  (function maps() {
    var lat = -25.7915, lng = 28.2430;
    var cfg = qs("[data-sd2-geo]");
    if (cfg) { lat = num(cfg.getAttribute("data-lat")) || lat; lng = num(cfg.getAttribute("data-lng")) || lng; }
    function osm() {
      var dLat = 0.006, dLng = 0.009;
      var bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].join("%2C");
      return "https://www.openstreetmap.org/export/embed.html?bbox=" + bbox + "&layer=mapnik&marker=" + lat + "%2C" + lng;
    }
    function inject(host) {
      if (!host || qs("iframe", host)) { return; }
      var f = d.createElement("iframe");
      f.className = "sd2_map_iframe";
      f.setAttribute("title", "Map of 314 Sanford Street, Waterkloof Ridge");
      f.setAttribute("loading", "lazy");
      f.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
      f.src = osm();
      host.appendChild(f);
    }
    qsa("[data-sd2-map-load]").forEach(function (b) {
      on(b, "click", function (e) {
        e.preventDefault();
        var host = b.closest(".sd2_loc_map");
        inject(host);
        b.style.display = "none";
      });
    });
    var aerial = qs(".sd2_aerial_map");
    qsa("[data-sd2-aerial-toggle]").forEach(function (b) {
      on(b, "click", function (e) {
        e.preventDefault();
        if (!aerial) { return; }
        var open = !aerial.classList.contains("is-open");
        if (open) { inject(qs(".sd2_aerial_map_host", aerial) || aerial); }
        aerial.classList.toggle("is-open", open);
        qsa("[data-sd2-aerial-toggle][data-label-open]").forEach(function (x) {
          x.textContent = open ? x.getAttribute("data-label-open") : x.getAttribute("data-label-closed");
        });
      });
    });
  })();

  /* ----------------------------------------------------------- 15. pre-launch: countdown, waitlist, gate

     Everything here is off unless the page says data-sd2-phase="prelaunch".

     THE WAITLIST IS MEMBERSTACK. Joining is a passwordless sign-up (email + optional mobile,
     then a 6-digit code) onto the Sanford Heart plan; the homes someone wants live on the
     member as "waitlist-homes", the date as "waitlist-joined". Being on that plan is what
     lifts the blur off the availability selector and the prices.

     The section 09 form (#reservation-form) stays a native Webflow form: once Memberstack
     has the member, the same submit is let through to Webflow, so the sales team keeps its
     form notification and submissions export. A join from anywhere else on the page
     (hero, nav, the gate, a home's card) finishes by filling that form and submitting it
     too, so every new waitlist member reaches the team the same way.

     The blur is presentation, not security: prices are in the page source for anyone who
     reads HTML. Per-home prices are hidden in the page itself before launch (the detail
     cards say "Priced at launch"); only the development's from-price is ever painted.

     Memberstack calls are the DOM package's own: sendMemberSignupPasswordlessEmail,
     signupMemberPasswordless, sendMemberLoginPasswordlessEmail, loginMemberPasswordless,
     addPlan, updateMember, getCurrentMember. None of them redirect, so the app's global
     "after signup" redirect and the plan's own redirect never fire from this page. */
  (function prelaunch() {
    if (!PRE) { return; }
    var html = d.documentElement;
    var ST = { ms: null, member: null, onList: false, homes: [], pendingHomes: [], email: "", phone: "",
               mode: "signup", after: null, busy: false, pass: false };

    /* ---------------- countdown */
    // Spelled out by hand: Intl's short month is "Sept" in some locales and "Sep" in others.
    var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    function launchLabel(long) {
      if (!LAUNCH) { return ""; }
      // Always Johannesburg time (UTC+2, no daylight saving), whatever the visitor's clock says.
      var dt = new Date(LAUNCH + 2 * 3600 * 1000);
      var day = DAYS[dt.getUTCDay()], mon = MONTHS[dt.getUTCMonth()];
      var time = pad(dt.getUTCHours()) + ":" + pad(dt.getUTCMinutes());
      return long ? day + " " + dt.getUTCDate() + " " + mon + " · " + time
                  : day.slice(0, 3) + " " + dt.getUTCDate() + " " + mon.slice(0, 3) + " · " + time;
    }
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    function tick() {
      var left = Math.max(0, LAUNCH - Date.now());
      var s = Math.floor(left / 1000), dd = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600),
          mm = Math.floor(s % 3600 / 60), ss = s % 60;
      qsa("[data-sd2-cd]").forEach(function (el) {
        var k = el.getAttribute("data-sd2-cd");
        el.textContent = k === "d" ? pad(dd) : k === "h" ? pad(hh) : k === "m" ? pad(mm) : pad(ss);
      });
      var live = LAUNCH && left <= 0;
      html.classList.toggle("sd2-launched", !!live);
      qsa("[data-sd2-launch-label]").forEach(function (el) {
        var long = el.getAttribute("data-sd2-launch-label") !== "short";
        el.textContent = live ? "Sanford Heart is live" : (long ? "Launching " : "") + launchLabel(long);
      });
      // The sticky bar trades the selected home for the countdown before launch.
      var bar = qs("[data-sd2-bar]");
      if (bar) {
        var no = qs(".sd2_bar_no", bar), ty = qs(".sd2_bar_type", bar), pr = qs(".sd2_bar_price", bar);
        if (no) { no.textContent = "SH"; }
        if (ty) { ty.textContent = live ? "Sanford Heart is live" : "Launching in"; }
        if (pr) { pr.textContent = live ? "" : (dd ? dd + "d " : "") + pad(hh) + "h " + pad(mm) + "m " + pad(ss) + "s"; }
      }
      return live;
    }
    if (LAUNCH) { tick(); var cdTimer = setInterval(function () { if (tick()) { clearInterval(cdTimer); } }, 1000); }

    /* ---------------- prices: only ever the from-price, and only once you're on the list.
       Until then the head CSS swaps each value for "Join waitlist to see pricing" (the headline
       prices) or a dash (figures derived from the price), so the calculator can't give it away. */
    function paintPrices() {
      var f = fromPrice();
      qsa("[data-sd2-count=from-price], .sd2_type_from_val, [data-sd2-wl=from], .sd2_fin_val[data-sd2-fin=price], .sd2_fin_note")
        .forEach(function (el) { el.setAttribute("data-sd2-price", ""); });
      qsa("[data-sd2-fin], .sd2_calc_row_val, .sd2_calc_big").forEach(function (el) {
        if (el.hasAttribute("data-sd2-price") || /^(home|rate|years|dep-pct)$/.test(el.getAttribute("data-sd2-fin") || "")) { return; }
        el.setAttribute("data-sd2-price", "derived");
      });
      qsa("[data-sd2-wl=from]").forEach(function (el) { el.textContent = f ? money(f) : "On consultation"; });
    }
    /* Delegated clicks below listen in the CAPTURE phase on document. nativeAnchors() stops
       propagation at every in-page link in the bubble phase, so a bubble listener up here
       would never hear a click on an <a href="#sd2-reserve">. */
    // A hidden price is a door, not a dead end - and so is the bond calculator, which is
    // nothing but prices until you're on the list.
    on(d, "click", function (e) {
      var p = e.target.closest && e.target.closest("[data-sd2-price], [data-sd2-calc-open]");
      if (!p || html.classList.contains("sd2-member")) { return; }
      e.preventDefault();
      e.stopPropagation();
      openAuth("email");
    }, true);

    /* ---------------- Memberstack */
    function whenMs(cb) {
      var t0 = Date.now();
      (function poll() {
        if (w.$memberstackDom) { ST.ms = w.$memberstackDom; cb(ST.ms); return; }
        if (Date.now() - t0 > 12000) { log("memberstack never arrived"); cb(null); return; }
        setTimeout(poll, 80);
      })();
    }
    function onPlan(m) {
      return !!(m && (m.planConnections || []).some(function (p) {
        return p.planId === MS_PLAN && p.active !== false && String(p.status || "").toUpperCase() !== "CANCELED";
      }));
    }
    function homesFrom(str) {
      var out = [];
      String(str || "").replace(/\d+/g, function (n) { n = String(parseInt(n, 10)); if (out.indexOf(n) < 0) { out.push(n); } });
      return out.sort(function (a, b) { return a - b; });
    }
    var homesLabel = function (list) { return list.length ? list.map(function (n) { return "Home " + n; }).join(", ") : ""; };

    function setMember(m) {
      ST.member = m || null;
      ST.onList = onPlan(m);
      ST.homes = m && m.customFields ? homesFrom(m.customFields["waitlist-homes"]) : [];
      html.classList.toggle("sd2-member", ST.onList);
      html.classList.toggle("sd2-signed-in", !!m);
      html.classList.add("sd2-auth-known");
      paintWaitlist();
    }

    function msError(err) {
      var code = err && err.code ? String(err.code) : "";
      var msg = err && err.message ? String(err.message) : "";
      if (/invalid-token|expired/i.test(code + msg)) { return "That code didn't work. Check the latest email, or send a new one."; }
      if (/disposable/i.test(code + msg)) { return "Please use a personal or work email address."; }
      if (/invalid-email/i.test(code) || /valid email/i.test(msg)) { return "That email address doesn't look right."; }
      if (/rate|too many/i.test(code + msg)) { return "Too many attempts. Wait a minute and try again."; }
      return msg || "Something went wrong. Please try again.";
    }

    // Everything a new or returning member should carry, merged over what they already have.
    function memberFields(extra) {
      var cf = {};
      var have = ST.member && ST.member.customFields ? ST.member.customFields : {};
      var homes = homesFrom([ (have["waitlist-homes"] || ""), (extra.homes || []).join(",") ].join(","));
      if (extra.replaceHomes) { homes = extra.homes.slice(); }
      cf["waitlist-homes"] = homesLabel(homes);
      if (!have["waitlist-joined"]) { cf["waitlist-joined"] = new Date().toISOString().slice(0, 10); }
      if (extra.phone) { cf["mobile-number"] = extra.phone; }
      if (extra.first) { cf["first-name"] = extra.first; }
      if (extra.last) { cf["last-name"] = extra.last; }
      return cf;
    }

    // Signed-in member: make sure they're on the plan, then write the fields.
    function saveMember(extra) {
      var ms = ST.ms, chain = Promise.resolve();
      if (!onPlan(ST.member) && MS_PLAN) {
        chain = chain.then(function () { return ms.addPlan({ planId: MS_PLAN }); })
          .catch(function (e) { log("addPlan", e && e.message); });
      }
      return chain.then(function () { return ms.updateMember({ customFields: memberFields(extra) }); })
        .then(function () { return ms.getCurrentMember(); })
        .then(function (r) { setMember(r && r.data); return r && r.data; });
    }

    /* ---------------- the sign-up dialog */
    var auth = qs("[data-sd2-auth]");
    var lastFocus = null;
    function authErr(msg) {
      qsa("[data-sd2-auth-error]", auth).forEach(function (el) { el.textContent = msg || ""; el.style.display = msg ? "" : "none"; });
    }
    function step(name) {
      if (!auth) { return; }
      qsa("[data-sd2-auth-step]", auth).forEach(function (el) {
        el.style.display = el.getAttribute("data-sd2-auth-step") === name ? "" : "none";
      });
      authErr("");
      var f = qs("[data-sd2-auth-step=\"" + name + "\"] input:not([type=hidden])", auth);
      if (f) { setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }, 60); }
    }
    function paintAuthHomes() {
      qsa("[data-sd2-auth-homes]", auth).forEach(function (el) {
        el.textContent = ST.pendingHomes.length ? "Joining for " + homesLabel(ST.pendingHomes) : "";
        el.style.display = ST.pendingHomes.length ? "" : "none";
      });
    }
    function openAuth(name, opts) {
      opts = opts || {};
      if (!auth) { return; }
      ST.pendingHomes = opts.homes || ST.pendingHomes || [];
      ST.after = opts.after || null;
      lastFocus = d.activeElement;
      paintAuthHomes();
      auth.classList.add("is-open");
      auth.setAttribute("aria-hidden", "false");
      html.classList.add("sd2-auth-open");
      step(name || "email");
    }
    function closeAuth() {
      if (!auth) { return; }
      auth.classList.remove("is-open");
      auth.setAttribute("aria-hidden", "true");
      html.classList.remove("sd2-auth-open");
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    }
    function busy(btn, on_, label) {
      if (!btn) { return; }
      if (on_) { btn.setAttribute("data-label", btn.textContent); btn.textContent = label || "One moment…"; btn.disabled = true; }
      else { btn.textContent = btn.getAttribute("data-label") || btn.textContent; btn.disabled = false; }
    }

    function codeSentTo(email) {
      qsa("[data-sd2-auth-step=code] .sd2_auth_text", auth).forEach(function (el) {
        el.textContent = "We've sent a 6-digit code to " + email + ". It's valid for 10 minutes.";
      });
    }
    // Step 1: send the code. A new email gets a sign-up code; one Memberstack already knows
    // gets a login code instead, without the visitor having to know which they are.
    function sendCode(email) {
      var ms = ST.ms;
      if (!ms) { return Promise.reject({ message: "Sign-up is still loading. Try again in a moment." }); }
      ST.email = email;
      return ms.sendMemberSignupPasswordlessEmail({ email: email })
        .then(function () { ST.mode = "signup"; })
        .catch(function (err) {
          if (/already|in-use|exists/i.test((err && err.code || "") + " " + (err && err.message || ""))) {
            return ms.sendMemberLoginPasswordlessEmail({ email: email }).then(function () { ST.mode = "login"; });
          }
          throw err;
        });
    }
    // Step 2: verify, then join the plan and write the fields.
    function verify(code) {
      var ms = ST.ms, extra = { homes: ST.pendingHomes, phone: ST.phone, first: ST.first, last: ST.last };
      if (ST.mode === "signup") {
        return ms.signupMemberPasswordless({
          email: ST.email, passwordlessToken: code,
          plans: MS_PLAN ? [{ planId: MS_PLAN }] : [],
          customFields: memberFields(extra)
        }).then(function (r) { setMember(r && r.data && (r.data.member || r.data)); return ms.getCurrentMember(); })
          .then(function (r) { setMember(r && r.data); });
      }
      return ms.loginMemberPasswordless({ email: ST.email, passwordlessToken: code })
        .then(function (r) { setMember(r && r.data && (r.data.member || r.data)); return saveMember(extra); });
    }

    if (auth) {
      auth.setAttribute("aria-hidden", "true");
      // The dialog's <button>s are DOM elements, which carry no text in the Designer.
      var LABELS = { email: "Continue", code: "Verify & Continue" };
      qsa("[data-sd2-auth-form]", auth).forEach(function (f) {
        var b = qs("button[type=submit]", f);
        if (b && !text(b)) { b.textContent = b.getAttribute("data-label") || LABELS[f.getAttribute("data-sd2-auth-form")] || "Continue"; }
      });
      qsa("button[data-sd2-auth-close]", auth).forEach(function (b) { if (!text(b)) { b.textContent = "\u00d7"; } });
      qsa("[data-sd2-auth-close]", auth).forEach(function (b) { on(b, "click", function (e) { e.preventDefault(); closeAuth(); }); });
      on(d, "keydown", function (e) { if (e.key === "Escape" && auth.classList.contains("is-open")) { closeAuth(); } });
      qsa("[data-sd2-auth-back]", auth).forEach(function (b) { on(b, "click", function (e) { e.preventDefault(); step("email"); }); });
      qsa("[data-sd2-auth-resend]", auth).forEach(function (b) {
        on(b, "click", function (e) {
          e.preventDefault();
          if (!ST.email) { step("email"); return; }
          sendCode(ST.email).then(function () { authErr("A new code is on its way."); }).catch(function (err) { authErr(msError(err)); });
        });
      });
      qsa("[data-sd2-auth-go]", auth).forEach(function (b) {
        on(b, "click", function () { closeAuth(); });
      });
      var fEmail = qs("[data-sd2-auth-form=email]", auth), fCode = qs("[data-sd2-auth-form=code]", auth);
      on(fEmail, "submit", function (e) {
        e.preventDefault();
        var em = qs("input[type=email]", fEmail), ph = qs("input[type=tel]", fEmail), btn = qs("[type=submit]", fEmail);
        var email = em ? String(em.value || "").trim() : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { authErr("Enter your email address."); if (em) { em.focus(); } return; }
        ST.phone = ph ? String(ph.value || "").trim() : "";
        busy(btn, true, "Sending your code…");
        sendCode(email).then(function () {
          codeSentTo(email);
          step("code");
        }).catch(function (err) { authErr(msError(err)); })
          .then(function () { busy(btn, false); });
      });
      on(fCode, "submit", function (e) {
        e.preventDefault();
        var inp = qs("input", fCode), btn = qs("[type=submit]", fCode);
        var code = inp ? String(inp.value || "").replace(/\D/g, "") : "";
        if (code.length !== 6) { authErr("Enter the 6-digit code from the email."); return; }
        busy(btn, true, "Checking…");
        verify(code).then(function () {
          if (inp) { inp.value = ""; }
          var then = ST.after; ST.after = null;
          if (then) { closeAuth(); then(); return; }
          notifyTeam();
          step("done");
        }).catch(function (err) { authErr(msError(err)); })
          .then(function () { busy(btn, false); });
      });
      // The code box: digits only, and submit itself on the sixth.
      var ci = fCode && qs("input", fCode);
      on(ci, "input", function () {
        var v = String(ci.value || "").replace(/\D/g, "").slice(0, 6);
        if (ci.value !== v) { ci.value = v; }
        if (v.length === 6 && fCode.requestSubmit) { fCode.requestSubmit(); }
      });
    }

    /* ---------------- CTAs anywhere: [data-sd2-waitlist] (optionally data-sd2-homes="2,5") */
    on(d, "click", function (e) {
      var a = e.target.closest && e.target.closest("[data-sd2-waitlist], [data-sd2-signin]");
      if (!a) { return; }
      var homes = homesFrom(a.getAttribute("data-sd2-homes") || "");
      if (ST.onList) {
        // Already on the list: a CTA just takes you to the form, where homes can be changed.
        if (homes.length) { e.preventDefault(); toggleHome(homes[0], true); }
        return;
      }
      e.preventDefault();
      if (ST.member) {   // signed in (another Heartland plan) but not on this list: one click
        saveMember({ homes: homes }).then(function () { notifyTeam(); openAuth("done"); });
        return;
      }
      openAuth("email", { homes: homes });
    }, true);

    /* ---------------- a home's card: join / add / remove */
    function toggleHome(n, forceOn) {
      n = String(n);
      var has = ST.homes.indexOf(n) >= 0;
      if (has && forceOn) { return Promise.resolve(); }
      var list = has ? ST.homes.filter(function (x) { return x !== n; }) : ST.homes.concat([n]);
      return saveMember({ homes: list, replaceHomes: true });
    }
    function paintDetailCtas() {
      UNITS.forEach(function (u) {
        var cta = u.detail && qs("[data-sd2-detail=cta]", u.detail);
        if (!cta) { return; }
        if (u.status !== "Available") { cta.style.display = "none"; return; }
        cta.style.display = "";
        var mine = ST.homes.indexOf(u.n) >= 0;
        cta.classList.toggle("is-on-list", mine);
        cta.textContent = !ST.onList ? "Join the Waitlist for Home " + u.n
          : mine ? "On Your Waitlist ✓" : "Add Home " + u.n + " to Your Waitlist";
        cta.setAttribute("href", "#sd2-reserve");
        cta.setAttribute("data-sd2-home", u.n);
      });
    }
    on(d, "click", function (e) {
      var cta = e.target.closest && e.target.closest("[data-sd2-detail=cta][data-sd2-home]");
      if (!cta) { return; }
      e.preventDefault();
      var n = cta.getAttribute("data-sd2-home");
      if (!ST.onList) {
        if (ST.member) { saveMember({ homes: [n] }).then(function () { notifyTeam(); openAuth("done"); }); return; }
        openAuth("email", { homes: [n] });
        return;
      }
      busy(cta, true, "Saving…");
      toggleHome(n).catch(function (err) { log("toggle", err && err.message); })
        .then(function () { busy(cta, false); chosen = ST.homes.slice(); paintWaitlist(); });
    }, true);

    /* ---------------- section 09: the waitlist form */
    var form = qs("#reservation-form");
    var picker = qs("[data-sd2-wl-picker]");
    var chosen = [];
    function paintPicker() {
      if (!picker || !UNITS.length) { return; }
      if (!picker.getAttribute("data-built")) {
        picker.setAttribute("data-built", "1");
        picker.innerHTML = "";
        var lab = d.createElement("div");
        lab.className = "sd2_wl_label";
        lab.textContent = "Homes you're interested in (optional)";
        picker.appendChild(lab);
        var row = d.createElement("div");
        row.className = "sd2_wl_chips";
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", "Homes you're interested in");
        UNITS.filter(function (u) { return u.status === "Available"; }).forEach(function (u) {
          var b = d.createElement("button");
          b.type = "button";
          b.className = "sd2_wl_chip";
          b.setAttribute("data-home", u.n);
          b.setAttribute("aria-pressed", "false");
          b.textContent = "Home " + u.n + " · Type " + u.letter;
          on(b, "click", function () {
            var i = chosen.indexOf(u.n);
            if (i >= 0) { chosen.splice(i, 1); } else { chosen.push(u.n); }
            paintPicker();
          });
          row.appendChild(b);
        });
        picker.appendChild(row);
      }
      qsa(".sd2_wl_chip", picker).forEach(function (b) {
        var onIt = chosen.indexOf(b.getAttribute("data-home")) >= 0;
        b.classList.toggle("is-active", onIt);
        b.setAttribute("aria-pressed", onIt ? "true" : "false");
      });
      var hid = form && qs("input[name=\"Waitlist Homes\"], #sd2-unit-id", form);
      if (hid) { hid.value = homesLabel(chosen.slice().sort(function (a, b) { return a - b; })); }
      qsa("[data-sd2-wl=homes]").forEach(function (el) { el.textContent = chosen.length ? homesLabel(chosen) : "Any home"; });
    }
    function field(id) { return d.getElementById(id); }
    function prepForm() {
      if (!form) { return; }
      form.setAttribute("data-name", "Sanford Waitlist");
      form.setAttribute("name", "sanford-waitlist");
      // Only the email is required to join; everything else is a courtesy.
      [["sd2-first-name", "First name (optional)"], ["sd2-last-name", "Last name (optional)"],
       ["sd2-contact-number", "Mobile (optional)"], ["sd2-message", "Anything we should know? (optional)"]].forEach(function (x) {
        var el = field(x[0]);
        if (el) { el.removeAttribute("required"); el.setAttribute("placeholder", x[1]); }
      });
      var em = field("sd2-email");
      if (em) { em.setAttribute("placeholder", "Email address"); em.setAttribute("autocomplete", "email"); }
      var ph = field("sd2-contact-number");
      if (ph) { ph.setAttribute("autocomplete", "tel"); }
      var hid = field("sd2-unit-id");
      if (hid) { hid.setAttribute("name", "Waitlist Homes"); hid.setAttribute("data-name", "Waitlist Homes"); }
      var sub = qs("input[type=submit]", form);
      if (sub) { sub.value = "Join the Waitlist"; sub.setAttribute("data-wait", "Adding you to the list…"); }
      var note = qs("[data-sd2-selected=note]", form);
      if (note) { note.textContent = "No password, no payment. We'll email you a 6-digit code to confirm it's you."; }
    }
    function paintWaitlist() {
      paintDetailCtas();
      if (form) {
        var em = field("sd2-email"), ph = field("sd2-contact-number"), fn = field("sd2-first-name"), ln = field("sd2-last-name");
        var m = ST.member;
        if (m && m.auth && em && !em.value) { em.value = m.auth.email || ""; }
        if (m && m.customFields) {
          if (ph && !ph.value && m.customFields["mobile-number"]) { ph.value = m.customFields["mobile-number"]; }
          if (fn && !fn.value && m.customFields["first-name"]) { fn.value = m.customFields["first-name"]; }
          if (ln && !ln.value && m.customFields["last-name"]) { ln.value = m.customFields["last-name"]; }
        }
        if (ST.onList && !form.getAttribute("data-seeded")) { form.setAttribute("data-seeded", "1"); chosen = ST.homes.slice(); }
        var note = qs("[data-sd2-selected=note]", form);
        if (note && ST.onList) { note.textContent = "You're on the list. Change your homes any time and update."; }
        var sub = qs("input[type=submit]", form);
        if (sub) { sub.value = ST.onList ? "Update My Waitlist" : "Join the Waitlist"; }
      }
      paintPicker();
      qsa("[data-sd2-wl=status]").forEach(function (el) {
        el.textContent = ST.onList ? (ST.homes.length ? "On the list · " + homesLabel(ST.homes) : "On the list") : "Not yet";
      });
    }

    // Hand the (already Memberstack-saved) submission to Webflow's own form handler.
    function nativeSubmit() {
      if (!form) { return; }
      ST.pass = true;
      if (form.requestSubmit) { form.requestSubmit(); } else { form.submit(); }
    }
    // A join from outside section 09 still reaches the team: fill the form and send it.
    function notifyTeam() {
      if (!form || form.getAttribute("data-notified")) { return; }
      form.setAttribute("data-notified", "1");
      var m = ST.member || {};
      var em = field("sd2-email"), ph = field("sd2-contact-number");
      if (em) { em.value = (m.auth && m.auth.email) || ST.email || em.value; }
      if (ph && !ph.value) { ph.value = ST.phone || (m.customFields && m.customFields["mobile-number"]) || ""; }
      chosen = ST.homes.slice();
      paintPicker();
      nativeSubmit();
    }

    // Capture on window runs before anything on document (heartland-reserve.js listens
    // there) and before Webflow's own handler on the form.
    w.addEventListener("submit", function (e) {
      if (!form || e.target !== form) { return; }
      if (ST.pass) { ST.pass = false; form.setAttribute("data-notified", "1"); return; }   // second pass: Webflow's turn
      e.preventDefault();
      e.stopImmediatePropagation();
      if (ST.busy) { return; }
      var em = field("sd2-email");
      var email = em ? String(em.value || "").trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { if (em && em.reportValidity) { em.reportValidity(); } return; }
      var extra = { homes: chosen.slice(), replaceHomes: ST.onList, phone: String((field("sd2-contact-number") || {}).value || "").trim(),
                    first: String((field("sd2-first-name") || {}).value || "").trim(), last: String((field("sd2-last-name") || {}).value || "").trim() };
      var sub = qs("input[type=submit]", form);
      ST.busy = true;
      if (sub) { sub.setAttribute("data-was", sub.value); sub.value = "One moment…"; }
      function done() { ST.busy = false; if (sub) { sub.value = sub.getAttribute("data-was") || sub.value; } }
      var mine = ST.member && ST.member.auth && String(ST.member.auth.email || "").toLowerCase() === email.toLowerCase();
      if (mine) {
        saveMember(extra).then(function () { done(); nativeSubmit(); }).catch(function (err) { done(); alertForm(msError(err)); });
        return;
      }
      // Not signed in (or a different email): confirm the email first, then come back here.
      ST.phone = extra.phone; ST.first = extra.first; ST.last = extra.last; ST.pendingHomes = extra.homes;
      sendCode(email).then(function () {
        done();
        codeSentTo(email);
        openAuth("code", { homes: extra.homes, after: function () { nativeSubmit(); } });
      }).catch(function (err) { done(); alertForm(msError(err)); });
    }, true);
    function alertForm(msg) {
      var note = form && qs("[data-sd2-selected=note]", form);
      if (note) { note.textContent = msg; note.classList.add("is-error"); setTimeout(function () { note.classList.remove("is-error"); }, 6000); }
    }

    /* ---------------- boot */
    prepForm();
    // Every "join" on the page opens the same flow, whatever the Designer called it.
    qsa(".sd2_bar_cta, a.sd2_inline-link[href=\"#sd2-reserve\"], .sd2_footer_link[href=\"#sd2-reserve\"]").forEach(function (a) {
      if (/wait/i.test(text(a))) { a.setAttribute("data-sd2-waitlist", ""); }
    });
    d.addEventListener("sd2:catalogue", function () { paintPrices(); paintWaitlist(); });
    whenMs(function (ms) {
      if (!ms) { html.classList.add("sd2-auth-known"); return; }
      ms.getCurrentMember().then(function (r) { setMember(r && r.data); }).catch(function () { setMember(null); });
      if (ms.onAuthChange) { ms.onAuthChange(function (m) { setMember(m && (m.data || m)); }); }
    });
    w.SD2_WAITLIST = { state: ST, open: openAuth, close: closeAuth };
  })();

  /* ----------------------------------------------------------- 16. points of interest modal
     Section 06 lists the six key places; "See All Points of Interest" opens [data-sd2-poi], a
     native Webflow block holding the full list. Open/close only - the content lives in the
     Designer. Delegated in the CAPTURE phase (see nativeAnchors: in-page links stop
     propagation in the bubble phase). */
  (function poi() {
    var modal = qs("[data-sd2-poi]");
    if (!modal) { return; }
    var html = d.documentElement, last = null;
    function open(from) {
      last = from || d.activeElement;
      modal.classList.add("is-open");
      html.classList.add("sd2-poi-open");
      var c = qs("a[data-sd2-poi-close]", modal);
      if (c) { setTimeout(function () { try { c.focus({ preventScroll: true }); } catch (e) {} }, 60); }
    }
    function close() {
      if (!modal.classList.contains("is-open")) { return; }
      modal.classList.remove("is-open");
      html.classList.remove("sd2-poi-open");
      if (last && last.focus) { try { last.focus({ preventScroll: true }); } catch (e) {} }
    }
    on(d, "click", function (e) {
      var t = e.target.closest && e.target.closest("[data-sd2-poi-open], [data-sd2-poi-close]");
      if (!t) { return; }
      e.preventDefault();
      e.stopPropagation();
      if (t.hasAttribute("data-sd2-poi-open")) { open(t); } else { close(); }
    }, true);
    on(d, "keydown", function (e) { if (e.key === "Escape") { close(); } });
    w.SD2_POI = { open: open, close: close };
  })();

  /* ----------------------------------------------------------- 14. boot the catalogue-driven parts */
  (function boot() {
    readTypes();
    readUnits();
    log("types", Object.keys(TYPES), "units", UNITS.map(function (u) { return u.no + ":" + u.status; }));
    paintCounts();
    positionPins();
    bindSelector();
    try { d.dispatchEvent(new CustomEvent("sd2:catalogue")); } catch (e) {}
    // Team cards: the CMS phone is plain text, so build the dial link here and drop empty contacts.
    qsa(".sd2_team_contact").forEach(function (a) {
      var t = text(a);
      if (!t) { a.style.display = "none"; return; }
      if (/^[\d\s()+-]{7,}$/.test(t)) { a.setAttribute("href", "tel:" + t.replace(/[^\d+]/g, "")); }
    });
    /* Team: one CMS list (Teams, filtered to this property), shown in the Portal Group order
       the owners' portal uses — Heartland, the builder, conveyancer & bond. Each card carries
       its group as bound text ([data-sd2-team-group], hidden); the cards are sorted into one
       labelled grid per group here. Someone added to a group in the CMS just appears. */
    (function teamGroups() {
      var host = qs(".sd2_team_host");
      if (!host) { return; }
      var items = qsa(".w-dyn-item", host);
      if (!items.length) { return; }
      var ORDER = [["Heartland", "Heartland Property Developers"], ["Builder", "The builder"], ["Conveyancer & Bond", "Conveyancing & bond"]];
      var groups = {};
      items.forEach(function (it) {
        var g = text(qs("[data-sd2-team-group]", it)) || "Heartland";
        (groups[g] = groups[g] || []).push(it);
      });
      var keys = ORDER.map(function (o) { return o[0]; }).concat(Object.keys(groups).filter(function (k) {
        return !ORDER.some(function (o) { return o[0] === k; });
      }));
      var wrap = d.createElement("div");
      wrap.className = "sd2_team_groups";
      keys.forEach(function (k) {
        if (!groups[k]) { return; }
        var sec = d.createElement("div"); sec.className = "sd2_team_group";
        var h = d.createElement("div"); h.className = "sd2_team_group_head";
        var label = ORDER.filter(function (o) { return o[0] === k; })[0];
        h.textContent = label ? label[1] : k;
        var grid = d.createElement("div"); grid.className = "sd2_team_grid"; grid.setAttribute("role", "list");
        groups[k].forEach(function (it) {
          // The group heading already says "Heartland Property Developers".
          if (k === "Heartland") { qsa(".sd2_team_company", it).forEach(function (c) { c.style.display = "none"; }); }
          grid.appendChild(it);
        });
        sec.appendChild(h); sec.appendChild(grid); wrap.appendChild(sec);
      });
      var list = qs(".w-dyn-list", host);
      host.insertBefore(wrap, list || null);
      if (list) { list.style.display = "none"; }
      // A card's website link only when the CMS has one.
      qsa(".sd2_team_web", wrap).forEach(function (a) {
        var href = a.getAttribute("href") || "";
        if (!href || href === "#" || !text(a)) { a.style.display = "none"; }
      });
    })();

    /* Supporting documents come from the property's docs item (Portal - Unit Docs). A row
       whose "Coming soon" switch is on renders its .sd2_doc_soon tag; that row is not a
       download. A row with no file behind it is treated the same way. */
    qsa(".sd2_text_doc-link").forEach(function (a) {
      var href = a.getAttribute("href") || "";
      var soon = !!qs(".sd2_doc_soon", a) || !href || href === "#";
      a.classList.toggle("is-soon", soon);
      if (soon) {
        a.removeAttribute("href");
        a.setAttribute("aria-disabled", "true");
        a.setAttribute("title", "Coming soon");
      } else {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener");
      }
    });

    /* The home-loan application link lives on the Portal - Dashboards item (Pre-qualification
       Link) and is bound on "Start Your Application". The calculator's "Get Pre-Qualified"
       sits outside any Collection List, so it borrows that href. */
    var evo = qs("[data-sd2-evo-src]");
    var evoHref = evo ? evo.getAttribute("href") : "";
    if (evoHref && evoHref !== "#") {
      qsa("[data-sd2-evo], [data-sd2-evo-src]").forEach(function (a) {
        a.setAttribute("href", evoHref);
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener");
      });
    }

    // Let the other modules know which home is selected (upgrades filter, finance).
    var lastSel = null;
    setInterval(function () {
      if (SEL.selected !== lastSel) {
        lastSel = SEL.selected;
        try { d.dispatchEvent(new CustomEvent("sd2:selected", { detail: { slug: SEL.selected } })); } catch (e) {}
      }
    }, 150);
    // Field names and placeholders can't be set through the Webflow API (the published
    // form still says name="field", placeholder="Example Text"). Until they are set in
    // the Designer, give the inputs the names the reserve hand-off and Xano expect.
    var FIELDS = { "sd2-first-name": ["First-Name", "First name"], "sd2-last-name": ["Last-Name", "Last name"],
                   "sd2-email": ["Email", "Email"], "sd2-contact-number": ["Contact-Number", "Mobile"],
                   "sd2-message": ["Message", "Anything we should know?"], "sd2-unit-id": ["Unit ID", ""] };
    Object.keys(FIELDS).forEach(function (id) {
      var el = d.getElementById(id);
      if (!el) { return; }
      if (/^field(-\d+)?$/i.test(el.getAttribute("name") || "")) { el.setAttribute("name", FIELDS[id][0]); el.setAttribute("data-name", FIELDS[id][0]); }
      var ph = el.getAttribute("placeholder");
      if (!ph || ph === "Example Text") { if (FIELDS[id][1]) { el.setAttribute("placeholder", FIELDS[id][1]); } else { el.removeAttribute("placeholder"); } }
    });
    paintSelected();   // re-fill Unit ID now that the field carries its name
    d.documentElement.classList.add("sd2-ready");
    w.SD2 = { units: function () { return UNITS; }, types: function () { return TYPES; }, pick: pick, state: SEL };
  })();
})(window, document);
