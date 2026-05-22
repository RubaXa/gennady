# Task: TSK-36 — AgentMonitor: ядро и фабрика

## 1. Meta

- **Task-ID:** TSK-36
- **Status:** [x] DONE
- **Purpose:** Реализовать AgentMonitor (Service) — register, unregister, scanAll, scanOne — и createMonitor (Factory)
- **Scope:** agent-mon
- **Module:** monitor
- **Dependencies:** TSK-35
- **Reopens:** 0- **Spec References:**
  - Contract: [`AgentMonitor`](../../../specs/agent-mon/monitor/monitor.spec.md#agentmonitor)
  - Contract: [`createMonitor`](../../../specs/agent-mon/monitor/monitor.spec.md#createmonitor)
  - Port: [`AgentProvider`](../../../specs/agent-mon/model/model.spec.md#agentprovider)
  - Errors: [`DuplicateProviderError`, `ProviderNotFoundError`](../../../specs/agent-mon/agent-mon.spec.md#4-public-api-surface)
  - Scope: [`agent-mon` §2 Golden DX](../../../specs/agent-mon/agent-mon.spec.md#2-approved-golden-dx-example)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]   |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Objective:** Реализовать AgentMonitor (register, unregister, scanAll, scanOne) + createMonitor
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-mon/monitor/agent-monitor.ts`
  - `services/agent-mon/monitor/create-monitor.ts`
  - `services/agent-mon/monitor/index.ts`
- **Inputs:** none
- **Exit:** typecheck pass; scanAll вызывает Promise.all; register бросает DuplicateProviderError

### P2 — test

- **Objective:** Unit-тесты AgentMonitor с мок-провайдерами
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-mon/monitor/__tests__/agent-monitor.test.ts`
  - `services/agent-mon/monitor/__tests__/create-monitor.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD сценарии покрыты; tests pass

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Реестр провайдеров и координация сканирования

**Scenario:** register добавляет провайдер и бросает на дубликате [`unit`]

- **Given** новый AgentMonitor
- **When** register('test', mockProvider)
- **Then** scanAll вызывает mockProvider.scan
- **And** повторный register('test', other) бросает DuplicateProviderError

**Scenario:** scanAll агрегирует результаты всех провайдеров [`unit`]

- **Given** зарегистрированы 2 мок-провайдера, каждый возвращает по 1 сессии
- **When** scanAll()
- **Then** возвращает массив из 2 сессий, отсортированных по startedAt desc
- **And** сессии содержат provider = ключ провайдера

**Scenario:** scanOne бросает ProviderNotFoundError для неизвестного ключа [`unit`]

- **Given** пустой монитор
- **When** scanOne('unknown')
- **Then** бросает ProviderNotFoundError

**Scenario:** отказ одного провайдера не прерывает scanAll [`unit`]

- **Given** 2 провайдера, первый бросает ошибку, второй возвращает сессию
- **When** scanAll()
- **Then** возвращает 1 сессию от второго провайдера

**Scenario:** scanAll 50 сессий < 1с [`perf`]

- **Given** 1 провайдер с 50 мок-сессиями
- **When** scanAll()
- **Then** время выполнения < 1000ms
- **Deferred Test Ownership:** ручная проверка (мок-провайдер без реального I/O)

## 5. Verification

| Command            | Required by      |
| ------------------ | ---------------- |
| npm run type-check | typescript-rules |
| npm run test       | node-test        |

## 6. Test Scenario Coverage

- Scenario "register" → `services/agent-mon/monitor/__tests__/agent-monitor.test.ts` :: `register adds provider and rejects duplicate`
- Scenario "scanAll агрегирует" → `services/agent-mon/monitor/__tests__/agent-monitor.test.ts` :: `scanAll aggregates from all providers`
- Scenario "scanOne бросает" → `services/agent-mon/monitor/__tests__/agent-monitor.test.ts` :: `scanOne throws ProviderNotFoundError for unknown key`
- Scenario "отказ провайдера" → `services/agent-mon/monitor/__tests__/agent-monitor.test.ts` :: `scanAll degrades gracefully on provider failure`
- Scenario "scanAll 50 сессий < 1с" → Deferred Test Ownership: ручная проверка

## 7. Execution Log

_(Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — initial

#### P1

- [x] `<ts>` intro AgentMonitor ← ядро реестра провайдеров и координации сканирования
- [x] `<ts>` intro createMonitor ← фабрика для создания AgentMonitor
- [x] `<ts>` ver `npm run type-check` → pass exit=0
- [x] `<ts>` DONE
      **Handoff →** artifacts: [services/agent-mon/monitor/agent-monitor.ts, services/agent-mon/monitor/create-monitor.ts, services/agent-mon/monitor/index.ts]; decisions: [module-system=esm, agent-monitor=class-with-map, graceful-degradation=catch-and-return-empty]; open: []

#### P2

- [x] `<ts>` discovery SUT files (P1) используют `.js` расширения для value-импортов → несовместимо с `node --test` (runtime резолвит только `.ts` для value imports; `import type` OK). Кодовая база использует `.ts` для value imports (см. dbc-ts-linter.ts, anchor.check.ts).
- 🛑 `<ts>` BLOCKED: P1 SUT imports `.js` extensions incompatible with `node --test` runtime
  - 🔗 axiom: AX_BLOCKER_ESCALATION
  - 💬 unblock: заменить value-импорты в `agent-monitor.ts` (`'../model/errors.js'` → `'../model/errors.ts'`, `'#logger'` → `'./services/logger/logger.ts'` или аналогично) на `.ts` расширения, совместимые с остальной кодовой базой. После этого перезапустить P2.

#### P2 — re-run: resume after blocker — P1 SUT value imports fixed (.js → .ts)

- ✅ `<ts>` RESOLVED: P1 SUT imports converted to `.ts` extensions (agent-monitor.ts: `errors.js` → `errors.ts`; create-monitor.ts: `agent-monitor.js` → `agent-monitor.ts`; index.ts: `.js` → `.ts`). ref: original BLOCKED in same round.
- [x] `<ts>` insight 1 предсуществующий failing test в `cli/cmd/alt-opinion/__tests__/alt-opinion.cmd.test.ts` (test 5: Synthesis failure) → не относится к P2. Все 8 тестов P2 проходят.
- [x] `<ts>` ver `node --test services/agent-mon/monitor/__tests__/*.test.ts` → pass exit=0 (8/8, изолированно; project-wide npm run test fail=exit1 — предсуществующий сбой alt-opinion.cmd.test.ts, не относится к TSK-36)
- [x] `<ts>` DONE
  **Handoff →** artifacts: [services/agent-mon/monitor/__tests__/agent-monitor.test.ts, services/agent-mon/monitor/__tests__/create-monitor.test.ts]; decisions: [test-runner=node-test, mock-strategy=native-mock-fn, bdd-coverage=4-of-5-scenarios (perf-deferred)]; open: [perf: scanAll-50-sessions scenario deferred to manual check per ticket §4]


#### Round close
- [x] `<ts>` sync agent-mon+root
- [x] `<ts>` DONE
