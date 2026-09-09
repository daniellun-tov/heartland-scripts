# Test suites

Two families, in one directory and one runner.

**The console suites** (`test-console-*`, `test-editors`, `test-contract`) drive the sales
console with Playwright + Chromium against fixture pages that stub `fetch`.

**The flow suites** (`test-portal`, `test-reserve`, `test-buyer-wired`, `test-buyer`,
`test-entry`, `test-checkout`, `test-v2`, `test-hold-timing`, `test-hold-countdown`) load the
reserve and portal bundles into jsdom and stub `fetch` there. No browser needed.

**Two mirrors** (`test-options`, `test-holds-sweeper`) reproduce a piece of SERVER logic
locally. See the warning on them below.

```
npm install --prefix tests      # once
./tests/run.sh                  # all suites
./tests/run.sh types inv        # just those
```

## Why these are in the repo

They were not, until 6 Sep. They lived in a scratch directory on a session container, which
meant roughly a thousand assertions — most of the behavioural specification of this console —
were one container reclaim away from being gone, and nobody but the session that wrote them
could run them. That was the highest-consequence, lowest-effort thing outstanding on the
project for about a week.

**And the move was only half done, which nobody noticed for three days.** The console suites
came across on 6 Sep; the eleven suites covering the reserve flow, the portal, checkout, the
buyer fields and the holds — **765 more assertions, `test-portal` alone 417** — stayed in
`/tmp` and were still there on 9 Sep. They were found only because a stale copy of a console
suite answered a question with an out-of-date result. Ported the same day.

The lesson is not "move the tests". It is that **a scratch copy which still runs is worse
than one that is gone**, because it answers. If a suite is worth keeping it goes here, and
nothing outside this directory should be runnable at all.

## What they test, and what they do not

Every suite stubs `fetch`. A green run says the console does the right thing **with the
answers it is given**. It says nothing whatever about whether the server gives those answers.

The server has its own suites, which live in Xano and are run from there:
`run_smoke_tests`, `run_smoke_writes`, `run_smoke_types`, `run_smoke_register`,
`run_smoke_fields`, `run_smoke_phases`, `run_smoke_reserve`. `run_smoke_all` runs the
read-only ones nightly.

**The gap between the two was a known hole until 6 Sep, and `test-contract.js` now closes the
half of it that actually bit.** A stub is a claim about the real thing and it can be wrong;
when a read changes shape, the fixture has to change with it or the suite starts grading the
fixture. That is not hypothetical — the eight spec figures moved from the variant to the type,
every server suite stayed green, every console suite stayed green, and the fixture went on
emitting a field the server had stopped returning.

`tests/fixtures/server-contract.json` is the SHAPE of the five reads the console renders
from — paths and kinds, no values, generated from the live server by the Xano function
`emit_console_contract` (fn 172). `test-contract.js` shapes the fixture's answers the same way
and compares. The two directions are not treated equally: a path the FIXTURE returns and the
server does not is a hard failure, because that is the fixture lying; a path the server returns
and the fixture does not is reported, because a fixture is allowed to be a subset. It found a
real defect on its first run — `res_development_fields.options` came back as `{}` where the
console renders a list.

**Regenerate the contract only when a read changes shape on purpose**, in the same commit as
the fixture change: `runWorkspaceFunction emit_console_contract` (workspace 5, branch v1).

What it still does not cover: values (deliberately — the reservations read carries real
buyers), the write paths, and anything under a path where the server's first array element is
null, since a contract that collapses arrays to their first element has nothing to say about
what lies beneath one. Paths under `units[].attributes` and `units[].field_values` are keyed by
data rather than schema, so they fold to `*` and their kinds are not compared — an array
becoming an object in there is not caught. Both are recorded gaps, not oversights.

## Fixture rules, each paid for once

- `tests/fixtures/heartland-console.js` is a **copy**, made by `run.sh` on every run and
  gitignored. Editing the bundle and running the suite without copying grades the previous
  version — this happened, and the run came back green.
- **Recompute derived numbers in the fixture** rather than freezing them. A frozen total lets
  the console show a stale figure and the test still pass.
- **Mirror the server's actual refusals.** The variant writer refuses a from-price because it
  is derived; the fixture refuses it too. Otherwise the test proves the fixture.
- **Anchor every query-param switch on `[?&]`** — `?cmsfail=1` contains `fail=1`.
- **Never use a fixed wait for a round trip.** Wait on the thing.
- `textContent` reads a hidden element perfectly well. Assert visibility with
  `getBoundingClientRect().height > 0` when the point is that something is *shown*.
- Assert the **request body**, not just the screen.

## The two mirrors are not the authority

`test-options` reproduces the `/public/options` price resolver and `test-holds-sweeper`
reproduces `release_expired_holds` (Xano fn 179), because a build session cannot reach Xano
over HTTP. They are genuinely useful — 41 assertions over branch shapes that are awkward to
provoke against live data — and they carry one specific danger: **a green run proves the copy
behaves, not that the deployed function does.** When the server's rule changes, these files
do not find out. Change both in the same commit, or the mirror becomes a confident lie. Each
one says so in its own header, and names its authority.

## Running time

`test-portal` is 417 assertions and takes a couple of minutes on its own; a full `run.sh` is
no longer a fast loop. Name the suites you want while iterating — `./tests/run.sh v2 checkout`
— and run the lot before pushing.

## A green suite is evidence of nothing until a mutation has made it red

Every assertion added should be paired with a change to the code that makes it fail. The
inheritance block in `test-console-types.js` was written against eight of them — an inherited
figure prefilled as a value, an inherited box that looks typed, an empty box omitted rather
than sent as a clear, the module flag hard-coded on, the type form drawing placeholders, the
tidy prompt drawn as an error, two forms open at once, and the row summary reading the
variant's own columns. All eight went red.

**A port needs its own mutation, and it is a different one.** The assertions in a ported suite
were proved when they were written; what is unproved is that the file still READS anything.
A path that quietly resolves to nothing gives a green run for a suite that is testing air. So
each of the eleven was checked by emptying the bundle it loads and confirming it went red —
`heartland-reserve.js` for the four flow suites, `hl-buyer-fields.js` for three, and so on
down to `fixtures/holds-lambda.js` for the sweeper. All eleven went red, and back to green
when the file was restored.
