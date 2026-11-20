/* ============================================================================
   LIVE PORTAL CHECK - not part of run.sh.
   Loads a PUBLISHED /portal (the webflow.io staging copy or the live domain) in
   Chromium with the Xano API stubbed by a test reservation, then screenshots it at
   a phone and a desktop width and reports horizontal overflow and the slides card.

     node tests/live-portal-check.js [url] [outdir]

   It never reaches Xano or Memberstack: both are answered or refused here, so no
   real member and no real reservation is touched. What it CANNOT judge: fonts from
   fonts.googleapis.com when the machine cannot reach them (widths are then measured
   in the fallback face), and anything the real member endpoint would add.
   ========================================================================== */
const { chromium } = require('playwright');
const fs = require('fs');

const URL = process.argv[2] || 'https://heartlandpropertydevelopers.webflow.io/portal';
const OUT = process.argv[3] || '/tmp/portal-shots';
fs.mkdirSync(OUT, { recursive: true });

const HR = 3600000, DAY = 24 * HR;
const now = Date.now();
/* A deadline at hh:20 SAST three days on, so the rounding shows. */
const due = Math.floor((now + 3 * DAY) / HR) * HR + 20 * 60000;

function reservation(over) {
  return Object.assign({
    uuid: "test-0001", reference: "RES-SAN-007", status: "confirmed",
    property_slug: "sanford", property_name: "Sanford Heart",
    theme: { primary: "#8a9380", secondary: "#845e46" },
    unit: { name: "Sanford Heart 07", display_name: "Home 7", unit_type_name: "Type A",
            bedrooms: 3, bathrooms: 4 },
    total_cents: 889500000, purchase_deposit_cents: 88950000, addons_total_cents: 0,
    payer_route: "bond", deal_stage: "finance", deal_sub_stage: "pre-qualify",
    deal_stage_due_at: due, days_left: 3,
    otp_url: "https://sign.zoho.com/test",
    contacts: [{ name: "Anneke Grobler", label: "Sales Executive", phone: "+27 82 000 0000",
                 email: "anneke.grobler@heartland.co.za" }]
  }, over || {});
}

(async () => {
  const browser = await chromium.launch();
  const report = [];
  for (const [name, w, h] of [["phone-390", 390, 844], ["phone-360", 360, 760], ["desktop-1440", 1440, 1000]]) {
    for (const sub of ["pre-qualify", "pay-deposit", "build"]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.addInitScript(() => { try { localStorage.setItem('_ms-mid', 'test-token'); } catch (e) {} });
      const res = sub === "build"
        ? reservation({ deal_stage: "build", deal_sub_stage: "upgrade-meeting", deal_stage_due_at: null, days_left: null })
        : reservation({ deal_sub_stage: sub });
      await page.route(/memberstack|ms-api|client\.memberstack/i, r => r.abort());
      await page.route(/xano\.io/, r => {
        const u = r.request().url();
        let body = {};
        if (/auth\/memberstack/.test(u)) {
          body = { authToken: "x", reservations: [res], count: 1, server_time: Date.now() };
        } else if (/member\/reservations/.test(u)) {
          body = { reservations: [res], count: 1, server_time: Date.now() };
        } else if (/public\/config/.test(u)) {
          body = { properties: [] };
        }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await page.goto(URL + '?cb=' + Date.now(), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.HLPortal && window.HLPortal.get && window.HLPortal.get(), null, { timeout: 20000 })
        .catch(() => {});
      await page.waitForTimeout(1500);
      const info = await page.evaluate(() => {
        const card = document.querySelector('[data-hl-slides-card]');
        const r = card ? card.getBoundingClientRect() : null;
        const aside = document.querySelector('.hlp-aside');
        const ar = aside ? aside.getBoundingClientRect() : null;
        const wraps = [];
        document.querySelectorAll('[data-hl-portal] .hl-btn, [data-hl-portal] .hlp-aside .hl-row-value, [data-hl-portal] .hlp-aside .hl-row-key')
          .forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.right > window.innerWidth + 0.5)) wraps.push((e.textContent || '').trim().slice(0, 40) + ' @' + Math.round(b.right)); });
        return {
          loaded: !!(window.HLPortal && window.HLPortal.get && window.HLPortal.get()),
          overflowX: document.documentElement.scrollWidth - window.innerWidth,
          card: card ? { shown: r.height > 0, w: Math.round(r.width), h: Math.round(r.height),
                         title: (card.querySelector('[data-hl-slides-title]') || {}).textContent || null,
                         meta: (card.querySelector('[data-hl-slides-meta]') || {}).textContent || null } : null,
          aside: ar ? { x: Math.round(ar.left), w: Math.round(ar.width), top: Math.round(ar.top + scrollY) } : null,
          due: (document.querySelector('[data-hl-due]') || {}).textContent || null,
          offRight: wraps
        };
      });
      await page.screenshot({ path: `${OUT}/${name}-${sub}.png`, fullPage: true });
      if (sub === "pre-qualify") {
        const link = await page.$('[data-hl-slides-card] .hl-slc-link');
        if (link) {
          await link.click();
          await page.waitForTimeout(800);
          info.lightbox = await page.evaluate(() => window.HLPortal.lightbox());
          await page.screenshot({ path: `${OUT}/${name}-lightbox.png` });
        }
      }
      report.push(Object.assign({ view: name, sub }, info));
      await ctx.close();
    }
  }
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
})();
