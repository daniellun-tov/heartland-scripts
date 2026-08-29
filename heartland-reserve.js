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

  function createFrom(pairs, dryRun) {
    return fetch(BASE + "/public/reservations/from-form", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        property_slug: PROPERTY,
        pairs: pairs,
        dry_run: dryRun === true,
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

     data-hl="unit.name"               the same contract as the reserve flow
     data-hl-stage="reserve"           tracker step, gets .is-active / .is-done
     data-hl-substage="sign-otp"       finance sub-step, same classes
     data-hl-route="bond"              shown only to that kind of buyer
     data-hl-countdown                 whole days left, or 0
     data-hl-countdown-state           set to ok | due-soon | overdue | none
     data-hl-due                       the deadline, as a date

   LISTS - one renderer, three lists. The Designer draws ONE row; the script clones
   it per item and removes the original, so a list can be restyled and rearranged
   without touching this file.
     [data-hl-list="documents"]        the buyer's own documents
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

   WHICH RESERVATION. ?r=<uuid> names one. Otherwise the most recent CONFIRMED, and
   failing that the most recent of any kind - a buyer whose payment has not cleared
   still has something to look at.
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

  /* Memberstack keeps the member token in a cookie. Read it directly rather than
     waiting on $memberstackDom: the package may not have finished loading, and this
     page has nothing to show until the exchange has happened. */
  function memberToken() {
    var name = "_ms-mid=";
    var parts = String(d.cookie || "").split(";");
    for (var i = 0; i < parts.length; i++) {
      var c = parts[i].trim();
      if (c.indexOf(name) === 0) { return decodeURIComponent(c.slice(name.length)); }
    }
    return "";
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

  function renderStages() {
    markProgress("[data-hl-stage]", "data-hl-stage", STAGES, R && R.deal_stage);
    markProgress("[data-hl-substage]", "data-hl-substage",
                 SUBSTAGES[routeOf(R)], R && R.deal_sub_stage);

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

  function renderCountdown() {
    var left = R ? daysLeft(R.deal_stage_due_at) : null;
    var state = (left === null) ? "none" : (left < 0 ? "overdue" : (left <= 3 ? "due-soon" : "ok"));

    var els = d.querySelectorAll("[data-hl-countdown]");
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = (left === null) ? "" : String(Math.max(0, left));
      els[i].setAttribute("data-hl-countdown-state", state);
      els[i].classList.toggle("is-overdue", state === "overdue");
      els[i].classList.toggle("is-due-soon", state === "due-soon");
    }

    var dues = d.querySelectorAll("[data-hl-due]");
    for (var j = 0; j < dues.length; j++) {
      dues[j].textContent = R ? fmtDate(R.deal_stage_due_at) : "";
    }

    var wraps = d.querySelectorAll("[data-hl-countdown-wrap]");
    for (var k = 0; k < wraps.length; k++) {
      wraps[k].style.display = (left === null) ? "none" : "block";
    }
  }

  /* --------------------------------------------------------------- switcher */

  function renderSwitcher() {
    var wrap = d.querySelector("[data-hl-switcher]");
    var list = d.querySelector("[data-hl-switcher-list]");
    if (!wrap || !list) { return; }
    if (ALL.length < 2) { wrap.style.display = "none"; return; }

    wrap.style.display = "block";
    while (list.firstChild) { list.removeChild(list.firstChild); }

    for (var i = 0; i < ALL.length; i++) {
      var r = ALL[i];
      var a = d.createElement("a");
      a.setAttribute("href", "?r=" + encodeURIComponent(r.uuid));
      a.setAttribute("data-hl-switcher-item", r.uuid);
      a.className = "hl-switch-item" + (R && r.uuid === R.uuid ? " is-current" : "");
      var unitName = (r.unit && (r.unit.display_name || r.unit.name)) || "Your home";
      a.textContent = (r.property_name || r.property_slug || "") + " — " + unitName;
      list.appendChild(a);
    }
  }

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
    renderCountdown();
    renderLists();
    renderSwitcher();
  }

  /* --------------------------------------------------------------- select */

  function pick(list) {
    if (!list.length) { return null; }
    var wanted = param("r") || stashed(STASH_R);
    var i;
    if (wanted) {
      for (i = 0; i < list.length; i++) { if (list[i].uuid === wanted) { return list[i]; } }
      /* Named a reservation this member does not hold. Not an error to shout about -
         Xano simply never returned it - but do not silently show them a different
         deal as though it were the one they asked for. */
      warn("no reservation", wanted, "on this member - falling back to the most recent");
    }
    for (i = 0; i < list.length; i++) { if (list[i].status === "confirmed") { return list[i]; } }
    return list[0];
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

  function boot() {
    if (!d.querySelector("[data-hl-portal]")) { return; }

    show("[data-hl-portal-loading]", true);
    show("[data-hl-portal-body]", false);
    show("[data-hl-portal-empty]", false);

    w.HLPortal = {
      all: function () { return ALL; },
      get: function () { return R; },
      select: function (uuid) {
        for (var i = 0; i < ALL.length; i++) {
          if (ALL[i].uuid === uuid) { R = ALL[i]; render(); return R; }
        }
        return null;
      },
      daysLeft: daysLeft,
      offset: function () { return clockOffset; },
      loginPath: loginPath,
      documents: documents,
      addons: addons,
      extras: extras,
      spec: spec,
      refresh: refresh,
      render: render
    };

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
        show("[data-hl-portal-body]", true);
        render();
      })
      .catch(function (e) {
        fail("We could not load your home just now. Please refresh, or log in again.");
        warn(e && e.message);
      });
  }

  if (d.readyState === "loading") { d.addEventListener("DOMContentLoaded", boot); } else { boot(); }
})(window, document);
