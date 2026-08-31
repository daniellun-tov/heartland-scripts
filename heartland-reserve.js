/* ============================================================================
   HEARTLAND - the reserve journey, in one file.

   Three modules that used to be three files and three Code Embeds:

     1. BUYER FIELDS   window.HLBuyer - SA-ID date of birth, required-field checks,
                       free address suggestions. Always defined; defines nothing else.
     2. ENTRY POINT    the brochure hand-off. Runs only where the page carries
                       data-hl-entry, and takes its property from that attribute.
     3. THE FLOW       the reserve steps themselves. Runs only where the page carries
                       data-hl-step.

   WHY ONE FILE. Three files meant three tags to keep in step, three chances for a
   page to load a stale pair, and three places to look when something misbehaved.
   One file, one tag, and the page says what it wants.

   WHY THAT IS SAFE. Neither module does anything on a page that has not asked for it.
   That is not a convenience - the entry point's submit handler matches any
   #reservation-form, so a bundle without these gates, loaded site-wide, would
   intercept a POLARIS buyer's submit and file a SANFORD reservation. The markers are
   what make one tag everywhere safe, and Polaris keeping working is the constraint
   this whole rebuild is built around.

   THE PAGE MARKERS
     <div data-hl-entry="sanford"                brochure pages: arm the hand-off
          data-hl-target="/reserve-flow"         optional, default /reserve-v2
          data-hl-legacy="https://..."></div>    optional, default /reserve/1
     [data-hl-step="unit|details|pay|done"]      the flow's own sections

   data-hl-target being an attribute rather than a constant matters: moving buyers to
   a different flow page is then a Webflow change, not a push. A push does not reach
   the browser until jsDelivr's branch cache turns over, which has already caught us
   once.

   ?hl_debug=1 logs. Each module keeps its own header below.
   ========================================================================== */

/* ============================================================================
   HEARTLAND - stage F. Buyer-detail field behaviours.

   Three things, all requested 24 Aug. Written as a standalone module so the same
   code can later move onto the real details page without being rewritten.

     1. Date of birth, derived from a South African ID number.
     2. Nationality enforced as required.
     3. Address autocomplete that costs nothing.
   ========================================================================== */
(function (w) {
  "use strict";

  /* -------------------------------------------------- 1. SA ID -> date of birth

     A South African ID is 13 digits: YYMMDD SSSS C A Z.
       YYMMDD  date of birth
       SSSS    sequence, and it encodes gender
       C       citizenship: 0 South African, 1 permanent resident
       A       historically a race digit, unused since 1994
       Z       Luhn check digit over the preceding 12

     DELIBERATELY NOT DONE: nationality is NOT inferred from the citizenship
     digit. A permanent resident is not South African, and quietly stamping a
     nationality onto a person from a digit would be both wrong and the kind of
     thing nobody notices until it is on a signed document. */

  function digitsOnly(v) {
    return String(v === null || v === undefined ? "" : v).replace(/[^0-9]/g, "");
  }

  /* The check digit is what turns a typo into a caught typo. Without it a
     transposed pair still yields a plausible date - and that date would travel
     onto the OTP. */
  function luhnOk(id) {
    if (id.length !== 13) { return false; }
    var sum = 0, alt = false, i, n;
    for (i = id.length - 1; i >= 0; i--) {
      n = Number(id.charAt(i));
      if (alt) { n *= 2; if (n > 9) { n -= 9; } }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /* Century. "85" is 1985 and "07" is 2007, but the digits alone cannot say which.
     The rule used here is domain-specific and better than the usual "not in the
     future": a property buyer is at least 18, so a two-digit year that would make
     them younger than that belongs to the previous century. Plain "not in the
     future" would read 25 as 2025 and hand us a one-year-old buyer. */
  var MIN_AGE = 18;

  function dobFromSaId(raw, todayYear) {
    var id = digitsOnly(raw);
    if (id.length !== 13) { return { ok: false, reason: "not 13 digits" }; }

    var yy = Number(id.slice(0, 2));
    var mm = Number(id.slice(2, 4));
    var dd = Number(id.slice(4, 6));
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) { return { ok: false, reason: "not a real date" }; }

    var year = 2000 + yy;
    if (year > todayYear - MIN_AGE) { year = 1900 + yy; }

    // Rejects 31 February and friends: the Date would silently roll into March.
    var d = new Date(Date.UTC(year, mm - 1, dd));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) {
      return { ok: false, reason: "not a real date" };
    }

    return {
      ok: true,
      iso: year + "-" + pad2(mm) + "-" + pad2(dd),
      checkDigitOk: luhnOk(id)
    };
  }

  /* Only an Individual has an ID number in this shape. A company registration is
     2019/123456/07 and a trust is IT1234/2019 - parsing either as a date would
     produce confident nonsense. Exact match, lowercased; never a substring test. */
  function isIndividual(buyerType) {
    return String(buyerType === null || buyerType === undefined ? "" : buyerType)
      .trim().toLowerCase() === "individual";
  }

  /* ------------------------------------------------------- 2. nationality gate

     The native `required` cannot be relied on here. On the live details page the
     nationality select is driven by a country-picker library (data-dropdown=
     "country"), which hides the real <select>; a hidden required control either
     cannot be focused - so the browser refuses to submit and only says so in the
     console - or is moved out of the form, so validation never runs at all.
     Checking the value ourselves sidesteps both. */
  function missingRequired(values, required) {
    var out = [];
    for (var i = 0; i < required.length; i++) {
      var k = required[i];
      var v = values[k];
      if (v === null || v === undefined || String(v).trim() === "") { out.push(k); }
    }
    return out;
  }

  /* --------------------------------------------------- 3. address autocomplete

     TWO LEVELS, and the first one is the one people forget.

     (a) The browser already knows the buyer's address. It just needs the field to
         say what it holds - autocomplete="street-address" and friends. No script,
         no service, no cost, no dependency, works offline. The live fields carry
         no autocomplete attributes at all today, which is why it never offers.

     (b) Search-as-you-type needs a geocoder. Photon is OpenStreetMap-based, free,
         and explicitly built for type-ahead. Nominatim is also free but its usage
         policy discourages autocomplete; Google Places and Mapbox both bill.

     Photon is a third party on a page that takes money, so it is strictly
     additive: debounced, abortable, and every failure path leaves the buyer
     typing a plain address exactly as they do now. */
  var PHOTON = "https://photon.komoot.io/api/";

  /* SOUTH AFRICA, UNLESS TOLD OTHERWISE.
     Photon ranks by a mix of prominence and distance, and with no hint it answered
     "17 Alice Road" with West Islip, Randolph, Croton Falls and Aireys Inlet - four
     countries, none of them this one. Every buyer of a Pretoria house is typing a
     South African address.

     bbox is a HARD bound - results outside it are not returned at all - and lat/lon
     bias the ranking within it towards Gauteng, where the developments are. Both are
     overridable per call, so a property somewhere else needs no code change.
     bbox is minLon,minLat,maxLon,maxLat and covers the mainland plus a margin. */
  var SA_BBOX = "16.45,-34.84,32.95,-22.13";
  var SA_LAT = -25.75;    // Pretoria
  var SA_LON = 28.19;

  function addressSuggest(term, opts) {
    opts = opts || {};
    var q = String(term || "").trim();
    if (q.length < 4) { return Promise.resolve([]); }
    var url = PHOTON + "?q=" + encodeURIComponent(q) + "&limit=5&lang=en";
    var bbox = (opts.bbox === undefined) ? SA_BBOX : opts.bbox;
    if (bbox) { url += "&bbox=" + encodeURIComponent(bbox); }
    var lat = (opts.lat === undefined) ? SA_LAT : opts.lat;
    var lon = (opts.lon === undefined) ? SA_LON : opts.lon;
    if (lat !== null && lon !== null) { url += "&lat=" + lat + "&lon=" + lon; }
    return fetch(url, { signal: opts.signal })
      .then(function (r) { return r.ok ? r.json() : { features: [] }; })
      .then(function (j) { return ((j && j.features) || []).map(formatFeature); })
      .catch(function () { return []; });   // never surfaces to the buyer
  }

  function formatFeature(f) {
    var p = (f && f.properties) || {};
    /* The country is dropped when it is the one we already bounded the search to -
       five suggestions all ending "South Africa" is five wasted lines on a phone. */
    var country = (String(p.country || "").toLowerCase() === "south africa") ? null : p.country;
    var line = [
      [p.housenumber, p.street || p.name].filter(Boolean).join(" "),
      p.district,
      p.city,
      p.state,
      p.postcode,
      country
    ].filter(Boolean).join(", ");
    return { label: line, raw: p };
  }

  /* ------------------------------------------------------------ 4. busy buttons

     Lifted from heartland-polaris.js so the two behave identically - same class
     names, same spinner, same default wording. It is deliberately a copy of the
     BEHAVIOUR rather than a shared import: the brochure scripts are per-property,
     pinned per-property, and one of them is live and selling. Nothing here may make
     Polaris depend on this file.

     The button says what is happening and stops accepting clicks. pointer-events on
     .res-busy is what makes a double submit impossible, which matters more here than
     the spinner: the second click of an impatient double-click would otherwise file a
     second reservation. */
  function ensureSpinnerCss() {
    if (document.getElementById("res-spinner-css")) { return; }
    var st = document.createElement("style");
    st.id = "res-spinner-css";
    st.textContent =
      ".res-spinner{display:inline-block;width:.85em;height:.85em;margin-left:.5em;vertical-align:-.1em;" +
      "border:2px solid currentColor;border-right-color:transparent;border-radius:50%;" +
      "animation:res-spin .6s linear infinite}" +
      "@keyframes res-spin{to{transform:rotate(360deg)}}" +
      ".res-busy{opacity:.65;cursor:default;pointer-events:none}";
    document.head.appendChild(st);
  }

  var spinTimers = [];

  function setBusy(btn, on, waitText) {
    if (!btn) { return; }
    for (var t = 0; t < spinTimers.length; t++) { clearInterval(spinTimers[t]); }
    spinTimers = [];

    if (!on) {
      btn.classList.remove("res-busy");
      btn.removeAttribute("aria-busy");
      if (btn.tagName === "INPUT") {
        if (btn.getAttribute("data-res-original") !== null) { btn.value = btn.getAttribute("data-res-original"); }
        btn.disabled = false;
      } else if (btn.getAttribute("data-res-original") !== null) {
        btn.innerHTML = btn.getAttribute("data-res-original");
      }
      btn.removeAttribute("data-res-original");
      return;
    }

    ensureSpinnerCss();
    var wait = btn.getAttribute("data-wait") || waitText || "Reserving your home";
    btn.classList.add("res-busy");
    btn.setAttribute("aria-busy", "true");

    if (btn.tagName === "INPUT") {
      if (btn.getAttribute("data-res-original") === null) { btn.setAttribute("data-res-original", btn.value); }
      btn.value = wait;
      btn.disabled = true;
      /* An <input> cannot hold a spinner element, so the dots are the spinner. */
      var n = 0;
      spinTimers.push(setInterval(function () {
        n = (n + 1) % 4;
        btn.value = wait + "...".slice(0, n);
      }, 350));
    } else {
      if (btn.getAttribute("data-res-original") === null) { btn.setAttribute("data-res-original", btn.innerHTML); }
      btn.innerHTML = wait + '<span class="res-spinner"></span>';
    }
  }

  /* The submit control of a form, by the same rule Polaris uses. */
  function submitButton(form) {
    if (!form) { return null; }
    return form.querySelector('input[type="submit"], button[type="submit"], [data-res-submit="true"]');
  }

  /* ============================================================ 5. RENDERING

     The data-hl contract, in one place, because TWO pages now use it: the reserve
     flow and the portal. It was written inside the flow and would have been copied
     into the portal - and a copied renderer is two renderers, which drift, and the
     drift shows up as a figure that is right on one page and wrong on the other.

     Everything here takes its root and its data as arguments and holds no state. */

  /* Integer cents in, grouped rands out. Hand-grouped rather than toLocaleString:
     the legacy page used toLocaleString and it disagrees with toFixed on the half
     cent - 999999.995 renders as 999,999.99 one way and 1,000,000.00 the other.
     Same routine as build_otp_url, so a figure shown here and a figure on the OTP
     cannot differ by a cent. THIS IS FORMATTING, NOT ARITHMETIC. */
  function money(cents) {
    var n = Math.round(Number(cents));
    if (!isFinite(n)) { return ""; }
    var neg = n < 0;
    n = Math.abs(n);
    var whole = String(Math.floor(n / 100));
    var frac = String(n % 100);
    if (frac.length < 2) { frac = "0" + frac; }
    var out = "", c = 0;
    for (var k = whole.length - 1; k >= 0; k--) {
      out = whole.charAt(k) + out;
      c++;
      if (c % 3 === 0 && k > 0) { out = "," + out; }
    }
    return (neg ? "-R" : "R") + out + "." + frac;
  }

  /* A sentinel, so a legitimately null value is not mistaken for an absent path. */
  var MISSING = {};

  function path(obj, p) {
    var parts = String(p).split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined || typeof cur !== "object") { return MISSING; }
      if (!(parts[i] in cur)) { return MISSING; }
      cur = cur[parts[i]];
    }
    return cur;
  }

  function display(p, v) {
    if (v === null || v === undefined || v === "") { return "\u2014"; }
    if (/_cents$/.test(p)) { return money(v); }
    return String(v);
  }

  /* querySelectorAll never matches the element you called it on. That is fine when
     the root is the document, and wrong the moment a root is a single card being
     rendered against one object - the card's own data-hl-attr="href:url" would be
     silently skipped, which is this project's characteristic bug wearing a new hat.
     So the root is considered too. */
  function within(root, sel) {
    var out = [];
    if (root && typeof root.matches === "function" && root.matches(sel)) { out.push(root); }
    var found = root.querySelectorAll(sel);
    for (var i = 0; i < found.length; i++) { out.push(found[i]); }
    return out;
  }

  function renderDisplays(root, data, onMissing) {
    var els = within(root, "[data-hl]");
    for (var i = 0; i < els.length; i++) {
      var p = els[i].getAttribute("data-hl");
      var v = path(data, p);
      if (v === MISSING) {
        if (onMissing) { onMissing(p); }
        continue;                       // leave the Designer's own copy in place
      }
      els[i].textContent = display(p, v);
    }

    var attrs = within(root, "[data-hl-attr]");
    for (var j = 0; j < attrs.length; j++) {
      var spec = String(attrs[j].getAttribute("data-hl-attr") || "");
      var colon = spec.indexOf(":");
      if (colon < 1) { continue; }
      var name = spec.slice(0, colon).trim();
      var vp = spec.slice(colon + 1).trim();
      var av = path(data, vp);
      if (av === MISSING || av === null || av === "") { continue; }
      attrs[j].setAttribute(name, String(av));
    }

    toggle(root, data, "[data-hl-show]", "data-hl-show", true);
    toggle(root, data, "[data-hl-hide]", "data-hl-hide", false);
  }

  function toggle(root, data, sel, attr, showWhenTruthy) {
    var els = within(root, sel);
    for (var i = 0; i < els.length; i++) {
      var v = path(data, els[i].getAttribute(attr));
      var truthy = !(v === MISSING || v === null || v === undefined || v === "" || v === false);
      els[i].style.display = (truthy === showWhenTruthy) ? "" : "none";
    }
  }

  w.HLRender = {
    money: money,
    path: path,
    display: display,
    displays: renderDisplays,
    within: within,
    toggle: toggle,
    MISSING: MISSING
  };

  w.HLBuyer = {
    setBusy: setBusy,
    submitButton: submitButton,
    dobFromSaId: dobFromSaId,
    isIndividual: isIndividual,
    luhnOk: luhnOk,
    missingRequired: missingRequired,
    addressSuggest: addressSuggest,
    MIN_AGE: MIN_AGE
  };
})(window);

/* ============================================================================
   HEARTLAND - stage F. Brochure entry point for the uuid flow. SANFORD ONLY.

   VERSION 3.

   v1 watched the unit radios for a click, using selectors guessed from
   heartland-sanford.js. It never fired - the Webflow element API rate-limited every
   attempt to verify a selector against the real page, so the selectors were a guess,
   and the guess was wrong. The buyer landed on /reserve/1.

   v2 stopped using selectors and read the unit id out of the form's own FormData,
   matching against the seven Sanford CMS item ids. Reading the CMS afterwards showed
   that would have failed too, for a different reason: the CMS unit-id column is not a
   key. Six Sanford units carry strings like "sanford-heart-06-placeholder", one
   carries its own item id, and one is null. If the hidden field is bound to that
   column - and its name says it is - then no item id ever appears in the form at all.

   v3 STOPS GUESSING ENTIRELY. It sends EVERY field the form carries to Xano and lets
   the server work out which unit was meant, matching against the live collection in
   tiers - item id, then unit-id text, then slug, then name, then unit number - and
   refusing to answer when a tier matches more than one unit. That resolution lives in
   resolve_unit_from_form and is covered by tests against the real Sanford data.

   So this file no longer contains a single fact about the CMS. Add an eighth unit and
   nothing here needs to change.

   IT OWNS THE NAVIGATION, so it must always produce one.
   Because it stops propagation, the legacy handler never runs, so the legacy URL is
   rebuilt here byte for byte and used on every failure path: unresolvable form, Xano
   down, Xano slow, an exception anywhere. The worst case is exactly today's behaviour
   plus a short delay. A buyer is never left on a dead page.

   WHEN IT REFUSES, IT SAYS WHY. Xano answers an unresolvable form with a 400 whose
   message names the fields it saw. That message is logged to the console
   unconditionally - not behind hl_debug - because one failed submit should be enough
   to diagnose the next fix. Two rounds have already been spent on not knowing.
   ========================================================================== */
