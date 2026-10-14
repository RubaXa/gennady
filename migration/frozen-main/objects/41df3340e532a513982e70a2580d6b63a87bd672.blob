#!/usr/bin/env bash
# @file: Smart verification gate — auto-discovers npm scripts via heuristic, runs them.
# @consumers: phase agents (STEP_5_VERIFY); orchestrators; CI hooks
# @contract: AX_BASH_NO_SILENT_EMPTY. All discovered gates MUST pass for exit 0.
#            RUN-ALL: every gate executes regardless of previous failures.
#            SUPPRESS-ON-SUCCESS: passing gates produce zero output; only failures are shown.
#            On all-pass: single line "[verify] ALL_GATES_PASS (N/N)". Exit 0.
#            On any-fail: each failed gate dumps its command + exit code + captured output. Exit 1.
#
# Usage:
#   verify.sh <file1> [<file2> ...]
#
# Exit codes:
#   0  — all gates PASS
#   1  — one or more gates failed
#   4  — bad invocation
#   5  — environment failure

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROG="verify"

# -----------------------------------------------------------
# Preflight
# -----------------------------------------------------------

if [[ $# -lt 1 ]]; then
  cat <<EOF
[$PROG] BAD_INVOCATION
  expected: $PROG <file1> [<file2> ...]
  got:      $PROG (no args)
EOF
  exit 4
fi

if ! command -v npm &>/dev/null; then
  echo "[$PROG] ENV_MISSING: npm not in PATH"
  exit 5
fi

if ! command -v node &>/dev/null; then
  echo "[$PROG] ENV_MISSING: node not in PATH"
  exit 5
fi

for file in "$@"; do
  if [[ ! -f "$file" ]]; then
    echo "[$PROG] FILE_NOT_FOUND: $file"
    exit 4
  fi
done

# -----------------------------------------------------------
# Step 1: Discover scripts via heuristic (silent)
# -----------------------------------------------------------

CLASSIFIER="$SCRIPT_DIR/classify-scripts.js"

if [[ ! -f "$CLASSIFIER" ]]; then
  echo "[$PROG] ENV_MISSING: classify-scripts.js not found at $CLASSIFIER"
  exit 5
fi

classification=$(node "$CLASSIFIER" 2>/dev/null) || {
  echo "[$PROG] ENV_FAIL: classify-scripts.js failed"
  exit 5
}

# Extract selected scripts: "cls:name" lines
discovered=$(echo "$classification" | python3 -c "
import json,sys
d=json.load(sys.stdin)
sel=d.get('selected',{})
for cls in ['typecheck','gennady','lint','test','format']:
    v=sel.get(cls,'')
    if v:
        print(f'{cls}:{v}')
" 2>/dev/null)

if [[ -z "$discovered" ]]; then
  echo "[$PROG] NO_SCRIPTS_DISCOVERED"
  exit 0
fi

# -----------------------------------------------------------
# Step 2: Run each gate — accumulate failures, suppress success
# -----------------------------------------------------------

total=0
passed=0
failures=""
FILES=("$@")  # save original file args for file-specific commands

run_cmd() {
  local label="$1"
  local display_name="$2"
  shift 2
  local cmd=("$@")

  total=$((total + 1))

  local output exit_code
  set +e
  output=$("${cmd[@]}" 2>&1)
  exit_code=$?
  set -e

  if [[ $exit_code -eq 0 ]]; then
    passed=$((passed + 1))
    return 0
  else
    failures+=$(printf '\n[%s] ❌ FAIL gate: %s\n  command: %s\n  exit:    %s\n\n--- captured output ---\n%s\n--- end ---\n' "$PROG" "$label" "${cmd[*]}" "$exit_code" "$output")
    return 1
  fi
}

# Run ALL gates regardless of failures
while IFS=: read cls name; do
  case "$cls" in
    typecheck) run_cmd "typecheck" "npm run $name" npm run "$name" || true ;;
    gennady)   run_cmd "gennady DBC lint" "gennady lint ${#FILES[@]} files" npx tsx ~/Developer/gennady/cli/gennady.ts lint "${FILES[@]}" || true ;;
    lint)      run_cmd "lint" "npm run $name" npm run "$name" || true ;;
    test)      run_cmd "test" "npm run $name" npm run "$name" || true ;;
    format)    run_cmd "format check" "npm run $name" npm run "$name" || true ;;
  esac
done <<< "$discovered"

# -----------------------------------------------------------
# Report: suppressed on success, full on failure
# -----------------------------------------------------------

if [[ -n "$failures" ]]; then
  echo "$failures"
  exit 1
fi

echo "[$PROG] ALL_GATES_PASS ($passed/$total)"
exit 0
