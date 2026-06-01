# Task: TSK-35 — Fix: downgrade notification + --version flag

## 1. Meta

- **Task-ID:** TSK-35
- **Status:** [x] DONE
- **Purpose:** Fix version comparison in UpdateCheck to prevent downgrade notifications (semver `>` instead of `!==`), add `--version` / `-v` flag to CLI
- **Scope:** cli
- **Module:** update-check
- **Dependencies:** TSK-33, TSK-34
- **Reopens:** 0
- **Spec References:**
  - Contracts: [`UpdateCheck`](../../../specs/cli/update-check/update-check.spec.md#updatecheck) — postcondition `latestVersion > pkg.version` (TSK-33 implementation used `!==` — drift)
  - CLI: [`cli spec §3`](../../../specs/cli/cli.spec.md) — `--version` / `-v` flag
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | fix  | —    | [x]    |

## 3. Phases

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

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Предотвращение downgrade-уведомлений

**Scenario:** Кеш содержит старую версию — уведомление не показывается [`unit`]

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

## 5. Verification

| Command              | Required by      |
| -------------------- | ---------------- |
| `npm run type-check` | typescript-rules |
| `npm test`           | node-test        |

## 6. Test Scenario Coverage

- downgrade prevention → `cli/cmd/_shared/__tests__/update-check.test.ts` :: `stale cache with older version — no downgrade notification`

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
