#!/usr/bin/env bash
# @file: Extract a named section between <!--SECTION:<NAME>--> / <!--/SECTION:<NAME>--> markers from a markdown file.
# @consumers: sdd-execute, sdd-execute-batch (L2 orchestrator prompt-building); phase agents (rules extraction)
# @contract: AX_BASH_NO_SILENT_EMPTY — never produces empty stdout. On miss → emits actionable instruction for the orchestrator + exit ≠ 0.
#
# Anchor grammar (canonical, AX_TICKET_ANCHOR_FORMAT):
#   Open marker:   <!--SECTION:<NAME>-->
#   Close marker:  <!--/SECTION:<NAME>-->
#   <NAME>:        ^[A-Z][A-Z0-9_]*$  (uppercase, starts with letter, alnum + underscore only)
#   No quotes, no spaces, no attributes — atomic identifiers only.
#
# Canonical names: META, PHASES_OVERVIEW, PHASE_P1, PHASE_P2, PHASE_P1_FIX, BDD, VERIFICATION, TEST_COVERAGE, EXECUTION_LOG.
#
# Usage:
#   extract-section.sh <file> <NAME>
#
# Examples:
#   extract-section.sh ticket.md META
#   extract-section.sh ticket.md PHASE_P1
#   extract-section.sh ticket.md EXECUTION_LOG
#
# Exit codes:
#   0  — section found, content emitted to stdout
#   1  — file not found / unreadable
#   2  — anchor markers not present in file
#   3  — START found but END missing, or vice versa (corrupted markers), or duplicate occurrences
#   4  — bad invocation (missing args, invalid NAME)

set -uo pipefail

PROG="extract-section"
NAME_REGEX='^[A-Z][A-Z0-9_]*$'

