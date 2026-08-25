/* ============================================================================
   HEARTLAND - stage F. Buyer-detail field behaviours.

   Three things, all requested 24 Aug. Written as a standalone module so the same
   code can later move onto the real details page without being rewritten.

     1. Date of birth, derived from a South African ID number.
     2. Nationality enforced as required.
     3. Address autocomplete that costs nothing.
   ========================================================================== */
(function (w) {
  "use strict";

  /* -------------------------------------------------- 1. SA ID -> date of birth

     A South African ID is 13 digits: YYMMDD SSSS C A Z.
       YYMMDD  date of birth
       SSSS    sequence, and it encodes gender
       C       citizenship: 0 South African, 1 permanent resident
       A       historically a race digit, unused since 1994
       Z       Luhn check digit over the preceding 12

     DELIBERATELY NOT DONE: nationality is NOT inferred from the citizenship
     digit. A permanent resident is not South African, and quietly stamping a
     nationality onto a person from a digit would be both wrong and the kind of
     thing nobody notices until it is on a signed document. */

  function digitsOnly(v) {
    return String(v === null || v === undefined ? "" : v).replace(/[^0-9]/g, "");
  }

  /* The check digit is what turns a typo into a caught typo. Without it a
     transposed pair still yields a plausible date - and that date would travel
     onto the OTP. */
  function luhnOk(id) {
    if (id.length !== 13) { return false; }
    var sum = 0, alt = false, i, n;
    for (i = id.length - 1; i >= 0; i--) {
      n = Number(id.charAt(i));
      if (alt) { n *= 2; if (n > 9) { n -= 9; } }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /* Century. "85" is 1985 and "07" is 2007, but the digits alone cannot say which.
     The rule used here is domain-specific and better than the usual "not in the
     future": a property buyer is at least 18, so a two-digit year that would make
     them younger than that belongs to the previous century. Plain "not in the
     future" would read 25 as 2025 and hand us a one-year-old buyer. */
  var MIN_AGE = 18;

  function dobFromSaId(raw, todayYear) {
    var id = digitsOnly(raw);
    if (id.length !== 13) { return { ok: false, reason: "not 13 digits" }; }

    var yy = Number(id.slice(0, 2));
    var mm = Number(id.slice(2, 4));
    var dd = Number(id.slice(4, 6));
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) { return { ok: false, reason: "not a real date" }; }

    var year = 2000 + yy;
    if (year > todayYear - MIN_AGE) { year = 1900 + yy; }

    // Rejects 31 February and friends: the Date would silently roll into March.
    var d = new Date(Date.UTC(year, mm - 1, dd));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) {
      return { ok: false, reason: "not a real date" };
    }

    return {
      ok: true,
      iso: year + "-" + pad2(mm) + "-" + pad2(dd),
      checkDigitOk: luhnOk(id)
    };
  }

  /* Only an Individual has an ID number in this shape. A company registration is
     2019/123456/07 and a trust is IT1234/2019 - parsing either as a date would
     produce confident nonsense. Exact match, lowercased; never a substring test. */
  function isIndividual(buyerType) {
    return String(buyerType === null || buyerType === undefined ? "" : buyerType)
      .trim().toLowerCase() === "individual";
  }

  /* ------------------------------------------------------- 2. nationality gate

     The native `required` cannot be relied on here. On the live details page the
     nationality select is driven by a country-picker library (data-dropdown=
     "country"), which hides the real <select>; a hidden required control either
     cannot be focused - so the browser refuses to submit and only says so in the
     console - or is moved out of the form, so validation never runs at all.
     Checking the value ourselves sidesteps both. */
  function missingRequired(values, required) {
    var out = [];
    for (var i = 0; i < required.length; i++) {
      var k = required[i];
      var v = values[k];
      if (v === null || v === undefined || String(v).trim() === "") { out.push(k); }
    }
    return out;
  }

  /* --------------------------------------------------- 3. address autocomplete

     TWO LEVELS, and the first one is the one people forget.

     (a) The browser already knows the buyer's address. It just needs the field to
         say what it holds - autocomplete="street-address" and friends. No script,
         no service, no cost, no dependency, works offline. The live fields carry
         no autocomplete attributes at all today, which is why it never offers.

     (b) Search-as-you-type needs a geocoder. Photon is OpenStreetMap-based, free,
         and explicitly built for type-ahead. Nominatim is also free but its usage
         policy discourages autocomplete; Google Places and Mapbox both bill.

     Photon is a third party on a page that takes money, so it is strictly
     additive: debounced, abortable, and every failure path leaves the buyer
     typing a plain address exactly as they do now. */
  var PHOTON = "https://photon.komoot.io/api/";

  function addressSuggest(term, opts) {
    opts = opts || {};
    var q = String(term || "").trim();
    if (q.length < 4) { return Promise.resolve([]); }
    var url = PHOTON + "?q=" + encodeURIComponent(q) + "&limit=5&lang=en";
    if (opts.lat && opts.lon) { url += "&lat=" + opts.lat + "&lon=" + opts.lon; }
    return fetch(url, { signal: opts.signal })
      .then(function (r) { return r.ok ? r.json() : { features: [] }; })
      .then(function (j) { return ((j && j.features) || []).map(formatFeature); })
      .catch(function () { return []; });   // never surfaces to the buyer
  }

  function formatFeature(f) {
    var p = (f && f.properties) || {};
    var line = [
      [p.housenumber, p.street || p.name].filter(Boolean).join(" "),
      p.district,
      p.city,
      p.postcode,
      p.country
    ].filter(Boolean).join(", ");
    return { label: line, raw: p };
  }

  w.HLBuyer = {
    dobFromSaId: dobFromSaId,
    isIndividual: isIndividual,
    luhnOk: luhnOk,
    missingRequired: missingRequired,
    addressSuggest: addressSuggest,
    MIN_AGE: MIN_AGE
  };
})(window);
