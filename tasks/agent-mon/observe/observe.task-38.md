# Task: TSK-38 — observe: async iterable

## 1. Meta

- **Task-ID:** TSK-38
- **Status:** [ ] TODO
- **Purpose:** Реализовать свободную функцию observe(monitor, opts) → AsyncIterable<SessionChanges> с поддержкой idleThresholdMs
- **Scope:** agent-mon
- **Module:** observe
- **Dependencies:** TSK-35, TSK-36, TSK-37
- **Spec References:**
  - Contract: [`observe`](../../../specs/agent-mon/observe/observe.spec.md#observe)
  - Service: [`AgentMonitor`](../../../specs/agent-mon/monitor/monitor.spec.md#agentmonitor)
  - Function: [`diff`](../../../specs/agent-mon/diff/diff.spec.md#diff)
  - Scope: [`agent-mon` §3.1 F8`, §2 Golden DX](../../../specs/agent-mon/agent-mon.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Objective:** Реализовать observe(monitor, opts) → AsyncIterable<SessionChanges>
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-mon/observe/observe.ts`
  - `services/agent-mon/observe/index.ts`
- **Inputs:** none
- **Exit:** typecheck pass; первая итерация не yield'ит; idleThresholdMs по умолчанию 300000; интервал >= 100 мс

### P2 — test

- **Objective:** Тесты observe с мок-монитором
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-mon/observe/__tests__/observe.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD сценарии покрыты; tests pass

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Непрерывное наблюдение за изменениями сессий

**Scenario:** Первая итерация не yield'ит изменения [`unit`]

- **Given** мок-монитор возвращает 1 сессию при scanAll
- **When** начинаем итерацию observe(mon, { interval: 100 })
- **Then** первый yield происходит только после второго scanAll
- **And** первый yield содержит changes

**Scenario:** Интервал соблюдается между итерациями [`unit`]

- **Given** observe с interval=200
- **When** замеряем время между yield'ами
- **Then** разница >= 200 мс

**Scenario:** Цикл продолжается при ошибке провайдера [`unit`]

- **Given** первый scanAll успешен, второй бросает
- **When** продолжаем итерацию
- **Then** observe не крашится, yield'ит пустой SessionChanges

**Scenario:** idleThresholdMs выставляет статус idle [`unit`]

- **Given** сессия с lastActivityAt = now - 600000 (10 мин), idleThresholdMs = 300000
- **When** observe вызывает diff
- **Then** сессия попадает в updated со status='idle'

## 5. Verification

| Command            | Required by      |
| ------------------ | ---------------- |
| npm run type-check | typescript-rules |
| npm run test       | node-test        |

## 6. Test Scenario Coverage

- Scenario "Первая итерация" → `services/agent-mon/observe/__tests__/observe.test.ts` :: `first iteration yields after second scan`
- Scenario "Интервал" → `services/agent-mon/observe/__tests__/observe.test.ts` :: `interval honored between iterations`
- Scenario "Цикл продолжается" → `services/agent-mon/observe/__tests__/observe.test.ts` :: `continues on provider failure`
- Scenario "idleThresholdMs" → `services/agent-mon/observe/__tests__/observe.test.ts` :: `idle threshold triggers status change`

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
