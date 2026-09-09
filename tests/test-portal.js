/* ============================================================================
   The owners portal module.
   ========================================================================== */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
/* PATHS RESOLVE FROM THIS FILE, never from an absolute scratch path. This suite spent a
   fortnight in /tmp on a session container, reading its bundle out of a directory that did
   not exist anywhere else - so it was one container reclaim from gone, and runnable by
   nobody but the session that wrote it. Ported into the repo 9 Sep 2026. */
const ROOT = require("path").join(__dirname, "..");
const FIX = require("path").join(__dirname, "fixtures");
const SRC = fs.readFileSync(ROOT + "/heartland-reserve.js", 'utf8');
const PAGE = fs.readFileSync(FIX + "/portal-fixture.html", 'utf8');

const A = []; const ok = (n, c) => A.push({ n, pass: !!c });
const DAY = 24 * 60 * 60 * 1000;

function res(over) {
  return Object.assign({
    uuid: "res-1", reference: "HL-0001", status: "confirmed",
    property_slug: "sanford", property_name: "Sanford Heart",
    theme: { primary: "#8a9380", secondary: "#845e46" },
    unit: { name: "Sanford Heart 06", display_name: "Home 6" },
    total_cents: 359500000, purchase_deposit_cents: 35950000,
    payer_route: "bond", deal_stage: "finance", deal_sub_stage: "sign-otp",
    deal_stage_due_at: Date.now() + 10 * DAY,
    otp_url: "https://sign.zoho.com/x"
  }, over || {});
}

