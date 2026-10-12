# @file: Shared SDD artifact parsers — sourced by scan.sh / check.sh, never executed directly.
# @consumers: check.sh (canonical), scan.sh (Task-ID grammar; Status/round parsers migration pending).
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

# THE RULE every Task-ID parser in this tree obeys: extract the WHOLE token first,
# validate it against the anchored grammar second. Matching the grammar *inside* an
# unbounded string is a false-green generator — `TSK-IB-0012` contains the perfectly
# valid prefix `TSK-IB-001`, so an unanchored `grep -oE "$SDD_TASK_ID_RE"` silently
# rewrites an out-of-grammar ID into a different, in-grammar one and reports a match.
#
# Where the ID is embedded in text (tracker cells, `@tasks:` comments) there is no line
# anchor to use, so the token boundary is spelled out below. BSD (macOS) grep has no `\b`
# in ERE, hence an explicit negated class rather than a word-boundary escape.
SDD_TASK_ID_BOUNDARY='([^A-Z0-9-]|$)'

# True when the argument is a Task-ID *in its entirety*. The single grammar gate.
sdd_lib_task_id_valid() {
    [[ "${1:-}" =~ ^$SDD_TASK_ID_RE$ ]]
}

# Extract the raw Task-ID token a ticket Meta declares, WITHOUT validating it: the first
# whitespace-delimited token after `Task-ID:`, stripped of markdown decoration (`` ` ``,
# `*`, `_` are formatting and can never belong to an ID). Echoes the token or empty.
# Callers that need a trustworthy ID use sdd_lib_task_id; this one exists so a bad value
# can be *reported* instead of silently vanishing.
sdd_lib_task_id_raw() {
    local f="$1"
    head -30 "$f" 2>/dev/null \
        | grep -m1 -E 'Task-ID:\*?\*?[[:space:]]' \
        | sed -nE 's/.*Task-ID:\*?\*?[[:space:]]*([^[:space:]]+).*/\1/p' \
        | sed -E 's/^[`*_]+//; s/[`*_]+$//'
}

# Extract Task-ID from a ticket Meta. Echoes the ID, or empty string when the Meta line
# is absent OR carries a value outside the grammar (`TSK-IB-0012`, `TSK-IB-001X`).
sdd_lib_task_id() {
    local token
    token=$(sdd_lib_task_id_raw "$1")
    if sdd_lib_task_id_valid "$token"; then printf '%s\n' "$token"; fi
    return 0
}

# Derive the Task-ID a ticket's filename claims. Echoes the ID or empty string.
# Naming mirrors the ID: `<name>.task-NN.md` / `<name>.{PREFIX}-{NNN}.md`.
# Already whole-token by construction: both sed patterns are `^...$`-anchored on the whole
# basename, so `build.IB-0012.md` yields nothing rather than `TSK-IB-001`.
sdd_lib_task_id_from_path() {
    basename "$1" | sed -nE 's/^.*\.task-([0-9]+)\.md$/TSK-\1/p; s/^.*\.([A-Z]+-[0-9]{3})\.md$/TSK-\1/p'
}

# Map a tracker-row status cell (`[x]` DONE etc.) to canonical token for ONE Task-ID.
# Args: <tracker-file> <Task-ID>. Echoes DONE|TODO|IN_PROGRESS|BLOCKED|UNKNOWN (UNKNOWN if no row).
sdd_lib_tracker_status() {
    local tr="$1" id="$2" row flag
    # Row form: | [TSK-NN](...) | ... | `[x]` DONE | ... |  (also bare TSK-NN)
    # The trailing boundary is what keeps a `| TSK-IB-0012 |` cell from being read as the
    # row of TSK-IB-001: the next character may not be one an ID could continue with.
    # `^` pins the ID to the row's FIRST cell, so a "depends on" cell naming another ticket
    # is not mistaken for that ticket's own row.
    row=$(grep -m1 -E "^[[:space:]]*\|[[:space:]]*\[?${id}$SDD_TASK_ID_BOUNDARY" "$tr" 2>/dev/null || true)
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
