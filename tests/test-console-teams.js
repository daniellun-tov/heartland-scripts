/* Sales teams on the Team tab - 11 Sep. A team is an agency, Heartland included; people sit
   on several; each membership carries a cap and a place in the rotation; a team sells the
   developments it is attached to. One writer, POST /staff/teams. The assertions are about what
   reaches the server for each control and what is refused before it. The fixture mirrors
   set_team and list_teams; run_smoke_leads is the server's proof. */
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
const count = (p, sel) => p.evaluate(s => document.getElementById("hl-console-host").shadowRoot.querySelectorAll(s).length, sel);
const setSel = (p, sel, value) => p.evaluate(a => {
  const el = document.getElementById("hl-console-host").shadowRoot.querySelector(a.sel);
  el.value = a.value;
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input"));
}, { sel, value });
const set = (p, id, value) => setSel(p, "#" + id, value);
const clickId = (p, id) => p.evaluate(i => document.getElementById("hl-console-host").shadowRoot.getElementById(i).click(), id);
const change = (p, sel) => p.evaluate(s => {
  const el = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  el.dispatchEvent(new Event("change"));
}, sel);
/* A cap commits on change (or Enter), never on every keystroke - so the test says change. */
const setCap = async (p, sel, value) => { await setSel(p, sel, value); await change(p, sel); };
const posts = (p) => p.evaluate(() => window.__TEAMS_POSTS || []);
const last = (p) => p.evaluate(() => window.__TEAMS_POSTED);

