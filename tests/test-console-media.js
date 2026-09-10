/* The Renders panel - 10 Sep. The images of each type, read through the Xano key, with
   add-by-url, retire and restore for a type that has no Webflow row. The assertions are
   about who is offered a write, what reaches the server, and what is refused before the
   round trip. The fixture mirrors set_unit_type_media; run_smoke_media is the server's proof. */
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
const attr = (p, sel, a) => p.evaluate(x => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(x.sel);
  return e ? e.getAttribute(x.a) : null;
}, { sel, a });

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
  const openPanel = async (p) => {
    await clickId(p, "tabInv"); await p.waitForTimeout(250);
    await set(p, "invProp", "stellenbosch"); await p.waitForTimeout(300);
    await clickId(p, "invMedOpen"); await p.waitForTimeout(350);
  };

  // ── 1. the register, and who may write to it ─────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("1. the register for a salesperson");
    await clickId(p, "tabInv"); await p.waitForTimeout(250);
    await set(p, "invProp", "stellenbosch"); await p.waitForTimeout(300);
    ok("the bar offers a Renders panel", (await count(p, "#invMedOpen")) === 1);
    ok("it describes itself before loading", /per type/.test(await txt(p, "#invMedOpen") || ""));
    await clickId(p, "invMedOpen"); await p.waitForTimeout(350);
    ok("the drawer opened on it", (await txt(p, "#drawer h1")) === "Renders and floor plans");
    ok("and the bar button now carries the count",
      /2 images across 3 types/.test(await txt(p, "#invMedOpen") || ""), await txt(p, "#invMedOpen"));
    ok("every type is listed", (await count(p, "#drawer [data-med-typ]")) === 3);
    ok("type A shows its three rows, one of them marked retired",
      (await count(p, '[data-med-typ="1"] [data-med-row]')) === 3 &&
        (await count(p, '[data-med-typ="1"] .med-row.is-retired')) === 1);
    ok("a type with nothing says so", /No images yet/.test(await txt(p, '[data-med-typ="2"]') || ""));
    ok("a salesperson is offered no Add, Retire or Restore",
      (await count(p, "[data-med-open], [data-med-retire], [data-med-restore]")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. add by url, retire, restore ───────────────────────────────────────
  {
    const { ctx, p } = await open("?role=manager");
    console.log("2. a manager writes");
    await openPanel(p);
    ok("a manager is offered Add on a type with no Webflow row",
      (await count(p, '[data-med-open="1"]')) === 1 && (await count(p, '[data-med-open="2"]')) === 1);
    ok("and Retire on a current native row, Restore on a retired one",
      (await count(p, '[data-med-retire="501"]')) === 1 && (await count(p, '[data-med-restore="503"]')) === 1);

    await click(p, '[data-med-open="2"]'); await p.waitForTimeout(200);
    ok("Add opens the form under that type", (await count(p, '[data-med-typ="2"] [data-med-form="2"]')) === 1);
    ok("the slot picker offers the resync's vocabulary plus a custom slot",
      (await count(p, "#medSlot option")) === 16, await count(p, "#medSlot option"));

    await clickId(p, "medAdd"); await p.waitForTimeout(150);
    ok("no slot is refused before the round trip", /which image/i.test(await txt(p, "#drawer .err") || ""));
    ok("and nothing was sent", (await p.evaluate(() => window.__MED_POSTED)) === undefined);

    await set(p, "medSlot", "base-model");
    await set(p, "medUrl", "http://assets.example/b.jpg");
    await clickId(p, "medAdd"); await p.waitForTimeout(150);
    ok("an http url is refused before the round trip", /https/.test(await txt(p, "#drawer .err") || ""));
    ok("still nothing sent", (await p.evaluate(() => window.__MED_POSTED)) === undefined);

    await set(p, "medUrl", "https://assets.example/b-base.jpg");
    await clickId(p, "medAdd"); await p.waitForTimeout(500);
    const sent = await p.evaluate(() => window.__MED_POSTED);
    ok("the write carries the type id, the slot and the url",
      sent && sent.unit_type_id === 2 && sent.slot === "base-model" && sent.url === "https://assets.example/b-base.jpg", sent);
    ok("the panel re-read the server: type B now lists it",
      (await count(p, '[data-med-typ="2"] [data-med-row]')) === 1 &&
        /base-model/.test(await txt(p, '[data-med-typ="2"] [data-med-row] .typ-name') || ""),
      await txt(p, '[data-med-typ="2"]'));
    ok("the form closed", (await count(p, "[data-med-form]")) === 0);
    ok("the bar count moved", /3 images across 3 types/.test(await txt(p, "#invMedOpen") || ""));

    await click(p, '[data-med-retire="501"]'); await p.waitForTimeout(500);
    const ret = await p.evaluate(() => window.__MED_POSTED);
    ok("retire sends the type, the slot and retire true",
      ret && ret.unit_type_id === 1 && ret.slot === "base-model" && ret.retire === true, ret);
    ok("the row is listed retired, not gone",
      (await count(p, '[data-med-row="501"].is-retired')) === 1 && (await count(p, '[data-med-restore="501"]')) === 1);

    await click(p, '[data-med-restore="503"]'); await p.waitForTimeout(500);
    const res = await p.evaluate(() => window.__MED_POSTED);
    ok("restore sends restore true for the slot", res && res.slot === "upgrade-1" && res.restore === true, res);
    ok("and the row reads current again", (await count(p, '[data-med-row="503"].is-retired')) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. a custom slot, and the server's refusal ───────────────────────────
  {
    const { ctx, p } = await open("?role=manager");
    console.log("3. a custom slot and a refusal");
    await openPanel(p);
    await click(p, '[data-med-open="1"]'); await p.waitForTimeout(200);
    await set(p, "medSlot", "__custom"); await p.waitForTimeout(150);
    ok("Something else shows a slot box", (await count(p, "#medSlotCustom")) === 1);
    await set(p, "medSlotCustom", "Street View");
    await set(p, "medUrl", "https://assets.example/street.jpg");
    await clickId(p, "medAdd"); await p.waitForTimeout(150);
    ok("a slot with a space is refused before the round trip", /lower-case/.test(await txt(p, "#drawer .err") || ""));
    await set(p, "medSlotCustom", "street-view");
    await clickId(p, "medAdd"); await p.waitForTimeout(500);
    const sent = await p.evaluate(() => window.__MED_POSTED);
    ok("a custom slot is sent as typed, lower-cased", sent && sent.slot === "street-view", sent);

    await p.evaluate(() => { window.__MED_FAILS = "This unit type has a Webflow row, so its images come from the Unit Types collection."; });
    await click(p, '[data-med-open="2"]'); await p.waitForTimeout(200);
    await set(p, "medSlot", "floorplan");
    await set(p, "medUrl", "https://assets.example/b.pdf");
    await clickId(p, "medAdd"); await p.waitForTimeout(400);
    ok("the server refusal is shown in the drawer", /Webflow row/.test(await txt(p, "#drawer .err") || ""));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. a CMS-backed type is read-only even for a manager ─────────────────
  {
    const { ctx, p } = await open("?role=manager");
    console.log("4. a type with a Webflow row");
    await clickId(p, "tabInv"); await p.waitForTimeout(250);
    await set(p, "invProp", "polaris"); await p.waitForTimeout(300);
    await clickId(p, "invMedOpen"); await p.waitForTimeout(350);
    ok("the register lists the CMS types", (await count(p, "#drawer [data-med-typ]")) >= 1);
    ok("a type with a Webflow row says where its images come from",
      /from Webflow/.test(await txt(p, "#drawer [data-med-typ]") || ""), await txt(p, "#drawer [data-med-typ]"));
    ok("and offers no Add, whatever the role", (await count(p, "[data-med-open]")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
