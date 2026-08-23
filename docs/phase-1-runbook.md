# Heartland Phase 1 Runbook

> Reservations on Xano, in eight stages

The working order for moving three properties off Memberstack custom fields and onto a Xano record confirmed by the Payfast ITN. Each step says what to build and how you know it's finished.

**78–98 h** **4 weeks** at ~20 h/wk **3** properties **5** tables · **9** endpoints

Timeline at a glance

| Week | Stages        | Focus                                             | Hours   | Ends when                                               |
|------|---------------|---------------------------------------------------|---------|---------------------------------------------------------|
| 1    | A · B         | Groundwork and the data layer                     | 17 – 20 | Tables live, catalogue syncing, totals function correct |
| 2    | C             | Core reservation API                              | 11 – 13 | Full lifecycle drivable from Postman                    |
| 3    | D             | Payfast — checkout signing and the ITN            | 15 – 18 | Every row of the sandbox matrix passes                  |
| 4    | E · F · G · H | Identity, front-end wiring, rehearsal and cutover | 25 – 32 | Live ITN into Xano, all three properties selling        |
| —    | Contingency   | Held back deliberately                            | 10 – 15 | Spend it in week 3; it always goes there                |

> **Why this order**
>
> Risk first, inside dependencies. The ITN is the only part that can silently lose money, so it gets a whole week of its own and nothing else competes with it. Everything before it exists to make it testable; everything after it is wiring. Nothing touches the live flow until stage G — and because there is exactly one member in Memberstack and no live sales volume, that cutover is a switch-over rather than a migration. Four weeks rather than five, and considerably less risk than the same build would carry on a busy site.

------------------------------------------------------------------------

Stage A ·

### Groundwork — before a line of code

— *6 – 7 h · week 1*

Skipping this stage is how the build overruns. Two of these steps are pure archaeology, and both produce a contract you must not break later.

1. **Pick the Xano workspace and cut a branch.** Any of the three with headroom; the schema joins nothing existing. Prefix tables `res_*`, put endpoints under a `heartland/` API group.
   *Done when: you can deploy to the branch without touching the live workspace.*
2. **Inventory the existing webhooks and record their payloads.** Every Make scenario the reservation flow currently triggers: URL, trigger point, exact JSON shape. This is the contract Xano will have to reproduce byte-for-byte in stage D.
   *Done: see the appendix. One Make webhook, fired client-side from `/reserve-4`. Still to confirm inside Make: what the scenario does with the payload.*
3. **Inventory the Memberstack custom fields in use.** Which fields hold reservation data, on how many members, and which are referenced by `data-ms-member` attributes anywhere on the site. Those attributes are what you'll rewrite in stage F.
   *Done: see the appendix. ~50 fields mapped to their Xano home, with the casing trap and the existing status machine flagged.*
4. **Payfast: sandbox credentials, the live passphrase, and the three CMS switches.** Confirm whether a passphrase is set on the live merchant account — set means include it in the signature, blank means omit the parameter entirely; getting this wrong is total, silent payment failure. Then note each property's `use-live-payments` state, because the sandbox/live choice is per property, not global.
   *Done when: you have sandbox merchant ID and key in hand, the live passphrase state written down, and the current live/sandbox state of all three properties.*
5. **CMS prep with the client.** Add the `bundle-includes` plain-text field to the Add-ons collection; tag the luxury bundle with the slugs it contains; confirm the reservation fee for each of the three properties.
   *Done when: the client has tagged the bundles themselves — if they can't, the field is wrong.*
6. **Branch `heartland-scripts`.** New folder `heartland/reservation/`, jsDelivr tag pointed at a version you control, so you can ship and roll back by commit.
   *Done when: a console.log from the branch appears on a staging page.*
7. **Capture a reference payload from every native form.** Submit each reservation form once on the live site and save the exact POST body — field names, order and values. Site-wide Webflow form webhooks feed workflows owned by other people; these captures are the contract you must not break, and the only way to prove afterwards that you didn't. See [Legacy field-name compatibility](#legacy).
   *Done when: you have a saved payload per form, and can diff a new submission against it.*

Stage B ·

### Data layer — five tables and the money function

— *11 – 13 h · week 1*

