#!/usr/bin/env bash
# @file: Emit comprehensive SDD project snapshot in a single tool call.
# @consumers: sdd-check, sdd-continue, sdd-execute-batch (preflight + triage).
# @contract: AX_BASH_NO_SILENT_EMPTY. One-shot rich-context emitter so agents
#            avoid running multiple ad-hoc find/grep commands.
#
# Output sections (stable, machine-readable):
#   [HEADER]    — scan metadata (root, timestamp, version)
#   [TASKS]     — TSV: path, status, last_round, blocker, placeholders, warnings
#   [TRACKERS]  — TSV: tracker_path, done, todo, in_progress, blocked, total
#   [SPECS]     — TSV: spec_path, scope, modules_listed, modules_missing
#   [WARNINGS]  — severity \t location \t message (collected during scan)
#   [SUMMARY]   — key=value totals
#
# Usage:
#   scan.sh [project-root]   # defaults to current directory
#
# Exit codes:
#   0  — snapshot emitted (may include WARNINGS — agent must inspect)
#   2  — structural failure (root not found, tasks/ missing, etc.); STDOUT has
#        actionable diagnostic instructions
#   4  — bad invocation

set -uo pipefail

PROG="scan"
VERSION="1"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

if [[ $# -gt 1 ]]; then
    cat <<EOF
[$PROG] BAD_INVOCATION
  expected: $PROG [project-root]
  got:      $PROG $*

Required action:
  Pass zero or one argument — the project root. Defaults to current directory.
EOF
    exit 4
fi

ROOT="${1:-.}"

if [[ ! -d "$ROOT" ]]; then
    cat <<EOF
[$PROG] BAD_ROOT
  path: $ROOT
  reason: not a directory or does not exist

Required action:
  - Verify you passed a project root that exists.
  - From within a project, call: $PROG  (no arg) or $PROG .
EOF
    exit 2
fi

# Resolve to absolute path for stable output
ROOT_ABS="$(cd "$ROOT" && pwd)"

# ---------------------------------------------------------------------------
# Sanity: does this look like an SDD project?
# ---------------------------------------------------------------------------

has_tasks=0
has_specs=0
[[ -d "$ROOT_ABS/tasks" ]] && has_tasks=1
[[ -d "$ROOT_ABS/specs" ]] && has_specs=1

if [[ $has_tasks -eq 0 && $has_specs -eq 0 ]]; then
    cat <<EOF
[$PROG] NOT_AN_SDD_PROJECT
  root: $ROOT_ABS
  reason: neither tasks/ nor specs/ directory found

Required action:
  - If this is meant to be an SDD project, run /sdd-scaffold to bootstrap it.
  - If you ran from the wrong directory, pass the project root explicitly:
      $PROG /path/to/project
  - If your project uses non-standard layout (tasks elsewhere), this tool
    does not support that — convention is tasks/ + specs/ under root.
EOF
    exit 2
fi

# ---------------------------------------------------------------------------
# Buffers (using temp files for portability with macOS bash 3.2)
# ---------------------------------------------------------------------------

TMPDIR_BUF="$(mktemp -d -t sdd-scan.XXXXXX)" || { echo "[$PROG] MKTEMP_FAILED"; exit 2; }
trap 'rm -rf "$TMPDIR_BUF"' EXIT

WARN_FILE="$TMPDIR_BUF/warnings"
: > "$WARN_FILE"

emit_warn() {
    # severity \t location \t message
    printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$WARN_FILE"
}

# ---------------------------------------------------------------------------
# HEADER
# ---------------------------------------------------------------------------

printf '# sdd scan v%s\n' "$VERSION"
printf 'ROOT=%s\n' "$ROOT_ABS"
printf 'SCANNED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'HAS_TASKS=%d\n' "$has_tasks"
printf 'HAS_SPECS=%d\n' "$has_specs"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Extract Meta.Status from a ticket. Echoes one of:
#   DONE | TODO | IN_PROGRESS | BLOCKED | UNKNOWN
extract_status() {
    local f="$1"
    # Look in first 60 lines for "Status:" with [flag] STATE
    local line
    line=$(head -60 "$f" 2>/dev/null | grep -m1 -E '^\s*-?\s*\*?\*?Status:\*?\*?\s*\[.\]' || true)
    if [[ -z "$line" ]]; then
        echo "UNKNOWN"
        return
    fi
    # Extract flag char between [ and ]
    local flag
    flag=$(echo "$line" | sed -nE 's/.*\[(.)\].*/\1/p')
    case "$flag" in
        x|X) echo "DONE" ;;
        ' ') echo "TODO" ;;
        '~') echo "IN_PROGRESS" ;;
        '!') echo "BLOCKED" ;;
        *)   echo "UNKNOWN" ;;
    esac
}

