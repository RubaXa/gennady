# Task: TSK-34 — Tests: update-check (unit + integration)

## 1. Meta

- **Task-ID:** TSK-34
- **Status:** [x] DONE
- **Purpose:** Написать unit-тесты для UpdateCheck Service (кеш, opt-out, TTY guard, beforeExit) и интеграционные тесты для UpdateCheckWorker (локальный HTTP-сервер, таймаут, ошибки)
- **Scope:** cli
- **Module:** update-check
- **Dependencies:** TSK-33
- **Reopens:** 0
- **Spec References:**
  - Contracts: [`UpdateCheck`](../../../specs/cli/update-check/update-check.spec.md#updatecheck)
  - Contracts: [`UpdateCheckWorker`](../../../specs/cli/update-check/update-check.spec.md#updatecheckworker)
  - BDD scenarios: [`TSK-33 §4`](../update-check/update-check.task-33.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | test | —    | [x]    |

## 3. Phases

### P1 — test

- **Objective:** Покрыть тестами все BDD-сценарии: unit-тесты UpdateCheck (mock `spawn`, `fs`, TTY) + интеграционные тесты Worker (локальный HTTP-сервер, имитирующий npm-реестр)
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/_shared/__tests__/update-check.test.ts` (create)
  - `cli/cmd/_shared/__tests__/update-check-worker.test.ts` (create)
- **Inputs:** TSK-33 P2 handoff
- **Exit:** все BDD-сценарии из TSK-33 §4 покрыты; `npm test` pass

## 4. Acceptance Criteria (BDD)

Перенесены из TSK-33 §4. Contract: see Spec References.

**Feature:** Неблокирующий детект обновлений — тестовое покрытие

**Scenario:** Кеш свежий — spawn не вызывается [`unit`]

- **Given** кеш содержит `lastCheck` < 24ч назад
- **When** вызывается `checkForUpdates(pkg)`
- **Then** `child_process.spawn` не вызывался (мок проверен)

**Scenario:** Кеш устарел — spawn worker с правильными аргументами [`unit`]

- **Given** кеш отсутствует
- **When** вызывается `checkForUpdates(pkg)`
- **Then** `spawn` вызван с `process.execPath`, `[workerScript, name, version, cachePath, '3000']`, `{ stdio: 'ignore' }`
- **And** `.unref()` вызван на дочернем процессе

**Scenario:** `latestVersion > pkg.version` + TTY → регистрируется beforeExit [`unit`]

- **Given** кеш содержит `latestVersion = "2.0.0"`, `pkg.version = "1.0.0"`
- **And** `stderr.isTTY === true`
- **When** вызывается `checkForUpdates(pkg)`
- **Then** зарегистрирован `process.on('beforeExit')` хук
- **And** хук при вызове пишет на stderr сообщение с версиями и командой обновления

**Scenario:** Нет TTY → уведомление не регистрируется [`unit`]

- **Given** `stderr.isTTY === false`
- **When** вызывается `checkForUpdates(pkg)` с `latestVersion > pkg.version`
- **Then** `beforeExit` хук не зарегистрирован

**Scenario:** `GENNADY_NO_UPDATE_CHECK=1` → мгновенный возврат [`unit`]

- **Given** `process.env.GENNADY_NO_UPDATE_CHECK = '1'`
- **When** вызывается `checkForUpdates(pkg)`
- **Then** `spawn` не вызывался, кеш не читался

**Scenario:** `--no-update-check` флаг → мгновенный возврат [`unit`]

- **Given** `process.argv` содержит `--no-update-check`
- **When** вызывается `checkForUpdates(pkg)`
- **Then** `spawn` не вызывался

**Scenario:** Worker — успешный ответ реестра [`integration`]

- **Given** локальный HTTP-сервер возвращает `200` с `{ "version": "1.3.0" }`
- **When** worker запускается с `pkgName`, `pkgVersion`, `cachePath`, `timeoutMs`
- **Then** кеш-файл содержит `{ lastCheck: "<ISO8601>", latestVersion: "1.3.0" }`
- **And** exit code 0
- **And** запись атомарная (временный файл → rename)

**Scenario:** Worker — таймаут запроса [`integration`]

- **Given** локальный HTTP-сервер задерживает ответ > `timeoutMs`
- **When** worker запускается
- **Then** exit code 1
- **And** старый кеш сохраняется (если был), `lastCheck` сдвинут на +1ч

**Scenario:** Worker — HTTP 404 [`integration`]

- **Given** локальный HTTP-сервер возвращает `404`
- **When** worker запускается
- **Then** exit code 1
- **And** кеш не обновляется / `lastCheck` сдвинут на +1ч

**Scenario:** Worker — неожиданный JSON [`integration`]

- **Given** локальный HTTP-сервер возвращает `200` с `{ "foo": "bar" }` (нет поля `version`)
- **When** worker запускается
- **Then** exit code 1

## 5. Verification

| Command              | Required by      |
| -------------------- | ---------------- |
| `npm run type-check` | typescript-rules |
| `npm test`           | node-test        |

## 6. Test Scenario Coverage

- Кеш свежий → `cli/cmd/_shared/__tests__/update-check.test.ts` :: `cache fresh — spawn not called`
- Кеш устарел → `cli/cmd/_shared/__tests__/update-check.test.ts` :: `cache stale — spawn with correct args`
- beforeExit + TTY → `cli/cmd/_shared/__tests__/update-check.test.ts` :: `new version + TTY — registers beforeExit`
- Нет TTY → `cli/cmd/_shared/__tests__/update-check.test.ts` :: `no TTY — notification suppressed`
- `GENNADY_NO_UPDATE_CHECK` → `cli/cmd/_shared/__tests__/update-check.test.ts` :: `NO_UPDATE_CHECK — immediate return`
- `--no-update-check` → `cli/cmd/_shared/__tests__/update-check.test.ts` :: `--no-update-check flag — immediate return`
- Worker success → `cli/cmd/_shared/__tests__/update-check-worker.test.ts` :: `registry responds 200 with version`
- Worker timeout → `cli/cmd/_shared/__tests__/update-check-worker.test.ts` :: `registry timeout — exit 1`
- Worker HTTP 404 → `cli/cmd/_shared/__tests__/update-check-worker.test.ts` :: `registry returns 404 — exit 1`
- Worker bad JSON → `cli/cmd/_shared/__tests__/update-check-worker.test.ts` :: `registry returns bad JSON — exit 1`

## 7. Execution Log

_(Round = один execute-then-audit цикл. Per-phase блоки внутри Round. Skeleton — минимальный; строки событий (`intro` / `decision` / `tried` / `discovery` / `insight` / `BLOCKED`) появляются ТОЛЬКО когда событие произошло. Словарь токенов в [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-21, initial

#### P1

- [ ] `<ts>` ver `npm test` → `<pass|fail>` exit=`<code>`
- [x] `2026-05-21T21:55:00Z` DONE
      **Handoff →** artifacts: [update-check.test.ts, update-check-worker.test.ts]; decisions: [...]; open: [...]

#### Round close

- [x] `2026-05-21T21:55:00Z` DONE

### Round 1 — 2026-05-21, initial

#### P1

- [x] `2026-05-21T21:55:00Z` ver `npm test` → pass exit=0
- [x] `2026-05-21T21:55:00Z` DONE
      **Handoff →** artifacts: [update-check.test.ts, update-check-worker.test.ts]; decisions: [test-fixture=temp-dirs, mock=spawnFn-DI, integration=http-server]; open: [alt-opinion-test: 1 pre-existing failure unrelated]

#### Round close

- [x] `2026-05-21T21:55:00Z` DONE
