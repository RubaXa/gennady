# sdd-execute / scripts

Helper scripts bundled with the `sdd-execute` skill. They live alongside the skill, not in any project — invoke via absolute path `~/Developer/gennady/ai/skills/sdd-execute/scripts/sdd`.

All scripts honor the contract: **never produce silent empty output**. On miss, they emit actionable diagnostic instructions and a non-zero exit code. Phase agents and audit agents can therefore rely on either content-on-stdout (exit 0) or instruction-on-stdout (exit ≠ 0) to drive their next decision.

## Entry point — `sdd` dispatcher

```bash
~/Developer/gennady/ai/skills/sdd-execute/scripts/sdd help                                 # surface
~/Developer/gennady/ai/skills/sdd-execute/scripts/sdd extract <file> <SECTION_NAME>        # extract anchored section
~/Developer/gennady/ai/skills/sdd-execute/scripts/sdd lint <file>...                       # gennady DBC AST contract lint
~/Developer/gennady/ai/skills/sdd-execute/scripts/sdd verify <file>...                     # comprehensive gate (typecheck + lint + grep)
~/Developer/gennady/ai/skills/sdd-execute/scripts/sdd check-blockers <ticket-file>         # scan Execution Log per AX_BLOCKER_RESOLUTION_TRAIL
~/Developer/gennady/ai/skills/sdd-execute/scripts/sdd scan [project-root]                  # one-shot rich snapshot for triage skills
```

Single permission rule covers all subcommands:

```json
"Bash(~/Developer/gennady/ai/skills/sdd-execute/scripts/sdd *)"
```

Or broader:

```json
"Bash(~/Developer/gennady/ai/skills/sdd-execute/scripts/*)"
```

## Files

| File                 | Purpose                                                                                                                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdd`                | Command dispatcher (single entry point)                                                                                                                                                                                                                                                                              |
| `extract-section.sh` | Extract `<!--SECTION:NAME-->...<!--/SECTION:NAME-->` block from markdown                                                                                                                                                                                                                                             |
| `lint-artifacts.sh`  | Run gennady DBC AST contract lint; parse output reliably                                                                                                                                                                                                                                                             |
| `verify.sh`          | Three-gate verification: typecheck + gennady DBC lint + forbidden-construct grep                                                                                                                                                                                                                                     |
| `check-blockers.sh`  | Detect unresolved BLOCKER entries in ticket Execution Log per `AX_BLOCKER_RESOLUTION_TRAIL`                                                                                                                                                                                                                          |
| `scan.sh`            | Emit comprehensive project snapshot ([HEADER]/[TASKS]/[TRACKERS]/[SPECS]/[WARNINGS]/[SUMMARY]). Designed so triage skills make ONE call instead of many ad-hoc find/grep. Surfaces suspicious states automatically (DONE+placeholders, DONE+active-blocker, anchor mismatch, unparseable Status, broken spec links). |

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
- A working directory with `npm` and `tsc` available (for `verify`).

If the project doesn't satisfy these expectations, scripts emit actionable diagnostics; they never silently fail.
