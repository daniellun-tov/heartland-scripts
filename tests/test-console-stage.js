/* ============================================================================
   THE DRAWER'S DEAL-STAGE MOVE: what "Move to" offers, what it sends, and the stage bar.

   The server (move_deal_stage) is the authority; the console mirrors it so it never offers a
   move the server refuses. Build and move-in gained sub-stages on 19 Nov, so the options are
   now (stage, sub) pairs over the buyer's whole path and the request must carry the option's
   OWN stage - the first version hard-coded "finance", which would have posted
   {deal_stage:"finance", deal_sub_stage:"upgrade-meeting"} and been refused.

   Every assertion that says an option IS offered has a twin that says its neighbour is NOT:
   a list that offers everything would pass the first half alone.
   jsdom, like test-editors: the built bundle, fetch stubbed, no browser.
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const bundle = fs.readFileSync(path.join(__dirname, '..', 'heartland-console.js'), 'utf8');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>
<div id="hl-console-host"></div><script>${bundle}</script></body></html>`;

function row(over) {
  return Object.assign({
    uuid: "u1", reference: "HL-001", status: "confirmed",
    deal_stage: "finance", deal_sub_stage: "sign-otp",
    deal_stage_changed_at: 1787000000000, deal_stage_due_at: null,
    days_left: null, overdue: false,
    property_slug: "sanford", property_name: "Sanford Heart",
    unit_name: "Heart 07", first_name: "Thandi", last_name: "Mokoena",
    email: "t@example.com", phone: "0821234567", payer_route: "bond",
    addons: [], addon_count: 0, addons_total_cents: 0,
    unit_price_cents: 350000000, total_cents: 350000000,
    reservation_fee_cents: 250000, purchase_deposit_cents: null,
    deposit_bond_pct: 10, deposit_cash_pct: 30,
    has_member: true, holds_unit: true, admin_notes: null, needs_attention: false,
    confirmed_at: 1787000000000, created_at: 1787000000000
  }, over || {});
}

function listFor(r) {
  return {
    staff: { id: 1, name: "Sipho N", role: "sales" },
    summary: { total: 1, by_status: { confirmed: 1 }, by_deal_stage: {}, fees_collected_cents: 250000,
      confirmed_count: 1, awaiting_clearance: 0, needs_attention: 0, live_holds: 1,
      confirmed_without_stage: 0, purchase_deposit_outstanding_cents: 0, overdue: 0, due_soon: 0 },
    matched: 1, server_time: Date.now(), items: [r],
    properties: [{ slug: "sanford", name: "Sanford Heart", is_payfast_live: false, is_selling: false }]
  };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

/* Boots the console on one deal, opens its drawer and reports what it shows. */
async function scene(over) {
  const r = row(over);
  const posts = [];
  function stubFetch(url, opts) {
    const u = String(url);
    let body = {};
    if (u.includes('/staff/login')) body = { authToken: "tok", expires_in: 43200, staff: { id: 1, name: "Sipho N", role: "sales" } };
    else if (/\/staff\/reservations\/[^/]+\/stage/.test(u)) {
      const sent = JSON.parse(opts.body);
      posts.push({ url: u, method: opts.method, body: sent });
      body = { uuid: "u1", deal_stage: sent.deal_stage, deal_sub_stage: sent.deal_sub_stage, deal_stage_due_at: null };
    }
    else if (u.includes('/staff/reservations?')) body = listFor(r);
    else if (u.includes('/public/addons')) body = { property_slug: "sanford", is_selling: false, sections: [] };
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) });
  }
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true,
    url: "https://www.heartland.co.za/sales-console", beforeParse(w) { w.fetch = stubFetch; } });
  const w = dom.window;
  await wait(60);
  const root = w.document.getElementById('hl-console-host').shadowRoot;
  const $ = id => root.getElementById(id);
  $('email').value = "a@b.c"; $('pw').value = "x";
  $('signin').click();
  await wait(80);
  const tr = root.querySelectorAll('#rows tr');
  tr[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(60);
  const sel = $('mvSub');
  const steps = [].map.call(root.querySelectorAll('#drawer .stagebar .step'),
    e => ({ text: e.textContent, now: e.classList.contains('now'), done: e.classList.contains('done') }));
  return {
    w, root, $, posts,
    values: sel ? [].map.call(sel.options, o => o.value) : [],
    texts: sel ? [].map.call(sel.options, o => o.textContent) : [],
    steps,
    barText: (root.querySelector('#drawer .stagebar') || { textContent: "" }).textContent,
    now: steps.filter(s => s.now).map(s => s.text),
    done: steps.filter(s => s.done).map(s => s.text),
    row: tr[0].textContent,
    async move(value, why) {
      sel.value = value;
      $('mvWhy').value = why || "test";
      $('mvGo').click();
      await wait(60);
    },
    close() { w.close(); }
  };
}

