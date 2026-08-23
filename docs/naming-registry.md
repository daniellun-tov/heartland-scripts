# Heartland Naming Registry

> What things are called, and why

Seven naming systems meet in this build and you own four of them. This is the lookup: what's claimed, what's frozen, and how to name the next thing so it still fits in six months.

## Who owns what

Drift starts when someone renames across a boundary instead of translating at it. Before naming anything, know which side of the line you're on.

| Namespace                      | Owner       | Rule                                                                          |
|--------------------------------|-------------|-------------------------------------------------------------------------------|
| Xano tables & columns          | `ours`      | Rename freely, following the rules below                                      |
| Xano API paths                 | `ours`      | Rename with a redirect and a deprecation window                               |
| Front-end attributes & modules | `ours`      | Rename freely; the Designer is the only consumer                              |
| Xano event types               | `ours`      | Append only — history is written with the old values                          |
| Payfast field names            | `theirs`    | Spec. Use verbatim, including `m_payment_id`.                                 |
| Webflow form field names       | `theirs`    | Contract with workflows owned by other people. Map, never rename.             |
| Webflow CMS slugs              | `inherited` | Technically yours; renaming breaks bindings across the site. Treat as frozen. |
| Memberstack sub-status values  | `inherited` | The portal reads them. Adopt as-is; extend in the same casing.                |

## Claimed prefixes

Every prefix in the system, and what it means. A new prefix is a design decision, not a convenience — if you're reaching for one, the thing probably belongs under an existing namespace.

- **`res_`** — Xano tables for this build. The workspace is shared, so the prefix is the namespace.
- **`res_catalogue_`** — Xano mirrors of Webflow CMS collections. Read models — never written by hand.
- **`wf_`** — An identifier that belongs to Webflow. `wf_unit_id`, `wf_item_id`.
- **`pf_`** — An identifier that belongs to Payfast. `pf_payment_id`.
- **`data-hl-`** — Front-end binding attributes placed in the Designer.
- **`heartland/`** — API group in Xano, and the folder in `heartland-scripts`.

## The rules

### Tables

`res_` + plural + snake_case. Mirrors add `catalogue_`. Current set, and nothing outside it without a decision:

| Table                  | Holds                                             |
|------------------------|---------------------------------------------------|
| `res_reservations`     | The row. One per reservation attempt.             |
| `res_line_items`       | Add-ons chosen, at snapshot prices                |
| `res_events`           | Append-only touchpoints and audit                 |
| `res_payments`         | Raw ITN log, one row per post received            |
| `res_properties`       | Per-property config, seeded from the CMS          |
| `res_catalogue_addons` | Mirror of the Add-ons collection                  |
| `res_catalogue_units`  | Mirror of the Units collections                   |
| `res_config`           | Feature flags, including the legacy shim switches |
| `res_sync_queue`       | CMS writes that failed and need retrying          |

### Columns

| Kind          | Rule                                                                                            | Example                                  |
|---------------|-------------------------------------------------------------------------------------------------|------------------------------------------|
| General       | snake_case, no abbreviations that aren't already industry words                                 | `last_activity_at`                       |
| Money         | Always `_cents`, always an integer. No floats anywhere near a price.                            | `deposit_cents`                          |
| Percentages   | `_pct`, stored as the number a human would say — 10 means 10%                                   | `deposit_bond_pct`                       |
| Timestamps    | `_at`, stored UTC, rendered SAST                                                                | `confirmed_at`                           |
| Booleans      | Positive phrasing. `is_` for state, `has_` for possession. Never `not_`.                        | `is_selling`                             |
| Foreign ids   | System prefix + what it identifies                                                              | `wf_unit_id`                             |
| Frozen values | A `*_snapshot` json. One lifted out for querying keeps its *plain* name — never `*_snapshot_*`. | `unit_snapshot`, then `unit_price_cents` |
| Counters      | `_count`, never `num_` or `_qty` on a table column                                              | `recovery_sent_count`                    |

### Enums

Two live side by side, in two casings, on purpose.

<table>
<colgroup>
<col style="width: 33%" />
<col style="width: 33%" />
<col style="width: 33%" />
</colgroup>
<thead>
<tr class="header">
<th>Field</th>
<th>Casing</th>
<th>Values</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><code>status</code><br />
payment, ours</td>
<td>snake_case</td>
<td><code>draft</code> · <code>held</code> · <code>awaiting_payment</code> · <code>awaiting_clearance</code> · <code>confirmed</code> · <code>payment_failed</code> · <code>expired</code> · <code>cancelled</code> · <code>refunded</code></td>
</tr>
<tr class="even">
<td><code>sales_stage</code><br />
deal, inherited</td>
<td>kebab-case</td>
<td><code>pre-qualify</code> · <code>sign-otp</code> · <code>pay-deposit</code> · <code>bond-approval</code> · <code>bond-approved</code>, plus additions in the same casing: <code>otp-issued</code> · <code>transfer-lodged</code> · <code>registered</code> · <code>lapsed</code></td>
</tr>
<tr class="odd">
<td><code>event_type</code><br />
ours, append-only</td>
<td>snake_case</td>
<td><code>noun_verbed</code> — the thing, then what happened to it: <code>addon_added</code>, <code>hold_expired</code>, <code>payment_complete</code></td>
</tr>
</tbody>
</table>

