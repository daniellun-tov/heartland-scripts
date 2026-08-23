# Heartland Reservation Rebuild

> Reservations, rebuilt on Xano

Moving the reservation record out of Memberstack metadata and into a real database: units, add-ons, deposits, Payfast ITN, hold expiry and abandonment recovery — one source of truth, one state machine, five layers to build.

**DB** Xano **Auth** Memberstack **Payments** Payfast ITN **Front end** Webflow + JS via jsDelivr **Ops** Make 00 ·

## 00 · Architecture & state machine

— *the shape of it*

One rule decides every question below: **Xano owns the reservation, the money and whether a unit is still available. Nothing else is allowed an opinion.** The browser proposes, Xano disposes. Memberstack answers exactly one question — "who is this person" — and gates pages. Payfast is a payment processor whose ITN is the only trustworthy signal that money moved.

Webflow keeps a real job here, and it's worth stating precisely, because it's the seam the whole build hangs off: **the CMS is the catalogue, Xano is the state.** Units, add-ons and properties stay in the CMS where the client edits them and where the site renders from. Xano mirrors what it needs to price and lock a unit, and hands back the one thing the CMS can't work out for itself — what's taken right now.

*\[diagram — see the hosted version\]*

Two arrows run between Webflow and Xano, and they carry different cargo: the catalogue flows in, availability flows back.

### The reservation state machine

Every status below is a value in one Xano enum field. Nothing writes a status without going through an endpoint that also writes a `res_events` row — that pairing is what makes the funnel reportable later.

| Status               | Means                                        | Unit held?       | Moves to                             |
|----------------------|----------------------------------------------|------------------|--------------------------------------|
| `draft`              | Configurator in progress, no unit locked     | No               | held, expired                        |
| `held`               | Unit locked, 10-minute timer running         | Yes              | awaiting_payment, expired, cancelled |
| `awaiting_payment`   | Redirected to Payfast, no ITN yet            | Yes              | confirmed, payment_failed, expired   |
| `awaiting_clearance` | ITN said `PENDING` — EFT still clearing      | Yes (extended)   | confirmed, payment_failed            |
| `confirmed`          | ITN `COMPLETE`, validated, amount matched    | Yes → reserved   | cancelled, refunded                  |
| `payment_failed`     | ITN `FAILED`; retry allowed while hold lasts | Yes until expiry | awaiting_payment, expired            |
| `expired`            | Hold ran out — the abandonment bucket        | No, released     | held (re-hold on recovery)           |
| `cancelled`          | Killed by member or sales                    | No, released     | —                                    |
| `refunded`           | Money returned after confirmation            | No, released     | —                                    |

> **Design decision**
>
> `awaiting_clearance` exists because Payfast Instant EFT can sit on `PENDING` for hours or days. Without it the hold-expiry task will happily release a unit somebody is actually paying for.

P1 ·

## P1 · Phase 1 — three properties, stripped down

— *~85 h · 4 weeks*

One principle keeps this small: **change who owns the record and who confirms the payment. Change nothing else.** Every screen, form, webhook and countdown stays exactly where it is. What moves is the reservation — out of Memberstack custom fields into a Xano table — and the moment of truth, from a browser landing on a success page to a validated ITN.

> **Build for three properties now, not Polaris alone**
>
> Knowing two more are coming with different add-ons changes one decision. Hard-coding Polaris into env vars saves about three hours today and costs considerably more later, because every endpoint written property-blind has to be reopened, retested and re-migrated against live payment data. Adding `res_properties` with three rows up front makes the second and third property a *content* exercise — a row and some CMS tagging — rather than a development one. Doing all three now costs roughly 15% more than doing Polaris; retrofitting them later costs closer to 40%.

| Stays exactly as it is                                                     | Changes                                           | Deferred to phase 2+                            |
|----------------------------------------------------------------------------|---------------------------------------------------|-------------------------------------------------|
| The five-step flow and every screen in it                                  | Reservation record lives in Xano, keyed by `uuid` | Journey redesign, qualifier step (layer 01)     |
| Add-ons selected at the start, as today                                    | Payfast fields signed server-side in Xano         | Add-on split, portal add-ons, catalogue in Xano |
| Webflow forms at each touchpoint — notifications and abandonment recording | ITN sets the status, not the success page         | Xano abandonment tasks and recovery nudges      |
| Existing Make scenarios and webhook URLs                                   | They're now called by Xano's ITN, not the browser | CMS sync, availability endpoint, write-back     |
| The countdown, as built                                                    | Order summary reads from Xano                     | Server-authoritative timer, hold extension      |
| Units in the CMS, all three properties                                     | Passwordless Memberstack login to the dashboard   | Sales console, Wized, launch mode               |

### Xano — five tables, not six

Add-ons stay a JSON array on the reservation rather than line items, which is safe precisely *because* nothing edits them after payment yet — they normalise the moment the console arrives. What does get its own table is the property config and a lightweight add-on catalogue, because three properties with different add-ons is exactly the situation a JSON blob handles badly.

    res_properties            // 3 rows, hand-seeded
      slug, name, wf_units_collection_id
      reservation_fee_cents, hold_minutes
      notify_webhook, sales_email, payfast_item_name_template
      is_selling

    res_catalogue_addons          // pulled from the CMS Add-ons collection
      wf_item_id (unique), slug, display_name, property_slug
      price_cents, section, section_slug, radio_group, num_available
      dependancy_slug, bundle_includes (text[])   // new CMS field, see below
      is_active, last_synced_at

    reservations
      id, uuid (unique), status, created_at, updated_at
      email, first_name, last_name, phone
      wf_unit_id, unit_snapshot (json)        // name, number, price, deposit %s
      addons (json[])                         // slug, name, price_cents at selection
      unit_price_cents, addons_total_cents, total_cents, deposit_cents
      m_payment_id (unique), payment_attempt
      pf_payment_id, payment_status, paid_at
      memberstack_id, last_step, last_activity_at
      hold_expires_at, active_hold_key (unique, nullable)
      utm (json), referrer

    res_payments      // raw ITN log; unique(pf_payment_id, payment_status)
    res_events        // append-only touchpoints

Statuses collapse to six: `draft` · `awaiting_payment` · `awaiting_clearance` · `confirmed` · `payment_failed` · `expired`. Keep `awaiting_clearance` even in the MVP — the moment you accept Instant EFT, `PENDING` arrives and something has to hold it.

### Add-ons that differ per property — including the bundles

Your CMS Add-ons collection already models most of this and it's better than you may realise. `property` scopes each add-on to a development, `section` and `section-slug` group them, `radio-group` makes options mutually exclusive, `dependancy` auto-adds a required partner, and `num-available` handles quantity. A Yale/security upgrade is an ordinary add-on in its own section. Nothing new is needed for it.

The **luxury upgrade** is the one shape the collection can't express today: a single selection that *contains* several individually-sellable items. Selecting "Luxury Package" must remove the standalone appliance and furniture upgrades rather than charging for both, and re-adding them individually while the bundle is on must be blocked.

| Add-on shape                               | Modelled by                                             | Server rule                                                                                              |
|--------------------------------------------|---------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Standalone (Yale/security, single upgrade) | Existing fields                                         | Add, respect `num-available`                                                                             |
| Either/or (finish A or finish B)           | `radio-group`                                           | Adding one removes the other in the group                                                                |
| Requires another (upgrade needs base pack) | `dependancy`                                            | Auto-add the parent; removing the parent removes the child                                               |
| **Bundle (Luxury Package)**                | **New `bundle-includes` field** — comma-separated slugs | Adding it removes every listed slug and locks them; removing it clears the bundle only, and they re-pick |

Add `bundle-includes` as a plain-text field on the Add-ons collection and the client controls bundles per property without a developer. Show the contained items in the UI as "included" rather than as R0 line items — buyers who see zeroes assume something has gone wrong, and it also makes the bundle look like it's worth nothing.

> **Why the catalogue gets cached in Xano at all**
>
> Because prices arriving from a browser can't be trusted, and with bundles the rules have to be enforced somewhere the client can't reach. In phase 1 the amount Payfast actually charges is the fixed *reservation fee*, so a tampered add-on price steals nothing — but it does corrupt the record that later becomes the Offer to Purchase, which is the wrong kind of error to find in an attorney's office. Keep it cheap: no webhooks yet, just a nightly resync task and a manual `POST /admin/resync-catalogue` for when the client edits prices and wants them live now. Full webhook sync arrives with layer 03.

### Nine endpoints

| Endpoint                             | Called by                                                              |
|--------------------------------------|------------------------------------------------------------------------|
| `GET /addons?property=`              | The add-ons step — catalogue with bundle rules resolved                |
| `POST /admin/resync-catalogue`       | You, or the nightly task, after the client edits prices                |
| `POST /reservations`                 | Step 1, alongside the existing Webflow form submit                     |
| `PATCH /reservations/{uuid}`         | Each subsequent step, same pattern                                     |
| `GET /reservations/{uuid}`           | Order summary, and the success page polling for confirmation           |
| `POST /reservations/{uuid}/checkout` | Returns signed Payfast fields; sets `awaiting_payment`                 |
| `POST /payfast/itn`                  | Payfast. Full validation chain from layer 06 — none of it is optional. |
| `POST /auth/memberstack`             | Dashboard, exchanging the member token for a Xano token                |
| `GET /member/reservations`           | The dashboard's order summary                                          |

### Keeping the Webflow forms and webhooks — the actual technique

Both requirements are satisfied by the same small pattern, and the rule is that **Xano must never be able to break what already works**.

    // each existing Webflow form keeps submitting to Webflow exactly as it does
    // today — notification emails and abandonment records are untouched.
    form.addEventListener('submit', () => {
      const data = Object.fromEntries(new FormData(form));
      api.patch(`/reservations/${state.uuid}`, data).catch(console.warn);
      // fire-and-forget, never preventDefault, never await.
      // Webflow's own submit continues regardless.
    });

For the Make scenarios: **keep the webhook URLs and the payload shape identical** — change only the caller. Whatever fires today from the browser on payment success now fires from Xano after the ITN validates. Nothing inside Make gets rebuilt, and the scenarios become dramatically more reliable, because a buyer closing the tab on the Payfast redirect no longer means the scenario never runs.

> **This is the actual win of phase 1**
>
> Every payment currently depends on a browser reaching a success page. Buyers close tabs, lose signal in a lift, and get bounced by banking app redirects. Those payments are real money that your system never hears about. Moving the trigger to the ITN fixes silent lost sales — that's the sentence to put in the proposal, ahead of anything about databases.

### Passwordless — the constraints that shape the page

Memberstack passwordless sends a **6-digit code, not a magic link**, it expires in **10 minutes**, and the code field must live in the *same form on the same page* as the email field (`data-ms-passwordless="step-2"` reveals it). The standard login component doesn't work with it, so build the dashboard login as a dedicated two-step form. After payment, send buyers to that page with their email prefilled — not to a generic login screen.

> **One bullet worth re-deciding: when the member gets created**
>
> Memberstack counts **free members against your plan limit** and auto-upgrades you when you hit it — Basic covers 1,000, Professional 5,000. At 10–20 units a property this is a non-issue and provisioning at step 1 is perfectly safe: even counting every abandoned cart, three properties won't produce a few hundred members. Worth knowing only so it doesn't surprise you if a property ever launches to a large waiting list, where members track *reservation starts* rather than buyers.

### Two things not to strip

1.  **`res_events`.** Roughly half a day, and it's the only thing here you cannot backfill. Every month you run without it is a month of funnel data that never existed. Phase 2's reporting and phase 3's abandonment work both read from it.
2.  **The `active_hold_key` unique index.** The countdown stays exactly as it is — but set the key at checkout and let the database refuse a second live hold on the same unit. It's about two hours now against a schema migration on live payment data later, and it closes the double-sale hole while you're already in there.

