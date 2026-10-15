/* ============================================================
   Oak Hills - enquiry form links (15 Oct 2026)
   The Register Interest form (#contact-us on the home page) has topic chips that are
   native Webflow checkboxes (#topic-pricing, -plans, -invest, -visit, -call, -other),
   a hidden "Enquiry source" field (#enquiry-source) and the Wized message field.
   Every enquire link on the site points to that form; this file switches on the right
   topic, fills the message when the link knows the unit type, floor plan or unit,
   and records where the person came from. Links are native Webflow links:
     data-enquire="visit"        topic to switch on (pricing|plans|invest|visit|call|other)
     data-enquire-type           Unit Types row: message names the row's type
     data-enquire-plan           floor plan viewer: message names the plan, viewer closes
     data-enquire-unit           /unit-selection unit panel: goes to /?enquire=..&unit=..#contact-us
   Links without the attribute that point at #contact-us get a topic from their text
   (component buttons, e.g. "Book a Site Visit", and the hero's campaign link).
   Loaded on the home page and on /unit-selection.
   ============================================================ */
(function () {
  if (window.ohEnquire) return;
  var TOPICS = ['pricing', 'plans', 'invest', 'visit', 'call', 'other'];
  var AUTO = /^I (would like to register my interest in|have a question about) /;

  function q(s, r) { return (r || document).querySelector(s); }
  function qa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function letter(x) { var m = /\b([ABC])\b/.exec(String(x || '')); return m ? m[1] : ''; }
  function unitNo(x) { var m = /\b(\d{1,2}-\d{2,4})\b/.exec(String(x || '')); return m ? m[1] : ''; }
  function section() { return document.getElementById('contact-us'); }

  function check(topic) {
    var sec = section(); if (!sec || TOPICS.indexOf(topic) < 0) return;
    qa('.oh-ask_chip-input', sec).forEach(function (cb) {
      var on = cb.id === 'topic-' + topic;
      if (cb.checked !== on) { cb.checked = on; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }
  function message(t) {
    var m = q('[wized="interest_message"]'); if (!m) return;
    if (m.value && !AUTO.test(m.value)) return; /* never overwrite what the person typed */
    if (m.value === (t || '')) return;
    m.value = t || ''; m.dispatchEvent(new Event('input', { bubbles: true })); /* no text: clear an earlier link's message */
  }
  function source(s) { var f = document.getElementById('enquiry-source'); if (f && s) f.value = s.slice(0, 200); }
  function scroll() { var sec = section(); if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  function inferTopic(label) {
    if (/tour|visit/i.test(label)) return 'visit';
    if (/agent|call/i.test(label)) return 'call';
    if (/invest|rental/i.test(label)) return 'invest';
    if (/floor ?plan/i.test(label)) return 'plans';
    if (/interest|early access|price|availab/i.test(label)) return 'pricing';
    return '';
  }
  function where(a) {
    var s = a.closest('section[id], nav, footer, [data-oh-native], .section');
    var name = s ? (s.id || s.getAttribute('data-oh-native') || (s.tagName === 'NAV' ? 'navigation' : s.tagName === 'FOOTER' ? 'footer' : (s.className.split(' ')[1] || 'section'))) : 'page';
    return txt(a) + ' (' + name.replace(/^is-/, '') + ')';
  }

  /* the person clicked an enquire link */
  function onClick(e) {
    var a = e.target.closest('a[data-enquire], a[data-oh-interest], a[href$="#contact-us"]');
    if (!a) return;
    var label = txt(a), topic = a.getAttribute('data-enquire') || '';
    if (a.hasAttribute('data-hero') || (!topic && !a.hasAttribute('data-oh-interest'))) topic = inferTopic(label) || topic;
    if (a.hasAttribute('data-oh-interest')) topic = 'pricing';

    if (a.hasAttribute('data-enquire-unit')) { /* /unit-selection: carry the unit to the home page form */
      var u = unitNo(txt(q('[wized="v2_udNumber"]')) || txt(q('[data-oh-es="title"]')));
      a.setAttribute('href', '/?enquire=' + (topic || 'pricing') + (u ? '&unit=' + encodeURIComponent(u) : '') + '#contact-us');
      return;
    }
    if (!section()) return; /* another page: the link goes to /#contact-us and the load handler takes over */

    var msg = '';
    if (a.hasAttribute('data-enquire-type')) {
      var k = letter(txt(q('[wized="unit_type_letter"]', a.closest('[wized="unit_type_item"]'))));
      if (k) msg = 'I have a question about Unit Type ' + k + '.';
    }
    if (a.hasAttribute('data-enquire-plan')) {
      var plan = txt(q('[data-oh-native="fpv"] .oh-fpv_title'));
      if (plan) msg = 'I have a question about the ' + plan + ' floor plan.';
      if (window.ohPlans) window.ohPlans.close();
      e.preventDefault(); setTimeout(scroll, 60);
    }
    if (topic) check(topic);
    message(msg);
    source(where(a));
  }

  /* arriving from another page: /?enquire=pricing&unit=2-206#contact-us */
  function fromUrl() {
    var p = new URLSearchParams(location.search), topic = p.get('enquire'), unit = unitNo(p.get('unit')), type = letter(p.get('type'));
    if (!topic && !unit && !type) return;
    var go = function () {
      if (!section()) return;
      if (topic) check(topic);
      if (unit) message('I have a question about unit ' + unit + '.');
      else if (type) message('I have a question about Unit Type ' + type + '.');
      source(unit ? 'Unit selection page, unit ' + unit : 'Link from another page');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
    window.addEventListener('load', function () { go(); if (location.hash === '#contact-us') setTimeout(scroll, 300); });
  }

  /* Unit Types rows: "Ask about Type A" on released types; types not yet released have Register Interest */
  function rows() {
    qa('[wized="unit_type_item"]').forEach(function (it) {
      var a = q('a[data-enquire-type]', it); if (!a) return;
      var k = letter(txt(q('[wized="unit_type_letter"]', it)));
      var soon = !!q('[wized="unit_type_coming_soon_tag"]', it);
      var hide = !k || soon, label = k ? 'Ask about Type ' + k : '';
      if (a.style.display !== (hide ? 'none' : '')) a.style.display = hide ? 'none' : '';
      if (label && a.textContent !== label) a.textContent = label;
    });
  }
  var queued = false;
  function queue() { if (!queued) { queued = true; setTimeout(function () { queued = false; rows(); }, 80); } }

  window.addEventListener('click', onClick, true); /* window capture: runs before oh-home's document handler */
  fromUrl();
  (function wait(n) {
    var list = q('[wized="unit_types_list"]');
    if (!list) { if (n < 50) setTimeout(function () { wait(n + 1); }, 200); return; }
    new MutationObserver(queue).observe(list, { childList: true, subtree: true, characterData: true });
    queue();
  })(0);
  window.ohEnquire = { check: check, message: message, source: source };
})();