(async () => {
  const browser = await chromium.launch();
  const open = async (q) => {
    const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1400, height: 1200 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html" + (q || "?role=admin"));
    await p.waitForTimeout(450);
    await clickId(p, "tabTeam"); await p.waitForTimeout(450);
    return { ctx, p };
  };

  // ── 1. the register ──────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("1. the register");
    ok("the Team tab carries a Sales teams block", (await count(p, ".tm-wrap")) === 1);
    ok("Heartland is listed as the internal team with its counts",
      (await count(p, '[data-tm-team="1"]')) === 1 && /Heartland/.test(await txt(p, '[data-tm-team="1"] h2') || "") &&
        /2 members · 1 development/.test(await txt(p, '[data-tm-team="1"] .inv-who') || ""));
    ok("it is closed until Manage", (await count(p, ".tm-body")) === 0);
    await click(p, '[data-tm-open="1"]'); await p.waitForTimeout(150);
    ok("Manage opens it: three memberships listed, the retired one marked and offered back",
      (await count(p, ".team-member")) === 3 && (await count(p, ".team-member.is-off")) === 1 && (await count(p, '[data-tm-restore="13"]')) === 1);
    ok("a cap reads back on the input, blank for none",
      (await p.evaluate(() => { const r = document.getElementById("hl-console-host").shadowRoot; return [r.querySelector('[data-tm-cap="11"]').value, r.querySelector('[data-tm-cap="12"]').value]; })).join("|") === "5|");
    ok("open leads and the last turn are read beside each person", /2 open leads/.test(await txt(p, '[data-tm-row="11"]') || "") && /never given one/.test(await txt(p, '[data-tm-row="12"]') || ""));
    ok("the development is a chip with a detach, and the rest are offered to attach",
      (await count(p, '[data-tm-detach="1|stellenbosch"]')) === 1 && (await count(p, '[data-tm-attach-pick="1"] option')) === 3);
    ok("people not on the team are offered to add", (await count(p, '[data-tm-add-pick="1"] option')) === 3);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. each control is one write, in the server's shape ──────────────────
  {
    const { ctx, p } = await open();
    console.log("2. the writes");
    await click(p, '[data-tm-open="1"]'); await p.waitForTimeout(150);

    await setCap(p, '[data-tm-cap="12"]', "3"); await p.waitForTimeout(300);
    let w = await last(p);
    ok("typing a cap sends kind member with lead_cap as a number", w && w.kind === "member" && w.team_id === 1 && w.member_staff_id === 6 && w.lead_cap === 3, w);
    ok("and the re-read shows it", (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot.querySelector('[data-tm-cap="12"]').value)) === "3");

    await setCap(p, '[data-tm-cap="12"]', ""); await p.waitForTimeout(300);
    w = await last(p);
    ok("clearing the cap sends clear_cap, never a null", w && w.clear_cap === true && !("lead_cap" in w), w);

    await setCap(p, '[data-tm-cap="11"]', "five"); await p.waitForTimeout(200);
    ok("a non-number is refused before the round trip", /whole number/.test(await txt(p, "#tmsErr") || ""));
    ok("and not sent", (await last(p)).clear_cap === true);

    await click(p, '[data-tm-recv="11"]'); await p.waitForTimeout(300);
    w = await last(p);
    ok("the Gets leads box sends receives_leads false", w && w.kind === "member" && w.member_staff_id === 5 && w.receives_leads === false, w);
    ok("and says what that means", /still see the pipeline/.test(await txt(p, "#tmsOk") || ""));

    await click(p, '[data-tm-retire="12"]'); await p.waitForTimeout(300);
    w = await last(p);
    ok("Remove retires the membership, is_active false", w && w.member_staff_id === 6 && w.is_active === false, w);
    ok("the row stays, marked, with Bring back", (await count(p, '[data-tm-restore="12"]')) === 1);
    await click(p, '[data-tm-restore="13"]'); await p.waitForTimeout(300);
    w = await last(p);
    ok("Bring back sends is_active true", w && w.member_staff_id === 8 && w.is_active === true, w);

    await setSel(p, '[data-tm-add-pick="1"]', "7"); await p.waitForTimeout(300);
    w = await last(p);
    ok("adding a person sends a new membership that receives leads", w && w.kind === "member" && w.member_staff_id === 7 && w.receives_leads === true && w.is_active === true, w);
    ok("Johan is now listed", /Johan/.test(await txt(p, '[data-tm-team="1"] .tm-body') || ""));

    await setSel(p, '[data-tm-attach-pick="1"]', "sanford"); await p.waitForTimeout(300);
    w = await last(p);
    ok("attaching a development sends kind development", w && w.kind === "development" && w.property_slug === "sanford" && w.is_active === true, w);
    await click(p, '[data-tm-detach="1|stellenbosch"]'); await p.waitForTimeout(300);
    w = await last(p);
    ok("detaching sends is_active false, and the chip stays with a + to attach again",
      w && w.kind === "development" && w.property_slug === "stellenbosch" && w.is_active === false && (await count(p, '[data-tm-attach="1|stellenbosch"]')) === 1, w);

    await click(p, '[data-tm-team-off="1"]'); await p.waitForTimeout(300);
    w = await last(p);
    ok("retiring the team sends kind team, is_active false, by slug", w && w.kind === "team" && w.slug === "heartland" && w.is_active === false, w);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. a new team, and a refusal ─────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("3. a new team");
    await clickId(p, "tmNewOpen"); await p.waitForTimeout(150);
    ok("the form opens", (await count(p, "#tmNew")) === 1);
    await set(p, "tmNewName", "Pam Golding Stellenbosch"); await p.waitForTimeout(80);
    ok("the handle follows the name", (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot.getElementById("tmNewSlug").value)) === "pam-golding-stellenbosch");
    await set(p, "tmNewSlug", "Pam Golding"); await p.waitForTimeout(80);
    await clickId(p, "tmNewGo"); await p.waitForTimeout(150);
    ok("a bad handle is refused before the round trip", /lower-case/.test(await txt(p, "#tmsErr") || ""));
    ok("and nothing was sent", (await posts(p)).length === 0);
    await set(p, "tmNewSlug", "pam-golding");
    await clickId(p, "tmNewGo"); await p.waitForTimeout(400);
    const w = await last(p);
    ok("Create sends kind team with the name, the handle and internal false",
      w && w.kind === "team" && w.slug === "pam-golding" && w.name === "Pam Golding Stellenbosch" && w.is_internal === false && w.is_active === true, w);
    ok("the new team is listed and the form is gone", (await count(p, ".tm-team")) === 2 && (await count(p, "#tmNew")) === 0);

    await p.evaluate(() => { window.__TEAMS_FAILS = "Only a manager or an admin can change teams."; });
    await click(p, '[data-tm-open="2"]'); await p.waitForTimeout(150);
    await click(p, '[data-tm-team-off="2"]'); await p.waitForTimeout(300);
    ok("a refused write is shown in the block", /Only a manager/.test(await txt(p, "#tmsErr") || ""));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