### What phase 1 knowingly doesn't fix

Say these out loud to the client so they're choices, not surprises: the timer is still local, so a device switch mid-flow still misbehaves; abandoned reservations are recorded but nobody is nudged; sales still has no screen — you're the query interface until phase 2; add-ons can't be changed after payment without you editing Xano directly; and the CMS `reserved` switch updates through the existing Make scenario, so availability is still as accurate as that scenario is.

### Effort and money

| Work                                                                                              | Hours         |
|---------------------------------------------------------------------------------------------------|---------------|
| Five tables, three property rows, Xano branch                                                     | 5 – 6         |
| Add-on catalogue: resync task, bundle rules, per-property filtering                               | 6 – 8         |
| Nine endpoints incl. totals and checkout signing                                                  | 12 – 14       |
| Payfast ITN — full validation chain + sandbox matrix                                              | 12 – 16       |
| Memberstack: token exchange, provisioning on ITN, passwordless page                               | 5 – 7         |
| Front end: `api.js`, state, form dual-write through the field map, checkout, polling success page | 13 – 15       |
| Order summary + dashboard reading from Xano                                                       | 4 – 6         |
| Rehearsal and cutover (one member in Memberstack — no migration)                                  | 2 – 3         |
| Testing and the fixes it produces                                                                 | 9 – 12        |
| Contingency @ 15%                                                                                 | 10 – 11       |
| **Total**                                                                                         | **78 – 98 h** |

Roughly **R57,000 at R650/h, R75,000 at R850/h, R97,000 at R1,100/h** at the midpoint — four weeks at 20 hours a week, covering *all three* properties rather than one. Added running cost: **R0**. Existing Xano workspace, existing Make plan, no Wized, and at 10–20 units a property no volume-based limit on any platform comes close to mattering.

> #### What the later phases become
>
> **Phase 2** — normalise add-ons into line items, add the sales console and the stage machine (layer 09). **Phase 3** — full CMS webhook sync and the availability endpoint (layer 03), replacing the nightly resync. **Phase 4** — the journey rework and abandonment recovery (layers 01 and 08). Each phase reads the same tables; nothing here gets thrown away, and the only rework is the add-ons JSON becoming rows.
>
> One reorder worth considering at this inventory size: with 10–20 units per property, a release can behave like a LaunchBase drop whether you plan it or not. If any of the three is launching to a waiting list rather than trickling out, move **launch mode** (layer 01) ahead of the sales console — a stampede for scarce units is the one scenario where phase 1's deferred pieces bite hardest.

01 ·

## 01 · The reservation journey

— *reviewed*

The current flow is closer to best practice than it feels, and the one change you're considering — moving signup to just after home selection — is the one change the evidence argues against. Here's the review, then the revised flow.

### What the current flow gets right

- **Contact details before payment.** Name, email and phone captured at step 1 is what makes abandonment recovery possible at all. Most property sites capture nothing until payment and can't follow up.
- **Account creation after payment.** This is textbook *lazy registration* — Baymard's own guidance is to save account creation for the confirmation step, and 42% of sites still don't. You already do.
- **Portal as the post-sale home.** Progress, OTP signing, documents in one gated place is exactly right for a months-long purchase.

### Don't move signup earlier — this is the strongest evidence in the review

Required account creation is the **4th-largest cause of checkout abandonment at 18%**, and unlike the three above it (shipping costs, delivery speed, card trust), it's entirely self-inflicted. Putting it immediately after home selection places it at the exact moment of peak doubt, before any commitment has been made.

> **The line worth remembering**
>
> Account creation friction filters by **patience, not solvency**. You said you want fewer, better-qualified buyers — a password wall doesn't select for people who can afford a home, it selects for people willing to fill in a form. You lose serious cash buyers who bounce, and keep tyre-kickers who happen to be persistent.

The three real needs behind the instinct each have a better answer:

| What you actually want              | Signup-first gives you                       | Better answer                                                                                     |
|-------------------------------------|----------------------------------------------|---------------------------------------------------------------------------------------------------|
| They can come back to it            | An account they must remember a password for | The `uuid` resume link, emailed the moment they give an email. Works across devices, no password. |
| The reservation is tied to a person | A Memberstack ID                             | The email *is* the identity. `memberstack_id` gets stamped on later via `/claim`.                 |
| Better-qualified buyers             | Nothing — a password proves nothing          | A 20-second qualifier step. Four questions that actually predict whether this deal closes.        |

### What is genuinely wrong with the flow today

1.  **Add-ons before commitment inflate the price at the worst moment.** "Extra costs too high" is the number-one abandonment reason at 40%. Showing a R400,000 upgrade list before someone has decided to reserve makes the number in their head the wrong number — and none of it is even payable today.
2.  **The confirmation screens in step 2 are pure friction.** Re-confirming a home they picked two screens ago adds steps without adding certainty; 17% abandon on "complicated checkout". One review screen immediately before payment does the whole job.
3.  **Nothing qualifies anyone.** Sales finds out about bond versus cash after the fact. That's the gap your "fewer, better buyers" goal is actually pointing at.
4.  **The post-payment form is a portal-adoption leak.** Money is already taken, so it doesn't cost revenue — it costs you buyers who never reach the portal and phone your sales team instead. Nobody should fill in a form after paying.

### The revised flow

| Step | Screen                          | Asks for                                                                                    | System does                                                                                                                                              |
|------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| 0    | Browse & configure              | Nothing                                                                                     | CMS-rendered as today, plus the availability overlay from layer 04. Price shown clean — home price only.                                                 |
| 1    | **Reserve this home**           | Name, email, mobile. **Three fields.**                                                      | Creates the reservation, **places the hold and starts the timer here**, emails the resume link immediately                                               |
| 2    | **A few quick questions** `new` | Bond or cash · pre-approved yes/no/not yet · own use or investment · target occupation date | Sets `payer_route` and `qualification`; routes the deal to the right sales person                                                                        |
| 3    | **Secure with your home**       | Only unit-bound, scarce add-ons — parking, storage, position premiums. Skippable.           | Line items at snapshot prices; honest scarcity ("3 of 12 bays left")                                                                                     |
| 4    | **Review & pay**                | Confirm, accept terms                                                                       | One screen. Money block splits *payable today* from *purchase price* from *balance on transfer* → Payfast                                                |
| 5    | **Confirmed**                   | *Nothing.*                                                                                  | Account auto-provisioned from details already given; one button sets a password or sends a magic link. The receipt is fully readable without logging in. |
| 6    | Owner's portal                  | OTP signing, documents, progress                                                            | Plus the *deferrable* add-ons, surfaced at the right stage                                                                                               |

That's four screens between "I want this home" and payment, down from a form plus a series of confirmations — and it adds a qualification step while still being shorter.

### Add-ons: split the catalogue in two

Your instinct that add-ons belong later is right for most of them, and the evidence is strong: post-purchase upsells convert at roughly **3–8% against 1–3% pre-purchase**, with zero abandonment risk because the money conversation already happened. But some genuinely can't wait. The test isn't "when do we want to sell it", it's **"does this decision have to be made before the unit is built or allocated?"**

|                 | Reservation-time                                                                                    | Portal (post-reservation)                                                            |
|-----------------|-----------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| **What**        | Parking bays, storage units, position premiums, structural or fit-out choices with a build deadline | Furniture packages, appliance upgrades, interior packs, anything taste-based         |
| **Why then**    | Finite stock, or the builder needs the answer                                                       | Higher conversion after commitment; the buyer is imagining moving in, not doing sums |
| **Best moment** | Step 3, above                                                                                       | After `bond_approved` — commitment is real and the money is arranged                 |
| **Payment**     | Into the OTP total                                                                                  | Its own Payfast link or added to the transfer balance                                |

Implement it as one Option field on the Webflow **Add-ons** collection — `timing`, values `reservation` and `portal` — synced through to `res_catalogue_addons`. (The `luxury-upgrade` key on the current Step 2 forms is dead and does nothing — delete it rather than building on it.) The client then decides per add-on per property, which is exactly what you need given some properties already sell add-ons at both ends. No code change per property, no fork in the flow.

> **Money clarity beats everything else on this page**
>
> Extra costs are the largest abandonment cause in every study, and a property reservation is the easiest place in ecommerce to get this wrong: the number on screen is millions, the number being charged is thousands. Every screen from step 3 onward should carry the same three-line block — **Payable today R10,000** (refundable, deducted from the purchase price), **Purchase price R2,845,000**, **Balance on transfer**. Say "refundable" and "deducted" in full every time. That sentence is worth more than any amount of urgency copy.

### But LaunchBase gates everything — why does that work?

Because they aren't running a checkout. They're running a **drop**. Their launches sell out in *under three minutes* — The Daily went in 2 min 47 s, 45 units, ~R150m, with 245 buyers sitting online waiting for the clock. Dolce Vita: 55 units in under 15 minutes, ~R250m.

At that speed, forced registration isn't friction — it's **queue preparation**. You cannot let someone start typing their details at T+0 when the inventory lasts 167 seconds. Every second of admin has to happen *before* the moment of scarcity, so the account isn't a tollbooth in front of the product; the account *is* the ticket. And their conversion isn't measured the way yours is: demand is manufactured off-site through paid campaigns, price reveals and a waitlist, so launch day is fulfilment, not persuasion. Anyone still deciding never reaches the platform at all.

> **The mistake to avoid**
>
> So it's not "their marketing versus their gate" — the gate only works *because* of the marketing. Copy the gate onto an evergreen browse-and-reserve site and you import all of its cost and none of its mechanism: no launch moment, no queue, no scarcity, just a password wall in front of a buyer who was still making up their mind.

### What to borrow instead: a launch mode

Heartland plausibly has both situations, and they want opposite flows. Build the default one now and keep the other as a switch:

|               | Evergreen (Polaris, Sanford — remaining stock) | Launch day (a new phase, Eridanus, a new property)    |
|---------------|------------------------------------------------|-------------------------------------------------------|
| **Demand**    | Arrives continuously, mid-decision             | Manufactured beforehand, arrives all at once          |
| **Account**   | After payment — a wall costs you buyers        | **Before the release** — it's the queue ticket        |
| **Qualifier** | Step 2, in the flow                            | At pre-registration, days early                       |
| **Scarcity**  | Honest and quiet: "3 of 12 bays left"          | The entire event: countdown, unit grid going red live |
| **The hold**  | Ten minutes, generous, extendable              | Shorter, and the atomic lock is doing real work       |

Two things make this cheap to add later rather than now. The `active_hold_key` unique index from layer 02 is *precisely* the mechanism a first-come-first-served release needs — hundreds of people racing for the same unit is the exact scenario it was designed for, and most platforms get that wrong. And `res_properties` already carries `is_selling`; a launch mode is that field plus `sales_open_at`, a waitlist table, a countdown page and a pre-registration form. Roughly **12–18 hours** when there's a launch to run.

> **If you ever run a launch, revisit the Xano plan first**
>
> 245 people hitting the availability endpoint and the hold endpoint inside sixty seconds is a genuinely different load profile from a handful of reservations a week. That is the scenario where the CPU boost or the Pro plan in layer 12 stops being optional — decide it a week before the launch, not during it. Cache the availability response for a few seconds, and make sure the 409 path is as fast as the success path, because on launch day most requests will be losers.

### How to settle this with evidence rather than opinion

