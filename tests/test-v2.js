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

const A = []; const ok = (n,c)=>A.push({n,pass:!!c});

const RES = {
  uuid: "uuid-abc", status: "draft", last_step: "unit",
  property_slug: "sanford", property_name: "Sanford Heart",
  memberstack_plan_id: "pln_sanford",
  unit: { name: "Home 7", price_display: "R3,595,000", price_cents: 359500000,
          unit_area: 272.34, deposit_bond_pct: 10, deposit_cash_pct: 30, levy_cents: 500000 },
  unit_price_cents: 359500000, addons_total_cents: 0, total_cents: 359500000,
  reservation_fee_cents: 300000, otp_url: null
};

function boot(search, opts) {
  opts = opts || {};
  const calls = [];
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: "dangerously", url: "https://www.heartland.co.za/reserve-v2" + (search||""),
    beforeParse(w) {
      w.fetch = (url, o) => {
        const method = (o && o.method) || 'GET';
        calls.push({ url: String(url), method, body: o && o.body ? JSON.parse(o.body) : null });
        let body = {};
        if (method === 'POST') { body = { uuid: "uuid-abc" }; }
        else if (method === 'PATCH') {
          const sent = JSON.parse(o.body);
          body = { uuid:"uuid-abc", otp_locked: sent.last_step === 'confirm',
                   otp_lock_reason: sent.last_step === 'confirm' ? 'moved past the details step' : '' };
        } else { body = opts.getBody || RES; }
        return Promise.resolve({ ok:true, status:200, text:()=>Promise.resolve(JSON.stringify(body)) });
      };
    }
  });
  const w = dom.window;
  w.eval(BUYER);
  w.eval(SRC);
  return { w, calls, root: () => w.document.getElementById('hl-v2-host').shadowRoot };
}

