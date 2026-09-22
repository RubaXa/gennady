# Task: CLI-todo — vcs-todo CLI

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** CLI-todo | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-todo | **Dependencies:** VC-todos
- **Purpose:** `gennady vcs-todo --done <ref>` — закрыть todo(s) по MR через Inbox.markTodoDone
- **Spec:** [cli.spec.md §FR-TD-01..04](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/vcs-todo/vcs-todo.cmd.ts`
  - `cli/cmd/vcs-todo/index.ts`
  - `cli/cmd/vcs-todo/help.ts`
  - `cli/gennady.ts`
- **Exit:** команда зарегистрирована; vcs-context-resolver + markTodoDone интегрированы

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/vcs-todo/__tests__/vcs-todo.test.ts`
- **Exit:** 4 BDD covered

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. BDD

- --done <ref> → markTodoDone по каждому todoId → success
- --id <todoId> → markTodoDone напрямую
- Нет todo → «No pending todos», exit 0
- --dry-run → «Would mark todo done: <id>»

**Scenario:** Ошибка API при markTodoDone [`unit`]

- **Given** VCS adapter отклоняет `markTodoDone`
- **When** выполняется `vcs-todo --id`
- **Then** команда возвращает error result, не скрывая сбой

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command                  | Required by | Role  |
| ------------------------ | ----------- | ----- |
| `npm run type-check`     | P1, P2      | extra |
| `npm run lint:contracts` | P1, P2      | extra |
| `npm test`               | P1, P2      | probe |

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Ошибка API при markTodoDone → `vcs-todo.test.ts` :: `should return error when markTodoDone fails via --id`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-06-26, initial

#### P1

- [ ] `2026-06-26T18:39:26Z` intro `VcsTodoCmd` main function — команда vcs-todo с двумя путями: --done <ref> и --id <todoId>
- [x] `2026-06-26T18:39:26Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:39:26Z` ver npx tsx cli/gennady.ts lint cli/cmd/vcs-todo/vcs-todo.cmd.ts cli/cmd/vcs-todo/index.ts cli/cmd/vcs-todo/help.ts cli/gennady.ts → pass exit=0
- [x] `2026-06-26T18:39:26Z` ver npm run test → pass exit=0
- [x] `2026-06-26T18:39:26Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:39:26Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-todo/vcs-todo.cmd.ts, cli/cmd/vcs-todo/index.ts, cli/cmd/vcs-todo/help.ts, cli/gennady.ts]; decisions: [module-system=esm, vcs-client=VcsGitlabClient, context-resolver=resolveVcsContext]; open: []

#### P2

- [x] `2026-06-26T18:46:33Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:46:33Z` ver npm run lint:contracts → pass exit=0
- [x] `2026-06-26T18:46:33Z` ver npm run test → pass exit=0
- [x] `2026-06-26T18:46:33Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:46:33Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-todo/__tests__/vcs-todo.test.ts]; decisions: [test-runner=node-test, mock-strategy=mock.module, process-exit-guarded=noop-override]; open: []

<!--/SECTION:EXECUTION_LOG-->
