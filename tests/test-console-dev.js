/* The Developments tab. The assertions are about the three states a module can be in, and
   about the one rule that matters: hiding a control is not the same as forbidding it. */
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
const txt = (p, sel) => p.evaluate(s => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  return e ? e.textContent.trim() : null;
}, sel);
const count = (p, sel) => p.evaluate(s =>
  document.getElementById("hl-console-host").shadowRoot.querySelectorAll(s).length, sel);
const click = (p, sel) => p.evaluate(s =>
  document.getElementById("hl-console-host").shadowRoot.querySelector(s).click(), sel);
const clickId = (p, id) => p.evaluate(i =>
  document.getElementById("hl-console-host").shadowRoot.getElementById(i).click(), id);
const hidden = (p, id) => p.evaluate(i => {
  const e = document.getElementById("hl-console-host").shadowRoot.getElementById(i);
  return e ? e.hidden : null;
}, id);
const attr = (p, sel, a) => p.evaluate(o => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(o.s);
  return e ? e.getAttribute(o.a) : null;
}, { s: sel, a });
const set = (p, id, value) => p.evaluate(a => {
  const r = document.getElementById("hl-console-host").shadowRoot;
  const el = r.getElementById(a.id);
  el.value = a.value;
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input"));
}, { id, value });