# Count Round headers in Execution Log. Echoes count (0 if none).
count_rounds() {
    local f="$1"
    grep -E '^### Round [0-9]+' "$f" 2>/dev/null | wc -l | tr -d ' '
}

# Detect blocker state. Echoes:
#   none      — no 🛑 BLOCKED entries
#   active    — at least one 🛑 BLOCKED with no matching later ✅ RESOLVED
#   resolved  — all 🛑 entries followed by ✅ RESOLVED (last marker is ✅)
blocker_state() {
    local f="$1"
    local log_start
    log_start=$(grep -n "^## 7\. Execution Log" "$f" 2>/dev/null | head -1 | cut -d: -f1)
    [[ -z "$log_start" ]] && { echo "none"; return; }

    local blockers resolved last_b last_r
    blockers=$(grep -nE '🛑.*BLOCKED|BLOCKED.*🛑' "$f" 2>/dev/null \
                | awk -F: -v s="$log_start" '$1>=s' | wc -l | tr -d ' ')
    resolved=$(grep -nE '✅.*RESOLVED|RESOLVED.*✅' "$f" 2>/dev/null \
                | awk -F: -v s="$log_start" '$1>=s' | wc -l | tr -d ' ')

    [[ "$blockers" -eq 0 ]] && { echo "none"; return; }

    last_b=$(grep -nE '🛑.*BLOCKED|BLOCKED.*🛑' "$f" 2>/dev/null \
                | awk -F: -v s="$log_start" '$1>=s {print $1}' | tail -1)
    last_r=$(grep -nE '✅.*RESOLVED|RESOLVED.*✅' "$f" 2>/dev/null \
                | awk -F: -v s="$log_start" '$1>=s {print $1}' | tail -1)
    last_b="${last_b:-0}"
    last_r="${last_r:-0}"

    if [[ "$resolved" -ge "$blockers" && "$last_r" -gt "$last_b" ]]; then
        echo "resolved"
    else
        echo "active"
    fi
}

# Count placeholder markers (unfilled scaffold values) in a ticket.
count_placeholders() {
    local f="$1"
    grep -E '<YYYY-MM-DD>|<TBD>|`\[<ts>\]`|<command>|<scope>|<scenario>|<test-file>::<case>|<list or' "$f" 2>/dev/null | wc -l | tr -d ' '
}

