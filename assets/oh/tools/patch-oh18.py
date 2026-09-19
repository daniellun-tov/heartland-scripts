#!/usr/bin/env python3
"""oh18 - reserve handoff: run the hold and BOL in parallel (as v1 does), and stop
the Webflow success swap from hiding reservation errors.

Why: v2 serialised hold -> native submit -> BOL. The hold flips the unit in Xano,
so BOL refused to open a session, and because Webflow had already swapped the form
for its success block the error was written into a hidden element. Buyers saw
"Thank you" on a unit that was only held.
"""
import io, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
JS = os.path.normpath(os.path.join(ROOT, 'heartland-oh.js'))

src = io.open(JS, encoding='utf-8').read()

def sub(old, new, why):
    global src
    n = src.count(old)
    if n != 1:
        sys.exit('ABORT (%s): expected 1 match, found %d' % (why, n))
    src = src.replace(old, new)

# 1. status box lives on the .w-form wrapper, outside the <form>
sub(
"""  function showMsg(form, msg, isError) {
    let box = form.querySelector('.reservation-status');
    if (!box) {
      box = document.createElement('div');
      box.className = 'reservation-status';
      box.style.marginTop = '8px';
      box.style.fontSize = '0.95rem';
      form.appendChild(box);
    }""",
"""  /* The box sits on the .w-form WRAPPER, not inside the <form>: Webflow hides the
     form element when it swaps in its success block, so a message written inside it
     disappears exactly when a buyer most needs to read it. */
  function showMsg(form, msg, isError) {
    const host = form.closest('.w-form') || form.parentNode || form;
    let box = host.querySelector('.reservation-status');
    if (!box) {
      box = document.createElement('div');
      box.className = 'reservation-status';
      box.style.marginTop = '8px';
      box.style.fontSize = '0.95rem';
      host.appendChild(box);
    }""",
    'showMsg host')

# 2. startBol returns the URL; the caller decides when to navigate
sub(
"""    const redirectUrl = data.redirectUrl || data.url || data.reservationUrl;
    if (!redirectUrl) throw new Error('No redirect URL received from server');
    /* same tab: window.open is blocked by Safari and in-app browsers */
    window.location.href = redirectUrl;
  }""",
"""    const redirectUrl = data.redirectUrl || data.url || data.reservationUrl;
    if (!redirectUrl) throw new Error('No redirect URL received from server');
    return redirectUrl;
  }""",
    'startBol returns url')

# 3. hold and BOL in parallel; Webflow submit and navigation only on success
sub(
"""        showMsg(form, 'Holding your unit...');
        await placeHold(unitId, lead);
        document.dispatchEvent(new CustomEvent('oh:hold-placed', { detail: { unitId } }));
        /* Webflow Forms copy (feeds LeadConnector, unit fields included). After the
           hold so a refused hold still shows its error on a visible form; Webflow
           then swaps the form for its success block while BOL starts. */
        await window.ohNativeSubmit(form, 'Taking you to the secure reservation page...');
        await new Promise((r) => setTimeout(r, 400));

        showMsg(form, 'Taking you to the secure reservation page...');
        await startBol(unitNumber, lead);""",
"""        showMsg(form, 'Holding your unit...');

        /* Both at once, the way v1 does it - v1's page script never stops propagation,
           so Wized's reserve_unit_form submit (add_user_reservation +
           change_unit_status_reserved) runs alongside the BOL POST. Serialising them
           in v2 broke the handoff: the hold flips the unit in Xano first, and BOL then
           will not open a session for a unit that is no longer clear. */
        const [holdRes, bolRes] = await Promise.allSettled([
          placeHold(unitId, lead),
          startBol(unitNumber, lead),
        ]);

        /* A refused hold wins over a successful BOL answer: someone else took the
           unit, so the buyer must not be sent on to pay for it. */
        if (holdRes.status === 'rejected') throw holdRes.reason;
        if (bolRes.status === 'rejected') throw bolRes.reason;

        document.dispatchEvent(new CustomEvent('oh:hold-placed', { detail: { unitId } }));

        /* Only now, with a redirect URL in hand, hand the form to Webflow Forms
           (LeadConnector). Doing this before BOL answered swapped in the success
           block and hid every error behind a false "Thank you". */
        showMsg(form, 'Taking you to the secure reservation page...');
        await window.ohNativeSubmit(form, 'Taking you to the secure reservation page...');
        await new Promise((r) => setTimeout(r, 400));

        /* same tab: window.open is blocked by Safari and in-app browsers */
        window.location.href = bolRes.value;""",
    'parallel hold + bol')

io.open(JS, 'w', encoding='utf-8').write(src)
print('patched', JS)
