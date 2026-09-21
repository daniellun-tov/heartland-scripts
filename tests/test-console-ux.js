/* The 21 Sep UX pass. Daniel: "a lot of the settings are long pages of scrolling ... use
   consistent design patterns (drop downs vs chips/cards for property selectors) ... the bulk
   editing feels clunky ... the double confirmation on changes is unnecessary".

   What this suite holds fixed, because each is a pattern the console had drifted away from:
     1. ONE development picker, in the header, remembered - where there were five (cards on
        Developments, a select each on Inventory, Pipeline, Deals and the Dashboard).
     2. A tab that can only show one development never shows "All" over one development's data.
     3. ONE Refresh, which reloads the screen you are on.
     4. The deal drawer in tabs, every field still in it, the tab remembered across deals.
   The single-step saves are asserted where they live: grid, pipeline, record, types, units,
   inv, new, editors. */
const { chromium } = require("playwright");
const FX = "file://" + require("path").join(__dirname, "fixtures");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}
const R = 'document.getElementById("hl-console-host").shadowRoot';
const q = (p, fn, arg) => p.evaluate(fn, arg);
const count = (p, sel) => q(p, s => document.getElementById("hl-console-host").shadowRoot.querySelectorAll(s).length, sel);
const txt = (p, sel) => q(p, s => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  return e ? e.textContent.trim() : null;
}, sel);
const click = (p, sel) => q(p, s => document.getElementById("hl-console-host").shadowRoot.querySelector(s).click(), sel);
const clickId = (p, id) => q(p, i => document.getElementById("hl-console-host").shadowRoot.getElementById(i).click(), id);
const val = (p, id) => q(p, i => { const e = document.getElementById("hl-console-host").shadowRoot.getElementById(i); return e ? e.value : null; }, id);
const shown = (p, sel) => q(p, s => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  return !!e && e.getBoundingClientRect().height > 0;
}, sel);
const pickDev = async (p, slug) => {
  await q(p, v => {
    const el = document.getElementById("hl-console-host").shadowRoot.getElementById("devPick");
    el.value = v; el.dispatchEvent(new Event("change"));
  }, slug);
  await p.waitForTimeout(500);
};
/* Every request the console makes, by path. Wraps the fixture's own stub, so what is counted
   is what the console asked for, not what the fixture chose to answer. */
const spy = (p) => q(p, () => {
  window.__REQS = [];
  const f = window.fetch;
  window.fetch = function (u, o) { window.__REQS.push(String(u)); return f.apply(this, arguments); };
});
const reqs = (p) => q(p, () => window.__REQS || []);

