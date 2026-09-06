/* Browser tests for the 4 Sep account work: the header lockup and avatar menu, the
   Team tab, and changing your own password.

   Two of these three touch access control, so the assertions are about what reaches the
   server and who is shown which control — not about what the screen looks like. */
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

const click = (p, sel) => p.evaluate(s => {
  document.getElementById("hl-console-host").shadowRoot.querySelector(s).click();
}, sel);

const set = (p, id, value) => p.evaluate(a => {
  const r = document.getElementById("hl-console-host").shadowRoot;
  const el = r.getElementById(a.id);
  if (el.type === "checkbox") { el.checked = !!a.value; el.dispatchEvent(new Event("change")); return; }
  el.value = a.value;
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input"));
}, { id, value });

const txt = (p, sel) => p.evaluate(s => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  return e ? e.textContent.trim() : null;
}, sel);

const attr = (p, sel, a) => p.evaluate(o => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(o.s);
  return e ? e.getAttribute(o.a) : null;
}, { s: sel, a });

const hidden = (p, id) => p.evaluate(i => {
  const e = document.getElementById("hl-console-host").shadowRoot.getElementById(i);
  return e ? e.hidden : null;
}, id);

const openMenu = async p => { await click(p, "#avatarBtn"); await p.waitForTimeout(50); };

