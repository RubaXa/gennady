#!/usr/bin/env bash
# @file: Deterministic SDD mechanical checks shared by sdd-check (whole tree) and sdd-audit (scoped).
# @consumers: sdd-check skill (whole-tree preflight); sdd-audit directive STEP_2_5 (scoped pre-pass).
# @tasks: TSK-96, TSK-97
# @contract: AX_BASH_NO_SILENT_EMPTY. Single source of mechanical truth — neither skill re-implements
#            header presence, Task-ID integrity, or tracker sync. Pure function of files on disk.
#
# Three modes:
#   check.sh [project-root]          — whole tree: TASKID + TRACKER_SYNC (all tickets) + RULES (all rule files)
#   check.sh --task <Task-ID> [root]  — one ticket: TASKID + TRACKER_SYNC for that id + RULES for its cited rules
#   check.sh --files <f1> [f2 ...]   — header-trio presence for an explicit file list (audit passes its git-diff scope)
#
# Output sections (TSV, machine-readable, stable):
#   [HEADERS]      — file \t has_file \t has_consumers \t has_tasks \t verdict(OK|PARTIAL|NONE)
#   [TASKID]       — kind(orphan|collision|missing) \t id \t detail
#   [TRACKER_SYNC] — task_id \t ticket_status \t tracker_status \t match(YES|NO|NO_ROW)
#   [REOPENS]      — task_id \t meta \t audit_triggered \t verdict(OK|PENDING|MISMATCH|UNVERIFIABLE)
#   [RULES]        — file \t belief \t anti \t hooks \t reward \t verdict(OK|INCOMPLETE) \t missing
#   [LOG]          — ticket \t round \t line \t kind \t token \t detail
#                    kinds: unknown-token | unclosed-round | fabricated-placeholder (findings)
#                           retired-token | round-close-no-timestamp (informational: append-only
#                           history and cosmetics never fail a tree)
#   [SUMMARY]      — key=value totals + findings count
#
# [RULES] implements the mechanical half of AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES: a rule file
# must expose <BeliefState> / <AntiPatterns> / <VerificationHooks> / <RewardCriteria>. Detection is a
# tolerant opening-tag scan, NOT an XML parse — these files are HTML-like by design and carry prose
# such as `<Target Files>` and `Meta<typeof Button>` that no XML parser accepts.
#
# Rule files are the non-`*.directive.xml` entries of the cascade categories (coding / testing / infra),
# in the project and in plugin directive trees. `*.directive.xml` are protocols, not rules, and are
# exempt. Tree mode scans every rule file; task mode scans only the ones that ticket's phases cite —
# the "activated" set the axiom is written against.
#
# Rule findings are counted SEPARATELY from task findings (`rule_findings=`): a shared rule file is
# project infrastructure that no single task owns or may edit, so it must not decide a task's verdict.
#
# Exit codes:
#   0 — all checks clean (zero findings)
#   3 — one or more findings (desync / orphan / collision / partial-or-missing header / incomplete rule)
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
        if [[ -z "$TASK_ID" || ! "$TASK_ID" =~ ^TSK-([A-Z][A-Z0-9]*-)?[0-9]+$ ]]; then
            cat <<EOF
[$PROG] BAD_INVOCATION
  expected: $PROG --task TSK-NN|TSK-PREFIX-NNN [project-root]
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
  expected: $PROG [project-root] | $PROG --task <Task-ID> [root] | $PROG --files <files...>
EOF
        exit 4
        ;;
    *)
        MODE="tree"
        ROOT="${1:-.}"
        ;;
esac

FINDINGS=0
RULE_FINDINGS=0

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

TASK_FILES=$(find -L "$ROOT_ABS/tasks" -name '*.md' ! -name 'README.md' -type f 2>/dev/null | sort || true)

# ---------------------------------------------------------------------------
# [TASKID] — collisions (global) + orphan @tasks references
# ---------------------------------------------------------------------------

printf '\n[TASKID]\n# kind\tid\tdetail\n'

