# @file: Shared SDD artifact parsers — sourced by scan.sh / check.sh, never executed directly.
# @consumers: check.sh (canonical), scan.sh (migration pending).
# @contract: pure functions of file contents; no stdout side effects beyond the echoed result.
#
# Why this lib exists:
#   - check.sh and scan.sh both parse ticket Meta.Status, Task-ID, tracker rows, file headers.
#   - One implementation here = no drift between the two SDD tree tools (the whole point of
#     `sdd check`: a single source of mechanical truth that both sdd-check and sdd-audit consume).
#
# macOS bash 3.2 compatible: grep -E / sed -E / awk only. No grep -P, no GNU sed -i.

# Canonical cascade categories. Protocol `*.directive.xml` files are never rules even when stored in
# one of these directories. The predicate accepts repo-relative and absolute paths.
SDD_RULE_PATH_RE='(^|/)(ai/directives|plugins/[a-z0-9-]+/directives)/(architecture|coding|infra|quality|testing)/[^/]+\.xml$'

sdd_lib_is_rule_path() {
    local path="$1"
    [[ "$path" =~ $SDD_RULE_PATH_RE ]] && [[ "$path" != *.directive.xml ]]
}

# Extract Meta.Status flag from a ticket. Echoes: DONE | TODO | IN_PROGRESS | BLOCKED | UNKNOWN
sdd_lib_status() {
    local f="$1" line flag
    line=$(head -60 "$f" 2>/dev/null | grep -m1 -E '^\s*-?\s*\*?\*?Status:\*?\*?\s*\[.\]' || true)
    [[ -z "$line" ]] && { echo "UNKNOWN"; return; }
    flag=$(echo "$line" | sed -nE 's/.*\[(.)\].*/\1/p')
    case "$flag" in
        x|X) echo "DONE" ;;
        ' ') echo "TODO" ;;
        '~') echo "IN_PROGRESS" ;;
        '!') echo "BLOCKED" ;;
        *)   echo "UNKNOWN" ;;
    esac
}

# Accepted Task-ID grammar, both conventions: legacy `TSK-NN`, and the path-based
# `TSK-{PREFIX}-{NNN}` that scaffold.directive.xml AX_TASK_ID_UNIQUENESS mandates
# (TSK-IB-001, TSK-TDSQ-003). The path-based form takes EXACTLY three digits, so a
# typo like `TSK-IB-1` is rejected rather than silently matching nothing.
SDD_TASK_ID_RE='TSK-([A-Z]+-[0-9]{3}|[0-9]+)'

# Extract Task-ID from a ticket Meta. Echoes the ID or empty string.
sdd_lib_task_id() {
    local f="$1"
    head -30 "$f" 2>/dev/null \
        | grep -m1 -oE "Task-ID:\*?\*?[[:space:]]*$SDD_TASK_ID_RE" \
        | grep -oE "$SDD_TASK_ID_RE" || true
}

# Derive the Task-ID a ticket's filename claims. Echoes the ID or empty string.
# Naming mirrors the ID: `<name>.task-NN.md` / `<name>.{PREFIX}-{NNN}.md`.
sdd_lib_task_id_from_path() {
    basename "$1" | sed -nE 's/^.*\.task-([0-9]+)\.md$/TSK-\1/p; s/^.*\.([A-Z]+-[0-9]{3})\.md$/TSK-\1/p'
}

# Map a tracker-row status cell (`[x]` DONE etc.) to canonical token for ONE Task-ID.
# Args: <tracker-file> <Task-ID>. Echoes DONE|TODO|IN_PROGRESS|BLOCKED|UNKNOWN (UNKNOWN if no row).
sdd_lib_tracker_status() {
    local tr="$1" id="$2" row flag
    # Row form: | [TSK-NN](...) | ... | `[x]` DONE | ... |  (also bare TSK-NN)
    row=$(grep -m1 -E "\|[[:space:]]*\[?${id}[]\(]" "$tr" 2>/dev/null || true)
    [[ -z "$row" ]] && { echo "UNKNOWN"; return; }
    flag=$(echo "$row" | sed -nE 's/.*`?\[(.)\]`?[[:space:]]+(DONE|TODO|IN_PROGRESS|BLOCKED).*/\1/p')
    case "$flag" in
        x|X) echo "DONE" ;;
        ' ') echo "TODO" ;;
        '~') echo "IN_PROGRESS" ;;
        '!') echo "BLOCKED" ;;
        *)   echo "UNKNOWN" ;;
    esac
}

# Header-trio presence for a source file. Echoes three space-separated flags: <file> <consumers> <tasks>
# Each flag is 1 (marker present) or 0 (absent). `@tasks: N/A` counts as present.
sdd_lib_header_flags() {
    local f="$1" hf=0 hc=0 ht=0
    head -20 "$f" 2>/dev/null | grep -qE '@file:'      && hf=1
    head -20 "$f" 2>/dev/null | grep -qE '@consumers:'  && hc=1
    head -20 "$f" 2>/dev/null | grep -qE '@tasks:'      && ht=1
    echo "$hf $hc $ht"
}
