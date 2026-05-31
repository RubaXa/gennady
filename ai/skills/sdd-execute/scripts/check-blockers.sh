#!/usr/bin/env bash
# @file: Scan ticket Execution Log for unresolved BLOCKER entries.
# @consumers: orchestrator (preflight before phase dispatch); audit; CI hooks.
# @contract: AX_BASH_NO_SILENT_EMPTY. Implements AX_BLOCKER_RESOLUTION_TRAIL —
#            BLOCKER from earlier Round is ACTIVE unless a later Round explicitly
#            marks it RESOLVED.
#
# Heuristic detection:
#   - Lines containing both "🛑" AND "BLOCKED" → blocker entry (with line number, context).
#   - Lines containing both "✅" AND "RESOLVED" → resolution marker.
#   - If RESOLVED markers count >= BLOCKED markers count, AND the last 🛑/✅ marker
#     in the log is ✅ → all blockers considered resolved.
#   - Otherwise → list latest blocker entries as ACTIVE; orchestrator must decide.
#
# Usage:
#   check-blockers.sh <ticket-file>
#
# Exit codes:
#   0  — no unresolved blockers (clear to dispatch)
#   2  — one or more unresolved blockers (orchestrator MUST resolve before dispatch)
#   4  — bad invocation
#   1  — file not found

set -uo pipefail

PROG="check-blockers"

if [[ $# -ne 1 ]]; then
    cat <<EOF
[$PROG] BAD_INVOCATION
  expected: $PROG <ticket-file>
  got:      $PROG $*

Required action (ORCHESTRATOR):
  Pass exactly one ticket file path.
EOF
    exit 4
fi

ticket="$1"

if [[ ! -f "$ticket" ]]; then
    cat <<EOF
[$PROG] FILE_NOT_FOUND
  file: $ticket

Required action:
  Verify ticket path; task may need re-resolution.
EOF
    exit 1
fi

# Locate Execution Log section start. Convention: "## 7. Execution Log".
log_start=$(grep -n "^## 7\. Execution Log" "$ticket" | head -1 | cut -d: -f1)
if [[ -z "$log_start" ]]; then
    cat <<EOF
[$PROG] NO_EXECUTION_LOG
  file: $ticket

The ticket lacks a "## 7. Execution Log" section. Either the ticket is malformed
or uses a different section number/title.

Required action (ORCHESTRATOR):
  Verify ticket structure follows scaffold.directive convention. If structure is
  correct but section title differs, update this script's heuristic accordingly.

Treating as clear (no blockers detectable).
EOF
    exit 0
fi

# Extract Execution Log content
log_content=$(tail -n +"$log_start" "$ticket")

# Find blocker and resolution lines (with line numbers).
# Use awk with proper line numbering, output to temp files for portability with macOS bash 3.2 (no mapfile).
blocker_lines=()
resolved_lines=()
blocker_count=0
resolved_count=0

while IFS= read -r line; do
    [[ -n "$line" ]] && blocker_lines+=("$line") && blocker_count=$((blocker_count + 1))
done < <(grep -n "🛑.*BLOCKED\|BLOCKED.*🛑" "$ticket" 2>/dev/null | awk -F: -v start="$log_start" '$1 >= start { print $0 }')

while IFS= read -r line; do
    [[ -n "$line" ]] && resolved_lines+=("$line") && resolved_count=$((resolved_count + 1))
done < <(grep -n "✅.*RESOLVED\|RESOLVED.*✅" "$ticket" 2>/dev/null | awk -F: -v start="$log_start" '$1 >= start { print $0 }')

# Determine last marker (BLOCKER or RESOLUTION) by line number
last_blocker_line=0
last_resolved_line=0
if [[ $blocker_count -gt 0 ]]; then
    last_blocker_line=$(echo "${blocker_lines[$((blocker_count - 1))]}" | cut -d: -f1)
fi
if [[ $resolved_count -gt 0 ]]; then
    last_resolved_line=$(echo "${resolved_lines[$((resolved_count - 1))]}" | cut -d: -f1)
fi

# ---------------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------------

if [[ $blocker_count -eq 0 ]]; then
    cat <<EOF
[$PROG] CLEAR
  ticket: $ticket
  blockers found: 0
  status: no BLOCKER entries in Execution Log; clear to dispatch phase.
EOF
    exit 0
fi

if [[ $resolved_count -ge $blocker_count ]] && [[ $last_resolved_line -gt $last_blocker_line ]]; then
    cat <<EOF
[$PROG] CLEAR
  ticket: $ticket
  blockers found:   $blocker_count
  resolutions:      $resolved_count
  last marker:      ✅ RESOLVED on line $last_resolved_line
  status: AX_BLOCKER_RESOLUTION_TRAIL satisfied — all blockers resolved.
EOF
    exit 0
fi

# Unresolved blockers — emit list
cat <<EOF
[$PROG] UNRESOLVED_BLOCKERS
  ticket: $ticket
  blockers found:   $blocker_count
  resolutions:      $resolved_count
  last 🛑 line:     $last_blocker_line
  last ✅ line:     $last_resolved_line
  status: AX_BLOCKER_RESOLUTION_TRAIL violated — latest marker is BLOCKER, not RESOLUTION.

Active BLOCKER entries (last 5):
EOF
# Print last 5 elements portably (no slicing syntax that requires bash 4)
start_idx=$((blocker_count - 5))
[[ $start_idx -lt 0 ]] && start_idx=0
i=$start_idx
while [[ $i -lt $blocker_count ]]; do
    echo "  ${blocker_lines[$i]}" | cut -c1-200
    i=$((i + 1))
done

cat <<EOF

Required action (ORCHESTRATOR):
  1. Read the listed BLOCKER entries in the ticket.
  2. Verify whether each blocker is still ACTIVE in current environment:
     - If actually still blocking → escalate to operator with unblock options.
     - If actually resolved (e.g. environment fixed, decision made) → append
       Round N entry with "✅ RESOLVED <Round-M BLOCKER ref>: <reason>" line
       to Execution Log; then re-run this script.
  3. DO NOT dispatch phase agent while any blocker is unresolved.
EOF
exit 2
