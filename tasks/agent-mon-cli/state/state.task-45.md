# Task: TSK-45 — State manager + ViewModel + waiting

## 1. Meta
- **Task-ID:** TSK-45
- **Status:** [ ] TODO
- **Purpose:** Реализовать state manager: createStateManager, ViewModel, groupByProvider, isWaitingForUser
- **Scope:** agent-mon-cli
- **Module:** state
- **Dependencies:** TSK-48
- **Reopens:** 0
- **Spec References:**
  - Contract: [`createStateManager`](../../../specs/agent-mon-cli/state/state.spec.md#createstatemanager)
  - Contract: [`ViewModel`](../../../specs/agent-mon-cli/state/state.spec.md#viewmodel)
  - Contract: [`isWaitingForUser`](../../../specs/agent-mon-cli/state/state.spec.md#iswaitingforuser)
  - Scope: [`agent-mon-cli` §5 Architecture](../../../specs/agent-mon-cli/agent-mon-cli.spec.md#5-high-level-architecture)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None

## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | —    | [ ]    |
| P2 | test | P1   | [ ]    |

## 3. Phases

### P1 — impl
- **Objective:** Реализовать createStateManager, ViewModel, groupByProvider, isWaitingForUser
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/agent-mon/state/create-state-manager.ts`
  - `cli/cmd/agent-mon/state/view-model.type.ts`
  - `cli/cmd/agent-mon/state/group-by-provider.ts`
  - `cli/cmd/agent-mon/state/is-waiting.ts`
  - `cli/cmd/agent-mon/state/index.ts`
- **Inputs:** none
- **Exit:** typecheck pass; createStateManager принимает AsyncIterable<SessionChanges>; ViewModel.status: loading|ready|error

### P2 — test
- **Objective:** Unit-тесты groupByProvider, isWaitingForUser, createStateManager
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/agent-mon/state/__tests__/create-state-manager.test.ts`
  - `cli/cmd/agent-mon/state/__tests__/group-by-provider.test.ts`
  - `cli/cmd/agent-mon/state/__tests__/is-waiting.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD сценарии покрыты; tests pass

## 4. Acceptance Criteria (BDD)
Contract: see Spec References.

**Feature:** State manager lifecycle + waiting detection

**Scenario:** createStateManager переходит loading→ready [`unit`]
- **Given** AsyncIterable с одним SessionChanges
- **When** создаём state manager и подписываемся
- **Then** первый вызов subscribe → status='loading'
- **And** после итерации → status='ready', data.columns заполнены

**Scenario:** groupByProvider группирует по провайдеру [`unit`]
- **Given** 3 сессии: 2 Claude, 1 OpenCode
- **When** groupByProvider(sessions)
- **Then** возвращает 2 ProviderColumn (Claude, OpenCode)
- **And** sessions отсортированы: active→waiting→idle→completed

**Scenario:** isWaitingForUser детектит вопрос [`unit`]
- **Given** lastMessage = "Choose variant?"
- **When** isWaitingForUser(session)
- **Then** возвращает true

**Scenario:** isWaitingForUser не детектит обычное сообщение [`unit`]
- **Given** lastMessage = "Running type-check..."
- **When** isWaitingForUser(session)
- **Then** возвращает false

**Scenario:** ошибка в observe → status='error' [`unit`]
- **Given** AsyncIterable, который бросает на второй итерации
- **When** state manager обрабатывает
- **Then** status='error', data содержит данные первой (успешной) итерации

## 5. Verification
| Command | Required by |
|---------|-------------|
| npm run type-check | typescript-rules |
| npm run test | node-test |

## 6. Test Scenario Coverage
- Scenario "loading→ready" → `cli/cmd/agent-mon/state/__tests__/create-state-manager.test.ts` :: `transitions loading to ready`
- Scenario "groupByProvider" → `cli/cmd/agent-mon/state/__tests__/group-by-provider.test.ts` :: `groups by provider with sort order`
- Scenario "isWaitingForUser detects question" → `cli/cmd/agent-mon/state/__tests__/is-waiting.test.ts` :: `detects question in last message`
- Scenario "isWaitingForUser no false positive" → `cli/cmd/agent-mon/state/__tests__/is-waiting.test.ts` :: `no false positive on regular message`
- Scenario "error status" → `cli/cmd/agent-mon/state/__tests__/create-state-manager.test.ts` :: `transitions to error on observer failure`

## 7. Execution Log

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
