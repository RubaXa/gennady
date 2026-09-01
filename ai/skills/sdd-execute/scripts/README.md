# sdd-execute / scripts

Helper scripts bundled with the `sdd-execute` skill. They live alongside the skill, not in any
project. Resolve `scripts/sdd` relative to the installed `sdd-execute/SKILL.md`, canonicalize it, and
pass that absolute path to dispatched agents. Never assume a particular home-directory checkout.

All scripts honor the contract: **never produce silent empty output**. On miss, they emit actionable diagnostic instructions and a non-zero exit code. Phase agents and audit agents can therefore rely on either content-on-stdout (exit 0) or instruction-on-stdout (exit ≠ 0) to drive their next decision.

## Entry point — `sdd` dispatcher

```bash
SDD_PATH=/absolute/path/to/installed/sdd-execute/scripts/sdd
"$SDD_PATH" help
"$SDD_PATH" extract <file> <SECTION_NAME>
"$SDD_PATH" lint <file>...
"$SDD_PATH" verify <file>...
"$SDD_PATH" check-blockers <ticket-file>
"$SDD_PATH" scan [project-root]
"$SDD_PATH" check [root|--task <Task-ID>|--files f...]
```

Single permission rule covers all subcommands:

```json
"Bash(<resolved-sdd-path> *)"
```

Or broader:

```json
"Bash(<resolved-sdd-scripts-directory>/*)"
```

## Files

| File                 | Purpose                                                                                                                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdd`                | Command dispatcher (single entry point)                                                                                                                                                                                                                                                                              |
| `extract-section.sh` | Extract `<!--SECTION:NAME-->...<!--/SECTION:NAME-->` block from markdown; exit 2 = absent legacy anchor, 3 = unbalanced/duplicate, 5 = present-but-empty                                                                                                                                                                |
| `lint-artifacts.sh`  | Run gennady DBC AST contract lint; parse output reliably                                                                                                                                                                                                                                                             |
| `verify.sh`          | Verification gate. Delegates to `gennady verify` (stack plugins: anystack + golang + node, `.gennadyrc` overrides); legacy npm-script heuristic remains as fallback                                                                                                                                                                                                                                     |
| `check-blockers.sh`  | Detect unresolved BLOCKER entries in ticket Execution Log per `AX_BLOCKER_RESOLUTION_TRAIL`                                                                                                                                                                                                                          |
| `scan.sh`            | Emit comprehensive project snapshot ([HEADER]/[TASKS]/[TRACKERS]/[SPECS]/[WARNINGS]/[SUMMARY]). Designed so triage skills make ONE call instead of many ad-hoc find/grep. Surfaces suspicious states automatically (DONE+placeholders, DONE+active-blocker, anchor mismatch, unparseable Status, broken spec links). |
| `check.sh`           | Deterministic mechanical checks — [TASKID] (collisions, orphan `@tasks`, `unreadable` ticket Meta Task-ID; `unparseable-ref` reported but uncounted), [TRACKER_SYNC], [RULES], [LOG], and [HEADERS] (`--files`). Single source shared by `sdd-check` and `sdd-audit`. Exit 0 clean / 3 findings / 2 structural / 4 bad-invocation. `findings=0` is only ever printed after something was checked: a malformed Task-ID exits 4, and an empty scope (`NO_TICKETS_FOUND`) or an unparseable ticket Meta Task-ID (`TICKET_ID_UNREADABLE`) exit 2. |
| `_sdd-lib.sh`        | Shared artifact parsers (status, Task-ID, tracker-row, header flags) sourced by `check.sh`. Not executed directly. `scan.sh` migration to this lib pending.                                                                                                                                                          |

## Anchor convention (used by `extract`)

Markdown sections delimited by HTML-comment anchors:

```markdown
<!--SECTION:META-->

## 1. Meta

...

<!--/SECTION:META-->
```

Grammar:

- Open: `<!--SECTION:<NAME>-->`
- Close: `<!--/SECTION:<NAME>-->`
- `<NAME>` matches `^[A-Z][A-Z0-9_]*$`

Canonical names: `META`, `PHASES_OVERVIEW`, `PHASE_P<N>`, `BDD`, `VERIFICATION`, `TEST_COVERAGE`, `EXECUTION_LOG`.

## Blocker resolution convention (used by `check-blockers`)

A BLOCKER entry (line containing `🛑` and `BLOCKED`) is considered RESOLVED if a later Round entry contains both `✅` and `RESOLVED`. The script verifies the latest marker is `✅` and counts match, otherwise reports unresolved.

To resolve a blocker, append to ticket Execution Log:

```markdown
### Round N — <date>, <reason>

- ✅ `<timestamp>` RESOLVED Round M BLOCKER (<short reference>): <reason for resolution>
```

## Project-agnostic by design

These scripts know nothing about any specific project. They expect:

- A markdown file with anchored sections (for `extract`).
- A TypeScript file to lint (for `lint`).
- A ticket file with `## 7. Execution Log` section (for `check-blockers`).
- For `verify`: a runnable `gennady` (on PATH, or a checkout at `$GENNADY_HOME`); fallback needs `npm` + `node`.

If the project doesn't satisfy these expectations, scripts emit actionable diagnostics; they never silently fail.
