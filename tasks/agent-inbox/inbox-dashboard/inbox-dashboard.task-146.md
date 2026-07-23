# Task: TSK-146 — inbox-dashboard: копирование задания — история/дельта в ActionPanel

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-146 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-dashboard | **Dependencies:** TSK-145 (эндпоинт `POST /api/mr/:id/copy-fix-task`)
- **Purpose:** Реализует SV-14 (specs/agent-inbox §4.1.1) — довершает `ActionPanel.tsx`'s `copyFixTask` (сегодня — read-only, чистая генерация текста без обращения к серверу, `composeFixTask` уже строит полный микро-промт для первого клика). Клик по «Копировать задание» теперь СНАЧАЛА зовёт `POST /api/mr/:id/copy-fix-task` (TSK-145) → получает `{isFirst, priorCopyCount, lastCopiedAt, delta}` → строит ОДНО из двух сообщений: первый клик (`isFirst: true`) — существующий полный `composeFixTask` без изменений; повторный клик (`isFirst: false`) — НОВАЯ короткая функция `composeFixTaskDelta(mr, delta, priorCopyCount, lastCopiedAt)`: краткая история («это N-е копирование, последний раз <когда>») + явная дельта (что появилось новое — по одному пункту с `file:line`+message; что устранено — только `file:line`, без повтора текста; что осталось без изменений — упоминается количеством, НЕ перечисляется заново). Затем пишет итоговый текст в буфер обмена (как сегодня).
- **Spec References:**
  - Requirements: [SV-14](../../../specs/agent-inbox/agent-inbox.spec.md#411-serve-mode-новые-требования)
  - Decision: [D-126](../../../specs/agent-inbox/agent-inbox.spec.md#6-decision-log), [D65](../../../specs/agent-inbox/agent-inbox.spec.md#6-decision-log) (базовый принцип — не расширяется, только дополняется)
  - Consumer: оператор (клик в UI), downstream-агент оператора (получатель текста из буфера)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None.

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

### P1 — impl (клиент: вызов эндпоинта + дельта-сообщение)

- **Objective:** `services/agent-inbox/modules/inbox-dashboard/services/api-client.ts`: новая функция `recordFixTaskCopy(mrId: string): Promise<FixTaskCopyResult>` — POST на `/api/mr/${encodeURIComponent(mrId)}/copy-fix-task`, тот же fetch-паттерн, что `executeAction`/`getReport` (см. существующие функции в этом файле). `ActionPanel.tsx`: новая функция `composeFixTaskDelta(mr, delta, priorCopyCount, lastCopiedAt)` — краткий текст (не полный микро-промт): заголовок «Копирование №<priorCopyCount+1> — MR "<title>"», строка истории («предыдущее копирование: <lastCopiedAt>»), секция «## Новое» (по одному пункту на `delta.added`, полный `file:line — message`), секция «## Устранено» (только `file:line` из `delta.resolved`, без текста), строка «без изменений: N» (`delta.unchanged.length`, не перечисляется). `copyFixTask` переписан: `async`, сначала `await recordFixTaskCopy(mrId)`, дальше ветвление `result.isFirst ? composeFixTask(...) : composeFixTaskDelta(...)`, затем `navigator.clipboard.writeText(...)`.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/services/api-client.ts` (touched — новая `recordFixTaskCopy`)
  - `services/agent-inbox/modules/inbox-dashboard/components/ActionPanel.tsx` (touched — `composeFixTaskDelta` + `copyFixTask` async-переработка)
- **Inputs:** none (TSK-145 уже DONE к моменту исполнения)
- **Exit:** typecheck pass; первый клик — идентичный сегодняшнему полному тексту (regression-safe); повторный клик — краткий текст с явной дельтой, не повторяет полный список находок.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-покрытие `composeFixTaskDelta` (детерминированная генерация текста на синтетической дельте — есть новое/есть устранённое/оба/ничего кроме unchanged) + regression-тест, что `composeFixTask` (первый клик) не изменился по форме.
- **Rules:**
  - [testing-common](../../../ai/directives/testing/common.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/ActionPanel.test.tsx` (touched — существующий файл, расширен тремя сценариями TSK-146)
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References (SV-14, D-126, D65).

**Feature:** Копирование задания — история и дельта в клиенте

**Scenario:** первый клик — полный текст без изменений [`unit`]

- **Given** `recordFixTaskCopy` вернул `{isFirst: true, delta: null}`
- **When** `copyFixTask` строит сообщение
- **Then** используется существующий `composeFixTask` (полный микро-промт, без изменений формы)

**Scenario:** повторный клик — краткая дельта, не полный список [`unit`]

- **Given** `{isFirst: false, priorCopyCount: 1, delta: {added: [f2], resolved: [f1], unchanged: [f3]}}`
- **When** `composeFixTaskDelta` строит сообщение
- **Then** текст содержит `f2` целиком (file:line+message), `f1` только по `file:line` (без текста), «без изменений: 1» — `f3` НЕ перечислен текстом

**Scenario:** дельта пуста (ничего не изменилось) [`unit`]

- **Given** `delta: {added: [], resolved: [], unchanged: [f1]}`
- **When** `composeFixTaskDelta`
- **Then** текст явно сообщает «ничего нового с прошлого раза», не пустые секции

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                   | Required by               |
| ----------------------------------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                                                      | typescript-rules          |
| `node --test services/agent-inbox/modules/inbox-dashboard/__tests__/ActionPanel.test.tsx` | testing-common, node-test |

- **Task-specific Completion additions:** none beyond project baseline.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «первый клик — полный текст» → `ActionPanel.test.tsx` :: `first copy uses full composeFixTask unchanged`
- Scenario «повторный клик — краткая дельта» → `ActionPanel.test.tsx` :: `repeat copy shows brief delta not full findings list`
- Scenario «дельта пуста» → `ActionPanel.test.tsx` :: `empty delta explicitly states nothing new`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-22, initial

#### P1

- [x] `2026-07-22T19:51:42Z` decision composeFixTaskDelta-signature=(mr, findings, delta, priorCopyCount, lastCopiedAt) ← delta.added/resolved carry only file/line/messageHash, no message text; findings param added to recover message text for "## Новое" by matching file+line against the current report
- [x] `2026-07-22T19:51:42Z` ver `sdd verify services/agent-inbox/modules/inbox-dashboard/services/api-client.ts services/agent-inbox/modules/inbox-dashboard/components/ActionPanel.tsx` → pass (typecheck, gennady lint) exit=0; test gate fail=10 — matches known pre-existing baseline (TSK-140-145), unrelated to Target Files
- [x] `2026-07-22T19:51:42Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-22T19:51:42Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-dashboard/services/api-client.ts, services/agent-inbox/modules/inbox-dashboard/components/ActionPanel.tsx]; decisions: [recordFixTaskCopy-pattern=getReport-style-envelope-strip, composeFixTaskDelta-signature=(mr,findings,delta,priorCopyCount,lastCopiedAt), composeFixTask-unchanged=true]; open: [baseline-10-pre-existing-test-failures: seen again during sdd verify test gate, not a regression per TSK-140-145]

#### P2

- [x] `2026-07-22T19:59:21Z` discovery no `components/__tests__/` dir exists; project convention (ArtifactBrowser.test.tsx, MrCard.test.tsx, …) puts component tests one level up at `services/agent-inbox/modules/inbox-dashboard/__tests__/`; `ActionPanel.test.tsx` already exists there (TSK-107) — extended it per ticket's own "либо расширение существующего" clause, did not create a new file under `components/__tests__/`
- [x] `2026-07-22T19:59:21Z` insight §5 verification path `services/agent-inbox/modules/inbox-dashboard/components/__tests__/ActionPanel.test.tsx` does not exist (see discovery above; real path is one level up, no `components/` segment) → §5 Verification table, update the `node --test` command's path to drop `components/`
- [x] `2026-07-22T19:59:21Z` ver `sdd verify services/agent-inbox/modules/inbox-dashboard/__tests__/ActionPanel.test.tsx` → pass (typecheck, gennady lint) exit=0; test gate fail=10 — matches known pre-existing baseline (mr-stats, vcs-worktree, ChatRouter, ChatApiClient integration, reviewer.role.ts merge — none touch ActionPanel/api-client), not a regression
- [x] `2026-07-22T19:59:21Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-22T19:59:21Z` ver `node --test services/agent-inbox/modules/inbox-dashboard/__tests__/ActionPanel.test.tsx` → pass exit=0 (10/10, incl. 3 new copy-fix-task scenarios) — corrected path per insight above; ticket's literal §5 path does not exist
- [x] `2026-07-22T19:59:21Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-dashboard/__tests__/ActionPanel.test.tsx]; decisions: [test-location=existing-ActionPanel.test.tsx-extended, copy-fix-task-tested-via-render-and-clipboard-mock-not-direct-export]; open: [F-146-1: §5 verification command path has stale `components/` segment — needs ticket table fix; baseline-10-pre-existing-test-failures: seen again, not a regression per TSK-140-145]

#### Round close

- [x] `2026-07-22T20:02:00Z` ticket-fix §5 verification path corrected (`components/__tests__/` → `__tests__/`, F-146-1, orchestrator paper-fix)
- [x] `2026-07-22T20:02:00Z` sync agent-inbox+root
- [x] `2026-07-22T20:02:00Z` DONE

<!--/SECTION:EXECUTION_LOG-->
