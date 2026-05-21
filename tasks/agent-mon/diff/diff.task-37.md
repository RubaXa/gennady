# Task: TSK-37 — diff: сравнение снапшотов

## 1. Meta

- **Task-ID:** TSK-37
- **Status:** [ ] TODO
- **Purpose:** Реализовать чистую функцию diff для сравнения двух AgentSession[] по семантическим полям
- **Scope:** agent-mon
- **Module:** diff
- **Dependencies:** TSK-35
- **Spec References:**
  - Contract: [`diff`](../../../specs/agent-mon/diff/diff.spec.md#diff)
  - Type: [`SessionChanges`](../../../specs/agent-mon/model/model.spec.md#sessionchanges)
  - Type: [`AgentSession`](../../../specs/agent-mon/model/model.spec.md#agentsession)
  - Scope: [`agent-mon` §3.1 F7](../../../specs/agent-mon/agent-mon.spec.md#31-functional-requirements)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Objective:** Реализовать функцию diff(prev, curr) → SessionChanges со строгим контрактом полей
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-mon/diff/diff.ts`
  - `services/agent-mon/diff/index.ts`
- **Inputs:** none
- **Exit:** typecheck pass; сравниваются семантические поля (status, title, lastActivityAt, elapsedSeconds, idleSeconds, toolCallCount, errorCount, lastMessage, tokensInput, tokensOutput); НЕ сравниваются cpuPercent, memoryMb

### P2 — test

- **Objective:** Unit-тесты diff на всех трёх категориях изменений + проверка контракта полей
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-mon/diff/__tests__/diff.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD сценарии покрыты; tests pass

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

**Scenario:** Изменение только cpuPercent НЕ вызывает updated [`unit`]

- **Given** сессия 'D' в обоих снапшотах отличается только cpuPercent (50 → 52) и memoryMb
- **When** diff(prev, curr)
- **Then** updated пуст, added пуст, removed пуст

**Scenario:** Пустые снапшоты дают пустой результат [`unit`]

- **Given** prev = [], curr = []
- **When** diff(prev, curr)
- **Then** все три массива пусты

## 5. Verification

| Command            | Required by      |
| ------------------ | ---------------- |
| npm run type-check | typescript-rules |
| npm run test       | node-test        |

## 6. Test Scenario Coverage

- Scenario "Новая сессия" → `services/agent-mon/diff/__tests__/diff.test.ts` :: `new session in added`
- Scenario "Исчезнувшая сессия" → `services/agent-mon/diff/__tests__/diff.test.ts` :: `gone session in removed`
- Scenario "Изменение семантического поля" → `services/agent-mon/diff/__tests__/diff.test.ts` :: `semantic change triggers updated`
- Scenario "Изменение cpuPercent" → `services/agent-mon/diff/__tests__/diff.test.ts` :: `cpu change does not trigger updated`
- Scenario "Пустые снапшоты" → `services/agent-mon/diff/__tests__/diff.test.ts` :: `empty snapshots produce empty result`

## 7. Execution Log

_(Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
