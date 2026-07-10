# Task: TSK-105 — inbox-mocks: фабрики мок-данных

## 1. Meta

- **Task-ID:** TSK-105 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-mocks | **Dependencies:** TSK-109 (типы ActionableMr, MrContext)
- **Purpose:** Фабрики мок-данных для dev/e2e. Playwright-харнесс — в TSK-107/108.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-03, [inbox-mocks.spec.md](../../specs/agent-inbox/inbox-mocks/inbox-mocks.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl (фабрики)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-mocks/mr.mock.ts` — `mockActionableMr()`, `mockMrContext()`
  - `services/agent-inbox/modules/inbox-mocks/board.mock.ts` — `mockBoard()`
  - `services/agent-inbox/modules/inbox-mocks/opencode.mock.ts` — `mockOpenCodeResponse()`
  - `services/agent-inbox/modules/inbox-mocks/index.ts` — re-export
- **Exit:** Все фабрики возвращают типизированные мок-объекты. Поля переопределяемы через partial-аргументы.

### P2 — test (фабрики)

- **Rules:** none
- **Target Files:** `services/agent-inbox/modules/inbox-mocks/__tests__/` — валидация типов возвращаемых объектов
- **Exit:** Тесты проверяют, что фабрики возвращают корректные типы.

## 4. BDD

- GIVEN фабрика mockActionableMr() WHEN вызвана с { iid: 510 } THEN ActionableMr с iid=510 и дефолтными полями
- GIVEN фабрика mockBoard() WHEN вызвана с roles=[reviewer(active)] и 2 MR THEN board.roles[0].lanes.inbox содержит 2 карточки
- GIVEN фабрика mockOpenCodeResponse('review', {...}) WHEN вызвана THEN structured output с полями findings и verdict

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-mocks/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                  | Level | Test File                                   |
| ------------------------- | ----- | ------------------------------------------- |
| mockActionableMr типы     | unit  | inbox-mocks/**tests**/mr.mock.test.ts       |
| mockBoard типы            | unit  | inbox-mocks/**tests**/board.mock.test.ts    |
| mockOpenCodeResponse типы | unit  | inbox-mocks/**tests**/opencode.mock.test.ts |

## 7. Execution Log

### Round 1 — 2026-07-10, initial

#### P1

- [x] `2026-07-10T11:30:00Z` Created `services/agent-inbox/modules/inbox-mocks/mr.mock.ts` — `mockActionableMr(partial?)`, `mockMrContext(partial?)`: фабрики с дефолтами, переопределение полей через partial
- [x] `2026-07-10T11:30:00Z` Created `services/agent-inbox/modules/inbox-mocks/board.mock.ts` — `mockBoard(opts?)`: роли с Kanban-лейнами, unassigned MR
- [x] `2026-07-10T11:30:00Z` Created `services/agent-inbox/modules/inbox-mocks/opencode.mock.ts` — `mockOpenCodeResponse(nodeId, opts?)`: structured output (findings, verdict)
- [x] `2026-07-10T11:30:00Z` Created `services/agent-inbox/modules/inbox-mocks/index.ts` — re-export всех фабрик
- [x] `2026-07-10T11:35:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-10T11:35:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-10T11:35:00Z` DONE
- [x] **Handoff →** artifacts: [mr.mock.ts, board.mock.ts, opencode.mock.ts, index.ts]; decisions: [D_factories=partial-override, D_mock_data=match inbox-core types]; open: []

#### P2

- [x] `2026-07-10T11:40:00Z` Created `services/agent-inbox/modules/inbox-mocks/__tests__/mr.mock.test.ts` — 5 tests: типы ActionableMr, общие поля, partial override, edge cases
- [x] `2026-07-10T11:40:00Z` Created `services/agent-inbox/modules/inbox-mocks/__tests__/board.mock.test.ts` — 5 tests: board structure, role lanes, unassigned, empty board
- [x] `2026-07-10T11:40:00Z` Created `services/agent-inbox/modules/inbox-mocks/__tests__/opencode.mock.test.ts` — 4 tests: structured output fields, nodeId routing, partial override
- [x] `2026-07-10T11:45:00Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-mocks/__tests__/*.test.ts'` → pass exit=0 (14/14)
- [x] `2026-07-10T11:45:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-10T11:45:00Z` DONE
- [x] **Handoff →** artifacts: [mr.mock.test.ts, board.mock.test.ts, opencode.mock.test.ts]; decisions: [test_counts=14]; open: []

#### Round close

- [x] `2026-07-10T11:50:00Z` sync inbox-mocks
- [x] `2026-07-10T11:50:00Z` DONE