function boot(opts) {
  opts = opts || {};
  const calls = [], warns = [], logs = [], redirects = [];
  const page = opts.page || PAGE;
  /* jsdom refuses to navigate and reports it here. It does not say where to, so the
     destination is asserted through HLPortal.loginPath() - the same function the
     module itself navigates with. */
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (/navigation/i.test(e.message)) { redirects.push(e.message); } });
  const dom = new JSDOM('<!doctype html><html><body>' + page + '</body></html>', {
    runScripts: "dangerously",
    virtualConsole: vc,
    url: "https://www.heartland.co.za/portal" + (opts.search || ""),
    beforeParse(w) {
      if (opts.wrapTabs) {
        /* jsdom has no layout, so offsetTop is 0 for everything and no row ever looks
           wrapped. Supplying the geometry BEFORE the module runs is what lets the
           collapse be tested as render() actually performs it - which is the only way
           to test the ORDER of carrySelection and fitNav. */
        Object.defineProperty(w.HTMLElement.prototype, 'offsetTop', {
          get() { return this.id === 'tab-docs' ? 34 : 0; }, configurable: true
        });
      }
      if (opts.session) {
        Object.keys(opts.session).forEach(k => w.sessionStorage.setItem(k, opts.session[k]));
      }
      /* The staff token the console leaves behind. sessionStorage is copied into a tab
         opened from the same origin, which is how a real preview gets it. */
      if (opts.staffToken !== undefined) {
        if (opts.staffToken) { w.sessionStorage.setItem('hl_staff_token', opts.staffToken); }
      }
      /* The one-time note the console leaves in localStorage. */
      if (opts.handoff !== undefined) {
        w.localStorage.setItem('hl_preview_handoff',
          typeof opts.handoff === 'string' ? opts.handoff : JSON.stringify(opts.handoff));
      }
      w.console.warn = (...a) => warns.push(a.join(' '));
      w.console.log = (...a) => logs.push(a.join(' '));
      /* WHERE THE TOKEN LIVES IS PART OF THE TEST NOW. Every test before 30 Aug put
         it in a cookie, which is the one place the live site does NOT keep it - so the
         suite was green while the portal bounced every real member back to the login
         page. localStorage is the default here because localStorage is what Memberstack
         actually uses; the cookie is kept as a case, not as the assumption. */
      if (opts.blockStorage) {
        /* Chrome's "block third-party cookies and site data" makes these throw. */
        const boom = () => { throw new Error('The operation is insecure.'); };
        Object.defineProperty(w, 'localStorage', { get: boom, configurable: true });
      }
      if (!opts.noCookie) {
        var where = opts.tokenIn || 'local';
        var tok = opts.token === undefined ? "ms-token-abc" : opts.token;
        if (where === 'cookie') { w.document.cookie = "_ms-mid=" + tok; }
        else if (where === 'session') { w.sessionStorage.setItem("_ms-mid", tok); }
        else if (where === 'local') { w.localStorage.setItem("_ms-mid", tok); }
        else if (where === 'quoted') { w.localStorage.setItem("_ms-mid", '"' + tok + '"'); }
      }
      w.fetch = (url, o) => {
        const u = String(url);
        calls.push({ url: u, method: (o && o.method) || 'GET', body: o && o.body ? JSON.parse(o.body) : null,
                     auth: (o && o.headers && o.headers.Authorization) || null });
        let body;
        if (u.indexOf('/auth/memberstack') > -1) {
          if (opts.authFails) { return Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve('{"message":"nope"}') }); }
          body = { authToken: "xano-token-xyz" };
          /* The new Xano returns the reservations on the exchange. opts.oldXano
             reproduces the shape that does not, which the bundle must still handle. */
          if (!opts.oldXano) {
            body.reservations = opts.list === undefined ? [res()] : opts.list;
            body.count = body.reservations.length;
            body.server_time = opts.serverTime === undefined ? Date.now() : opts.serverTime;
          }
        } else if (u.indexOf('/member/reservations') > -1) {
          body = { member: { email: "d@x.co" },
                   count: (opts.list || [res()]).length,
                   reservations: opts.list === undefined ? [res()] : opts.list,
                   server_time: opts.serverTime === undefined ? Date.now() : opts.serverTime };
        } else if (u.indexOf('/portal-view') > -1) {
          if (opts.previewFails) {
            return Promise.resolve({ ok: false, status: 403,
              text: () => Promise.resolve('{"message":"Not permitted."}') });
          }
          body = { viewing_as: "buyer", viewed_by: "Sipho N",
                   reservation: opts.previewRes || res(),
                   server_time: opts.serverTime === undefined ? Date.now() : opts.serverTime };
        } else if (u.indexOf('/public/config') > -1) {
          body = { properties: [] };
        } else {
          body = {};
        }
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) });
      };
    }
  });
  const w = dom.window;
  w.eval(SRC);
  const $ = s => w.document.querySelector(s);
  const all = s => Array.from(w.document.querySelectorAll(s));
  const shown = s => { const e = $(s); return e && e.style.display !== 'none'; };
  const session = k => { try { return w.sessionStorage.getItem(k); } catch (e) { return null; } };
  return { w, d: w.document, calls, warns, logs, redirects, session, $, all, shown };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const rows = (b, name = 'documents') => b.all(`[data-hl-list="${name}"] [data-hl-row]`);
  /* ---------------------------------------------------- the happy path */
  {
    const b = boot();
    await wait(80);
    ok("it exchanges the Memberstack cookie for a Xano token",
       b.calls.some(c => c.url.indexOf('/auth/memberstack') > -1 && c.body.token === 'ms-token-abc'));
    ok("and takes the reservations off that same response - ONE round trip",
       b.calls.length === 1 && !b.calls.some(c => c.url.indexOf('/member/reservations') > -1));
    ok("the body is shown and the loading state is gone",
       b.shown('[data-hl-portal-body]') && !b.shown('[data-hl-portal-loading]'));
    ok("the reservation renders through the shared contract",
       b.$('[data-hl="unit.name"]').textContent === "Sanford Heart 06");
    ok("money is formatted, not printed raw",
       b.$('[data-hl="total_cents"]').textContent === "R3,595,000.00");
    ok("the property's colours are written onto the theme root",
       b.$('[data-hl-theme]').style.getPropertyValue('--hl-primary') === '#8a9380');
    ok("and the property is named on the document, for any CSS that wants it",
       b.d.documentElement.getAttribute('data-hl-property') === 'sanford');
  }

  /* ---------------------------------------------------- the tracker */
  {
    const b = boot();
    await wait(80);
    const cls = s => b.$(s).className;
    ok("the current stage is active", /is-active/.test(cls('[data-hl-stage="finance"]')));
    ok("an earlier stage is done", /is-done/.test(cls('[data-hl-stage="reserve"]')));
    ok("a later stage is neither", /is-todo/.test(cls('[data-hl-stage="build"]')));
    ok("the current sub-step is active", /is-active/.test(cls('[data-hl-substage="sign-otp"]')));
    ok("an earlier sub-step is done", /is-done/.test(cls('[data-hl-substage="pre-qualify"]')));
  }

  /* ------------------------------------- the reserve step is always behind them */
  {
    /* The row can honestly still say reserve for the minutes between the payment and
       the ITN that moves it - and in that window the buyer is looking at the page. */
    const b = boot({ list: [res({ deal_stage: "reserve", deal_sub_stage: "" })] });
    await wait(80);
    const cls = sel => b.$(sel).className;
    ok("a deal still marked reserve shows reserve as DONE",
       /is-done/.test(cls('[data-hl-stage="reserve"]')));
    ok("and finance as the step they are on",
       /is-active/.test(cls('[data-hl-stage="finance"]')));
    ok("with the route's first sub-step lit rather than nothing",
       /is-active/.test(cls('[data-hl-substage="pre-qualify"]')));
    ok("and named, so the page says what to do",
       b.$('[data-hl-next-title]').textContent === "Pre-qualify");
  }

  {
    const b = boot({ list: [res({ deal_stage: "", deal_sub_stage: "" })] });
    await wait(80);
    ok("no stage at all is treated the same way",
       /is-active/.test(b.$('[data-hl-stage="finance"]').className));
  }

  {
    /* A cash buyer's first step is not a bond buyer's first step. */
    const b = boot({ list: [res({ payer_route: "cash", deal_stage: "reserve", deal_sub_stage: "" })] });
    await wait(80);
    ok("a cash buyer floors to THEIR first step, not to pre-qualify",
       /is-active/.test(b.$('[data-hl-substage="sign-otp"]').className));
  }

  {
    /* THE FLOOR IS SCOPED TO FINANCE, and this is the case that proves why. A deal in
       build has no finance sub-stage because it is past them. Flooring that would hand
       a buyer watching their house go up a deck about signing the OTP. */
    const b = boot({ list: [res({ deal_stage: "build", deal_sub_stage: "" })] });
    await wait(80);
    ok("a deal past finance is not sent back to step one",
       !/is-active/.test(b.$('[data-hl-substage="pre-qualify"]').className));
    ok("and build is the active stage",
       /is-active/.test(b.$('[data-hl-stage="build"]').className));
  }

  {
    /* EMPTY means not started. UNKNOWN means Xano moved on past this file - and
       answering that with "pre-qualify" would be worse than answering awkwardly. */
    const b = boot({ list: [res({ deal_stage: "finance", deal_sub_stage: "snagging" })] });
    await wait(80);
    ok("an unrecognised sub-step is not floored to step one",
       !/is-active/.test(b.$('[data-hl-substage="pre-qualify"]').className));
    ok("it gets the generic sentence rather than a wrong specific one",
       b.$('[data-hl-countdown-label]').textContent === "Time left on this step");
  }

  {
    /* THE ONE THAT MATTERS for a cash buyer: three of the six finance steps are not
       theirs, and showing them as "not yet" promises something that will never come. */
    const b = boot({ list: [res({ payer_route: "cash", deal_sub_stage: "pay-deposit" })] });
    await wait(80);
    ok("a cash buyer is not shown pre-qualify", !b.shown('[data-hl-substage="pre-qualify"]'));
    ok("nor either bond step",
       !b.shown('[data-hl-substage="bond-approval"]') && !b.shown('[data-hl-substage="bond-approved"]'));
    ok("but is shown the steps that are theirs",
       b.shown('[data-hl-substage="sign-otp"]') && b.shown('[data-hl-substage="transfer-attorneys"]'));
    ok("and the cash panel, not the bond one",
       b.shown('[data-hl-route="cash"]') && !b.shown('[data-hl-route="bond"]'));
  }

  /* ---------------------------------------------------- the countdown */
  {
    const b = boot();
    await wait(80);
    ok("ten days out reads as ten", b.$('[data-hl-countdown]').textContent === "10");
    ok("and is not flagged", b.$('[data-hl-countdown]').getAttribute('data-hl-countdown-state') === "ok");
    ok("the due date is written out", /\d{4}$/.test(b.$('[data-hl-due]').textContent));
  }

  {
    const b = boot({ list: [res({ deal_stage_due_at: Date.now() + 2 * DAY })] });
    await wait(80);
    ok("two days out is flagged as due soon",
       b.$('[data-hl-countdown]').getAttribute('data-hl-countdown-state') === "due-soon");
  }

  {
    const b = boot({ list: [res({ deal_stage_due_at: Date.now() - 2 * DAY })] });
    await wait(80);
    ok("a passed deadline is overdue",
       b.$('[data-hl-countdown]').getAttribute('data-hl-countdown-state') === "overdue");
    ok("and never shows a negative number of days",
       b.$('[data-hl-countdown]').textContent === "0");
  }

  {
    /* Eighteen hours is one day left, not none. Telling a buyer they have no days
       while they still have the evening is how a portal causes a phone call. */
    const b = boot({ list: [res({ deal_stage_due_at: Date.now() + 18 * 60 * 60 * 1000 })] });
    await wait(80);
    ok("part of a day still counts as a day", b.$('[data-hl-countdown]').textContent === "1");
  }

  {
    const b = boot({ list: [res({ deal_stage_due_at: null })] });
    await wait(80);
    ok("a stage with no deadline hides the countdown entirely",
       !b.shown('[data-hl-countdown-wrap]'));
  }

  {
    /* THE DEVICE CLOCK IS NOT TRUSTED. A buyer whose laptop is a week fast is exactly
       the buyer who will be told a deadline has passed when it has not. */
    const b = boot({ serverTime: Date.now() - 7 * DAY,
                     list: [res({ deal_stage_due_at: Date.now() - 3 * DAY })] });
    await wait(80);
    ok("a deadline is measured against the server, not the browser",
       b.$('[data-hl-countdown]').getAttribute('data-hl-countdown-state') !== "overdue");
    ok("and the offset is recorded", Math.abs(b.w.HLPortal.offset()) > 6 * DAY);
  }

  /* ------------------------------------------- the clock, to the second */
  {
    const HOUR = 60 * 60 * 1000, MIN = 60 * 1000;
    const b = boot({ list: [res({ deal_stage_due_at: Date.now() + 2 * DAY + 3 * HOUR + 4 * MIN + 30000 })] });
    await wait(80);
    const n = s => b.$(s).textContent;
    ok("the clock breaks the deadline down into days", n('[data-hl-cd-d]') === "2");
    ok("hours, zero-padded", n('[data-hl-cd-h]') === "03");
    ok("minutes, zero-padded", n('[data-hl-cd-m]') === "04");
    ok("and seconds, which are counting", Number(n('[data-hl-cd-s]')) >= 27 && Number(n('[data-hl-cd-s]')) <= 30);
    ok("the whole span is also available in one element",
       /^2d 03:04:(2[7-9]|30)$/.test(n('[data-hl-countdown-exact]')));
    ok("the units are labelled in the plural where they should be",
       n('[data-hl-cd-d-label]') === "Days" && n('[data-hl-cd-h-label]') === "Hours");
    ok("and the clock is running", b.w.HLPortal.clockRunning() === true);
  }

  /* --------------------------------- what the clock is counting */
  {
    const b = boot({ list: [res({ deal_sub_stage: "sign-otp" })] });
    await wait(80);
    ok("the clock says what it is counting, not just how long",
       b.$('[data-hl-countdown-label]').textContent === "Time left to sign your Offer to Purchase");
  }

  {
    const b = boot({ list: [res({ deal_sub_stage: "pay-deposit" })] });
    await wait(80);
    ok("and it follows the sub-step",
       b.$('[data-hl-countdown-label]').textContent === "Time left to pay your deposit");
  }

  {
    /* "Time left to sign your Offer to Purchase" above four zeros is worse than no
       label at all, so the passed wording is its own map rather than a prefix. */
    const b = boot({ list: [res({ deal_sub_stage: "sign-otp", days_left: -2, is_overdue: true,
                                  deal_stage_due_at: Date.now() - 2 * DAY })] });
    await wait(80);
    ok("a passed deadline says so rather than promising time that is gone",
       b.$('[data-hl-countdown-label]').textContent ===
         "Your deadline to sign the Offer to Purchase has passed");
  }

  {
    const b = boot({ list: [res({ deal_sub_stage: "sign-otp", deal_stage_due_at: null })] });
    await wait(80);
    ok("no deadline, no label", b.$('[data-hl-countdown-label]').textContent === "");
  }

  {
    /* A sub-stage added in Xano tomorrow must read awkwardly, not blankly. */
    const b = boot({ list: [res({ deal_sub_stage: "snagging" })] });
    await wait(80);
    ok("an unknown sub-step still gets a sentence",
       b.$('[data-hl-countdown-label]').textContent === "Time left on this step");
  }

  /* ------------------------------------------------- three screens, one page */
  {
    /* SETTLED BEFORE THE FETCH. Which tab is open is a question the url answers on its
       own, and panels that are only hidden as a side effect of rendering a reservation
       are stacked for everyone who never gets one - a signed-out visitor, a member
       with none, a member who has not chosen between two homes. The body happens to be
       hidden in all three cases, and a correctness that depends on something else
       being hidden is not one. */
    const b = boot({ authFails: true });
    await wait(80);
    ok("the inactive panels are hidden even when no reservation ever loads",
       b.shown('#panel-home') && !b.shown('#panel-order') && !b.shown('#panel-docs'));
  }

  {
    const b = boot({ list: [] });
    await wait(80);
    ok("and for a member who holds none",
       b.shown('#panel-home') && !b.shown('#panel-order'));
  }


  /* The whole point: a tab change must touch the network ZERO times. Three pages paid
     for the same Memberstack exchange and the same Xano round trip three times over,
     to show data the first load already had. */
  {
    const b = boot();
    await wait(80);
    const before = b.calls.length;
    ok("only the home panel is shown at rest",
       b.shown('#panel-home') && !b.shown('#panel-order') && !b.shown('#panel-docs'));

    b.$('#tab-order').dispatchEvent(new b.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(20);
    ok("clicking a tab swaps the panel", b.shown('#panel-order') && !b.shown('#panel-home'));
    ok("AND MAKES NO REQUEST AT ALL", b.calls.length === before);
    ok("the url says which tab", b.w.location.search.indexOf('tab=order') > -1);
    ok("the clicked tab is marked current",
       b.$('#tab-order').getAttribute('aria-current') === 'page' &&
       !b.$('#tab-home').hasAttribute('aria-current'));
  }

  {
    /* Real anchors, intercepted - not buttons pretending. A modified click belongs to
       the browser, or the link is lying about being a link. */
    const b = boot();
    await wait(80);
    const ev = new b.w.MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    b.$('#tab-order').dispatchEvent(ev);
    ok("a cmd-click is left alone so it can open in a new tab", ev.defaultPrevented === false);
    ok("and the page does not switch under it", b.shown('#panel-home'));
  }

  {
    const b = boot({ search: "?tab=documents" });
    await wait(80);
    ok("the url decides which tab opens on load", b.shown('#panel-docs') && !b.shown('#panel-home'));
    ok("with no push, because this IS the url",
       b.w.location.search === '?tab=documents');
  }

  {
    const b = boot({ search: "?tab=nonsense" });
    await wait(80);
    /* Asserting only that home is shown passes even when NOTHING was hidden - every
       panel is visible by default. The other two have to be checked. */
    ok("a tab that does not exist falls back to the dashboard rather than a blank page",
       b.shown('#panel-home') && !b.shown('#panel-order') && !b.shown('#panel-docs'));
    ok("and does not leave a bogus tab in the url for the buyer to bookmark",
       b.w.HLPortal.tab() === 'home');

    /* TWO GUARDS, AND EACH HIDES THE OTHER through boot(): tabFromUrl refuses an
       unknown name, and showTab refuses it again. Calling showTab directly is the only
       way to test the second one, and it is the one a future caller will rely on. */
    b.w.HLPortal.showTab('order', false);
    b.w.HLPortal.showTab('nonsense', false);
    ok("showTab falls an unknown tab back to the dashboard rather than leaving the buyer where they were",
       b.shown('#panel-home') && !b.shown('#panel-order'));
  }

  {
    /* ?r= MUST SURVIVE. A two-home buyer who loses it lands on the other home's order
       summary, under the right name, with the wrong number on it. */
    const b = boot({ search: "?r=b", list: [res({ uuid: "a" }), res({ uuid: "b" })] });
    await wait(80);
    b.$('#tab-order').dispatchEvent(new b.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(20);
    ok("the chosen home travels with the tab",
       b.w.location.search.indexOf('r=b') > -1 && b.w.location.search.indexOf('tab=order') > -1);
  }

  {
    const b = boot();
    await wait(80);
    b.$('#tab-order').dispatchEvent(new b.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(20);
    b.w.history.back();
    await wait(60);
    ok("back returns to the dashboard rather than leaving the page",
       b.shown('#panel-home') && !b.shown('#panel-order'));
  }

  {
    /* /portal-order and /portal-documents are signposts now. A link, a bookmark or an
       email that predates the consolidation must still arrive somewhere correct. */
    const b = boot({ page: '<div data-hl-portal data-hl-login="/portal-login" data-hl-tab-redirect="order">' +
                           '<div data-hl-topbar-menu><a href="#" data-ms-action="logout">Log out</a></div>' +
                           '<div data-hl-portal-loading>Loading your home</div></div>',
                     search: "?r=b" });
    await wait(80);
    ok("a retired page computes the right tab to forward to",
       b.w.HLPortal.tabRedirectTarget() === '/portal?tab=order&r=b');
    ok("it actually tried to navigate",
       b.redirects.length > 0);
    ok("and did not authenticate first - there is nothing here to show",
       b.calls.length === 0);
    /* A SIGNPOST DOES NO WORK ON ITS WAY OUT. It used to build the navbar and write
       the loading state first, on a page that was never going to fetch anything. The
       flash a phone actually shows comes from this page's own HTML, which is why the
       cure is not coming here at all - the collapsed tab select now switches a panel
       instead of navigating - but a page that is leaving should still touch nothing. */
    ok("and builds no navbar on its way out",
       !b.$('[data-hl-topbar-list]'));
  }

  {
    /* THE HOP THAT BROKE THE PREVIEW. The hamburger menu's links are deliberately not
       intercepted as tabs, so they are real navigations to these signpost pages.
       Forwarding without the preview handle landed a salesperson on a /portal that
       tried to authenticate them as a member and bounced them to the buyer login. */
    const b = boot({ page: '<div data-hl-portal data-hl-login="/portal-login" data-hl-tab-redirect="documents"></div>',
                     search: "?preview=res-9", noCookie: true });
    await wait(80);
    ok("a signpost page carries the preview through to the portal",
       b.w.HLPortal.tabRedirectTarget() === '/portal?tab=documents&preview=res-9');
  }

  {
    /* The remembered selection belongs to whoever last used this browser AS A BUYER.
       Carrying it into a preview would open the wrong home. */
    const b = boot({ page: '<div data-hl-portal data-hl-login="/portal-login" data-hl-tab-redirect="order"></div>',
                     search: "?preview=res-9", noCookie: true,
                     session: { hl_portal_sel: 'someone-elses-home' } });
    await wait(80);
    ok("and the preview REPLACES the remembered home rather than joining it",
       b.w.HLPortal.tabRedirectTarget() === '/portal?tab=order&preview=res-9');
  }

  /* ------------------------------------------- the tabs, when they do not fit */

  /* jsdom has no layout, so offsetTop is 0 for everything and nothing ever looks
     wrapped. These tests SUPPLY the geometry - which is the honest way to test a
     measurement, because it lets the wrapped and unwrapped cases both be real. */
  const setTops = (b, tops) => {
    const links = b.all('[data-hl-nav] a');
    links.forEach((el, i) => Object.defineProperty(el, 'offsetTop', {
      value: tops[i], configurable: true
    }));
    return links;
  };

  {
    const b = boot();
    await wait(80);
    setTops(b, [0, 0, 0, 0]);
    b.w.HLPortal.fitNav();
    ok("four tabs on one line stay four links", !b.$('[data-hl-nav-select]'));
    ok("and the links are visible", b.$('#tab-order').style.display !== 'none');
  }

  {
    const b = boot();
    await wait(80);
    setTops(b, [0, 0, 0, 34]);
    b.w.HLPortal.fitNav();
    const sel = b.$('[data-hl-nav-select]');
    ok("tabs that wrap collapse to a dropdown", !!sel && sel.tagName === 'SELECT');
    ok("one option per tab", sel.options.length === 4);
    ok("named from the links, not from a list in here",
       sel.options[1].textContent === 'Your order');
    ok("the page you are on is the one selected",
       sel.options[0].selected === true && sel.options[0].value.indexOf('/portal') === 0);
    ok("and the wrapped links are hidden rather than removed",
       b.$('#tab-order').style.display === 'none' && !!b.$('#tab-order'));
  }

  {
    /* THE LOOP THIS PREVENTS: measure while collapsed and the hidden links read as
       zero-width, so they "fit", so they expand - and the next resize collapses them
       again, forever. fitNav must expand before it measures. */
    const b = boot();
    await wait(80);
    setTops(b, [0, 0, 0, 34]);
    b.w.HLPortal.fitNav();
    ok("collapsed first", b.$('#tab-order').style.display === 'none');
    setTops(b, [0, 0, 0, 0]);
    b.w.HLPortal.fitNav();
    ok("a wider window puts the links back",
       b.$('#tab-order').style.display !== 'none');
    ok("and hides the dropdown rather than leaving both",
       b.$('[data-hl-nav-select]').style.display === 'none');
  }

  {
    /* THE ORDER OF carrySelection AND fitNav, tested where it actually happens -
       inside render(), with no help from this file afterwards. The select is built
       from the anchors' hrefs, and carrySelection is what writes ?r= onto them. Build
       the select first and every tab change silently drops the chosen home. */
    const b = boot({ wrapTabs: true, search: "?r=b",
                     list: [res({ uuid: "a" }), res({ uuid: "b" })] });
    await wait(80);
    const sel = b.$('[data-hl-nav-select]');
    ok("render collapses a wrapped row on its own", !!sel);
    ok("and the dropdown carries the chosen home to the other screens",
       sel.options[1].value === '/portal-order?r=b');
  }

  {
    /* Rebuilt from the anchors on every fit, not built once and kept. A cached select
       is a select that goes stale the moment anything rewrites an href. */
    const b = boot({ wrapTabs: true, search: "?r=b",
                     list: [res({ uuid: "a" }), res({ uuid: "b" })] });
    await wait(80);
    b.$('#tab-order').setAttribute('href', '/portal-order?r=changed');
    b.w.HLPortal.fitNav();
    ok("a changed link changes the option",
       b.$('[data-hl-nav-select]').options[1].value === '/portal-order?r=changed');
  }

  {
    /* THE COLLAPSED NAV MUST NOT RELOAD THE PAGE. It used to set location.href, which
       is a whole page load - Memberstack again, the member endpoint again - to show
       data the page already had, and the buyer watched "Loading your home" every time.
       Invisible while three tabs fit on a line; a fourth made the row wrap on a laptop
       and put it in front of everybody. */
    const b = boot({ wrapTabs: true });
    await wait(80);
    const sel = b.$('[data-hl-nav-select]');
    ok("every option knows which tab it is",
       Array.from(sel.options).map(o => o.getAttribute('data-hl-tab')).join(',') ===
       'home,order,documents,team');

    const before = b.redirects.length;
    sel.value = sel.options[1].value;
    sel.dispatchEvent(new b.w.Event('change'));
    ok("choosing a tab in the dropdown switches the panel",
       b.w.HLPortal.tab() === 'order' &&
       b.$('[data-hl-tab-panel="order"]').style.display !== 'none');
    ok("and does NOT navigate", b.redirects.length === before);
    ok("and the home panel goes away rather than both showing",
       b.$('[data-hl-tab-panel="home"]').style.display === 'none');
  }

  {
    /* The href stays on the option as the fallback. A select that cannot reach its
       destination is worse than a slow one: with no matching panel - an older page, a
       second portal - the browser still gets to do its job. */
    const b = boot({ wrapTabs: true });
    await wait(80);
    const sel = b.$('[data-hl-nav-select]');
    const opt = sel.options[1];
    opt.setAttribute('data-hl-tab', 'nosuchtab');
    b.$('[data-hl-tab-panel="order"]').setAttribute('data-hl-tab-panel', 'retired');
    const before = b.redirects.length;
    sel.value = opt.value;
    sel.dispatchEvent(new b.w.Event('change'));
    /* jsdom refuses to navigate and does not report where to, so the assertion is
       that it TRIED - which is the whole point of keeping the href on the option. */
    ok("a tab with no panel still navigates", b.redirects.length > before);
  }

  {
    /* "1 Days" is the kind of thing a buyer photographs and sends to their agent. */
    const b = boot({ list: [res({ deal_stage_due_at: Date.now() + DAY + 60 * 60 * 1000 + 60 * 1000 + 1500 })] });
    await wait(80);
    ok("one of anything is singular",
       b.$('[data-hl-cd-d-label]').textContent === "Day" &&
       b.$('[data-hl-cd-h-label]').textContent === "Hour" &&
       b.$('[data-hl-cd-m-label]').textContent === "Minute");
  }

  {
    /* THE HEADLINE AND THE CLOCK DISAGREE BY DESIGN, and the disagreement is a
       rounding: eighteen hours is "1 day" as a badge and "0d 18h" as a clock. This
       test exists so that nobody later "fixes" one of them into the other. */
    const b = boot({ list: [res({ deal_stage_due_at: Date.now() + 18 * 60 * 60 * 1000 })] });
    await wait(80);
    ok("the badge rounds a part-day up", b.$('[data-hl-countdown]').textContent === "1");
    ok("the clock does not", b.$('[data-hl-cd-d]').textContent === "0");
    ok("and on the last day the one-line form drops the days",
       /^17:5\d:\d\d$/.test(b.$('[data-hl-countdown-exact]').textContent));
  }

  {
    const b = boot({ list: [res({ deal_stage_due_at: Date.now() + 30000 })] });
    const first = (await wait(80), b.$('[data-hl-cd-s]').textContent);
    await wait(1150);
    ok("the clock actually ticks", b.$('[data-hl-cd-s]').textContent !== first);
    ok("and counts down rather than up",
       Number(b.$('[data-hl-cd-s]').textContent) < Number(first));
  }

  {
    const b = boot({ list: [res({ deal_stage_due_at: Date.now() - 2 * DAY })] });
    await wait(80);
    ok("a passed deadline shows zeros, never a negative",
       b.$('[data-hl-cd-d]').textContent === "0" && b.$('[data-hl-cd-h]').textContent === "00" &&
       b.$('[data-hl-cd-m]').textContent === "00" && b.$('[data-hl-cd-s]').textContent === "00");
    ok("and stops the clock - there is nothing left to count",
       b.w.HLPortal.clockRunning() === false);
  }

  {
    /* A cancelled reservation left open overnight must not wake the device once a
       second to redraw a number that cannot change. */
    const b = boot({ list: [res({ is_blocked: true, blocked_reason: "The deadline passed.",
                                  deal_stage_due_at: Date.now() + 5 * DAY })] });
    await wait(80);
    ok("a blocked reservation runs no clock", b.w.HLPortal.clockRunning() === false);
  }

  {
    const b = boot({ list: [res({ deal_stage_due_at: null })] });
    await wait(80);
    ok("no deadline means no clock at all, not a row of zeros",
       b.$('[data-hl-cd-d]').textContent === "" && b.$('[data-hl-cd-s]').textContent === "" &&
       b.$('[data-hl-countdown-exact]').textContent === "");
    ok("and nothing is ticking", b.w.HLPortal.clockRunning() === false);
  }

  {
    /* The same server-offset rule the day count obeys: a laptop a week fast must not
       run the clock down to zero on a buyer who still has four days. */
    const b = boot({ serverTime: Date.now() - 7 * DAY,
                     list: [res({ deal_stage_due_at: Date.now() - 3 * DAY })] });
    await wait(80);
    ok("the clock is corrected by the server offset too",
       b.$('[data-hl-cd-d]').textContent === "3" || b.$('[data-hl-cd-d]').textContent === "4");
    ok("and it is still running", b.w.HLPortal.clockRunning() === true);
  }

  /* ---------------------------------------------------- choosing a home

     A buyer can reserve more than one unit, so "which home" is a real question the
     portal has to ask rather than answer for them. With several held and none chosen
     the index is shown; the dashboard appears only once one IS chosen. */
  const SEL = 'hl_portal_sel';
  const two = () => [res({ uuid: "a", status: "draft" }), res({ uuid: "b", status: "confirmed" })];
  const cards = b => b.all('[data-hl-index] [data-hl-index-row]');

  {
    const b = boot({ list: two() });
    await wait(80);
    ok("with several homes and none chosen, nothing is chosen for them",
       b.w.HLPortal.get() === null);
    ok("the index is shown and the dashboard is not",
       b.shown('[data-hl-portal-index]') && !b.shown('[data-hl-portal-body]'));
    ok("one card per home", cards(b).length === 2);
    ok("each card links to its own home",
       cards(b).map(c => c.getAttribute('href')).sort().join('|') === '?r=a|?r=b');
    ok("and opens in the same tab - it is the buyer's own dashboard",
       cards(b).every(c => !c.getAttribute('target')));
    ok("the card is stamped with its home",
       cards(b).map(c => c.getAttribute('data-hl-row-key')).sort().join('|') === 'a|b');
  }

  {
    const b = boot({ search: "?r=a", list: two() });
    await wait(80);
    ok("the parameter names which one", b.w.HLPortal.get().uuid === "a");
    ok("and the dashboard replaces the index",
       b.shown('[data-hl-portal-body]') && !b.shown('[data-hl-portal-index]'));
    ok("a switcher appears", b.shown('[data-hl-switcher]'));
    ok("listing both", b.all('[data-hl-switcher-item]').length === 2);
    ok("as a themed dropdown rather than a row of pills or a native select",
       !!b.$('[data-hl-switcher-button]') && !b.$('[data-hl-switcher-select]'));
    ok("with the current one marked",
       /is-current/.test(b.$('[data-hl-switcher-item="a"]').className) &&
       b.$('[data-hl-switcher-item="a"]').getAttribute('aria-selected') === 'true');
    ok("and the page says which home it is showing",
       /Home 6/.test((b.$('[data-hl-current-home]') || {textContent: ''}).textContent));
  }

  /* ---------------------------------------------------- the card's contents */
  {
    const now = Date.now();
    const list = [
      res({ uuid: "ok",  unit: { display_name: "Home 1" }, deal_stage_due_at: now + 20 * DAY }),
      res({ uuid: "late", unit: { display_name: "Home 2" }, deal_stage_due_at: now - 2 * DAY,
            deal_stage: "finance", deal_sub_stage: "pay-deposit" }),
      res({ uuid: "soon", unit: { display_name: "Home 3" }, deal_stage_due_at: now + 2 * DAY })
    ];
    const b = boot({ list });
    await wait(80);
    const order = cards(b).map(c => c.getAttribute('data-hl-row-key'));
    ok("the home that needs attention is first, not the newest",
       order.join(',') === 'late,soon,ok');
    ok("and each card carries its own state",
       cards(b).map(c => c.getAttribute('data-hl-index-state')).join(',') === 'overdue,due-soon,ok');

    /* A missing card must FAIL the assertion, not throw and take the run with it -
       otherwise a mutation that stops the index rendering looks like a crashed suite
       rather than a caught defect. */
    const cardText = k => { const e = b.$('[data-hl-row-key="' + k + '"]'); return e ? e.textContent : ''; };
    ok("a card names the property", /Sanford Heart/.test(cardText('late')));
    ok("and the unit", /Home 2/.test(cardText('late')));
    ok("and turns the stage slug into words", /Finance/.test(cardText('late')));
    ok("and the sub-stage too", /Pay the deposit/.test(cardText('late')));
    ok("and says how late it is in days", /Overdue by 2 days/.test(cardText('late')));
    ok("a card that is not late says how long is left",
       /Due in 20 days/.test(cardText('ok')));
  }

  /* ---------------------------------------------------- the choice travels */
  {
    const b = boot({ search: "?r=a", list: two() });
    await wait(80);
    const href = id => b.$('#' + id).getAttribute('href');
    ok("a link to another portal page carries the home",
       href('nav-order') === '/portal-order?r=a');
    ok("so does the documents link", href('nav-docs') === '/portal-documents?r=a');
    ok("and the dashboard link itself", href('nav-home') === '/portal?r=a');
    ok("log out does NOT - a home is not carried out of the session",
       href('nav-out') === '/portal-login');
    ok("an ordinary page on the site is left alone", href('nav-contact') === '/contact');
    ok("and so is a link off the site", href('nav-ext') === 'https://example.com/x');
    ok("a link marked by hand carries it too", href('nav-marked') === '/help?r=a');
    ok("the switcher's own options still name their own homes",
       b.$('[data-hl-switcher-item="b"]').getAttribute('href') === '?r=b');

  /* --------------------------------------------- the navbar controls */

  /* SHORT ENOUGH FOR A NAVBAR. "Sanford Heart - Home 1" is right on a card and far too
     long in a control that sits between a logo and a menu on a phone. */
  {
    const b = boot();
    await wait(80);
    const short = b.w.HLPortal.shortLabel;
    ok("initials and a padded unit number",
       short({ property_name: "Sanford Heart", unit: { unit_number: "6" } }) === "SH — 06");
    ok("a two-digit unit is not padded further",
       short({ property_name: "Sanford Heart", unit: { unit_number: "12" } }) === "SH — 12");
    ok("the number is dug out of the display name when there is no unit_number",
       short({ property_name: "Polaris Heart", unit: { display_name: "Home 3" } }) === "PH — 03");
    ok("a one-word development still abbreviates",
       short({ property_name: "Polaris", unit: { unit_number: "1" } }) === "P — 01");
    /* HALF AN ABBREVIATION IS WORSE THAN A NAME THAT WRAPS. */
    ok("no number at all falls back to the full name, not to initials alone",
       short({ property_name: "Sanford Heart", unit: { display_name: "The corner one" } })
         === "Sanford Heart — The corner one");
  }

  {
    const b = boot({ search: "?r=a",
                     list: [res({ uuid: "a", unit: { unit_number: "1", display_name: "Home 1" } }),
                            res({ uuid: "b", unit: { unit_number: "6", display_name: "Home 6" } })] });
    await wait(80);
    const btn = b.$('[data-hl-switcher-button]');
    const menu = b.$('[data-hl-switcher-menu]');
    ok("the dropdown starts closed", menu.hidden === true && btn.getAttribute('aria-expanded') === 'false');
    btn.dispatchEvent(new b.w.MouseEvent('click', { bubbles: true }));
    ok("clicking the button opens it", menu.hidden === false && btn.getAttribute('aria-expanded') === 'true');
    ok("the button shows the short name, not the long one",
       b.$('.hl-mbtn-label').textContent === 'SH — 01');
    ok("but the full name is still available on the option",
       b.$('[data-hl-switcher-item="b"]').getAttribute('title') === 'Sanford Heart — Home 6');

    b.d.body.dispatchEvent(new b.w.MouseEvent('click', { bubbles: true }));
    ok("a click outside closes it", menu.hidden === true);

    btn.dispatchEvent(new b.w.MouseEvent('click', { bubbles: true }));
    ok("and it reopens", menu.hidden === false);
    b.d.dispatchEvent(new b.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok("Escape closes it", menu.hidden === true);
  }

  {
    /* THE DESIGNER'S OWN ANCHOR IS MOVED, NOT RECREATED. data-ms-action is Memberstack's
       hook, and rebuilding a link from its text is how an attribute like that gets
       quietly dropped - the buyer would be left with a Log out that does nothing. */
    const b = boot();
    await wait(80);
    const out = b.$('#nav-logout');
    ok("the log out link is inside the menu now",
       !!out.closest('[data-hl-topbar-list]'));
    ok("and it kept the attribute that makes it work",
       out.getAttribute('data-ms-action') === 'logout');
    ok("the menu is behind a button", !!b.$('[data-hl-topbar-button]'));
    ok("which starts closed", b.$('[data-hl-topbar-list]').hidden === true);
  }

  {
    /* A member with no reservations still has to be able to get out of the page. */
    const b = boot({ list: [] });
    await wait(80);
    ok("the menu is built even when there is nothing to show",
       !!b.$('[data-hl-topbar-button]') && !!b.$('#nav-logout').closest('[data-hl-topbar-list]'));
  }

  }

  {
    const b = boot({ search: "?r=a", list: two() });
    await wait(80);
    ok("the choice is remembered for the tab", b.session(SEL) === 'a');
  }

  {
    const b = boot({ list: two(), session: { hl_portal_sel: 'a' } });
    await wait(80);
    ok("a remembered choice is used when the link did not carry one",
       b.w.HLPortal.get().uuid === 'a');
    ok("and the dashboard is shown, not the index",
       b.shown('[data-hl-portal-body]') && !b.shown('[data-hl-portal-index]'));
  }

  /* ---------------------------------------------------- a home they do not hold */
  {
    const b = boot({ search: "?r=someone-elses", list: two() });
    await wait(80);
    ok("with several homes, a link to one they do not hold shows NO home",
       b.w.HLPortal.get() === null);
    ok("the index is shown instead", b.shown('[data-hl-portal-index]'));
    ok("and it says why rather than quietly showing a different home",
       /not on your account/.test((b.$('[data-hl-portal-notice]') || {textContent: ''}).textContent) &&
       b.shown('[data-hl-portal-notice]'));
    ok("and it is logged", b.warns.some(x => x.indexOf('someone-elses') > -1));
  }

  {
    const b = boot({ search: "?r=someone-elses", list: two(), session: { hl_portal_sel: 'b' } });
    await wait(80);
    ok("a stale remembered choice is cleared, not silently reused",
       b.session(SEL) === null && b.w.HLPortal.get() === null);
  }

  {
    const b = boot({ search: "?r=someone-elses" });
    await wait(80);
    ok("with only ONE home, a bad link still shows that home rather than nothing",
       b.w.HLPortal.get().uuid === "res-1");
  }

  /* ---------------------------------------------------- pages with no index */
  {
    const noIndex = PAGE.replace(/<div data-hl-portal-index>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, '');
    const b = boot({ list: two(), page: noIndex });
    await wait(80);
    ok("a page with no index block still picks one, so it is never blank",
       b.w.HLPortal.get() !== null && b.w.HLPortal.get().uuid === 'b');
    ok("and the switcher is there to change it", b.shown('[data-hl-switcher]'));
  }

  {
    const b = boot({ list: [res()] });
    await wait(80);
    ok("one reservation shows no switcher", !b.shown('[data-hl-switcher]'));
    ok("and no index - there is nothing to choose between",
       !b.shown('[data-hl-portal-index]') && b.shown('[data-hl-portal-body]'));
  }

  /* ------------------------------------------- the step, in words and pictures

     Everything below rides on deal_sub_stage, which until 30 Aug was never set on any
     reservation - the tracker rendered four grey stubs because the data was missing,
     not because the display was wrong. */
  {
    const b = boot({ list: [res({ payer_route: "bond", deal_stage: "finance", deal_sub_stage: "pre-qualify" })] });
    await wait(80);
    const thumbs = () => b.all('[data-hl-slides] .hl-sl-thumb');
    ok("the sub-step's deck renders", thumbs().length === 5);
    ok("as the After Reserving deck",
       /After_Reserving/.test(thumbs()[0].querySelector('img').getAttribute('src')));
    ok("from the CDN, not the s3 origin",
       thumbs()[0].querySelector('img').getAttribute('src')
         .indexOf('https://cdn.prod.website-files.com/') === 0);
    ok("off-screen slides are lazy",
       thumbs().every(t => t.querySelector('img').getAttribute('loading') === 'lazy'));
    ok("and the step is named in words",
       b.$('[data-hl-next-title]').textContent === 'Pre-qualify');
    ok("with the sub-step marked as the one they are on",
       /is-next/.test(b.$('[data-hl-substage="pre-qualify"]').className));
    ok("and only that one", b.all('[data-hl-substage].is-next').length === 1);
  }

  {
    const b = boot({ list: [res({ payer_route: "bond", deal_sub_stage: "pay-deposit" })] });
    await wait(80);
    ok("a bond buyer on pay-deposit sees the bond deck",
       /Heartland_02_OTP_Bond/.test(b.$('[data-hl-slides] img').getAttribute('src')));
  }
  {
    const b = boot({ list: [res({ payer_route: "cash", deal_sub_stage: "pay-deposit" })] });
    await wait(80);
    ok("a cash buyer on the same step sees the cash deck",
       /OTP_Signed_Cash_Purchase/.test(b.$('[data-hl-slides] img').getAttribute('src')));
  }

  {
    const b = boot({ list: [res({ payer_route: "bond", deal_sub_stage: "bond-approval" })] });
    await wait(80);
    const srcs = b.all('[data-hl-slides] img').map(i => i.getAttribute('src'));
    ok("bond-approval is three slides, not four", srcs.length === 3);
    ok("and carries no Cash Deposit Paid slide", !srcs.some(u => /Cash_Deposit_Paid/.test(u)));
  }

  {
    const b = boot({ list: [res({ deal_stage: "build", deal_sub_stage: null })] });
    await wait(80);
    ok("a step with no deck hides the presentation entirely",
       b.$('[data-hl-slides]').style.display === 'none' &&
       b.all('[data-hl-slides] .hl-sl-thumb').length === 0);
    ok("and claims no next step", !b.shown('[data-hl-next]'));
  }

  /* ------------------------------------------- the clock, and what it gates */
  {
    /* days_left and the stored date DELIBERATELY DISAGREE. Sales extended this
       deadline; the server recomputed days_left; a browser that worked the number out
       from the date would show the old answer. With both saying 5 the test could not
       tell the two apart - which is how the first version of it passed a mutation
       that ignored the server entirely. */
    const b = boot({ list: [res({ deal_sub_stage: "sign-otp", days_left: 5,
                                  deal_stage_due_at: Date.now() + 21 * DAY })] });
    await wait(80);
    ok("the countdown shows the SERVER's day count, not one worked out here",
       b.$('[data-hl-countdown]').textContent === '5');
  }
  {
    /* A day count with no stored deadline behind it. transfer-attorneys has no window,
       so move_deal_stage stores nothing - and a stale days_left must not conjure a
       countdown out of it. */
    const b = boot({ list: [res({ deal_sub_stage: "transfer-attorneys",
                                  deal_stage_due_at: null, days_left: 4 })] });
    await wait(80);
    ok("a step with no deadline gets no countdown rather than a zero",
       b.$('[data-hl-countdown]').getAttribute('data-hl-countdown-state') === 'none' &&
       !b.shown('[data-hl-countdown-wrap]'));
    ok("and prints no number", b.$('[data-hl-countdown]').textContent === '');
  }

  /* ------------------------------------------- blocked

     The server has already withheld otp_url. These assertions are about the page
     AGREEING with it - never about the page being the thing that enforces it. */
  {
    const b = boot({ list: [res({
      deal_sub_stage: "sign-otp", days_left: -3, is_overdue: true, is_blocked: true,
      blocked_reason: "The time to sign the Offer to Purchase has passed.",
      otp_url: null, otp_available: false })] });
    await wait(80);
    ok("the blocked notice is shown", b.shown('[data-hl-blocked]'));
    ok("saying which deadline passed",
       /sign the Offer to Purchase has passed/.test(b.$('[data-hl-blocked-reason]').textContent));
    ok("the action to move forward is taken off the page",
       b.$('[data-hl-action]').style.display === 'none');
    ok("and there is no signing link anywhere on the page",
       !b.all('a').some(a => /sign\.zoho\.com/.test(a.getAttribute('href') || '')));
    ok("the root says so, for anything the Designer wants to restyle",
       /is-blocked/.test(b.$('[data-hl-portal]').className));
  }
  {
    const b = boot({ list: [res({ deal_sub_stage: "sign-otp", is_blocked: false })] });
    await wait(80);
    ok("a live deal shows no blocked notice", !b.shown('[data-hl-blocked]'));
    ok("and keeps its action", b.$('[data-hl-action]').style.display !== 'none');
  }

  /* ------------------------------------------- the lightbox */
  {
    const b = boot({ list: [res({ payer_route: "bond", deal_sub_stage: "pre-qualify" })] });
    await wait(80);
    const first = b.$('[data-hl-slides] .hl-sl-thumb');
    ok("a thumbnail is a button, not a link that navigates", first.tagName === 'BUTTON');
    first.dispatchEvent(new b.w.MouseEvent('click', { bubbles: true }));
    const box = b.$('.hl-sl-box');
    ok("clicking opens the lightbox", !!box && box.style.display === 'flex');
    ok("as a dialog", box.getAttribute('role') === 'dialog' && box.getAttribute('aria-modal') === 'true');
    ok("showing the slide that was clicked",
       /After_Reserving_Slide1/.test(box.querySelector('img').getAttribute('src')));
    ok("and its position", box.querySelector('.hl-sl-pos').textContent === '1 / 5');
    box.querySelector('.hl-sl-next').click();
    ok("next advances", /Slide2/.test(box.querySelector('img').getAttribute('src')));
    box.querySelector('.hl-sl-prev').click();
    box.querySelector('.hl-sl-prev').click();
    ok("and previous wraps to the end rather than dead-ending",
       /Slide5/.test(box.querySelector('img').getAttribute('src')));
    b.d.dispatchEvent(new b.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok("Escape closes it", box.style.display === 'none');
    ok("and gives the page its scroll back", b.d.documentElement.style.overflow === '');
  }

  /* ---------------------------------------------------- nothing to show */
  {
    const b = boot({ list: [] });
    await wait(80);
    ok("a member with no reservations gets the empty state",
       b.shown('[data-hl-portal-empty]') && !b.shown('[data-hl-portal-body]'));
  }

  /* ---------------------------------------------------- where the token lives

     The bug of 30 Aug: Memberstack keeps _ms-mid in localStorage on this site, the
     portal only read document.cookie, and so every logged-in member was bounced
     straight back to the login page. The suite had never noticed because the suite
     itself supplied the cookie. */
  {
    const b = boot({ tokenIn: 'local' });
    await wait(80);
    ok("a token in localStorage is found - where Memberstack actually puts it",
       b.calls.some(c => c.url.indexOf('/auth/memberstack') > -1 && c.body.token === 'ms-token-abc'));
    ok("and the member is not bounced to the login page", b.redirects.length === 0);
    ok("HLPortal reports the token it used", b.w.HLPortal.memberToken() === 'ms-token-abc');
  }

  {
    const b = boot({ tokenIn: 'cookie' });
    await wait(80);
    ok("a token in a cookie is still found - the old placement keeps working",
       b.calls.some(c => c.body && c.body.token === 'ms-token-abc'));
  }

  {
    const b = boot({ tokenIn: 'session' });
    await wait(80);
    ok("and one in sessionStorage too", b.calls.some(c => c.body && c.body.token === 'ms-token-abc'));
  }

  {
    const b = boot({ tokenIn: 'quoted' });
    await wait(80);
    ok("a JSON-quoted token is unwrapped, not sent with its quotes",
       b.calls.some(c => c.body && c.body.token === 'ms-token-abc'));
  }

  {
    /* A browser set to block site data does not return null from getItem - it THROWS.
       Undefended, that takes the whole portal down on a page that could still have
       fallen back to the cookie. */
    const b = boot({ tokenIn: 'cookie', blockStorage: true });
    await wait(80);
    ok("storage that throws does not take the portal with it",
       b.calls.some(c => c.body && c.body.token === 'ms-token-abc'));
    ok("and nothing is reported as an error to the member",
       !b.shown('[data-hl-portal-empty]') && b.shown('[data-hl-portal-body]'));
  }

  /* ---------------------------------------------------- the way out */
  {
    const b = boot({ noCookie: true });
    await wait(80);
    ok("the Log in button is repointed at the portal's own login, not the legacy one",
       b.$('[data-hl-login-link]').getAttribute('href') === '/portal-login');
  }

  {
    const b = boot({ noCookie: true,
                     page: PAGE.replace('data-hl-portal ', 'data-hl-portal data-hl-login="/owners-login" ') });
    await wait(80);
    ok("and it follows the same markup that decides where login lives",
       b.$('[data-hl-login-link]').getAttribute('href') === '/owners-login');
  }

  /* ---------------------------------------------------- no session */
  {
    const b = boot({ noCookie: true });
    await wait(80);
    ok("no session leaves the page", b.redirects.length === 1);
    ok("for the login page", b.w.HLPortal.loginPath() === '/portal-login');
    ok("and it does not call Xano without a token",
       !b.calls.some(c => c.url.indexOf('/auth/memberstack') > -1));
  }

  {
    const b = boot({ noCookie: true,
                     page: PAGE.replace('data-hl-portal ', 'data-hl-portal data-hl-login="/owners-login" ') });
    await wait(80);
    ok("markup decides where login lives",
       b.redirects.length === 1 && b.w.HLPortal.loginPath() === '/owners-login');
  }

  {
    const b = boot({ noCookie: true, search: "?r=res-9" });
    await wait(80);
    ok("the reservation they asked for is stashed across the login round trip",
       b.session('hl_portal_r') === 'res-9');
  }

  {
    /* Back from login, still no cookie. Bouncing again would loop forever. */
    const b = boot({ noCookie: true, session: { hl_portal_bounce: "1" } });
    await wait(80);
    ok("a second bounce is refused", b.redirects.length === 0);
    ok("and nothing is fetched", b.calls.length === 0);
    ok("it says so instead", /log in/.test(b.$('[data-hl-portal-message]').textContent));
    ok("and the guard is cleared so a later logout can bounce again",
       !b.session('hl_portal_bounce'));
  }

  /* ---------------------------------------------------- an older Xano */
  {
    /* The browser and Xano deploy independently. A bundle that assumed the new shape
       would break the portal for as long as an older Xano was live. */
    const b = boot({ oldXano: true });
    await wait(80);
    ok("an exchange with no reservations falls back to the second call",
       b.calls.some(c => c.url.indexOf('/member/reservations') > -1 && c.auth === 'Bearer xano-token-xyz'));
    ok("and the page still renders",
       b.shown('[data-hl-portal-body]') && b.$('[data-hl="unit.name"]').textContent === "Sanford Heart 06");
  }

  {
    const b = boot({ list: [] });
    await wait(80);
    ok("an empty list is still the new shape, not a reason to call again",
       !b.calls.some(c => c.url.indexOf('/member/reservations') > -1));
  }

  /* ---------------------------------------------------- the order summary */
  {
    const b = boot({ list: [res({
      configuration: {
        floor_label: "Tiles", outdoor_label: "Planting", solar_label: "None",
        appliance_label: "None", furniture_label: "None",
        garage_upgrade: "Yes", pool_upgrade: "No", fireplace_upgrade: "no",
        finance_upgrades: "No", include_bond_cost: "Yes"
      },
      addons: [ { slug: "pergola", name: "Custom Pergola", price_cents: 12500000 } ],
      addons_total_cents: 12500000,
      total_ex_vat_cents: 312608696, vat_cents: 46891304
    })] });
    await wait(80);
    const sp = rows(b, 'spec');
    ok("a spec line per real choice, and none for the ones left as None",
       sp.length === 3);
    ok("the choices come through with their labels",
       sp[0].querySelector('[data-hl="label"]').textContent === "Flooring" &&
       sp[0].querySelector('[data-hl="value"]').textContent === "Tiles");
    ok("a Yes upgrade becomes a line",
       sp[2].getAttribute('data-hl-row-key') === "garage_upgrade" &&
       sp[2].querySelector('[data-hl="value"]').textContent === "Included");
    ok("a No upgrade does not - a summary of things you did not buy is noise",
       !sp.some(x => /pool|fireplace/.test(x.getAttribute('data-hl-row-key'))));

    const ad = rows(b, 'addons');
    ok("add-ons render with their own prices", ad.length === 1 &&
       ad[0].querySelector('[data-hl="name"]').textContent === "Custom Pergola" &&
       ad[0].querySelector('[data-hl="price_cents"]').textContent === "R125,000.00");
    ok("and the empty state stands aside", !b.shown('[data-hl-empty="addons"]'));
  }

  {
    const b = boot({ list: [res()] });
    await wait(80);
    ok("the ex-VAT split is READ, never computed in the browser",
       b.$('[data-hl="total_ex_vat_cents"]').textContent === "\u2014");
  }

  {
    const b = boot({ list: [res({ total_ex_vat_cents: 312608696, vat_cents: 46891304 })] });
    await wait(80);
    ok("and rendered as money when Xano sends it",
       b.$('[data-hl="total_ex_vat_cents"]').textContent === "R3,126,086.96" &&
       b.$('[data-hl="vat_cents"]').textContent === "R468,913.04");
  }

  /* ---------------------------------------------------- agreed after reserving */
  {
    const b = boot({ list: [res({
      addons: [{ slug: "pergola", name: "Custom Pergola", price_cents: 12500000 }],
      addons_total_cents: 12500000,
      total_cents: 659500000,
      agreed_extras: [
        { slug: "sanford-major-garage", group_slug: "major-upgrades", name: "Garage", price_cents: 12500000 },
        { slug: "sanford-major-fireplace", group_slug: "major-upgrades", name: "Fireplace", price_cents: 4850000 }
      ],
      agreed_extras_total_cents: 17350000,
      grand_total_cents: 676850000
    })] });
    await wait(80);
    const ex = rows(b, 'extras');
    ok("upgrades agreed after reserving render as their own list", ex.length === 2);
    ok("with the frozen name and the agreed price",
       ex[0].querySelector('[data-hl="name"]').textContent === "Garage" &&
       ex[0].querySelector('[data-hl="price_cents"]').textContent === "R125,000.00");

    /* The distinction the whole model turns on: an extra agreed a month later must
       not silently restate the figure the Offer to Purchase was signed at. */
    ok("the signed purchase price is untouched by them",
       b.$('[data-hl="total_cents"]').textContent === "R6,595,000.00");
    ok("the extras carry their own total",
       b.$('[data-hl="agreed_extras_total_cents"]').textContent === "R173,500.00");
    ok("and the sum of the two is a THIRD figure, not a replacement",
       b.$('[data-hl="grand_total_cents"]').textContent === "R6,768,500.00");
    ok("reserve-time add-ons stay in their own list",
       rows(b, 'addons').length === 1 &&
       rows(b, 'addons')[0].querySelector('[data-hl="name"]').textContent === "Custom Pergola");
    ok("and the extras empty state stands aside", !b.shown('[data-hl-empty="extras"]'));
  }

  {
    const b = boot({ list: [res()] });
    await wait(80);
    ok("a deal with nothing agreed since shows the empty state",
       b.shown('[data-hl-empty="extras"]') && rows(b, 'extras').length === 0);
  }

  {
    const b = boot({ list: [res({ configuration: null, addons: [] })] });
    await wait(80);
    ok("no configuration at all shows the empty states rather than throwing",
       b.shown('[data-hl-empty="spec"]') && b.shown('[data-hl-empty="addons"]'));
  }

  /* ---------------------------------------------------- the buyer's documents */
  const DOCS = [
    { doc_type: "otp-signed", label: "Offer To Purchase - signed",
      url: "https://sign.example.com/otp.pdf", created_at: 1 },
    { doc_type: "sof-signed", label: "Schedule of Finishes - signed",
      url: "https://files.example.com/sof.pdf", created_at: 2 }
  ];


  {
    const b = boot({ list: [res({ documents: DOCS })] });
    await wait(80);
    const r = rows(b);
    ok("one row per document", r.length === 2);
    ok("labelled from the document, not the reservation",
       r[0].querySelector('[data-hl="label"]').textContent === "Offer To Purchase - signed");
    ok("and linked to it", r[0].getAttribute('href') === "https://sign.example.com/otp.pdf");
    ok("each row is stamped with its own key",
       r[1].getAttribute('data-hl-row-key') === "sof-signed");
    ok("the empty state is not shown", !b.shown('[data-hl-empty="documents"]'));
  }

  {
    /* A template hidden with an INLINE style. The clone must lose it, or the row never
       appears - the bug that rendered the whole flow blank on 25 Aug. */
    const b = boot({ list: [res({ documents: DOCS })] });
    await wait(80);
    ok("a cloned row loses the template's inline hiding",
       rows(b).every(x => x.style.display !== 'none') && rows(b).length === DOCS.length);
  }

  {
    /* A template hidden with a CLASS, on a row whose own class is display:flex. The
       clone must drop the hiding class and NOT be handed an inline display:block -
       that is what flattened .hlp-doc into a block and ran the floorplan label and
       the word "Open" together with nothing between them. */
    const b = boot({ list: [res({ media: { gallery: [], floorplans: [
      { key: "g", label: "Floor plan - Ground", url: "https://cdn.x/g.pdf", variant: "" }
    ] } })] });
    await wait(80);
    const fp = rows(b, 'floorplans');
    ok("the hiding class is removed from the clone",
       fp.length === 1 && fp[0].className.indexOf('hlp-tpl') === -1);
    ok("and NOTHING is written over the row's own layout",
       fp[0].style.display === '');
    ok("so the row keeps the display its class gave it",
       b.w.getComputedStyle(fp[0]).display === 'flex');
  }

  {
    /* A template hidden by a class the renderer has NEVER HEARD OF. Removing hlp-tpl
       cannot help, so the fallback measures the first clone and, finding it still
       hidden, writes display:block for the whole list. Without it the gallery would
       render nothing and say nothing. */
    const b = boot({ list: [res({ media: { floorplans: [], gallery: [
      { key: "a", label: "One", url: "https://cdn.x/1.png", variant: "" },
      { key: "b", label: "Two", url: "https://cdn.x/2.png", variant: "" }
    ] } })] });
    await wait(80);
    const g = rows(b, 'gallery');
    ok("a template hidden by an unknown class still renders", g.length === 2);
    ok("because the fallback wrote a display it could measure",
       g.every(x => x.style.display === 'block'));
  }

  {
    const b = boot({ list: [res({ documents: DOCS })] });
    await wait(80);
    ok("every link opens away from the session",
       rows(b).every(x => x.getAttribute('target') === '_blank' &&
                          /noopener/.test(x.getAttribute('rel') || '')));
  }

  {
    const b = boot({ list: [res({ documents: [] })] });
    await wait(80);
    ok("no documents shows the empty state", b.shown('[data-hl-empty="documents"]'));
    ok("and leaves no placeholder row behind", rows(b).length === 0);
  }

  {
    const b = boot({ list: [res()] });
    await wait(80);
    ok("a reservation with no documents key at all does not throw",
       b.shown('[data-hl-empty="documents"]') && rows(b).length === 0);
  }

  /* ------------------------------------------- the Offer to Purchase card */

  {
    const b = boot({ list: [res({ deal_sub_stage: "sign-otp", otp_url: "https://sign.zoho.com/x" })] });
    await wait(80);
    ok("before signing, the card offers the link", b.shown('#otp-sign') && !b.shown('#otp-signed'));
    ok("pointed at the signing url", b.$('#otp-link').getAttribute('href') === 'https://sign.zoho.com/x');
    ok("opening away from the session",
       b.$('#otp-link').getAttribute('rel') === 'noopener noreferrer');
  }

  {
    /* SIGNED BEATS EVERYTHING. Once the executed copy is back, "go and sign" is not an
       instruction, it is a confusion - even though otp_url is still on the row. */
    const b = boot({ list: [res({
      deal_sub_stage: "pay-deposit",
      otp_url: "https://sign.zoho.com/x",
      documents: [{ doc_type: "otp-signed", label: "Offer To Purchase - signed",
                    url: "https://files.x/otp-signed.pdf", created_at: Date.UTC(2026, 8, 3) }]
    })] });
    await wait(80);
    ok("the signed copy replaces the sign prompt",
       b.shown('#otp-signed') && !b.shown('#otp-sign'));
    ok("linked to the executed document", b.$('#otp-doc').getAttribute('href') === 'https://files.x/otp-signed.pdf');
    /* The date is when sales ATTACHED it. We do not know when the buyer signed - Zoho
       does - so the label must not claim otherwise. */
    ok("and dated from the document we actually hold",
       b.$('#otp-date').textContent === '3 September 2026');
  }

  {
    const b = boot({ list: [res({ deal_sub_stage: "sign-otp", otp_url: null })] });
    await wait(80);
    ok("no link yet gets the waiting state rather than a dead button",
       b.shown('#otp-waiting') && !b.shown('#otp-sign'));
  }

  {
    /* otp_url is WITHHELD by Xano when the deal is blocked, so there is nothing to
       hide here - there is simply no link, and the card says why. */
    const b = boot({ list: [res({ deal_sub_stage: "sign-otp", otp_url: null,
                                  is_blocked: true, blocked_reason: "The time to sign has passed." })] });
    await wait(80);
    ok("a blocked deal shows the explanation, not a button", b.shown('#otp-blocked'));
    ok("and no signing link exists to inspect", !b.$('#otp-link').getAttribute('href'));
  }

  {
    const b = boot({ list: [res({ deal_stage: "build", deal_sub_stage: "", otp_url: null })] });
    await wait(80);
    ok("a buyer who is nowhere near the OTP sees no card at all", !b.shown('#otp-card'));
  }

  {
    const b = boot({ list: [res({ documents: [{ doc_type: "otp-signed", label: "x",
                                                url: "javascript:alert(1)" }] })] });
    await wait(80);
    ok("a signed copy with a link this page will not render is treated as absent",
       !b.shown('#otp-signed'));
  }

  /* --------------------------------------------- actions on a step */

  {
    const b = boot({ list: [res({
      deal_sub_stage: "pre-qualify", otp_url: "https://sign.zoho.com/x",
      actions: { prequalify_url: "https://preauth.broker.co.za/?var3=HeartlandPolaris",
                 prequalify_logo: "https://files.x/evo-logo.avif" }
    })] });
    await wait(80);
    ok("the pre-qualify step offers the broker's link",
       b.shown('#act-prequal') &&
       b.$('#prequal-link').getAttribute('href') === 'https://preauth.broker.co.za/?var3=HeartlandPolaris');
    ok("with the partner's logo", b.$('#prequal-logo').getAttribute('src') === 'https://files.x/evo-logo.avif');
    ok("and the sign step offers the signing link",
       b.shown('#act-signotp') && b.$('#signotp-link').getAttribute('href') === 'https://sign.zoho.com/x');
  }

  {
    /* SANFORD TODAY. The link carries the broker's attribution parameter, so a
       development without one must offer NO button rather than borrow another's -
       that would credit the wrong development for every application it sent. */
    const b = boot({ list: [res({ deal_sub_stage: "pre-qualify", actions: { prequalify_url: "", prequalify_logo: "" } })] });
    await wait(80);
    ok("a development with no link offers no button", !b.shown('#act-prequal'));
  }

  {
    const b = boot({ list: [res({ deal_sub_stage: "pre-qualify",
      actions: { prequalify_url: "https://preauth.broker.co.za/?var3=X", prequalify_logo: "" } })] });
    await wait(80);
    ok("a link with no logo still gets its button", b.shown('#act-prequal'));
    /* An empty img is a broken-image icon next to a bank's name. */
    ok("and no empty image beside it", b.$('#prequal-logo').style.display === 'none');
  }

  {
    const b = boot({ list: [res({ deal_sub_stage: "pre-qualify",
      actions: { prequalify_url: "javascript:alert(1)", prequalify_logo: "" } })] });
    await wait(80);
    ok("a javascript: link from the CMS never reaches an href", !b.shown('#act-prequal'));
  }

  /* --------------------------------- the development's own documents */

  /* TWO SECTIONS, NOT ONE LIST. "What have I signed" and "what am I buying into" are
     different questions, and a buyer scanning one column for their countersigned OTP
     should not have to read past the furniture sizing guide to find it. */
  {
    const b = boot({ list: [res({
      documents: [{ doc_type: "otp-signed", label: "Offer To Purchase - signed",
                    url: "https://files.x/otp.pdf" }],
      property_documents: [
        { doc_key: "brochure", label: "Brochure", url: "https://files.x/brochure.pdf" },
        { doc_key: "schedule-of-finishes", label: "Schedule of Finishes",
          url: "https://files.x/sof.pdf" }
      ]
    })] });
    await wait(80);
    ok("the development's documents render in their own list",
       rows(b, 'property-documents').length === 2);
    ok("in the order the server sent, which is the legacy page's order",
       rows(b, 'property-documents')[0].querySelector('[data-hl="label"]').textContent === 'Brochure');
    ok("linked", rows(b, 'property-documents')[1].getAttribute('href') === 'https://files.x/sof.pdf');
    ok("and stamped with their own key",
       rows(b, 'property-documents')[0].getAttribute('data-hl-row-key') === 'brochure');
    ok("THE TWO LISTS DO NOT BLEED INTO EACH OTHER - the signed one holds one row",
       rows(b).length === 1);
    ok("and it is the buyer's own, not the development's",
       rows(b)[0].querySelector('[data-hl="label"]').textContent === 'Offer To Purchase - signed');
    ok("neither empty state is shown",
       !b.shown('[data-hl-empty="documents"]') && !b.shown('[data-hl-empty="property-documents"]'));
  }

  {
    /* Sanford today: the CMS row does not exist yet, so the list is empty while the
       buyer's own documents are not. Each section answers for itself. */
    const b = boot({ list: [res({
      documents: [{ doc_type: "otp-signed", label: "Offer To Purchase - signed",
                    url: "https://files.x/otp.pdf" }],
      property_documents: []
    })] });
    await wait(80);
    ok("a development with no documents shows its own empty state",
       b.shown('[data-hl-empty="property-documents"]') && rows(b, 'property-documents').length === 0);
    ok("without touching the buyer's own section", rows(b).length === 1);
  }

  {
    const b = boot({ list: [res({
      property_documents: [
        { doc_key: "brochure", label: "Brochure", url: "javascript:alert(1)" },
        { doc_key: "levies", label: "Levy Schedule", url: "https://files.x/levy.pdf" }
      ]
    })] });
    await wait(80);
    ok("a javascript: link never reaches an href here either",
       rows(b, 'property-documents').length === 1);
    ok("and the good ones still render",
       rows(b, 'property-documents')[0].getAttribute('href') === 'https://files.x/levy.pdf');
    ok("with the bad one named in the console",
       b.warns.some(x => /property document.*brochure/i.test(x)));
  }

  {
    const b = boot({ list: [res()] });
    await wait(80);
    ok("a reservation with no property_documents key at all does not throw",
       b.shown('[data-hl-empty="property-documents"]') && rows(b, 'property-documents').length === 0);
  }

  {
    const bad = [
      { doc_type: "otp-signed",  label: "Signed OTP",  url: "javascript:alert(1)" },
      { doc_type: "sof-signed",  label: "Finishes",    url: "http://files.example.com/a.pdf" },
      { doc_type: "rules-signed", label: "Rules",      url: "https://files.example.com/a b.pdf" },
      { doc_type: "levies-signed", label: "Levies",    url: "" }
    ];
    const b = boot({ list: [res({ documents: bad })] });
    await wait(80);
    ok("a javascript: link never reaches an href", rows(b).length === 0);
    ok("nor http, nor a link with a space in it",
       !b.d.body.innerHTML.includes('javascript:') &&
       !b.d.body.innerHTML.includes('http://files.example.com'));
    ok("and every one of them is named in the console",
       b.warns.filter(x => /will not render/.test(x)).length === 4);
    ok("a page with nothing renderable says so rather than showing empty cards",
       b.shown('[data-hl-empty="documents"]'));
  }

  {
    const good = { doc_type: "otp-signed", label: "Signed OTP", url: "https://ok.example.com/a.pdf" };
    const b = boot({ list: [res({ documents: [good, { doc_type: "x", label: "X", url: "ftp://nope" }] })] });
    await wait(80);
    ok("one bad document does not cost the buyer the good ones", rows(b).length === 1);
  }

  {
    /* Switching home re-renders the same list container. Two homes, so the URL has to
       name one - otherwise the index is shown and there is no list to re-render. */
    const b = boot({ search: "?r=res-1",
                     list: [ res({ uuid: "res-1", documents: DOCS }),
                             res({ uuid: "res-2", documents: [DOCS[0]] }) ] });
    await wait(80);
    ok("the first reservation's documents render", rows(b).length === 2);
    b.w.HLPortal.select("res-2");
    ok("switching replaces the rows rather than adding to them", rows(b).length === 1);
    ok("and the remembered choice moves with it", b.session('hl_portal_sel') === 'res-2');
    b.w.HLPortal.select("res-1");
    ok("and switching back does not accumulate either", rows(b).length === 2);
  }

  /* ---------------------------------------------------- the pictures */
  {
    const MEDIA = {
      gallery: [
        { key: "t:base-model", label: "Your home", url: "https://cdn.x/base.png", variant: "" },
        { key: "t:axo-1", label: "Aerial view", url: "https://cdn.x/axo.png", variant: "" },
        { key: "t:floor-oak", label: "Oak flooring", url: "https://cdn.x/oak.png", variant: "floor:oak" }
      ],
      floorplans: [
        { key: "t:ground", label: "Floor plan - Ground", url: "https://cdn.x/g.png", variant: "" },
        { key: "t:first", label: "Floor plan - First", url: "https://cdn.x/f.png", variant: "" }
      ]
    };
    const b = boot({ list: [res({ media: MEDIA })] });
    await wait(80);
    ok("every render Xano sent is drawn", rows(b, 'gallery').length === 3);
    ok("and the floorplans are a SEPARATE list, not mixed into the strip",
       rows(b, 'floorplans').length === 2);
    const shot = rows(b, 'gallery')[0];
    ok("a render row carries the image", shot.querySelector('img').getAttribute('src') === 'https://cdn.x/base.png');
    ok("and links to the full-size file", shot.getAttribute('href') === 'https://cdn.x/base.png');
    ok("and is labelled", /Your home/.test(shot.textContent));
    ok("a floorplan row is a download link",
       rows(b, 'floorplans')[0].getAttribute('href') === 'https://cdn.x/g.png');
    ok("every picture link opens away from the session",
       rows(b, 'gallery').concat(rows(b, 'floorplans'))
         .every(r => r.getAttribute('target') === '_blank' && /noopener/.test(r.getAttribute('rel'))));
    ok("and the empty states stand down", !b.shown('[data-hl-empty="gallery"]') &&
       !b.shown('[data-hl-empty="floorplans"]'));
  }

  {
    /* THE BROWSER MUST NOT BE THE FILTER. Xano decides which variant a buyer is
       entitled to; whatever it sends is what shows. A test that filtered here would
       pass while the payload still carried another buyer's specification. */
    const b = boot({ list: [res({
      configuration: { floor_label: "Tiles", furniture_label: "None" },
      media: { gallery: [{ key: "t:oak", label: "Oak flooring", url: "https://cdn.x/oak.png", variant: "floor:oak" }],
               floorplans: [] } })] });
    await wait(80);
    ok("the page renders the variant Xano sent rather than re-deciding from the configuration",
       rows(b, 'gallery').length === 1);
    ok("and an empty floorplan list says so", b.shown('[data-hl-empty="floorplans"]'));
  }

  {
    const b = boot({ list: [res({ media: {
      gallery: [{ key: "bad", label: "Bad", url: "javascript:alert(1)", variant: "" },
                { key: "good", label: "Good", url: "https://cdn.x/ok.png", variant: "" }],
      floorplans: [{ key: "p", label: "Plan", url: "http://cdn.x/insecure.png" }] } })] });
    await wait(80);
    ok("a render whose url is not https is dropped rather than drawn",
       rows(b, 'gallery').length === 1 &&
       rows(b, 'gallery')[0].querySelector('img').getAttribute('src') === 'https://cdn.x/ok.png');
    ok("and an insecure floorplan is dropped too", rows(b, 'floorplans').length === 0);
    ok("and both say so in the console so the bad row can be found",
       b.warns.some(x => /render/.test(x)) && b.warns.some(x => /floorplan/.test(x)));
  }

  {
    const b = boot({ list: [res()] });
    await wait(80);
    ok("a reservation with no media at all shows the empty states, not a broken strip",
       rows(b, 'gallery').length === 0 && b.shown('[data-hl-empty="gallery"]'));
  }

  /* ---------------------------------------------------- the team */
  {
    const b = boot({ list: [res({ team: [
      { name: "Anneke Grobler", position: "Sales Executive", bio: "Your first contact.",
        photo: "https://cdn.x/anneke.avif" },
      { name: "Danette Van Niekerk", position: "Sales Administrator", bio: "", photo: "" }
    ] })] });
    await wait(80);
    const t = rows(b, 'team');
    ok("the development's people are drawn", t.length === 2);
    ok("with their name and role", /Anneke Grobler/.test(t[0].textContent) &&
       /Sales Executive/.test(t[0].textContent));
    ok("a photo is set when there is one",
       t[0].querySelector('img').getAttribute('src') === 'https://cdn.x/anneke.avif');
    ok("and the avatar is HIDDEN rather than left broken when there is not",
       t[1].querySelector('img').style.display === 'none');
    ok("an empty bio hides its block rather than printing nothing in a styled box",
       t[1].querySelector('[data-hl="bio"]').style.display === 'none');
  }

  {
    const b = boot({ list: [res({ team: [] })] });
    await wait(80);
    ok("a development with nobody assigned shows the empty state, never the whole company",
       rows(b, 'team').length === 0 && b.shown('[data-hl-empty="team"]'));
  }

  {
    const b = boot({ list: [res({ team: [{ name: "", position: "Ghost" },
                                         { name: "Real Person", position: "Sales" }] })] });
    await wait(80);
    ok("a nameless row is dropped rather than rendered as an empty card",
       rows(b, 'team').length === 1 && /Real Person/.test(rows(b, 'team')[0].textContent));
  }

  {
    /* THE SITE'S OWN FOOTER CODE binds a page-transition handler to every anchor: it
       calls preventDefault and then navigates. Bound to the ANCHOR, so in the bubble
       phase it runs first, and a portal handler that respected defaultPrevented stood
       aside - which made every tab click on DESKTOP a full page load. The tab handler
       runs in CAPTURE now, so it wins, and stops the event before the anchor's own
       listener ever sees it. */
    const b = boot();
    await wait(80);
    const order = b.$('#tab-order');
    let transitionRan = false;
    order.addEventListener('click', function (ev) { ev.preventDefault(); transitionRan = true; });

    const ev = new b.w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    order.dispatchEvent(ev);
    ok("the tab still switches with a hostile handler on the anchor",
       b.w.HLPortal.tab() === 'order');
    ok("and that handler never runs, so nothing navigates", transitionRan === false);
    ok("the click is cancelled either way", ev.defaultPrevented === true);
  }

  {
    /* The home switcher stays a real navigation: its items name a DIFFERENT
       reservation at the SAME path, so they would otherwise resolve to the tab that is
       already open and be swallowed. */
    const b = boot({ list: [res({ uuid: "a" }), res({ uuid: "b" })] });
    await wait(80);
    const item = b.$('[data-hl-switcher-item]');
    const ev = new b.w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    if (item) { item.dispatchEvent(ev); }
    ok("a switcher item is not treated as a tab",
       !item || ev.defaultPrevented === false || b.w.HLPortal.tab() === 'home');
  }

  {
    /* SHOWING SOMETHING MUST NOT DECIDE HOW IT LAYS OUT. show() wrote display:block on
       everything it revealed, and an inline style beats a class - so the deadline card,
       which is a flex row, was flattened to a block and its clock and its due date fell
       onto separate lines. */
    const b = boot({ list: [res({ deal_stage_due_at: Date.now() + 3 * DAY })] });
    await wait(80);
    const due = b.$('[data-hl-countdown-wrap]');
    ok("the deadline card is revealed", b.w.getComputedStyle(due).display !== 'none');
    ok("and NOTHING is written over its own layout", due.style.display === '');
    ok("so it keeps the flex its class gave it",
       b.w.getComputedStyle(due).display === 'flex');
  }

  {
    /* show() reveals the OTP card, and it must not flatten it either - the countdown
       card is revealed by its own line, so mutating show() alone would otherwise go
       unnoticed. */
    const b = boot({ list: [res({ otp_url: "https://sign.example.com/otp", deal_sub_stage: "sign-otp" })] });
    await wait(80);
    const otp = b.$('[data-hl-otp]');
    ok("show() reveals the card", b.w.getComputedStyle(otp).display !== 'none');
    ok("without writing over its layout", otp.style.display === '');
    ok("so it keeps the grid its class gave it",
       b.w.getComputedStyle(otp).display === 'grid');
  }

  {
    /* Hiding still writes a value. Clearing one there would REVEAL rather than hide -
       which is the failure the original rule was written against. */
    const b = boot({ list: [res({ deal_stage_due_at: null })] });
    await wait(80);
    const due = b.$('[data-hl-countdown-wrap]');
    ok("a stage with no deadline hides the card with a value",
       due.style.display === 'none');
  }

  {
    /* A person's own number and address, on their own card - the same fields the
       contacts card uses, so the two can never disagree about a number. */
    const b = boot({ list: [res({ team: [
      { name: "Anneke Grobler", position: "Sales Executive", group: "heartland",
        group_label: "Heartland", email: "anneke@heartland.co.za",
        phone: "060 813 5798", phone_href: "0608135798" },
      { name: "Corien Botha", position: "Interior Architect", group: "heartland",
        group_label: "Heartland" }
    ], team_groups: [{ key: "heartland", label: "Heartland" }] })] });
    await wait(80);
    const t = b.w.HLPortal.team();
    ok("a team member carries their own contact details",
       t[0].phone === '060 813 5798' && t[0].phone_href === 'tel:0608135798' &&
       t[0].email_href === 'mailto:anneke@heartland.co.za');
    ok("and the flags say which of them exist",
       t[0].has_phone === true && t[0].has_email === true);
    ok("somebody with neither gets empty strings, not a broken tel: link",
       t[1].phone_href === '' && t[1].email_href === '' &&
       t[1].has_phone === false && t[1].has_email === false);
  }

  /* ---------------------------------------------------- the lightbox */
  {
    const shots = [
      { key: "a", label: "Front elevation", url: "https://cdn.x/1.png", variant: "" },
      { key: "b", label: "Living",          url: "https://cdn.x/2.png", variant: "" },
      { key: "c", label: "Kitchen",         url: "https://cdn.x/3.png", variant: "" }
    ];
    const b = boot({ list: [res({ media: { gallery: shots, floorplans: [] } })] });
    await wait(80);

    const shotRows = rows(b, 'gallery');
    ok("the gallery draws every render", shotRows.length === 3);
    ok("nothing is built until something is clicked",
       !b.$('[data-hl-lightbox-view]'));

    shotRows[1].dispatchEvent(new b.w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    const lbv = b.$('[data-hl-lightbox-view]');
    ok("clicking a render opens the lightbox", !!lbv && lbv.className.indexOf('is-open') > -1);
    ok("at the one that was clicked", b.w.HLPortal.lightbox().at === 1);
    ok("showing that image", lbv.querySelector('.hl-lb-img').getAttribute('src') === 'https://cdn.x/2.png');
    ok("with its caption", b.$('[data-hl-lb-cap]').textContent === 'Living');
    ok("and where you are in the set", b.$('[data-hl-lb-count]').textContent === '2 / 3');
    ok("the page behind cannot scroll under it",
       b.d.documentElement.style.overflow === 'hidden');

    b.w.HLPortal.lightboxStep(1);
    ok("next moves on", b.$('.hl-lb-img').getAttribute('src') === 'https://cdn.x/3.png');
    b.w.HLPortal.lightboxStep(1);
    ok("and WRAPS at the end rather than stopping dead",
       b.w.HLPortal.lightbox().at === 0 &&
       b.$('.hl-lb-img').getAttribute('src') === 'https://cdn.x/1.png');
    b.w.HLPortal.lightboxStep(-1);
    ok("back from the first wraps to the last", b.w.HLPortal.lightbox().at === 2);
  }

  {
    const shots = [
      { key: "a", label: "Front elevation", url: "https://cdn.x/1.png", variant: "" },
      { key: "b", label: "Living",          url: "https://cdn.x/2.png", variant: "" }
    ];
    const b = boot({ list: [res({ media: { gallery: shots, floorplans: [] } })] });
    await wait(80);
    rows(b, 'gallery')[0].dispatchEvent(new b.w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    b.d.dispatchEvent(new b.w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    ok("the right arrow key pages forward", b.w.HLPortal.lightbox().at === 1);
    b.d.dispatchEvent(new b.w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    ok("and the left arrow back", b.w.HLPortal.lightbox().at === 0);

    b.d.dispatchEvent(new b.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok("Escape closes it", b.w.HLPortal.lightbox().open === false);
    ok("the page scrolls again", b.d.documentElement.style.overflow === '');
    ok("and it stops holding the full-size image in memory",
       !b.$('.hl-lb-img').getAttribute('src'));
  }

  {
    const b = boot({ list: [res({ media: {
      gallery: [{ key: "a", label: "Only one", url: "https://cdn.x/1.png", variant: "" }],
      floorplans: [] } })] });
    await wait(80);
    rows(b, 'gallery')[0].dispatchEvent(new b.w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    ok("ONE picture is not a sequence - the arrows and the counter go away",
       b.$('[data-hl-lightbox-view]').className.indexOf('is-single') > -1);
  }

  {
    /* Modified clicks belong to the browser, the same rule the tabs follow: a cmd-click
       on a render should still open the full image in its own tab. */
    const b = boot({ list: [res({ media: {
      gallery: [{ key: "a", label: "One", url: "https://cdn.x/1.png", variant: "" },
                { key: "b", label: "Two", url: "https://cdn.x/2.png", variant: "" }],
      floorplans: [] } })] });
    await wait(80);
    rows(b, 'gallery')[0].dispatchEvent(new b.w.MouseEvent('click',
      { bubbles: true, cancelable: true, button: 0, metaKey: true }));
    ok("a cmd-click is left alone", !b.$('[data-hl-lightbox-view]'));
  }

  {
    /* The floorplan list is NOT a lightbox - those are downloads, and swallowing the
       click would stop a buyer saving the plan they came for. */
    const b = boot({ list: [res({ media: {
      gallery: [],
      floorplans: [{ key: "f", label: "Ground floor", url: "https://cdn.x/f.pdf", variant: "" }] } })] });
    await wait(80);
    const fp = rows(b, 'floorplans')[0];
    const ev = new b.w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    fp.dispatchEvent(ev);
    ok("a floorplan download is not intercepted",
       !b.$('[data-hl-lightbox-view]') && ev.defaultPrevented === false);
  }

  /* --------------------------------------- the team, sectioned by group */
  {
    const PEOPLE = [
      { name: "Anneke Grobler", position: "Sales Executive", company: "Heartland",
        group: "heartland", group_label: "Heartland", email: "anneke@heartland.co.za" },
      { name: "Corne Coetzee", position: "Director", company: "Bourne Construction",
        group: "builder", group_label: "Builder",
        website_url: "https://bourne.co.za", website_label: "Bourne Construction" },
      { name: "Derick Nel", position: "Conveyancer", company: "Nel Attorneys",
        group: "conveyancer-bond", group_label: "Conveyancer & Bond" }
    ];
    const GROUPS = [
      { key: "heartland", label: "Heartland" },
      { key: "builder", label: "Builder" },
      { key: "conveyancer-bond", label: "Conveyancer & Bond" }
    ];
    const b = boot({ list: [res({ team: PEOPLE, team_groups: GROUPS })] });
    await wait(80);

    ok("each group gets its own list", rows(b, 'team:heartland').length === 1 &&
       rows(b, 'team:builder').length === 1 &&
       rows(b, 'team:conveyancer-bond').length === 1);
    ok("and a person lands in their OWN section, not the first one",
       /Corne Coetzee/.test(rows(b, 'team:builder')[0].textContent) &&
       /Derick Nel/.test(rows(b, 'team:conveyancer-bond')[0].textContent));
    ok("the company shows for the outside firms",
       /Bourne Construction/.test(rows(b, 'team:builder')[0].textContent));
    ok("a website link is drawn when the person has one",
       rows(b, 'team:builder')[0].querySelector('a').getAttribute('href') === 'https://bourne.co.za');
    ok("and the group order is the Designer's, taken from team_groups",
       JSON.stringify(b.w.HLPortal.teamGroupKeys()) ===
       JSON.stringify(["heartland", "builder", "conveyancer-bond"]));
    ok("the flat list still carries everybody for markup that wants one column",
       rows(b, 'team').length === 3);
  }

  {
    const b = boot({ list: [res({ team: [
      { name: "Anneke Grobler", position: "Sales Executive", group: "heartland",
        group_label: "Heartland" }
    ], team_groups: [{ key: "heartland", label: "Heartland" }] })] });
    await wait(80);
    ok("a group with nobody in it is HIDDEN, heading and all",
       b.$('[data-hl-group="builder"]').style.display === 'none' &&
       b.$('[data-hl-group="conveyancer-bond"]').style.display === 'none');
    ok("- because a Builder heading over an empty box promises a name it will not give",
       b.$('[data-hl-group="heartland"]').style.display !== 'none');
  }

  {
    const b = boot({ list: [res({ team: [
      { name: "Nobody's Group", position: "Odd one out", group: "surveyor",
        group_label: "Surveyor" }
    ], team_groups: [] })] });
    await wait(80);
    ok("a person whose group is missing from team_groups still gets a section key",
       b.w.HLPortal.teamGroupKeys().indexOf("surveyor") !== -1);
    ok("and is not lost off a page whose whole point is naming the people on the deal",
       rows(b, 'team').length === 1);
  }

  {
    const b = boot({ list: [res({ team: [
      { name: "Bad Link", position: "Tester", website_url: "javascript:alert(1)",
        website_label: "Click me" }
    ] })] });
    await wait(80);
    const only = b.w.HLPortal.team()[0];
    ok("a javascript: website url is rejected", only.website_url === "");
    ok("and its LABEL goes with it - a caption over nothing is not a link",
       only.website_label === "" && only.has_site === false);
  }

  {
    const b = boot({ list: [res({ team: [] })] });
    await wait(80);
    ok("no team at all shows the sectioned empty state too",
       b.shown('[data-hl-team-empty]'));
  }

  /* ------------------------------------------------- the contacts card */
  {
    const b = boot({ list: [res({ contacts: [
      { key: "person:anneke-grobler", label: "Sales Executive", name: "Anneke Grobler",
        phone: "060 813 5798", phone_href: "0608135798", email: "anneke@heartland.co.za" },
      { key: "general", label: "General", name: "General Enquiries",
        phone: "012 651 2052", phone_href: "0126512052", email: "property@heartland.co.za" }
    ] })] });
    await wait(80);
    const c = rows(b, 'contacts');
    ok("the contacts card draws every reachable person", c.length === 2);
    ok("the switchboard is LAST, after the people who know the deal",
       /General Enquiries/.test(c[1].textContent));
    ok("the number is dialable", c[0].querySelector('[data-hl="phone"]')
       .getAttribute('href') === 'tel:0608135798');
    ok("and the human spacing is what is shown, not the digits",
       /060 813 5798/.test(c[0].textContent));
    ok("the email is a mailto", c[0].querySelector('[data-hl="email"]')
       .getAttribute('href') === 'mailto:anneke@heartland.co.za');
    ok("a tel: link is NOT forced into a new tab - that leaves a blank tab behind the dialler",
       c[0].querySelector('[data-hl="phone"]').getAttribute('target') === null &&
       c[0].querySelector('[data-hl="email"]').getAttribute('target') === null);
  }

  {
    const b = boot({ list: [res({ contacts: [
      { key: "phone-only", label: "Site", name: "Site Office", phone: "012 000 0000",
        phone_href: "0120000000", email: "" },
      { key: "email-only", label: "Admin", name: "Admin Desk", phone: "", phone_href: "",
        email: "admin@heartland.co.za" },
      { key: "neither", label: "Ghost", name: "Unreachable", phone: "", phone_href: "", email: "" }
    ] })] });
    await wait(80);
    const c = rows(b, 'contacts');
    ok("somebody with neither a number nor an address is dropped", c.length === 2);
    ok("a phone-only contact hides the email row rather than linking mailto:",
       c[0].querySelector('[data-hl="email"]').style.display === 'none');
    ok("and an email-only contact hides the phone row",
       c[1].querySelector('[data-hl="phone"]').style.display === 'none');
  }

  {
    const b = boot({ list: [res({
      status: "cancelled",
      cancel_reason: "The buyer withdrew.",
      contacts: [{ key: "general", label: "General", name: "General Enquiries",
                   phone: "012 651 2052", phone_href: "0126512052", email: "" }]
    })] });
    await wait(80);
    ok("A BLOCKED DEAL KEEPS ITS CONTACTS CARD - that buyer needs the number most",
       rows(b, 'contacts').length === 1);
  }

  {
    const b = boot({ list: [res({ contacts: [] })] });
    await wait(80);
    ok("no contacts shows the empty state rather than an empty styled card",
       rows(b, 'contacts').length === 0 && b.shown('[data-hl-empty="contacts"]'));
  }

  /* ---------------------------------------------------- the staff preview */
  {
    /* NO MEMBERSTACK COOKIE AT ALL - a salesperson has none, and the whole point is
       that they never authenticate as the buyer. */
    const b = boot({ search: "?preview=res-1", noCookie: true, staffToken: "staff-tok",
                     previewRes: res({ documents: [{ doc_type: "otp-signed", label: "OTP",
                       url: "https://x/1.pdf" }] }) });
    await wait(80);
    ok("it reads the STAFF endpoint, not the member one",
       b.calls.some(c => /\/staff\/reservations\/res-1\/portal-view/.test(c.url)));
    ok("with the staff token",
       b.calls.some(c => c.auth === 'Bearer staff-tok'));
    ok("and never exchanges a Memberstack token",
       !b.calls.some(c => c.url.indexOf('/auth/memberstack') > -1));
    ok("and never calls the member endpoint either",
       !b.calls.some(c => c.url.indexOf('/member/reservations') > -1));
    ok("no cookie does NOT bounce it to the login page", b.redirects.length === 0);
    ok("the dashboard is rendered, not a summary of it", b.shown('[data-hl-portal-body]'));
    ok("it knows it is a preview", b.w.HLPortal.preview() === true);
    ok("and who is looking", b.w.HLPortal.previewBy() === 'Sipho N');

    const bar = b.$('#hl-preview-bar');
    ok("an unmissable banner is painted", !!bar);
    ok("it says read only", /read only/i.test(bar.textContent));
    ok("and names the buyer whose screen this is", /Home 6/.test(bar.textContent));
    ok("and the salesperson looking", /Sipho N/.test(bar.textContent));

    /* THE ACTIONS ARE DEAD. Anything else and a salesperson opens a signing session
       in the buyer's name, or sends a real pre-qualification the broker attributes. */
    const otp = b.all('[data-hl-otp-link]');
    ok("the signing link is stripped of its href",
       otp.length > 0 && otp.every(a => !a.getAttribute('href')));
    ok("and marked as disabled rather than silently inert",
       otp.every(a => a.getAttribute('aria-disabled') === 'true'));
    const steps = b.all('[data-hl-step-link]');
    ok("the pre-qualify link is dead too",
       steps.every(a => !a.getAttribute('href')));

    /* READING IS THE POINT, so the documents still open. */
    const docs = b.all('[data-hl-list="documents"] [data-hl-row]');
    ok("but a document link still works - reading is the whole point",
       docs.length === 1 && docs[0].getAttribute('href') === 'https://x/1.pdf');
  }

  {
    const b = boot({ search: "?preview=res-1", noCookie: true, staffToken: "" });
    await wait(80);
    ok("a preview url with no staff session asks nothing of the server",
       !b.calls.some(c => c.url.indexOf('/portal-view') > -1));
    ok("and says where to open it from",
       /sales console/i.test(b.$('[data-hl-portal-message]').textContent));
    ok("rather than bouncing to the buyer login", b.redirects.length === 0);
  }

  {
    const b = boot({ search: "?preview=res-1", noCookie: true, staffToken: "stale",
                     previewFails: true });
    await wait(80);
    ok("a refused staff token does not leave the page spinning",
       !b.shown('[data-hl-portal-loading]') && b.shown('[data-hl-portal-empty]'));
    ok("and tells them to sign in again",
       /sign in again/i.test(b.$('[data-hl-portal-message]').textContent));
  }

  /* --------------------------------------- ticking the completed steps */
  {
    /* Cash route: sign-otp, pay-deposit, transfer-attorneys. Sitting on the LAST one
       means the first two are finished, and a finished step has to look finished -
       until 31 Aug a done step and an unreached one drew the identical empty circle. */
    const b = boot({ list: [res({ payer_route: "cash", deal_stage: "finance",
                                  deal_sub_stage: "transfer-attorneys" })] });
    await wait(80);
    const step = n => b.$(`[data-hl-substage="${n}"]`);
    const mark = n => step(n).querySelector('[data-hl-mark]');

    ok("the step behind you is done", step('sign-otp').classList.contains('is-done'));
    ok("and so is the one before that", step('pay-deposit').classList.contains('is-done'));
    ok("the one you are on is active", step('transfer-attorneys').classList.contains('is-active'));

    /* THE DOT IS WHERE THE TICK IS DRAWN, and the Designer's stylesheet can only
       reach it through a combo class - so the state has to be ON the dot. */
    ok("the dot on a done step is marked done", mark('sign-otp').classList.contains('is-done'));
    ok("the dot on the current step is marked active",
       mark('transfer-attorneys').classList.contains('is-active'));
    ok("and a done dot is not also active or todo",
       !mark('sign-otp').classList.contains('is-active') &&
       !mark('sign-otp').classList.contains('is-todo'));
    ok("a step this route never visits is removed, not ticked",
       step('bond-approval').style.display === 'none');
  }

  {
    /* Earlier in the same route: nothing behind you yet. */
    const b = boot({ list: [res({ payer_route: "cash", deal_stage: "finance",
                                  deal_sub_stage: "sign-otp" })] });
    await wait(80);
    const mark = n => b.$(`[data-hl-substage="${n}"]`).querySelector('[data-hl-mark]');
    ok("the first step is active, not done", mark('sign-otp').classList.contains('is-active') &&
       !mark('sign-otp').classList.contains('is-done'));
    ok("and a step ahead is todo", mark('pay-deposit').classList.contains('is-todo'));
  }

  {
    /* A bond buyer reaching bond-approved has FOUR steps behind them, including
       transfer-attorneys, which sits last in the display list but earlier in the walk. */
    const b = boot({ list: [res({ payer_route: "bond", deal_stage: "finance",
                                  deal_sub_stage: "bond-approved" })] });
    await wait(80);
    const done = n => b.$(`[data-hl-substage="${n}"]`).querySelector('[data-hl-mark]')
                       .classList.contains('is-done');
    ok("every bond step behind the buyer is ticked",
       done('pre-qualify') && done('sign-otp') && done('pay-deposit') && done('bond-approval'));
    ok("and the one still ahead is not",
       !done('transfer-attorneys'));
  }

  /* ------------------------------------------- the handoff, on its own */
  {
    /* NO sessionStorage AT ALL - the browser did not clone it. The note is the only
       way in, and it must be enough. */
    const b = boot({ search: "?preview=res-1", noCookie: true, staffToken: "",
                     handoff: { t: "handed-tok", uuid: "res-1", at: Date.now() } });
    await wait(80);
    ok("a preview works from the note alone, with no cloned session",
       b.calls.some(c => c.auth === 'Bearer handed-tok'));
    ok("and the note is consumed, not left lying in localStorage",
       b.w.localStorage.getItem('hl_preview_handoff') === null);
    ok("and kept for THIS tab so a refresh still works",
       b.session('hl_staff_token') === 'handed-tok');
  }

  {
    const b = boot({ search: "?preview=res-1", noCookie: true, staffToken: "",
                     handoff: { t: "handed-tok", uuid: "res-1", at: Date.now() - 5 * 60 * 1000 } });
    await wait(80);
    ok("a note older than a minute is refused",
       !b.calls.some(c => c.url.indexOf('/portal-view') > -1));
    ok("and is still removed, because a stale token left behind is the worst outcome",
       b.w.localStorage.getItem('hl_preview_handoff') === null);
  }

  {
    /* Addressed to one reservation. A note written for res-1 does not open res-2. */
    const b = boot({ search: "?preview=res-2", noCookie: true, staffToken: "",
                     handoff: { t: "handed-tok", uuid: "res-1", at: Date.now() } });
    await wait(80);
    ok("a note for a different reservation is refused",
       !b.calls.some(c => c.url.indexOf('/portal-view') > -1));
  }

  {
    const b = boot({ search: "?preview=res-1", noCookie: true, staffToken: "",
                     handoff: "{not json" });
    await wait(80);
    ok("a corrupt note is refused rather than thrown on",
       !b.calls.some(c => c.url.indexOf('/portal-view') > -1) &&
       b.shown('[data-hl-portal-empty]'));
  }

  {
    /* The cloned session is the FALLBACK, and it must still work - that is what makes
       a refresh of an already-open preview tab keep working. */
    const b = boot({ search: "?preview=res-1", noCookie: true, staffToken: "cloned-tok" });
    await wait(80);
    ok("with no note at all, this tab's own session is used",
       b.calls.some(c => c.auth === 'Bearer cloned-tok'));
  }

  {
    /* A BLOCKED DEAL IS THE CASE THAT MATTERS. The server withholds otp_url, so the
       preview must show the same absence - staff see what the buyer sees, including
       what the buyer cannot. */
    const b = boot({ search: "?preview=res-1", noCookie: true, staffToken: "staff-tok",
                     previewRes: res({ otp_url: null, otp_available: false, is_blocked: true,
                                       blocked_reason: "The time to sign has passed." }) });
    await wait(80);
    ok("a blocked deal previews as blocked", b.w.HLPortal.blocked() === true);
    ok("and the reason the buyer reads is on the page",
       /time to sign has passed/.test(b.$('[data-hl-blocked-reason]').textContent));
  }

  {
    /* The tab links must carry the preview, not ?r= - which would send the salesperson
       to a tab that tries to authenticate as a member and bounces to the login. */
    const b = boot({ search: "?preview=res-1", noCookie: true, staffToken: "staff-tok" });
    await wait(80);
    const href = a => a.getAttribute('href');
    const links = b.all('a[href]')
      .filter(a => /^\/portal/.test(href(a)) && href(a).indexOf('/portal-login') !== 0);
    ok("portal links carry the preview handle",
       links.length > 0 && links.every(a => /preview=res-1/.test(href(a))));
    ok("and none of them carries ?r=",
       links.every(a => !/[?&]r=/.test(href(a))));
    /* Log out is excluded from carrySelection deliberately - and it must stay excluded
       here, or a salesperson leaving the preview lands back in it. */
    const out = b.all('a[href]').filter(a => href(a).indexOf('/portal-login') === 0);
    ok("but the way out does not",
       out.length > 0 && out.every(a => !/preview=/.test(href(a))));
  }

  {
    /* An ordinary member load must be untouched by any of this. */
    const b = boot();
    await wait(80);
    ok("a buyer's own load is not a preview", b.w.HLPortal.preview() === false);
    ok("and paints no staff banner", !b.$('#hl-preview-bar'));
    const otp = b.all('[data-hl-otp-link]');
    ok("and their signing link is live",
       otp.length > 0 && otp.some(a => a.getAttribute('href') === 'https://sign.zoho.com/x'));
  }

  {
    const b = boot({ authFails: true });
    await wait(80);
    ok("a refused token does not leave the page spinning",
       !b.shown('[data-hl-portal-loading]') && b.shown('[data-hl-portal-empty]'));
    ok("and says something a person can act on",
       /refresh|log in/i.test(b.$('[data-hl-portal-message]').textContent));
  }

  /* ---------------------------------------------------- inert elsewhere */
  {
    const dom = new JSDOM('<!doctype html><html><body><div>nothing</div></body></html>',
      { runScripts: "dangerously", url: "https://www.heartland.co.za/polaris" });
    let fetched = 0;
    dom.window.document.cookie = "_ms-mid=ms-token-abc";
    dom.window.fetch = () => { fetched++; return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("{}") }); };
    dom.window.eval(SRC);
    await wait(60);
    ok("the portal does nothing on a page that has not asked for it", fetched === 0);
    ok("and does not expose itself either", typeof dom.window.HLPortal === 'undefined');
  }

  const bad = A.filter(a => !a.pass);
  A.forEach(a => console.log((a.pass ? '  ok  ' : 'FAIL  ') + a.n));
  console.log('\n' + (A.length - bad.length) + '/' + A.length + ' passed');
  process.exit(bad.length ? 1 : 0);
})();
