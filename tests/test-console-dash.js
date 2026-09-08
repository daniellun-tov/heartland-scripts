/* Browser tests for the sales console's settings modal and dashboard.
   Real Chromium against a deterministic 30-reservation fixture whose totals are
   worked out by hand below - so these assert the arithmetic, not just that
   something rendered. */
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
/* MONEY IS COMPARED AS A NUMBER, NEVER AS A GLYPH SEQUENCE.

   The console pins en-ZA in every money formatter - space thousands, comma decimal,
   which is correct South African form and what a Heartland salesperson sees. A
   Chromium built without South African locale data silently formats en-ZA as en-US
   instead, AND reports Intl.NumberFormat.supportedLocalesOf(["en-ZA"]) as supported
   while doing it. So an assertion written against literal separators is grading the
   browser build, not the code.

   Six assertions across three suites did exactly that: green in a container that
   lacks the locale, red the first time anybody ran them on a real Mac - and the
   string they demanded, "R 70,095,000.00", is one no South African user will ever
   see. The number is the fact worth asserting; the separators are the runtime's
   business, and the guard below is what says so out loud when they are wrong. */
const amount = (str) => {
  if (str === null || str === undefined) { return NaN; }
  const m = String(str).replace(/[^0-9.,]/g, "");
  /* A trailing separator followed by EXACTLY two digits is a decimal point. Anything
     else is grouping - so "8,888,888" keeps all nine digits and "750 000,00" does
     not become 75000000. */
  const dec = /[.,](\d{2})$/.exec(m);
  const whole = dec ? m.slice(0, m.length - 3) : m;
  return Number(whole.replace(/[.,]/g, "")) + (dec ? Number(dec[1]) / 100 : 0);
};

const S = p => p.evaluate(() => {
  const r = document.getElementById("hl-console-host").shadowRoot;
  const txt = s => { const e = r.querySelector(s); return e ? e.textContent.trim() : null; };
  const all = s => [].map.call(r.querySelectorAll(s), e => e.textContent.trim());
  const kpi = {};
  [].forEach.call(r.querySelectorAll(".kpi"), k => {
    kpi[k.querySelector(".k-label").textContent.trim()] = {
      value: k.querySelector(".k-value").textContent.trim(),
      note: k.querySelector(".k-note").textContent.trim(),
      title: k.getAttribute("title"),
      link: k.classList.contains("is-link")
    };
  });
  const card = t => [].filter.call(r.querySelectorAll(".chart"),
    c => c.querySelector("h2").textContent.trim() === t)[0] || null;
  const rowsOf = c => c ? [].map.call(c.querySelectorAll(".hbar"), h => ({
    label: h.querySelector(".h-label").textContent.trim(),
    value: h.querySelector(".h-val").firstChild.textContent.trim(),
    note: h.querySelector(".h-val small") ? h.querySelector(".h-val small").textContent.trim() : null,
    width: h.querySelector(".h-fill").style.width,
    color: h.querySelector(".h-fill").style.background || h.querySelector(".h-fill").style.backgroundColor,
    tip: h.querySelector(".h-fill").getAttribute("data-tip")
  })) : null;
  const legOf = c => c ? [].map.call(c.querySelectorAll(".legend .lg"),
    l => l.textContent.replace(/\s+/g, " ").trim()) : null;
  return {
    tab: [].filter.call(r.querySelectorAll("nav.side button"),
      b => b.getAttribute("aria-selected") === "true").map(b => b.textContent.replace(/\d+$/, "").trim())[0],
    dashShown: !r.getElementById("viewDash").classList.contains("hide"),
    todayShown: !r.getElementById("viewToday").classList.contains("hide"),
    kpi: kpi,
    cards: all(".chart h2"),
    funnel: rowsOf(card("Where the deals are")),
    funnelSub: card("Where the deals are") ? card("Where the deals are").querySelector(".sub").textContent.trim() : null,
    timeSub: card("Reservations over time") ? card("Reservations over time").querySelector(".sub").textContent.trim() : null,
    cols: card("Reservations over time")
      ? [].map.call(card("Reservations over time").querySelectorAll(".c-bar"),
          b => ({ h: b.style.height, tip: b.getAttribute("data-tip") })) : null,
    xlabels: card("Reservations over time") ? all("#viewDash .cols-x span") : null,
    risk: legOf(card("Deadline risk")),
    riskSegs: card("Deadline risk") ? card("Deadline risk").querySelectorAll(".stack i").length : null,
    pay: legOf(card("Payment status")),
    prop: rowsOf(card("By property")),
    note: txt(".dashnote span"),
    tables: r.querySelectorAll("#viewDash .vtable").length,
    modal: {
      open: r.getElementById("settings").classList.contains("open"),
      hidden: r.getElementById("settings").getAttribute("aria-hidden"),
      focus: !r.activeElement ? null
        : r.activeElement.getAttribute("data-scheme-pref") ? r.activeElement.getAttribute("data-scheme-pref")
        : r.activeElement.hasAttribute("data-settings-open") ? "gear"
        : r.activeElement.tagName
    },
    tip: { on: r.getElementById("viztip").classList.contains("on"),
           text: r.getElementById("viztip").textContent }
  };
});
const gear = async p => {
  await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
    .getElementById("avatarBtn").click());
  await p.waitForTimeout(40);
  await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
    .querySelector("header .usermenu [data-settings-open]").click());
};

