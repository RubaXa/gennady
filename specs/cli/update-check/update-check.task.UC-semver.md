# Task: UC-semver — Fix: downgrade notification + --version flag

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** UC-semver
- **Status:** [ ] TODO
- **Purpose:** Fix version comparison in UpdateCheck to prevent downgrade notifications (semver `>` instead of `!==`), add `--version` / `-v` flag to CLI
- **Scope:** cli
- **Module:** update-check
- **Dependencies:** UC-notify, UC-tests
- **Reopens:** 0
- **Spec References:**
  - Contracts: [`UpdateCheck`](./update-check.spec.md#updatecheck) — postcondition `latestVersion > pkg.version` (UC-notify implementation used `!==` — drift)
  - CLI: [`cli spec §3`](../cli.spec.md) — `--version` / `-v` flag
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | fix  | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — fix

- **Objective:** Исправить сравнение версий с `!==` на `isNewerVersion()` (semver `>`); добавить `--version` / `-v` флаг; покрыть тестом downgrade prevention
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/_shared/update-check.ts` (modify: add `isNewerVersion`, fix comparisons)
  - `cli/gennady.ts` (modify: add `--version` / `-v`)
  - `cli/cmd/_shared/__tests__/update-check.test.ts` (modify: add downgrade prevention test)
- **Inputs:** none
- **Exit:** `npm test` pass; `npm run type-check` pass

<!--/SECTION:PHASE_P1-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Предотвращение downgrade-уведомлений

**Scenario:** Просроченная версия в кеше — уведомление не показывается [`unit`]

- **Given** кеш содержит `latestVersion = "0.7.1"`
- **And** `pkg.version = "0.8.1"` (пользователь обновился)
- **And** `stderr.isTTY === true`
- **When** вызывается `checkForUpdates(pkg)`
- **Then** `beforeExit` хук **не** зарегистрирован
- **And** `spawn` не вызывался (кеш свежий)

**Feature:** CLI version flag

**Scenario:** `--version` выводит версию и выходит

- **Given** запускается `gennady --version`
- **When** команда отрабатывает
- **Then** stdout содержит текущую версию
- **And** exit code 0

**Scenario:** `-v` выводит версию и выходит

- **Given** запускается `gennady -v`
- **When** команда отрабатывает
- **Then** stdout содержит текущую версию
- **And** exit code 0

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command              | Required by      | Role  |
| -------------------- | ---------------- | ----- |
| `npm run type-check` | typescript-rules | extra |
| `npm test`           | node-test        | probe |

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- downgrade prevention → `cli/cmd/_shared/__tests__/update-check.test.ts` :: `stale cache with older version — no downgrade notification`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = один execute-then-audit цикл.)_

### Round 1 — 2026-06-01, initial

#### P1

- [x] `2026-06-01T12:00:00Z` ver `npm test` → pass exit=0
- [x] `2026-06-01T12:00:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-01T12:00:00Z` ver `npm run format:check` → pass
- [x] `2026-06-01T12:00:00Z` DONE
      **Handoff →** artifacts: [cli/cmd/_shared/update-check.ts, cli/gennady.ts, cli/cmd/_shared/__tests__/update-check.test.ts]; decisions: [semver-gt=isNewerVersion, version-flag=--version+-v]; open: []

#### Round close

- [x] `2026-06-01T12:00:00Z` DONE

<!--/SECTION:EXECUTION_LOG-->
