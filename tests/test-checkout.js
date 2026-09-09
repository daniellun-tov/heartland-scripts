const fs = require('fs');
const { JSDOM } = require('jsdom');
/* PATHS RESOLVE FROM THIS FILE, never from an absolute scratch path. This suite spent a
   fortnight in /tmp on a session container, reading its bundle out of a directory that did
   not exist anywhere else - so it was one container reclaim from gone, and runnable by
   nobody but the session that wrote it. Ported into the repo 9 Sep 2026. */
const ROOT = require("path").join(__dirname, "..");
const FIX = require("path").join(__dirname, "fixtures");
const BUYER = fs.readFileSync(ROOT + "/hl-buyer-fields.js", 'utf8');
const SRC = fs.readFileSync(ROOT + "/hl-reserve-v2.js", 'utf8');

const A = []; const ok = (n, c) => A.push({ n, pass: !!c });

const UUID = "uuid-abc";

/* A signed field set shaped exactly like checkout_reservation's - INCLUDING the
   empty keys it returns for a buyer who gave no first name. Those empties are the
   whole point: the signature was computed without them. */
function signed(over) {
  const base = {
    uuid: UUID,
    status: "awaiting_payment",
    process_url: "https://sandbox.payfast.co.za/eng/process",
    is_live: false,
    passphrase_used: true,
    legacy_success_flag: false,
    m_payment_id: "HL-uuid-abc-1",
    amount: "3000.00",
    hold_expires_at: 1787529608198,
    fields: {
      merchant_id: "10000100",
      merchant_key: "46f0cd694581a",
      return_url: "https://www.heartland.co.za/reserve-4/sanford",
      cancel_url: "https://www.heartland.co.za/reserve/3",
      notify_url: "https://x7aj-untn-pq4t.n7e.xano.io/api:i0YhKPAV/payfast/itn",
      name_first: "",
      name_last: "",
      email_address: "buyer@example.com",
      m_payment_id: "HL-uuid-abc-1",
      amount: "3000.00",
      item_name: "Sanford Heart Reservation Fee",
      custom_str1: UUID,
      signature: "d41d8cd98f00b204e9800998ecf8427e"
    }
  };
  return Object.assign({}, base, over || {});
}

const RES_CONFIRMED = {
  uuid: UUID, status: "draft", last_step: "confirm",
  property_slug: "sanford", memberstack_plan_id: "pln_sanford",
  unit: { name: "Home 7", price_display: "R3,595,000", price_cents: 359500000,
          unit_area: 272.34, deposit_bond_pct: 10, deposit_cash_pct: 30, levy_cents: 500000 },
  unit_price_cents: 359500000, addons_total_cents: 0, total_cents: 359500000,
  reservation_fee_cents: 300000, otp_url: "https://sign.zoho.com/x"
};