Two honest limits. Nobody outside LaunchBase knows their visitor-to-buyer conversion — sell-out speed measures pre-built demand, not funnel quality, and pricing below market sells out fast whatever the software does. And you certainly can't A/B test your way out of it: with 30–60 units of total inventory, no split test will ever reach significance, so this is a judgement call informed by evidence rather than a measurable one. Watch session recordings and sit next to five buyers instead — at this volume, qualitative research is not the poor relation, it is the only method that works. Instead, use what layer 02's `res_events` gives you free — step-by-step drop-off for your own traffic. If step 1 converts well and the drop is at payment, the flow is fine and the problem is price or trust. If people never reach step 1, the problem is upstream of everything in this document, and no amount of checkout design fixes it.

### Where ecommerce rules stop applying

Most of it transfers, because a form is a form and doubt is doubt. The mechanics of checkout — field count, cost transparency, error handling, mobile, autofill, trust cues at the payment moment — behave the same whether the number is R500 or R2.8m. Where it diverges, it diverges hard, and in ways that mostly *support* the instincts you've been describing.

1.  **Conversion isn't the finish line.** In retail, payment ends the story. Here it starts a three-to-nine month process through a bond, an attorney and the deeds office — so the metric that matters is *reservation → registration*, not reservation rate. A buyer who reserves and fails at bond stage costs you real money: the unit sat off the market for weeks. This is the one place where the standard advice genuinely inverts. In ecommerce, friction is nearly always negative-value; here **qualifying** friction has positive expected value. Administrative friction still doesn't — which is the whole argument in one line: keep the questions, lose the password.
2.  **It isn't one session, or one person.** Retail optimises for completing in a single visit. A home is decided over weeks, across a phone and a laptop, by a couple, often with a parent or a bond broker in the conversation. So the cart has to live for months, not 24 hours, and the configuration has to be *shareable* — "email this to my wife" is a step in the real journey. Your `uuid` resume link isn't only an abandonment-recovery tool; it's the feature that lets a buyer bring someone else into the decision. Treat it as a front-of-house feature: a Share button and an emailed summary of their selection, not just a link buried in a recovery email.
3.  **The price isn't a price.** Retail's "no surprise costs" rule scales into something bigger here: purchase price, deposit, bond repayment, transfer costs, levies, rates and occupational rental are all part of what the buyer is actually deciding. Your Units collection already carries the levy, rates and occupational-rental fields — surfacing a monthly affordability picture next to the price is the highest-leverage trust move available to you, and it self-qualifies buyers without asking them anything. People who can't carry the monthly number leave before they cost your sales team a week.
4.  **The legal position is a UX asset you're not using.** A sale of land is only binding once the Offer to Purchase is signed by both parties — which in your flow happens later, in the portal. The statutory cooling-off in section 29A of the Alienation of Land Act only applies to residential property at **R250,000 or less**, so it won't reach Heartland's stock, and the Consumer Protection Act route is narrow and starts its clock at transfer. All of which means the honest sentence at the payment step is unusually reassuring: *this reserves your home, the fee is refundable and comes off the purchase price, and nothing is binding until you sign the Offer to Purchase.* Have the conveyancer approve the exact wording — but that sentence, at the moment of payment, is worth more than every trust badge on the internet.
5.  **Human contact converts here; in retail it leaks.** Standard checkout advice is to strip distractions, phone numbers included. Invert it. A named consultant with a photo and a direct line, present on every step, is a conversion channel on a purchase this size — some buyers simply will not pay R10,000 to a website without speaking to a person first. Log the click as a touchpoint and route it by property, and it becomes measurable rather than a leak.
6.  **Post-purchase engagement is retention, not admin.** Remorse on a R500 order is a return; remorse on a home is a cancelled deal, a legal process and a unit back on the market months later. The portal's real job is keeping the deal alive through the wait — construction photos, milestone updates, what happens next and when. That's also where the deferred add-ons land, and it's why the portal earns its build cost twice.

> **The balancing caution**
>
> "We're different, we sell homes" is the most common excuse for keeping bad checkout design. Every problem found in the current flow — redundant confirmation screens, a form after payment, add-ons priced in before commitment — is a plain retail mistake, and property makes none of them acceptable. Use the exceptions above to decide *where to add qualification and reassurance*, never to justify extra steps. And note the evidence gap honestly: the abandonment research is retail data, and there is very little published work on high-value considered purchases. The direction transfers; treat the exact percentages as indicative.

### Two details that decide how this feels

**The timer starts at step 1, not at unit selection.** A countdown that begins while someone is still browsing is a pressure tactic on a multi-million-rand decision, and card trust is already a 19% abandonment factor — the last thing this audience needs is to feel hustled. Started at "Reserve this home", the same timer reads as fair: you're holding the unit for them. Show what it's for, offer one extension, and never let it expire silently mid-payment.

**Qualification is a question, not a wall.** Step 2 is where you earn "fewer, better buyers" — and it works precisely because it isn't friction for a serious buyer. Someone paying cash answers in ten seconds and feels understood. Someone who has no idea how they'd finance it hesitates there, which is information you want before sales spends a week on them. Then gate hard *inside* the portal: no OTP until the qualification block is complete and a consultant has confirmed it.

02 ·

## 02 · Xano — the schema

— *6 tables*

Build these in a Xano **branch**, on whichever of your three workspaces has headroom — this schema is self-contained and joins nothing that already exists in Xano, so it doesn't care which one. Prefix the tables `res_*` and namespace the API groups under `heartland/` so it stays legible beside whatever else lives there. Costs in layer 12.

> **What Xano stores about a unit**
>
> Not the unit. Units live in the Webflow CMS — one shared **Units** collection referencing **Properties**, plus the legacy **Units (Eridanus)** collection — and that stays true. Xano stores a *mirror* for pricing and locking (layer 03) and a *snapshot* on the reservation itself. The lock key is the Webflow item ID, which is already globally unique across collections and properties, so it does the job a foreign key would have done without pretending Xano owns the catalogue.

### res_reservations

| Field                                                               | Type                       | Why                                                                                                                                                                                                                     |
|---------------------------------------------------------------------|----------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `id`                                                                | int                        | PK                                                                                                                                                                                                                      |
| `uuid`                                                              | text, unique               | Public handle used in resume links and `custom_str1`. Never expose `id`.                                                                                                                                                |
| `status`                                                            | enum                       | The state machine above                                                                                                                                                                                                 |
| `memberstack_id`                                                    | text, index, nullable      | Null while anonymous; stamped at signup/login                                                                                                                                                                           |
| `email · first_name · last_name · phone`                            | text                       | Captured before payment — this is what makes recovery possible                                                                                                                                                          |
| `property_slug`                                                     | text, index                | `polaris`, `sanford`, `eridanus` — every query is scoped by property                                                                                                                                                    |
| `wf_unit_id`                                                        | text, index                | The Webflow CMS item ID of the unit. This is the join key to everything in Webflow.                                                                                                                                     |
| `wf_units_collection_id`                                            | text                       | Which units collection it came from — Units or Units (Eridanus)                                                                                                                                                         |
| `unit_snapshot`                                                     | json                       | Frozen at hold time: unit name, unit number, slug, type, price, deposit % bond, deposit % cash, occupational rental %, levy, rates, sizes. The CMS can be edited freely afterwards without altering a sold reservation. |
| `unit_price_cents`                                                  | int                        | Price at hold time, in cents, lifted out of the snapshot for querying                                                                                                                                                   |
| `configuration`                                                     | json                       | Floor/level, bed selection, custom upgrades 1–3 — the configurator payload                                                                                                                                              |
| `addons_total_cents · discount_cents · total_cents · deposit_cents` | int                        | All money in integer cents. `deposit_cents` is what Payfast actually charges.                                                                                                                                           |
| `currency`                                                          | text                       | `ZAR`                                                                                                                                                                                                                   |
| `hold_expires_at`                                                   | timestamp                  | Server-side truth for the countdown timer                                                                                                                                                                               |
| `active_hold_key`                                                   | text, **unique**, nullable | The `wf_unit_id` while live, null when dead. See the concurrency note below.                                                                                                                                            |
| `m_payment_id`                                                      | text, unique               | `HL-{uuid short}-{attempt}`, regenerated per attempt                                                                                                                                                                    |
| `payment_attempt`                                                   | int                        | Increments on each checkout                                                                                                                                                                                             |
| `pf_payment_id · payment_status · paid_at`                          | text / text / ts           | Mirrored from the winning ITN for quick reads                                                                                                                                                                           |
| `payer_route`                                                       | enum                       | `bond` · `cash` · `undecided` — from the step 2 qualifier; drives which OTP figures apply                                                                                                                               |
| `qualification`                                                     | json                       | Pre-approval status, own use vs investment, target occupation, plus who verified it and when                                                                                                                            |
| `last_step · last_activity_at`                                      | text / ts                  | Drives abandonment segmentation                                                                                                                                                                                         |
| `recovery_sent_count · recovery_last_sent_at · recovered_at`        | int / ts / ts              | Nudge throttling and attribution                                                                                                                                                                                        |
| `utm · referrer · user_agent`                                       | json / text / text         | Where the lead came from                                                                                                                                                                                                |
| `sales_owner · admin_notes`                                         | text                       | Manual follow-up                                                                                                                                                                                                        |
| `confirmed_at · cancelled_at · cancel_reason`                       | ts / ts / text             | Audit                                                                                                                                                                                                                   |

> **The concurrency trick**
>
> Two people can hit "Reserve" on unit 204 in the same second. Xano has no partial unique index, so use `active_hold_key`: set it to the `wf_unit_id` whenever the reservation is `held`, `awaiting_payment`, `awaiting_clearance` or `confirmed`, and to `null` in every dead state. Put a **unique index** on it. Postgres treats nulls as distinct, so unlimited dead reservations coexist while the database itself guarantees one live hold per unit — the second writer gets a unique-violation instead of a double sale. Wrap the hold endpoint in a *Database Transaction* block and catch that error into a clean 409.
>
> This is also why the lock cannot live in the CMS. Webflow has no transactions and no unique constraints; two simultaneous PATCHes to the `reserved` switch both succeed, and you find out at transfer.

### Naming conventions

Five naming systems now meet in this build, three of which you don't control. Writing the rules down is what stops the field map turning into a place where inconsistency hides.

| Namespace           | Rule                                                                                                                                                                                                            | Yours? |
|---------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| Xano tables         | `res_` prefix, plural, snake_case — the prefix is the namespace, since the workspace is shared. Mirrors of Webflow carry `catalogue_`, so "is this a cache?" is answerable from the name.                       | Yes    |
| Xano columns        | snake_case. Money is always integer `_cents`, never a float. Frozen values live in a `*_snapshot` json; one lifted out for querying keeps its plain name (`unit_price_cents`, not `unit_price_snapshot_cents`). | Yes    |
| Foreign identifiers | Carry the system they came from: `wf_unit_id`, `pf_payment_id`, `memberstack_id`. `m_payment_id` is the exception — it's *our* reference, but Payfast named it, so it keeps their spelling.                     | Shared |
| API paths           | kebab-case nouns, grouped by audience: `/public/`, `/member/`, `/admin/`. Paths stay `reservations` — the `res_` prefix is a database concern and has no business in a URL.                                     | Yes    |
| Front end           | `data-hl-*` attributes, kebab-case module filenames.                                                                                                                                                            | Yes    |
| Webflow form fields | **Frozen.** Not a convention, a contract — see layer 07.                                                                                                                                                        | No     |
| Webflow CMS slugs   | Inherited. Key everything on the *slug*, never the display name.                                                                                                                                                | No     |

