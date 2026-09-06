/* Phases. The assertions are about one ordering - a hold, then anything recorded by hand,
   then the phase - and about the two things a release must never do: write a state onto a
   home, or half-assign a phase and call it done. */
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
const R = 'document.getElementById("hl-console-host").shadowRoot';
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
const set = (p, id, value) => p.evaluate(a => {
  const r = document.getElementById("hl-console-host").shadowRoot;
  const el = r.getElementById(a.id);
  el.value = a.value;
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input"));
}, { id, value });

(async () => {
  const browser = await chromium.launch();
  const open = async (q) => {
    const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1500, height: 1400 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html" + (q || ""));
    await p.waitForTimeout(500);
    return { ctx, p };
  };
  const openSV = async (p) => {
    await clickId(p, "tabInv");
    await p.waitForTimeout(250);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(300);
  };

  // ── 1. the column ───────────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("1. the phase column");
    await openSV(p);
    ok("the grid grows a Phase column", (await count(p, "th.gphase")) === 1);
    ok("every home gets a phase cell", (await count(p, "td.gphase")) === 12);
    /* The short code, because a column wide enough for "Spring Release" pushes the prices
       off the screen. */
    const tags = await all(p, "td.gphase .gphase-tag");
    ok("it shows the short code, not the full name",
      tags.length === 12 && tags[0] === "P1" && tags[11] === "P2", tags.slice(0, 3));
    ok("a released phase reads differently from a pending one",
      (await count(p, "td.gphase .gphase-tag.is-out")) === 6);

    /* The chain, visible on the row: unit 7 is unsold, unheld and not on the market. */
    const row7 = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const rows = [...r.querySelectorAll("#viewInv tbody tr")];
      /* The grid RENDERS unit numbers at this development's padded width, so the cell says
         07 where the stored number is 7. Compared as numbers, which is the whole reason the
         padding was moved out of the stored value in the first place. */
      const hit = rows.find(t => Number(t.querySelector("td.gnum strong")?.textContent.trim()) === 7);
      return hit ? hit.textContent : "";
    });
    ok("a home in a pending phase reads unreleased", /unreleased/.test(row7), row7.slice(0, 120));
    /* A home recorded unreleased by hand and one waiting on a release read identically in
       the State column, and they are undone in completely different places. Naming the
       phase is what says which. */
    ok("and the row says which phase it is waiting on",
      /Phase 2 not released/.test(row7), row7.slice(0, 200));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. a development that does not use phases ───────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("2. phases off");
    await clickId(p, "tabInv");
    await p.waitForTimeout(250);
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(300);
    ok("no column", (await count(p, "th.gphase")) === 0);
    /* No PHASES panel. The Fields panel is beside it and belongs to every development, so
       this has to name the one it means rather than counting cards. */
    ok("no phases panel", (await count(p, "#invPhaseOpen, [data-ph-rel]")) === 0);
    /* The column count still has to line up, or the header and the body disagree. */
    const cells = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const th = r.querySelectorAll("#viewInv thead th").length;
      const td = r.querySelectorAll("#viewInv tbody tr").length
        ? r.querySelector("#viewInv tbody tr").querySelectorAll("td").length : 0;
      return { th, td };
    });
    ok("header and row still have the same number of columns", cells.th === cells.td, cells);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. the panel ────────────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("3. the release panel");
    await openSV(p);
    /* A button in the bar above the grid; the panel itself lives in the side drawer, so
       opening it never pushes the stock off the screen. */
    ok("it starts as a button, with the drawer shut",
      (await count(p, "#invPhaseOpen")) === 1 && (await count(p, "#drawer.open")) === 0);
    ok("and says enough to decide whether to open it",
      /1 released, 1 pending/.test(await txt(p, "#invPhaseOpen") || ""),
      await txt(p, "#invPhaseOpen"));
    await clickId(p, "invPhaseOpen");
    await p.waitForTimeout(150);
    ok("opening it uses the side drawer",
      (await count(p, "#drawer.open")) === 1 && (await txt(p, "#drawer h1")) === "Phases");
    ok("and the grid is still there behind it", (await count(p, "#viewInv tbody tr")) > 0);
    ok("it lists every phase", (await count(p, "#drawer .ph-row")) === 2);
    ok("a released one offers Pull back",
      (await txt(p, '[data-ph-rel="1"]')) === "Pull back");
    ok("a pending one offers Release",
      (await txt(p, '[data-ph-rel="2"]')) === "Release");
    /* A button that could not say what is in the phase is a button somebody presses blind. */
    const body = await all(p, ".ph-row .feat-desc");
    ok("each phase says how many homes are in it", /6 homes/.test(body[0]), body);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. releasing ────────────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("4. releasing a phase");
    await openSV(p);
    await clickId(p, "invPhaseOpen");
    await p.waitForTimeout(150);
    const before = await txt(p, '[data-inv-state="available"] b');
    await click(p, '[data-ph-rel="2"]');
    await p.waitForTimeout(500);
    const sent = await p.evaluate(() => window.__PH_POSTED);
    ok("it sends an explicit true rather than a toggle",
      sent.phase_id === 2 && sent.released === true, sent);
    /* SIX HOMES ARE IN PHASE 2, AND RELEASING IT PUTS EXACTLY ONE ON THE MARKET. Two are
       sold, one is held and two were recorded unreleased by hand - all five of those are
       answered before the phase is ever consulted, so the release cannot touch them. Only
       home 7, which nothing else had an opinion about, changes. That gap between "six homes
       released" and "one home for sale" is the number a release panel exists to show. */
    ok("available goes from 6 to 7 - the one home nothing else spoke for",
      before === "6" && (await txt(p, '[data-inv-state="available"] b')) === "7",
      { before, after: await txt(p, '[data-inv-state="available"] b') });
    ok("the phase now reads released",
      (await txt(p, '[data-ph-rel="2"]')) === "Pull back");
    ok("and the column follows", (await count(p, "td.gphase .gphase-tag.is-out")) === 12);

    /* THE RULE THAT MATTERS. Homes 11 and 12 were recorded unreleased by hand; the release
       must not have overwritten them, because a recorded state outranks a phase. */
    const stillOff = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return [...r.querySelectorAll("#viewInv tbody tr")]
        .filter(t => [11, 12].includes(Number(t.querySelector("td.gnum strong")?.textContent.trim())))
        .map(t => t.querySelector(".st")?.textContent.trim());
    });
    ok("a home recorded unreleased by hand is untouched by the release",
      stillOff.length === 2 && stillOff.every(x => x === "unreleased"), stillOff);

    // And back again.
    await click(p, '[data-ph-rel="2"]');
    await p.waitForTimeout(500);
    const back = await p.evaluate(() => window.__PH_POSTED);
    ok("pulling back sends false, not an omitted value",
      back.released === false && Object.prototype.hasOwnProperty.call(back, "released"), back);
    ok("and it goes back off the market",
      (await txt(p, '[data-inv-state="available"] b')) === "6");
    /* The two that were sold out of that phase must not have come back either. */
    const soldStill = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return [...r.querySelectorAll("#viewInv tbody tr")]
        .filter(t => [8, 9].includes(Number(t.querySelector("td.gnum strong")?.textContent.trim())))
        .map(t => t.querySelector(".st")?.textContent.trim());
    });
    ok("a home sold out of a pulled-back phase stays sold",
      soldStill.length === 2 && soldStill.every(x => x === "sold"), soldStill);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 5. creating one ─────────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("5. creating a phase");
    await openSV(p);
    await clickId(p, "invPhaseOpen");
    await p.waitForTimeout(150);
    await set(p, "invPhaseName", "Phase 3");
    await set(p, "invPhaseCode", "P3");
    await clickId(p, "invPhaseAdd");
    await p.waitForTimeout(500);
    ok("it posts the name and the code",
      (await p.evaluate(() => window.__PH_POSTED)).name === "Phase 3" &&
      (await p.evaluate(() => window.__PH_POSTED)).code === "P3");
    ok("and it appears in the panel", (await count(p, ".ph-row")) === 3);
    /* A NEW PHASE IS NEVER BORN RELEASED. Creating a release and letting it out are two
       decisions, and a create that could also release is one that eventually will. */
    ok("a new phase starts pending", (await txt(p, '[data-ph-rel="3"]')) === "Release");
    ok("with nothing in it yet",
      /0 homes/.test((await all(p, ".ph-row .feat-desc"))[2]),
      (await all(p, ".ph-row .feat-desc"))[2]);

    // A duplicate name inside one development is somebody creating a second one by mistake.
    await set(p, "invPhaseName", "phase 3");
    await clickId(p, "invPhaseAdd");
    await p.waitForTimeout(400);
    ok("a duplicate name is refused, and says so",
      /already exists/.test(await txt(p, "#drawer .err") || ""),
      await txt(p, "#drawer .err"));
    ok("and no fourth phase was created", (await count(p, ".ph-row")) === 3);

    // A nameless phase never reaches the server.
    await set(p, "invPhaseName", "   ");
    await clickId(p, "invPhaseAdd");
    await p.waitForTimeout(300);
    ok("a nameless phase is refused before the request",
      /name/.test(await txt(p, "#drawer .err") || ""));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 6. moving homes ─────────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("6. moving homes between phases");
    await openSV(p);
    /* Moving is a BULK action, never a cell edit - nobody assigns a release one home at a
       time, and a grid that let them would make a half-assigned phase the easy outcome. */
    ok("there is no phase picker until rows are selected",
      (await count(p, "#invPhaseMove")) === 0);
    await click(p, '[data-inv-pick="1"]');
    await click(p, '[data-inv-pick="2"]');
    await p.waitForTimeout(150);
    ok("selecting rows offers one", (await count(p, "#invPhaseMove")) === 1);
    ok("it lists every phase plus taking them out of one",
      (await count(p, "#invPhaseMove option")) === 4);

    const before = await txt(p, '[data-inv-state="available"] b');
    await set(p, "invPhaseMove", "2");
    await p.waitForTimeout(500);
    const sent = await p.evaluate(() => window.__PHMOVE_POSTED);
    ok("it names the homes by unit number, which is what a person has in front of them",
      JSON.stringify(sent.unit_numbers) === JSON.stringify(["1", "2"]), sent);
    ok("and says which phase", sent.phase_id === 2, sent);
    ok("both come off the market, because Phase 2 has not been released",
      before === "6" && (await txt(p, '[data-inv-state="available"] b')) === "4",
      { before, after: await txt(p, '[data-inv-state="available"] b') });

    // Clearing sends no phase at all. Sending null would be sending a value.
    await click(p, '[data-inv-pick="1"]');
    await p.waitForTimeout(150);
    await set(p, "invPhaseMove", "none");
    await p.waitForTimeout(500);
    const cleared = await p.evaluate(() => window.__PHMOVE_POSTED);
    ok("clearing omits phase_id entirely",
      !Object.prototype.hasOwnProperty.call(cleared, "phase_id"), cleared);
    /* A home in no phase is ON the market - absence is no opinion, not a pending release. */
    ok("and a home in no phase comes back onto the market",
      (await txt(p, '[data-inv-state="available"] b')) === "5");
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 7. who may ──────────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("7. a salesperson");
    await openSV(p);
    ok("still sees the column - phases are stock information",
      (await count(p, "th.gphase")) === 1);
    await clickId(p, "invPhaseOpen");
    await p.waitForTimeout(150);
    ok("and can read the panel", (await count(p, ".ph-row")) === 2);
    /* Hiding a control is a courtesy; the endpoint refuses too. What this stops is a
       salesperson being shown a button that cannot work. */
    ok("but is offered no release button", (await count(p, "[data-ph-rel]")) === 0);
    ok("and no way to add one", (await count(p, "#invPhaseAdd")) === 0);
    await click(p, '[data-inv-pick="1"]');
    await p.waitForTimeout(150);
    ok("and no way to move homes", (await count(p, "#invPhaseMove")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 8. when the server says no ──────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("8. when the server refuses");
    await p.evaluate(() => { window.__PH_FAILS = true; });
    await openSV(p);
    await clickId(p, "invPhaseOpen");
    await p.waitForTimeout(150);
    await click(p, '[data-ph-rel="2"]');
    await p.waitForTimeout(500);
    ok("the refusal is shown in the panel, in the server's own words",
      /manager or an admin/.test(await txt(p, "#drawer .err") || ""),
      await txt(p, "#drawer .err"));
    ok("and the phase did not move",
      (await txt(p, '[data-ph-rel="2"]')) === "Release");
    ok("nor did any home", (await txt(p, '[data-inv-state="available"] b')) === "6");
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 9. sorting ──────────────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("9. sorting by phase");
    await openSV(p);
    await click(p, '[data-sort="phase"]');
    await p.waitForTimeout(200);
    const tags = await all(p, "td.gphase .gphase-tag");
    /* Release ORDER, not alphabetical - "Phase 10" belongs after "Phase 9". */
    ok("it sorts by release order", tags.slice(0, 6).every(t => t === "P1") &&
      tags.slice(6).every(t => t === "P2"), tags);
    await click(p, '[data-sort="phase"]');
    await p.waitForTimeout(200);
    const rev = await all(p, "td.gphase .gphase-tag");
    ok("and reverses", rev.slice(0, 6).every(t => t === "P2"), rev);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 10. removing a phase ────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("10. retiring a phase, and bringing it back");
    await openSV(p);
    await clickId(p, "invPhaseOpen");
    await p.waitForTimeout(150);
    /* THE MISSING VERB. Phases could be created, renamed, reordered and released; there was
       no way to get rid of one at all. */
    ok("every phase offers Remove", (await count(p, "[data-ph-retire]")) === 2);
    ok("and none of them offers a permanent delete yet",
      (await count(p, "[data-ph-purge]")) === 0);

    /* Phase 2 holds six unreleased homes. Retiring it must not move a single one. */
    const before = await txt(p, '[data-inv-state="available"] b');
    await click(p, '[data-ph-retire="2"]');
    await p.waitForTimeout(600);
    const sent = await p.evaluate(() => window.__PHDEL_POSTED);
    ok("Remove retires - it never sends hard",
      sent.hard === undefined && sent.phase_id === 2, sent);
    /* AND IT NEVER SENDS release_homes, which clears every home in the phase and puts the
       available ones on the market. That flag is deliberately not reachable from a button. */
    ok("and never sends release_homes", sent.release_homes === undefined, sent);
    ok("THE HOMES DID NOT MOVE",
      (await txt(p, '[data-inv-state="available"] b')) === before,
      { before, after: await txt(p, '[data-inv-state="available"] b') });
    ok("the phase is still listed, marked retired",
      (await count(p, ".ph-row.is-retired")) === 1 &&
      /retired/.test(await txt(p, ".ph-row.is-retired") || ""));
    ok("it says the homes are still in it and still off the market",
      /still in this phase, and still off the market/.test(
        await txt(p, ".ph-row.is-retired .feat-desc") || ""),
      await txt(p, ".ph-row.is-retired .feat-desc"));
    /* A retired phase holding homes cannot be removed for good - the server refuses, so the
       console does not offer it. Moving the homes out is the way through. */
    ok("no permanent delete while it holds homes",
      (await count(p, '[data-ph-purge="2"]')) === 0);
    ok("and it is out of the release controls", (await count(p, '[data-ph-rel="2"]')) === 0);
    ok("but offers to bring it back", (await count(p, '[data-ph-restore="2"]')) === 1);

    /* The picker must not offer a retired phase, or somebody moves stock into a phase that
       is in no list. */
    await click(p, '[data-inv-pick="1"]');
    await p.waitForTimeout(200);
    const opts = await all(p, "#invPhaseMove option");
    ok("the move picker no longer offers it",
      !opts.some(o => /Phase 2/.test(o)), opts);
    ok("and still offers the live one", opts.some(o => /Phase 1/.test(o)), opts);

    await click(p, '[data-ph-restore="2"]');
    await p.waitForTimeout(600);
    const back = await p.evaluate(() => window.__PH_POSTED);
    ok("bringing it back is an is_active edit, not a new phase",
      back.is_active === true && back.phase_id === 2, back);
    ok("and it is an ordinary phase again",
      (await count(p, ".ph-row.is-retired")) === 0 &&
      (await count(p, '[data-ph-rel="2"]')) === 1);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 11. deleting an empty one for good ──────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("11. deleting an empty phase for good");
    await openSV(p);
    await clickId(p, "invPhaseOpen");
    await p.waitForTimeout(150);
    await set(p, "invPhaseName", "Phase 3");
    await set(p, "invPhaseCode", "P3");
    await clickId(p, "invPhaseAdd");
    await p.waitForTimeout(600);
    ok("a new phase holds nothing", (await count(p, ".ph-row")) === 3);
    await click(p, '[data-ph-retire="3"]');
    await p.waitForTimeout(600);
    /* Empty, and never released - so there is nothing to lose and the button appears. */
    ok("an empty, never-released phase offers a permanent delete",
      (await count(p, '[data-ph-purge="3"]')) === 1);
    /* Phase 1 has been released. released_at is the record of it, and deleting the row
       erases that - so even retired it would never offer this. */
    await click(p, '[data-ph-retire="1"]');
    await p.waitForTimeout(600);
    ok("a phase that has been released never does, even retired",
      (await count(p, ".ph-row.is-retired")) === 2 &&
      (await count(p, '[data-ph-purge="1"]')) === 0);

    await click(p, '[data-ph-purge="3"]');
    await p.waitForTimeout(600);
    const sent = await p.evaluate(() => window.__PHDEL_POSTED);
    ok("it sends hard, and still not release_homes",
      sent.hard === true && sent.release_homes === undefined, sent);
    ok("and the row is gone", (await count(p, ".ph-row")) === 2);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 12. a retired phase still explains its homes ────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("12. a home in a retired phase");
    await openSV(p);
    await clickId(p, "invPhaseOpen");
    await p.waitForTimeout(150);
    await click(p, '[data-ph-retire="2"]');
    await p.waitForTimeout(600);
    await clickId(p, "close");
    await p.waitForTimeout(150);
    /* The grid still shows the tag, and says the phase is retired - a home off the market
       because of a phase that appears in no picker is otherwise ten minutes of confusion. */
    const tags = await all(p, "td.gphase .gphase-tag");
    ok("the grid still tags the home with its phase",
      tags.filter(t => /P2/.test(t)).length === 6, tags);
    ok("and marks it retired", tags.some(t => /retired/.test(t)), tags);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
