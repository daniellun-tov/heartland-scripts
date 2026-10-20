/* ============================================================================
   HEARTLAND — NAPIER HEART page  (/napier-dev → /napier)

   One file, one tag. Runs only where the page carries [data-nh-page].
   Every module looks for its own root and does nothing when it is absent.

   WHAT LIVES HERE
     - Reveals (rise, split text, clip-path image reveals), drift and parallax
     - Nav state, scroll-led hero (name mask, condensing frame), sticky bar
     - "Carefully designed" section strips, room explorer, loft gallery + lightbox
     - Base/furnished compare slider, marquee, day slider, on-foot map, drives map
     - Availability façade: statuses, selection, detail card, floorplan modal
     - Explore more, VR tabs, finance figures, toasts
     - Pre-launch / launch system (phase, countdown, Memberstack waitlist, gate, auth dialog),
       ported from heartland-sanford-v2.js module 15 with the nh prefix

   WHAT IT NEVER DOES
     - Hold a unit fact: every home is read from the façade buttons' data-nh-* attributes
       (static for now; a Units CMS list can render the same attributes later).
     - Own the reservation: #reservation-form + heartland-reserve.js (data-hl-entry="napier").

   CLASS CONTRACT (JS state classes, styled in the page's custom CSS)
     .nh_rise + .in   .nh_split_text + .in (.nh_sw/.nh_c built here)   .nh_rv + .in
     .nh_nav + .is-pre .is-ink .is-solid .is-hide     #nh-intro-mask + .in
     .nh_room/.nh_stage_img/.nh_seg_btn/.nh_day_x /.nh_chip/.nh_prow/.nh_pin_wrap/.nh_route/
     .nh_dpin/.nh_dcard/.nh_unit/.nh_lp/.nh_vr_pane/.nh_pm_fig/.nh_auth_step + .is-on
     .nh_mq + .is-run   .nh_more + .is-open   .nh_pm/.nh_auth + .is-open   .nh_sbar + .is-on
     .nh_toast/.nh_gtoast + .is-on   .nh_unit + .is-reserved .is-sold
     html: nh-js nh-prelaunch nh-live nh-gated nh-member nh-signed-in nh-auth-known nh-launched nh-auth-open

   ?nh_debug=1 logs.
   ========================================================================== */
