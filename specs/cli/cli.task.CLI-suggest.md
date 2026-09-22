# Task: CLI-suggest — vcs-reply suggestion блоки

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** CLI-suggest | **Status:** [x] DONE | **Scope:** cli | **Module:** vcs-reply | **Dependencies:** None
- **Purpose:** line-item vcs-reply: `suggestion` + `suggestionRange` поля → сборка ```suggestion:-A+B блока
- **Spec:** [cli.spec.md §FR-VR-15..17](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit

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
- **Target Files:** `cli/cmd/vcs-reply/vcs-reply.cmd.ts`
- **Exit:** suggestion поле парсится; suggestionRange → корректный :-A+B; блок добавляется в body

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `cli/cmd/vcs-reply/__tests__/vcs-reply.suggestion.test.ts`
- **Exit:** 4 BDD covered

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. BDD

- suggestion + position (линия) → `suggestion:-0+0\n<suggestion>\n` в body
- suggestionRange {above:1, below:2} → ```suggestion:-1+2
- suggestion + body → блок добавлен к body
- --dry-run → показывает итоговый body с suggestion-блоком

**Scenario:** Ошибка: suggestion без position [`unit`]

- **Given** reply item содержит suggestion, но не содержит position
- **When** `vcs-reply` валидирует batch
- **Then** batch отклоняется с `INVALID_ARGS`

<!--/SECTION:BDD-->
<!--SECTION:TEST_COVERAGE-->

## 5. Test Scenario Coverage

- Ошибка: suggestion без position → `vcs-reply.cmd.test.ts` :: `should reject suggestion block without position`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-06-26T18:02:43Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:02:43Z` ver npm run lint:contracts → pass exit=0
- [x] `2026-06-26T18:02:43Z` ver npm run test → pass exit=0
- [x] `2026-06-26T18:02:43Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:02:43Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-reply/vcs-reply.cmd.ts]; decisions: [suggestion-requires-position=true, suggestionRange-default=0/0, suggestion-block-format=-A+B]; open: []

#### P2

- [x] `2026-06-26T18:07:54Z` insight в тикете отсутствует §5 Verification — для test-фазы проверяется через sdd verify и node --test
- [x] `2026-06-26T18:07:54Z` intro vcs-reply.suggestion.test.ts ← P2:test — 4 BDD + 2 boundary cases для suggestion и suggestionRange
- [x] `2026-06-26T18:07:54Z` intro VcsDiscussionPosition ← type imported for minimal valid position fixture
- [x] `2026-06-26T18:07:54Z` insight sdd verify test-gate нашёл 4 pre-existing failures (lint.cmd.test.ts:3 subtests + vcs-diff:1 suite), не связанных с P2 — устранение вне скоупа этой фазы
- [x] `2026-06-26T18:07:54Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:07:54Z` ver npx tsx cli/gennady.ts lint cli/cmd/vcs-reply/**tests**/vcs-reply.suggestion.test.ts → pass exit=0
- [x] `2026-06-26T18:07:54Z` ver node --import tsx --test --experimental-test-module-mocks cli/cmd/vcs-reply/**tests**/vcs-reply.suggestion.test.ts → pass exit=0
- [x] `2026-06-26T18:07:54Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:07:54Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-reply/__tests__/vcs-reply.suggestion.test.ts]; decisions: [4-BDD-covered=true, 2-boundary-added=suggestion-only+suggestion-no-position, pre-existing-test-failures=lint.cmd+vcs-diff]; open: []

<!--/SECTION:EXECUTION_LOG-->