> **Two deliberate exceptions, so nobody "fixes" them later**
>
> **Stage values keep their source casing.** Statuses we define are snake_case (`awaiting_payment`); the sales stages adopted from Memberstack stay kebab-case (`pay-deposit`, `bond-approval`) because rewriting them would break the portal we're deliberately keeping. Two casings, one reason, written down.
>
> **Some CMS display names contradict their slugs** — and the slug is what the API returns. On the Units collection, `floor` is labelled "Unit Number", `price` is the text version while `price-2` holds the number, `garden-info` is "Balcony Info" and `pool-info` is "Accessibility Info". Anyone mapping fields by what the Designer shows them will map the wrong ones. Map by slug, and put the display name in a comment.

### res_properties

One row per property, and almost none of it is invented — the fields already exist across the Webflow **Properties** and **Reservation Step 3** collections, where the client already maintains them. Seeding is a copy job, and the resync keeps it current.

| Field                                       | Notes                                                                                                                 |
|---------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| `slug · name · wf_item_id`                  | Properties collection — `slug`, `name`                                                                                |
| `wf_units_collection_id`                    | `61aa6f9a…` for Units, `61693663…dbe5` for Units (Eridanus)                                                           |
| `reservation_fee_cents`                     | **Reservation Step 3 collection → `payment-amount`** × 100. Already maintained by the client.                         |
| `payfast_item_name`                         | Reservation Step 3 → `item-name` ("Reservation Fee") — what shows on the statement                                    |
| `payfast_live`                              | Reservation Step 3 → `use-live-payments`. **Per property**, so one development can go live while another still tests. |
| `memberstack_plan_id`                       | Properties → `memberstack-plan-id` (`pln_polaris-heart-…`) — what provisioning in layer 05 attaches                   |
| `otp_base_url · otp_base_url_cash`          | Properties → `base-url-for-otp` / `-cash` (Zoho Sign templates)                                                       |
| `bond_rate · bond_years · bond_deposit_pct` | Properties → the three bond fields, for the affordability display                                                     |
| `hold_minutes`                              | 10 today, per property in case a launch wants longer                                                                  |
| `sales_email · whatsapp_from`               | Who gets the alerts for this property                                                                                 |
| `is_selling`                                | Properties → `payment-engine-live`, with `buy-now` as the marketing-side switch                                       |

### res_catalogue_addons

Add-ons already exist in the CMS with the semantics the front end needs — `price`, `dependancy`, `section`, `radio-group`, `num-available`, and a `property` reference. Keep editing them there. Xano mirrors the collection so it can price and validate server-side; the client never edits Xano.

    res_catalogue_addons
      wf_item_id (text, unique)   ← Webflow item ID
      slug, display_name, section, section_slug, radio_group
      price_cents                 ← from `price` × 100
      dependancy_slug             ← from `dependancy`, resolved server-side
      num_available, property_slug, in_add_all_upgrades
      timing                      // reservation | portal — new Option field in the CMS
      is_active, last_synced_at
    // the browser sends a slug and a qty. Never a price.

> **Two pricing details the CMS already decided**
>
> **Per-unit upgrades are not add-ons.** Custom Upgrade 1–3 are fields on the unit itself with their own prices, so they belong in `configuration` and get priced from `unit_snapshot`, not from the add-ons cache. **Deposits are percentages, not amounts.** The unit carries Deposit % Bond, Deposit % Cash and Occupational Rental % — those feed the OTP, and they are a different number from the reservation fee Payfast charges today. Confirm which one is being collected online before you write `recalculate_totals`; getting this backwards is a five-figure error, not a rounding one.

### res_line_items

Line items, with snapshot pricing. When the client raises the price of a parking bay, existing reservations must not silently change value.

    res_line_items
      id, reservation_id → res_reservations
      wf_item_id, slug_snapshot, name_snapshot, section_snapshot
      unit_unit_price_cents_snapshot, qty, line_total_cents
      added_via (manual | dependancy | add_all_upgrades)
      meta (json), created_at
    // unique index on (reservation_id, slug_snapshot) unless num_available > 1
    // added_via matters: dependency-added lines must be removed with their parent

### res_events — the touchpoints

One append-only row per meaningful moment. This is the table your abandonment reporting, funnel drop-off and support forensics all read from. Never update or delete rows here.

| Field                                     | Values / notes                                                                                                                                                                                                                                                                                                                                                |
|-------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `event_type`                              | `unit_viewed`, `configurator_opened`, `unit_selected`, `hold_placed`, `details_submitted`, `addons_viewed`, `addon_added`, `addon_removed`, `summary_viewed`, `checkout_initiated`, `payfast_redirect`, `itn_received`, `payment_complete`, `payment_failed`, `hold_expired`, `recovery_sent`, `recovery_clicked`, `reservation_recovered`, `admin_cancelled` |
| `step_index`                              | 1–7, so drop-off is a `GROUP BY` not an archaeology project                                                                                                                                                                                                                                                                                                   |
| `reservation_id`                          | Nullable — pre-reservation browsing still logs                                                                                                                                                                                                                                                                                                                |
| `session_id`                              | Front-end UUID in `sessionStorage`, stitches anonymous events to the eventual reservation                                                                                                                                                                                                                                                                     |
| `source`                                  | `web` · `itn` · `task` · `admin` — who wrote it                                                                                                                                                                                                                                                                                                               |
| `payload · ip · user_agent · occurred_at` | Context. Keep the payload small.                                                                                                                                                                                                                                                                                                                              |

### res_payments — the raw ITN log

Every ITN post lands here *before* any business logic runs, valid or not. When Payfast support asks what you received at 14:32, this is the answer.

    payments
      id, reservation_id (nullable), m_payment_id, pf_payment_id
      payment_status, amount_gross_cents, amount_fee_cents, amount_net_cents
      raw_body (text), parsed (json), source_ip
      signature_valid (bool), ip_valid (bool), validate_response (text), amount_valid (bool)
      processed (bool), reject_reason (text), received_at
    // unique index on (pf_payment_id, payment_status) → idempotency

### res_catalogue_units

A read model of the CMS, not a second source of truth. It exists so pricing, eligibility and the admin view don't make live Webflow calls, and so `recalculate_totals` can run in one database round trip.

    res_catalogue_units
      wf_item_id (text, unique), wf_units_collection_id, property_slug
      name, unit_number, display_name, slug, unit_type, level
      price_cents, deposit_bond_pct, deposit_cash_pct, occ_rental_pct
      levy_cents, rates_cents, home_area, unit_area
      cms_reserved (bool), cms_sold (bool), cms_occupied (bool)
      upgrades (json)              // custom upgrade 1–3: price + labels
      last_synced_at, sync_hash
    // availability = cms_sold OR cms_reserved OR a live hold in res_reservations

03 ·

## 03 · Webflow CMS ↔ Xano

— *the seam*

The split in one line: **the CMS knows sold and reserved; Xano knows held.** Durable outcomes are written back to Webflow where the client and the site can see them. Transient ten-minute holds never touch the CMS at all — they'd generate publish churn, they'd race, and they'd leave orphaned "reserved" switches every time somebody wandered off.

### Catalogue in — two mechanisms, both needed

1.  **Webhooks for freshness.** Register `collection_item_created`, `collection_item_changed` and `collection_item_deleted` on the Units, Add-ons and Properties collections, pointed at `POST /webflow/cms-sync`. Upsert into the relevant cache table by item ID. A price corrected in the Designer is live in Xano seconds later.
2.  **A nightly reconcile for truth.** Webhooks get missed — deploys, outages, bulk CSV imports that fire nothing useful. A task walks each property's units collection through the Data API (100 items a page) and rewrites the cache wholesale. Log any row where the cache and the CMS disagreed; a recurring disagreement means a broken webhook, not a fluke.

> **Close the loop before it closes on you**
>
> Xano writes `reserved` back to the CMS, which fires `collection_item_changed`, which calls Xano, which syncs, which… Break it by storing a `sync_hash` of the fields you care about: if the incoming webhook payload hashes to what's already cached, drop it and write nothing. Cheaper and more reliable than a timestamp window, and it also absorbs Webflow's duplicate webhook deliveries.

### Availability out — two speeds

| Where                    | Mechanism                                                                                                                                               | Latency | Covers                                                                                                          |
|--------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|---------|-----------------------------------------------------------------------------------------------------------------|
| **Live, in the browser** | Floor selector renders from the CMS as it does today, then `GET /public/availability?property=polaris` returns the taken item IDs and the JS locks them | ~200 ms | Holds, awaiting payment, just-confirmed — everything transient                                                  |
| **Durable, in the CMS**  | On `confirmed`, Xano PATCHes `reserved: true` on the item and publishes it. On admin cancel or refund, sets it back.                                    | seconds | What the client sees in the Editor, what search engines see, what every other page on the site already keys off |

This write-back is also what retires the existing Make webhook. That scenario does exactly one thing — flip `reserved` so unit status displays correctly across the site — and Xano already holds a Webflow token for the catalogue sync, so doing the PATCH directly removes a hop and a dependency. Keep the Make scenario switched on but unused through cutover; it is the rollback path.

Because write-back only happens on confirmation and cancellation — a handful of calls a day rather than one per cart — you stay far inside the Data API's rate limit, and the publish queue never becomes a dependency of taking money. Check the current per-minute limit for your Webflow plan and put the write-back behind a retry with backoff regardless: a failed CMS write must never fail the payment. Queue it, alert, and let the nightly reconcile catch anything that fell through.

    Xano · after a confirmed ITN
    1  edit reservation → confirmed          // this is the real state change
    2  edit res_catalogue_units → cms_reserved = true
    3  Try/Catch:
         PATCH https://api.webflow.com/v2/collections/{cid}/items/{wf_unit_id}
           { fieldData: { reserved: true } }
         POST  .../items/publish { itemIds: [wf_unit_id] }
       Catch → add res_sync_queue row, alert, continue
    4  return 200 to Payfast                  // step 3 must never block this

### What the front end asks for

    GET /public/availability?property=polaris

    { "server_time": "2026-08-21T09:14:02Z",
      "taken": [
        { "wf_unit_id": "66f1…a2", "state": "confirmed" },
        { "wf_unit_id": "66f1…b7", "state": "held", "until": "2026-08-21T09:22:10Z" }
      ] }

    // the JS greys the sold ones and shows a live countdown chip on the held ones —
    // "reserved, 6 min left" converts better than a dead grey tile

> **Migration bonus**
>
> The CMS `reserved` / `sold` / `occupied` switches are your backfill seed. On day one, every unit flagged sold or reserved becomes a `confirmed` reservation in Xano with what the CMS knows attached — which means the admin view has real inventory in it from the first hour, rather than looking empty until the first new booking lands.

04 ·

## 04 · Xano — the API surface

— *3 groups*

Three API groups with different security postures: `public/` (no auth, rate-limited, uuid-scoped), `member/` (Xano auth token), `admin/` (auth token + role check). Plus one unauthenticated endpoint that only Payfast should ever call.