(function (w, d) {
  "use strict";

  var BASE = "https://x7aj-untn-pq4t.n7e.xano.io/api:i0YhKPAV";
  /* Overridable from the marker, so moving the buyer to a different flow page is a
     Webflow change rather than a push - which matters, because a push does not reach
     the browser until jsDelivr's branch cache turns over. */
  var TARGET = "/reserve-v2";
  var LEGACY = "https://www.heartland.co.za/reserve/1";   // overridable via data-hl-legacy
  /* SET IN bind(), FROM THE PAGE'S MARKER - never hardcoded.
     Without this the bundle could not be loaded anywhere but one page: the submit
     handler matches any #reservation-form, so on Polaris's brochure page it would
     intercept a Polaris buyer and file a SANFORD reservation. The marker is what
     makes "load it everywhere" safe, and it also stops the entry point being
     Sanford-only by construction. */
  var PROPERTY = "";
  var UUID_KEY = "hl_v2_uuid";

  /* Read through window each time rather than captured at load: the modules are
     separate IIFEs in one file and this one must not care about their order. */
  function setBusy(btn, on, txt) {
    if (w.HLBuyer && w.HLBuyer.setBusy) { w.HLBuyer.setBusy(btn, on, txt); }
  }
  function submitButton(form) {
    return (w.HLBuyer && w.HLBuyer.submitButton) ? w.HLBuyer.submitButton(form) : null;
  }
  var UNIT_KEY = "hl_v2_unit";

  /* The server reads two pages of the CMS collection before it can answer, which
     measures at a little over a second. 8s is generous on purpose: the cost of waiting
     is a slow page transition, and the cost of giving up early is dropping a buyer
     back into the flimsy flow this whole exercise exists to replace. */
  var CREATE_TIMEOUT_MS = 8000;

  /* CHANGED 25 Aug, and the reason matters.

     This used to drop any value carrying an @ or longer than 64 characters, on the
     grounds that an email or an address cannot identify a unit and had no business in
     a request that only resolved units. That was right then and is wrong now: the
     endpoint also carries the buyer's answers into the reservation, so an email and an
     address are the whole point. Withholding them is what makes someone type their
     name twice.

     The cap stays, raised, purely to keep a runaway field from bloating the request. */
  var MAX_VALUE_LEN = 200;

  var DEBUG = /[?&]hl_debug=1/.test(w.location.search);
  var FORCE_LEGACY = /[?&]hl_legacy=1/.test(w.location.search);

  function log() {
    if (DEBUG && w.console) { console.log.apply(console, ["[hl-entry]"].concat([].slice.call(arguments))); }
  }
  function warn() {
    if (w.console) { console.warn.apply(console, ["[hl-entry]"].concat([].slice.call(arguments))); }
  }
  function stored(k) { try { return w.localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function store(k, v) { try { w.localStorage.setItem(k, v); } catch (e) {} }
  function drop(k) { try { w.localStorage.removeItem(k); } catch (e) {} }

  /* Rebuilt to match heartland-sanford.js exactly, including its '+' to %20 pass.
     This is the fallback, so it has to be indistinguishable from what happens today. */
  function legacyUrl(form) {
    try {
      var params = new w.URLSearchParams(new w.FormData(form)).toString().split("+").join("%20");
      return LEGACY + "?" + params;
    } catch (e) {
      return LEGACY;
    }
  }

  /* Every field, as {k, v}. No opinion about which one matters - that is the server's
     job now, and every browser-side opinion so far has been wrong. The server uses this
     for two things: working out WHICH UNIT was meant, and carrying WHAT THE BUYER
     ALREADY TYPED into the reservation so it is never asked for a second time. */
  function pairsFrom(form) {
    var out = [];
    try {
      var fd = new w.FormData(form);
      var it = fd.entries();
      var e = it.next();
      while (!e.done) {
        var k = e.value[0];
        var v = e.value[1];
        if (typeof v === "string") {
          var s = v.trim();
          if (s !== "" && s.length <= MAX_VALUE_LEN) {
            out.push({ k: String(k), v: s });
          }
        }
        e = it.next();
      }
    } catch (err) {
      log("could not read the form data:", err && err.message);
    }
    return out;
  }

  /* FIRST-TOUCH CONTEXT, and one field in it is load-bearing.

     origin_host is the host the buyer was actually on. Xano turns it into the
     reservation number's prefix: a deal made on the Webflow staging site becomes
     RES-TEST-SAN-001 rather than RES-SAN-001, so a salesperson can tell a rehearsal
     from a sale at a glance. It is read from location, not configured, because a
     constant would be right until somebody duplicated the page.

     ABSENT MEANS LIVE on the server side, which is the safer default of the two: a
     missing signal marking a real sale as a test would be the more damaging mistake.
     So this is the only thing that makes the TEST prefix appear at all.

     The utm_* keys are ordinary campaign parameters. res_reservations.utm has existed
     since the first schema and nothing has ever written to it; picking them up here
     costs nothing and answers "where did this buyer come from" later. */
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
                  "gclid", "fbclid"];

  function firstTouch() {
    var out = {};
    try { out.origin_host = String(w.location.hostname || "").toLowerCase(); }
    catch (e) { out.origin_host = ""; }
    try {
      var q = new w.URLSearchParams(w.location.search);
      for (var i = 0; i < UTM_KEYS.length; i++) {
        var v = q.get(UTM_KEYS[i]);
        if (v) { out[UTM_KEYS[i]] = String(v).slice(0, 200); }
      }
    } catch (e2) {}
    return out;
  }

  function createFrom(pairs, dryRun) {
    return fetch(BASE + "/public/reservations/from-form", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        property_slug: PROPERTY,
        pairs: pairs,
        dry_run: dryRun === true,
        utm: firstTouch(),
        referrer: d.referrer || ""
      })
    })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (e) {}
          if (!r.ok) {
            /* The 400 names the fields the server saw. This is THE diagnostic, so it
               is not hidden behind a debug flag. */
            warn("Xano would not identify the unit:", (j && j.message) || t);
            return null;
          }
          if (dryRun === true) { return j; }
          var uuid = j && j.uuid;
          if (!uuid) {
            warn("no uuid in a 200 response - treating as a failure");
            return null;
          }
          store(UUID_KEY, uuid);
          store(UNIT_KEY, (j && j.wf_unit_id) || "");
          log("draft", uuid, "unit", j.wf_unit_id, "matched by", j.resolved_by,
              "from", j.units_considered, "units");
          log("carried over:", (j.carried_over || []).join(", ") || "nothing");
          if (j.unmapped_fields && j.unmapped_fields.length) {
            /* Not an error - but a field the buyer filled in that nobody is reading is
               worth knowing about, because it is a field they may be asked for again. */
            log("form fields nobody maps:", j.unmapped_fields.join(", "));
          }
          return uuid;
        });
      })
      .catch(function (e) {
        warn("could not reach Xano:", e && e.message);
        return null;
      });
  }

  /* lastNav is recorded before the jump so the decision is inspectable after the fact -
     HLEntry.lastNavigation() answers "where did it send me and why" without a network
     tab, and the tests assert on it because a real navigation cannot be observed. */
  var lastNav = "";
  function go(url) { lastNav = url; w.location.href = url; }

  /* One submit at a time. The busy button takes pointer-events away, which stops a
     human double-click, but nothing stops a second submit event arriving another way
     - and a second one would file a SECOND reservation against the same buyer. The
     flag is the guarantee; the button is the courtesy. */
  var submitting = false;

  function handleSubmit(e) {
    var form = e.target;
    if (!form || form.id !== "reservation-form") { return; }

    if (submitting) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) { e.stopImmediatePropagation(); }
      log("already submitting - ignored");
      return;
    }

    var legacy = legacyUrl(form);
    if (FORCE_LEGACY) { log("hl_legacy=1"); return; }   // let their handler run untouched

    var pairs = pairsFrom(form);

    // From here we own the navigation, so every path below must end in exactly one.
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) { e.stopImmediatePropagation(); }

    /* THE BUYER HAS TO SEE THAT SOMETHING HAPPENED. Until now this handler swallowed
       the submit and then sat silent for as long as Xano took, on a button that still
       looked clickable - so an impatient second click was not just likely, it was
       reasonable. Same treatment Polaris has had all along, and it is never cleared:
       every path below ends in a navigation. */
    setBusy(submitButton(form), true);
    submitting = true;

    if (!pairs.length) {
      warn("the form carried no usable fields - going legacy");
      go(legacy);
      return;
    }

    var done = false;
    function finish(url) {
      if (done) { return; }
      done = true;
      go(url);
    }

    // Never let a slow or hanging request strand the buyer.
    var timer = w.setTimeout(function () {
      warn("Xano did not answer in " + CREATE_TIMEOUT_MS + "ms - going legacy");
      finish(legacy);
    }, CREATE_TIMEOUT_MS);

    createFrom(pairs)
      .then(function (uuid) {
        w.clearTimeout(timer);
        if (uuid) {
          var url = TARGET + "?r=" + encodeURIComponent(uuid);
          log("going to", url);
          finish(url);
        } else {
          finish(legacy);
        }
      })
      .catch(function (err) {
        w.clearTimeout(timer);
        warn("unexpected:", err && err.message, "- going legacy");
        finish(legacy);
      });
  }

  function bind() {
    /* THE PAGE DECLARES WHAT IT WANTS. No page is inferred from its URL, and a page
       with no marker gets nothing at all - that is what makes one bundle safe to load
       everywhere. The marker lives next to the loader tag, so switching a page on is
       a single paste. */
    var host = d.querySelector("[data-hl-entry]");
    if (!host) { return; }

    PROPERTY = String(host.getAttribute("data-hl-entry") || "").toLowerCase().trim();
    if (!PROPERTY) {
      warn("data-hl-entry is present but names no property - standing aside");
      return;
    }
    TARGET = host.getAttribute("data-hl-target") || TARGET;
    LEGACY = host.getAttribute("data-hl-legacy") || LEGACY;
    log("entry point armed for", PROPERTY, "->", TARGET);

    // Capture on document beats capture on the form, whichever registered first.
    d.addEventListener("submit", handleSubmit, true);

    w.HLEntry = {
      pairs: function () {
        var f = d.getElementById("reservation-form");
        return f ? pairsFrom(f) : [];
      },
      /* Resolve WITHOUT creating anything - dry_run on the server side. Safe to run
         from the console on a live page to find out which field carries the unit. */
      probe: function () {
        var f = d.getElementById("reservation-form");
        if (!f) { return Promise.resolve("no #reservation-form on this page"); }
        return createFrom(pairsFrom(f), true);
      },
      uuid: function () { return stored(UUID_KEY); },
      lastNavigation: function () { return lastNav; },
      reset: function () { drop(UUID_KEY); drop(UNIT_KEY); }
    };
    log("ready");
  }

  if (d.readyState === "loading") { d.addEventListener("DOMContentLoaded", bind); } else { bind(); }
})(window, document);

/* ============================================================================
   HEARTLAND - the reserve flow. THE PRODUCT, not the harness.

   hl-reserve-v2.js drew its own floating panel because a test page's layout must
   never be a dependency while the Xano contract is being proven. That contract is
   now proven by a real payment, so this file does the same work against YOUR
   Webflow design instead, and the panel is gone.

   IT BINDS BY ATTRIBUTE, NEVER BY SELECTOR.
   Guessing selectors is what failed twice on the brochure page, both times
   silently. Every hook here is an explicit data-hl attribute placed in the
   Designer, which means: you can restyle and move anything without breaking the
   wiring, adding a field is a Designer change rather than a code change, and what
   the page is bound to can be READ back through the Webflow API rather than
   inferred.

   THE BROWSER NEVER DOES MONEY ARITHMETIC.
   It formats cents that Xano already calculated. It never multiplies, never sums,
   never sends a price. The one place a figure could be invented is checkout, and
   that posts back the exact signed field set - see the checkout block.

   A MISSING HOOK IS LOUD, NOT BLANK.
   An unknown data-hl path logs under ?hl_debug=1 instead of quietly rendering
   nothing. A blank field that nobody notices is this project's characteristic bug.

   THE ATTRIBUTE CONTRACT
   ----------------------
   STEPS
     data-hl-step="unit|details|pay|done"   a section; exactly one is shown
     data-hl-goto="details"                 advance (validates the current step first)
     data-hl-back="unit"                    go back, no validation
     data-hl-progress="details"             gets .is-active / .is-done classes

   DISPLAY  (read-only, from GET /public/reservations/{uuid})
     data-hl="unit.name"                    sets textContent from a response path
     data-hl="total_cents"                  a path ending in _cents is auto-formatted
                                            as money - R3,595,000.00
     data-hl-attr="href:otp_url"            sets an attribute instead of text
     data-hl-show="otp_url"                 shown only when that path is truthy
     data-hl-hide="otp_url"                 hidden when that path is truthy

   INPUTS  (written back with PATCH)
     data-hl-field="first_name"             binds an input/select/textarea
     data-hl-required                       must be non-empty before advancing

   ACTIONS
     data-hl-action="save"                  PATCH now
     data-hl-action="confirm"               PATCH last_step=confirm
     data-hl-action="checkout"              prepare the payment, then post to Payfast
     data-hl-status                         where messages and errors are written

   ?hl_debug=1 logs. ?hl_panel=1 re-enables the old diagnostic panel alongside.
   ========================================================================== */