function boot(opts) {
  opts = opts || {};
  const calls = [], submits = [];
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: "dangerously", url: "https://www.heartland.co.za/reserve-v2?r=" + UUID,
    beforeParse(w) {
      w.fetch = (url, o) => {
        const method = (o && o.method) || 'GET';
        const u = String(url);
        calls.push({ url: u, method, body: o && o.body ? JSON.parse(o.body) : null });
        let body = {};
        if (u.indexOf('/checkout') > -1) {
          if (opts.checkoutFails) {
            return Promise.resolve({ ok: false, status: 403, text: () =>
              Promise.resolve(JSON.stringify({ message: "That unit is already held by another reservation." })) });
          }
          body = signed(opts.signedOver);
        } else if (method === 'PATCH') {
          body = { uuid: UUID, otp_locked: true, otp_lock_reason: 'moved past the details step' };
        } else {
          body = opts.stillOnDetails
            ? Object.assign({}, RES_CONFIRMED, { last_step: "details", otp_url: null })
            : RES_CONFIRMED;
        }
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) });
      };
      // jsdom cannot navigate; record the submit instead.
      w.HTMLFormElement.prototype.submit = function () {
        submits.push({
          action: this.action, method: (this.method || '').toUpperCase(),
          pairs: Array.from(this.querySelectorAll('input')).map(i => [i.name, i.value])
        });
      };
    }
  });
  const w = dom.window;
  w.eval(BUYER);
  w.eval(SRC);
  return { w, calls, submits, root: () => w.document.getElementById('hl-v2-host').shadowRoot };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { w } = boot();
  await wait(40);
  const C = w.HLV2.checkout;

  /* ---------------------------------------------- rule 1: empties are not posted */
  {
    const pairs = C.fieldsToPost(signed());
    const keys = pairs.map(p => p[0]);
    ok("empty name_first is not posted", keys.indexOf('name_first') === -1);
    ok("empty name_last is not posted", keys.indexOf('name_last') === -1);
    ok("non-empty fields survive", keys.indexOf('email_address') > -1 && keys.indexOf('amount') > -1);
    ok("exactly the eleven non-empty fields", pairs.length === 11);
  }

  /* ---------------------------------------------------- rule 2: order is the spec */
  {
    const keys = C.fieldsToPost(signed()).map(p => p[0]);
    const expected = ["merchant_id", "merchant_key", "return_url", "cancel_url", "notify_url",
                      "email_address", "m_payment_id", "amount", "item_name", "custom_str1", "signature"];
    ok("posted in the order Xano signed", JSON.stringify(keys) === JSON.stringify(expected));
  }
  {
    // signature arriving mid-object must still go last
    const s = signed();
    const reordered = {};
    Object.keys(s.fields).forEach(k => { if (k === 'merchant_key') { reordered.signature = s.fields.signature; } reordered[k] = s.fields[k]; });
    delete reordered.signature; reordered.signature = s.fields.signature;
    const shuffled = { signature: s.fields.signature };
    Object.keys(s.fields).forEach(k => { if (k !== 'signature') { shuffled[k] = s.fields[k]; } });
    const keys = C.fieldsToPost(Object.assign({}, s, { fields: shuffled })).map(p => p[0]);
    ok("signature is forced last even when it arrives first", keys[keys.length - 1] === 'signature');
  }

  /* ------------------------------------------- rule 3: nothing is recomputed here */
  {
    ok("a clean sandbox payload has no problems", C.problems(signed(), UUID).length === 0);
  }
  {
    const bad = signed();
    bad.fields = Object.assign({}, bad.fields, { amount: "30.00" });   // field says one thing
    const p = C.problems(bad, UUID);
    ok("an amount that disagrees with the response is refused",
       p.some(x => x.indexOf('amount mismatch') > -1));
  }
  {
    const bad = signed({ amount: "3000" });
    bad.fields = Object.assign({}, bad.fields, { amount: "3000" });
    ok("an amount without cents is refused",
       C.problems(bad, UUID).some(x => x.indexOf('2-decimal') > -1));
  }
  {
    const bad = signed();
    bad.fields = Object.assign({}, bad.fields, { custom_str1: "someone-elses-uuid" });
    ok("a custom_str1 for another reservation is refused",
       C.problems(bad, UUID).some(x => x.indexOf('custom_str1') > -1));
  }
  {
    const bad = signed();
    bad.fields = Object.assign({}, bad.fields, { signature: "" });
    ok("a missing signature is refused", C.problems(bad, UUID).some(x => x.indexOf('signature') > -1));
  }
  {
    const bad = signed();
    bad.fields = Object.assign({}, bad.fields, { merchant_id: "" });
    ok("a missing merchant_id is refused", C.problems(bad, UUID).some(x => x.indexOf('merchant_id') > -1));
  }

  /* ------------------------------------------------------------- the live guard */
  {
    C.ackLive(false);
    ok("live money is refused until acknowledged",
       C.problems(signed({ is_live: true }), UUID).some(x => x.indexOf('live payment') > -1));
    C.ackLive(true);
    ok("and allowed once acknowledged", C.problems(signed({ is_live: true }), UUID).length === 0);
    C.ackLive(false);
  }

  /* --------------------------------------------------------------- the live flow */
  {
    const b = boot();
    await wait(40);
    const r = b.root();
    ok("the fee section offers to prepare once details are confirmed", !!r.getElementById('coPrep'));
    ok("nothing is claimed on render", b.calls.filter(c => c.url.indexOf('/checkout') > -1).length === 0);

    r.getElementById('coPrep').click();
    await wait(60);
    ok("preparing calls the checkout endpoint once",
       b.calls.filter(c => c.url.indexOf('/checkout') > -1).length === 1);
    ok("and it is a POST", b.calls.find(c => c.url.indexOf('/checkout') > -1).method === 'POST');
    ok("no amount is ever sent to it",
       JSON.stringify(b.calls.find(c => c.url.indexOf('/checkout') > -1).body) === '{}');

    const go = b.root().getElementById('coGo');
    ok("the panel now offers the payfast button", !!go);
    ok("and shows it is sandbox", b.root().textContent.indexOf('sandbox') > -1);

    go.click();
    await wait(20);
    ok("exactly one form was submitted", b.submits.length === 1);
    ok("to the process_url Xano returned", b.submits[0].action === 'https://sandbox.payfast.co.za/eng/process');
    ok("by POST", b.submits[0].method === 'POST');
    ok("carrying the eleven non-empty fields, signature last",
       b.submits[0].pairs.length === 11 && b.submits[0].pairs[10][0] === 'signature');
    ok("and no empty field rode along",
       b.submits[0].pairs.every(p => p[1] !== ''));
  }

  /* ------------------------------------------------------- preparing is not free */
  {
    const b = boot();
    await wait(40);
    const prep = b.root().getElementById('coPrep');
    prep.click(); prep.click(); prep.click();
    await wait(60);
    ok("three clicks still claim the unit only once",
       b.calls.filter(c => c.url.indexOf('/checkout') > -1).length === 1);
  }
  {
    /* The button also disables itself, which would hide a missing in-code guard - so
       call the function directly, the way a stray second caller would. Claiming a unit
       twice mints a second m_payment_id and burns a payment_attempt. */
    const b = boot();
    await wait(40);
    b.w.HLV2.checkout.prepare();
    b.w.HLV2.checkout.prepare();
    b.w.HLV2.checkout.prepare();
    await wait(60);
    ok("and calling prepare directly three times claims it only once",
       b.calls.filter(c => c.url.indexOf('/checkout') > -1).length === 1);
  }

  /* ------------------------------------------------------------ refusals are safe */
  {
    const b = boot({ checkoutFails: true });
    await wait(40);
    b.root().getElementById('coPrep').click();
    await wait(60);
    ok("a refused checkout surfaces the reason",
       b.root().textContent.indexOf('already held by another reservation') > -1);
    ok("and posts nothing to payfast", b.submits.length === 0);
  }
  {
    // A corrupted amount must stop the post, not send an unsigned number.
    const b = boot({ signedOver: { amount: "9999.00" } });
    await wait(40);
    b.root().getElementById('coPrep').click();
    await wait(60);
    const go = b.root().getElementById('coGo');
    ok("a mismatched amount disables the button", go && go.disabled === true);
    /* Disabled is presentation. Call the submit path directly - that is what has to
       refuse, because a disabled attribute is one stray line away from not being there. */
    b.w.HLV2.checkout.go();
    await wait(20);
    ok("and the submit path itself refuses, not just the button", b.submits.length === 0);
  }

  /* ------------------------------------------------- the gate before the fee step */
  {
    // Same reservation, still ON the details step. Nothing about paying may appear.
    const b = boot({ stillOnDetails: true });
    await wait(40);
    const r = b.root();
    ok("no prepare button before the details are confirmed", !r.getElementById('coPrep'));
    ok("and the fee section says why", r.textContent.indexOf('Confirm the buyer details first') > -1);
  }

  /* A reload must not forget that the details were confirmed - the bug this found. */
  {
    const b = boot();          // GET returns last_step "confirm", no PATCH involved
    await wait(40);
    ok("a reload still knows the details were confirmed",
       !!b.root().getElementById('coPrep'));
    ok("and still offers the fee section rather than asking to confirm again",
       b.root().textContent.indexOf('Confirm the buyer details first') === -1);
  }

  const fails = A.filter(a => !a.pass);
  A.forEach(a => console.log((a.pass ? "  ok  " : "FAIL  ") + a.n));
  console.log("\n" + (A.length - fails.length) + "/" + A.length + " passed");
  process.exit(fails.length ? 1 : 0);
})();