(function (w, d) {
  "use strict";

  var PAGE = d.querySelector("[data-nh-page]");
  if (!PAGE) { return; }

  var DEBUG = /[?&]nh_debug=1/.test(w.location.search);
  function log() { if (DEBUG && w.console) { console.log.apply(console, ["[nh]"].concat([].slice.call(arguments))); } }

  var html = d.documentElement;
  html.classList.add("nh-js");
  var EASE = "cubic-bezier(.22,1,.36,1)";
  var reduce = w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var qs = function (sel, root) { return (root || d).querySelector(sel); };
  var qsa = function (sel, root) { return [].slice.call((root || d).querySelectorAll(sel)); };
  var on = function (el, ev, fn, opts) { if (el) { el.addEventListener(ev, fn, opts || false); } };
  var text = function (el) { return el ? String(el.textContent || "").trim() : ""; };
  var num = function (v) { var n = parseFloat(String(v === null || v === undefined ? "" : v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
  var clamp = function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); };
  var eio = function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  function money(n) { return "R" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function short(n) { return "R" + (n / 1000000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + "m"; }
  // Every <button> in the Designer is a Link with href="#": these clicks never navigate.
  function stop(e) { if (e && e.preventDefault) { e.preventDefault(); } }

  /* PHASE (same contract as Sanford, nh prefix). On [data-nh-page]:
       data-nh-phase="prelaunch" | "live"   data-nh-launch="2026-11-26T12:00:00+02:00"
       data-nh-ms-plan="pln_…"   data-nh-gate="off" (optional: open prices once live)
     Preview on webflow.io: ?nh_phase=live|prelaunch, ?nh_demo=gated|open|off. */
  var PHASE = (PAGE.getAttribute("data-nh-phase") || "").toLowerCase();
  var LAUNCH = Date.parse(PAGE.getAttribute("data-nh-launch") || "") || 0;
  var MS_PLAN = PAGE.getAttribute("data-nh-ms-plan") || "";
  var PHASED = PHASE === "prelaunch" || PHASE === "live";
  var PRE = PHASE === "prelaunch" && !(LAUNCH && Date.now() >= LAUNCH);
  var STAGING = /\.webflow\.io$/i.test(String(w.location.hostname || ""));
  var DEMO_KEY = "nh_demo";
  var demoQ = /[?&]nh_demo=(gated|open|off)\b/.exec(w.location.search);
  var DEMO = "";
  try {
    if (!STAGING || (demoQ && demoQ[1] === "off")) { w.sessionStorage.removeItem(DEMO_KEY); }
    else if (demoQ) { w.sessionStorage.setItem(DEMO_KEY, demoQ[1]); }
    DEMO = STAGING ? (w.sessionStorage.getItem(DEMO_KEY) || "") : "";
  } catch (e) { DEMO = STAGING && demoQ && demoQ[1] !== "off" ? demoQ[1] : ""; }
  var forced = (STAGING && /[?&]nh_phase=(prelaunch|live)\b/.exec(w.location.search)) || (PHASED && DEMO ? [0, "live"] : null);
  if (PHASED && forced) { PRE = forced[1] === "prelaunch"; }
  var GATED = PHASED && (PRE || (DEMO !== "open" && (PAGE.getAttribute("data-nh-gate") || "").toLowerCase() !== "off"));
  if (PHASED && DEMO) {
    var addPill = function () {
      var path = w.location.pathname;
      var pill = d.createElement("div");
      pill.className = "nh_demo_pill";
      pill.setAttribute("role", "status");
      pill.setAttribute("style", "position:fixed;left:12px;top:84px;z-index:9998;display:flex;flex-wrap:wrap;align-items:center;gap:.25rem .75rem;max-width:calc(100vw - 24px);padding:.55rem .9rem;border-radius:4px;background:#2B2622;color:#F3EBE2;font:500 11px/1.35 halyard-text,sans-serif;letter-spacing:.03em;box-shadow:0 8px 24px rgba(43,38,34,.3)");
      var link = function (label, href, click) {
        var a = d.createElement("a"); a.textContent = label; a.href = href;
        a.setAttribute("style", "color:#C9957F;font-weight:700;text-decoration:none;white-space:nowrap");
        if (click) { a.addEventListener("click", click); }
        return a;
      };
      var b = d.createElement("b"); b.textContent = DEMO === "open" ? "Demo · open" : "Demo · gated"; b.setAttribute("style", "font-weight:700;white-space:nowrap");
      var note = d.createElement("span"); note.textContent = "Staging only · nothing is reserved"; note.setAttribute("style", "opacity:.7;white-space:nowrap");
      pill.appendChild(b); pill.appendChild(note);
      pill.appendChild(link(DEMO === "open" ? "Switch to gated" : "Switch to open", path + "?nh_demo=" + (DEMO === "open" ? "gated" : "open")));
      if (DEMO === "gated") {
        var out = link("Sign out", "#", function (e) { e.preventDefault(); var go = function () { w.location.reload(); }; try { w.$memberstackDom.logout().then(go, go); } catch (err) { go(); } });
        out.className = "nh_demo_signout"; pill.appendChild(out);
      }
      pill.appendChild(link("Exit demo", path + "?nh_demo=off"));
      var css = d.createElement("style"); css.textContent = "html:not(.nh-signed-in) .nh_demo_signout{display:none}";
      (d.head || html).appendChild(css);
      d.body.appendChild(pill);
    };
    if (d.readyState === "loading") { d.addEventListener("DOMContentLoaded", addPill); } else { addPill(); }
  }
  if (GATED) { html.classList.add("nh-gated"); }
  if (PHASED && !PRE) { html.classList.add("nh-live"); }
  if (PRE) {
    html.classList.add("nh-prelaunch");
    // Park heartland-reserve.js: before launch #reservation-form is the waitlist.
    qsa("[data-hl-entry]").forEach(function (el) {
      el.setAttribute("data-hl-entry-paused", el.getAttribute("data-hl-entry") || "");
      el.removeAttribute("data-hl-entry");
    });
  }

  /* ----------------------------------------------------------- 0. the catalogue
     Every home is a façade button carrying its facts. Read once, shared by every module. */
  var UNITS = qsa(".nh_unit[data-nh-unit]").map(function (el) {
    var a = function (k) { return el.getAttribute("data-nh-" + k) || ""; };
    var st = (el.getAttribute("data-status") || "available").toLowerCase();
    return { el: el, n: a("unit"), type: a("type") || "Studio", status: st.charAt(0).toUpperCase() + st.slice(1),
             price: num(a("price-num")) || num(a("price")), priceText: a("price"),
             internal: a("internal"), total: a("total"), beds: a("beds"), baths: a("baths"), out: a("out"), outLabel: a("out-label") || "Balcony",
             floor: a("floor"), levy: a("levy"), rates: a("rates"), sub: a("sub"), img: a("img"), plan: a("plan") || "studio",
             x: num(a("x")), y: num(a("y")), w: num(a("w")), h: num(a("h")), clip: a("clip") };
  });
  var unitByN = function (n) { n = String(n); for (var i = 0; i < UNITS.length; i++) { if (UNITS[i].n === n) { return UNITS[i]; } } return null; };
  function fromPrice() {
    var av = UNITS.filter(function (u) { return u.status === "Available" && u.price; });
    var pool = av.length ? av : UNITS.filter(function (u) { return u.price; });
    return pool.length ? Math.min.apply(null, pool.map(function (u) { return u.price; })) : 0;
  }
  function typePrice(type) {
    var pool = UNITS.filter(function (u) { return u.type === type && u.price; });
    return pool.length ? Math.min.apply(null, pool.map(function (u) { return u.price; })) : 0;
  }

  /* In-page anchors: Webflow's smoothScroll handler on document would hijack them. Stop the
     event at the link (bubble phase) so the browser does the fragment jump with scroll-padding. */
  qsa('a[href^="#"]').forEach(function (a) {
    var href = a.getAttribute("href");
    if (!href || href === "#" || !qs(href)) { return; }
    a.addEventListener("click", function (e) { e.stopPropagation(); }, false);
  });

  /* ----------------------------------------------------------- 1. split text
     Headings split into characters, paragraphs into words; <em> is kept as a wrapper. */
  function splitEl(el) {
    if (el.getAttribute("data-nh-split-done")) { return; }
    el.setAttribute("data-nh-split-done", "1");
    el.setAttribute("aria-label", text(el));
    var chars = el.getAttribute("data-nh-split") === "chars";
    var wrap = d.createElement("span");
    wrap.setAttribute("aria-hidden", "true");
    var walk = function (node, target) {
      [].slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var words = c.nodeValue.split(/(\s+)/);
          words.forEach(function (wd) {
            if (!wd) { return; }
            if (/^\s+$/.test(wd)) { target.appendChild(d.createTextNode(" ")); return; }
            if (chars) {
              var sw = d.createElement("span"); sw.className = "nh_sw";
              wd.split("").forEach(function (ch) { var s = d.createElement("span"); s.className = "nh_c"; s.textContent = ch; sw.appendChild(s); });
              target.appendChild(sw);
            } else {
              var s2 = d.createElement("span"); s2.className = "nh_c"; s2.textContent = wd; target.appendChild(s2);
            }
          });
        } else if (c.nodeType === 1) {
          var clone = c.cloneNode(false);
          walk(c, clone);
          target.appendChild(clone);
        }
      });
    };
    walk(el, wrap);
    el.innerHTML = "";
    el.appendChild(wrap);
  }
  function splitTiming(el, base) {
    var units = qsa(".nh_c", el);
    if (!units.length) { return 0; }
    var chars = el.getAttribute("data-nh-split") === "chars";
    var LINE = chars ? 260 : 170, STEP = chars ? 22 : 38;
    var tops = units.map(function (u) { return u.getBoundingClientRect().top; });
    var line = 0, k = 0, last = tops[0];
    units.forEach(function (u, i) {
      if (tops[i] - last > 6) { line++; k = 0; last = tops[i]; }
      u.style.setProperty("--d", (base + line * LINE + k * STEP) + "ms");
      k++;
    });
    return line + 1;
  }
  qsa(".nh_split_text").forEach(function (el) { if (!reduce) { splitEl(el); } });

  /* ----------------------------------------------------------- 2. reveals (batched, top to bottom) */
  var io = null;
  function observeReveals() {
    var els = qsa(".nh_rv, .nh_rise, .nh_split_text").filter(function (el) { return !el.closest(".nh_hero_copy") && !el._nhObs && !el.classList.contains("in"); });
    if (reduce || !("IntersectionObserver" in w)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        var batch = entries.filter(function (en) { return en.isIntersecting; }).map(function (en) { return { el: en.target, r: en.boundingClientRect }; });
        batch.sort(function (a, b) { return (Math.round(a.r.top / 8) - Math.round(b.r.top / 8)) || (a.r.left - b.r.left); });
        var cur = 0;
        batch.forEach(function (b) {
          var el = b.el;
          io.unobserve(el);
          if (el.classList.contains("nh_split_text")) {
            var n = splitTiming(el, cur);
            el.classList.add("in");
            cur += Math.min(n, 3) * (el.getAttribute("data-nh-split") === "chars" ? 260 : 170) + 60;
          } else if (el.classList.contains("nh_rise")) {
            var dl = Math.min(cur, 900); cur += 100;
            el.style.setProperty("--d", dl + "ms");
            el.classList.add("in");
            setTimeout(function () { el.classList.remove("nh_rise", "in"); el.style.removeProperty("--d"); }, 1500 + dl);
          } else { el.classList.add("in"); }
        });
      }, { threshold: 0.16, rootMargin: "0px 0px -10% 0px" });
    }
    els.forEach(function (e) { e._nhObs = true; io.observe(e); });
  }
  setTimeout(observeReveals, 50);

  /* ----------------------------------------------------------- 3. nav + hero + drift + strips: one smoothed rAF loop */
  var nav = qs("[data-nh-nav]"), bar = qs("[data-nh-bar]"), reg = qs("#register");
  var track = qs(".nh_hero"), pin = qs(".nh_hero_pin"), frame = qs("#nh-hero-frame"), slot = qs("#nh-hero-slot");
  var intro = qs("#nh-hero-intro"), veil = qs(".nh_hero_veil"), cap = qs("#nh-hero-cap");
  var copy = qs(".nh_hero_copy"), sides = qsa(".nh_hero_side"), mask = qs("#nh-intro-mask");
  var LD = d.documentElement.classList.contains("nh-loading");   // the loader (2b) adds .in itself when the word lands
  if (mask) { if (reduce) { mask.style.display = "none"; } else if (!LD) { setTimeout(function () { mask.classList.add("in"); }, 60); } }
  /* The name mask is drawn for a 1440x900 frame and cropped to fill the screen ("slice"). When the screen
     is too narrow to show the whole word (phones, portrait tablets) it switches to a 1052-wide frame that
     fits ("meet"), centred vertically, and sets the address on two larger lines. */
  (function fitMask() {
    var svg = mask && qs("svg", mask);
    var word = svg && qs("mask text", svg), addr = svg && qs(".nh_hero_mask_fade text", svg);
    if (!svg || !addr) { return; }
    var ADDR = text(addr), cur = "";
    function apply() {
      var W = w.innerWidth || 1440, H = w.innerHeight || 900;
      var visible = W / Math.max(W / 1440, H / 900);          // viewBox units visible across the screen when sliced
      var mode = visible < 1052 ? "narrow" : "wide";
      if (mode === cur) { return; }
      cur = mode;
      while (addr.firstChild) { addr.removeChild(addr.firstChild); }
      if (mode === "narrow") {
        // 1052 wide, cropped to the band that holds the address and the word, centred on the screen
        svg.setAttribute("viewBox", "0 400 1052 540");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        addr.setAttribute("font-size", "34"); addr.setAttribute("letter-spacing", "9");
        addr.setAttribute("x", "50"); addr.setAttribute("y", "500");
        var parts = ADDR.split(/\s*·\s*/);
        [parts[0], parts.slice(1).join(" · ")].forEach(function (line, i) {
          var t = d.createElementNS("http://www.w3.org/2000/svg", "tspan");
          t.setAttribute("x", "50"); t.setAttribute("dy", i ? "52" : "0"); t.textContent = line;
          addr.appendChild(t);
        });
      } else {
        svg.setAttribute("viewBox", "0 0 1440 900");
        svg.setAttribute("preserveAspectRatio", "xMinYMax slice");
        addr.setAttribute("font-size", "15"); addr.setAttribute("letter-spacing", "4.5");
        addr.setAttribute("x", "50"); addr.setAttribute("y", "560");
        addr.textContent = ADDR;
      }
    }
    apply();
    on(w, "resize", apply);
  })();

  /* ----------------------------------------------------------- 2b. loader: "Through the arch"
     Ink screen with an arch window on the hero photo (#nh-loader). The arch grows with the real load
     (poster image, fonts, window load), opens to the full frame, then the frame turns out to be the inside
     of the N: the name mask starts scaled so the N's stroke covers the screen and pulls back to rest.
     Above the browser's glyph-size ceiling the N is drawn from its outline path (#nh-intro-n, traced from
     Orpheus Pro, with the deepest point of the stroke in data-px/py/r); below it the real text takes over. */
  (function loader() {
    var root = d.documentElement;
    if (!LD) { return; }
    w.NH_LD = true;
    try { sessionStorage.setItem("nh-ld", "1"); } catch (e) {}
    var L = qs("#nh-loader"), arch = L && qs(".nh_ld_arch", L), count = L && qs(".nh_loader_count", L);
    var svg = mask && qs("svg", mask), G = svg && qs("#nh-intro-word", svg), NP = svg && qs("#nh-intro-n", svg), TX = G && qs("text", G);
    var fade = function () { root.classList.remove("nh-loading", "nh-ld-arch"); if (mask) { mask.classList.add("in"); } };
    if (!L || !arch || !svg || !G || !NP || !TX) { fade(); return; }
    var P = { x: +NP.getAttribute("data-px"), y: +NP.getAttribute("data-py"), r: +NP.getAttribute("data-r") };
    var bez = function (x1, y1, x2, y2) { return function (t) { if (t <= 0) { return 0; } if (t >= 1) { return 1; } var u = t; for (var i = 0; i < 8; i++) { var x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u - t, dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2); if (Math.abs(dx) < 1e-6) { break; } u = Math.min(1, Math.max(0, u - x / dx)); } return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u; }; };
    var EOUT = bez(.22, 1, .36, 1), EIO = bez(.65, 0, .35, 1), EZ = bez(.5, 0, .15, 1);
    var cl = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
    // Real progress: poster 35%, fonts 35%, window load 20%, a 10% head start
    var got = { poster: 0, fonts: 0, load: 0 };
    var poster = qs(".nh_hero_poster");
    if (!poster || (poster.complete && poster.naturalWidth)) { got.poster = 1; } else { on(poster, "load", function () { got.poster = 1; }); on(poster, "error", function () { got.poster = 1; }); }
    if (d.fonts && d.fonts.load) { Promise.all([d.fonts.load("352px orpheuspro"), d.fonts.load("400 12px halyard-text")]).then(function () { got.fonts = 1; }, function () { got.fonts = 1; }); } else { got.fonts = 1; }
    if (d.readyState === "complete") { got.load = 1; } else { on(w, "load", function () { got.load = 1; }); }
    var t0 = performance.now(), p = 0, T1 = 0, EXP = 720, HOLD = 220, ZOOM = 1800, swapped = false, revealed = false, geo = null;
    function target(now) { return now - t0 > 6000 ? 1 : .1 + .35 * got.poster + .35 * got.fonts + .2 * got.load; }
    function viewport() { return { W: w.innerWidth, H: w.innerHeight }; }
    // Word geometry in the mask's own units (follows fitMask's frame and the screen's pixel density)
    function measure() {
      var m = svg.getScreenCTM(), v = viewport(); if (!m) { return null; }
      var x0 = (0 - m.e) / m.a, y0 = (0 - m.f) / m.d, x1 = (v.W - m.e) / m.a, y1 = (v.H - m.f) / m.d;
      var hd = Math.hypot(x1 - x0, y1 - y0) / 2;
      return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, S: 1.4 * hd / P.r, safe: 3000 / (352 * Math.abs(m.a) * (w.devicePixelRatio || 1)) };
    }
    function word(z) {
      var sc = Math.exp((1 - z) * Math.log(geo.S)), qx = geo.cx + (P.x - geo.cx) * z, qy = geo.cy + (P.y - geo.cy) * z;
      var big = sc > geo.safe;
      NP.setAttribute("visibility", big ? "visible" : "hidden"); TX.setAttribute("visibility", big ? "hidden" : "visible");
      G.setAttribute("transform", z >= 1 ? "" : "translate(" + qx.toFixed(2) + " " + qy.toFixed(2) + ") scale(" + sc.toFixed(5) + ") translate(" + (-P.x) + " " + (-P.y) + ")");
    }
    function setArch(k) {
      var v = viewport();
      arch.style.transform = "translate(" + (v.W / 2) + "px," + (v.H / 2) + "px) scale(" + k.toFixed(4) + ")";
      if (count) { count.style.top = (v.H / 2 + 67 * Math.min(k, 2.2) + 22) + "px"; }
    }
    function frame(now) {
      var v = viewport(), base = Math.min(150, v.W * .36), k1 = (base + 70) / 100, k;
      if (!T1) {
        // 1 · the arch window grows with the load
        var tg = target(now), el = now - t0;
        p = Math.min(tg, el / 1500, p + Math.max((tg - p) * .07, tg > p ? .004 : 0));
        k = (base + p * 70) / 100 * (.94 + .06 * EOUT(cl(el / 400)));
        setArch(k);
        if (count) { var n = Math.round(p * 100); count.textContent = (n < 10 ? "00" : n < 100 ? "0" : "") + n; }
        if (p >= .999) { T1 = now + 140; }
        return w.requestAnimationFrame(frame);
      }
      var t = now - T1;
      if (t < EXP) {
        // 2 · the arch opens to the full frame (log scale reads as even growth)
        var e = EIO(cl(t / EXP)), kc = 3.2 * Math.hypot(v.W, v.H) / 2 / 50;
        setArch(k1 * Math.exp(e * Math.log(kc / k1)));
        if (count) { count.style.opacity = String(1 - EOUT(cl(t / 240))); }
        return w.requestAnimationFrame(frame);
      }
      if (!swapped) {
        // 3 · hand over to the name mask, scaled so the N's stroke fills the screen
        swapped = true; geo = measure();
        if (!geo) { L.style.display = "none"; fade(); return; }
        word(0); L.style.display = "none"; root.classList.remove("nh-ld-arch");
      }
      var z = EZ(cl((t - EXP - HOLD) / ZOOM));
      word(z);
      if (!revealed && t - EXP - HOLD > 1000) {
        revealed = true; mask.classList.add("in");
        root.classList.remove("nh-loading"); root.classList.add("nh-ld-reveal");
        setTimeout(function () { root.classList.remove("nh-ld-reveal"); }, 1400);
      }
      if (z < 1) { return w.requestAnimationFrame(frame); }
      w.NH_LD = false;
    }
    w.requestAnimationFrame(frame);
  })();
  var heroCur = 0, heroOn = false;
  var movers = qsa("[data-nh-drift], [data-nh-par]").map(function (el) {
    var par = el.hasAttribute("data-nh-par");
    return { el: el, amt: num(el.getAttribute(par ? "data-nh-par" : "data-nh-drift")), par: par, c: null, vis: true };
  });
  if ("IntersectionObserver" in w) {
    var vio = new IntersectionObserver(function (es) { es.forEach(function (en) { movers.forEach(function (m) { if (m.el === en.target) { m.vis = en.isIntersecting; } }); }); kick(); }, { rootMargin: "240px 0px" });
    movers.forEach(function (m) { vio.observe(m.el); });
  }
  var sxRoot = qs("[data-nh-sx]");
  var sx = sxRoot ? {
    vis: true,
    lines: qsa("[data-nh-sx-line]", sxRoot).map(function (el) { return { el: el, dir: num(el.getAttribute("data-nh-sx-line")) || 1, c: null }; }),
    strips: qsa("[data-nh-sx-strip]", sxRoot).map(function (el) { return { el: el, ren: qs(".is-render", el), rtl: el.getAttribute("data-nh-sx-strip") === "rtl", full: el.hasAttribute("data-nh-sx-full"), c: null }; })
  } : null;
  function sxMask(st, p) {
    if (!st.ren) { return; }
    var F = 16, b = p * (100 + F), a = b - F;
    var g = "linear-gradient(" + (st.rtl ? 270 : 90) + "deg, #000 " + a.toFixed(2) + "%, transparent " + b.toFixed(2) + "%)";
    st.ren.style.webkitMaskImage = g; st.ren.style.maskImage = g;
  }
  if (sx && !reduce) {
    sx.strips.forEach(function (st) { sxMask(st, 0); });
    if ("IntersectionObserver" in w) { var sio = new IntersectionObserver(function (es) { es.forEach(function (en) { sx.vis = en.isIntersecting; }); kick(); }, { rootMargin: "240px 0px" }); sio.observe(sxRoot); }
  }
  function heroTarget() {
    var tr = track.getBoundingClientRect(), vh = w.innerHeight || 900;
    return clamp(-tr.top / Math.max(1, tr.height - vh));
  }
  function renderHero(raw) {
    if (mask && !reduce) {
      var m = eio(clamp(raw / 0.27));
      mask.style.transform = "translate3d(0," + (-m * 102).toFixed(3) + "%,0)";
      mask.style.visibility = m >= 0.999 ? "hidden" : "visible";
    }
    var p = reduce ? 1 : eio(clamp((raw - 0.4) / 0.5));
    var pr = pin.getBoundingClientRect(), sr = slot.getBoundingClientRect();
    var t = (sr.top - pr.top) * p, l = (sr.left - pr.left) * p, r = (pr.right - sr.right) * p, b = (pr.bottom - sr.bottom) * p;
    var R = Math.min(sr.width / 2, 340) * p, r2 = 4 * p;
    frame.style.clipPath = "inset(" + t.toFixed(1) + "px " + r.toFixed(1) + "px " + b.toFixed(1) + "px " + l.toFixed(1) + "px round " + R.toFixed(1) + "px " + R.toFixed(1) + "px " + r2.toFixed(2) + "px " + r2.toFixed(2) + "px)";
    var fin = eio(clamp((raw - 0.16) / 0.12)), fout = eio(clamp((raw - 0.34) / 0.1));
    if (intro) { intro.style.opacity = String(reduce ? 0 : fin * (1 - fout)); intro.style.transform = "translate3d(0," + ((1 - fin) * 28 - fout * 28).toFixed(2) + "px,0)"; }
    if (veil) { veil.style.opacity = String(1 - p); }
    if (cap) {
      cap.style.opacity = p > 0.94 ? "1" : "0";
      cap.style.transform = "translate3d(" + (sr.left - pr.left + 18).toFixed(1) + "px," + (sr.bottom - pr.top - 18 - cap.offsetHeight).toFixed(1) + "px,0)";
    }
    if (nav) {
      nav.classList.toggle("is-pre", !reduce && raw < 0.22);
      nav.classList.toggle("is-ink", p > 0.35);
      nav.classList.toggle("is-solid", track.getBoundingClientRect().bottom <= 80);
    }
    var onNow = p > 0.6;
    if (onNow !== heroOn) {
      heroOn = onNow;
      var cur = 120;
      qsa(".nh_rise, .nh_split_text", copy).forEach(function (el) {
        if (el.classList.contains("nh_split_text")) { if (onNow) { cur += Math.min(splitTiming(el, cur), 3) * 260; } }
        else { el.style.setProperty("--d", (onNow ? cur : 0) + "ms"); cur += 110; }
        el.classList.toggle("in", onNow);
      });
      sides.forEach(function (el) { el.classList.toggle("in", onNow); });
    }
  }
  var raf = 0;
  function tick() {
    raf = 0;
    var moving = false, vh = w.innerHeight || 900;
    if (track && pin && frame && slot) {
      var tg = heroTarget();
      if (reduce) { heroCur = 1; }
      else { heroCur += (tg - heroCur) * 0.06; if (Math.abs(tg - heroCur) > 0.0003) { moving = true; } else { heroCur = tg; } }
      renderHero(heroCur);
    }
    if (!reduce) {
      movers.forEach(function (m) {
        if (!m.vis) { return; }
        var rc = m.el.parentNode.getBoundingClientRect();
        var off = (rc.top + rc.height / 2 - vh / 2) / vh;
        var goal = off * m.amt;
        if (m.c === null) { m.c = goal; }
        m.c += (goal - m.c) * 0.075;
        if (Math.abs(goal - m.c) > 0.12) { moving = true; } else { m.c = goal; }
        m.el.style.transform = m.par ? "translate3d(0," + m.c.toFixed(2) + "px,0)" : "translate3d(" + m.c.toFixed(2) + "px,0,0)";
      });
    }
    if (sx && sx.vis && !reduce) {
      var sr0 = sxRoot.getBoundingClientRect();
      var qx = clamp((vh - sr0.top) / (vh + sr0.height));
      var A = Math.min(w.innerWidth || 1440, 1600) * 0.14;
      sx.lines.forEach(function (ln) {
        var goal = ln.dir * (qx - 0.5) * 2 * A;
        if (ln.c === null) { ln.c = goal; }
        ln.c += (goal - ln.c) * 0.075;
        if (Math.abs(goal - ln.c) > 0.12) { moving = true; } else { ln.c = goal; }
        ln.el.style.transform = "translate3d(" + ln.c.toFixed(2) + "px,0,0)";
      });
      sx.strips.forEach(function (st) {
        var rc = st.el.getBoundingClientRect();
        var goal = st.full ? eio(clamp((vh - rc.bottom) / (vh * 0.45))) : eio(clamp((vh * 0.95 - rc.top) / (vh * 0.7)));
        if (st.c === null) { st.c = goal; }
        st.c += (goal - st.c) * 0.075;
        if (Math.abs(goal - st.c) > 0.0005) { moving = true; } else { st.c = goal; }
        sxMask(st, st.c);
      });
    }
    if (moving) { raf = requestAnimationFrame(tick); }
  }
  function kick() { if (!raf) { raf = requestAnimationFrame(tick); } }
  var lastY = w.scrollY || 0, planOpen = false;
  function onScroll() {
    var y = w.scrollY || 0;
    if (nav) { if (y > lastY + 6 && y > 160) { nav.classList.add("is-hide"); } else if (y < lastY - 6) { nav.classList.remove("is-hide"); } }
    if (bar && track) {
      var vh = w.innerHeight || 900, tb = track.getBoundingClientRect();
      var rr = reg ? reg.getBoundingClientRect() : null;
      var inReg = rr && rr.top < vh * 0.7 && rr.bottom > vh * 0.3;
      bar.classList.toggle("is-on", tb.bottom < 0 && !inReg && !planOpen && !html.classList.contains("nh-auth-open"));
    }
    lastY = y;
    kick();
  }
  on(w, "scroll", onScroll, { passive: true });
  on(w, "resize", onScroll);
  setTimeout(kick, 80); setTimeout(kick, 600);

  /* ----------------------------------------------------------- 4. marquee runs only on screen */
  var mq = qs("[data-nh-mq]");
  if (mq && !reduce && "IntersectionObserver" in w) {
    new IntersectionObserver(function (es) { es.forEach(function (en) { mq.classList.toggle("is-run", en.isIntersecting); }); }).observe(mq);
  }

  /* ----------------------------------------------------------- 5. toasts */
  var gt = qs("[data-nh-gtoast]"), gtT = 0;
  function note(msg) {
    if (!gt) { return; }
    var t = qs("[data-nh-gtoast-text]", gt) || gt;
    t.textContent = msg;
    gt.classList.add("is-on");
    clearTimeout(gtT);
    gtT = setTimeout(function () { gt.classList.remove("is-on"); }, 2600);
  }
  w.NH_NOTE = note;

  /* ----------------------------------------------------------- 6. room explorer */
  (function explorer() {
    var root = qs("[data-nh-explorer]");
    if (!root) { return; }
    var rooms = qsa("[data-nh-room]", root), stages = qsa("[data-nh-stage]", root);
    var capEl = qs("[data-nh-stage-cap]", root), nameEl = qs("[data-nh-stage-name]", root), noteEl = qs("[data-nh-stage-note]", root);
    function pick(i) {
      rooms.forEach(function (r) { r.classList.toggle("is-on", r.getAttribute("data-nh-room") === String(i)); });
      stages.forEach(function (s) { s.classList.toggle("is-on", s.getAttribute("data-nh-stage") === String(i)); });
      var r = rooms[i];
      if (r && nameEl) { nameEl.textContent = r.getAttribute("data-nh-room-name") || text(qs(".nh_room_name", r)); }
      if (r && noteEl) { noteEl.textContent = r.getAttribute("data-nh-room-note") || ""; }
      if (capEl) { capEl.classList.remove("is-swap"); void capEl.offsetWidth; capEl.classList.add("is-swap"); }
    }
    rooms.forEach(function (r, i) { on(r, "click", function (e) { stop(e); pick(i); }); });
    pick(0);
  })();

  /* ----------------------------------------------------------- 7. loft gallery lightbox */
  (function lightbox() {
    var box = qs("[data-nh-lbx]"), items = qsa("[data-nh-lb]");
    if (!box || !items.length) { return; }
    var img = qs("[data-nh-lbx-img]", box), count = qs("[data-nh-lbx-count]", box), capT = qs("[data-nh-lbx-cap]", box);
    var LG = items.map(function (a) { var im = qs("img", a); return { src: im ? im.currentSrc || im.src : "", alt: im ? im.alt : "", cap: a.getAttribute("data-nh-lb-cap") || "" }; });
    var i = 0, open = false, last = null;
    function show(k) {
      i = (k + LG.length) % LG.length;
      if (img) { img.classList.remove("is-swap"); img.src = LG[i].src; img.alt = LG[i].alt; void img.offsetWidth; img.classList.add("is-swap"); }
      if (count) { count.textContent = pad(i + 1) + " / " + pad(LG.length); }
      if (capT) { capT.textContent = LG[i].cap; }
    }
    function openAt(k) { last = d.activeElement; show(k); open = true; box.classList.add("is-open"); html.classList.add("nh-modal-open"); var c = qs("[data-nh-lbx-close]", box); if (c && c.focus) { setTimeout(function () { c.focus(); }, 80); } }
    function close() { open = false; box.classList.remove("is-open"); html.classList.remove("nh-modal-open"); if (last && last.focus) { try { last.focus({ preventScroll: true }); } catch (e) {} } }
    items.forEach(function (a, k) { on(a, "click", function (e) { stop(e); openAt(k); }); on(a, "keydown", function (e) { if (e.key === "Enter" || e.key === " ") { stop(e); openAt(k); } }); });
    qsa("[data-nh-lbx-close]", box).forEach(function (b) { on(b, "click", function (e) { stop(e); close(); }); });
    on(qs("[data-nh-lbx-prev]", box), "click", function (e) { stop(e); show(i - 1); });
    on(qs("[data-nh-lbx-next]", box), "click", function (e) { stop(e); show(i + 1); });
    on(d, "keydown", function (e) { if (!open) { return; } if (e.key === "Escape") { close(); } else if (e.key === "ArrowLeft") { show(i - 1); } else if (e.key === "ArrowRight") { show(i + 1); } });
  })();

  /* ----------------------------------------------------------- 8. segmented toggles (compare, VR, finance) */
  var segs = {};
  function segInit(root, cb) {
    var ind = qs(".nh_seg_ind", root), btns = qsa("[data-nh-seg-opt]", root);
    function set(v) {
      btns.forEach(function (b, k) {
        var onIt = b.getAttribute("data-nh-seg-opt") === v;
        b.classList.toggle("is-on", onIt);
        b.setAttribute("aria-pressed", onIt ? "true" : "false");
        if (onIt && ind) { ind.style.transform = "translateX(" + (b.offsetLeft - 4) + "px)"; ind.style.width = b.offsetWidth + "px"; }
      });
      cb(v);
    }
    btns.forEach(function (b) { on(b, "click", function (e) { stop(e); set(b.getAttribute("data-nh-seg-opt")); }); });
    set(btns[0] ? btns[0].getAttribute("data-nh-seg-opt") : "studio");
    on(w, "resize", function () { var b = qs(".is-on", root); if (b && ind) { ind.style.transform = "translateX(" + (b.offsetLeft - 4) + "px)"; ind.style.width = b.offsetWidth + "px"; } });
    return set;
  }

  /* ----------------------------------------------------------- 9. base or furnished: compare slider */
  (function compare() {
    var root = qs("[data-nh-cmp]"), seg = qs("[data-nh-seg=cmp]");
    if (!root) { return; }
    var line = qs("[data-nh-cmp-line]", root), knob = qs("[data-nh-cmp-knob]", root);
    // The range control is a form field, which Webflow only allows inside a Form: the bundle adds it.
    var range = qs("[data-nh-cmp-range]", root);
    if (!range) {
      range = d.createElement("input");
      range.type = "range"; range.min = "0"; range.max = "100"; range.value = "50"; range.className = "nh_cmp_range"; range.id = "nh-cmp";
      range.setAttribute("aria-label", "Base or furnished, drag to compare");
      range.setAttribute("data-nh-cmp-range", "");
      root.insertBefore(range, knob || null);
    }
    function paint() {
      var v = num(range.value);
      qsa(".nh_cmp_furn", root).forEach(function (im) { im.style.clipPath = "inset(0 0 0 " + v + "%)"; });
      if (line) { line.style.left = v + "%"; }
      if (knob) { knob.style.left = v + "%"; }
      range.setAttribute("aria-valuetext", v + "% furnished");
    }
    on(range, "input", paint);
    paint();
    if (seg) {
      segInit(seg, function (v) {
        qsa("[data-nh-cmp-pair]", root).forEach(function (p) {
          var onIt = p.getAttribute("data-nh-cmp-pair") === v;
          p.classList.toggle("is-hidden", !onIt);
          if (onIt) { p.classList.remove("is-swap"); void p.offsetWidth; p.classList.add("is-swap"); }
        });
        qsa("[data-nh-cmp-desc]").forEach(function (p) {
          var onIt = p.getAttribute("data-nh-cmp-desc") === v;
          p.classList.toggle("is-hidden", !onIt);
          if (onIt) { p.classList.remove("is-swap"); void p.offsetWidth; p.classList.add("is-swap"); }
        });
      });
    }
  })();

  /* ----------------------------------------------------------- 10. a day from Napier Street */
  (function day() {
    var root = qs("[data-nh-day]");
    if (!root) { return; }
    var slides = qsa("[data-nh-day-slide]", root), caps = qsa("[data-nh-day-cap]", root), segsEl = qsa("[data-nh-day-go]", root);
    var N = slides.length, cur = 0, paused = false, el = 0, MS = 6500;
    function go(k) {
      cur = (k + N) % N; el = 0;
      slides.forEach(function (s, i) { s.classList.toggle("is-on", i === cur); s.setAttribute("aria-hidden", i === cur ? "false" : "true"); });
      // is-swap's rise animation fills forwards (opacity 1), so it must come off the outgoing caption or every caption stays visible
      caps.forEach(function (c, i) { c.classList.toggle("is-on", i === cur); c.classList.remove("is-swap"); if (i === cur) { void c.offsetWidth; c.classList.add("is-swap"); } });
      segsEl.forEach(function (s, i) {
        s.classList.toggle("is-on", i === cur); s.classList.toggle("is-done", i < cur);
        var f = qs("[data-nh-day-fill]", s);
        if (f) { f.classList.remove("is-run"); void f.offsetWidth; if (i === cur && !reduce) { f.classList.add("is-run"); } }
      });
    }
    segsEl.forEach(function (s, i) { on(s, "click", function (e) { stop(e); go(i); }); });
    on(qs("[data-nh-day-prev]", root), "click", function (e) { stop(e); go(cur - 1); });
    on(qs("[data-nh-day-next]", root), "click", function (e) { stop(e); go(cur + 1); });
    // Swipe on the photos (touch): horizontal flick of 40px or more changes the slide; vertical scrolling is left alone
    var stage = qs(".nh_day_stage", root) || root, sx = 0, sy = 0, tracking = false;
    on(stage, "touchstart", function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; tracking = true; }, { passive: true });
    on(stage, "touchend", function (e) {
      if (!tracking) { return; } tracking = false;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) { go(cur + (dx < 0 ? 1 : -1)); }
    }, { passive: true });
    on(stage, "touchcancel", function () { tracking = false; }, { passive: true });
    on(root, "mouseenter", function () { paused = true; root.classList.add("is-paused"); });
    on(root, "mouseleave", function () { paused = false; root.classList.remove("is-paused"); });
    var vis = true;
    if ("IntersectionObserver" in w) { new IntersectionObserver(function (es) { es.forEach(function (en) { vis = en.isIntersecting; }); }).observe(root); }
    go(0);
    if (!reduce) { setInterval(function () { if (paused || !vis || d.hidden) { return; } el += 100; if (el >= MS) { go(cur + 1); } }, 100); }
  })();

  /* ----------------------------------------------------------- 11. on foot: filters, list, pins, pan + zoom, card */
  (function onfoot() {
    var map = qs("[data-nh-map]");
    if (!map) { return; }
    var pan = qs("[data-nh-map-pan]", map), pinsEl = qs("[data-nh-pins]", map), list = qs("[data-nh-plist]"), card = qs("[data-nh-pcard]");
    var chips = qsa("[data-nh-cat]"), rows = qsa("[data-nh-place]", list), pins = qsa("[data-nh-pin]", map);
    var COL = {}; chips.forEach(function (c) { COL[c.getAttribute("data-nh-cat")] = c.getAttribute("data-nh-cat-color"); });
    var CATL = {}; chips.forEach(function (c) { CATL[c.getAttribute("data-nh-cat")] = text(c); });
    var HX = 49.5, HY = 65.87;
    var st = { cat: "all", sel: rows[0] ? rows[0].getAttribute("data-nh-place") : "", z: 1.5, px: 24.25, py: 48.8, drag: null, dragging: false, hover: "" };
    var byId = {}; rows.forEach(function (r) { byId[r.getAttribute("data-nh-place")] = r; });
    var pinById = {}; pins.forEach(function (p) { pinById[p.getAttribute("data-nh-pin")] = p; });
    // Geometry that was inline in the design: rings, labels, names, pins.
    qsa("[data-nh-ring]", map).forEach(function (r) { r.style.width = r.getAttribute("data-nh-ring") + "%"; });
    qsa("[data-nh-ring-lab]", map).forEach(function (l) { var m = num(l.getAttribute("data-nh-ring-lab")); l.style.marginTop = (-(m / 5) * 8.65) + "%"; });
    qsa("[data-nh-map-name]", map).forEach(function (n) { var xy = n.getAttribute("data-nh-map-name").split(","); n.style.left = xy[0] + "%"; n.style.top = xy[1] + "%"; });
    pins.forEach(function (p) {
      var r = byId[p.getAttribute("data-nh-pin")]; if (!r) { return; }
      p.style.left = r.getAttribute("data-nh-place-x") + "%"; p.style.top = r.getAttribute("data-nh-place-y") + "%";
      var dot = qs(".nh_pin_dot", p); if (dot) { dot.style.backgroundColor = COL[r.getAttribute("data-nh-place-cat")] || "#2B2622"; }
    });
    rows.forEach(function (r) { var dot = qs(".nh_prow_dot", r); if (dot) { dot.style.backgroundColor = COL[r.getAttribute("data-nh-place-cat")] || "#2B2622"; } });
    // The map frame can be taller than the drawing (phones use 4:5): R = drawing height / frame height at zoom 1.
    // x stays in % of frame width; y in % of frame height, so the drawing is z*R frames tall.
    var R = 1;
    function measureR() { var b = map.getBoundingClientRect(); R = b.height ? (b.width * 1104 / 1600) / b.height : 1; }
    function zMin() { return Math.max(1, 1 / R); }
    function zMax() { return Math.max(2.5, zMin() + 1.5); }
    // A little overscroll past the drawing's edges (the frame's paper colour shows) so edge pins can be dragged clear of the frame
    var PAD = 10;
    var clampX = function (v, z) { return Math.max(-PAD, Math.min((z - 1) * 100 + PAD, v)); };
    var clampY = function (v, z) { return Math.max(-PAD, Math.min((z * R - 1) * 100 + PAD, v)); };
    function centreOn(x, y, z) { st.px = clampX(x * z - 50, z); st.py = clampY(y * z * R - 50, z); }
    function paintMap() {
      if (!pan) { return; }
      pan.style.transition = st.dragging ? "none" : "";
      pan.style.width = (st.z * 100) + "%"; pan.style.left = (-st.px) + "%"; pan.style.top = (-st.py) + "%";
      map.style.cursor = st.dragging ? "grabbing" : "grab";
    }
    function paintSel() {
      var r = byId[st.sel]; if (!r) { return; }
      rows.forEach(function (x) { x.classList.toggle("is-on", x === r); });
      pins.forEach(function (p) {
        var onIt = p.getAttribute("data-nh-pin") === st.sel, hov = p.getAttribute("data-nh-pin") === st.hover;
        p.classList.toggle("is-on", onIt); p.classList.toggle("is-hover", hov && !onIt);
        p.style.zIndex = onIt ? 4 : (hov ? 5 : 1);
        var rr = byId[p.getAttribute("data-nh-pin")];
        var sx = num(rr.getAttribute("data-nh-place-x")) * st.z - st.px, sy = num(rr.getAttribute("data-nh-place-y")) * st.z * R - st.py;
        var tag = qs(".nh_pin_tag", p);
        if (tag) {
          tag.style.left = sx < 26 ? "4px" : (sx > 74 ? "auto" : "50%"); tag.style.right = sx > 74 ? "4px" : "auto";
          tag.style.transform = sx < 26 || sx > 74 ? "none" : "translateX(-50%)";
          tag.style.bottom = sy < 16 ? "auto" : "100%"; tag.style.top = sy < 16 ? "100%" : "auto";
          tag.style.marginTop = sy < 16 ? "4px" : "0"; tag.style.marginBottom = sy < 16 ? "0" : "4px";
        }
      });
      if (card) {
        var im = qs("[data-nh-pcard-img]", card), ini = qs("[data-nh-pcard-initial]", card), media = qs("[data-nh-pcard-media]", card);
        var src = r.getAttribute("data-nh-place-img") || "", cat = r.getAttribute("data-nh-place-cat");
        if (im) { im.style.display = src ? "" : "none"; if (src && im.src !== src) { im.src = src; } im.alt = text(qs(".nh_prow_name", r)); im.classList.remove("is-swap"); void im.offsetWidth; im.classList.add("is-swap"); }
        if (ini) { ini.style.display = src ? "none" : "flex"; ini.textContent = text(qs(".nh_prow_name", r)).charAt(0); }
        if (media) { media.style.backgroundColor = src ? "" : (COL[cat] || "#2B2622"); }
        var c = qs("[data-nh-pcard-cat]", card); if (c) { c.textContent = (CATL[cat] || "") + " · " + text(qs(".nh_prow_t", r)); c.style.color = COL[cat] || ""; }
        var n = qs("[data-nh-pcard-name]", card); if (n) { n.textContent = text(qs(".nh_prow_name", r)); }
        var b = qs("[data-nh-pcard-blurb]", card); if (b) { b.textContent = r.getAttribute("data-nh-place-blurb") || ""; }
        card.classList.remove("is-swap"); void card.offsetWidth; card.classList.add("is-swap");
      }
    }
    function select(id, centre) {
      st.sel = id;
      var r = byId[id];
      if (centre !== false && r) { centreOn(num(r.getAttribute("data-nh-place-x")), num(r.getAttribute("data-nh-place-y")), st.z); paintMap(); }
      paintSel();
    }
    function applyCat() {
      var shown = [];
      rows.forEach(function (r, i) { var onIt = st.cat === "all" || r.getAttribute("data-nh-place-cat") === st.cat; r.style.display = onIt ? "" : "none"; if (onIt) { shown.push(r); r.style.animationDelay = (Math.min(shown.length, 12) * 40) + "ms"; r.classList.remove("is-in"); void r.offsetWidth; r.classList.add("is-in"); } });
      pins.forEach(function (p, i) { var onIt = st.cat === "all" || p.getAttribute("data-nh-place-cat") === st.cat; p.style.display = onIt ? "" : "none"; if (onIt) { p.style.animationDelay = (120 + Math.min(i, 16) * 25) + "ms"; p.classList.remove("is-in"); void p.offsetWidth; p.classList.add("is-in"); } });
      chips.forEach(function (c) {
        var onIt = c.getAttribute("data-nh-cat") === st.cat;
        c.classList.toggle("is-on", onIt);
        var dot = qs(".nh_chip_dot", c);
        if (dot) { var id = c.getAttribute("data-nh-cat"); dot.style.backgroundColor = id === "all" ? (onIt ? "#FBF7F2" : "#2B2622") : COL[id]; }
      });
      if (!shown.some(function (r) { return r.getAttribute("data-nh-place") === st.sel; }) && shown[0]) { select(shown[0].getAttribute("data-nh-place")); } else { paintSel(); }
    }
    chips.forEach(function (c) { on(c, "click", function (e) { stop(e); var id = c.getAttribute("data-nh-cat"); if (id === st.cat) { return; } st.cat = id; if (reduce) { applyCat(); return; } if (list) { list.classList.add("is-out"); } if (pinsEl) { pinsEl.classList.add("is-out"); } setTimeout(function () { applyCat(); if (list) { list.classList.remove("is-out"); } if (pinsEl) { pinsEl.classList.remove("is-out"); } }, 240); }); });
    rows.forEach(function (r) {
      var id = r.getAttribute("data-nh-place");
      on(r, "click", function (e) { stop(e); select(id); });
      on(r, "mouseenter", function () { st.hover = id; paintSel(); }); on(r, "mouseleave", function () { st.hover = ""; paintSel(); });
    });
    pins.forEach(function (p) {
      var id = p.getAttribute("data-nh-pin");
      on(qs(".nh_pin", p), "click", function (e) { stop(e); if (!st.dragging) { select(id); } });
      on(p, "mouseenter", function () { st.hover = id; paintSel(); }); on(p, "mouseleave", function () { st.hover = ""; paintSel(); });
    });
    // Drag to pan, buttons to zoom
    on(map, "pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) { return; }
      if (e.target.closest && e.target.closest("[data-nh-map-zoom]")) { return; }
      var r = map.getBoundingClientRect();
      st.drag = { x: e.clientX, y: e.clientY, px: st.px, py: st.py, w: r.width, h: r.height, moved: false, id: e.pointerId };
    });
    on(map, "pointermove", function (e) {
      var g = st.drag; if (!g) { return; }
      var dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.moved) { if (Math.hypot(dx, dy) < 5) { return; } g.moved = true; try { map.setPointerCapture(g.id); } catch (err) {} st.dragging = true; }
      st.px = clampX(g.px - dx / g.w * 100, st.z); st.py = clampY(g.py - dy / g.h * 100, st.z);
      paintMap();
    });
    var up = function () { st.drag = null; if (st.dragging) { setTimeout(function () { st.dragging = false; paintMap(); paintSel(); }, 0); } };
    on(map, "pointerup", up); on(map, "pointercancel", up);
    function zoomTo(nz) {
      var z = st.z; nz = Math.max(zMin(), Math.min(zMax(), nz));
      var cx = (st.px + 50) / z, cy = (st.py + 50) / (z * R);
      st.z = nz; centreOn(cx, cy, nz); paintMap(); paintSel();
    }
    qsa("[data-nh-map-zoom]", map).forEach(function (b) {
      on(b, "click", function (e) {
        stop(e); e.stopPropagation();
        var k = b.getAttribute("data-nh-map-zoom");
        if (k === "in") { zoomTo(st.z + 0.5); } else if (k === "out") { zoomTo(st.z - 0.5); } else { st.z = zHome(); centreOn(HX, HY, st.z); paintMap(); paintSel(); }
      });
      on(b, "pointerdown", function (e) { e.stopPropagation(); });
    });
    function zHome() { return Math.max(1.5, zMin() * 1.1); }
    measureR(); st.z = zHome(); centreOn(HX, HY, st.z);
    paintMap();
    // Breakpoint changes the frame's shape: keep the same centre, re-clamp
    var rzT; on(w, "resize", function () { clearTimeout(rzT); rzT = setTimeout(function () {
      var cx = (st.px + 50) / st.z, cy = (st.py + 50) / (st.z * R);
      measureR(); st.z = Math.max(zMin(), Math.min(zMax(), st.z)); centreOn(cx, cy, st.z); paintMap(); paintSel();
    }, 150); });
    applyCat();
  })();

  /* ----------------------------------------------------------- 12. drives: routes draw, cards slide */
  (function drives() {
    var dmap = qs("[data-nh-dmap]"), slider = qs("[data-nh-drive-slider]");
    if (!dmap || !slider) { return; }
    var routes = qsa("[data-nh-route]", dmap), dpins = qsa("[data-nh-drive]", dmap), trackEl = qs("[data-nh-dtrack]", slider), cards = qsa("[data-nh-drive-card]", slider), count = qs("[data-nh-drive-count]", slider);
    var N = dpins.length, dr = 0, el = 0, MS = 3800, paused = false, snapT = 0, vis = true;
    dpins.forEach(function (p) { p.style.left = p.getAttribute("data-nh-place-x") + "%"; p.style.top = p.getAttribute("data-nh-place-y") + "%"; });
    function cardW() { var c = cards[0]; return c ? c.getBoundingClientRect().width + 16 : 236; }
    function paint(anim) {
      var act = ((dr % N) + N) % N;
      routes.forEach(function (g, i) {
        var onIt = i === act; g.classList.toggle("is-on", onIt);
        var ln = qs(".nh_route_line", g);
        if (ln) { var L = ln.getAttribute("stroke-dasharray").split(" ")[0]; if (onIt) { ln.style.transition = ""; ln.setAttribute("stroke-dashoffset", "0"); } else { ln.style.transition = "none"; ln.setAttribute("stroke-dashoffset", L); } }
      });
      dpins.forEach(function (p, i) { p.classList.toggle("is-on", i === act); });
      cards.forEach(function (c, i) { c.classList.toggle("is-on", (i % N) === act); });
      if (trackEl) { trackEl.style.transition = anim ? "" : "none"; trackEl.style.transform = "translateX(" + (-dr * cardW()) + "px)"; }
      if (count) { count.textContent = pad(act + 1) + " / " + pad(N); }
    }
    function go(k) { clearTimeout(snapT); el = 0; dr = k; paint(true); }
    function next() {
      if (dr >= N) { clearTimeout(snapT); dr -= N; paint(false); snapT = setTimeout(next, 40); return; }
      el = 0; dr += 1; paint(true);
      if (dr >= N) { clearTimeout(snapT); snapT = setTimeout(function () { dr = 0; paint(false); }, 1000); }
    }
    function prev() {
      el = 0;
      if (dr <= 0) { dr = N; paint(false); clearTimeout(snapT); snapT = setTimeout(function () { dr = N - 1; paint(true); }, 40); }
      else { dr -= 1; paint(true); }
    }
    dpins.forEach(function (p, i) { on(p, "click", function (e) { stop(e); go(i); }); });
    cards.forEach(function (c, i) { on(c, "click", function (e) { stop(e); go(i % N); }); });
    on(qs("[data-nh-drive-prev]", slider), "click", function (e) { stop(e); prev(); });
    on(qs("[data-nh-drive-next]", slider), "click", function (e) { stop(e); next(); });
    on(slider, "mouseenter", function () { paused = true; }); on(slider, "mouseleave", function () { paused = false; });
    if ("IntersectionObserver" in w) { new IntersectionObserver(function (es) { es.forEach(function (en) { vis = en.isIntersecting; }); }).observe(slider); }
    on(w, "resize", function () { paint(false); });
    paint(false);
    if (!reduce) { setInterval(function () { if (paused || !vis || d.hidden) { return; } el += 100; if (el >= MS) { next(); } }, 100); }
  })();

  /* ----------------------------------------------------------- 13. availability: façade, selection, detail card, plan modal */
  var SEL = null;                                   // the selected unit (shared with the bar, finance and the waitlist)
  var paintSelected = function () {};
  (function availability() {
    var facade = qs("[data-nh-facade]"), home = qs("[data-nh-home]");
    if (!facade || !UNITS.length) { return; }
    var fdim = qs("[data-nh-fdim]", facade), polys = qsa("[data-nh-lp]", facade);
    // Position every home from its data; lofts get their traced outline.
    UNITS.forEach(function (u) {
      var s = u.el.style;
      s.left = u.x + "%"; s.top = u.y + "%"; s.width = u.w + "%"; s.height = u.h + "%";
      if (u.clip) { s.clipPath = "polygon(" + u.clip + ")"; }
      u.el.classList.toggle("is-reserved", u.status === "Reserved");
      u.el.classList.toggle("is-sold", u.status === "Sold");
      if (u.status !== "Available") { u.el.setAttribute("aria-disabled", "true"); }
    });
    polys.forEach(function (p) { var st = (p.getAttribute("data-status") || "available").toLowerCase(); p.classList.toggle("is-reserved", st === "reserved"); p.classList.toggle("is-sold", st === "sold"); });
    var geom = function (u) {
      if (u.clip) { return u.clip.split(",").map(function (pt) { var xy = pt.trim().split(/\s+/); return [u.x + num(xy[0]) / 100 * u.w, u.y + num(xy[1]) / 100 * u.h]; }); }
      return [[u.x, u.y], [u.x + u.w, u.y], [u.x + u.w, u.y + u.h], [u.x, u.y + u.h]];
    };
    var STCOL = { Available: "#8FA592", Reserved: "#C9957F", Sold: "#8C3B4A" };
    var body = qs("[data-nh-home-body]", home);
    function field(k) { return qs("[data-nh-home-" + k + "]", home); }
    paintSelected = function () {
      var u = SEL; if (!u) { return; }
      UNITS.forEach(function (x) { x.el.classList.toggle("is-on", x === u); });
      polys.forEach(function (p) { p.classList.toggle("is-on", p.getAttribute("data-nh-lp") === u.n); });
      if (fdim) { fdim.setAttribute("d", "M0 0H100V100H0Z M" + geom(u).map(function (p) { return p[0].toFixed(2) + " " + p[1].toFixed(2); }).join(" L") + "Z"); }
      if (!home) { return; }
      var im = field("img"); if (im && u.img) { if (im.src !== u.img) { im.src = u.img; } im.alt = "Home " + u.n + ", artist's impression"; im.classList.remove("is-swap"); void im.offsetWidth; im.classList.add("is-swap"); }
      var t = field("title"); if (t) { t.textContent = "Home " + u.n; }
      var sub = field("sub"); if (sub) { sub.textContent = u.sub; }
      var stT = field("status"); if (stT) { stT.textContent = u.status + " · " + u.type; }
      var dot = field("dot"); if (dot) { dot.style.backgroundColor = STCOL[u.status] || STCOL.Available; }
      var pr = field("price"); if (pr) { pr.textContent = (PRE ? "From " : "") + (u.priceText || money(u.price)); }
      qsa("[data-nh-home-field]", home).forEach(function (sp) {
        var k = sp.getAttribute("data-nh-home-field"), v = qs(".nh_spec_v", sp), kk = qs(".nh_spec_k", sp);
        if (v) { v.textContent = u[k] || "—"; }
        if (k === "out" && kk) { kk.textContent = u.outLabel; }
      });
      var cta = field("cta"); if (cta) { cta.setAttribute("data-nh-homes", u.n); }
      if (body) { body.classList.remove("is-swap"); void body.offsetWidth; body.classList.add("is-swap"); }
      d.dispatchEvent(new CustomEvent("nh:selected", { detail: u }));
    };
    function pick(u, scroll) {
      if (!u || u.status !== "Available") { return; }
      SEL = u; paintSelected();
      if (scroll && home && w.innerWidth < 992) { home.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }
    }
    UNITS.forEach(function (u) { on(u.el, "click", function (e) { stop(e); pick(u, true); }); });
    SEL = UNITS.filter(function (u) { return u.status === "Available"; })[0] || UNITS[0];
    paintSelected();
    // Home card toast (used by the waitlist module)
    var toast = qs("[data-nh-home-toast]", home), toastT = 0;
    w.NH_FLASH = function (msg) {
      if (!toast) { return; }
      var tt = qs("[data-nh-home-toast-text]", toast) || toast; tt.textContent = msg;
      toast.classList.add("is-on"); clearTimeout(toastT); toastT = setTimeout(function () { toast.classList.remove("is-on"); }, 2400);
    };

    /* Floorplan modal */
    var pm = qs("[data-nh-plan]");
    if (!pm) { return; }
    var PLANS = w.NH_PLANS || {};
    var last = null;
    function openPlan(e) {
      stop(e);
      var u = SEL || UNITS[0], loft = u.plan === "loft";
      qsa("[data-nh-plan-fig]", pm).forEach(function (f) { f.classList.toggle("is-on", f.getAttribute("data-nh-plan-fig") === u.plan); });
      var ey = qs("[data-nh-plan-eyebrow]", pm); if (ey) { ey.textContent = loft ? "Loft · Homes 16 and 17" : "Studio · Homes 1 to 15"; }
      var ti = qs("[data-nh-plan-title]", pm); if (ti) { ti.textContent = "Home " + u.n + " floorplan"; }
      var no = qs("[data-nh-plan-note]", pm); if (no) { no.textContent = loft ? "Indicative layout, base and furnished, not to scale. The PDF is the loft general layout drawing." : "Indicative layout, not to scale. The PDF is the full studio drawing set."; }
      var pdf = qs("[data-nh-plan-pdf]", pm); if (pdf && PLANS[u.plan]) { pdf.setAttribute("href", PLANS[u.plan]); }
      last = d.activeElement; planOpen = true;
      pm.classList.add("is-open"); html.classList.add("nh-modal-open");
      if (bar) { bar.classList.remove("is-on"); }
      var c = qs("[data-nh-plan-close].nh_ctl", pm); if (c) { setTimeout(function () { c.focus(); }, 80); }
    }
    function closePlan() { planOpen = false; pm.classList.remove("is-open"); html.classList.remove("nh-modal-open"); if (last && last.focus) { try { last.focus({ preventScroll: true }); } catch (e) {} } onScroll(); }
    qsa("[data-nh-plan-open]").forEach(function (b) { on(b, "click", openPlan); });
    qsa("[data-nh-plan-close]", pm).forEach(function (b) { on(b, "click", function (e) { stop(e); closePlan(); }); });
    on(d, "keydown", function (e) { if (e.key === "Escape" && planOpen) { closePlan(); } });
  })();

  /* ----------------------------------------------------------- 14. sticky bar + nav CTA */
  (function stickyBar() {
    if (!bar) { return; }
    var ty = qs("[data-nh-bar-type]", bar), tx = qs("[data-nh-bar-text]", bar);
    function paint() {
      if (!SEL || !ty || !tx) { return; }
      if (PRE && !html.classList.contains("nh-member")) { return; }   // the countdown owns the bar before launch
      ty.textContent = "Home " + SEL.n + " · " + SEL.type;
      tx.textContent = (PRE ? "From " : "") + (SEL.priceText || money(SEL.price));
      tx.setAttribute("data-nh-price", "");
    }
    d.addEventListener("nh:selected", paint);
    d.addEventListener("nh:member", paint);
    paint();
  })();

  /* ----------------------------------------------------------- 15. explore more, VR, finance, calendar, misc */
  (function more() {
    var wrap = qs("[data-nh-more]"), btn = qs("[data-nh-more-toggle]"), lab = qs("[data-nh-more-label]");
    function setOpen(open) {
      if (!wrap) { return; }
      wrap.classList.toggle("is-open", open);
      if (btn) { btn.classList.toggle("is-open", open); btn.setAttribute("aria-expanded", open ? "true" : "false"); }
      if (lab) { lab.textContent = open ? "Show Less" : "Explore More"; }
      if (open) { setTimeout(observeReveals, 90); setTimeout(function () { qsa(".nh_seg").forEach(function (s) { var b = qs(".is-on", s), ind = qs(".nh_seg_ind", s); if (b && ind) { ind.style.transform = "translateX(" + (b.offsetLeft - 4) + "px)"; ind.style.width = b.offsetWidth + "px"; } }); }, 120); }
    }
    on(btn, "click", function (e) { stop(e); setOpen(!(wrap && wrap.classList.contains("is-open"))); if (!(wrap && wrap.classList.contains("is-open")) && btn) { btn.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); } });
    qsa("[data-nh-open-more]").forEach(function (a) {
      on(a, "click", function (e) {
        stop(e); setOpen(true);
        var id = a.getAttribute("data-nh-open-more");
        setTimeout(function () { var el = d.getElementById(id); if (el) { el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); } }, 120);
      });
    });
    var h = w.location.hash.replace("#", "");
    if (h && wrap && qs("#" + h, wrap)) { setOpen(true); setTimeout(function () { var el = d.getElementById(h); if (el) { el.scrollIntoView({ block: "start" }); } }, 200); }

    // VR tabs
    var vrSeg = qs("[data-nh-seg=vr]");
    if (vrSeg) {
      segInit(vrSeg, function (v) {
        qsa("[data-nh-vr-pane]").forEach(function (p) { p.classList.toggle("is-on", p.getAttribute("data-nh-vr-pane") === v); });
        var l = qs("[data-nh-vr-label]"); if (l) { l.textContent = v === "loft" ? "Loft tour" : "Studio tour"; }
      });
    }
    on(qs("[data-nh-vr-play]"), "click", function (e) { stop(e); note("VR tours open to the waitlist at launch"); });

    // Finance: 10% deposit, data-rate over data-years, prices from the catalogue
    var fin = qs("[data-nh-fin]");
    if (fin) {
      var rate = num(fin.getAttribute("data-rate")) || 10.75, years = num(fin.getAttribute("data-years")) || 20, depPct = num(fin.getAttribute("data-deposit")) || 10;
      var LEVY = { studio: ["R2,176", "R1,511"], loft: ["R4,736", "R3,353"] };
      var setFin = function (k, v) { qsa("[data-nh-fin=\"" + k + "\"]", fin).forEach(function (el) { el.textContent = v; }); };
      var paintFin = function (v) {
        var type = v === "loft" ? "Loft" : "Studio";
        var price = typePrice(type) || (v === "loft" ? 7295000 : 3195000);
        var dep = price * depPct / 100, bond = price - dep, r = rate / 100 / 12, n = years * 12;
        var monthly = bond * r / (1 - Math.pow(1 + r, -n));
        setFin("label", v); setFin("price", money(price)); setFin("deposit", money(dep)); setFin("bond", money(bond)); setFin("monthly", money(monthly));
        setFin("levy", LEVY[v][0]); setFin("rates", LEVY[v][1]);
        fin.classList.remove("is-swap"); void fin.offsetWidth; fin.classList.add("is-swap");
      };
      var finSeg = qs("[data-nh-seg=fin]");
      if (finSeg) { segInit(finSeg, paintFin); } else { paintFin("studio"); }
    }
    qsa("[data-nh-calc-open]").forEach(function (b) { on(b, "click", function (e) { stop(e); note("The bond calculator opens as a drawer in the next release"); }); });
    on(qs("[data-nh-site-visit]"), "click", function (e) { stop(e); var t = qs("#team [data-nh-team-group] a[href^=\"mailto:\"]"); if (t) { w.location.href = t.getAttribute("href") + "?subject=Napier%20Heart%20site%20visit"; } else { note("Email anneke@heartland.co.za to book a site visit"); } });

    // Add the launch to a calendar (.ics)
    on(qs("[data-nh-add-cal]"), "click", function (e) {
      stop(e);
      if (!LAUNCH) { note("The launch date will be confirmed shortly"); return; }
      var fmt = function (t) { return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
      var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Heartland//Napier Heart//EN", "BEGIN:VEVENT", "UID:napier-heart-launch@heartland.co.za",
        "DTSTAMP:" + fmt(Date.now()), "DTSTART:" + fmt(LAUNCH), "DTEND:" + fmt(LAUNCH + 3600000), "SUMMARY:Napier Heart launch",
        "DESCRIPTION:Pricing is released to the waitlist first\\, then reservations open. " + String(w.location.href).split("#")[0],
        "LOCATION:18 Napier Street\\, De Waterkant\\, Cape Town", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
      var a = d.createElement("a"); a.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics); a.download = "napier-heart-launch.ics";
      d.body.appendChild(a); a.click(); d.body.removeChild(a);
    });
  })();

  /* ----------------------------------------------------------- 16. pre-launch: countdown, waitlist, gate, auth
     Port of heartland-sanford-v2.js module 15 (same Memberstack flow, same CRM push).
     The waitlist is Memberstack: passwordless sign-up onto the Napier Heart plan; homes live on
     the member as "waitlist-homes". #reservation-form stays a native Webflow form and is let
     through to Webflow after Memberstack has the member, so the team keeps its notifications. */
  (function prelaunch() {
    if (!PHASED) { return; }
    var LIVE = !PRE;
    var ST = { ms: null, member: null, onList: false, homes: [], pendingHomes: [], email: "", phone: "", first: "", last: "",
               mode: "signup", after: null, busy: false, pass: false };

    /* ---------------- countdown */
    var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    function launchLabel(long) {
      if (!LAUNCH) { return ""; }
      var dt = new Date(LAUNCH + 2 * 3600 * 1000);      // Johannesburg, always
      var day = DAYS[dt.getUTCDay()], mon = MONTHS[dt.getUTCMonth()];
      var time = pad(dt.getUTCHours()) + ":" + pad(dt.getUTCMinutes());
      return long ? day + " " + dt.getUTCDate() + " " + mon + " · " + time : day.slice(0, 3) + " " + dt.getUTCDate() + " " + mon.slice(0, 3) + " · " + time;
    }
    function tick() {
      var left = Math.max(0, LAUNCH - Date.now());
      var s = Math.floor(left / 1000), dd = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
      qsa("[data-nh-cd]").forEach(function (el) { var k = el.getAttribute("data-nh-cd"); el.textContent = k === "d" ? pad(dd) : k === "h" ? pad(hh) : k === "m" ? pad(mm) : pad(ss); });
      var live = LAUNCH && left <= 0;
      html.classList.toggle("nh-launched", !!live);
      qsa("[data-nh-launch-label]").forEach(function (el) {
        var long = el.getAttribute("data-nh-launch-label") !== "short";
        el.textContent = live ? "Napier Heart is live" : (long ? "Launching " : "") + launchLabel(long) + (long ? " · pricing released to the waitlist first" : "");
      });
      if (bar && !html.classList.contains("nh-member")) {
        var ty = qs("[data-nh-bar-type]", bar), tx = qs("[data-nh-bar-text]", bar);
        if (ty) { ty.textContent = live ? "Napier Heart is live" : "Launching in"; }
        if (tx) { tx.textContent = live ? "" : (dd ? dd + "d " : "") + pad(hh) + "h " + pad(mm) + "m " + pad(ss) + "s"; tx.removeAttribute("data-nh-price"); }
      }
      return live;
    }
    if (PRE && LAUNCH) { tick(); var cdTimer = setInterval(function () { if (tick()) { clearInterval(cdTimer); flip(); } }, 1000); }
    function flip() {
      if (forced) { return; }
      var a = d.activeElement, typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && String(a.value || "").length;
      if (html.classList.contains("nh-auth-open") || typing || ST.busy) { setTimeout(flip, 4000); return; }
      w.location.reload();
    }

    /* ---------------- prices: the from-price everywhere before launch */
    function paintPrices() {
      var f = fromPrice();
      qsa("[data-nh-count=from-price]").forEach(function (el) { el.textContent = f ? short(f) : "On consultation"; el.setAttribute("data-nh-price", ""); });
    }
    // A hidden price (or the calculator) is a door to sign-up.
    on(d, "click", function (e) {
      var p = e.target.closest && e.target.closest("[data-nh-price], [data-nh-calc-open]");
      if (!p || !GATED || html.classList.contains("nh-member")) { return; }
      e.preventDefault(); e.stopPropagation();
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
    function onPlan(m) { return !!(m && (m.planConnections || []).some(function (p) { return p.planId === MS_PLAN && p.active !== false && String(p.status || "").toUpperCase() !== "CANCELED"; })); }
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
      html.classList.toggle("nh-member", ST.onList);
      html.classList.toggle("nh-signed-in", !!m);
      html.classList.add("nh-auth-known");
      paintWaitlist();
      paintSelected();
      d.dispatchEvent(new CustomEvent("nh:member", { detail: ST.member }));
    }
    function msError(err) {
      var code = err && err.code ? String(err.code) : "", msg = err && err.message ? String(err.message) : "";
      if (/invalid-token|expired/i.test(code + msg)) { return "That code didn't work. Check the latest email, or send a new one."; }
      if (/disposable/i.test(code + msg)) { return "Please use a personal or work email address."; }
      if (/invalid-email/i.test(code) || /valid email/i.test(msg)) { return "That email address doesn't look right."; }
      if (/rate|too many/i.test(code + msg)) { return "Too many attempts. Wait a minute and try again."; }
      return msg || "Something went wrong. Please try again.";
    }
    function memberFields(extra) {
      var cf = {}, have = ST.member && ST.member.customFields ? ST.member.customFields : {};
      var homes = homesFrom([(have["waitlist-homes"] || ""), (extra.homes || []).join(",")].join(","));
      if (extra.replaceHomes) { homes = homesFrom((extra.homes || []).join(",")); }
      cf["waitlist-homes"] = homesLabel(homes);
      if (!have["waitlist-joined"]) { cf["waitlist-joined"] = new Date().toISOString().slice(0, 10); }
      if (extra.phone) { cf["mobile-number"] = extra.phone; }
      if (extra.first) { cf["first-name"] = extra.first; }
      if (extra.last) { cf["last-name"] = extra.last; }
      return cf;
    }
    /* CRM: Property Funnels inbound webhook (same endpoint as Sanford, development "Napier Heart").
       Override or disable on [data-nh-page] with data-nh-crm-hook="…" or "off". */
    var CRM_HOOK = (PAGE.getAttribute("data-nh-crm-hook") || "https://services.leadconnectorhq.com/hooks/QWZfk9PoAASowAZLLdv3/webhook-trigger/c35720c6-9624-4db1-8456-b398fdf6e91a").trim();
    function crmSnap() { var cf = ST.member && ST.member.customFields ? ST.member.customFields : {}; return { onList: ST.onList, homes: ST.homes.slice(), phone: cf["mobile-number"] || "", first: cf["first-name"] || "", last: cf["last-name"] || "" }; }
    function crmPush(before) {
      if (!CRM_HOOK || /^off$/i.test(CRM_HOOK) || !ST.member || !ST.onList || !w.fetch) { return; }
      var now = crmSnap(), m = ST.member, cf = m.customFields || {};
      var added = now.homes.filter(function (n) { return before.homes.indexOf(n) < 0; }), removed = before.homes.filter(function (n) { return now.homes.indexOf(n) < 0; });
      var signup = !before.onList, contact = before.phone !== now.phone || before.first !== now.first || before.last !== now.last;
      if (!signup && !added.length && !removed.length && !contact) { return; }
      var body = { event: signup ? "signup" : (added.length || removed.length ? "homes_updated" : "contact_updated"), development: "Napier Heart",
        list: LIVE ? "favourites" : "waitlist", phase: LIVE ? "live" : "prelaunch", email: (m.auth && m.auth.email) || ST.email || "",
        phone: now.phone, first_name: now.first, last_name: now.last, homes: homesLabel(now.homes), homes_added: homesLabel(added), homes_removed: homesLabel(removed),
        joined: cf["waitlist-joined"] || "", member_id: m.id || "", page_url: String(w.location.href || "").split("#")[0], environment: STAGING ? "staging" : "production", sent_at: new Date().toISOString() };
      try { w.fetch(CRM_HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true, mode: "cors" }).then(function (r) { log("crm", body.event, r && r.status); }, function (e) { log("crm failed", e && e.message); }); } catch (e) { log("crm failed", e && e.message); }
    }
    function saveMember(extra) {
      var ms = ST.ms, chain = Promise.resolve(), before = crmSnap();
      if (!onPlan(ST.member) && MS_PLAN) { chain = chain.then(function () { return ms.addPlan({ planId: MS_PLAN }); }).catch(function (e) { log("addPlan", e && e.message); }); }
      return chain.then(function () { return ms.updateMember({ customFields: memberFields(extra) }); }).then(function () { return ms.getCurrentMember(); })
        .then(function (r) { setMember(r && r.data); crmPush(before); return r && r.data; });
    }

    /* ---------------- the dialog */
    var auth = qs("[data-nh-auth]"), lastFocus = null;
    function authErr(msg) { qsa("[data-nh-auth-error]", auth).forEach(function (el) { el.textContent = msg || ""; el.style.display = msg ? "" : "none"; }); }
    function step(name) {
      if (!auth) { return; }
      qsa("[data-nh-auth-step]", auth).forEach(function (el) { el.classList.toggle("is-on", el.getAttribute("data-nh-auth-step") === name); });
      authErr("");
      var f = qs("[data-nh-auth-step=\"" + name + "\"] input:not([type=hidden])", auth);
      if (f) { setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }, 60); }
    }
    function paintAuthHomes() { qsa("[data-nh-auth-homes]", auth).forEach(function (el) { el.textContent = ST.pendingHomes.length ? "Joining for " + homesLabel(ST.pendingHomes) : ""; el.style.display = ST.pendingHomes.length ? "" : "none"; }); }
    function openAuth(name, opts) {
      opts = opts || {};
      if (!auth) { return; }
      ST.pendingHomes = opts.homes || ST.pendingHomes || []; ST.after = opts.after || null;
      lastFocus = d.activeElement;
      paintAuthHomes();
      auth.classList.add("is-open"); auth.setAttribute("aria-hidden", "false"); html.classList.add("nh-auth-open");
      if (bar) { bar.classList.remove("is-on"); }
      step(name || "email");
    }
    function closeAuth() {
      if (!auth) { return; }
      auth.classList.remove("is-open"); auth.setAttribute("aria-hidden", "true"); html.classList.remove("nh-auth-open");
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
      onScroll();
    }
    function busy(btn, on_, label) {
      if (!btn) { return; }
      var isInput = btn.tagName === "INPUT";
      if (on_) { btn.setAttribute("data-label", isInput ? btn.value : btn.textContent); if (isInput) { btn.value = label || "One moment…"; } else { btn.textContent = label || "One moment…"; } btn.disabled = true; }
      else { if (isInput) { btn.value = btn.getAttribute("data-label") || btn.value; } else { btn.textContent = btn.getAttribute("data-label") || btn.textContent; } btn.disabled = false; }
    }
    function codeSentTo(email) { qsa("[data-nh-auth-sentto]", auth).forEach(function (el) { el.textContent = "We've sent a 6-digit code to " + email + ". It's valid for 10 minutes."; }); }
    function sendCode(email) {
      var ms = ST.ms;
      if (!ms) { return Promise.reject({ message: "Sign-up is still loading. Try again in a moment." }); }
      ST.email = email;
      return ms.sendMemberSignupPasswordlessEmail({ email: email }).then(function () { ST.mode = "signup"; })
        .catch(function (err) {
          if (/already|in-use|exists/i.test((err && err.code || "") + " " + (err && err.message || ""))) { return ms.sendMemberLoginPasswordlessEmail({ email: email }).then(function () { ST.mode = "login"; }); }
          throw err;
        });
    }
    function verify(code) {
      var ms = ST.ms, extra = { homes: ST.pendingHomes, phone: ST.phone, first: ST.first, last: ST.last };
      if (ST.mode === "signup") {
        var before = crmSnap();
        return ms.signupMemberPasswordless({ email: ST.email, passwordlessToken: code, plans: MS_PLAN ? [{ planId: MS_PLAN }] : [], customFields: memberFields(extra) })
          .then(function (r) { setMember(r && r.data && (r.data.member || r.data)); return ms.getCurrentMember(); })
          .then(function (r) { setMember(r && r.data); crmPush(before); });
      }
      return ms.loginMemberPasswordless({ email: ST.email, passwordlessToken: code }).then(function (r) { setMember(r && r.data && (r.data.member || r.data)); return saveMember(extra); });
    }
    if (auth) {
      auth.setAttribute("aria-hidden", "true");
      qsa("[data-nh-auth-close]", auth).forEach(function (b) { on(b, "click", function (e) { stop(e); closeAuth(); }); });
      on(d, "keydown", function (e) { if (e.key === "Escape" && auth.classList.contains("is-open")) { closeAuth(); } });
      qsa("[data-nh-auth-back]", auth).forEach(function (b) { on(b, "click", function (e) { stop(e); step("email"); }); });
      qsa("[data-nh-auth-resend]", auth).forEach(function (b) { on(b, "click", function (e) { stop(e); if (!ST.email) { step("email"); return; } sendCode(ST.email).then(function () { authErr("A new code is on its way."); }).catch(function (err) { authErr(msError(err)); }); }); });
      qsa("[data-nh-auth-go]", auth).forEach(function (b) { on(b, "click", function () { closeAuth(); }); });
      var fEmail = qs("[data-nh-auth-form=email]", auth), fCode = qs("[data-nh-auth-form=code]", auth);
      // Webflow's own form handler must never see these two forms.
      [fEmail, fCode].forEach(function (f) { if (f) { f.setAttribute("action", "#"); } });
      on(fEmail, "submit", function (e) {
        e.preventDefault(); e.stopImmediatePropagation();
        var em = qs("input[type=email]", fEmail), btn = qs("[type=submit]", fEmail);
        var email = em ? String(em.value || "").trim() : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { authErr("Enter your email address."); if (em) { em.focus(); } return; }
        busy(btn, true, "Sending your code…");
        sendCode(email).then(function () { codeSentTo(email); step("code"); }).catch(function (err) { authErr(msError(err)); }).then(function () { busy(btn, false); });
      }, true);
      on(fCode, "submit", function (e) {
        e.preventDefault(); e.stopImmediatePropagation();
        var inp = qs("input:not([type=submit])", fCode), btn = qs("[type=submit]", fCode);
        var code = inp ? String(inp.value || "").replace(/\D/g, "") : "";
        if (code.length !== 6) { authErr("Enter the 6-digit code from the email."); return; }
        busy(btn, true, "Checking…");
        verify(code).then(function () {
          if (inp) { inp.value = ""; }
          var then = ST.after; ST.after = null;
          if (then) { closeAuth(); then(); return; }
          notifyTeam(); step("done");
        }).catch(function (err) { authErr(msError(err)); }).then(function () { busy(btn, false); });
      }, true);
      var ci = fCode && qs("input:not([type=submit])", fCode);
      on(ci, "input", function () { var v = String(ci.value || "").replace(/\D/g, "").slice(0, 6); if (ci.value !== v) { ci.value = v; } if (v.length === 6 && fCode.requestSubmit) { fCode.requestSubmit(); } });
    }

    /* ---------------- CTAs anywhere: [data-nh-waitlist] (+ data-nh-homes), [data-nh-signin] */
    on(d, "click", function (e) {
      var a = e.target.closest && e.target.closest("[data-nh-waitlist], [data-nh-signin], [data-nh-home-cta]");
      if (!a) { return; }
      var homes = homesFrom(a.getAttribute("data-nh-homes") || "");
      var isCard = a.hasAttribute("data-nh-home-cta");
      if (ST.onList) {
        if (isCard && homes.length && !LIVE) {
          e.preventDefault(); e.stopPropagation();
          busy(a, true, "Saving…");
          toggleHome(homes[0]).then(function () { chosen = ST.homes.slice(); notifyTeam(true); w.NH_FLASH && w.NH_FLASH(ST.homes.indexOf(homes[0]) >= 0 ? "Home " + homes[0] + " added to your waitlist" : "Home " + homes[0] + " removed"); })
            .catch(function (err) { log("toggle", err && err.message); }).then(function () { busy(a, false); paintWaitlist(); });
          return;
        }
        if (homes.length && !LIVE) { e.preventDefault(); toggleHome(homes[0], true); }
        return;   // the link goes to #register, where homes can be changed
      }
      e.preventDefault(); e.stopPropagation();
      if (ST.member) { saveMember({ homes: homes }).then(function () { notifyTeam(); openAuth("done"); }); return; }
      openAuth("email", { homes: homes });
    }, true);
    function toggleHome(n, forceOn) {
      n = String(n);
      var has = ST.homes.indexOf(n) >= 0;
      if (has && forceOn) { return Promise.resolve(); }
      return saveMember({ homes: has ? ST.homes.filter(function (x) { return x !== n; }) : ST.homes.concat([n]), replaceHomes: true });
    }
    function paintCardCta() {
      var cta = qs("[data-nh-home-cta]");
      if (!cta || !SEL) { return; }
      if (LIVE) { cta.textContent = ST.onList || !GATED ? "Reserve Home " + SEL.n : "Sign Up to Reserve"; cta.setAttribute("href", "#register"); return; }
      var mine = ST.homes.indexOf(SEL.n) >= 0;
      cta.classList.toggle("is-on-list", mine);
      cta.textContent = !ST.onList ? "Join the Waitlist for Home " + SEL.n : mine ? "On Your Waitlist ✓" : "Add Home " + SEL.n + " to Your Waitlist";
    }
    d.addEventListener("nh:selected", paintCardCta);

    /* ---------------- #reservation-form as the waitlist */
    var form = qs("#reservation-form"), picker = qs("[data-nh-wl-picker]"), chosen = [];
    function field(id) { return d.getElementById(id); }
    function paintPicker() {
      if (LIVE || !picker || !UNITS.length) { return; }
      if (!picker.getAttribute("data-built")) {
        picker.setAttribute("data-built", "1");
        picker.innerHTML = "";
        var lab = d.createElement("div"); lab.className = "nh_wl_label"; lab.textContent = "Homes you'd like to hold (optional)"; picker.appendChild(lab);
        var row = d.createElement("div"); row.className = "nh_wl_chips"; row.setAttribute("role", "group"); row.setAttribute("aria-label", "Homes you'd like to hold");
        UNITS.filter(function (u) { return u.status === "Available"; }).forEach(function (u) {
          var b = d.createElement("button"); b.type = "button"; b.className = "nh_wl_chip"; b.setAttribute("data-home", u.n); b.setAttribute("aria-pressed", "false");
          b.textContent = "Home " + u.n + " · " + u.type;
          on(b, "click", function () { var i = chosen.indexOf(u.n); if (i >= 0) { chosen.splice(i, 1); } else { chosen.push(u.n); } paintPicker(); });
          row.appendChild(b);
        });
        picker.appendChild(row);
      }
      qsa(".nh_wl_chip", picker).forEach(function (b) { var onIt = chosen.indexOf(b.getAttribute("data-home")) >= 0; b.classList.toggle("is-on", onIt); b.setAttribute("aria-pressed", onIt ? "true" : "false"); });
      var hid = form && qs("input[name=\"Waitlist Homes\"], #nh-unit-id", form);
      if (hid) { hid.value = homesLabel(chosen.slice().sort(function (a, b) { return a - b; })); }
    }
    function prepForm() {
      if (!form) { return; }
      var wrap = form.closest(".w-form") || form.parentNode;
      qsa(".w-form-done, .w-form-fail", wrap).forEach(function (el) { if (!el.hasAttribute("tabindex")) { el.setAttribute("tabindex", "-1"); } el.focus = function () { try { HTMLElement.prototype.focus.call(el, { preventScroll: true }); } catch (e) {} }; });
      form.setAttribute("data-name", "Napier Waitlist"); form.setAttribute("name", "napier-waitlist");
      ["nh-first-name", "nh-last-name", "nh-contact-number", "nh-intent"].forEach(function (id) { var el = field(id); if (el) { el.removeAttribute("required"); } });
      var em = field("nh-email"); if (em) { em.setAttribute("required", "required"); em.setAttribute("autocomplete", "email"); }
      var hid = field("nh-unit-id"); if (hid) { hid.setAttribute("name", "Waitlist Homes"); hid.setAttribute("data-name", "Waitlist Homes"); }
      var sub = qs("input[type=submit]", form); if (sub) { sub.value = "Join the Waitlist"; sub.setAttribute("data-wait", "Adding you to the list…"); }
    }
    var me = null;
    function paintMe() {
      if (!form) { return; }
      var m = ST.member, onIt = !!(m && ST.onList);
      form.classList.toggle("is-member", onIt);
      var em = field("nh-email"); if (em) { em.readOnly = onIt; }
      if (!onIt) { form.classList.remove("is-editing"); if (me) { me.style.display = "none"; } return; }
      if (!me) {
        me = d.createElement("div"); me.className = "nh_wl_me";
        me.innerHTML = '<p class="nh_wl_hello"></p><p class="nh_wl_sub"></p><button type="button" class="nh_wl_edit"></button>';
        form.insertBefore(me, form.firstChild);
        on(qs(".nh_wl_edit", me), "click", function () { var open = form.classList.toggle("is-editing"); paintMe(); if (open) { var f = field("nh-first-name"); if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } } } });
      }
      me.style.display = "";
      var cf = m.customFields || {}, first = String(cf["first-name"] || "").trim(), email = (m.auth && m.auth.email) || "";
      var editing = form.classList.contains("is-editing");
      qs(".nh_wl_hello", me).textContent = first ? "Welcome back, " + first + "." : "Welcome back.";
      qs(".nh_wl_sub", me).textContent = "You’re on the waitlist" + (email ? " as " + email : "") + ".";
      var eb = qs(".nh_wl_edit", me); eb.textContent = editing ? "Hide details" : "Edit details"; eb.setAttribute("aria-expanded", editing ? "true" : "false");
    }
    function paintWaitlist() {
      if (LIVE) { paintLive(); paintCardCta(); return; }
      paintCardCta();
      if (form) {
        var em = field("nh-email"), ph = field("nh-contact-number"), fn = field("nh-first-name"), ln = field("nh-last-name"), m = ST.member;
        if (m && m.auth && em && !em.value) { em.value = m.auth.email || ""; }
        if (m && m.customFields) {
          if (ph && !ph.value && m.customFields["mobile-number"]) { ph.value = m.customFields["mobile-number"]; }
          if (fn && !fn.value && m.customFields["first-name"]) { fn.value = m.customFields["first-name"]; }
          if (ln && !ln.value && m.customFields["last-name"]) { ln.value = m.customFields["last-name"]; }
        }
        if (ST.onList && !form.getAttribute("data-seeded")) { form.setAttribute("data-seeded", "1"); chosen = ST.homes.slice(); }
        var sub = qs("input[type=submit]", form); if (sub) { sub.value = ST.onList ? "Update My Waitlist" : "Join the Waitlist"; }
        paintMe();
      }
      paintPicker();
      qsa(".nh_nav_cta, [data-nh-bar-cta]").forEach(function (a) { a.textContent = ST.onList ? "My Waitlist" : "Join the Waitlist"; });
      qsa("[data-nh-bar-count]").forEach(function (el) { el.textContent = String(ST.homes.length); });
    }
    function nativeSubmit() {
      if (!form) { return; }
      var wrap = form.closest(".w-form") || form.parentNode, done = qs(".w-form-done", wrap);
      if (done && ST.onList && form.getAttribute("data-notified")) { done.textContent = "Your waitlist is updated. We’ll email you the moment pricing is released."; }
      ST.pass = true;
      if (form.requestSubmit) { form.requestSubmit(); } else { form.submit(); }
    }
    function notifyTeam(force) {
      if (LIVE) { return; }
      if (!form || (!force && form.getAttribute("data-notified"))) { return; }
      form.setAttribute("data-notified", "1");
      var m = ST.member || {}, em = field("nh-email"), ph = field("nh-contact-number");
      if (em) { em.value = (m.auth && m.auth.email) || ST.email || em.value; }
      if (ph && !ph.value) { ph.value = ST.phone || (m.customFields && m.customFields["mobile-number"]) || ""; }
      chosen = ST.homes.slice(); paintPicker(); nativeSubmit();
    }
    w.addEventListener("submit", function (e) {
      if (!form || e.target !== form) { return; }
      if (LIVE) {
        if (ST.onList || ST.pass || !GATED) { ST.pass = false; return; }
        e.preventDefault(); e.stopImmediatePropagation();
        var em0 = field("nh-email"), email0 = em0 ? String(em0.value || "").trim() : "";
        var again = function () { ST.pass = true; if (form.requestSubmit) { form.requestSubmit(); } else { form.submit(); } };
        if (ST.member) { saveMember({}).then(again); return; }
        if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email0)) { sendCode(email0).then(function () { codeSentTo(email0); openAuth("code", { after: again }); }).catch(function (err) { alertForm(msError(err)); }); }
        else { openAuth("email", { after: again }); }
        return;
      }
      if (ST.pass) { ST.pass = false; form.setAttribute("data-notified", "1"); return; }
      e.preventDefault(); e.stopImmediatePropagation();
      if (ST.busy) { return; }
      var em = field("nh-email"), email = em ? String(em.value || "").trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { if (em && em.reportValidity) { em.reportValidity(); } return; }
      var extra = { homes: chosen.slice(), replaceHomes: ST.onList, phone: String((field("nh-contact-number") || {}).value || "").trim(), first: String((field("nh-first-name") || {}).value || "").trim(), last: String((field("nh-last-name") || {}).value || "").trim() };
      var sub = qs("input[type=submit]", form);
      ST.busy = true;
      if (sub) { sub.setAttribute("data-was", sub.value); sub.value = "One moment…"; }
      function done() { ST.busy = false; if (sub) { sub.value = sub.getAttribute("data-was") || sub.value; } }
      var mine = ST.member && ST.member.auth && String(ST.member.auth.email || "").toLowerCase() === email.toLowerCase();
      if (mine) { saveMember(extra).then(function () { done(); nativeSubmit(); }).catch(function (err) { done(); alertForm(msError(err)); }); return; }
      ST.phone = extra.phone; ST.first = extra.first; ST.last = extra.last; ST.pendingHomes = extra.homes;
      sendCode(email).then(function () { done(); codeSentTo(email); openAuth("code", { homes: extra.homes, after: function () { nativeSubmit(); } }); }).catch(function (err) { done(); alertForm(msError(err)); });
    }, true);
    function alertForm(msg) { var n = form && qs(".nh_form_note", form); if (n) { n.textContent = msg; n.classList.add("is-error"); setTimeout(function () { n.classList.remove("is-error"); }, 6000); } else { note(msg); } }

    /* ---------------- live copy */
    var LIVE_COPY = [
      [".nh_gate .nh_eyebrow", "Registered buyers"],
      [".nh_gate_title", "Availability and pricing are open to registered buyers."],
      ["[data-nh-gate-text]", "Signing up takes a minute: your email, and a 6-digit confirmation code. No password or payment required."],
      ["[data-nh-gate-cta]", "Sign Up to View"],
      [".nh_gate_signin", "Already registered? Sign in"],
      ["[data-nh-reg-lead]", "R3 000 holds a home for 7 days, fully refundable. We'll send the plans, the finishes schedule and a payment reference within the hour."],
      ["[data-nh-auth-step=email] .nh_eyebrow", "Registered buyers"],
      ["[data-nh-auth-step=done] .nh_eyebrow", "You're registered"],
      ["[data-nh-auth-done-title]", "Every home is open to you."],
      ["[data-nh-auth-done-text]", "Availability and pricing are unlocked. Choose your home and reserve it when you're ready."],
      ["[data-nh-auth-go]", "Choose a Home"]
    ];
    function liveCopy() {
      LIVE_COPY.forEach(function (r) { qsa(r[0]).forEach(function (el) { if (el.getAttribute("data-nh-live-done")) { return; } el.setAttribute("data-nh-live-done", "1"); el.textContent = el.getAttribute("data-nh-live-text") || r[1]; var href = el.getAttribute("data-nh-live-href") || r[2]; if (href) { el.setAttribute("href", href); el.removeAttribute("data-nh-waitlist"); } }); });
      qsa("[data-nh-live-text]:not([data-nh-live-done])").forEach(function (el) {
        var em = qs("em", el);
        if (em && el.classList.contains("nh_split_text")) { el.innerHTML = ""; el.removeAttribute("data-nh-split-done"); el.textContent = el.getAttribute("data-nh-live-text"); if (!reduce) { splitEl(el); } }
        else { el.textContent = el.getAttribute("data-nh-live-text"); }
        if (el.getAttribute("data-nh-live-href")) { el.setAttribute("href", el.getAttribute("data-nh-live-href")); el.removeAttribute("data-nh-waitlist"); }
      });
      if (picker) { picker.style.display = "none"; }
      var sub = form && qs("input[type=submit]", form); if (sub && /wait/i.test(sub.value)) { sub.value = "Reserve this home"; }
      qsa("[data-nh-countdown]").forEach(function (el) { el.style.display = "none"; });
    }
    function paintLive() {
      qsa(".nh_nav_cta, [data-nh-bar-cta]").forEach(function (a) {
        if (ST.onList || !GATED) { a.textContent = a.hasAttribute("data-nh-bar-cta") ? "Reserve" : "Reserve a Home"; a.setAttribute("href", "#register"); a.removeAttribute("data-nh-waitlist"); }
        else { a.textContent = "Sign Up to View"; a.setAttribute("href", "#availability"); a.setAttribute("data-nh-waitlist", ""); }
      });
      if (form) {
        var em = field("nh-email"), ph = field("nh-contact-number"), fn = field("nh-first-name"), ln = field("nh-last-name"), m = ST.member;
        if (m && m.auth && em && !em.value) { em.value = m.auth.email || ""; }
        if (m && m.customFields) { if (ph && !ph.value && m.customFields["mobile-number"]) { ph.value = m.customFields["mobile-number"]; } if (fn && !fn.value && m.customFields["first-name"]) { fn.value = m.customFields["first-name"]; } if (ln && !ln.value && m.customFields["last-name"]) { ln.value = m.customFields["last-name"]; } }
      }
    }
    /* Sign out (footer link, shown by html.nh-signed-in) */
    qsa("[data-nh-signout]").forEach(function (b) { on(b, "click", function (e) { stop(e); if (!ST.ms) { return; } b.textContent = "Signing out…"; var bye = function () { w.location.reload(); }; try { ST.ms.logout().then(bye, bye); } catch (err) { bye(); } }); });

    /* ---------------- boot */
    paintPrices();
    if (LIVE) { liveCopy(); } else { prepForm(); }
    paintWaitlist();
    whenMs(function (ms) {
      if (!ms) { html.classList.add("nh-auth-known"); return; }
      ms.getCurrentMember().then(function (r) { setMember(r && r.data); }).catch(function () { setMember(null); });
      if (ms.onAuthChange) { ms.onAuthChange(function (m) { setMember(m && (m.data || m)); }); }
    });
    w.NH_WAITLIST = { state: ST, open: openAuth, close: closeAuth, homes: function () { return ST.homes.slice(); }, signedIn: function () { return !!ST.member; },
      toggle: function (n) { n = String(n); if (!ST.member) { openAuth("email", { homes: [n] }); return Promise.resolve(false); }
        return (ST.onList ? toggleHome(n) : saveMember({ homes: [n] })).then(function () { chosen = ST.homes.slice(); notifyTeam(true); paintWaitlist(); return ST.homes.indexOf(n) >= 0; }).catch(function (err) { log("toggle", err && err.message); return null; }); } };
  })();

  log("ready", { phase: PHASE, pre: PRE, gated: GATED, units: UNITS.length });
})(window, document);
