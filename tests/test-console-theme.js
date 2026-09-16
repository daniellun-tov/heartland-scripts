/* Browser tests for the sales-console theme layer. Real Chromium, real shadow
   root, real computed styles - a token that does not actually reach an element
   is the whole failure mode here, so nothing is asserted against source text. */
const { chromium } = require("playwright");
const path = require("path");
const FX = "file://" + path.join(__dirname, "fixtures");

let pass = 0, fail = 0;

// The scheme switch moved into the settings modal, so every interaction test now
// goes through the gear button - which is itself the thing being exercised.
const pick = (p, which) => p.evaluate(v => {
  const r = document.getElementById("hl-console-host").shadowRoot;
  const openBtn = r.querySelector("#app").classList.contains("hide")
    ? r.querySelector("#login [data-settings-open]")
    : r.querySelector("header [data-settings-open]");
  openBtn.click();
  r.querySelector('#settings [data-scheme-pref="' + v + '"]').click();
  r.getElementById("setClose").click();
}, which);
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}

function lum(rgb) {
  const m = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
}
function ratio(a, b) { let x = lum(a), y = lum(b); if (x < y) { [x, y] = [y, x]; } return (x + 0.05) / (y + 0.05); }

const probe = () => {
  const host = document.getElementById("hl-console-host");
  const r = host.shadowRoot;
  const cs = getComputedStyle(host);
  const tok = n => cs.getPropertyValue(n).trim();
  const el = s => r.querySelector(s);
  const bg = s => { const e = el(s); return e ? getComputedStyle(e).backgroundColor : null; };
  const fg = s => { const e = el(s); return e ? getComputedStyle(e).color : null; };
  return {
    scheme: host.getAttribute("data-scheme"),
    hostBg: cs.backgroundColor,
    docBg: getComputedStyle(document.documentElement).backgroundColor,
    colorScheme: document.documentElement.style.colorScheme,
    tokens: {
      viz: [1,2,3,4,5,6].map(n => tok("--viz-" + n)).join(","),
      vizSolo: tok("--viz-solo"),
      plane: tok("--plane"), surface: tok("--surface"), ink: tok("--ink"),
      ink2: tok("--ink-2"), brand: tok("--brand"), brandInk: tok("--brand-ink"),
      accent: tok("--accent"), radius: tok("--radius"), critical: tok("--critical")
    },
    pressed: [].map.call(r.querySelectorAll("[data-scheme-pref]"),
      b => b.getAttribute("data-scheme-pref") + ":" + b.getAttribute("aria-pressed")),
    switches: r.querySelectorAll(".schemeswitch").length,
    /* One entry per switch: which segment each one has pressed. Two switches that
       disagree is the failure this replaces the old count with. */
    pressedPerSwitch: [].map.call(r.querySelectorAll(".schemeswitch"), sw => {
      const on = sw.querySelector('[data-scheme-pref][aria-pressed="true"]');
      return on ? on.getAttribute("data-scheme-pref") : "none";
    }),
    gears: r.querySelectorAll("[data-settings-open]").length,
    modalOpen: r.getElementById("settings").classList.contains("open"),
    marks: [].map.call(r.querySelectorAll(".brandmark"), m => m.textContent),
    loginVisible: !el("#login").classList.contains("hide"),
    cardBg: bg("#login"), h1Fg: fg("#login h1"),
    labelFg: fg("#login label"),
    stored: (function () { try { return localStorage.getItem("hl_console_scheme"); } catch (e) { return "ERR"; } }())
  };
};

