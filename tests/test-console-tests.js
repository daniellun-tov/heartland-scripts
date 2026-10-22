/* Hide test data - 22 Oct. Sanford went live on 21 Oct and the console was full of rehearsals.
   One switch in the header decides, for every screen that counts deals, whether the server is
   asked to leave tests out (exclude_test=true on /staff/reservations and /staff/pipeline). The
   server decides what a test is and keeps its counts honest; these assertions are about what
   the console ASKS for, what it draws, that the choice is remembered, and that hidden is the
   default for a browser that has never chosen. The fixture mirrors list_reservations and
   list_pipeline (is_test, test_count, exclude_test). */
const { chromium } = require("playwright");
const FX = "file://" + require("path").join(__dirname, "fixtures");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}
const sr = "document.getElementById('hl-console-host').shadowRoot";
const count = (p, sel) => p.evaluate(s => document.getElementById("hl-console-host").shadowRoot.querySelectorAll(s).length, sel);
const all = (p, sel) => p.evaluate(s => [...document.getElementById("hl-console-host").shadowRoot.querySelectorAll(s)].map(e => e.textContent.trim()), sel);
const txt = (p, sel) => p.evaluate(s => { const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
const attr = (p, sel, a) => p.evaluate(x => { const e = document.getElementById("hl-console-host").shadowRoot.querySelector(x.sel); return e ? e.getAttribute(x.a) : null; }, { sel, a });
const clickId = (p, id) => p.evaluate(i => document.getElementById("hl-console-host").shadowRoot.getElementById(i).click(), id);
const shown = (p, sel) => p.evaluate(s => { const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s); return !!e && e.getBoundingClientRect().height > 0; }, sel);
const lastRes = p => p.evaluate(() => (window.__RES_URLS || []).slice(-1)[0] || "");
const lastPl = p => p.evaluate(() => (window.__PL_URLS || []).slice(-1)[0] || "");
const store = p => p.evaluate(() => { try { return localStorage.getItem("hl_console_show_tests"); } catch (e) { return "err"; } });
const dealRefs = p => all(p, "#viewPipe tbody tr td:first-child .mono");

(async () => {
  const browser = await chromium.launch();
  const open = async (q) => {
    const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1500, height: 1100 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html" + (q || ""), { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => (window.__RES_URLS || []).length > 0);
    await p.waitForTimeout(350);
    return { ctx, p };
  };

  // ── 1. a browser that has never chosen: tests hidden ─────────────────────
  {
    const { ctx, p } = await open("?freshprefs=1&testlead=1&role=admin");
    console.log("1. hidden by default");
    const N = await p.evaluate(() => window.__FIXTURE.items.length);
    ok("the switch is in the header and reads Show test data", (await txt(p, "#testSwitch .ts-label")) === "Show test data");
    ok("and it is OFF", (await attr(p, "#testSwitch", "aria-checked")) === "false");
    ok("the deals request asks the server to leave tests out", /[?&]exclude_test=true/.test(await lastRes(p)), await lastRes(p));
    ok("so the header count is the real deals only", (await txt(p, "#who")) === (N - 1) + " of " + (N - 1) + " shown", await txt(p, "#who"));
    await clickId(p, "tabPipe"); await p.waitForTimeout(250);
    const refs = await dealRefs(p);
    ok("Deals draws no RES-TEST row", refs.length === N - 1 && !refs.some(r => /RES-TEST-/.test(r)), refs.slice(0, 3));
    ok("and no Test tag at all", (await count(p, "#viewPipe tbody .testtag")) === 0);
    ok("the chip says how many are hidden", (await txt(p, "#testCount")) === "1", await txt(p, "#testCount"));
    ok("and the tooltip says what they are", /Hiding test data: 1 test reservation/.test(await attr(p, "#testSwitch", "title") || ""), await attr(p, "#testSwitch", "title"));

    await clickId(p, "tabLeads"); await p.waitForTimeout(450);
    ok("the pipeline request asks for the same", /[?&]exclude_test=true/.test(await lastPl(p)), await lastPl(p));
    const leadRefs = await all(p, "tr.pl-row td.gnum strong");
    ok("the test lead is not in the pipeline", leadRefs.length > 0 && leadRefs.indexOf("LD-TEST-SAN-001") === -1, leadRefs);
    ok("nothing was written to this browser by merely loading", (await store(p)) === null, await store(p));
    ok("no page errors", p.__errs.length === 0, p.__errs);

    // ── 2. switch it on ────────────────────────────────────────────────────
    console.log("2. show test data");
    const resBefore = await p.evaluate(() => (window.__RES_URLS || []).length);
    const plBefore = await p.evaluate(() => (window.__PL_URLS || []).length);
    await clickId(p, "testSwitch"); await p.waitForTimeout(500);
    ok("the switch is ON", (await attr(p, "#testSwitch", "aria-checked")) === "true");
    ok("the choice is remembered in this browser", (await store(p)) === "1", await store(p));
    ok("deals were asked for again, once", (await p.evaluate(() => window.__RES_URLS.length)) === resBefore + 1);
    ok("without exclude_test", !/exclude_test/.test(await lastRes(p)), await lastRes(p));
    ok("and the pipeline too, once, without it", (await p.evaluate(() => window.__PL_URLS.length)) === plBefore + 1 &&
      !/exclude_test/.test(await lastPl(p)), await lastPl(p));
    const leadRefs2 = await all(p, "tr.pl-row td.gnum strong");
    ok("the test lead is back", leadRefs2.indexOf("LD-TEST-SAN-001") !== -1, leadRefs2);
    ok("and it wears the Test tag",
      (await p.evaluate(() => [...document.getElementById("hl-console-host").shadowRoot.querySelectorAll("tr.pl-row td.gnum")]
        .filter(td => /LD-TEST-SAN-001/.test(td.textContent) && td.querySelector(".testtag")).length)) === 1);
    ok("while the real leads do not",
      (await p.evaluate(() => [...document.getElementById("hl-console-host").shadowRoot.querySelectorAll("tr.pl-row td.gnum")]
        .filter(td => !/LD-TEST-/.test(td.textContent) && td.querySelector(".testtag")).length)) === 0);
    ok("the header counts every reservation", (await txt(p, "#who")) === N + " of " + N + " shown", await txt(p, "#who"));
    await clickId(p, "tabPipe"); await p.waitForTimeout(250);
    const refs2 = await dealRefs(p);
    ok("Deals draws the RES-TEST row", refs2.length === N && refs2.some(r => /RES-TEST-/.test(r)));
    ok("tagged Test, and only that one", (await count(p, "#viewPipe tbody .testtag")) === 1);
    ok("the tooltip now says Showing", /^Showing test data/.test(await attr(p, "#testSwitch", "title") || ""));

    // ── 3. and off again ───────────────────────────────────────────────────
    console.log("3. hide again");
    await clickId(p, "testSwitch"); await p.waitForTimeout(450);
    ok("OFF again", (await attr(p, "#testSwitch", "aria-checked")) === "false");
    ok("remembered as hidden", (await store(p)) === "0", await store(p));
    ok("and the request leaves them out again", /[?&]exclude_test=true/.test(await lastRes(p)));
    ok("the switch is a keyboard control with a role", (await attr(p, "#testSwitch", "role")) === "switch" &&
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot.getElementById("testSwitch").tagName)) === "BUTTON");
    ok("it is visible on the page", await shown(p, "#testSwitch"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. a browser that chose to see them keeps seeing them ────────────────
  {
    const { ctx, p } = await open("?testlead=1");
    console.log("4. a remembered choice");
    ok("the switch boots ON", (await attr(p, "#testSwitch", "aria-checked")) === "true");
    ok("and the first request does not hide anything", !/exclude_test/.test(await lastRes(p)), await lastRes(p));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 5. narrow screen: the switch does not push the page sideways ─────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(FX + "/dash.html?freshprefs=1", { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => (window.__RES_URLS || []).length > 0);
    await p.waitForTimeout(300);
    console.log("5. phone width");
    ok("visible at 390px", await shown(p, "#testSwitch"));
    ok("no horizontal scroll", (await p.evaluate(() => document.documentElement.scrollWidth)) <= 390,
      await p.evaluate(() => document.documentElement.scrollWidth));
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
