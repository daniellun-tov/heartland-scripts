/* THE CONSOLE/SERVER SEAM.

   Every other suite in here drives a STUBBED fetch: tests/fixtures/dash.html is a
   hand-written imitation of the server. The server has its own suites, in Xano, which never
   load the console. So both halves can be green while disagreeing with each other, and until
   this file existed nothing noticed.

   THAT IS NOT HYPOTHETICAL. On 6 Sep the eight spec figures moved from the variant to the
   type. Every server suite stayed green. Every console suite stayed green. And the fixture
   went on emitting types[].variants[].bedrooms — a field the server had stopped returning —
   so the drawer read it and rendered a blank line for the commonest row in the system. It was
   caught by reading the code, which is not a mechanism.

   WHAT THIS DOES. fixtures/server-contract.json is the SHAPE of the five reads the console
   renders from, generated from the live server by the Xano function emit_console_contract.
   This suite asks the fixture for the same five, shapes them with the same algorithm, and
   compares.

   THE TWO DIRECTIONS ARE NOT EQUALLY DANGEROUS, so they are not treated equally:

     INVENTED — the fixture returns a path the server does not. HARD FAILURE. This is the
       fixture lying about the server, and it is the direction that actually bit us. A console
       suite that reads an invented field proves the fixture, not the code.

     MISSING — the server returns a path the fixture does not. REPORTED, not failed. A fixture
       is allowed to be a subset: it carries three developments, not four, and omits plenty
       nothing renders. Failing on this would make the suite a nag and it would get ignored,
       which is worse than not having it. The count is printed so a large jump gets noticed.

   IF THIS SUITE GOES RED, THE FIXTURE IS WRONG UNTIL PROVEN OTHERWISE — not the contract.
   The contract came from the live server. Regenerate it only when a read genuinely changed
   shape on purpose, and then in the same commit as the fixture change. */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const FX = "file://" + path.join(__dirname, "fixtures");
const CONTRACT = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "server-contract.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}

/* THE SAME WALK THE GENERATOR USES. If these two ever diverge the comparison is meaningless,
   so keep them identical: paths and kinds, arrays collapsed to their first element, null
   treated as scalar so a field that is null on one development and a number on another does
   not make the contract flap with the data. */
const SHAPE_FN = `(function (root) {
  var isArr = function (x) { return Object.prototype.toString.call(x) === '[object Array]'; };
  var out = [];
  var walk = function (v, p, depth) {
    if (depth > 8) { out.push(p + ':deep'); return; }
    if (isArr(v)) {
      out.push(p + ':array');
      if (v.length > 0) { walk(v[0], p + '[]', depth + 1); }
      return;
    }
    if (v !== null && typeof v === 'object') {
      out.push(p + ':object');
      var keys = [];
      for (var k in v) { keys.push(k); }
      keys.sort();
      for (var i = 0; i < keys.length; i++) { walk(v[keys[i]], p + '.' + keys[i], depth + 1); }
      return;
    }
    out.push(p + ':scalar');
  };
  walk(root, '$', 0);
  out.sort();
  return out;
})`;

/* SOME PATHS ARE KEYED BY DATA, NOT BY SCHEMA, and comparing those across two different data
   sets is meaningless. summary.by_status is a map keyed by whichever statuses happen to exist;
   units[].field_values is keyed by whichever optional fields a development has adopted. The
   fixture legitimately has different ones. Children of these collapse to '<prefix>.*' on both
   sides, so the MAP's presence and kind are still checked and its data-dependent keys are not. */
const DATA_KEYED = [
  "$.summary.by_status",
  "$.summary.by_deal_stage",
  "$.units[].attributes",
  "$.units[].field_values"
];

function normalise(paths) {
  const out = new Set();
  for (const entry of paths) {
    const cut = entry.lastIndexOf(":");
    const p = entry.slice(0, cut), kind = entry.slice(cut + 1);
    let folded = null;
    for (const pre of DATA_KEYED) {
      if (p !== pre && p.startsWith(pre + ".")) { folded = pre + ".*:" + kind; break; }
    }
    out.add(folded || entry);
  }
  return [...out].sort();
}

/* A path whose kind differs ONLY because one side is scalar is a nullability artefact, not a
   contract break: the server's first unit has an offer_state object, the fixture's first has
   null, and null shapes as scalar. That is data, not disagreement.
   object-vs-array on the same path is NOT an artefact — it is exactly the confusion that cost
   real time when `overrides` came back keyed by field where a reader assumed a list. */
function splitPath(entry) {
  const cut = entry.lastIndexOf(":");
  return { path: entry.slice(0, cut), kind: entry.slice(cut + 1) };
}

/* Called exactly as the console calls them — including /staff/property-config with NO
   property, which is how the console asks for every development on load. That argument being
   optional-but-required already shipped as a bug once (trap 27); a check that always supplies
   it would not see it come back. */
