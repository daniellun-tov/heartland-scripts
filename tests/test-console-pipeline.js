/* The pipeline grid - 11 Sep. Leads, on the same grid core as the inventory: scoped to the
   caller's own leads by default, a team view on request, everyone for a manager; status and
   agent pickers, a long-text notes column, a spreadsheet round trip, bulk actions as pending
   edits, review before save. The assertions are about scope, who may type where, what reaches
   the server, and what is refused before the round trip. The fixture mirrors list_pipeline
   and bulk_update_leads; run_smoke_leads is the server's proof. */
const { chromium } = require("playwright");
const FX = "file://" + require("path").join(__dirname, "fixtures");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}
const R = "document.getElementById('hl-console-host').shadowRoot";
const click = (p, sel) => p.evaluate(s => document.getElementById("hl-console-host").shadowRoot.querySelector(s).click(), sel);
const txt = (p, sel) => p.evaluate(s => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  return e ? e.textContent.trim() : null;
}, sel);
const count = (p, sel) => p.evaluate(s => document.getElementById("hl-console-host").shadowRoot.querySelectorAll(s).length, sel);
const all = (p, sel) => p.evaluate(s => [...document.getElementById("hl-console-host").shadowRoot.querySelectorAll(s)].map(e => e.textContent.trim()), sel);
const set = (p, id, value) => p.evaluate(a => {
  const el = document.getElementById("hl-console-host").shadowRoot.getElementById(a.id);
  el.value = a.value;
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input"));
}, { id, value });
const clickId = (p, id) => p.evaluate(i => document.getElementById("hl-console-host").shadowRoot.getElementById(i).click(), id);
const attr = (p, sel, a) => p.evaluate(x => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(x.sel);
  return e ? e.getAttribute(x.a) : null;
}, { sel, a });
const keyOn = (p, id, key, mods) => p.evaluate(a => {
  const el = document.getElementById("hl-console-host").shadowRoot.getElementById(a.id);
  el.dispatchEvent(new KeyboardEvent("keydown", Object.assign({ key: a.key, bubbles: true, cancelable: true }, a.mods || {})));
}, { id, key, mods });
const pasteInto = (p, text) => p.evaluate(t => {
  const grid = document.getElementById("hl-console-host").shadowRoot.getElementById("plGrid");
  const dt = new DataTransfer(); dt.setData("text/plain", t);
  grid.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}, text);

