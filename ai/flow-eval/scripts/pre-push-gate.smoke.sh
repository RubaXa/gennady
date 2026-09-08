#!/bin/sh
# @file: Proof script for the pre-push gate (D-54/GAP-B-2). Demonstrates end-to-end that
#   `gate:sdd-check-baseline` (invoked from `scripts/git-hooks/pre-push`) actually distinguishes a
#   genuine regression from the known baseline: it must fail with the offending (code, file) named
#   when one known error is removed from a working copy of the baseline, and it must pass clean
#   against the real, untouched baseline. Complements — does not replace — the pure fixture-based
#   unit test at ai/flow-eval/scripts/__tests__/sdd-check-baseline-compare.test.ts, which exercises
#   only the compare library, never a real `sdd-check --all .` run.
# @invariant Not a `*.test.ts` file: scripts/test-topology.ts (UNIT_ROOTS) only auto-discovers
#   `*.test.ts`, so this cannot be picked up by `npm test` regardless of naming. This mirrors the
#   existing `ai/flow-eval/scripts/require-developer-repo.test.sh` precedent already in this repo —
#   a standalone proof script invoked by name, not part of the npm test topology.
# @usage: bash ai/flow-eval/scripts/pre-push-gate.smoke.sh
# @tasks: N/A
set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/../../.." && pwd)
BASELINE="$ROOT/ai/flow-eval/.baseline/sdd-check-227c03a8.json"
GATE="$ROOT/ai/flow-eval/scripts/sdd-check-zero-new-error.ts"

fail() {
  echo "SMOKE FAIL: $1" >&2
  exit 1
}

[ -f "$BASELINE" ] || fail "baseline not found: $BASELINE"
[ -f "$GATE" ] || fail "gate script not found: $GATE"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

MUTATED="$TMP_DIR/baseline-missing-one-error.json"

# Remove exactly one error-severity finding from a copy of the baseline, so the fresh run on this
# tree must report it as a NEW error (proves the gate keys on (code,file), not just a bare total).
REMOVED_JSON=$(node -e "
const fs = require('node:fs');
const path = '$BASELINE';
const outPath = '$MUTATED';
const b = JSON.parse(fs.readFileSync(path, 'utf8'));
const idx = b.findings.findIndex((f) => f.severity === 'error');
if (idx < 0) { console.error('no error-severity finding in baseline'); process.exit(1); }
const removed = b.findings[idx];
b.findings = b.findings.slice(0, idx).concat(b.findings.slice(idx + 1));
fs.writeFileSync(outPath, JSON.stringify(b, null, 2));
process.stdout.write(JSON.stringify(removed));
")
REMOVED_CODE=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).code)" "$REMOVED_JSON")
REMOVED_FILE=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).file)" "$REMOVED_JSON")
echo "removed from working copy: code=$REMOVED_CODE file=$REMOVED_FILE"

echo "== 1/2: gate against a baseline missing one known error (expect exit 1, named NEW ERROR) =="
set +e
OUT1=$(node --import tsx "$GATE" --baseline "$MUTATED" --root . 2>&1)
CODE1=$?
set -e
echo "$OUT1"
[ "$CODE1" -eq 1 ] || fail "expected exit 1 against the mutated baseline, got $CODE1"
echo "$OUT1" | grep -q "NEW ERROR:" || fail "expected a 'NEW ERROR:' line in the gate's output"
echo "$OUT1" | grep -q "$REMOVED_CODE" || fail "expected the removed code ($REMOVED_CODE) to be named in the failure output"
echo "$OUT1" | grep -q "$REMOVED_FILE" || fail "expected the removed file ($REMOVED_FILE) to be named in the failure output"

echo "== 2/2: gate against the full, untouched baseline (expect exit 0) =="
set +e
OUT2=$(node --import tsx "$GATE" --baseline "$BASELINE" --root . 2>&1)
CODE2=$?
set -e
echo "$OUT2"
[ "$CODE2" -eq 0 ] || fail "expected exit 0 against the full baseline, got $CODE2"

echo "SMOKE OK: the gate fails and names the regression when a known error is missing from the baseline, and passes clean on the full baseline."
