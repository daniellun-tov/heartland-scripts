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
  var TARGET = "/reserve-v2";
  var LEGACY = "https://www.heartland.co.za/reserve/1";
  var PROPERTY = "sanford";
  var UUID_KEY = "hl_v2_uuid";
  var UNIT_KEY = "hl_v2_unit";

  /* The server reads two pages of the CMS collection before it can answer, which
     measures at a little over a second. 8s is generous on purpose: the cost of waiting
     is a slow page transition, and the cost of giving up early is dropping a buyer
     back into the flimsy flow this whole exercise exists to replace. */
  var CREATE_TIMEOUT_MS = 8000;

  /* A value long enough to be prose, or carrying an @, is not a unit identifier - it
     is the buyer's address or email. Dropping those keeps the payload small and keeps
     contact details out of a request that has no use for them. Nothing that could
     identify a unit is short of this bar: ids, slugs, names and numbers are all tiny. */
  var MAX_VALUE_LEN = 64;

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
     job now, and every browser-side opinion so far has been wrong. */
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
          if (s !== "" && s.length <= MAX_VALUE_LEN && s.indexOf("@") === -1) {
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
