# Task: TSK-151 — выровнять worktree-тесты под layout TSK-131

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-151 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** N/A (`cli/cmd/vcs-worktree`) | **Dependencies:** None
- **Purpose:** 5 red-тестов worktree — STALE-TEST (не баг продукта): коммит TSK-131 (`9c44aa8`) переструктурировал `state-paths.logic.ts` (`worktreesRoot` → `mrsRoot`/`mrWorktreeDir`/`mrRoot`, вложенный `<mrsRoot>/<key>/worktree/`), а 3 тест-файла остались на плоском layout. Выровнять тесты; продуктовый код `state-paths.logic.ts`/`worktree-ops.logic.ts` корректен, НЕ трогать.
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
- **Spec References:**
  - Источник изменения: `cli/cmd/inbox/_core/logic/state-paths.logic.ts` (текущие экспорты `mrsRoot`/`mrWorktreeDir`/`mrRoot`)
  - Прецедент: [tasks/README.md#D-215](../README.md)

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | test | —    | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — test

- **Objective:** Выровнять 3 файла: (1) `vcs-worktree.cmd.error.test.ts` и (2) `vcs-worktree.cmd.test.ts` — обновить `mock.module` namedExports с `worktreesRoot` на актуальные `mrsRoot`/`mrWorktreeDir`/`mrRoot` (то, что реально импортит `vcs-worktree.cmd.ts`); (3) `worktree-ops.test.ts` — фикстуры `gcStaleWorktrees`/`removeAllWorktrees`/`prepareMrWorktree` создавать под вложенным `<root>/<key>/worktree/`, а не плоско, и ассертить удаление вложенного пути. Ассерты о ПОВЕДЕНИИ не менять — только пути setup/expect. Запускать с `--experimental-test-module-mocks` (как `npm test`).
- **Rules:**
  - [testing/node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/vcs-worktree/__tests__/vcs-worktree.cmd.test.ts`
  - `cli/cmd/vcs-worktree/__tests__/vcs-worktree.cmd.error.test.ts`
  - `cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts`
- **Inputs:** none
- **Exit:** 3 файла зелёные; `state-paths.logic.ts`/`worktree-ops.logic.ts` не изменены; 0 новых падений против baseline.

<!--/SECTION:PHASE_P1-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References.

**Feature:** worktree-тесты соответствуют вложенному layout TSK-131

**Scenario:** тесты команды worktree импортят актуальные экспорты [`unit`]

- **Given** `state-paths.logic.ts` экспортирует `mrsRoot`/`mrWorktreeDir`/`mrRoot` (не `worktreesRoot`)
- **When** прогоняются `vcs-worktree.cmd.test.ts`/`.error.test.ts`
- **Then** `mock.module` namedExports совпадают с реальным модулем, импорт не бросает `SyntaxError`

**Scenario:** GC/removeAll находят вложенные worktree [`unit`]

- **Given** фикстуры создают `<root>/<key>/worktree/`
- **When** вызваны `gcStaleWorktrees`/`removeAllWorktrees`/`prepareMrWorktree`
- **Then** ассерты об удалении/создании проходят на вложенном пути, поведенческие ожидания не ослаблены

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                                                                                                 | Required by       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `node --import tsx --test --experimental-test-module-mocks cli/cmd/vcs-worktree/__tests__/vcs-worktree.cmd.test.ts cli/cmd/vcs-worktree/__tests__/vcs-worktree.cmd.error.test.ts cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` | testing/node-test |
| `npx tsc --noEmit`                                                                                                                                                                                                                      | testing/node-test |

- **Task-specific Completion additions:** SCOPED gate (D-214) — 0 новых падений против baseline; продуктовый код worktree не тронут.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «актуальные экспорты» → `vcs-worktree.cmd.test.ts` + `vcs-worktree.cmd.error.test.ts` (import-time green)
- Scenario «вложенные worktree» → `worktree-ops.test.ts` :: `gcStaleWorktrees`/`removeAllWorktrees`/`prepareMrWorktree`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-23, initial

#### P1

- [x] `2026-07-23T14:20:59Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-07-23T14:20:59Z` ver `node --import tsx --test --experimental-test-module-mocks cli/cmd/vcs-worktree/__tests__/vcs-worktree.cmd.test.ts cli/cmd/vcs-worktree/__tests__/vcs-worktree.cmd.error.test.ts cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` → pass exit=0
- [x] `2026-07-23T14:20:59Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-worktree/__tests__/vcs-worktree.cmd.test.ts, cli/cmd/vcs-worktree/__tests__/vcs-worktree.cmd.error.test.ts, cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts]; decisions: [mock-namedExports=mrsRoot+mrWorktreeDir, fixture-layout=nested-worktree-subdir]; open: []

<!--/SECTION:EXECUTION_LOG-->
