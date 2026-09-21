# Task: UI-dashui — Ink-компоненты: ColumnView, SessionCard

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** UI-dashui
- **Status:** [ ] TODO
- **Purpose:** Реализовать ink-компоненты дашборда: AgentMonApp, ColumnView, ProviderColumn, SessionCard, StatusBadge
- **Scope:** agent-mon-cli
- **Module:** ui
- **Dependencies:** STA-manager
- **Reopens:** 0
- **Spec References:**
  - Contract: [`AgentMonApp`](./ui.spec.md#agentmonapp)
  - Contract: [`ColumnView`](./ui.spec.md#columnview)
  - Contract: [`SessionCard`](./ui.spec.md#sessioncard)
  - Scope: [`agent-mon-cli` §3 Golden DX](../agent-mon-cli.spec.md#3-approved-golden-dx-example)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
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

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

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

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

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

- Scenario "loading" → `cli/cmd/agent-mon/ui/__tests__/app.test.tsx` :: `shows loading state`
- Scenario "error" → `cli/cmd/agent-mon/ui/__tests__/app.test.tsx` :: `shows error with last data`
- Scenario "grouping" → `cli/cmd/agent-mon/ui/__tests__/column-view.test.tsx` :: `groups cards by status order`
- Scenario "badge" → `cli/cmd/agent-mon/ui/__tests__/session-card.test.tsx` :: `renders correct status badge`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-05-22T09:55:28Z` discovery tsconfig.json lacked `"jsx": "react-jsx"` — needed for .tsx compilation; added to compilerOptions
- [x] `2026-05-22T09:55:28Z` intro `StatusBadge` ← spec §3 Entity Inventory: визуальный индикатор статуса сессии
- [x] `2026-05-22T09:55:28Z` intro `SessionCard` ← spec §3 Entity Inventory: карточка одной сессии с метаданными
- [x] `2026-05-22T09:55:28Z` intro `ProviderColumn` ← spec §3 Entity Inventory: колонка провайдера с заголовком и карточками
- [x] `2026-05-22T09:55:28Z` intro `ColumnView` ← spec §3 Entity Inventory: дашборд с колонками по провайдерам
- [x] `2026-05-22T09:55:28Z` intro `AgentMonApp` ← spec §3 Entity Inventory: корень — useInput, подписка на state manager, выбор view
- [x] `2026-05-22T09:55:28Z` ver npm run type-check → pass exit=0
- [x] `2026-05-22T09:55:28Z` DONE
      **Handoff →** artifacts: [cli/cmd/agent-mon/ui/status-badge.tsx, cli/cmd/agent-mon/ui/session-card.tsx, cli/cmd/agent-mon/ui/provider-column.tsx, cli/cmd/agent-mon/ui/column-view.tsx, cli/cmd/agent-mon/ui/app.tsx, cli/cmd/agent-mon/ui/index.ts]; decisions: [module-system=esm, jsx-transform=react-jsx, state-imports-use-.ts-extension, ui-imports-use-.tsx-extension]; open: []

#### P2

- [x] `2026-05-22T10:05:33Z` discovery `.tsx`-тесты не обнаруживаются `node --test` (ERR_UNKNOWN_FILE_EXTENSION); для запуска используется `node --import tsx --test`
- [x] `2026-05-22T10:05:33Z` ver npm run test → pass exit=0
- [x] `2026-05-22T10:05:33Z` ver node --import tsx --test cli/cmd/agent-mon/ui/**tests**/\*.test.tsx → pass exit=0
- [x] `2026-05-22T10:05:33Z` DONE
      **Handoff →** artifacts: [cli/cmd/agent-mon/ui/__tests__/app.test.tsx, cli/cmd/agent-mon/ui/__tests__/column-view.test.tsx, cli/cmd/agent-mon/ui/__tests__/session-card.test.tsx]; decisions: [test-runner=node-test+tsx-loader, tsx-test-files-undiscoverable-by-plan-node-test]; open: [tsx-extension: .tsx тесты требуют tsx loader для запуска, npm run test их не покрывает]

#### Round close

- [ ] `<ts>` DONE

#### Round close

- [x] `2026-05-22T10:45:57Z` DONE

<!--/SECTION:EXECUTION_LOG-->
