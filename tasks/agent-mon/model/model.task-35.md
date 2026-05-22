# Task: TSK-35 — Типы и контракты agent-mon

## 1. Meta

- **Task-ID:** TSK-35
- **Status:** [x] DONE
- **Purpose:** Создать все типы, контракты и ошибки библиотеки — AgentSession, SessionChanges, ScanOpts, ObserveOpts, AgentProvider, DuplicateProviderError, ProviderNotFoundError
- **Scope:** agent-mon
- **Module:** model
- **Dependencies:** None
- **Reopens:** 0
- **Spec References:**
  - Contract: [`AgentSession`](../../../specs/agent-mon/model/model.spec.md#agentsession)
  - Contract: [`SessionChanges`](../../../specs/agent-mon/model/model.spec.md#sessionchanges)
  - Contract: [`ScanOpts`](../../../specs/agent-mon/model/model.spec.md#scanopts)
  - Contract: [`ObserveOpts`](../../../specs/agent-mon/model/model.spec.md#observeopts)
  - Contract: [`AgentProvider`](../../../specs/agent-mon/model/model.spec.md#agentprovider)
  - Scope: [`agent-mon` §4 Public API Surface](../../../specs/agent-mon/agent-mon.spec.md#4-public-api-surface)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Objective:** Создать 5 type-файлов + errors + index.ts с реэкспортом
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-mon/model/agent-session.type.ts`
  - `services/agent-mon/model/session-changes.type.ts`
  - `services/agent-mon/model/scan-opts.type.ts`
  - `services/agent-mon/model/observe-opts.type.ts`
  - `services/agent-mon/model/agent-provider.type.ts`
  - `services/agent-mon/model/errors.ts`
  - `services/agent-mon/model/index.ts`
- **Inputs:** none
- **Exit:** typecheck pass; все поля AgentSession соответствуют спецификации §4

### P2 — test

- **Objective:** Тесты на структурную целостность типов (contract-level)
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-mon/model/__tests__/agent-session.type.test.ts`
- **Inputs:** P1 handoff
- **Exit:** test pass; проверено что все обязательные поля AgentSession присутствуют

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Унифицированная модель сессии и контракт провайдера

**Scenario:** AgentSession содержит все обязательные поля [`contract`]

- **Given** тип AgentSession определён в `agent-session.type.ts`
- **When** он экспортирован через `index.ts`
- **Then** содержит поля: provider, pid, sessionId, title, cwd, status, startedAt, elapsedSeconds
- **And** опциональные поля: parentId, slug, model, agent, completedAt, lastActivityAt, idleSeconds, cpuPercent, memoryMb, toolCallCount, errorCount, lastMessage, tokensInput, tokensOutput

**Scenario:** AgentProvider объявляет контракт scan [`contract`]

- **Given** интерфейс AgentProvider определён
- **When** он экспортирован
- **Then** содержит readonly key: string
- **And** метод scan(opts?: ScanOpts): Promise<AgentSession[]>

**Scenario:** SessionChanges содержит три массива [`contract`]

- **Given** тип SessionChanges определён
- **When** он экспортирован
- **Then** содержит added: AgentSession[], removed: AgentSession[], updated: AgentSession[]

- **Scenario:** ObserveOpts содержит idleThresholdMs опционально [`contract`]
- **Given** тип ObserveOpts определён
- **When** он экспортирован
- **Then** содержит `interval: number` и `idleThresholdMs?: number`

**Scenario:** DuplicateProviderError и ProviderNotFoundError экспортируются [`contract`]

- **Given** классы ошибок определены в errors.ts
- **When** они экспортируются через index.ts
- **Then** оба содержат `key: string`, оба extends Error

## 5. Verification

| Command            | Required by      |
| ------------------ | ---------------- |
| npm run type-check | typescript-rules |

## 6. Test Scenario Coverage

- Scenario "AgentSession содержит все обязательные поля" → `services/agent-mon/model/__tests__/agent-session.type.test.ts` :: `session has required fields`
- Scenario "AgentProvider объявляет контракт scan" → contract-level (type-check)
-
- Scenario "SessionChanges содержит три массива" → contract-level (type-check)
- Scenario "ObserveOpts содержит idleThresholdMs" → contract-level (type-check)
- Scenario "Errors экспортируются" → contract-level (type-check)

## 7. Execution Log

_(Round = one execute-then-audit attempt. Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

- ### Round 1 — initial

#### P1

- [x] `<ts>` intro DuplicateProviderError ← ошибка реестра: дубликат ключа при register()
- [x] `<ts>` intro ProviderNotFoundError ← ошибка реестра: ключ не найден при unregister()/scanOne()
- [x] `<ts>` ver npm run type-check → pass exit=0
- [x] `<ts>` DONE
      **Handoff →** artifacts: [services/agent-mon/model/agent-session.type.ts, services/agent-mon/model/session-changes.type.ts, services/agent-mon/model/scan-opts.type.ts, services/agent-mon/model/observe-opts.type.ts, services/agent-mon/model/agent-provider.type.ts, services/agent-mon/model/errors.ts, services/agent-mon/model/index.ts]; decisions: [module-system=nodenext, contract=AgentProvider-error-degradation-returns-empty-array]; open: []

#### P2

- [x] `<ts>` ver node --test services/agent-mon/model/**tests**/agent-session.type.test.ts → pass exit=0
- [x] `<ts>` DONE
      **Handoff →** artifacts: [services/agent-mon/model/__tests__/agent-session.type.test.ts]; decisions: [contract-test=structural-integrity, node-test-runner=node--test]; open: []

#### Round close

- [x] `<ts>` sync agent-mon+root
- [x] `<ts>` DONE