const A = [];
const ok = (n, c) => A.push({ n, pass: !!c });
const has = (arr, v) => arr.indexOf(v) > -1;

(async () => {
  /* ---- a. cash deal at the end of finance: build/upgrade-meeting is the next step ---- */
  {
    const s = await scene({ payer_route: "cash", deal_stage: "finance", deal_sub_stage: "transfer-attorneys" });
    ok("a. cash at transfer-attorneys is offered build/upgrade-meeting", has(s.values, "build:upgrade-meeting"));
    ok("a. and its option reads 'Upgrade meeting - no countdown'",
       s.texts.some(t => /^Upgrade meeting/.test(t) && /no countdown/.test(t)));
    ok("a. but not the step after it", !has(s.values, "build:construction-start"));
    ok("a. nor anything in move-in", !s.values.some(v => /^move-in:/.test(v)));
    ok("a. earlier finance steps are offered as back moves",
       has(s.values, "finance:sign-otp") && has(s.values, "finance:pay-deposit"));
    ok("a. a cash buyer is not offered bond steps", !has(s.values, "finance:pre-qualify") && !has(s.values, "finance:bond-approval"));
    ok("a. the step it is already on is not offered", !has(s.values, "finance:transfer-attorneys"));
    await s.move("build:upgrade-meeting", "Upgrade call held");
    ok("a. choosing it POSTs once", s.posts.length === 1);
    ok("a. to the stage endpoint of this reservation", /\/staff\/reservations\/u1\/stage$/.test(s.posts[0].url) && s.posts[0].method === "POST");
    ok("a. with deal_stage 'build', not 'finance'", s.posts[0].body.deal_stage === "build");
    ok("a. and deal_sub_stage 'upgrade-meeting'", s.posts[0].body.deal_sub_stage === "upgrade-meeting");
    ok("a. and the reason", s.posts[0].body.reason === "Upgrade call held");
    s.close();
  }
  {
    /* and a finance move still goes out as finance - the stage must come from the option,
       not be hard-coded to the other value either. */
    const s = await scene({ payer_route: "bond", deal_sub_stage: "sign-otp" });
    await s.move("finance:pay-deposit");
    ok("a. a finance move still sends deal_stage 'finance'", s.posts.length === 1 && s.posts[0].body.deal_stage === "finance" && s.posts[0].body.deal_sub_stage === "pay-deposit");
    s.close();
  }

  /* ---- b. mid-build: one step forward only ---- */
  {
    const s = await scene({ payer_route: "cash", deal_stage: "build", deal_sub_stage: "construction-start" });
    ok("b. next offered is finalise-upgrades", has(s.values, "build:finalise-upgrades"));
    ok("b. site-visit (two ahead) is NOT offered", !has(s.values, "build:site-visit"));
    ok("b. lodgement (a later stage, two ahead) is NOT offered", !has(s.values, "move-in:lodgement"));
    ok("b. move-in/meet-your-home is NOT offered (not the next step)", !has(s.values, "move-in:meet-your-home"));
    ok("b. back: upgrade-meeting offered", has(s.values, "build:upgrade-meeting"));
    ok("b. back: transfer-attorneys offered", has(s.values, "finance:transfer-attorneys"));
    ok("b. 'Already at X' is not offered", !has(s.values, "build:construction-start"));
    ok("b. exactly: 3 finance steps + upgrade-meeting + finalise-upgrades", s.values.length === 5);
    s.close();
  }
  {
    /* the last build step hands over to move-in's first, and only its first */
    const s = await scene({ payer_route: "cash", deal_stage: "build", deal_sub_stage: "site-visit" });
    ok("b. at site-visit the next is move-in/meet-your-home", has(s.values, "move-in:meet-your-home"));
    ok("b. and not move-in/pre-transfer-occupation", !has(s.values, "move-in:pre-transfer-occupation"));
    s.close();
  }
  {
    /* the end of the line: back moves only */
    const s = await scene({ payer_route: "bond", deal_stage: "move-in", deal_sub_stage: "owner" });
    ok("b. at owner nothing is ahead: every option is a back move",
       s.values.length === 6 + 4 + 5 && s.values.every(v => v !== "move-in:owner"));
    ok("b. at owner every move-in step before it is offered", has(s.values, "move-in:lodgement") && has(s.values, "move-in:property-registration"));
    ok("b. at owner, owner itself is not offered", !has(s.values, "move-in:owner"));
    s.close();
  }

  /* ---- c. bond deal at the end of finance ---- */
  {
    const s = await scene({ payer_route: "bond", deal_stage: "finance", deal_sub_stage: "bond-approved" });
    ok("c. bond at bond-approved: next is build/upgrade-meeting", has(s.values, "build:upgrade-meeting"));
    ok("c. construction-start is NOT offered", !has(s.values, "build:construction-start"));
    ok("c. every bond finance step before it is offered (back)",
       ["pre-qualify", "sign-otp", "pay-deposit", "transfer-attorneys", "bond-approval"].every(x => has(s.values, "finance:" + x)));
    s.close();
  }
  {
    /* mid-finance does not leap into build */
    const s = await scene({ payer_route: "bond", deal_stage: "finance", deal_sub_stage: "pay-deposit" });
    ok("c. mid-finance still offers only the next finance step", has(s.values, "finance:transfer-attorneys") && !s.values.some(v => /^build:/.test(v)));
    s.close();
  }

  /* ---- d. legacy build row: no sub-stage ---- */
  {
    const s = await scene({ payer_route: "cash", deal_stage: "build", deal_sub_stage: null });
    ["upgrade-meeting", "construction-start", "finalise-upgrades", "site-visit"].forEach(x =>
      ok("d. legacy build is offered build/" + x, has(s.values, "build:" + x)));
    ok("d. and move-in/meet-your-home", has(s.values, "move-in:meet-your-home"));
    ok("d. but not move-in/lodgement", !has(s.values, "move-in:lodgement"));
    ok("d. nor pre-transfer-occupation", !has(s.values, "move-in:pre-transfer-occupation"));
    ok("d. every earlier (finance) step is offered", ["sign-otp", "pay-deposit", "transfer-attorneys"].every(x => has(s.values, "finance:" + x)));
    ok("d. a cash legacy row is not offered bond steps", !has(s.values, "finance:pre-qualify"));
    s.close();
  }
  {
    const s = await scene({ payer_route: "cash", deal_stage: "move-in", deal_sub_stage: null });
    ok("d. legacy move-in is offered every move-in step", ["meet-your-home", "pre-transfer-occupation", "lodgement", "registration-occupation", "property-registration", "owner"].every(x => has(s.values, "move-in:" + x)));
    ok("d. and the build steps behind it", has(s.values, "build:site-visit") && has(s.values, "build:upgrade-meeting"));
    s.close();
  }
  {
    /* today's behaviour, unchanged: finance with no sub-stage offers all of the route's steps, and only those */
    const s = await scene({ payer_route: "bond", deal_stage: "finance", deal_sub_stage: null });
    ok("d. finance with no sub-stage offers all six bond steps", s.values.filter(v => /^finance:/.test(v)).length === 6);
    ok("d. and nothing in build", !s.values.some(v => /^build:/.test(v)));
    s.close();
  }

  /* ---- e. the stage bar ---- */
  {
    const s = await scene({ payer_route: "cash", deal_stage: "build", deal_sub_stage: "site-visit" });
    ok("e. 'Site visit' is the current step", s.now.length === 1 && s.now[0] === "Site visit");
    ok("e. 'Upgrade meeting' is done", has(s.done, "Upgrade meeting"));
    ok("e. 'Construction start' and 'Finalise upgrades' are done", has(s.done, "Construction start") && has(s.done, "Finalise upgrades"));
    ok("e. every cash finance step is done", has(s.done, "sign otp") && has(s.done, "transfer attorneys"));
    ok("e. move-in steps are neither done nor current", !has(s.done, "Lodgement") && !has(s.now, "Lodgement"));
    ok("e. the move-in steps are on the bar", /Meet your home/.test(s.barText) && /Registration and occupation/.test(s.barText));
    ok("e. a cash deal's bar does not show bond steps", !/pre qualify/.test(s.barText.split("route")[0]) && !/bond approval/.test(s.barText.split("route")[0]));
    ok("e. the route note still says the bond steps never apply", /cash route/.test(s.barText) && /never apply/.test(s.barText));
    s.close();
  }
  {
    const s = await scene({ payer_route: "cash", deal_stage: "build", deal_sub_stage: null });
    ok("e. legacy build: every finance step is done", has(s.done, "sign otp") && has(s.done, "pay deposit") && has(s.done, "transfer attorneys"));
    ok("e. legacy build: nothing is marked now", s.now.length === 0);
    ok("e. legacy build: no build step is done", !has(s.done, "Upgrade meeting"));
    s.close();
  }
  {
    const s = await scene({ payer_route: "bond", deal_stage: "finance", deal_sub_stage: "sign-otp" });
    ok("e. a finance deal: sign otp is now, pre qualify done, build untouched",
       s.now[0] === "sign otp" && has(s.done, "pre qualify") && !has(s.done, "Upgrade meeting") && !has(s.now, "Upgrade meeting"));
    s.close();
  }

  /* ---- other places that print the sub-stage ---- */
  {
    const s = await scene({ payer_route: "cash", deal_stage: "move-in", deal_sub_stage: "registration-occupation" });
    ok("pipeline row prints the label-map words", /Registration and occupation/.test(s.row));
    s.close();
  }

  const fails = A.filter(a => !a.pass);
  A.forEach(a => console.log((a.pass ? "  ok  " : "FAIL  ") + a.n));
  console.log("\n" + (A.length - fails.length) + "/" + A.length + " passed");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
