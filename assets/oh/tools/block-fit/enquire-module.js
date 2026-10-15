/* ---------------------------------------------------------------------------
   Enquiry ("Ask about this home" / "Talk to our sales team"), 16 Oct 2026.
   Native pieces (Designer):
     [data-oh-native="enquire"]   modal: overlay + dialog, z above the unit panel
       [data-oh-enq="sub|title|intro"]  head copy, set per entry point
       [data-oh-enq-close]        overlay + close button
       #wf-form-enquire-unit-v2   Webflow form named "Oakhills Register Interest"
                                  (same name as the home form, so Webflow Forms /
                                  LeadConnector file it the same way)
     [data-oh-enq-open="unit|general"]  entry links (unit panel, filters)
   Submit mirrors the home Register Interest form:
     1. POST {first_name,last_name,email,contact_number,message} to Xano /users
        (the endpoint the home form's Wized request add_user_interest calls)
     2. window.ohNativeSubmit(form): Webflow Forms copy -> LeadConnector
   The unit context goes into message ("I have a question about unit 2-206 ...",
   the wording oh-enquire.js uses on the home form), so the Xano keys stay exactly
   the home form's; the Webflow copy also fills the hidden "Enquiry source" field
   like the home form does. Public: window.ohEnquiry (oh-enquire.js owns window.ohEnquire).
--------------------------------------------------------------------------- */
(function () {
  var ENDPOINT = 'https://x7aj-untn-pq4t.n7e.xano.io/api:5xvncF1S/users';
  var FORM_ID = 'wf-form-enquire-unit-v2';
  var q = function (s, r) { return (r || document).querySelector(s); };
  var ctx = null, lastFocus = null;

  function modal() { return q('[data-oh-native="enquire"]'); }
  function curUnit() { return (window.ohUnitScreens && window.ohUnitScreens.current && window.ohUnitScreens.current()) || null; }
  function set(sel, s, root) { var el = q(sel, root); if (el) el.textContent = s; }
  function val(form, n) { var el = form.querySelector('[name="' + n + '"]'); return el ? String(el.value || '').trim() : ''; }

  function unitLine(u) {
    return ['Unit ' + u.unit_number, u.block_name ? 'Block ' + u.block_name : '', u.floor_label ? u.floor_label + ' floor' : '', u.type_code ? 'Type ' + u.type_code : ''].filter(Boolean).join(', ');
  }

  function reset(m) {
    var form = document.getElementById(FORM_ID); if (!form) return;
    var wrap = form.closest('.w-form');
    var done = wrap && wrap.querySelector('.w-form-done'), fail = wrap && wrap.querySelector('.w-form-fail');
    if (form.__ohSent) { form.reset(); form.__ohSent = false; }
    form.style.display = ''; if (done) done.style.display = ''; if (fail) fail.style.display = '';
    var btn = form.querySelector('input[type="submit"]'); if (btn) { btn.disabled = false; if (btn.__ohLabel) btn.value = btn.__ohLabel; }
    var st = form.querySelector('.oh-enq_status'); if (st) st.textContent = '';
    var msg = form.querySelector('[name="message"]'); if (msg && msg.__ohUser != null) { msg.value = msg.__ohUser; msg.__ohUser = null; }
  }

  function open(kind, opts) {
    var m = modal(); if (!m) return;
    opts = opts || {};
    var u = kind === 'unit' ? (opts.unit || curUnit()) : null;
    ctx = { kind: u ? 'unit' : 'general', unit: u, note: opts.note || '' };
    reset(m);
    if (u) {
      set('[data-oh-enq="sub"]', ['Unit ' + u.unit_number, u.block_name ? 'Block ' + u.block_name : '', u.type_code ? 'Type ' + u.type_code : ''].filter(Boolean).join(' · '), m);
      set('[data-oh-enq="title"]', 'Ask about this home', m);
      set('[data-oh-enq="intro"]', 'Questions about Unit ' + u.unit_number + ', the levy, finance or a viewing? Leave your details and our sales team will get back to you, usually within one working day.', m);
    } else {
      set('[data-oh-enq="sub"]', 'Oakhills Estate', m);
      set('[data-oh-enq="title"]', opts.title || 'Talk to our sales team', m);
      set('[data-oh-enq="intro"]', opts.intro || 'Tell us what you are looking for and our sales team will help you find the right home, usually within one working day.', m);
    }
    /* the API cannot set placeholders: replace Webflow's "Example Text" */
    var PH = { first_name: 'First name', last_name: 'Last name', email: 'you@example.com', contact_number: '082 123 4567' };
    Object.keys(PH).forEach(function (n) { var el = q('[name="' + n + '"]', m); if (el && (!el.placeholder || el.placeholder === 'Example Text')) el.placeholder = PH[n]; });
    var ta = q('[name="message"]', m);
    if (ta) ta.setAttribute('placeholder', u ? 'For example: is parking included, and when can I view it?' : 'For example: a two-bedroom on a higher floor, under R2.6m');
    lastFocus = document.activeElement;
    m.setAttribute('data-lenis-prevent', '');
    m.classList.add('is-open');
    document.documentElement.classList.add('oh-enq-on');
    var first = q('[name="first_name"]', m);
    if (first && window.matchMedia('(pointer: fine)').matches) setTimeout(function () { first.focus({ preventScroll: true }); }, 30);
  }

  function close() {
    var m = modal(); if (!m || !m.classList.contains('is-open')) return false;
    m.classList.remove('is-open');
    document.documentElement.classList.remove('oh-enq-on');
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (_) {}
    return true;
  }

  function status(form, s, isError) {
    var box = form.querySelector('.oh-enq_status');
    if (!box) { box = document.createElement('p'); box.className = 'oh-enq_status'; box.setAttribute('role', 'status'); form.appendChild(box); }
    box.textContent = s; box.classList.toggle('is-error', !!isError);
  }

  function bind() {
    var form = document.getElementById(FORM_ID);
    if (!form || form.__ohEnq) return;
    form.__ohEnq = true;
    form.addEventListener('submit', async function (e) {
      if (form.__ohNative) return;            /* Webflow's turn */
      e.preventDefault();
      e.stopImmediatePropagation();
      var btn = form.querySelector('input[type="submit"]');
      if (btn && !btn.__ohLabel) btn.__ohLabel = btn.value;
      var ta = form.querySelector('[name="message"]');
      var own = ta ? (ta.__ohUser != null ? ta.__ohUser : ta.value.trim()) : '';
      var c = ctx || { kind: 'general' };
      var head = c.unit ? 'I have a question about unit ' + c.unit.unit_number + ' (' + unitLine(c.unit).replace(/^Unit [^,]+, /, '') + ').' : 'I would like help finding the right home.';
      if (c.note) head += ' ' + c.note;
      var src = form.querySelector('[data-name="Enquiry source"], [name="Enquiry-source"], [name="Enquiry source"]');
      if (src) src.value = (c.unit ? 'Unit selection page, unit ' + c.unit.unit_number + ' (Ask about this home)' : 'Unit selection page (Talk to our sales team)').slice(0, 200);
      var payload = {
        first_name: val(form, 'first_name'),
        last_name: val(form, 'last_name'),
        email: val(form, 'email'),
        contact_number: val(form, 'contact_number'),
        message: own ? head + '\n\n' + own : head
      };
      if (!payload.first_name || !payload.last_name || !payload.email) return status(form, 'Please fill in your name and email.', true);
      status(form, '');
      if (btn) { btn.disabled = true; btn.value = 'Sending...'; }
      var saved = false;
      try {
        var res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        saved = res.ok;
        if (!res.ok) console.warn('[enquire] xano', res.status);
      } catch (err) { console.warn('[enquire] xano', err); }
      /* Webflow Forms gets the same message (with the unit context) */
      if (ta) { ta.__ohUser = own; ta.value = payload.message; }
      var native = await window.ohNativeSubmit(form, 'Thank you, ' + payload.first_name + '. Our sales team will be in touch shortly.');
      if (!native && !saved) {
        if (ta) { ta.value = own; ta.__ohUser = null; }
        if (btn) { btn.disabled = false; btn.value = btn.__ohLabel; }
        return status(form, 'Something went wrong. Please try again, or email us directly.', true);
      }
      form.__ohSent = true;
      if (ta) ta.__ohUser = null;
      document.dispatchEvent(new CustomEvent('oh:enquiry', { detail: { context: c.kind, unit: c.unit ? c.unit.unit_number : null } }));
      /* no fbq here: the pixel fix fires Lead from .w-form-done, which ohNativeSubmit shows */
    }, true);
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-oh-enq-open]');
    if (t) { e.preventDefault(); open(t.getAttribute('data-oh-enq-open')); return; }
    var x = e.target.closest && e.target.closest('[data-oh-enq-close]');
    if (x && x.closest('[data-oh-native="enquire"]')) { e.preventDefault(); close(); }
  });
  /* window capture: runs before the panel's own Escape handler, so Escape closes only the enquiry */
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && close()) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  window.ohEnquiry = { open: open, close: close };
})();
