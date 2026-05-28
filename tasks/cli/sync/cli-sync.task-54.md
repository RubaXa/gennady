# Task: TSK-54 — Sync Tests (core, formatter, integration)

## 1. Meta

- **Task-ID:** TSK-54
- **Status:** [x] DONE
- **Purpose:** Полное тестовое покрытие команды `gennady sync`: юнит-тесты ядра (resolvePackageDir, scanDirectives, collectAndCompare), юнит-тесты форматтера, интеграционные тесты CLI-обвязки.
- **Scope:** cli
- **Module:** sync
- **Dependencies:** TSK-53
- **Reopens:** 0
- **Spec References:**
  - Module spec: [`sync.spec.md`](../../../specs/cli/sync/sync.spec.md) — contracts §4.2, §4.3
  - Scope spec: [`cli.spec.md §4.1.4`](../../../specs/cli/cli.spec.md) — FR-SYNC-01..16
  - DX: [`cli.spec.md §3.4`](../../../specs/cli/cli.spec.md) — формат вывода
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind      | Deps | Status |
| --- | --------- | ---- | ------ |
| P1  | test-core | —    | [x]    |
| P2  | test-fmt  | —    | [x]    |
| P3  | test-cmd  | P1   | [x]    |

## 3. Phases

### P1 — test-core

- **Objective:** Создать `sync-core.test.ts` — юнит-тесты `resolvePackageDir`, `scanDirectives`, `collectAndCompare`
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
  - [testing-common](../../../ai/directives/testing/common.xml)
- **Target Files:**
  - `cli/cmd/sync/__tests__/sync-core.test.ts` (create)
- **Inputs:** TSK-53 (sync-core.ts)
- **Exit:** `node --import tsx --test cli/cmd/sync/__tests__/sync-core.test.ts` → pass

**Test Cases (15):**

| #   | Группа            | Сценарий                                                  | Ожидание                                                     |
| --- | ----------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | resolvePackageDir | Локальный `node_modules/gennady/ai/directives` существует | возвращает путь к локальной версии                           |
| 2   | resolvePackageDir | Локальный не найден, `import.meta.resolve` работает       | возвращает путь от резолва                                   |
| 3   | resolvePackageDir | Ни локальный, ни резолв не найдены                        | возвращает `null`                                            |
| 4   | scanDirectives    | Полный скан директории                                    | список всех файлов (относительные пути)                      |
| 5   | scanDirectives    | Фильтр по одной поддиректории `sdd`                       | только файлы в `sdd/`                                        |
| 6   | scanDirectives    | Фильтр по нескольким: `sdd`, `coding`                     | файлы из `sdd/` и `coding/`                                  |
| 7   | scanDirectives    | Несуществующая поддиректория                              | ошибка с перечислением доступных                             |
| 8   | scanDirectives    | EXCLUDED_ENTRIES фильтруются                              | `architecture/`, `dbc-audit.directive.xml` и др. отсутствуют |
| 9   | collectAndCompare | Файл не существует в target                               | `status: 'added'`                                            |
| 10  | collectAndCompare | Файл существует и идентичен                               | `status: 'unchanged'`                                        |
| 11  | collectAndCompare | Файл существует но отличается                             | `status: 'updated'`                                          |
| 12  | collectAndCompare | dryRun: файл не существует                                | `status: 'added'`, `writeFile` не вызван                     |
| 13  | collectAndCompare | dryRun: файл отличается                                   | `status: 'updated'`, `writeFile` не вызван                   |
| 14  | collectAndCompare | sourceDir не существует                                   | ошибка                                                       |
| 15  | collectAndCompare | Рекурсивное создание директорий                           | вложенные `mkdir` вызваны для новых поддиректорий            |

### P2 — test-fmt

- **Objective:** Создать `sync-formatter.test.ts` — юнит-тесты `SyncFormatter.format`
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
  - [testing-common](../../../ai/directives/testing/common.xml)
- **Target Files:**
  - `cli/cmd/sync/__tests__/sync-formatter.test.ts` (create)
- **Inputs:** TSK-53 (sync-formatter.ts)
- **Exit:** `node --import tsx --test cli/cmd/sync/__tests__/sync-formatter.test.ts` → pass

**Test Cases (7):**

| #   | Сценарий                                     | Ожидание                                                      |
| --- | -------------------------------------------- | ------------------------------------------------------------- |
| 1   | Смешанные статусы: added, updated, unchanged | строки с `+`, `~`, `=` и маркерами статуса                    |
| 2   | dryRun: те же статусы                        | строки с `(would add)`, `(would update)`, `(unchanged, skip)` |
| 3   | Только added                                 | только `+` строки, итог: `N added, 0 updated, 0 skipped`      |
| 4   | Только unchanged                             | только `=` строки, итог: `0 added, 0 updated, N skipped`      |
| 5   | Пустой массив entries                        | только итоговая строка `0 added, 0 updated, 0 skipped`        |
| 6   | dryRun итоговая строка                       | последняя строка: `Dry-run: no files written.`                |
| 7   | Порядок строк                                | соответствует порядку entries во входном массиве              |

### P3 — test-cmd

