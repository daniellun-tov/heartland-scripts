/* The Development record card on the Developments tab - 10 Sep. The third kind of
   per-development fact beside modules and settings: the res_properties columns themselves.
   The assertions are about the two tiers (drawn by the server's `source`, shown here), one
   Save with one reason, the slug typed back for a switch, and the per-field report - the
   thing that makes "it saved" mean something. The fixture mirrors set_property's outcomes. */
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
const val = (p, sel) => p.evaluate(s => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  return e ? e.value : null;
}, sel);
const setSel = (p, sel, value) => p.evaluate(a => {
  const el = document.getElementById("hl-console-host").shadowRoot.querySelector(a.sel);
  el.value = a.value;
  el.dispatchEvent(new Event("input"));
}, { sel, value });
const set = (p, id, value) => setSel(p, "#" + id, value);
const clickId = (p, id) => p.evaluate(i =>
  document.getElementById("hl-console-host").shadowRoot.getElementById(i).click(), id);
const disabled = (p, id) => p.evaluate(i => {
  const e = document.getElementById("hl-console-host").shadowRoot.getElementById(i);
  return e ? e.disabled : null;
}, id);

(async () => {
  const browser = await chromium.launch();
  const open = async (q) => {
    const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1400, height: 1200 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html" + (q || "?role=admin"));
    await p.waitForTimeout(500);
    return { ctx, p };
  };
  const openDev = async (p, slug) => {
    await clickId(p, "tabDev"); await p.waitForTimeout(250);
    if (slug) { await click(p, '[data-feat-dev="' + slug + '"]'); await p.waitForTimeout(200); }
  };

  // ── 1. the two tiers, drawn by source ─────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("1. the tiers");
    await openDev(p, "stellenbosch");
    ok("the card is on the tab", (await count(p, "#recCard")) === 1);
    ok("a native development says so", /Made in Xano/.test(await txt(p, "#recCard .inv-owed") || ""));
    ok("every field is editable on a native development",
      (await count(p, "#recCard [data-rec-key], #recCard [data-rec-toggle]")) === 9 &&
        (await count(p, "#recCard [data-rec-ro]")) === 0);
    ok("the hold window shows the record's value", (await val(p, '[data-rec-key="hold_minutes"]')) === "30");
    ok("Save is disabled until something changes", (await disabled(p, "recSave")) === true);

    await openDev(p, "polaris");
    ok("a CMS-backed development says where its fields come from",
      /Webflow CMS/.test(await txt(p, "#recCard .inv-owed") || ""));
    ok("its four always-writable fields are editable",
      (await count(p, "#recCard [data-rec-key]")) === 4);
    ok("the rest are read-only and flagged from Webflow",
      (await count(p, "#recCard [data-rec-ro]")) === 5 &&
        (await count(p, "#recCard .feat-flag.is-default")) === 5);
    ok("the read-only fee is shown in rands", (await txt(p, '[data-rec-ro="reservation_fee_cents"]')) === "R 3000");
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. one Save, one reason, a per-field report ───────────────────────────
  {
    const { ctx, p } = await open();
    console.log("2. saving the hold window");
    await openDev(p, "stellenbosch");
    await setSel(p, '[data-rec-key="hold_minutes"]', "45");
    await p.waitForTimeout(100);
    ok("typing enables Save without a re-render", (await disabled(p, "recSave")) === false);
    ok("and marks the field", (await count(p, '[data-rec-key="hold_minutes"].is-dirty')) === 1);

    await clickId(p, "recSave"); await p.waitForTimeout(150);
    ok("saving without a reason is refused before the round trip",
      /carries a reason/.test(await txt(p, "#recErr") || ""), await txt(p, "#recErr"));
    ok("and nothing was sent", (await p.evaluate(() => window.__PROP_POSTED)) === undefined);
    ok("the typed value survived the refusal", (await val(p, '[data-rec-key="hold_minutes"]')) === "45");

    await set(p, "recReason", "Longer intake since the countdown starts at the first form.");
    await clickId(p, "recSave"); await p.waitForTimeout(500);
    const sent = await p.evaluate(() => window.__PROP_POSTED);
    ok("only the changed field is sent, as a number, with the reason",
      sent && sent.property_slug === "stellenbosch" && Object.keys(sent.fields).length === 1 &&
        sent.fields.hold_minutes === 45 && /Longer intake/.test(sent.reason), sent);
    ok("the report says what happened, per field",
      /Hold window: saved \(30 → 45\)/.test(await txt(p, "#recReport") || ""), await txt(p, "#recReport"));
    ok("the record was re-read, not patched: the input shows the value in force",
      (await val(p, '[data-rec-key="hold_minutes"]')) === "45");
    ok("Save is disabled again", (await disabled(p, "recSave")) === true);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. a switch asks for the slug typed back ──────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("3. a switch");
    await openDev(p, "stellenbosch");
    ok("no confirm box until a switch changes", (await count(p, "#recConfirm")) === 0);
    await click(p, '[data-rec-toggle="is_selling"]'); await p.waitForTimeout(200);
    ok("flipping Selling shows the confirm box", (await count(p, "#recConfirm")) === 1);
    ok("and the switch reads on", (await count(p, '[data-rec-toggle="is_selling"].is-on')) === 1);
    await set(p, "recReason", "Launch day.");
    await set(p, "recConfirm", "polaris");
    await clickId(p, "recSave"); await p.waitForTimeout(150);
    ok("the wrong slug is refused before the round trip",
      /\(stellenbosch\)/.test(await txt(p, "#recErr") || ""), await txt(p, "#recErr"));
    ok("and nothing was sent", (await p.evaluate(() => window.__PROP_POSTED)) === undefined);
    await set(p, "recConfirm", "Stellenbosch");
    await clickId(p, "recSave"); await p.waitForTimeout(500);
    const sent = await p.evaluate(() => window.__PROP_POSTED);
    ok("the right slug sends is_selling as a real boolean",
      sent && sent.fields.is_selling === true && Object.keys(sent.fields).length === 1, sent);
    ok("the switch stays on after the re-read", (await count(p, '[data-rec-toggle="is_selling"].is-on')) === 1);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. money in rands, refusals per field, and a 403 ──────────────────────
  {
    const { ctx, p } = await open();
    console.log("4. rands, a refused field, a refused call");
    await openDev(p, "stellenbosch");
    await setSel(p, '[data-rec-key="reservation_fee_cents"]', "3500");
    await setSel(p, '[data-rec-key="hold_minutes"]', "5000");
    await set(p, "recReason", "Testing.");
    await clickId(p, "recSave"); await p.waitForTimeout(500);
    const sent = await p.evaluate(() => window.__PROP_POSTED);
    ok("the fee is sent in CENTS", sent && sent.fields.reservation_fee_cents === 350000, sent);
    ok("the report shows one saved and one refused, with the server's reason",
      (await count(p, "#recReport li.is-applied")) === 1 &&
        (await count(p, "#recReport li.is-refused")) === 1 &&
        /longer than a day/.test(await txt(p, "#recReport li.is-refused") || ""),
      await txt(p, "#recReport"));
    ok("the refused field shows the value in force, not the one typed",
      (await val(p, '[data-rec-key="hold_minutes"]')) === "30");

    await p.evaluate(() => { window.__PROP_FAILS = true; });
    await setSel(p, '[data-rec-key="sales_email"]', "sales@sv.example");
    await set(p, "recReason", "Testing the refusal.");
    await clickId(p, "recSave"); await p.waitForTimeout(400);
    ok("a refused call is shown in the card", /Only an admin/.test(await txt(p, "#recErr") || ""));
    ok("and the draft is kept", (await val(p, '[data-rec-key="sales_email"]')) === "sales@sv.example");
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 5. discard, and switching development drops the draft ────────────────
  {
    const { ctx, p } = await open();
    console.log("5. discard");
    await openDev(p, "stellenbosch");
    await setSel(p, '[data-rec-key="whatsapp_from"]', "+27 82 000 0000");
    await clickId(p, "recDiscard"); await p.waitForTimeout(150);
    ok("Discard puts the record's value back", (await val(p, '[data-rec-key="whatsapp_from"]')) === "");
    await setSel(p, '[data-rec-key="whatsapp_from"]', "+27 82 000 0000");
    await openDev(p, "polaris");
    await openDev(p, "stellenbosch");
    ok("switching development drops a half-typed draft",
      (await val(p, '[data-rec-key="whatsapp_from"]')) === "" && (await disabled(p, "recSave")) === true);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