if [[ "$MODE" == "task" ]]; then
    TASK_MATCHES=0
    while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        [[ "$(sdd_lib_task_id "$f")" == "$TASK_ID" ]] && TASK_MATCHES=$((TASK_MATCHES+1))
    done <<< "$TASK_FILES"
    if [[ "$TASK_MATCHES" -eq 0 ]]; then
        printf 'missing\t%s\tno ticket declares this Meta Task-ID\n' "$TASK_ID"
        FINDINGS=$((FINDINGS+1))
    fi
fi

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

# Orphans: @tasks Task-IDs in source with no matching ticket Meta ID.
# Whole-tree mode only (task mode trusts its own ticket exists).
if [[ "$MODE" == "tree" ]]; then
    known_ids=$(cut -f1 "$COLLISION_TMP" | sort -u)
    # Collect @tasks references from source files (exclude heavy dirs).
    refs=$(grep -rhoE '@tasks:[^@]*' "$ROOT_ABS" \
              --include='*.ts' --include='*.js' --include='*.sh' --include='*.go' \
              --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
              --exclude-dir=worktrees --exclude-dir=.claude 2>/dev/null \
            | grep -oE 'TSK-([A-Z][A-Z0-9]*-)?[0-9]+' | sort -u || true)
    while IFS= read -r rid; do
        [[ -z "$rid" ]] && continue
        if ! echo "$known_ids" | grep -qx "$rid"; then
            printf 'orphan\t%s\t@tasks reference with no ticket declaring this Meta Task-ID\n' "$rid"
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

# ---------------------------------------------------------------------------
# [REOPENS] — Meta count follows persisted audit causation, not all Round headers
# ---------------------------------------------------------------------------

printf '\n[REOPENS]\n# task_id\tmeta\taudit_triggered\tverdict\n'

reopens_one() {
    local f="$1" id meta triggered first_after verdict causal_ok pending audit_line after target expected status last_audit ticket_status
    id=$(sdd_lib_task_id "$f")
    [[ -z "$id" ]] && return
    meta=$(grep -m1 -oE 'Reopens:\*?\*?[[:space:]]*[0-9]+' "$f" 2>/dev/null | grep -oE '[0-9]+$' || true)
    triggered=$(grep -cE '^@audit .* triggered-reopen=Round-[0-9]+' "$f" 2>/dev/null || true)
    first_after=$(grep -m1 -E '^@audit .* after-exec-round=[0-9]+' "$f" 2>/dev/null | sed -E 's/.* after-exec-round=([0-9]+).*/\1/' || true)
    causal_ok=1
    pending=0
    last_audit=$(grep -E '^@audit ' "$f" 2>/dev/null | tail -1 || true)
    ticket_status=$(sdd_lib_status "$f")

    while IFS= read -r audit_line; do
        [[ -z "$audit_line" ]] && continue
        after=$(echo "$audit_line" | sed -nE 's/.* after-exec-round=([0-9]+).*/\1/p')
        target=$(echo "$audit_line" | sed -nE 's/.* triggered-reopen=Round-([0-9]+).*/\1/p')
        status=$(echo "$audit_line" | sed -nE 's/.* status=([^ ]+).*/\1/p')
        [[ -z "$after" || -z "$target" ]] && { causal_ok=0; continue; }
        expected=$((after + 1))
        [[ "$target" -ne "$expected" || "$status" != "FAIL" ]] && causal_ok=0
        if ! grep -qE "^### Round ${target}([[:space:]]|$)" "$f" 2>/dev/null; then
            if [[ "$audit_line" == "$last_audit" && ( "$ticket_status" == "IN_PROGRESS" || "$ticket_status" == "BLOCKED" ) ]]; then
                pending=1
            else
                causal_ok=0
            fi
        fi
    done < <(grep -E '^@audit .* triggered-reopen=Round-[0-9]+' "$f" 2>/dev/null || true)

    # Causation is bidirectional: a phase-owned code route requires a triggered Round, and a
    # triggered Round requires at least one such route.
    if ! awk '
        function close_record() { if (seen && triggered != owned) bad = 1 }
        /^@audit / {
            close_record()
            seen = 1
            triggered = ($0 ~ / triggered-reopen=Round-[0-9]+/)
            owned = 0
            next
        }
        seen && /^F-/ && / phase=P[0-9]+ / && / route=(code-fix|ticket-reopen) / { owned = 1 }
        END { close_record(); exit bad }
    ' "$f"; then
        causal_ok=0
    fi

    if [[ "$causal_ok" -ne 1 ]]; then
        [[ -z "$meta" ]] && meta="-"
        verdict="MISMATCH"; FINDINGS=$((FINDINGS+1))
    elif [[ -z "$meta" && "$triggered" -eq 0 ]]; then
        meta="-"; verdict="OK"
    elif [[ "$meta" == "0" && "$triggered" -eq 0 && -z "$first_after" ]]; then
        verdict="OK"
    elif [[ -z "$meta" || -z "$first_after" || "$first_after" -ne 1 ]]; then
        # Legacy tickets may have reopens from before persisted audit records existed. The available
        # records are not a complete denominator, so report the data without inventing a mismatch.
        [[ -z "$meta" ]] && meta="-"
        verdict="UNVERIFIABLE"
    elif [[ -n "$meta" && "$meta" -ne "$triggered" ]]; then
        verdict="MISMATCH"; FINDINGS=$((FINDINGS+1))
    elif [[ "$pending" -eq 1 ]]; then
        verdict="PENDING"
    elif [[ -n "$meta" && "$meta" -eq "$triggered" ]]; then
        verdict="OK"
    else
        [[ -z "$meta" ]] && meta="-"
        verdict="MISMATCH"; FINDINGS=$((FINDINGS+1))
    fi
    printf '%s\t%s\t%s\t%s\n' "$id" "$meta" "$triggered" "$verdict"
}