1. **Create the tables and — critically — the indexes.** Unique on `res_reservations.uuid`, `m_payment_id` and `active_hold_key`; unique composite on `res_payments(pf_payment_id, payment_status)`; plain index on `property_slug` and `email`.
   *Done when: inserting two rows with the same `active_hold_key` fails at the database, not in your code.*
2. **Seed `res_properties` from the CMS, all three rows.** Copy the mapping in the appendix — fee and item label from Reservation Step 3, plan ID and OTP URLs from Properties. Nothing here is invented; it already exists and the client already maintains it.
   *Done when: changing `payment-amount` in the CMS and running a resync changes what Payfast would charge.*
3. **Environment variables.** Payfast merchant ID/key/passphrase/host/allowed IPs, Memberstack secret, Webflow token and site ID, site base URL. Nothing in the repo, ever.
   *Done when: switching `PAYFAST_HOST` from sandbox to live is a one-field change.*
4. **Catalogue resync — add-ons *and* payment config.** One endpoint that reads the Webflow Add-ons collection (paged, 100 at a time) into `res_catalogue_addons`, and the Reservation Step 3 items into `res_properties` — fee, item label and live switch. Schedule it nightly, leave it callable by hand.
   *Done when: both an add-on price and a reservation fee edited in the Designer appear in Xano after one manual resync.*
5. **`recalculate_totals` — including the bundle rules.** Adding a bundle removes its contained slugs and blocks re-adding them; `dependancy` auto-adds the parent; `radio-group` replaces within the group. Prices only ever come from the cache, never the request.
   *Done when: posting a fabricated price in the request body changes nothing in the stored total.*

> **Gate 1**
>
> Do not start stage C until the bundle logic is right. Every later stage assumes totals are trustworthy, and this is the cheapest moment in the whole build to find out they aren't.

Stage C ·

### Core reservation API

— *11 – 13 h · week 2*

1. **`POST /reservations`.** Takes property slug, `wf_unit_id`, and whatever contact details exist so far. Snapshots the unit from the CMS into `unit_snapshot`, returns the `uuid`. Rate-limit it — it's public.
   *Done when: a reservation exists with frozen unit pricing that later CMS edits don't alter.*
2. **`PATCH /reservations/{uuid}`.** Partial updates for contact details, add-on selections and `last_step`. Every call refreshes `last_activity_at` and writes a `res_events` row.
   *Done when: stepping through the flow leaves a readable event trail.*
3. **`GET /reservations/{uuid}`.** The order summary payload plus `status` and `server_time`. Return only what the buyer may see — no raw ITN, no internal IDs.
   *Done when: the response has everything the summary screen renders and nothing else.*
4. **`GET /addons?property=`.** Cache-driven, grouped by section, with bundle relationships resolved so the front end just renders.
   *Done when: the property with the luxury bundle returns different add-ons from the other two.*
5. **`POST /reservations/{uuid}/checkout`.** Re-runs totals, sets `active_hold_key`, increments `payment_attempt`, mints `m_payment_id`, then signs the field set using `payment-amount` and `item-name` **from the property config, never from the request**, against the host that property's `use-live-payments` selects. Moves to `awaiting_payment`.
   *Done when: the returned signature validates against Payfast's checker, and posting an `amount` in the request body changes nothing.*

> **Gate 2**
>
> Drive a complete reservation from Postman — create, patch, add a bundle, checkout — before opening a browser. Debugging API logic through a Webflow page is several times slower.

Stage D ·

### Payfast — the week that matters

— *15 – 18 h · week 3*

Build the ITN in this order and test after each step. Assembling it whole and then debugging is how days disappear.

1. **Log before you think.** Read `$http_raw_body`, capture source IP, insert a `res_payments` row with `processed = false`. Return 200. Nothing else yet.
   *Done when: a sandbox payment leaves a raw row you can read.*
2. **Signature.** Rebuild the string from the *raw body* in the order received, minus the signature pair, plus the passphrase if set. Compare case-insensitively. Store the result on the row.
   *Done when: `signature_valid` is true for a real sandbox post and false for a tampered one.*
3. **Source IP and the validate postback.** Check the IP against the env list, then POST the payload back to `/eng/query/validate` and require `VALID`.
   *Done when: a replayed payload from your own machine is rejected.*
4. **Merchant, amount, idempotency.** Merchant ID matches; `amount_gross` within R0.01 of `deposit_cents/100`; skip if this `pf_payment_id` + status is already processed.
   *Done when: posting the same ITN twice confirms once.*
