#!/usr/bin/env bash
# @file: Run gennady lint on phase artifacts; parse output for success/failure (gennady exit-code unreliable).
# @consumers: phase agents (STEP_5_VERIFY); audit subagents (STEP_1 pre-pass cross-check)
# @contract: AX_BASH_NO_SILENT_EMPTY — never produces empty stdout. On miss → actionable instruction.
#
# Why this wrapper exists:
#   - gennady CLI lives outside the project (canonical: /Users/k.lebedev/Developer/gennady/cli/gennady.ts).
#   - gennady requires `node --experimental-strip-types` (Node 22+) — the bare `node` invocation is non-obvious.
#   - gennady returns exit code 0 even when lint reports errors (the failure signal is the literal token
#     "[linting → failed]" in stdout). We must parse output, not trust exit code.
#   - Success signal is the literal token "[linting → clean] no errors".
#
# Usage:
#   lint-artifacts.sh <file1> [<file2> ...]
#
# Exit codes:
#   0 — all files clean (gennady output contains "[linting → clean]" and NOT "[linting → failed]")
#   1 — gennady CLI not found / unable to invoke
#   2 — lint reported errors (one or more violations); full output emitted
#   3 — ambiguous output (neither "clean" nor "failed" token present); investigate gennady CLI changes
#   4 — bad invocation (no args)

set -uo pipefail

PROG="lint-artifacts"
GENNADY_CLI="/Users/k.lebedev/Developer/gennady/cli/gennady.ts"

if [[ $# -lt 1 ]]; then
    cat <<EOF
[$PROG] BAD_INVOCATION
  expected: $PROG <file1> [<file2> ...]
  got:      $PROG (no args)

Required action (ORCHESTRATOR / phase agent):
  Pass at least one TypeScript file path to lint.
  Typically: phase's Target Files list.
EOF
    exit 4
fi

if [[ ! -f "$GENNADY_CLI" ]]; then
    cat <<EOF
[$PROG] GENNADY_CLI_NOT_FOUND
  expected at: $GENNADY_CLI

Diagnosis: the gennady AST DbC linter is unreachable from this environment.

Required action (ORCHESTRATOR):
  1. Verify the gennady project is checked out at /Users/k.lebedev/Developer/gennady.
  2. If gennady moved → update GENNADY_CLI variable in this script.
  3. If on a CI/sandbox without gennady → this is a HARD blocker; phase cannot verify.
     Report to operator: cannot complete phase without DBC contract verification.

DO NOT proceed to EMIT_HANDOFF without gennady lint passing.
EOF
    exit 1
fi

# ---------------------------------------------------------------------------
# Run gennady lint and capture output
# ---------------------------------------------------------------------------

# Use a temp file to capture full output; we need both grep on it and to emit on failure.
tmp_out=$(mktemp -t lint-artifacts.XXXXXX)
trap 'rm -f "$tmp_out"' EXIT

# Run gennady. We intentionally ignore its exit code (unreliable per contract above).
node --experimental-strip-types "$GENNADY_CLI" lint "$@" > "$tmp_out" 2>&1 || true

has_clean=$(grep -c '\[linting → clean\]' "$tmp_out" 2>/dev/null || echo 0)
has_failed=$(grep -c '\[linting → failed\]' "$tmp_out" 2>/dev/null || echo 0)

# Convert to single-line numbers (grep -c with || echo 0 may produce odd output on some shells)
has_clean=${has_clean//[^0-9]/}
has_failed=${has_failed//[^0-9]/}
has_clean=${has_clean:-0}
has_failed=${has_failed:-0}

# ---------------------------------------------------------------------------
# Branch on tokens
# ---------------------------------------------------------------------------

if [[ "$has_failed" -gt 0 ]]; then
    # Extract just the error lines (those with file:line: error: format) + final summary
    cat <<EOF
[$PROG] LINT_FAILED
  files lint'd: $#
  gennady output token: [linting → failed]

Full lint output (gennady DBC AST findings):
EOF
    # Print error lines and the failure summary line
    grep -E '\[linting → failed\]|: error: |^---|^References:|^  ' "$tmp_out" | head -200
    echo
    cat <<EOF
---

Required action (PHASE AGENT, before EMIT_HANDOFF):
  1. Read each error: format is <file>:<line>:<col>: error: <ERR_CODE>: <message>
  2. Common categories:
     - ERR_DBC_LINT_PARAM_MISSING — add @param <name> <coherent-role-description>
     - ERR_DBC_LINT_RETURNS_MISSING — add @returns <business-purpose-of-value>
     - ERR_DBC_ORDER — reorder JSDoc tags per AX_BASE_CONTRACT_SHAPE:
         @purpose → @consumers → @implements → @invariant → @pre →
         @param → @throws → @returns → @post → @sideEffect
  3. Fix all violations in the target files.
  4. Re-run this script. Repeat until clean.
  5. Do NOT EMIT_HANDOFF with lint failures present — that is fabricated DONE.

References:
  /Users/k.lebedev/Developer/vkt/ai/directives/coding/typescript-rules.xml
  — AX_TAG_USAGE_MATRIX, AX_BASE_CONTRACT_SHAPE, AX_FLAT_JSDOC_FOR_PROPERTIES
EOF
    exit 2
fi

if [[ "$has_clean" -gt 0 ]]; then
    # Clean. Emit concise PASS line to keep parent context light.
    file_count=$#
    echo "[$PROG] LINT_PASS"
    echo "  files lint'd: $file_count"
    echo "  gennady output token: [linting → clean]"
    exit 0
fi

# Neither token found — gennady output format may have changed.
cat <<EOF
[$PROG] AMBIGUOUS_OUTPUT
  files lint'd: $#
  gennady output token: (neither "linting → clean" nor "linting → failed" found)

Diagnosis: gennady CLI output format may have changed (or there is an unhandled edge case).

Captured output:
$(cat "$tmp_out" | head -50)

Required action (ORCHESTRATOR):
  1. Re-read gennady source: /Users/k.lebedev/Developer/gennady/cli/gennady.ts
  2. Check command output tokens in the LintCommand implementation.
  3. Update this script's parsing to match new tokens.
  4. Until resolved → treat as a HARD blocker; DO NOT assume PASS.
EOF
exit 3
