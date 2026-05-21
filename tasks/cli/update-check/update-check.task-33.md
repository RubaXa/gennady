# Task: TSK-33 — Bootstrap + Impl: update-check механизм

## 1. Meta

- **Task-ID:** TSK-33
- **Status:** [x] DONE
- **Purpose:** Реализовать неблокирующий механизм детекта обновлений: вшить версию в бандл, создать UpdateCheck Service + UpdateCheckWorker, интегрировать вызов в gennady.ts
- **Scope:** cli
- **Module:** update-check
- **Dependencies:** None
- **Spec References:**
  - Contracts: [`UpdateCheck`](../../../specs/cli/update-check/update-check.spec.md#updatecheck)
  - Contracts: [`UpdateCheckWorker`](../../../specs/cli/update-check/update-check.spec.md#updatecheckworker)
  - Contracts: [`UpdateCheckCache`](../../../specs/cli/update-check/update-check.spec.md#updatecheckcache)
  - Constraints: [`cli spec §4.1.3`](../../../specs/cli/cli.spec.md) — FR-SU-01..14
  - Architecture: [`cli spec §5.4`](../../../specs/cli/cli.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `type-check` (unit tests deferred to TSK-34)
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind      | Deps | Status |
| --- | --------- | ---- | ------ |
| P1  | bootstrap | —    | [x]    |
| P2  | impl      | P1   | [x]    |

## 3. Phases

### P1 — bootstrap

- **Objective:** Добавить `define: { __GENNADY_VERSION__ }` в `vite.config.ts` для вшивания версии в бандл
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `vite.config.ts` (modify)
- **Inputs:** none
- **Exit:** `__GENNADY_VERSION__` доступен в рантайме; `npm run type-check` pass

### P2 — impl

- **Objective:** Создать `UpdateCheck` Service, `UpdateCheckWorker` Command, `UpdateCheckCache` Value Object, `UpdateCheckOptions` Value Object. Интегрировать вызов `checkForUpdates()` в `cli/gennady.ts` + парсинг `--no-update-check`
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/_shared/update-check.ts` (create)
  - `cli/cmd/_shared/update-check-worker.ts` (create)
  - `cli/gennady.ts` (modify)
- **Inputs:** none
- **Exit:** `npm run type-check` pass; `checkForUpdates()` вызывается перед switch-диспатчем в gennady.ts; `--no-update-check` парсится и передаётся

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Неблокирующий детект обновлений на старте CLI

**Scenario:** Кеш свежий — проверка не делается [`unit`]

- **Given** кеш содержит `lastCheck` в пределах 24ч
- **When** вызывается `checkForUpdates(pkg)`
- **Then** `child_process.spawn` не вызывается
- **And** управление возвращается немедленно

**Scenario:** Кеш устарел — spawn worker [`unit`]

- **Given** кеш отсутствует или `lastCheck` старше 24ч
- **When** вызывается `checkForUpdates(pkg)`
- **Then** вызывается `spawn(process.execPath, [workerScript, pkgName, pkgVersion, cachePath, '3000'], { stdio: 'ignore' }).unref()`
- **And** управление возвращается немедленно

**Scenario:** Есть новая версия в кеше — регистрируется beforeExit-уведомление [`unit`]

- **Given** кеш содержит `latestVersion > pkg.version`
- **And** `stderr.isTTY === true`
- **When** вызывается `checkForUpdates(pkg)`
- **Then** регистрируется `process.on('beforeExit')` хук
- **And** хук выводит на stderr: текущая версия → новая версия + `npm i -g gennady@latest`

**Scenario:** Opt-out через `--no-update-check` [`unit`]

- **Given** `process.argv` содержит `--no-update-check`
- **When** вызывается `checkForUpdates(pkg)`
- **Then** управление возвращается немедленно
- **And** никакие проверки не выполняются

**Scenario:** CI-окружение — проверка пропускается [`unit`]

- **Given** `CI=true` или `CONTINUOUS_INTEGRATION=true`
- **When** вызывается `checkForUpdates(pkg)`
- **Then** управление возвращается немедленно

**Scenario:** Worker успешно получает latest-версию [`unit`]

- **Given** npm-реестр отвечает 200 с `{ version: "1.3.0" }`
- **When** worker делает HTTPS GET к `registry.npmjs.org/gennady/latest`
- **Then** кеш-файл содержит `{ lastCheck: ISO8601, latestVersion: "1.3.0" }`
- **And** exit code 0

**Scenario:** Worker — таймаут 3с [`unit`]

- **Given** npm-реестр не отвечает > 3с
- **When** worker делает запрос
- **Then** exit code 1
- **And** старый кеш сохраняется, `lastCheck` обновляется на +1ч

**Scenario:** Worker — ошибка сети [`unit`]

- **Given** npm-реестр недоступен
- **When** worker делает запрос
- **Then** exit code 1
- **And** старый кеш сохраняется, `lastCheck` обновляется на +1ч

## 5. Verification

| Command              | Required by      |
| -------------------- | ---------------- |
| `npm run type-check` | typescript-rules |

## 6. Test Scenario Coverage

Сценарии покрываются в TSK-34.

- All scenarios → Deferred Test Ownership: TSK-34

## 7. Execution Log

_(Round = один execute-then-audit цикл. Per-phase блоки внутри Round. Skeleton — минимальный; строки событий (`intro` / `decision` / `tried` / `discovery` / `insight` / `BLOCKED`) появляются ТОЛЬКО когда событие произошло. Словарь токенов в [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-21, initial

#### P1

- 🛑 `2026-05-21T16:05:04Z` BLOCKED: предсуществующая ошибка type-check в opencode-provider.ts (не в Target Files P1) — `TS2352` на строке 51
  - 🔗 axiom: AX_BLOCKER_ESCALATION
  - 💬 unblock: исправить ошибку в cli/cmd/agent-mon/providers/opencode-provider.ts:51 или согласовать, что ошибка предсуществующая и не блокирует P1
- [x] `2026-05-21T16:05:04Z` ver `npm run type-check` → fail exit=2
- ✅ `2026-05-21T16:14:46Z` RESOLVED: cli/cmd/agent-mon удалён оператором — TS2352 исчез
- [x] `2026-05-21T16:14:46Z` ver `npm run type-check` → pass exit=0
- [x] `2026-05-21T16:14:46Z` DONE
      **Handoff →** artifacts: [vite.config.ts]; decisions: [define-symbol=__GENNADY_VERSION__, version=0.6.1]; open: []

#### P2

- [x] `2026-05-21T16:30:30Z` ver `npm run type-check` → pass exit=0
- [x] `2026-05-21T16:30:30Z` DONE
      **Handoff →** artifacts: [cli/cmd/_shared/update-check.ts, cli/cmd/_shared/update-check-worker.ts, cli/gennady.ts]; decisions: [worker-spawn=spawn+unref, cache-atomic=temp+renameSync, notification=beforeExit, version-source=__GENNADY_VERSION__]; open: [worker-dist: worker .ts файл не попадёт в dist без отдельного Vite entry — при npm-публикации проверка не сработает из-за отсутствия скрипта]

#### Round close

- [x] `2026-05-21T16:30:30Z` DONE

### Round 2 — 2026-05-21, fix: address audit findings F-01, F-04

#### P2 — re-run: fix: address audit findings F-01, F-04

- [x] `2026-05-21T16:50:37Z` ver `npm run type-check` → pass exit=0
- [x] `2026-05-21T16:50:37Z` DONE
      **Handoff →** artifacts: [cli/cmd/_shared/update-check.ts]; decisions: [F-01=@implements-{UpdateCheck}-added, F-04=@post-tag-added]; open: []

### Round 2 — 2026-05-21, audit-driven fix: F-01, F-04

#### P2

- [x] `2026-05-21T16:45:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-05-21T16:45:00Z` DONE
      **Handoff →** artifacts: [cli/cmd/_shared/update-check.ts]; decisions: [F-01=@implements-{UpdateCheck}-added, F-04=@post-tag-added]; open: []

#### Round close

- [x] `2026-05-21T16:45:00Z` DONE