(async () => {
  const browser = await chromium.launch();
  const open = async (qs, ctxIn) => {
    const ctx = ctxIn || await browser.newContext({ colorScheme: "light", viewport: { width: 1440, height: 1100 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html" + (qs || "?role=admin"));
    await p.waitForTimeout(600);
    return { ctx, p };
  };

  // ── 1. one picker ────────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("1. one development picker");
    ok("the switcher is in the header", (await count(p, "header.top #devPick")) === 1);
    ok("it offers All and every development", (await count(p, "#devPick option")) === 5);
    ok("and starts on All for somebody who has never chosen", (await val(p, "devPick")) === "");
    /* THE WHOLE POINT: no tab keeps a picker of its own. Walked tab by tab, because each old
       picker was drawn by its own tab's render. */
    const stray = {};
    for (const t of ["tabDash", "tabToday", "tabLeads", "tabPipe", "tabInv", "tabDev"]) {
      await clickId(p, t); await p.waitForTimeout(400);
      stray[t] = await count(p, "#fprop, #dprop, #plProp, #invProp, [data-feat-dev], .feat-strip");
    }
    ok("no tab carries a development picker of its own", Object.values(stray).every(n => n === 0), stray);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. it scopes every tab, and it is remembered ─────────────────────────
  {
    const { ctx, p } = await open();
    console.log("2. it scopes everything and is remembered");
    /* Inventory visited FIRST, so it already holds a development when the switch is made on
       another tab - the case where a tab could keep showing what it had. */
    await clickId(p, "tabInv"); await p.waitForTimeout(500);
    await clickId(p, "tabPipe"); await p.waitForTimeout(300);
    await spy(p);
    await pickDev(p, "polaris");
    const r = await reqs(p);
    ok("choosing one re-reads the deals for that development",
      r.some(u => /\/staff\/reservations\?.*property=polaris/.test(u)), r);
    const props = await q(p, () => [...document.getElementById("hl-console-host").shadowRoot
      .querySelectorAll("#rows tr td:nth-child(3)")].map(td => td.textContent.trim().split(/\s{2,}|Unit/)[0].trim()));
    ok("and Deals shows only that development", props.length > 0 && props.every(x => /Polaris/.test(x)), props);

    await clickId(p, "tabInv"); await p.waitForTimeout(500);
    ok("Inventory follows it without being told again",
      /polaris/.test((await reqs(p)).filter(u => /\/staff\/inventory/.test(u)).pop() || ""), await reqs(p));

    await clickId(p, "tabLeads"); await p.waitForTimeout(500);
    ok("so does the Pipeline", /property=polaris/.test((await reqs(p)).filter(u => /\/staff\/pipeline/.test(u)).pop() || ""),
      (await reqs(p)).filter(u => /\/staff\/pipeline/.test(u)));

    ok("the choice is kept per browser", (await q(p, () => localStorage.getItem("hl_console_dev"))) === "polaris");
    /* A second page in the same browser - the same person coming back tomorrow. */
    const again = await open("?role=admin", ctx);
    ok("and a new visit opens on it", (await val(again.p, "devPick")) === "polaris");
    ok("no page errors", p.__errs.length === 0 && again.p.__errs.length === 0, [p.__errs, again.p.__errs]);
    await ctx.close();
  }

  // ── 3. a one-development tab never shows "All" ───────────────────────────
  {
    const { ctx, p } = await open();
    console.log("3. All on a one-development tab");
    await spy(p);
    await clickId(p, "tabInv"); await p.waitForTimeout(600);
    const chosen = await val(p, "devPick");
    /* Inventory can only show one development's stock. Leaving the switcher on All over it
       would be the screen saying one thing and showing another. */
    ok("opening Inventory moves the switcher off All, to a real development", chosen !== "" && chosen !== null, chosen);
    ok("and it is the development whose stock is loaded",
      (await reqs(p)).some(u => u.indexOf("/staff/inventory?property=" + chosen) !== -1), await reqs(p));
    await clickId(p, "tabDev"); await p.waitForTimeout(400);
    ok("Developments heads the page with the same development",
      (await txt(p, "#viewDev .page-head h2")) === (await q(p, () => {
        const s = document.getElementById("hl-console-host").shadowRoot.getElementById("devPick");
        return s.options[s.selectedIndex].textContent.replace(/ — sandbox$/, "");
      })), await txt(p, "#viewDev .page-head h2"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. one Refresh, for the screen you are on ────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("4. Refresh");
    ok("there is one Refresh", (await count(p, "#refresh, #invRefresh, #plRefresh")) === 1);
    await clickId(p, "tabInv"); await p.waitForTimeout(500);
    await spy(p);
    await clickId(p, "refresh"); await p.waitForTimeout(500);
    ok("on Inventory it re-reads the stock", (await reqs(p)).some(u => /\/staff\/inventory\?/.test(u)), await reqs(p));
    await clickId(p, "tabLeads"); await p.waitForTimeout(500);
    await spy(p);
    await clickId(p, "refresh"); await p.waitForTimeout(500);
    ok("on the Pipeline it re-reads the leads", (await reqs(p)).some(u => /\/staff\/pipeline/.test(u)), await reqs(p));
    /* CSV exports the deals, so it sits with them. */
    ok("Download CSV lives on Deals, not in the header",
      (await count(p, "#viewPipe #csv")) === 1 && (await count(p, "header.top #csv")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 5. the deal drawer, in tabs ──────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("5. the deal drawer");
    await clickId(p, "tabPipe"); await p.waitForTimeout(300);
    await click(p, "#rows tr[data-uuid]"); await p.waitForTimeout(700);
    const tabs = await q(p, () => [...document.getElementById("hl-console-host").shadowRoot
      .querySelectorAll("#drawer [data-dtab-go]")].map(b => b.textContent.trim()));
    ok("the drawer has tabs, in the order a deal is worked", tabs.join(",") === "Overview,Deal,Add-ons,Documents,Manage", tabs);
    ok("it opens on Overview", (await txt(p, '#drawer [data-dtab-go][aria-selected="true"]')) === "Overview");
    ok("the buyer preview is on it", await shown(p, "#pvGo"));
    ok("and the stage mover is not - it is on Deal", !(await shown(p, "#mvGo")));
    /* Hidden, not removed: a tab is display:none, so every reader of the drawer still finds
       every field. */
    ok("every field is still in the drawer, whichever tab shows",
      (await count(p, "#drawer #mvGo")) === 1 && (await count(p, "#drawer #cxGo, #drawer #dxGo")) >= 1);
    await click(p, '#drawer [data-dtab-go="deal"]'); await p.waitForTimeout(150);
    ok("Deal shows the stage mover", await shown(p, "#mvGo"));
    ok("and hides the overview", !(await shown(p, "#pvGo")));
    const h = await q(p, () => document.getElementById("hl-console-host").shadowRoot.getElementById("drawer").scrollHeight);
    ok("one tab fits a screen - the drawer was about three before", h <= 1100, h);
    await clickId(p, "close"); await p.waitForTimeout(200);
    await click(p, "#rows tr[data-uuid]:nth-child(3)"); await p.waitForTimeout(700);
    ok("the next deal opens on the same tab - working down a list is the same job on each row",
      (await txt(p, '#drawer [data-dtab-go][aria-selected="true"]')) === "Deal");
    await click(p, '#drawer [data-dtab-go="manage"]'); await p.waitForTimeout(150);
    ok("Manage holds ending the deal", await shown(p, "#cxGo") || await shown(p, "#dxGo"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