(async () => {
  const browser = await chromium.launch();
  const open = async (query) => {
    const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1280, height: 1100 } });
    const p = await ctx.newPage();
    p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
    await p.goto(FX + "/dash.html" + (query || ""));
    await p.waitForTimeout(400);
    return { ctx, p };
  };

  // ══ THE HEADER ═══════════════════════════════════════════════════════════

  // ── 1. the lockup and the avatar ─────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("1. the header");
    ok("the mark sits beside the title, not above it",
      (await p.evaluate(() => {
        const r = document.getElementById("hl-console-host").shadowRoot;
        const l = r.querySelector("header .lockup");
        const mark = l.querySelector(".lockup-mark").getBoundingClientRect();
        const h1 = l.querySelector("h1").getBoundingClientRect();
        return h1.left > mark.right && Math.abs((h1.top + h1.height / 2) - (mark.top + mark.height / 2)) < 60;
      })) === true);
    ok("and the mark got bigger than the old 22px",
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
        .querySelector("header .lockup-mark").getBoundingClientRect().width)) > 34);

    // The name is gone from the header line - it lives on the avatar now.
    const who = await txt(p, "#who");
    ok("the header line is the count alone", /^\d+ of \d+ shown$/.test(who), who);
    ok("it no longer carries the name", !/Anneke/.test(who), who);

    ok("the avatar shows two initials",
      (await txt(p, "#avatarInitials")) === "AG", await txt(p, "#avatarInitials"));
    // Hover has to answer "whose initials are these", and a screen reader has to be told.
    const title = await attr(p, "#avatarBtn", "title");
    ok("hovering names the person", /Anneke Grobler/.test(title || ""), title);
    ok("and the role rides along", /sales/.test(title || ""), title);
    ok("the accessible name is not two letters",
      /Anneke Grobler/.test(await attr(p, "#avatarBtn", "aria-label") || ""));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. one word, one letter ──────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("2. initials");
    /* Driven through the real path - change the name the endpoint returns and refresh -
       rather than by calling the helper directly, so this exercises paintIdentity as the
       console actually reaches it. */
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      window.__FIXTURE.staff.name = "Sipho";
      r.getElementById("refresh").click();
    });
    await p.waitForTimeout(300);
    ok("a single-word name gives one letter, not the same one twice",
      (await txt(p, "#avatarInitials")) === "S", await txt(p, "#avatarInitials"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. the menu ──────────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("3. the account menu");
    ok("closed to begin with", (await hidden(p, "avatarMenu")) === true);
    ok("and says so", (await attr(p, "#avatarBtn", "aria-expanded")) === "false");
    await openMenu(p);
    ok("the avatar opens it", (await hidden(p, "avatarMenu")) === false);
    ok("aria-expanded follows", (await attr(p, "#avatarBtn", "aria-expanded")) === "true");
    ok("it names the person", (await txt(p, "#umName")) === "Anneke Grobler");
    ok("and their role", (await txt(p, "#umRole")) === "sales");
    ok("sign out is in it", (await p.evaluate(() => !!document.getElementById("hl-console-host")
      .shadowRoot.querySelector("#avatarMenu #signout"))) === true);
    ok("so is settings", (await p.evaluate(() => !!document.getElementById("hl-console-host")
      .shadowRoot.querySelector("#avatarMenu [data-settings-open]"))) === true);
    ok("and the gear is gone from the header",
      (await p.evaluate(() => !document.getElementById("hl-console-host").shadowRoot
        .querySelector("header > .row > [data-settings-open]"))) === true);

    // Clicking anywhere else shuts it, or it sits over the table.
    await click(p, "#rows tr");
    await p.waitForTimeout(150);
    ok("a click elsewhere shuts it", (await hidden(p, "avatarMenu")) === true);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. appearance, nested ────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("4. appearance");
    await openMenu(p);
    ok("the nested section starts collapsed", (await hidden(p, "umScheme")) === true);
    ok("and says so", (await attr(p, "#umAppearance", "aria-expanded")) === "false");
    await click(p, "#umAppearance"); await p.waitForTimeout(60);
    ok("it opens in place", (await hidden(p, "umScheme")) === false);
    ok("aria-expanded follows", (await attr(p, "#umAppearance", "aria-expanded")) === "true");

    await click(p, '#umScheme [data-scheme-pref="dark"]');
    await p.waitForTimeout(120);
    ok("picking dark actually applies it",
      (await p.evaluate(() => document.getElementById("hl-console-host")
        .getAttribute("data-scheme"))) === "dark");
    // The whole point of nesting it here: two or three tries without reopening.
    ok("and the menu stays open", (await hidden(p, "avatarMenu")) === false);
    ok("as does the nested section", (await hidden(p, "umScheme")) === false);

    // Both switches must agree - one delegated handler syncs every [data-scheme-pref].
    const pressed = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return [].map.call(r.querySelectorAll(".schemeswitch"), sw => {
        const on = sw.querySelector('[data-scheme-pref][aria-pressed="true"]');
        return on ? on.getAttribute("data-scheme-pref") : "none";
      });
    });
    ok("there are two switches", pressed.length === 2, pressed);
    ok("and the modal's agrees with the menu's",
      pressed.every(x => x === "dark"), pressed);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 5. escape, one layer at a time ───────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("5. escape order");
    await openMenu(p);
    await click(p, "#umAppearance"); await p.waitForTimeout(60);
    await p.keyboard.press("Escape"); await p.waitForTimeout(60);
    ok("the nested section closes first", (await hidden(p, "umScheme")) === true);
    ok("and the menu is still open", (await hidden(p, "avatarMenu")) === false);
    await p.keyboard.press("Escape"); await p.waitForTimeout(60);
    ok("the second press closes the menu", (await hidden(p, "avatarMenu")) === true);
    ok("and focus goes back to the avatar",
      (await p.evaluate(() => {
        const r = document.getElementById("hl-console-host").shadowRoot;
        return r.activeElement ? r.activeElement.id : null;
      })) === "avatarBtn");

    /* Reopening always starts at the top level. Leaving the nested section expanded
       would mean the menu looks different depending on what somebody did last time,
       and the second visit is a surprise rather than the same two clicks. */
    await openMenu(p);
    await click(p, "#umAppearance"); await p.waitForTimeout(60);
    ok("the section is open again", (await hidden(p, "umScheme")) === false);
    await click(p, "#rows tr"); await p.waitForTimeout(150);
    ok("clicking away closes the menu", (await hidden(p, "avatarMenu")) === true);
    await openMenu(p);
    ok("and reopening it starts collapsed, not where it was left",
      (await hidden(p, "umScheme")) === true);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ══ THE TEAM TAB ═════════════════════════════════════════════════════════

  // ── 6. who can see it ────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("6. team tab visibility");
    ok("a salesperson is not shown the tab", (await hidden(p, "tabTeam")) === true);
    ok("and nothing was fetched for it",
      (await p.evaluate(() => window.__TEAM_CALLS)) === 0);
    await ctx.close();
  }
  {
    const { ctx, p } = await open("?role=admin");
    console.log("6b. an admin is");
    ok("the tab is shown", (await hidden(p, "tabTeam")) === false);
    // Fetched on first view, not with the pipeline - most sessions never open it.
    ok("but still not fetched until it is opened",
      (await p.evaluate(() => window.__TEAM_CALLS)) === 0);
    await click(p, "#tabTeam"); await p.waitForTimeout(300);
    ok("opening it fetches once", (await p.evaluate(() => window.__TEAM_CALLS)) === 1);
    await click(p, "#tabPipe"); await p.waitForTimeout(60);
    await click(p, "#tabTeam"); await p.waitForTimeout(200);
    ok("and going back does not fetch again",
      (await p.evaluate(() => window.__TEAM_CALLS)) === 1,
      await p.evaluate(() => window.__TEAM_CALLS));
    await ctx.close();
  }

  // ── 7. the list ──────────────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("7. the list");
    await click(p, "#tabTeam"); await p.waitForTimeout(350);
    const rows = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return [].map.call(r.querySelectorAll("#viewTeam [data-team]"), el => ({
        email: el.getAttribute("data-team"),
        name: el.querySelector(".team-name").textContent.trim(),
        role: el.querySelector(".rolechip").textContent.trim(),
        off: el.classList.contains("is-off")
      }));
    });
    ok("everyone is listed", rows.length === 3, rows.length);
    ok("including the deactivated one - accounts are never deleted",
      rows.filter(r => r.off).length === 1, rows);
    ok("and it is the right one", (rows.find(r => r.off) || {}).email === "sipho@heartland.co.za", rows);
    ok("roles are shown", rows.map(r => r.role).join(",") === "admin,manager,sales", rows.map(r => r.role));
    ok("you are marked as you", /you/.test((rows.find(r => r.email === "daniel@tovstudio.co") || {}).name || ""), rows[0]);
    ok("somebody who never signed in says so",
      /never signed in/.test(await txt(p, '#viewTeam [data-team="ana@heartland.co.za"]')));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 8. creating someone ──────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("8. creating");
    await click(p, "#tabTeam"); await p.waitForTimeout(350);

    await click(p, "#tmGo"); await p.waitForTimeout(80);
    ok("no name, no request", (await p.evaluate(() => window.__TEAM_POSTED)) === null);
    ok("and it says why", /name is required/i.test(await txt(p, "#tmErr")), await txt(p, "#tmErr"));

    await set(p, "tmName", "Thabo Dlamini");
    await set(p, "tmEmail", "not-an-email");
    await click(p, "#tmGo"); await p.waitForTimeout(80);
    ok("a bad address is refused", (await p.evaluate(() => window.__TEAM_POSTED)) === null);

    await set(p, "tmEmail", "thabo@heartland.co.za");
    await set(p, "tmPassword", "short");
    await click(p, "#tmGo"); await p.waitForTimeout(80);
    ok("so is a password under ten characters", (await p.evaluate(() => window.__TEAM_POSTED)) === null);
    ok("and it says how long", /at least 10/i.test(await txt(p, "#tmErr")), await txt(p, "#tmErr"));

    await set(p, "tmPassword", "temp-horse-battery");
    await click(p, "#tmGo"); await p.waitForTimeout(400);
    const body = await p.evaluate(() => window.__TEAM_POSTED);
    ok("now it sends", !!body, body);
    ok("with the name", body && body.name === "Thabo Dlamini", body);
    ok("the address lower-cased", body && body.email === "thabo@heartland.co.za", body);
    ok("the role", body && body.role === "manager", body);
    ok("active", body && body.is_active === true, body);
    ok("and the password", body && body.password === "temp-horse-battery", body && !!body.password);
    ok("the list picks the new person up",
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
        .querySelectorAll("#viewTeam [data-team]").length)) === 4);
    ok("and it says to hand the password over out of band",
      /out of band/.test(await txt(p, "#tmOk")), await txt(p, "#tmOk"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 9. editing someone ───────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("9. editing");
    await click(p, "#tabTeam"); await p.waitForTimeout(350);
    await click(p, '#viewTeam [data-team="ana@heartland.co.za"]'); await p.waitForTimeout(80);

    ok("the form fills with that person",
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
        .getElementById("tmName").value)) === "Ana Mokoena");
    ok("the login identity cannot be edited",
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
        .getElementById("tmEmail").disabled)) === true);
    ok("the password field is empty, not prefilled with anything",
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
        .getElementById("tmPassword").value)) === "");
    ok("and it says blank keeps theirs",
      /Leave it blank/.test(await txt(p, "#viewTeam")));

    await set(p, "tmRole", "admin");
    await click(p, "#tmGo"); await p.waitForTimeout(400);
    const body = await p.evaluate(() => window.__TEAM_POSTED);
    ok("the change is sent", body && body.role === "admin", body);
    // The half that matters: an update with no password must not carry one, or it would
    // silently reset a password the person had already changed themselves.
    ok("and no password rides along", body && !("password" in body), body);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 10. you cannot lock yourself out ─────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("10. self-lockout");
    await click(p, "#tabTeam"); await p.waitForTimeout(350);
    await click(p, '#viewTeam [data-team="daniel@tovstudio.co"]'); await p.waitForTimeout(80);

    await set(p, "tmRole", "sales");
    await click(p, "#tmGo"); await p.waitForTimeout(120);
    ok("demoting yourself sends nothing", (await p.evaluate(() => window.__TEAM_POSTED)) === null);
    ok("and explains why", /nobody left/i.test(await txt(p, "#tmErr")), await txt(p, "#tmErr"));

    await set(p, "tmRole", "admin");
    await set(p, "tmActive", false);
    await click(p, "#tmGo"); await p.waitForTimeout(120);
    ok("switching off your own access sends nothing too",
      (await p.evaluate(() => window.__TEAM_POSTED)) === null);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 11. deactivating someone else asks first ─────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("11. deactivating");
    await click(p, "#tabTeam"); await p.waitForTimeout(350);
    await click(p, '#viewTeam [data-team="ana@heartland.co.za"]'); await p.waitForTimeout(80);
    await set(p, "tmActive", false);

    p.once("dialog", d => d.dismiss());
    await click(p, "#tmGo"); await p.waitForTimeout(200);
    ok("a dismissed confirm sends nothing", (await p.evaluate(() => window.__TEAM_POSTED)) === null);

    p.once("dialog", d => d.accept());
    await click(p, "#tmGo"); await p.waitForTimeout(400);
    const body = await p.evaluate(() => window.__TEAM_POSTED);
    ok("accepting sends it", body && body.is_active === false, body);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ══ YOUR OWN PASSWORD ════════════════════════════════════════════════════

  // ── 12. the gates ────────────────────────────────────────────────────────
  {
    const { ctx, p } = await open();
    console.log("12. changing your password");
    await openMenu(p);
    await click(p, "#avatarMenu [data-settings-open]"); await p.waitForTimeout(120);
    ok("the modal opened from the menu",
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
        .getElementById("settings").classList.contains("open"))) === true);
    ok("and the menu shut behind it", (await hidden(p, "avatarMenu")) === true);

    await click(p, "#pwGo"); await p.waitForTimeout(60);
    ok("nothing without the current one", (await p.evaluate(() => window.__PW_POSTED)) === null);

    await set(p, "pwCurrent", "correct-horse");
    await set(p, "pwNew", "short");
    await set(p, "pwAgain", "short");
    await click(p, "#pwGo"); await p.waitForTimeout(60);
    ok("a short new password is refused here, before the request",
      (await p.evaluate(() => window.__PW_POSTED)) === null);

    await set(p, "pwNew", "a-long-enough-one");
    await set(p, "pwAgain", "a-long-enough-typo");
    await click(p, "#pwGo"); await p.waitForTimeout(60);
    // The confirmation is checked in the browser because the server cannot tell a typo
    // from a deliberate change, and there is no self-service reset behind this.
    ok("a mistyped confirmation is caught before it locks anyone out",
      (await p.evaluate(() => window.__PW_POSTED)) === null);
    ok("and says so", /do not match/i.test(await txt(p, "#pwErr")), await txt(p, "#pwErr"));

    await set(p, "pwAgain", "a-long-enough-one");
    await click(p, "#pwGo"); await p.waitForTimeout(400);
    const body = await p.evaluate(() => window.__PW_POSTED);
    ok("now it sends", !!body, body);
    ok("carrying both", body && body.current_password === "correct-horse" &&
      body.new_password === "a-long-enough-one", body);
    ok("it says what to do next", /next time you sign in/i.test(await txt(p, "#pwOk")), await txt(p, "#pwOk"));
    // Cleared so a screen somebody walked away from gives nothing up.
    const left = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return [r.getElementById("pwCurrent").value, r.getElementById("pwNew").value,
              r.getElementById("pwAgain").value].join("|");
    });
    ok("and the fields are emptied", left === "||", left);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 13. a wrong current password is the server's answer, shown plainly ───
  {
    const { ctx, p } = await open();
    console.log("13. wrong current password");
    await openMenu(p);
    await click(p, "#avatarMenu [data-settings-open]"); await p.waitForTimeout(120);
    await set(p, "pwCurrent", "not-my-password");
    await set(p, "pwNew", "a-long-enough-one");
    await set(p, "pwAgain", "a-long-enough-one");
    await click(p, "#pwGo"); await p.waitForTimeout(400);
    ok("the refusal is shown", /not your current password/i.test(await txt(p, "#pwErr")),
      await txt(p, "#pwErr"));
    ok("and the fields are NOT cleared, so they can try again",
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
        .getElementById("pwNew").value)) === "a-long-enough-one");
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
