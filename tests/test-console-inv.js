/* The Inventory tab. The assertions are about what an agent can TRUST on this screen:
   that a state matches the authority behind it, that placeholder money is labelled,
   and that clicking a taken home reaches the deal on it. */
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
const R = "document.getElementById('hl-console-host').shadowRoot";
const click = (p, sel) => p.evaluate(s => eval(`${"document.getElementById('hl-console-host').shadowRoot"}`).querySelector(s).click(), sel);
const txt = (p, sel) => p.evaluate(s => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  return e ? e.textContent.trim() : null;
}, sel);
const all = (p, sel) => p.evaluate(s => [].map.call(
  document.getElementById("hl-console-host").shadowRoot.querySelectorAll(s), e => e.textContent.trim()), sel);
const count = (p, sel) => p.evaluate(s =>
  document.getElementById("hl-console-host").shadowRoot.querySelectorAll(s).length, sel);
const set = (p, id, value) => p.evaluate(a => {
  const r = document.getElementById("hl-console-host").shadowRoot;
  const el = r.getElementById(a.id);
  el.value = a.value;
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input"));
}, { id, value });
const clickId = (p, id) => p.evaluate(i =>
  document.getElementById("hl-console-host").shadowRoot.getElementById(i).click(), id);

(async () => {
  const browser = await chromium.launch();
  const open = async (q) => {
    const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1400, height: 1200 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html" + (q || ""));
    await p.waitForTimeout(450);
    return { ctx, p };
  };
  const openInv = async (p) => { await clickId(p, "tabInv"); await p.waitForTimeout(250); };

  // ── 1. it exists, and it lands somewhere ────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("1. opening the tab");
    ok("there is an Inventory tab", (await count(p, "#tabInv")) === 1);
    await openInv(p);
    ok("it is selected", (await p.evaluate(() => document.getElementById("hl-console-host")
      .shadowRoot.getElementById("tabInv").getAttribute("aria-selected"))) === "true");
    ok("and it loaded a development without being asked",
      (await count(p, "#viewInv table tbody tr")) > 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. placeholder money is labelled ────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("2. prices that are not money");
    await openInv(p);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(250);
    const warn = await txt(p, "#viewInv .inv-warn");
    ok("a banner says the prices are placeholders", /placeholder/i.test(warn || ""), warn);
    ok("it names the development", /Stellenbosch Village/.test(warn || ""), warn);
    ok("and every price cell is marked as such",
      (await count(p, "#viewInv .inv-ph")) === (await count(p, "#viewInv tbody tr")));

    // The CMS development must NOT be tarred with it.
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(250);
    /* Targeted at the PRICE banner by id. It used to count every .inv-warn on the screen,
       which meant the day availability grew a banner of its own this assertion went red
       about something it was never testing. */
    ok("a development with real prices gets no banner", (await count(p, "#invPriceWarn")) === 0);
    ok("and no price is marked placeholder", (await count(p, "#viewInv .inv-ph")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. a state says which authority answered ────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("3. where a state comes from");
    await openInv(p);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(250);
    /* 5 of the 12 are taken without a reservation. Each of those rows must say so -
       an agent phoning a buyer needs to know there is no deal behind the word. A sixth row
       is off the market for a different reason entirely - it is waiting on a release - and
       it says THAT instead, because the two are undone in completely different places. */
    const srcs = await all(p, "#viewInv .st-src");
    ok("every reservation-less taken home is flagged on its row",
      srcs.filter(t => t === "no reservation").length === 5, srcs);
    ok("and one waiting on a release says so rather than borrowing the same words",
      srcs.filter(t => /not released/.test(t)).length === 1, srcs);
    ok("and the screen explains it once, above the table",
      /without a reservation behind them/.test(await txt(p, "#viewInv") || ""));

    await set(p, "invProp", "polaris");
    await p.waitForTimeout(250);
    ok("a home held by a real reservation is not flagged",
      (await count(p, "#viewInv .st-src")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. the counts are the filter ────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("4. filtering");
    await openInv(p);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(250);
    ok("all 12 rows to start", (await count(p, "#viewInv tbody tr")) === 12);
    await click(p, '[data-inv-state="available"]');
    await p.waitForTimeout(120);
    /* SIX, NOT SEVEN, AND THE MISSING ONE IS THE POINT. Unit 7 is priced, unsold and
       unheld - and sits in a phase nobody has released, so it is not stock an agent may
       sell. The phase is read last and only speaks where the hold and the recorded state
       both said nothing, which is exactly what took this row out of Available. */
    ok("clicking Available narrows to the 6 actually on the market",
      (await count(p, "#viewInv tbody tr")) === 6);
    ok("and every remaining row says available",
      (await all(p, "#viewInv .st")).every(t => t === "available"));
    await click(p, '[data-inv-state="available"]');
    await p.waitForTimeout(120);
    ok("clicking it again clears the filter", (await count(p, "#viewInv tbody tr")) === 12);

    await set(p, "invQ", "unit 3");
    await p.waitForTimeout(120);
    ok("search narrows too", (await count(p, "#viewInv tbody tr")) === 1);
    ok("the search box kept focus while typing",
      (await p.evaluate(() => document.getElementById("hl-console-host")
        .shadowRoot.activeElement.id)) === "invQ");
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 5. a taken home reaches its deal ────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("5. clicking through to the buyer");
    await openInv(p);
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(250);
    ok("the sold row names the buyer",
      /Mabitsela Mawasha/.test(await txt(p, "#viewInv tbody") || ""));
    /* Polaris has the inventory_edit module OFF, so nothing here offers the state editor. */
    ok("no home offers the state editor while the module is off",
      (await count(p, "#viewInv [data-inv-edit]")) === 0);
    ok("but the sold home still reaches its deal — that is a different control",
      (await count(p, "#viewInv [data-inv-deal]")) === 1);
    await click(p, "#viewInv [data-inv-deal]");
    await p.waitForTimeout(400);
    ok("it switched to Pipeline",
      (await p.evaluate(() => document.getElementById("hl-console-host")
        .shadowRoot.getElementById("tabPipe").getAttribute("aria-selected"))) === "true");
    ok("and searched for that reservation",
      (await p.evaluate(() => document.getElementById("hl-console-host")
        .shadowRoot.getElementById("q").value)) === "RES-POL-001");
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 6. what the development still owes ──────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("6. setup completeness");
    await openInv(p);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(250);
    const t = await txt(p, "#viewInv") || "";
    ok("it lists what is unset", /still owes/.test(t));
    ok("in words, not column names", /Occupational rental/.test(t) && !/occupational_rental_pct/.test(t));
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(250);
    ok("a complete development says nothing",
      !/still owes/.test(await txt(p, "#viewInv") || ""));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 7. recording a home's availability ──────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("7. changing what a home says");
    await openInv(p);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(250);

    ok("no editor until a home is picked", (await count(p, "#viewInv .inv-edit")) === 0);
    await click(p, '#viewInv [data-inv-edit="1"]');
    await p.waitForTimeout(150);
    ok("clicking an available home opens one", (await count(p, "#viewInv .inv-edit")) === 1);
    /* Stellenbosch writes its numbers two wide. The STORED number is 1; the label is 01,
       and that difference is the whole point of holding padding as a display setting. */
    ok("it names the home in the development's own convention",
      /unit 01\b/i.test(await txt(p, "#viewInv .inv-edit-head") || ""),
      await txt(p, "#viewInv .inv-edit-head"));
    ok("only one editor at a time", (await count(p, "#viewInv .inv-edit")) === 1);

    /* Nothing is preselected, so Save cannot be a no-op that still writes an event. */
    ok("Save is disabled until a state is chosen",
      (await p.evaluate(() => document.getElementById("hl-console-host")
        .shadowRoot.getElementById("invSave").disabled)) === true);

    await click(p, '[data-inv-set="sold"]');
    await p.waitForTimeout(120);
    ok("picking a state enables Save",
      (await p.evaluate(() => document.getElementById("hl-console-host")
        .shadowRoot.getElementById("invSave").disabled)) === false);

    // A reason is not optional, and the refusal happens before the round trip.
    await clickId(p, "invSave");
    await p.waitForTimeout(150);
    ok("saving without a reason is refused",
      /has to carry a reason/.test(await txt(p, "#invEditErr") || ""));
    ok("and nothing was sent",
      (await p.evaluate(() => window.__STATE_POSTED)) === undefined);

    await set(p, "invReason", "Sold off-plan in the show house, 3 Sept.");
    await set(p, "invRef", "SV-2026-014");
    await clickId(p, "invSave");
    await p.waitForTimeout(400);
    const sent = await p.evaluate(() => window.__STATE_POSTED);
    ok("the development, home and state all reach the server",
      sent.property_slug === "stellenbosch" && sent.state === "sold", sent);
    ok("and it sends the STORED number, not the padded label",
      sent.unit_number === "1", sent.unit_number);
    ok("with the reason", /show house/.test(sent.reason || ""), sent);
    ok("and the reference", sent.external_ref === "SV-2026-014", sent);
    ok("the editor closed", (await count(p, "#viewInv .inv-edit")) === 0);
    /* Re-read from the server rather than patched locally, so the counts move with it. */
    ok("the home now reads sold",
      /sold/.test(await p.evaluate(() => {
        const r = document.getElementById("hl-console-host").shadowRoot;
        const b = r.querySelector('[data-inv-edit="1"]');
        return b ? b.closest("tr").textContent : "";
      })));
    ok("and Available dropped from 6 to 5",
      (await txt(p, '[data-inv-state="available"] b')) === "5",
      await txt(p, '[data-inv-state="available"] b'));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 8. the server's refusal is shown, not swallowed ─────────────────────
  {
    const { ctx, p } = await open();
    console.log("8. when the server says no");
    await openInv(p);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(250);
    await p.evaluate(() => { window.__STATE_FAILS = true; });
    await click(p, '#viewInv [data-inv-edit="2"]');
    await p.waitForTimeout(150);
    await click(p, '[data-inv-set="sold"]');
    await set(p, "invReason", "Trying to mark a home that is already held.");
    await clickId(p, "invSave");
    await p.waitForTimeout(400);
    ok("the refusal is shown in the editor",
      /held by a live reservation/.test(await txt(p, "#invEditErr") || ""),
      await txt(p, "#invEditErr"));
    ok("the editor stays open so the typing is not lost",
      (await count(p, "#viewInv .inv-edit")) === 1);
    ok("and the reason survives",
      (await p.evaluate(() => document.getElementById("hl-console-host")
        .shadowRoot.getElementById("invReason").value)).length > 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 9. a CMS-backed development warns before it lets you ────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("9. the CMS warning");
    /* Polaris has the module off by default, which is the safe state. Turn it on through
       the real path, because that is how somebody would actually reach this warning. */
    await clickId(p, "tabDev");
    await p.waitForTimeout(250);
    await click(p, '[data-feat-dev="polaris"]');
    await p.waitForTimeout(150);
    await click(p, '[data-feat-key="inventory_edit"]');
    await p.waitForTimeout(400);

    await openInv(p);
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(250);
    await click(p, "#viewInv [data-inv-edit]");
    await p.waitForTimeout(150);
    ok("it says the CMS still owns this development's flag",
      /does not.*change the CMS|not.*change the CMS/i.test(
        (await txt(p, "#viewInv .inv-edit-warn")) || ""),
      await txt(p, "#viewInv .inv-edit-warn"));

    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(250);
    await click(p, "#viewInv [data-inv-edit]");
    await p.waitForTimeout(150);
    ok("a model-native development gets no such warning",
      (await count(p, "#viewInv .inv-edit-warn")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  /* ── THE CMS AVAILABILITY MIRROR ────────────────────────────────────────
     A development that sells outside the reserve flow leaves no reservation and no recorded
     state here, so every home reads available - Outeniqua showed ten for sale on 7 Sep while
     the CMS had five of them sold. These grade the control that goes and reads the CMS, and
     above all the two things that make it safe to press: it never writes on the first click,
     and it never overrules a person. */
  {
    const { ctx, p } = await open("?role=admin");
    console.log("the CMS availability mirror");
    await openInv(p);
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(300);
    await p.evaluate(() => { window.__CMS_WANT = { "6": "sold", "10": "sold" }; });

    ok("a CMS-backed development is offered the sync", (await count(p, "#cmsCheck")) === 1);
    /* Nothing to sync FROM on a development whose inventory lives here. */
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(300);
    ok("a Xano-native one is not", (await count(p, "#cmsCheck")) === 0);
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(300);

    /* THE FIRST CLICK NEVER WRITES. A control that takes homes off the market on one press
       is not one anybody should have to trust. */
    await click(p, "#cmsCheck");
    await p.waitForTimeout(500);
    const dry = await p.evaluate(() => window.__CMS_POSTED);
    ok("checking asks for a dry run", dry.dry_run === true && dry.property_slug === "polaris", dry);
    ok("and it says what would change, by home",
      /would change 1 home/i.test(await txt(p, ".cms-plan h4") || "") &&
      /Home 6/.test(await txt(p, ".cms-plan") || ""),
      await txt(p, ".cms-plan"));
    /* Home 10 is already sold in this fixture, so only home 6 moves - a mirror that listed
       every home it looked at would be noise, and the count would stop meaning anything. */
    ok("a home already in step is not listed as a change",
      !/Home 10/.test(await txt(p, ".cms-plan ul") || "") &&
      /1 already right/.test(await txt(p, ".cms-plan") || ""),
      await txt(p, ".cms-plan ul"));
    ok("the grid has not moved yet",
      (await txt(p, '#viewInv [data-inv-state="sold"] b')) === "1",
      await txt(p, '#viewInv [data-inv-state="sold"] b'));

    await click(p, "#cmsApply");
    await p.waitForTimeout(700);
    const wet = await p.evaluate(() => window.__CMS_POSTED);
    ok("applying sends a real run", wet.dry_run === false, wet);
    ok("exactly two calls, one each way",
      (await p.evaluate(() => window.__CMS_POSTS)) === 2,
      await p.evaluate(() => window.__CMS_POSTS));
    ok("and the grid moves with it",
      (await txt(p, '#viewInv [data-inv-state="sold"] b')) === "2",
      await txt(p, '#viewInv [data-inv-state="sold"] b'));
    ok("the panel reports what it did, not what it would do",
      /Done/i.test(await txt(p, ".cms-plan h4") || ""), await txt(p, ".cms-plan h4"));
    ok("and stops offering Apply", (await count(p, "#cmsApply")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  {
    const { ctx, p } = await open("?role=admin");
    console.log("the mirror never overrules a person");
    await openInv(p);
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(300);
    /* The CMS says sold; somebody recorded reserved here. The server refuses to touch it and
       reports the disagreement - and the panel must SHOW that rather than fold it into a
       count, because "the CMS and one of your people disagree about home 6" is the most
       useful thing on the screen. */
    await p.evaluate(() => {
      window.__CMS_WANT = { "6": "sold", "10": "sold" };
      window.__CMS_KEEP = { "6": "reserved" };
    });
    await click(p, "#cmsCheck");
    await p.waitForTimeout(500);
    const kept = await txt(p, ".cms-keep");
    ok("a hand-set state is called out on its own, with both answers",
      /somebody set them here/i.test(kept || "") &&
      /reserved/.test(kept || "") && /sold/.test(kept || ""), kept);
    ok("and it is not counted as a change",
      /already in step/i.test(await txt(p, ".cms-plan h4") || ""),
      await txt(p, ".cms-plan h4"));
    /* Nothing to apply, so nothing to press - a mirror whose only proposal is one it refuses
       to make must not offer a button that would do nothing. */
    ok("and Apply is not offered", (await count(p, "#cmsApply")) === 0);

    await click(p, "#cmsCancel");
    await p.waitForTimeout(200);
    ok("Cancel puts the panel away", (await count(p, ".cms-plan")) === 0);
    ok("and sends nothing more",
      (await p.evaluate(() => window.__CMS_POSTS)) === 1,
      await p.evaluate(() => window.__CMS_POSTS));

    /* One development's sold list over another's stock is the mistake worth preventing. */
    await click(p, "#cmsCheck");
    await p.waitForTimeout(500);
    ok("a report is on screen", (await count(p, ".cms-plan")) === 1);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(300);
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(300);
    ok("switching development throws the report away", (await count(p, ".cms-plan")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  {
    const { ctx, p } = await open("?role=sales");
    console.log("the mirror is manager or admin");
    await openInv(p);
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(300);
    /* Hiding it is never the enforcement - the endpoint checks too - but a salesperson should
       not be shown a button that will be refused. */
    ok("a salesperson is not offered it", (await count(p, "#cmsCheck")) === 0);
    ok("while still being told the CMS owns availability here",
      /reads available until somebody says otherwise/i.test(
        await txt(p, "#viewInv .inv-warn") || ""),
      await txt(p, "#viewInv .inv-warn"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