if [[ $# -ne 2 ]]; then
    cat <<EOF
[$PROG] BAD_INVOCATION
  expected: $PROG <file> <NAME>
  got:      $PROG $*

Required action (ORCHESTRATOR):
  Pass exactly 2 arguments — file path and SECTION name.
  NAME must match: $NAME_REGEX
  Examples of valid names: META, PHASES_OVERVIEW, PHASE_P1, BDD, EXECUTION_LOG.
EOF
    exit 4
fi

file="$1"
name="$2"

# ---------------------------------------------------------------------------
# NAME validation
# ---------------------------------------------------------------------------

if [[ ! "$name" =~ $NAME_REGEX ]]; then
    cat <<EOF
[$PROG] INVALID_NAME
  name: $name
  rule: $NAME_REGEX

Diagnosis: section name does not match canonical anchor grammar.

Required action (ORCHESTRATOR):
  1. Use uppercase letters, digits, and underscores only.
  2. Start with a letter (not a digit or underscore).
  3. No spaces, no quotes, no attributes inside the name.

Canonical names: META, PHASES_OVERVIEW, PHASE_P1, PHASE_P2, PHASE_P1_FIX,
BDD, VERIFICATION, TEST_COVERAGE, EXECUTION_LOG.

If you need attributes (kind, rules, etc.) — put them inside the section content,
NOT inside the anchor name. The anchor is an identifier only.
EOF
    exit 4
fi

# ---------------------------------------------------------------------------
# File existence + readability
# ---------------------------------------------------------------------------

if [[ ! -f "$file" ]]; then
    cat <<EOF
[$PROG] FILE_NOT_FOUND
  file: $file

Required action (ORCHESTRATOR):
  1. Verify the file path argument (typos, wrong scope, wrong task-id).
  2. Check whether the ticket/spec exists at the expected location.
  3. If task ID resolves to a different path — fix the resolution layer, not this script.

DO NOT proceed to dispatch phase agent until the file is located.
EOF
    exit 1
fi

if [[ ! -r "$file" ]]; then
    cat <<EOF
[$PROG] FILE_NOT_READABLE
  file: $file
  perms: $(stat -f '%Sp' "$file" 2>/dev/null || stat -c '%A' "$file" 2>/dev/null || echo 'unknown')

Required action (ORCHESTRATOR):
  Verify file permissions; chmod if needed.
EOF
    exit 1
fi

# ---------------------------------------------------------------------------
# Marker scan — pre-flight before extraction
# ---------------------------------------------------------------------------

start_marker="<!--SECTION:${name}-->"
end_marker="<!--/SECTION:${name}-->"

start_count=$(grep -cF "$start_marker" "$file" || true)
end_count=$(grep -cF "$end_marker" "$file" || true)

if [[ "$start_count" -eq 0 && "$end_count" -eq 0 ]]; then
    cat <<EOF
[$PROG] ANCHOR_NOT_FOUND
  section: $name
  file:    $file
  searched markers:
    $start_marker
    $end_marker

Diagnosis: file does not contain anchor markers for this section.

Possible causes:
  1. Ticket/spec scaffolded before anchor convention introduced (pre-2026-05-21).
  2. Anchor was deleted or corrupted during manual edit.
  3. Wrong section name — verify against canonical names
     (META, PHASES_OVERVIEW, PHASE_P<N>, BDD, VERIFICATION, TEST_COVERAGE, EXECUTION_LOG).
  4. Section uses non-canonical name — review file structure.

Required action (ORCHESTRATOR, not phase agent):
  1. Read the file directly via Read tool.
  2. Verify the section exists by markdown header (e.g. ## 1. Meta, ### P1 — impl).
  3. If section exists in header form but lacks anchors → retrofit anchors per
     AX_TICKET_ANCHOR_FORMAT in /Users/k.lebedev/Developer/vkt/ai/directives/sdd/scaffold.directive.xml.
  4. If section does not exist at all → escalate to operator: ticket needs
     re-scaffolding or section content authoring.

DO NOT proceed to dispatch a phase agent until anchors are in place.
EOF
    exit 2
fi

if [[ "$start_count" -ne "$end_count" ]]; then
    cat <<EOF
[$PROG] ANCHOR_UNBALANCED
  section: $name
  file:    $file
  $start_marker count: $start_count
  $end_marker   count: $end_count

Diagnosis: markers are corrupted — counts of open and close markers do not match.

Required action (ORCHESTRATOR):
  1. Read the file.
  2. Locate the imbalanced marker via:
       grep -nF '$start_marker' "$file"
       grep -nF '$end_marker'   "$file"
  3. Restore the missing one OR remove the duplicate one.
  4. Retry this script.

DO NOT proceed to dispatch a phase agent until markers are balanced.
EOF
    exit 3
fi

if [[ "$start_count" -gt 1 ]]; then
    cat <<EOF
[$PROG] ANCHOR_DUPLICATED
  section: $name
  file:    $file
  occurrences: $start_count

Diagnosis: the same section appears more than once in this file — ambiguous extraction.

Required action (ORCHESTRATOR):
  1. Read the file and identify duplicate sections.
  2. Either merge them or rename one to be unique (e.g. PHASE_P1 vs PHASE_P1_FIX).
  3. Retry this script.
EOF
    exit 3
fi

# ---------------------------------------------------------------------------
# Extraction — markers verified present and balanced; emit content between them.
# Exclude the marker lines themselves from output.
# ---------------------------------------------------------------------------

content=$(awk -v start="$start_marker" -v end="$end_marker" '
    $0 == start { in_block = 1; next }
    $0 == end   { in_block = 0; next }
    in_block    { print }
' "$file")

if [[ -z "$content" ]]; then
    cat <<EOF
[$PROG] ANCHOR_EMPTY
  section: $name
  file:    $file

Diagnosis: markers are present and balanced, but the section between them is empty.

Required action (ORCHESTRATOR):
  1. Read the file.
  2. Determine whether the section is intentionally empty (rare) or accidentally
     stripped during refactor.
  3. If accidental → re-author content.
  4. If intentional → use a different section reference; this one carries no payload.
EOF
    exit 2
fi

printf '%s\n' "$content"
exit 0
