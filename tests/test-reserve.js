const fs = require('fs');
const { JSDOM } = require('jsdom');
/* PATHS RESOLVE FROM THIS FILE, never from an absolute scratch path. This suite spent a
   fortnight in /tmp on a session container, reading its bundle out of a directory that did
   not exist anywhere else - so it was one container reclaim from gone, and runnable by
   nobody but the session that wrote it. Ported into the repo 9 Sep 2026. */
const ROOT = require("path").join(__dirname, "..");
const FIX = require("path").join(__dirname, "fixtures");
const SRC = fs.readFileSync(ROOT + "/heartland-reserve.js", 'utf8');
const PAGE = fs.readFileSync(FIX + "/reserve-fixture.html", 'utf8');

const A = []; const ok = (n, c) => A.push({ n, pass: !!c });
const UUID = "uuid-abc";

const RES = {
  uuid: UUID, status: "draft", last_step: "1", property_slug: "sanford",
  unit: { name: "Sanford Heart 06", display_name: "Home 6", price_display: "R3,595,000",
          unit_area: 272.34, price_cents: 359500000 },
  unit_price_cents: 359500000, addons_total_cents: 0, total_cents: 359500000,
  reservation_fee_cents: 300000, purchase_deposit_cents: null,
  first_name: "Daniel", last_name: "Lun", email: "daniel@tovstudio.co",
  phone: "071 000 0000", work_phone: "",
  /* A complete buyer, because the fixture now requires what the real details step
     requires. The individual/entity and ID-to-date rules are exercised in
     test-buyer-wired.js, which starts from an empty one on purpose. */
  buyer_type: "individual", id_number: "8501015800085", dob: "1985-01-01",
  nationality: "South African", address: "1 Main Road, Cape Town",
  payer_route: "undecided",
  otp_url: null
};

const SIGNED = {
  uuid: UUID, process_url: "https://sandbox.payfast.co.za/eng/process",
  is_live: false, amount: "3000.00", m_payment_id: "HL-uuid-abc-1",
  fields: {
    merchant_id: "10000100", merchant_key: "46f0cd694581a",
    return_url: "https://www.heartland.co.za/reserve-4/sanford",
    cancel_url: "https://www.heartland.co.za/reserve/3",
    notify_url: "https://x7aj-untn-pq4t.n7e.xano.io/api:i0YhKPAV/payfast/itn",
    name_first: "", name_last: "", email_address: "daniel@tovstudio.co",
    m_payment_id: "HL-uuid-abc-1", amount: "3000.00",
    item_name: "Sanford Heart Reservation Fee", custom_str1: UUID,
    signature: "d41d8cd98f00b204e9800998ecf8427e"
  }
};

function boot(opts) {
  opts = opts || {};
  const calls = [], submits = [], logs = [], warns = [];
  const dom = new JSDOM('<!doctype html><html><body>' + PAGE + '</body></html>', {
    runScripts: "dangerously",
    url: "https://www.heartland.co.za/reserve" + (opts.search === undefined ? "?r=" + UUID : opts.search),
    beforeParse(w) {
      w.console.log = (...a) => logs.push(a.join(' '));
      w.console.warn = (...a) => warns.push(a.join(' '));
      /* The mock holds server state and APPLIES patches to it, so a GET after a
         PATCH returns what was written. A mock that always replays the original
         payload silently resets every input on re-render, and would have made a
         value-clobbering bug look like correct behaviour. */
      let state = Object.assign({}, RES, opts.resOver || {});
      w.fetch = (url, o) => {
        const method = (o && o.method) || 'GET';
        const u = String(url);
        const parsed = o && o.body ? JSON.parse(o.body) : null;
        const entry = { url: u, method, body: parsed, at: Date.now(), done: null };
        calls.push(entry);
        let body;
        if (u.indexOf('/public/config') > -1) {
          if (opts.configFails) { return Promise.reject(new Error('offline')); }
          entry.done = Date.now();
          const cfg = opts.config === undefined
            ? { properties: [{ slug: 'sanford', name: 'Sanford Heart', uses_new_flow: true, is_selling: false,
                               theme: { primary: '#8a9380', secondary: '#845e46', radius: '0.25rem' } }] }
            : opts.config;
          return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(cfg)) });
        }
        if (u.indexOf('/checkout') > -1) {
          body = opts.signedOver ? Object.assign({}, SIGNED, opts.signedOver) : SIGNED;
        } else if (method === 'PATCH') {
          Object.keys(parsed || {}).forEach(k => { state[k] = parsed[k]; });
          body = { uuid: UUID, otp_locked: true, otp_lock_reason: 'moved past the details step' };
        } else {
          body = Object.assign({}, state);
        }
        /* A PATCH that takes time, so "checkout waits for the write" can be told apart
           from "checkout happened to be called second". With an instant mock the two
           are indistinguishable and the test proved nothing. */
        const delay = (opts.slowPatch && method === 'PATCH') ? 150 : 0;
        return new Promise(res => setTimeout(() => {
          entry.done = Date.now();
          res({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) });
        }, delay));
      };
      w.HTMLFormElement.prototype.submit = function () {
        submits.push({
          action: this.action, method: (this.method || '').toUpperCase(),
          pairs: Array.from(this.querySelectorAll('input')).map(i => [i.name, i.value])
        });
      };
    }
  });
  const w = dom.window;
  w.eval(SRC);
  const $ = s => w.document.querySelector(s);
  const shown = s => { const e = $(s); return e && e.style.display !== 'none'; };
  return { w, d: w.document, calls, submits, logs, warns, $, shown };
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const field = (b, name) => b.$('[data-hl-field="' + name + '"]');
const stepShown = (b, name) => b.shown('[data-hl-step="' + name + '"]');

