# Task: AM-exports — Корневой barrel + subpath-exports

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** AM-exports
- **Status:** [ ] TODO
- **Purpose:** Создать корневой index.ts и добавить subpath-exports в package.json для импортов из Golden DX
- **Scope:** agent-mon
- **Module:** N/A (scope-level)
- **Dependencies:** MON-service, AM-claude, AM-opencode
- **Spec References:**
  - Scope: [`agent-mon` §2 Golden DX](./agent-mon.spec.md#2-approved-golden-dx-example)
  - Scope: [`agent-mon` §4 Public API Surface](./agent-mon.spec.md#4-public-api-surface)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Создать services/agent-mon/index.ts с реэкспортом createMonitor, diff, observe, типов и ошибок; добавить exports в package.json
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-mon/index.ts`
  - `package.json`
- **Inputs:** none
- **Exit:** `import { createMonitor, diff, observe } from 'agent-mon'` работает; `import { claudeProvider } from 'agent-mon/providers/claude'` работает

<!--/SECTION:PHASE_P1-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Импорты из Golden DX компилируются

**Scenario:** Корневой импорт createMonitor, diff, observe [`contract`]

- **Given** `services/agent-mon/index.ts`
  - `package.json` с реэкспортом
- **When** `import { createMonitor, diff, observe } from 'agent-mon'`
- **Then** type-check проходит

**Scenario:** Subpath-импорт Claude провайдера [`contract`]

- **Given** exports map в package.json
- **When** `import { claudeProvider } from 'agent-mon/providers/claude'`
- **Then** type-check проходит

**Scenario:** Subpath-импорт OpenCode провайдера [`contract`]

- **Given** exports map в package.json
- **When** `import { opencodeProvider } from 'agent-mon/providers/opencode'`
- **Then** type-check проходит

**Scenario:** Ошибка: обязательный provider export отсутствует [`contract`]

- **Given** exports map без Claude provider subpath
- **When** package contract проверяет обязательные exports
- **Then** проверка отклоняет неполный map

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command            | Required by      | Role  |
| ------------------ | ---------------- | ----- |
| npm run type-check | typescript-rules | extra |

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Корневой импорт → `public-contract.test.ts` :: `root export points at the agent-mon barrel`
- Claude subpath → `public-contract.test.ts` :: `Claude provider subpath is exported`
- OpenCode subpath → `public-contract.test.ts` :: `OpenCode provider subpath is exported`
- отсутствующий provider export → `public-contract.test.ts` :: `missing required export is rejected by the package contract`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — initial

#### P1

- [x] `2026-05-22` ver `npm run type-check` → pass exit=0
- 🛑 `2026-05-22` BLOCKED: Объектив фазы требует добавить exports в package.json, но package.json не указан в Target Files
  - 🔗 axiom: AX_PHASE_SCOPE_LOCK
  - 💬 unblock: Добавить `package.json` в Target Files секции P1, либо создать отдельную фазу P2 под конфигурацию exports. Баррель index.ts создан и проходит type-check.
- ✅ `2026-05-22` RESOLVED: package.json добавлен в Target Files P1 (строка 30). Exports map внесён.
- [x] `2026-05-22` ver `npm run type-check` → pass exit=0
- [x] `2026-05-22` DONE
      **Handoff →** artifacts: [services/agent-mon/index.ts, package.json]; decisions: [barrel-created=true, exports-map=3-entries]; open: []

#### Round close

- [ ] `<ts>` DONE

#### Round close

- [x] `2026-05-22T06:29:14Z` DONE

<!--/SECTION:EXECUTION_LOG-->
