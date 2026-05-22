# Task: TSK-41 — Корневой barrel + subpath-exports

## 1. Meta
- **Task-ID:** TSK-41
- **Status:** [ ] TODO
- **Purpose:** Создать корневой index.ts и добавить subpath-exports в package.json для импортов из Golden DX
- **Scope:** agent-mon
- **Module:** N/A (scope-level)
- **Dependencies:** TSK-36, TSK-39, TSK-40
- **Spec References:**
  - Scope: [`agent-mon` §2 Golden DX](../../../specs/agent-mon/agent-mon.spec.md#2-approved-golden-dx-example)
  - Scope: [`agent-mon` §4 Public API Surface](../../../specs/agent-mon/agent-mon.spec.md#4-public-api-surface)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None

## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | —    | [x] |

## 3. Phases

### P1 — impl
- **Objective:** Создать services/agent-mon/index.ts с реэкспортом createMonitor, diff, observe, типов и ошибок; добавить exports в package.json
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-mon/index.ts`
  - `package.json`
- **Inputs:** none
- **Exit:** `import { createMonitor, diff, observe } from 'agent-mon'` работает; `import { claudeProvider } from 'agent-mon/providers/claude'` работает

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

## 5. Verification
| Command | Required by |
|---------|-------------|
| npm run type-check | typescript-rules |

## 6. Test Scenario Coverage
- Scenario "Корневой импорт" → contract-level (type-check)
- Scenario "Claude subpath" → contract-level (type-check)
- Scenario "OpenCode subpath" → contract-level (type-check)

## 7. Execution Log
*(Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)*

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