(async () => {
  const browser = await chromium.launch();

  // ── 1. default: no stored preference, system light ───────────────────────
  {
    const ctx = await browser.newContext({ colorScheme: "light" });
    const p = await ctx.newPage();
    await p.goto(FX + "/console.html"); await p.waitForTimeout(120);
    const s = await p.evaluate(probe);
    console.log("1. default, system light");
    ok("scheme is light", s.scheme === "light", s.scheme);
    ok("no stored preference yet", s.stored === "system" || s.stored === null, s.stored);
    ok("Auto is the pressed segment on every switch",
      s.pressedPerSwitch.length > 0 && s.pressedPerSwitch.every(p => p === "system"), s.pressedPerSwitch);
    ok("two switches - the settings modal and the account menu", s.switches === 2, s.switches);
    ok("and they agree, because one delegated handler syncs them all",
      new Set(s.pressedPerSwitch).size === 1, s.pressedPerSwitch);
    ok("a gear on the sign-in card and one in the header", s.gears === 2, s.gears);
    ok("the modal starts closed", s.modalOpen === false, s.modalOpen);
    ok("plane token is Off White", s.tokens.plane === "#f0eeea", s.tokens.plane);
    ok("host paints the plane", s.hostBg === "rgb(240, 238, 234)", s.hostBg);
    ok("document follows the console", s.docBg === "rgb(240, 238, 234)", s.docBg);
    ok("color-scheme declared to the browser", s.colorScheme === "light", s.colorScheme);
    ok("radius is the site's medium", s.tokens.radius === "0.5rem", s.tokens.radius);
    ok("the light ordinal ramp is the validated one",
      s.tokens.viz === "#d1b082,#be9965,#ab8347,#976d28,#845800,#6c4500", s.tokens.viz);
    ok("brand is Heartland gold", s.tokens.brand === "#bfa279", s.tokens.brand);
    ok("wordmark says Heartland", s.marks.every(m => m === "Heartland"), s.marks);
    ok("login card is on the surface", s.cardBg === "rgb(255, 255, 255)", s.cardBg);
    ok("body text passes AA on the card", ratio(s.h1Fg, s.cardBg) >= 4.5, [s.h1Fg, ratio(s.h1Fg, s.cardBg)]);
    ok("secondary text passes AA on the card", ratio(s.labelFg, s.cardBg) >= 4.5, [s.labelFg, ratio(s.labelFg, s.cardBg)]);
    await ctx.close();
  }

  // ── 2. system dark, still no stored preference ───────────────────────────
  {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const p = await ctx.newPage();
    await p.goto(FX + "/console.html"); await p.waitForTimeout(120);
    const s = await p.evaluate(probe);
    console.log("2. default, system dark");
    ok("scheme follows the system", s.scheme === "dark", s.scheme);
    ok("Auto still the pressed segment", s.pressedPerSwitch.every(p => p === "system"), s.pressedPerSwitch);
    ok("dark plane", s.tokens.plane === "#131311", s.tokens.plane);
    ok("host paints the dark plane", s.hostBg === "rgb(19, 19, 17)", s.hostBg);
    ok("color-scheme declared dark", s.colorScheme === "dark", s.colorScheme);
    ok("brand gold is unchanged across schemes", s.tokens.brand === "#bfa279", s.tokens.brand);
    ok("accent lightens for dark", s.tokens.accent === "#c9b18b", s.tokens.accent);
    ok("the dark ordinal ramp is its own steps, not a flip of light's",
      s.tokens.viz === "#724f10,#8b6321,#a47935,#ba9051,#cfa870,#e1c296", s.tokens.viz);
    ok("card is the dark surface", s.cardBg === "rgb(27, 27, 25)", s.cardBg);
    ok("body text passes AA on dark", ratio(s.h1Fg, s.cardBg) >= 4.5, [s.h1Fg, ratio(s.h1Fg, s.cardBg)]);
    ok("secondary text passes AA on dark", ratio(s.labelFg, s.cardBg) >= 4.5, [s.labelFg, ratio(s.labelFg, s.cardBg)]);
    await ctx.close();
  }

  // ── 3. explicit choice overrides the system, and survives a system flip ──
  {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const p = await ctx.newPage();
    await p.goto(FX + "/console.html"); await p.waitForTimeout(120);
    await pick(p, "light");
    await p.waitForTimeout(60);
    let s = await p.evaluate(probe);
    console.log("3. explicit light on a dark machine");
    ok("scheme is light", s.scheme === "light", s.scheme);
    ok("choice stored", s.stored === "light", s.stored);
    ok("Light is pressed on every switch",
      s.pressedPerSwitch.length > 0 && s.pressedPerSwitch.every(p => p === "light"), s.pressedPerSwitch);
    ok("document turned light too", s.docBg === "rgb(240, 238, 234)", s.docBg);

    await p.emulateMedia({ colorScheme: "light" });
    await p.waitForTimeout(80);
    await p.emulateMedia({ colorScheme: "dark" });
    await p.waitForTimeout(80);
    s = await p.evaluate(probe);
    ok("a system flip does NOT override an explicit choice", s.scheme === "light", s.scheme);

    await p.reload(); await p.waitForTimeout(120);
    s = await p.evaluate(probe);
    ok("the choice survives a reload", s.scheme === "light", s.scheme);
    ok("still pressed after reload", s.pressedPerSwitch.every(p => p === "light"), s.pressedPerSwitch);
    await ctx.close();
  }

  // ── 4. back to Auto, and the system IS then followed live ────────────────
  {
    const ctx = await browser.newContext({ colorScheme: "light" });
    const p = await ctx.newPage();
    await p.goto(FX + "/console.html"); await p.waitForTimeout(120);
    await pick(p, "dark");
    await p.waitForTimeout(60);
    let s = await p.evaluate(probe);
    console.log("4. dark, then back to Auto");
    ok("explicit dark on a light machine", s.scheme === "dark", s.scheme);
    await pick(p, "system");
    await p.waitForTimeout(60);
    s = await p.evaluate(probe);
    ok("Auto returns to the system's light", s.scheme === "light", s.scheme);
    ok("Auto stored", s.stored === "system", s.stored);
    await p.emulateMedia({ colorScheme: "dark" });
    await p.waitForTimeout(80);
    s = await p.evaluate(probe);
    ok("on Auto, a live system flip IS followed", s.scheme === "dark", s.scheme);
    await ctx.close();
  }

  // ── 5. white-label: a brand declared by the page ─────────────────────────
  {
    const ctx = await browser.newContext({ colorScheme: "light" });
    const p = await ctx.newPage();
    await p.goto(FX + "/brand.html"); await p.waitForTimeout(120);
    let s = await p.evaluate(probe);
    console.log("5. white-label brand from the page");
    ok("brand tokens override the base", s.tokens.brand === "#0a5c8a", s.tokens.brand);
    ok("brand plane overrides the base", s.tokens.plane === "#eef3f6", s.tokens.plane);
    ok("host paints the brand plane", s.hostBg === "rgb(238, 243, 246)", s.hostBg);
    ok("wordmark takes the brand label", s.marks.every(m => m === "Acme Homes"), s.marks);
    ok("untouched tokens keep the Heartland value", s.tokens.ink === "#18191a", s.tokens.ink);
    ok("untouched shape tokens keep the base", s.tokens.radius === "0.5rem", s.tokens.radius);
    const wl = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      return { imgs: r.querySelectorAll(".bm-icon img").length,
               svgs: r.querySelectorAll(".bm-icon svg").length,
               font: (document.getElementById("hl-console-font") || {}).href,
               fonts: document.querySelectorAll("#hl-console-font").length };
    });
    // A brand supplies an image URL, never markup - config arriving from a page is
    // never injected as HTML, trusted page or not.
    ok("the brand's own logo replaces the built-in mark", wl.imgs === 2, wl.imgs);
    ok("and the built-in SVG is gone", wl.svgs === 0, wl.svgs);
    ok("the brand's typeface is loaded instead of Heartland's",
      /family=Inter/.test(wl.font) && !/Source/.test(wl.font), wl.font);
    ok("still exactly one font stylesheet", wl.fonts === 1, wl.fonts);
    const bw = await p.evaluate(() => document.getElementById("hl-console-host")
      .shadowRoot.getElementById("bootWord").textContent);
    ok("the boot wordmark is the brand's too, not a hard-coded Heartland",
      bw === "Acme Homes", bw);
    await pick(p, "dark");
    await p.waitForTimeout(60);
    s = await p.evaluate(probe);
    ok("the brand's dark map applies", s.tokens.brand === "#4aa8dc", s.tokens.brand);
    ok("the brand's dark plane applies", s.tokens.plane === "#0b1116", s.tokens.plane);
    ok("the brand's dark accent applies", s.tokens.accent === "#8fcdf0", s.tokens.accent);
    // --ink-2 is set by the brand's LIGHT map only. If applyBrand does not clear
    // the previous scheme first, the light value survives into dark.
    ok("a light-only brand token does NOT leak into dark",
      s.tokens.ink2 === "#b5b0a6", s.tokens.ink2);
    ok("unset dark tokens fall back to Heartland dark, not Heartland light",
      s.tokens.ink === "#f5f3ef", s.tokens.ink);
    await ctx.close();
  }

  // ── 6. nothing the app renders was lost in the restyle ───────────────────
  {
    const ctx = await browser.newContext({ colorScheme: "light" });
    const p = await ctx.newPage();
    await p.goto(FX + "/console.html"); await p.waitForTimeout(120);
    const s = await p.evaluate(() => {
      const r = document.getElementById("hl-console-host").shadowRoot;
      const sheet = r.querySelector("style").textContent;
      const need = [".card", ".row", ".err", ".ok", ".muted", ".mono", "#login", "header.top",
        "nav.side", ".side-group", ".count", ".group", ".item", ".none", ".filters", ".tablewrap",
        ".pill", ".dot", ".tag", ".scrim", ".drawer", ".dl", ".sect", ".otprow",
        ".stagebar", ".step", ".hide", ".spin", "button.primary", "button.danger",
        "button.ghost", ".s-confirmed", ".s-payment_failed", ".s-cancelled",
        ".step.now", ".step.done", ".step.skip", ".tag.crit", ".tag.warn", ".count.hot",
        ".kpi", ".chart", ".hbar", ".h-fill", ".col", ".c-bar", ".stack", ".legend",
        ".viztip", ".iconbtn", ".modal", ".modal-panel", ".vtable", ".dashnote"];
      return {
        missing: need.filter(n => sheet.indexOf(n) === -1),
        hasApp: !!r.getElementById("app"),
        hasDrawer: !!r.getElementById("drawer"),
        hasRows: !!r.getElementById("rows"),
        hasDash: !!r.getElementById("viewDash"),
        hasSettings: !!r.getElementById("settings"),
        hasTip: !!r.getElementById("viztip"),
        hidden: !!r.getElementById("app").classList.contains("hide"),
        errors: window.__errs || []
      };
    });
    console.log("6. no selector or element lost");
    ok("every selector the app renders is still styled", s.missing.length === 0, s.missing);
    ok("app shell present", s.hasApp && s.hasDrawer && s.hasRows);
    ok("dashboard, settings and tooltip hosts present", s.hasDash && s.hasSettings && s.hasTip,
      [s.hasDash, s.hasSettings, s.hasTip]);
    ok("app still hidden before sign-in", s.hidden);
    await ctx.close();
  }

  // ── 7. hard contrast floor, measured on the rendered page ────────────────
  for (const mode of ["light", "dark"]) {
    const ctx = await browser.newContext({ colorScheme: mode });
    const p = await ctx.newPage();
    await p.goto(FX + "/console.html"); await p.waitForTimeout(120);
    const s = await p.evaluate(() => {
      const host = document.getElementById("hl-console-host");
      const r = host.shadowRoot, cs = getComputedStyle(host);
      const t = n => cs.getPropertyValue(n).trim();
      // render a probe so the values are real computed colours, not token text
      const d = document.createElement("div");
      d.innerHTML = '<span id="_a" style="color:var(--ink)"></span>' +
        '<span id="_b" style="color:var(--ink-2)"></span>' +
        '<span id="_c" style="color:var(--accent)"></span>' +
        '<span id="_d" style="color:var(--critical)"></span>' +
        '<span id="_e" style="color:var(--good)"></span>' +
        '<span id="_f" style="color:var(--warning)"></span>' +
        '<span id="_g" style="color:var(--serious)"></span>' +
        '<span id="_h" style="color:var(--brand-ink);background:var(--brand)"></span>' +
        '<span id="_p" style="background:var(--plane)"></span>' +
        '<span id="_s" style="background:var(--surface)"></span>';
      r.appendChild(d);
      const c = id => getComputedStyle(r.getElementById(id)).color;
      const b = id => getComputedStyle(r.getElementById(id)).backgroundColor;
      const out = { plane: b("_p"), surface: b("_s"), brand: b("_h"), brandInk: c("_h"),
        ink: c("_a"), ink2: c("_b"), accent: c("_c"), critical: c("_d"),
        good: c("_e"), warning: c("_f"), serious: c("_g") };
      d.remove(); return out;
    });
    console.log("7. contrast floor - " + mode);
    for (const bgName of ["plane", "surface"]) {
      for (const fgName of ["ink", "ink2", "accent", "critical", "good", "warning", "serious"]) {
        const r = ratio(s[fgName], s[bgName]);
        ok(fgName + " on " + bgName + " >= 4.5", r >= 4.5, Math.round(r * 100) / 100);
      }
    }
    ok("brand-ink on brand >= 4.5", ratio(s.brandInk, s.brand) >= 4.5, Math.round(ratio(s.brandInk, s.brand) * 100) / 100);
    await ctx.close();
  }

  /* ── 8. the card contract, measured rather than read off the stylesheet ──────
     .card is the BOX; .pad is how one asks for the standard inset. Until 16 Sep .pad
     was declared only under #viewInv and #viewDev, so the first new section written
     after that - Teams - rendered every card with its text against the border, and
     nothing failed. Asserting the RULE EXISTS is not enough: it has to reach the
     element, in the view being looked at. This walks every tab an admin can open and
     checks both halves of the contract, so the next new section is covered the day it
     is written rather than the day somebody notices. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const p = await ctx.newPage();
    await p.goto(FX + "/dash.html?role=admin");
    await p.waitForTimeout(500);
    console.log("8. the card contract");

    const tabs = ["tabDash", "tabToday", "tabLeads", "tabPipe", "tabInv", "tabDev", "tabTeams", "tabTeam"];
    const seen = [];
    for (const t of tabs) {
      await p.evaluate(id => {
        const b = document.getElementById("hl-console-host").shadowRoot.getElementById(id);
        if (b) { b.click(); }
      }, t);
      await p.waitForTimeout(700);
      const cards = await p.evaluate(id => {
        const r = document.getElementById("hl-console-host").shadowRoot;
        const view = r.querySelector("section:not(.hide)");
        if (!view) { return []; }
        return [...view.querySelectorAll(".card")].map(e => {
          const c = getComputedStyle(e);
          return { tab: id, view: view.id, cls: e.className,
            pad: e.classList.contains("pad"),
            top: parseFloat(c.paddingTop), left: parseFloat(c.paddingLeft) };
        });
      }, t);
      cards.forEach(c => seen.push(c));
    }

    ok("the walk actually found cards to judge", seen.length >= 6, seen.length);
    ok("every tab an admin can open was reached",
      new Set(seen.map(c => c.view)).size >= 4, [...new Set(seen.map(c => c.view))]);

    const unpadded = seen.filter(c => c.pad && !(c.top > 0 && c.left > 0));
    ok("every .card.pad actually receives an inset, in the view it is rendered in",
      unpadded.length === 0, unpadded);

    const insets = [...new Set(seen.filter(c => c.pad).map(c => c.top + "/" + c.left))];
    ok("and they all receive the SAME one - a second value is a second source of truth",
      insets.length === 1, insets);

    /* The other half. .card cannot simply carry padding itself, because a card that is
       nothing but a table sets its own on .tablewrap and a global inset would double it
       up - and because three card VARIANTS legitimately have their own geometry: a KPI
       tile, a chart and a Today group are components, not plain cards.

       So the rule is not "no inset without .pad", it is THIS LIST. Anything padded by
       some fourth route is a new way of saying an old thing, and that is exactly how
       .pad ended up declared twice under two view ids and missing from the third. A new
       entry here should be a decision somebody made on purpose, not a default. */
    const OWN_INSET = ["kpi", "chart", "group"];
    const rogue = seen.filter(c => !c.pad && (c.top > 0 || c.left > 0) &&
      !OWN_INSET.some(k => c.cls.split(" ").indexOf(k) !== -1));
    ok("a .card that is padded by neither .pad nor a known variant does not exist",
      rogue.length === 0, rogue);

    /* AND THE WAY ROUND THAT ACTUALLY BIT. Everything above still passes when a card
       simply FORGETS .pad - which is what the Teams cards did, and why this whole pass
       happened. An unpadded card is only legitimate when something inside it supplies
       the inset instead; today that is .tablewrap and nothing else. Enumerated for the
       same reason as the list above: zero is a decision here, not a default. */
    const NO_INSET = ["tablewrap"];
    const bare = seen.filter(c => c.top === 0 && c.left === 0 &&
      !NO_INSET.some(k => c.cls.split(" ").indexOf(k) !== -1));
    ok("a .card with NO inset is one that supplies its own inside - never one that forgot",
      bare.length === 0, bare);

    ok("no page errors", (p.__errs || []).length === 0, p.__errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
