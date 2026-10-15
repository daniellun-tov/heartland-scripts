/* DEMO MODE (15 Oct). The Sanford demo must exist on *.webflow.io and nowhere else.
   jsdom, no network. Grades the browser half only - what a staging reservation may DO is
   enforced in Xano (resolve_reservation_mode) and is not visible from here. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const SANFORD = fs.readFileSync(path.join(__dirname, "..", "heartland-sanford-v2.js"), "utf8");
const RESERVE = fs.readFileSync(path.join(__dirname, "..", "heartland-reserve.js"), "utf8");

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log("  ok  " + m); } else { fail++; console.log("  FAIL " + m); } }

function settle(w) {
  return new Promise(function (res) {
    if (w.document.readyState === "complete") { return res(); }
    w.addEventListener("load", function () { setTimeout(res, 0); });
  });
}

async function sanford(url, stored) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div data-sd2-page data-sd2-phase="prelaunch" ' +
    'data-sd2-launch="2099-01-01T12:00:00+02:00"><div data-hl-entry="sanford" data-hl-target="/reserve-flow"></div></div></body></html>',
    { url, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  if (stored) { w.sessionStorage.setItem("sd2_demo", stored); }
  w.matchMedia = w.matchMedia || function () { return { matches: false, addListener() {}, addEventListener() {} }; };
  try { w.eval(SANFORD); } catch (e) { /* later modules may need markup this fixture lacks; the phase block runs first */ }
  await settle(w);
  const html = w.document.documentElement;
  return {
    live: html.classList.contains("sd2-live"),
    pre: html.classList.contains("sd2-prelaunch"),
    gated: html.classList.contains("sd2-gated"),
    pill: w.document.querySelector(".sd2_demo_pill"),
    entry: !!w.document.querySelector("[data-hl-entry]"),
    stored: w.sessionStorage.getItem("sd2_demo")
  };
}

async function reserve(url) {
  const dom = new JSDOM('<!doctype html><html><body><section data-hl-step="unit"></section></body></html>',
    { url, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = function () { return new Promise(function () {}); };
  try { w.eval(RESERVE); } catch (e) {}
  await settle(w);
  return w.document.getElementById("hl-demo-bar");
}

(async function () {
const STG = "https://heartlandpropertydevelopers.webflow.io/sanford";
const WWW = "https://www.heartland.co.za/sanford";

console.log("sanford bundle");
let r = await sanford(STG + "?sd2_demo=open");
ok(r.live && !r.pre && !r.gated, "staging ?sd2_demo=open: live, no gate");
ok(r.entry, "staging open: the reserve hand-off marker is left armed");
ok(r.pill && /open/i.test(r.pill.textContent), "staging open: the pill says open");
ok(r.stored === "open", "staging open: sticks for the tab");

r = await sanford(STG + "?sd2_demo=gated");
ok(r.live && r.gated && !r.pre, "staging ?sd2_demo=gated: live WITH the gate");
ok(r.pill && /gated/i.test(r.pill.textContent), "staging gated: the pill says gated");

r = await sanford(STG + "?sd2_demo=reserve");
ok(r.live && r.gated && r.stored === "gated", "the old ?sd2_demo=reserve link still means gated");

r = await sanford(STG, "open");
ok(r.live && !r.gated, "staging reload with the stored mode stays in the demo");

r = await sanford(STG + "?sd2_demo=off", "open");
ok(r.pre && !r.live && !r.pill && r.stored === null, "?sd2_demo=off ends it");

r = await sanford(STG);
ok(r.pre && !r.live && !r.pill, "staging without the parameter is the real pre-launch page");

r = await sanford(WWW + "?sd2_demo=open");
ok(r.pre && !r.live && !r.pill, "www ignores ?sd2_demo=open");
ok(!r.entry, "www pre-launch keeps the reserve hand-off parked");

r = await sanford(WWW, "open");
ok(r.pre && !r.live && r.stored === null, "www clears a stored demo and ignores it");

r = await sanford(WWW + "?sd2_phase=live");
ok(r.pre && !r.live, "www ignores ?sd2_phase=live (no opening reservations on production early)");

r = await sanford(STG + "?sd2_phase=live");
ok(r.live && !r.pre, "staging still honours ?sd2_phase=live");

console.log("reserve flow");
ok(!!(await reserve("https://heartlandpropertydevelopers.webflow.io/reserve-flow?r=x")), "the demo banner shows on webflow.io");
ok(!(await reserve("https://www.heartland.co.za/reserve-flow?r=x")), "and never on www");

console.log("\n" + pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
})();
