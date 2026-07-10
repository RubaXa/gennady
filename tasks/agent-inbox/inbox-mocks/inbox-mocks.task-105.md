# Task: TSK-105 — inbox-mocks: фабрики мок-данных + e2e-харнесс

## 1. Meta

- **Task-ID:** TSK-105 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-mocks | **Dependencies:** —
- **Purpose:** Фабрики мок-данных для dev/e2e. Playwright-харнесс: запуск inbox-api + vite dev, smoke-test дашборда.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-03, [inbox-mocks.spec.md](../../specs/agent-inbox/inbox-mocks/inbox-mocks.spec.md) | **Runtime:** not-implemented | **Verification:** unit, e2e

## 2. Phases Overview

| ID  | Kind | Deps  | Status |
| --- | ---- | ----- | ------ |
| P1  | impl | —     | [ ]    |
| P2  | impl | P1    | [ ]    |
| P3  | test | P1,P2 | [ ]    |

## 3. Phases

### P1 — impl (фабрики)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-mocks/mr.mock.ts` — `mockActionableMr()`, `mockMrContext()`
  - `services/agent-inbox/modules/inbox-mocks/board.mock.ts` — `mockBoard()`
  - `services/agent-inbox/modules/inbox-mocks/opencode.mock.ts` — `mockOpenCodeResponse()`
  - `services/agent-inbox/modules/inbox-mocks/index.ts` — re-export
- **Exit:** Все фабрики возвращают типизированные мок-объекты. Поля переопределяемы через partial-аргументы.

### P2 — impl (e2e харнесс)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `e2e/inbox-serve/playwright.config.ts` — webServer: inbox-api + vite dev
  - `e2e/inbox-serve/fixtures/mock-data.ts` — сценарии мок-данных через inbox-mocks
  - `e2e/inbox-serve/smoke.spec.ts` — открыть дашборд, проверить шапку, мок-данные видны
- **Exit:** `npx playwright test --config=e2e/inbox-serve/playwright.config.ts` — smoke test проходит.

### P3 — test (фабрики)

- **Rules:** none
- **Target Files:** `services/agent-inbox/modules/inbox-mocks/__tests__/` — валидация типов возвращаемых объектов
- **Exit:** Тесты проверяют, что фабрики возвращают корректные типы.

## 4. BDD

- GIVEN фабрика mockActionableMr() WHEN вызвана с { iid: 510 } THEN возвращает ActionableMr с iid=510 и дефолтными полями
- GIVEN фабрика mockBoard() WHEN вызвана с roles=[reviewer(active)] и 2 MR THEN board.roles[0].lanes.inbox содержит 2 карточки
- GIVEN фабрика mockOpenCodeResponse('review', {...}) WHEN вызвана THEN возвращает structured output с полями findings и verdict
- GIVEN playwright webServer запущен WHEN page.goto('/') THEN виден заголовок «agent-inbox»

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-mocks/__tests__/*.test.ts'` — pass
- `npx playwright test --config=e2e/inbox-serve/playwright.config.ts` — pass (smoke)
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                       | Level | Test File                                   |
| ------------------------------ | ----- | ------------------------------------------- |
| mockActionableMr типы          | unit  | inbox-mocks/**tests**/mr.mock.test.ts       |
| mockBoard типы                 | unit  | inbox-mocks/**tests**/board.mock.test.ts    |
| mockOpenCodeResponse типы      | unit  | inbox-mocks/**tests**/opencode.mock.test.ts |
| e2e smoke: дашборд открывается | e2e   | e2e/inbox-serve/smoke.spec.ts               |

## 7. Execution Log

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []

#### P3

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []
