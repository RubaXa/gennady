# Task: TSK-53 — Sync Core + CLI (типы, ядро, форматтер, обвязка, регистрация)

## 1. Meta

- **Task-ID:** TSK-53
- **Status:** [x] DONE
- **Purpose:** Реализовать команду `gennady sync`: типы (`SyncOptions`, `SyncFileEntry`, `SyncResult`), ядро (`SyncCore` — resolvePackageDir, scanDirectives, collectAndCompare), форматтер (`SyncFormatter`), CLI-обвязка (`run` с DI), регистрация в `gennady.ts`/`AGENTS.md`/`help.cmd.ts`.
- **Scope:** cli
- **Module:** sync
- **Dependencies:** TSK-44, TSK-45 (infra-npm-publish: `ai/` в пакете)
- **Reopens:** 0
- **Spec References:**
  - Module spec: [`sync.spec.md`](../../../specs/cli/sync/sync.spec.md)
  - Scope spec: [`cli.spec.md §5.5`](../../../specs/cli/cli.spec.md)
  - FR: [`cli.spec.md §4.1.4`](../../../specs/cli/cli.spec.md) — FR-SYNC-01..16
  - DX: [`cli.spec.md §3.4`](../../../specs/cli/cli.spec.md)
  - Decision: [D-008](../../../specs/cli/cli.spec.md) — команда sync
  - Decision: [D-M001](../../../specs/cli/sync/sync.spec.md) — Pattern C
  - Decision: [D-M002](../../../specs/cli/sync/sync.spec.md) — Buffer.compare
  - Decision: [D-M003](../../../specs/cli/sync/sync.spec.md) — EXCLUDED_ENTRIES
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `type-check`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind     | Deps | Status |
| --- | -------- | ---- | ------ |
| P1  | impl     | —    | [x]    |
| P2  | register | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Objective:** Создать `sync.types.ts`, `sync-core.ts`, `sync-formatter.ts`, `sync.cmd.ts`, `index.ts`
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/sync/sync.types.ts` (create)
  - `cli/cmd/sync/sync-core.ts` (create)
  - `cli/cmd/sync/sync-formatter.ts` (create)
  - `cli/cmd/sync/sync.cmd.ts` (create)
  - `cli/cmd/sync/index.ts` (create)
- **Inputs:** none
- **Exit:** `npm run type-check` pass; модуль импортируется без ошибок

### P2 — register

- **Objective:** Зарегистрировать команду `sync` в `cli/gennady.ts`, `cli/AGENTS.md`, `cli/cmd/help/help.cmd.ts`
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/gennady.ts` (modify — добавить `case 'sync'`)
  - `cli/AGENTS.md` (modify — добавить строку `sync` в таблицу)
  - `cli/cmd/help/help.cmd.ts` (modify — добавить `sync` в вывод)
- **Inputs:** P1
- **Exit:** `npm run type-check` pass; `npx gennady sync` вызывает команду (может упасть на отсутствии пакета — OK)

## 4. Acceptance Criteria (BDD)

**Feature:** Команда `gennady sync` синхронизирует `ai/directives/` из npm-пакета

**Scenario:** Типы и ядро компилируются [`type-check`]

- **Given** свежий `npm run build` (инфраструктура готова)
- **When** созданы `sync.types.ts`, `sync-core.ts`, `sync-formatter.ts`
- **Then** `npm run type-check` → exit 0

**Scenario:** CLI-обвязка компилируется [`type-check`]

- **Given** P1 завершён
- **When** созданы `sync.cmd.ts`, `index.ts`
- **Then** `npm run type-check` → exit 0

**Scenario:** Команда зарегистрирована в gennady [`contract`]

- **Given** P2 завершён
- **When** `npx gennady sync` (с установленным локально пакетом)
- **Then** команда запускается (вывод sync или ошибка «package not found»)

**Scenario:** Help показывает sync [`contract`]

- **Given** P2 завершён
- **When** `npx gennady --help`
- **Then** вывод содержит строку `sync`

**Scenario:** AGENTS.md содержит sync [`contract`]

- **Given** P2 завершён
- **When** читаем `cli/AGENTS.md`
- **Then** таблица команд содержит строку `sync`

## 5. Verification

| Command              | Required by  |
| -------------------- | ------------ |
| `npm run type-check` | type-checker |

## 6. Test Scenario Coverage

_Тесты выделены в TSK-54. Этот тикет — только реализация + регистрация._

- Компиляция `npm run type-check` → exit 0
- `npx gennady sync` → команда распознаётся (не «Unknown command»)
- `npx gennady --help` → содержит `sync`

## 7. Execution Log

_(Round = one execute-then-audit attempt. Per-phase blocks within a Round. Skeleton is minimal — event lines (`intro` / `decision` / `tried` / `discovery` / `insight` / `BLOCKED`) appear ONLY when the event happens. Token vocabulary in [tasks/README.md#execution-log-template](../../../README.md#execution-log-template).)_

### Round 1 — 2026-05-27, refine

#### P1

- [x] 2026-05-27T19:00:00Z created sync.types.ts, sync-core.ts, sync-formatter.ts, sync.cmd.ts, index.ts
- [x] 2026-05-27T19:01:00Z ver `npx tsc --noEmit` -> pass exit=0
- [x] 2026-05-27T19:01:00Z DONE
      **Handoff ->** artifacts: [sync.types.ts, sync-core.ts, sync-formatter.ts, sync.cmd.ts, index.ts]; decisions: [Pattern C, Buffer.compare, EXCLUDED_ENTRIES]; open: []

#### P2

- [x] 2026-05-27T19:02:00Z added case sync to gennady.ts, AGENTS.md, help.cmd.ts
- [x] 2026-05-27T19:02:00Z ver `npx tsx cli/gennady.ts --help` -> shows sync
- [x] 2026-05-27T19:02:00Z DONE
      **Handoff ->** artifacts: [gennady.ts, AGENTS.md, help.cmd.ts]; decisions: []; open: []

#### Round close

- [x] DONE
