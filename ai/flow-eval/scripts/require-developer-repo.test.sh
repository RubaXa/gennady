#!/usr/bin/env bash
# @file: Both-outcomes proof for require-developer-repo.sh — a path under $HOME/Developer/ must exit 0
#   silently; a path outside it must exit non-zero with an error message that mentions "~/Developer".
#   Bash self-test, outside `npm run check`; run directly:
#     bash ai/flow-eval/scripts/require-developer-repo.test.sh
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
guard="$script_dir/require-developer-repo.sh"

pass=0
fail=0

assert_pass() {
  local label="$1" cmd_output
  shift
  if cmd_output="$("$@" 2>&1)"; then
    if [ -z "$cmd_output" ]; then
      echo "PASS: $label (exit 0, silent)"
      pass=$((pass + 1))
    else
      echo "FAIL: $label — exit 0 but printed output: $cmd_output"
      fail=$((fail + 1))
    fi
  else
    echo "FAIL: $label — expected exit 0, got exit $?"
    fail=$((fail + 1))
  fi
}

assert_fail_with_developer_mention() {
  local label="$1" path="$2" output status
  output="$("$guard" "$path" 2>&1)"
  status=$?
  if [ "$status" -eq 0 ]; then
    echo "FAIL: $label — expected non-zero exit, got 0"
    fail=$((fail + 1))
    return
  fi
  if printf '%s' "$output" | grep -q '~/Developer'; then
    echo "PASS: $label (exit $status, message mentions ~/Developer)"
    pass=$((pass + 1))
  else
    echo "FAIL: $label — exit $status but message does not mention ~/Developer:"
    echo "$output" | sed 's/^/    /'
    fail=$((fail + 1))
  fi
}

echo "== Case 1: path under \$HOME/Developer/ → exit 0, silent =="
assert_pass "existing subdir under ~/Developer" "$guard" "$HOME/Developer/gennady"
assert_pass "not-yet-existing subdir under ~/Developer" "$guard" "$HOME/Developer/does-not-exist-yet-xyz"
assert_pass "\$HOME/Developer itself" "$guard" "$HOME/Developer"

echo
echo "== Case 2: path outside \$HOME/Developer/ → non-zero exit, message mentions ~/Developer =="
assert_fail_with_developer_mention "absolute path outside ~/Developer" "/tmp/some-other-repo"
assert_fail_with_developer_mention "home dir but not under Developer" "$HOME/other-projects/some-repo"
assert_fail_with_developer_mention "root-level path" "/Users/someone-else/Developer-lookalike/repo"

echo
echo "== Case 3: usage error (no argument) → non-zero exit =="
if "$guard" >/dev/null 2>&1; then
  echo "FAIL: missing argument — expected non-zero exit, got 0"
  fail=$((fail + 1))
else
  echo "PASS: missing argument (non-zero exit)"
  pass=$((pass + 1))
fi

echo
echo "──────────────────────────────"
echo "pass=$pass fail=$fail"
if [ "$fail" -eq 0 ]; then
  echo "SELF-TEST: PASS"
  exit 0
else
  echo "SELF-TEST: FAIL"
  exit 1
fi