const READS = [
  { key: "inventory",       url: "/staff/inventory?property=stellenbosch" },
  { key: "types",           url: "/staff/types?property=stellenbosch" },
  { key: "fields",          url: "/staff/fields?property=stellenbosch" },
  { key: "property_config", url: "/staff/property-config" },
  { key: "reservations",    url: "/staff/reservations" }
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1360, height: 1000 } });
  const p = await ctx.newPage();
  p.__errs = []; p.on("pageerror", e => p.__errs.push(String(e)));
  await p.goto(FX + "/dash.html", { waitUntil: "domcontentloaded" });
  /* The fixture installs its fetch override in an inline script, so it is in place well
     before this runs — but wait for it rather than assume, because a race here would compare
     the REAL fetch's failure against the contract and report nonsense. */
  await p.waitForFunction(() => typeof window.__FIXTURE !== "undefined", { timeout: 8000 });

  console.log("contract generated " + CONTRACT.generated_at + " by " + CONTRACT.generator);

  let totalInvented = 0, totalMissing = 0;

  for (const read of READS) {
    const expected = CONTRACT.endpoints[read.key];
    ok("contract carries a shape for " + read.key, Array.isArray(expected) && expected.length > 0,
      expected ? expected.length : "absent");
    if (!expected) { continue; }

    const actual = await p.evaluate(async (a) => {
      const shape = eval(a.fn);
      const r = await fetch("https://x7aj-untn-pq4t.n7e.xano.io/api:i0YhKPAV" + a.url);
      const t = await r.text();
      let body;
      try { body = JSON.parse(t); } catch (e) { return { error: "not JSON: " + t.slice(0, 120) }; }
      return { paths: shape(body), status: r.status };
    }, { fn: SHAPE_FN, url: read.url });

    ok(read.key + ": the fixture answers it at all", !actual.error, actual.error);
    if (actual.error) { continue; }

    const actualN = normalise(actual.paths);
    const expectedN = normalise(expected);
    const have = new Set(actualN);
    const want = new Set(expectedN);

    /* Kind index, so a path present on both sides can be judged on its kind rather than
       counted twice as one invented and one missing. */
    const kindOf = (list) => {
      const m = new Map();
      for (const e of list) { const { path, kind } = splitPath(e); m.set(path, kind); }
      return m;
    };
    const aK = kindOf(actualN), eK = kindOf(expectedN);

    const invented = [], missing = [], kindClash = [], nullable = [], beyondNull = [];

    /* FIRST, WHICH PATHS DIFFER ONLY BECAUSE ONE SIDE IS NULL. This has to run before the
       classification below, because null shapes as SCALAR and a scalar has no children - so
       every path underneath one is absent from that side's list no matter how honest both
       sides are. Calling those invented is the suite blaming the fixture for the server's
       data: /staff/fields returns options: null on the first field of a development whose
       first field is not an enum, and the fixture's first field is one. Found the hour this
       check was written, on fields[].options[]. */
    const nullableRoots = [];
    for (const e of actualN) {
      if (want.has(e)) { continue; }
      const { path, kind } = splitPath(e);
      if (!eK.has(path)) { continue; }
      const other = eK.get(path);
      if (kind === "scalar" || other === "scalar") { nullableRoots.push(path); }
    }
    for (const e of expectedN) {
      if (have.has(e)) { continue; }
      const { path, kind } = splitPath(e);
      if (!aK.has(path)) { continue; }
      const other = aK.get(path);
      if (kind === "scalar" || other === "scalar") { nullableRoots.push(path); }
    }
    const belowNull = (pth) =>
      nullableRoots.some((r) => pth.startsWith(r + ".") || pth.startsWith(r + "["));

    for (const e of actualN) {
      if (want.has(e)) { continue; }
      const { path, kind } = splitPath(e);
      if (!eK.has(path)) {
        if (belowNull(path)) { beyondNull.push(e); } else { invented.push(e); }
        continue;
      }
      const other = eK.get(path);
      if (kind === "scalar" || other === "scalar") { nullable.push(path + " " + other + "/" + kind); }
      else { kindClash.push(path + ": server " + other + ", fixture " + kind); }
    }
    for (const e of expectedN) {
      if (have.has(e)) { continue; }
      const { path, kind } = splitPath(e);
      if (!aK.has(path)) { missing.push(e); }
    }
    totalInvented += invented.length + kindClash.length;
    totalMissing += missing.length;

    /* THE DANGEROUS DIRECTION. A path here is the fixture claiming the server returns
       something it does not — which is how a console suite ends up proving the fixture. */
    ok(read.key + ": THE FIXTURE INVENTS NOTHING THE SERVER DOES NOT RETURN",
      invented.length === 0,
      invented.length ? { count: invented.length, sample: invented.slice(0, 12) } : 0);

    /* object vs array is never an artefact. It is the shape a reader branches on. */
    ok(read.key + ": AND AGREES WITH THE SERVER ON OBJECT VERSUS ARRAY",
      kindClash.length === 0,
      kindClash.length ? kindClash.slice(0, 8) : 0);

    console.log("  " + read.key.padEnd(16) +
      " server " + String(expected.length).padStart(4) +
      " · fixture " + String(actual.paths.length).padStart(4) +
      " · invented " + String(invented.length).padStart(3) +
      " · clash " + String(kindClash.length).padStart(2) +
      " · nullable " + String(nullable.length).padStart(2) +
      " · below-null " + String(beyondNull.length).padStart(2) +
      " · missing " + String(missing.length).padStart(3) +
      (missing.length ? "   e.g. " + missing.slice(0, 3).join(", ") : ""));
  }

  ok("no page errors while reading the fixture", p.__errs.length === 0, p.__errs);
  console.log("\n  invented across all five: " + totalInvented +
    "   missing (reported, not failed): " + totalMissing);

  await ctx.close();
  await browser.close();
  console.log("\n  " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
