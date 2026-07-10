# Task: TSK-114 — inbox-visual-testing: ARIA snapshots + layout helpers

## 1. Meta

- **Task-ID:** TSK-114 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-mocks (e2e helpers) | **Dependencies:** TSK-105 (mocks), TSK-107 (dashboard)
- **Purpose:** «Глаза и измерительные приборы» для AI-агента. ARIA-снапшоты (структура страницы как YAML) + layout-хелперы (относительные позиции в процентах). Позволяет агенту проверять визуальную корректность дашборда без pixel-level сравнений.
- **Spec:** [inbox-dashboard.spec.md](../../specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md) §5 (визуальные контракты), [inbox-mocks.spec.md](../../specs/agent-inbox/inbox-mocks/inbox-mocks.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `e2e/inbox-serve/helpers/aria-snapshot.helper.ts` — `captureAriaSnapshot(page)`, `compareAriaSnapshot(page, expected)`, `generateAriaSnapshot(page)`. Обёртка над `page.ariaSnapshot()` и `toMatchAriaSnapshot()`.
  - `e2e/inbox-serve/helpers/layout.helper.ts` — `getRelativePosition(locator) → { left%, top%, width%, height% }`, `isLeftOf(a, b)`, `isBelow(a, b)`, `isWithin(a, container)`. Обёртка над `locator.boundingBox()`.
- **Exit:** Хелперы возвращают структурированные данные, которые агент может прочитать и проверить.

### P2 — test

- **Rules:** none
- **Target Files:** `e2e/inbox-serve/helpers/__tests__/` — модульные тесты хелперов
- **Exit:** Тесты проверяют корректность вычисления процентов, порядка элементов.

## 4. BDD

- GIVEN страница дашборда загружена WHEN captureAriaSnapshot(page) THEN YAML-строка с ролями, колонками, карточками
- GIVEN снапшот соответствует эталону WHEN compareAriaSnapshot(page, expected) THEN pass
- GIVEN снапшот НЕ соответствует WHEN compareAriaSnapshot THEN fail с диффом
- GIVEN элемент A слева от элемента B WHEN isLeftOf(A, B) THEN true
- GIVEN boundingBox {x:100, y:200, width:300, height:50} WHEN getRelativePosition THEN {left:10%, top:20%, width:30%, height:5%} при viewport 1000×1000
- GIVEN элемент внутри контейнера WHEN isWithin(element, container) THEN true

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'e2e/inbox-serve/helpers/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                            | Level | Test File                    |
| ----------------------------------- | ----- | ---------------------------- |
| captureAriaSnapshot возвращает YAML | unit  | aria-snapshot.helper.test.ts |
| compareAriaSnapshot pass/fail       | unit  | aria-snapshot.helper.test.ts |
| getRelativePosition — проценты      | unit  | layout.helper.test.ts        |
| isLeftOf / isBelow / isWithin       | unit  | layout.helper.test.ts        |

## 7. Execution Log

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