(async () => {
  const browser = await chromium.launch();
  const open = async (q) => {
    const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1400, height: 1200 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html" + (q || ""));
    await p.waitForTimeout(500);
    return { ctx, p };
  };
  const openDev = async (p) => { await clickId(p, "tabDev"); await p.waitForTimeout(250); };

  // ── 1. admin only ───────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("1. who can see it");
    ok("a salesperson gets no Developments tab", (await hidden(p, "tabDev")) === true);
    await ctx.close();
  }
  {
    const { ctx, p } = await open("?role=admin");
    console.log("   (admin)");
    ok("an admin does", (await hidden(p, "tabDev")) === false);
    await openDev(p);
    ok("it lists every development", (await count(p, "[data-feat-dev]")) === 4);
    ok("and the modules", (await count(p, "[data-feat-key]")) === 5);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. the three states ─────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("2. default, on, off");
    await openDev(p);
    await click(p, '[data-feat-dev="polaris"]');
    await p.waitForTimeout(150);

    ok("an undecided module says default",
      (await count(p, ".feat-row.is-module .feat-flag.is-default")) === 5);
    ok("and offers no revert, because there is nothing to revert to",
      (await count(p, "[data-feat-revert]")) === 0);
    ok("inventory_edit is off out of the box",
      (await attr(p, '[data-feat-key="inventory_edit"]', "aria-checked")) === "false");

    // Turning it on is a decision, and the row must say so.
    await click(p, '[data-feat-key="inventory_edit"]');
    await p.waitForTimeout(400);
    const sent = await p.evaluate(() => window.__FEAT_POSTED);
    ok("the toggle sends an explicit true",
      sent.property_slug === "polaris" && sent.feature_key === "inventory_edit" && sent.enabled === true, sent);
    ok("it now reads on",
      (await attr(p, '[data-feat-key="inventory_edit"]', "aria-checked")) === "true");
    ok("and is marked as a decision", (await count(p, ".feat-row.is-module .feat-flag.is-default")) === 4);
    ok("revert appears once a decision exists", (await count(p, "[data-feat-revert]")) === 1);

    // Off is a DECISION, not a revert - the distinction the server could not make.
    await click(p, '[data-feat-key="inventory_edit"]');
    await p.waitForTimeout(400);
    const off = await p.evaluate(() => window.__FEAT_POSTED);
    ok("switching off sends false, not an omitted value",
      off.enabled === false && Object.prototype.hasOwnProperty.call(off, "enabled"), off);
    ok("it is still a decision, not a default", (await count(p, "[data-feat-revert]")) === 1);

    // Revert omits enabled entirely.
    await click(p, "[data-feat-revert]");
    await p.waitForTimeout(400);
    const rev = await p.evaluate(() => window.__FEAT_POSTED);
    ok("revert omits enabled rather than sending null",
      !Object.prototype.hasOwnProperty.call(rev, "enabled"), rev);
    ok("and the row goes back to default", (await count(p, ".feat-row.is-module .feat-flag.is-default")) === 5);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. the count follows ────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("3. the strip");
    await openDev(p);
    ok("Stellenbosch starts with its one decision counted",
      /5 of 5 on/.test(await txt(p, '[data-feat-dev="stellenbosch"]') || ""),
      await txt(p, '[data-feat-dev="stellenbosch"]'));
    ok("Polaris does not have inventory_edit",
      /3 of 5 on/.test(await txt(p, '[data-feat-dev="polaris"]') || ""),
      await txt(p, '[data-feat-dev="polaris"]'));
    ok("the selling development is marked",
      /selling/.test(await txt(p, '[data-feat-dev="polaris"]') || ""));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. a refusal is shown, not swallowed ────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("4. when the server says no");
    await openDev(p);
    await p.evaluate(() => { window.__FEAT_FAILS = true; });
    await click(p, '[data-feat-key="portal"]');
    await p.waitForTimeout(400);
    ok("the refusal reaches the screen",
      /Only an admin/.test(await txt(p, "#viewDev .err") || ""),
      await txt(p, "#viewDev .err"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 5. the Inventory tab obeys it ───────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("5. inventory_edit actually gates the editor");
    await clickId(p, "tabInv");
    await p.waitForTimeout(300);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(300);
    ok("Stellenbosch has the module on, so homes are editable",
      (await count(p, "#viewInv [data-inv-edit]")) > 0);

    await set(p, "invProp", "polaris");
    await p.waitForTimeout(300);
    ok("Polaris has it off, so no home offers the editor",
      (await count(p, "#viewInv [data-inv-edit]")) === 0);
    ok("and the grid says why rather than just doing nothing",
      /switched off|nightly copy/.test(await txt(p, "#viewInv") || ""));

    /* Turning it on for Polaris must reach the Inventory tab without a reload - one store,
       one answer. */
    await openDev(p);
    await click(p, '[data-feat-dev="polaris"]');
    await p.waitForTimeout(150);
    await click(p, '[data-feat-key="inventory_edit"]');
    await p.waitForTimeout(400);
    await clickId(p, "tabInv");
    await p.waitForTimeout(300);
    ok("switching it on makes the editor available immediately",
      (await count(p, "#viewInv [data-inv-edit]")) > 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── settings: the same three states, carrying a value instead of a boolean ──────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("6. settings");
    await openDev(p);
    await click(p, '[data-feat-dev="stellenbosch"]');
    await p.waitForTimeout(150);

    ok("settings render alongside modules, not in a section of their own",
      (await count(p, "[data-set-key], [data-set-num]")) > 0);
    /* An enum offers only its options. A free text box here is how "typ" gets saved and
       silently resolves to the default while the screen claims it took. */
    ok("an enum offers exactly its options",
      (await count(p, '[data-set-key="pricing_level"]')) === 2);
    ok("the resolved option is the one shown as chosen",
      (await attr(p, '[data-set-key="pricing_level"].is-on', "data-set-val")) === "unit");
    ok("an int setting gets a number field, not a picker",
      (await count(p, '[data-set-num="unit_pad"]')) === 1);
    /* A category that only settings name still appears - Phases has no modules yet. */
    ok("a settings-only category still gets a card",
      (await count(p, '[data-set-key="phase_visibility"]')) === 2);

    /* Which state each is in, said on the row. */
    const flags = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const out = {};
      r.querySelectorAll(".feat-row").forEach(row => {
        const c = row.querySelector("[data-set-key],[data-set-num]");
        if (!c) { return; }
        const k = c.getAttribute("data-set-key") || c.getAttribute("data-set-num");
        const f = row.querySelector(".feat-flag");
        out[k] = f ? f.textContent.trim() : null;
      });
      return out;
    });
    ok("a decided setting reads set", flags.unit_pad === "set", flags);
    ok("an undecided one reads default", flags.pricing_level === "default", flags);
    ok("only a decided setting offers revert",
      (await count(p, '[data-set-revert="unit_pad"]')) === 1 &&
      (await count(p, '[data-set-revert="pricing_level"]')) === 0);
    /* The number means nothing until you can see what it writes. */
    ok("the width setting shows what it will render",
      (await txt(p, ".set-eg")) === "home 07");

    // Choosing an option posts the setting, not the feature.
    await click(p, '[data-set-key="pricing_level"][data-set-val="type"]');
    await p.waitForTimeout(400);
    const posted = await p.evaluate(() => window.__FEAT_POSTED);
    ok("it posts setting_key, and no feature_key",
      posted.setting_key === "pricing_level" && posted.feature_key === undefined, posted);
    ok("the value goes as text, which is what the server casts", posted.value === "type", posted);
    ok("the choice sticks after the re-read",
      (await attr(p, '[data-set-key="pricing_level"].is-on', "data-set-val")) === "type");
    ok("and it now reads as decided",
      (await count(p, '[data-set-revert="pricing_level"]')) === 1);

    // Revert sends no value at all. Sending null would be sending a value.
    await click(p, '[data-set-revert="pricing_level"]');
    await p.waitForTimeout(400);
    const rev = await p.evaluate(() => window.__FEAT_POSTED);
    ok("revert omits the value entirely",
      !Object.prototype.hasOwnProperty.call(rev, "value"), rev);
    ok("and the default comes back",
      (await attr(p, '[data-set-key="pricing_level"].is-on', "data-set-val")) === "unit");

    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  {
    const { ctx, p } = await open("?role=admin");
    console.log("7. a number is saved deliberately");
    await openDev(p);
    await click(p, '[data-feat-dev="stellenbosch"]');
    await p.waitForTimeout(150);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const f = r.querySelector('[data-set-num="unit_pad"]');
      f.value = "3";
      f.dispatchEvent(new Event("input"));
    });
    await p.waitForTimeout(150);
    /* Typing is not saving. A person typing "12" would otherwise have set it to 1 first. */
    ok("typing alone posts nothing",
      (await p.evaluate(() => window.__FEAT_POSTED)) === undefined);
    await click(p, '[data-set-save="unit_pad"]');
    await p.waitForTimeout(400);
    ok("Save posts the typed value",
      (await p.evaluate(() => (window.__FEAT_POSTED || {}).value)) === "3");
    ok("and the preview follows it", (await txt(p, ".set-eg")) === "home 007");

    /* The width is a display convention, so the grid has to move with it. */
    await clickId(p, "tabInv");
    await p.waitForTimeout(400);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const sel = r.getElementById("invProp");
      sel.value = "stellenbosch";
      sel.dispatchEvent(new Event("change"));
    });
    await p.waitForTimeout(400);
    const firstUnit = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const c = r.querySelector("#viewInv tbody tr td.gnum strong");
      return c ? c.textContent.trim() : null;
    });
    ok("the grid renders unit numbers at the new width", /^0{2}\d$|^0\d{2}$/.test(firstUnit || ""),
      firstUnit);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