5. **Transitions, then the unit toggle.** `COMPLETE` → confirmed, `PENDING` → awaiting_clearance with the hold extended, `FAILED` → payment_failed. Then flip the unit's CMS `reserved` switch — after the 200, never before it. Since the Make scenario only does that toggle and Xano already holds a Webflow token for the catalogue resync, **PATCH the CMS item directly and retire the webhook**: one less hop, one less thing to be down. Keep the Make scenario switched on but unused until stage G4, as the rollback path.
   *Done when: a sandbox payment marks the unit reserved across the site, with Make disconnected.*
6. **Run the matrix.** Card success · EFT pending then complete · duplicate post · reduced amount · broken signature · foreign IP · two browsers on one unit · timer expiring mid-payment · a devtools-edited amount changing nothing · a property left on sandbox.
   *Done when: all ten behave, and you've watched each one in the payments log.*

> **Gate 3 — the hard one**
>
> No front-end work until the matrix is green. A reservation flow on a shaky ITN is worse than the current setup, because it looks like it works.

Stage E ·

### Identity — passwordless, provisioned at payment

— *5 – 7 h · week 4*

1. **`POST /auth/memberstack`.** Verify the member token with Memberstack, upsert a `users` row, return a Xano auth token with a 24-hour life.
   *Done when: an expired or forged token returns 401 and nothing else.*
2. **Provision on confirmed.** Create the Memberstack member from details already held, attach `property.memberstack_plan_id` — the plan is per property and already in the CMS — and store `memberstack_id`. If the email exists, attach the plan instead of erroring — repeat investors are common.
   *Done when: paying twice with one email produces one member and two reservations.*
3. **Passwordless login page.** One page, one form, two steps: email, then the 6-digit code revealed by `data-ms-passwordless="step-2"`. Codes expire in 10 minutes and the standard login component won't work here.
   *Done when: you log in on a phone without ever setting a password.*
4. **`GET /member/reservations`.** The dashboard's data, scoped to the token's member.
   *Done when: another member's token returns an empty list, not an error.*

Stage F ·

### Front end — wiring, not rebuilding

— *16 – 19 h · week 4*

Build this on a duplicate page — `/reserve-v2` — so the live flow keeps running. The screens don't change; what changes is that each one also talks to Xano.

1. **`api.js` and `state.js`.** Fetch wrapper with the base URL, auth header, error surfacing and one retry. State holds one localStorage key: `hl_reservation_uuid`.
   *Done when: a refresh mid-flow resumes on the same reservation.*
2. **Dual-write on every existing form, through the field map.** Webflow's own submit is untouched and every field keeps its current `name`; a fire-and-forget PATCH rides alongside it, translating names through `field-map.js`. Never `preventDefault`, never `await`, never rename anything in the DOM. See [Legacy field-name compatibility](#legacy).
   *Done when: a fresh submission diffs byte-identical against the A7 capture, and Xano being switched off entirely changes nothing.*
3. **Add-ons step reads from `/addons`.** Same UI; the bundle now disables and visually marks its contained items as included.
   *Done when: selecting the luxury bundle can't also charge for the furniture upgrade.*
4. **`checkout.js`.** Requests signed fields, builds a hidden form, submits to Payfast. No keys, no signing, no amounts in the browser.
   *Done when: viewing source reveals no merchant key.*
5. **The processing page.** `return_url` lands on `/reservation-processing`, which polls status every 2 s for 60 s. Confirmed → success page. Still pending → "payment received, confirming, we'll email you". Delete the old success-state detection.
   *Done when: closing the tab on the Payfast screen still results in a confirmed reservation.*
6. **Order summary and dashboard from Xano.** Replace the `data-ms-member` bindings from A3 with values from `GET /member/reservations`. The hidden legacy forms keep being populated too — now *from Xano*, through the outbound half of the field map — so downstream payloads stay identical while the source of truth moves underneath them.
   *Done when: no reservation figure on any page comes from a Memberstack field, and the legacy payload still matches A7.*

Stage G ·

### Rehearsal and cutover

— *2 – 3 h · week 4*

