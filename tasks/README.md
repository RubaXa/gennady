# Project Tasks

## Entry Points

- [Specs Portal](../specs/README.md) — Scope Graph + all scope specs.
- Tickets are picked up ONLY via `sdd-execute`. After `[x] DONE`, run `sdd-audit`.

## Project-Wide Conventions

### File-header Convention

Per `AX_FILE_HEADER_TASK_TRACEABILITY`:

```
// @file: <what the file holds>
// @consumers: <consumer-1, consumer-2, ...>
// @tasks: TSK-01, TSK-02
```

### Completion Rule (baseline)

A task cannot transition to `[x] DONE` until ALL of:

1. Every BDD scenario mapped to test ownership in §4 OR has `Deferred Test Ownership: <task-id>`.
2. Verification commands executed; results + exit codes recorded in Execution Log.
3. Canonical case names match real test cases or ticket updated.
4. `Deferred Runtime Scope` recorded if applicable.
5. Every introduced-beyond-Inventory entity logged as `Introduced <Name> because <reason>`.

Task-specific additions live in each ticket's §3.

### Execution Log Template

Per `AX_EXECUTION_LOG_PLAN_VS_FACT`. Each round = one open-to-DONE cycle; append-only; old rounds NEVER edited.

**Plan format (scaffolding pre-fills per ticket):**

```markdown
### Round 1 — <YYYY-MM-DD>, initial

- [ ] `[<ts>]` Task initialized.
- [ ] `[<ts>]` Implementation file: `<path>`.
- [ ] `[<ts>]` Test file: `<path>`.
- [ ] `[<ts>]` Verification: `<command>` → `<pass|fail>` [`exit=<code>`].
- [ ] `[<ts>]` Scenario coverage: `<scenario>` → `<test-file>::<case>`.
- [ ] `[<ts>]` Self-audit: walked loaded rule axioms against generated code. Violations: `<list or "none">`.
- [ ] `[<ts>]` Introduced (if any): `<Entity>` because `<reason>`.
- [ ] `[<ts>]` Tracker synced: `tasks/<scope>/README.md` + `tasks/README.md`.
- [ ] `[<ts>]` Status: [x] DONE.
```

⛔ `[x]` line with any unreplaced `<…>` literal = fabricated done.

### Post-task Hook

After `[x] DONE`, invoke `sdd-audit` on the ticket. Until audit returns PASS, round is closed-but-unverified.

## High-Level DAG

```mermaid
graph TD
    TSK-02 --> TSK-01
    TSK-03 --> TSK-02
    TSK-05 --> TSK-04
    TSK-07 --> TSK-06
    TSK-08 --> TSK-07
    TSK-09 --> TSK-08
    TSK-10 --> TSK-09
    TSK-11 --> TSK-10
    TSK-19 --> TSK-10
    TSK-20 --> TSK-10
    TSK-21 --> TSK-20
    TSK-13 --> TSK-12
    TSK-14 --> TSK-12
    TSK-15 --> TSK-12
    TSK-16 --> TSK-13
    TSK-16 --> TSK-14
    TSK-16 --> TSK-15
    TSK-17 --> TSK-16
    TSK-18 --> TSK-17
    TSK-32 --> TSK-16
    TSK-49[TSK-49: resolveTargets + LintCommand] --> TSK-16
    TSK-50[TSK-50: Tests resolveTargets + integration] --> TSK-49
    TSK-51[TSK-51: DisablesCheck D-007] --> TSK-50
    TSK-52[TSK-52: DisablesCheck purpose] --> TSK-51
    TSK-24 --> TSK-23
    TSK-25 --> TSK-23
    TSK-25 --> TSK-24
    TSK-26 --> TSK-23
    TSK-26 --> TSK-24
    TSK-26 --> TSK-25
    TSK-28 --> TSK-27
    TSK-29 --> TSK-28
    TSK-30 --> TSK-28
    TSK-31 --> TSK-27
    TSK-31 --> TSK-28
    TSK-31 --> TSK-29
    TSK-31 --> TSK-30
    TSK-34 --> TSK-33
    TSK-36 --> TSK-35
    TSK-37 --> TSK-35
    TSK-38 --> TSK-35
    TSK-38 --> TSK-36
    TSK-38 --> TSK-37
    TSK-39 --> TSK-35
    TSK-40 --> TSK-35
    TSK-41 --> TSK-36
    TSK-41 --> TSK-39
    TSK-46 --> TSK-45
    TSK-47 --> TSK-46
    TSK-47 --> TSK-48
    TSK-43 --> TSK-42
    TSK-44 --> TSK-42
```

## Tracker Index

| Scope             | Type           | Tracker                               | Tasks | Done  |
| ----------------- | -------------- | ------------------------------------- | ----- | ----- |
| dbc               | library        | [README](dbc/README.md)               | 14    | 14/14 |
| cli               | product        | [README](cli/README.md)               | 17    | 17/17 |
| vcs               | product        | [README](vcs/README.md)               | 5     | 5/5   |
| agent-mon         | library        | [README](agent-mon/README.md)         | 7     | 7/7   |
| agent-mon-cli     | product        | [README](agent-mon-cli/README.md)     | 4     | 0/4   |
| infra-npm-publish | infrastructure | [README](infra-npm-publish/README.md) | 3     | 3/3   |

## Decision Log

None — all default choices.
