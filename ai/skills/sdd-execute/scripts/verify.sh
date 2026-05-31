#!/usr/bin/env bash
# @file: Smart verification gate — auto-discovers npm scripts via heuristic, runs them.
# @consumers: phase agents (STEP_5_VERIFY); orchestrators; CI hooks
# @contract: AX_BASH_NO_SILENT_EMPTY. All discovered gates MUST pass for exit 0.
#
# Usage:
#   verify.sh <file1> [<file2> ...]
#
# Exit codes:
#   0  — all gates PASS
#   1  — gate failed
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
# Step 1: Discover scripts via heuristic
# -----------------------------------------------------------

CLASSIFIER="$SCRIPT_DIR/classify-scripts.js"

if [[ ! -f "$CLASSIFIER" ]]; then
  echo "[$PROG] ENV_MISSING: classify-scripts.js not found at $CLASSIFIER"
  exit 5
fi

echo "[$PROG] discovering scripts..."

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
  echo "$classification" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for s in d['scripts']:
    if s['classes']!=['unknown']:
        print(f'  {s[\"name\"]}: {s[\"classes\"]}')
" 2>/dev/null
  exit 0
fi

# Display discovered
echo "$discovered" | while IFS=: read cls name; do
  echo "  discovered: $cls → npm run $name"
done

# -----------------------------------------------------------
# Step 2: Run each gate
# -----------------------------------------------------------

total=0
passed=0
FILES=("$@")  # save original file args for file-specific commands

run_cmd() {
  local label="$1"
  local display_name="$2"
  shift 2
  local cmd=("$@")

  total=$((total + 1))

  local start_ms
  start_ms=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || echo 0)

  local output exit_code
  set +e
  output=$("${cmd[@]}" 2>&1)
  exit_code=$?
  set -e

  local end_ms elapsed
  end_ms=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || echo 0)
  elapsed=$((end_ms - start_ms))

  if [[ $exit_code -eq 0 ]]; then
    passed=$((passed + 1))
    echo "  ✅ $display_name (${elapsed}ms)"
    return 0
  else
    cat <<EOF

[$PROG] ❌ FAIL gate: $label
  command: ${cmd[*]}
  exit:    $exit_code
  time:    ${elapsed}ms

--- captured output ---
$output
--- end ---

EOF
    return 1
  fi
}

# Run in order
while IFS=: read cls name; do
  case "$cls" in
    typecheck) run_cmd "typecheck" "npm run $name" npm run "$name" || exit 1 ;;
    gennady)   run_cmd "gennady DBC lint" "gennady lint ${#FILES[@]} files" npx tsx cli/gennady.ts lint "${FILES[@]}" || exit 1 ;;
    lint)      run_cmd "lint" "npm run $name" npm run "$name" || exit 1 ;;
    test)      run_cmd "test" "npm run $name" npm run "$name" || exit 1 ;;
    format)    run_cmd "format check" "npm run $name" npm run "$name" || exit 1 ;;
  esac
done <<< "$discovered"

# -----------------------------------------------------------
# All gates PASS
# -----------------------------------------------------------

cat <<EOF
[$PROG] ALL_GATES_PASS ($passed/$total)
EOF
exit 0