1. **Backfill — one member.** There is a single member in Memberstack, so this is a manual copy rather than a migration: create its reservation row by hand, then seed the rest from the CMS `sold` and `reserved` switches so the table reflects real inventory from day one.
   *Done when: the units marked reserved or sold in the CMS have matching rows in Xano.*
2. **Skip the shadow run.** With no live volume there is nothing to reconcile against, and dual-writing would only add a failure mode. Instead do a **full sandbox rehearsal**: three reservations, one per property, each carried through to a confirmed ITN and a reserved unit.
   *Done when: all three rehearsals complete without you touching Xano by hand.*
3. **Cutover, early morning.** Check no reservation is mid-flight, switch the live `notify_url` to Xano, publish `/reserve-v2` over the live page, keep the old path behind `?legacy=1`.
   *Done when: a real R5 payment on the live account confirms end to end.*
4. **Watch for 72 hours.** Read the payments log daily — every row, not just failures. Then delete the Memberstack reservation fields, once and for all.
   *Done when: three days of real payments show no unprocessed rows.*

> **Rollback, at any point**
>
> Two moves, both under five minutes: revert the Payfast `notify_url`, and point the jsDelivr tag at the previous commit. Keep the old Make scenarios enabled and untouched until stage G4 — they are the rollback path, not legacy clutter.

Stage H ·

### Properties two and three

— *2 – 3 h · week 4*

If stage B was done properly this is configuration, not development — which is the entire argument for building multi-property up front.

1. **Add the rows, tag the add-ons.** A `res_properties` row each, the client tags their add-ons in the CMS including any bundles, resync the catalogue.
   *Done when: `GET /addons` returns the right set for each property.*
2. **Smoke test each one.** One sandbox reservation per property, end to end, including its own reservation fee and its own bundle behaviour.
   *Done when: three sandbox reservations sit confirmed in the table, one per property.*

------------------------------------------------------------------------

## Appendix — A2 & A3 inventory, done

Pulled from the live Webflow site on 21 Aug 2026: registered webhooks, page and site custom code, and every form schema. This is the contract stage D has to reproduce and the worklist stage F has to replace.

### A2 · Integrations and webhooks

> **The whole reservation depends on one browser fetch**
>
> There are **no App-registered Webflow webhooks on the site at all**. The reservation is completed by a single client-side call in the `/reserve-4` footer, fired only when the URL carries `?payment=success`. If that redirect never happens, nothing runs — no CMS update, no notification. This is the silent-lost-payment hole, confirmed rather than predicted.

| What                 | Detail                                                                                                                                                                                                                                    |
|----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Make webhook**     | `https://hook.eu1.make.com/st56iy765n57rzsd4iv06irm79tkowcg`                                                                                                                                                                              |
| Fired from           | Reservation Step 4 Template (`/reserve-4`), footer code, gated on `?payment=success`                                                                                                                                                      |
| Payload              | JSON: `{ automation: "toggle-reserved", ...all fields of the #toggle-reserved form }`                                                                                                                                                     |
| Purpose              | **Only** flips the CMS `reserved` switch so unit status displays correctly across the site. No emails, no other side effects — those are Webflow's native form notifications.                                                             |
| Timing hack          | Navigation to the dashboard is held by `window.__reserveSubmitted` with an 8-second timeout, then proceeds regardless                                                                                                                     |
| Superseded path      | A commented-out block POSTs `toggle-reserved` straight to `webflow.com/api/v1/form/{site-id}` — the previous approach                                                                                                                     |
| **Payfast**          | Form `#RealPayFastForm` on Step 3 and the Step 3 template, submitted by a `#payment-button` click handler. Amount and item label are **CMS-bound hidden inputs** — see below. Return convention: `?payment=success` back to `/reserve-4`. |
| Site-wide scripts    | Memberstack `app_cmmoyq2ln006j0ssyfcttbd9q` · Meta Pixel `1032664371940127` · Clarity `om63v4vzri` · GTM `GTM-NFC5F5TT` · LinkedIn `6728364`                                                                                              |
| Record-keeping forms | `#toggle-reserved`, `#reservation-form`, "Reservation Payment Success", "Reservation Form - Confirm Buyer Details" (Step 2 and Step 2 - New)                                                                                              |

### Where the payment config actually lives

The **Reservation Step 3** CMS collection is the Payfast config, one item per property. Three fields do the whole job:

