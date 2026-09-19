#!/usr/bin/env python3
# patch-oh14.py - a welcome modal on first arrival (Daniel, 19 Sep).
#
# Shown once a week, after the plan has revealed, and never to a visitor who
# arrived with intent (a ?unit= / ?unitType= / ?type= deep link) - they came
# for something specific and a modal in the way is hostile. Everything that
# dismisses it records the dismissal: the CTA, the close button, Escape and a
# click on the scrim. Focus moves into the dialog and is trapped while it is
# open, and returns to whatever had it when it closes.
#
#   python3 patch-oh14.py heartland-oh.js assets/oh/oh-v2.css
import sys
js_path, css_path = sys.argv[1], sys.argv[2]
s = open(js_path).read(); c = open(css_path).read()
def rep(text, old, new, count=1):
    assert text.count(old) == count, (text.count(old), old[:90])
    return text.replace(old, new)

JS = r'''
/* ---------------------------------------------------------------------------
   Welcome modal. One per visitor per week: localStorage keeps the timestamp of
   the last dismissal and anything sooner than WEEK skips it. It waits for the
   map to reveal (oh:map-revealed, with a timeout in case that never fires) so
   it does not land on top of the reveal animation, and it never appears for a
   deep link. window.ohWelcome.reset() clears the stamp, for testing.
--------------------------------------------------------------------------- */
(function () {
  if (window.ohWelcome) return;
  var KEY = 'oh_welcome_v1';
  var WEEK = 7 * 24 * 60 * 60 * 1000;
  var IMG = 'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/6aaa47dfc9788e45271cdedf_3DR517%20-%20AoA%20Oakhills%20-%20Exteriors.RGB_color.0001%20copy%201';

  function stamp(v) {
    try {
      if (v === null) localStorage.removeItem(KEY);
      else if (v === undefined) return Number(localStorage.getItem(KEY)) || 0;
      else localStorage.setItem(KEY, String(v));
    } catch (e) { return 0; }   /* private mode: treat as never seen, never throw */
    return 0;
  }
  function seenRecently() { var t = stamp(); return !!t && (Date.now() - t) < WEEK; }
  /* a visitor who arrived at a specific unit or type is here for that, not for us */
  function deepLinked() { return /[?&](unit|unitType|type)=/.test(location.search); }

  var el = null, lastFocus = null;

  function build() {
    el = document.createElement('div');
    el.className = 'oh-welcome';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'oh-welcome-title');
    el.hidden = true;
    el.innerHTML =
      '<div class="oh-welcome_scrim" data-welcome-close></div>' +
      '<div class="oh-welcome_card" role="document" tabindex="-1">' +
        '<button type="button" class="oh-welcome_close" data-welcome-close aria-label="Close">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
        '</button>' +
        '<div class="oh-welcome_figure">' +
          '<img src="' + IMG + '-p-1080.avif"' +
            ' srcset="' + IMG + '-p-800.avif 800w, ' + IMG + '-p-1080.avif 1080w, ' + IMG + '-p-1600.avif 1600w"' +
            ' sizes="(max-width: 640px) 100vw, 560px"' +
            ' width="1600" height="900" decoding="async"' +
            ' alt="The entrance to Oakhills Estate, Stellenbosch">' +
        '</div>' +
        '<div class="oh-welcome_body">' +
          '<p class="oh-welcome_eyebrow">Oakhills Estate &middot; Stellenbosch</p>' +
          '<h2 class="oh-welcome_title" id="oh-welcome-title">Find your apartment on the plan</h2>' +
          '<p class="oh-welcome_lede">Every apartment at Oakhills, with live availability and pricing &mdash; explore the estate, or filter straight to what you are after.</p>' +
          '<ul class="oh-welcome_list">' +
            '<li><strong>Explore the estate.</strong> Tap any block or apartment for its price, size, orientation and outlook.</li>' +
            '<li><strong>Narrow it down.</strong> Filter by price, type, level, parking or the view you want to wake up to.</li>' +
            '<li class="oh-welcome_sales"><strong>Reserve online.</strong> Found the one? Reserve it and complete your details in a few steps.</li>' +
          '</ul>' +
          '<button type="button" class="oh-welcome_cta" data-welcome-close>Start exploring</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-welcome-close]')) close();
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return el;
  }

  function open() {
    if (!el) build();
    lastFocus = document.activeElement;
    el.hidden = false;
    document.documentElement.classList.add('oh-welcome-open');
    requestAnimationFrame(function () {
      el.classList.add('is-open');
      var card = el.querySelector('.oh-welcome_card');
      if (card) card.focus({ preventScroll: true });
    });
    document.dispatchEvent(new CustomEvent('oh:welcome-open'));
  }

  function close() {
    if (!el || el.hidden) return;
    stamp(Date.now());
    el.classList.remove('is-open');
    document.documentElement.classList.remove('oh-welcome-open');
    var done = function () { el.hidden = true; };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else setTimeout(done, 260);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    lastFocus = null;
    document.dispatchEvent(new CustomEvent('oh:welcome-close'));
  }

  var fired = false;
  function maybeOpen() {
    if (fired) return;
    fired = true;
    if (seenRecently() || deepLinked()) return;
    setTimeout(open, 350);   /* let the reveal settle before it lands */
  }
  document.addEventListener('oh:map-revealed', maybeOpen);
  setTimeout(maybeOpen, 9000);   /* the reveal never fired: show it anyway */

  window.ohWelcome = {
    open: function () { if (!el) build(); open(); },
    close: close,
    reset: function () { stamp(null); fired = false; }
  };
})();
'''

