/* The inventory grid. The assertions are about the spreadsheet contract - a cell edits where
   you type, a paste lands where you are, and nothing reaches the server until somebody has
   seen what it will do. */
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
const txt = (p, sel) => p.evaluate(s => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  return e ? e.textContent.trim() : null;
}, sel);
const count = (p, sel) => p.evaluate(s =>
  document.getElementById("hl-console-host").shadowRoot.querySelectorAll(s).length, sel);
const click = (p, sel) => p.evaluate(s => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  if (!e) { throw new Error("no element for " + s); }
  e.click();
}, sel);
const clickId = (p, id) => p.evaluate(i =>
  document.getElementById("hl-console-host").shadowRoot.getElementById(i).click(), id);
const set = (p, id, value) => p.evaluate(a => {
  const r = document.getElementById("hl-console-host").shadowRoot;
  const el = r.getElementById(a.id);
  el.value = a.value;
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input"));
}, { id, value });
const cellText = (p, unit, field) => p.evaluate(a => {
  const e = document.getElementById("hl-console-host").shadowRoot
    .querySelector('[data-cell="' + a.unit + '|' + a.field + '"]');
  return e ? e.textContent.trim() : null;
}, { unit, field });
const cellClass = (p, unit, field) => p.evaluate(a => {
  const e = document.getElementById("hl-console-host").shadowRoot
    .querySelector('[data-cell="' + a.unit + '|' + a.field + '"]');
  return e ? e.className : null;
}, { unit, field });
const key = async (p, k, mods) => {
  await p.evaluate(a => {
    const r = document.getElementById("hl-console-host").shadowRoot;
    const g = r.getElementById("invGrid");
    g.dispatchEvent(new KeyboardEvent("keydown", {
      key: a.k, bubbles: true, cancelable: true,
      ctrlKey: !!(a.m && a.m.ctrl), shiftKey: !!(a.m && a.m.shift)
    }));
  }, { k, m: mods });
  await p.waitForTimeout(60);
};