> **The exception, written down so nobody "fixes" it**
>
> `sales_stage` keeps kebab-case because the values came from Memberstack and the portal still reads them. Anything you add to that enum takes kebab-case too — a consistent enum in the wrong casing beats a split enum in two casings. If it's ever normalised, it's normalised all at once, with the portal, as its own piece of work.

### API paths

kebab-case nouns, grouped by who may call them. The `res_` prefix is a database concern and never appears in a URL.

| Group                     | Auth                            | Example                          |
|---------------------------|---------------------------------|----------------------------------|
| `/public/`                | None, rate-limited, uuid-scoped | `/public/reservations/{uuid}`    |
| `/member/`                | Xano auth token                 | `/member/reservations`           |
| `/admin/`                 | Token + role check              | `/admin/reservations/{id}/stage` |
| `/auth/`                  | Exchanges a foreign token       | `/auth/memberstack`              |
| `/payfast/` · `/webflow/` | Inbound from that system only   | `/payfast/itn`                   |

### Front end

- Attributes: `data-hl-` + role, kebab-case — `data-hl-bind`, `data-hl-action`, `data-hl-state`.
- Module files: kebab-case, one job each, named for the job not the technology — `field-map.js`, not `utils.js`.
- Storage keys: `hl_` + snake_case, and as few as possible. Currently one: `hl_reservation_uuid`.

## Frozen — map, never rename

> **Changing any of these breaks something you can't see**
>
> **Webflow form field names** feed site-wide webhooks into workflows other people own. **CMS slugs** are bound throughout the Designer and returned by the API. **Memberstack sub-status values** drive the live portal. **Payfast field names** are their spec. All four are translated in `field-map.js` and nowhere else — one file to read when a name looks wrong.

### Known contradictions in the inherited names

Some CMS display names disagree with their slugs, and the slug is what the API returns. Map by slug; put the display name in a comment beside it.

| Slug                | Labelled in the Designer | Actually                                                            |
|---------------------|--------------------------|---------------------------------------------------------------------|
| `floor`             | "Unit Number"            | The unit number, not a floor                                        |
| `unit-number-3`     | "Display Name"           | The display name, not a number                                      |
| `price` / `price-2` | "Price" / "Price (#)"    | Text version, then the numeric one. Always use `price-2` for maths. |
| `garden-info`       | "Balcony Info"           | Balcony                                                             |
| `pool-info`         | "Accessibility Info"     | Accessibility                                                       |
| `deposit`           | "Deposit % - Bond"       | A percentage, not an amount                                         |

### Duplicates and dead keys

- `First Name` / `first-name` / `First-Name` — three spellings of one field across forms and Memberstack. All three map to `first_name`. Check every spelling on any read.
- `Contact Number` / `mobile-number` — both exist, both map to `phone`.
- `Include-bond-cost` — capital I on the Step 2 forms only.
- `luxury-upgrade` — dead. Unmapped, listed in `DEAD_FIELDS`, still rendered so payload shape is unchanged.

## Naming something new

1.  **Does it already exist under another name?** Search the field map first. Most "new" fields are an existing concept arriving from a different system.
2.  **Which side of the boundary is it on?** If any part of the answer is "a system we don't own", it goes in the field map — not into a new column with their spelling.
3.  **Name it for what it is, not where it came from.** `reservation_fee_cents`, not `step3_payment_amount`. The source belongs in the seeding note; the name outlives the source.
4.  **Match the nearest sibling.** A new money column looks like the other money columns. A new event type reads `noun_verbed`. Consistency beats your better idea.
5.  **New prefix? Stop.** Six exist and each earned its place. A seventh needs a reason you could defend to someone reading this in a year.
6.  **Write it here.** A name that isn't in this document is how the next drift starts.

## Renaming something that's live

For names you own. For frozen ones the answer is always "you don't — you map".

1.  **Add, don't replace.** New column or path alongside the old.
2.  **Write both** for one release, so nothing depends on the switchover being instant.
3.  **Move readers one at a time**, most obscure first — the forgotten consumer is always the one you didn't know about.
4.  **Watch a week** with both still live.
5.  **Drop the old one**, and update this page in the same commit.

## Drift smells

No linter, so these are what to notice in review. Each is a symptom of the same thing — a name that was invented instead of looked up.

- **Two names for one concept in the same file.** Usually the second one arrived with a copy-paste.
- **A name that describes its origin.** `make_webhook_field`, `step3_amount` — these date instantly and lie as soon as the source changes.
- **An enum value in the wrong casing.** Nearly always someone adding to `sales_stage` without reading why it's kebab.
- **A `_cents` column holding a decimal.** The name says integer; if it's holding 2.5 the bug is upstream.
- **A new prefix.** See rule 5 above.
- **A field mapped in two places.** Translation lives in `field-map.js`. A second translation somewhere else is a future divergence with a date on it.

Heartland naming registry · 22 Aug 2026. Keep it current in the same commit as the change. Architecture is in the reservation rebuild guide; the full field map is in the phase 1 runbook.
