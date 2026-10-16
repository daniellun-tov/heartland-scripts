/* CRM PUSH (16 Oct). Every Sanford sign-up and every change to a member's homes is POSTed to
   the Property Funnels (LeadConnector) inbound webhook - before launch (the waitlist) AND after
   (the same list as favourites). jsdom, fetch and Memberstack stubbed: this grades what the page
   SENDS, never what the CRM does with it. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const SANFORD = fs.readFileSync(path.join(__dirname, "..", "heartland-sanford-v2.js"), "utf8");
const HOOK = "https://services.leadconnectorhq.com/hooks/QWZfk9PoAASowAZLLdv3/webhook-trigger/c35720c6-9624-4db1-8456-b398fdf6e91a";
const PLAN = "pln_sanford";

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log("  ok  " + m); } else { fail++; console.log("  FAIL " + m); } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms || 40));
const clone = (o) => JSON.parse(JSON.stringify(o));

function fakeMs(st) {
  return {
    getCurrentMember: async () => ({ data: st.member ? clone(st.member) : null }),
    addPlan: async ({ planId }) => { st.member.planConnections.push({ planId, active: true, status: "ACTIVE" }); return {}; },
    updateMember: async ({ customFields }) => { Object.assign(st.member.customFields, customFields); return { data: clone(st.member) }; },
    sendMemberSignupPasswordlessEmail: async ({ email }) => { if (st.known[email]) { throw { code: "email-already-in-use" }; } return {}; },
    sendMemberLoginPasswordlessEmail: async () => ({}),
    signupMemberPasswordless: async ({ email, plans, customFields }) => {
      st.member = { id: "mem_new", auth: { email }, customFields: Object.assign({}, customFields),
        planConnections: plans.map((p) => ({ planId: p.planId, active: true, status: "ACTIVE" })) };
      return { data: { member: clone(st.member) } };
    },
    loginMemberPasswordless: async ({ email }) => { st.member = st.known[email]; return { data: { member: clone(st.member) } }; },
    onAuthChange: () => {},
    logout: async () => ({})
  };
}
function member(email, homes, onPlan) {
  return { id: "mem_" + email.split("@")[0], auth: { email },
    customFields: { "waitlist-homes": homes, "waitlist-joined": "2026-10-01", "mobile-number": "0820000000" },
    planConnections: onPlan ? [{ planId: PLAN, active: true, status: "ACTIVE" }] : [{ planId: "pln_other", active: true, status: "ACTIVE" }] };
}

async function page(opts) {
  const attrs = 'data-sd2-page data-sd2-ms-plan="' + PLAN + '" ' +
    (opts.live ? 'data-sd2-phase="live"' : 'data-sd2-phase="prelaunch" data-sd2-launch="2099-01-01T12:00:00+02:00"') +
    (opts.hook ? ' data-sd2-crm-hook="' + opts.hook + '"' : "");
  const body = '<div ' + attrs + '>' +
    '<a href="#sd2-reserve" data-sd2-waitlist data-sd2-homes="4" id="join">Join</a>' +
    '<div data-sd2-auth>' +
      '<form data-sd2-auth-form="email"><input type="email"><input type="tel"><button type="submit">Go</button></form>' +
      '<form data-sd2-auth-form="code"><input type="text"><button type="submit">Verify</button></form>' +
      '<div data-sd2-auth-step="email"></div><div data-sd2-auth-step="code"></div><div data-sd2-auth-step="done"></div>' +
    '</div></div>';
  const dom = new JSDOM("<!doctype html><html><head></head><body>" + body + "</body></html>",
    { url: opts.url || "https://www.heartland.co.za/sanford", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const calls = [];
  w.fetch = (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return Promise.resolve({ status: 200 }); };
  w.matchMedia = w.matchMedia || function () { return { matches: false, addListener() {}, addEventListener() {} }; };
  w.HTMLFormElement.prototype.requestSubmit = function () { this.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })); };
  const st = { member: opts.member ? clone(opts.member) : null, known: opts.known || {} };
  w.$memberstackDom = fakeMs(st);
  try { w.eval(SANFORD); } catch (e) { console.log("  (bundle threw in fixture: " + e.message + ")"); }
  await wait(120);
  return { w, calls, st };
}
async function viaDialog(p, email) {
  const d = p.w.document;
  d.getElementById("join").dispatchEvent(new p.w.MouseEvent("click", { bubbles: true, cancelable: true }));
  d.querySelector("[data-sd2-auth-form=email] input[type=email]").value = email;
  d.querySelector("[data-sd2-auth-form=email]").dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
  await wait();
  d.querySelector("[data-sd2-auth-form=code] input").value = "123456";
  d.querySelector("[data-sd2-auth-form=code]").dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
  await wait(80);
}

(async function () {
  console.log("live: favourites");
  let p = await page({ live: true, member: member("ann@x.co", "Home 2", true) });
  ok(p.calls.length === 0, "a page load with a signed-in member sends nothing");
  ok(!!p.w.SD2_WAITLIST, "the waitlist/favourites API is up in the live phase");
  await p.w.SD2_WAITLIST.toggle("5"); await wait();
  let c = p.calls[0];
  ok(p.calls.length === 1 && c.url === HOOK, "adding a favourite POSTs once, to the Property Funnels hook");
  ok(c && c.init.method === "POST" && c.init.headers["Content-Type"] === "application/json", "as JSON");
  ok(c && c.body.event === "homes_updated" && c.body.list === "favourites" && c.body.phase === "live", "event homes_updated, list favourites, phase live");
  ok(c && c.body.homes === "Home 2, Home 5" && c.body.homes_added === "Home 5" && c.body.homes_removed === "", "carries the whole list and what was added");
  ok(c && c.body.email === "ann@x.co" && c.body.phone === "0820000000" && c.body.development === "Sanford Heart", "carries email, phone and the development");
  ok(c && c.body.environment === "production", "www is marked production");
  await p.w.SD2_WAITLIST.toggle("2"); await wait();
  c = p.calls[1];
  ok(p.calls.length === 2 && c.body.homes === "Home 5" && c.body.homes_removed === "Home 2", "removing a favourite is sent too");

  console.log("live: a Heartland member who isn't on the Sanford list yet");
  p = await page({ live: true, member: member("ben@x.co", "", false) });
  await p.w.SD2_WAITLIST.toggle("3"); await wait();
  c = p.calls[0];
  ok(p.calls.length === 1 && c.body.event === "signup" && c.body.homes === "Home 3", "first heart = signup, with the home");

  console.log("pre-launch: sign-up through the dialog");
  p = await page({ live: false });
  await viaDialog(p, "cat@x.co");
  c = p.calls[0];
  ok(p.calls.length === 1, "one POST for a new sign-up");
  ok(c && c.body.event === "signup" && c.body.list === "waitlist" && c.body.phase === "prelaunch", "event signup, list waitlist, phase prelaunch");
  ok(c && c.body.email === "cat@x.co" && c.body.homes === "Home 4" && c.body.member_id === "mem_new", "with the email, the home it was joined for and the member id");

  console.log("returning member signs in, nothing changes");
  const dan = member("dan@x.co", "Home 4", true);
  p = await page({ live: false, known: { "dan@x.co": dan } });
  await viaDialog(p, "dan@x.co");
  ok(p.calls.length === 0, "a sign-in that changes nothing sends nothing");

  console.log("switches");
  p = await page({ live: true, member: member("eve@x.co", "", true), hook: "off" });
  await p.w.SD2_WAITLIST.toggle("1"); await wait();
  ok(p.calls.length === 0, "data-sd2-crm-hook=\"off\" sends nothing");
  p = await page({ live: true, member: member("fay@x.co", "", true), hook: "https://example.com/h" });
  await p.w.SD2_WAITLIST.toggle("1"); await wait();
  ok(p.calls.length === 1 && p.calls[0].url === "https://example.com/h", "data-sd2-crm-hook overrides the URL");
  p = await page({ live: true, member: member("gus@x.co", "", true), url: "https://heartlandpropertydevelopers.webflow.io/sanford" });
  await p.w.SD2_WAITLIST.toggle("1"); await wait();
  ok(p.calls.length === 1 && p.calls[0].body.environment === "staging", "staging posts, marked staging");

  console.log("\n" + pass + "/" + (pass + fail) + " passed");
  process.exit(fail ? 1 : 0);
})();
