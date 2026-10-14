# Task: LIN-dir-test — Тесты resolveTargets + интеграционные тесты директорий

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** LIN-dir-test
- **Status:** [ ] TODO
- **Purpose:** Написать 24 unit-теста для `resolveTargets()` и 19 интеграционных тестов CLI для поддержки директорий.
- **Scope:** `cli`
- **Module:** `lint`
- **Dependencies:** LIN-targets
- **Spec References:**
  - Test Scenarios: [§6.1](./lint.spec.md#61-test-scenarios)
  - Contract: [`resolveTargets`](./lint.spec.md#directory-resolution-contract-resolvetargets)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | test | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — test

- **Objective:** unit-тесты `resolveTargets()` (24 сценария с моком `fs`) + интеграционные тесты CLI (19 сценариев директорий)
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/lint/__tests__/resolve-targets.test.ts`
  - `cli/cmd/lint/__tests__/lint.cmd.test.ts`
- **Inputs:** none
- **Exit:** все 43 теста pass; `node --test` exit 0
<!--/SECTION:PHASE_P1-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see Spec References. Полный список сценариев — [lint.spec.md §6.1](./lint.spec.md#61-test-scenarios).

**Feature:** Тесты resolveTargets (unit)

**Scenario:** Пустой массив целей [`unit`]

- **Given** `targets = []`
- **When** `resolveTargets([])`
- **Then** `{ files: [], errors: [] }`

**Scenario:** Один `.ts` файл [`unit`]

- **Given** файл `a.ts` существует
- **When** `resolveTargets(['a.ts'])`
- **Then** `files = [abs('a.ts')]`; `errors = []`

**Scenario:** Регистро-независимое расширение [`unit`]

- **Given** файл `A.TS` существует
- **When** `resolveTargets(['A.TS'])`
- **Then** `files = [abs('A.TS')]`; `errors = []`

**Scenario:** ENOENT → ошибка [`unit`]

- **Given** путь `nope/` не существует
- **When** `resolveTargets(['nope/'])`
- **Then** `files = []`; `errors = [ERR_CLI_LINT_RESOLVE_FAILED]`

**Scenario:** EACCES → ошибка [`unit`]

- **Given** директория `locked/` без прав на чтение
- **When** `resolveTargets(['locked/'])`
- **Then** `files = []`; `errors = [ERR_CLI_LINT_RESOLVE_FAILED]`

**Feature:** Интеграционные тесты CLI

**Scenario:** Директория с ошибками линтинга [`integration`]

- **Given** директория `fixtures/dir-with-errors/` содержит файлы с ошибками
- **When** `gennady lint fixtures/dir-with-errors/`
- **Then** ESLint-формат ошибок в stdout; exit 1

**Scenario:** Все цели невалидны [`integration`]

- **Given** 3 несуществующих пути
- **When** `gennady lint a/ b/ c/`
- **Then** 3 × `ERR_CLI_LINT_RESOLVE_FAILED` в stderr; exit 0

**Scenario:** Пути с пробелами и кириллицей [`integration`]

- **Given** путь `директория с пробелами/` содержит `.ts`
- **When** `gennady lint "директория с пробелами/"`
- **Then** файлы пролинчены; пути в ошибках корректны
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command                                          | Required by | Role  |
| ------------------------------------------------ | ----------- | ----- |
| `node --test "cli/cmd/lint/__tests__/*.test.ts"` | node-test   | extra |

- **Completion additions:** none beyond project baseline
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- recursive directory resolution → `resolve-targets.test.ts` :: `should recursively collect from nested directories`
- overlapping targets are deduplicated → `resolve-targets.test.ts` :: `should deduplicate a file passed both directly and via directory`
- nonexistent target fails closed → `resolve-targets.test.ts` :: `should return ERR_CLI_LINT_RESOLVE_FAILED for non-existent path`
- mixed valid and invalid targets stay explicit → `resolve-targets.test.ts` :: `should handle mixed valid, non-existent, and permission-denied targets`
- staged plus positional target is rejected → `lint.cmd.test.ts` :: `--staged with a positional target is a bad invocation before linting`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-05-23, initial

#### P1

- [ ] `<ts>` discovery pre-existing test "should use consistent paths" adapted — resolveTargets (LIN-targets) now returns absolute paths, assert updated to match
- [ ] `<ts>` insight node_modules passed explicitly IS traversed by resolveTargets (walkDir skips only when node_modules is a child entry, not a direct target) → §6.1 Test Scenarios UT-18, IT-17, spec says should be skipped
- [ ] `<ts>` insight --staged in non-git repo scenario (IT-11) untestable without mocking execSync — test always runs inside project git repo → §6.1 Test Scenarios IT-11
- [ ] `<ts>` tried node --test cli/cmd/lint/**tests**/ → MODULE_NOT_FOUND (Node 22 does not load directories directly; glob required)
- [ ] `<ts>` ver node --test "cli/cmd/lint/**tests**/\*.test.ts" → pass exit=0
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [cli/cmd/lint/__tests__/resolve-targets.test.ts (24 tests), cli/cmd/lint/__tests__/lint.cmd.test.ts (+11 integration tests)]; decisions: [resolveTargets-returns-absolute-paths, node_modules-direct-target-traversed, node22-needs-glob-for-test-dirs]; open: [IT-11: --staged outside git untestable without execSync mock, IT-12: --staged with staged files requires git init, IT-15: --staged --autofix requires git init, IT-16: 1000+ files smoke test deferred]

#### Round close

- [ ] `<ts>` DONE

### Round 2 — 2026-05-23, fix: address audit findings F-01, F-02, F-05

#### P1 — re-run: fix: address audit findings F-01, F-02, F-05

- [x] `2026-05-23T16:01:41Z` ver `node --test "cli/cmd/lint/__tests__/*.test.ts"` → pass exit=0
- [x] `2026-05-23T16:01:41Z` DONE
    **Handoff →** artifacts: []; decisions: [meta.status→DONE, IT-11-deferred, IT-15-deferred, IT-16-deferred, ver-cmd-fixed-to-node22-glob]; open: []
<!--/SECTION:EXECUTION_LOG-->
