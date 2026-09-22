# Task: SYN-command — Sync Core + CLI (типы, ядро, форматтер, обвязка, регистрация)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** SYN-command
- **Status:** [ ] TODO
- **Purpose:** Реализовать команду `gennady sync`: типы (`SyncOptions`, `SyncFileEntry`, `SyncResult`), ядро (`SyncCore` — resolvePackageDir, scanDirectives, collectAndCompare), форматтер (`SyncFormatter`), CLI-обвязка (`run` с DI), регистрация в `gennady.ts`/`AGENTS.md`/`help.cmd.ts`.
- **Scope:** cli
- **Module:** sync
- **Dependencies:** INP-rel-cmd, INP-pack-ai
- **Reopens:** 0
- **Spec References:**
  - Module spec: [`sync.spec.md`](./sync.spec.md)
  - Scope spec: [`cli.spec.md §5.5`](../cli.spec.md)
  - FR: [`cli.spec.md §4.1.4`](../cli.spec.md) — FR-SYNC-01..16
  - DX: [`cli.spec.md §3.4`](../cli.spec.md)
  - Decision: [D-008](../cli.spec.md) — команда sync
  - Decision: [D-M001](./sync.spec.md) — Pattern C
  - Decision: [D-M002](./sync.spec.md) — Buffer.compare
  - Decision: [D-M003](./sync.spec.md) — EXCLUDED_ENTRIES
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `type-check`
- **Deferred Runtime Scope:** None

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind     | Deps | Status |
| --- | -------- | ---- | ------ |
| P1  | impl     | —    | [ ]    |
| P2  | register | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

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

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

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

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

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

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command              | Required by  | Role  |
| -------------------- | ------------ | ----- |
| `npm run type-check` | type-checker | extra |

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

_Тесты выделены в SYN-tests. Этот тикет — только реализация + регистрация._

- sync adds new files → `sync.cmd.test.ts` :: `adds all new files and returns exit 0`
- repeat sync is idempotent → `sync.cmd.test.ts` :: `reports all unchanged on repeat run`
- missing subdirectory is rejected → `sync.cmd.test.ts` :: `exits 1 on nonexistent subdirectory`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

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

<!--/SECTION:EXECUTION_LOG-->
