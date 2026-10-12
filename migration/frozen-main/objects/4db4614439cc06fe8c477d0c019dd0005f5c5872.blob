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

# Extract Task-ID (TSK-NN) from a ticket Meta. Echoes the ID or empty string.
sdd_lib_task_id() {
    local f="$1"
    head -30 "$f" 2>/dev/null \
        | grep -m1 -oE 'Task-ID:\*?\*?\s*TSK-[0-9]+' \
        | grep -oE 'TSK-[0-9]+' || true
}

# Map a tracker-row status cell (`[x]` DONE etc.) to canonical token for ONE Task-ID.
# Args: <tracker-file> <TSK-NN>. Echoes DONE|TODO|IN_PROGRESS|BLOCKED|UNKNOWN (UNKNOWN if no row).
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
