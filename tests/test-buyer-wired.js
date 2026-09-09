/* ============================================================================
   The buyer-field behaviours, as WIRED to the markup - and the done step.

   window.HLBuyer's rules were already tested as pure functions. This suite is about
   the part that was missing until 25 Aug: nothing on the Designer page ever called
   them. The module was loaded and inert, which is the failure mode this project
   keeps producing - present, well-formed, and doing nothing.

   Also covers coming back from Payfast, where the only honest source of "did the
   money arrive" is the reservation's own status. The query string is written by
   whoever built the link.
   ========================================================================== */
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
  uuid: UUID, reference: "HL-0001", status: "draft", last_step: "1", property_slug: "sanford",
  unit: { name: "Sanford Heart 06", unit_number: "06", price_display: "R3,595,000",
          unit_area: 272.34, price_cents: 359500000 },
  unit_price_cents: 359500000, addons_total_cents: 0, total_cents: 359500000,
  reservation_fee_cents: 300000, purchase_deposit_cents: null,
  first_name: "Daniel", last_name: "Lun", email: "daniel@tovstudio.co",
  phone: "071 000 0000", work_phone: "",
  buyer_type: "", id_number: "", dob: "", nationality: "", address: "",
  payer_route: "undecided", otp_url: null
};

const SUGGESTIONS = {
  features: [
    { properties: { housenumber: "1", street: "Main Road", city: "Cape Town", postcode: "8001", country: "South Africa" } },
    { properties: { housenumber: "2", street: "Main Road", city: "Cape Town", postcode: "8001", country: "South Africa" } }
  ]
};

/* Places answers through the Xano proxy. ok:false is the proxy saying it could not ask -
   no key, throttled, Google refused - and is the ONLY thing that falls back to Photon. */
const PLACES_OK = {
  ok: true, provider: "google", status: 200,
  suggestions: [
    { label: "17 Alice Road, Florida Park, Roodepoort, 1709, South Africa",
      main: "17 Alice Road", secondary: "Florida Park, Roodepoort, South Africa",
      place_id: "ChIJa1" },
    { label: "17 Alice Street, Sandton, 2196, South Africa",
      main: "17 Alice Street", secondary: "Sandton, South Africa", place_id: "ChIJa2" }
  ]
};
const PLACES_DOWN = {
  ok: false, provider: "none",
  reason: "GOOGLE_PLACES_KEY is not set in the Xano environment", suggestions: []
};

function boot(opts) {
  opts = opts || {};
  const calls = [], logs = [], warns = [];
  const dom = new JSDOM('<!doctype html><html><body>' + PAGE + '</body></html>', {
    runScripts: "dangerously",
    url: "https://www.heartland.co.za/reserve-flow" +
         (opts.search === undefined ? "?r=" + UUID : opts.search),
    beforeParse(w) {
      w.console.log = (...a) => logs.push(a.join(' '));
      w.console.warn = (...a) => warns.push(a.join(' '));
      let state = Object.assign({}, RES, opts.resOver || {});
      let gets = 0;
      w.fetch = (url, o) => {
        const method = (o && o.method) || 'GET';
        const u = String(url);
        const parsed = o && o.body ? JSON.parse(o.body) : null;
        calls.push({ url: u, method, body: parsed });
        let body;
        if (u.indexOf('/public/address/suggest') > -1) {
          /* Default DOWN, so every test written before Places existed keeps exercising
             the Photon path it was written against, and only the tests that opt in are
             asserting the new engine. */
          body = (opts.places === 'ok') ? PLACES_OK : PLACES_DOWN;
        } else if (u.indexOf('photon') > -1) {
          body = opts.noSuggest ? { features: [] } : SUGGESTIONS;
        } else if (method === 'PATCH') {
          Object.keys(parsed || {}).forEach(k => { state[k] = parsed[k]; });
          body = { uuid: UUID };
        } else {
          gets++;
          /* Lets a test say "the third read is when the ITN lands", which is what
             polling actually waits for. */
          if (opts.becomes && gets >= (opts.becomesAfter || 2)) {
            Object.assign(state, opts.becomes);
          }
          body = Object.assign({}, state);
        }
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify(body)),
          json: () => Promise.resolve(body)
        });
      };
      w.HTMLFormElement.prototype.submit = function () {};
    }
  });
  const w = dom.window;
  w.eval(SRC);
  const $ = s => w.document.querySelector(s);
  const all = s => Array.from(w.document.querySelectorAll(s));
  const shown = s => { const e = $(s); return e && e.style.display !== 'none'; };
  return { w, d: w.document, calls, logs, warns, $, all, shown };
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const field = (b, name) => b.$('[data-hl-field="' + name + '"]');
const stepShown = (b, name) => b.shown('[data-hl-step="' + name + '"]');

