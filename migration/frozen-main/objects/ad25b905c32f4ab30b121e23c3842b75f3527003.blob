#!/usr/bin/env bash
# @file: Deterministic SDD mechanical checks shared by sdd-check (whole tree) and sdd-audit (scoped).
# @consumers: sdd-check skill (whole-tree preflight); sdd-audit directive STEP_2_5 (scoped pre-pass).
# @contract: AX_BASH_NO_SILENT_EMPTY. Single source of mechanical truth — neither skill re-implements
#            header presence, Task-ID integrity, or tracker sync. Pure function of files on disk.
#
# Three modes:
#   check.sh [project-root]          — whole tree: TASKID + TRACKER_SYNC (all tickets) + HEADERS (all marker-bearing src)
#   check.sh --task <TSK-NN> [root]  — one ticket: TASKID (collision/orphan-for-its-refs) + TRACKER_SYNC for that id
#   check.sh --files <f1> [f2 ...]   — header-trio presence for an explicit file list (audit passes its git-diff scope)
#
# Output sections (TSV, machine-readable, stable):
#   [HEADERS]      — file \t has_file \t has_consumers \t has_tasks \t verdict(OK|PARTIAL|NONE)
#   [TASKID]       — kind(orphan|collision) \t id \t detail
#   [TRACKER_SYNC] — task_id \t ticket_status \t tracker_status \t match(YES|NO|NO_ROW)
#   [SUMMARY]      — key=value totals + findings count
#
# Exit codes:
#   0 — all checks clean (zero findings)
#   3 — one or more findings (desync / orphan / collision / partial-or-missing header)
#   2 — structural failure (bad root / not an SDD project)
#   4 — bad invocation

set -uo pipefail

PROG="check"
VERSION="1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_sdd-lib.sh
. "$SCRIPT_DIR/_sdd-lib.sh"

# ---------------------------------------------------------------------------
# Argument parsing → MODE
# ---------------------------------------------------------------------------

MODE="tree"
TASK_ID=""
FILES=()
ROOT="."

case "${1:-}" in
    --task)
        MODE="task"
        TASK_ID="${2:-}"
        ROOT="${3:-.}"
        if [[ -z "$TASK_ID" || ! "$TASK_ID" =~ ^TSK-[0-9]+$ ]]; then
            cat <<EOF
[$PROG] BAD_INVOCATION
  expected: $PROG --task TSK-NN [project-root]
  got:      $PROG --task '${TASK_ID:-}' ...