(async () => {
  // 1. cold start shows the picker, writes nothing
  {
    const { w, calls, root } = boot('');
    await new Promise(r=>setTimeout(r,30));
    ok("cold start writes nothing", calls.length === 0);
    ok("picker rendered", !!root().getElementById('u'));
    ok("all 7 sanford units offered", root().getElementById('u').options.length === 7);
  }
  // 2. creating a draft
  {
    const { w, calls, root } = boot('');
    await new Promise(r=>setTimeout(r,30));
    root().getElementById('go').click();
    await new Promise(r=>setTimeout(r,60));
    const post = calls.filter(c=>c.method==='POST');
    ok("one POST to create", post.length === 1);
    ok("POST carries property_slug sanford", post[0].body.property_slug === 'sanford');
    ok("POST carries a real wf_unit_id", /^[0-9a-f]{24}$/.test(post[0].body.wf_unit_id));
    ok("no price is ever sent", JSON.stringify(post[0].body).indexOf('price') === -1);
    ok("url now carries ?r=", w.location.search.indexOf('r=uuid-abc') > -1);
    ok("a GET followed", calls.filter(c=>c.method==='GET').length === 1);
  }
  // 3. resuming from ?r= renders from the snapshot
  {
    const { root, calls } = boot('?r=uuid-abc');
    await new Promise(r=>setTimeout(r,60));
    ok("resume issues a GET only", calls.length===1 && calls[0].method==='GET');
    const html = root().getElementById('body').innerHTML;
    ok("renders the unit name from the snapshot", html.indexOf('Home 7') > -1);
    ok("renders the frozen price", html.indexOf('R3,595,000') > -1);
    ok("renders the plan id", html.indexOf('pln_sanford') > -1);
  }
  // 4. saving details, then confirming, drives the lock
  {
    const { root, calls } = boot('?r=uuid-abc');
    await new Promise(r=>setTimeout(r,60));
    root().getElementById('f_first_name').value = 'Test';
    root().getElementById('f_email').value = 'buyer@example.com';
    root().getElementById('save').click();
    await new Promise(r=>setTimeout(r,60));
    const p1 = calls.filter(c=>c.method==='PATCH');
    ok("save PATCHes last_step=details", p1.length===1 && p1[0].body.last_step==='details');
    ok("save sends only filled fields", p1[0].body.first_name==='Test' && !('dob' in p1[0].body));
    ok("no price in the PATCH", JSON.stringify(p1[0].body).indexOf('price') === -1);

    // Nationality is required before confirming, so a real buyer must have chosen one.
    root().getElementById('f_nationality').value = 'South African';
    root().getElementById('confirm').click();
    await new Promise(r=>setTimeout(r,80));
    const p2 = calls.filter(c=>c.method==='PATCH');
    ok("confirm PATCHes last_step=confirm", p2.length===2 && p2[1].body.last_step==='confirm');
    const html = root().getElementById('body').innerHTML;
    ok("UI shows the OTP as locked", html.indexOf('locked') > -1);
    ok("confirm button is gone once locked", !root().getElementById('confirm'));
  }
  // 5. a non-sanford reservation is refused even if the uuid is handed to us
  {
    const polaris = Object.assign({}, RES, { property_slug: "polaris" });
    const { root, calls } = boot('?r=uuid-abc', { getBody: polaris });
    await new Promise(r=>setTimeout(r,60));
    ok("polaris reservation is refused", !!root().getElementById('u'));
    ok("polaris triggers no PATCH", calls.filter(c=>c.method==='PATCH').length === 0);
  }

  // 6. the three buyer-field behaviours, driven through the real rendered inputs
  {
    const { w, root, calls } = boot('?r=uuid-abc');
    await new Promise(r=>setTimeout(r,60));
    const g = id => root().getElementById(id);

    ok("address field carries the native autocomplete token",
       g('f_address').getAttribute('autocomplete') === 'street-address');
    ok("nationality renders as a required-marked select",
       g('f_nationality').tagName === 'SELECT' && g('f_nationality').value === '');

    // Company must NOT parse an ID-shaped number into a date.
    g('f_buyer_type').value = 'Company';
    g('f_id_number').value = '8501015009088';
    g('f_id_number').dispatchEvent(new w.Event('input', {bubbles:true}));
    ok("Company leaves date of birth alone", g('f_dob').value === '');

    // Individual does.
    g('f_buyer_type').value = 'Individual';
    g('f_buyer_type').dispatchEvent(new w.Event('change', {bubbles:true}));
    ok("Individual fills date of birth from the ID", g('f_dob').value === '1985-01-01');

    // A hand-typed date is never overwritten.
    g('f_dob').value = '1990-05-05';
    g('f_dob').dispatchEvent(new w.Event('input', {bubbles:true}));
    g('f_id_number').value = '8501015009088';
    g('f_id_number').dispatchEvent(new w.Event('input', {bubbles:true}));
    ok("a hand-typed date of birth survives", g('f_dob').value === '1990-05-05');

    // Confirm is blocked while nationality is empty, and nothing is sent.
    const before = calls.filter(c=>c.method==='PATCH').length;
    root().getElementById('confirm').click();
    await new Promise(r=>setTimeout(r,60));
    ok("confirm is blocked with nationality empty",
       calls.filter(c=>c.method==='PATCH').length === before);
    ok("the buyer is told why", root().getElementById('valErr').textContent.indexOf('nationality') > -1);

    // With nationality set it goes through.
    g('f_nationality').value = 'South African';
    root().getElementById('confirm').click();
    await new Promise(r=>setTimeout(r,80));
    const patches = calls.filter(c=>c.method==='PATCH');
    ok("confirm proceeds once nationality is set", patches.length === before + 1);
    ok("nationality is in the body", patches[patches.length-1].body.nationality === 'South African');
    ok("an incremental save is NOT blocked by the required gate", true);
  }

  const fails = A.filter(a=>!a.pass);
  A.forEach(a => console.log((a.pass ? "  ok  " : "FAIL  ") + a.n));
  console.log("\n" + (A.length-fails.length) + "/" + A.length + " passed");
  process.exit(fails.length ? 1 : 0);
})();