/* Typing, as the browser reports it - INCLUDING the focus. renderInputs()
   deliberately skips the element the buyer is in, so a fixture that types without
   focusing lets an in-flight save wipe the value mid-test and then blames the code. */
function type(b, name, value) {
  const el = field(b, name);
  el.focus();
  el.value = value;
  el.dispatchEvent(new b.w.Event('input', { bubbles: true }));
}
function choose(b, name, value) {
  const el = field(b, name);
  el.focus();
  el.value = value;
  el.dispatchEvent(new b.w.Event('change', { bubbles: true }));
}

(async () => {
  /* --------------------------------------------- individual vs entity */
  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    await wait(40);

    ok("with no buyer type chosen, the individual-only block is hidden",
       !b.shown('[data-hl-only-for="individual"]'));
    ok("and the entity block is shown",
       b.shown('[data-hl-only-for="entity"]'));

    choose(b, 'buyer_type', 'individual');
    await wait(20);
    ok("choosing an individual reveals the individual-only block",
       b.shown('[data-hl-only-for="individual"]'));
    ok("and hides the entity block",
       !b.shown('[data-hl-only-for="entity"]'));

    choose(b, 'buyer_type', 'company');
    await wait(20);
    ok("choosing a company hides it again",
       !b.shown('[data-hl-only-for="individual"]'));
  }

  /* --------------------------------------------- SA ID -> date of birth */
  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    choose(b, 'buyer_type', 'individual');
    type(b, 'id_number', '8501015800088');
    await wait(20);
    ok("a valid SA ID fills the date of birth", field(b, 'dob').value === "1985-01-01");
    ok("and says nothing, because there is nothing wrong",
       b.$('[data-hl-id-hint]').textContent === "");

    /* A two-digit year alone cannot say which century. A buyer is at least 18. */
    type(b, 'id_number', '0501015800086');
    await wait(20);
    ok("a year that would make them a child is read as the previous century",
       field(b, 'dob').value === "2005-01-01");
  }

  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    choose(b, 'buyer_type', 'company');
    type(b, 'id_number', '2019/123456/07');
    await wait(20);
    ok("a company registration number never becomes a date of birth",
       field(b, 'dob').value === "");
    ok("and no complaint is made about it, because it is not an ID",
       b.$('[data-hl-id-hint]').textContent === "");
  }

  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    choose(b, 'buyer_type', 'individual');
    type(b, 'id_number', '85010158');
    await wait(20);
    ok("a half-typed ID is called out", /13-digit/.test(b.$('[data-hl-id-hint]').textContent));
    ok("and nothing is guessed from it", field(b, 'dob').value === "");
  }

  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    choose(b, 'buyer_type', 'individual');
    type(b, 'id_number', '8501015800085');      // last digit wrong
    await wait(20);
    ok("a failed check digit is reported",
       /last digit/.test(b.$('[data-hl-id-hint]').textContent));
    ok("but the date is still offered, because the date part is readable",
       field(b, 'dob').value === "1985-01-01");
  }

  /* THE ONE THAT MATTERS: a date the buyer typed is theirs. */
  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    choose(b, 'buyer_type', 'individual');
    type(b, 'dob', '1979-12-25');
    type(b, 'id_number', '8501015800088');
    await wait(20);
    ok("a date of birth the buyer typed is never overwritten",
       field(b, 'dob').value === "1979-12-25");
  }

  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    choose(b, 'buyer_type', 'individual');
    type(b, 'id_number', '8501015800088');
    await wait(20);
    type(b, 'id_number', '9002026000080');
    await wait(20);
    ok("but a date WE derived is replaced when the ID changes",
       field(b, 'dob').value === "1990-02-02");
  }

  /* The order that actually catches it: we fill the date, THEN the buyer corrects it,
     THEN the ID changes again. Without marking the date as theirs from that moment,
     the next ID keystroke quietly takes their correction away. */
  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    choose(b, 'buyer_type', 'individual');
    type(b, 'id_number', '8501015800088');
    await wait(20);
    type(b, 'dob', '1979-12-25');
    await wait(20);
    type(b, 'id_number', '9002026000080');
    await wait(20);
    ok("correcting a date we derived makes it theirs from then on",
       field(b, 'dob').value === "1979-12-25");
  }

  /* --------------------------------------------- hidden required fields */
  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    await wait(40);
    choose(b, 'buyer_type', 'company');
    type(b, 'id_number', '2019/123456/07');
    type(b, 'nationality', 'South African');
    type(b, 'address', '1 Main Road, Cape Town');
    choose(b, 'payer_route', 'cash');
    await wait(20);
    b.$('[data-hl-goto="pay"]').click();
    await wait(80);
    ok("a company buyer is not blocked by the date of birth they were never shown",
       stepShown(b, 'pay'));
  }

  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    await wait(40);
    choose(b, 'buyer_type', 'individual');
    type(b, 'nationality', 'South African');
    type(b, 'address', '1 Main Road, Cape Town');
    choose(b, 'payer_route', 'cash');
    await wait(20);
    b.$('[data-hl-goto="pay"]').click();
    await wait(80);
    ok("but an individual IS blocked by the one they can see", !stepShown(b, 'pay'));
    ok("and the empty box itself says so, in words",
       b.$('[data-hl-error="dob"]').textContent === "Please choose your date of birth.");
    ok("while a field they were never shown says nothing",
       b.$('[data-hl-error="work_phone"]').textContent === "");
  }

  /* --------------------------------------------- address suggestions */
  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    type(b, 'address', '1 Main Road Cape');
    await wait(400);
    const items = b.all('[data-hl-suggest-item]');
    ok("typing an address offers suggestions", items.length === 2);
    ok("and the list is actually shown, not merely populated",
       b.$('[data-hl-suggest-list]').style.display === "block");
    ok("and they read as an address", /Main Road, Cape Town/.test(items[0].textContent));

    items[0].dispatchEvent(new b.w.MouseEvent('click', { bubbles: true }));
    await wait(20);
    ok("picking one fills the field",
       field(b, 'address').value.indexOf('Main Road') > -1);
    ok("and the list is put away",
       b.all('[data-hl-suggest-item]').length === 0 &&
       b.$('[data-hl-suggest-list]').style.display === "none");
  }

  {
    const b = boot({ noSuggest: true });
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    type(b, 'address', '1 Main Road Cape');
    await wait(400);
    ok("a lookup that finds nothing leaves the buyer typing",
       b.all('[data-hl-suggest-item]').length === 0 &&
       field(b, 'address').value === '1 Main Road Cape');
  }

  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    type(b, 'address', 'abc');
    await wait(400);
    ok("a term too short to mean anything is not sent",
       b.calls.filter(c => c.url.indexOf('photon') > -1).length === 0);
    ok("and not to Places either - every keystroke there is billable",
       b.calls.filter(c => c.url.indexOf('/public/address/suggest') > -1).length === 0);
  }

  /* ------------------------------------- Places first, Photon as the fallback */
  {
    const b = boot({ places: 'ok' });
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    type(b, 'address', '17 Alice Road');
    await wait(400);

    const asked = b.calls.filter(c => c.url.indexOf('/public/address/suggest') > -1);
    ok("Places is asked first", asked.length === 1, asked.length);
    const askedUrl = asked[0] ? asked[0].url : "";
    ok("with the term", /q=17(%20|\+)Alice/.test(askedUrl), askedUrl);
    ok("and a session token", /session=/.test(askedUrl), askedUrl);
    ok("Photon is not asked at all when Places answered",
       b.calls.filter(c => c.url.indexOf('photon') > -1).length === 0);

    const items = b.all('[data-hl-suggest-item]');
    ok("its suggestions are drawn", items.length === 2, items.length);
    ok("and read as a South African address",
       /Florida Park, Roodepoort/.test(items[0].textContent), items[0] && items[0].textContent);

    /* A licence condition, not a courtesy - predictions shown outside a Google map. */
    const note = b.$('[data-hl-suggest-note]');
    ok("the Google attribution is shown", !!note && note.textContent === "Powered by Google",
       note && note.textContent);
    ok("and it is not selectable as an address",
       !!note && !note.hasAttribute('data-hl-suggest-item'));

    items[1].dispatchEvent(new b.w.MouseEvent('click', { bubbles: true }));
    await wait(20);
    /* The WHOLE label. Reading it back off the DOM would pick up the attribution row
       and any stray text node in the item. */
    ok("picking one puts the full address in the field",
       field(b, 'address').value === "17 Alice Street, Sandton, 2196, South Africa",
       field(b, 'address').value);
  }

  {
    const b = boot({ places: 'down' });
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    type(b, 'address', '1 Main Road Cape');
    await wait(400);

    ok("a proxy that cannot ask falls back to Photon",
       b.calls.filter(c => c.url.indexOf('photon') > -1).length === 1);
    ok("and the buyer still gets suggestions",
       b.all('[data-hl-suggest-item]').length === 2);
    /* The half that makes the attribution test above mean something: Photon's results
       must NOT carry Google's name. */
    ok("with no Google attribution on somebody else's data",
       !b.$('[data-hl-suggest-note]'));
  }

  {
    const b = boot({ places: 'down' });
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    type(b, 'address', '1 Main Road Cape');
    await wait(400);
    type(b, 'address', '1 Main Road Cape Town');
    await wait(400);
    /* Retired for a minute after a refusal, so a page whose key is unset asks once
       rather than on every keystroke. Photon keeps answering throughout. */
    ok("Places is not asked again after it refused",
       b.calls.filter(c => c.url.indexOf('/public/address/suggest') > -1).length === 1,
       b.calls.filter(c => c.url.indexOf('/public/address/suggest') > -1).length);
    ok("but Photon is",
       b.calls.filter(c => c.url.indexOf('photon') > -1).length === 2,
       b.calls.filter(c => c.url.indexOf('photon') > -1).length);
  }

  /* --------------------------------------------- required marks */
  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    await wait(60);
    const starred = f => {
      const box = b.$('[data-hl-error="' + f + '"]');
      let n = field(b, f), wrap = null;
      while (n) { if (n.contains && n.contains(box)) { wrap = n; break; } n = n.parentNode; }
      return !!(wrap && wrap.querySelector('.hl-req'));
    };
    ok("required fields are marked", starred('first_name') && starred('email'));
    ok("and the one optional field is not", !starred('work_phone'));
    ok("the mark comes from the rule, not from someone typing an asterisk",
       b.all('.hl-req').length === b.all('[data-hl-field][data-hl-required]').length);
  }

  /* --------------------------------------------- the date picker is bounded */
  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    await wait(60);
    const dob = field(b, 'dob');
    const thisYear = new Date().getFullYear();
    ok("the date of birth is a real date picker", dob.type === 'date');
    ok("nobody under eighteen can be picked",
       Number(String(dob.getAttribute('max')).slice(0, 4)) === thisYear - 18);
    ok("and the year 0219 cannot be typed into it",
       Number(String(dob.getAttribute('min')).slice(0, 4)) === thisYear - 120);
  }

  /* --------------------------------------------- the search is bounded */
  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    type(b, 'address', '17 Alice Road');
    await wait(400);
    const hit = b.calls.filter(c => c.url.indexOf('photon') > -1)[0];
    ok("the address search is bounded to South Africa", !!hit && /bbox=/.test(hit.url));
    ok("and biased towards where the developments are",
       !!hit && /lat=-25\.75/.test(hit.url) && /lon=28\.19/.test(hit.url));
  }

  /* --------------------------------------------- returning from Payfast */
  {
    const b = boot({ search: "?r=" + UUID + "&payment=success",
                     resOver: { status: "awaiting_payment", last_step: "confirm" },
                     becomes: { status: "confirmed" }, becomesAfter: 3 });
    await wait(60);
    ok("coming back from Payfast lands on the done step", stepShown(b, 'done'));
    ok("and does not claim success yet",
       b.$('[data-hl="status"]').textContent === "awaiting_payment");
    await wait(6000);
    ok("it keeps asking until the ITN lands",
       b.$('[data-hl="status"]').textContent === "confirmed");
    ok("and then stops asking", b.w.HL.polls() < 24);
  }

  {
    const b = boot({ search: "?r=" + UUID + "&payment=success",
                     resOver: { status: "draft", last_step: "confirm" } });
    await wait(60);
    ok("a forged success parameter still shows the real status",
       b.$('[data-hl="status"]').textContent === "draft");
    ok("and nothing is confirmed by a query string",
       b.calls.filter(c => c.method === 'PATCH').length === 0);
  }

  {
    const b = boot({ search: "?r=" + UUID + "&payment=cancel",
                     resOver: { status: "awaiting_payment", last_step: "confirm" } });
    await wait(60);
    ok("a cancelled payment goes back to the payment step", stepShown(b, 'pay'));
    ok("and says the home is still held",
       /still held/.test(b.$('[data-hl-status]').textContent));
  }

  {
    const b = boot({ search: "?r=" + UUID + "&payment=success",
                     resOver: { status: "payment_failed", last_step: "confirm" } });
    await wait(60);
    ok("a failed payment says so plainly",
       /did not go through/.test(b.$('[data-hl-status]').textContent));
    ok("and says nothing was charged",
       /Nothing has been charged/.test(b.$('[data-hl-status]').textContent));
  }

  {
    const b = boot({ resOver: { status: "confirmed", last_step: "confirm" } });
    await wait(60);
    ok("a confirmed reservation reopens on the done step, with no parameter at all",
       stepShown(b, 'done'));
  }

  /* --------------------------------------------- Enter inside the Webflow form */
  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    await wait(60);
    choose(b, 'buyer_type', 'company');
    type(b, 'id_number', '2019/123456/07');
    type(b, 'nationality', 'South African');
    type(b, 'address', '1 Main Road, Cape Town');
    choose(b, 'payer_route', 'cash');
    await wait(20);

    let navigated = false;
    b.$('[data-hl-step="details"] form').addEventListener('submit', () => { navigated = true; }, false);
    const ev = new b.w.Event('submit', { bubbles: true, cancelable: true });
    b.$('[data-hl-step="details"] form').dispatchEvent(ev);
    await wait(120);

    ok("Enter never lets the Webflow form submit", ev.defaultPrevented);
    ok("and it does not reach Webflow's own handler either", navigated === false);
    ok("instead it does what the buyer meant and moves on", stepShown(b, 'pay'));
  }

  {
    const b = boot();
    await wait(40);
    b.$('[data-hl-goto="details"]').click();
    await wait(60);
    const ev = new b.w.Event('submit', { bubbles: true, cancelable: true });
    b.$('[data-hl-step="details"] form').dispatchEvent(ev);
    await wait(120);
    ok("an incomplete step still refuses to move on Enter", !stepShown(b, 'pay'));
  }

  /* --------------------------------------------- the marker, not the query string */
  {
    /* No ?payment= at all: the return URL is built and signed in Xano and has been
       changed once already. The page must not depend on it. */
    const b = boot({ search: "?r=" + UUID,
                     resOver: { status: "awaiting_payment", last_step: "confirm" },
                     becomes: { status: "confirmed" }, becomesAfter: 3 });
    b.w.localStorage.setItem("hl_v2_paying", UUID + "|" + Date.now());
    await wait(60);
    ok("a browser that just paid lands on done with no query string at all",
       stepShown(b, 'done'));
    await wait(6000);
    ok("and waits for the ITN the same way",
       b.$('[data-hl="status"]').textContent === "confirmed");
    ok("then forgets it paid, so a later visit is not stuck waiting",
       !b.w.localStorage.getItem("hl_v2_paying"));
  }

  {
    const b = boot({ search: "?r=" + UUID,
                     resOver: { status: "awaiting_payment", last_step: "confirm" } });
    b.w.localStorage.setItem("hl_v2_paying", UUID + "|" + (Date.now() - 31 * 60 * 1000));
    await wait(60);
    ok("a stale marker is ignored - an abandoned payment does not haunt the page",
       !stepShown(b, 'done') && stepShown(b, 'pay'));
  }

  {
    const b = boot({ search: "?r=" + UUID,
                     resOver: { status: "awaiting_payment", last_step: "confirm" } });
    b.w.localStorage.setItem("hl_v2_paying", "some-other-reservation|" + Date.now());
    await wait(60);
    ok("and a marker for a different reservation is not mine", !stepShown(b, 'done'));
  }

  /* --------------------------------------------- and still inert elsewhere */
  {
    const dom = new JSDOM('<!doctype html><html><body><div>nothing</div></body></html>',
      { runScripts: "dangerously", url: "https://www.heartland.co.za/polaris?r=" + UUID });
    let fetched = 0;
    dom.window.fetch = () => { fetched++; return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("{}") }); };
    dom.window.eval(SRC);
    await wait(40);
    ok("none of this runs on a page with no steps", fetched === 0);
  }

  const bad = A.filter(a => !a.pass);
  A.forEach(a => console.log((a.pass ? '  ok  ' : 'FAIL  ') + a.n));
  console.log('\n' + (A.length - bad.length) + '/' + A.length + ' passed');
  process.exit(bad.length ? 1 : 0);
})();
