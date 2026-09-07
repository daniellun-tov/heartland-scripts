/* ============================================================================
   HEARTLAND - stage F. The uuid-carrier reserve flow, test harness.

   WHAT THIS PROVES, end to end, against real Xano:
     POST /public/reservations        -> a draft, unit pricing frozen into unit_snapshot
     GET  /public/reservations/{uuid} -> the page renders from that snapshot
     PATCH                            -> buyer details, add-ons priced from the catalogue
     PATCH last_step=confirm          -> the OTP url is built, then LOCKED

   It replaces the URL-param + Finsweet-filter handoff: the only thing that
   travels between steps is the uuid.

   IT IS A HARNESS, NOT THE PRODUCT. It draws its own panel so a run does not
   depend on the duplicate page's layout being right. The real pages will render
   into their own Webflow elements from exactly the same responses.

   SANFORD ONLY. Same allowlist as the bridge, same reasoning: Polaris is live
   and selling through the legacy path, so this must be unable to write against
   it - not merely absent from the pages Polaris buyers use.
   ========================================================================== */
(function (w, d) {
  "use strict";

  var BASE = "https://x7aj-untn-pq4t.n7e.xano.io/api:i0YhKPAV";
  var UUID_KEY = "hl_v2_uuid";

  // Exact match on the canonical slug, never a substring test - trap 8.
  var ALLOWED_PROPERTIES = ["sanford"];
  function propertyEnabled(slug) {
    if (!slug) { return false; }
    var s = String(slug).toLowerCase().trim();
    for (var i = 0; i < ALLOWED_PROPERTIES.length; i++) {
      if (String(ALLOWED_PROPERTIES[i]).toLowerCase().trim() === s) { return true; }
    }
    return false;
  }

  /* The Sanford units, read from the Webflow CMS on 24 Aug. Hardcoded ONLY because
     this is a harness and there is no public endpoint that lists units yet. The real
     entry point is the property page, where each unit element already knows its own
     CMS item id - nothing will need a list like this. */
  var UNITS = [
    { id: "69ff23e1a8c32616152cb816", name: "Home 1", price: "R6,595,000" },
    { id: "69ff23e1a8c32616152cb818", name: "Home 2", price: "R3,595,000" },
    { id: "69ff23e1a8c32616152cb81a", name: "Home 3", price: "R3,595,000" },
    { id: "69ff23e1a8c32616152cb81c", name: "Home 4", price: "R3,595,000" },
    { id: "69ff23e1a8c32616152cb81e", name: "Home 5", price: "R3,595,000" },
    { id: "69ff23e1a8c32616152cb820", name: "Home 6", price: "R3,595,000" },
    { id: "69ff23e1a8c32616152cb822", name: "Home 7", price: "R3,595,000" }
  ];

  /* A short list, not a full ISO set: the real details page uses a country-picker
     library and this harness only needs enough to exercise the required gate. */
  var NATIONALITIES = [
    "South African", "Botswana", "British", "Chinese", "German", "Indian",
    "Mozambican", "Namibian", "Nigerian", "Portuguese", "Zimbabwean", "Other"
  ];

  /* ac = the native autocomplete token. These are what let the BROWSER offer the
     buyer their own saved details - no service, no cost, no dependency. The live
     details page carries none of them today, which is the whole reason its address
     field never autofills. */
  var FIELDS = [
    { k: "buyer_type",  l: "Buyer type",              t: "select", opts: ["Individual", "Company", "Trust"] },
    { k: "first_name",  l: "First name",              t: "text",  ac: "given-name" },
    { k: "last_name",   l: "Last name",               t: "text",  ac: "family-name" },
    { k: "email",       l: "Email",                   t: "email", ac: "email" },
    { k: "phone",       l: "Mobile",                  t: "tel",   ac: "tel" },
    { k: "work_phone",  l: "Work phone",              t: "tel",   ac: "tel-national" },
    { k: "id_number",   l: "ID / registration number", t: "text" },
    { k: "dob",         l: "Date of birth",           t: "date",  ac: "bday" },
    { k: "nationality", l: "Nationality",             t: "select", opts: NATIONALITIES, req: true },
    { k: "address",     l: "Address",                 t: "text",  ac: "street-address" }
  ];
  var REQUIRED_TO_CONFIRM = ["nationality"];

  /* ------------------------------------------------------------------- api */
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

  function stored(k) { try { return w.localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function store(k, v) { try { w.localStorage.setItem(k, v); } catch (e) {} }
  function drop(k) { try { w.localStorage.removeItem(k); } catch (e) {} }

  function esc(v) {
    return String(v === null || v === undefined ? "" : v)
      .split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;")
      .split('"').join("&quot;");
  }
  function rands(c) {
    if (c === null || c === undefined) { return "—"; }
    var n = Math.round(Number(c) || 0) / 100;
    return "R" + n.toFixed(2).split(".")[0].replace(/\B(?=([0-9]{3})+(?![0-9]))/g, ",");
  }
  function param(k) {
    var m = new RegExp("[?&]" + k + "=([^&]*)").exec(w.location.search);
    return m ? decodeURIComponent(m[1]) : "";
  }

  /* --------------------------------------------------------------- shadow */
  var host = d.createElement("div");
  host.id = "hl-v2-host";
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    "<style>" +
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
    ".p{position:fixed;top:44px;right:16px;bottom:16px;width:min(430px,calc(100% - 32px));" +
      "background:#fff;border:1px solid #d9d9de;border-radius:12px;padding:16px;overflow-y:auto;" +
      "z-index:99998;box-shadow:0 8px 30px rgba(0,0,0,.12);font-size:13px;color:#1a1a1f}" +
    "h2{font-size:13px;margin:0 0 10px;letter-spacing:.02em;text-transform:uppercase;color:#6b6b76}" +
    "h3{font-size:13px;margin:18px 0 8px}" +
    "label{display:block;font-size:11px;color:#6b6b76;margin:8px 0 3px}" +
    "input,select{width:100%;padding:7px 9px;border:1px solid #d9d9de;border-radius:6px;font-size:13px}" +
    "button{padding:8px 12px;border:1px solid #1a1a1f;background:#1a1a1f;color:#fff;" +
      "border-radius:6px;font-size:13px;cursor:pointer;margin-top:10px}" +
    "button.ghost{background:#fff;color:#1a1a1f}" +
    "button:disabled{opacity:.45;cursor:not-allowed}" +
    ".row{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px;margin:2px 0}" +
    ".row span:first-child{color:#6b6b76}" +
    ".mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;word-break:break-all}" +
    ".ok{color:#0a7a3d}.bad{color:#b00020}.mut{color:#6b6b76}" +
    ".log{border-top:1px solid #ececed;margin-top:14px;padding-top:10px;font-size:11px}" +
    ".log div{padding:2px 0;border-bottom:1px solid #f4f4f5}" +
    /* THE HOLD BAR LIVES OUTSIDE #body ON PURPOSE. renderReservation() replaces #body
       wholesale, and HLHold keeps a reference to the element it writes into - so a bar drawn
       inside it would be destroyed on the next render and the countdown would tick on into a
       node that is no longer on the page, showing a frozen number. Its own node, written
       once, survives every re-render. */
    ".hold{display:none;align-items:center;gap:10px;margin:0 0 10px;padding:8px 10px;" +
      "border:1px solid #d9d9de;border-radius:8px;background:#fafafa;font-size:12px}" +
    ".hold.on{display:flex}" +
    ".hold-lbl{color:#6b6b76;text-transform:uppercase;font-size:10px;letter-spacing:.06em}" +
    ".hold-t{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;" +
      "font-variant-numeric:tabular-nums;color:#1a1a1f}" +
    ".hold-t.is-urgent{color:#b26a00}" +
    ".hold-t.is-expired{color:#b00020}" +
    ".hold-note{color:#6b6b76}" +
    "</style>" +
    '<div class="p">' +
      "<h2>Reserve v2 — uuid flow harness</h2>" +
      '<div class="hold" id="holdBar">' +
        '<span class="hold-lbl">Held for</span>' +
        '<span class="hold-t" id="holdT">--:--</span>' +
        '<span class="hold-note" id="holdNote"></span>' +
      "</div>" +
      '<div id="body"></div>' +
      '<div class="log"><div class="mut">Activity</div><div id="log"></div></div>' +
    "</div>";
  var $ = function (id) { return root.getElementById(id); };

  function log(msg, cls) {
    var e = d.createElement("div");
    e.className = cls || "";
    e.textContent = msg;
    var box = $("log");
    if (box) { box.insertBefore(e, box.firstChild); }
    if (w.console) { console.log("[hl-v2]", msg); }
  }

  /* --------------------------------------------------------------- render */
  var R = null;   // the current reservation, exactly as Xano returned it

  function renderPicker() {
    $("body").innerHTML =
      '<div class="mut">No reservation yet. Pick a Sanford unit to create a draft.</div>' +
      '<label for="u">Unit</label><select id="u">' +
        UNITS.map(function (x) {
          return '<option value="' + esc(x.id) + '">' + esc(x.name) + " — " + esc(x.price) + "</option>";
        }).join("") +
      "</select>" +
      '<button id="go">Create draft</button>' +
      '<div class="mut" style="margin-top:8px;font-size:11px">Nothing is charged and no Webflow form is submitted.</div>';
    $("go").addEventListener("click", function () {
      createDraft($("u").value);
    });
  }

  /* Has the buyer moved past the details step?

     This MIRRORS the server's rule (the OTP LOCK block in update_reservation) and is
     used for one thing only: deciding what this panel offers. The server is the
     enforcement point - it refuses a checkout in the wrong state whatever this says -
     so a disagreement here shows a button that gets a clean refusal, never a bad write.

     It exists because _lock is carried only on the PATCH response, so A PAGE RELOAD
     LOST IT: after confirming and refreshing, the panel offered "Confirm details"
     again and the reservation-fee step became unreachable. last_step and status both
     come back on the GET, so the answer is derivable without another endpoint.

     Exact matches, never a substring test - trap 8. */
  function pastDetails() {
    if (!R) { return false; }
    var step = String(R.last_step || "").toLowerCase();
    if (step === "confirm" || step === "activate") { return true; }
    var st = String(R.status || "").toLowerCase();
    return !(st === "draft" || st === "held");
  }

  function renderReservation() {
    var u = R.unit || {};
    var locked = (R._lock === true) || pastDetails();
    $("body").innerHTML =
      '<div class="row"><span>uuid</span><span class="mono">' + esc(R.uuid) + "</span></div>" +
      '<div class="row"><span>status</span><span>' + esc(R.status) + "</span></div>" +
      '<div class="row"><span>last step</span><span>' + esc(R.last_step || "—") + "</span></div>" +

      "<h3>Unit, from the frozen snapshot</h3>" +
      '<div class="row"><span>name</span><span>' + esc(u.name) + "</span></div>" +
      '<div class="row"><span>price</span><span>' + esc(u.price_display) + " · " + esc(rands(u.price_cents)) + "</span></div>" +
      '<div class="row"><span>area</span><span>' + esc(u.unit_area) + " m²</span></div>" +
      '<div class="row"><span>deposit</span><span>bond ' + esc(u.deposit_bond_pct) + "% · cash " + esc(u.deposit_cash_pct) + "%</span></div>" +
      '<div class="row"><span>levy</span><span>' + esc(rands(u.levy_cents)) + "</span></div>" +
      '<div class="row"><span>plan id</span><span class="mono">' + esc(R.memberstack_plan_id || "—") + "</span></div>" +

      "<h3>Buyer details</h3>" +
      FIELDS.map(function (f) {
        var lab = '<label for="f_' + f.k + '">' + esc(f.l) + (f.req ? ' <span class="bad">*</span>' : "") + "</label>";
        if (f.t === "select") {
          return lab + '<select id="f_' + f.k + '">' +
            '<option value="">' + (f.req ? "Please choose" : "\u2014") + "</option>" +
            f.opts.map(function (o) {
              return '<option value="' + esc(o) + '"' + (R[f.k] === o ? " selected" : "") + ">" + esc(o) + "</option>";
            }).join("") + "</select>";
        }
        return lab + '<input id="f_' + f.k + '" type="' + f.t + '"' +
          (f.ac ? ' autocomplete="' + f.ac + '"' : "") +
          (f.k === "address" ? ' list="addrlist"' : "") +
          ' value="' + esc(R[f.k] || "") + '">' +
          (f.k === "address" ? '<datalist id="addrlist"></datalist>' : "") +
          (f.k === "id_number" ? '<div id="idNote" class="mut" style="font-size:11px"></div>' : "");
      }).join("") +
      '<label for="f_payer_route">Route</label>' +
      '<select id="f_payer_route">' +
        ["bond", "cash", "undecided"].map(function (x) {
          return '<option value="' + x + '"' + (R.payer_route === x ? " selected" : "") + ">" + x + "</option>";
        }).join("") +
      "</select>" +
      '<div id="valErr" class="bad" style="font-size:11px;min-height:14px"></div>' +
      '<button id="save" class="ghost">Save details</button>' +

      "<h3>Money</h3>" +
      '<div class="row"><span>unit</span><span>' + esc(rands(R.unit_price_cents)) + "</span></div>" +
      '<div class="row"><span>add-ons</span><span>' + esc(rands(R.addons_total_cents)) + "</span></div>" +
      '<div class="row"><span>total</span><span>' + esc(rands(R.total_cents)) + "</span></div>" +
      '<div class="row"><span>hold fee</span><span>' + esc(rands(R.reservation_fee_cents)) + "</span></div>" +

      "<h3>Offer to Purchase</h3>" +
      '<div class="row"><span>state</span><span class="' + (locked ? "ok" : "mut") + '">' +
        (locked ? "locked — " + esc(R._lockReason || "") : "still rebuilding on each save") + "</span></div>" +
      (R.otp_url
        ? '<div class="mono" style="margin-top:6px">' + esc(R.otp_url) + "</div>"
        : '<div class="mut" style="margin-top:6px">No url yet. Sanford has no cash template, so a cash route stays empty.</div>') +

      (locked
        ? '<div class="mut" style="margin-top:10px;font-size:11px">Locked. Saving details again now writes an otp_stale event instead of rewriting the url.</div>'
        : '<button id="confirm">Confirm details (locks the OTP)</button>') +

      "<h3>Reservation fee</h3>" +
      /* Gated on the details being confirmed because that is the real order of the
         flow, and because preparing a payment claims the unit - it must not be
         reachable by someone who has not finished the step before it. */
      (!locked
        ? '<div class="mut">Confirm the buyer details first.</div>'
        : (CO
            ? coPanel()
            : '<div class="row"><span>hold fee</span><span>' + esc(rands(R.reservation_fee_cents)) + "</span></div>" +
              '<div class="mut" style="font-size:11px;margin-top:6px">Preparing claims the unit and starts the hold clock. Xano signs the amount; this page only posts back what it signed.</div>' +
              '<button id="coPrep">Prepare payment</button>')) +

      '<button id="reset" class="ghost">Start over</button>';

    wireBuyerFields();
    var prep = $("coPrep");
    if (prep) { prep.addEventListener("click", prepareCheckout); }
    var coGo = $("coGo");
    if (coGo) { coGo.addEventListener("click", goToPayfast); }
    var ack = $("coAck");
    if (ack) {
      ack.addEventListener("change", function () {
        coLiveAck = ack.checked === true;
        renderReservation();
      });
    }
    $("save").addEventListener("click", function () { save(false); });
    var c = $("confirm");
    if (c) { c.addEventListener("click", function () { save(true); }); }
    $("reset").addEventListener("click", function () {
      drop(UUID_KEY);
      R = null;
      history.replaceState({}, "", w.location.pathname);
      log("cleared local state — the Xano row is untouched");
      renderPicker();
    });
  }

  /* --------------------------------------------------- buyer field behaviours */
  var dobWasAutofilled = false;
  var addrTimer = null, addrAbort = null;

  function refreshDob() {
    var idEl = $("f_id_number"), dobEl = $("f_dob"), btEl = $("f_buyer_type"), note = $("idNote");
    if (!idEl || !dobEl || !note) { return; }

    // Only an Individual carries an ID in this shape. A company registration
    // (2019/123456/07) parsed as a date would produce confident nonsense.
    if (!w.HLBuyer.isIndividual(btEl ? btEl.value : "")) { note.textContent = ""; return; }

    var r = w.HLBuyer.dobFromSaId(idEl.value, new Date().getFullYear());
    if (!r.ok) {
      // Silent while they are still typing; a foreign buyer has a passport, not an
      // SA ID, and must never be nagged about it.
      note.textContent = "";
      return;
    }

    // Never overwrite something typed by hand.
    if (!dobEl.value || dobWasAutofilled) {
      dobEl.value = r.iso;
      dobWasAutofilled = true;
    }

    note.textContent = r.checkDigitOk
      ? "Date of birth filled from the ID number."
      : "Date of birth filled, but the ID check digit does not match - worth re-reading the number.";
    note.className = r.checkDigitOk ? "mut" : "bad";
    note.style.fontSize = "11px";
  }

  function wireBuyerFields() {
    var idEl = $("f_id_number"), dobEl = $("f_dob"), btEl = $("f_buyer_type"), addr = $("f_address");

    if (idEl) { idEl.addEventListener("input", refreshDob); }
    if (btEl) { btEl.addEventListener("change", refreshDob); }
    if (dobEl) {
      // The moment they touch it themselves, it stops being ours to overwrite.
      dobEl.addEventListener("input", function () { dobWasAutofilled = false; });
    }

    /* Address: the native autocomplete attribute above does the free part. This adds
       search-as-you-type through Photon (OpenStreetMap, free, built for type-ahead).
       Strictly additive - debounced, the previous request is aborted, and every
       failure path leaves the buyer typing a plain address exactly as they do now. */
    if (addr) {
      addr.addEventListener("input", function () {
        clearTimeout(addrTimer);
        addrTimer = setTimeout(function () {
          if (addrAbort) { try { addrAbort.abort(); } catch (e) {} }
          addrAbort = (typeof AbortController !== "undefined") ? new AbortController() : null;
          w.HLBuyer.addressSuggest(addr.value, {
            signal: addrAbort ? addrAbort.signal : undefined
          }).then(function (list) {
            var dl = $("addrlist");
            if (!dl) { return; }
            dl.innerHTML = list.map(function (x) {
              return '<option value="' + esc(x.label) + '"></option>';
            }).join("");
          });
        }, 350);
      });
    }

    refreshDob();
  }

  /* ----------------------------------------------------------------- flow */
  function createDraft(unitId) {
    var slug = "sanford";
    if (!propertyEnabled(slug)) { log("property not enabled: " + slug, "bad"); return; }
    log("POST /public/reservations " + unitId);
    api.post("/public/reservations", { property_slug: slug, wf_unit_id: unitId })
      .then(function (res) {
        var uuid = res && (res.uuid || (res.reservation && res.reservation.uuid));
        if (!uuid) { throw new Error("no uuid in the response"); }
        store(UUID_KEY, uuid);
        history.replaceState({}, "", w.location.pathname + "?r=" + encodeURIComponent(uuid));
        log("draft created " + uuid, "ok");
        return load(uuid);
      })
      .catch(function (e) { log("create failed: " + e.message, "bad"); });
  }

  function load(uuid) {
    log("GET /public/reservations/" + uuid);
    return api.get("/public/reservations/" + encodeURIComponent(uuid))
      .then(function (res) {
        R = res;
        if (!propertyEnabled(R.property_slug)) {
          log("refusing: " + R.property_slug + " is not switched on", "bad");
          R = null;
          drop(UUID_KEY);
          renderPicker();
          return;
        }
        log("loaded " + (R.unit && R.unit.name) + " · " + R.status);
        renderReservation();
        /* A RELOAD MUST NOT LOSE THE HOLD, and must not restart it either. The endpoint is
           idempotent, so asking again is free and returns the same deadline; past the
           claimable states the payment window is followed instead. */
        var lst = String(R.status || "").toLowerCase();
        if (lst === "awaiting_payment" || lst === "awaiting_clearance") { holdFollow(); }
        else { holdClaim(); }
      })
      .catch(function (e) {
        log("load failed: " + e.message, "bad");
        drop(UUID_KEY);
        renderPicker();
      });
  }

  function save(confirming) {
    if (!R) { return; }
    var body = {};
    FIELDS.forEach(function (f) {
      var el = $("f_" + f.k);
      if (el && el.value.trim()) { body[f.k] = el.value.trim(); }
    });

    /* The required gate runs at CONFIRM, not on every incremental save - blocking a
       half-filled draft from saving would lose work, which is the opposite of the
       point. Checked in JS rather than through the native `required` because on the
       real page a country-picker library hides the select and native validation
       either cannot focus it or never sees it. */
    if (confirming) {
      var missing = w.HLBuyer.missingRequired(body, REQUIRED_TO_CONFIRM);
      if (missing.length) {
        $("valErr").textContent = "Required before confirming: " + missing.join(", ") + ".";
        var first = $("f_" + missing[0]);
        if (first) { first.focus(); }
        return;
      }
    }
    $("valErr").textContent = "";
    var pr = $("f_payer_route");
    if (pr) { body.payer_route = pr.value; }
    body.last_step = confirming ? "confirm" : "details";

    log("PATCH last_step=" + body.last_step);
    api.patch("/public/reservations/" + encodeURIComponent(R.uuid), body)
      .then(function (res) {
        // The PATCH response carries the lock state; the GET does not.
        var lock = res && res.otp_locked === true;
        var reason = res && res.otp_lock_reason;
        log("saved · otp_locked=" + lock + (reason ? " (" + reason + ")" : ""), lock ? "ok" : "");
        return load(R.uuid).then(function () {
          if (R) { R._lock = lock; R._lockReason = reason; renderReservation(); }
          /* A BELT-AND-BRACES CLAIM, NOT THE MOMENT IT IS TAKEN ANY MORE. Since 7 Sep the
             hold is claimed on the first load of the flow, so by the time anyone confirms
             holdOn is already true and this is a no-op. It stays because it costs one
             boolean test and covers the one case load() cannot: a claim that failed
             earlier - the countdown fails open - getting a second chance at the step where
             the number actually matters. */
          if (confirming) { holdClaim(); }
        });
      })
      .catch(function (e) { log("save failed: " + e.message, "bad"); });
  }

  /* ----------------------------------------------------------------- hold
     THE HOLD WINDOW, AND THE FIRST TIME IT HAS MEANT ANYTHING.

     What it replaces: /reserve/3 counts ten minutes in sessionStorage against the BUYER'S
     OWN DEVICE CLOCK, and at zero redirects them away without telling the server. Nothing on
     the server read hold_expires_at either, so a buyer who walked away held that home
     forever and the next buyer was refused at checkout by the unique index - about a hold
     that ended days ago. Set the device clock forward and the old timer expired instantly;
     set it back and it never did.

     WHEN THE HOLD IS TAKEN. THE MOMENT THE RESERVATION IS OPENED - the first load of the
     flow, before the details step - and it runs for the development's hold_minutes.

     THIS IS THE SECOND ANSWER TO THAT QUESTION AND IT REVERSES THE FIRST. The hold was
     originally taken on the confirm PATCH, on the argument that "somebody merely looking at
     a home should not cost you a live unit for ten minutes". Daniel, 7 Sep: the buyer needs
     the home held while they FILL IN THE INTAKE, not from the moment they have finished it.
     A hold that begins at confirm protects the ten seconds between confirm and Payfast and
     leaves the whole form - names, ID numbers, addresses, add-ons, OTP details - unprotected,
     which is the stretch where two buyers actually collide. The window is 30 minutes for that
     reason, not 10: it is now sized to the intake, not to a payment redirect.

     WHAT THAT COSTS, STATED PLAINLY. A buyer who opens the flow and wanders off does take a
     home off the market for half an hour. That is the deliberate trade, and it is only
     affordable because the hold is now REAL: release_expired_holds runs every 60 seconds and
     hands the home back on its own. Under the old arrangement the same abandonment held the
     home forever, so this is a shorter leash than the one it replaces, not a longer one.

     A RELOAD DOES NOT RESTART IT. POST /hold is idempotent: called again while the hold is
     live it returns the SAME deadline, with already_held true. That is why this can be
     called unconditionally on load once the buyer is past details, and why a timer a buyer
     could reset with F5 is not a limit.

     IT FAILS OPEN. If HLHold is not on the page, or the call fails, the countdown does not
     start and nothing else changes. A clock that did not load must never be the reason
     somebody cannot pay. The one refusal worth showing is a live rival - somebody else is
     part-way through reserving this home - and that comes back as a 403.
  */
  var holdOn = false;

  function holdCfg() {
    return {
      base: BASE,
      uuid: R && R.uuid,
      display: $("holdT"),
      onHeld: function (h) {
        holdOn = true;
        $("holdBar").className = "hold on";
        $("holdNote").textContent = h.alreadyHeld ? "already running" : "";
        /* Only announced when it is news. A reload re-claiming the same hold is not an
           event, and logging it every time would bury the one that is. */
        if (!h.alreadyHeld) {
          log("hold taken · " + h.holdMinutes + " min · " + h.secondsRemaining + "s left", "ok");
        }
      },
      onExpire: function () {
        /* IT HAS LEARNED THAT A DEADLINE PASSED AND NOTHING ELSE. The server may disagree -
           a payment may have landed in the last second, or the sweep may not have run yet -
           so the honest answer is to go and ask rather than to decide here. The old timer
           redirected on its own authority. */
        log("the hold ran out - asking the server what the reservation is now", "bad");
        $("holdNote").textContent = "expired — reloading";
        holdOn = false;
        if (R && R.uuid) { load(R.uuid); }
      },
      onRival: function (msg) {
        holdOn = false;
        $("holdBar").className = "hold on";
        $("holdT").textContent = "--:--";
        $("holdNote").textContent = msg;
        log("hold refused: " + msg, "bad");
      },
      onError: function (e) {
        holdOn = false;
        log("hold unavailable (" + e.message + ") - continuing without a countdown", "mut");
      }
    };
  }

  /* Claim on any reservation that is still claimable, and only once per hold. Everything
     about when NOT to call is here rather than at the call sites, so the three places that
     ask cannot each answer it differently.

     THERE IS NO pastDetails() TEST HERE ANY MORE. That guard was what made the hold start at
     confirm; removing it is the whole of the 7 Sep change, and the STATUS test below is the
     real gate - it always was. A draft is claimable, and a draft is what the buyer has when
     they land on step one. */
  function holdClaim() {
    if (!R || !R.uuid) { return; }
    if (holdOn) { return; }
    /* Past the point where a hold can be claimed - checkout owns the clock from here, and
       claim_unit_hold refuses awaiting_payment outright rather than rewriting the deadline
       on a row that is mid-payment. holdFollow keeps the display honest instead. */
    var st = String((R && R.status) || "").toLowerCase();
    if (st !== "draft" && st !== "held" && st !== "expired" && st !== "payment_failed") { return; }
    if (!w.HLHold) {
      log("HLHold is not on the page - no countdown. Load hl-hold-countdown.js first.", "mut");
      return;
    }
    w.HLHold.start(holdCfg());
  }

  /* AFTER CHECKOUT THE DEADLINE IS SOMEBODY ELSE'S. checkout_reservation grants its own
     fresh window, and the claim endpoint will not touch a row that has reached
     awaiting_payment - so without this the bar would keep counting down a deadline that is
     no longer the one the server is enforcing, at the exact screen where the buyer is
     acting on the number. */
  function holdFollow() {
    if (!w.HLHold || !R) { return; }
    var exp = R.hold_expires_at;
    if (exp === null || exp === undefined || exp === "") { return; }
    if (w.HLHold.follow(exp, R.server_time, holdCfg())) {
      holdOn = true;
      $("holdBar").className = "hold on";
      $("holdNote").textContent = "payment window";
    }
  }

  /* ------------------------------------------------------------- checkout
     STEP 3. THE ONE THAT TOUCHES MONEY.

     The browser's only job is to POST BACK, UNCHANGED, the field set Xano signed.
     It never computes an amount, never reorders, never adds a field. Everything
     below exists to make that guarantee CHECKABLE rather than assumed.

     THREE RULES, each a real Payfast failure mode:

     1. EMPTY FIELDS ARE NOT POSTED. checkout_reservation builds the signature by
        SKIPPING empty values - but it still returns those keys. Post an empty
        name_first when the signature was computed without it and Payfast answers
        "Generated signature does not match submitted signature". The buyer sees a
        dead end, and nothing on our side errored.

     2. ORDER IS THE SPEC. Payfast's signature is order-dependent. The order used
        here is whatever Xano sent, because that is the order Xano signed. This file
        must never sort, and signature always goes last.

     3. NOTHING IS RECOMPUTED HERE. If what we are about to post is not identical to
        what Xano returned, that is a bug in THIS file, and the right answer is to
        refuse rather than send a number nobody signed.

     PREPARING IS NOT FREE. POST /checkout claims the unit, moves the reservation to
     awaiting_payment and starts the hold clock. So it happens on an explicit click,
     exactly once - never on render.
  */
  var CO = null;        // the signed field set, exactly as Xano returned it
  var coBusy = false;
  var coLiveAck = false;

  /* Pure: turns the returned field set into the ordered list that will be posted.
     Kept separate from the DOM so the rules above can be tested without a browser. */
  function checkoutFieldsToPost(data) {
    var f = (data && data.fields) || {};
    var out = [], sig = null;
    Object.keys(f).forEach(function (k) {
      var v = f[k];
      var s = (v === null || v === undefined) ? "" : String(v);
      if (s === "") { return; }                       // rule 1
      if (k === "signature") { sig = s; return; }     // rule 2 - always last
      out.push([k, s]);
    });
    if (sig !== null) { out.push(["signature", sig]); }
    return out;
  }

  /* Pure: every reason NOT to post. An empty list is the only thing that may submit. */
  function checkoutProblems(data, uuid) {
    if (!data) { return ["no response from Xano"]; }
    var f = data.fields || {};
    var p = [];
    if (!data.process_url) { p.push("no process_url"); }
    if (!f.signature) { p.push("no signature"); }
    if (!f.merchant_id) { p.push("no merchant_id"); }
    if (!f.merchant_key) { p.push("no merchant_key"); }
    // Rule 3: the amount on the field must be the amount Xano reported.
    if (String(f.amount || "") !== String(data.amount || "")) {
      p.push("amount mismatch - field " + f.amount + " vs response " + data.amount);
    }
    if (!/^[0-9]+\.[0-9]{2}$/.test(String(f.amount || ""))) {
      p.push("amount is not a 2-decimal string: " + f.amount);
    }
    // The ITN finds the reservation through custom_str1. Wrong here, orphaned payment.
    if (uuid && String(f.custom_str1 || "") !== String(uuid)) {
      p.push("custom_str1 does not match this reservation");
    }
    if (data.is_live === true && coLiveAck !== true) {
      p.push("live payment not acknowledged");
    }
    return p;
  }

  // Trap 13: a timestamp does not arrive in one predictable shape, and NaN is falsy.
  function ms(v) {
    if (v === null || v === undefined || v === "") { return 0; }
    if (typeof v === "number") { return isFinite(v) ? v : 0; }
    var n = Number(v);
    if (!isNaN(n) && n > 0) { return n; }
    var p = Date.parse(String(v));
    return isNaN(p) ? 0 : p;
  }

  function coPanel() {
    var pairs = checkoutFieldsToPost(CO);
    var problems = checkoutProblems(CO, R && R.uuid);
    var omitted = Object.keys(CO.fields || {}).filter(function (k) {
      var v = CO.fields[k];
      return v === null || v === undefined || String(v) === "";
    });
    var exp = ms(CO.hold_expires_at);

    return '<div class="row"><span>mode</span><span class="' + (CO.is_live ? "bad" : "ok") + '">' +
             (CO.is_live ? "LIVE — real money" : "sandbox") + "</span></div>" +
           '<div class="row"><span>amount</span><span>R' + esc(CO.amount) + "</span></div>" +
           '<div class="row"><span>reference</span><span class="mono">' + esc(CO.m_payment_id) + "</span></div>" +
           '<div class="row"><span>hold until</span><span>' +
             (exp ? esc(new Date(exp).toLocaleTimeString()) : "—") + "</span></div>" +
           '<div class="row"><span>posting</span><span>' + pairs.length + " fields to " +
             esc(CO.process_url) + "</span></div>" +
           (omitted.length
             ? '<div class="mut" style="font-size:11px;margin-top:6px">Empty, deliberately not posted: ' +
               esc(omitted.join(", ")) + "</div>"
             : "") +
           '<div class="mono" style="margin-top:6px">' +
             pairs.map(function (kv) { return esc(kv[0]) + "=" + esc(kv[1]); }).join("<br>") +
           "</div>" +
           (CO.is_live
             ? '<label style="display:flex;gap:6px;align-items:center;margin-top:10px;font-size:12px;color:#b00020">' +
               '<input type="checkbox" id="coAck" style="width:auto"' + (coLiveAck ? " checked" : "") +
               "> This is LIVE money</label>"
             : "") +
           (problems.length
             ? '<div class="bad" style="margin-top:8px;font-size:11px">Will not post: ' +
               esc(problems.join("; ")) + "</div>"
             : "") +
           '<button id="coGo"' + (problems.length ? " disabled" : "") + ">Go to Payfast — R" +
             esc(CO.amount) + "</button>";
  }

  function prepareCheckout() {
    if (!R || coBusy) { return; }
    coBusy = true;
    var btn = $("coPrep");
    if (btn) { btn.disabled = true; }
    log("POST /public/reservations/" + R.uuid + "/checkout");
    api.post("/public/reservations/" + encodeURIComponent(R.uuid) + "/checkout", {})
      .then(function (res) {
        CO = res;
        log("signed · " + (res.is_live ? "LIVE" : "sandbox") + " · R" + res.amount +
            " · " + res.m_payment_id, res.is_live ? "bad" : "ok");
        // status is now awaiting_payment; reload so the panel is not lying about it
        return load(R.uuid);
      })
      .catch(function (e) {
        log("checkout refused: " + e.message, "bad");
      })
      .then(function () { coBusy = false; });
  }

  function goToPayfast() {
    if (!CO) { return; }
    var problems = checkoutProblems(CO, R && R.uuid);
    if (problems.length) {
      log("refusing to post: " + problems.join("; "), "bad");
      return;
    }
    var pairs = checkoutFieldsToPost(CO);
    var form = d.createElement("form");
    form.method = "POST";
    form.action = CO.process_url;
    form.style.display = "none";
    pairs.forEach(function (kv) {
      var i = d.createElement("input");
      i.type = "hidden";
      i.name = kv[0];
      i.value = kv[1];
      form.appendChild(i);
    });
    d.body.appendChild(form);
    log("posting " + pairs.length + " fields to " + CO.process_url, "ok");
    form.submit();
  }

  /* ----------------------------------------------------------------- boot */
  function boot() {
    d.body.appendChild(host);
    var uuid = param("r") || stored(UUID_KEY);
    if (uuid) {
      store(UUID_KEY, uuid);
      load(uuid);
    } else {
      renderPicker();
    }
    w.HLV2 = {
      api: api,
      get: function () { return R; },
      load: load,
      reset: function () {
        if (w.HLHold) { w.HLHold.stop(); }
        holdOn = false;
        drop(UUID_KEY);
      },
      hold: {
        claim: holdClaim,
        follow: holdFollow,
        running: function () { return holdOn; },
        remaining: function () { return w.HLHold ? w.HLHold.remaining() : null; }
      },
      checkout: {
        fieldsToPost: checkoutFieldsToPost,
        problems: function (data, uuid) { return checkoutProblems(data, uuid); },
        prepare: prepareCheckout,
        go: goToPayfast,
        state: function () { return CO; },
        ackLive: function (v) { coLiveAck = (v === true); }
      }
    };
    log("ready");
  }

  if (d.readyState === "loading") { d.addEventListener("DOMContentLoaded", boot); } else { boot(); }
})(window, document);
