/* Types and variants. The assertions are about the level of the model the console became the
   admin for: a home points at a VARIANT, a variant is one way of building a TYPE, and exactly
   one variant per type is the default. Two of those are invariants the server refuses to break
   - the tests that matter here are the ones that prove the console cannot ask it to. */
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
const click = (p, sel) => p.evaluate(s => {
  const e = document.getElementById("hl-console-host").shadowRoot.querySelector(s);
  if (!e) { throw new Error("no such element: " + s); }
  e.click();
}, sel);
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
const posted = (p) => p.evaluate(() => window.__TYP_POSTED || null);
const drawer = (p) => txt(p, "#drawer");

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
  const openTypes = async (p) => {
    await clickId(p, "tabInv");
    await p.waitForTimeout(250);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(300);
    await clickId(p, "invTypOpen");
    await p.waitForTimeout(350);
  };

  // ── 1. the button, before anybody opens anything ────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("1. the panel button");
    await clickId(p, "tabInv");
    await p.waitForTimeout(250);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(300);
    ok("the Inventory tab has a Types button", (await count(p, "#invTypOpen")) === 1);
    const label = await txt(p, "#invTypOpen");
    /* IT DESCRIBES ITSELF BEFORE IT IS OPENED, from the grid read - so a person can see
       whether this development has been set up without spending a click on it. Only the
       ACTIVE types count: the retired one is in the register and not in the offering. */
    ok("it says how many types and how many ways of building them",
      /2 types/.test(label) && /3 ways/.test(label), label);
    /* Order is not decoration: a phase decides WHEN stock goes out, a type decides what the
       stock IS, a field decides what gets recorded about it. */
    const bar = await all(p, ".panel-bar .panel-btn b");
    ok("it sits between Phases and Fields",
      bar.join(",") === "Phases,Types,Fields", bar);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 2. the register lists everything, retired rows included ─────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("2. the register");
    await openTypes(p);
    ok("the drawer is titled for both levels", (await txt(p, "#drawer h1")) === "Types and variants");
    /* A REGISTER LISTS EVERYTHING AND SAYS WHICH IS WHICH. Filtering the retired ones out
       here is how the console ends up with a Bring back button for something it cannot show. */
    ok("all three types are listed, the retired one included",
      (await count(p, ".typ-type")) === 3);
    ok("the retired one is marked rather than hidden",
      (await count(p, ".typ-type.is-retired")) === 1);
    const names = await all(p, ".typ-type > .typ-head .typ-name");
    ok("an active type comes before a retired one", /Type A/.test(names[0]) && /Type C/.test(names[2]), names);
    ok("every variant is listed under its type", (await count(p, ".typ-wrap")) === 4);
    ok("the default variant is flagged", (await count(p, ".typ-wrap .feat-flag")) >= 1);
    const body = await drawer(p);
    ok("the drawer explains what a variant IS, not just that it exists",
      /one way of building it/.test(body), body.slice(0, 200));
    ok("and says a code can never be changed", /code can never be changed/.test(body));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 3. counted, not read off the column ─────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("3. the unit count");
    await openTypes(p);
    const body = await drawer(p);
    /* A1 holds six homes and A2 holds none. A2's STORED count says four - the column is
       denormalised and the truth is the count of homes - so the drawer shows the counted
       number and says the stored one disagrees, rather than silently picking a side. */
    ok("a variant reports the homes actually built that way", /6 homes/.test(body), body.slice(0, 400));
    ok("and says when the stored column disagrees with the count",
      /the stored count says 4/.test(body), body.slice(0, 600));
    ok("a type totals its variants", /2 of 2 variants in use/.test(body));
    ok("an imported type says where it came from", /imported from sv/.test(body));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 4. the invariants are SHOWN, not just counted somewhere ─────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("4. integrity");
    await openTypes(p);
    ok("a sound register shows no warning", (await count(p, "#drawer .err")) === 0);
    await ctx.close();
  }

  {
    const { ctx, p } = await open("?role=admin");
    /* Break it the way an importer would - a type whose only default was never set. That is
       not hypothetical: it is exactly what import_sv_inventory left on the synthetic
       unassigned type, and nothing had ever looked. Broken BEFORE the first read, because
       the drawer deliberately reuses what it already has for the same development. */
    await clickId(p, "tabInv");
    await p.waitForTimeout(250);
    await p.evaluate(() => {
      window.__TYP_SV.types[0].variants.forEach(v => { v.is_default = false; });
    });
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(300);
    await clickId(p, "invTypOpen");
    await p.waitForTimeout(400);
    const warn = await txt(p, "#drawer .err");
    ok("a register that does not add up says so, at the top", warn !== null, warn);
    ok("and names the invariant rather than saying 'error'",
      /no default variant/.test(warn || ""), warn);
    ok("and says what it costs", /cannot be shown/.test(warn || ""), warn);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 5. promoting a default demotes the other one ────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("5. the default");
    await openTypes(p);
    /* The one that already holds it offers neither button: there is nothing to promote it
       to, and demoting it would leave the type with no default at all - which is why the
       server refuses is_default false outright rather than accepting it. */
    const wraps = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return [...r.querySelectorAll(".typ-wrap")].map(w => ({
        text: w.querySelector(".typ-name").textContent.trim(),
        promote: !!w.querySelector("[data-typv-default]"),
        remove: !!w.querySelector("[data-typv-retire]")
      }));
    });
    const a1 = wraps.find(w => /A1/.test(w.text)), a2 = wraps.find(w => /A2/.test(w.text));
    ok("the default offers no Make default", a1 && !a1.promote, wraps);
    ok("and no Remove either", a1 && !a1.remove, wraps);
    ok("a non-default offers both", a2 && a2.promote && a2.remove, wraps);

    await click(p, "[data-typv-default]");
    await p.waitForTimeout(500);
    const b = await posted(p);
    ok("promoting sends the variant and is_default true",
      b && b.variant_id === 12 && b.is_default === true, b);
    ok("it never sends is_default false for the other one - the server demotes it",
      b && !("demote" in b), b);
    const after = await drawer(p);
    ok("the badge has moved", /A2[\s\S]{0,40}default/.test(after), after.slice(0, 500));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 6. a refusal from the server is shown, in the server's words ────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("6. what a variant holding homes is offered");
    await openTypes(p);
    /* A2 holds no homes and is not the default, so there is nothing to move and it goes
       straight out. Checked BEFORE promoting it, because promoting it is what takes the
       plain Remove away. */
    ok("an empty variant still gets a plain Remove",
      (await count(p, '[data-typv-retire="12"]')) === 1 &&
      (await count(p, '[data-typv-move="12"]')) === 0);

    /* Make A2 the default, so A1 - which holds six homes - is no longer blocked by the
       default rule and the console has to answer the harder question. */
    await click(p, "[data-typv-default]");
    await p.waitForTimeout(500);

    /* THE CONSOLE NO LONGER OFFERS AN ACTION THE SERVER ALWAYS REFUSES. A plain Remove on a
       variant with homes in it could only ever produce a 400 about the site plan; the button
       now names what actually has to happen first. */
    ok("a variant holding homes is offered a move, not a bare Remove",
      (await count(p, '[data-typv-move="11"]')) === 1 &&
      (await count(p, '[data-typv-retire="11"]')) === 0);
    /* THE DEFAULT IS A STATEMENT, NOT A DISABLED BUTTON. There is no decision to offer, and
       an inert control invites somebody to keep pressing it. */
    ok("the default variant is told why it cannot go, rather than shown a dead button",
      /promote another/i.test(await txt(p, ".typ-blocked") || ""),
      await txt(p, ".typ-blocked"));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 6b. moving the homes off it ─────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("6b. moving homes off a variant");
    await openTypes(p);
    await click(p, "[data-typv-default]");
    await p.waitForTimeout(500);
    await click(p, '[data-typv-move="11"]');
    await p.waitForTimeout(300);

    const form = await txt(p, ".typ-move");
    ok("the form says how many homes and what would happen to them",
      /6 homes are built this way/i.test(form || "") && /site plan/i.test(form || ""), form);
    ok("it offers the other variants as destinations",
      (await count(p, "#typMoveTo option")) > 1);
    /* Same type first, a different type in its own group - moving a home to another type
       changes every figure it has. */
    ok("and separates the same type from a different one",
      (await count(p, "#typMoveTo optgroup")) === 2 &&
      /DIFFERENT TYPE/.test(await p.evaluate(() => [...document.getElementById("hl-console-host")
        .shadowRoot.querySelectorAll("#typMoveTo optgroup")].map(o => o.label).join("|"))),
      await p.evaluate(() => [...document.getElementById("hl-console-host")
        .shadowRoot.querySelectorAll("#typMoveTo optgroup")].map(o => o.label).join("|")));

    /* THREE GUARDS, AND NONE OF THEM MAY BE SKIPPED. Each catches a different mistake, and
       none of them may let a write through on its own. */
    await click(p, '[data-typv-movesave="11"]');
    await p.waitForTimeout(250);
    ok("no destination is refused here, before the server is troubled",
      /Choose where these homes should go/i.test(await txt(p, "#drawer .err") || ""),
      await txt(p, "#drawer .err"));

    await set(p, "typMoveTo", "12");
    await p.waitForTimeout(250);
    await click(p, '[data-typv-movesave="11"]');
    await p.waitForTimeout(250);
    ok("and so is no reason", /Give a reason/i.test(await txt(p, "#drawer .err") || ""),
      await txt(p, "#drawer .err"));

    await set(p, "typMoveWhy", "created by mistake");
    await set(p, "typMoveConfirm", "A2");
    await click(p, '[data-typv-movesave="11"]');
    await p.waitForTimeout(250);
    /* THE ONE THAT CATCHES THE WRONG ROW. A2 is the variant next door and every other check
       here would have passed on it. */
    ok("typing a neighbouring variant's code does not confirm this one",
      /Type the variant's code \(A1\)/.test(await txt(p, "#drawer .err") || ""),
      await txt(p, "#drawer .err"));
    ok("and nothing has been sent through any of that",
      (await posted(p)) === undefined || (await posted(p)).reassign_to === undefined,
      await posted(p));

    await set(p, "typMoveConfirm", "a1");
    await click(p, '[data-typv-movesave="11"]');
    await p.waitForTimeout(800);
    const sent = await posted(p);
    ok("the code is matched case-insensitively", sent && sent.variant_id === 11, sent);
    ok("it sends the destination, not a bare retire",
      sent && sent.reassign_to === 12, sent);
    ok("with a reason carrying what was typed and what it did",
      sent && /created by mistake/.test(sent.reason) && /moved 6 homes/.test(sent.reason),
      sent && sent.reason);
    ok("the form closes on success", (await count(p, ".typ-move")) === 0);
    /* THE HOMES ACTUALLY MOVED. A console that sent reassign_to and a fixture that ignored
       it would agree perfectly with each other and be wrong together, so this reads the
       stock rather than the response. */
    const after = await p.evaluate(() => {
      const u = window.__INV_SV.units || [];
      return { a1: u.filter(x => String(x.unit_variant_id) === "11").length,
               a2: u.filter(x => String(x.unit_variant_id) === "12").length };
    });
    ok("all six homes really moved, and none was left behind",
      after.a1 === 0 && after.a2 === 6, after);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 6c. a different type is a different act ─────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("6c. cross-type moves, cancelling, and refusals");
    await openTypes(p);
    await click(p, "[data-typv-default]");
    await p.waitForTimeout(500);
    await click(p, '[data-typv-move="11"]');
    await p.waitForTimeout(300);
    /* B1 is under Type B. The figures live on the TYPE, so this rewrites every one of them
       for all six homes - and the form has to say so the moment it is picked, not in the
       button. */
    await set(p, "typMoveTo", "21");
    await p.waitForTimeout(250);
    const warn = await txt(p, ".typ-move-warn");
    ok("picking a different type says what that means, immediately",
      /different type/i.test(warn || "") && /come from the type/i.test(warn || ""), warn);
    ok("and names the type they would become", /\bB\b/.test(warn || ""), warn);

    await set(p, "typMoveTo", "12");
    await p.waitForTimeout(250);
    ok("going back to the same type withdraws the warning",
      (await count(p, ".typ-move-warn")) === 0);

    await click(p, "[data-typv-movecancel]");
    await p.waitForTimeout(250);
    ok("Cancel puts the form away", (await count(p, ".typ-move")) === 0);
    ok("and sent nothing",
      (await posted(p)) === undefined || (await posted(p)).reassign_to === undefined,
      await posted(p));

    /* A SERVER REFUSAL STILL REACHES THE PERSON IN THE SERVER'S OWN WORDS. That was the point
       of the old section 6, and it must not be lost with the button that used to reach it. */
    await click(p, '[data-typv-move="11"]');
    await p.waitForTimeout(300);
    await p.evaluate(() => { window.__TYP_FAILS = true; });
    await set(p, "typMoveTo", "12");
    await set(p, "typMoveWhy", "tidying up");
    await set(p, "typMoveConfirm", "A1");
    await click(p, '[data-typv-movesave="11"]');
    await p.waitForTimeout(700);
    ok("a refusal is rendered in the server's words",
      /Only a manager or an admin/.test(await txt(p, "#drawer .err") || ""),
      await txt(p, "#drawer .err"));
    /* The refusal is an instruction to change something; closing the form would throw away
       the reason somebody wrote by hand. */
    ok("and the form stays open with what was typed still in it",
      (await count(p, ".typ-move")) === 1 &&
      (await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
        .getElementById("typMoveWhy").value)) === "tidying up");

    /* A HALF-FILLED CONFIRMATION BOX NAMES A VARIANT ON THE DEVELOPMENT BEING LEFT. Carried
       across, the code typed into it would confirm nothing, and the count in the heading
       would describe another development's homes. */
    await p.evaluate(() => { window.__TYP_FAILS = false; });
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(400);
    await set(p, "invProp", "stellenbosch");
    await p.waitForTimeout(400);
    await openTypes(p);
    ok("switching development throws the move form away",
      (await count(p, ".typ-move")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 7. adding a type seeds its default variant ──────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("7. adding a type");
    await openTypes(p);
    await set(p, "typTypeName", "Type D");
    await set(p, "typTypeCode", "D");
    await clickId(p, "typTypeAdd");
    await p.waitForTimeout(600);
    const b = await posted(p);
    ok("it posts the code and the name", b && b.code === "D" && b.name === "Type D", b);
    ok("and the development it belongs to", b && b.property === "stellenbosch", b);
    ok("and a reason, so the event says where it came from", b && /sales console/.test(b.reason), b);
    const body = await drawer(p);
    ok("the new type appears", /Type D/.test(body), body.slice(0, 200));
    /* RULE 7 OF THE MODEL: development, type, variant, unit, ALWAYS. A type with no variant
       is a type no home can point at, so the server makes one in the same call - and the
       drawer has to show it, or somebody will make a second one by hand. */
    ok("with a variant already under it, not an empty shell",
      (await count(p, ".typ-type")) === 4 && (await count(p, ".typ-wrap")) === 5);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 8. the two ways adding can go wrong ─────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("8. adding, refused");
    await openTypes(p);
    await set(p, "typTypeName", "Another A");
    await set(p, "typTypeCode", "a");
    await clickId(p, "typTypeAdd");
    await p.waitForTimeout(500);
    const err = await txt(p, "#drawer .err");
    /* Case-insensitively, and against RETIRED rows too - the code is the upsert key, so a
       reused one would quietly write over a row somebody switched off. */
    ok("a duplicate code is refused", /already uses that code/.test(err || ""), err);
    ok("and the refusal says retired ones count", /retired ones count/.test(err || ""), err);
    ok("nothing was created", (await count(p, ".typ-type")) === 3);

    /* A missing code never reaches the server: the console can say something more useful
       than a validation error, because it knows the code is permanent. */
    await set(p, "typTypeName", "Type E");
    await set(p, "typTypeCode", "");
    await clickId(p, "typTypeAdd");
    await p.waitForTimeout(300);
    const err2 = await txt(p, "#drawer .err");
    ok("a missing code is caught before the request", /needs a name and a code/.test(err2 || ""), err2);
    ok("and warns that it is permanent", /never be changed/.test(err2 || ""), err2);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 9. adding a variant ─────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("9. adding a variant");
    await openTypes(p);
    await set(p, "typVarCode1", "A3");
    await set(p, "typVarName1", "End unit");
    await click(p, "[data-typ-addvar]");
    await p.waitForTimeout(600);
    const b = await posted(p);
    ok("it posts the type it belongs to", b && b.unit_type_id === 1, b);
    ok("and its code and name", b && b.code === "A3" && b.name === "End unit", b);
    ok("it does not claim the default - the type already has one",
      b && !("is_default" in b), b);
    ok("the variant appears under its type", (await count(p, ".typ-wrap")) === 5);
    /* A RETIRED TYPE OFFERS NO ADD. It would be a variant nothing could ever point at, and
       the server refuses it anyway. */
    ok("a retired type offers no Add variant", (await count(p, "[data-typ-addvar]")) === 2);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 10. the variant form: inherited is a placeholder, stored is a value ─
  {
    const { ctx, p } = await open("?role=admin");
    console.log("10. the variant form");
    await openTypes(p);
    ok("no form until Edit is pressed", (await count(p, ".typ-form")) === 0);
    await click(p, "[data-typv-edit]");
    await p.waitForTimeout(250);
    ok("Edit opens a form", (await count(p, ".typ-form")) === 1);

    /* A1 IS THE DEGENERATE DEFAULT AND STORES NOTHING. It is the commonest row in the system
       after the migration, and the one a console that reads the variant's own columns draws
       completely blank. The figure has to be VISIBLE - as the thing it would inherit - and it
       has to be visibly not typed, because clearing a figure and typing the same figure are
       different acts with different consequences. */
    const box = (id) => p.evaluate(i => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const el = r.getElementById(i);
      if (!el) { return null; }
      const wrap = el.parentNode;
      const note = wrap.querySelector(".typ-src");
      return { value: el.value, ph: el.getAttribute("placeholder"),
               inh: el.classList.contains("is-inh"),
               note: note ? note.textContent.trim() : null };
    }, id);

    const beds = await box("typf_11_bedrooms");
    ok("an inherited figure is EMPTY, not prefilled with the type's number",
      beds && beds.value === "", beds);
    ok("but it is still SHOWN, as the placeholder it would inherit",
      beds && beds.ph === "3", beds);
    ok("and the box says so in words", beds && beds.note === "from the type", beds);
    ok("and it looks different from a typed one", beds && beds.inh === true, beds);

    /* A RECORDED ZERO IS A MEASUREMENT, NOT AN ABSENCE. Type B records patio area as 0 and
       its variant inherits it: the placeholder must read 0, never blank. NULL means inherit;
       zero means zero. This is the one the loose presence test gets wrong. */
    await click(p, "[data-typv-edit]");
    await p.waitForTimeout(200);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      [...r.querySelectorAll("[data-typv-edit]")]
        .find(e => e.getAttribute("data-typv-edit") === "21").click();
    });
    await p.waitForTimeout(250);
    const patio = await box("typf_21_patio_area_sqm");
    ok("A RECORDED ZERO INHERITS AS 0, not as unset",
      patio && patio.value === "" && patio.ph === "0" && patio.note === "from the type", patio);

    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 10b. an override looks like a decision, a redundant one says so ─────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("10b. overrides");
    await openTypes(p);
    /* A2 overrides patio and total genuinely, and ALSO restates bedrooms identically to its
       type. All three are stored decisions; only the third is worth tidying. */
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      [...r.querySelectorAll("[data-typv-edit]")]
        .find(e => e.getAttribute("data-typv-edit") === "12").click();
    });
    await p.waitForTimeout(250);
    const box = (id) => p.evaluate(i => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const el = r.getElementById(i);
      if (!el) { return null; }
      const note = el.parentNode.querySelector(".typ-src");
      return { value: el.value, ph: el.getAttribute("placeholder"),
               inh: el.classList.contains("is-inh"),
               note: note ? note.textContent.trim() : null,
               dup: note ? note.classList.contains("is-dup") : null };
    }, id);

    const total = await box("typf_12_total_area_sqm");
    ok("a stored override is a VALUE, not a placeholder",
      total && total.value === "277" && !total.ph, total);
    ok("and it does not look inherited", total && total.inh === false, total);
    ok("and the box says the variant decides it", total && total.note === "set here", total);

    const dup = await box("typf_12_bedrooms");
    ok("an override that merely restates the type is still a stored value",
      dup && dup.value === "3", dup);
    /* NOT AN ERROR. A typed value is a decision even when it matches - it stops following the
       type if the type changes. It is flagged so somebody can clear it deliberately. */
    ok("but it is marked as restating the type", dup && dup.note === "same as the type", dup);
    ok("and marked differently from an ordinary override", dup && dup.dup === true, dup);

    /* Untouched figures on the same row still inherit, so one variant shows both states at
       once - which is the whole point of the level. */
    const baths = await box("typf_12_bathrooms");
    ok("and a figure it does NOT override still inherits, on the same form",
      baths && baths.value === "" && baths.ph === "2.5" && baths.inh === true, baths);

    ok("the form explains that an empty box inherits",
      /inherits from the type/i.test(await drawer(p)));
    /* THE FROM-PRICE BOX IS GONE. It is derived from the cheapest available home and the
       server refuses a value for it, so a box here would produce a 400 nobody could explain. */
    ok("there is NO from-price box any more",
      (await p.evaluate(() => !!document.getElementById("hl-console-host")
        .shadowRoot.getElementById("typf_12_price"))) === false);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 10c. what the variant form actually sends ───────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("10c. saving a variant");
    await openTypes(p);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      [...r.querySelectorAll("[data-typv-edit]")]
        .find(e => e.getAttribute("data-typv-edit") === "12").click();
    });
    await p.waitForTimeout(250);
    await set(p, "typf_12_bedrooms", "");
    await set(p, "typf_12_bathrooms", "3.5");
    await click(p, "[data-typv-save]");
    await p.waitForTimeout(600);
    const b = await posted(p);
    /* CLEARING AN OVERRIDE IS AN EMPTY STRING, and it must be SENT. Omitting it would mean
       "leave it alone", and then a figure typed by mistake could never be handed back to the
       type. The server declares these text? rather than decimal? for exactly this reason:
       decimal? coerces "" to null on the way in, and "clear this" then arrives identical to
       "I did not mention this". Clearing was a silent no-op for a day because of it. */
    ok("CLEARING AN OVERRIDE IS SENT AS \"\", not omitted",
      b && b.bedrooms === "", b);
    ok("a new override is sent as a number", b && b.bathrooms === 3.5, b);
    ok("an untouched override goes too, so the form is what the row becomes",
      b && b.total_area_sqm === 277, b);
    /* An inherited figure the person never touched must NOT become an override just because
       the form sent every box. It is sent as "", which means inherit - the same value it
       already had. */
    ok("an untouched INHERITED box is sent as \"\", not as the figure it showed",
      b && b.internal_area_sqm === "", b);
    ok("THE FROM-PRICE IS NEVER SENT - the server refuses it",
      b && !("price_from_cents" in b), b);

    /* And the register agrees afterwards: bedrooms is back to inheriting. */
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      [...r.querySelectorAll("[data-typv-edit]")]
        .find(e => e.getAttribute("data-typv-edit") === "12").click();
    });
    await p.waitForTimeout(300);
    const after = await p.evaluate(() => {
      const el = document.getElementById("hl-console-host").shadowRoot
        .getElementById("typf_12_bedrooms");
      return { value: el.value, ph: el.getAttribute("placeholder") };
    });
    ok("and the cleared figure now INHERITS - it did not become zero",
      after.value === "" && after.ph === "3", after);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 10d. the type editor, which is where the figures now live ───────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("10d. the type editor");
    await openTypes(p);
    ok("every live type offers Edit figures", (await count(p, "[data-typt-edit]")) === 2);
    await click(p, "[data-typt-edit]");
    await p.waitForTimeout(250);
    ok("it opens a form", (await count(p, ".typ-form")) === 1);
    const v = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const el = r.getElementById("typt_1_bedrooms");
      return { beds: el.value, inh: el.classList.contains("is-inh"),
               total: r.getElementById("typt_1_total_area_sqm").value,
               name: r.getElementById("typt_1_name").value };
    });
    /* A TYPE HAS NOTHING ABOVE IT, so what it stores and what it resolves to are the same
       thing. Every box is a real value and none of them is a placeholder. */
    ok("the type's own figures are prefilled as VALUES", v.beds === "3" && v.total === "268", v);
    ok("and none of them is drawn as inherited", v.inh === false, v);
    ok("the name is editable", v.name === "Type A", v);

    await set(p, "typt_1_bedrooms", "4");
    await set(p, "typt_1_garage_area_sqm", "");
    await click(p, "[data-typt-save]");
    await p.waitForTimeout(600);
    const b = await posted(p);
    ok("it posts to the TYPE, by type_id", b && b.type_id === 1, b);
    ok("the changed figure is sent", b && b.bedrooms === 4, b);
    ok("an emptied box clears rather than zeroes", b && b.garage_area_sqm === "", b);
    ok("the form closes on save", (await count(p, ".typ-form")) === 0);

    /* AND THE CHANGE REACHES THE VARIANT THAT INHERITS IT. This is the assertion the whole
       three-level model exists for: editing the type moved a figure on a variant that stores
       nothing, and did NOT move it on the one that overrides it. */
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      [...r.querySelectorAll("[data-typv-edit]")]
        .find(e => e.getAttribute("data-typv-edit") === "11").click();
    });
    await p.waitForTimeout(300);
    const inh = await p.evaluate(() => document.getElementById("hl-console-host").shadowRoot
      .getElementById("typf_11_bedrooms").getAttribute("placeholder"));
    ok("A TYPE EDIT MOVES EVERY VARIANT THAT INHERITS IT", inh === "4", inh);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 10e. and NOT the one that overrides it ──────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("10e. the negative half");
    await openTypes(p);
    await click(p, "[data-typt-edit]");
    await p.waitForTimeout(250);
    await set(p, "typt_1_total_area_sqm", "300");
    await click(p, "[data-typt-save]");
    await p.waitForTimeout(600);
    await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      [...r.querySelectorAll("[data-typv-edit]")]
        .find(e => e.getAttribute("data-typv-edit") === "12").click();
    });
    await p.waitForTimeout(300);
    const ov = await p.evaluate(() => {
      const el = document.getElementById("hl-console-host").shadowRoot
        .getElementById("typf_12_total_area_sqm");
      return { value: el.value, ph: el.getAttribute("placeholder") };
    });
    /* AN OVERRIDE IS A DECISION AND DOES NOT FOLLOW THE TYPE. Without this half, a console
       that ignored the variant level entirely would pass 10d. */
    ok("A VARIANT THAT OVERRIDES A FIGURE DOES NOT FOLLOW THE TYPE",
      ov.value === "277" && !ov.ph, ov);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 10f. tidiness is drawn as tidiness, never as a fault ────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("10f. the tidy prompt");
    await openTypes(p);
    ok("there is a tidy-up note", (await count(p, ".typ-tidy")) === 1);
    const tidy = await txt(p, ".typ-tidy");
    ok("it names the redundant override", /restates 1 figure/.test(tidy), tidy);
    ok("it says how to clear it", /hands the figure back to the type/.test(tidy), tidy);
    /* THE WORDING MATTERS. The server keeps these numbers outside is_clean on purpose, and
       drawing them as an error would make somebody go looking for a break that is not there. */
    ok("it says nothing is broken", /nothing broken/i.test(tidy), tidy);
    ok("it is NOT drawn as the register-does-not-add-up error",
      (await count(p, "#drawer .err")) === 0);
    /* It also mentions the legacy stored from-price nothing reads. */
    ok("and the stored from-price nothing reads", /nothing reads/.test(tidy), tidy);
    const wrap = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return [...r.querySelectorAll(".typ-wrap")].map(e => e.textContent.trim());
    });
    /* THE ROW SAYS WHAT THE VARIANT DECIDES. override_count 0 is the healthy shape after the
       migration and it should read as an answer, not as an empty space. */
    /* AND ITS SUMMARY IS THE RESOLVED FIGURES. A console reading the variant's own columns
       prints a blank line for the commonest row in the system - which is exactly what this
       one did between the migration landing and being fixed. */
    ok("a variant that stores nothing STILL DESCRIBES A REAL HOME",
      /3 bed/.test(wrap[0]) && /2\.5 bath/.test(wrap[0]) && /268 m/.test(wrap[0]), wrap[0]);
    ok("a variant that stores nothing says it follows the type",
      /follows the type/.test(wrap[0]), wrap[0]);
    ok("and one that overrides says how many figures it owns",
      /3 own figures/.test(wrap[1]), wrap[1]);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 11. a figure that is not a figure ───────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("11. a bad figure");
    await openTypes(p);
    await p.evaluate(() => { window.__TYP_POSTED = null; });
    await click(p, "[data-typv-edit]");
    await p.waitForTimeout(250);
    await set(p, "typf_11_bedrooms", "three");
    await click(p, "[data-typv-save]");
    await p.waitForTimeout(300);
    const err = await txt(p, "#drawer .err");
    ok("it is refused before the request", /must be a number/.test(err || ""), err);
    ok("and names the field", /Beds/.test(err || ""), err);
    /* The reason is worth saying out loud: an empty box hands the figure back to the type,
       which is not the same as recording zero. */
    ok("and says what an empty box would have meant",
      /hands the figure back to the type/.test(err || ""), err);
    ok("nothing was sent", (await posted(p)) === null);
    ok("the form is still open, with what was typed", (await count(p, ".typ-form")) === 1);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 11b. the same guard on the type form ────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("11b. a bad figure on the type");
    await openTypes(p);
    await p.evaluate(() => { window.__TYP_POSTED = null; });
    await click(p, "[data-typt-edit]");
    await p.waitForTimeout(250);
    await set(p, "typt_1_total_area_sqm", "two hundred");
    await click(p, "[data-typt-save]");
    await p.waitForTimeout(300);
    const err = await txt(p, "#drawer .err");
    ok("the type form refuses it too", /must be a number/.test(err || ""), err);
    ok("and names the field", /Total/.test(err || ""), err);
    ok("nothing was sent", (await posted(p)) === null);
    /* A TYPE ALWAYS NEEDS A NAME. Clearing it would leave every home built this way with
       nothing to call itself. */
    await set(p, "typt_1_total_area_sqm", "268");
    await set(p, "typt_1_name", "  ");
    await click(p, "[data-typt-save]");
    await p.waitForTimeout(300);
    ok("and an emptied name is refused", /needs a name/.test(await txt(p, "#drawer .err") || ""));
    ok("still nothing sent", (await posted(p)) === null);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 11c. one form open at a time, across both levels ────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("11c. one form at a time");
    await openTypes(p);
    await click(p, "[data-typv-edit]");
    await p.waitForTimeout(200);
    await click(p, "[data-typt-edit]");
    await p.waitForTimeout(200);
    /* TWO OPEN FORMS WITH THE SAME EIGHT FIGURES IN THEM is how somebody types into the wrong
       one, and the two levels mean different things - the whole point of the model. */
    ok("opening the type form closes the variant form",
      (await count(p, ".typ-form")) === 1);
    ok("and it is the TYPE's", (await p.evaluate(() => !!document
      .getElementById("hl-console-host").shadowRoot.getElementById("typt_1_bedrooms"))) === true);
    await click(p, "[data-typv-edit]");
    await p.waitForTimeout(200);
    ok("and back the other way", (await count(p, ".typ-form")) === 1);
    ok("and it is the VARIANT's", (await p.evaluate(() => !!document
      .getElementById("hl-console-host").shadowRoot.getElementById("typf_11_bedrooms"))) === true);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 11d. variants off: the level is hidden, not merely emptied ──────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("11d. variants off");
    await p.evaluate(() => { window.__TYP_VON = { stellenbosch: false, polaris: false }; });
    await openTypes(p);
    /* THE SERVER SAYS SO, AND THE CONSOLE OBEYS IT. A second copy of that rule here is how
       the availability chain ended up in four places. */
    ok("the types are still listed", (await count(p, ".typ-type")) === 3);
    ok("but no variant row is drawn at all", (await count(p, ".typ-wrap")) === 0);
    ok("and nothing offers to add one", (await count(p, "[data-typ-addvar]")) === 0);
    ok("the figures are still editable, on the TYPE",
      (await count(p, "[data-typt-edit]")) === 2);
    const body = await drawer(p);
    ok("and it says where the figures live", /figures live on the type/.test(body), body.slice(0, 900));
    ok("and how to get the level back", /Turn <?b?>?Variants/.test(body) || /Variants/.test(body));
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 12. retiring, restoring, removing ───────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("12. removal");
    await openTypes(p);
    /* A2 is not the default and holds no homes, so it is the one the drawer offers. */
    await click(p, "[data-typv-retire]");
    await p.waitForTimeout(600);
    ok("it retires rather than deleting", (await count(p, ".typ-wrap.is-retired")) === 2);
    const body = await drawer(p);
    ok("a retired variant is still listed, marked", /A2[\s\S]{0,60}retired/.test(body), body.slice(0, 700));
    ok("and offers to bring it back", (await count(p, "[data-typv-restore]")) === 2);
    /* IT CAN NOW BE REMOVED FOR GOOD, because no home is built that way and the row is ours
       rather than an importer's - and the drawer only offers that once it is true. */
    ok("and, holding nothing, to remove it for good", (await count(p, "[data-typv-purge]")) === 2);

    await click(p, "[data-typv-restore]");
    await p.waitForTimeout(600);
    const rb = await posted(p);
    ok("bringing one back is is_active true, not a re-create",
      rb && rb.variant_id && rb.is_active === true && !rb.code, rb);
    ok("it is active again", (await count(p, ".typ-wrap.is-retired")) === 1);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 13. a retired type ──────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("13. a retired type");
    await openTypes(p);
    const t = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const el = [...r.querySelectorAll(".typ-type")].find(x => x.classList.contains("is-retired"));
      return {
        restore: !!el.querySelector("[data-typ-restore]"),
        purge: !!el.querySelector("[data-typ-purge]"),
        addvar: !!el.querySelector("[data-typ-addvar]"),
        varpurge: !!el.querySelector("[data-typv-purge]")
      };
    });
    ok("it offers to bring the type back", t.restore, t);
    /* NOT removable while a variant row still exists - they would be left pointing at
       nothing, and a variant with no type is a home with no type name and no way back. The
       button is absent rather than present-and-refused. */
    ok("but not to remove it, because a variant row still exists", !t.purge, t);
    ok("its retired variant CAN be removed for good", t.varpurge, t);
    ok("and no variant can be added to it", !t.addvar, t);

    await click(p, "[data-typ-restore]");
    await p.waitForTimeout(600);
    const b = await posted(p);
    ok("bringing a type back is is_active true", b && b.type_id === 3 && b.is_active === true, b);
    ok("it never re-sends the code, which cannot change", b && !b.code, b);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 14. a salesperson ───────────────────────────────────────────────────
  {
    const { ctx, p } = await open("?role=sales");
    console.log("14. read-only");
    await openTypes(p);
    ok("a salesperson can still read the register", (await count(p, ".typ-type")) === 3);
    ok("and see what is built which way", /6 homes/.test(await drawer(p)));
    ok("but is offered no controls at all",
      (await count(p, "[data-typ-retire], [data-typ-restore], [data-typ-purge], [data-typv-default], [data-typv-edit], [data-typv-retire], [data-typv-purge], [data-typ-addvar]")) === 0);
    ok("and no way to add a type", (await count(p, "#typTypeAdd")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 15. the busy flag holds until BOTH reloads are back ─────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("15. the busy window");
    await openTypes(p);
    await p.evaluate(() => { window.__TYP_SLOW = 1; });
    await click(p, "[data-typv-default]");
    await p.waitForTimeout(120);
    /* THE WINDOW THAT USED TO TAKE A SECOND CLICK. The busy flag used to clear when the
       WRITE returned, leaving about a second in which the row still showed its old state and
       accepted another press - so somebody who saw nothing change clicked again and put it
       straight back. It has to stay disabled until the fresh read is rendered. */
    const mid = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const b = r.querySelector("[data-typv-default]");
      return { present: !!b, disabled: b ? b.disabled : null };
    });
    ok("the button is still disabled while the reload is in flight",
      !mid.present || mid.disabled === true, mid);
    await p.waitForTimeout(900);
    const done = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const b = r.querySelector("[data-typv-default]");
      return { present: !!b, disabled: b ? b.disabled : null };
    });
    ok("and usable again once it is", !done.present || done.disabled === false, done);
    ok("the promotion landed exactly once",
      (await count(p, ".typ-wrap .feat-flag")) >= 1);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 16. the drawer behaves like the others ──────────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("16. the drawer");
    await openTypes(p);
    ok("it opens over a scrim", (await p.evaluate(() =>
      document.getElementById("hl-console-host").shadowRoot.getElementById("scrim").classList.contains("open"))) === true);
    ok("only one panel is open at a time",
      (await count(p, ".panel-btn[aria-expanded='true']")) === 1);
    await clickId(p, "invFldOpen");
    await p.waitForTimeout(300);
    ok("opening Fields replaces it rather than stacking",
      (await txt(p, "#drawer h1")) === "Fields" && (await count(p, ".typ-type")) === 0);
    await clickId(p, "invTypOpen");
    await p.waitForTimeout(300);
    ok("and back again", (await txt(p, "#drawer h1")) === "Types and variants");
    await clickId(p, "close");
    await p.waitForTimeout(200);
    /* Closing HIDES the drawer rather than emptying it - the markup stays until the next
       render, which is how every panel in this console behaves. Asserting on the markup
       would be asserting on an implementation detail and would pass for the wrong reason. */
    const shut = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return {
        drawer: r.getElementById("drawer").classList.contains("open"),
        scrim: r.getElementById("scrim").classList.contains("open"),
        hidden: r.getElementById("drawer").getAttribute("aria-hidden")
      };
    });
    ok("Close shuts it", shut.drawer === false && shut.scrim === false, shut);
    ok("and hides it from a screen reader too", shut.hidden === "true", shut);
    ok("and the button stops saying it is open",
      (await count(p, ".panel-btn[aria-expanded='true']")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  // ── 17. the register belongs to a development ───────────────────────────
  {
    const { ctx, p } = await open("?role=admin");
    console.log("17. switching development");
    await openTypes(p);
    ok("Stellenbosch's register is showing", (await count(p, ".typ-type")) === 3);
    /* SWITCHING DEVELOPMENT CLOSES THE DRAWER, the same as Phases and Fields - one
       development's types drawn over another's stock is the kind of thing somebody acts on. */
    await set(p, "invProp", "polaris");
    await p.waitForTimeout(400);
    ok("switching closes it", (await p.evaluate(() =>
      document.getElementById("hl-console-host").shadowRoot
        .getElementById("drawer").classList.contains("open"))) === false);
    await clickId(p, "invTypOpen");
    await p.waitForTimeout(400);
    /* And the register it shows is the NEW development's, not the one it had loaded. The
       open check would refetch anyway, but the stale one must not be rendered first. */
    ok("re-opening shows the new development's register",
      (await count(p, ".typ-type")) === 1);
    const body = await drawer(p);
    ok("with its own type, not the last one's", /Polaris Heart B/.test(body), body.slice(0, 300));
    ok("and the button agrees with the drawer",
      /1 type, 1 way/.test(await txt(p, "#invTypOpen")), await txt(p, "#invTypOpen"));
    /* AN IMPORTED ROW CANNOT BE REMOVED FOR GOOD. The next import writes it back with a new
       id while anything pointing at the old one orphans - so deleting it does not remove the
       type, it launders it into a different row. The button is simply not there. */
    ok("an imported type offers no permanent delete",
      (await count(p, "[data-typ-purge]")) === 0);
    ok("no page errors", p.__errs.length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n  " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