| CMS field           | Type       | Does                                                            |
|---------------------|------------|-----------------------------------------------------------------|
| `payment-amount`    | Number (R) | The reservation fee                                             |
| `item-name`         | Plain text | Payfast item label — "Reservation Fee"                          |
| `use-live-payments` | Switch     | Sandbox vs live. This is your `PAYFAST_HOST`, already modelled. |

> **The vulnerability this creates**
>
> Those values reach Payfast as hidden inputs in the buyer's browser. Anyone with devtools open can change `amount` to `1.00` and reserve a home for a rand — and because nothing validates the ITN today, it would look like a successful reservation. This is no longer a theoretical argument for server-side signing; it is a live hole with a two-keystroke exploit. In stage C5, Xano reads `payment-amount` from the CMS itself and signs that. The request body never carries an amount.

> **Timer bug found in passing**
>
> The countdown stores its deadline as `sessionStorage["reservationDeadline:" + location.pathname]`. Because the key includes the pathname, **moving from Step 3 to the Step 3 template starts a fresh 10 minutes**, and the same code is duplicated on both pages. On expiry it redirects to the unit slug. Worth knowing before you decide how faithfully to "leave the countdown as is".

### A3 · Memberstack fields in use

Roughly 50 custom fields, all currently doing the job of a database row. Grouped by where they land in the Xano schema:

| Group         | Fields                                                                                                                                                                                                                                                                                                            | Xano home                       |
|---------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------|
| Identity      | `First Name` / `first-name`, `Last Name`, `Email`, `mobile-number` / `Contact Number`, `work-number`, `dob`, `nationality`, `address`, `id-reg-num`, `buyer-type`, `purchase-type`                                                                                                                                | Reservation columns             |
| Unit          | `unit`, `unit-num`, `unit-id`, `item-id`, `unit-price`, `purchase-price`, `property`, `property-plan-id`, `area`, `home-area`, `levy`, `deposit-bond`, `deposit-cash`, `occ-rental`                                                                                                                               | `unit_snapshot` json            |
| Configuration | `floor-type`(+`-slugs`), `outdoor-type`(+`-slugs`), `garage-upgrade`(+price), `pool-upgrade`(+price), `fireplace-upgrade`(+price), `solar-upgrades`(+slugs), `appliance-upgrades`(+slugs), `furniture-upgrades`(+slugs), ~~`luxury-upgrade`~~ *(dead)*, `upgrades-price`, `include-bond-cost`, `finance-upgrades` | `configuration` + `addons` json |
| Process       | `status`, `sub-status`, `reservation-number`, `reservation-start`, `deposit-start`, `bond-start`, `otp-url`, `base-url`, `base-url-cash`, `token`                                                                                                                                                                 | Status + stage columns          |

> **The finding that changes the plan**
>
> **The sales stage machine already exists**, in Memberstack. The dashboard reads `status` and `sub-status`, with sub-statuses `pre-qualify` · `sign-otp` · `pay-deposit` · `bond-approval` · `bond-approved` · `reserve`, branching on `purchase-type` (Cash buyers skip pre-qualify and both bond steps). It even runs deadline windows: **7 days** from `reservation-start`, **7 days** from `deposit-start`, **30 days** from `bond-start`. Don't invent a new enum in phase 2 — adopt these values, and the migration becomes a straight copy. The code carries a flagged conflict on the bond window ("spec said 7 days, copy says 30") that's worth settling with the client while you're in there.

> **Two traps in the field list**
>
> **Casing is inconsistent.** Live code branches on `member.customFields['First-Name']` while the superseded block used `first-name`, and both spellings appear across forms. Normalise on the way into Xano — and delete the loser rather than supporting both. **`luxury-upgrade` is dead** — the key exists on both Step 2 forms but does nothing. Don't map it; the `bundle-includes` design in stage A5 is greenfield, and the dead field is worth removing from the forms while you're in there.

### Where the reservation actually lives today

A `purchaseData` object in `localStorage`, written on Step 1 submit, merged on Step 2, stamped onto hidden forms at `/reserve-4`, and cleared once submitted. It is, in effect, the reservation record — which makes the migration mapping simple: **the keys of `purchaseData` are the columns of `res_reservations`**. Capture a real one from a live session before you start stage B; it's the fastest schema check available.

### res_properties is already in the CMS

