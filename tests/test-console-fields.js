/* The Fields panel. The assertions are about the sales team choosing their own columns, and
   about the two things the server will not let them choose: editing a value that belongs to
   the type, and filtering on data the public endpoint refuses to return. */
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
const all = (p, sel) => p.evaluate(s =>
  [...document.getElementById("hl-console-host").shadowRoot.querySelectorAll(s)]
    .map(e => e.textContent.trim()), sel);
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
    const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1600, height: 1500 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html" + (q || "?role=admin"));
    await p.waitForTimeout(500);
    await clickId(p, "tabInv");
    await p.waitForTimeout(250);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(350);
    return { ctx, p };
  };
  const openPanel = async (p) => {
    await clickId(p, "invFldOpen");
    await p.waitForTimeout(400);
  };

  // ── 1. the development's own columns ────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("1. registry-driven columns");
    const heads = await all(p, "#viewInv thead th");
    /* The grid cannot tell where a value lives, and that is the point: Aspect is a key in a
       json bag, Beds is a column on the variant, and both are just columns here. */
    ok("a development's own fields become columns",
      heads.includes("Aspect") && heads.includes("Erf number") && heads.includes("Beds"), heads);
    ok("one that is not marked for the grid does not",
      !heads.includes("View features"), heads);
    ok("every home gets a cell for each",
      (await count(p, '[data-cell$="|aspect"]')) === 12 &&
      (await count(p, '[data-cell$="|bedrooms"]')) === 12);

    /* Editable, per column, on top of whether the grid is editable at all. */
    const aspectCls = await attr(p, '[data-cell="1|aspect"]', "class");
    const bedsCls = await attr(p, '[data-cell="1|bedrooms"]', "class");
    ok("an editable field is live", (aspectCls || "").indexOf("is-live") !== -1, aspectCls);
    /* THE RULE. Beds belongs to the way the home is built, so it is shown and not typed into. */
    ok("a value that belongs to the type is not",
      (bedsCls || "").indexOf("is-live") === -1, bedsCls);
    /* Words read left, numbers read right - a ragged left edge is harder to scan. */
    ok("a word column is not right-aligned", (aspectCls || "").indexOf("txt") !== -1, aspectCls);
    ok("a number column is", (bedsCls || "").indexOf("num") !== -1, bedsCls);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. editing one ──────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("2. editing a registry column");
    await click(p, '[data-cell="1|aspect"]');
    await p.waitForTimeout(100);
    await click(p, '[data-cell="1|aspect"]');
    await p.waitForTimeout(150);
    /* AN ENUM GETS ITS OPTIONS AND NOTHING ELSE CAN BE TYPED - the same reason the settings
       panel refuses a text box for one. A near-miss saves fine and then matches no filter. */
    ok("an enum opens a picker, not a text box",
      (await count(p, "#invCellInput")) === 1 &&
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
        .getElementById("invCellInput").tagName)) === "SELECT");
    ok("and it offers exactly its options plus blank",
      (await count(p, "#invCellInput option")) === 5);

    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const el = r.getElementById("invCellInput");
      el.value = "West-facing";
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await p.waitForTimeout(200);
    ok("the change is held locally, like every other cell",
      /1 unsaved change/.test(await txt(p, ".gbar") || ""), await txt(p, ".gbar"));

    /* A cell that cannot be edited must not open one, whichever route reaches it. */
    await click(p, '[data-cell="2|bedrooms"]');
    await p.waitForTimeout(100);
    await click(p, '[data-cell="2|bedrooms"]');
    await p.waitForTimeout(150);
    ok("a type-owned cell never opens an editor", (await count(p, "#invCellInput")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. the panel ────────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("3. the panel");
    /* A button in the bar above the grid, not a fold-out card. The stock stays on screen. */
    ok("it starts as a button, with the drawer shut",
      (await count(p, "#invFldOpen")) === 1 && (await count(p, "#drawer.open")) === 0);
    ok("and says what is in use",
      /4 in use, 3 shown as columns/.test(await txt(p, "#invFldOpen") || ""),
      await txt(p, "#invFldOpen"));
    await openPanel(p);
    ok("opening it uses the side drawer",
      (await count(p, "#drawer.open")) === 1 && (await txt(p, "#drawer h1")) === "Fields");
    ok("and the button says so", (await attr(p, "#invFldOpen", "aria-expanded")) === "true");
    ok("the grid is still there behind it", (await count(p, "#viewInv tbody tr")) > 0);
    ok("it lists every field this development has",
      (await count(p, "#drawer .fld-row")) === 4);
    /* Four decisions, not one - showing your own team a figure and putting it on the website
       are different things. */
    ok("each offers four separate decisions",
      (await count(p, '[data-fld-key="aspect"]')) === 4);
    /* The number that says whether a column is worth having. */
    ok("it says how many homes carry each one",
      /12 of 12 homes/.test((await all(p, ".fld-row .feat-desc"))[0] || ""),
      (await all(p, ".fld-row .feat-desc"))[0]);
    ok("and where the value comes from",
      (await all(p, ".fld-row .fld-src")).join(",") === "attribute,attribute,attribute,variant",
      await all(p, ".fld-row .fld-src"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. the four decisions ───────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("4. turning a column off");
    await openPanel(p);
    ok("a field in the grid reads as on",
      (await attr(p, '[data-fld-key="aspect"][data-fld-flag="is_grid"]', "aria-pressed")) === "true");
    await click(p, '[data-fld-key="aspect"][data-fld-flag="is_grid"]');
    await p.waitForTimeout(600);
    const sent = await p.evaluate(() => window.__FLD_POSTED);
    ok("it sends an explicit false rather than omitting the flag",
      sent.is_grid === false && sent.action === "set", sent);
    /* The panel owns the flags and the grid owns the columns, and one change moves both. */
    ok("and the column leaves the grid",
      !(await all(p, "#viewInv thead th")).includes("Aspect"),
      await all(p, "#viewInv thead th"));
    ok("while the field itself is still there",
      (await count(p, ".fld-row")) === 4);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  {
    const { ctx, p } = await open();
    console.log("5. what the server will not allow");
    await openPanel(p);
    /* Not a disabled switch - a statement. There is no decision to make. */
    ok("a type-owned field is not offered an Editable switch at all",
      (await count(p, '.fld-flag.is-blocked')) === 1);
    ok("and its other three are still real switches",
      (await count(p, '[data-fld-key="bedrooms"]')) === 3);

    /* A facet is a public control. Erf number is not public, so asking to filter on it is
       asking to offer a chip that matches nothing. */
    await click(p, '[data-fld-key="erf_number"][data-fld-flag="is_public"]');
    await p.waitForTimeout(500);
    await click(p, '[data-fld-key="erf_number"][data-fld-flag="is_filterable"]');
    await p.waitForTimeout(500);
    ok("filtering on withheld data is refused, in the server's words",
      /not public/.test(await txt(p, "#drawer .err") || ""),
      await txt(p, "#drawer .err"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 6. adopting ─────────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("6. taking one off the menu");
    await openPanel(p);
    ok("the menu is grouped the way the catalogue groups it",
      (await count(p, ".fld-group")) === 3);
    /* What is already taken is marked, not removed - somebody should be able to see that
       Beds exists and that they already have it. */
    ok("what is already adopted is marked rather than offered again",
      (await count(p, ".fld-add.is-have")) === 1 &&
      (await attr(p, ".fld-add.is-have", "aria-pressed")) === "true",
      await all(p, ".fld-add"));
    ok("and the rest are offered", (await count(p, "[data-fld-adopt]")) === 4);

    await click(p, '[data-fld-adopt="orientation"]');
    await p.waitForTimeout(700);
    const sent = await p.evaluate(() => window.__FLD_POSTED);
    ok("it adopts rather than setting", sent.action === "adopt", sent);
    ok("it now has five fields", (await count(p, ".fld-row")) === 5);
    ok("and the column appears in the grid",
      (await all(p, "#viewInv thead th")).includes("Orientation"),
      await all(p, "#viewInv thead th"));
    /* ADOPTING NEVER PUBLISHES. is_public is the one flag whose mistake only goes one way. */
    ok("but it is not public",
      (await attr(p, '[data-fld-key="orientation"][data-fld-flag="is_public"]', "aria-pressed")) === "false");
    ok("nor a filter",
      (await attr(p, '[data-fld-key="orientation"][data-fld-flag="is_filterable"]', "aria-pressed")) === "false");
    /* A field adopted and never filled is a column of dashes, and the panel says so. */
    ok("and the panel says nothing has a value for it yet",
      /no home has a value yet/.test((await all(p, ".fld-row .feat-desc")).join(" ")),
      await all(p, ".fld-row .feat-desc"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 7. a development with none ──────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("7. a development that uses none");
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(400);
    const heads = await all(p, "#viewInv thead th");
    ok("no optional columns", !heads.includes("Aspect") && !heads.includes("Beds"), heads);
    const cells = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const th = r.querySelectorAll("#viewInv thead th").length;
      const td = r.querySelector("#viewInv tbody tr").querySelectorAll("td").length;
      return { th, td };
    });
    ok("header and row still line up", cells.th === cells.td, cells);
    ok("the panel still offers the menu", (await count(p, "#invFldOpen")) === 1);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 8. switching development ────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("8. switching development closes it");
    await openPanel(p);
    ok("open on one", (await count(p, "#drawer.open")) === 1 && (await count(p, ".fld-row")) > 0);
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(400);
    /* One development's columns over another's stock is the mistake worth preventing. */
    ok("and shut on the next", (await count(p, "#drawer.open")) === 0);
    ok("the button is back, unexpanded",
      (await count(p, "#invFldOpen")) === 1 &&
      (await attr(p, "#invFldOpen", "aria-expanded")) === "false");
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 9. closing it ───────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("9. it closes the way every drawer closes");
    await openPanel(p);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(150);
    ok("Escape shuts it", (await count(p, "#drawer.open")) === 0);
    await openPanel(p);
    await clickId(p, "close");
    await p.waitForTimeout(150);
    ok("so does Close", (await count(p, "#drawer.open")) === 0);
    await openPanel(p);
    await clickId(p, "scrim");
    await p.waitForTimeout(150);
    ok("so does the scrim", (await count(p, "#drawer.open")) === 0);
    /* Opening a reservation from the pipeline takes the drawer over. Only one thing in it. */
    await openPanel(p);
    await clickId(p, "invPhaseOpen");
    await p.waitForTimeout(200);
    ok("opening Phases replaces Fields in the same drawer",
      (await txt(p, "#drawer h1")) === "Phases" && (await count(p, ".fld-row")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 10. taking one off again ────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("10. taking a field off again");
    await openPanel(p);
    /* The thing that was missing: a field could be added and then never removed. The tick in
       the menu was an inert span, so the one place a person looked for the undo had none. */
    ok("every field has a Remove", (await count(p, "#drawer [data-fld-retire]")) === 4 + 1);
    ok("and the menu's tick is a pressed toggle, not a label",
      (await count(p, '.fld-add.is-have[data-fld-retire="bedrooms"]')) === 1);
    await click(p, '.fld-add.is-have[data-fld-retire="bedrooms"]');
    await p.waitForTimeout(700);
    const sent = await p.evaluate(() => window.__FLD_POSTED);
    /* RETIRE IS A SET, NOT A DELETE. Values stay; the flags stop applying. */
    ok("it retires with a set, never a delete",
      sent.action === "set" && sent.is_active === false && sent.field_key === "bedrooms", sent);
    ok("the field leaves the list", (await count(p, "#drawer .fld-row")) === 3);
    ok("and its column leaves the grid",
      !(await all(p, "#viewInv thead th")).includes("Beds"), await all(p, "#viewInv thead th"));
    ok("and the menu offers it back, marked as retired rather than new",
      (await count(p, '[data-fld-adopt="bedrooms"]')) === 1 &&
      /\u21ba/.test(await txt(p, '[data-fld-adopt="bedrooms"]') || ""),
      await txt(p, '[data-fld-adopt="bedrooms"]'));
    ok("the bar's count moved with it",
      /3 in use/.test(await txt(p, "#invFldOpen") || ""), await txt(p, "#invFldOpen"));
    await click(p, '[data-fld-adopt="bedrooms"]');
    await p.waitForTimeout(700);
    ok("adopting it back restores it", (await count(p, "#drawer .fld-row")) === 4 &&
      (await all(p, "#viewInv thead th")).includes("Beds"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 11. a switch stays busy until the fresh answer is back ──────────────
  {
    const { ctx, p } = await open();
    console.log("11. a switch cannot be clicked while its answer is in flight");
    await openPanel(p);
    await p.evaluate(() => { window.__FLD_SLOW = true; });
    ok("Column reads as on to begin with",
      (await attr(p, '[data-fld-key="aspect"][data-fld-flag="is_grid"]', "aria-pressed")) === "true");
    await click(p, '[data-fld-key="aspect"][data-fld-flag="is_grid"]');
    await p.waitForTimeout(120);
    /* THE BUG. The write has returned but the re-read has not, so the switch still shows its
       old state. It used to be enabled here - and a second click, from a person who saw
       nothing change, sent the flag straight back to where it started. */
    ok("while the reload is in flight the switch is disabled",
      (await attr(p, '[data-fld-key="aspect"][data-fld-flag="is_grid"]', "disabled")) !== null);
    await click(p, '[data-fld-key="aspect"][data-fld-flag="is_grid"]');
    await p.waitForTimeout(900);
    const sent = await p.evaluate(() => window.__FLD_POSTED);
    ok("so the second click sent nothing", sent.is_grid === false, sent);
    ok("and the switch now reads off, once",
      (await attr(p, '[data-fld-key="aspect"][data-fld-flag="is_grid"]', "aria-pressed")) === "false");
    ok("and is enabled again",
      (await attr(p, '[data-fld-key="aspect"][data-fld-flag="is_grid"]', "disabled")) === null);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