# Per-ticket warnings (string, comma-separated, "-" if none)
ticket_warnings() {
    local f="$1"
    local w=()
    # Required structural sections
    grep -q '^## 1\. Meta' "$f" 2>/dev/null || w+=("no-meta-section")
    grep -q '^## 7\. Execution Log' "$f" 2>/dev/null || w+=("no-execlog-section")
    # Anchor closure sanity
    local opens closes
    opens=$(grep -E '^[[:space:]]*<!--SECTION:[A-Z][A-Z0-9_]*-->' "$f" 2>/dev/null | wc -l | tr -d ' ')
    closes=$(grep -E '^[[:space:]]*<!--/SECTION:[A-Z][A-Z0-9_]*-->' "$f" 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$opens" -ne "$closes" ]]; then
        w+=("anchors-mismatch:$opens-open/$closes-close")
    fi
    if [[ ${#w[@]} -eq 0 ]]; then
        echo "-"
    else
        (IFS=,; echo "${w[*]}")
    fi
}

# ---------------------------------------------------------------------------
# [TASKS]
# ---------------------------------------------------------------------------

printf '\n[TASKS]\n'
printf '# path\tstatus\tlast_round\tblocker\tplaceholders\twarnings\n'

if [[ $has_tasks -eq 0 ]]; then
    printf '# (tasks/ directory not present)\n'
    emit_warn "WARN" "tasks/" "directory missing; no tickets to scan"
else
    # -L follows symlinks (project convention; see AGENTS.md in symlinked projects)
    TASK_FILES=$(find -L "$ROOT_ABS/tasks" -name '*.task-*.md' -type f 2>/dev/null | sort || true)
    if [[ -z "$TASK_FILES" ]]; then
        printf '# (no *.task-*.md files found under tasks/)\n'
        emit_warn "INFO" "tasks/" "no ticket files matching '*.task-*.md' — project may be pre-scaffold"
    else
        while IFS= read -r f; do
            [[ -z "$f" ]] && continue
            rel="${f#$ROOT_ABS/}"
            status=$(extract_status "$f")
            rounds=$(count_rounds "$f")
            blocker=$(blocker_state "$f")
            placeholders=$(count_placeholders "$f")
            warns=$(ticket_warnings "$f")

            # Promote suspicious combinations into the WARNINGS section
            if [[ "$status" == "DONE" && "$blocker" == "active" ]]; then
                emit_warn "ERROR" "$rel" "status=DONE but unresolved BLOCKER in Execution Log"
            fi
            if [[ "$status" == "DONE" && "$placeholders" -gt 0 ]]; then
                emit_warn "WARN" "$rel" "status=DONE but $placeholders scaffold placeholder(s) remain"
            fi
            if [[ "$status" == "UNKNOWN" ]]; then
                emit_warn "WARN" "$rel" "Meta.Status not parseable (expected '[x] DONE' / '[ ] TODO' / '[~] IN_PROGRESS' / '[!] BLOCKED')"
            fi
            if [[ "$warns" != "-" ]]; then
                emit_warn "WARN" "$rel" "ticket structure: $warns"
            fi

            printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
                "$rel" "$status" "$rounds" "$blocker" "$placeholders" "$warns"
        done <<< "$TASK_FILES"
    fi
fi

# ---------------------------------------------------------------------------
# [TRACKERS]
# ---------------------------------------------------------------------------

printf '\n[TRACKERS]\n'
printf '# tracker_path\tdone\ttodo\tin_progress\tblocked\ttotal\n'

if [[ $has_tasks -eq 0 ]]; then
    printf '# (tasks/ missing)\n'
else
    TRACKERS=$(find -L "$ROOT_ABS/tasks" -name 'README.md' -type f 2>/dev/null | sort || true)
    if [[ -z "$TRACKERS" ]]; then
        printf '# (no README.md trackers found under tasks/)\n'
        emit_warn "WARN" "tasks/" "no tracker README.md files — convention is tasks/README.md per scope"
    else
        while IFS= read -r tr; do
            [[ -z "$tr" ]] && continue
            rel="${tr#$ROOT_ABS/}"
            # Count tracker rows matching TSK-NN pattern with status cell
            # Match both bare and link form: `| TSK-NN |` or `| [TSK-NN](...) |`
            done_c=$(grep -E '\|[[:space:]]*\[?TSK-[0-9]+.*`?\[x\]`?[[:space:]]+DONE' "$tr" 2>/dev/null | wc -l | tr -d ' ')
            todo_c=$(grep -E '\|[[:space:]]*\[?TSK-[0-9]+.*`?\[ \]`?[[:space:]]+TODO' "$tr" 2>/dev/null | wc -l | tr -d ' ')
            inpg_c=$(grep -E '\|[[:space:]]*\[?TSK-[0-9]+.*`?\[~\]`?[[:space:]]+IN_PROGRESS' "$tr" 2>/dev/null | wc -l | tr -d ' ')
            blkd_c=$(grep -E '\|[[:space:]]*\[?TSK-[0-9]+.*`?\[!\]`?[[:space:]]+BLOCKED' "$tr" 2>/dev/null | wc -l | tr -d ' ')
            total=$((done_c + todo_c + inpg_c + blkd_c))
            if [[ "$total" -eq 0 ]]; then
                # Tracker README might be the top-level overview without ticket rows — fine, but mark with hint
                emit_warn "INFO" "$rel" "no TSK rows detected (top-level overview tracker?)"
            fi
            printf '%s\t%d\t%d\t%d\t%d\t%d\n' "$rel" "$done_c" "$todo_c" "$inpg_c" "$blkd_c" "$total"
        done <<< "$TRACKERS"
    fi
fi

# ---------------------------------------------------------------------------
# [SPECS]
# ---------------------------------------------------------------------------

printf '\n[SPECS]\n'
printf '# spec_path\tscope\tmodules_listed\tmodules_missing\n'

if [[ $has_specs -eq 0 ]]; then
    printf '# (specs/ missing)\n'
else
    SPECS=$(find -L "$ROOT_ABS/specs" -name '*.spec.md' -type f 2>/dev/null | sort || true)
    if [[ -z "$SPECS" ]]; then
        printf '# (no *.spec.md files under specs/)\n'
        emit_warn "INFO" "specs/" "no spec files — run /sdd-discover to bootstrap"
    else
        while IFS= read -r sp; do
            [[ -z "$sp" ]] && continue
            rel="${sp#$ROOT_ABS/}"
            # Derive scope from path: specs/<scope>/<scope>.spec.md or specs/<scope>/<module>/<module>.spec.md
            scope=$(echo "$rel" | awk -F/ '{print $2}')
            # Count module references: paths like (../<module>/<module>.spec.md) or relative links to *.spec.md
            modules=$(grep -oE '[a-z][a-z0-9-]*\.spec\.md' "$sp" 2>/dev/null | sort -u | wc -l | tr -d ' ')
            # Count missing referenced specs (link target does not exist relative to this spec)
            missing=0
            base_dir=$(dirname "$sp")
            while IFS= read -r link; do
                [[ -z "$link" ]] && continue
                # Resolve relative
                if [[ -e "$base_dir/$link" ]]; then
                    :
                else
                    missing=$((missing + 1))
                fi
            # Only consider real markdown links: ](path.spec.md...) — preceded by ']'.
            # Skip inline-code paths like (`path.spec.md`) — those are descriptive references, not links.
            done < <(grep -oE '\]\([^)`]+\.spec\.md[^)]*\)' "$sp" 2>/dev/null \
                       | sed -E 's/^\]\(//; s/[#)].*$//' | sort -u)
            if [[ "$missing" -gt 0 ]]; then
                emit_warn "ERROR" "$rel" "$missing referenced *.spec.md link(s) do not resolve on disk"
            fi
            printf '%s\t%s\t%d\t%d\n' "$rel" "${scope:-unknown}" "$modules" "$missing"
        done <<< "$SPECS"
    fi
fi

# ---------------------------------------------------------------------------
# [WARNINGS]
# ---------------------------------------------------------------------------

printf '\n[WARNINGS]\n'
printf '# severity\tlocation\tmessage\n'
if [[ -s "$WARN_FILE" ]]; then
    cat "$WARN_FILE"
else
    printf '# (none)\n'
fi

# ---------------------------------------------------------------------------
# [SUMMARY]
# ---------------------------------------------------------------------------

# Aggregate from emitted [TASKS] block by re-walking files (cheap, ~ms).
sum_done=0; sum_todo=0; sum_inpg=0; sum_blkd=0; sum_unk=0
sum_active_blockers=0; sum_total_tasks=0
if [[ $has_tasks -eq 1 && -n "${TASK_FILES:-}" ]]; then
    while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        sum_total_tasks=$((sum_total_tasks + 1))
        s=$(extract_status "$f")
        case "$s" in
            DONE)        sum_done=$((sum_done+1)) ;;
            TODO)        sum_todo=$((sum_todo+1)) ;;
            IN_PROGRESS) sum_inpg=$((sum_inpg+1)) ;;
            BLOCKED)     sum_blkd=$((sum_blkd+1)) ;;
            *)           sum_unk=$((sum_unk+1)) ;;
        esac
        b=$(blocker_state "$f")
        [[ "$b" == "active" ]] && sum_active_blockers=$((sum_active_blockers+1))
    done <<< "$TASK_FILES"
fi

warn_count=$(grep -E '^WARN' "$WARN_FILE" 2>/dev/null | wc -l | tr -d ' ')
err_count=$(grep -E '^ERROR' "$WARN_FILE" 2>/dev/null | wc -l | tr -d ' ')
info_count=$(grep -E '^INFO' "$WARN_FILE" 2>/dev/null | wc -l | tr -d ' ')

printf '\n[SUMMARY]\n'
printf 'tasks_total=%d\n' "$sum_total_tasks"
printf 'tasks_done=%d\n' "$sum_done"
printf 'tasks_todo=%d\n' "$sum_todo"
printf 'tasks_in_progress=%d\n' "$sum_inpg"
printf 'tasks_blocked=%d\n' "$sum_blkd"
printf 'tasks_unknown_status=%d\n' "$sum_unk"
printf 'active_blockers=%d\n' "$sum_active_blockers"
printf 'warnings=%d\n' "$warn_count"
printf 'errors=%d\n' "$err_count"
printf 'info=%d\n' "$info_count"

# Exit 0 always when snapshot emitted. WARNINGS/ERRORS are *data* the agent must
# interpret — they are not invocation failures. Use exit 2 only when we cannot
# emit a snapshot (handled above).
exit 0
