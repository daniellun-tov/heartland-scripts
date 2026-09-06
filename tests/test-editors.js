const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

/* THE BUILT BUNDLE IS WHAT IS TESTED, not the HTML it was built from. The console
   ships as one file on jsDelivr now, so testing the HTML would test a form of the
   console nobody loads - and would not catch a build that dropped the template or
   broke the bootstrap. The harness is the same four lines the Webflow page carries. */
const bundle = fs.readFileSync(require('path').join(__dirname, '..', 'heartland-console.js'), 'utf8');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>
<style>html,body{margin:0;padding:0;background:#f9f9f7}</style>
<div id="hl-console-host"></div>
<script>${bundle}</script>
</body></html>`;

const RES = {
  uuid: "u1", reference: "HL-001", status: "confirmed",
  deal_stage: "finance", deal_sub_stage: "sign-otp",
  deal_stage_changed_at: 1787000000000, deal_stage_due_at: 1788174317626,
  days_left: 5, overdue: false,
  property_slug: "sanford", property_name: "Sanford Heart",
  unit_name: "Heart 07", first_name: "Thandi", last_name: "Mokoena",
  email: "t@example.com", phone: "0821234567", payer_route: "bond",
  addons: [{ slug: "sanford-yale-smart-safe", name: "Smart Safe", price_cents: 523300 }],
  addon_count: 1, addons_total_cents: 523300,
  unit_price_cents: 350000000, total_cents: 350523300,
  reservation_fee_cents: 250000, purchase_deposit_cents: null,
  deposit_bond_pct: 10, deposit_cash_pct: 30,
  has_member: true, holds_unit: true, admin_notes: null, needs_attention: false,
  confirmed_at: 1787000000000, created_at: 1787000000000
};

const LIST = {
  staff: { id: 1, name: "Sipho N", role: "sales" },
  summary: { total: 1, by_status: { confirmed: 1 }, by_deal_stage: { finance: 1 },
    fees_collected_cents: 250000, confirmed_count: 1, awaiting_clearance: 0,
    needs_attention: 0, live_holds: 1, confirmed_without_stage: 0,
    purchase_deposit_outstanding_cents: 0, overdue: 0, due_soon: 0 },
  matched: 1, server_time: Date.now(), items: [RES],
  properties: [{ slug: "sanford", name: "Sanford Heart", is_payfast_live: false, is_selling: false }]
};

const CAT = { property_slug: "sanford", is_selling: false, sections: [
  { section_slug: "s2", section: "Yale Sanford", items: [
    { slug: "sanford-yale-smart-safe", display_name: "Smart Safe", price_cents: 523300, price_display: "R5 233.00", radio_group: null, sold_out: false },
    { slug: "sanford-yale-linus-smart-lock", display_name: "Linus L2 Smart Lock", price_cents: 499900, price_display: "R4 999.00", radio_group: null, sold_out: false },
    { slug: "sanford-yale-gone", display_name: "Discontinued Thing", price_cents: 100000, price_display: "R1 000.00", radio_group: null, sold_out: true }
  ]},
  { section_slug: "s3", section: "Solar Sanford", items: [
    { slug: "sanford-sa-5kw-solar-power-kit", display_name: "5kW Solar Power Kit", price_cents: 10867600, price_display: "R108 676.00", radio_group: "1", sold_out: false },
    { slug: "sanford-sa-8kw-solar-power-kit", display_name: "8kW Solar Power Kit", price_cents: 15303200, price_display: "R153 032.00", radio_group: "1", sold_out: false }
  ]}
]};

/* The staff catalogue for this deal: one option the catalogue prices, one it
   deliberately does not, one already agreed, and one whose stored price is absent. */
const OPTS = {
  uuid: "u1", property_slug: "sanford", unit_name: "Heart 07",
  signed_total_cents: 350523300, agreed_extras_total_cents: 4850000,
  agreed: [{ option_slug: "sanford-major-fireplace", name: "Fireplace", price_cents: 4850000,
             is_consultation_price: true, price_basis: "on_consultation", agreed_by: "Sipho N" }],
  removed: [],
  groups: [
    { slug: "major-upgrades", name: "Major upgrades", kind: "multi", options: [
      { slug: "sanford-major-garage", name: "Garage", price_cents: null, price_basis: "on_consultation", needs_price: true, is_agreed: false },
      { slug: "sanford-major-fireplace", name: "Fireplace", price_cents: null, price_basis: "on_consultation", needs_price: true, is_agreed: true },
      { slug: "sanford-broken", name: "Broken thing", price_cents: null, price_basis: "missing", needs_price: false, is_agreed: false }
    ]},
    { slug: "flooring", name: "Flooring", kind: "single", options: [
      { slug: "sanford-heart-vinyl-type-b", name: "Vinyl", price_cents: 3751500, price_basis: "resolved", needs_price: false, is_agreed: false }
    ]}
  ]
};

const DOCS = {
  uuid: "u1", property_slug: "sanford",
  documents: [{ id: 9, doc_type: "site-plan-signed", label: "Site plan - signed",
                url: "https://files.example.com/sp.pdf", status: "active", added_by: "Sipho N" }],
  history: [],
  document_types: [
    { slug: "otp-signed", label: "Offer To Purchase - signed", order: 10 },
    { slug: "site-plan-signed", label: "Site plan - signed", order: 30 }
  ]
};

/* The same catalogue as seen on a reservation whose snapshot records NO unit type.
   The server withholds every type-restricted option in that case, because the writer
   refuses them - so the panel must SAY why rather than just looking short. */
const OPTS_NO_TYPE = {
  uuid: "u1", property_slug: "sanford", unit_name: "Heart 07",
  unit_type_known: false, withheld_no_unit_type: 4,
  signed_total_cents: 350523300, agreed_extras_total_cents: 0,
  agreed: [], removed: [], groups: []
};

/* The buyer's own view, as the staff reader returns it. The counts are what the
   panel reports, and the withheld signing link is the case that matters most: if the
   panel says "available" for a blocked deal, sales will tell a buyer to go and sign
   something the reader will not hand over. */
const PV = {
  viewing_as: "buyer", viewed_by: "Sipho N", server_time: Date.now(),
  reservation: {
    uuid: "u1", reference: "HL-001", deal_stage: "finance", deal_sub_stage: "sign-otp",
    days_left: 5, is_blocked: false, blocked_reason: null,
    otp_available: true,
    documents: [{ doc_type: "otp-signed", label: "OTP", url: "https://x/1.pdf" }],
    property_documents: [{ doc_key: "brochure", label: "Brochure", url: "https://x/b.pdf" }],
    media: { gallery: [{ key: "a" }, { key: "b" }, { key: "c" }], floorplans: [{ key: "g" }, { key: "f" }] },
    team: [{ name: "Anneke" }],
    agreed_extras: [{ slug: "fireplace" }],
    actions: { prequalify_url: "", prequalify_logo: "" }
  }
};

const opened = [];
let popupBlocked = false;
let blockedView = false;
let noUnitType = false;
let confirmed = true;
const calls = [];
function stubFetch(url, opts) {
  calls.push({ url, opts });
  const u = String(url);
  let body;
  if (u.includes('/staff/login')) body = { authToken: "tok", expires_in: 43200, staff: LIST.staff };
  else if (u.includes('/portal-view')) {
    if (blockedView) {
      body = { viewing_as: "buyer", viewed_by: "Sipho N", reservation: Object.assign({}, PV.reservation,
        { is_blocked: true, blocked_reason: "The time to sign the Offer to Purchase has passed.",
          otp_available: false }) };
    } else { body = PV; }
  }
  else if (u.includes('/cancel')) body = { uuid: "u1", reference: "HL-001", status: "cancelled",
      cancelled_by: "Sipho N", unit_released: true, cms_unit_still_flagged: true,
      next_step: "Clear its Reserved toggle in the Webflow Units collection and publish." };
  else if (u.includes('/staff/reservations?')) body = LIST;
  else if (u.includes('/public/addons')) body = CAT;
  else if (u.includes('/addons')) body = { uuid:"u1", added:["sanford-yale-linus-smart-lock"], removed:[], changed:true,
      total_delta_cents:499900, total_cents:351023200, addons_total_cents:1023200,
      reservation_fee_cents:250000, fee_restored:true, fee_drifted:true, notes:[] };
  else if (u.includes('/deadline')) body = { uuid:"u1", cleared:false, deal_stage_due_at:1790726400000, days_moved:30, is_in_past:false };
  else if (u.includes('/options/remove')) body = { uuid:"u1", removed_slug:"sanford-major-pool", name:"Pool", agreed_extras_total_cents: 0 };
  else if (u.includes('/options')) body = (opts && opts.method === 'POST')
    ? { uuid:"u1", option_slug:"sanford-major-garage", name:"Garage", price_cents:12500000,
        price_basis:"on_consultation", is_consultation_price:true, agreed_extras_total_cents:12500000 }
    : (noUnitType ? OPTS_NO_TYPE : OPTS);
  else if (u.includes('/documents/remove')) body = { uuid:"u1", removed_id:9, label:"Site plan - signed" };
  else if (u.includes('/documents')) body = (opts && opts.method === 'POST')
    ? { uuid:"u1", document_id:11, label:"Offer To Purchase - signed", replaced:true }
    : DOCS;
  else body = {};
  return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) });
}

const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true,
  url: "https://www.heartland.co.za/sales-console",
  beforeParse(w) {
    w.fetch = stubFetch;
    w.confirm = () => confirmed;
    /* jsdom's window.open is not implemented; the preview needs to see what was
       opened, and needs to be able to say it was blocked. */
    w.open = (url, target) => { opened.push({ url, target }); return popupBlocked ? null : {}; };
  }
});

const w = dom.window;
const root = w.document.getElementById('hl-console-host').shadowRoot;
const $ = id => root.getElementById(id);
const A = [];
const ok = (n, c) => A.push({ n, pass: !!c });

/* ---------------- the bundle's own bootstrap ----------------
   The file is on a CDN now, which means it can be loaded on a page that is not the
   console, or twice on one that is. Neither may throw: a red uncaught error in the
   console of an ordinary marketing page is a real defect even though nothing visible
   breaks. */
function boot(pageHtml) {
  const seen = { warn: [], err: [] };
  const vc = new VirtualConsole();
  vc.on('warn', m => seen.warn.push(String(m)));
  vc.on('error', m => seen.err.push(String(m)));
  vc.on('jsdomError', e => seen.err.push(String(e && e.message)));
  const d = new JSDOM(pageHtml, { runScripts: "dangerously", virtualConsole: vc,
    url: "https://www.heartland.co.za/anything", beforeParse(w) { w.fetch = stubFetch; } });
  return { seen, d };
}

const noHost = boot(`<!doctype html><html><head><meta charset="utf-8"></head><body>
<p>An ordinary page.</p><script>${bundle}</script></body></html>`);
ok("on a page with no host, the bundle does not throw", noHost.seen.err.length === 0);
ok("and says why it did nothing",
   noHost.seen.warn.some(m => m.indexOf('no #hl-console-host') > -1));

const twice = boot(`<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="hl-console-host"></div><script>${bundle}</script><script>${bundle}</script>
</body></html>`);
ok("loading the bundle twice does not throw", twice.seen.err.length === 0);
ok("and the second load says the script is on the page twice",
   twice.seen.warn.some(m => m.indexOf('already initialised') > -1));
ok("the first load still rendered",
   !!twice.d.window.document.getElementById('hl-console-host').shadowRoot.getElementById('login'));

setTimeout(() => {
  ok("shadow root attached", !!root);
  $('email').value = "a@b.c"; $('pw').value = "x";
  $('signin').click();

  setTimeout(() => {
    ok("logged in, app shown", !$('app').classList.contains('hide'));
    const tr = root.querySelectorAll('#rows tr');
    ok("one pipeline row", tr.length === 1);

    // open the drawer via the Pipeline table row
    tr[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

    setTimeout(() => {
      ok("drawer opened", $('drawer').classList.contains('open'));
      ok("deadline date input present", !!$('dlDue'));
      ok("deadline clear checkbox present", !!$('dlClear'));
      ok("deadline reason present", !!$('dlWhy'));
      ok("add-on box present", !!$('addonBox'));

      const opts = root.querySelectorAll('#addonBox .adopt');
      ok("catalogue rendered", opts.length > 0);

      const safe = [].find.call(opts, o => o.value === 'sanford-yale-smart-safe');
      ok("already-owned add-on is pre-checked", safe && safe.checked);

      const gone = [].find.call(opts, o => o.value === 'sanford-yale-gone');
      ok("sold-out add-on is disabled", gone && gone.disabled);

      const radios = [].filter.call(opts, o => o.type === 'radio' && o.value);
      ok("radio group rendered as radios", radios.length === 2);
      const noneOpt = [].find.call(opts, o => o.type === 'radio' && o.value === '');
      ok("radio group has a 'none' option", !!noneOpt);

      const est0 = $('addonEst').textContent;
      console.log("    [estimate before] " + JSON.stringify(est0));
      ok("estimate shows the owned add-on", /5.233/.test(est0));

      // tick a second add-on -> estimate must move
      const lock = [].find.call(opts, o => o.value === 'sanford-yale-linus-smart-lock');
      lock.checked = true;
      lock.dispatchEvent(new w.Event('change', { bubbles: true }));
      const est1 = $('addonEst').textContent;
      console.log("    [estimate after ] " + JSON.stringify(est1));
      ok("estimate updates on change", /10.232/.test(est1));

      // reason required
      $('adWhy').value = "";
      $('adGo').click();
      ok("add-on save refuses without a reason", $('adErr').textContent.indexOf('reason') > -1);

      $('dlWhy').value = "";
      $('dlGo').click();
      ok("deadline save refuses without a reason", $('dlErr').textContent.indexOf('reason') > -1);

      $('dlWhy').value = "bank delay";
      $('dlDue').value = "";
      $('dlGo').click();
      ok("deadline save refuses with no date and no clear", $('dlErr').textContent.indexOf('date') > -1);

      // clear ticked disables the date field
      $('dlClear').checked = true;
      $('dlClear').dispatchEvent(new w.Event('change', { bubbles: true }));
      ok("ticking remove disables the date field", $('dlDue').disabled === true);

      ok("purchase-deposit still declared not editable",
        $('drawer').innerHTML.indexOf('Recording a purchase-deposit payment') > -1);
      ok("old blanket 'not editable' claim is gone",
        $('drawer').innerHTML.indexOf('need their own endpoint') === -1);

      /* ---------------- the reservation number ---------------- */
      ok("the pipeline row leads with the reservation number",
        tr[0].querySelector('td').textContent.trim() === 'HL-001');
      ok("and the search box says it can be searched on",
        /Reservation number/i.test($('q').getAttribute('placeholder')));

      /* ---------------- what the buyer sees ---------------- */
      ok("the console does NOT read the buyer view itself",
        !calls.some(c => String(c.url).indexOf('/portal-view') > -1));
      ok("it offers a button that opens the real page", !!$('pvGo'));

      /* ---------------- ending the deal ---------------- */
      ok("a paid deal offers the second confirmation", !!$('cxPaid'));
      $('cxWhy').value = "";
      $('cxGo').click();
      ok("cancel refuses without a reason", $('cxErr').textContent.indexOf('reason') > -1);
      ok("and sent nothing", !calls.some(c => String(c.url).indexOf('/cancel') > -1));

      confirmed = false;
      $('cxWhy').value = "Buyer withdrew";
      $('cxGo').click();
      ok("declining the confirm dialog sends nothing either",
        !calls.some(c => String(c.url).indexOf('/cancel') > -1));
      confirmed = true;

      /* ---------------- upgrades and documents ---------------- */
      ok("upgrade box present", !!$('upBox'));
      ok("document box present", !!$('docBox'));

      const pick = $('upPick');
      ok("the picker offers what is not already agreed", !!pick &&
         !![].find.call(pick.options, o => o.value === 'sanford-major-garage'));
      ok("and does not offer what already is",
         ![].find.call(pick.options, o => o.value === 'sanford-major-fireplace'));

      /* textContent, not innerHTML: en-ZA formats thousands with a non-breaking
         space, which innerHTML shows as the &nbsp; entity. */
      ok("the agreed list shows what was agreed and its price",
         $('upBox').textContent.indexOf('Fireplace') > -1 &&
         /48.500/.test($('upBox').textContent));
      ok("a negotiated price is marked as one",
         $('upBox').textContent.indexOf('agreed price') > -1);

      /* The rule the whole panel turns on: a price box only where the catalogue
         deliberately has none. */
      ok("the price box is hidden until something is chosen",
         $('upPriceRow').classList.contains('hide'));

      pick.value = 'sanford-heart-vinyl-type-b';
      pick.dispatchEvent(new w.Event('change', { bubbles: true }));
      ok("a catalogue-priced upgrade offers NO price box",
         $('upPriceRow').classList.contains('hide'));

      pick.value = 'sanford-major-garage';
      pick.dispatchEvent(new w.Event('change', { bubbles: true }));
      ok("an on-consultation upgrade does", !$('upPriceRow').classList.contains('hide'));

      $('upWhy').value = "";
      $('upGo').click();
      ok("adding an upgrade refuses without a reason", $('upErr').textContent.indexOf('reason') > -1);

      $('upWhy').value = "agreed on site";
      $('upPrice').value = "";
      $('upGo').click();
      ok("and refuses an on-consultation upgrade with no price",
         $('upErr').textContent.indexOf('needs a price') > -1);

      pick.value = 'sanford-broken';
      pick.dispatchEvent(new w.Event('change', { bubbles: true }));
      $('upWhy').value = "trying it";
      $('upGo').click();
      ok("an upgrade whose stored price is missing is refused, not priced at zero",
         $('upErr').textContent.indexOf('not there') > -1);

      // rands in, cents out - the field is in rands because that is how sales talk
      calls.length = 0;
      pick.value = 'sanford-major-garage';
      pick.dispatchEvent(new w.Event('change', { bubbles: true }));
      $('upPrice').value = "R125 000";
      $('upWhy').value = "agreed on site";
      $('upGo').click();
      const sent = calls.filter(c => c.opts && c.opts.method === 'POST' && String(c.url).includes('/options'));
      ok("the price is converted from rands to cents exactly once",
         sent.length === 1 && JSON.parse(sent[0].opts.body).price_cents === 12500000);

      const dsel = $('docType');
      ok("document types come from the server", !!dsel &&
         !![].find.call(dsel.options, o => o.value === 'otp-signed'));
      ok("a type already on the deal says it will replace",
         !![].find.call(dsel.options, o => o.value === 'site-plan-signed' && /replaces/.test(o.textContent)));
      ok("the free-text name is hidden until Something else is chosen",
         $('docLabelRow').classList.contains('hide'));

      dsel.value = 'other';
      dsel.dispatchEvent(new w.Event('change', { bubbles: true }));
      ok("and appears for Something else", !$('docLabelRow').classList.contains('hide'));

      dsel.value = 'otp-signed';
      $('docUrl').value = "http://files.example.com/a.pdf";
      $('docWhy').value = "signed copy back";
      $('docGo').click();
      ok("a non-https link is refused before it leaves the browser",
         $('docErr').textContent.indexOf('https://') > -1);

      $('docUrl').value = "https://files.example.com/a.pdf";
      $('docWhy').value = "";
      $('docGo').click();
      ok("adding a document refuses without a reason", $('docErr').textContent.indexOf('reason') > -1);

      ok("with a unit type, no withheld notice is shown",
         $('upBox').textContent.indexOf('no unit type recorded') === -1);

      /* Re-open the same deal against a reservation with no unit type on its
         snapshot. Nothing may be silently missing. */
      noUnitType = true;
      tr[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

      setTimeout(() => {
        const t = $('upBox').textContent;
        ok("a reservation with no unit type says so, in the panel",
           t.indexOf('no unit type recorded') > -1);
        ok("and says how many upgrades that hid", /4 upgrades/.test(t));
        ok("and tells sales what to fix", t.indexOf('Fix the unit type') > -1);
        ok("the picker is not offered at all", !$('upPick'));
        ok("and the empty state does not claim everything is already agreed",
           t.indexOf('already on the deal') === -1 &&
           t.indexOf('until the unit type is recorded') > -1);

        /* ---------------- the buyer's view, as a real tab ---------------- */
        noUnitType = false;
        $('pvGo').click();

        setTimeout(() => {
          ok("pressing it opens a tab", opened.length === 1);
          ok("at the portal, carrying the reservation",
            opened[0].url === '/portal?preview=u1');
          ok("in a new tab, not this one", opened[0].target === '_blank');
          ok("and the console still does not read the buyer view itself",
            !calls.some(c => String(c.url).indexOf('/portal-view') > -1));

          /* THE TOKEN IS NOT IN THE URL. It is a one-time note in localStorage,
             addressed to this reservation, with a timestamp. */
          ok("the url carries no token", !/tok/.test(opened[0].url));
          const note = JSON.parse(w.localStorage.getItem('hl_preview_handoff'));
          ok("the token is handed over out of band", note.t === 'tok');
          ok("addressed to this reservation", note.uuid === 'u1');
          ok("and stamped, so the portal can expire it",
            typeof note.at === 'number' && Math.abs(Date.now() - note.at) < 5000);

          /* A blocked pop-up must say so rather than looking like nothing happened. */
          popupBlocked = true;
          $('pvGo').click();

          setTimeout(() => {
            ok("a blocked pop-up is reported, not silently swallowed",
              /blocked the new tab/i.test($('pvBox').textContent));
            popupBlocked = false;

            const fails = A.filter(a => !a.pass);
            A.forEach(a => console.log((a.pass ? "  ok  " : "FAIL  ") + a.n));
            console.log("\n" + (A.length - fails.length) + "/" + A.length + " passed");
            process.exit(fails.length ? 1 : 0);
          }, 60);
        }, 60);
      }, 60);
    }, 60);
  }, 60);
}, 60);
