const fs = require('fs');
const vm = require('vm');
/* PATHS RESOLVE FROM THIS FILE, never from an absolute scratch path. This suite spent a
   fortnight in /tmp on a session container, reading its bundle out of a directory that did
   not exist anywhere else - so it was one container reclaim from gone, and runnable by
   nobody but the session that wrote it. Ported into the repo 9 Sep 2026. */
const ROOT = require("path").join(__dirname, "..");
const FIX = require("path").join(__dirname, "fixtures");
const ctx = { window: {}, fetch: () => Promise.resolve({ok:false}), Promise, Date, Number, String, Math, JSON, encodeURIComponent };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + "/hl-buyer-fields.js",'utf8'), ctx);
const B = ctx.window.HLBuyer;

const A = []; const ok=(n,c)=>A.push({n,pass:!!c});
const YEAR = 2026;

// --- real, well-formed SA IDs (check digit computed to be valid) ---
function withCheck(first12) {
  let sum=0, alt=true;                       // position 13 is the check digit
  for (let i=first12.length-1;i>=0;i--){ let n=Number(first12[i]); if(alt){n*=2; if(n>9)n-=9;} sum+=n; alt=!alt; }
  return first12 + String((10 - (sum % 10)) % 10);
}
const id1985 = withCheck('850101' + '5009' + '08');   // born 1 Jan 1985
const id2007 = withCheck('070315' + '5009' + '08');   // born 15 Mar 2007, turns 19 in 2026
const id1925 = withCheck('250612' + '5009' + '08');   // 12 Jun -> 2025 would make them 1, so 1925

ok("valid check digit accepted", B.luhnOk(id1985));
ok("a transposed digit is caught", !B.luhnOk(id1985.slice(0,3) + id1985[4] + id1985[3] + id1985.slice(5)));

let r = B.dobFromSaId(id1985, YEAR);
ok("1985 parses", r.ok && r.iso === "1985-01-01");
ok("1985 check digit reported good", r.checkDigitOk === true);

r = B.dobFromSaId(id2007, YEAR);
ok("2007 stays in this century (age 19)", r.ok && r.iso === "2007-03-15");

r = B.dobFromSaId(id1925, YEAR);
ok("yy=25 becomes 1925, not a 1-year-old buyer", r.ok && r.iso === "1925-06-12");

// --- the century rule is the whole point, so prove the naive rule would differ ---
ok("naive 'not in the future' would have said 2025", (2000+25) <= YEAR);

// --- rejections ---
ok("11 digits rejected", !B.dobFromSaId("85010150090", YEAR).ok);
ok("month 13 rejected", !B.dobFromSaId(withCheck('851301'+'5009'+'08'), YEAR).ok);
ok("31 February rejected", !B.dobFromSaId(withCheck('850231'+'5009'+'08'), YEAR).ok);
ok("empty rejected", !B.dobFromSaId("", YEAR).ok);
ok("spaces and dashes tolerated", B.dobFromSaId("850101 5009 08" + id1985[12], YEAR).iso === "1985-01-01");

// --- a bad check digit still yields a date, but flagged, never silently trusted ---
const bad = id1985.slice(0,12) + String((Number(id1985[12]) + 1) % 10);
r = B.dobFromSaId(bad, YEAR);
ok("bad check digit still parses the date", r.ok && r.iso === "1985-01-01");
ok("bad check digit is FLAGGED", r.checkDigitOk === false);

// --- buyer type gating ---
ok("Individual gates on", B.isIndividual("Individual"));
ok("case and spacing tolerated", B.isIndividual("  individual "));
ok("Company does not", !B.isIndividual("Company"));
ok("Trust does not", !B.isIndividual("Trust"));
ok("empty does not", !B.isIndividual(""));
ok("no substring match on 'Individual Trust'", !B.isIndividual("Individual Trust"));

// --- required gate ---
ok("blank nationality is caught", B.missingRequired({nationality:""}, ["nationality"]).length === 1);
ok("whitespace-only is caught", B.missingRequired({nationality:"   "}, ["nationality"]).length === 1);
ok("a real value passes", B.missingRequired({nationality:"ZA"}, ["nationality"]).length === 0);
ok("undefined is caught", B.missingRequired({}, ["nationality"]).length === 1);

// --- address suggest degrades, never throws ---
(async () => {
  const short = await B.addressSuggest("12");
  ok("a short term makes no request", short.length === 0);
  const down = await B.addressSuggest("1 Test Road Waterkloof");
  ok("a failing geocoder returns [] rather than throwing", Array.isArray(down) && down.length === 0);

  const fails = A.filter(a=>!a.pass);
  A.forEach(a => console.log((a.pass ? "  ok  " : "FAIL  ") + a.n));
  console.log("\n" + (A.length-fails.length) + "/" + A.length + " passed");
  process.exit(fails.length ? 1 : 0);
})();
