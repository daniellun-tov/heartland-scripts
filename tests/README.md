# Console test suites

Playwright + Chromium against fixture pages that stub `fetch`, plus one jsdom suite that
loads the built bundle directly.

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

## What they test, and what they do not

Every suite stubs `fetch`. A green run says the console does the right thing **with the
answers it is given**. It says nothing whatever about whether the server gives those answers.

The server has its own suites, which live in Xano and are run from there:
`run_smoke_tests`, `run_smoke_writes`, `run_smoke_types`, `run_smoke_register`,
`run_smoke_fields`, `run_smoke_phases`, `run_smoke_reserve`. `run_smoke_all` runs the
read-only ones nightly.

**The gap between the two is a known hole, not a solved problem.** A stub is a claim about the
real thing and it can be wrong; when a server refusal changes, the fixture has to change with
it or the suite starts grading the fixture.

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

## A green suite is evidence of nothing until a mutation has made it red

Every assertion added should be paired with a change to the code that makes it fail. The
inheritance block in `test-console-types.js` was written against eight of them — an inherited
figure prefilled as a value, an inherited box that looks typed, an empty box omitted rather
than sent as a clear, the module flag hard-coded on, the type form drawing placeholders, the
tidy prompt drawn as an error, two forms open at once, and the row summary reading the
variant's own columns. All eight went red.
