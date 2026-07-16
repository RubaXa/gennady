# Task: TSK-125 — тест-tmp agent-inbox под ~/.gennady (убрать os.tmpdir из границы инструмента)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-125 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-core | **Dependencies:** —
- **Purpose:** Реальная проблема (не отложить): тесты agent-inbox создают временные каталоги в `os.tmpdir()` — вне согласованной границы «весь инструмент только в `~/.gennady`» (NFC-05). Ввести общий тест-хелпер, который делает изолированный temp-каталог под `~/.gennady/scratch/test/` (изоляция сохраняется, per-test cleanup), и перевести на него ВСЕ тесты в границе agent-inbox. Репо-широкий тот же паттерн в других инструментах (dbc/orient/sdd/…) — вне границы agent-inbox, вынесен явно в §4, решение о нём — за оператором (эта задача его НЕ трогает, но и не прячет).
- **Spec:** [inbox-eval.spec.md](../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md), NFC-05 | **Runtime:** not-implemented | **Verification:** unit

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (хелпер + перевод agent-inbox тестов)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-core/test-support/test-tmp.ts` (new) — `makeTestTmpDir(prefix)`: `mkdtempSync(join(getGennadyScratchTestRoot(), prefix))`, где корень = `<StateStore.getStateDir()>/scratch/test` (или `~/.gennady/scratch/test`), с созданием каталога; + `cleanupTestTmp(dir)`. Изоляция как у os.tmpdir, но в границе.
  - Перевести на хелпер тесты agent-inbox, использующие `os.tmpdir()`/`mkdtempSync(join(tmpdir(),…))`: `cli/cmd/inbox-review-plan/inbox-review-plan.test.ts`, `cli/cmd/inbox/config.test.ts`, `cli/cmd/inbox/_core/logic/{inbox-config,reset-inbox,inbox-cmd-config,inbox-registry}.test.ts`, `services/agent-inbox/modules/inbox-core/__tests__/{inbox-config,audit-log,state-store,inbox-registry}.test.ts`, `services/agent-inbox/serve/__tests__/{run-mode,state-seed}.test.ts`, `services/agent-inbox/modules/inbox-roles/__tests__/{artifact-validator,context-builder}.test.ts`, `services/agent-inbox/modules/inbox-eval/__tests__/eval-driver.test.ts`, `services/agent-inbox/modules/inbox-api/__tests__/board-provider.real.test.ts`.
- **Exit:** ни один тест в границе agent-inbox не пишет в `os.tmpdir()` — всё под `~/.gennady/scratch/test/`; полный сьют этих тестов зелёный; type-check + format pass. `rg "tmpdir\(\)" <agent-inbox test files>` → пусто.

<!--/SECTION:PHASE_P1-->

<!--SECTION:BDD-->

## 4. BDD

- GIVEN тест agent-inbox WHEN создаёт temp THEN каталог под `~/.gennady/scratch/test/`, НЕ os.tmpdir
- GIVEN полный прогон agent-inbox тестов WHEN завершён THEN os.tmpdir не использован, сьют зелёный
- НЕ в scope (вынесено явно, не спрятано): тот же os.tmpdir-паттерн в тестах dbc-linter/orient/vcs-worktree/sdd-\*/probe/sync-skills/lint/alt-opinion — вне границы agent-inbox; распространять ли границу на весь репо — решение оператора

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- '<agent-inbox test globs>'` — pass
- `rg "tmpdir\(\)" <agent-inbox test files>` — no matches
- `npm run format:check` — pass

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                             | Level | Test File            |
| ------------------------------------ | ----- | -------------------- |
| makeTestTmpDir корень под ~/.gennady | unit  | test-tmp.\*          |
| agent-inbox тесты не в os.tmpdir     | unit  | (переведённые файлы) |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-07-14T20:18:17Z` intro `makeTestTmpDir` ← test-only helper, creates isolated per-test dir under `<StateStore.getStateDir()>/scratch/test/` (NFC-05 boundary)
- [x] `2026-07-14T20:18:17Z` intro `cleanupTestTmp` ← optional companion cleanup for `makeTestTmpDir`, recursive+idempotent remove
- [x] `2026-07-14T20:18:17Z` discovery `npm run format:check` (внутри `sdd verify`) падал на предсущей неровной ширине столбца в таблице §6 этого тикета (Test Scenario Coverage) — не связано с кодом фазы; поправлено как механический пробельный фикс (без изменения содержания клеток), иначе MANDATORY-гейт не проходил
- [x] `2026-07-14T20:18:17Z` ver `<sdd-path> verify <17 target files>` typecheck → pass exit=0
- [x] `2026-07-14T20:18:17Z` ver `<sdd-path> verify <17 target files>` gennady lint → pass exit=0
- [x] `2026-07-14T20:18:17Z` ver `<sdd-path> verify <17 target files>` test → pass exit=0
- [x] `2026-07-14T20:18:17Z` ver `<sdd-path> verify <17 target files>` format → pass exit=0
- [x] `2026-07-14T20:18:17Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T20:18:17Z` ver `npm run test -- cli/cmd/inbox-review-plan/inbox-review-plan.test.ts cli/cmd/inbox/config.test.ts cli/cmd/inbox/_core/logic/inbox-config.test.ts cli/cmd/inbox/_core/logic/reset-inbox.test.ts cli/cmd/inbox/_core/logic/inbox-cmd-config.test.ts cli/cmd/inbox/_core/logic/inbox-registry.test.ts services/agent-inbox/modules/inbox-core/__tests__/inbox-config.test.ts services/agent-inbox/modules/inbox-core/__tests__/audit-log.test.ts services/agent-inbox/modules/inbox-core/__tests__/state-store.test.ts services/agent-inbox/modules/inbox-core/__tests__/inbox-registry.test.ts services/agent-inbox/serve/__tests__/run-mode.test.ts services/agent-inbox/serve/__tests__/state-seed.test.ts services/agent-inbox/modules/inbox-roles/__tests__/artifact-validator.test.ts services/agent-inbox/modules/inbox-roles/__tests__/context-builder.test.ts services/agent-inbox/modules/inbox-eval/__tests__/eval-driver.test.ts services/agent-inbox/modules/inbox-api/__tests__/board-provider.real.test.ts` → pass exit=0 (163 pass, 0 fail, 2 skipped — pre-existing TTY-only skips)
- [x] `2026-07-14T20:18:17Z` ver `rg "tmpdir\(\)" cli/cmd/inbox-review-plan/inbox-review-plan.test.ts cli/cmd/inbox/config.test.ts cli/cmd/inbox/_core/logic/inbox-config.test.ts cli/cmd/inbox/_core/logic/reset-inbox.test.ts cli/cmd/inbox/_core/logic/inbox-cmd-config.test.ts cli/cmd/inbox/_core/logic/inbox-registry.test.ts services/agent-inbox/modules/inbox-core/__tests__/inbox-config.test.ts services/agent-inbox/modules/inbox-core/__tests__/audit-log.test.ts services/agent-inbox/modules/inbox-core/__tests__/state-store.test.ts services/agent-inbox/modules/inbox-core/__tests__/inbox-registry.test.ts services/agent-inbox/serve/__tests__/run-mode.test.ts services/agent-inbox/serve/__tests__/state-seed.test.ts services/agent-inbox/modules/inbox-roles/__tests__/artifact-validator.test.ts services/agent-inbox/modules/inbox-roles/__tests__/context-builder.test.ts services/agent-inbox/modules/inbox-eval/__tests__/eval-driver.test.ts services/agent-inbox/modules/inbox-api/__tests__/board-provider.real.test.ts` → pass exit=1 (no matches)
- [x] `2026-07-14T20:18:17Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T20:18:17Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-core/test-support/test-tmp.ts, cli/cmd/inbox-review-plan/inbox-review-plan.test.ts, cli/cmd/inbox/config.test.ts, cli/cmd/inbox/_core/logic/inbox-config.test.ts, cli/cmd/inbox/_core/logic/reset-inbox.test.ts, cli/cmd/inbox/_core/logic/inbox-cmd-config.test.ts, cli/cmd/inbox/_core/logic/inbox-registry.test.ts, services/agent-inbox/modules/inbox-core/__tests__/inbox-config.test.ts, services/agent-inbox/modules/inbox-core/__tests__/audit-log.test.ts, services/agent-inbox/modules/inbox-core/__tests__/state-store.test.ts, services/agent-inbox/modules/inbox-core/__tests__/inbox-registry.test.ts, services/agent-inbox/serve/__tests__/run-mode.test.ts, services/agent-inbox/serve/__tests__/state-seed.test.ts, services/agent-inbox/modules/inbox-roles/__tests__/artifact-validator.test.ts, services/agent-inbox/modules/inbox-roles/__tests__/context-builder.test.ts, services/agent-inbox/modules/inbox-eval/__tests__/eval-driver.test.ts, services/agent-inbox/modules/inbox-api/__tests__/board-provider.real.test.ts]; decisions: [test-tmp-root=<StateStore.getStateDir()>/scratch/test, helper-style=sync-mkdtempSync]; open: []

<!--/SECTION:EXECUTION_LOG-->