Between the **Properties** and **Reservation Step 3** collections, nearly every config field the Xano table needs already exists and is already maintained by the client. Seeding is a copy job, not a design job:

| res_properties                                  | Comes from                                                                                    |
|-------------------------------------------------|-----------------------------------------------------------------------------------------------|
| `slug` · `name`                                 | Properties → `slug`, `name`                                                                   |
| `reservation_fee_cents`                         | Reservation Step 3 → `payment-amount` × 100                                                   |
| `payfast_item_name`                             | Reservation Step 3 → `item-name`                                                              |
| `payfast_host`                                  | Reservation Step 3 → `use-live-payments`                                                      |
| `memberstack_plan_id`                           | Properties → `memberstack-plan-id` (e.g. `pln_polaris-heart-…`) — exactly what stage E2 needs |
| `otp_base_url` · `otp_base_url_cash`            | Properties → `base-url-for-otp` / `-cash` (Zoho Sign)                                         |
| `bond_rate` · `bond_years` · `bond_deposit_pct` | Properties → the three bond fields                                                            |
| `is_selling`                                    | Properties → `payment-engine-live` (with `buy-now` as the marketing-side switch)              |
| `wf_units_collection_id`                        | Units, or Units (Eridanus) for the legacy property                                            |

Two consequences. The nightly resync should pull `payment-amount` alongside the add-on catalogue, so the client keeps changing the fee where they change it today. And `use-live-payments` means the sandbox/live switch is per property — you can run one property live while another is still testing, which is exactly what you want for the second and third rollouts.

### One gap left

- **Whether any other Make scenarios touch the reservation.** The `toggle-reserved` one is understood and replaceable. Worth a two-minute scan of the Make workspace for anything else listening on this site before stage G.

## Legacy field-name compatibility

Site-wide Webflow form webhooks feed workflows owned by other people. Those workflows read **field names**, so the names are a public contract — and a contract you can't renegotiate on your own timetable. The rule for the whole of phase 1:

> **Non-negotiable**
>
> No field is renamed, removed or reordered in the DOM. No form loses its native submit. Xano's schema names are internal and **translation happens at the boundary, never in the markup**. If a downstream workflow breaks, it was your change — there is no other suspect.

### One config file, two directions

Inbound translates a native submit into Xano's shape. Outbound repopulates the hidden legacy forms from Xano once it owns the record, so downstream payloads stay identical while the source of truth moves underneath them.

    heartland/reservation/field-map.js
    // Webflow field name  →  Xano path. Both spellings kept where both exist:
    // the forms carry them, so the map must too.
    export const FIELD_MAP = {
      // identity
      'First Name': 'first_name',      'first-name': 'first_name',
      'Last Name':  'last_name',       'last-name':  'last_name',
      'Email':      'email',           'email':      'email',
      'Contact Number': 'phone',       'mobile-number': 'phone',
      'work-number': 'work_phone',     'dob': 'dob',
      'nationality': 'nationality',    'address': 'address',
      'id-reg-num': 'id_number',       'buyer-type': 'buyer_type',
      'purchase-type': 'payer_route',  // "Bond" | "Cash"

      // unit — snapshot, not live CMS
      'unit': 'unit_snapshot.name',    'unit-num': 'unit_snapshot.unit_number',
      'unit-id': 'wf_unit_id',         'item-id': 'wf_unit_id',
      'property': 'property_slug',     'property-plan-id': 'memberstack_plan_id',
      'unit-price': 'unit_price_cents',
      'purchase-price': 'total_cents', 'upgrades-price': 'addons_total_cents',
      'area': 'unit_snapshot.erf_area','home-area': 'unit_snapshot.home_area',
      'levy': 'unit_snapshot.levy',    'occ-rental': 'unit_snapshot.occ_rental_pct',
      'deposit-bond': 'unit_snapshot.deposit_bond_pct',
      'deposit-cash': 'unit_snapshot.deposit_cash_pct',

      // configuration — display name and slug are BOTH required downstream
      'floor-type': 'configuration.floor.label',
      'floor-type-slugs': 'configuration.floor.slugs',
      'outdoor-type': 'configuration.outdoor.label',
      'outdoor-type-slugs': 'configuration.outdoor.slugs',
      'garage-upgrade': 'configuration.garage.on',
      'garage-upgrade-price': 'configuration.garage.price',
      // …pool-upgrade, fireplace-upgrade follow the same shape

      // add-ons
      'appliance-upgrades': 'addons.appliance.labels',
      'appliance-upgrades-slugs': 'addons.appliance.slugs',
      'furniture-upgrades': 'addons.furniture.labels',
      'furniture-upgrades-slugs': 'addons.furniture.slugs',
      'solar-upgrades': 'addons.solar.labels',
      'solar-upgrades-slugs': 'addons.solar.slugs',
      'include-bond-cost': 'configuration.include_bond_cost',
      'finance-upgrades': 'configuration.finance_upgrades',

      // process
      'reservation-number': 'reference',
      'reservation-start': 'confirmed_at',
      'otp-url': 'otp_url',
      'base-url': 'property.otp_base_url',
      'base-url-cash': 'property.otp_base_url_cash',
    };

    // Fields deliberately NOT mapped — dead, but left in the DOM so payload
    // shape is unchanged. Remove only once the flag below is off.
    export const DEAD_FIELDS = ['luxury-upgrade'];

