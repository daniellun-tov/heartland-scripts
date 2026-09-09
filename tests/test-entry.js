const fs = require('fs');
const { JSDOM } = require('jsdom');
/* PATHS RESOLVE FROM THIS FILE, never from an absolute scratch path. This suite spent a
   fortnight in /tmp on a session container, reading its bundle out of a directory that did
   not exist anywhere else - so it was one container reclaim from gone, and runnable by
   nobody but the session that wrote it. Ported into the repo 9 Sep 2026. */
const ROOT = require("path").join(__dirname, "..");
const FIX = require("path").join(__dirname, "fixtures");
const SRC = fs.readFileSync(ROOT + "/heartland-reserve.js", 'utf8');

const A = []; const ok = (n, c) => A.push({ n, pass: !!c });
const U6 = "69ff23e1a8c32616152cb820";

/* The form as the CMS actually makes it: the hidden unit field carries the unit-id
   COLUMN, which for six of the seven Sanford units is a placeholder string and for one
   is null. No Webflow item id appears anywhere. That is precisely why v2 - which
   matched against the seven item ids - would have failed, and why nothing in the
   browser is allowed to have an opinion about which field matters any more. */
function page(opts) {
  opts = opts || {};
  const unit = opts.unitId === undefined ? "sanford-heart-06-placeholder" : opts.unitId;
  const marker = opts.noMarker ? "" :
    `<div data-hl-entry="${opts.property === undefined ? 'sanford' : opts.property}"` +
    (opts.target ? ` data-hl-target="${opts.target}"` : "") + `></div>`;
  return `<!doctype html><html><body>
    ${marker}
    <form id="reservation-form">
      <input type="radio" name="whatever" data-mystery-attr="x">
      <input type="hidden" name="unit-id" value="${unit}">
      <input type="hidden" name="property-ref" value="69ff2337ec508fa32d059918">
      <input type="hidden" name="First-Name" value="Daniel">
      <input type="hidden" name="Email" value="daniel@tovstudio.co">
      <input type="hidden" name="Notes" value="${'x'.repeat(400)}">
      <input type="submit">
    </form>
    <form id="other-form"><input type="submit"></form>
  </body></html>`;
}

