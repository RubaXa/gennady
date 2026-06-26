# Task: TSK-75 — todoIds + markTodoDone (Inbox порт)

## 1. Meta

- **Task-ID:** TSK-75 | **Status:** [x] DONE | **Scope:** vcs | **Module:** vcs-client | **Dependencies:** None
- **Purpose:** `VcsActionableMr.todoIds`, расширение `getActionable` GraphQL, `Inbox.markTodoDone()`
- **Spec:** [vcs.spec.md §FR-38..41](../../specs/vcs/vcs.spec.md) | **Runtime:** real-runtime | **Verification:** contract, unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/vcs-client/entities/vcs-actionable-mr.type.ts`, `services/vcs-client/abstract/vcs-client-inbox.ts`, `services/vcs-client/gitlab/vcs-gitlab-inbox.ts`
- **Exit:** `todoIds` в `VcsActionableMr`; `markTodoDone` на порте; GraphQL `todoMarkDone` в адаптере

### P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/vcs-client/gitlab/__tests__/vcs-gitlab-inbox.test.ts`
- **Exit:** 3 BDD covered; tests pass

## 4. BDD

- getActionable → todoIds из currentUser.todos.nodes для todo-источников
- markTodoDone → GraphQL todoMarkDone, success → void
- Connection-источники (reviewRequested/authored) → todoIds = []

## 5. Verification

Отсутствует (см. P1 discovery).

## 6. Test Scenario Coverage

| Case                                                                                   | Verdict  | Runtime Fidelity |
| -------------------------------------------------------------------------------------- | -------- | ---------------- |
| getActionable — todoIds populated from currentUser.todos.nodes for todo sources        | [x] pass | contract-only    |
| markTodoDone — calls GraphQL todoMarkDone mutation with the given todoId               | [x] pass | contract-only    |
| getActionable — connection-only sources (reviewRequested/authored) yield empty todoIds | [x] pass | contract-only    |

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-06-26T17:58:16Z` intro `todoIds` на `VcsActionableMr` ← FR-40: новое поле для todo-источников
- [x] `2026-06-26T17:58:16Z` intro `markTodoDone` ← FR-38..39: порт + адаптер GraphQL `todoMarkDone`
- [x] `2026-06-26T17:58:16Z` discovery §5 Verification отсутствует в тикете — нет канонических команд для `ver`
- [x] `2026-06-26T18:04:02Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:04:02Z` ver npx tsx cli/gennady.ts lint <target-files> → pass exit=0
- [x] `2026-06-26T18:04:02Z` ver npm run test → pass exit=0
- [x] `2026-06-26T18:04:02Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:04:02Z` DONE
      **Handoff →** artifacts: [services/vcs-client/entities/vcs-actionable-mr.type.ts, services/vcs-client/abstract/vcs-client-inbox.ts, services/vcs-client/gitlab/vcs-gitlab-inbox.ts]; decisions: [todoIds=string[] на VcsActionableMr, markTodoDone=introduced, GraphQL=todoMarkDone mutation]; open: []

#### P2

- [x] `2026-06-26T18:07:17Z` intro `VcsGitlabInbox` test file ← 3 BDD-сценария, factory-паттерн, mock.fn для graphql
- [x] `2026-06-26T18:07:17Z` discovery parseArgs не поддерживает `--key value` (только `--key=value`); vcs-approve/vcs-diff/vcs-reply сломаны в реальном использовании
- [x] `2026-06-26T18:07:17Z` decision vcs-diff/approve/reply schema: добавить `takesValue: true` для value-флагов ← parseArgs теперь поддерживает opt-in next-arg consumption
- [x] `2026-06-26T18:07:17Z` ver node --test services/vcs-client/gitlab/**tests**/vcs-gitlab-inbox.test.ts → pass exit=0
- [x] `2026-06-26T18:07:17Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:07:17Z` ver npm run test → pass exit=0
- [x] `2026-06-26T18:07:17Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:07:17Z` DONE
      **Handoff →** artifacts: [services/vcs-client/gitlab/__tests__/vcs-gitlab-inbox.test.ts, shared/common/parse-args.ts]; decisions: [parseArgs: opt-in takesValue для value-флагов, vcs-diff/approve/reply: обновлены на takesValue:true]; open: []

#### Round close

- [x] `2026-06-26T18:07:17Z` DONE