(async () => {
  const browser = await chromium.launch();
  const open = async (q) => {
    const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1500, height: 1100 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html" + (q || ""));
    await p.waitForTimeout(450);
    await clickId(p, "tabLeads"); await p.waitForTimeout(450);
    return { ctx, p };
  };

  // ── 1. scope, for a salesperson ──────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("1. a salesperson's pipeline");
    ok("the tab is Pipeline and opens on MINE", (await attr(p, ".pl-scope.is-on", "data-pl-scope")) === "mine");
    ok("no Everyone for a salesperson", (await count(p, '[data-pl-scope="all"]')) === 0);
    ok("two rows, both marked yours", (await count(p, "tr.pl-row")) === 2 && (await count(p, ".pl-mine")) === 2);
    ok("the sidebar count is the visible count", (await txt(p, "#leadsCount")) === "2");
    ok("newest first: the enquiry from an hour ago sits above the older one",
      (await all(p, "tr.pl-row td.gnum strong"))[0] === "LD-STE-003", await all(p, "tr.pl-row td.gnum strong"));
    ok("a status cell on an own row is live", (await count(p, '[data-cell="701|status"].is-live')) === 1);
    ok("the agent cell is NOT live for a salesperson", (await count(p, '[data-cell="701|assigned_staff_id"].is-live')) === 0);
    ok("the reservation column is a link into the deal", (await count(p, '[data-pl-deal]')) === 1);

    await click(p, '[data-pl-scope="team"]'); await p.waitForTimeout(400);
    ok("My team adds a teammate's lead", (await count(p, "tr.pl-row")) === 3);
    ok("the teammate's row is drawn read-only", (await count(p, "tr.pl-row.is-ro")) === 1 &&
      (await count(p, '[data-cell="702|status"].is-live')) === 0);
    ok("an unassigned lead on another development is not in the team view", (await count(p, '[data-cell="703|status"]')) === 0);
    await clickId(p, "plLost"); await p.waitForTimeout(400);
    ok("Show lost brings the lost one back, marked", (await count(p, "tr.pl-row")) === 4 && (await count(p, "tr.pl-row.is-lost")) === 1);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. a salesperson edits a status, reviews, saves ──────────────────────
  {
    const { ctx, p } = await open();
    console.log("2. edit, review, save");
    await click(p, '[data-cell="701|status"]'); await p.waitForTimeout(100);
    await click(p, '[data-cell="701|status"]'); await p.waitForTimeout(150);
    ok("a second click opens the status picker, not a text box",
      (await p.evaluate(() => { const e = document.getElementById("hl-console-host").shadowRoot.getElementById("plCellInput"); return e && e.tagName; })) === "SELECT");
    await set(p, "plCellInput", "contacted");
    await keyOn(p, "plCellInput", "Enter"); await p.waitForTimeout(150);
    ok("the cell is dirty and the bar counts one change",
      (await count(p, '[data-cell="701|status"].is-dirty')) === 1 && /1 unsaved change/.test(await txt(p, ".gbar") || ""));
    ok("nothing sent yet", (await p.evaluate(() => window.__PL_POSTED)) === undefined);

    await clickId(p, "plReview"); await p.waitForTimeout(400);
    const dry = await p.evaluate(() => window.__PL_POSTED);
    ok("Review is a dry run carrying the id and the field",
      dry && dry.dry_run === true && dry.items.length === 1 && dry.items[0].id === 701 && dry.items[0].fields.status === "contacted", dry);
    ok("the preview names the lead and the change", /LD-STE-001/.test(await txt(p, ".gpreview") || "") && /Status/.test(await txt(p, ".gpreview") || ""));
    await clickId(p, "plBulkGo"); await p.waitForTimeout(150);
    ok("saving without a reason is refused before the round trip", /Say why/.test(await txt(p, "#plBulkErr") || ""));
    ok("and the dry run is still the last thing sent", (await p.evaluate(() => window.__PL_POSTED.dry_run)) === true);
    await set(p, "plBulkReason", "Spoke to him this morning.");
    await clickId(p, "plBulkGo"); await p.waitForTimeout(600);
    const sent = await p.evaluate(() => window.__PL_POSTED);
    ok("Save sends the same items with the reason and no dry_run",
      sent && !sent.dry_run && sent.reason === "Spoke to him this morning." && sent.items[0].fields.status === "contacted", sent);
    ok("the grid re-read the server: the cell reads Contacted and is clean",
      (await txt(p, '[data-cell="701|status"]')) === "Contacted" && (await count(p, '[data-cell="701|status"].is-dirty')) === 0);
    ok("the saved report closes with Close", (await count(p, "#plBulkDone")) === 1);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. a manager: everyone, bulk assign, unassigned queue ────────────────
  {
    const { ctx, p } = await open("?role=manager");
    console.log("3. a manager assigns in bulk");
    await click(p, '[data-pl-scope="all"]'); await p.waitForTimeout(400);
    ok("Everyone shows all four open leads", (await count(p, "tr.pl-row")) === 4);
    ok("the unassigned one is marked and counted", (await count(p, ".pl-unassigned")) === 1 && /1unassigned/.test((await txt(p, ".pl-stats") || "").replace(/\s+/g, "")));
    ok("a manager may type into the agent cell", (await count(p, '[data-cell="702|assigned_staff_id"].is-live')) === 1);
    ok("the agent cell shows the name, not the id", (await txt(p, '[data-cell="702|assigned_staff_id"]')) === "Danette");

    await click(p, '[data-pl-pick="701"]'); await click(p, '[data-pl-pick="703"]'); await p.waitForTimeout(150);
    ok("two picked, and the bar offers Assign to", /2 selected/.test(await txt(p, ".gbar") || "") && (await count(p, "#plBulkAssign")) === 1);
    await set(p, "plBulkAssign", "6"); await p.waitForTimeout(150);
    ok("assigning writes two pending cells, shown by name",
      (await count(p, ".gcell.is-dirty")) === 2 && (await txt(p, '[data-cell="703|assigned_staff_id"]')) === "Danette");
    await clickId(p, "plReview"); await p.waitForTimeout(400);
    await set(p, "plBulkReason", "Danette is covering Stellenbosch this week.");
    await clickId(p, "plBulkGo"); await p.waitForTimeout(600);
    const sent = await p.evaluate(() => window.__PL_POSTED);
    ok("the write carries assigned_staff_id as a number for both",
      sent && sent.items.length === 2 && sent.items.every(i => i.fields.assigned_staff_id === 6), sent);
    ok("after the re-read the queue is empty", (await count(p, ".pl-unassigned")) === 0);

    await click(p, '[data-pl-pick="701"]'); await p.waitForTimeout(100);
    await set(p, "plBulkAssign", "__none"); await p.waitForTimeout(150);
    await clickId(p, "plReview"); await p.waitForTimeout(400);
    const un = await p.evaluate(() => window.__PL_POSTED);
    ok("Nobody is sent as unassign, never as an empty id", un && un.items[0].fields.unassign === true && !("assigned_staff_id" in un.items[0].fields), un);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. notes: long text, and the spreadsheet round trip ──────────────────
  {
    const { ctx, p } = await open();
    console.log("4. notes and the round trip");
    await click(p, '[data-cell="701|notes"]'); await p.waitForTimeout(80);
    await click(p, '[data-cell="701|notes"]'); await p.waitForTimeout(150);
    ok("a notes cell edits in a textarea",
      (await p.evaluate(() => { const e = document.getElementById("hl-console-host").shadowRoot.getElementById("plCellInput"); return e && e.tagName; })) === "TEXTAREA");
    await set(p, "plCellInput", "line one\nline two");
    await keyOn(p, "plCellInput", "Enter"); await p.waitForTimeout(100);
    ok("Enter alone does not commit a long cell",
      (await p.evaluate(() => { const e = document.getElementById("hl-console-host").shadowRoot.getElementById("plCellInput"); return !!e; })) === true);
    await keyOn(p, "plCellInput", "Enter", { ctrlKey: true }); await p.waitForTimeout(150);
    ok("Ctrl+Enter commits both lines", (await count(p, '[data-cell="701|notes"].is-dirty')) === 1);
    await clickId(p, "plReview"); await p.waitForTimeout(400);
    const dry = await p.evaluate(() => window.__PL_POSTED);
    ok("the note goes to the server with its line break intact", dry && dry.items[0].fields.notes === "line one\nline two", dry);
    await clickId(p, "plBulkCancel"); await clickId(p, "plDiscard"); await p.waitForTimeout(150);
    ok("Discard clears it", (await count(p, ".gcell.is-dirty")) === 0);

    /* The round trip: a block carrying our header row is routed by lead, and a quoted cell
       carries a line break back in one piece. Sorted first, to prove position is not used. */
    await click(p, '[data-pl-sort="last_name"]'); await p.waitForTimeout(150);
    await click(p, '[data-cell="704|notes"]'); await p.waitForTimeout(80);
    await pasteInto(p, "Lead\tStatus\tNotes\nLD-STE-001\tqualified\t\"pasted\nfrom sheets\"\nLD-STE-003\t\tsecond row\nLD-NOPE-001\tnew\tx\n");
    await p.waitForTimeout(200);
    ok("rows are matched by reference, whatever the sort",
      (await count(p, '[data-cell="701|status"].is-dirty')) === 1 && (await count(p, '[data-cell="704|notes"].is-dirty')) === 1);
    ok("the unknown reference is named rather than dropped", /LD-NOPE-001/.test(await txt(p, "#plMsg") || ""), await txt(p, "#plMsg"));
    await clickId(p, "plReview"); await p.waitForTimeout(400);
    const rt = await p.evaluate(() => window.__PL_POSTED);
    ok("a quoted cell with a line break comes back as one note",
      rt && rt.items.filter(i => i.id === 701)[0].fields.notes === "pasted\nfrom sheets", rt);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 5. add a lead by hand ────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("5. add a lead");
    await clickId(p, "plAddOpen"); await p.waitForTimeout(150);
    ok("the form opens without an agent picker for a salesperson", (await count(p, "#plAdd")) === 1 && (await count(p, "#plAddAgent")) === 0);
    await set(p, "plAddProp", "stellenbosch");
    await set(p, "plAddFirst", "Sipho");
    await clickId(p, "plAddGo"); await p.waitForTimeout(150);
    ok("no contact detail is refused before the round trip", /email address or a phone/.test(await txt(p, "#plAddErr") || ""));
    ok("and nothing was sent", (await p.evaluate(() => window.__LEAD_ADDED)) === undefined);
    await set(p, "plAddPhone", "082 111 0009");
    await set(p, "plAddMsg", "Walked into the show house");
    await clickId(p, "plAddGo"); await p.waitForTimeout(600);
    const sent = await p.evaluate(() => window.__LEAD_ADDED);
    ok("the lead is posted with what was typed", sent && sent.property_slug === "stellenbosch" && sent.first_name === "Sipho" && sent.phone === "082 111 0009", sent);
    ok("the grid re-read: the new lead is listed, yours, on top",
      (await count(p, "tr.pl-row")) === 3 && (await all(p, "tr.pl-row td.gnum strong"))[0] === "LD-STE-009");
    ok("the form closed and said what happened", (await count(p, "#plAdd")) === 0 && /LD-STE-009/.test(await txt(p, "#viewLeads .ok") || ""));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 6. the deal link, a server refusal, sorting ──────────────────────────
  {
    const { ctx, p } = await open("?role=manager");
    console.log("6. deal link, refusal, sort");
    await click(p, "[data-pl-deal]"); await p.waitForTimeout(600);
    ok("the reservation link opens the deal in Deals", (await attr(p, "#tabPipe", "aria-selected")) === "true" &&
      (await count(p, "#drawer h1")) === 1, await attr(p, "#tabPipe", "aria-selected"));
    await clickId(p, "close"); await clickId(p, "tabLeads"); await p.waitForTimeout(400);

    await click(p, '[data-pl-sort="last_name"]'); await p.waitForTimeout(150);
    const asc = await all(p, "tr.pl-row td.gnum strong");
    await click(p, '[data-pl-sort="last_name"]'); await p.waitForTimeout(150);
    const desc = await all(p, "tr.pl-row td.gnum strong");
    await click(p, '[data-pl-sort="last_name"]'); await p.waitForTimeout(150);
    const back = await all(p, "tr.pl-row td.gnum strong");
    ok("a header sorts, reverses, and a third click returns to newest first",
      asc[0] === "LD-STE-003" && desc[0] === "LD-STE-001" && back[0] === "LD-STE-003", [asc, desc, back]);

    await p.evaluate(() => { window.__PL_FAILS = "Only a manager or an admin can assign a lead."; });
    await click(p, '[data-cell="701|status"]'); await click(p, '[data-cell="701|status"]'); await p.waitForTimeout(150);
    await set(p, "plCellInput", "lost"); await keyOn(p, "plCellInput", "Enter"); await p.waitForTimeout(150);
    await clickId(p, "plReview"); await p.waitForTimeout(400);
    ok("a refused call is shown, and the edit is kept", /Only a manager/.test(await txt(p, "#plMsg") || "") && (await count(p, ".gcell.is-dirty")) === 1);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
