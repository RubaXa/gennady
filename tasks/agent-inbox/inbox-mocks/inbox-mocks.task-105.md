# Task: TSK-105 — inbox-mocks: фабрики мок-данных

## 1. Meta

- **Task-ID:** TSK-105 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-mocks | **Dependencies:** TSK-109 (типы ActionableMr, MrContext)
- **Purpose:** Фабрики мок-данных для dev/e2e. Playwright-харнесс — в TSK-107/108.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-03, [inbox-mocks.spec.md](../../specs/agent-inbox/inbox-mocks/inbox-mocks.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

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

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