| Method | Path                                           | Does                                                               | Auth          |
|--------|------------------------------------------------|--------------------------------------------------------------------|---------------|
| POST   | `/public/reservations`                         | Create `draft`, return uuid + config                               | —             |
| PATCH  | `/public/reservations/{uuid}`                  | Update configuration, contact details                              | uuid          |
| GET    | `/public/reservations/{uuid}`                  | Rehydrate cart on resume; returns totals + `hold_expires_at`       | uuid          |
| POST   | `/public/reservations/{uuid}/hold`             | Atomically claim the unit, start the 10-min timer                  | uuid          |
| POST   | `/public/reservations/{uuid}/hold/extend`      | One-time +5 min, only if unit still free                           | uuid          |
| GET    | `/public/availability?property=`               | Taken unit IDs + hold expiry, for the floor selector               | —             |
| GET    | `/public/addons?property=&wf_unit_id=`         | Eligible catalogue from the cache, sections in order               | —             |
| POST   | `/public/reservations/{uuid}/addons`           | Add line item, revalidate rules, recalc totals                     | uuid          |
| DELETE | `/public/reservations/{uuid}/addons/{line_id}` | Remove line item, recalc                                           | uuid          |
| POST   | `/public/reservations/{uuid}/checkout`         | Lock totals, mint `m_payment_id`, return **signed** Payfast fields | uuid          |
| GET    | `/public/reservations/{uuid}/status`           | Polled by the success page until `confirmed`                       | uuid          |
| POST   | `/public/events`                               | Touchpoint logging, accepts `sendBeacon`                           | —             |
| POST   | `/payfast/itn`                                 | The notify_url                                                     | see layer 06  |
| POST   | `/webflow/cms-sync`                            | CMS webhook receiver, hash-guarded                                 | shared secret |
| POST   | `/auth/memberstack`                            | Exchange Memberstack JWT → Xano auth token                         | MS token      |
| GET    | `/member/reservations`                         | This member's reservations, full detail                            | Xano token    |
| POST   | `/member/reservations/{uuid}/claim`            | Attach an anonymous reservation after signup                       | Xano token    |
| GET    | `/admin/reservations`                          | Filter by status, date, unit, abandonment bucket                   | role=admin    |
| GET    | `/admin/stats`                                 | Funnel counts per step, conversion, revenue held vs confirmed      | role=admin    |
| POST   | `/admin/reservations/{id}/cancel`              | Release unit, log reason                                           | role=admin    |

### The one function that matters: recalculate_totals

Write it once as a Xano custom function and call it from every mutation. The browser never sends a price — it sends a SKU and a quantity.

    Xano custom function · recalculate_totals(reservation_id)
    1  get reservation + res_properties row + all res_line_items
    2  unit_price = reservation.unit_price_cents        // snapshot, not cache
    3  upgrades   = sum(configuration.upgrades[].price_cents)    // per-unit, from unit_snapshot
    4  addons     = sum(line_total_cents)                        // snapshot prices, qty applied
    5  total_cents   = unit_price + upgrades + addons - discount_cents
    6  deposit_cents = property.reservation_fee_cents            // what Payfast charges NOW
    7  otp_figures   = { bond:  unit_price * snapshot.deposit_bond_pct / 100,
                         cash:  unit_price * snapshot.deposit_cash_pct / 100,
                         occ_rental: unit_price * snapshot.occ_rental_pct / 100 }
                                                                 // display + OTP only
    8  edit reservation; return the money block
    // checkout signs deposit_cents. The OTP percentages are never sent to Payfast.

### Environment variables

All in Xano env vars, none in the repo: `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `PAYFAST_ALLOWED_IPS`, `MEMBERSTACK_SECRET_KEY`, `WEBFLOW_API_TOKEN`, `WEBFLOW_SITE_ID`, `WEBFLOW_WEBHOOK_SECRET`, `MAKE_WEBHOOK_SALES`, `SITE_BASE_URL`. The Payfast host is *not* an env var — it comes per property from `use-live-payments`.

05 ·

## 05 · Memberstack — identity only

— *shrink it*

### What stays

- Signup, login, password reset, the OTP flow.
- Page gating on the Portal and any unit-detail pages that require an account.
- Exactly two custom fields worth keeping: `phone` and whatever the OTP flow needs. Everything reservation-shaped moves out.

### What goes

Every reservation JSON blob in member metadata becomes read-only on cutover day and is deleted after the backfill is verified. Reasons it has to go: metadata can't be queried across members, can't be indexed, can't be joined to units, can't hold line items, has no audit trail, and can't be written by Payfast's ITN — which is precisely the write that matters most.

### The auth handoff

Front end gets the member's JWT, exchanges it once for a Xano auth token, then talks to Xano normally. Don't call Memberstack on every request.

    Browser
    const token = await window.$memberstackDom.getMemberToken();   // JWT
    const res   = await fetch(`${XANO}/auth/memberstack`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ token })
    });
    const { authToken } = await res.json();   // store in memory, not localStorage

    Xano · POST /auth/memberstack
    1  External API Request
         POST https://admin.memberstack.com/members/verify-token
         headers: { x-api-key: $env.MEMBERSTACK_SECRET_KEY,
                    Content-Type: application/json }
         body:    { token: input.token }
    2  Precondition: response.status == 200            // any non-200 = auth failure
    3  member_id = response.result.id                  // decoded JWT claims
    4  Get Record users where memberstack_id = member_id
         if not found → Add Record (memberstack_id, email, role: 'member')
    5  Create Authentication Token (users, id, ttl 86400)
    6  return { authToken, member: { id, email, role } }

> **Alternative**
>
> Memberstack signs its JWTs RS256 and you can verify locally with their public key using Xano's JWS decode — no round trip, no secret key in play. It's faster but people regularly trip over key-ID mismatches when Memberstack rotates. Start with the verify-token endpoint; optimise later only if latency shows up in practice.

### Anonymous carts

Let people configure and even hold a unit before signing up — you capture email at step 1, which is what makes abandonment recovery possible at all. When they subsequently sign up, call `/member/reservations/{uuid}/claim` to stamp `memberstack_id` onto the existing row. Do not create a second reservation.

### Auto-provisioning after payment

Per layer 01, nobody fills in a form after paying. The confirmed ITN triggers account creation from details you already hold, and the buyer receives an invitation rather than a task.

    Xano · on confirmed, after the ITN has returned 200
    1  POST https://admin.memberstack.com/members
         { email, customFields: { firstName, lastName, phone },
           plans: [{ planId: property.memberstack_plan_id }], sendEmail: false }
    2  edit reservation → memberstack_id
    3  send our own branded email:
         "Your reservation is confirmed" + [ Set your password ] link
         + the resume link, which shows the full receipt WITHOUT logging in
    // if the email already exists, attach the plan to the existing member instead —
    // repeat buyers and investors are common on these developments.

Two rules for the confirmation screen: the receipt must be fully readable through the `uuid` link with no login, and the password step must be a button, never a gate. Portal adoption is a follow-up problem, not a checkout problem — treat it that way and it climbs on its own.

06 ·

## 06 · Payfast — checkout & ITN

— *the money layer*

> **Two absolutes**
>
> The signature is generated **server-side in Xano** — the moment `merchant_key` or the passphrase reaches the browser, anyone can mint a payment for R1. And the `return_url` is **not** proof of payment; it's just where the browser lands. Only a validated ITN confirms a reservation.
>
> **This is not hypothetical on Heartland today.** The current `#RealPayFastForm` carries the amount and item label as CMS-bound hidden inputs, so the price of a home is editable in devtools — and with no ITN validation behind it, a R1 payment would present as a completed reservation. Reading `payment-amount` from the CMS server-side and signing that is the fix, and it closes a live hole rather than hardening a theoretical one.

### Checkout — what /checkout returns

1.  Re-check the hold is still live and the unit still belongs to this reservation. If not, return 409 and let the front end show "this unit was just taken".
2.  Run `recalculate_totals` one final time. This value is the one that gets signed.
3.  Increment `payment_attempt`, mint `m_payment_id = HL-{uuid[0:8]}-{attempt}` — unique per attempt, so a retry after a failure doesn't collide in the payments log.
4.  Build the field set in the documented Payfast order, sign it, set status to `awaiting_payment`, log `checkout_initiated`, return the fields.

<!-- -->

    Field set + signature · Xano
    // host = property.payfast_live ? www : sandbox — per property
    merchant_id      $env.PAYFAST_MERCHANT_ID
    merchant_key     $env.PAYFAST_MERCHANT_KEY
    return_url       {SITE}/reservation-processing?r={uuid}
    cancel_url       {SITE}/reserve?r={uuid}&cancelled=1
    notify_url       {XANO}/payfast/itn
    name_first       reservation.first_name
    name_last        reservation.last_name
    email_address    reservation.email
    cell_number      reservation.phone
    m_payment_id     HL-a1b2c3d4-1
    amount           format(deposit_cents / 100, '0.00')   // from CMS payment-amount
    item_name        property.payfast_item_name             // from CMS item-name
    item_description "Reservation fee + selected add-ons"
    custom_str1      reservation.uuid                       // your join key
    custom_str2      property_slug                          // polaris | sanford | eridanus
    custom_str3      wf_unit_id                             // Webflow item ID

    // signature
    str = fields joined as key=urlencode(value) with &,
          IN THE ORDER ABOVE (not alphabetical), empty values skipped,
          spaces encoded as '+', hex uppercase
    str = str + "&passphrase=" + urlencode($env.PAYFAST_PASSPHRASE)   // omit entirely if blank
    signature = md5(str) lowercased

> **Ordering, precisely**
>
> Three different orderings exist and mixing them up is the single most common Payfast failure. **Checkout form:** the documented field order above. **ITN:** the order the variables were actually posted to you. **Payfast REST API** (refunds, subscriptions): alphabetical. Confirm the current field list against the Payfast developer docs before you ship — they add fields.

### The ITN endpoint, step by step

Public, no auth, no CORS. Order matters: log first, validate second, mutate last.

1.  **Capture the raw body first.** Read `$http_raw_body` and store it before parsing. Xano's parsed input object does not guarantee field order, and ITN signature verification depends on the order received — rebuild the string from the raw body, not from the parsed object. This one detail causes most "signature never matches" nightmares.
2.  **Insert a `res_payments` row** with the raw body, source IP and parsed JSON, `processed = false`. Everything after this point updates that row.
3.  **Signature.** Rebuild from the raw body minus the `signature` pair, append the passphrase (only if one is set on the account), MD5, compare case-insensitively. Store `signature_valid`.
4.  **Source IP.** Check against the Payfast ranges in `PAYFAST_ALLOWED_IPS` — publicly documented as `197.97.145.144/28` and `41.74.179.192/27`, plus the sandbox host while testing. Verify the current list in the Payfast docs at build time and keep it in an env var so it's a config change, not a redeploy.
5.  **Server confirmation.** POST the full received payload back to `https://{PAYFAST_HOST}/eng/query/validate`. The response body must be `VALID`. This is what defeats a replayed or fabricated post.
6.  **Merchant + amount.** `merchant_id` must equal yours; `amount_gross` must be within R0.01 of the reservation's `deposit_cents / 100`. A mismatch is tampering — reject, alert sales, never confirm.
7.  **Idempotency.** If a `res_payments` row with the same `pf_payment_id` + `payment_status` is already `processed`, stop here and return 200. Payfast retries, and networks duplicate.
8.  **Transition** per the table below, inside a transaction, writing the reservation, the unit and a `res_events` row together.
9.  **Return HTTP 200** once the row is logged — even for rejects, otherwise Payfast retries a post you have already refused. Return 500 only when you failed *before* logging, where a retry genuinely helps. Fire notification webhooks after responding, or in a background task, so Make's latency can't time out the ITN.

| payment_status | Reservation →        | CMS write-back                  | Side effects                                                                                                             |
|----------------|----------------------|---------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| `COMPLETE`     | `confirmed`          | `reserved: true` + publish item | Clear `hold_expires_at`, keep `active_hold_key`, confirmation email + WhatsApp, sales Slack, OTP figures to the attorney |
| `PENDING`      | `awaiting_clearance` | None — hold only                | Push `hold_expires_at` out 7 days, "we're waiting for your EFT" email                                                    |
| `FAILED`       | `payment_failed`     | None                            | Hold survives until expiry, retry-payment email with resume link, sales alert                                            |
| `CANCELLED`    | `held`               | None                            | Let the normal hold timer run out; enters the abandonment flow                                                           |

### The success page

The `return_url` lands on `/reservation-processing`, which polls `/public/reservations/{uuid}/status` every 2 seconds for up to 60. `confirmed` redirects to the success page; still pending after 60s shows "payment received, confirming — we'll email you". This removes the cross-page payment-detection hack the current flow relies on.

07 ·

## 07 · Webflow front end

— *Wized vs JS*

### Weighing Wized against custom JS

| Dimension                     | Wized                                                                                                                    | JS via jsDelivr                                                                          |
|-------------------------------|--------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| Fit for this flow             | Built for declarative data binding — lists, forms, dashboards                                                            | Built for imperative state machines, which is exactly what a hold-timer-checkout flow is |
| Existing Heartland code       | The configurator, floor selector and timer are already imperative JS; you'd straddle two paradigms and debug across both | One paradigm, one place                                                                  |
| Version control               | Config lives in Wized's cloud; diffing and rollback are awkward                                                          | Git history in `heartland-scripts`, revert is a commit                                   |
| Speed to first working screen | Faster — request builder, auto data binding                                                                              | Slower — you write fetch, loading and error states                                       |
| Runtime cost                  | Extra script + init before render; noticeable on a configurator page already carrying weight                             | ~10 KB of your own code, deferred                                                        |
| Ongoing cost / lock-in        | Subscription, and the flow stops working if it lapses                                                                    | None                                                                                     |
| Client-First fit              | Own attribute vocabulary alongside your classes                                                                          | `data-hl-*` attributes you define, so Daniel places elements freely in the Designer      |

> #### Verdict
>
> **Custom JS for the reservation flow.** Its value is in atomic holds, server-authoritative totals and a countdown that survives a refresh on another device — none of which Wized makes easier, and all of which are harder to reason about through a binding layer. Wized stays worth it for the *Portal*: read-mostly lists of a member's reservations, documents and payment history, where declarative binding is genuinely faster to build. Nothing stops you running both — just not on the same page.

### Module structure in heartland-scripts

    heartland/reservation/
      api.js        fetch wrapper — base URL, auth header, 409/500 handling, one retry
      field-map.js  Webflow field name ↔ Xano path, both directions
      legacy.js     per-form switches for the compatibility shim
      state.js      the single store; localStorage holds ONE key: hl_reservation_uuid
      availability.js  GET /public/availability on load + on focus; locks taken
                       units on the floor selector, live chip on held ones
      hold.js       place / extend / release, handles the 409 "unit just taken" path
      timer.js      countdown from server hold_expires_at (see below)
      addons.js     renders catalogue, add/remove, re-renders totals from the response
      track.js      touchpoint events, debounced, sendBeacon on pagehide
      checkout.js   POST /checkout → builds and auto-submits the Payfast form
      resume.js     ?r={uuid} deep link → GET reservation → rehydrate UI
      index.js      binds everything to data-hl-* attributes on DOM ready

### The timer, fixed

The current 10-minute timer persists its start time in localStorage, which means it disagrees with reality after a device switch, a clock change or a tab left open overnight. Server time becomes the truth:

    // hold_expires_at comes from Xano on every reservation read
    let skew = 0;                                    // server↔client clock offset

    function sync(res) {
      skew = new Date(res.server_time) - Date.now(); // returned by every endpoint
      expiresAt = new Date(res.hold_expires_at);
    }

    function remaining() {
      return Math.max(0, expiresAt - (Date.now() + skew));
    }

    // re-read from the server whenever the tab wakes — never trust a paused interval
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) api.get(`/public/reservations/${uuid}`).then(sync);
    });

    // at zero: ask the server, don't assume. It may have been extended or paid.

### Touchpoint tracking

    track('addon_added', { sku, qty, step: 4 });

    // fire-and-forget, survives navigation
    function track(event_type, payload = {}) {
      const body = JSON.stringify({
        event_type, payload,
        reservation_uuid: state.uuid,
        session_id: state.sessionId,
        step_index: STEP_MAP[event_type] ?? null
      });
      if (navigator.sendBeacon) navigator.sendBeacon(`${XANO}/public/events`, new Blob([body], {type:'application/json'}));
      else fetch(`${XANO}/public/events`, { method:'POST', body, keepalive:true, headers:{'Content-Type':'application/json'} });
    }

    window.addEventListener('pagehide', () => track('page_exit', { step: state.step }));

Mirror the same events into GA4 / Meta if marketing needs them, but treat Xano as the system of record — analytics tools drop events to ad blockers and you cannot recover a lead from a GA4 chart.

### Legacy field names are a contract you don't own

Site-wide Webflow form webhooks feed workflows maintained by other people, and those workflows read **field names**. So for as long as they exist: no field is renamed, removed or reordered in the DOM, and no form loses its native submit. Xano's schema names stay internal, and translation happens at the boundary.

    field-map.js — the boundary, both directions
    // inbound:  native submit → Xano shape
    // outbound: Xano → hidden legacy fields, so downstream payloads stay identical
    //           while the source of truth moves underneath them
    export const FIELD_MAP = {
      'First Name': 'first_name',   'first-name': 'first_name',   // both spellings exist
      'Contact Number': 'phone',    'mobile-number': 'phone',
      'purchase-type': 'payer_route',
      'unit-id': 'wf_unit_id',      'item-id': 'wf_unit_id',
      'purchase-price': 'total_cents',
      'floor-type': 'configuration.floor.label',
      'floor-type-slugs': 'configuration.floor.slugs',            // label AND slug required
      'appliance-upgrades-slugs': 'addons.appliance.slugs',
      // …full map in the phase 1 runbook
    };

    export const DEAD_FIELDS = ['luxury-upgrade'];  // unmapped, still rendered

    legacy.js — per form, because the owners differ
    export const LEGACY = {
      enabled: true,
      nativeSubmit: { 'reservation-form': true, 'toggle-reserved': true, /* … */ },
      populateFromXano: true,
      logPayload: true,        // keeps the sent payload on the reservation, for diffing
    };
    // mirrored in a res_config row via GET /public/config, so switching a form off
    // is a Xano toggle rather than a commit and a CDN purge. JS is the fallback.

> **How the shim ends**
>
> Capture one real payload per form *before* any change — that baseline plus `logPayload` turns parity into a diff rather than a hope. Then hand each workflow owner the field map and the Xano payload that would replace theirs, and switch off **one form at a time**: owner confirms, flip the flag, watch a week, delete the hidden fields. Never two at once — if something downstream goes quiet, you want a single suspect. The shim is a few hours; leaving it in place long after it's needed costs nothing but a file, and the failure mode it prevents is silent, in someone else's system, and reported late.

### Attribute contract for the Designer

| Attribute                   | On                  | Behaviour                                                                        |
|-----------------------------|---------------------|----------------------------------------------------------------------------------|
| `data-hl-step="3"`          | Step wrapper        | Marks the step; drives `last_step`                                               |
| `data-hl-bind="total"`      | Text element        | Filled with formatted ZAR from the server response                               |
| `data-hl-addon="slug"`      | Add-on card         | Toggle/qty control posts to the add-ons endpoint; the CMS slug is the identifier |
| `data-hl-unit="{item-id}"`  | Floor selector unit | Bound from the CMS item ID; availability marks it taken or held                  |
| `data-hl-action="hold"`     | Button              | Places the hold, moves to the next step                                          |
| `data-hl-action="checkout"` | Button              | Requests signed fields, submits to Payfast                                       |
| `data-hl-timer`             | Text element        | Countdown target                                                                 |
| `data-hl-state="expired"`   | Any block           | Shown only in that reservation state                                             |

This keeps the split you already work in: Claude ships the module, you place and style elements in the Designer without touching code.

08 ·

## 08 · Holds & abandonment

— *3 tasks*

### Task 1 — expire_holds · every minute

    res_reservations where status IN (held, awaiting_payment, payment_failed)
                 AND hold_expires_at < now()
                 AND status != awaiting_clearance          // EFT protection
    for each:
      status = expired; active_hold_key = null              // unit is free again
      add res_events(hold_expired, source: task)
      if email present → queue recovery (task 2 picks it up)
      POST $env.MAKE_WEBHOOK_SALES if it reached details_submitted
    // no Webflow call here — the CMS never knew about the hold in the first place.
    // the next /public/availability response simply stops listing the unit.

Run it every minute if your Xano plan allows; every 5 is fine in practice because the front end already hides the unit locally at zero. The task is the authority, the UI is a courtesy.

### Task 2 — recovery_nudges · every 15 minutes

| Nudge | Fires when                                                                | Channel       | Message                                                                               |
|-------|---------------------------------------------------------------------------|---------------|---------------------------------------------------------------------------------------|
| 1     | 30 min after `last_activity_at`, status `draft`/`expired`, email captured | Email         | "Your Unit 204 selection is saved" + resume link                                      |
| 2     | 24 h, no `recovered_at`, phone captured                                   | WhatsApp      | Short, personal, from the sales number                                                |
| 3     | 72 h                                                                      | Email         | Named consultant + "this unit is still available" / alternatives if not               |
| 4     | Payment failed specifically                                               | Email, 15 min | "Your payment didn't go through" + retry link — the highest-converting one of the set |

Guards: stop at `recovery_sent_count >= 3`, never send between 20:00 and 08:00 SAST, never send to a reservation whose member has another `confirmed` reservation, and always log `recovery_sent`. The link is `{SITE}/reserve?r={uuid}&src=recovery` — `resume.js` rehydrates, logs `recovery_clicked`, and if the unit is gone it says so honestly and offers the closest matches rather than failing silently.

### Task 3 — daily_digest · 07:00 SAST

One email or Slack post to sales: new confirmed reservations, holds expiring today, EFTs still clearing, abandoned reservations with contact details, and the funnel counts per step from `res_events`. Xano composes the payload; Make delivers it.

### Where the alerts land

Every alert in this layer — expired holds worth chasing, failed payments, EFTs still clearing — needs somewhere to be actioned rather than just announced. That's the sales console in layer 09, and it's why the two layers ship together: an abandonment email nobody follows up on is a notification, not a process.

09 ·

## 09 · The sales console

— *3 screens*

### Portal or a synced Google Sheet?

Build the portal. The sheet is the right instinct — free, familiar, no training — and it fails on one specific thing that happens to be the thing you asked for: **changing add-ons**. That isn't data entry, it's a price change on a signed deal.

| What sales does                         | Two-way Google Sheet                                                                                                                         | Console on the Xano API                                                                |
|-----------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| Add a parking bay to a paid reservation | Types a row. Nothing revalidates dependencies, applies snapshot pricing, or recalculates the balance — the total in the sheet is now fiction | Hits the same endpoint the customer does; `recalculate_totals` runs; a balance appears |
| Move a deal to bond approved            | Changes a cell. No transition rules, nothing fires                                                                                           | Legal transition only; triggers the buyer email and the attorney notification          |
| Two agents edit the same deal           | Last write wins, silently. No row locking exists in Sheets                                                                                   | Version check, second one is told what changed                                         |
| "Who dropped the price on unit 204?"    | Revision history, if nobody duplicated the tab                                                                                               | `res_events` row with member, timestamp and reason                                     |
| Cost to build                           | 16 – 25 h and permanently fragile                                                                                                            | 22 – 30 h and it compounds                                                             |

> #### Verdict — and keep half the sheet
>
> **Console for writes, spreadsheet for reads.** Every mutation goes through the API where the rules live. But put a *Download CSV* button on the pipeline view, and if the client wants a live tab, add a scheduled Make scenario that rewrites a read-only sheet from `/admin/export`. They get their pivot tables, you keep one source of truth. Two hours of work, and it removes the entire reason anyone would ask for the two-way sync.