(function (w, d) {
  "use strict";

  var BASE = "https://x7aj-untn-pq4t.n7e.xano.io/api:i0YhKPAV";
  var UUID_KEY = "hl_v2_uuid";
  var DEBOUNCE_MS = 800;

  /* Set the instant before the browser leaves for Payfast, and read when it comes
     back. It exists because the return URL is not ours to rely on: it is built and
     SIGNED in Xano, it has already been changed once for a reason that had nothing
     to do with this page, and a query string can be dropped by anything in between.
     This marker cannot be. It expires so that abandoning a payment and wandering
     back tomorrow does not present a buyer with a page waiting for money nobody
     sent. */
  var PAY_KEY = "hl_v2_paying";
  var PAY_WINDOW_MS = 30 * 60 * 1000;

  /* THE FALLBACK, not the list. The list now comes from /public/config, which serves
     res_properties.uses_new_flow - a switch on the Properties CMS row. That is what
     makes adding a development data rather than a deploy.

     This constant survives as the answer to "what if the config call fails", and the
     answer has to be a SHORT list rather than an empty one or a permissive one:

       - empty would strand a Sanford buyer mid-flow on a Xano blip;
       - permissive would let an outage put POLARIS through a flow it has never been
         tested on, which is the one thing this rebuild must not do.

     So a failed read falls back to exactly what was true when this was written, and
     the flow refuses everything else. It fails closed. */
  var ALLOWED_PROPERTIES = ["sanford"];

  /* Filled from /public/config. Null means the read has not happened or failed, which
     is what sends propertyEnabled back to the constant above. */
  var PROPERTIES = null;

  /* THE ONLY FIELDS THIS PAGE MAY WRITE. A data-hl-field naming anything else is
     refused and logged rather than sent. Without this a typo in the Designer would
     silently PATCH a key Xano ignores, and the buyer's detail would vanish with no
     error anywhere. Note what is absent: every price, every total, every id. */
  var WRITABLE = [
    "first_name", "last_name", "email", "phone", "work_phone",
    "dob", "nationality", "address", "id_number", "buyer_type", "payer_route"
  ];

  var STEPS = ["unit", "details", "pay", "done"];

  /* The done step waits for Payfast's ITN, which arrives server-to-server and is not
     what brings the buyer back. So the browser returns first and polls. One minute at
     two and a half seconds; a payment that has not confirmed by then has almost
     always gone to awaiting_clearance, which the page says out loud rather than
     spinning forever. */
  var POLL_MS = 2500;
  var POLL_MAX = 24;

  var DEBUG = /[?&]hl_debug=1/.test(w.location.search);
  function log() {
    if (DEBUG && w.console) { console.log.apply(console, ["[hl]"].concat([].slice.call(arguments))); }
  }
  function warn() {
    if (w.console) { console.warn.apply(console, ["[hl]"].concat([].slice.call(arguments))); }
  }

  function stored(k) { try { return w.localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function store(k, v) { try { w.localStorage.setItem(k, v); } catch (e) {} }

  function param(k) {
    var m = new RegExp("[?&]" + k + "=([^&]*)").exec(w.location.search);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function propertyEnabled(slug) {
    if (!slug) { return false; }
    var s = String(slug).toLowerCase().trim();

    if (PROPERTIES) {
      for (var p = 0; p < PROPERTIES.length; p++) {
        if (String(PROPERTIES[p].slug || "").toLowerCase().trim() === s) {
          /* Only a real boolean counts, on both sides of the wire. */
          return PROPERTIES[p].uses_new_flow === true;
        }
      }
      /* Known list, property not on it. That is a decision, not a gap. */
      return false;
    }

    for (var i = 0; i < ALLOWED_PROPERTIES.length; i++) {
      if (String(ALLOWED_PROPERTIES[i]).toLowerCase().trim() === s) { return true; }
    }
    return false;
  }

  function propertyConfig(slug) {
    if (!PROPERTIES || !slug) { return null; }
    var s = String(slug).toLowerCase().trim();
    for (var i = 0; i < PROPERTIES.length; i++) {
      if (String(PROPERTIES[i].slug || "").toLowerCase().trim() === s) { return PROPERTIES[i]; }
    }
    return null;
  }

  /* THE THEME COMES FROM THE DATA. It used to be a hand-written CSS block per property
     in this page's head code, which meant a new development needed a Designer edit
     before it looked like itself. The tokens are now on the Properties CMS row, cached
     in res_properties.theme, and set here.

     Every one of these has a literal fallback in the stylesheet, so a property with no
     theme - or a config call that failed - renders in the neutral Heartland palette
     rather than in nothing at all. */
  var THEME_KEYS = [
    ["primary", "--hl-primary"],
    ["primary_hover", "--hl-primary-hover"],
    ["secondary", "--hl-secondary"],
    ["ink", "--hl-ink"],
    ["line", "--hl-line"],
    ["radius", "--hl-radius"],
    ["font_display", "--hl-font-display"],
    ["tracking", "--hl-tracking"]
  ];

  function applyTheme(slug) {
    var cfg = propertyConfig(slug);
    var theme = cfg && cfg.theme;
    if (!theme) { return false; }

    /* WHERE THE TOKENS GO, and it is not an idle choice. /reserve-flow still carries a
       hand-written per-property block in its head code that sets these same tokens on
       .hl-flow. A rule on .hl-flow beats a value inherited from <html>, so setting
       them on the document root would leave that stale block winning and a designer
       editing the colours in the CMS would see nothing change.

       An INLINE style on the wrapper beats any stylesheet rule, so the data wins. The
       page names its own wrapper with data-hl-theme rather than this file knowing a
       class name - the same contract as every other hook here. Falls back to <html>
       for a page that names nothing. */
    var root = d.querySelector("[data-hl-theme]") || d.documentElement;
    var set = 0;
    for (var i = 0; i < THEME_KEYS.length; i++) {
      var v = theme[THEME_KEYS[i][0]];
      if (v === null || v === undefined || v === "") { continue; }
      root.style.setProperty(THEME_KEYS[i][1], String(v));
      set++;
    }
    log("theme applied for", slug, set, "tokens");
    return set > 0;
  }

  /* One read, shared. Fired at boot alongside the reservation rather than before it,
     so the config costs no round trip of its own. A failure resolves to null - never
     rejects - because everything downstream already has a safe answer for "no config". */
  var configPromise = null;
  function loadConfig() {
    if (!configPromise) {
      configPromise = api.get("/public/config")
        .then(function (c) {
          if (c && c.properties && c.properties.length) { PROPERTIES = c.properties; }
          return c;
        })
        .catch(function (e) {
          warn("could not read /public/config - falling back to the built-in allowlist:", e && e.message);
          return null;
        });
    }
    return configPromise;
  }

  /* --------------------------------------------------------------- formatting

     These were written here and now live in window.HLRender, because the portal needs
     exactly the same contract and a second copy would drift. Read through the window
     each time rather than captured at load: the modules are separate IIFEs in one file
     and this one must not care about their order. */
  function money(c) { return w.HLRender.money(c); }
  function path(o, p) { return w.HLRender.path(o, p); }
  var MISSING = w.HLRender.MISSING;

  /* --------------------------------------------------------------- state */

  var R = null;          // the reservation, exactly as Xano returned it
  var step = "unit";
  var pending = null;    // the write behind the step the buyer is looking at
  var patchTimer = null;
  var inFlight = false;

  function readJson(r) {
    return r.text().then(function (t) {
      var j = null;
      try { j = JSON.parse(t); } catch (e) {}
      if (!r.ok) { throw new Error((j && (j.message || j.error)) || ("HTTP " + r.status)); }
      return j;
    });
  }
  var api = {
    get: function (p) { return fetch(BASE + p).then(readJson); },
    post: function (p, b) {
      return fetch(BASE + p, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b || {})
      }).then(readJson);
    },
    patch: function (p, b) {
      return fetch(BASE + p, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b || {})
      }).then(readJson);
    }
  };

  function status(msg, bad) {
    var els = d.querySelectorAll("[data-hl-status]");
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = msg || "";
      els[i].setAttribute("data-hl-status-state", bad ? "error" : (msg ? "info" : ""));
      /* The attribute is the honest description of the state; the classes exist
         because Webflow styles classes and cannot style an attribute selector.
         Both, rather than one, so the markup still reads correctly to a human. */
      els[i].classList.toggle("is-error", !!bad);
      els[i].classList.toggle("is-info", !bad && !!msg);
    }
    if (msg) { (bad ? warn : log)(msg); }
  }


  /* --------------------------------------------------------------- render */

  /* The whole data-hl contract now lives in window.HLRender - see the note there for
     why. This is the flow's one line of it: its root is the document and its data is
     the reservation. An unknown path is LOGGED rather than silently blanked, because a
     blank field nobody notices is this project's characteristic bug. */
  function renderDisplays() {
    w.HLRender.displays(d, R, function (p) {
      log("no such path in the reservation:", p, "- left as designed");
    });
  }

  /* What we last put into each control. It is how an unsaved edit is told apart
     from a control nobody has touched, which is the difference between refreshing a
     field and destroying an answer. */
  var rendered = {};

  function renderInputs() {
    var els = d.querySelectorAll("[data-hl-field]");
    for (var i = 0; i < els.length; i++) {
      var f = els[i].getAttribute("data-hl-field");
      if (WRITABLE.indexOf(f) === -1) { continue; }
      var v = R && R[f];
      if (v === null || v === undefined) { v = ""; }
      var srv = String(v);
      var cur = String(els[i].value === null || els[i].value === undefined ? "" : els[i].value);

      // Do not clobber what the buyer is currently typing.
      if (d.activeElement === els[i]) { rendered[f] = cur; continue; }

      /* THE BUYER'S UNSAVED EDIT WINS OVER A STALE RESPONSE.
         Every save re-reads the reservation and re-renders, and a save is in flight
         for most of the time a buyer spends on this step. Writing the response over
         every unfocused control means an answer given while an earlier save was in
         the air is silently replaced by the value that save did not yet know about.
         It cost a whole afternoon: the date of birth derived from an ID number
         appeared and then vanished, and the derivation looked like the culprit.
         A control is only refreshed when it still holds what we last put in it. */
      if (cur !== srv && cur !== "" && cur !== (rendered[f] || "")) { continue; }

      els[i].value = srv;
      rendered[f] = srv;
    }
  }

  function renderStep() {
    var secs = d.querySelectorAll("[data-hl-step]");
    for (var i = 0; i < secs.length; i++) {
      /* "block", not "" - and the difference is a page that works versus a page that
         is permanently blank. Clearing the inline style hands the decision back to
         the stylesheet, and the stylesheet hides .hl-step by default so the four
         steps do not all flash up before this runs. The active step would then be
         hidden by the very rule that exists to stop the flash. */
      secs[i].style.display = (secs[i].getAttribute("data-hl-step") === step) ? "block" : "none";
    }
    var prog = d.querySelectorAll("[data-hl-progress]");
    var at = STEPS.indexOf(step);
    for (var j = 0; j < prog.length; j++) {
      var mine = STEPS.indexOf(prog[j].getAttribute("data-hl-progress"));
      prog[j].classList.toggle("is-active", mine === at);
      prog[j].classList.toggle("is-done", mine > -1 && mine < at);
    }
  }

  /* ------------------------------------------------- buyer-field behaviours

     window.HLBuyer holds the rules - SA-ID dates, the individual test, address
     lookup - as pure functions with no DOM in them. This is the wiring, and it
     lives here because it is the FLOW that knows which markup exists.

     Until this was written the three behaviours Daniel asked for on 24 Aug only
     existed on /reserve-v2, whose panel was drawn in JavaScript. On the Designer
     page the module was loaded and never called - present, and doing nothing.

       data-hl-only-for="individual"   shown only to an individual buyer
       data-hl-only-for="entity"       shown only to a company or trust
       data-hl-id-hint                 where the ID number check writes its note
       data-hl-suggest                 on the address input, to offer suggestions
       data-hl-suggest-list            where suggestions are drawn
  */

  var dobIsOurs = false;   // true while the date of birth is one we derived

  function fieldEl(name) {
    return d.querySelector('[data-hl-field="' + name + '"]');
  }

  /* ------------------------------------------------------- saying what is wrong

     A single line at the top reading "Please complete: first_name, dob" was two
     failures at once. It named COLUMNS rather than the things on screen, and it put
     the complaint at the top of a two-column form where the empty box might be well
     out of sight.

     The contract, and it is all attribute-driven so the wording lives in the Designer:

       [data-hl-error="dob"]              where this field's message is written. Its
                                          space is always reserved, so nothing shifts
                                          when a message appears.
       data-hl-label="date of birth"      on that element - what to call the field to
                                          a person. Falls back to the label in the
                                          same wrapper, then to the field name.
       data-hl-required-message="..."     an exact message, when the composed one is
                                          not good enough.

     The WRAPPER is found by walking up from the control until an ancestor contains
     this field's error element - so it does not depend on a class name or on the
     markup keeping a particular shape. */

  function errorEl(field) {
    return d.querySelector('[data-hl-error="' + field + '"]');
  }

  function fieldWrap(el, field) {
    var target = errorEl(field);
    if (!target) { return null; }
    var n = el;
    while (n && n.nodeType === 1) {
      if (n.contains(target)) { return n; }
      n = n.parentNode;
    }
    return null;
  }

  function labelEl(el, field) {
    var wrap = fieldWrap(el, field);
    if (!wrap) { return null; }
    return wrap.querySelector("[data-hl-label-text], label, .hl-label");
  }

  function prettyName(el, field) {
    var box = errorEl(field);
    var given = box && box.getAttribute("data-hl-label");
    if (given) { return given; }
    var lab = labelEl(el, field);
    if (lab) {
      /* The asterisk we added, and any trailing punctuation from a label written as a
         question - "How are you paying?" reads badly inside a sentence. */
      var t = String(lab.textContent || "").replace(/\*/g, "").replace(/[?:.!]+\s*$/, "").trim();
      if (t) {
        /* Only the FIRST LETTER is lowered, and not even that when the label opens
           with an acronym. Lowercasing the whole label turned "ID or registration
           number" into "id or registration number" - which is not a word anyone in
           this business writes. The rest of the label is left exactly as the Designer
           wrote it, because whoever typed it knew which words are proper nouns. */
        var firstWord = t.split(/\s+/)[0];
        if (/^[A-Z0-9]{2,}$/.test(firstWord)) { return t; }
        return t.charAt(0).toLowerCase() + t.slice(1);
      }
    }
    return String(field).replace(/_/g, " ");
  }

  function isChoice(el) {
    return el && (el.tagName === "SELECT" || el.type === "date");
  }

  function requiredMessage(el, field) {
    var box = errorEl(field);
    var exact = box && box.getAttribute("data-hl-required-message");
    if (exact) { return exact; }
    var name = prettyName(el, field);
    return (isChoice(el) ? "Please choose " : "Please enter ") +
           (/^(your|a|an|the)\b/.test(name) ? "" : "your ") + name + ".";
  }

  function showError(field, msg) {
    var box = errorEl(field);
    if (box) { box.textContent = msg || ""; }
    var el = fieldEl(field);
    if (el && el.classList) { el.classList.toggle("is-invalid", !!msg); }
  }

  function clearErrors() {
    var boxes = d.querySelectorAll("[data-hl-error]");
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].textContent = "";
      var el = fieldEl(boxes[i].getAttribute("data-hl-error"));
      if (el && el.classList) { el.classList.remove("is-invalid"); }
    }
  }

  /* A native date picker will happily accept the year 0219 or a buyer born last week.
     The bounds come from MIN_AGE - the same rule that decides the century when a date
     of birth is read out of an ID number - so the two cannot disagree, and neither
     goes stale the way a hardcoded year would. */
  function boundDateOfBirth() {
    var el = fieldEl("dob");
    if (!el || el.type !== "date") { return; }
    var minAge = (w.HLBuyer && w.HLBuyer.MIN_AGE) || 18;
    var now = new Date();
    function iso(y) {
      return y + "-" + ("0" + (now.getMonth() + 1)).slice(-2) + "-" + ("0" + now.getDate()).slice(-2);
    }
    el.setAttribute("max", iso(now.getFullYear() - minAge));
    el.setAttribute("min", iso(now.getFullYear() - 120));
  }

  /* The asterisk comes from data-hl-required, not from someone remembering to type
     one - so the mark and the rule can never disagree. */
  function markRequired() {
    var els = d.querySelectorAll("[data-hl-field]");
    for (var i = 0; i < els.length; i++) {
      var field = els[i].getAttribute("data-hl-field");
      var lab = labelEl(els[i], field);
      if (!lab) { continue; }
      var star = lab.querySelector(".hl-req");
      var need = els[i].hasAttribute("data-hl-required");
      if (need && !star) {
        star = d.createElement("span");
        star.className = "hl-req";
        star.setAttribute("aria-hidden", "true");
        star.textContent = "*";
        lab.appendChild(star);
      } else if (!need && star) {
        star.parentNode.removeChild(star);
      }
    }
  }

  /* The live control wins over the response: the buyer may have just changed it and
     the save is still inside the debounce window. */
  function buyerTypeNow() {
    var el = fieldEl("buyer_type");
    if (el) { return el.value; }
    return (R && R.buyer_type) || "";
  }

  /* Only counts display:none that WE set, walking up through the inline styles.
     Deliberately not offsetParent: it needs layout, so it reports every element as
     hidden under jsdom and would have made the tests agree with anything. */
  function hiddenByUs(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      if (n.style && n.style.display === "none") { return true; }
      n = n.parentNode;
    }
    return false;
  }

  function applyBuyerType() {
    var individual = w.HLBuyer && w.HLBuyer.isIndividual
      ? w.HLBuyer.isIndividual(buyerTypeNow())
      : false;
    var els = d.querySelectorAll("[data-hl-only-for]");
    for (var i = 0; i < els.length; i++) {
      var want = String(els[i].getAttribute("data-hl-only-for") || "").toLowerCase().trim();
      var show = (want === "individual") ? individual
               : (want === "entity") ? !individual
               : true;
      if (want !== "individual" && want !== "entity") {
        warn('data-hl-only-for should read individual or entity, got "' + want + '"');
      }
      /* "block", not "" - the same lesson renderStep learned, and it bit here too.
         Webflow turns an inline style="display:none" in a Code Embed into a GENERATED
         CLASS (inline-div-0), so clearing the inline style reveals nothing: the class
         is still hiding it. Setting an explicit value cannot be outvoted by a
         stylesheet, which means a block may safely be hidden by default to stop it
         flashing up before this runs. */
      els[i].style.display = show ? "block" : "none";
      /* A field that has just been hidden must not keep a complaint on it. */
      if (!show) {
        var f = els[i].querySelector("[data-hl-field]");
        if (f) { showError(f.getAttribute("data-hl-field"), ""); }
      }
    }
  }

  /* An ID number is 13 digits only for an individual. A company registration parsed
     as a date produces a confident wrong answer, which is why this refuses to run
     unless the buyer type says individual. */
  function syncDobFromId() {
    var idEl = fieldEl("id_number");
    var dobEl = fieldEl("dob");
    var hint = d.querySelector("[data-hl-id-hint]");
    if (!idEl) { return; }

    function note(msg) { if (hint) { hint.textContent = msg || ""; } }

    if (!(w.HLBuyer && w.HLBuyer.isIndividual && w.HLBuyer.isIndividual(buyerTypeNow()))) {
      note("");
      return;
    }
    var raw = String(idEl.value || "").trim();
    if (raw === "") { note(""); return; }

    var r = w.HLBuyer.dobFromSaId(raw, new Date().getFullYear());
    if (!r.ok) {
      note("That does not look like a 13-digit South African ID number.");
      return;
    }
    note(r.checkDigitOk ? "" : "Please check this ID number — the last digit does not add up.");

    /* Never overwrite a date the buyer typed. Ours is replaceable; theirs is not. */
    if (dobEl && (String(dobEl.value || "").trim() === "" || dobIsOurs)) {
      if (dobEl.value !== r.iso) {
        dobEl.value = r.iso;
        queueSave();
      }
      dobIsOurs = true;
    }
  }

  /* ---- address suggestions. Strictly additive: every failure path leaves the
     buyer typing a plain address exactly as they would have anyway. */
  var sugTimer = null;
  var sugAbort = null;

  function clearSuggestions() {
    var box = d.querySelector("[data-hl-suggest-list]");
    if (!box) { return; }
    while (box.firstChild) { box.removeChild(box.firstChild); }
    box.style.display = "none";
  }

  function suggestAddress() {
    var el = fieldEl("address");
    var box = d.querySelector("[data-hl-suggest-list]");
    if (!el || !box || !el.hasAttribute("data-hl-suggest")) { return; }
    if (sugTimer) { w.clearTimeout(sugTimer); }
    sugTimer = w.setTimeout(function () {
      sugTimer = null;
      if (sugAbort && sugAbort.abort) { try { sugAbort.abort(); } catch (e) {} }
      var ctl = (typeof w.AbortController === "function") ? new w.AbortController() : null;
      sugAbort = ctl;
      w.HLBuyer.addressSuggest(el.value, { signal: ctl && ctl.signal })
        .then(function (list) {
          clearSuggestions();
          if (!list || !list.length) { return; }
          box.style.display = "block";   // explicit, for the reason in applyBuyerType
          for (var i = 0; i < list.length; i++) {
            var item = d.createElement("div");
            item.setAttribute("data-hl-suggest-item", "");
            item.setAttribute("role", "button");
            item.setAttribute("tabindex", "0");
            item.textContent = list[i].label;
            box.appendChild(item);
          }
        })
        .catch(function () { clearSuggestions(); });
    }, 300);
  }

  function takeSuggestion(el) {
    var input = fieldEl("address");
    if (!input) { return; }
    input.value = el.textContent || "";
    clearSuggestions();
    queueSave();
  }

  function render() {
    if (!R) { return; }
    renderDisplays();
    renderInputs();
    renderStep();
    applyBuyerType();
    syncDobFromId();
    markRequired();
    boundDateOfBirth();
  }

  /* --------------------------------------------------------------- writing */

  function collect() {
    var body = {};
    var els = d.querySelectorAll("[data-hl-field]");
    for (var i = 0; i < els.length; i++) {
      var f = els[i].getAttribute("data-hl-field");
      if (WRITABLE.indexOf(f) === -1) {
        warn('"' + f + '" is not a writable field - ignored. Writable:', WRITABLE.join(", "));
        continue;
      }
      var v = String(els[i].value === null || els[i].value === undefined ? "" : els[i].value).trim();
      if (v !== "") { body[f] = v; }
    }
    return body;
  }

  /* Scoped to the step being LEFT, not the whole page. Scanning every step meant a
     required field on the details section blocked the buyer from leaving the unit
     section - a field they had not been shown yet, named in an error they could do
     nothing about. Found by the fixture. */
  function currentScope() {
    return d.querySelector('[data-hl-step="' + step + '"]') || d;
  }

  function missingRequired() {
    var out = [];
    var els = currentScope().querySelectorAll("[data-hl-field][data-hl-required]");
    for (var i = 0; i < els.length; i++) {
      /* A hidden field cannot be a blocker. A company buyer never sees the date of
         birth, so requiring it would refuse them the next step over a control they
         were never shown - an error they could do nothing about, which is the same
         bug currentScope() was written to fix, one level down. */
      if (hiddenByUs(els[i])) { continue; }
      var v = String(els[i].value || "").trim();
      if (v === "") { out.push(els[i].getAttribute("data-hl-field")); }
    }
    return out;
  }

  function save(confirming) {
    if (!R) { return Promise.resolve(null); }
    var body = collect();
    body.last_step = confirming ? "confirm" : "details";
    inFlight = true;
    return api.patch("/public/reservations/" + encodeURIComponent(R.uuid), body)
      .then(function (res) {
        log("saved", body.last_step, "otp_locked=" + (res && res.otp_locked));

        /* A TYPING SAVE NO LONGER RE-READS THE RESERVATION.
           Every debounced save used to be followed by a full GET, so each pause in
           typing cost two round trips instead of one - visible in the request log as
           a PATCH and a GET on the same second, over and over, and felt as a page
           that keeps thinking while you fill it in. Nothing server-derived changes on
           a details write, so there is nothing to read back: R is updated with what
           we sent, which is exactly what the GET would have returned.

           Confirming is different and still reloads. That write can move status and
           is the last one before money, so the page should carry on from what the
           server actually holds rather than from what it hoped it wrote. */
        if (!confirming) {
          Object.keys(body).forEach(function (k) { R[k] = body[k]; });
          return R;
        }
        return load(R.uuid);
      })
      .catch(function (e) { status("Could not save: " + e.message, true); return null; })
      .then(function (x) { inFlight = false; return x; });
  }

  function queueSave() {
    if (patchTimer) { w.clearTimeout(patchTimer); }
    patchTimer = w.setTimeout(function () { patchTimer = null; save(false); }, DEBOUNCE_MS);
  }

  /* Drop a pending debounce. Always paired with an immediate save, because the
     values it would have written are still sitting in the DOM and collect() reads
     them there - so cancelling loses nothing. */
  function flush() {
    if (patchTimer) { w.clearTimeout(patchTimer); patchTimer = null; }
  }

  /* --------------------------------------------------------------- checkout */

  var CO = null;
  var coBusy = false;

  /* Rules 1-3, unchanged from the version proven by the first real payment:
     empty fields are not posted (the signature was computed without them), order is
     the order Xano signed, and nothing is recomputed here. See
     heartland-stagef-reserve-v2-deployment.md. */
  function fieldsToPost(data) {
    var f = (data && data.fields) || {};
    var out = [], sig = null;
    Object.keys(f).forEach(function (k) {
      var v = f[k];
      var s = (v === null || v === undefined) ? "" : String(v);
      if (s === "") { return; }
      if (k === "signature") { sig = s; return; }
      out.push([k, s]);
    });
    if (sig !== null) { out.push(["signature", sig]); }
    return out;
  }

  function checkoutProblems(data, uuid) {
    if (!data) { return ["no response from Xano"]; }
    var f = data.fields || {};
    var p = [];
    if (!data.process_url) { p.push("no process_url"); }
    if (!f.signature) { p.push("no signature"); }
    if (!f.merchant_id) { p.push("no merchant_id"); }
    if (!f.merchant_key) { p.push("no merchant_key"); }
    if (String(f.amount || "") !== String(data.amount || "")) {
      p.push("amount mismatch - field " + f.amount + " vs response " + data.amount);
    }
    if (!/^[0-9]+\.[0-9]{2}$/.test(String(f.amount || ""))) {
      p.push("amount is not a 2-decimal string: " + f.amount);
    }
    if (uuid && String(f.custom_str1 || "") !== String(uuid)) {
      p.push("custom_str1 does not match this reservation");
    }
    return p;
  }

  function payButton() {
    return d.querySelector('[data-hl-action="checkout"]');
  }

  function busy(on, text) {
    if (w.HLBuyer && w.HLBuyer.setBusy) { w.HLBuyer.setBusy(payButton(), on, text); }
  }

  function checkout() {
    if (!R || coBusy) { return; }
    coBusy = true;
    /* The same treatment as the brochure form, for the same reason and one more:
       this button spends money. .res-busy takes pointer-events away, so the second
       half of an impatient double-click cannot start a second checkout - which would
       mint a second m_payment_id and increment payment_attempt for nothing. */
    busy(true, "Taking you to Payfast");
    status("Preparing payment…");

    /* Wait for the confirm write if it is still in the air. The step moved ahead of
       it on purpose; this is the one place that has to catch up with it, because
       checkout reads the reservation server-side. */
    Promise.resolve(pending)
      .then(function () {
        return api.post("/public/reservations/" + encodeURIComponent(R.uuid) + "/checkout", {});
      })
      .then(function (res) {
        CO = res;
        var problems = checkoutProblems(CO, R.uuid);
        if (problems.length) {
          status("Payment could not be prepared. " + problems.join("; "), true);
          busy(false);
          return;
        }
        var pairs = fieldsToPost(CO);
        var form = d.createElement("form");
        form.method = "POST";
        form.action = CO.process_url;
        form.style.display = "none";
        pairs.forEach(function (kv) {
          var i = d.createElement("input");
          i.type = "hidden"; i.name = kv[0]; i.value = kv[1];
          form.appendChild(i);
        });
        d.body.appendChild(form);
        log("posting", pairs.length, "fields to", CO.process_url, CO.is_live ? "LIVE" : "sandbox");
        lastNav = CO.process_url;
        store(PAY_KEY, R.uuid + "|" + Date.now());
        form.submit();
      })
      .catch(function (e) {
        status("Could not start payment: " + e.message, true);
        busy(false);
      })
      .then(function () { coBusy = false; });
  }

  var lastNav = "";

  /* --------------------------------------------------------------- steps */

  function go(next) {
    if (STEPS.indexOf(next) === -1) { warn("unknown step", next); return; }
    if (next !== "done") { stopPolling(); }
    step = next;
    renderStep();
    status("");
    applyBuyerType();
  }

  function advance(next) {
    clearErrors();
    var missing = missingRequired();
    if (missing.length) {
      for (var m = 0; m < missing.length; m++) {
        var el = fieldEl(missing[m]);
        showError(missing[m], requiredMessage(el, missing[m]));
      }
      /* The top line no longer lists column names. Each empty box says what it wants,
         where the buyer is looking; this only points them at the first one. */
      status(missing.length === 1
        ? "One thing is still needed before you can continue."
        : "A few things are still needed before you can continue.", true);
      var first = currentScope().querySelector('[data-hl-field="' + missing[0] + '"]');
      if (first && first.focus) { first.focus(); }
      if (first && first.scrollIntoView) {
        try { first.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
      }
      return;
    }
    /* ONE write per navigation. Confirming is what locks the OTP, so that write must
       carry the buyer's final values - including an edit still inside the debounce
       window. collect() reads the live DOM, so cancelling the pending timer and
       saving immediately is exactly equivalent, and avoids the back-to-back pair of
       PATCHes an earlier version sent. */
    flush();

    /* THE STEP CHANGES FIRST, THE SAVE FOLLOWS.
       Waiting for the write before moving made every step change cost a round trip to
       Xano and back from South Africa, for a decision that was already made and
       already validated locally. Nothing about the next step depends on the answer:
       the figures it shows are ones we already hold.

       This is not fire-and-forget. The promise is kept, checkout waits on it, and a
       failed write puts its error on the step the buyer is now looking at - which is
       where they can do something about it. */
    pending = save(next === "pay");
    go(next);
  }

  /* --------------------------------------------------------------- load */

  function load(uuid) {
    /* Both in flight together. The allowlist needs the config, so the reservation
       cannot be acted on before it arrives - but it need not wait to be REQUESTED. */
    var pending = [api.get("/public/reservations/" + encodeURIComponent(uuid)), loadConfig()];
    return Promise.all(pending)
      .then(function (both) {
        var res = both[0];
        if (!propertyEnabled(res && res.property_slug)) {
          warn("refusing:", res && res.property_slug, "is not switched on");
          R = null;
          return null;
        }
        R = res;
        store(UUID_KEY, R.uuid);

        /* THE THEME FOLLOWS THE DATA, NOT THE PAGE. One page serves every property,
           so which brand it wears is decided by the reservation that was loaded -
           set here, after the allowlist, so a property this flow refuses can never
           dress the page up as itself. On <html> rather than the flow wrapper so the
           CSS can key off it without depending on where the wrapper sits. */
        d.documentElement.setAttribute(
          "data-hl-property", String(R.property_slug || "").toLowerCase().trim());
        applyTheme(R.property_slug);

        render();
        return R;
      })
      .catch(function (e) { status("Could not load your reservation: " + e.message, true); return null; });
  }

  /* ----------------------------------------------------- waiting for the money

     Payfast tells US the payment succeeded, server to server, on a connection the
     buyer is not part of. The buyer just gets sent back. So arriving here proves
     nothing about the money, and the page has to ask.

     It asks the reservation, never Payfast, and never anything the return URL says:
     a query string is written by whoever built the link. status comes from the ITN
     gauntlet in Xano and is the only thing worth believing. */
  var pollTimer = null;
  var polls = 0;

  var SETTLED = { confirmed: 1, payment_failed: 1, expired: 1, cancelled: 1, refunded: 1 };

  function stopPolling() {
    if (pollTimer) { w.clearTimeout(pollTimer); pollTimer = null; }
  }

  function pollStatus() {
    stopPolling();
    if (!R) { return; }
    var st = String(R.status || "");
    if (SETTLED[st]) {
      clearPaying();
      if (st === "confirmed") { status(""); }
      else if (st === "payment_failed") { status("That payment did not go through. Nothing has been charged - you can try again.", true); }
      return;
    }
    if (polls >= POLL_MAX) {
      status("Your payment is still being confirmed. We will email you as soon as it clears - you can close this page.");
      return;
    }
    polls++;
    pollTimer = w.setTimeout(function () {
      pollTimer = null;
      load(R.uuid).then(function () { pollStatus(); });
    }, POLL_MS);
  }

  /* Walk up to the step this element sits in, if any. Written out rather than using
     closest() so it behaves the same in every browser this site still serves. */
  function closestStep(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      if (n.getAttribute && n.getAttribute("data-hl-step")) { return n; }
      n = n.parentNode;
    }
    return null;
  }

  /* Did THIS browser send THIS reservation to Payfast, recently? */
  function justPaid(uuid) {
    var raw = stored(PAY_KEY);
    if (!raw) { return false; }
    var bar = raw.indexOf("|");
    var who = bar > -1 ? raw.slice(0, bar) : raw;
    var when = bar > -1 ? Number(raw.slice(bar + 1)) : 0;
    if (who !== uuid) { return false; }
    if (!isFinite(when) || (Date.now() - when) > PAY_WINDOW_MS) { clearPaying(); return false; }
    return true;
  }

  function clearPaying() { store(PAY_KEY, ""); }

  /* One place that reacts to a buyer touching a control, so the three behaviours
     cannot drift apart from the save. Order matters: the buyer type is read by the
     ID rule, so it is applied first. */
  function fieldTouched(t) {
    var f = t.getAttribute("data-hl-field");
    /* An error that stays up while the buyer is fixing it is just noise. */
    if (String(t.value || "").trim() !== "") { showError(f, ""); }
    if (f === "dob") { dobIsOurs = false; }        // they typed it; it is theirs now
    queueSave();
    if (f === "buyer_type") { applyBuyerType(); }
    if (f === "buyer_type" || f === "id_number") { syncDobFromId(); }
    if (f === "address") { suggestAddress(); }
  }

  function bind() {
    d.addEventListener("input", function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-hl-field")) { fieldTouched(t); }
    }, true);
    d.addEventListener("change", function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-hl-field")) { fieldTouched(t); }
    }, true);

    /* Webflow will not create a text input outside a Form, so the details step is
       wrapped in one - and a Webflow form means Enter inside any field submits it.
       Left alone that reloads the page with the answers in the query string and the
       reservation lost. Capture phase, and stopPropagation, so this runs before
       Webflow's own submit handler rather than racing it.

       Enter then does what the buyer meant: the step's forward action. */
    d.addEventListener("submit", function (e) {
      var f = e.target;
      if (!f || !closestStep(f)) { return; }
      e.preventDefault();
      e.stopPropagation();
      var fwd = currentScope().querySelector("[data-hl-goto]");
      if (fwd) { advance(fwd.getAttribute("data-hl-goto")); }
    }, true);

    d.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== d.body) {
        if (t.getAttribute) {
          if (t.hasAttribute("data-hl-suggest-item")) {
            e.preventDefault(); takeSuggestion(t); return;
          }
          var goto = t.getAttribute("data-hl-goto");
          if (goto) { e.preventDefault(); advance(goto); return; }
          var back = t.getAttribute("data-hl-back");
          if (back) { e.preventDefault(); go(back); return; }
          var act = t.getAttribute("data-hl-action");
          if (act === "save") { e.preventDefault(); flush(); save(false); return; }
          if (act === "confirm") { e.preventDefault(); flush(); save(true); return; }
          if (act === "checkout") { e.preventDefault(); checkout(); return; }
        }
        t = t.parentNode;
      }
    }, false);
  }

  function boot() {
    /* Same rule as the entry point: the page must contain the flow. A page with no
       [data-hl-step] gets nothing, so this file is inert everywhere it is not wanted. */
    if (!d.querySelector("[data-hl-step]")) { return; }
    bind();
    /* Exposed BEFORE the uuid check, deliberately. It used to be set only after a
       reservation had loaded, so the debug handle was missing in exactly the situation
       you would reach for it - a page that cannot find a reservation. Its presence is
       also the honest signal that the flow is active on this page. */
    w.HL = {
      get: function () { return R; },
      step: function () { return step; },
      go: go,
      save: save,
      checkout: checkout,
      fieldsToPost: fieldsToPost,
      problems: checkoutProblems,
      writable: WRITABLE.slice(),
      lastNavigation: function () { return lastNav; },
      money: money,
      buyerType: buyerTypeNow,
      applyBuyerType: applyBuyerType,
      syncDob: syncDobFromId,
      missing: missingRequired,
      poll: pollStatus,
      polls: function () { return polls; },
      properties: function () { return PROPERTIES; },
      enabled: propertyEnabled,
      theme: applyTheme
    };

    var uuid = param("r") || stored(UUID_KEY);
    if (!uuid) {
      status("We could not find your reservation. Please start again from the property page.", true);
      return;
    }
    /* Coming back from Payfast. The parameter only says WHERE to look, never what
       happened - the status does that, and it comes from Xano. A forged
       ?payment=success therefore buys nothing: the done step would sit there
       reporting a payment that never cleared. */
    var flag = String(param("payment")).toLowerCase();
    var cancelled = /^(cancel|cancelled)$/.test(flag);
    var returning = /^(success|cancel|cancelled)$/.test(flag) || justPaid(uuid);

    load(uuid).then(function (r) {
      if (!r) { return; }
      if (cancelled) {
        clearPaying();
        go("pay");
        status("Payment cancelled. Your home is still held - you can pay when you are ready.");
        return;
      }
      if (returning) {
        go("done");
        polls = 0;
        pollStatus();
        return;
      }
      // Resume where they left off.
      var ls = String(r.last_step || "").toLowerCase();
      var st = String(r.status || "").toLowerCase();
      if (st === "confirmed") { go("done"); }
      else if (ls === "confirm" || ls === "activate") { go("pay"); }
      else if (ls === "details") { go("details"); }
      else { go("unit"); }
    });

    log("ready");
  }

  if (d.readyState === "loading") { d.addEventListener("DOMContentLoaded", boot); } else { boot(); }
})(window, document);