### The switch

Per form, not global — the workflows are owned by different people and will be aligned at different times. Default everything to `true` and turn each one off only when its owner confirms.

    heartland/reservation/legacy.js
    export const LEGACY = {
      enabled: true,            // master kill switch for the whole shim
      nativeSubmit: {           // let the Webflow form post as it does today
        'reservation-form': true,
        'toggle-reserved': true,
        'Reservation Form - Confirm Buyer Details': true,
        'Reservation Payment Success': true,
      },
      populateFromXano: true,   // outbound: fill hidden legacy fields before submit
      logPayload: true,         // keep a copy on the reservation for parity proof
    };

    // Override per session without a deploy, for testing a switch-off:
    //   ?legacy=off  disables everything
    //   ?legacy=off:toggle-reserved  disables one form

Store the same flags in Xano too — a `res_config` row served by `GET /public/config` — so switching a form off is a Xano toggle rather than a commit and a CDN purge. The JS constants become the fallback when the config call fails, which keeps a Xano outage from silently disabling the shim.

### Proving parity, then decommissioning

1. **Baseline.** The A7 captures — one real payload per form, saved before anything changes.
2. **Diff on every build.** With `logPayload` on, each reservation keeps the exact legacy payload it sent. Compare against the baseline; any key added, dropped or renamed is a regression, even if it looks harmless.
   *Done when: ten consecutive submissions diff clean.*
3. **Hand the owners a spec.** Give each workflow owner the field map and the Xano payload that would replace theirs. They can migrate on their own schedule — which is the point of the per-form switch.
4. **Switch off one form at a time.** Owner confirms → flip that form's flag in Xano → watch for a week → then delete its hidden fields from the Designer. Never flip two at once; if something downstream goes quiet you want one suspect.

> **The cost of getting this wrong is asymmetric**
>
> A broken workflow you don't own fails silently, in someone else's system, and you hear about it days later from a person who is annoyed. The shim is perhaps three hours of work; keeping it long after it's needed costs nothing but a file. Leave it in place until every owner has actually confirmed — not until they've said they will.

## What you'll want to hand the client

Three artefacts fall out of this build and all three are worth packaging rather than mentioning: the **exception list** from G1, which usually surfaces units whose CMS state and payment history disagree; a **one-page summary** of what changed and what it protects, led by the silent-lost-payment fix rather than the database; and a **short Loom** of the passwordless login, because it's the one part of the experience that will generate support questions in week one.

## The five things most likely to bite

- **The passphrase.** Set means include it; blank means omit the parameter entirely. Total silent failure either way round.
- **Raw body versus parsed input.** Rebuild the ITN signature from the raw body in received order — parsed objects don't preserve it.
- **CORS.** Xano's public endpoints need the Webflow domain allowed, including the `.webflow.io` staging one, or stage F stalls on day one.
- **Blocking the Webflow form.** One stray `await` or `preventDefault` in F2 and you've broken the client's notification emails without noticing.
- **Cents.** Integers everywhere in the database; format to two decimals only when handing an amount to Payfast — `payment-amount` arrives from the CMS in whole rand.
- **Per-property live switch.** `use-live-payments` is per property. Check it before every rollout, and again after — a property left on sandbox takes no money at all.
