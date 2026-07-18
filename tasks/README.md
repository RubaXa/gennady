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
    TSK-59[TSK-59: agents-rules command]
    TSK-68[TSK-68: vcs-context-resolver (cli)]
    TSK-68 --> TSK-69
    TSK-68 --> TSK-70
    TSK-67[TSK-67: vcs-client approve (vcs)]
    TSK-67 --> TSK-69
    TSK-69[TSK-69: vcs-approve (cli)]
    TSK-70[TSK-70: refactor VCS commands (cli)]
    TSK-71[TSK-71: resolveDiscussion port+adapter (vcs)]
    TSK-71 --> TSK-72
    TSK-72[TSK-72: vcs-reply resolve/reopen (cli)]
```

## Tracker Index

| Scope             | Type           | Tracker                               | Tasks | Done  |
| ----------------- | -------------- | ------------------------------------- | ----- | ----- |
| dbc               | library        | [README](dbc/README.md)               | 14    | 14/14 |
| cli               | product        | [README](cli/README.md)               | 24    | 23/24 |
| vcs               | product        | [README](vcs/README.md)               | 7     | 7/7   |
| agent-mon         | library        | [README](agent-mon/README.md)         | 7     | 7/7   |
| agent-mon-cli     | product        | [README](agent-mon-cli/README.md)     | 4     | 0/4   |
| infra-npm-publish | infrastructure | [README](infra-npm-publish/README.md) | 3     | 3/3   |
| agent-run         | library        | [README](agent-run/README.md)         | 3     | 3/3   |
| agent-inbox       | product        | [README](agent-inbox/README.md)       | 48    | 41/48 |

## Decision Log

- **D-201 (2026-07-17, agent-inbox scaffold extend-dag):** TSK-113 (`inbox-roles`) переоткрыт (Reopens: 1) вместо создания нового тикета для «session↔болванка + ToolPolicy» (D-118…D-123 refine). TSK-113 уже владеет `reviewer.role.ts`/`role-instance.ts`/`role-node.ts`/`artifact-validator.ts` (Round 1, DONE) и Round 1 Handoff уже фиксирует открытые разрывы («session узлы не пишут через EffectExecutor», «buildTaskText контракт») ровно в том месте, которое Round 2 закрывает — новый тикет дублировал бы Target Files и контекст. Per `AX_REOPEN_TICKET_FORMAT`: Round 2 добавлен append-only (P5/P6), старые Rounds не тронуты.
- **D-202 (2026-07-17, agent-inbox scaffold extend-dag):** TSK-137 (ArtifactValidator injection-coverage) остаётся ОТДЕЛЬНЫМ тикетом от TSK-113 Round 2, хотя оба трогают `artifact-validator.ts`/`inbox-roles`. Формально это сходится с «sequential split без (C) = overhead» (`AX_DAG_AND_TICKET_BOUNDARIES`), НО: (a) операторски заданная граница DAG явно разделяет «session-исполнение блванки» (TSK-113 Round 2) от «переопределение критерия гейта» (TSK-137) как разные предметные решения (D-118/AI-39 vs §5.3.1 «Гейт-граундинг»/D-86); (b) TSK-137 зависит от РЕЗУЛЬТАТА TSK-113 Round 2 (заполненные болванки с injected-ссылками), не может стартовать параллельно. Раздельные тикеты сохраняют чистую Round-историю TSK-113 (Round 2 не разрастается третьим предметом).
