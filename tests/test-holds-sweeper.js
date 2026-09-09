/* ---------------------------------------------------------------------------
   THIS SUITE IS A MIRROR, AND IT IS NOT THE AUTHORITY.
   The logic under test is reproduced here from the server so it can be run without
   an HTTP round trip - the build session cannot reach Xano. That makes it useful and
   it makes it dangerous in exactly one way: a green run proves this COPY behaves, not
   that the deployed function does. When the server's rule changes, this file does not
   find out. Change both in the same commit, or the mirror becomes a confident lie.
   The authority is release_expired_holds, Xano fn 179.
   --------------------------------------------------------------------------- */
/* PATHS RESOLVE FROM THIS FILE, never from an absolute scratch path. This suite spent a
   fortnight in /tmp on a session container, reading its bundle out of a directory that did
   not exist anywhere else - so it was one container reclaim from gone, and runnable by
   nobody but the session that wrote it. Ported into the repo 9 Sep 2026. */
const ROOT = require("path").join(__dirname, "..");
const FIX = require("path").join(__dirname, "fixtures");
const run = require(FIX + "/holds-lambda.js");
const NOW = 1788747800225;
const MIN = 60000;
let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? pass++ : (fail++, console.log("  FAIL " + n + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")));

const R = (o) => Object.assign({ id: 1, uuid: "u", reference: null, property_slug: "sanford",
  wf_unit_id: "WF1", first_name: "Ann", last_name: "Blake", email: "a@b.c", last_step: "3" }, o);

// every branch, one row each
const rows = [
  R({ id: 1, status: "held",            active_hold_key: "WF1", hold_expires_at: NOW - 60000 }),
  R({ id: 2, status: "awaiting_payment",active_hold_key: "WF2", wf_unit_id: "WF2", hold_expires_at: NOW - 1 }),
  R({ id: 3, status: "draft",           active_hold_key: "WF3", wf_unit_id: "WF3", hold_expires_at: NOW - 9 * MIN }),
  R({ id: 4, status: "payment_failed",  active_hold_key: "WF4", wf_unit_id: "WF4", hold_expires_at: String(NOW - MIN) }),
  R({ id: 5, status: "confirmed",       active_hold_key: "WF5", wf_unit_id: "WF5", hold_expires_at: NOW - 30 * MIN }),
  R({ id: 6, status: "awaiting_clearance", active_hold_key: "WF6", wf_unit_id: "WF6", hold_expires_at: NOW - MIN }),
  R({ id: 7, status: "held",            active_hold_key: "WF7", wf_unit_id: "WF7", hold_expires_at: null }),
  R({ id: 8, status: "held",            active_hold_key: "WF8", wf_unit_id: "WF8", hold_expires_at: NOW + 4 * MIN }),
  R({ id: 9, status: "cancelled",       active_hold_key: null,  wf_unit_id: "WF9", hold_expires_at: NOW - MIN }),
  R({ id: 10, status: "held", property_slug: "polaris", active_hold_key: "WFA", wf_unit_id: "WFA", hold_expires_at: NOW - MIN }),
  R({ id: 11, status: "HELD",           active_hold_key: "WFB", wf_unit_id: "WFB", hold_expires_at: "2026-01-01T00:00:00Z" }),
  R({ id: 12, status: "held",           active_hold_key: "WFC", wf_unit_id: "WFC", hold_expires_at: NOW })
];

const base = { live: rows, now: NOW, in_dry: null, in_slug: null, in_grace: null };
const r = run(base);
const ids = r.released.map(x => x.id).sort((a, b) => a - b);

console.log("release decisions");
ok("the four pre-payment states lapse", [1,2,3,4].every(i => ids.includes(i)), ids);
ok("a confirmed sale never does, however old its deadline", !ids.includes(5), ids);
ok("nor does an EFT still clearing", !ids.includes(6), ids);
ok("a null deadline is not a past one", !ids.includes(7), ids);
ok("a hold with time left is untouched", !ids.includes(8), ids);
ok("a row already released is not counted at all", r.examined === 11, r.examined);
ok("a date-string deadline parses", ids.includes(11), ids);
ok("a numeric-string deadline parses", ids.includes(4), ids);
ok("status is compared case-insensitively", ids.includes(11), ids);
ok("the exact deadline counts as gone, not still running", ids.includes(12), ids);
ok("nothing else came along", ids.join(",") === "1,2,3,4,10,11,12", ids);
ok("the counts add up",
  r.examined === r.released_count + r.skipped_paid_or_clearing + r.skipped_no_deadline + r.still_running,
  { e: r.examined, rel: r.released_count, paid: r.skipped_paid_or_clearing, nod: r.skipped_no_deadline, run: r.still_running });
ok("it says how long each has been blocking a home",
  r.released.find(x => x.id === 3).overdue_seconds === 540,
  r.released.find(x => x.id === 3).overdue_seconds);
ok("and keeps the buyer on it, because a lapsed hold is a lead",
  r.released[0].buyer_name === "Ann Blake" && r.released[0].buyer_email === "a@b.c");

console.log("scoping and flags");
const one = run(Object.assign({}, base, { in_slug: "polaris" }));
ok("a slug limits the sweep to that development",
  one.released.map(x => x.id).join(",") === "10" && one.skipped_other_development === 10, one.released.map(x => x.id));
const gr = run(Object.assign({}, base, { in_grace: 120 }));
ok("grace keeps a just-lapsed hold for a moment longer",
  !gr.released.map(x => x.id).includes(2) && gr.released.map(x => x.id).includes(3),
  gr.released.map(x => x.id));
ok("an omitted dry_run means false - the trap-36 direction", run(base).dry_run === false);
ok("an explicit false means false too", run(Object.assign({}, base, { in_dry: false })).dry_run === false);
ok("and true means true", run(Object.assign({}, base, { in_dry: true })).dry_run === true);
ok("a negative grace cannot pull the cutoff forward",
  run(Object.assign({}, base, { in_grace: -600 })).grace_seconds === 0);
ok("no holds at all is a clean zero",
  run(Object.assign({}, base, { live: [] })).released_count === 0);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
