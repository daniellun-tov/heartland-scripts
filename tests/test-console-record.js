/* The Development record card on the Developments tab - 10 Sep. The third kind of
   per-development fact beside modules and settings: the res_properties columns themselves.
   The assertions are about the two tiers (drawn by the server's `source`, shown here), ONE
   SAVE - since 21 Sep with no reason box and no slug typed back, a switch that changes the
   live site named beside the button instead - and the refusals, which are the thing that
   makes "it saved" mean something. The card is the Details sub-tab of Developments. The
   fixture mirrors set_property's outcomes. */
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

/* THE DEVELOPMENT SWITCHER, 21 Sep: one picker in the header scopes every tab. The
   Inventory tab's own select was one of four places a development used to be chosen. */
const attr = (p, sel, a) => p.evaluate(o => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(o.s);
  return e ? e.getAttribute(o.a) : null;
}, { s: sel, a });
const pickDev = async (p, slug) => {
  await p.evaluate(v => {
    const el = document.getElementById("hl-console-host").shadowRoot.getElementById("devPick");
    el.value = v; el.dispatchEvent(new Event("change"));
  }, slug);
  await p.waitForTimeout(450);
};
/* Phases, Types, Renders and Fields are sub-tabs of Developments since 21 Sep, not drawers
   opened from Inventory. */
const openSetup = async (p, sub) => {
  await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot.getElementById("tabDev").click());
  await p.waitForTimeout(300);
  await p.evaluate(k => document.getElementById("hl-console-host").shadowRoot
    .querySelector('[data-dsub="' + k + '"]').click(), sub);
  await p.waitForTimeout(450);
};

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
    if (slug) { await pickDev(p, slug); }
    await openSetup(p, "details");
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

  // ── 2. one Save ────────────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("2. saving the hold window");
    await openDev(p, "stellenbosch");
    await setSel(p, '[data-rec-key="hold_minutes"]', "45");
    await p.waitForTimeout(100);
    ok("typing enables Save without a re-render", (await disabled(p, "recSave")) === false);
    ok("and marks the field", (await count(p, '[data-rec-key="hold_minutes"].is-dirty')) === 1);

    ok("there is no reason box", (await count(p, "#recReason")) === 0);
    await clickId(p, "recSave"); await p.waitForTimeout(500);
    const sent = await p.evaluate(() => window.__PROP_POSTED);
    ok("one click sends only the changed field, as a number, with a reason the server can file",
      sent && sent.property_slug === "stellenbosch" && Object.keys(sent.fields).length === 1 &&
        sent.fields.hold_minutes === 45 && /sales console/.test(sent.reason), sent);
    /* A clean save is a toast; the per-field list is kept for what was REFUSED (block 4). */
    ok("a clean save says so in the toast and draws no report",
      /Development saved/.test(await txt(p, "#toast") || "") && (await count(p, "#recReport")) === 0,
      await txt(p, "#toast"));
    ok("the record was re-read, not patched: the input shows the value in force",
      (await val(p, '[data-rec-key="hold_minutes"]')) === "45");
    ok("Save is disabled again", (await disabled(p, "recSave")) === true);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. a switch that changes the live site is named, not re-confirmed ─────
  {
    const { ctx, p } = await open();
    console.log("3. a switch");
    await openDev(p, "stellenbosch");
    ok("nothing is said until a switch changes", (await count(p, "#recLive")) === 0);
    await click(p, '[data-rec-toggle="is_selling"]'); await p.waitForTimeout(200);
    /* The slug typed back was a second confirmation of the same click. What makes the ONE
       click an informed one is saying, beside the button, what it will do to the live site. */
    ok("flipping Selling names what Save will do on the live site",
      /Selling on/.test(await txt(p, "#recLive") || "") && /live site/.test(await txt(p, "#recLive") || ""),
      await txt(p, "#recLive"));
    ok("with no slug to type", (await count(p, "#recConfirm")) === 0);
    ok("and the switch reads on", (await count(p, '[data-rec-toggle="is_selling"].is-on')) === 1);
    await clickId(p, "recSave"); await p.waitForTimeout(500);
    const sent = await p.evaluate(() => window.__PROP_POSTED);
    ok("one click sends is_selling as a real boolean",
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
    await clickId(p, "recSave"); await p.waitForTimeout(500);
    const sent = await p.evaluate(() => window.__PROP_POSTED);
    ok("the fee is sent in CENTS", sent && sent.fields.reservation_fee_cents === 350000, sent);
    /* Only the refusal is listed; what saved is the toast's news. */
    ok("the report lists the refused field only, with the server's reason",
      (await count(p, "#recReport li.is-applied")) === 0 &&
        (await count(p, "#recReport li.is-refused")) === 1 &&
        /1 field not saved/.test(await txt(p, "#toast") || "") &&
        /longer than a day/.test(await txt(p, "#recReport li.is-refused") || ""),
      await txt(p, "#recReport"));
    ok("the refused field shows the value in force, not the one typed",
      (await val(p, '[data-rec-key="hold_minutes"]')) === "30");

    await p.evaluate(() => { window.__PROP_FAILS = true; });
    await setSel(p, '[data-rec-key="sales_email"]', "sales@sv.example");
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
