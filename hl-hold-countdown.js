/* HEARTLAND - THE RESERVATION HOLD COUNTDOWN, driven by the server.
   Drop-in module. Written 7 Sep 2026 to replace the sessionStorage timer on /reserve/3.

   WHAT IT REPLACES, AND WHY IT MATTERS. The Step 3 page counts ten minutes with
   `sessionStorage` and `Date.now()` on the BUYER'S OWN DEVICE. Nothing on the server knows
   the countdown exists: at zero the page redirects to the development page and tells this
   system nothing, so the home stayed held forever - and until 7 Sep nothing in Xano ever
   compared hold_expires_at to the clock either. A buyer who walked away at the payment step
   blocked that home permanently, and the next buyer was refused at checkout by the unique
   index, about a hold that ended days ago.

   It was also not a promise anyone was keeping in the other direction. Put the device clock
   forward and the timer expires immediately; put it back and it never expires. The home was
   never actually reserved for those ten minutes - two buyers could both fill in the whole
   form and the second only learn at Payfast.

   HOW THIS ONE WORKS. On reaching the last step before payment it POSTs
   /public/reservations/{uuid}/hold, which takes the hold server-side and answers with the
   absolute deadline, the SERVER's clock beside it, and the seconds left. The page counts
   down against the server's clock, not the device's, using the offset between them - the
   same correction the portal already applies to deal-stage deadlines.

   A RELOAD DOES NOT RESTART THE CLOCK. The endpoint is idempotent: called again while the
   hold is live it returns the SAME deadline. That is deliberate - a timer a buyer can reset
   by pressing refresh is not a limit. `already_held` says which happened, so the page can
   stay quiet on a reload rather than announcing a hold that was already running.

   AT ZERO IT ASKS THE SERVER RATHER THAN DECIDING. The old timer redirected on its own
   authority; this one has learned only that a deadline passed. The server may disagree - a
   payment may have landed in the last second, or the sweep may not have run yet - so the
   honest response is to go and ask. onExpire is where the page decides what to do with that.

   IT NEVER BLOCKS THE BUYER ON ITS OWN FAILURE. If the hold call fails - offline, 500,
   anything - the countdown simply does not start and the pay button is left alone. A timer
   that fails closed would stop a buyer from paying because a clock did not load, which is a
   far worse outcome than a missing countdown. The refusal that MATTERS - somebody else is
   part-way through reserving this home - comes back as a 403 with a message written for the
   buyer, and that one is shown.

   USE:
     HLHold.start({
       base:    "https://x7aj-untn-pq4t.n7e.xano.io/api:i0YhKPAV",
       uuid:    reservationUuid,
       display: document.getElementById("reservation-timer"),
       onExpire: function () { ... },                  // reached zero
       onRival:  function (msg) { ... },               // someone else holds it
       onError:  function (err) { ... }                // anything else; fail open
     });
     HLHold.stop();                                     // e.g. once payment starts
*/
(function (w) {
  "use strict";

  var S = { timer: null, deadline: null, offset: 0, expired: false, cfg: null };

  function two(n) { return (n < 10 ? "0" : "") + n; }

  /* A Xano timestamp arrives as epoch ms, a numeric string, OR a date string. Number() on the
     third gives NaN, NaN is falsy, and a guard written on it silently skips the work - which
     is how server_time being the literal string "now" went unnoticed for weeks. */
  function ms(v) {
    if (v === null || v === undefined || v === "") { return null; }
    if (typeof v === "number") { return isNaN(v) ? null : v; }
    var n = Number(v);
    if (!isNaN(n) && String(v).trim() !== "") { return n; }
    var d = Date.parse(String(v));
    return isNaN(d) ? null : d;
  }

  /* THE DEVICE CLOCK IS NOT TRUSTED. Every comparison runs through here. */
  function nowServer() { return Date.now() + S.offset; }

  function render() {
    if (!S.cfg || !S.deadline) { return; }
    var left = Math.max(0, S.deadline - nowServer());
    var secs = Math.ceil(left / 1000);
    var el = S.cfg.display;
    if (el) {
      el.textContent = two(Math.floor(secs / 60)) + ":" + two(secs % 60);
      /* A class rather than inline styling, so the page decides what "nearly gone" looks
         like. Two minutes is the point at which it is worth telling somebody. */
      el.classList.toggle("is-urgent", secs <= 120 && secs > 0);
      el.classList.toggle("is-expired", secs === 0);
    }
    if (secs <= 0 && !S.expired) {
      S.expired = true;
      stop();
      /* IT HAS LEARNED THAT A DEADLINE PASSED AND NOTHING ELSE. The server decides what that
         means - a payment may have landed a second ago. */
      if (typeof S.cfg.onExpire === "function") { S.cfg.onExpire(); }
    }
  }

  function tick() { render(); }

  function stop() {
    if (S.timer) { w.clearInterval(S.timer); S.timer = null; }
  }

  function start(cfg) {
    cfg = cfg || {};
    if (!cfg.base || !cfg.uuid) {
      if (typeof cfg.onError === "function") { cfg.onError(new Error("base and uuid are required")); }
      return;
    }
    stop();
    S.cfg = cfg; S.expired = false; S.deadline = null;

    var url = cfg.base.replace(/\/+$/, "") +
      "/public/reservations/" + encodeURIComponent(cfg.uuid) + "/hold";

    w.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null;
        try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
        if (!r.ok) {
          var msg = (d && (d.message || d.error)) || ("Could not hold this home (" + r.status + ")");
          var err = new Error(msg);
          err.status = r.status;
          throw err;
        }
        return d || {};
      });
    }).then(function (d) {
      var exp = ms(d.hold_expires_at);
      var srv = ms(d.server_time);
      /* THE OFFSET IS THE WHOLE POINT. Without it the countdown is the device clock again
         wearing a server's answer. If server_time is unreadable the offset stays 0 and the
         countdown falls back to the device clock - degraded, never broken. */
      S.offset = (srv === null) ? 0 : (srv - Date.now());
      if (exp === null) {
        /* A hold with no deadline is a hold taken by hand. There is nothing to count. */
        if (S.cfg.display) { S.cfg.display.textContent = ""; }
        return;
      }
      S.deadline = exp;
      render();
      S.timer = w.setInterval(tick, 1000);
      if (typeof S.cfg.onHeld === "function") {
        S.cfg.onHeld({ alreadyHeld: d.already_held === true, secondsRemaining: d.seconds_remaining,
                       holdMinutes: d.hold_minutes, expiresAt: exp });
      }
    })["catch"](function (e) {
      /* A LIVE RIVAL IS THE ONE REFUSAL THE BUYER MUST SEE. Everything else fails open - a
         countdown that did not load must never be the reason somebody cannot pay. */
      if (e && e.status === 403 && typeof S.cfg.onRival === "function") { S.cfg.onRival(e.message); return; }
      if (typeof S.cfg.onError === "function") { S.cfg.onError(e); }
    });
  }

  /* FOLLOW A DEADLINE SOMEBODY ELSE SET, without asking for a new hold.

     Checkout grants its OWN fresh window - a person typing a card number at Payfast should
     not lose the home at 9:59 - and the claim endpoint refuses a reservation that has already
     reached awaiting_payment, correctly: it will not rewrite the deadline on a row that is
     mid-payment. So after a checkout the countdown here is showing a deadline that is no
     longer the real one, and there is no call that would refresh it.

     This is that refresh. It takes the deadline off a reservation read the page already has,
     re-derives the clock offset from the same response, and keeps counting. It never asks for
     a hold and never extends one - it only stops the page from displaying a stale number,
     which on this particular screen is the number the buyer is acting on. */
  function follow(expiresAt, serverTime, cfg) {
    var exp = ms(expiresAt);
    if (exp === null) { return false; }
    if (cfg) { S.cfg = cfg; }
    if (!S.cfg) { return false; }
    var srv = ms(serverTime);
    if (srv !== null) { S.offset = srv - Date.now(); }
    stop();
    S.deadline = exp;
    S.expired = false;
    render();
    S.timer = w.setInterval(tick, 1000);
    return true;
  }

  w.HLHold = { start: start, stop: stop, follow: follow,
               remaining: function () {
                 return S.deadline === null ? null : Math.max(0, Math.round((S.deadline - nowServer()) / 1000));
               } };
})(window);
