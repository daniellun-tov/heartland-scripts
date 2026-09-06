/* Browser tests for the 4 Sep console work: the production/test split button, the
   delete control, and the address type-ahead.

   Real Chromium against stubbed endpoints, asserting the REQUEST BODY as much as the
   screen. Two of these three features exist to stop a specific mistake reaching the
   server, so a control that renders correctly and sends the wrong payload is exactly
   the failure that matters. */
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

const click = (p, sel) => p.evaluate(s => {
  document.getElementById("hl-console-host").shadowRoot.querySelector(s).click();
}, sel);

const set = (p, id, value) => p.evaluate(a => {
  const r = document.getElementById("hl-console-host").shadowRoot;
  const el = r.getElementById(a.id);
  if (el.type === "checkbox") { el.checked = !!a.value; el.dispatchEvent(new Event("change")); return; }
  el.value = a.value;
  el.dispatchEvent(new Event(el.tagName === "SELECT" || el.type === "date" ? "change" : "input"));
}, { id, value });

const txt = (p, sel) => p.evaluate(s => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  return e ? e.textContent.trim() : null;
}, sel);

const seen = (p, sel) => p.evaluate(s => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  return !!(e && e.getBoundingClientRect().height > 0);
}, sel);

async function fill(p, over) {
  const v = Object.assign({
    nr_property_slug: "sanford-heart", nr_wf_unit_id: "u-home-5",
    nr_first_name: "Mandla", nr_last_name: "Nkosi",
    nr_email: "m.nkosi@example.co.za", nr_phone: "0821234567",
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
    const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1200, height: 1100 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html" + (query || ""));
    await p.waitForTimeout(400);
    return { ctx, p };
  };

  // ══ THE SPLIT BUTTON ═════════════════════════════════════════════════════

  // ── 1. the menu is shut until it is asked for ────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("1. the split button");
    ok("the menu starts hidden", (await seen(p, "#newResMenu")) === false);
    ok("and says so to a screen reader",
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
        .getElementById("newResMore").getAttribute("aria-expanded"))) === "false");
    await click(p, "#newResMore"); await p.waitForTimeout(60);
    ok("the toggle opens it", (await seen(p, "#newResMenu")) === true);
    ok("aria-expanded follows",
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
        .getElementById("newResMore").getAttribute("aria-expanded"))) === "true");
    // Clicking anywhere else must shut it, or it sits over the table forever.
    await click(p, "#rows tr"); await p.waitForTimeout(120);
    ok("a click elsewhere shuts it", (await seen(p, "#newResMenu")) === false);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. the default click is PRODUCTION ───────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("2. the default is production");
    await click(p, "#newRes"); await p.waitForTimeout(80);
    ok("the heading does not claim a rehearsal",
      /off the system/.test(await txt(p, "#nrStepLabel")), await txt(p, "#nrStepLabel"));
    ok("no Test tag", (await p.evaluate(() => !document.getElementById("hl-console-host")
      .shadowRoot.querySelector("#nrStepLabel .testtag"))) === true);
    await fill(p);
    await click(p, "#nrNext"); await p.waitForTimeout(80);
    ok("the review promises a production number",
      /next production reservation number/.test(
        (await p.evaluate(() => [].map.call(document.getElementById("hl-console-host")
          .shadowRoot.querySelectorAll(".nr-will li"), l => l.textContent).join(" | ")))));
    ok("and that the website changes",
      /off the market, here and on the website/.test(
        (await p.evaluate(() => [].map.call(document.getElementById("hl-console-host")
          .shadowRoot.querySelectorAll(".nr-will li"), l => l.textContent).join(" | ")))));
    await click(p, "#nrGo"); await p.waitForTimeout(300);
    const body = await p.evaluate(() => window.__POSTED);
    // ABSENT, not false. The server defaults a missing flag to production, and sending
    // is_test:false would be a second place that has to agree about the default.
    ok("is_test is not sent at all", body && !("is_test" in body), body && body.is_test);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. the menu entry is a TEST reservation ──────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("3. the test entry");
    await click(p, "#newResMore"); await p.waitForTimeout(60);
    await click(p, '[data-nr-open="test"]'); await p.waitForTimeout(80);
    ok("the menu closed behind it", (await seen(p, "#newResMenu")) === false);
    ok("the heading carries a Test tag",
      (await txt(p, "#nrStepLabel .testtag")) === "Test", await txt(p, "#nrStepLabel"));
    ok("and says the website is untouched",
      /website is not touched/.test(await txt(p, "#nrStepLabel")), await txt(p, "#nrStepLabel"));
    // The note is required by the server; pre-filling it is a courtesy that must not
    // silently become the user's own reason on a REAL reservation - test 2 proves that.
    ok("the note is pre-filled for a rehearsal",
      /not a sale/i.test(await p.evaluate(() => document.getElementById("hl-console-host")
        .shadowRoot.getElementById("nr_note").value)));
    await fill(p, { nr_note: "Rehearsing the manual path." });
    await click(p, "#nrNext"); await p.waitForTimeout(80);
    const will = await p.evaluate(() => [].map.call(document.getElementById("hl-console-host")
      .shadowRoot.querySelectorAll(".nr-will li"), l => l.textContent).join(" | "));
    ok("the review promises the TEST sequence", /test.*sequence|RES-TEST/i.test(will), will);
    ok("and that the website is NOT changed", /website is not changed/.test(will), will);
    ok("the confirm button says which kind this is",
      /Create test reservation/.test(await txt(p, "#nrGo")), await txt(p, "#nrGo"));
    ok("the warning still says the account is real",
      /Memberstack key is a live key|account is real/i.test(await txt(p, ".nr-warn")));
    await click(p, "#nrGo"); await p.waitForTimeout(300);
    const body = await p.evaluate(() => window.__POSTED);
    ok("is_test true reaches the server", body && body.is_test === true, body && body.is_test);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. the mode does not survive the next open ───────────────────────────
  {
    const { ctx, p } = await open();
    console.log("4. the mode resets");
    await click(p, "#newResMore"); await p.waitForTimeout(60);
    await click(p, '[data-nr-open="test"]'); await p.waitForTimeout(80);
    ok("test first", (await txt(p, "#nrStepLabel .testtag")) === "Test");
    await p.keyboard.press("Escape"); await p.waitForTimeout(80);
    await click(p, "#newRes"); await p.waitForTimeout(80);
    // A remembered flag is how a real sale gets filed as a rehearsal the morning after.
    ok("the next plain open is production again",
      (await p.evaluate(() => !document.getElementById("hl-console-host")
        .shadowRoot.querySelector("#nrStepLabel .testtag"))) === true);
    await ctx.close();
  }

  // ── 5. a test reservation is labelled wherever it appears ────────────────
  {
    const { ctx, p } = await open();
    console.log("5. the test tag on existing rows");
    const tags = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const rows = [].map.call(r.querySelectorAll("#rows tr"), tr => ({
        ref: tr.children[0] ? tr.children[0].textContent.trim() : "",
        tagged: !!(tr.querySelector(".testtag"))
      }));
      return rows;
    });
    const test = tags.filter(t => /RES-TEST/.test(t.ref));
    const live = tags.filter(t => /RES-/.test(t.ref) && !/RES-TEST/.test(t.ref));
    ok("the fixture really does have one", test.length === 1, tags.slice(0, 3));
    ok("it is tagged", test.every(t => t.tagged), test);
    // The half that makes it not vacuous: production rows must NOT be tagged.
    ok("and production rows are not", live.length > 0 && live.every(t => !t.tagged),
      live.slice(0, 3));
    await ctx.close();
  }

  // ══ THE DELETE CONTROL ═══════════════════════════════════════════════════

  // ── 6. a salesperson is not shown it ─────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("6. role gating");
    await click(p, "#rows tr"); await p.waitForTimeout(250);
    ok("the drawer opened", (await p.evaluate(() => document.getElementById("hl-console-host")
      .shadowRoot.getElementById("drawer").classList.contains("open"))) === true);
    ok("sales sees no delete control",
      (await p.evaluate(() => !document.getElementById("hl-console-host")
        .shadowRoot.getElementById("dxGo"))) === true);
    ok("but does see cancel, which is the right verb for them",
      (await p.evaluate(() => !!document.getElementById("hl-console-host")
        .shadowRoot.getElementById("cxGo"))) === true);
    await ctx.close();
  }

  // ── 7. an admin is, and it refuses to fire carelessly ────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("7. the delete gates");
    await click(p, "#rows tr:nth-child(2)"); await p.waitForTimeout(250);
    ok("admin sees it", (await p.evaluate(() => !!document.getElementById("hl-console-host")
      .shadowRoot.getElementById("dxGo"))) === true);
    ok("it says it is not cancel",
      /not the same as cancelling/.test(await txt(p, ".danger-sect")));

    // No reason.
    await click(p, "#dxGo"); await p.waitForTimeout(80);
    ok("no reason, no request", (await p.evaluate(() => window.__DELETED)) === null);
    ok("and it says why", /Give a reason/.test(await txt(p, "#dxErr")), await txt(p, "#dxErr"));

    // Reason but no typed confirmation.
    await set(p, "dxWhy", "Duplicate of RES-SAN-004.");
    await click(p, "#dxGo"); await p.waitForTimeout(80);
    ok("a reason alone is not enough", (await p.evaluate(() => window.__DELETED)) === null);
    ok("it names what to type", /Type RES-/.test(await txt(p, "#dxErr")), await txt(p, "#dxErr"));

    // A WRONG confirmation - the half that makes the next assertion mean something.
    await set(p, "dxConfirm", "RES-SAN-999");
    await click(p, "#dxGo"); await p.waitForTimeout(80);
    ok("the wrong reference is refused", (await p.evaluate(() => window.__DELETED)) === null);

    // The right one.
    const want = await p.evaluate(() => document.getElementById("hl-console-host")
      .shadowRoot.querySelector(".danger-sect .mono").textContent.trim());
    await set(p, "dxConfirm", want);
    await click(p, "#dxGo"); await p.waitForTimeout(400);
    const d = await p.evaluate(() => window.__DELETED);
    ok("now it sends", !!d, d);
    ok("to the delete endpoint", d && /\/delete$/.test(d.url), d && d.url);
    ok("carrying the reason", d && d.body.reason === "Duplicate of RES-SAN-004.", d && d.body);
    // OFF unless ticked. This is the whole point of the default.
    ok("and NOT renumbering", d && !("resequence" in d.body), d && d.body);
    ok("the drawer closed", (await p.evaluate(() => document.getElementById("hl-console-host")
      .shadowRoot.getElementById("drawer").classList.contains("open"))) === false);
    ok("and it reported what happened", /Deleted RES-SAN-031/.test(await txt(p, "#who")),
      await txt(p, "#who"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 8. the renumber is opt-in and asks a second time ─────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("8. the renumber");
    await click(p, "#rows tr:nth-child(2)"); await p.waitForTimeout(250);
    ok("the checkbox is off to begin with",
      (await p.evaluate(() => document.getElementById("hl-console-host")
        .shadowRoot.getElementById("dxSeq").checked)) === false);
    ok("and warns what it costs",
      /means a different deal/.test(await txt(p, ".danger-sect")));

    await set(p, "dxWhy", "Rehearsal nobody saw.");
    const want = await p.evaluate(() => document.getElementById("hl-console-host")
      .shadowRoot.querySelector(".danger-sect .mono").textContent.trim());
    await set(p, "dxConfirm", want);
    await set(p, "dxSeq", true);

    // DISMISSED. A confirm the user backs out of must send nothing.
    p.once("dialog", d => d.dismiss());
    await click(p, "#dxGo"); await p.waitForTimeout(200);
    ok("a dismissed confirm sends nothing", (await p.evaluate(() => window.__DELETED)) === null);

    p.once("dialog", d => d.accept());
    await click(p, "#dxGo"); await p.waitForTimeout(400);
    const d = await p.evaluate(() => window.__DELETED);
    ok("accepting sends it", !!d, d);
    ok("with resequence true", d && d.body.resequence === true, d && d.body);
    ok("and the count is reported back", /shifted/.test(await txt(p, "#who")), await txt(p, "#who"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 9. the force checkbox appears only where it applies ──────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("9. the payfast force");
    // Row 2 was given payment_status MANUAL and no pf_payment_id by the fixture.
    await click(p, "#rows tr:nth-child(2)"); await p.waitForTimeout(250);
    ok("no force checkbox on a manual reservation",
      (await p.evaluate(() => !document.getElementById("hl-console-host")
        .shadowRoot.getElementById("dxForce"))) === true);
    // Row 1 kept its pf_payment_id.
    await click(p, "#rows tr:nth-child(1)"); await p.waitForTimeout(250);
    ok("but there is one where Payfast has a record",
      (await p.evaluate(() => !!document.getElementById("hl-console-host")
        .shadowRoot.getElementById("dxForce"))) === true);
    ok("and it names the payment", /pf0/.test(await txt(p, ".danger-sect")));
    await ctx.close();
  }

  // ══ THE ADDRESS TYPE-AHEAD ═══════════════════════════════════════════════

  // ── 10. suggestions, attribution, and what lands in the field ────────────
  {
    const { ctx, p } = await open();
    console.log("10. address suggestions");
    await click(p, "#newRes"); await p.waitForTimeout(80);
    ok("the list starts closed", (await seen(p, "#nrAcList")) === false);

    // Under the four-character minimum: no request at all. Every keystroke is billable.
    await set(p, "nr_address", "17 ");
    await p.waitForTimeout(450);
    ok("three characters ask nothing",
      (await p.evaluate(() => window.__ADDR_CALLS.length)) === 0,
      await p.evaluate(() => window.__ADDR_CALLS));

    await set(p, "nr_address", "17 Alice Road");
    await p.waitForFunction(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const b = r.getElementById("nrAcList");
      return b && b.classList.contains("is-open");
    }, null, { timeout: 5000 });

    const list = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return [].map.call(r.querySelectorAll("#nrAcList [data-ac]"), el => ({
        main: el.querySelector("b") ? el.querySelector("b").textContent : null,
        secondary: el.querySelector("span") ? el.querySelector("span").textContent : null
      }));
    });
    ok("two suggestions are drawn", list.length === 2, list);
    ok("as a main line", list[0].main === "17 Alice Road", list[0]);
    ok("and a quieter second line", /Florida Park/.test(list[0].secondary || ""), list[0]);
    // A licence condition, not a courtesy.
    ok("the Google attribution is shown",
      (await txt(p, "#nrAcList .nr-ac-note")) === "Powered by Google");

    const called = await p.evaluate(() => window.__ADDR_CALLS[0]);
    ok("the query is sent", /q=17%20Alice%20Road|q=17\+Alice\+Road/.test(called), called);
    ok("with a session token", /session=/.test(called), called);

    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .querySelector('#nrAcList [data-ac="1"]')
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    await p.waitForTimeout(80);
    // THE WHOLE LABEL, not the two lines of markup concatenated.
    ok("the full address lands in the field",
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
        .getElementById("nr_address").value)) === "17 Alice Street, Sandton, 2196, South Africa");
    ok("and the list closes", (await seen(p, "#nrAcList")) === false);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 11. the keyboard reaches it too ──────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("11. keyboard");
    await click(p, "#newRes"); await p.waitForTimeout(80);
    await set(p, "nr_address", "17 Alice Road");
    await p.waitForFunction(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const b = r.getElementById("nrAcList");
      return b && b.classList.contains("is-open");
    }, null, { timeout: 5000 });
    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .getElementById("nr_address").focus());
    await p.keyboard.press("ArrowDown");
    await p.waitForTimeout(40);
    ok("arrow down highlights the first",
      (await p.evaluate(() => {
        const r = document.getElementById("hl-console-host").shadowRoot;
        const a = r.querySelector("#nrAcList .is-active");
        return a ? a.getAttribute("data-ac") : null;
      })) === "0");
    await p.keyboard.press("Enter");
    await p.waitForTimeout(60);
    ok("enter takes it",
      /Florida Park/.test(await p.evaluate(() => document.getElementById("hl-console-host")
        .shadowRoot.getElementById("nr_address").value)));
    ok("the form is still open - Enter picked, it did not submit",
      (await p.evaluate(() => document.getElementById("hl-console-host")
        .shadowRoot.getElementById("newres").classList.contains("open"))) === true);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 12. a proxy that cannot answer changes nothing ───────────────────────
  {
    const { ctx, p } = await open("?addr=fail");
    console.log("12. no key, no harm");
    await click(p, "#newRes"); await p.waitForTimeout(80);
    await set(p, "nr_address", "17 Alice Road");
    await p.waitForTimeout(500);
    ok("nothing is drawn", (await seen(p, "#nrAcList")) === false);
    ok("the typed address is untouched",
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
        .getElementById("nr_address").value)) === "17 Alice Road");
    const before = await p.evaluate(() => window.__ADDR_CALLS.length);
    ok("it did ask once", before === 1, before);
    // Retired for a minute rather than asked on every keystroke.
    await set(p, "nr_address", "17 Alice Road, Roodepoort");
    await p.waitForTimeout(500);
    ok("and does not ask again", (await p.evaluate(() => window.__ADDR_CALLS.length)) === 1,
      await p.evaluate(() => window.__ADDR_CALLS.length));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 13. an empty answer is an answer ─────────────────────────────────────
  {
    const { ctx, p } = await open("?addr=empty");
    console.log("13. no matches");
    await click(p, "#newRes"); await p.waitForTimeout(80);
    await set(p, "nr_address", "qqqq zzzz");
    await p.waitForTimeout(500);
    ok("nothing is drawn", (await seen(p, "#nrAcList")) === false);
    // ok:true with no rows means Google looked and found nothing - not a broken proxy,
    // so the engine must NOT be retired.
    await set(p, "nr_address", "17 Alice Road");
    await p.waitForTimeout(500);
    ok("and the engine keeps being asked",
      (await p.evaluate(() => window.__ADDR_CALLS.length)) === 2,
      await p.evaluate(() => window.__ADDR_CALLS));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 14. the address still reaches the server ─────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("14. the picked address is sent");
    await click(p, "#newRes"); await p.waitForTimeout(80);
    await fill(p, { nr_address: "" });
    await set(p, "nr_address", "17 Alice Road");
    await p.waitForFunction(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const b = r.getElementById("nrAcList");
      return b && b.classList.contains("is-open");
    }, null, { timeout: 5000 });
    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .querySelector('#nrAcList [data-ac="0"]')
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    await p.waitForTimeout(80);
    await click(p, "#nrNext"); await p.waitForTimeout(80);
    await click(p, "#nrGo"); await p.waitForTimeout(300);
    const body = await p.evaluate(() => window.__POSTED);
    // A picked suggestion sets the input directly rather than through the input event,
    // so this is the assertion that proves NR.v was updated with it.
    ok("the chosen address is in the payload",
      body && body.address === "17 Alice Road, Florida Park, Roodepoort, 1709, South Africa",
      body && body.address);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