- **Objective:** Создать `sync.cmd.test.ts` — интеграционные тесты CLI-обвязки
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
  - [testing-common](../../../ai/directives/testing/common.xml)
- **Target Files:**
  - `cli/cmd/sync/__tests__/sync.cmd.test.ts` (create)
- **Inputs:** TSK-53 (sync.cmd.ts)
- **Exit:** `node --import tsx --test cli/cmd/sync/__tests__/sync.cmd.test.ts` → pass

**Test Cases (9):**

| #   | Сценарий                                     | Ожидание                                                                       |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Happy path: мок-пакет с 3 файлами, все новые | `+` для каждого файла, `Synced: 3 added, 0 updated, 0 skipped`, exit 0         |
| 2   | Повторный запуск: файлы не изменились        | `=` для каждого, `0 added, 0 updated, 3 skipped`, exit 0                       |
| 3   | Один файл изменился в пакете                 | `~` для изменённого, `=` для остальных, exit 0                                 |
| 4   | `--dry-run`                                  | маркеры `(would add)`, `Dry-run: no files written.`, exit 0, файлы НЕ записаны |
| 5   | Фильтр `sdd`                                 | только файлы в `sdd/`, exit 0                                                  |
| 6   | Фильтр `sdd coding`                          | файлы в `sdd/` и `coding/`, exit 0                                             |
| 7   | Несуществующая поддиректория `nonexistent/`  | stderr содержит `not found in package` + `Available:`, exit 1                  |
| 8   | Пакет не найден (resolvePackageDir → null)   | stderr содержит `package not found`, exit 1                                    |
| 9   | `--dry-run` + позиционные args вместе        | оба обрабатываются корректно (dry-run + фильтр)                                |

## 4. Acceptance Criteria (BDD)

**Feature:** Полное тестовое покрытие sync

**Scenario:** Все unit-тесты ядра проходят [`unit`]

- **Given** `sync-core.ts` реализован
- **When** `node --import tsx --test cli/cmd/sync/__tests__/sync-core.test.ts`
- **Then** все 15 тестов pass

**Scenario:** Все unit-тесты форматтера проходят [`unit`]

- **Given** `sync-formatter.ts` реализован
- **When** `node --import tsx --test cli/cmd/sync/__tests__/sync-formatter.test.ts`
- **Then** все 7 тестов pass

**Scenario:** Все интеграционные тесты CLI проходят [`integration`]

- **Given** `sync.cmd.ts` реализован
- **When** `node --import tsx --test cli/cmd/sync/__tests__/sync.cmd.test.ts`
- **Then** все 9 тестов pass

## 5. Verification

| Command                                                                  | Required by  |
| ------------------------------------------------------------------------ | ------------ |
| `node --import tsx --test cli/cmd/sync/__tests__/sync-core.test.ts`      | unit-tests   |
| `node --import tsx --test cli/cmd/sync/__tests__/sync-formatter.test.ts` | unit-tests   |
| `node --import tsx --test cli/cmd/sync/__tests__/sync.cmd.test.ts`       | integration  |
| `npm run type-check`                                                     | type-checker |

## 6. Test Scenario Coverage

| Test File                | Cases | Покрываемые FR                           |
| ------------------------ | ----- | ---------------------------------------- |
| `sync-core.test.ts`      | 15    | FR-SYNC-01,02,03,04,05,06,07,08,09,10,11 |
| `sync-formatter.test.ts` | 7     | FR-SYNC-12,13,14,15,16                   |
| `sync.cmd.test.ts`       | 9     | FR-SYNC-01,03,04,06,08,09,10,12,14       |

## 7. Execution Log

_(Round = one execute-then-audit attempt. Per-phase blocks within a Round. Skeleton is minimal — event lines (`intro` / `decision` / `tried` / `discovery` / `insight` / `BLOCKED`) appear ONLY when the event happens. Token vocabulary in [tasks/README.md#execution-log-template](../../../README.md#execution-log-template).)_

### Round 1 — 2026-05-27, refine

#### P1

- [x] 2026-05-27T19:10:00Z created sync-core.test.ts - 15 cases
- [x] 2026-05-27T19:10:00Z ver node --import tsx --test -> 15/15 pass
- [x] 2026-05-27T19:10:00Z DONE
      **Handoff ->** artifacts: [sync-core.test.ts (15 cases)]; decisions: []; open: []

#### P2

- [x] 2026-05-27T19:11:00Z created sync-formatter.test.ts - 7 cases
- [x] 2026-05-27T19:11:00Z ver node --import tsx --test -> 7/7 pass
- [x] 2026-05-27T19:11:00Z DONE
      **Handoff ->** artifacts: [sync-formatter.test.ts (7 cases)]; decisions: []; open: []

#### P3

- [x] 2026-05-27T19:12:00Z created sync.cmd.test.ts - 9 cases
- [x] 2026-05-27T19:12:00Z ver node --import tsx --test -> 9/9 pass
- [x] 2026-05-27T19:12:00Z DONE
      **Handoff ->** artifacts: [sync.cmd.test.ts (9 cases)]; decisions: []; open: []

#### Round close

- [x] DONE
