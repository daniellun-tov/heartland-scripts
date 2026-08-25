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

  function addressSuggest(term, opts) {
    opts = opts || {};
    var q = String(term || "").trim();
    if (q.length < 4) { return Promise.resolve([]); }
    var url = PHOTON + "?q=" + encodeURIComponent(q) + "&limit=5&lang=en";
    if (opts.lat && opts.lon) { url += "&lat=" + opts.lat + "&lon=" + opts.lon; }
    return fetch(url, { signal: opts.signal })
      .then(function (r) { return r.ok ? r.json() : { features: [] }; })
      .then(function (j) { return ((j && j.features) || []).map(formatFeature); })
      .catch(function () { return []; });   // never surfaces to the buyer
  }

  function formatFeature(f) {
    var p = (f && f.properties) || {};
    var line = [
      [p.housenumber, p.street || p.name].filter(Boolean).join(" "),
      p.district,
      p.city,
      p.postcode,
      p.country
    ].filter(Boolean).join(", ");
    return { label: line, raw: p };
  }

  w.HLBuyer = {
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

  function handleSubmit(e) {
    var form = e.target;
    if (!form || form.id !== "reservation-form") { return; }

    var legacy = legacyUrl(form);
    if (FORCE_LEGACY) { log("hl_legacy=1"); return; }   // let their handler run untouched

    var pairs = pairsFrom(form);

    // From here we own the navigation, so every path below must end in exactly one.
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) { e.stopImmediatePropagation(); }

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

  /* Exact match on the canonical slug, never a substring test - trap 8. Polaris is
     live and selling through the legacy path; this must be unable to write against
     it, not merely absent from the pages its buyers use. */
  var ALLOWED_PROPERTIES = ["sanford"];

  /* THE ONLY FIELDS THIS PAGE MAY WRITE. A data-hl-field naming anything else is
     refused and logged rather than sent. Without this a typo in the Designer would
     silently PATCH a key Xano ignores, and the buyer's detail would vanish with no
     error anywhere. Note what is absent: every price, every total, every id. */
  var WRITABLE = [
    "first_name", "last_name", "email", "phone", "work_phone",
    "dob", "nationality", "address", "id_number", "buyer_type", "payer_route"
  ];

  var STEPS = ["unit", "details", "pay", "done"];

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
    for (var i = 0; i < ALLOWED_PROPERTIES.length; i++) {
      if (String(ALLOWED_PROPERTIES[i]).toLowerCase().trim() === s) { return true; }
    }
    return false;
  }

  /* --------------------------------------------------------------- formatting */

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

  var MISSING = {};   // a sentinel, so a legitimately null value is not mistaken for absence

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
    if (v === null || v === undefined || v === "") { return "—"; }
    if (/_cents$/.test(p)) { return money(v); }
    return String(v);
  }

  /* --------------------------------------------------------------- state */

  var R = null;          // the reservation, exactly as Xano returned it
  var step = "unit";
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
    }
    if (msg) { (bad ? warn : log)(msg); }
  }

  /* --------------------------------------------------------------- render */

  function renderDisplays() {
    var els = d.querySelectorAll("[data-hl]");
    for (var i = 0; i < els.length; i++) {
      var p = els[i].getAttribute("data-hl");
      var v = path(R, p);
      if (v === MISSING) {
        log("no such path in the reservation:", p, "- left as designed");
        continue;                       // leave the Designer's own copy in place
      }
      els[i].textContent = display(p, v);
    }

    var attrs = d.querySelectorAll("[data-hl-attr]");
    for (var j = 0; j < attrs.length; j++) {
      var spec = String(attrs[j].getAttribute("data-hl-attr") || "");
      var colon = spec.indexOf(":");
      if (colon < 1) { warn("data-hl-attr should read name:path, got", spec); continue; }
      var name = spec.slice(0, colon).trim();
      var vp = spec.slice(colon + 1).trim();
      var av = path(R, vp);
      if (av === MISSING || av === null || av === "") { continue; }
      attrs[j].setAttribute(name, String(av));
    }

    toggle("[data-hl-show]", "data-hl-show", true);
    toggle("[data-hl-hide]", "data-hl-hide", false);
  }

  function toggle(sel, attr, showWhenTruthy) {
    var els = d.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) {
      var v = path(R, els[i].getAttribute(attr));
      var truthy = !(v === MISSING || v === null || v === undefined || v === "" || v === false);
      els[i].style.display = (truthy === showWhenTruthy) ? "" : "none";
    }
  }

  function renderInputs() {
    var els = d.querySelectorAll("[data-hl-field]");
    for (var i = 0; i < els.length; i++) {
      var f = els[i].getAttribute("data-hl-field");
      if (WRITABLE.indexOf(f) === -1) { continue; }
      var v = R && R[f];
      if (v === null || v === undefined) { v = ""; }
      // Do not clobber what the buyer is currently typing.
      if (d.activeElement === els[i]) { continue; }
      els[i].value = String(v);
    }
  }

  function renderStep() {
    var secs = d.querySelectorAll("[data-hl-step]");
    for (var i = 0; i < secs.length; i++) {
      secs[i].style.display = (secs[i].getAttribute("data-hl-step") === step) ? "" : "none";
    }
    var prog = d.querySelectorAll("[data-hl-progress]");
    var at = STEPS.indexOf(step);
    for (var j = 0; j < prog.length; j++) {
      var mine = STEPS.indexOf(prog[j].getAttribute("data-hl-progress"));
      prog[j].classList.toggle("is-active", mine === at);
      prog[j].classList.toggle("is-done", mine > -1 && mine < at);
    }
  }

  function render() {
    if (!R) { return; }
    renderDisplays();
    renderInputs();
    renderStep();
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

  function checkout() {
    if (!R || coBusy) { return; }
    coBusy = true;
    status("Preparing payment…");
    api.post("/public/reservations/" + encodeURIComponent(R.uuid) + "/checkout", {})
      .then(function (res) {
        CO = res;
        var problems = checkoutProblems(CO, R.uuid);
        if (problems.length) {
          status("Payment could not be prepared. " + problems.join("; "), true);
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
        form.submit();
      })
      .catch(function (e) { status("Could not start payment: " + e.message, true); })
      .then(function () { coBusy = false; });
  }

  var lastNav = "";

  /* --------------------------------------------------------------- steps */

  function go(next) {
    if (STEPS.indexOf(next) === -1) { warn("unknown step", next); return; }
    step = next;
    renderStep();
    status("");
  }

  function advance(next) {
    var missing = missingRequired();
    if (missing.length) {
      status("Please complete: " + missing.join(", "), true);
      var first = currentScope().querySelector('[data-hl-field="' + missing[0] + '"]');
      if (first && first.focus) { first.focus(); }
      return;
    }
    /* ONE write per navigation. Confirming is what locks the OTP, so that write must
       carry the buyer's final values - including an edit still inside the debounce
       window. collect() reads the live DOM, so cancelling the pending timer and
       saving immediately is exactly equivalent, and avoids the back-to-back pair of
       PATCHes an earlier version sent. */
    flush();
    save(next === "pay").then(function () { go(next); });
  }

  /* --------------------------------------------------------------- load */

  function load(uuid) {
    return api.get("/public/reservations/" + encodeURIComponent(uuid))
      .then(function (res) {
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

        render();
        return R;
      })
      .catch(function (e) { status("Could not load your reservation: " + e.message, true); return null; });
  }

  function bind() {
    d.addEventListener("input", function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-hl-field")) { queueSave(); }
    }, true);
    d.addEventListener("change", function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-hl-field")) { queueSave(); }
    }, true);

    d.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== d.body) {
        if (t.getAttribute) {
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
      money: money
    };

    var uuid = param("r") || stored(UUID_KEY);
    if (!uuid) {
      status("We could not find your reservation. Please start again from the property page.", true);
      return;
    }
    load(uuid).then(function (r) {
      if (!r) { return; }
      // Resume where they left off.
      var ls = String(r.last_step || "").toLowerCase();
      if (ls === "confirm" || ls === "activate") { go("pay"); }
      else if (ls === "details") { go("details"); }
      else { go("unit"); }
    });

    log("ready");
  }

  if (d.readyState === "loading") { d.addEventListener("DOMContentLoaded", boot); } else { boot(); }
})(window, document);