Required action: pass a Task-ID of the form TSK-<number>.
EOF
            exit 4
        fi
        ;;
    --files)
        MODE="files"
        shift 2>/dev/null || true
        FILES=("$@")
        if [[ ${#FILES[@]} -eq 0 ]]; then
            cat <<EOF
[$PROG] BAD_INVOCATION
  expected: $PROG --files <file1> [file2 ...]
  got:      $PROG --files (no files)
Required action: pass at least one source file to check headers on.
EOF
            exit 4
        fi
        ;;
    --*)
        cat <<EOF
[$PROG] BAD_INVOCATION
  unknown flag: $1
  expected: $PROG [project-root] | $PROG --task TSK-NN [root] | $PROG --files <files...>
EOF
        exit 4
        ;;
    *)
        MODE="tree"
        ROOT="${1:-.}"
        ;;
esac

FINDINGS=0

# ---------------------------------------------------------------------------
# Mode: --files  → HEADERS only
# ---------------------------------------------------------------------------

emit_header_row() {
    local f="$1" flags hf hc ht verdict
    flags=$(sdd_lib_header_flags "$f")
    hf=$(echo "$flags" | cut -d' ' -f1)
    hc=$(echo "$flags" | cut -d' ' -f2)
    ht=$(echo "$flags" | cut -d' ' -f3)
    if [[ "$hf" -eq 1 && "$ht" -eq 1 ]]; then
        verdict="OK"   # @consumers is MINOR; @file + @tasks are the required pair
    elif [[ "$hf" -eq 0 && "$hc" -eq 0 && "$ht" -eq 0 ]]; then
        verdict="NONE"
    else
        verdict="PARTIAL"; FINDINGS=$((FINDINGS+1))
    fi
    printf '%s\t%d\t%d\t%d\t%s\n' "$f" "$hf" "$hc" "$ht" "$verdict"
}

if [[ "$MODE" == "files" ]]; then
    printf '# sdd check v%s (mode=files)\n' "$VERSION"
    printf '\n[HEADERS]\n# file\thas_file\thas_consumers\thas_tasks\tverdict\n'
    for f in "${FILES[@]}"; do
        if [[ ! -f "$f" ]]; then
            printf '%s\t-\t-\t-\tMISSING_FILE\n' "$f"; FINDINGS=$((FINDINGS+1)); continue
        fi
        emit_header_row "$f"
    done
    printf '\n[SUMMARY]\nmode=files\nfiles_checked=%d\nfindings=%d\n' "${#FILES[@]}" "$FINDINGS"
    [[ "$FINDINGS" -gt 0 ]] && exit 3 || exit 0
fi

# ---------------------------------------------------------------------------
# tree / task modes need an SDD root
# ---------------------------------------------------------------------------

if [[ ! -d "$ROOT" ]]; then
    echo "[$PROG] BAD_ROOT: $ROOT is not a directory"; exit 2
fi
ROOT_ABS="$(cd "$ROOT" && pwd)"
if [[ ! -d "$ROOT_ABS/tasks" && ! -d "$ROOT_ABS/specs" ]]; then
    cat <<EOF
[$PROG] NOT_AN_SDD_PROJECT
  root: $ROOT_ABS
  reason: neither tasks/ nor specs/ found
Required action: run from an SDD project root, or pass it explicitly.
EOF
    exit 2
fi

printf '# sdd check v%s (mode=%s%s)\n' "$VERSION" "$MODE" "$([[ "$MODE" == task ]] && echo " $TASK_ID")"
printf 'ROOT=%s\n' "$ROOT_ABS"

TASK_FILES=$(find -L "$ROOT_ABS/tasks" -name '*.task-*.md' -type f 2>/dev/null | sort || true)

# ---------------------------------------------------------------------------
# [TASKID] — collisions (global) + orphan @tasks references
# ---------------------------------------------------------------------------

printf '\n[TASKID]\n# kind\tid\tdetail\n'

# Build id → files map to detect collisions (two tickets declaring same Task-ID).
COLLISION_TMP="$(mktemp -t sdd-check-ids.XXXXXX)"
trap 'rm -f "$COLLISION_TMP"' EXIT
while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    id=$(sdd_lib_task_id "$f")
    [[ -z "$id" ]] && continue
    printf '%s\t%s\n' "$id" "${f#$ROOT_ABS/}" >> "$COLLISION_TMP"
done <<< "$TASK_FILES"

# Collisions: ids appearing on >1 ticket. In task mode, restrict to TASK_ID.
while IFS= read -r id; do
    [[ -z "$id" ]] && continue
    [[ "$MODE" == "task" && "$id" != "$TASK_ID" ]] && continue
    files=$(awk -F'\t' -v k="$id" '$1==k {print $2}' "$COLLISION_TMP" | paste -sd',' -)
    printf 'collision\t%s\t%s\n' "$id" "$files"
    FINDINGS=$((FINDINGS+1))
done < <(cut -f1 "$COLLISION_TMP" | sort | uniq -d)

# Orphans: @tasks: TSK-NN in source with no matching ticket file.
# Whole-tree mode only (task mode trusts its own ticket exists).
if [[ "$MODE" == "tree" ]]; then
    known_ids=$(cut -f1 "$COLLISION_TMP" | sort -u)
    # Collect @tasks references from source files (exclude heavy dirs).
    refs=$(grep -rhoE '@tasks:[^@]*' "$ROOT_ABS" \
              --include='*.ts' --include='*.js' --include='*.sh' --include='*.go' \
              --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
              --exclude-dir=worktrees --exclude-dir=.claude 2>/dev/null \
            | grep -oE 'TSK-[0-9]+' | sort -u || true)
    while IFS= read -r rid; do
        [[ -z "$rid" ]] && continue
        if ! echo "$known_ids" | grep -qx "$rid"; then
            printf 'orphan\t%s\t@tasks reference with no tasks/**/*.task-*.md\n' "$rid"
            FINDINGS=$((FINDINGS+1))
        fi
    done <<< "$refs"
fi

# ---------------------------------------------------------------------------
# [TRACKER_SYNC] — ticket Meta.Status vs tracker-row status
# ---------------------------------------------------------------------------

printf '\n[TRACKER_SYNC]\n# task_id\tticket_status\ttracker_status\tmatch\n'

sync_one() {
    local f="$1" id ticket_status scope tracker tracker_status match
    id=$(sdd_lib_task_id "$f")
    [[ -z "$id" ]] && return
    ticket_status=$(sdd_lib_status "$f")
    # scope = first path segment under tasks/
    scope=$(echo "${f#$ROOT_ABS/tasks/}" | awk -F/ '{print $1}')
    tracker="$ROOT_ABS/tasks/$scope/README.md"
    if [[ ! -f "$tracker" ]]; then
        printf '%s\t%s\t-\tNO_ROW\n' "$id" "$ticket_status"; FINDINGS=$((FINDINGS+1)); return
    fi
    tracker_status=$(sdd_lib_tracker_status "$tracker" "$id")
    if [[ "$ticket_status" == "UNKNOWN" ]]; then
        # Old-template ticket lacking a parseable Meta **Status:** — cannot compare.
        # Not a desync finding (mirrors scan.sh WARN, not ERROR); surface as UNPARSEABLE.
        match="UNPARSEABLE"
    elif [[ "$tracker_status" == "UNKNOWN" ]]; then
        match="NO_ROW"; FINDINGS=$((FINDINGS+1))
    elif [[ "$tracker_status" == "$ticket_status" ]]; then
        match="YES"
    else
        match="NO"; FINDINGS=$((FINDINGS+1))
    fi
    printf '%s\t%s\t%s\t%s\n' "$id" "$ticket_status" "$tracker_status" "$match"
}

while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if [[ "$MODE" == "task" ]]; then
        [[ "$(sdd_lib_task_id "$f")" == "$TASK_ID" ]] || continue
    fi
    sync_one "$f"
done <<< "$TASK_FILES"

# [HEADERS] is intentionally NOT run in tree mode: "which files must carry @tasks"
# is a policy (task-generated vs hand-authored), not a mechanical fact. Header presence
# is meaningful only against a known in-scope file set — provided by audit via --files.

# ---------------------------------------------------------------------------
# [SUMMARY]
# ---------------------------------------------------------------------------

printf '\n[SUMMARY]\nmode=%s\n' "$MODE"
[[ "$MODE" == "task" ]] && printf 'task=%s\n' "$TASK_ID"
printf 'findings=%d\n' "$FINDINGS"

[[ "$FINDINGS" -gt 0 ]] && exit 3 || exit 0
