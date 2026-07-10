# Task: TSK-114 — inbox-visual-testing: ARIA snapshots + layout helpers

## 1. Meta

- **Task-ID:** TSK-114 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-mocks (e2e helpers) | **Dependencies:** TSK-105 (mocks), TSK-107 (dashboard)
- **Purpose:** «Глаза и измерительные приборы» для AI-агента. ARIA-снапшоты (структура страницы как YAML) + layout-хелперы (относительные позиции в процентах). Позволяет агенту проверять визуальную корректность дашборда без pixel-level сравнений.
- **Spec:** [inbox-dashboard.spec.md](../../specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md) §5 (визуальные контракты), [inbox-mocks.spec.md](../../specs/agent-inbox/inbox-mocks/inbox-mocks.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

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

### Round 1 — 2026-07-10, initial

#### P1

- [x] `2026-07-10T15:30:00Z` Created `e2e/inbox-serve/helpers/aria-snapshot.helper.ts` — `captureAriaSnapshot(page)`: обёртка над `page.ariaSnapshot()` возвращает YAML-строку; `compareAriaSnapshot(page, expected)`: обёртка над `toMatchAriaSnapshot()` с диффом; `generateAriaSnapshot(page)`: генерация эталона
- [x] `2026-07-10T15:30:00Z` Created `e2e/inbox-serve/helpers/layout.helper.ts` — `getRelativePosition(locator) → { left%, top%, width%, height% }`: обёртка над `locator.boundingBox()`; `isLeftOf(a, b)`, `isBelow(a, b)`, `isWithin(a, container)` — проверка пространственных отношений
- [x] `2026-07-10T15:35:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-10T15:35:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-10T15:35:00Z` DONE
- [x] **Handoff →** artifacts: [aria-snapshot.helper.ts, layout.helper.ts]; decisions: [D_aria_snapshot_as_YAML, D_layout_percentages=viewport-relative, D_helpers_for_agents_not_pixels]; open: []

#### P2

- [x] `2026-07-10T15:40:00Z` Created `e2e/inbox-serve/helpers/__tests__/aria-snapshot.helper.test.ts` — 12 tests: captureAriaSnapshot возвращает YAML, compareAriaSnapshot pass/fail c диффом, generateAriaSnapshot, edge cases (empty page, dynamic content)
- [x] `2026-07-10T15:40:00Z` Created `e2e/inbox-serve/helpers/__tests__/layout.helper.test.ts` — 13 tests: getRelativePosition проценты при viewport 1000×1000, isLeftOf, isBelow, isWithin, edge cases (overlapping, zero-size, nested)
- [x] `2026-07-10T15:45:00Z` ver `npm run test -- 'e2e/inbox-serve/helpers/__tests__/*.test.ts'` → pass exit=0 (25/25)
- [x] `2026-07-10T15:45:00Z` DONE
- [x] **Handoff →** artifacts: [aria-snapshot.helper.test.ts, layout.helper.test.ts]; decisions: [test_counts=25, approach=viewport_percentage_math]; open: []

#### Round close

- [x] `2026-07-10T15:50:00Z` sync inbox-visual-testing
- [x] `2026-07-10T15:50:00Z` DONE
