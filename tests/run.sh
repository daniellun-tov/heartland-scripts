#!/usr/bin/env bash
# THE CONSOLE SUITES. Playwright + Chromium against the fixture pages, plus one jsdom suite.
#
#   npm install --prefix tests     once
#   ./tests/run.sh                 all suites
#   ./tests/run.sh types inv       just those
#
# THE COPY IS THE POINT. The fixture page loads ./heartland-console.js out of tests/fixtures,
# so without this step the suite grades whatever was last left there - which is how a run once
# came back green for a file that had already been edited. The bundle is copied in on every
# run, from the repo, and the copy is gitignored.
#
# A SUITE THAT CRASHES IS A FAILURE, NOT A SILENCE. The first version of this script looked
# only for the string FAIL, so a suite that died on a missing module printed a stack trace and
# the run still ended "all suites green" - a monitor that reassures you while it is broken,
# which is the one thing a test runner must never do. Exit status and a missing summary line
# both count as failure now.
#
# WHAT THESE DO NOT TEST: the server. Every one of them stubs fetch, so a suite going green
# says the console does the right thing with the answers it is given - never that the server
# gives them. The server has its own suites, in Xano: run_smoke_tests, run_smoke_writes,
# run_smoke_types, run_smoke_register, run_smoke_fields, run_smoke_phases, run_smoke_reserve.
# Treat the gap between the two as a known hole, not a solved problem.
set -u
cd "$(dirname "$0")"

# Resolved rather than looked for on disk: either may be installed here, at the repo root,
# or globally, and all three are fine.
for m in playwright jsdom; do
  if ! node -e "require.resolve('$m')" >/dev/null 2>&1; then
    echo "Cannot resolve '$m'. Run:  npm install --prefix tests"
    echo "(a global install works too - this checks resolution, not a directory)"
    exit 1
  fi
done

cp ../heartland-console.js fixtures/heartland-console.js || exit 1

if [ "$#" -gt 0 ]; then
  SUITES=()
  for a in "$@"; do
    if [ -f "test-$a.js" ]; then SUITES+=("test-$a.js")
    elif [ -f "test-console-$a.js" ]; then SUITES+=("test-console-$a.js")
    else echo "no such suite: $a"; exit 1; fi
  done
else
  SUITES=(test-*.js)
fi

fails=0
for f in "${SUITES[@]}"; do
  printf '%-26s' "${f%.js}"
  out="$(node "$f" 2>&1)"; status=$?
  line="$(printf '%s' "$out" | grep -E '[0-9]+ *(passed|/[0-9]+ passed)' | tail -1 | sed 's/^ *//')"
  bad=""
  [ "$status" -ne 0 ] && bad="exit $status"
  [ -z "$line" ] && bad="${bad:+$bad, }no summary - the suite did not finish"
  printf '%s' "$out" | grep -qE '^ *FAIL ' && bad="${bad:+$bad, }assertions failed"
  if [ -n "$bad" ]; then
    fails=$((fails+1))
    echo "  ${line:-(none)}   <-- $bad"
    printf '%s\n' "$out" | grep -E '^ *FAIL ' | sed 's/^ */      /'
    [ -z "$line" ] && printf '%s\n' "$out" | head -6 | sed 's/^/      /'
  else
    echo "  $line"
  fi
done
echo
if [ "$fails" -gt 0 ]; then echo "$fails suite(s) with failures"; exit 1; fi
echo "all suites green"