/* ============================================================================
   HEARTLAND - THE OWNERS PORTAL.

   ONE SET OF PAGES FOR EVERY DEVELOPMENT. The clientzone pages it replaces are CMS
   templates, one per property, gated by that property's Memberstack plan. That only
   works because there is a page per property, and it stopped being tenable for two
   reasons: a member with reservations on two developments cannot be represented in
   Memberstack custom fields at all, and every new development meant three new pages.

   SO THE PLAN GATE IS NOT THE ACCESS CONTROL ANY MORE, and it never really was: the
   data lived in custom fields on the member, so anyone holding the session had it.
   The guard is GET /member/reservations, which scopes by memberstack_id read from the
   member's OWN row - never from anything the browser sends. Any Heartland member may
   reach this page; what they see is decided in Xano.

   THE PAGE MARKERS
     [data-hl-portal]                  this module runs only where this exists
     [data-hl-theme]                   where the property's colours are written
     [data-hl-portal-loading]          while fetching
     [data-hl-portal-empty]            member has no reservations
     [data-hl-portal-body]             once one is selected
     [data-hl-switcher]                shown only when there is more than one
     [data-hl-switcher-list]           where the choices are drawn
     [data-hl-current-home]            "Sanford Heart - Home 1", whichever is showing
     [data-hl-portal-notice]           shown when ?r= named a home they do not hold

   MORE THAN ONE HOME. A buyer can reserve several units, so the portal never assumes
   there is one. When two or more are held and none has been chosen, /portal shows an
   INDEX instead of a dashboard - one card per home, the one needing attention first.
     [data-hl-portal-index]            the index block; alternative to -body
     [data-hl-index]                   the card list
     [data-hl-index-row]               the card, cloned per home
     [data-hl-index-link]              optional, if the card is not itself an anchor
   Inside a card: property_name, unit_name, unit_number, stage_label, substage_label,
   status_label, due_label, due_date, days_left, grand_total_cents. The card is stamped
   data-hl-index-state = ok | due-soon | overdue | none.

   THE CHOICE TRAVELS. Every link to a /portal page has ?r= written onto it, so moving
   from the dashboard to the order summary keeps the home you were looking at. The
   choice is also remembered for the tab, as a fallback for links this never sees.
   Add data-hl-portal-link to any other link that should carry it.

     data-hl="unit.name"               the same contract as the reserve flow
     data-hl-stage="reserve"           tracker step, gets .is-active / .is-done
     data-hl-substage="sign-otp"       finance sub-step, same classes
     data-hl-route="bond"              shown only to that kind of buyer
     data-hl-countdown                 whole days left, ROUNDED UP, or 0 - the headline
     data-hl-countdown-state           set to ok | due-soon | overdue | none
     data-hl-due                       the deadline, as a date

   THE CLOCK, ticking once a second off the server-corrected time. Exact, so it floors
   where data-hl-countdown rounds up; put one or the other in a block, never both.
     [data-hl-cd]                      optional wrapper, gets the state and the classes
     [data-hl-cd-d] -h -m -s           the four numbers; h/m/s zero-padded
     [data-hl-cd-d-label] -h- -m- -s-  "Day"/"Days" etc, pluralised for you
     [data-hl-countdown-exact]         all of it in one element: "6d 04:12:09"
     [data-hl-countdown-label]         what the clock is counting, in words

   THE STEP THE BUYER IS ON, in words rather than as a dot on a line.
     [data-hl-next]                    the whole block; hidden when there is no next step
     [data-hl-next-title]              "Sign the Offer to Purchase"
     .is-next                          added to the [data-hl-substage] they are on

   WHEN THE CLOCK HAS RUN OUT. The server has already withheld otp_url; this only makes
   the page agree with it.
     [data-hl-blocked]                 shown when the deadline passed or the deal ended
     [data-hl-blocked-reason]          the sentence explaining which and what happens now
     [data-hl-action]                  anything that moves the buyer forward; hidden when blocked
     .is-blocked                       added to [data-hl-portal]

   THE STEP PRESENTATION. One deck per sub-stage, cash and bond where they differ.
     [data-hl-slides]                  where the deck goes; hidden when the step has none

   LISTS - one renderer, three lists. The Designer draws ONE row; the script clones
   it per item and removes the original, so a list can be restyled and rearranged
   without touching this file.
     [data-hl-list="documents"]        the buyer's own documents - what they signed
     [data-hl-list="property-documents"] the development's - what they are buying into
     [data-hl-list="addons"]           add-ons, each with its price
     [data-hl-list="extras"]           upgrades sales agreed after the reservation
     [data-hl-list="spec"]             the choices made in the configurator
     [data-hl-row]                     the template row inside a list
     [data-hl-empty="documents"]       shown when that list has nothing in it
   Inside a row the ordinary contract applies, against ONE item:
     documents  data-hl="label"           data-hl-attr="href:url"
     addons     data-hl="name"            data-hl="price_cents"
     extras     data-hl="name"            data-hl="price_cents"
     spec       data-hl="label"           data-hl="value"
   Each rendered row is stamped data-hl-row-key with the item's own key - the
   document type, the add-on slug, the configuration field - so one particular row
   can be styled without this file knowing any of those vocabularies.

   WHICH RESERVATION. ?r=<uuid> names one, then the choice remembered for this tab.
   With exactly one home that home is used. With several and no choice, the index is
   shown rather than a guess - except on a page with no index block, where it falls
   back to the most recent CONFIRMED, and failing that the most recent of any kind, so
   a buyer whose payment has not cleared still has something to look at.
   ========================================================================== */
