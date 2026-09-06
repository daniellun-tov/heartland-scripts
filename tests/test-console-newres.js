/* Browser tests for the console's manual-reservation form.
   Real Chromium against the stubbed staff endpoints, asserting the REQUEST BODY as
   much as the screen - this form's job is to send a correct payload, and a field that
   renders and does not reach the server is the failure that matters. */
const { chromium } = require("playwright");
/* THE FIXTURE DIR IS RESOLVED FROM THIS FILE, not from an absolute path in a scratch
   directory. These suites lived in /tmp for a week, which meant every one of them was one
   container reclaim away from being gone - roughly 950 assertions that nothing else in the
   project reproduces. run.sh copies the bundle in before running, so the suite always grades
   the file in this repo rather than whatever was last left in the fixture dir. */
const FX = "file://" + require("path").join(__dirname, "fixtures");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}

const sr = () => document.getElementById("hl-console-host").shadowRoot;

const set = (p, id, value) => p.evaluate(a => {
  const r = document.getElementById("hl-console-host").shadowRoot;
  const el = r.getElementById(a.id);
  el.value = a.value;
  el.dispatchEvent(new Event(el.tagName === "SELECT" || el.type === "date" ? "change" : "input"));
}, { id, value });

const click = (p, sel) => p.evaluate(s => {
  document.getElementById("hl-console-host").shadowRoot.querySelector(s).click();
}, sel);

const S = p => p.evaluate(() => {
  const r = document.getElementById("hl-console-host").shadowRoot;
  const m = r.getElementById("newres");
  const val = id => { const e = r.getElementById(id); return e ? e.value : null; };
  const txt = s => { const e = r.querySelector(s); return e ? e.textContent.trim() : null; };
  const review = {};
  const dts = r.querySelectorAll(".nr-review dt");
  const dds = r.querySelectorAll(".nr-review dd");
  for (let i = 0; i < dts.length; i++) { review[dts[i].textContent.trim()] = dds[i].textContent.trim(); }
  return {
    open: m.classList.contains("open"),
    hidden: m.getAttribute("aria-hidden"),
    step: txt("#nrStepLabel"),
    err: txt("#nrErr"),
    homes: [].map.call(r.querySelectorAll("#nr_wf_unit_id option"), o => o.textContent.trim()),
    unitNote: txt(".nr-unit-note"),
    fee: val("nr_fee_rands"),
    property: val("nr_property_slug"),
    unit: val("nr_wf_unit_id"),
    email: val("nr_email"),
    note: val("nr_note"),
    review: review,
    will: [].map.call(r.querySelectorAll(".nr-will li"), l => l.textContent.trim()),
    warn: txt(".nr-warn"),
    warnVisible: (function () {
      const w = r.querySelector(".nr-warn");
      return !!(w && w.getBoundingClientRect().height > 0);
    }()),
    posted: null,
    drawerOpen: r.getElementById("drawer").classList.contains("open"),
    who: txt("#who"),
    goDisabled: r.getElementById("nrGo") ? r.getElementById("nrGo").disabled : null
  };
});

const posted = p => p.evaluate(() => window.__POSTED);

async function fill(p, over) {
  const v = Object.assign({
    nr_property_slug: "sanford-heart", nr_wf_unit_id: "u-home-5",
    nr_first_name: "Mandla", nr_last_name: "Nkosi",
    nr_email: "  m.nkosi@example.co.za  ", nr_phone: "0821234567",
    nr_payer_route: "bond", nr_fee_reference: "FNB 8821",
    nr_address: "14 Robert Broom Drive, Mogale City, 1742",
    nr_note: "Signed in the show house on Saturday."
  }, over || {});
  await set(p, "nr_property_slug", v.nr_property_slug);
  await p.waitForFunction(() => {
    const r = document.getElementById("hl-console-host").shadowRoot;
    const sel = r.getElementById("nr_wf_unit_id");
    return sel && sel.options.length > 1;
  }, null, { timeout: 5000 });
  for (const k of Object.keys(v)) {
    if (k === "nr_property_slug") { continue; }
    await set(p, k, v[k]);
  }
}