(async () => {
  /* ------------------------------------------------------------ display */
  {
    const b = boot({ search: "?r=" + UUID + "&hl_debug=1" });
    await wait(40);
    ok("renders a text path", b.$('[data-hl="unit.name"]').textContent === "Sanford Heart 06");
    ok("formats a _cents path as money",
       b.$('[data-hl="unit_price_cents"]').textContent === "R3,595,000.00");
    ok("formats the hold fee too",
       b.$('[data-hl="reservation_fee_cents"]').textContent === "R3,000.00");
    ok("a null money value shows an em dash, not R0.00",
       b.$('[data-hl="purchase_deposit_cents"]').textContent === "—");
    ok("an unknown path LEAVES the designed copy alone",
       b.$('[data-hl="unit.nonexistent_field"]').textContent === "Designed fallback copy");
    ok("and says so in debug", b.logs.some(l => l.indexOf('no such path') > -1));
  }

  /* ------------------------------------------------------------ show / hide / attr */
  {
    const b = boot();
    await wait(40);
    ok("data-hl-show hides when the value is null", !b.shown('[data-hl-show="otp_url"]'));
    ok("data-hl-hide shows when the value is null", b.shown('[data-hl-hide="otp_url"]'));
  }
  {
    const b = boot({ resOver: { otp_url: "https://sign.zoho.com/x?y=1" } });
    await wait(40);
    ok("data-hl-show reveals when the value arrives", b.shown('[data-hl-show="otp_url"]'));
    ok("data-hl-attr sets the href",
       b.$('[data-hl-attr]').getAttribute('href') === "https://sign.zoho.com/x?y=1");
    ok("and the paired hide is hidden", !b.shown('[data-hl-hide="otp_url"]'));
  }

  /* ------------------------------------------------------------ inputs */
  {
    const b = boot();
    await wait(40);
    ok("inputs are populated from the reservation", field(b, 'first_name').value === "Daniel");
    ok("an empty stored value gives an empty input", field(b, 'work_phone').value === "");
  }

  /* ------------------------------------------------------------ theming */
  {
    const b = boot();
    await wait(40);
    ok("the theme follows the loaded reservation",
       b.d.documentElement.getAttribute('data-hl-property') === 'sanford');
  }
  {
    const b = boot({ resOver: { property_slug: "polaris" } });
    await wait(60);
    ok("a refused property never gets to theme the page",
       b.d.documentElement.getAttribute('data-hl-property') === null);
  }

  /* ------------------------------------------------------------ steps */
  {
    const b = boot();
    await wait(40);
    ok("starts on the unit step", stepShown(b, 'unit'));
    ok("and only that step is shown",
       !stepShown(b, 'details') && !stepShown(b, 'pay') && !stepShown(b, 'done'));
    b.$('[data-hl-goto="details"]').click();
    await wait(60);
    ok("continues to details", stepShown(b, 'details') && !stepShown(b, 'unit'));
    ok("progress marks the current step",
       b.$('[data-hl-progress="details"]').classList.contains('is-active'));
    ok("and marks the earlier one done",
       b.$('[data-hl-progress="unit"]').classList.contains('is-done'));
  }

  /* ------------------------------------------------------------ writing */
  {
    const b = boot();
    await wait(40);
    /* Fill the non-writable input with a REAL-LOOKING price. Left empty it is dropped
       by the empty-value rule anyway, so the whitelist would look effective while
       doing nothing - the guard that matters most would have been untested. */
    field(b, 'total_cents').value = "999";
    field(b, 'phone').value = "+27604860722";
    field(b, 'phone').dispatchEvent(new b.w.Event('input', { bubbles: true }));
    await wait(200);
    ok("typing does not PATCH immediately",
       b.calls.filter(c => c.method === 'PATCH').length === 0);
    await wait(800);
    const patches = b.calls.filter(c => c.method === 'PATCH');
    ok("it PATCHes after the debounce", patches.length === 1);
    ok("carrying the typed value", patches[0].body.phone === "+27604860722");
    ok("and a filled price field is STILL not sent",
       !('total_cents' in patches[0].body) && !('unit_price_cents' in patches[0].body)
       && !('uuid' in patches[0].body));
    ok("nothing outside the whitelist reached the body",
       Object.keys(patches[0].body).every(k => k === 'last_step' || b.w.HL.writable.indexOf(k) > -1));
    ok("a field outside the whitelist is refused",
       b.warns.some(x => x.indexOf('not a writable field') > -1));
  }

  /* ------------------------------------------------------------ required */
  {
    const b = boot({ resOver: { first_name: "", last_name: "", email: "", payer_route: "", buyer_type: "", id_number: "" } });
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    await wait(60);
    b.$('[data-hl-goto="pay"]').click();
    await wait(60);
    ok("an incomplete step will not advance", !stepShown(b, 'pay'));
    ok("and each empty box says what it wants, in words",
       b.$('[data-hl-error="first_name"]').textContent === "Please enter your first name.");
    ok("a label that reads as a question carries its own wording",
       b.$('[data-hl-error="payer_route"]').textContent === "Please tell us how you are paying.");
    ok("and a choice asks to be chosen, not entered",
       b.$('[data-hl-error="buyer_type"]').textContent === "Please choose your buying as.");
    ok("the field itself is marked invalid",
       field(b, 'first_name').classList.contains('is-invalid'));
    /* Lowercasing the whole label made "ID or registration number" into "id or
       registration number". Only the first letter is lowered, and not when the label
       opens with an acronym. */
    ok("an acronym in the label survives the sentence",
       b.$('[data-hl-error="id_number"]').textContent === "Please enter your ID or registration number.");
    ok("and the top line stops naming database columns",
       b.$('[data-hl-status]').textContent.indexOf('_') === -1);

    /* A complaint that stays up while the buyer is answering it is just noise. */
    field(b, 'first_name').focus();
    field(b, 'first_name').value = 'Daniel';
    field(b, 'first_name').dispatchEvent(new b.w.Event('input', { bubbles: true }));
    await wait(20);
    ok("and the message goes as soon as the box is filled",
       b.$('[data-hl-error="first_name"]').textContent === "");
    ok("and the field stops being marked invalid",
       !field(b, 'first_name').classList.contains('is-invalid'));
    ok("while the ones still empty keep theirs",
       b.$('[data-hl-error="email"]').textContent !== "");
    ok("nothing was confirmed",
       b.calls.filter(c => c.method === 'PATCH' && c.body.last_step === 'confirm').length === 0);
  }

  /* --------------------------------------- the stale-OTP guard: flush before confirm */
  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    await wait(60);
    field(b, 'payer_route').value = "cash";
    field(b, 'payer_route').dispatchEvent(new b.w.Event('change', { bubbles: true }));
    // Click Confirm IMMEDIATELY - inside the debounce window, as a real buyer would.
    b.$('[data-hl-goto="pay"]').click();
    await wait(300);
    const patches = b.calls.filter(c => c.method === 'PATCH');
    const confirm = patches.filter(p => p.body.last_step === 'confirm');
    ok("exactly one confirm is sent", confirm.length === 1);
    ok("and it carries the edit made inside the debounce window",
       confirm.length === 1 && confirm[0].body.payer_route === "cash");
    ok("one write per navigation, not a back-to-back pair",
       patches.length === 2);
    // The cancelled debounce must not fire afterwards and re-send what was just saved.
    await wait(900);
    ok("and the cancelled debounce never lands a stray write",
       b.calls.filter(c => c.method === 'PATCH').length === 2);
    await wait(60);
    ok("then it advances", stepShown(b, 'pay'));
  }

  /* ------------------------------------------------------------ resume */
  {
    const b = boot({ resOver: { last_step: "confirm" } });
    await wait(60);
    ok("a reload resumes at the payment step", stepShown(b, 'pay'));
  }
  {
    const b = boot({ resOver: { last_step: "details" } });
    await wait(60);
    ok("and mid-flow it resumes at details", stepShown(b, 'details'));
  }

  /* ------------------------------------------------------------ checkout */
  {
    const b = boot({ resOver: { last_step: "confirm" } });
    await wait(60);
    b.$('[data-hl-action="checkout"]').click();
    await wait(80);
    ok("exactly one form is submitted", b.submits.length === 1);
    ok("to the process_url Xano returned",
       b.submits[0].action === "https://sandbox.payfast.co.za/eng/process");
    ok("carrying only the non-empty fields", b.submits[0].pairs.length === 11);
    ok("with signature last",
       b.submits[0].pairs[10][0] === 'signature');
    ok("and no empty field rode along", b.submits[0].pairs.every(p => p[1] !== ''));
  }
  {
    const b = boot({ resOver: { last_step: "confirm" }, signedOver: { amount: "9999.00" } });
    await wait(60);
    b.$('[data-hl-action="checkout"]').click();
    await wait(80);
    ok("a mismatched amount posts nothing", b.submits.length === 0);
    ok("and says so", b.$('[data-hl-status]').textContent.indexOf('amount mismatch') > -1);
  }

  /* ------------------------------------------------------------ refusals */
  {
    const b = boot({ resOver: { property_slug: "polaris" } });
    await wait(60);
    ok("a property that is not switched on is refused",
       b.warns.some(x => x.indexOf('not switched on') > -1));
    ok("and nothing renders from it", b.w.HL.get() === null);
  }
  {
    const b = boot({ search: "" });
    await wait(60);
    ok("no uuid fetches nothing", b.calls.length === 0);
    ok("and tells the buyer what to do",
       b.$('[data-hl-status]').textContent.indexOf('start again') > -1);
  }

  /* The other half of the gate: the flow must be inert on a page that has no steps,
     and the buyer-field helpers must still be there for anything that wants them. */
  {
    /* The URL carries a reservation, so WITHOUT the gate this page would fetch it.
       Zero fetches is the discriminator; "HL is undefined" alone was not, because a
       page with no reservation never reached that assignment anyway. */
    const seen = [];
    const dom = new (require('jsdom').JSDOM)('<!doctype html><html><body><p>nothing here</p></body></html>',
      { runScripts: "dangerously", url: "https://www.heartland.co.za/about?r=" + UUID,
        beforeParse(w) { w.fetch = (u) => { seen.push(String(u)); return Promise.resolve({
          ok: true, status: 200, text: () => Promise.resolve('{}') }); }; } });
    dom.window.eval(SRC);
    await wait(60);
    ok("the flow does nothing on a page with no steps", typeof dom.window.HL === 'undefined');
    ok("and fetches nothing, even with a reservation in the URL", seen.length === 0);
    ok("but the buyer-field helpers are still defined", typeof dom.window.HLBuyer === 'object');
  }

  /* ------------------------------------------------ latency (25 Aug) */
  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    /* No await: the step must already have moved. Waiting for the write before moving
       spent a round trip to Xano and back on a decision that was already made. */
    ok("the step changes without waiting for the write", stepShown(b, 'details'));
    await wait(80);
    ok("and the write still happens",
       b.calls.filter(c => c.method === 'PATCH').length === 1);
  }

  {
    const b = boot();
    await wait(40);
    const getsAfterLoad = b.calls.filter(c => c.method === 'GET').length;
    field(b, 'phone').focus();
    field(b, 'phone').value = '083 555 0000';
    field(b, 'phone').dispatchEvent(new b.w.Event('input', { bubbles: true }));
    await wait(1000);   // past the 800ms debounce
    ok("a typing save writes once", b.calls.filter(c => c.method === 'PATCH').length === 1);
    ok("and no longer re-reads the reservation after it",
       b.calls.filter(c => c.method === 'GET').length === getsAfterLoad);
    ok("but the page still knows what it saved", b.w.HL.get().phone === '083 555 0000');
  }

  {
    const b = boot();
    await wait(40);
    const before = b.calls.filter(c => c.method === 'GET').length;
    b.$('[data-hl-goto="details"]').click();
    await wait(60);
    b.$('[data-hl-goto="pay"]').click();
    await wait(120);
    ok("confirming DOES re-read - it is the last write before money",
       b.calls.filter(c => c.method === 'GET').length > before);
  }

  {
    const b = boot({ resOver: { last_step: "confirm" } });
    await wait(40);
    b.$('[data-hl-action="checkout"]').click();
    await wait(20);
    const btn = b.$('[data-hl-action="checkout"]');
    ok("the pay button goes busy the moment it is pressed",
       btn.classList.contains('res-busy'));
    ok("and says where the buyer is going", /Payfast/.test(btn.innerHTML));
    await wait(120);
    ok("and one press posts one form", b.submits.length === 1);
  }

  {
    const b = boot({ resOver: { last_step: "confirm" }, signedOver: { amount: "9999.00" } });
    await wait(40);
    b.$('[data-hl-action="checkout"]').click();
    await wait(120);
    ok("a refused checkout gives the button back",
       !b.$('[data-hl-action="checkout"]').classList.contains('res-busy'));
  }

  {
    /* The step moves ahead of its write on purpose, so an eager buyer can reach the pay
       button while the confirm PATCH is still in the air. Checkout reads the
       reservation server-side, so it is the one place that must catch up. */
    const b = boot({ slowPatch: true });
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    await wait(250);
    b.$('[data-hl-goto="pay"]').click();
    b.$('[data-hl-action="checkout"]').click();   // immediately, before the confirm lands
    await wait(600);
    const confirm = b.calls.filter(c => c.method === 'PATCH' && c.body.last_step === 'confirm')[0];
    const co = b.calls.filter(c => c.url.indexOf('/checkout') > -1)[0];
    ok("the buyer can press pay while the confirm write is still in the air",
       !!confirm && !!co);
    ok("and checkout does not start until that write has landed",
       !!confirm && !!co && confirm.done !== null && co.at >= confirm.done);
  }

  /* ------------------------------------------------ config-driven, 26 Aug */
  {
    const b = boot();
    await wait(60);
    ok("the property list comes from Xano", (b.w.HL.properties() || []).length === 1);
    ok("and the reservation renders", b.$('[data-hl="unit.name"]').textContent === "Sanford Heart 06");
    ok("the theme is set from the data, not from a CSS block",
       b.$('[data-hl-theme]').style.getPropertyValue('--hl-primary') === '#8a9380');
    ok("on the page's own wrapper, so an inline value beats a stale head block",
       b.w.document.documentElement.style.getPropertyValue('--hl-primary') === '');
    ok("a token the property did not set is left to the stylesheet fallback",
       b.$('[data-hl-theme]').style.getPropertyValue('--hl-line') === '');
    ok("config is read once, not once per render",
       b.calls.filter(c => c.url.indexOf('/public/config') > -1).length === 1);
  }

  {
    /* THE ONE THAT MATTERS. An outage must not put a property through a flow it has
       never been tested on - so a failed read falls back to a short list, never to
       "allow everything". */
    const b = boot({ configFails: true });
    await wait(60);
    ok("a failed config read still renders the property that was known good",
       b.$('[data-hl="unit.name"]').textContent === "Sanford Heart 06");
    ok("and says why it fell back",
       b.warns.some(x => x.indexOf('/public/config') > -1));
    ok("but it refuses everything else - it fails closed",
       b.w.HL.enabled('polaris') === false && b.w.HL.enabled('anything') === false);
  }

  {
    const b = boot({ config: { properties: [
      { slug: 'sanford', uses_new_flow: false, theme: null },
      { slug: 'polaris', uses_new_flow: true, theme: null }
    ] } });
    await wait(60);
    ok("a property switched OFF in the CMS is refused, whatever the constant says",
       b.w.HL.get() === null);
    ok("and a property switched ON in the CMS is allowed without a push",
       b.w.HL.enabled('polaris') === true);
  }

  {
    const b = boot({ config: { properties: [{ slug: 'sanford', uses_new_flow: true, theme: null }] } });
    await wait(60);
    ok("a property with no theme renders anyway", !!b.w.HL.get());
    ok("and sets no tokens, leaving the neutral palette",
       b.$('[data-hl-theme]').style.getPropertyValue('--hl-primary') === '');
  }

  const fails = A.filter(a => !a.pass);
  A.forEach(a => console.log((a.pass ? "  ok  " : "FAIL  ") + a.n));
  console.log("\n" + (A.length - fails.length) + "/" + A.length + " passed");
  process.exit(fails.length ? 1 : 0);
})();
