# Task: TSK-46 — Ink-компоненты: ColumnView, SessionCard

## 1. Meta
- **Task-ID:** TSK-46
- **Status:** [ ] TODO
- **Purpose:** Реализовать ink-компоненты дашборда: AgentMonApp, ColumnView, ProviderColumn, SessionCard, StatusBadge
- **Scope:** agent-mon-cli
- **Module:** ui
- **Dependencies:** TSK-45
- **Reopens:** 0
- **Spec References:**
  - Contract: [`AgentMonApp`](../../../specs/agent-mon-cli/ui/ui.spec.md#agentmonapp)
  - Contract: [`ColumnView`](../../../specs/agent-mon-cli/ui/ui.spec.md#columnview)
  - Contract: [`SessionCard`](../../../specs/agent-mon-cli/ui/ui.spec.md#sessioncard)
  - Scope: [`agent-mon-cli` §3 Golden DX](../../../specs/agent-mon-cli/agent-mon-cli.spec.md#3-approved-golden-dx-example)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None

## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | —    | [ ]    |
| P2 | test | P1   | [ ]    |

## 3. Phases

### P1 — impl
- **Objective:** Реализовать 5 ink-компонентов + index.ts
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/agent-mon/ui/app.tsx`
  - `cli/cmd/agent-mon/ui/column-view.tsx`
  - `cli/cmd/agent-mon/ui/provider-column.tsx`
  - `cli/cmd/agent-mon/ui/session-card.tsx`
  - `cli/cmd/agent-mon/ui/status-badge.tsx`
  - `cli/cmd/agent-mon/ui/index.ts`
- **Inputs:** none
- **Exit:** typecheck pass; AgentMonApp использует useInput; ColumnView рендерит колонки с группировкой по статусу

### P2 — test
- **Objective:** Тесты ink-компонентов
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/agent-mon/ui/__tests__/app.test.tsx`
  - `cli/cmd/agent-mon/ui/__tests__/column-view.test.tsx`
  - `cli/cmd/agent-mon/ui/__tests__/session-card.test.tsx`
- **Inputs:** P1 handoff
- **Exit:** все BDD сценарии покрыты; tests pass

## 4. Acceptance Criteria (BDD)
Contract: see Spec References.

**Feature:** Ink-дашборд с колонками по провайдерам

**Scenario:** AgentMonApp показывает loading до первого scan [`unit`]
- **Given** ViewModel.status='loading'
- **When** AgentMonApp рендерится
- **Then** выводит "Scanning for active sessions..."

**Scenario:** AgentMonApp показывает error с данными [`unit`]
- **Given** ViewModel.status='error', data содержит сессии
- **When** AgentMonApp рендерится
- **Then** выводит сообщение об ошибке + последние данные

**Scenario:** ColumnView группирует карточки по статусу [`unit`]
- **Given** ProviderColumn с 2 active, 1 waiting, 1 idle
- **When** ColumnView рендерит
- **Then** карточки grouped: active сверху, потом waiting, idle, completed

**Scenario:** StatusBadge показывает правильный индикатор [`unit`]
- **Given** status='waiting'
- **When** StatusBadge рендерится
- **Then** содержит ⏳ и текст "waiting"

## 5. Verification
| Command | Required by |
|---------|-------------|
| npm run type-check | typescript-rules |
| npm run test | node-test |

## 6. Test Scenario Coverage
- Scenario "loading" → `cli/cmd/agent-mon/ui/__tests__/app.test.tsx` :: `shows loading state`
- Scenario "error" → `cli/cmd/agent-mon/ui/__tests__/app.test.tsx` :: `shows error with last data`
- Scenario "grouping" → `cli/cmd/agent-mon/ui/__tests__/column-view.test.tsx` :: `groups cards by status order`
- Scenario "badge" → `cli/cmd/agent-mon/ui/__tests__/session-card.test.tsx` :: `renders correct status badge`

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