### Two state machines, not one

The `status` field in layer 00 tracks the *payment*. What sales manages is the *deal*, which starts where payment ends and runs for months. Keep them separate — conflating them is how you end up with a reservation that's simultaneously "paid" and "awaiting bond".

> **Half of this already exists — adopt it, don't redesign it**
>
> The portal dashboard already runs a stage machine out of two Memberstack fields, `status` and `sub-status`, with the sub-statuses `pre-qualify` → `sign-otp` → `pay-deposit` → `bond-approval` → `bond-approved`, branching on `purchase-type` so cash buyers skip pre-qualification and both bond steps. It even enforces windows: **7 days** from `reservation-start`, **7 days** from `deposit-start`, **30 days** from `bond-start`. Use those exact values for `sales_stage` and the migration is a straight copy, the portal keeps working unchanged, and sales doesn't learn new words. The stages below that have no equivalent — OTP issued, transfer lodged, registered — are additions to the end of a sequence that already exists, not a replacement for it. One thing to settle with the client while you're in there: the dashboard code carries a flagged conflict on the bond window, "spec said 7 days but the copy says 30".

| sales_stage            | Means                                                                        | Owner & clock                    | CMS effect                           |
|------------------------|------------------------------------------------------------------------------|----------------------------------|--------------------------------------|
| `reserved`             | Reservation fee paid, unit off the market                                    | Set automatically on `confirmed` | `reserved: true`                     |
| `otp_issued`           | Zoho Sign OTP sent, built from `otp_base_url` + unit snapshot                | Sales · 3 days                   | —                                    |
| `otp_signed`           | Signed and countersigned *(exists as `sign-otp`)*                            | Sales · —                        | —                                    |
| `deposit_due`          | Bond % or cash % payable to the attorney's trust *(exists as `pay-deposit`)* | Buyer · 7 days, already enforced | —                                    |
| `deposit_paid`         | Trust account confirmed                                                      | Attorney · —                     | —                                    |
| `bond_application`     | Submitted to the bank *(exists as `bond-approval`)*                          | Buyer / broker · 30 days today   | —                                    |
| `bond_approved`        | Grant letter received *(exists as `bond-approved`)*                          | —                                | —                                    |
| `bond_declined`        | Declined — retry with another bank, or the deal dies                         | Sales · 5 days to decide         | —                                    |
| `transfer_lodged`      | Lodged at the deeds office                                                   | Attorney · —                     | —                                    |
| `registered`           | Transferred. Done.                                                           | —                                | `sold: true`                         |
| `lapsed` · `cancelled` | Fell over at any stage                                                       | Sales · reason required          | `reserved: false`, unit back on sale |

Store `sales_stage`, `stage_entered_at`, `stage_due_at`, `stage_owner` and `next_action` on the reservation, and write a `res_events` row on every transition. Days-in-stage then costs nothing to report, and "which deals are stuck" becomes a query rather than a meeting.

> **Editing add-ons after payment creates money, not data**
>
> Add a R45,000 furniture package to a reservation that already paid its fee and the reservation now owes R45,000 more. The system must say so rather than quietly restating the total. Add three fields — `paid_cents` (sum of confirmed payments), `balance_cents` (`total_cents − paid_cents`) and `balance_state` (`settled` · `due` · `refund_due`) — and show the balance in red on the detail screen with the adjustment history beneath it. Every admin-side add or remove requires a reason string; it lands in the audit trail and on the buyer's statement. A negative balance means someone owes a refund, which is a decision for a human, never an automatic Payfast call.

### Three screens. Resist the fourth.

1.  **Pipeline.** One table, all properties, filter by property, stage, status and owner; saved views for "my deals", "stuck \> 14 days", "bond outcome due". Stage pill, days-in-stage, balance, next action. Download CSV lives here.
2.  **Reservation detail.** A drawer, not a page: buyer and unit summary, the add-ons editor, the money block with balance, stage control with only legal transitions offered, notes, and the full event timeline underneath. Everything sales needs on one deal without navigating away from the list.
3.  **Today.** What needs a human this morning — holds expiring, EFTs still clearing, OTPs unsigned past due, bond deadlines this week, abandoned reservations with a phone number. This is the screen that makes them open it daily; without it the console is a filing cabinet.

### Endpoints and permissions

| Method | Path                                   | Notes                                                         |
|--------|----------------------------------------|---------------------------------------------------------------|
| GET    | `/admin/reservations`                  | Filter, sort, paginate; returns the money block and stage     |
| GET    | `/admin/reservations/{id}`             | Full detail incl. events and payments                         |
| POST   | `/admin/reservations/{id}/addons`      | Same validation as the public route, plus a required `reason` |
| PATCH  | `/admin/reservations/{id}/stage`       | Rejects illegal transitions; fires the stage's notifications  |
| PATCH  | `/admin/reservations/{id}`             | Contact details, owner, next action, notes                    |
| POST   | `/admin/reservations/{id}/cancel`      | Reason required; releases the unit and writes back to the CMS |
| POST   | `/admin/reservations/{id}/hold/extend` | Manual grace for a buyer on the phone                         |
| GET    | `/admin/today`                         | The action list, one query per bucket                         |
| GET    | `/admin/export`                        | Flat CSV — the sheet's data source                            |

Three roles on the `users` table, enforced in Xano and never in the browser: **admin** (everything, including price adjustments and cancellations), **sales** (their own deals, stage moves, notes, no cancellations), **viewer** (read and export). At four people you don't need more, and every role you add is a permission matrix somebody has to maintain.

### Build it in what you already have

By the time you reach this layer, `api.js`, the Memberstack token exchange and the `data-hl-*` binding pattern all exist. A Memberstack-gated Webflow page reusing them costs you the table, the drawer and the filters — no new dependency, no monthly fee.

Wized is the alternative and it is genuinely faster for CRUD screens, but price it honestly: this console needs more than 20 elements, so it's the Small plan at **\$29–39/month (~R470–R630)**, forever, for an internal tool with four users. Against roughly eight extra hours of building it yourself, Wized pays for itself in under a year and then keeps charging. Take it only if the console has to be live in days rather than weeks.

10 ·

## 10 · Migration & cutover

— *6 phases*

1.  **Inventory.** Pull every member's reservation metadata via the Memberstack Admin API into a JSON dump. Map each key to a column in the new schema, and note the ones with no home — that list is where your schema is still wrong.
2.  **Build on a Xano branch, then seed from the CMS.** Schema, endpoints, tasks. Run the reconcile task once to fill `res_catalogue_units`, `res_catalogue_addons` and `res_properties` from live Webflow data — no hand-typed prices anywhere in this build.
3.  **Sandbox the payment path end to end** before any of it touches the live site: Payfast sandbox merchant, a duplicate Webflow page at `/reserve-v2`, ITN pointed at the branch's endpoint. Nothing goes further until the ITN matrix in layer 11 is green.
4.  **Shadow write — only if there's volume to shadow.** On a busy site the live flow would keep writing Memberstack metadata *and* start POSTing to Xano, compared daily. At Heartland's current volume there is nothing to compare, and dual-writing would add a failure mode rather than remove one. Replace it with a full sandbox rehearsal: one reservation per property, each carried to a confirmed ITN and a reserved unit.
5.  **Backfill — smaller than it looks.** There is currently **one member** in Memberstack, so this is a manual copy rather than a migration. The real seed is the CMS: every unit flagged `sold` or `reserved` becomes a `confirmed` row, so the admin view has true inventory from the first hour. Reconcile against the Payfast dashboard before signing it off.
6.  **Cutover.** Point the live `notify_url` at Xano, switch reads to Xano, keep the old code behind `?legacy=1` for a week. The legacy *field-name* shim from layer 07 stays on well past this point — it retires per form, on its owners' timetable, not yours. Then stop writing metadata; after two clean weeks, delete the metadata fields. Rollback at any point is: revert the notify_url, revert the jsDelivr tag to the previous release.

> **Cutover window**
>
> Do the notify_url switch when no reservation is mid-flight — early morning, and check for `awaiting_payment` or `awaiting_clearance` rows first. An ITN arriving during the switch is a payment nobody's system hears about, and Payfast's retries won't reach an endpoint that isn't listening yet.

11 ·

## 11 · Test matrix & known traps

— *before go-live*

### Must pass

| Case                                                                | Expected                                                                                                                                          |
|---------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| Card success, R5.00 sandbox                                         | ITN validates, reservation `confirmed`, unit `reserved`, email out                                                                                |
| Instant EFT → `PENDING` then `COMPLETE` hours later                 | Hold survives; second ITN confirms; no duplicate confirmation email                                                                               |
| Same ITN posted twice                                               | Second is logged, marked duplicate, ignored; 200 returned                                                                                         |
| Hidden amount field edited in devtools before submitting to Payfast | Irrelevant — the browser no longer supplies the amount; the signature is built from the CMS value                                                 |
| ITN with `amount_gross` reduced by R1                               | Rejected, sales alerted, reservation untouched                                                                                                    |
| ITN with a broken signature                                         | Rejected and logged with `signature_valid = false`                                                                                                |
| ITN from an unlisted IP                                             | Rejected before any state change                                                                                                                  |
| Two browsers hold the same unit simultaneously                      | One wins; the other gets 409 and a clear message                                                                                                  |
| Timer hits zero while the Payfast tab is open                       | Payment still confirms if the ITN arrives — confirm beats expire, and the expiry task skips `awaiting_payment` rows younger than the grace window |
| Resume link opened on another device                                | Cart rehydrates, timer shows real remaining time                                                                                                  |
| Resume link after the unit was sold                                 | Honest message, alternatives offered, no crash                                                                                                    |
| Add-on with a `dependancy` added alone                              | 422 with a readable reason, UI explains it; parent removal takes the child with it                                                                |
| Sales adds an add-on to a paid reservation                          | Total rises, `balance_state` flips to `due`, event logged with the reason and who did it                                                          |
| Sales removes an add-on worth more than the fee paid                | `balance_state` = `refund_due`, flagged for a human — no automatic Payfast refund                                                                 |
| Illegal stage jump (reserved → registered)                          | Rejected; only legal transitions are offered in the UI and enforced in Xano                                                                       |
| Buyer abandons at the qualifier step                                | Reservation and hold survive; recovery email goes out; the answers given so far are saved                                                         |
| Payment confirms for an email that already has a member account     | Plan attached to the existing member, no duplicate; repeat investors are common                                                                   |
| Buyer opens the receipt link without ever setting a password        | Full receipt renders; portal features prompt to set a password rather than blocking                                                               |
| Add-on tagged `portal` appears in the reservation flow              | It doesn't — the step 3 endpoint filters on `timing = reservation`                                                                                |
| Sales role attempts a cancellation                                  | 403 from Xano, not just a hidden button                                                                                                           |
| Unit price edited in the CMS while a reservation is live            | Cache updates; the reservation keeps its snapshot price; Payfast is charged the snapshot                                                          |
| Xano writes `reserved` back, Webflow fires a webhook                | `sync_hash` matches, webhook dropped, no loop                                                                                                     |
| Webflow API down when a payment confirms                            | Reservation still confirms, write-back queued and alerted, 200 still returned to Payfast                                                          |
| Unit deleted from the CMS while held                                | Hold survives on the snapshot; admin is alerted; reconcile flags the orphan                                                                       |
| Same unit number exists on Polaris and Sanford                      | Both hold independently — the key is the Webflow item ID, not the number                                                                          |
| Eridanus unit reserved                                              | Sync reads the legacy collection via `wf_units_collection_id`; flow is identical                                                                  |
| A property left with `use-live-payments` off                        | Checkout signs against sandbox and takes no real money — surface it loudly in the admin view                                                      |