(function (w, d) {
  "use strict";

  var BASE = "https://x7aj-untn-pq4t.n7e.xano.io/api:i0YhKPAV";

  var STAGES = ["reserve", "finance", "build", "move-in"];

  /* The order a finance deal moves through, and it is NOT the same for both kinds of
     buyer: a cash buyer never pre-qualifies and never waits on a bond. The dashboard
     must not show them three steps they can never complete. */
  var SUBSTAGES = {
    bond: ["pre-qualify", "sign-otp", "pay-deposit", "bond-approval", "bond-approved", "transfer-attorneys"],
    cash: ["sign-otp", "pay-deposit", "transfer-attorneys"]
  };

  /* LABELS EXIST ONLY FOR THE HOME INDEX. Everywhere else the Designer writes the
     words and this script only sets classes - which is the right division and stays
     that way. But a card the script CLONES has no author to write "Sign OTP" into it,
     so these are the words for exactly that case. Anything not listed falls back to
     the raw value rather than to nothing: a stage added in Xano tomorrow shows as
     "bond-approved" and is ugly, not invisible. */
  var STAGE_LABEL = {
    "reserve": "Reserved", "finance": "Finance", "build": "Build", "move-in": "Move in"
  };
  var SUBSTAGE_LABEL = {
    "pre-qualify": "Pre-qualify", "sign-otp": "Sign the Offer to Purchase",
    "pay-deposit": "Pay the deposit", "bond-approval": "Bond approval",
    "bond-approved": "Bond approved", "transfer-attorneys": "With the transfer attorneys"
  };
  /* WHAT THE CLOCK IS COUNTING, in words. Four numbers under DAYS / HOURS / MINUTES /
     SECONDS tell a buyer how long something has left without ever saying what - and a
     deadline nobody can name is a deadline nobody acts on. These are the windows
     move_deal_stage actually enforces, said in the second person: seven days to sign,
     seven to pay the deposit, thirty for bond approval.

     The passed wording is a SEPARATE map rather than a prefix, because "Time left to
     sign your Offer to Purchase" above four zeros is worse than no label at all. What
     happens next is the blocked block's job, not this line's. */
  var DEADLINE_LABEL = {
    "pre-qualify": "Time left to complete your pre-qualification",
    "sign-otp": "Time left to sign your Offer to Purchase",
    "pay-deposit": "Time left to pay your deposit",
    "bond-approval": "Time left to secure bond approval",
    "bond-approved": "Time left on this step",
    "transfer-attorneys": "Time left on this step"
  };
  var DEADLINE_PASSED = {
    "pre-qualify": "Your deadline to pre-qualify has passed",
    "sign-otp": "Your deadline to sign the Offer to Purchase has passed",
    "pay-deposit": "Your deadline to pay the deposit has passed",
    "bond-approval": "Your deadline for bond approval has passed",
    "bond-approved": "This deadline has passed",
    "transfer-attorneys": "This deadline has passed"
  };

  var STATUS_LABEL = {
    "confirmed": "Confirmed", "awaiting_payment": "Awaiting payment",
    "awaiting_clearance": "Payment clearing", "payment_failed": "Payment failed",
    "held": "Held", "draft": "Not finished", "expired": "Expired",
    "cancelled": "Cancelled", "refunded": "Refunded"
  };
  function labelOf(map, v) {
    var k = String(v === null || v === undefined ? "" : v).toLowerCase().trim();
    if (!k) { return ""; }
    return map[k] || k;
  }

  /* ======================================================================= THE STEP PRESENTATION

     The slide decks the legacy clientzone dashboard showed under each sub-step, lifted
     out of the Designer on 30 Aug. Nine sliders there, SEVEN distinct decks here,
     because three sub-steps carried a bond and a cash variant and one pair was the
     same deck twice.

     THE DECKS ARE NAMED BY STATE, NOT BY TASK - "After Reserving", "OTP Signed",
     "Deposit Paid". So the deck on a step describes WHAT YOU HAVE JUST COMPLETED, not
     what is being asked of you next. It reads like an off-by-one until you notice the
     naming; it is reproduced exactly as the old dashboard had it.

     06_Bond_Application_Submitted IS THREE SLIDES, not four. The old dashboard padded
     it with 04_Cash_Deposit_Paid_Slide4 - there is no Slide4 for that deck anywhere in
     the asset library, checked across the whole of it. A slide titled "Cash Deposit
     Paid" shown to a bond buyer waiting on their application is worse than a shorter
     deck, so the stray is dropped. Adding a real fourth slide later is one line here.

     THE SAME SLIDES SERVE EVERY DEVELOPMENT. They explain the process, not the
     property, so they live in this file rather than in a CMS collection nobody would
     remember to fill in when a development launches. */

  var SLIDE_CDN = "https://cdn.prod.website-files.com/61110f294933f9d0faf6d77f/";

  var SLIDE_DECKS = {
    "Heartland_01_After_Reserving": [
      "6a6af4f53026d2d50ece5b14_Heartland_01_After_Reserving_Slide1.avif",
      "6a6af4f6c9fda31ba77d8305_Heartland_01_After_Reserving_Slide2.avif",
      "6a6af4f71e4795b37491f985_Heartland_01_After_Reserving_Slide3.avif",
      "6a6af4f6a76ffcd529d8bdd1_Heartland_01_After_Reserving_Slide4.avif",
      "6a6af4f6016d3844228a3f46_80fcb30063ad33f633a19ff9b1f788b2_Heartland_01_After_Reserving_Slide5.avif"
    ],
    "Heartland_02_OTP_Bond": [
      "6a6af5a8a76ffcd529d90631_Heartland_02_OTP_Bond_Slide1.avif",
      "6a6af5a9b862ee71502f7e52_Heartland_02_OTP_Bond_Slide2.avif",
      "6a6af5a9de94fe5c4812cb6b_Heartland_02_OTP_Bond_Slide3.avif",
      "6a6af5a83db17a6091e51d20_e38b0094dae47401ece358ab0186a2be_Heartland_02_OTP_Bond_Slide4.avif"
    ],
    "02_OTP_Signed_Cash_Purchase": [
      "6a3e9b0990e90bd3fdaa32e1_fa846ee575633ded5b5e879f91103f07_02_OTP_Signed_Cash_Purchase_Slide1.jpg",
      "6a3e9b09299abbd41fe6a88d_60dd69f880204a13921a218635a96c70_02_OTP_Signed_Cash_Purchase_Slide2.jpg",
      "6a3e9b0a17c31f9b85b150d2_0e81982dfaf3b368207ed9558e1a193d_02_OTP_Signed_Cash_Purchase_Slide3.jpg",
      "6a3e9b09f9f4adc1afd684b8_24b37a5cf0e44f9960ac85782fe2bf62_02_OTP_Signed_Cash_Purchase_Slide4.jpg"
    ],
    "05_Bond_Deposit_Paid": [
      "6a3e9b5dae1ed47ab9835d5c_1fbb5a6c74fff0c66deced6b1387a67b_05_Bond_Deposit_Paid_Slide1.jpg",
      "6a3e9b5d25fd857a14bcd9f6_97068ed9f5f44f03996f01b144a0ebd9_05_Bond_Deposit_Paid_Slide2.jpg",
      "6a3e9b5d13a7404c5e005254_c81c89c507f0f5edbc39cde2982874fa_05_Bond_Deposit_Paid_Slide3.jpg",
      "6a3e9b5d0802460f641bcbab_bc1d322739caa29313042bbb1fb179e4_05_Bond_Deposit_Paid_Slide4.jpg"
    ],
    "04_Cash_Deposit_Paid": [
      "6a3e9b13f517c7feb2292fa3_8651afec5b51d7f0e6cc11a4548a9fa0_04_Cash_Deposit_Paid_Slide1.jpg",
      "6a3e9b14825a45c1edf7d12a_4f6c83a0706abc2dc573195740bbfdfe_04_Cash_Deposit_Paid_Slide2.jpg",
      "6a3e9b1411f008c657a7e9b7_3f1d51aba1ad9d4208a86253be3bc777_04_Cash_Deposit_Paid_Slide3.jpg",
      "6a3e9b14b18ac277ea082667_4814407ba60253ae93a4bde2d3b4e8a3_04_Cash_Deposit_Paid_Slide4.jpg"
    ],
    "06_Bond_Application_Submitted": [
      "6a3e9b65523e37ac5c3f5f86_38195e38f910f9761ee2235fc6830202_06_Bond_Application_Submitted_Slide1.jpg",
      "6a3e9b650802460f641bceb5_66f9198d71a154c7df50503b27e4d6c1_06_Bond_Application_Submitted_Slide2.jpg",
      "6a3e9b636c1f0c1ade35d1ab_88501ddce2b04f843121ab7b44abae99_06_Bond_Application_Submitted_Slide3.jpg"
    ],
    "07_Bond_Approved_and_Accepted": [
      "6a3e9b68552b91ae6d0a16ee_58198c2bea2f74485d4f1788c4a5ad81_07_Bond_Approved_and_Accepted_Slide1.jpg",
      "6a3e9b68f517c7feb2295fa9_3bf56d743c55840b861b8ce69002d916_07_Bond_Approved_and_Accepted_Slide2.jpg",
      "6a3e9b6834cfac80da83ba41_2a4456f3e9e2f2c5d03b8923109ba2b0_07_Bond_Approved_and_Accepted_Slide3.jpg",
      "6a3e9b6821bf1dad5727bad8_6f2360c059d068d6e16ad6f77ab657e7_07_Bond_Approved_and_Accepted_Slide4.jpg"
    ]
  };

  /* sub-stage -> deck, per route. "both" means the route makes no difference. */
  var SLIDE_MAP = {
    "pre-qualify": {"both": "Heartland_01_After_Reserving"},
    "sign-otp": {"bond": "Heartland_01_After_Reserving", "cash": "Heartland_01_After_Reserving"},
    "pay-deposit": {"bond": "Heartland_02_OTP_Bond", "cash": "02_OTP_Signed_Cash_Purchase"},
    "transfer-attorneys": {"bond": "05_Bond_Deposit_Paid", "cash": "04_Cash_Deposit_Paid"},
    "bond-approval": {"both": "06_Bond_Application_Submitted"},
    "bond-approved": {"both": "07_Bond_Approved_and_Accepted"}
  };

  function slidesFor(res) {
    if (!res) { return []; }
    /* Same floor as the tracker. A buyer whose deal has not been moved yet still gets
       the deck for the step they are about to do, rather than a blank panel. */
    var sub = subStageOf(res);
    var entry = SLIDE_MAP[sub];
    if (!entry) { return []; }
    var key = entry[routeOf(res)] || entry.both;
    var deck = key ? SLIDE_DECKS[key] : null;
    if (!deck) { return []; }
    var out = [];
    for (var i = 0; i < deck.length; i++) {
      out.push({ n: i + 1, of: deck.length, src: SLIDE_CDN + deck[i], deck: key });
    }
    return out;
  }


  var DEBUG = /[?&]hl_debug=1/.test(w.location.search);
  function log() {
    if (DEBUG && w.console) { console.log.apply(console, ["[hl-portal]"].concat([].slice.call(arguments))); }
  }
  function warn() {
    if (w.console) { console.warn.apply(console, ["[hl-portal]"].concat([].slice.call(arguments))); }
  }

  function param(k) {
    var m = new RegExp("[?&]" + k + "=([^&]*)").exec(w.location.search);
    return m ? decodeURIComponent(m[1]) : "";
  }

  /* WHERE MEMBERSTACK ACTUALLY KEEPS THE TOKEN - and it is not where this used to
     look. This comment used to read "Memberstack keeps the member token in a cookie".
     On the Heartland site it does not: the v2 package stores _ms-mid in localStorage
     and document.cookie has no trace of it. So the portal read the cookie, found
     nothing, and bounced every logged-in member straight back to the login page. It
     went unnoticed because the portal had never once been loaded with a real member
     session - every test until 30 Aug supplied the cookie itself.

     ALL THREE PLACES ARE READ. Memberstack's storage has moved before; a build that
     knows only one place breaks the same way the next time it moves, and reading an
     absent key costs nothing. Reading directly rather than waiting on $memberstackDom
     is still deliberate: the package may not have finished loading, and this page has
     nothing to show until the exchange has happened. */
  var MS_KEY = "_ms-mid";

  /* Some builds store the JWT as a JSON string, quotes and all. A token with a quote
     on each end is not a token, and the failure it causes is a 401 from Xano rather
     than anything that names the real problem. */
  function unquote(v) {
    var t = String(v === null || v === undefined ? "" : v).trim();
    if (t.length > 1 && t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') {
      t = t.slice(1, -1);
    }
    return t;
  }

  /* Storage throws rather than returning null when a browser is set to block it, so
     every read is defended. A blocked store is not an error worth reporting - it just
     means the token is somewhere else, or the member is not logged in. */
  function fromStore(which) {
    try {
      var store = w[which];
      return store ? unquote(store.getItem(MS_KEY)) : "";
    } catch (e) { return ""; }
  }

  function fromCookie() {
    var name = MS_KEY + "=";
    var parts = String(d.cookie || "").split(";");
    for (var i = 0; i < parts.length; i++) {
      var c = parts[i].trim();
      if (c.indexOf(name) === 0) { return unquote(decodeURIComponent(c.slice(name.length))); }
    }
    return "";
  }

  function memberToken() {
    return fromStore("localStorage") || fromCookie() || fromStore("sessionStorage");
  }

  function readJson(r) {
    return r.text().then(function (t) {
      var j = null;
      try { j = JSON.parse(t); } catch (e) {}
      if (!r.ok) { throw new Error((j && (j.message || j.error)) || ("HTTP " + r.status)); }
      return j;
    });
  }

  /* --------------------------------------------------------------- state */

  var ALL = [];
  var R = null;
  var TOKEN = "";        // the Xano token, kept for refreshes
  var clockOffset = 0;   // server time minus this device's clock, in ms

  function show(sel, on) {
    var els = d.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) { els[i].style.display = on ? "block" : "none"; }
  }

  /* --------------------------------------------------------------- theme */

  var THEME_KEYS = [
    ["primary", "--hl-primary"],
    ["primary_hover", "--hl-primary-hover"],
    ["secondary", "--hl-secondary"],
    ["ink", "--hl-ink"],
    ["line", "--hl-line"],
    ["radius", "--hl-radius"],
    ["font_display", "--hl-font-display"],
    ["tracking", "--hl-tracking"]
  ];

  function applyTheme(theme) {
    if (!theme) { return 0; }
    var root = d.querySelector("[data-hl-theme]") || d.documentElement;
    var set = 0;
    for (var i = 0; i < THEME_KEYS.length; i++) {
      var v = theme[THEME_KEYS[i][0]];
      if (v === null || v === undefined || v === "") { continue; }
      root.style.setProperty(THEME_KEYS[i][1], String(v));
      set++;
    }
    return set;
  }

  /* --------------------------------------------------------------- stages */

  function routeOf(res) {
    var r = String((res && res.payer_route) || "").toLowerCase();
    return (r === "cash") ? "cash" : "bond";
  }

  function markProgress(sel, attr, order, current) {
    var at = order.indexOf(String(current || "").toLowerCase());
    var els = d.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) {
      var mine = order.indexOf(String(els[i].getAttribute(attr) || "").toLowerCase());
      /* A step this buyer's route never visits is removed, not greyed out. A cash
         buyer being shown "bond approval" as a step they have not reached yet is a
         promise the process will never keep. */
      if (mine === -1) { els[i].style.display = "none"; continue; }
      els[i].style.display = "";
      els[i].classList.toggle("is-active", mine === at);
      els[i].classList.toggle("is-done", at > -1 && mine < at);
      els[i].classList.toggle("is-todo", at === -1 || mine > at);
    }
  }

  /* THE RESERVE STEP IS ALWAYS BEHIND THEM, and this is not cosmetic tidying. A buyer
     reaches this page by finishing the reserve flow and paying the hold fee. Showing
     "Reserve" as the step they are ON tells them to go and do a thing they have
     already done - and the deal_stage on the row can honestly still say reserve for
     the minutes between the payment and the ITN that moves it.

     THE FIRST FINANCE SUB-STEP IS THE FLOOR for the same reason: an EMPTY
     deal_sub_stage means the back end has not moved them yet, not that they are
     nowhere. Falling back to the route's first step shows a buyer what is in front of
     them instead of a tracker with nothing lit.

     AN UNKNOWN SUB-STAGE IS NOT FLOORED, and the difference matters. Empty means "not
     started". A value this bundle does not recognise means Xano has moved the deal
     somewhere newer than this file - "snagging", say - and answering that with "time
     left to pre-qualify" would send a buyer in the build phase back to step one. It is
     passed through: the tracker hides it, the label falls back to the generic
     sentence, and the deck comes back empty. Ugly beats wrong.

     DISPLAY ONLY. Neither of these invents a deadline: the countdown, the blocking and
     the withheld otp_url all still come from what the server actually stored. This
     decides which dot is filled in, and nothing else. */
  function stageOf(res) {
    var s = String((res && res.deal_stage) || "").toLowerCase();
    return (!s || s === "reserve") ? "finance" : s;
  }

  function subStageOf(res) {
    var s = String((res && res.deal_sub_stage) || "").toLowerCase();
    if (s) { return s; }
    /* AND ONLY INSIDE FINANCE. A deal already in build has no finance sub-stage
       because it is PAST them, not because it has not started one - flooring that to
       "pre-qualify" would hand a buyer watching their house go up a deck about signing
       the Offer to Purchase. Empty outside finance stays empty. */
    return (stageOf(res) === "finance") ? SUBSTAGES[routeOf(res)][0] : "";
  }

  function renderStages() {
    markProgress("[data-hl-stage]", "data-hl-stage", STAGES, stageOf(R));
    markProgress("[data-hl-substage]", "data-hl-substage",
                 SUBSTAGES[routeOf(R)], subStageOf(R));

    var route = routeOf(R);
    var els = d.querySelectorAll("[data-hl-route]");
    for (var i = 0; i < els.length; i++) {
      var want = String(els[i].getAttribute("data-hl-route") || "").toLowerCase();
      els[i].style.display = (want === route) ? "block" : "none";
    }
  }

  /* --------------------------------------------------------------- countdown */

  var DAY = 24 * 60 * 60 * 1000;

  function nowServer() { return Date.now() + clockOffset; }

  /* WHOLE DAYS, ROUNDED UP, and against the SERVER's clock.
     Rounded up because a deadline 18 hours away is "1 day left", not "0" - telling a
     buyer they have no days left while they still have the evening is how a portal
     causes a phone call. Against the server because a deadline reasoned from the
     device clock is wrong for exactly the buyer whose clock is wrong. */
  function daysLeft(dueAt) {
    var due = Number(dueAt);
    if (!dueAt || !isFinite(due)) { return null; }
    return Math.ceil((due - nowServer()) / DAY);
  }

  function fmtDate(ts) {
    var n = Number(ts);
    if (!ts || !isFinite(n)) { return ""; }
    var dt = new Date(n);
    var months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
    return dt.getDate() + " " + months[dt.getMonth()] + " " + dt.getFullYear();
  }

  /* WHAT THE CLOCK IS FOR. A buyer who has seven days to sign does not want to be told
     "7" - they want to see the time going. So the deadline is shown twice, and the two
     slots mean different things on purpose:

       [data-hl-countdown]        WHOLE DAYS, ROUNDED UP. The headline. 18 hours left
                                  reads as "1", because telling someone they have no
                                  days left while they still have the evening is how a
                                  portal causes a phone call. Use it on cards, badges
                                  and the home index.
       [data-hl-cd-d/-h/-m/-s]    THE EXACT CLOCK, ticking once a second. 18 hours left
                                  reads 0 / 18 / 12 / 09. Use it on the step the buyer
                                  is standing on.

     They disagree by a rounding, which is fine while they sit in different places and
     wrong the moment they sit side by side. Pick one per block.

     WHICH CLOCK. The breakdown can only come from deal_stage_due_at - a day count has
     no seconds in it - and it is read against the server's clock, not the device's, via
     the offset taken at boot. days_left stays the authority for the STATE: whether the
     buyer is ok, running out, or past the deadline is the server's call, made with the
     same numbers move_deal_stage and the console use, so the portal can never claim a
     buyer has time the back end has already taken away.

     A SUB-STAGE WITH NO WINDOW HAS NO DEADLINE, so it gets no countdown at all rather
     than a zero. Transfer and bond-approved are genuinely open-ended; a clock on them
     would be inventing a deadline nobody set. */

  var cdTimer = null;
  var cdReloaded = false;

  function pad2(n) {
    n = Number(n) || 0;
    return n < 10 ? "0" + n : String(n);
  }

  /* Days/hours/minutes/seconds from a span in milliseconds. Floors, because this is a
     clock and not the headline - a clock that rounded up would tick 18h -> 1d. */
  function breakUp(ms) {
    if (!(ms > 0)) { ms = 0; }
    var s = Math.floor(ms / 1000);
    return {
      d: Math.floor(s / 86400),
      h: Math.floor((s % 86400) / 3600),
      m: Math.floor((s % 3600) / 60),
      s: s % 60
    };
  }

  function fill(sel, text) {
    var els = d.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) { els[i].textContent = text; }
  }

  /* The unit labels are pluralised here rather than left as "Days" for the one case
     that reads badly: "1 Days". */
  function fillUnit(sel, n, one, many) {
    fill(sel, Number(n) === 1 ? one : many);
  }

  function renderCountdown() {
    var left = null;          /* whole days, the headline */
    var msLeft = null;        /* exact milliseconds, the clock */

    if (R && R.deal_stage_due_at) {
      var due = Number(R.deal_stage_due_at);
      if (isFinite(due)) { msLeft = due - nowServer(); }

      left = (R.days_left === null || R.days_left === undefined)
        ? daysLeft(R.deal_stage_due_at)
        : Number(R.days_left);
    }

    /* The server's verdict first; the local clock only where the server sent none. */
    var state;
    if (left === null && msLeft === null) {
      state = "none";
    } else if (R && R.is_overdue === true) {
      state = "overdue";
    } else if (left !== null && left < 0) {
      state = "overdue";
    } else if (msLeft !== null && msLeft <= 0) {
      state = "overdue";
    } else {
      state = (left !== null && left <= 3) ? "due-soon" : "ok";
    }

    var els = d.querySelectorAll("[data-hl-countdown]");
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = (left === null) ? "" : String(Math.max(0, left));
      els[i].setAttribute("data-hl-countdown-state", state);
      els[i].classList.toggle("is-overdue", state === "overdue");
      els[i].classList.toggle("is-due-soon", state === "due-soon");
    }

    var parts = breakUp(msLeft === null ? 0 : msLeft);
    var blank = (msLeft === null);

    fill("[data-hl-cd-d]", blank ? "" : String(parts.d));
    fill("[data-hl-cd-h]", blank ? "" : pad2(parts.h));
    fill("[data-hl-cd-m]", blank ? "" : pad2(parts.m));
    fill("[data-hl-cd-s]", blank ? "" : pad2(parts.s));

    if (!blank) {
      fillUnit("[data-hl-cd-d-label]", parts.d, "Day", "Days");
      fillUnit("[data-hl-cd-h-label]", parts.h, "Hour", "Hours");
      fillUnit("[data-hl-cd-m-label]", parts.m, "Minute", "Minutes");
      fillUnit("[data-hl-cd-s-label]", parts.s, "Second", "Seconds");
    }

    /* One element, the whole thing, for anywhere a four-box clock will not fit. Days
       are dropped once there are none left so the last day reads "04:12:09". */
    /* The label names the deadline. Without it the clock is four numbers and a unit
       row, which says how long is left and never what of. */
    var sub = subStageOf(R);
    var map = (state === "overdue") ? DEADLINE_PASSED : DEADLINE_LABEL;
    fill("[data-hl-countdown-label]",
         blank ? "" : (map[sub] || (state === "overdue"
                                      ? "This deadline has passed"
                                      : "Time left on this step")));

    fill("[data-hl-countdown-exact]", blank ? "" :
      (parts.d > 0 ? parts.d + "d " : "") +
      pad2(parts.h) + ":" + pad2(parts.m) + ":" + pad2(parts.s));

    var cds = d.querySelectorAll("[data-hl-cd]");
    for (var c = 0; c < cds.length; c++) {
      cds[c].setAttribute("data-hl-countdown-state", state);
      cds[c].classList.toggle("is-overdue", state === "overdue");
      cds[c].classList.toggle("is-due-soon", state === "due-soon");
    }

    var dues = d.querySelectorAll("[data-hl-due]");
    for (var j = 0; j < dues.length; j++) {
      dues[j].textContent = R ? fmtDate(R.deal_stage_due_at) : "";
    }

    var wraps = d.querySelectorAll("[data-hl-countdown-wrap]");
    for (var k = 0; k < wraps.length; k++) {
      wraps[k].style.display = blank && left === null ? "none" : "block";
    }

    tickControl(msLeft, state);
  }

  /* THE CLOCK RUNS ONLY WHILE IT MEANS SOMETHING: there is a deadline, it has not
     passed, and the reservation is not already blocked. Anything else and the interval
     is cleared, so a portal left open overnight on a cancelled deal is not waking the
     device once a second to redraw a zero. */
  function tickControl(msLeft, state) {
    var wanted = (msLeft !== null) && state !== "overdue" && !(R && R.is_blocked);

    if (!wanted) {
      if (cdTimer) { w.clearInterval(cdTimer); cdTimer = null; }
      return;
    }
    if (cdTimer) { return; }

    /* No d.hidden guard here on purpose. Browsers already throttle a background tab's
       intervals to about once a minute, so skipping the redraw saves almost nothing -
       and document.hidden is true in more places than "the tab is behind another one"
       (prerender, some embeddings, jsdom), each of which would leave a buyer staring at
       a frozen clock. The visibilitychange handler below catches the throttled tab up
       the instant it comes back. */
    cdTimer = w.setInterval(function () {
      renderCountdown();
      expiryCheck();
    }, 1000);
  }

  /* WHEN IT REACHES ZERO the page has learned that a deadline passed - and nothing
     else. Whether that cancels the reservation, withholds the OTP or gives the buyer a
     grace period is move_deal_stage's decision, not this file's, so the honest response
     is to go and ask rather than to invent a block locally. Once, and only for a buyer
     who was actually sitting on the page as the clock ran out. */
  function expiryCheck() {
    if (cdReloaded || !R || R.is_blocked) { return; }
    if (!R.deal_stage_due_at) { return; }
    var due = Number(R.deal_stage_due_at);
    if (!isFinite(due) || due - nowServer() > 0) { return; }
    cdReloaded = true;
    log("the deadline passed while this page was open - reloading for the server's view");
    w.setTimeout(function () { w.location.reload(); }, 1200);
  }

  d.addEventListener("visibilitychange", function () {
    if (!d.hidden && R) { renderCountdown(); }
  });


  /* --------------------------------------------------------------- presentation */

  /* Script-drawn markup owns its CSS. The Designer never sees these elements, so
     styling them from Webflow would mean a class nobody can find and a rule that
     breaks the first time this file changes. Injected once, prefixed, and written
     against the same --hl-* tokens the rest of the portal uses so it inherits the
     property's theme rather than introducing a second palette. */
  var slideCssDone = false;

  function slideCss() {
    if (slideCssDone) { return; }
    slideCssDone = true;
    var s = d.createElement("style");
    s.setAttribute("data-hl-slides-css", "");
    s.textContent =
      ".hl-sl-strip{display:flex;gap:.75rem;overflow-x:auto;scroll-snap-type:x mandatory;" +
      "-webkit-overflow-scrolling:touch;padding-bottom:.5rem;scrollbar-width:thin}" +
      ".hl-sl-thumb{flex:0 0 auto;width:min(78vw,22rem);scroll-snap-align:start;border:0;padding:0;" +
      "background:none;cursor:zoom-in;border-radius:var(--hl-radius,.25rem);overflow:hidden;" +
      "box-shadow:0 1px 3px rgba(0,0,0,.12);transition:transform .15s ease}" +
      ".hl-sl-thumb:hover{transform:translateY(-2px)}" +
      ".hl-sl-thumb img{display:block;width:100%;height:auto}" +
      ".hl-sl-count{font-size:.8125rem;opacity:.7;margin-top:.5rem}" +
      /* the lightbox */
      ".hl-sl-box{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.9);display:flex;" +
      "align-items:center;justify-content:center;padding:1rem}" +
      ".hl-sl-box img{max-width:100%;max-height:85vh;width:auto;height:auto;display:block}" +
      ".hl-sl-btn{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.5);" +
      "color:#fff;border:0;width:3rem;height:3rem;border-radius:50%;font-size:1.5rem;cursor:pointer;" +
      "line-height:1}" +
      ".hl-sl-prev{left:1rem}.hl-sl-next{right:1rem}" +
      ".hl-sl-close{position:absolute;top:1rem;right:1rem;transform:none}" +
      ".hl-sl-pos{position:absolute;bottom:1.25rem;left:0;right:0;text-align:center;color:#fff;" +
      "font-size:.875rem;opacity:.85}" +
      "@media (max-width:30rem){.hl-sl-btn{width:2.5rem;height:2.5rem}}";
    d.head.appendChild(s);
  }

  var lightbox = null;

  /* One overlay, reused. Building it per open would leak a node on every click and
     lose the listeners that close it. */
  function openLightbox(slides, at) {
    slideCss();
    var i = at;

    if (!lightbox) {
      lightbox = d.createElement("div");
      lightbox.className = "hl-sl-box";
      lightbox.setAttribute("role", "dialog");
      lightbox.setAttribute("aria-modal", "true");
      lightbox.setAttribute("aria-label", "Step presentation");
      lightbox.innerHTML =
        '<img alt="">' +
        '<button class="hl-sl-btn hl-sl-prev" aria-label="Previous slide">&#8249;</button>' +
        '<button class="hl-sl-btn hl-sl-next" aria-label="Next slide">&#8250;</button>' +
        '<button class="hl-sl-btn hl-sl-close" aria-label="Close">&times;</button>' +
        '<div class="hl-sl-pos"></div>';
      d.body.appendChild(lightbox);
    }

    var img = lightbox.querySelector("img");
    var pos = lightbox.querySelector(".hl-sl-pos");
    var opener = d.activeElement;

    function show(n) {
      if (n < 0) { n = slides.length - 1; }
      if (n >= slides.length) { n = 0; }
      i = n;
      img.setAttribute("src", slides[i].src);
      img.setAttribute("alt", "Slide " + slides[i].n + " of " + slides[i].of);
      pos.textContent = slides[i].n + " / " + slides[i].of;
    }

    function close() {
      lightbox.style.display = "none";
      d.removeEventListener("keydown", onKey);
      /* Give the page its scroll back, and the focus to whatever opened this. */
      d.documentElement.style.overflow = "";
      if (opener && typeof opener.focus === "function") { opener.focus(); }
    }

    function onKey(e) {
      if (e.key === "Escape") { close(); }
      else if (e.key === "ArrowLeft") { show(i - 1); }
      else if (e.key === "ArrowRight") { show(i + 1); }
    }

    /* Rebound on every open, because the slide list changes with the sub-stage. */
    lightbox.querySelector(".hl-sl-prev").onclick = function () { show(i - 1); };
    lightbox.querySelector(".hl-sl-next").onclick = function () { show(i + 1); };
    lightbox.querySelector(".hl-sl-close").onclick = close;
    lightbox.onclick = function (e) { if (e.target === lightbox) { close(); } };
    d.addEventListener("keydown", onKey);

    d.documentElement.style.overflow = "hidden";
    lightbox.style.display = "flex";
    show(at);
    lightbox.querySelector(".hl-sl-close").focus();
  }

  /* [data-hl-slides] is where the deck goes. A page without it simply has no
     presentation - the module does not care, and neither does the Designer. */
  function renderSlides() {
    var hosts = d.querySelectorAll("[data-hl-slides]");
    if (!hosts.length) { return 0; }

    var slides = slidesFor(R);
    slideCss();

    for (var h = 0; h < hosts.length; h++) {
      var host = hosts[h];
      while (host.firstChild) { host.removeChild(host.firstChild); }

      if (!slides.length) { host.style.display = "none"; continue; }
      host.style.display = "block";

      var strip = d.createElement("div");
      strip.className = "hl-sl-strip";

      for (var i = 0; i < slides.length; i++) {
        var b = d.createElement("button");
        b.type = "button";
        b.className = "hl-sl-thumb";
        b.setAttribute("data-hl-slide", String(slides[i].n));
        b.setAttribute("aria-label", "Open slide " + slides[i].n + " of " + slides[i].of);
        var im = d.createElement("img");
        im.setAttribute("src", slides[i].src);
        im.setAttribute("alt", "");
        /* Off-screen slides cost nothing until they are scrolled to. */
        im.setAttribute("loading", "lazy");
        im.setAttribute("decoding", "async");
        b.appendChild(im);
        (function (list, at) {
          b.addEventListener("click", function () { openLightbox(list, at); });
        })(slides, i);
        strip.appendChild(b);
      }

      var count = d.createElement("div");
      count.className = "hl-sl-count";
      count.textContent = slides.length + (slides.length === 1 ? " slide" : " slides") +
                          " — tap to enlarge";

      host.appendChild(strip);
      host.appendChild(count);
    }
    return slides.length;
  }

  /* --------------------------------------------------- the Offer to Purchase */

  /* THE OTP IS ITS OWN CARD, not a line in the step list, because it is the only
     document in the process the buyer both RECEIVES and RETURNS - and the two halves
     of that are months apart. Before signature it is a thing to go and do; afterwards
     it is the record of the single most important thing they have done, and burying
     that in a tracker row makes them hunt for it.

     THE SIGNED COPY IS WHAT SALES ATTACHED, and the date is when they attached it -
     NOT when the buyer signed. We do not know when they signed; Zoho does. Calling it
     "signed on" would be inventing a fact, so the label says received. If that date
     ever matters properly, it has to come from Zoho, not from here.

     otp_url IS ALREADY WITHHELD by member_reservations_view when the deal is blocked,
     so there is nothing to hide here - there is simply no link. That is the rule this
     project keeps: hiding a button is presentation, withholding the value is the rule. */

  function signedOtp() {
    var list = (R && R.documents) || [];
    var found = null;
    for (var i = 0; i < list.length; i++) {
      var doc = list[i] || {};
      if (String(doc.doc_type || "").toLowerCase() !== "otp-signed") { continue; }
      /* The LAST one wins. add_reservation_document replaces on the same type, so
         there should only ever be one active - but if a future path leaves two, the
         newer is the one that counts. */
      found = doc;
    }
    if (!found || !safeUrl(found.url)) { return null; }
    return found;
  }

  function renderOtp() {
    var card = d.querySelectorAll("[data-hl-otp]");
    if (!card.length) { return; }

    var signed = signedOtp();
    var link = R ? safeUrl(R.otp_url) : "";
    var atStep = (subStageOf(R) === "sign-otp");
    var blocked = !!(R && R.is_blocked);

    /* Nothing to say only when the buyer has not reached the step, has no link and has
       no signed copy. A card that appeared and vanished as the deal moved would be
       worse than one that is simply not there yet. */
    /* NOT named "show". A local of that name shadows the show() helper for the whole
       function body, and every show("[data-hl-otp-...]") call below then tries to
       invoke a boolean. It failed loudly here; the same mistake in a branch that runs
       less often would not have. */
    var visible = !!(signed || link || atStep);
    var i;
    for (i = 0; i < card.length; i++) {
      card[i].style.display = visible ? "block" : "none";
      card[i].classList.toggle("is-signed", !!signed);
    }
    if (!visible) { return; }

    /* THREE STATES, ONE AT A TIME. Signed beats everything - once the executed copy is
       back, "go and sign" is not an instruction, it is a confusion. */
    var state = signed ? "signed" : (link ? "sign" : "waiting");

    show("[data-hl-otp-signed]", state === "signed");
    show("[data-hl-otp-sign]", state === "sign");
    show("[data-hl-otp-waiting]", state === "waiting");

    var links = d.querySelectorAll("[data-hl-otp-link]");
    for (i = 0; i < links.length; i++) {
      if (link) {
        links[i].setAttribute("href", link);
        links[i].setAttribute("target", "_blank");
        links[i].setAttribute("rel", "noopener noreferrer");
      } else {
        links[i].removeAttribute("href");
      }
    }

    var docs = d.querySelectorAll("[data-hl-otp-doc]");
    for (i = 0; i < docs.length; i++) {
      if (signed) {
        docs[i].setAttribute("href", signed.url);
        docs[i].setAttribute("target", "_blank");
        docs[i].setAttribute("rel", "noopener noreferrer");
      } else {
        docs[i].removeAttribute("href");
      }
    }

    var dates = d.querySelectorAll("[data-hl-otp-date]");
    for (i = 0; i < dates.length; i++) {
      dates[i].textContent = signed ? fmtDate(signed.created_at) : "";
    }

    /* The one case where the buyer needs a sentence rather than a button: the step is
       theirs, the deal is blocked, and the link is therefore gone. */
    show("[data-hl-otp-blocked]", !signed && blocked);
  }

  /* ------------------------------------------------------ actions on a step */

  /* SOME STEPS ARE THINGS TO DO, and until now the tracker only ever said which one
     you were on. Pre-qualifying means going to the bank's broker; signing means going
     to Zoho. Both are links the buyer cannot guess, and a step that names a task
     without offering the way to do it is a to-do list with the pens taken away.

     THE PRE-QUALIFY LINK IS PER DEVELOPMENT and carries the broker's attribution
     parameter, so it comes from res_config via the reservation rather than from a
     constant here. A development with no link offers NO BUTTON - borrowing another
     one's would credit the wrong development for every application it sent.

     The same https guard as the documents, for the same reason: this is a CMS-supplied
     string being written into an href on a page holding a live member session. */
  function stepActions() {
    if (!R) { return {}; }
    var acts = R.actions || {};
    return {
      "pre-qualify": {
        url: safeUrl(acts.prequalify_url),
        logo: safeUrl(acts.prequalify_logo)
      },
      "sign-otp": {
        url: safeUrl(R.otp_url),
        logo: ""
      }
    };
  }

  function renderStepActions() {
    var map = stepActions();
    var blocks = d.querySelectorAll("[data-hl-step-action]");
    for (var i = 0; i < blocks.length; i++) {
      var name = blocks[i].getAttribute("data-hl-step-action");
      var act = map[name] || {};
      var on = !!act.url;
      blocks[i].style.display = on ? "block" : "none";
      if (!on) { continue; }

      var links = blocks[i].querySelectorAll("[data-hl-step-link]");
      for (var j = 0; j < links.length; j++) {
        links[j].setAttribute("href", act.url);
        links[j].setAttribute("target", "_blank");
        links[j].setAttribute("rel", "noopener noreferrer");
      }

      /* The partner's logo is shown ONLY when there is one. An empty img is a broken
         image icon next to a bank's name, which is worse than no logo at all. */
      var logos = blocks[i].querySelectorAll("[data-hl-step-logo]");
      for (var k = 0; k < logos.length; k++) {
        if (act.logo) {
          logos[k].setAttribute("src", act.logo);
          logos[k].style.display = "block";
        } else {
          logos[k].removeAttribute("src");
          logos[k].style.display = "none";
        }
      }
    }
  }

  /* --------------------------------------------------------------- next step */

  /* WHICH STEP IS THE BUYER'S NEXT ONE. The tracker already marks done / active /
     todo; this names the active one in words, so the page answers "what do I do now"
     without the buyer having to read a row of dots. */
  function renderNextStep() {
    var sub = R ? subStageOf(R) : "";
    var label = labelOf(SUBSTAGE_LABEL, sub);

    var titles = d.querySelectorAll("[data-hl-next-title]");
    for (var i = 0; i < titles.length; i++) { titles[i].textContent = label; }

    /* The eyebrow is shown only when there IS a next step. A finished deal that still
       said "Your next step" over an empty line would be worse than saying nothing. */
    var wraps = d.querySelectorAll("[data-hl-next]");
    for (var w = 0; w < wraps.length; w++) {
      wraps[w].style.display = label ? "block" : "none";
    }

    /* .is-next on the sub-step the buyer is on, so the Designer can style one card
       differently from the rest without this file knowing how. */
    var items = d.querySelectorAll("[data-hl-substage]");
    for (var k = 0; k < items.length; k++) {
      var mine = String(items[k].getAttribute("data-hl-substage") || "").toLowerCase();
      items[k].classList.toggle("is-next", !!sub && mine === sub);
    }
    return label;
  }

  /* --------------------------------------------------------------- blocked */

  /* A deadline that has passed, or a reservation that has been ended. The SERVER has
     already withheld otp_url in that case - this only makes the page agree with it.
     Hiding a button is presentation; the rule lives in Xano. */
  function renderBlocked() {
    var blocked = !!(R && R.is_blocked);
    var reason = (R && R.blocked_reason) || "";

    var boxes = d.querySelectorAll("[data-hl-blocked]");
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].style.display = blocked ? "block" : "none";
    }
    var says = d.querySelectorAll("[data-hl-blocked-reason]");
    for (var j = 0; j < says.length; j++) { says[j].textContent = reason; }

    /* Anything marked as an action the buyer takes to move forward. With no otp_url
       the link would render href-less anyway; this removes it from the page rather
       than leaving a dead button to be clicked. */
    var acts = d.querySelectorAll("[data-hl-action]");
    for (var a = 0; a < acts.length; a++) {
      acts[a].style.display = blocked ? "none" : "";
    }

    var root = d.querySelector("[data-hl-portal]");
    if (root) { root.classList.toggle("is-blocked", blocked); }
    return blocked;
  }

  /* --------------------------------------------------------------- switcher */

  function homeLabel(r) {
    var unitName = (r.unit && (r.unit.display_name || r.unit.name)) || "Your home";
    return (r.property_name || r.property_slug || "") + " — " + unitName;
  }

  /* ------------------------------------------------- the navbar controls */

  /* NAMES SHORT ENOUGH FOR A NAVBAR. "Sanford Heart — Home 1" is the right label on a
     card and far too long in a control that has to sit between a logo and a menu on a
     phone. SH — 01: the property's initials, then the unit number padded to two.

     IT FALLS BACK TO THE LONG NAME rather than to something clever. A development
     called "Polaris" gives P, which is not obviously wrong; a unit with no number
     gives nothing at all, and half an abbreviation is worse than a name that wraps. */
  function shortLabel(r) {
    if (!r) { return ""; }
    var prop = String(r.property_name || r.property_slug || "").trim();
    var words = prop.split(/[\s-]+/);
    var initials = "";
    for (var i = 0; i < words.length && initials.length < 3; i++) {
      if (words[i]) { initials += words[i].charAt(0).toUpperCase(); }
    }

    var unit = r.unit || {};
    var num = String(unit.unit_number === null || unit.unit_number === undefined ? "" : unit.unit_number).trim();
    if (!num) {
      /* display_name is "Home 6"; the number is the only part worth abbreviating. */
      var m = String(unit.display_name || unit.name || "").match(/(\d+)\s*$/);
      if (m) { num = m[1]; }
    }
    if (!initials || !num) { return homeLabel(r); }
    return initials + " — " + (num.length < 2 ? "0" + num : num);
  }

  /* ONE DISCLOSURE, TWO CONTROLS. The homes dropdown and the menu behave identically -
     click to open, click away or Escape to close, arrows to move, Enter to choose - so
     they are one implementation rather than two that drift. A native <select> was the
     right first answer and is the wrong final one here: it cannot be themed, and this
     bar is the one piece of the portal that is on screen the whole time. */
  var openMenu = null;

  function closeMenu() {
    if (!openMenu) { return; }
    openMenu.btn.setAttribute("aria-expanded", "false");
    openMenu.list.hidden = true;
    openMenu = null;
  }

  function toggleMenu(btn, list) {
    var isOpen = openMenu && openMenu.list === list;
    closeMenu();
    if (isOpen) { return; }
    btn.setAttribute("aria-expanded", "true");
    list.hidden = false;
    openMenu = {btn: btn, list: list};
    var first = list.querySelector("[data-hl-menu-item]:not([hidden])");
    if (first && first.focus) { first.focus(); }
  }

  /* Bound once, at module level, rather than per control: a listener added every time
     the switcher re-renders is a listener that fires twice on the second render. */
  var menuWired = false;
  function wireMenus() {
    if (menuWired) { return; }
    menuWired = true;

    d.addEventListener("click", function (ev) {
      if (!openMenu) { return; }
      /* A click inside any menu is that menu's business - an item's own handler
         navigates, and the button's toggles. Everything else closes. */
      var t = ev.target;
      if (t && t.closest && t.closest("[data-hl-menu]")) { return; }
      closeMenu();
    });

    d.addEventListener("keydown", function (ev) {
      if (!openMenu) { return; }
      var k = ev.key;
      if (k === "Escape") {
        var b = openMenu.btn;
        closeMenu();
        if (b && b.focus) { b.focus(); }
        return;
      }
      if (k !== "ArrowDown" && k !== "ArrowUp") { return; }
      var items = [];
      var all = openMenu.list.querySelectorAll("[data-hl-menu-item]");
      for (var i = 0; i < all.length; i++) { if (!all[i].hidden) { items.push(all[i]); } }
      if (!items.length) { return; }
      var at = items.indexOf(d.activeElement);
      var next = (k === "ArrowDown") ? at + 1 : at - 1;
      if (next < 0) { next = items.length - 1; }
      if (next >= items.length) { next = 0; }
      items[next].focus();
      ev.preventDefault();
    });
  }

  var menuCssDone = false;
  function menuCss() {
    if (menuCssDone) { return; }
    menuCssDone = true;
    var css =
      "[data-hl-menu]{position:relative;}" +
      ".hl-mbtn{display:inline-flex;align-items:center;gap:0.5rem;width:100%;" +
      "font:inherit;font-size:0.8125rem;line-height:1.2;color:var(--hl-ink,#3a3d3c);" +
      "background:transparent;border:1px solid var(--hl-line,#c3c1c2);" +
      "border-radius:var(--hl-radius,0.25rem);padding:0.45rem 0.7rem;cursor:pointer;" +
      "text-align:left;transition:border-color .18s ease;}" +
      ".hl-mbtn:hover{border-color:var(--hl-primary,#8a9380);}" +
      ".hl-mbtn:focus-visible{outline:2px solid var(--hl-primary,#8a9380);outline-offset:2px;}" +
      ".hl-mbtn-label{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
      ".hl-mbtn-caret{flex:0 0 auto;width:0;height:0;border-left:4px solid transparent;" +
      "border-right:4px solid transparent;border-top:5px solid currentColor;opacity:.55;}" +
      ".hl-mlist{position:absolute;z-index:60;top:calc(100% + 0.35rem);left:0;min-width:100%;" +
      "margin:0;padding:0.25rem;list-style:none;background:#fff;" +
      "border:1px solid var(--hl-line,#c3c1c2);border-radius:var(--hl-radius,0.25rem);" +
      "box-shadow:0 10px 28px rgba(0,0,0,.10);}" +
      ".hl-mlist[hidden]{display:none;}" +
      ".hl-mlist-right{left:auto;right:0;}" +
      ".hl-mitem{display:block;width:100%;box-sizing:border-box;font:inherit;font-size:0.8125rem;" +
      "text-align:left;white-space:nowrap;color:var(--hl-ink,#3a3d3c);text-decoration:none;" +
      "background:transparent;border:0;border-radius:calc(var(--hl-radius,0.25rem) - 1px);" +
      "padding:0.5rem 0.7rem;cursor:pointer;}" +
      ".hl-mitem:hover{background:rgba(0,0,0,.05);}" +
      ".hl-mitem:focus-visible{outline:2px solid var(--hl-primary,#8a9380);outline-offset:-2px;}" +
      ".hl-mitem.is-current{color:var(--hl-primary,#8a9380);font-weight:600;}" +
      ".hl-burger{display:inline-flex;align-items:center;justify-content:center;width:2.25rem;" +
      "height:2.25rem;padding:0;background:transparent;border:1px solid transparent;" +
      "border-radius:var(--hl-radius,0.25rem);cursor:pointer;color:var(--hl-ink,#3a3d3c);}" +
      ".hl-burger:hover{border-color:var(--hl-line,#c3c1c2);}" +
      ".hl-burger:focus-visible{outline:2px solid var(--hl-primary,#8a9380);outline-offset:2px;}" +
      ".hl-burger-bars,.hl-burger-bars::before,.hl-burger-bars::after{display:block;width:16px;" +
      "height:1.5px;background:currentColor;content:'';}" +
      ".hl-burger-bars{position:relative;}" +
      ".hl-burger-bars::before{position:absolute;top:-5px;}" +
      ".hl-burger-bars::after{position:absolute;top:5px;}";
    var tag = d.createElement("style");
    tag.setAttribute("data-hl-menu-css", "");
    tag.appendChild(d.createTextNode(css));
    (d.head || d.documentElement).appendChild(tag);
  }

  function renderSwitcher() {
    /* Which home you are looking at, in words. On a one-home account this is just the
       page saying where you are; on a three-home account it is the difference between
       reading your own balance and reading somebody else's. */
    var names = d.querySelectorAll("[data-hl-current-home]");
    for (var n = 0; n < names.length; n++) {
      names[n].textContent = R ? homeLabel(R) : "";
    }

    var wrap = d.querySelector("[data-hl-switcher]");
    var list = d.querySelector("[data-hl-switcher-list]");
    if (!wrap || !list) { return; }
    if (ALL.length < 2) { wrap.style.display = "none"; return; }

    wrap.style.display = "block";
    while (list.firstChild) { list.removeChild(list.firstChild); }

    /* A DROPDOWN, not a row of pills, and a THEMED one rather than a native select.
       Three homes fit across a phone; six do not, and a switcher that reflows into
       four rows pushes the thing the buyer came to read below the fold. The native
       select was the right first answer - it needs no styling and every assistive
       technology knows it - and it is the wrong final one for this bar, which is the
       single piece of the portal on screen the whole time and the one place the
       browser's own chrome looks like somebody else's product.

       The labels are ABBREVIATED here and nowhere else: SH - 01 in a navbar, the full
       name everywhere there is room for it. */
    menuCss();
    wireMenus();

    var box = d.createElement("div");
    box.setAttribute("data-hl-menu", "");

    var btn = d.createElement("button");
    btn.type = "button";
    btn.className = "hl-mbtn";
    btn.setAttribute("data-hl-switcher-button", "");
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Your homes");

    var lab = d.createElement("span");
    lab.className = "hl-mbtn-label";
    lab.textContent = R ? shortLabel(R) : "Your homes";
    btn.appendChild(lab);

    var caret = d.createElement("span");
    caret.className = "hl-mbtn-caret";
    caret.setAttribute("aria-hidden", "true");
    btn.appendChild(caret);

    var menu = d.createElement("ul");
    menu.className = "hl-mlist";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("data-hl-switcher-menu", "");
    menu.hidden = true;

    for (var i = 0; i < ALL.length; i++) {
      var r = ALL[i];
      var li = d.createElement("li");
      var a = d.createElement("a");
      a.className = "hl-mitem" + (R && r.uuid === R.uuid ? " is-current" : "");
      a.setAttribute("href", "?r=" + encodeURIComponent(r.uuid));
      a.setAttribute("data-hl-switcher-item", r.uuid);
      a.setAttribute("data-hl-menu-item", "");
      a.setAttribute("role", "option");
      a.setAttribute("aria-selected", (R && r.uuid === R.uuid) ? "true" : "false");
      /* The short name leads because that is what the button shows; the full one is
         the title, for anyone who needs to be sure which home SH - 01 is. */
      a.textContent = shortLabel(r);
      a.setAttribute("title", homeLabel(r));
      li.appendChild(a);
      menu.appendChild(li);
    }

    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      toggleMenu(btn, menu);
    });

    box.appendChild(btn);
    box.appendChild(menu);
    list.appendChild(box);
  }

  /* THE REST OF THE NAVBAR, behind one button. Today it holds only Log out; the point
     of building it now is that the second link does not need a layout decision. The
     markup is the Designer's - [data-hl-topbar-menu] on a wrapper holding the links -
     so adding one is a Webflow change rather than a push. */
  function renderTopbarMenu() {
    var wrap = d.querySelector("[data-hl-topbar-menu]");
    if (!wrap || wrap.getAttribute("data-hl-menu-built") === "1") { return; }

    var links = wrap.querySelectorAll("a");
    if (!links.length) { return; }

    menuCss();
    wireMenus();
    wrap.setAttribute("data-hl-menu-built", "1");
    wrap.setAttribute("data-hl-menu", "");

    var btn = d.createElement("button");
    btn.type = "button";
    btn.className = "hl-burger";
    btn.setAttribute("data-hl-topbar-button", "");
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Menu");
    var bars = d.createElement("span");
    bars.className = "hl-burger-bars";
    bars.setAttribute("aria-hidden", "true");
    btn.appendChild(bars);

    var menu = d.createElement("div");
    menu.className = "hl-mlist hl-mlist-right";
    menu.setAttribute("role", "menu");
    menu.setAttribute("data-hl-topbar-list", "");
    menu.hidden = true;

    /* The Designer's own anchors are MOVED into the menu, not recreated from their
       text. data-ms-action="logout" is Memberstack's hook and copying an element by
       reading its label is how an attribute like that gets quietly dropped. */
    for (var i = 0; i < links.length; i++) {
      links[i].classList.add("hl-mitem");
      links[i].setAttribute("data-hl-menu-item", "");
      links[i].setAttribute("role", "menuitem");
      menu.appendChild(links[i]);
    }

    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      toggleMenu(btn, menu);
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
  }

  /* ------------------------------------------------------------- the tabs */

  /* THREE SCREENS, ONE PAGE, AND THE REASON IS SPECIFIC TO THIS BUILD rather than a
     general preference for single-page apps.

     member_reservations_view already returns everything all three screens need in the
     SINGLE auth exchange - the order lines, both document sets, the deal state. Three
     separate pages therefore paid for the same Memberstack exchange and the same Xano
     round trip, from South Africa, three times over, to show data the first load
     already had. That was the sluggishness: not the HTML, the re-auth and the re-fetch.

     Consolidated, a tab change is a class toggle. No network at all.

     WHAT KEEPS IT HONEST:
       - The tabs are still REAL ANCHORS with real hrefs. They work before this file
         runs and they still work if it breaks; the click is only intercepted once a
         matching panel is known to exist on the page.
       - The tab is in the URL (?tab=order) via pushState, so back, forward, refresh,
         a copied link and a bookmark all land where the buyer was.
       - ?r= travels with it. carrySelection already writes the chosen home onto every
         portal link, and the rewrite here preserves whatever is already on the URL.
       - /portal-order and /portal-documents redirect into the right tab, so every link
         and bookmark that existed before this change still arrives somewhere correct.

     NOT A FAKE TABLIST. These are links to real URLs, so they keep aria-current rather
     than being dressed up as role="tab" - which would promise keyboard semantics that
     browser history, not this file, is actually providing. */

  var TAB_PATHS = {"/portal": "home", "/portal-order": "order", "/portal-documents": "documents"};
  var DEFAULT_TAB = "home";
  var currentTab = "";

  function tabOfLink(a) {
    var declared = a.getAttribute("data-hl-tab");
    if (declared) { return declared; }
    /* Inferred as a fallback so a nav that has not been updated still works. */
    var u;
    try { u = new w.URL(a.href, w.location.href); } catch (e) { return ""; }
    return TAB_PATHS[u.pathname] || "";
  }

  function panelFor(name) {
    if (!name) { return null; }
    return d.querySelector('[data-hl-tab-panel="' + name + '"]');
  }

  function tabFromUrl() {
    var t = param("tab");
    return (t && panelFor(t)) ? t : DEFAULT_TAB;
  }

  /* The url the buyer should see for a tab, keeping every other parameter - ?r= above
     all, because losing it silently shows them a different home's order summary. */
  function tabUrl(name) {
    var u;
    try { u = new w.URL(w.location.href); } catch (e) { return null; }
    if (name === DEFAULT_TAB) { u.searchParams.delete("tab"); }
    else { u.searchParams.set("tab", name); }
    return u.pathname + u.search + u.hash;
  }

  function showTab(name, push) {
    var panels = d.querySelectorAll("[data-hl-tab-panel]");
    if (!panels.length) { return false; }
    if (!panelFor(name)) { name = DEFAULT_TAB; }
    if (!panelFor(name)) { return false; }

    var i;
    for (i = 0; i < panels.length; i++) {
      var mine = panels[i].getAttribute("data-hl-tab-panel") === name;
      /* Shown with a value, never by clearing one - the rule this project learned the
         hard way when Webflow turned an inline style into a generated class. */
      panels[i].style.display = mine ? "block" : "none";
      panels[i].classList.toggle("is-active", mine);
    }

    var links = d.querySelectorAll("[data-hl-nav] a, .hlp-nav a");
    for (i = 0; i < links.length; i++) {
      var t = tabOfLink(links[i]);
      var on = (t === name);
      links[i].classList.toggle("is-here", on);
      if (on) { links[i].setAttribute("aria-current", "page"); }
      else { links[i].removeAttribute("aria-current"); }
    }

    if (push && currentTab && currentTab !== name) {
      var href = tabUrl(name);
      try { if (href) { w.history.pushState({hlTab: name}, "", href); } } catch (e) {}
    }
    currentTab = name;

    /* The tab row scrolls into view only when it has been scrolled PAST. Jumping to
       the top of the page on every tab change would fight a buyer who is halfway down
       the order summary and just wants to check a document. */
    var nav = navRoot();
    if (push && nav && nav.getBoundingClientRect && nav.getBoundingClientRect().top < 0) {
      try { nav.scrollIntoView({block: "start", behavior: "smooth"}); }
      catch (e2) { nav.scrollIntoView(); }
    }

    /* Announced, not just repainted: without this a screen reader stays where it was
       and the buyer is told nothing changed. */
    var panel = panelFor(name);
    if (push && panel) {
      panel.setAttribute("tabindex", "-1");
      if (panel.focus) { try { panel.focus({preventScroll: true}); } catch (e3) { panel.focus(); } }
    }

    /* The collapsed nav is rebuilt from the anchors, whose is-here has just moved. */
    if (navSelect) { fitNav(); }
    return true;
  }

  var tabsWired = false;

  function wireTabs() {
    if (tabsWired) { return; }
    if (!d.querySelector("[data-hl-tab-panel]")) { return; }
    tabsWired = true;

    d.addEventListener("click", function (ev) {
      /* Modified clicks belong to the browser. A middle click, or cmd-click, means
         "open this somewhere else", and a tab that swallowed it would be a link that
         lies about being a link. */
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey ||
          ev.shiftKey || ev.altKey) { return; }
      var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a) { return; }
      if (a.hasAttribute("data-hl-menu-item")) { return; }
      var name = tabOfLink(a);
      if (!name || !panelFor(name)) { return; }
      if (showTab(name, true)) { ev.preventDefault(); }
    });

    w.addEventListener("popstate", function () { showTab(tabFromUrl(), false); });
  }

  /* A PAGE THAT IS ONLY A SIGNPOST. /portal-order and /portal-documents were real
     screens until the three were consolidated; they stay as redirects so every link,
     bookmark and email that pointed at them still arrives in the right tab rather than
     at a 404. The marker is in the Designer, so retiring one later is a Webflow
     change. ?r= is carried across, because a redirect that dropped the chosen home
     would land a two-home buyer on the wrong order summary. */
  function tabRedirectTarget() {
    var el = d.querySelector("[data-hl-tab-redirect]");
    if (!el || d.querySelector("[data-hl-tab-panel]")) { return ""; }
    var name = String(el.getAttribute("data-hl-tab-redirect") || "").trim();
    if (!name) { return ""; }
    var to = "/portal";
    var r = param("r") || stashed(SEL_KEY);
    var q = [];
    if (name !== DEFAULT_TAB) { q.push("tab=" + encodeURIComponent(name)); }
    if (r) { q.push("r=" + encodeURIComponent(r)); }
    if (q.length) { to += "?" + q.join("&"); }
    return to;
  }

  function tabRedirect() {
    var to = tabRedirectTarget();
    if (!to) { return false; }
    log("this page is now a tab on /portal - going to", to);
    w.location.replace(to);
    return true;
  }

  /* ------------------------------------------------------- the three screens */

  /* THE TABS, AND WHAT HAPPENS WHEN THEY DO NOT FIT.

     The Designer writes them as plain anchors, which is what navigation should be: it
     works before this file loads and it still works if this file breaks. But on a
     narrow phone three uppercase, letter-spaced labels wrap onto a second line, and a
     wrapped tab row does not read as "two lines of tabs" - it reads as broken.

     So when they wrap the row becomes a native select. MEASURED, NOT GUESSED FROM A
     BREAKPOINT: the labels are editable in Webflow, and a breakpoint that was right
     for "Documents" is wrong the day somebody types "Your documents". Native because
     on a phone it is the OS picker - no styling to fight, no outside-click handler, no
     focus trap, and every assistive technology already knows what it is.

     The anchors are HIDDEN, never removed, so a rotate back to landscape can simply
     show them again. */

  var navSelect = null;
  var navCssDone = false;

  function navCss() {
    if (navCssDone) { return; }
    navCssDone = true;
    var css =
      ".hl-sel{width:100%;-webkit-appearance:none;appearance:none;" +
      "font:inherit;font-size:0.875rem;color:var(--hl-ink,#3a3d3c);" +
      "background-color:transparent;border:1px solid var(--hl-line,#c3c1c2);" +
      "border-radius:var(--hl-radius,0.25rem);padding:0.6rem 2rem 0.6rem 0.8rem;" +
      "background-image:url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath fill='%233a3d3c' d='M1 1l5 5 5-5'/%3E%3C/svg%3E\");" +
      "background-repeat:no-repeat;background-position:right 0.75rem center;background-size:12px 8px;}" +
      ".hl-sel:focus{outline:2px solid var(--hl-primary,#8a9380);outline-offset:2px;}" +
      ".hl-nav-select{display:none;}" +
      /* Tighter than the tab select, because this one lives in the navbar and the
         navbar's height is set by whatever is tallest in it. */
      ".hl-switch-select{display:block;max-width:22rem;font-size:0.8125rem;" +
      "padding:0.4rem 1.9rem 0.4rem 0.7rem;background-position:right 0.6rem center;}";
    var tag = d.createElement("style");
    tag.setAttribute("data-hl-nav-css", "");
    tag.appendChild(d.createTextNode(css));
    (d.head || d.documentElement).appendChild(tag);
  }

  function navRoot() {
    return d.querySelector("[data-hl-nav]") || d.querySelector(".hlp-nav");
  }

  /* Wrapped means "not all on the same line", which offsetTop answers exactly and
     scrollWidth does not - a flex row that has already wrapped is not overflowing. */
  function navWraps(links) {
    var top = links[0].offsetTop;
    for (var i = 1; i < links.length; i++) {
      if (Math.abs(links[i].offsetTop - top) > 2) { return true; }
    }
    return false;
  }

  function fitNav() {
    var nav = navRoot();
    if (!nav) { return; }
    var links = nav.querySelectorAll("a");
    if (links.length < 2) { return; }
    var i;

    /* MEASURE EXPANDED, ALWAYS. Measuring while collapsed reads the hidden anchors as
       zero-width, concludes they fit, expands them - and the next resize collapses
       them again. That is not a cosmetic bug, it is a loop. */
    for (i = 0; i < links.length; i++) { links[i].style.display = ""; }
    if (navSelect) { navSelect.style.display = "none"; }

    var wrapped = navWraps(links);
    nav.classList.toggle("is-collapsed", wrapped);
    if (!wrapped) { return; }

    navCss();
    if (!navSelect) {
      navSelect = d.createElement("select");
      navSelect.className = "hl-sel hl-nav-select";
      navSelect.setAttribute("data-hl-nav-select", "");
      navSelect.setAttribute("aria-label", nav.getAttribute("aria-label") || "Your home");
      navSelect.addEventListener("change", function () {
        if (this.value) { w.location.href = this.value; }
      });
      nav.appendChild(navSelect);
    }

    /* Rebuilt from the anchors every time rather than cached, because carrySelection
       has by then written ?r= onto their hrefs - and a select built once, before that,
       would quietly drop the chosen home on every tab change. */
    while (navSelect.firstChild) { navSelect.removeChild(navSelect.firstChild); }
    for (i = 0; i < links.length; i++) {
      var o = d.createElement("option");
      o.value = links[i].getAttribute("href") || "";
      o.textContent = (links[i].textContent || "").trim();
      if (links[i].className.indexOf("is-here") > -1 ||
          links[i].getAttribute("aria-current") === "page") {
        o.selected = true;
      }
      navSelect.appendChild(o);
    }

    for (i = 0; i < links.length; i++) { links[i].style.display = "none"; }
    navSelect.style.display = "block";
  }

  /* A rotate is a resize, and it is the case that matters: landscape fits three tabs
     where portrait does not. Debounced because a drag on a desktop window fires this
     continuously and each call forces a layout read. */
  var navFitTimer = null;
  function scheduleFitNav() {
    if (navFitTimer) { w.clearTimeout(navFitTimer); }
    navFitTimer = w.setTimeout(function () { navFitTimer = null; fitNav(); }, 120);
  }
  w.addEventListener("resize", scheduleFitNav);
  w.addEventListener("orientationchange", scheduleFitNav);

  /* --------------------------------------------------------------- render */

  function render() {
    if (!R) { return; }
    applyTheme(R.theme);
    d.documentElement.setAttribute(
      "data-hl-property", String(R.property_slug || "").toLowerCase().trim());

    w.HLRender.displays(d, R, function (p) {
      log("no such path on the reservation:", p, "- left as designed");
    });

    renderStages();
    renderNextStep();
    renderOtp();
    renderStepActions();
    renderCountdown();
    renderBlocked();
    renderSlides();
    renderLists();
    renderSwitcher();
    renderTopbarMenu();
    carrySelection();

    /* LAST, and that ordering is the whole point: carrySelection has just rewritten
       every portal href with ?r=, and the select is built from those hrefs. Fit the
       nav before it and the buyer loses their chosen home on the first tab change. */
    fitNav();

    /* The tab the url asked for, without a push - this IS the url already. Wiring
       comes after, so the first paint cannot race a click. */
    wireTabs();
    showTab(tabFromUrl(), false);
  }

  /* --------------------------------------------------------------- select */

  /* WHICH HOME, and the whole question exists because a buyer can hold more than one.
     Order: the URL, then what they last chose, then - only when there is nothing to
     choose between - the most recent confirmed.

     RETURNING NULL IS A REAL ANSWER, not a failure: several homes and nothing chosen
     means the buyer has not told us which one yet, and the honest response is to ask
     rather than to pick one and hope. boot() shows the index for exactly that. A page
     with no index block gets the old behaviour, so /portal-order reached cold still
     shows something - the switcher in the nav names which. */
  function pick(list) {
    if (!list.length) { return null; }
    var wanted = param("r") || stashed(STASH_R) || stashed(SEL_KEY);
    var i;
    if (wanted) {
      for (i = 0; i < list.length; i++) { if (list[i].uuid === wanted) { return list[i]; } }
      /* Named a home this member does not hold. Xano simply never returned it, so it
         is not an error to shout about - but with several homes on the account,
         silently showing a DIFFERENT one's money is how a buyer reads the wrong
         balance and believes it. Forget the stale choice and ask again. */
      warn("no reservation", wanted, "on this member");
      stash(SEL_KEY, "");
      missedSelection = wanted;
      if (list.length > 1) { return null; }
    }
    if (list.length === 1) { return list[0]; }
    if (d.querySelector("[data-hl-portal-index]")) { return null; }
    for (i = 0; i < list.length; i++) { if (list[i].status === "confirmed") { return list[i]; } }
    return list[0];
  }

  /* --------------------------------------------------------------- the index */

  /* One card per home. The Designer draws ONE card; this clones it, exactly as the
     document and add-on lists work - with one deliberate difference. fillList() forces
     target="_blank" on every anchor it finds, which is right for a document hosted
     somewhere else and wrong here: these links go to the buyer's own dashboard, and
     opening that in a new tab every time is how you end up with nine of them. */
  var indexTemplate = null;

  function indexItem(r) {
    var unit = r.unit || {};
    var left = daysLeft(r.deal_stage_due_at);
    var state = (left === null) ? "none" : (left < 0 ? "overdue" : (left <= 3 ? "due-soon" : "ok"));
    var due = "";
    if (left !== null) {
      if (left < 0) {
        due = "Overdue by " + Math.abs(left) + " day" + (Math.abs(left) === 1 ? "" : "s");
      } else if (left === 0) {
        due = "Due today";
      } else {
        due = "Due in " + left + " day" + (left === 1 ? "" : "s");
      }
    }
    return {
      key: r.uuid,
      uuid: r.uuid,
      href: "?r=" + encodeURIComponent(r.uuid),
      property_name: r.property_name || r.property_slug || "",
      property_slug: r.property_slug || "",
      unit_name: unit.display_name || unit.name || "Your home",
      unit_number: unit.unit_number || "",
      stage_label: labelOf(STAGE_LABEL, r.deal_stage),
      substage_label: labelOf(SUBSTAGE_LABEL, r.deal_sub_stage),
      status_label: labelOf(STATUS_LABEL, r.status),
      due_label: due,
      due_date: fmtDate(r.deal_stage_due_at),
      days_left: (left === null) ? "" : String(Math.max(0, left)),
      state: state,
      grand_total_cents: r.grand_total_cents,
      total_cents: r.total_cents
    };
  }

  /* Newest first is how Xano returns them, and it is the wrong order here: the home
     that needs something today should be the one at the top. Overdue, then due soon,
     then the rest, and within each the sooner deadline first. */
  var STATE_RANK = {overdue: 0, "due-soon": 1, ok: 2, none: 3};

  function indexItems() {
    var out = [];
    for (var i = 0; i < ALL.length; i++) { out.push(indexItem(ALL[i])); }
    out.sort(function (a, b) {
      var ar = STATE_RANK[a.state], br = STATE_RANK[b.state];
      if (ar !== br) { return ar - br; }
      var ad = (a.days_left === "") ? 1e9 : Number(a.days_left);
      var bd = (b.days_left === "") ? 1e9 : Number(b.days_left);
      return ad - bd;
    });
    return out;
  }

  function renderIndex() {
    var list = d.querySelector("[data-hl-index]");
    if (!list) { return 0; }

    if (!indexTemplate) {
      var proto = list.querySelector("[data-hl-index-row]");
      if (!proto) { warn("[data-hl-index] has no [data-hl-index-row] to clone"); return 0; }
      indexTemplate = proto.cloneNode(true);
    }

    var old = list.querySelectorAll("[data-hl-index-row]");
    for (var o = 0; o < old.length; o++) {
      if (old[o].parentNode) { old[o].parentNode.removeChild(old[o]); }
    }

    var items = indexItems();
    for (var i = 0; i < items.length; i++) {
      var card = indexTemplate.cloneNode(true);
      card.setAttribute("data-hl-row-key", items[i].key);
      card.setAttribute("data-hl-index-state", items[i].state);

      w.HLRender.displays(card, items[i], function (path) {
        log("no such path on an index card:", path, "- left as designed");
      });

      /* The card may BE the link, or contain one. Same tab, deliberately. */
      var link = (card.tagName === "A") ? card
               : (card.querySelector("[data-hl-index-link]") || card.querySelector("a"));
      if (link) { link.setAttribute("href", items[i].href); }

      card.style.display = "block";
      list.appendChild(card);
    }
    return items.length;
  }

  /* --------------------------------------------------- carry the choice along */

  /* THE BUG THIS EXISTS TO PREVENT. The switcher sets ?r= on the page you are on, and
     the portal's own nav links are plain hrefs written in the Designer. So a buyer
     with two homes switches to the second, clicks Documents, and lands on
     /portal-documents with no ?r= at all - which resolves to the DEFAULT home. They
     would be looking at the first home's documents under the second home's name.

     Rewriting the links is better than relying on the remembered choice alone,
     because it also survives a middle-click, a copied link and a bookmark: the URL
     itself says which home. The remembered choice stays as the fallback for a link
     this never sees. */
  function carrySelection() {
    if (!R) { return 0; }
    var links = d.querySelectorAll("a[href]");
    var n = 0;
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      /* The index and the switcher each name their own home. Rewriting those to the
         CURRENT one would make every choice a link back to where you already are. */
      if (a.closest && (a.closest("[data-hl-index]") || a.closest("[data-hl-switcher]"))) { continue; }
      var raw = a.getAttribute("href") || "";
      if (!raw || raw.charAt(0) === "#") { continue; }
      var u;
      try { u = new w.URL(a.href, w.location.href); } catch (e) { continue; }
      if (u.origin !== w.location.origin) { continue; }
      /* The portal's own pages, plus anything the Designer marks by hand. Log out and
         log in are deliberately excluded - a home is not a thing you carry out of the
         session with you. */
      var portal = u.pathname === "/portal" || u.pathname.indexOf("/portal-") === 0;
      if (u.pathname.indexOf("/portal-login") === 0) { portal = false; }
      if (!portal && !a.hasAttribute("data-hl-portal-link")) { continue; }
      u.searchParams.set("r", R.uuid);
      a.setAttribute("href", u.pathname + u.search + u.hash);
      n++;
    }
    return n;
  }

  /* --------------------------------------------------------------- lists */

  /* THE SECOND HALF OF A GUARD XANO ALREADY MAKES, and it is not redundant.
     add_reservation_document refuses anything that is not an https link, but this is
     the line that actually writes a staff-supplied string into an href on a page
     holding a live member session. A row written before that guard existed, or by any
     future path that forgets it, still cannot become a javascript: link here. The
     guard nearest the sink is the one that matters.

     A document that fails is DROPPED, not rendered link-less: a card that looks like a
     download and is not one is worse than an absence, and the console warns so the
     bad row can be found and fixed. */
  function safeUrl(u) {
    var s = String((u === null || u === undefined) ? "" : u).trim();
    if (s.toLowerCase().indexOf("https://") !== 0) { return ""; }
    if (s.indexOf(" ") !== -1) { return ""; }
    return s;
  }

  function documents() {
    var list = (R && R.documents) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var doc = list[i] || {};
      var url = safeUrl(doc.url);
      if (!url) {
        warn("document", doc.doc_type || "(no type)", "has a link this page will not render:", doc.url);
        continue;
      }
      out.push({
        key       : String(doc.doc_type || ""),
        doc_type  : String(doc.doc_type || ""),
        label     : String(doc.label || ""),
        url       : url,
        created_at: (doc.created_at === undefined) ? null : doc.created_at
      });
    }
    return out;
  }

  /* THE DEVELOPMENT'S OWN DOCUMENTS - the brochure, the schedule of finishes, the
     conduct rules, the levy schedule. A SEPARATE LIST from documents() on purpose, not
     a merge: one answers "what have I signed", the other "what am I buying into", and
     a buyer scanning a single column for their countersigned OTP should not have to
     read past the furniture sizing guide to find it.

     The same https guard, for the same reason. These urls come from the CMS rather
     than from sales, which is a different source and not a safer one - the guard
     nearest the sink is the one that matters. Xano already sends them in
     sort_order, so nothing here re-sorts: the order is the one the legacy clientzone
     page used, and it is deliberate rather than alphabetical. */
  function propertyDocuments() {
    var list = (R && R.property_documents) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var doc = list[i] || {};
      var url = safeUrl(doc.url);
      if (!url) {
        warn("property document", doc.doc_key || "(no key)",
             "has a link this page will not render:", doc.url);
        continue;
      }
      out.push({
        key    : String(doc.doc_key || ""),
        doc_key: String(doc.doc_key || ""),
        label  : String(doc.label || ""),
        url    : url
      });
    }
    return out;
  }

  /* THE PICTURES OF THE HOME, and THE SELECTION IS NOT MADE HERE. A unit type carries
     up to fifteen images - the base model, two aerials, seven upgrade combinations and
     three floor finishes - and a buyer is entitled to the ones matching the
     specification they actually bought. member_reservations_view does that matching
     and sends only those, for the same reason otp_url is withheld rather than hidden:
     a list the browser has to filter is a list the browser has already received. This
     renders what arrived and decides nothing.

     The same https guard as the documents, and for a sharper reason: an image url ends
     up in a src on a page holding a live member session, and a src is fetched without
     anybody clicking anything. */
  function gallery() {
    var list = (R && R.media && R.media.gallery) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i] || {};
      var url = safeUrl(m.url);
      if (!url) {
        warn("render", m.key || "(no key)", "has a link this page will not render:", m.url);
        continue;
      }
      out.push({
        key    : String(m.key || ""),
        label  : String(m.label || ""),
        url    : url,
        variant: String(m.variant || ""),
        alt    : String(m.label || "") + (R && R.unit && R.unit.display_name ? " - " + R.unit.display_name : "")
      });
    }
    return out;
  }

  /* THE FLOORPLANS, AS DOWNLOADS. A separate list from the gallery even though both
     arrive in media{}: a plan is a thing a buyer saves and takes to a contractor, and
     a picture is a thing they look at. Rendering them in one strip would make the
     ground-floor plan a slide somebody scrolls past. */
  function floorplans() {
    var list = (R && R.media && R.media.floorplans) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i] || {};
      var url = safeUrl(m.url);
      if (!url) {
        warn("floorplan", m.key || "(no key)", "has a link this page will not render:", m.url);
        continue;
      }
      out.push({
        key  : String(m.key || ""),
        label: String(m.label || ""),
        url  : url,
        alt  : String(m.label || "")
      });
    }
    return out;
  }

  /* THE PEOPLE ON THIS DEVELOPMENT. Static, and deliberately so for now - these are
     names, roles and faces, not a messaging system, and the legacy portal spent a
     whole page per development on exactly this content.

     AN EMPTY LIST IS THE RIGHT ANSWER when nobody is assigned. Xano sends [] rather
     than the whole company, and the empty state says who to contact instead - being
     pointed at somebody who does not know your deal is worse than being pointed at
     nobody. has_photo lets the Designer hide the avatar rather than show a broken one;
     a blank url would otherwise leave the placeholder image standing, which reads as a
     person whose picture failed to load. */
  function team() {
    var list = (R && R.team) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i] || {};
      var name = String(p.name || "").trim();
      if (!name) { continue; }
      var photo = safeUrl(p.photo);
      out.push({
        key      : name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name     : name,
        position : String(p.position || "").trim(),
        bio      : String(p.bio || "").trim(),
        photo    : photo,
        has_photo: !!photo,
        has_bio  : !!String(p.bio || "").trim()
      });
    }
    return out;
  }

  function addons() {
    var list = (R && R.addons) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i] || {};
      out.push({
        key        : String(a.slug || ""),
        slug       : String(a.slug || ""),
        name       : String(a.name || a.display_name || a.slug || ""),
        price_cents: (a.price_cents === undefined) ? null : a.price_cents
      });
    }
    return out;
  }

  /* UPGRADES AGREED AFTER THE RESERVATION. These are not the reserve-time add-ons
     above and must never be added to them: add-ons are inside total_cents, which is
     the figure the Offer to Purchase was signed at, while these were agreed weeks
     later in a conversation with sales. The page shows the signed price, these, and
     the sum of the two as three separate figures - which is what an addendum has to
     describe. Xano keeps them apart for the same reason; this is the browser holding
     the same line. */
  function extras() {
    var list = (R && R.agreed_extras) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i] || {};
      out.push({
        key        : String(e.slug || ""),
        slug       : String(e.slug || ""),
        name       : String(e.name || e.slug || ""),
        price_cents: (e.price_cents === undefined) ? null : e.price_cents,
        agreed_at  : (e.agreed_at === undefined) ? null : e.agreed_at
      });
    }
    return out;
  }

  /* The choices the buyer made in the configurator. THE LABELS ARE ALREADY IN THE
     RESERVATION - configuration carries floor_label alongside floor_slugs - so this
     page never reads the CMS. The legacy order summary rendered the entire catalogue
     and then hid every item whose slug the buyer did not hold; this renders the
     handful they did choose.

     A choice of "None" is not a line. Printing "Energy: None" fills a summary with
     things the buyer did not buy. */
  var SPEC_CHOICES = [
    ["floor_label", "Flooring"],
    ["outdoor_label", "Outdoor"],
    ["solar_label", "Energy"],
    ["appliance_label", "Appliances"],
    ["furniture_label", "Furniture"]
  ];

  /* Yes/No upgrades, shown ONLY when the answer is yes, for the same reason. */
  var SPEC_FLAGS = [
    ["garage_upgrade", "Garage upgrade"],
    ["pool_upgrade", "Pool"],
    ["fireplace_upgrade", "Fireplace"]
  ];

  function spec() {
    var c = (R && R.configuration) || {};
    var out = [];
    var i, v;
    for (i = 0; i < SPEC_CHOICES.length; i++) {
      v = String(c[SPEC_CHOICES[i][0]] === undefined ? "" : c[SPEC_CHOICES[i][0]]).trim();
      if (!v || v.toLowerCase() === "none") { continue; }
      out.push({key: SPEC_CHOICES[i][0], label: SPEC_CHOICES[i][1], value: v});
    }
    for (i = 0; i < SPEC_FLAGS.length; i++) {
      v = String(c[SPEC_FLAGS[i][0]] === undefined ? "" : c[SPEC_FLAGS[i][0]]).trim();
      if (v.toLowerCase() !== "yes") { continue; }
      out.push({key: SPEC_FLAGS[i][0], label: SPEC_FLAGS[i][1], value: "Included"});
    }
    return out;
  }

  /* The template is captured before the first render and kept by identity rather than
     written onto the element, so nothing this script does shows up in the Designer. */
  var rowTemplates = [];

  function templateOf(list) {
    for (var i = 0; i < rowTemplates.length; i++) {
      if (rowTemplates[i][0] === list) { return rowTemplates[i][1]; }
    }
    var row = list.querySelector("[data-hl-row]");
    if (!row) { return null; }
    var tpl = row.cloneNode(true);
    rowTemplates.push([list, tpl]);
    return tpl;
  }

  function fillList(list, items) {
    var tpl = templateOf(list);
    if (!tpl) {
      warn("a list has no [data-hl-row] to clone:", list.getAttribute("data-hl-list"));
      return;
    }

    var old = list.querySelectorAll("[data-hl-row]");
    for (var o = 0; o < old.length; o++) {
      if (old[o].parentNode) { old[o].parentNode.removeChild(old[o]); }
    }

    for (var i = 0; i < items.length; i++) {
      var row = tpl.cloneNode(true);
      row.setAttribute("data-hl-row-key", String(items[i].key || ""));

      /* The ordinary contract, scoped to one item rather than the reservation. */
      w.HLRender.displays(row, items[i], function (p) {
        log("no such path on a list item:", p, "- left as designed");
      });

      /* Every link out of the portal opens away from the session and cannot reach
         back through window.opener. Applied to whatever anchors a row happens to
         carry, so a restyled row cannot lose the hardening. */
      var found = row.querySelectorAll("a");
      var links = (row.tagName === "A") ? [row] : [];
      for (var L = 0; L < found.length; L++) { links.push(found[L]); }
      for (var a = 0; a < links.length; a++) {
        links[a].setAttribute("target", "_blank");
        links[a].setAttribute("rel", "noopener noreferrer");
      }

      row.style.display = "block";
      list.appendChild(row);
    }
  }

  function renderList(name, items) {
    var lists = d.querySelectorAll("[data-hl-list=\"" + name + "\"]");
    var empties = d.querySelectorAll("[data-hl-empty=\"" + name + "\"]");
    if (!lists.length && !empties.length) { return; }

    for (var i = 0; i < lists.length; i++) { fillList(lists[i], items); }
    for (var e = 0; e < empties.length; e++) {
      empties[e].style.display = items.length ? "none" : "block";
    }
  }

  function renderLists() {
    renderList("documents", documents());
    renderList("property-documents", propertyDocuments());
    renderList("gallery", gallery());
    renderList("floorplans", floorplans());
    renderList("team", team());
    renderList("addons", addons());
    renderList("extras", extras());
    renderList("spec", spec());
  }

  /* --------------------------------------------------------------- boot */

  /* Where an unauthenticated visitor is sent. Markup decides, so a second portal
     (a different property, a staging copy) does not need a second bundle. */
  function loginPath() {
    var root = d.querySelector("[data-hl-portal]");
    var p = root && root.getAttribute("data-hl-login");
    p = (p === null || p === undefined) ? "" : String(p).trim();
    return p || "/portal-login";
  }

  var BOUNCE = "hl_portal_bounce";
  var STASH_R = "hl_portal_r";
  /* The chosen home, remembered for this browser tab only. sessionStorage rather than
     localStorage on purpose: a shared machine must not hand the next person's tab a
     home to open, and the URL is the durable record anyway. */
  var SEL_KEY = "hl_portal_sel";

  /* Set when the URL named a home this member does not hold, so the page can say so
     instead of quietly showing a different one. */
  var missedSelection = "";

  function stashed(k) {
    try { return w.sessionStorage.getItem(k) || ""; } catch (e) { return ""; }
  }
  function stash(k, v) {
    try { if (v) { w.sessionStorage.setItem(k, v); } else { w.sessionStorage.removeItem(k); } } catch (e) {}
  }

  /* No Memberstack cookie: there is nothing on this page to show and nothing more
     useful to say than the login form, so go there. ONE bounce only - if login
     returns them here still without a cookie, something is wrong with the session
     and a redirect loop would hide that from everyone, including us. */
  function toLogin() {
    if (stashed(BOUNCE)) {
      stash(BOUNCE, "");
      fail("Please log in to see your home.");
      return;
    }
    stash(BOUNCE, "1");
    /* The reservation they asked for survives the round trip; Memberstack sends
       them back to a bare /portal with no query string of ours. */
    stash(STASH_R, param("r"));
    w.location.replace(loginPath());
  }

  function fail(msg) {
    show("[data-hl-portal-loading]", false);
    show("[data-hl-portal-body]", false);
    show("[data-hl-portal-empty]", true);
    var els = d.querySelectorAll("[data-hl-portal-message]");
    for (var i = 0; i < els.length; i++) { els[i].textContent = msg; }
    warn(msg);
  }

  /* Re-read without re-authenticating. Sales change a stage or attach a document
     while the buyer has the page open; this is how the page catches up without
     spending the Memberstack exchange again. */
  function refresh() {
    if (!TOKEN) { return Promise.resolve(null); }
    return fetch(BASE + "/member/reservations", {
      headers: { Authorization: "Bearer " + TOKEN }
    })
      .then(readJson)
      .then(function (res) {
        var list = (res && res.reservations) || [];
        if (!list.length) { return null; }
        ALL = list;
        var keep = R && R.uuid;
        R = null;
        for (var i = 0; i < ALL.length; i++) { if (ALL[i].uuid === keep) { R = ALL[i]; } }
        if (!R) { R = pick(ALL); }
        render();
        return R;
      })
      .catch(function (e) { warn("refresh failed:", e && e.message); return null; });
  }

  /* The index and the dashboard are alternatives, never both. Shown with an explicit
     value rather than by clearing one, so a block the Designer hid stays hidden until
     this says otherwise. */
  function showIndex(on) {
    show("[data-hl-portal-index]", on);
    if (on) { show("[data-hl-portal-body]", false); }
  }

  function noticeMissed() {
    if (!missedSelection) { return; }
    var els = d.querySelectorAll("[data-hl-portal-notice]");
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = "That link is for a home that is not on your account. Choose one below.";
      els[i].style.display = "block";
    }
  }

  /* THE WAY OUT HAS TO AGREE WITH THE WAY IN. The empty state carries a Log in
     button, and it was pointing at /log-in - the LEGACY clientzone login, which signs
     a member in and drops them on the old dashboard. A member who lands here and
     presses it is sent somewhere this portal will never bring them back from.
     One source of truth: data-hl-login on the portal root, read by loginPath(). */
  function fixLoginLinks() {
    var els = d.querySelectorAll("[data-hl-login-link]");
    for (var i = 0; i < els.length; i++) { els[i].setAttribute("href", loginPath()); }
    return els.length;
  }

  function boot() {
    if (!d.querySelector("[data-hl-portal]")) { return; }

    fixLoginLinks();
    /* Built at boot rather than in render(), because the navbar is on screen before
       any reservation is - and a member with no reservations at all still needs the
       way out of the page. It is idempotent, so render() calling it again is free. */
    renderTopbarMenu();
    show("[data-hl-portal-loading]", true);
    show("[data-hl-portal-body]", false);
    show("[data-hl-portal-empty]", false);
    show("[data-hl-portal-index]", false);

    w.HLPortal = {
      all: function () { return ALL; },
      tabRedirectTarget: tabRedirectTarget,
      get: function () { return R; },
      select: function (uuid) {
        for (var i = 0; i < ALL.length; i++) {
          if (ALL[i].uuid === uuid) {
            R = ALL[i];
            stash(SEL_KEY, R.uuid);
            showIndex(false);
            render();
            return R;
          }
        }
        return null;
      },
      indexItems: indexItems,
      carrySelection: carrySelection,
      slides: function () { return slidesFor(R); },
      nextStep: renderNextStep,
      signedOtp: signedOtp,
      stepActions: stepActions,
      blocked: function () { return !!(R && R.is_blocked); },
      missed: function () { return missedSelection; },
      daysLeft: daysLeft,
      breakUp: breakUp,
      clockRunning: function () { return !!cdTimer; },
      fitNav: fitNav,
      shortLabel: shortLabel,
      showTab: showTab,
      tab: function () { return currentTab; },
      offset: function () { return clockOffset; },
      loginPath: loginPath,
      memberToken: memberToken,
      documents: documents,
      propertyDocuments: propertyDocuments,
      addons: addons,
      extras: extras,
      spec: spec,
      refresh: refresh,
      render: render
    };

    /* AFTER the debug surface, BEFORE the network. A page that is only a signpost has
       no reason to authenticate or spend a round trip before forwarding - but it still
       gets HLPortal, for the same reason the flow module exposes its handle before the
       uuid check: the debug handle must exist in exactly the situation you reach for
       it, which is a page that did something you did not expect. */
    if (tabRedirect()) { return; }

    /* THE TABS ARE SETTLED BEFORE THE FETCH, not after it. Which tab is open is a
       question the url answers on its own - it needs no reservation - and hiding the
       inactive panels here rather than in render() means they are never stacked, even
       for the moment before data arrives and even if some future path shows the body
       without rendering. render() calls it again, which is free and re-marks the links
       after carrySelection has rewritten their hrefs.

       Found by looking at the live page rather than at the tests: signed out, the body
       stays hidden so nobody could SEE the three panels stacked - but they were, and a
       correctness that depends on something else being hidden is not one. */
    wireTabs();
    showTab(tabFromUrl(), false);


    var ms = memberToken();
    if (!ms) {
      toLogin();
      return;
    }

    fetch(BASE + "/auth/memberstack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: ms })
    })
      .then(readJson)
      .then(function (a) {
        var tok = a && (a.authToken || a.token || a.auth_token);
        if (!tok) { throw new Error("no token in the auth response"); }
        TOKEN = tok;

        /* THE EXCHANGE NOW CARRIES THE RESERVATIONS. It used to hand back a token and
           this page immediately spent it on a second call - two sequential round trips
           from South Africa before a buyer saw anything, on every portal page, with no
           decision taken in between.

           The fallback is not defensive padding: the browser and Xano deploy
           independently, so a bundle that assumed the new shape would break the portal
           for as long as an older Xano was live. An array - even an empty one - means
           the new shape; anything else means make the old call. */
        if (Object.prototype.toString.call(a.reservations) === "[object Array]") {
          log("reservations came with the token - one round trip");
          return a;
        }
        log("older Xano: fetching reservations separately");
        return fetch(BASE + "/member/reservations", {
          headers: { Authorization: "Bearer " + tok }
        }).then(readJson);
      })
      .then(function (res) {
        /* The device clock is not trusted for anything with a deadline on it. */
        if (res && res.server_time) {
          var st = Number(res.server_time);
          if (isFinite(st)) { clockOffset = st - Date.now(); }
        }

        /* Authenticated. The bounce guard has done its job; clear it so a later
           logout can bounce again. The stashed uuid is consumed by pick() below. */
        stash(BOUNCE, "");
        ALL = (res && res.reservations) || [];
        log("member holds", ALL.length, "reservation(s); clock offset", clockOffset, "ms");

        if (!ALL.length) {
          show("[data-hl-portal-loading]", false);
          show("[data-hl-portal-empty]", true);
          return;
        }

        R = pick(ALL);
        stash(STASH_R, "");
        show("[data-hl-portal-loading]", false);

        if (!R) {
          /* Several homes and none chosen. Ask. */
          log("no home chosen and", ALL.length, "to choose from - showing the index");
          showIndex(true);
          renderIndex();
          noticeMissed();
          return;
        }

        stash(SEL_KEY, R.uuid);
        showIndex(false);
        show("[data-hl-portal-body]", true);
        noticeMissed();
        render();
      })
      .catch(function (e) {
        fail("We could not load your home just now. Please refresh, or log in again.");
        warn(e && e.message);
      });
  }

  if (d.readyState === "loading") { d.addEventListener("DOMContentLoaded", boot); } else { boot(); }
})(window, document);