CSS = r'''
/* ---- welcome modal (patch-oh14) ------------------------------------------
   Above the lightbox so nothing can cover it; it is the first thing a visitor
   sees and it closes on the CTA, the x, Escape or the scrim. */
.oh-welcome{position:fixed;inset:0;z-index:2147483200;display:flex;align-items:center;justify-content:center;padding:1rem}
.oh-welcome[hidden]{display:none}
.oh-welcome_scrim{position:absolute;inset:0;background:rgba(21,23,20,.55);backdrop-filter:blur(3px);opacity:0;transition:opacity .25s ease}
.oh-welcome.is-open .oh-welcome_scrim{opacity:1}
.oh-welcome_card{font-family:var(--_typography---font--primary-family,"Helvetica Neue",sans-serif);position:relative;z-index:1;width:min(100%,34rem);max-height:calc(100dvh - 2rem);overflow:auto;overscroll-behavior:contain;background:#fff;border-radius:16px;box-shadow:0 30px 80px rgba(21,23,20,.35);opacity:0;transform:translateY(12px) scale(.985);transition:opacity .28s ease,transform .28s cubic-bezier(.22,1,.36,1)}
.oh-welcome.is-open .oh-welcome_card{opacity:1;transform:none}
.oh-welcome_figure{margin:0;aspect-ratio:16/9;background:var(--oh-sand);overflow:hidden}
.oh-welcome_figure img{display:block;width:100%;height:100%;object-fit:cover}
.oh-welcome_close{position:absolute;top:.75rem;right:.75rem;display:flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;padding:0;border:0;border-radius:999px;background:rgba(21,23,20,.42);color:#fff;cursor:pointer;transition:background .15s}
.oh-welcome_close:hover{background:rgba(21,23,20,.62)}
.oh-welcome_close svg{width:1.1rem;height:1.1rem}
.oh-welcome_body{padding:1.5rem 1.6rem 1.6rem}
.oh-welcome_eyebrow{margin:0 0 .5rem;color:var(--oh-ink);opacity:.6;font-size:.6875rem;letter-spacing:.14em;text-transform:uppercase}
.oh-welcome_title{font-family:var(--_typography---font--secondary-family,"Tenor Sans",serif);margin:0 0 .55rem;color:var(--oh-ink);font-size:1.5rem;line-height:1.2}
.oh-welcome_lede{margin:0 0 1.1rem;color:var(--oh-ink);opacity:.8;font-size:.9375rem;line-height:1.5}
.oh-welcome_list{margin:0 0 1.35rem;padding:0;list-style:none;display:flex;flex-direction:column;gap:.6rem}
.oh-welcome_list li{position:relative;padding-left:1.35rem;color:var(--oh-ink);opacity:.85;font-size:.875rem;line-height:1.45}
.oh-welcome_list li::before{content:"";position:absolute;left:0;top:.5em;width:.45rem;height:.45rem;border-radius:999px;background:var(--oh-accent)}
.oh-welcome_list strong{font-weight:600;opacity:1}
/* the reserve line is only true while sales are open */
html:not(.sales-open) .oh-welcome_sales{display:none}
.oh-welcome_cta{display:inline-flex;align-items:center;justify-content:center;width:100%;padding:.85rem 1.25rem;border:0;border-radius:999px;background:var(--oh-accent);color:#fff;font:inherit;font-size:.9375rem;font-weight:600;cursor:pointer;transition:filter .15s}
.oh-welcome_cta:hover{filter:brightness(1.06)}
.oh-welcome_cta:focus-visible,.oh-welcome_close:focus-visible{outline:2px solid var(--oh-ink);outline-offset:2px}
/* the card takes focus so the ring does not land on the CTA; a site-wide
   focus style would otherwise draw a box around the whole modal */
.oh-welcome .oh-welcome_card:focus,.oh-welcome .oh-welcome_card:focus-visible{outline:none!important}
@media (max-width:480px){
  .oh-welcome{padding:.75rem}
  .oh-welcome_body{padding:1.25rem 1.25rem 1.35rem}
  .oh-welcome_title{font-size:1.3125rem}
}
@media (prefers-reduced-motion:reduce){
  .oh-welcome_scrim,.oh-welcome_card{transition:none}
  .oh-welcome_card{transform:none}
}
'''

s = s.rstrip() + '\n' + JS
c = c.rstrip() + '\n' + CSS
open(js_path, 'w').write(s); open(css_path, 'w').write(c)
print('ok')
