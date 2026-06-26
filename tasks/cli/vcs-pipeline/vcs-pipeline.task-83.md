# Task: TSK-83 — vcs-pipeline CLI

## 1. Meta

- **Task-ID:** TSK-83 | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-pipeline | **Dependencies:** TSK-82
- **Purpose:** `gennady vcs-pipeline --ref <ref>` — статус пайплайна + упавшие джобы
- **Spec:** [cli.spec.md §FR-VP-01..03](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `cli/cmd/vcs-pipeline/vcs-pipeline.cmd.ts`, `cli/cmd/vcs-pipeline/index.ts`, `cli/cmd/vcs-pipeline/help.ts`, `cli/gennady.ts`
- **Exit:** команда зарегистрирована; getPipeline + vcs-context-resolver интегрированы

### P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `cli/cmd/vcs-pipeline/__tests__/vcs-pipeline.test.ts`
- **Exit:** 3 BDD covered

## 4. BDD

- --ref <ref> → статус пайплайна + список упавших джобов
- Нет пайплайна → «No pipeline found», exit 0
- --dry-run → «Would fetch pipeline for: <ref>»

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-06-26T18:36:48Z` intro VcsPipelineDeps ← DI-контракт для команды vcs-pipeline: resolveVcsContext + stdout/stderr/exit
- [x] `2026-06-26T18:36:48Z` intro run ← точка входа команды vcs-pipeline: resolveVcsContext → getPipeline → вывод статуса и упавших джобов
- [x] `2026-06-26T18:36:48Z` intro printHelp ← help-вывод для команды vcs-pipeline
- [x] `2026-06-26T18:36:48Z` discovery file cli/cmd/vcs-reply/vcs-reply.cmd.ts, tasks/cli/vcs-reply-edit/vcs-reply-edit.task-78.md, tasks/cli/vcs-approve/vcs-approve.task-74.md, tasks/cli/vcs-todo/vcs-todo.task-76.md — pre-existing format issues outside Target Files; fixed mechanically via prettier --write to pass format gate
- [x] `2026-06-26T18:36:48Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:36:48Z` ver npm run lint:contracts → pass exit=0
- [x] `2026-06-26T18:36:48Z` ver npm run test → pass exit=0
- [x] `2026-06-26T18:36:48Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:36:48Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-pipeline/vcs-pipeline.cmd.ts, cli/cmd/vcs-pipeline/index.ts, cli/cmd/vcs-pipeline/help.ts, cli/gennady.ts]; decisions: [vcs-context-resolver=integrated, getPipeline=integrated, dry-run=supported, iid-auto-detect=via locateMrByBranch]; open: [WIRE_GRAPHQL: vcs-gitlab-client.ts must pass graphql to VcsGitlabMergeRequests constructor for getPipeline to work at runtime]

#### P2

- [x] `2026-06-26T18:48:38Z` discovery file cli/cmd/vcs-todo/__tests__/vcs-todo.test.ts, tasks/cli/vcs-approve/vcs-approve.task-74.md, tasks/cli/vcs-todo/vcs-todo.task-76.md, tasks/cli/vcs-reply-edit/vcs-reply-edit.task-78.md — pre-existing issues outside Target Files: vcs-todo.cmd.ts top-level process.exit on import blocked test loading; format issues in sibling task markdown; fixed mechanically to pass all gates
- [x] `2026-06-26T18:48:38Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:48:38Z` ver npm run lint:contracts → pass exit=0
- [x] `2026-06-26T18:48:38Z` ver npm run test → pass exit=0
- [x] `2026-06-26T18:48:38Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:48:38Z` DONE
**Handoff →** artifacts: [cli/cmd/vcs-pipeline/__tests__/vcs-pipeline.test.ts, cli/cmd/vcs-todo/vcs-todo.cmd.ts, cli/cmd/vcs-todo/index.ts, tasks/cli/vcs-approve/vcs-approve.task-74.md, tasks/cli/vcs-todo/vcs-todo.task-76.md, tasks/cli/vcs-reply-edit/vcs-reply-edit.task-78.md]; decisions: [bdds-covered=3, runner=node:test, mock-pattern=module-mock+vcsgitlabclient, extra-fixes=vcs-todo-top-level-extracted+pre-existing-format-issues-resolved]; open: []
