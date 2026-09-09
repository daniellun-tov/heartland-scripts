/* ---------------------------------------------------------------------------
   THIS SUITE IS A MIRROR, AND IT IS NOT THE AUTHORITY.
   The logic under test is reproduced here from the server so it can be run without
   an HTTP round trip - the build session cannot reach Xano. That makes it useful and
   it makes it dangerous in exactly one way: a green run proves this COPY behaves, not
   that the deployed function does. When the server's rule changes, this file does not
   find out. Change both in the same commit, or the mirror becomes a confident lie.
   The authority is the /public/options resolver in Xano.
   --------------------------------------------------------------------------- */
/* ============================================================================
   The /public/options price resolver. The lambda body is reproduced here so the
   resolution rules can be tested without an HTTP round trip - the container
   cannot reach Xano. Rows are real shapes taken from res_options,
   res_option_groups and res_option_prices after the first resync.
   ========================================================================== */
const A = []; const ok = (n, c) => A.push({ n, pass: !!c });

function resolve(groups, options, prices, input) {
  var wantType = String((input || {}).unit_type || '').trim();
  var wantUnit = String((input || {}).unit || '').trim();

  var priceOf = {};
  for (var p = 0; p < prices.length; p++) {
    var pr = prices[p];
    priceOf[pr.scope + ':' + pr.ref_id + ':' + pr.slot] = pr.price_cents;
  }

  var offeredHere = function (o) {
    var refs = o.unit_type_refs || [];
    if (!refs.length) { return true; }
    if (!wantType) { return true; }
    for (var i = 0; i < refs.length; i++) { if (refs[i] === wantType) { return true; } }
    return false;
  };

  var byGroup = {}; var unresolved = 0;

  for (var o = 0; o < options.length; o++) {
    var op = options[o];
    if (!offeredHere(op)) { continue; }
    var cents = null; var status = 'fixed';

    if (op.price_source === 'slot') {
      if (op.price_scope === 'unit_type') {
        if (!wantType) { status = 'needs_unit_type'; }
        else {
          var kt = 'unit_type:' + wantType + ':' + op.unit_slot;
          if (priceOf[kt] === undefined) { status = 'missing'; unresolved++; }
          else { cents = priceOf[kt]; status = 'resolved'; }
        }
      } else if (op.price_scope === 'unit') {
        if (!wantUnit) { status = 'needs_unit'; }
        else {
          var ku = 'unit:' + wantUnit + ':' + op.unit_slot;
          if (priceOf[ku] === undefined) { status = 'missing'; unresolved++; }
          else { cents = priceOf[ku]; status = 'resolved'; }
        }
      } else { status = 'missing'; unresolved++; }
    } else {
      cents = op.price_cents;
      if (cents === null || cents === undefined) { status = 'on_consultation'; }
    }

    if (!byGroup[op.group_slug]) { byGroup[op.group_slug] = []; }
    byGroup[op.group_slug].push({ slug: op.slug, name: op.name, price_cents: cents,
      price_status: status, display_order: op.display_order });
  }

  var out = [];
  for (var g = 0; g < groups.length; g++) {
    var gr = groups[g];
    var mine = byGroup[gr.slug] || [];
    if (!mine.length) { continue; }
    mine.sort(function (a, b) {
      var ao = (a.display_order == null) ? 9999 : a.display_order;
      var bo = (b.display_order == null) ? 9999 : b.display_order;
      if (ao !== bo) { return ao - bo; }
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    out.push({ slug: gr.slug, name: gr.name, kind: gr.kind, options: mine });
  }
  var shown = 0; for (var s = 0; s < out.length; s++) { shown += out[s].options.length; }
  return { groups: out, counts: { groups: out.length, options: shown, unresolved_prices: unresolved } };
}

/* ---- real shapes -------------------------------------------------------- */
const TYPE_A = '695fab2e893a2205214c0794';
const TYPE_B = '695fab23bc85cf102239e7c4';
const UNIT   = '695fad3076c69cf60ae79780';

const GROUPS = [
  { slug: 'flooring', name: 'Flooring', kind: 'single' },
  { slug: 'major-upgrades', name: 'Major upgrades', kind: 'multi' },
  { slug: 'addon-list-section-2', name: 'Yale Polaris', kind: 'multi' },
  { slug: 'kitchens', name: 'Kitchens', kind: 'multi' }
];

const OPTIONS = [
  { group_slug: 'flooring', slug: 'polaris-heart-tiles-type-a', name: 'Tiles',
    price_source: 'slot', price_scope: 'unit_type', unit_slot: 'floor_1',
    unit_type_refs: [TYPE_A], display_order: null },
  { group_slug: 'flooring', slug: 'polaris-heart-vinyl-type-a', name: 'Vinyl',
    price_source: 'slot', price_scope: 'unit_type', unit_slot: 'floor_2',
    unit_type_refs: [TYPE_A], display_order: null },
  { group_slug: 'flooring', slug: 'polaris-heart-oak-type-a', name: 'Engineered Oak',
    price_source: 'slot', price_scope: 'unit_type', unit_slot: 'floor_3',
    unit_type_refs: [TYPE_A], display_order: null },
  { group_slug: 'flooring', slug: 'polaris-heart-vinyl-type-b', name: 'Vinyl',
    price_source: 'slot', price_scope: 'unit_type', unit_slot: 'floor_2',
    unit_type_refs: [TYPE_B], display_order: null },
  /* Type B has no floor_3 price stored - the oak option exists but nobody has
     priced it on this type. That path had no test until it went untested through
     a mutation, which is exactly what mutations are for. */
  { group_slug: 'flooring', slug: 'polaris-heart-oak-type-b', name: 'Engineered Oak',
    price_source: 'slot', price_scope: 'unit_type', unit_slot: 'floor_3',
    unit_type_refs: [TYPE_B], display_order: null },

  { group_slug: 'major-upgrades', slug: 'polaris-major-garage', name: 'Garage',
    price_source: 'fixed', price_scope: null, price_cents: null,
    unit_type_refs: [], display_order: 20 },
  /* Pool is ordered FIRST while sorting second alphabetically. With both agreeing
     the test could not tell a working sort from no sort at all. */
  { group_slug: 'major-upgrades', slug: 'polaris-major-pool', name: 'Pool',
    price_source: 'fixed', price_scope: null, price_cents: null,
    unit_type_refs: [], display_order: 10 },

  { group_slug: 'addon-list-section-2', slug: 'polaris-yale-smart-safe', name: 'Smart Safe',
    price_source: 'fixed', price_scope: null, price_cents: 523300,
    unit_type_refs: [], display_order: null },

  { group_slug: 'kitchens', slug: 'polaris-kitchen-upgrade', name: 'Kitchen upgrade',
    price_source: 'slot', price_scope: 'unit', unit_slot: 'custom_1',
    unit_type_refs: [], display_order: null }
];

const PRICES = [
  { scope: 'unit_type', ref_id: TYPE_A, slot: 'floor_1', price_cents: 0 },
  { scope: 'unit_type', ref_id: TYPE_A, slot: 'floor_2', price_cents: 3751500 },
  { scope: 'unit_type', ref_id: TYPE_A, slot: 'floor_3', price_cents: 10599600 },
  { scope: 'unit_type', ref_id: TYPE_B, slot: 'floor_2', price_cents: 4325000 },
  { scope: 'unit',      ref_id: UNIT,   slot: 'custom_1', price_cents: 35100000 }
];

const find = (r, g, s) => (r.groups.find(x => x.slug === g) || { options: [] })
  .options.find(x => x.slug === s);

/* ---- the flooring link, which is the whole point ------------------------ */
{
  const r = resolve(GROUPS, OPTIONS, PRICES, { unit_type: TYPE_A });
  ok("a floor priced from the unit type resolves to that type's figure",
     find(r, 'flooring', 'polaris-heart-vinyl-type-a').price_cents === 3751500);
  ok("and says the price was resolved, not fixed",
     find(r, 'flooring', 'polaris-heart-vinyl-type-a').price_status === 'resolved');
  ok("the default floor is a REAL zero, not a missing price",
     find(r, 'flooring', 'polaris-heart-tiles-type-a').price_cents === 0 &&
     find(r, 'flooring', 'polaris-heart-tiles-type-a').price_status === 'resolved');
  ok("a floor scoped to another unit type is not offered",
     !find(r, 'flooring', 'polaris-heart-vinyl-type-b'));
}

{
  const r = resolve(GROUPS, OPTIONS, PRICES, { unit_type: TYPE_B });
  ok("the same floor costs a different figure on another type",
     find(r, 'flooring', 'polaris-heart-vinyl-type-b').price_cents === 4325000);
  ok("only that type's floors come back",
     r.groups.find(g => g.slug === 'flooring').options.length === 2);
  ok("a unit-type slot with no stored price is MISSING, not silently zero",
     find(r, 'flooring', 'polaris-heart-oak-type-b').price_status === 'missing' &&
     find(r, 'flooring', 'polaris-heart-oak-type-b').price_cents === null);
  ok("and it is counted, so a caller can tell the catalogue is incomplete",
     r.counts.unresolved_prices === 1);
}

{
  const r = resolve(GROUPS, OPTIONS, PRICES, {});
  ok("with no unit type named, a type-priced option asks for one rather than guessing",
     find(r, 'flooring', 'polaris-heart-vinyl-type-a').price_status === 'needs_unit_type' &&
     find(r, 'flooring', 'polaris-heart-vinyl-type-a').price_cents === null);
  ok("and every floor is still listed, because nothing was narrowed",
     r.groups.find(g => g.slug === 'flooring').options.length === 5);
}

/* ---- the states that are not prices ------------------------------------- */
{
  const r = resolve(GROUPS, OPTIONS, PRICES, { unit_type: TYPE_A });
  ok("an option nobody has priced is on consultation, not zero",
     find(r, 'major-upgrades', 'polaris-major-garage').price_status === 'on_consultation' &&
     find(r, 'major-upgrades', 'polaris-major-garage').price_cents === null);
  ok("an option priced on itself just comes through",
     find(r, 'addon-list-section-2', 'polaris-yale-smart-safe').price_cents === 523300);
  ok("a per-home price asks for the home",
     find(r, 'kitchens', 'polaris-kitchen-upgrade').price_status === 'needs_unit');
}

{
  const r = resolve(GROUPS, OPTIONS, PRICES, { unit_type: TYPE_A, unit: UNIT });
  ok("and resolves once the home is named",
     find(r, 'kitchens', 'polaris-kitchen-upgrade').price_cents === 35100000 &&
     find(r, 'kitchens', 'polaris-kitchen-upgrade').price_status === 'resolved');
}

{
  const r = resolve(GROUPS, OPTIONS, PRICES, { unit_type: TYPE_A, unit: 'no-such-unit' });
  ok("a slot with no stored price is MISSING, and is counted",
     find(r, 'kitchens', 'polaris-kitchen-upgrade').price_status === 'missing' &&
     r.counts.unresolved_prices === 1);
}

/* ---- scoping and shape --------------------------------------------------- */
{
  const r = resolve(GROUPS, OPTIONS, PRICES, { unit_type: 'a-type-with-no-floors' });
  ok("a type with no floors loses the flooring group entirely, rather than showing an empty one",
     !r.groups.find(g => g.slug === 'flooring'));
  ok("but keeps the groups whose options are unrestricted",
     !!r.groups.find(g => g.slug === 'major-upgrades'));
}

{
  const r = resolve(GROUPS, OPTIONS, PRICES, { unit_type: TYPE_A });
  ok("options come back in display order, not alphabetically",
     r.groups.find(g => g.slug === 'major-upgrades').options[0].slug === 'polaris-major-pool');
  ok("groups keep the order they were queried in",
     r.groups[0].slug === 'flooring');
  ok("the counts match what was returned",
     r.counts.options === r.groups.reduce((n, g) => n + g.options.length, 0));
}

const pass = A.filter(a => a.pass).length;
A.forEach(a => { if (!a.pass) console.log("FAIL ", a.n); });
console.log(`\n${pass}/${A.length} passed`);
process.exit(pass === A.length ? 0 : 1);