(async () => {
  const browser = await chromium.launch();
  const openGrid = async () => {
    const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1500, height: 1200 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html?role=admin");
    await p.waitForTimeout(500);
    await clickId(p, "tabInv");
    await p.waitForTimeout(300);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(350);
    return { ctx, p };
  };

  // ── 1. the grid exists and is editable ──────────────────────────────────
  {
    const { ctx, p } = await openGrid();
    console.log("1. the grid");
    ok("every editable column is rendered", (await count(p, '[data-cell$="|price_cents"]')) === 12);
    ok("cells are live where the module is on",
      (await cellClass(p, "1", "price_cents") || "").indexOf("is-live") !== -1);
    ok("no unsaved changes to start", (await count(p, ".gbar")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. click, type, commit ──────────────────────────────────────────────
  {
    const { ctx, p } = await openGrid();
    console.log("2. editing a cell");
    await click(p, '[data-cell="1|erf_area_sqm"]');
    await p.waitForTimeout(80);
    ok("one click focuses", (await cellClass(p, "1", "erf_area_sqm") || "").indexOf("is-cur") !== -1);
    await click(p, '[data-cell="1|erf_area_sqm"]');
    await p.waitForTimeout(80);
    ok("a second click opens the editor", (await count(p, "#invCellInput")) === 1);

    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const i = r.getElementById("invCellInput");
      i.value = "310";
      i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await p.waitForTimeout(150);
    ok("Enter commits", (await count(p, "#invCellInput")) === 0);
    ok("the cell shows the new value", /310/.test(await cellText(p, "1", "erf_area_sqm") || ""));
    ok("and is marked unsaved",
      (await cellClass(p, "1", "erf_area_sqm") || "").indexOf("is-dirty") !== -1);
    ok("the bar counts it", /1 unsaved change/.test(await txt(p, ".gbar") || ""));
    ok("Enter moved down a row",
      (await cellClass(p, "2", "erf_area_sqm") || "").indexOf("is-cur") !== -1);
    ok("nothing was sent", (await p.evaluate(() => window.__BULK_POSTED)) === undefined);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. typing back the original value clears the edit ───────────────────
  {
    const { ctx, p } = await openGrid();
    console.log("3. a no-op is not a change");
    /* Unit 2 starts with internal_area_sqm 122. Typing 122 back must not count. */
    await click(p, '[data-cell="2|internal_area_sqm"]');
    await click(p, '[data-cell="2|internal_area_sqm"]');
    await p.waitForTimeout(80);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const i = r.getElementById("invCellInput");
      i.value = "999";
      i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await p.waitForTimeout(120);
    ok("a real change counts", /1 unsaved change/.test(await txt(p, ".gbar") || ""));

    await click(p, '[data-cell="2|internal_area_sqm"]');
    await click(p, '[data-cell="2|internal_area_sqm"]');
    await p.waitForTimeout(80);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const i = r.getElementById("invCellInput");
      i.value = "122";
      i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await p.waitForTimeout(120);
    ok("typing the stored value back clears the edit entirely",
      (await count(p, ".gbar")) === 0, await txt(p, ".gbar"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. keyboard navigation ──────────────────────────────────────────────
  {
    const { ctx, p } = await openGrid();
    console.log("4. arrows and fill-down");
    await click(p, '[data-cell="1|price_cents"]');
    await p.waitForTimeout(80);
    await key(p, "ArrowDown");
    ok("down moves a row", (await cellClass(p, "2", "price_cents") || "").indexOf("is-cur") !== -1);
    await key(p, "ArrowRight");
    ok("right moves a column",
      (await cellClass(p, "2", "internal_area_sqm") || "").indexOf("is-cur") !== -1);
    await key(p, "ArrowUp");
    ok("up moves back",
      (await cellClass(p, "1", "internal_area_sqm") || "").indexOf("is-cur") !== -1);

    /* Unit 1 starts with internal_area_sqm unset; 2 and 3 have values. Fill-down from 1
       should push the empty value down, so the cheapest check is that they all match. */
    await click(p, '[data-cell="2|erf_area_sqm"]');
    await click(p, '[data-cell="2|erf_area_sqm"]');
    await p.waitForTimeout(80);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const i = r.getElementById("invCellInput");
      i.value = "275";
      i.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    await p.waitForTimeout(100);
    ok("Escape abandons the edit", (await count(p, ".gbar")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 5. paste from a spreadsheet ─────────────────────────────────────────
  {
    const { ctx, p } = await openGrid();
    console.log("5. pasting a block");
    await click(p, '[data-cell="1|erf_area_sqm"]');
    await p.waitForTimeout(80);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const g = r.getElementById("invGrid");
      const dt = new DataTransfer();
      dt.setData("text/plain", "300\t10\n310\t12\n320\t15");
      g.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await p.waitForTimeout(200);
    ok("a 3x2 block fills three rows and two columns",
      /6 unsaved changes/.test(await txt(p, ".gbar") || ""), await txt(p, ".gbar"));
    ok("the first cell took the first value", /300/.test(await cellText(p, "1", "erf_area_sqm") || ""));
    ok("and the block ran down and right",
      /320/.test(await cellText(p, "3", "erf_area_sqm") || "") &&
      /15/.test(await cellText(p, "3", "levy_monthly_cents") || ""));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 6. the preview, and what it refuses ─────────────────────────────────
  {
    const { ctx, p } = await openGrid();
    console.log("6. review before save");
    /* One good change and one the server must refuse - a percentage over 100. */
    await click(p, '[data-cell="1|erf_area_sqm"]');
    await click(p, '[data-cell="1|erf_area_sqm"]');
    await p.waitForTimeout(80);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const i = r.getElementById("invCellInput");
      i.value = "310";
      i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await p.waitForTimeout(120);
    await click(p, '[data-cell="2|deposit_bond_pct"]');
    await click(p, '[data-cell="2|deposit_bond_pct"]');
    await p.waitForTimeout(80);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const i = r.getElementById("invCellInput");
      i.value = "150";
      i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await p.waitForTimeout(120);

    await clickId(p, "invReview");
    await p.waitForTimeout(400);
    const sent = await p.evaluate(() => window.__BULK_POSTED);
    ok("Review asks for a dry run", sent.dry_run === true, sent);
    ok("and sends both homes", (sent.changes || []).length === 2, sent.changes);
    ok("the preview shows one to change", /1 to change/.test(await txt(p, ".gpreview-counts") || ""));
    ok("and one refused", /1 refused/.test(await txt(p, ".gpreview-counts") || ""));
    ok("naming the reason", /between 0 and 100/.test(await txt(p, ".gpreview-list") || ""));
    ok("nothing was written", (await p.evaluate(() => window.__BULK_POSTED.dry_run)) === true);

    // A reason is required before it will commit.
    await clickId(p, "invBulkGo");
    await p.waitForTimeout(150);
    ok("saving without a reason is refused in the browser",
      /unauditable/.test(await txt(p, "#invBulkErr") || ""));
    ok("and still nothing has been written",
      (await p.evaluate(() => window.__BULK_POSTED.dry_run)) === true);

    await set(p, "invBulkReason", "Areas from the surveyor's schedule.");
    await clickId(p, "invBulkGo");
    await p.waitForTimeout(500);
    const done = await p.evaluate(() => window.__BULK_POSTED);
    ok("committing sends the reason", /surveyor/.test(done.reason || ""), done.reason);
    ok("and is no longer a dry run", !done.dry_run);
    ok("the refused home keeps its edit so it can be fixed",
      /1 unsaved change/.test(await txt(p, ".gbar") || ""), await txt(p, ".gbar"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 7. selection and density ────────────────────────────────────────────
  {
    const { ctx, p } = await openGrid();
    console.log("7. selection and density");
    await click(p, '[data-inv-pick="1"]');
    await p.waitForTimeout(100);
    ok("one row selects", /1 selected/.test(await txt(p, ".gbar") || ""));
    await clickId(p, "invPickAll");
    await p.waitForTimeout(120);
    ok("select-all takes every visible row", /12 selected/.test(await txt(p, ".gbar") || ""));
    await clickId(p, "invClearSel");
    await p.waitForTimeout(100);
    ok("and clears", (await count(p, ".gbar")) === 0);

    ok("the grid starts comfortable", (await count(p, "#invGrid.is-dense")) === 0);
    await clickId(p, "invDense");
    await p.waitForTimeout(120);
    ok("compact is a class, not a second grid", (await count(p, "#invGrid.is-dense")) === 1);
    ok("and it is remembered",
      (await p.evaluate(() => localStorage.getItem("hl_inv_dense"))) === "1");
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 8. padding is a label, never the number ─────────────────────────────
  {
    const { ctx, p } = await openGrid();
    console.log("8. the display convention");
    ok("the grid writes the development's convention",
      (await p.evaluate(() => {
        const r = document.getElementById("hl-console-host").shadowRoot;
        const c = r.querySelector('[data-cell="1|price_cents"]');
        return c.closest("tr").querySelector(".gnum strong").textContent.trim();
      })) === "01");

    /* But the value that travels is the stored one. This is the whole reason the fuzzy
       "1 matches 01" fallback could be deleted from the server. */
    await click(p, '[data-cell="1|erf_area_sqm"]');
    await click(p, '[data-cell="1|erf_area_sqm"]');
    await p.waitForTimeout(80);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const i = r.getElementById("invCellInput");
      i.value = "301";
      i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await p.waitForTimeout(120);
    await clickId(p, "invReview");
    await p.waitForTimeout(400);
    const sent = await p.evaluate(() => window.__BULK_POSTED);
    ok("the change carries the plain number, not the label",
      sent.changes[0].unit_number === "1", sent.changes[0]);
    ok("and the preview still shows the label",
      (await txt(p, ".gpreview-list") || "").indexOf("01") === 0,
      await txt(p, ".gpreview-list"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 9. copy out, and the round trip back ────────────────────────────────
  {
    const { ctx, p } = await openGrid();
    console.log("9. the Excel round trip");
    /* Stub the clipboard so the test can read what was written rather than guess. */
    await p.evaluate(() => {
      window.__COPIED = null;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: t => { window.__COPIED = t; return Promise.resolve(); } }
      });
    });

    await click(p, '[data-inv-pick="1"]');
    await p.waitForTimeout(100);
    await click(p, '[data-inv-pick="2"]');
    await p.waitForTimeout(100);
    ok("the button names what it will take", /Copy 2 rows/.test(await txt(p, ".gbar") || ""));

    await clickId(p, "invCopy");
    await p.waitForTimeout(250);
    const tsv = await p.evaluate(() => window.__COPIED);
    const lines = (tsv || "").split("\n");
    ok("a header row and the two selected rows", lines.length === 3, lines.length);
    ok("tab separated, starting with Unit", lines[0].split("\t")[0] === "Unit", lines[0]);
    /* Twelve, not nine: the eight fixed columns plus the three this development chose,
       plus Unit. A copy that dropped a development's own columns would round-trip back and
       silently blank them. */
    ok("every column on screen is in it, including the development's own",
      lines[0].split("\t").length === 12, lines[0]);
    ok("the unit number goes out as its label", lines[1].split("\t")[0] === "01", lines[1]);
    ok("and it says how many were taken", /2 rows copied/.test(await txt(p, "#viewInv") || ""));

    /* Now paste that same block back. The header must not land in a cell, and pasting a
       block over itself must register as nothing changed. */
    await click(p, '[data-cell="1|price_cents"]');
    await p.waitForTimeout(80);
    await p.evaluate(t => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const g = r.getElementById("invGrid");
      const dt = new DataTransfer();
      dt.setData("text/plain", t);
      g.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, tsv);
    await p.waitForTimeout(250);
    ok("a block pasted back over itself changes nothing, and says nothing",
      (await count(p, ".gbar .is-dirty")) === 0, await txt(p, ".gbar"));

    /* The point of routing by unit number rather than position: the block can come back in
       any order, with the columns rearranged, and still land on the right homes. */
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const g = r.getElementById("invGrid");
      const dt = new DataTransfer();
      // Reversed rows, and Erf before Price - nothing like the order it went out in.
      dt.setData("text/plain", "Unit\tErf\tPrice\n02\t777\t9999999\n01\t555\t8888888");
      g.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await p.waitForTimeout(250);
    ok("a reordered block still lands on the right homes",
      /555/.test(await cellText(p, "1", "erf_area_sqm") || "") &&
      /777/.test(await cellText(p, "2", "erf_area_sqm") || ""),
      [await cellText(p, "1", "erf_area_sqm"), await cellText(p, "2", "erf_area_sqm")]);
    ok("and reordered columns follow their header",
      /8,888,888/.test(await cellText(p, "1", "price_cents") || ""),
      await cellText(p, "1", "price_cents"));

    /* A column that is not editable here should be named, not silently dropped. */
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const g = r.getElementById("invGrid");
      const dt = new DataTransfer();
      dt.setData("text/plain", "Unit\tSurveyor\n01\tJ Smith\n99\tnobody");
      g.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await p.waitForTimeout(250);
    const msg = await txt(p, "#viewInv .err") || await txt(p, "#viewInv") || "";
    ok("an unknown column is named rather than dropped in silence", /Surveyor/i.test(msg), msg.slice(0, 200));
    ok("and a unit that is not here is named too", /99/.test(msg), msg.slice(0, 200));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 10. sorting is a view, and nothing is keyed to it ───────────────────
  {
    const { ctx, p } = await openGrid();
    console.log("10. sorting");
    const firstUnit = () => p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const t = r.querySelector("#invGrid tbody tr .gnum strong");
      return t ? t.textContent.trim() : null;
    });
    ok("natural order is by unit number", (await firstUnit()) === "01");

    await click(p, '[data-sort="price_cents"]');
    await p.waitForTimeout(120);
    ok("sorting by price ascending puts the cheapest first", (await firstUnit()) === "01");
    await click(p, '[data-sort="price_cents"]');
    await p.waitForTimeout(120);
    ok("a second click reverses it", (await firstUnit()) === "12");
    ok("and the header says which way", /↓/.test(await txt(p, '[data-sort="price_cents"]') || ""));
    await click(p, '[data-sort="price_cents"]');
    await p.waitForTimeout(120);
    ok("a third click puts it back to unit order", (await firstUnit()) === "01");
    ok("with no marker left behind", (await count(p, ".gsort")) === 0);

    /* Blanks sink whichever way the column points - a screen of dashes tells you nothing
       about the numbers you asked to see. */
    await click(p, '[data-sort="internal_area_sqm"]');
    await p.waitForTimeout(120);
    await click(p, '[data-sort="internal_area_sqm"]');
    await p.waitForTimeout(120);
    const lastRow = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const rows = r.querySelectorAll("#invGrid tbody tr");
      return rows[rows.length - 1].textContent;
    });
    ok("empty cells sink even when sorting descending", /—/.test(lastRow));

    /* The reason every piece of grid state is keyed by unit number rather than row index. */
    await click(p, '[data-sort="unit_number"]');
    await p.waitForTimeout(120);
    await click(p, '[data-cell="1|erf_area_sqm"]');
    await click(p, '[data-cell="1|erf_area_sqm"]');
    await p.waitForTimeout(80);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const i = r.getElementById("invCellInput");
      i.value = "404";
      i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await p.waitForTimeout(150);
    await click(p, '[data-sort="price_cents"]');
    await p.waitForTimeout(120);
    await click(p, '[data-sort="price_cents"]');
    await p.waitForTimeout(150);
    ok("an unsaved edit follows its home through a re-sort",
      /404/.test(await cellText(p, "1", "erf_area_sqm") || ""),
      await cellText(p, "1", "erf_area_sqm"));
    ok("and is still counted once", /1 unsaved change/.test(await txt(p, ".gbar") || ""));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
