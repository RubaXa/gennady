# Task: DIF-compare — diff: сравнение снапшотов

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** DIF-compare
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Реализовать чистую функцию diff для сравнения двух AgentSession[] по семантическим полям
- **Scope:** agent-mon
- **Module:** diff
- **Dependencies:** MOD-types
- **Spec References:**
  - Contract: [`diff`](./diff.spec.md#diff)
  - Type: [`SessionChanges`](../model/model.spec.md#sessionchanges)
  - Type: [`AgentSession`](../model/model.spec.md#agentsession)
  - Scope: [`agent-mon` §3.1 F7](../agent-mon.spec.md#31-functional-requirements)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Реализовать функцию diff(prev, curr) → SessionChanges со строгим контрактом полей
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-mon/diff/diff.ts`
  - `services/agent-mon/diff/index.ts`
- **Inputs:** none
- **Exit:** typecheck pass; сравниваются семантические поля (status, title, lastActivityAt, elapsedSeconds, idleSeconds, toolCallCount, errorCount, lastMessage, tokensInput, tokensOutput); НЕ сравниваются cpuPercent, memoryMb

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-тесты diff на всех трёх категориях изменений + проверка контракта полей
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-mon/diff/__tests__/diff.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD сценарии покрыты; tests pass

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Сравнение двух снапшотов сессий по семантическим полям

**Scenario:** Новая сессия попадает в added [`unit`]

- **Given** curr содержит сессию с id='B', prev не содержит
- **When** diff(prev, curr)
- **Then** added содержит сессию 'B', removed и updated пусты

**Scenario:** Исчезнувшая сессия попадает в removed [`unit`]

- **Given** prev содержит сессию с id='A', curr не содержит
- **When** diff(prev, curr)
- **Then** removed содержит сессию 'A'

**Scenario:** Изменение семантического поля → updated [`unit`]

- **Given** сессия 'C' есть в обоих снапшотах, но status изменился с active на completed
- **When** diff(prev, curr)
- **Then** updated содержит сессию 'C'

**Scenario:** Некорректное изменение только cpuPercent НЕ вызывает updated [`unit`]

- **Given** сессия 'D' в обоих снапшотах отличается только cpuPercent (50 → 52) и memoryMb
- **When** diff(prev, curr)
- **Then** updated пуст, added пуст, removed пуст

**Scenario:** Пустые снапшоты дают пустой результат [`unit`]

- **Given** prev = [], curr = []
- **When** diff(prev, curr)
- **Then** все три массива пусты

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command            | Required by      | Role  |
| ------------------ | ---------------- | ----- |
| npm run type-check | typescript-rules | extra |
| npm run test       | node-test        | probe |

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario "Новая сессия" → `services/agent-mon/diff/__tests__/diff.test.ts` :: `new session in added`
- Scenario "Исчезнувшая сессия" → `services/agent-mon/diff/__tests__/diff.test.ts` :: `gone session in removed`
- Scenario "Изменение семантического поля" → `services/agent-mon/diff/__tests__/diff.test.ts` :: `semantic change triggers updated`
- Scenario "Изменение cpuPercent" → `services/agent-mon/diff/__tests__/diff.test.ts` :: `cpu change does not trigger updated`
- Scenario "Пустые снапшоты" → `services/agent-mon/diff/__tests__/diff.test.ts` :: `empty snapshots produce empty result`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Token vocabulary in [tasks/README.md#execution-log-template](../../../tasks/README.md#execution-log-template).)_

### Round 1 — initial

#### P1

- [x] `2026-05-22T04:23:56Z` intro `diff` ← реализация чистой функции сравнения снапшотов по семантическим полям
- [x] `2026-05-22T04:23:56Z` ver `npm run type-check` → pass exit=0
- [x] `2026-05-22T04:23:56Z` DONE
      **Handoff →** artifacts: [services/agent-mon/diff/diff.ts, services/agent-mon/diff/index.ts]; decisions: [semanticFields=status|title|lastActivityAt|elapsedSeconds|idleSeconds|toolCallCount|errorCount|lastMessage|tokensInput|tokensOutput, excludedFields=cpuPercent|memoryMb, comparisonKey=sessionId]; open: []

#### P2

- [x] `2026-05-22T04:30:31Z` discovery pre-existing failure в `alt-opinion.cmd.test.ts` — не связано с diff; все 5 diff-тестов проходят (5/5 pass)
- [x] `2026-05-22T04:30:31Z` ver `npm run test` → fail exit=1
- [x] `2026-05-22T04:30:31Z` DONE
      **Handoff →** artifacts: [services/agent-mon/diff/__tests__/diff.test.ts]; decisions: []; open: []

#### Round close

- [ ] `<ts>` sync agent-mon+root
- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->
