/* ---------------------------------------------------------------------------
   THIS SUITE IS A MIRROR, AND IT IS NOT THE AUTHORITY.
   The logic under test is reproduced here from the server so it can be run without
   an HTTP round trip - the build session cannot reach Xano. That makes it useful and
   it makes it dangerous in exactly one way: a green run proves this COPY behaves, not
   that the deployed function does. When the server's rule changes, this file does not
   find out. Change both in the same commit, or the mirror becomes a confident lie.
   Extracted from release_expired_holds, Xano fn 179.
   --------------------------------------------------------------------------- */
// Extracted verbatim from release_expired_holds (fn 179), with $var supplied by the driver.
module.exports = function ($var) {
  var rows = $var.live || [];
  var nowMs = Number($var.now);
  var given = function (v) { return !(v === null || v === undefined); };
  var dryRun = given($var.in_dry) ? ($var.in_dry === true) : false;
  var slug = given($var.in_slug) ? String($var.in_slug).trim().toLowerCase() : '';
  var grace = given($var.in_grace) ? Number($var.in_grace) : 0;
  if (isNaN(grace) || grace < 0) { grace = 0; }

  var ms = function (v) {
    if (v === null || v === undefined || v === '') { return null; }
    if (typeof v === 'number') { return isNaN(v) ? null : v; }
    var n = Number(v);
    if (!isNaN(n) && String(v).trim() !== '') { return n; }
    var d = Date.parse(String(v));
    return isNaN(d) ? null : d;
  };

  var MAY_LAPSE = { draft: true, held: true, awaiting_payment: true, payment_failed: true };

  var cutoff = nowMs - (grace * 1000);
  var release = [];
  var examined = 0, wrongSlug = 0, paidOrClearing = 0, noDeadline = 0, stillRunning = 0;
  var soonest = null;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    var key = r.active_hold_key;
    if (key === null || key === undefined || String(key).trim() === '') { continue; }
    if (slug !== '' && String(r.property_slug || '').trim().toLowerCase() !== slug) { wrongSlug++; continue; }
    examined = examined + 1;
    var st = String(r.status || '').trim().toLowerCase();
    if (MAY_LAPSE[st] !== true) { paidOrClearing++; continue; }
    var exp = ms(r.hold_expires_at);
    if (exp === null) { noDeadline++; continue; }
    if (exp > cutoff) { stillRunning++; if (soonest === null || exp < soonest) { soonest = exp; } continue; }
    var first = String(r.first_name || '').trim();
    var last = String(r.last_name || '').trim();
    var nm = (first + ' ' + last).trim();
    release.push({ id: r.id, uuid: r.uuid || null, reference: r.reference || null,
      property_slug: r.property_slug || null, wf_unit_id: r.wf_unit_id || null,
      was_status: st, hold_expires_at: exp,
      overdue_seconds: Math.round((nowMs - exp) / 1000),
      buyer_name: nm.length ? nm : null, buyer_email: r.email || null, last_step: r.last_step || null });
  }
  return { dry_run: dryRun, now: nowMs, grace_seconds: grace,
    property_slug: slug === '' ? null : slug, holds_found: rows.length, examined: examined,
    skipped_other_development: wrongSlug, skipped_paid_or_clearing: paidOrClearing,
    skipped_no_deadline: noDeadline, still_running: stillRunning, next_expiry_at: soonest,
    released_count: release.length, released: release };
};