while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if [[ "$MODE" == "task" ]]; then
        [[ "$(sdd_lib_task_id "$f")" == "$TASK_ID" ]] || continue
    fi
    reopens_one "$f"
done <<< "$TASK_FILES"

# [HEADERS] is intentionally NOT run in tree mode: "which files must carry @tasks"
# is a policy (task-generated vs hand-authored), not a mechanical fact. Header presence
# is meaningful only against a known in-scope file set — provided by audit via --files.

# ---------------------------------------------------------------------------
# [RULES] — activated rule files expose the four checkable sections
# ---------------------------------------------------------------------------

printf '\n[RULES]\n# file\tbelief\tanti\thooks\treward\tverdict\tmissing\n'

# Cascade categories and protocol exclusion come from the shared path predicate.
rule_files_in_tree() {
    find -L "$ROOT_ABS/ai/directives" "$ROOT_ABS"/plugins/*/directives \
        -type d -name node_modules -prune -o \
        -type f -name '*.xml' -print 2>/dev/null \
        | while IFS= read -r path; do
            sdd_lib_is_rule_path "$path" && printf '%s\n' "$path"
          done \
        | sort -u || true
}

# Task mode: the rules this ticket's phases actually cite (the "activated" set).
rule_files_for_task() {
    local ticket
    ticket=$(grep -l "^- \*\*Task-ID:\*\* $TASK_ID\$" $TASK_FILES 2>/dev/null | head -1)
    [[ -z "$ticket" ]] && return
    grep -ohE '(ai/directives|plugins/[a-z0-9-]+/directives)/[a-z0-9-]+/[a-z0-9._-]+\.xml' "$ticket" \
        | while IFS= read -r rel; do
            sdd_lib_is_rule_path "$rel" && [[ -f "$ROOT_ABS/$rel" ]] && printf '%s\n' "$ROOT_ABS/$rel"
          done \
        | sort -u
}

if [[ "$MODE" == "task" ]]; then
    RULE_FILES=$(rule_files_for_task)
else
    RULE_FILES=$(rule_files_in_tree)
fi

if [[ -z "$RULE_FILES" ]]; then
    printf '# none%s\n' "$([[ "$MODE" == task ]] && echo " — ticket cites no rule files")"
else
    while IFS= read -r rf; do
        [[ -z "$rf" ]] && continue
        b=0; a=0; h=0; r=0; missing=""
        grep -q '<BeliefState' "$rf" && b=1 || missing="${missing}BeliefState,"
        grep -q '<AntiPatterns' "$rf" && a=1 || missing="${missing}AntiPatterns,"
        grep -q '<VerificationHooks' "$rf" && h=1 || missing="${missing}VerificationHooks,"
        grep -q '<RewardCriteria' "$rf" && r=1 || missing="${missing}RewardCriteria,"
        if [[ -z "$missing" ]]; then
            printf '%s\t1\t1\t1\t1\tOK\t-\n' "${rf#$ROOT_ABS/}"
        else
            printf '%s\t%d\t%d\t%d\t%d\tINCOMPLETE\t%s\n' "${rf#$ROOT_ABS/}" "$b" "$a" "$h" "$r" "${missing%,}"
            RULE_FINDINGS=$((RULE_FINDINGS+1))
        fi
    done <<< "$RULE_FILES"
fi

# ---------------------------------------------------------------------------
# [LOG] — Execution Log token vocabulary + Round-close shape
# ---------------------------------------------------------------------------

printf '\n[LOG]\n# ticket\tround\tline\tkind\ttoken\tdetail\n'

# `retired` tokens were valid before the vocabulary was consolidated. Rounds are append-only, so
# their presence in an old round is history, not a defect — they are reported and NOT counted.
# Anything outside both sets is `unknown-token` and IS counted.
LOG_TMP="$(mktemp -t sdd-check-log.XXXXXX)"
trap 'rm -f "$COLLISION_TMP" "$LOG_TMP"' EXIT

while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if [[ "$MODE" == "task" ]]; then
        [[ "$(sdd_lib_task_id "$f")" == "$TASK_ID" ]] || continue
    fi
    awk -v ticket="${f#$ROOT_ABS/}" '
        function has_scaffold_marker(tok, line) {
            if (line ~ /^- \[x\] `<[^>]+>` /) return 1
            if (tok == "intro") return line ~ /<Entity>|<reason>/
            if (tok == "decision") return line ~ /<key>|<value>|<reason>/
            if (tok == "tried") return line ~ /<approach>|<result>/
            if (tok == "discovery") return line ~ /<fact>/
            if (tok == "insight") return line ~ /<observation>|<spec-section>|<change>/
            if (tok == "verified") return line ~ /<tool>|<version>|<summary>/
            if (tok == "ver") return line ~ /<cmd>|<pass\|fail>|<code>|<N>/
            if (tok == "BLOCKED") return line ~ /<cause>/
            return 0
        }
        BEGIN {
            split("intro decision tried discovery insight verified ver BLOCKED DONE", v, " ")
            for (i in v) valid[v[i]] = 1
            # Retired when the vocabulary was consolidated (scaffold.directive names exactly these).
            split("sync file test cov rules recon", r, " ")
            for (i in r) retired[r[i]] = 1
            # Blocker lifecycle markers are their own shape, not action tokens.
            valid["🛑"] = 1; valid["✅"] = 1
            round = "-"; inlog = 0; inclose = 0; closelines = 0; closebad = 0; roundwork = 0
        }
        /^## 7\. Execution Log/ { inlog = 1; next }
        /^## [0-9]+\./       { if (inlog) inlog = 0 }
        inlog == 0           { next }
        /^### Round /        {
            if (inclose && closelines != 1 && closebad == 0 && roundwork == 1)
                printf "%s\t%s\t%d\tbad-round-close\t-\texpected exactly one DONE line, found %d\n", ticket, round, closeline, closelines
            if ($0 ~ /<YYYY-MM-DD>/)
                printf "%s\t-\t%d\tfabricated-placeholder\tRound\tround header retains a scaffold marker\n", ticket, NR
            round = $3; inclose = 0; closelines = 0; closebad = 0; roundwork = 0; next
        }
        /^#### Round close/  { inclose = 1; closelines = 0; closebad = 0; closeline = NR; next }
        /^#### /             {
            if (inclose && closelines != 1 && closebad == 0 && roundwork == 1)
                printf "%s\t%s\t%d\tbad-round-close\t-\texpected exactly one DONE line, found %d\n", ticket, round, closeline, closelines
            inclose = 0; closebad = 0; next
        }
        # Token lines: "- [x] `<ts>` <token> ..."  (blocker lines use 🛑 and are matched separately)
        /^- \[[ x~!]\] `[^`]*` / {
            rest = $0; sub(/^- \[[ x~!]\] `[^`]*` +/, "", rest)
            split(rest, w, " "); tok = w[1]
            sub(/:$/, "", tok)   # a trailing colon is cosmetic, not a different token
            if (inclose) { if (tok == "DONE") closelines++ }
            else if ($0 ~ /^- \[x\]/) roundwork = 1
            if ($0 ~ /^- \[x\]/ && has_scaffold_marker(tok, $0)) {
                printf "%s\t%s\t%d\tfabricated-placeholder\t%s\tchecked protocol line retains a scaffold marker\n", ticket, round, NR, tok
                next
            }
            if (tok in valid) next
            # Every real token is lowercase except BLOCKED / DONE. A capitalised first word is a
            # sentence from the pre-consolidation prose plan ("Implementation file:", "Tracker
            # synced:"), which the same consolidation retired.
            if (tok ~ /^[A-Z]/) {
                printf "%s\t%s\t%d\tretired-token\t%s\tprose line from the pre-consolidation plan template\n", ticket, round, NR, tok
                next
            }
            if (tok in retired) {
                printf "%s\t%s\t%d\tretired-token\t%s\tvalid before the vocabulary was consolidated; round is append-only\n", ticket, round, NR, tok
            } else {
                printf "%s\t%s\t%d\tunknown-token\t%s\tnot in the scaffold.directive token table\n", ticket, round, NR, tok
            }
            next
        }
        # A checkbox line inside Round close that carries no timestamped token at all.
        # Close-block lines that carry no timestamped token. A ticked DONE without a timestamp is
        # cosmetic drift; an unticked box means the round was never actually closed.
        inclose == 1 && /^- / {
            if ($0 ~ /\[x\]/ && $0 ~ /DONE/) {
                printf "%s\t%s\t%d\tround-close-no-timestamp\tDONE\tclosed, but the `<ts>` is missing\n", ticket, round, NR
                closelines++
            } else if (roundwork == 1) {
                # Only a round that actually ran can be "not closed". An untouched round is the
                # pre-filled skeleton of a [ ] TODO ticket, which is its normal state.
                printf "%s\t%s\t%d\tunclosed-round\t-\tRound close carries no ticked DONE: %s\n", ticket, round, NR, substr($0, 1, 40)
                closebad = 1
            }
        }
        END {
            if (inclose && closelines != 1 && closebad == 0 && roundwork == 1)
                printf "%s\t%s\t%d\tbad-round-close\t-\texpected exactly one DONE line, found %d\n", ticket, round, closeline, closelines
        }
    ' "$f" >> "$LOG_TMP"
done <<< "$TASK_FILES"

if [[ -s "$LOG_TMP" ]]; then
    cat "$LOG_TMP"
    # Informational kinds record history or cosmetics; they must not fail the tree.
    LOG_FINDINGS=$(awk -F'\t' '$4 != "retired-token" && $4 != "round-close-no-timestamp"' "$LOG_TMP" | grep -c '' || true)
    FINDINGS=$((FINDINGS + LOG_FINDINGS))
else
    printf '# none\n'
fi

# ---------------------------------------------------------------------------
# [SUMMARY]
# ---------------------------------------------------------------------------

printf '\n[SUMMARY]\nmode=%s\n' "$MODE"
[[ "$MODE" == "task" ]] && printf 'task=%s\n' "$TASK_ID"
printf 'findings=%d\n' "$FINDINGS"
printf 'rule_findings=%d\n' "$RULE_FINDINGS"

[[ $((FINDINGS + RULE_FINDINGS)) -gt 0 ]] && exit 3 || exit 0
