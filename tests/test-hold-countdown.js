/* PATHS RESOLVE FROM THIS FILE, never from an absolute scratch path. This suite spent a
   fortnight in /tmp on a session container, reading its bundle out of a directory that did
   not exist anywhere else - so it was one container reclaim from gone, and runnable by
   nobody but the session that wrote it. Ported into the repo 9 Sep 2026. */
const ROOT = require("path").join(__dirname, "..");
const FIX = require("path").join(__dirname, "fixtures");
// Minimal window stub: enough to load the module and exercise follow() + the clock offset.
var timers = [], now = 1788800000000;
var el = { textContent: "", classList: { c: {}, toggle: function (k, v) { this.c[k] = !!v; } } };
global.window = {
  setInterval: function (fn) { timers.push(fn); return timers.length; },
  clearInterval: function () {},
  fetch: function () { return Promise.resolve({ ok: true, text: function () { return Promise.resolve("{}"); } }); }
};
var realNow = Date.now;
Date.now = function () { return now; };
require(ROOT + "/hl-hold-countdown.js");
var H = global.window.HLHold;

var pass = 0, fail = 0;
function ok(n, c, x) { c ? pass++ : (fail++, console.log("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : ""))); }

var cfg = { base: "https://x", uuid: "u", display: el };

// The device clock is 90s FAST. A countdown that trusted it would show 90s too little.
ok("follow takes a deadline and starts counting", H.follow(now + 600000 - 90000, now - 90000, cfg) === true);
ok("and corrects for a device clock that is wrong", H.remaining() === 600, H.remaining());
ok("it renders mm:ss", el.textContent === "10:00", el.textContent);
ok("not urgent yet", el.classList.c["is-urgent"] === false);

H.follow(now + 60000, now, cfg);
ok("under two minutes reads urgent", el.classList.c["is-urgent"] === true && el.textContent === "01:00", el.textContent);

H.follow(now - 5000, now, cfg);
ok("a deadline already gone reads zero, never negative", el.textContent === "00:00" && H.remaining() === 0, el.textContent);
ok("and marks itself expired", el.classList.c["is-expired"] === true);

ok("a null deadline is refused rather than counted", H.follow(null, now, cfg) === false);
ok("so is an unreadable one", H.follow("banana", now, cfg) === false);
ok("a date-string deadline is accepted", H.follow("2026-09-07T12:00:00Z", now, cfg) === true);
// server_time is the literal string "now" on some endpoints in this workspace - a known defect.
H.follow(now + 300000, "now", cfg);
ok("an unreadable server_time falls back to the device clock, degraded not broken",
  H.remaining() === 300, H.remaining());

Date.now = realNow;
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