(async () => {
  const browser = await chromium.launch();
  const open = async (mode, query) => {
    const ctx = await browser.newContext({ colorScheme: mode || "light", viewport: { width: 1360, height: 1000 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html" + (query || ""));
    await p.waitForTimeout(400);
    return { ctx, p };
  };

  // ── 0. the runtime itself ────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("0. the runtime");
    /* THE BROWSER'S LOCALE DATA IS PART OF WHAT IS UNDER TEST, so it gets asserted
       rather than assumed. Chromium builds ship different ICU sets; one without South
       African data formats the console's en-ZA money as en-US and REPORTS THE LOCALE
       AS SUPPORTED while doing it. Every money rendering in such a run is then
       unrepresentative of what any Heartland user sees.

       This check going red does not mean the console is broken - it means THIS RUN
       cannot tell you anything about how money looks. That is worth a red line,
       because the alternative is what happened on 6 Sep: six assertions written
       against the wrong separators, green in a container for a week. */
    const loc = await p.evaluate(() => ({
      claims: Intl.NumberFormat.supportedLocalesOf(["en-ZA"]).length === 1,
      renders: (1234.5).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
    }));
    ok("the browser really has South African locale data, not just a claim to it",
      /^1\s234,50$/.test(loc.renders.replace(/\u00a0/g, " ")),
      { claims_supported: loc.claims, actually_renders: loc.renders,
        expected: "1 234,50 - space thousands, comma decimal",
        note: "en-US-looking output here means this Chromium lacks en-ZA data. The console is fine; this RUN cannot judge money formatting." });
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 1. the settings modal ────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("1. settings modal");
    let s = await S(p);
    ok("starts closed", s.modal.open === false && s.modal.hidden === "true", s.modal);
    await gear(p); s = await S(p);
    ok("the account menu opens it", s.modal.open === true && s.modal.hidden === "false", s.modal);
    ok("focus lands on the current scheme", s.modal.focus === "system", s.modal.focus);
    await p.keyboard.press("Escape"); s = await S(p);
    ok("Escape closes it", s.modal.open === false, s.modal);
    const back = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return r.activeElement ? r.activeElement.id : null;
    });
    /* NOT the item that was clicked - that is inside the menu, which shut behind it, and
       focus() on a hidden element silently does nothing. */
    ok("focus returns to the avatar the menu came out of", back === "avatarBtn", back);
    const menuShut = await p.evaluate(() => document.getElementById("hl-console-host")
      .shadowRoot.getElementById("avatarMenu").hidden);
    ok("and the menu did not stay open behind the modal", menuShut === true, menuShut);

    await gear(p);
    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .querySelector("#settings .modal-scrim").click());
    s = await S(p);
    ok("clicking the scrim closes it", s.modal.open === false, s.modal);

    await gear(p);
    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .getElementById("setClose").click());
    s = await S(p);
    ok("the Close button closes it", s.modal.open === false, s.modal);

    // Escape must reach the modal FIRST - it is the thing on top.
    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .querySelector("#rows tr").click());
    await p.waitForTimeout(150);
    await gear(p);
    await p.keyboard.press("Escape");
    const st = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return { modal: r.getElementById("settings").classList.contains("open"),
               drawer: r.getElementById("drawer").classList.contains("open") };
    });
    ok("Escape closes the modal and leaves the drawer open", st.modal === false && st.drawer === true, st);
    await p.keyboard.press("Escape");
    const st2 = await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .getElementById("drawer").classList.contains("open"));
    ok("a second Escape then closes the drawer", st2 === false, st2);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. the dashboard leads, and its arithmetic is right ──────────────────
  // Fixture: 30 rows. total_cents = 180 000 000 + i*3 700 000 -> R70 095 000.
  // fee 25 000 00 x30 -> R750 000. overdue i%7==0 -> 5. flagged i%11==0 -> 3.
  // routes: cash i%4==0 -> 8, undecided i%4==1 -> 8, bond -> 14.
  {
    const { ctx, p } = await open();
    console.log("2. dashboard totals");
    const s = await S(p);
    ok("Dashboard is the landing tab", s.tab === "Dashboard" && s.dashShown, [s.tab, s.dashShown]);
    ok("Today is not also showing", s.todayShown === false, s.todayShown);
    ok("reserved value", s.kpi["Reserved value"].value === "R 70.1m", s.kpi["Reserved value"]);
    ok("the exact figure rides in the tile's title",
      amount(s.kpi["Reserved value"].title) === 70095000, s.kpi["Reserved value"].title);
    ok("reservation count", s.kpi["Reserved value"].note === "30 reservations", s.kpi["Reserved value"].note);
    ok("average price", s.kpi["Average price"].value === "R 2.34m", s.kpi["Average price"]);
    ok("hold fees", amount(s.kpi["Hold fees taken"].value) === 750000, s.kpi["Hold fees taken"]);
    ok("overdue count", s.kpi["Overdue"].value === "5", s.kpi["Overdue"]);
    ok("flagged count", s.kpi["Needs a decision"].value === "3", s.kpi["Needs a decision"]);
    ok("bond/cash/undecided split",
      s.kpi["Bond buyers"].value === "14" && s.kpi["Bond buyers"].note === "8 cash · 8 undecided",
      s.kpi["Bond buyers"]);
    ok("the urgent tiles are buttons into Today",
      s.kpi["Overdue"].link && s.kpi["Needs a decision"].link, [s.kpi["Overdue"].link, s.kpi["Needs a decision"].link]);
    ok("the calm tiles are not", s.kpi["Average price"].link === false, s.kpi["Average price"].link);
    ok("five cards", s.cards.join("|") ===
      "Where the deals are|Reservations over time|Deadline risk|Payment status|By property", s.cards);
    await ctx.close();
  }

  // ── 3. the funnel is ordinal - one hue, in stage order ───────────────────
  // sub-stage counts, i%6 over 0..29 less {8,17,26}: 5,5,3,5,5,4 (27) + 3 unstaged.
  {
    const { ctx, p } = await open();
    console.log("3. funnel");
    const s = await S(p);
    ok("one row per sub-stage, in route order",
      s.funnel.map(r => r.label).join("|") ===
      "pre qualify|sign otp|pay deposit|transfer attorneys|bond approval|bond approved",
      s.funnel.map(r => r.label));
    ok("counts", s.funnel.map(r => r.value).join(",") === "5,5,3,5,5,4", s.funnel.map(r => r.value));
    ok("colours are the six ordinal steps, in order",
      s.funnel.map(r => r.color.replace(/\s/g, "")).join("|") ===
      "var(--viz-1)|var(--viz-2)|var(--viz-3)|var(--viz-4)|var(--viz-5)|var(--viz-6)",
      s.funnel.map(r => r.color));
    ok("the longest bar is full width", s.funnel[0].width === "100%", s.funnel[0].width);
    ok("bar width is proportional to count, not to rank",
      s.funnel[2].width === "60%", s.funnel[2].width);        // 3 of 5
    ok("unstaged deals are counted in the subtitle, not silently dropped",
      s.funnelSub.indexOf("3 not yet in the pipeline") !== -1, s.funnelSub);
    ok("every bar carries its own tooltip",
      s.funnel.every(r => r.tip && r.tip.indexOf(r.label) === 0), s.funnel.map(r => r.tip));
    await ctx.close();
  }

  // ── 4. risk and payment buckets account for every row ────────────────────
  // risk by i%7: overdue 5, <=3d 5, <=7d 4, further 4, none 12.
  // payment by i%9: confirmed 12, awaiting 9, failed 3, dead 6.
  {
    const { ctx, p } = await open();
    console.log("4. status buckets");
    const s = await S(p);
    ok("deadline risk buckets", s.risk.join("|") ===
      "Overdue 5|Due in 3 days 5|Due in a week 4|Further out 4|No deadline 12", s.risk);
    ok("payment status buckets", s.pay.join("|") ===
      "Confirmed 12|Awaiting payment 9|Payment failed 3|Cancelled or refunded 6", s.pay);
    ok("risk buckets sum to every row",
      s.risk.reduce((a, x) => a + Number(x.match(/\d+$/)[0]), 0) === 30, s.risk);
    ok("payment buckets sum to every row",
      s.pay.reduce((a, x) => a + Number(x.match(/\d+$/)[0]), 0) === 30, s.pay);
    ok("all five risk buckets are drawn when all five have rows", s.riskSegs === 5, s.riskSegs);
    await ctx.close();
  }

  // ── 5. time buckets ──────────────────────────────────────────────────────
  // confirmed_at = now - i*9 days, null when i%10==9 -> 27 of 30 have one.
  {
    const { ctx, p } = await open();
    console.log("5. reservations over time");
    const s = await S(p);
    ok("the subtitle says how many rows have a confirmation date",
      s.timeSub.indexOf("27 of 30 have one") !== -1, s.timeSub);
    ok("monthly buckets over this span", s.timeSub.indexOf("per month") !== -1, s.timeSub);
    ok("at most twelve columns", s.cols.length <= 12 && s.cols.length > 0, s.cols.length);
    ok("one x label per column", s.xlabels.length === s.cols.length, [s.xlabels.length, s.cols.length]);
    // The axis rounds up to a clean top (max 4 -> top 5), so the tallest column is
    // 80% of the plot, and a month of one is 20%. Heights are proportional to the
    // axis, not to each other.
    ok("the tallest column is 4 of an axis top of 5",
      s.cols.filter(c => c.h === "80%").length > 0, s.cols.map(c => c.h));
    ok("and a one-reservation month is a fifth of it",
      s.cols.filter(c => c.h === "20%").length > 0, s.cols.map(c => c.h));
    ok("no column overflows the plot",
      s.cols.every(c => parseFloat(c.h) <= 100), s.cols.map(c => c.h));
    ok("every column carries a tooltip naming its month",
      s.cols.every(c => c.tip && /reservation/.test(c.tip)), s.cols.map(c => c.tip));
    // Newest at the right. Slicing the wrong end of the spine would show the oldest
    // twelve months and quietly hide this month's sales.
    const thisMonth = new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
    ok("the last column is the current month",
      s.cols[s.cols.length - 1].tip.indexOf(thisMonth) === 0, [s.cols[s.cols.length - 1].tip, thisMonth]);
    await ctx.close();
  }

  // ── 5b. more than a year of history: the cap keeps the NEWEST twelve ─────
  {
    const { ctx, p } = await open("light", "?span=long");
    console.log("5b. long history");
    const s = await S(p);
    ok("capped at twelve columns", s.cols.length === 12, s.cols.length);
    const thisMonth = new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
    ok("and the twelfth is this month, not a month from last year",
      s.cols[11].tip.indexOf(thisMonth) === 0, s.cols[11].tip);
    const oldest = new Date();
    oldest.setMonth(oldest.getMonth() - 11);
    ok("the first column is eleven months back",
      s.cols[0].tip.indexOf(oldest.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })) === 0,
      [s.cols[0].tip, oldest.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })]);
    await ctx.close();
  }

  // ── 6. the property filter scopes everything ─────────────────────────────
  // Polaris is i%3==1 -> 10 rows, value R23 365 000.
  {
    const { ctx, p } = await open();
    console.log("6. property filter");
    let s = await S(p);
    ok("By property compares three developments", s.prop.map(r => r.label).sort().join("|") ===
      "Outeniqua|Polaris|Sanford Heart", s.prop.map(r => r.label));
    ok("sorted by value, highest first",
      amount(s.prop[0].value) === 23735000, s.prop.map(r => r.value));
    ok("unit count rides beside the value", s.prop[0].note === "10 units", s.prop[0].note);

    await p.evaluate(() => {
      const sel = document.getElementById("hl-console-host").shadowRoot.getElementById("dprop");
      sel.value = "polaris"; sel.dispatchEvent(new Event("change"));
    });
    await p.waitForTimeout(80);
    s = await S(p);
    ok("KPIs narrow to that property", s.kpi["Reserved value"].note === "10 reservations",
      s.kpi["Reserved value"].note);
    ok("and to its value", amount(s.kpi["Reserved value"].title) === 23365000,
      s.kpi["Reserved value"].title);
    ok("the cards say which property they are showing",
      s.funnelSub.indexOf("Polaris") !== -1, s.funnelSub);
    // Polaris rows are i%3==1, whose i%6 is always 1 or 5 - so four stages have no
    // deals at all. A stage with none must draw NOTHING; a stub bar reads as "a few".
    ok("a stage with no deals draws no bar",
      s.funnel.filter(r => r.value === "0").every(r => r.width === "0%" || r.width === "0px"),
      s.funnel.map(r => r.value + ":" + r.width));
    ok("and a stage with deals still does",
      s.funnel.filter(r => r.value !== "0").every(r => parseFloat(r.width) > 0),
      s.funnel.map(r => r.value + ":" + r.width));
    ok("By property disappears - one bar is a stat tile, not a bar chart",
      s.cards.indexOf("By property") === -1, s.cards);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 7. the period filter ─────────────────────────────────────────────────
  // 30 days back covers i*9 <= 30 -> i in 0..3 -> 4 rows, and the span drops
  // under 45 days so the buckets become weeks.
  {
    const { ctx, p } = await open();
    console.log("7. period filter");
    await p.evaluate(() => {
      const sel = document.getElementById("hl-console-host").shadowRoot.getElementById("drange");
      sel.value = "30"; sel.dispatchEvent(new Event("change"));
    });
    await p.waitForTimeout(80);
    const s = await S(p);
    ok("rows outside the window drop out", s.kpi["Reserved value"].note === "4 reservations",
      s.kpi["Reserved value"].note);
    ok("a short span switches the buckets to weeks",
      s.timeSub.indexOf("per week") !== -1, s.timeSub);
    ok("rows with no confirmation date are excluded from a dated range",
      s.timeSub.indexOf("4 of 4 have one") !== -1, s.timeSub);
    // This slice is i=0..3, so payment lands only in Confirmed (3) and Awaiting (1).
    // An empty bucket must still be listed - "none of these" is information - but it
    // must not draw a zero-width sliver.
    ok("an empty bucket keeps its legend entry", s.pay.join("|") ===
      "Confirmed 3|Awaiting payment 1|Payment failed 0|Cancelled or refunded 0", s.pay);
    const segs = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const c = [].filter.call(r.querySelectorAll(".chart"),
        x => x.querySelector("h2").textContent.trim() === "Payment status")[0];
      return c.querySelectorAll(".stack i").length;
    });
    ok("but draws no segment for it", segs === 2, segs);
    await ctx.close();
  }

  // ── 8. table twins ───────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("8. table view");
    let s = await S(p);
    ok("no tables until asked", s.tables === 0, s.tables);
    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .querySelector('[data-vtable="funnel"]').click());
    await p.waitForTimeout(60);
    const t = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const tb = r.querySelector("#viewDash .vtable");
      return {
        n: r.querySelectorAll("#viewDash .vtable").length,
        head: [].map.call(tb.querySelectorAll("th"), h => h.textContent.trim()).join("|"),
        rows: [].map.call(tb.querySelectorAll("tbody tr"),
          tr => [].map.call(tr.querySelectorAll("td"), td => td.textContent.trim()).join("=")),
        btn: r.querySelector('[data-vtable="funnel"]').textContent.trim(),
        exp: r.querySelector('[data-vtable="funnel"]').getAttribute("aria-expanded")
      };
    });
    ok("exactly one table opens", t.n === 1, t.n);
    ok("the button flips to Hide table", t.btn === "Hide table" && t.exp === "true", [t.btn, t.exp]);
    ok("the table carries the same numbers as the bars",
      t.rows.join("|") === "pre qualify=5|sign otp=5|pay deposit=3|transfer attorneys=5|bond approval=5|bond approved=4",
      t.rows);
    ok("headers", t.head === "Stage|Deals", t.head);
    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .querySelector('[data-vtable="funnel"]').click());
    await p.waitForTimeout(60);
    s = await S(p);
    ok("and closes again", s.tables === 0, s.tables);
    await ctx.close();
  }

  // ── 9. tooltips are an enhancement, and keyboard reaches them ────────────
  {
    const { ctx, p } = await open();
    console.log("9. tooltip");
    let s = await S(p);
    ok("hidden until something is hovered or focused", s.tip.on === false, s.tip);
    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .querySelector(".h-fill").focus());
    await p.waitForTimeout(60);
    s = await S(p);
    ok("keyboard focus shows it", s.tip.on === true, s.tip);
    ok("with the value in it", s.tip.text === "pre qualify — 5 deals", s.tip.text);
    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .querySelector(".h-fill").blur());
    await p.waitForTimeout(60);
    s = await S(p);
    ok("blur hides it", s.tip.on === false, s.tip);
    await ctx.close();
  }

  // ── 10. the dashboard says when the pipeline filters are narrowing it ────
  {
    const { ctx, p } = await open();
    console.log("10. filter honesty");
    let s = await S(p);
    ok("no notice when nothing is filtered", s.note === null, s.note);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const sel = r.getElementById("fstatus");
      sel.innerHTML = '<option value=""></option><option value="confirmed">Confirmed</option>';
      sel.value = "confirmed"; sel.dispatchEvent(new Event("change"));
    });
    await p.waitForTimeout(300);
    s = await S(p);
    ok("a notice appears once a pipeline filter is set", !!s.note, s.note);
    ok("and it names the slice", s.note.indexOf("30 of 30") !== -1, s.note);
    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .getElementById("dclear").click());
    await p.waitForTimeout(300);
    s = await S(p);
    ok("Clear filters resets them and the notice goes", s.note === null, s.note);
    await ctx.close();
  }


  // ── 11. the boot screen ──────────────────────────────────────────────────
  {
    /* THIS BLOCK DELIBERATELY DOES NOT USE open(), AND THAT IS THE WHOLE FIX.

       open() calls goto(), which resolves on the LOAD event - and load waits for the
       Google Fonts stylesheet the console injects into document.head. A machine that
       can reach fonts.googleapis.com fires load hundreds of milliseconds later than
       one that cannot, so a fixed sleep afterwards lands on either side of the stub's
       delay depending on the NETWORK. These two assertions passed in a container with
       no egress and failed on a Mac, and neither result said anything about the code.

       So: resolve on domcontentloaded, hold the response open long enough that there
       is no race left to lose, and WAIT FOR the boot screen instead of sleeping
       towards it. The fixture's own rules said not to time a round trip with a fixed
       wait; this is that rule applied to the page load itself.

       The boot screen is in the markup rather than built in script, so it is on
       screen at first paint - before the bundle has even parsed. */
    const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1360, height: 1000 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    console.log("11. boot screen");
    await p.goto(FX + "/dash.html?slow=3000", { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => {
      const h = document.getElementById("hl-console-host");
      const el = h && h.shadowRoot && h.shadowRoot.getElementById("boot");
      return !!el;
    }, { timeout: 8000 });
    let b = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const el = r.getElementById("boot");
      return { gone: el.classList.contains("gone"),
               bars: el.querySelectorAll(".boot-bars i").length,
               word: r.getElementById("bootWord").textContent,
               live: el.getAttribute("aria-live"),
               heights: [].map.call(el.querySelectorAll(".boot-bars i"),
                 i => getComputedStyle(i).height),
               animated: [].every.call(el.querySelectorAll(".boot-bars i"),
                 i => getComputedStyle(i).animationName === "hl-boot") };
    });
    ok("still up while the first load is in flight", b.gone === false, b);
    ok("four bars, one per bar in the mark", b.bars === 4, b.bars);
    // 39 / 70 / 100 / 69 - the four bars' proportions inside the logomark. Read as
    // computed pixels off a 68px row, then normalised back, because the heights come
    // from a stylesheet rule rather than an inline style.
    const px = b.heights.map(h => parseFloat(h));
    const rel = px.map(h => Math.round((h / Math.max.apply(null, px)) * 100));
    ok("each keeps its own height from the mark",
      rel.join(",") === "39,70,100,69", [b.heights, rel]);
    ok("the tallest fills the row", Math.max.apply(null, px) === 68, px);
    ok("and they are animating", b.animated === true, b.animated);
    ok("the wordmark comes from the brand", b.word === "Heartland", b.word);
    ok("announced to a screen reader", b.live === "polite", b.live);
    /* Waited FOR, not slept towards - the stub holds the response 3s and a slower
       machine must not turn that into a failure. */
    let cleared = true;
    try {
      await p.waitForFunction(() => document.getElementById("hl-console-host").shadowRoot
        .getElementById("boot").classList.contains("gone"), { timeout: 9000 });
    } catch (e) { cleared = false; }
    ok("and it clears once the data lands", cleared === true, cleared);
    await ctx.close();
  }

  // ── 12. the boot screen clears when the load FAILS too ───────────────────
  {
    const { ctx, p } = await open("light", "?fail=1");
    console.log("12. boot on failure");
    const st = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return { gone: r.getElementById("boot").classList.contains("gone"),
               who: r.getElementById("who").textContent };
    });
    // A boot screen that outlives the request it is waiting for is worse than none.
    ok("cleared", st.gone === true, st.gone);
    ok("and the error is reachable underneath it", /Could not load/.test(st.who), st.who);
    await ctx.close();
  }

  // ── 13. the typeface, the mark, and the sign-in card ─────────────────────
  {
    const { ctx, p } = await open();
    console.log("13. font, mark and sign-in");
    const f = await p.evaluate(() => {
      const links = [].map.call(document.querySelectorAll("link"), l => l.rel + " " + l.href);
      return { count: document.querySelectorAll("#hl-console-font").length,
               href: (document.getElementById("hl-console-font") || {}).href,
               preconnect: links.some(l => l.indexOf("preconnect") === 0 &&
                 l.indexOf("fonts.gstatic.com") !== -1),
               inHead: !!(document.head.querySelector("#hl-console-font")),
               inShadow: !!document.getElementById("hl-console-host").shadowRoot
                 .querySelector("#hl-console-font"),
               stack: getComputedStyle(document.getElementById("hl-console-host"))
                 .getPropertyValue("--font").trim() };
    });
    // A @font-face inside a shadow root is ignored - font faces are document-scoped.
    ok("the stylesheet goes into document.head", f.inHead === true, f.inHead);
    ok("not into the shadow root, where it would do nothing", f.inShadow === false, f.inShadow);
    ok("exactly once", f.count === 1, f.count);
    ok("it is the Source Sans face", /Source\+Sans\+3/.test(f.href), f.href);
    ok("weights the console actually uses", /400;600;700/.test(f.href), f.href);
    ok("and it swaps rather than blocking", /display=swap/.test(f.href), f.href);
    ok("preconnected to the font host", f.preconnect === true, f.preconnect);
    ok("the token names both family names, then a system fallback",
      /Source Sans 3/.test(f.stack) && /Source Sans Pro/.test(f.stack) && /system-ui/.test(f.stack),
      f.stack);

    const m = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const icons = r.querySelectorAll(".bm-icon");
      return { icons: icons.length,
               paths: r.querySelectorAll(".bm-icon svg path").length,
               viewBox: icons[0].querySelector("svg").getAttribute("viewBox"),
               fill: icons[0].querySelector("svg").getAttribute("fill"),
               words: [].map.call(r.querySelectorAll(".bm-word"), w => w.textContent),
               /* The property actually worth asserting is that the INLINED SVG adds no
                  text of its own - scoped to the mark, not to the lockup around it,
                  which legitimately holds the brand line, the title and the count. */
               markText: r.querySelector("header .bm-icon").textContent.trim(),
               lockup: r.querySelector("header .lockup").textContent
                 .replace(/\s+/g, " ").trim() };
    });
    ok("a mark on the sign-in card and one in the header", m.icons === 2, m.icons);
    ok("three paths each - the shell and its bars", m.paths === 6, m.paths);
    ok("the asset's own viewBox", m.viewBox === "0 0 220 167", m.viewBox);
    ok("it inherits the brand colour rather than hard-coding it",
      m.fill === "currentColor", m.fill);
    ok("wordmarks come from the brand", m.words.join("|") === "Heartland|Heartland", m.words);
    ok("and the mark adds no stray text of its own", m.markText === "", m.markText);
    ok("the lockup reads brand, then tool, then the count",
      /^Heartland Sales console \d+ of \d+ shown$/.test(m.lockup), m.lockup);
    await ctx.close();
  }

  // ── 14. sign-in layout and the password reveal ───────────────────────────
  {
    const { ctx, p } = await open();
    console.log("14. sign-in layout");
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      r.getElementById("app").classList.add("hide");
      r.getElementById("loginWrap").classList.remove("hide");
    });
    await p.waitForTimeout(60);
    const L = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const w = s => Math.round(r.querySelector(s).getBoundingClientRect().width);
      const card = r.getElementById("login").getBoundingClientRect();
      const wrap = r.getElementById("loginWrap").getBoundingClientRect();
      return { email: w("#email"), pw: w("#pw"), btn: w("#signin"),
               cardMid: Math.round(card.left + card.width / 2),
               wrapMid: Math.round(wrap.left + wrap.width / 2),
               align: getComputedStyle(r.getElementById("login")).textAlign };
    });
    ok("email and password are the same width", L.email === L.pw, [L.email, L.pw]);
    ok("and the button matches them", L.btn === L.email, [L.btn, L.email]);
    ok("the card is horizontally centred", Math.abs(L.cardMid - L.wrapMid) <= 1,
      [L.cardMid, L.wrapMid]);
    ok("its content is centred", L.align === "center", L.align);

    const t = async () => p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const b = r.getElementById("pwToggle");
      return { type: r.getElementById("pw").type, text: b.textContent,
               pressed: b.getAttribute("aria-pressed"), label: b.getAttribute("aria-label"),
               controls: b.getAttribute("aria-controls"),
               focused: r.activeElement === r.getElementById("pw"),
               caret: r.getElementById("pw").selectionStart };
    });
    let s1 = await t();
    ok("starts masked", s1.type === "password" && s1.text === "Show" && s1.pressed === "false", s1);
    ok("and points at the field it controls", s1.controls === "pw", s1.controls);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      r.getElementById("pw").value = "correct-horse";
      r.getElementById("pw").setSelectionRange(7, 7);
      r.getElementById("pwToggle").click();
    });
    s1 = await t();
    ok("reveals", s1.type === "text", s1.type);
    ok("the button says what it will do next", s1.text === "Hide", s1.text);
    ok("state is announced", s1.pressed === "true" && s1.label === "Hide password", s1);
    ok("focus goes back to the field", s1.focused === true, s1.focused);
    ok("with the caret where it was", s1.caret === 7, s1.caret);
    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .getElementById("pwToggle").click());
    s1 = await t();
    ok("and masks again", s1.type === "password" && s1.text === "Show" && s1.pressed === "false", s1);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 15. the font guard, a refresh, and signing out ──────────────────────
  {
    const { ctx, p } = await open("light", "?prefont=1");
    console.log("15. font guard");
    const n = await p.evaluate(() => document.querySelectorAll("#hl-console-font").length);
    // The head snippet may already carry this link. Two copies is a wasted request
    // and a duplicate id.
    ok("a link already on the page is not duplicated", n === 1, n);
    await ctx.close();
  }
  {
    const { ctx, p } = await open("light", "?slow=500");
    console.log("16. refresh and sign out");
    await p.waitForTimeout(700);
    let st = await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .getElementById("boot").classList.contains("gone"));
    ok("boot is gone after the first load", st === true, st);
    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .getElementById("refresh").click());
    await p.waitForTimeout(150);
    st = await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .getElementById("boot").classList.contains("gone"));
    // A Refresh must not black out a pipeline someone is reading - the button has
    // its own affordance for that.
    ok("and a Refresh does not bring it back", st === true, st);
    await p.waitForTimeout(600);

    await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .getElementById("signout").click());
    await p.waitForTimeout(80);
    const out = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const wrap = r.getElementById("loginWrap");
      return { appHidden: r.getElementById("app").classList.contains("hide"),
               wrapHidden: wrap.classList.contains("hide"),
               visible: wrap.getBoundingClientRect().height > 0,
               boot: r.getElementById("boot").classList.contains("gone") };
    });
    ok("signing out hides the app", out.appHidden === true, out.appHidden);
    ok("and puts the sign-in card back on screen",
      out.wrapHidden === false && out.visible === true, out);
    ok("with no boot screen left over", out.boot === true, out.boot);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── an expired staff token ───────────────────────────────────────────────
  // Xano answers an expired JWT with ACCESS DENIED (403) and the sentence "This token
  // is expired." - NOT a 401. The console tested the status only, so that answer fell
  // through to the generic handler: Xano's own wording was printed into whichever panel
  // had asked, the panel looked like a broken feature, and the dead token stayed in
  // storage. Seen on Developments, 7 Sep.
  {
    const { ctx, p } = await open(null, "?expired=1");
    console.log("expired session");
    await p.waitForTimeout(400);
    const st = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const wrap = r.getElementById("loginWrap");
      return { appHidden: r.getElementById("app").classList.contains("hide"),
               loginVisible: wrap.getBoundingClientRect().height > 0,
               loginErr: r.getElementById("loginErr").textContent,
               boot: r.getElementById("boot").classList.contains("gone"),
               raw: r.innerHTML.indexOf("This token is expired.") };
    });
    ok("a 403 carrying Xano's expiry message signs the person out",
      st.appHidden === true && st.loginVisible === true, st);
    ok("and says so in our own words", /session expired/i.test(st.loginErr), st.loginErr);
    // Not "is not visible" - the string must not be in the document at all. It would
    // otherwise sit in the hidden app behind the login card, one stray unhide from
    // being read by somebody who is being told something quite different.
    ok("Xano's raw wording never reaches the page", st.raw === -1, st.raw);
    ok("with no boot screen left over", st.boot === true, st.boot);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── a 403 that is an ANSWER, not an expiry ───────────────────────────────
  // This is the assertion that makes the message test load-bearing rather than
  // decorative: without it, signing out on every 403 passes everything above.
  {
    const { ctx, p } = await open(null, "?refuse=1");
    console.log("a refusal that is not an expiry");
    await p.waitForTimeout(400);
    const st = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return { appHidden: r.getElementById("app").classList.contains("hide"),
               loginVisible: r.getElementById("loginWrap").getBoundingClientRect().height > 0,
               who: r.getElementById("who").textContent };
    });
    ok("a business 403 does NOT sign the person out",
      st.appHidden === false && st.loginVisible === false, st);
    ok("and the refusal itself is what they read", /role cannot see/.test(st.who), st.who);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
