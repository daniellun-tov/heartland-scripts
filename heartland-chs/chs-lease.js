/* CHS Residence - lease application page
   ------------------------------------------------------------------------
   Companion to /chs-lease-application. Formly (Pro) drives the steps; this
   file only does what Formly cannot:

     - fills the "Your selection" card from the URL the reserve page hands
       over (chs-selector.js builds it), and locks those fields; a direct
       visitor with no parameters gets them unlocked instead
     - makes a whole option row clickable, not just the radio dot
     - keeps "Step x of y" in sync with the progress bar (data-skip-to on the
       private-payer branch makes Formly's own counter read 5 of 6)
     - scrolls to the top of the steps column whenever the step changes.
       Formly's data-scroll-top scrolls to the form itself, which on a phone
       is the "Your selection" card above the steps, so the form is not on
       that attribute any more; this owns the scroll instead
     - on the live domain only: shows "Submitting..." while an external
       redirect runs and hands the form back if nothing happens in time

   No copy and no data live here. Field names are the form's own.          */
(function () {
  'use strict';

  var LOCKED = ['apartment', 'bed-number', 'room-type', 'student-gender', 'bed-price'];
  var TIMEOUT_MS = 15000;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  // 5400 -> "R 5 400" (non-breaking spaces, as the CMS writes it)
  function rand(v) {
    var n = String(v).replace(/[^\d.]/g, '');
    if (!n) return String(v);
    return 'R ' + Math.round(parseFloat(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function prefill(form) {
    var params = new URLSearchParams(window.location.search);
    LOCKED.forEach(function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      if (!el) return;
      var v = params.get(name);
      if (v) {
        el.value = name === 'bed-price' ? rand(v) : v;
        el.readOnly = true;
        el.setAttribute('tabindex', '-1');
        el.classList.add('is-readonly');
      } else {
        el.readOnly = false;
        el.removeAttribute('tabindex');
        el.classList.remove('is-readonly');
      }
    });
    params.forEach(function (value, key) {
      if (LOCKED.indexOf(key) > -1) return;
      $$('[name="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]', form).forEach(function (el) {
        if (el.type === 'radio' || el.type === 'checkbox') {
          if (String(el.value).toLowerCase() === value.toLowerCase()) el.checked = true;
        } else if (!el.value) {
          el.value = value;
        }
      });
    });
  }

  function rowClicks(form) {
    form.addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.chs-application_radio-row') : null;
      if (!row || !form.contains(row)) return;
      var input = row.querySelector('input[type="radio"], input[type="checkbox"]');
      if (!input || e.target === input || (e.target.closest && e.target.closest('a'))) return;
      input.click();   // a real click, so Formly's change-driven logic fires
    });
  }

  function stepCounter() {
    var progress = $('[data-form="progress"]');
    var cur = $('[data-text="current-step"]');
    var tot = $('[data-text="total-steps"]');
    if (!progress || !cur) return;
    function sync() {
      var dots = $$('[data-form="progress-indicator"]', progress);
      var lit  = $$('[data-form="progress-indicator"].current', progress);
      if (!dots.length) return;
      var c = String(Math.max(1, lit.length)), t = String(dots.length);
      if (cur.textContent !== c) cur.textContent = c;
      if (tot && tot.textContent !== t) tot.textContent = t;
    }
    if (window.MutationObserver) {
      new MutationObserver(sync).observe(progress, { attributes: true, subtree: true, childList: true, attributeFilter: ['class'] });
      new MutationObserver(sync).observe(cur, { childList: true, characterData: true, subtree: true });
    }
    setTimeout(sync, 300);
  }

  // Scroll to the steps column (not the form top) when Formly changes step.
  // Watches the steps' style/class so Next, Back, Enter and logic jumps all
  // count, and a failed validation (step unchanged) does not scroll away
  // from the field Formly flagged.
  function stepScroll(form) {
    var column = form.querySelector('.chs-application_steps-column') || form;
    var steps = $$('[data-form="step"]', form);
    if (!steps.length || !window.MutationObserver) return;
    function visible() {
      for (var i = 0; i < steps.length; i++) if (steps[i].offsetParent !== null) return steps[i];
      return null;
    }
    var last = visible(), pending = null;
    new MutationObserver(function () {
      if (pending) return;
      pending = setTimeout(function () {
        pending = null;
        var now = visible();
        if (!now || now === last) return;
        var was = last; last = now;
        if (!was) return;                                   // first render, not a step change
        var top = column.getBoundingClientRect().top + (window.pageYOffset || 0) - 16;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }, 60);
    }).observe(column, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
  }

  function liveSubmit(form) {
    if (/\.webflow\.io$/i.test(window.location.hostname)) return;   // staging shows Webflow's own message
    var btn  = form.querySelector('[data-form="submit-btn"]');
    var orig = btn ? btn.value : 'Submit Application';
    var wrap = form.closest('.w-form');
    var done = wrap && wrap.querySelector('.w-form-done');
    var fail = wrap && wrap.querySelector('.w-form-fail');
    var timer = null;
    function submitting() {
      if (done) done.style.display = 'none';
      if (fail) fail.style.display = 'none';
      form.style.display = '';
      if (btn) { btn.value = 'Submitting...'; btn.disabled = true; }
    }
    function timedOut() {
      timer = null;
      if (done) done.style.display = 'none';
      form.style.display = '';
      if (fail) { fail.style.display = 'block'; fail.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      if (btn) { btn.value = orig; btn.disabled = false; }
    }
    form.addEventListener('submit', function () {
      clearTimeout(timer); submitting(); timer = setTimeout(timedOut, TIMEOUT_MS);
    }, true);
    if (done) new MutationObserver(function () { if (done.offsetParent !== null && timer) submitting(); })
      .observe(done, { attributes: true, attributeFilter: ['style', 'class'] });
    if (fail) new MutationObserver(function () {
      if (fail.offsetParent !== null && timer) { clearTimeout(timer); timer = null; if (btn) { btn.value = orig; btn.disabled = false; } }
    }).observe(fail, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  function init() {
    var form = $('[data-chs="lease-form"]') || document.getElementById('chs-lease-application-form');
    if (!form) return;
    if (window.location.search.length > 1) {
      prefill(form);
      setTimeout(function () { prefill(form); }, 400);   // Formly's memory can restore over it
    } else {
      prefill(form);                                       // unlocks the card for direct visitors
    }
    var signed = form.querySelector('[name="date-signed"]');
    if (signed && !signed.value) signed.value = new Date().toISOString().slice(0, 10);
    rowClicks(form);
    stepCounter();
    stepScroll(form);
    liveSubmit(form);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
