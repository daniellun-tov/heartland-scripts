/* A home's life from the Inventory tab - add, retire, restore, remove. Phase C's last
   console piece, 10 Sep. The assertions are about what reaches the server and what the
   screen refuses BEFORE the round trip: the dry run gates Add, the number is sent plain, a
   retire carries its reason, and removing a row for good needs the number typed back.

   The fixture mirrors create_unit and delete_unit's refusals (see dash.html), so a green run
   says the console does the right thing with the answers it will actually get - never that
   the server gives them. run_smoke_units is the server's own proof. */
const { chromium } = require("playwright");
const FX = "file://" + require("path").join(__dirname, "fixtures");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}
const click = (p, sel) => p.evaluate(s => document.getElementById("hl-console-host").shadowRoot.querySelector(s).click(), sel);
const txt = (p, sel) => p.evaluate(s => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  return e ? e.textContent.trim() : null;
}, sel);
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
const disabled = (p, id) => p.evaluate(i => {
  const e = document.getElementById("hl-console-host").shadowRoot.getElementById(i);
  return e ? e.disabled : null;
}, id);
const exists = (p, id) => p.evaluate(i =>
  !!document.getElementById("hl-console-host").shadowRoot.getElementById(i), id);

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
  const openSv = async (p) => {
    await clickId(p, "tabInv"); await p.waitForTimeout(250);
    await set(p, "invProp", "stellenbosch"); await p.waitForTimeout(300);
  };

  // ── 1. who is offered it, and where ──────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("1. who is offered it");
    await openSv(p);
    ok("a salesperson is not offered Add a home", !(await exists(p, "invAddOpen")));
    await set(p, "invProp", "polaris"); await p.waitForTimeout(300);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }
  {
    const { ctx, p } = await open("?role=manager");
    await openSv(p);
    ok("a manager is, on a development that owns its stock", await exists(p, "invAddOpen"));
    await set(p, "invProp", "polaris"); await p.waitForTimeout(300);
    ok("but not on a CMS-backed one - its rows are a nightly shadow", !(await exists(p, "invAddOpen")));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. the dry run gates Add ──────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=manager");
    console.log("2. adding a home");
    await openSv(p);
    ok("the form is closed until asked for", (await count(p, "#invAdd")) === 0);
    await clickId(p, "invAddOpen"); await p.waitForTimeout(350);
    ok("opening it shows the form", (await count(p, "#invAdd")) === 1);
    ok("the variant picker is the register's active variants",
      (await count(p, "#invAddVar option")) === 4, await count(p, "#invAddVar option"));
    ok("Add is disabled before a Check", (await disabled(p, "invAddGo")) === true);

    await clickId(p, "invAddCheck"); await p.waitForTimeout(150);
    ok("a blank number is refused before the round trip",
      /needs a number/.test(await txt(p, "#invAddErr") || ""), await txt(p, "#invAddErr"));
    ok("and nothing was sent", (await p.evaluate(() => window.__UNIT_POSTED)) === undefined);

    await set(p, "invAddNum", "013");
    await set(p, "invAddVar", "A1");
    await clickId(p, "invAddCheck"); await p.waitForTimeout(150);
    ok("a padded number is refused before the round trip, naming the plain one",
      /13, not 013/.test(await txt(p, "#invAddErr") || ""), await txt(p, "#invAddErr"));
    ok("still nothing sent", (await p.evaluate(() => window.__UNIT_POSTED)) === undefined);

    await set(p, "invAddNum", "13");
    await set(p, "invAddName", "Corner plot");
    await clickId(p, "invAddCheck"); await p.waitForTimeout(400);
    const dry = await p.evaluate(() => window.__UNIT_POSTED);
    ok("Check sends a DRY RUN with the number, the variant CODE and the name",
      dry && dry.dry_run === true && dry.unit_number === "13" && dry.variant_code === "A1" &&
        dry.name === "Corner plot" && dry.property_slug === "stellenbosch", dry);
    ok("the preview names what will be created",
      /Corner plot/.test(await txt(p, "#invAddPreview") || "") && /A1/.test(await txt(p, "#invAddPreview") || ""),
      await txt(p, "#invAddPreview"));
    ok("Add is enabled after a Check", (await disabled(p, "invAddGo")) === false);
    ok("nothing was created by the Check",
      (await p.evaluate(() => window.__INV_SV.units.length)) === 12);

    /* Anything typed after the Check stales the preview - the server has not seen it. */
    await set(p, "invAddNum", "14"); await p.waitForTimeout(100);
    ok("typing after a Check disables Add again", (await disabled(p, "invAddGo")) === true);
    ok("and drops the preview", (await count(p, "#invAddPreview")) === 0);

    await set(p, "invAddNum", "13");
    await clickId(p, "invAddCheck"); await p.waitForTimeout(400);
    await clickId(p, "invAddGo"); await p.waitForTimeout(500);
    const made = await p.evaluate(() => window.__UNIT_POSTED);
    ok("Add sends the same body WITHOUT dry_run",
      made && made.dry_run === undefined && made.unit_number === "13" && made.variant_code === "A1", made);
    ok("the form closed", (await count(p, "#invAdd")) === 0);
    ok("the grid re-read the server and shows the new home",
      (await count(p, '#viewInv [data-inv-edit="13"]')) === 1);
    ok("and All homes went 12 to 13", (await txt(p, '[data-inv-state=""] b')) === "13",
      await txt(p, '[data-inv-state=""] b'));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. the server's refusal is shown, not swallowed ───────────────────────
  {
    const { ctx, p } = await open("?role=manager");
    console.log("3. a refusal from the server");
    await openSv(p);
    await clickId(p, "invAddOpen"); await p.waitForTimeout(350);
    await set(p, "invAddNum", "1");
    await set(p, "invAddVar", "A1");
    await clickId(p, "invAddCheck"); await p.waitForTimeout(400);
    ok("a number a real home holds comes back as the server's words",
      /already exists/.test(await txt(p, "#invAddErr") || ""), await txt(p, "#invAddErr"));
    ok("and Add stays disabled", (await disabled(p, "invAddGo")) === true);
    ok("the form stays open with what was typed",
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot.getElementById("invAddNum").value)) === "1");
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. retire from the row, restore from the list, remove with the number typed ──
  {
    const { ctx, p } = await open("?role=manager");
    console.log("4. retire, restore, remove");
    /* One natively created home beside the imported ones: Remove is offered only for a row
       the console's own create made, because an importer writes its rows back. */
    await p.evaluate(() => {
      const t = window.__INV_SV.units[0];
      window.__INV_SV.units.push(Object.assign({}, t, {
        unit_id: 150, unit_number: "13", name: "Home 13", source: "native", wf_unit_id: null,
        state: "available", state_source: "none", is_available: true, offer_state: null,
        phase_id: null, phase: null
      }));
    });
    await openSv(p);
    ok("no retired list while nothing is retired", (await count(p, "#invRetired")) === 0);
    await click(p, '#viewInv [data-inv-edit="3"]'); await p.waitForTimeout(150);
    ok("the state editor offers Retire on a development that owns its stock",
      (await count(p, "#invRetire")) === 1);
    ok("and names the home in the development's convention",
      /03/.test(await txt(p, "#invRetire") || ""), await txt(p, "#invRetire"));

    await clickId(p, "invRetire"); await p.waitForTimeout(150);
    ok("retiring without a reason is refused before the round trip",
      /carry a reason/.test(await txt(p, "#invEditErr") || ""));
    ok("and nothing was sent", (await p.evaluate(() => window.__UNIT_DEL_POSTED)) === undefined);

    await set(p, "invReason", "Plot merged into 4, per the amended SDP.");
    await clickId(p, "invRetire"); await p.waitForTimeout(500);
    const ret = await p.evaluate(() => window.__UNIT_DEL_POSTED);
    ok("retire sends the ROW ID and the reason, and neither hard nor restore",
      ret && ret.unit_id === 103 && /amended SDP/.test(ret.reason) && ret.hard === undefined && ret.restore === undefined, ret);
    ok("the editor closed", (await count(p, "#viewInv .inv-edit")) === 0);
    ok("the home left the grid", (await count(p, '#viewInv [data-inv-edit="3"]')) === 0);
    ok("All homes went 13 to 12", (await txt(p, '[data-inv-state=""] b')) === "12",
      await txt(p, '[data-inv-state=""] b'));
    ok("and it is in the retired list", (await count(p, '#invRetired [data-retired-row="103"]')) === 1);
    ok("which offers Restore", (await count(p, '[data-inv-restore="103"]')) === 1);
    ok("but NOT Remove - an imported row is written back by its importer, so it can only be retired",
      (await count(p, '[data-inv-remove="103"]')) === 0);

    await click(p, '[data-inv-restore="103"]'); await p.waitForTimeout(500);
    const res = await p.evaluate(() => window.__UNIT_DEL_POSTED);
    ok("restore sends restore true for the row", res && res.unit_id === 103 && res.restore === true, res);
    ok("the home is back in the grid", (await count(p, '#viewInv [data-inv-edit="3"]')) === 1);
    ok("and the retired list is gone", (await count(p, "#invRetired")) === 0);
    ok("All homes is 13 again", (await txt(p, '[data-inv-state=""] b')) === "13");

    /* The native home: retire, then Remove needs the number typed back - a dialog is
       dismissed by the reflex that opened it. */
    await click(p, '#viewInv [data-inv-edit="13"]'); await p.waitForTimeout(150);
    await set(p, "invReason", "Created by mistake.");
    await clickId(p, "invRetire"); await p.waitForTimeout(500);
    ok("the native home offers Remove once retired", (await count(p, '[data-inv-remove="150"]')) === 1);
    await click(p, '[data-inv-remove="150"]'); await p.waitForTimeout(150);
    ok("Remove asks for the number", (await count(p, "#invRemoveConfirm")) === 1);
    await set(p, "invRemoveConfirm", "3");
    await clickId(p, "invRemoveGo"); await p.waitForTimeout(150);
    ok("the wrong number is refused before the round trip",
      /\(13\)/.test(await txt(p, "#invRetiredErr") || ""), await txt(p, "#invRetiredErr"));
    ok("and nothing was sent", (await p.evaluate(() => window.__UNIT_DEL_POSTED.hard)) === undefined);
    await clickId(p, "invRemoveCancel"); await p.waitForTimeout(150);
    ok("Keep puts the buttons back", (await count(p, '[data-inv-restore="150"]')) === 1);

    await click(p, '[data-inv-remove="150"]'); await p.waitForTimeout(150);
    await set(p, "invRemoveConfirm", "13");
    await clickId(p, "invRemoveGo"); await p.waitForTimeout(500);
    const gone = await p.evaluate(() => window.__UNIT_DEL_POSTED);
    ok("remove sends hard true for the row", gone && gone.unit_id === 150 && gone.hard === true, gone);
    ok("the row is gone from the retired list and the grid",
      (await count(p, "#invRetired")) === 0 && (await count(p, '#viewInv [data-inv-edit="13"]')) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 5. the server refuses a retire - shown in the editor, editor stays open ──
  {
    const { ctx, p } = await open("?role=manager");
    console.log("5. a refused retire");
    await openSv(p);
    await p.evaluate(() => { window.__UNIT_DEL_FAILS = "Somebody is part-way through reserving this home, so it cannot be retired, restored or removed while that hold is live."; });
    await click(p, '#viewInv [data-inv-edit="2"]'); await p.waitForTimeout(150);
    await set(p, "invReason", "Trying.");
    await clickId(p, "invRetire"); await p.waitForTimeout(400);
    ok("the refusal is shown in the editor", /part-way through reserving/.test(await txt(p, "#invEditErr") || ""));
    ok("the editor stays open", (await count(p, "#viewInv .inv-edit")) === 1);
    ok("the home is still in the grid", (await count(p, '#viewInv [data-inv-edit="2"]')) === 1);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 6. a salesperson sees the retired list but cannot act on it ───────────
  {
    const { ctx, p } = await open();
    console.log("6. the retired list for a salesperson");
    await p.evaluate(() => {
      const sv = window.__INV_SV, row = sv.units.splice(4, 1)[0];
      sv.retired.push({ unit_id: row.unit_id, unit_number: row.unit_number, name: row.name,
        variant_code: row.variant_code, type_code: row.type_code, source: row.source, __row: row });
    });
    await openSv(p);
    ok("the retired list is shown", (await count(p, "#invRetired")) === 1);
    ok("without Restore or Remove", (await count(p, "[data-inv-restore], [data-inv-remove]")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