### Traps worth naming

- **The passphrase.** It must match the Payfast dashboard exactly — set means include it, blank means omit the parameter entirely rather than sending an empty one. This single mismatch produces total, silent payment failure.
- **Raw body vs parsed input.** Covered above and worth repeating: rebuild the ITN signature from the raw body, in received order.
- **Floats.** Everything in integer cents in the database; format to two decimals only when handing an amount to Payfast.
- **Timezones.** Store UTC everywhere, render SAST. Nudge quiet hours and the daily digest are the places this will bite.
- **Rate limits.** Put Xano rate limiting on every `public/` endpoint — they're unauthenticated and the events endpoint in particular is an open target.
- **PII.** Reservations now hold names, emails, phone numbers and payment records in one place. POPIA applies: restrict admin endpoints by role, keep the raw ITN log out of any client-facing response, and agree a retention period for abandoned reservations.

### Suggested build order

1.  Schema + `recalculate_totals` + the hold endpoint with its unique-index race test.
2.  Checkout signing + the ITN endpoint, proven against sandbox until every row in the matrix passes.
3.  Front-end modules, replacing the current flow step by step on `/reserve-v2`.
4.  Events and touchpoint tracking — cheap to add, and you want the funnel data from day one, not retrofitted.
5.  Expiry task, then recovery nudges, then the admin view.
6.  Shadow write, backfill, cutover.

12 ·

## 12 · Timeline & cost

— *~6 weeks*

### The Xano workspace question, priced

Good news from the correction: because units live in Webflow, this schema joins nothing that already exists in Xano. It's self-contained, so it can go wherever there's room — the constraint that would have forced a specific workspace doesn't apply. Xano's tiers are quoted in workspaces; Essential includes 3 and caps background tasks at 10, Pro includes 5 with unlimited tasks. Converted at **R16.13 / \$1** (20 Aug 2026); headline prices are annual billing, monthly runs higher.

| Option                              | Extra per month | What you get                                                                                                      | Verdict                              |
|-------------------------------------|-----------------|-------------------------------------------------------------------------------------------------------------------|--------------------------------------|
| **A · Share an existing workspace** | R0              | `res_*` tables and a `heartland/` API group alongside what's already there                                        | `start here`                         |
| **B · Buy a 4th workspace**         | ~\$29 · R470    | Clean separation — its own branches, backups and blast radius. No downside now that nothing needs to join across. | `worth it if the shared one is busy` |
| **C · Essential → Pro**             | ~\$139 · R2,240 | 5 workspaces, **unlimited background tasks**, more CPU, autoscale available                                       | `only if tasks or CPU bite`          |
| **D · CPU boost add-on**            | ~\$70 · R1,130  | Second CPU on the current plan                                                                                    | `cheaper than C for a CPU problem`   |

> **The number that actually decides this**
>
> **Launch day, if you ever run one.** A first-come-first-served release (layer 01) puts hundreds of concurrent requests through one CPU in a single minute. That's the one scenario where option C or D stops being a judgement call — schedule the upgrade a week before, and drop back afterwards if you don't need it. **Background tasks.** This build adds four — `expire_holds`, `recovery_nudges`, `daily_digest` and the nightly `cms_reconcile`. Essential caps you at ten. Count what's already running before you plan anything else, because `expire_holds` not firing on schedule is a unit sitting locked while a buyer walks away. If you're at seven or eight, the Pro upgrade isn't a preference any more. Everything else — workspace tidiness, CPU headroom — is worth deciding on a graph after launch, not now.

### Running cost, once live

Monthly, in rand, on top of what you already pay for Webflow and Memberstack. At **10–20 units per property** — 30–60 units of total lifetime inventory across all three — every usage-based limit in this stack is irrelevant: Make ops, Memberstack members, Xano records, WhatsApp sends and Webflow API calls all sit far below anything chargeable. The figures below are the ceiling, not the expectation.

| Line                         | Per month        | Basis                                                                                                                                    |
|------------------------------|------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| Xano — option A              | R0               | Inside your existing plan                                                                                                                |
| GitHub + jsDelivr            | R0               | Public repo, free CDN                                                                                                                    |
| Make                         | R0               | Phase 1 retires the one scenario it uses — Xano writes to the CMS directly. Keep the account for later notification work if you want it. |
| Transactional email          | R0 – R250        | Free tier covers this volume on most providers                                                                                           |
| Sales console                | R0               | Built on the stack you already have. Wized instead would be ~R470–R630/mo forever.                                                       |
| WhatsApp templates           | R0 – R60         | A few dozen nudges; utility templates are cheap, marketing ~R1.40 each, replies inside the 24-hour window free                           |
| **Your added platform cost** | **~R230 – R720** | Everything above                                                                                                                         |
| Payfast — card               | 2.9% + R1        | Client's cost, not yours. On a R25,000 deposit: ~R726                                                                                    |
| Payfast — Instant EFT        | ~1.5%            | Same deposit: ~R375                                                                                                                      |
| Chargeback                   | R250             | Per dispute                                                                                                                              |

> #### Worth telling the client
>
> On deposits this size the payment method is worth more than the entire platform bill. Defaulting the Payfast method selector to Instant EFT and framing card as the fallback saves roughly **R350 per reservation** — across 30–60 units that's R10,000–R21,000 over the project, against a stack that costs a few hundred rand a month to run. Design the payment step accordingly.

### Build effort

| Layer                                                                                | Hours           | Risk                                                                            |
|--------------------------------------------------------------------------------------|-----------------|---------------------------------------------------------------------------------|
| 01 · Journey rework — qualifier step, add-on split, screen consolidation             | 8 – 12          | Low build, high leverage. Partly offset by the confirmation screens you delete. |
| 02 · Schema, properties config, totals function, atomic hold                         | 10 – 12         | Low — but test the race properly                                                |
| 03 · Webflow sync: webhooks, caches, reconcile, write-back                           | 12 – 16         | Medium                                                                          |
| 04 · API surface, ~22 endpoints                                                      | 16 – 20         | Low, just volume                                                                |
| 05 · Memberstack exchange, claim, auto-provisioning                                  | 6 – 8           | Low                                                                             |
| 06 · Payfast signing + ITN + sandbox                                                 | 12 – 16         | **High** — signature ordering eats days if it goes wrong                        |
| 07 · Front-end modules, Designer wiring, availability overlay, legacy field-map shim | 25 – 31         | Medium — biggest single block                                                   |
| 08 · Tasks, nudges, Make wiring                                                      | 10 – 12         | Medium                                                                          |
| 09 · Sales console — 3 screens, stages, balance, roles                               | 22 – 30         | Medium; +2 h for the CSV/sheet export                                           |
| 10 · Sandbox rehearsal, CMS-seeded backfill, cutover                                 | 5 – 7           | Lighter than usual — one member, no live volume to reconcile                    |
| 11 · Test matrix and the fixes it produces                                           | 12 – 16         | Medium                                                                          |
| Contingency @ 15%                                                                    | 21 – 27         | Not optional on a payment flow                                                  |
| **Total**                                                                            | **159 – 206 h** | Call it ~182 hours                                                              |

### Nine-week schedule

At roughly 20 focused hours a week alongside other client work. Full-time it compresses to about five weeks; at 15 hours a week it stretches to twelve.

| Week | Work                                                                                                                           | Done when                                                                                |
|------|--------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| 0    | **Sign off the journey** — screen order, the qualifier questions, and which add-ons are `reservation` vs `portal` per property | The client has agreed the four questions and tagged the add-ons in the CMS               |
| 1    | Schema, `res_properties` seeded for all three properties, totals function, hold endpoint                                       | Two browsers race for one unit; one gets a 409                                           |
| 2    | Webflow sync — webhooks, caches, nightly reconcile, hash guard                                                                 | Edit a price in the Designer, see it in Xano; write-back sets `reserved` without looping |
| 3    | Rest of the API surface, availability endpoint, Memberstack token exchange                                                     | Full reservation lifecycle drivable from Postman                                         |
| 4    | Checkout signing + ITN endpoint against the Payfast sandbox                                                                    | Every row of the layer 11 matrix passes                                                  |
| 5    | Front-end modules on `/reserve-v2`, availability overlay, timer, add-ons, tracking                                             | Sandbox reservation completes end to end in the browser                                  |
| 6    | Expiry task, recovery nudges, sales alerts                                                                                     | An expired hold releases its unit without anyone watching                                |
| 7    | Sales console — pipeline table, detail drawer, add-ons editor, balance                                                         | Sales can change an add-on and see the balance it creates                                |
| 8    | Stage machine, Today screen, roles, CSV export. **Train the team on real data.**                                               | Two agents run a live deal through the stages without asking you                         |
| 9    | Sandbox rehearsal per property, CMS-seeded backfill, cutover, monitor                                                          | Live ITN hitting Xano, legacy path parked behind `?legacy=1`                             |

> **Sequencing that saves you a week**
>
> Two things buy back time. Build the sync in week 2, before the API: every later layer reads from the caches, so a sync you trust makes weeks 3–5 straightforward instead of speculative. And train sales in week 8 on rehearsal data, not after cutover — the questions they ask are usually a day of changes, and you want that day before go-live rather than during it. With no live volume there is no shadow period to run, which is the one place this project is easier than most.

### Pricing it for the client

| Rate       | 159 h    | 206 h    | Fixed-price suggestion |
|------------|----------|----------|------------------------|
| R650 / h   | R103,350 | R133,900 | R127,000               |
| R850 / h   | R135,150 | R175,100 | R166,000               |
| R1,100 / h | R174,900 | R226,600 | R214,000               |

That's now a big enough number to phase properly. Split at the seams, never inside the payment layer:

| Phase                       | Layers        | Hours     | What the client gets                                                                                                      |
|-----------------------------|---------------|-----------|---------------------------------------------------------------------------------------------------------------------------|
| **1 · Take money reliably** | 01–07, 10, 11 | 106 – 138 | The reservation system across all three properties. Must ship whole — a half-built ITN is worse than what's there now.    |
| **2 · Manage the deals**    | 09            | 22 – 30   | The sales console. Justify it on the fact that phase 1 replaces their manual tracking with a database nobody can yet see. |
| **3 · Recover the rest**    | 08            | 10 – 12   | Abandonment nudges and alerts. Sells itself once phase 1 is logging abandoned reservations with contact details attached. |

Two things worth saying out loud to the client. The Webflow sync layer is roughly R10,000–R18,000 of this, and it's what keeps them editing units and add-ons in the CMS exactly as they do today — moving the catalogue into Xano is cheaper to build and considerably more expensive to live with. And the console is not a nice-to-have bolted on the end: without it, phase 1 puts every reservation into a database only you can read.

> #### The argument for the spend
>
> Scarcity flips the usual argument. With 30–60 units of total inventory at R2m+ each, this isn't a volume play where you optimise a conversion rate — **every single unit is roughly 2% of the entire business**, and there is no second chance at it. So the case rests on three things. A silently lost payment — a buyer whose browser never reached the success page — is one of those units sitting unsold while everyone believes it's taken; the ITN fix pays for the build the first time it happens. A double-sold unit on a scarce release is a refund, a chargeback and a reputational problem in a small market. And an abandoned reservation isn't a lost R500 basket, it's a lost buyer for a unit you have exactly one of: at these volumes, recovering *two or three deals across the whole project* covers everything in this document several times over.

------------------------------------------------------------------------