(async () => {
  const browser = await chromium.launch();
  const open = async (query) => {
    const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1200, height: 1000 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html" + (query || ""));
    await p.waitForTimeout(400);
    return { ctx, p };
  };

  // ── 1. opening ───────────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("1. opening");
    let s = await S(p);
    ok("closed to begin with", s.open === false && s.hidden === "true", s.open);
    await click(p, "#newRes");
    await p.waitForTimeout(80);
    s = await S(p);
    ok("the header button opens it", s.open === true && s.hidden === "false", s);
    ok("it says what this is for",
      /off the system/.test(s.step), s.step);
    ok("no homes until a property is chosen",
      s.homes.length === 1 && /Choose a home/.test(s.homes[0]), s.homes);
    ok("and it says so rather than looking broken",
      /Homes load once a property is chosen/.test(s.unitNote), s.unitNote);
    await ctx.close();
  }

  // ── 2. choosing a property loads its homes ───────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("2. the home picker");
    await click(p, "#newRes"); await p.waitForTimeout(60);
    await set(p, "nr_property_slug", "sanford-heart");
    await p.waitForFunction(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const sel = r.getElementById("nr_wf_unit_id");
      return sel && sel.options.length > 1;
    }, null, { timeout: 5000 });
    const s = await S(p);
    ok("homes arrive", s.homes.length === 4, s.homes);
    ok("named and priced, so a salesperson can pick by what the buyer said",
      s.homes[1] === "Home 2 · R3,595,000", s.homes[1]);
    ok("the count is shown", /3 available/.test(s.unitNote), s.unitNote);
    // The picker is fed by /staff/units, which reconciles CMS flags with live holds -
    // so a home taken a minute ago never appears here at all.
    ok("nothing taken is offered", s.homes.join("|").indexOf("Home 4") === -1, s.homes);
    ok("the property's own fee prefills", s.fee === "3000", s.fee);
    await ctx.close();
  }

  // ── 3. validation, in the order a person would fix it ────────────────────
  {
    const { ctx, p } = await open();
    console.log("3. validation");
    await click(p, "#newRes"); await p.waitForTimeout(60);
    await click(p, "#nrNext"); await p.waitForTimeout(50);
    let s = await S(p);
    ok("a property first", s.err === "Choose a property.", s.err);
    ok("and it does not advance", /off the system/.test(s.step), s.step);

    await set(p, "nr_property_slug", "sanford-heart");
    await p.waitForFunction(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const sel = r.getElementById("nr_wf_unit_id");
      return sel && sel.options.length > 1;
    }, null, { timeout: 5000 });
    await click(p, "#nrNext"); await p.waitForTimeout(50);
    s = await S(p);
    ok("then a home", s.err === "Choose a home.", s.err);

    await set(p, "nr_wf_unit_id", "u-home-5");
    await click(p, "#nrNext"); await p.waitForTimeout(50);
    s = await S(p);
    ok("then an email, because the portal login is keyed on it",
      s.err === "An email address is required.", s.err);

    await set(p, "nr_email", "not-an-address");
    await click(p, "#nrNext"); await p.waitForTimeout(50);
    s = await S(p);
    ok("and it has to look like one", /does not look right/.test(s.err), s.err);

    await set(p, "nr_email", "m.nkosi@example.co.za");
    await click(p, "#nrNext"); await p.waitForTimeout(50);
    s = await S(p);
    ok("then the note - this deal has no other trail",
      s.err === "A note is required.", s.err);

    await set(p, "nr_note", "Signed in the show house.");
    await click(p, "#nrNext"); await p.waitForTimeout(80);
    s = await S(p);
    ok("and then it advances", /Check this/.test(s.step), s.step);
    await ctx.close();
  }

  // ── 4. the review step names everything that is about to happen ──────────
  {
    const { ctx, p } = await open();
    console.log("4. review");
    await click(p, "#newRes"); await p.waitForTimeout(60);
    await fill(p);
    await click(p, "#nrNext"); await p.waitForTimeout(80);
    const s = await S(p);
    ok("the buyer", /Mandla Nkosi/.test(s.review.Buyer) &&
      /m\.nkosi@example\.co\.za/.test(s.review.Buyer), s.review.Buyer);
    ok("the home", /Sanford Heart/.test(s.review.Home) && /Home 5/.test(s.review.Home), s.review.Home);
    ok("the address is on the review", /Robert Broom/.test(s.review.Address), s.review.Address);
    ok("the route", s.review["Paying by"] === "bond", s.review["Paying by"]);
    ok("the money, as received", /R 3,000/.test(s.review["Fee received"]) &&
      /eft/.test(s.review["Fee received"]) && /FNB 8821/.test(s.review["Fee received"]),
      s.review["Fee received"]);
    ok("today when no date was typed", /today/.test(s.review["Fee received"]), s.review["Fee received"]);
    ok("the signing choice", /signing link generated/.test(s.review.Offer), s.review.Offer);
    ok("four consequences, in the order they happen", s.will.length === 4, s.will);
    ok("including the home coming off the market",
      /off the market/.test(s.will[0]), s.will[0]);
    ok("and the buyer's account", /sign in to their portal/.test(s.will[3]), s.will[3]);
    // The live-key consequence is the one nobody should discover afterwards.
    ok("the live account is called out by name",
      /real/.test(s.warn) && s.warn.indexOf("m.nkosi@example.co.za") !== -1, s.warn);
    ok("and it is actually on screen, not merely in the markup",
      s.warnVisible === true, s.warnVisible);
    ok("and that there is no undo", /no undo/.test(s.warn), s.warn);
    await ctx.close();
  }

  // ── 5. Back does not throw the typing away ───────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("5. back");
    await click(p, "#newRes"); await p.waitForTimeout(60);
    await fill(p);
    await click(p, "#nrNext"); await p.waitForTimeout(80);
    await click(p, "#nrBack"); await p.waitForTimeout(80);
    const s = await S(p);
    ok("still on the form", /off the system/.test(s.step), s.step);
    ok("property kept", s.property === "sanford-heart", s.property);
    ok("home kept", s.unit === "u-home-5", s.unit);
    ok("email kept", /m\.nkosi/.test(s.email), s.email);
    ok("note kept", /show house/.test(s.note), s.note);
    ok("and the homes are still loaded", s.homes.length === 4, s.homes.length);
    await ctx.close();
  }

  // ── 6. what actually gets sent ───────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("6. the request body");
    await click(p, "#newRes"); await p.waitForTimeout(60);
    await fill(p);
    await click(p, "#nrNext"); await p.waitForTimeout(80);
    await click(p, "#nrGo"); await p.waitForTimeout(400);
    const b = await posted(p);
    ok("property and home", b.property_slug === "sanford-heart" && b.wf_unit_id === "u-home-5", b);
    ok("the email arrives without surrounding whitespace", b.email === "m.nkosi@example.co.za", b.email);
    ok("names and phone", b.first_name === "Mandla" && b.phone === "0821234567", b);
    ok("the route", b.payer_route === "bond", b.payer_route);
    ok("the address reaches the server, so the offer template is not blank",
      b.address === "14 Robert Broom Drive, Mogale City, 1742", b.address);
    // Rands on screen, cents on the wire - every money figure in this system is an
    // integer number of cents.
    ok("the fee is sent in cents", b.fee_amount_cents === 300000, b.fee_amount_cents);
    ok("method and reference", b.fee_method === "eft" && b.fee_reference === "FNB 8821", b);
    ok("generate_otp is a boolean, not the radio's string",
      b.generate_otp === true, b.generate_otp);
    ok("the note rides along", /show house/.test(b.note), b.note);
    await ctx.close();
  }

  // ── 7. signing on paper, and an untouched fee ────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("7. offline signing");
    await click(p, "#newRes"); await p.waitForTimeout(60);
    await fill(p);
    await set(p, "nr_fee_rands", "");
    await click(p, '#nrBody input[value="no"]'); await p.waitForTimeout(50);
    await click(p, "#nrNext"); await p.waitForTimeout(80);
    const s = await S(p);
    ok("the review says no link", /signed on paper, no link/.test(s.review.Offer), s.review.Offer);
    ok("and defers the fee to the property",
      /property’s own fee/.test(s.review["Fee received"]), s.review["Fee received"]);
    await click(p, "#nrGo"); await p.waitForTimeout(400);
    const b = await posted(p);
    ok("generate_otp false", b.generate_otp === false, b.generate_otp);
    // Sending 0 would override the property's fee with nothing.
    ok("and no fee is sent at all rather than a zero",
      b.fee_amount_cents === undefined, b.fee_amount_cents);
    await ctx.close();
  }

  // ── 8. success lands you in the new deal ─────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("8. success");
    await click(p, "#newRes"); await p.waitForTimeout(60);
    await fill(p);
    await click(p, "#nrNext"); await p.waitForTimeout(80);
    await click(p, "#nrGo"); await p.waitForTimeout(500);
    const s = await S(p);
    ok("the form closes", s.open === false, s.open);
    // Somebody who has just typed all that wants to see the thing they made.
    ok("and the new deal's drawer opens", s.drawerOpen === true, s.drawerOpen);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 9. the website not updating is said out loud ─────────────────────────
  {
    const { ctx, p } = await open("?cmsfail=1");
    console.log("9. cms write-back failed");
    await click(p, "#newRes"); await p.waitForTimeout(60);
    await fill(p);
    await click(p, "#nrNext"); await p.waitForTimeout(80);
    await click(p, "#nrGo"); await p.waitForTimeout(500);
    const s = await S(p);
    ok("the reservation still stands", s.open === false, s.open);
    // The hold is real either way; the brochure is the bit that did not update, and a
    // home left showing as available is how it gets sold twice.
    ok("but the salesperson is told the website still shows it available",
      /still shows that home as available/.test(s.who), s.who);
    ok("and which reservation it was", /RES-SAN-031/.test(s.who), s.who);
    await ctx.close();
  }

  // ── 10. a refusal keeps the typing on screen ─────────────────────────────
  {
    const { ctx, p } = await open("?createfail=1");
    console.log("10. refusal");
    await click(p, "#newRes"); await p.waitForTimeout(60);
    await fill(p);
    await click(p, "#nrNext"); await p.waitForTimeout(80);
    await click(p, "#nrGo"); await p.waitForTimeout(400);
    const s = await S(p);
    ok("the form stays open", s.open === true, s.open);
    ok("the server's own words are shown",
      /already held by another reservation/.test(s.err), s.err);
    ok("and the button works again", s.goDisabled === false, s.goDisabled);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 11. Escape closes the form, not the drawer under it ──────────────────
  {
    const { ctx, p } = await open();
    console.log("11. escape order");
    await click(p, "#rows tr"); await p.waitForTimeout(200);
    await click(p, "#newRes"); await p.waitForTimeout(80);
    await p.keyboard.press("Escape"); await p.waitForTimeout(80);
    const st = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return { form: r.getElementById("newres").classList.contains("open"),
               drawer: r.getElementById("drawer").classList.contains("open"),
               focused: r.activeElement && r.activeElement.id };
    });
    // The form is the one holding twenty minutes of typing.
    ok("the form closes first", st.form === false, st.form);
    ok("the drawer is left alone", st.drawer === true, st.drawer);
    ok("focus returns to the button that opened it", st.focused === "newRes", st.focused);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