async function boot(search, opts) {
  opts = opts || {};
  const calls = [], logs = [], warns = [];
  const legacy = { ran: false };
  const dom = new JSDOM(page(opts), {
    runScripts: "dangerously",
    url: "https://" + (opts.host || "www.heartland.co.za") + "/sanford-heart-dev" + (search || ""),
    beforeParse(w) {
      w.console.log = (...a) => logs.push(a.join(' '));
      w.console.warn = (...a) => warns.push(a.join(' '));
      w.fetch = (url, o) => {
        calls.push({ url: String(url), method: (o && o.method) || 'GET', body: o && o.body ? JSON.parse(o.body) : null });
        const delay = opts.slow ? 20000 : 10;
        return new Promise((res, rej) => setTimeout(() => {
          if (opts.networkError) { rej(new Error('offline')); return; }
          if (opts.refuses) {
            res({ ok: false, status: 400, text: () => Promise.resolve(JSON.stringify({
              message: "Could not identify the unit from this form. Fields received: whatever, unit-id"
            })) });
            return;
          }
          if (opts.emptyOk) { res({ ok: true, status: 200, text: () => Promise.resolve('{}') }); return; }
          res({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({
            uuid: "uuid-xyz", wf_unit_id: U6, resolved_by: "unit_id_text", units_considered: 7
          })) });
        }, delay));
      };
    }
  });
  const w = dom.window;
  const form = w.document.getElementById('reservation-form');

  /* heartland-sanford.js, verbatim in shape: a CAPTURE listener bound to the form that
     stops immediate propagation and redirects. It is registered HERE, before the entry
     script binds, because that is the harder ordering and the realistic one - his script
     comes from jsDelivr and this one from a Code Embed, in no guaranteed order. Only a
     capture listener on DOCUMENT beats a capture listener on the form either way. */
  form.addEventListener('submit', function (e) {
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    legacy.ran = true;
  }, true);

  w.eval(SRC);
  for (let i = 0; i < 50 && typeof w.HLEntry === 'undefined'; i++) { await new Promise(r => setTimeout(r, 5)); }
  // With no marker the entry module deliberately never binds, so HLEntry stays absent.
  if (typeof w.HLEntry === 'undefined' && !opts.noMarker && opts.property !== '') {
    throw new Error('never bound');
  }

  return {
    w, calls, logs, warns, legacy, doc: w.document, form,
    submit: () => {
      const ev = new w.Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(ev); return ev;
    }
  };
}
const said = (lines, frag) => lines.some(l => l.indexOf(frag) > -1);
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1. nothing happens until the buyer submits - v3 dropped the optimistic pre-create,
  //    because it depended on the same selectors that never matched.
  {
    const b = await boot('?hl_debug=1');
    await wait(60);
    ok("creates nothing on page load", b.calls.length === 0);
  }

  // 2. THE CASE BOTH EARLIER VERSIONS GOT WRONG: no item id in the form at all.
  {
    const b = await boot('?hl_debug=1');
    const ev = b.submit();
    ok("takes the submit over", ev.defaultPrevented === true && b.legacy.ran === false);
    await wait(80);
    ok("posts to the from-form endpoint", b.calls.length === 1
      && b.calls[0].url.indexOf('/public/reservations/from-form') > -1);
    const pairs = (b.calls[0] && b.calls[0].body.pairs) || [];
    const byKey = {}; pairs.forEach(p => { byKey[p.k] = p.v; });
    ok("sends the placeholder unit value the CMS actually holds",
      byKey['unit-id'] === 'sanford-heart-06-placeholder');
    ok("sends every other field too, with no opinion about which matters",
      byKey['property-ref'] === '69ff2337ec508fa32d059918' && byKey['First-Name'] === 'Daniel');
    ok("goes to reserve-v2 with the uuid the server returned",
      said(b.logs, 'going to /reserve-v2?r=uuid-xyz'));
  }

  /* ------------------------------------------- first-touch context */

  /* THE ONE FIELD THAT DOES REAL WORK. Xano turns origin_host into the reservation
     number's prefix - a deal made on the Webflow staging site becomes RES-TEST-SAN-001
     rather than RES-SAN-001. Absent means live on the server, so this send is the only
     thing that makes the TEST prefix appear at all. */
  {
    const b = await boot('?hl_debug=1');
    b.submit();
    await wait(80);
    const utm = b.calls[0].body.utm || {};
    ok("the host the buyer was on travels with the reservation",
       utm.origin_host === 'www.heartland.co.za');
  }

  {
    const b = await boot('?hl_debug=1&utm_source=meta&utm_campaign=sanford-launch&gclid=abc123');
    b.submit();
    await wait(80);
    const utm = b.calls[0].body.utm || {};
    ok("campaign parameters are picked up rather than thrown away",
       utm.utm_source === 'meta' && utm.utm_campaign === 'sanford-launch');
    ok("including the ad-click ids", utm.gclid === 'abc123');
    ok("and a parameter that was not on the url is simply absent, not empty",
       !('utm_medium' in utm));
    ok("the host still travels alongside them",
       utm.origin_host === 'www.heartland.co.za');
  }

  {
    /* THE CASE THE PREFIX EXISTS FOR. Staging is a real host, not a flag somebody
       remembers to set, so a rehearsal on webflow.io is marked as one without anybody
       doing anything. */
    const b = await boot('?hl_debug=1', { host: 'heartland-property.webflow.io' });
    b.submit();
    await wait(80);
    ok("a reservation made on staging says so",
       b.calls[0].body.utm.origin_host === 'heartland-property.webflow.io');
    ok("and it is what Xano matches on to add the TEST prefix",
       b.calls[0].body.utm.origin_host.indexOf('webflow.io') > -1);
  }

  /* 3. The buyer's own answers ARE sent now. The endpoint carries them into the
        reservation, so an email withheld here is an email typed twice. Only a runaway
        value is dropped, and only to keep the request from bloating. */
  {
    const b = await boot('?hl_debug=1');
    b.submit();
    await wait(80);
    const keys = ((b.calls[0] && b.calls[0].body.pairs) || []).map(p => p.k);
    ok("the email IS sent, so it never has to be typed again", keys.indexOf('Email') > -1);
    ok("the name goes with it", keys.indexOf('First-Name') > -1);
    ok("a runaway 400-character value is still dropped", keys.indexOf('Notes') === -1);
  }

  // 4. a refusal names the fields, WITHOUT hl_debug - one failed submit must be enough
  {
    const b = await boot('', { refuses: true });
    b.submit();
    await wait(120);
    ok("a 400 falls back to legacy", b.w.HLEntry.lastNavigation().indexOf('/reserve/1?') === 0 || b.w.HLEntry.lastNavigation().indexOf('heartland.co.za/reserve/1?') > -1);
    ok("and the server's field list reaches the console unprompted",
      said(b.warns, 'Fields received: whatever, unit-id'));
  }

  // 5. a 200 carrying no uuid is a FAILURE, not a success. This system's worst bugs have
  //    all been well-formed 200s that meant nothing.
  {
    const b = await boot('', { emptyOk: true });
    b.submit();
    await wait(120);
    ok("a 200 with no uuid is treated as a failure", said(b.warns, 'no uuid in a 200 response'));
    ok("and the buyer still moves", b.w.HLEntry.lastNavigation().indexOf('/reserve/1?') > -1);
  }

  // 6. network throws
  {
    const b = await boot('', { networkError: true });
    b.submit();
    await wait(120);
    ok("a network error falls back to legacy", said(b.warns, 'could not reach Xano'));
  }

  // 7. the legacy url is rebuilt byte for byte, including the +-to-%20 pass
  {
    const b = await boot('', { networkError: true });
    b.submit();
    await wait(120);
    const href = b.w.HLEntry.lastNavigation();
    ok("the legacy url carries the whole form", href.indexOf('unit-id=sanford-heart-06-placeholder') > -1);
    ok("with spaces as %20, exactly as heartland-sanford.js writes them",
      href.indexOf('+') === -1 && href.indexOf('Email=daniel%40tovstudio.co') > -1);
  }

  // 8. a hanging request must never strand the buyer
  {
    const b = await boot('', { slow: true });
    b.submit();
    await wait(8400);
    ok("a hanging create times out to legacy", said(b.warns, 'did not answer in 8000ms'));
  }

  // 9. an empty form
  {
    const b = await boot('', { unitId: '' });
    b.doc.getElementsByName('property-ref')[0].value = '';
    b.doc.getElementsByName('First-Name')[0].value = '';
    b.doc.getElementsByName('Email')[0].value = '';
    b.doc.getElementsByName('Notes')[0].value = '';
    b.submit();
    await wait(60);
    ok("a form with nothing usable goes legacy", said(b.warns, 'no usable fields'));
    ok("and nothing is created", b.calls.length === 0);
  }

  // 10. the escape hatch
  {
    const b = await boot('?hl_legacy=1');
    b.submit();
    await wait(60);
    ok("hl_legacy=1 lets their handler run untouched", b.legacy.ran === true && b.calls.length === 0);
  }

  // 11. an unrelated form
  {
    const b = await boot('');
    const other = b.doc.getElementById('other-form');
    const ev = new b.w.Event('submit', { bubbles: true, cancelable: true });
    other.dispatchEvent(ev);
    ok("another form is not intercepted", ev.defaultPrevented === false);
  }

  // 12. exactly one navigation, even though a timer is armed
  {
    const b = await boot('?hl_debug=1');
    b.submit();
    await wait(8400);
    const navs = b.logs.concat(b.warns).filter(l =>
      l.indexOf('going to') > -1 || l.indexOf('legacy') > -1 || l.indexOf('did not answer') > -1);
    ok("navigates exactly once", navs.length === 1);
  }

  // 13. probe() answers the question without leaving a row behind
  {
    const b = await boot('');
    const before = b.w.HLEntry.lastNavigation();
    const r = await b.w.HLEntry.probe();
    ok("probe asks for a dry run", b.calls.length === 1 && b.calls[0].body.dry_run === true);
    ok("probe returns the server's verdict", r && r.resolved_by === 'unit_id_text');
    ok("probe does not navigate", b.w.HLEntry.lastNavigation() === before && before === '');
  }

  /* 14. The gate. One bundle is loaded everywhere, so a page that has not asked for
         the entry point must get NOTHING - otherwise a Polaris brochure page would
         have its submit intercepted and a Sanford reservation filed. */
  {
    const b = await boot('', { noMarker: true });
    b.submit();
    await wait(80);
    /* defaultPrevented is NOT the signal here - the stubbed legacy handler prevents
       too. What proves the gate is that the legacy handler RAN (so nothing stopped
       propagation) and that nothing was created. */
    ok("a page with no marker leaves the legacy handler running", b.legacy.ran === true);
    ok("and nothing is created", b.calls.length === 0);
    ok("and the entry point does not even expose itself", typeof b.w.HLEntry === 'undefined');
  }
  {
    const b = await boot('', { property: '' });
    b.submit();
    await wait(80);
    ok("a marker naming no property stands aside",
       b.legacy.ran === true && b.calls.length === 0);
    ok("and says why", b.warns.some(x => x.indexOf('names no property') > -1));
  }
  {
    const b = await boot('?hl_debug=1', { property: 'polaris' });
    b.submit();
    await wait(80);
    ok("the property comes from the marker, never hardcoded",
       b.calls[0] && b.calls[0].body.property_slug === 'polaris');
  }
  {
    const b = await boot('?hl_debug=1', { target: '/reserve-flow' });
    b.submit();
    await wait(80);
    ok("the destination is overridable from the page, so moving it needs no push",
       b.w.HLEntry.lastNavigation().indexOf('/reserve-flow?r=') === 0);
  }

  /* ------------------------------------------------ the loading state (25 Aug) */
  {
    const b = await boot('', { slow: true });
    const btn = b.form.querySelector('input[type="submit"]');
    const before = btn.value;
    b.submit();
    await wait(30);
    ok("submitting puts the button into the busy state", btn.classList.contains('res-busy'));
    ok("and it says what it is doing", /Reserving your home/.test(btn.value));
    ok("and it cannot be pressed again", btn.disabled === true);
    ok("the spinner styles are installed once",
       b.doc.querySelectorAll('#res-spinner-css').length === 1);
    ok("and the original label is kept so it can be put back",
       btn.getAttribute('data-res-original') === before);
  }

  {
    /* pointer-events stops a human double-click; this is the other way in. */
    const b = await boot('?hl_debug=1', { slow: true });
    b.submit();
    await wait(20);
    b.submit();
    b.submit();
    await wait(60);
    ok("a second submit files nothing - one buyer, one reservation",
       b.calls.filter(c => c.method === 'POST').length === 1);
    ok("and it is refused rather than ignored silently",
       said(b.logs, 'already submitting'));
  }

  {
    const b = await boot('', { noMarker: true });
    const btn = b.form.querySelector('input[type="submit"]');
    b.submit();
    await wait(60);
    ok("a page with no marker gets no busy state either - it is not ours to touch",
       !btn.classList.contains('res-busy'));
  }

  {
    const b = await boot('?hl_legacy=1', {});
    const btn = b.form.querySelector('input[type="submit"]');
    b.submit();
    await wait(60);
    ok("and the legacy escape hatch leaves the button alone",
       !btn.classList.contains('res-busy'));
  }

  const fails = A.filter(a => !a.pass);
  A.forEach(a => console.log((a.pass ? "  ok  " : "FAIL  ") + a.n));
  console.log("\n" + (A.length - fails.length) + "/" + A.length + " passed");
  process.exit(fails.length ? 1 : 0);
})();
