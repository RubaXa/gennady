# Task: TSK-128 — inbox-chat: ChatGc (TTL-уборка chats/ + snapshots/)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-128 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-chat | **Dependencies:** TSK-109 (inbox-core, DONE) — независим от TSK-126/TSK-127 (дисджойнт файлы, файловая TTL-уборка без ссылок на ChatSession/MutationApplier)
- **Purpose:** `ChatGc` — TTL-уборка новых per-MR артефактов чата: `chats/<ref>.jsonl` (транскрипты) и `reports/<mr>/snapshots/` (undo-снапшоты), тот же паттерн и TTL (7 дней / 168ч по `mtime`), что `gcStaleWorktrees` (AI-09) и `gcStaleReports` (D64, D-105). Best-effort — ошибка на одном файле не блокирует остальные.
- **Spec:** [inbox-chat.spec.md](../../../specs/agent-inbox/inbox-chat/inbox-chat.spec.md#chatgc), [agent-inbox.spec.md](../../../specs/agent-inbox/agent-inbox.spec.md) D-105 | **Runtime:** real-runtime | **Verification:** unit

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-chat/chat-gc.ts` — `ChatGc`: `gcStaleChats(root, ttlMs, nowMs)` удаляет `chats/<ref>.jsonl` старше `ttlMs` от `nowMs` по `mtime`, возвращает список удалённых путей; `gcStaleSnapshots(root, ttlMs, nowMs)` — то же для `reports/<mr>/snapshots/`; обе операции best-effort (ошибка удаления одного файла не прерывает обход остальных, симметрично `gcStaleWorktrees`); каталоги создаются рантаймом другими сервисами (TSK-126/TSK-127) — `ChatGc` только читает/удаляет существующее, не требует их наличия на момент вызова (пустой/отсутствующий каталог → пустой список удалённых, не ошибка).
- **Inputs:** none
- **Exit:** typecheck pass; `gcStaleChats`/`gcStaleSnapshots` не бросают исключение на отсутствующем каталоге; ошибка на одном файле не прерывает обход остальных.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-chat/__tests__/chat-gc.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии секции 4 покрыты; сьют зелёный.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References (`inbox-chat.spec.md#chatgc`).

**Feature:** TTL-уборка транскриптов чата и undo-снапшотов

**Scenario:** Типизация контракта ChatGc [`contract`]

- **Given** публичные операции `gcStaleChats`/`gcStaleSnapshots`
- **When** вызывающий код использует их сигнатуры
- **Then** обе операции типизированы как `(root: string, ttlMs: number, nowMs: number) => string[]` (или Promise-эквивалент, согласованный с остальным модулем), без `any`

**Scenario:** Удаление устаревших транскриптов [`unit`]

- **Given** `chats/a.jsonl` с `mtime` старше `ttlMs` от `nowMs`, `chats/b.jsonl` свежий
- **When** `gcStaleChats(root, ttlMs, nowMs)` вызывается
- **Then** `a.jsonl` удалён и присутствует в списке возвращённых путей, `b.jsonl` остаётся

**Scenario:** Удаление устаревших снапшотов [`unit`]

- **Given** `reports/<mr>/snapshots/old.json` старше TTL, `new.json` свежий
- **When** `gcStaleSnapshots(root, ttlMs, nowMs)` вызывается
- **Then** `old.json` удалён, `new.json` остаётся

**Scenario:** Best-effort на ошибке одного файла [`unit`]

- **Given** один файл в каталоге вызывает ошибку удаления (симуляция через mock fs)
- **When** `gcStaleChats`/`gcStaleSnapshots` вызывается на каталоге с несколькими файлами
- **Then** остальные подходящие под TTL файлы всё равно удаляются, обход не прерывается

**Scenario:** Отсутствующий каталог — пустой результат, не ошибка [`unit`]

- **Given** `root` не содержит `chats/` или `reports/*/snapshots/`
- **When** `gcStaleChats`/`gcStaleSnapshots` вызывается
- **Then** возвращается пустой список, исключение не бросается

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                         | Required by                 |
| ------------------------------------------------------------------------------- | --------------------------- |
| `npm run type-check`                                                            | typescript-rules            |
| `npm run test -- 'services/agent-inbox/modules/inbox-chat/__tests__/*.test.ts'` | node-test                   |
| `npm run format:check`                                                          | typescript-rules, node-test |

- **Task-specific Completion additions:** none beyond project baseline.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                                 | Level    | Test File       |
| ---------------------------------------- | -------- | --------------- |
| Типизация контракта ChatGc               | contract | chat-gc.test.ts |
| Удаление устаревших транскриптов         | unit     | chat-gc.test.ts |
| Удаление устаревших снапшотов            | unit     | chat-gc.test.ts |
| Best-effort на ошибке одного файла       | unit     | chat-gc.test.ts |
| Отсутствующий каталог — пустой результат | unit     | chat-gc.test.ts |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-15, initial

#### P1

- [x] `2026-07-15T14:16:55Z` insight `ChatGc` — spec module-usage-example (`inbox-chat.spec.md#chatgc` code block) shows `new ChatGc({ store })` (class instance), but the Entity Surfaces §3 "Public Operations" list and this ticket's BDD contract both give plain-function signatures `gcStaleChats(root, ttlMs, nowMs)` / `gcStaleSnapshots(root, ttlMs, nowMs)`, mirroring `gcStaleWorktrees`/`gcStaleReports`. Implemented as plain exported functions (no class) to match the normative Public Operations + BDD contract → `inbox-chat.spec.md#chatgc`, reconcile the stale usage-example code block with the Public Operations shape
- [x] `2026-07-15T14:16:55Z` decision root-param=directory-itself ← `gcStaleChats(root, …)` takes the chats directory directly (`<state-dir>/agent-inbox/chats`), symmetric with `worktreesRoot`/`reportsRoot` passed to `gcStaleWorktrees`/`gcStaleReports`; wiring call site (TSK-129/serve bootstrap) must pass that joined path, not the bare state dir
- [x] `2026-07-15T14:16:55Z` decision root-param=reports-root ← `gcStaleSnapshots(root, …)` takes `reportsRoot(stateDir)` and walks every `<mr>/snapshots/` subdirectory itself, since the ticket's `reports/<mr>/snapshots/*` target spans an unknown set of MR dirs
- [x] `2026-07-15T14:16:55Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-15T14:16:55Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-15T14:16:55Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-chat/chat-gc.ts]; decisions: [shape=plain-functions, gcStaleChats-root=chats-dir, gcStaleSnapshots-root=reports-root]; open: [wiring: gcStaleChats/gcStaleSnapshots not yet invoked from inbox/inbox-context bootstrap or `inbox --reset` (D-105) — out of this ticket's Target Files, needs a follow-up task]

#### P2

- [x] `2026-07-15T14:24:52Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-15T14:24:52Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-chat/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-15T14:24:52Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-15T14:24:52Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-chat/__tests__/chat-gc.test.ts]; decisions: [mock-fs=mock.module-node:fs-rmSync-only-others-real, mtime=fs.utimesSync-on-makeTestTmpDir-files, error-sim=path-matching-mock-rmSync-throw]; open: [wiring: gcStaleChats/gcStaleSnapshots not yet invoked from inbox/inbox-context bootstrap or `inbox --reset` (D-105) — out of this ticket's Target Files, needs a follow-up task]

#### Round close

- [x] `2026-07-15T14:30:00Z` DONE — Round 1: P1 (impl) + P2 (test, 29/29 green) DONE; трекеры синхронизированы; статус Meta → [x] DONE. Open: врезка gc в inbox/reset — follow-up (вне Target Files)

### Round 2 — 2026-07-15, integration-test acceptance gate — add ≥1 real integration test per policy

#### P2

- [x] `2026-07-15T15:05:00Z` insight существующий `chat-gc.test.ts` мокает `node:fs` через `mock.module` (только `rmSync` подменён, остальное реальное), но политика требует ≥1 теста без единого мока на файловом seam — добавлен отдельный файл `chat-gc.integration.test.ts`, полностью без `mock.module`, реальный `node:fs` целиком
- [x] `2026-07-15T15:05:00Z` decision permission-error-real ← вместо симуляции ошибки удаления через мок `rmSync`, использован реальный OS-level immutable flag (`chflags uchg`, macOS/BSD) на файле — `rmSync` реально бросает `EPERM` от файловой системы, не от подставного мока; `chflags nouchg` в `afterEach` перед `cleanupTestTmp`, чтобы не блокировать реальную очистку tmp-дерева
- [x] `2026-07-15T15:05:00Z` artifact `services/agent-inbox/modules/inbox-chat/__tests__/chat-gc.integration.test.ts` — реальный `makeTestTmpDir`, реальные `chats/*.jsonl` (stale/fresh/protected) и `reports/<mr>/snapshots/*.json` (stale/fresh/protected), реальные mtime через `utimesSync`, реальный `gcStaleChats`/`gcStaleSnapshots` против этого реального дерева, реальный `existsSync` для assert; protected-файл переживает реальную ошибку удаления, не блокируя обход остальных
- [x] `2026-07-15T15:05:00Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-chat/__tests__/chat-gc.integration.test.ts'` → pass exit=0 (1/1 green, real fs, no mocks)
- [x] `2026-07-15T15:05:00Z` ver `npm run format:check` → pass after `npx prettier --write` on new file
- [x] `2026-07-15T15:05:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-chat/__tests__/chat-gc.integration.test.ts]; decisions: [permission-error-real=chflags-uchg-macOS-BSD-immutable-flag, no-fs-mocking]; open: [wiring gc в inbox/reset — unchanged, follow-up]

#### Round close

- [x] `2026-07-15T22:30:00Z` DONE — Round 2: integration test added per D-116 acceptance policy (chat-gc.integration.test.ts, real fs no mocks, 1/1 green); полный agent-inbox сьют 152/152 green; статус Meta остаётся [x] DONE

<!--/SECTION:EXECUTION_LOG-->
