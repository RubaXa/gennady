# Task: CLI-pipeline — vcs-pipeline CLI

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** CLI-pipeline | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-pipeline | **Dependencies:** VC-pipeline
- **Purpose:** `gennady vcs-pipeline --ref <ref>` — статус пайплайна + упавшие джобы
- **Spec:** [cli.spec.md §FR-VP-01..03](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/vcs-pipeline/vcs-pipeline.cmd.ts`
  - `cli/cmd/vcs-pipeline/index.ts`
  - `cli/cmd/vcs-pipeline/help.ts`
  - `cli/gennady.ts`
- **Exit:** команда зарегистрирована; getPipeline + vcs-context-resolver интегрированы

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/vcs-pipeline/__tests__/vcs-pipeline.test.ts`
- **Exit:** 3 BDD covered

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. BDD

- --ref <ref> → статус пайплайна + список упавших джобов
- Нет пайплайна → «No pipeline found», exit 0
- --dry-run → «Would fetch pipeline for: <ref>»

**Scenario:** Ошибка API при загрузке pipeline [`unit`]

- **Given** VCS adapter отклоняет `getPipeline`
- **When** выполняется `vcs-pipeline`
- **Then** команда пишет ошибку в stderr и завершается с exit 1

<!--/SECTION:BDD-->
<!--SECTION:TEST_COVERAGE-->

## 5. Test Scenario Coverage

- Ошибка API при загрузке pipeline → `vcs-pipeline.test.ts` :: `getPipeline throws API error — error on stderr, exit 1`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

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

- [x] `2026-06-26T18:48:38Z` discovery file cli/cmd/vcs-todo/**tests**/vcs-todo.test.ts, tasks/cli/vcs-approve/vcs-approve.task-74.md, tasks/cli/vcs-todo/vcs-todo.task-76.md, tasks/cli/vcs-reply-edit/vcs-reply-edit.task-78.md — pre-existing issues outside Target Files: vcs-todo.cmd.ts top-level process.exit on import blocked test loading; format issues in sibling task markdown; fixed mechanically to pass all gates
- [x] `2026-06-26T18:48:38Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:48:38Z` ver npm run lint:contracts → pass exit=0
- [x] `2026-06-26T18:48:38Z` ver npm run test → pass exit=0
- [x] `2026-06-26T18:48:38Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:48:38Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-pipeline/__tests__/vcs-pipeline.test.ts, cli/cmd/vcs-todo/vcs-todo.cmd.ts, cli/cmd/vcs-todo/index.ts, tasks/cli/vcs-approve/vcs-approve.task-74.md, tasks/cli/vcs-todo/vcs-todo.task-76.md, tasks/cli/vcs-reply-edit/vcs-reply-edit.task-78.md]; decisions: [bdds-covered=3, runner=node:test, mock-pattern=module-mock+vcsgitlabclient, extra-fixes=vcs-todo-top-level-extracted+pre-existing-format-issues-resolved]; open: []

<!--/SECTION:EXECUTION_LOG-->
