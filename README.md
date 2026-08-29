# heartland-scripts

Front-end code for Heartland Property Developers, served to the Webflow sites by
jsDelivr. **Everything at the top level of this repo is live the moment it is pushed
and the CDN cache clears.**

| File | Loaded by | Built from |
|---|---|---|
| `heartland-reserve.js` | the brochure sites, `/reserve-flow`, `/reserve-v2`, `/portal`, `/portal-login`, `/portal-order`, `/portal-documents` | hand-written; this file is the source |
| `heartland-console.js` | `/sales-console` | **built** — see below |

Anything under `src/` is source and tooling. Nothing loads it; it is here so the build
is reproducible by whoever picks this up next.

## The console is built, the reserve flow is not

`heartland-console.js` is generated. Do not edit it — the header says so too, and an edit
would be silently overwritten by the next build.

```
src/heartland-sales-console.html   the source you edit; opens in a browser as-is
src/build_console.py               the build
heartland-console.js               the output, and the only file the CDN serves
```

```sh
python3 src/build_console.py
```

The HTML stays the source of truth because it is the only form you can open and click
through without a build. The build lifts its `<template>` into a JS string and swaps the
three-line bootstrap that read that template out of the page. It fails loudly rather than
guessing if either boundary has moved.

## After any push

Purge, then **verify what the CDN actually returns**:

```
https://purge.jsdelivr.net/gh/daniellun-tov/heartland-scripts@main/heartland-console.js
https://purge.jsdelivr.net/gh/daniellun-tov/heartland-scripts@main/heartland-reserve.js
```

> A purge reporting `finished` is **not** proof. On 25 Aug 2026 a push sat behind the
> jsDelivr cache for over an hour *including after a successful purge*, and the reserve
> flow rendered blank the whole time. Open the `cdn.jsdelivr.net` URL and look for the
> change you just made.

Both files are pinned to `@main`, so a push reaches production without a Webflow publish.
That is the point, and it is also the risk: **there is no staging.** Run the test suite
before pushing.

## Tests

The suites are not in this repo yet. `test-editors.js` runs the console in jsdom against
the **built bundle** — not the HTML — so a build that dropped the template or broke the
bootstrap fails the suite rather than the sales team's morning.
