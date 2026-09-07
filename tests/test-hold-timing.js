/* HEARTLAND - WHEN THE HOLD IS CLAIMED. Added 7 Sep 2026 with the change that moved the
   claim from the confirm step to the first load of the flow.

   This suite exists because the change is a DELETED GUARD. Deleting a line is the kind of
   edit that leaves no trace when it is wrong: the old behaviour and the new one differ only
   in whether one POST happens on a screen nobody is watching. So every assertion here is
   about a request, not about the screen.

   It drives the REAL bundles - hl-hold-countdown.js and hl-reserve-v2.js as they are on
   disk - through JSDOM with a stubbed fetch, and reads the recorded calls. */
const fs = require('fs');
const { JSDOM } = require('jsdom');
/* STRAIGHT FROM THE REPO ROOT, never from a copy. run.sh copies the console bundle into
   fixtures/ because the fixture PAGE loads it by url; nothing here loads a page, so reading
   the real file is both simpler and immune to the stale-copy trap that once graded an
   already-edited bundle green. */
const ROOT = __dirname + '/..';
const HOLD = fs.readFileSync(ROOT + '/hl-hold-countdown.js', 'utf8');
const SRC = fs.readFileSync(ROOT + '/hl-reserve-v2.js', 'utf8');
const BUYER = fs.readFileSync(ROOT + '/hl-buyer-fields.js', 'utf8');

const A = []; const ok = (n, c, x) => A.push({ n, pass: !!c, x });

const NOW = 1788800000000;

function RES(over) {
  return Object.assign({
    uuid: "uuid-abc", status: "draft", last_step: "unit",
    property_slug: "sanford", property_name: "Sanford Heart",
    memberstack_plan_id: "pln_sanford",
    unit: { name: "Home 7", price_display: "R3,595,000", price_cents: 359500000,
            unit_area: 272.34, deposit_bond_pct: 10, deposit_cash_pct: 30, levy_cents: 500000 },
    unit_price_cents: 359500000, addons_total_cents: 0, total_cents: 359500000,
    reservation_fee_cents: 300000, otp_url: null,
    hold_expires_at: null, server_time: NOW
  }, over || {});
}

function boot(res, holdBody) {
  const calls = [];
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: "dangerously",
    url: "https://www.heartland.co.za/reserve-v2?r=uuid-abc",
    beforeParse(w) {
      w.fetch = (url, o) => {
        const method = (o && o.method) || 'GET';
        calls.push({ url: String(url), method });
        let body = {};
        if (/\/hold$/.test(String(url))) {
          /* THE STUB MIRRORS THE SERVER'S REAL ANSWER, including hold_minutes 30 - a stub
             that answered 10 would let a bundle shipping the wrong window pass. */
          body = holdBody || { uuid: "uuid-abc", status: "held", held: true,
                               already_held: false, hold_expires_at: NOW + 1800000,
                               seconds_remaining: 1800, hold_minutes: 30, server_time: NOW };
          if (body.__status && body.__status >= 400) {
            return Promise.resolve({ ok: false, status: body.__status,
              text: () => Promise.resolve(JSON.stringify({ message: body.message })) });
          }
        } else if (method === 'PATCH') {
          body = { uuid: "uuid-abc", otp_locked: false, otp_lock_reason: "" };
        } else { body = res; }
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) });
      };
      w.Date.now = () => NOW;
    }
  });
  const w = dom.window;
  w.eval(BUYER);
  w.eval(HOLD);
  w.eval(SRC);
  return { w, calls, root: () => w.document.getElementById('hl-v2-host').shadowRoot };
}

const holds = (calls) => calls.filter(c => /\/hold$/.test(c.url) && c.method === 'POST');
const settle = () => new Promise(r => setTimeout(r, 60));

(async () => {
  /* 1. THE CHANGE ITSELF. A draft at the FIRST step - last_step "unit", nothing filled in -
        must claim. Before 7 Sep this posted nothing until the buyer confirmed. */
  {
    const b = boot(RES({ status: "draft", last_step: "unit" }));
    await settle();
    ok("a fresh draft on step one claims the hold", holds(b.calls).length === 1, b.calls.map(c => c.method + ' ' + c.url));
    const bar = b.root().getElementById('holdBar');
    ok("and the countdown bar is shown from step one", bar && /(^|\s)on(\s|$)/.test(bar.className), bar && bar.className);
    ok("showing the server's window, not the browser's idea of it",
       b.root().getElementById('holdT').textContent === "30:00",
       b.root().getElementById('holdT').textContent);
  }

  /* 2. A draft PART WAY THROUGH the details step is the same case, and was also silent
        before. This is the stretch the whole change exists to protect. */
  {
    const b = boot(RES({ status: "draft", last_step: "details" }));
    await settle();
    ok("a draft on the details step claims", holds(b.calls).length === 1, holds(b.calls).length);
  }

  /* 3. ONCE PER HOLD. holdOn is the only thing stopping a second claim now that the step
        test is gone, so it is worth an assertion of its own. */
  {
    const b = boot(RES({ status: "held", last_step: "details" }));
    await settle();
    b.w.HLV2.load("uuid-abc");
    await settle();
    ok("a second load does not claim again", holds(b.calls).length === 1, holds(b.calls).length);
  }

  /* 4. THE STATUS GATE IS THE REAL ONE, and it is all that is left. A row that has reached
        payment must not be re-claimed - claim_unit_hold refuses it outright, and the bundle
        must not ask. */
  {
    const b = boot(RES({ status: "awaiting_payment", last_step: "confirm",
                         hold_expires_at: NOW + 300000 }));
    await settle();
    ok("a row at awaiting_payment never claims", holds(b.calls).length === 0, holds(b.calls).length);
    const bar = b.root().getElementById('holdBar');
    ok("it follows the payment window instead", bar && /(^|\s)on(\s|$)/.test(bar.className), bar && bar.className);
  }

  /* 5. A SALE IS NOT A CLAIMANT. confirmed and cancelled both fail the status test. */
  for (const st of ["confirmed", "cancelled", "awaiting_clearance"]) {
    const b = boot(RES({ status: st, last_step: "confirm" }));
    await settle();
    ok("a " + st + " reservation never claims", holds(b.calls).length === 0, holds(b.calls).length);
  }

  /* 6. IT STILL FAILS OPEN. A refused claim must not stop the flow rendering. */
  {
    const b = boot(RES({ status: "draft", last_step: "unit" }),
                   { __status: 403, message: "Somebody else is part-way through reserving this home." });
    await settle();
    ok("a refused claim still renders the reservation",
       /Home 7/.test(b.root().getElementById('body').innerHTML));
    ok("and says why, in the buyer's words",
       /part-way through/.test(b.root().getElementById('holdNote').textContent),
       b.root().getElementById('holdNote').textContent);
  }

  const bad = A.filter(a => !a.pass);
  A.forEach(a => { if (!a.pass) console.log("  FAIL " + a.n + (a.x !== undefined ? "  -> " + JSON.stringify(a.x) : "")); });
  console.log((A.length - bad.length) + "/" + A.length + " passed");
  process.exit(bad.length ? 1 : 0);
})();
