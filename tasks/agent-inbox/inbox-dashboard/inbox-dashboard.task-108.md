# Task: TSK-108 — inbox-dashboard e2e (Playwright)

## 1. Meta

- **Task-ID:** TSK-108 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-dashboard | **Dependencies:** TSK-107 (dashboard), TSK-114 (visual-testing)
- **Purpose:** Playwright e2e-тесты дашборда: полный сценарий пользователя на мок-данных.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) Golden DX §3.2 | **Runtime:** not-implemented | **Verification:** e2e

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl (e2e тесты)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `e2e/inbox-serve/fixtures/mock-data.ts` — расширить: сценарии для всех тестов
  - `e2e/inbox-serve/dashboard.spec.ts` — поведенческие сценарии (назначение, постинг)
  - `e2e/inbox-serve/dashboard.aria.spec.ts` — ARIA-снапшоты: структура страницы, роли, колонки, карточки
  - `e2e/inbox-serve/dashboard.layout.spec.ts` — layout: порядок колонок, относительные позиции
- **Exit:** Playwright-тесты покрывают: поведение, ARIA-структуру, layout.

### P2 — verify

- **Rules:** none
- **Exit:** `npx playwright test --config=e2e/inbox-serve/playwright.config.ts` — все тесты pass.

## 4. BDD

- GIVEN дашборд загружен WHEN playwright видит шапку THEN заголовок «agent-inbox»
- GIVEN карточка MR в INBOX WHEN playwright кликает «Назначить ▼» → reviewer THEN dropdown, выбор роли, карточка в INBOX reviewer
- GIVEN карточка в AWAITING ME WHEN playwright кликает «Смотреть» THEN модалка с 3 находками
- GIVEN модалка открыта WHEN playwright кликает «Постить всё» THEN карточка в DONE
- GIVEN карточка в INBOX WHEN playwright drag-and-drop в PROGRESS THEN карточка в целевой колонке
- GIVEN API недоступен WHEN playwright ждёт polling THEN баннер ошибки на странице
- GIVEN дашборд загружен WHEN captureAriaSnapshot THEN YAML содержит `region "reviewer"` с 4 колонками
- GIVEN MR в колонке INBOX WHEN captureAriaSnapshot THEN YAML содержит `listitem "group/proj !510 · 3h"` в `region "INBOX"`
- GIVEN блоки ролей на странице WHEN layout check THEN reviewer выше author, author выше «БЕЗ РОЛИ»
- GIVEN колонки внутри роли WHEN layout check THEN INBOX левее PROGRESS, PROGRESS левее AWAITING, AWAITING левее DONE
- GIVEN модалка открыта WHEN layout check THEN модалка перекрывает доску (z-index выше, центрирована)
- GIVEN API возвращает 500 WHEN дашборд загружен THEN error-баннер, ARIA snapshot содержит `alert`, layout не сломан

## 5. Verification

- `npx playwright test --config=e2e/inbox-serve/playwright.config.ts` — pass

## 6. Test Scenario Coverage

| Scenario                    | Level | Test File                |
| --------------------------- | ----- | ------------------------ |
| Шапка дашборда              | e2e   | dashboard.spec.ts        |
| Назначение роли             | e2e   | dashboard.spec.ts        |
| Просмотр отчёта             | e2e   | dashboard.spec.ts        |
| Постинг находок             | e2e   | dashboard.spec.ts        |
| Drag-and-drop               | e2e   | dashboard.spec.ts        |
| API degraded                | e2e   | dashboard.spec.ts        |
| ARIA: структура ролей       | e2e   | dashboard.aria.spec.ts   |
| ARIA: колонки и карточки    | e2e   | dashboard.aria.spec.ts   |
| ARIA: модалка отчёта        | e2e   | dashboard.aria.spec.ts   |
| Layout: порядок колонок     | e2e   | dashboard.layout.spec.ts |
| Layout: порядок блоков      | e2e   | dashboard.layout.spec.ts |
| Layout: модалка перекрывает | e2e   | dashboard.layout.spec.ts |
| Error state: ARIA + layout  | e2e   | dashboard.aria.spec.ts   |

## 7. Execution Log

### Round 1 — 2026-07-10, initial

#### P1

- [x] `2026-07-10T16:00:00Z` Created `e2e/inbox-serve/dashboard.spec.ts` — 7 поведенческих тестов: шапка дашборда (заголовок «agent-inbox»), назначение роли (клик «Назначить ▼» → reviewer), просмотр отчёта (клик «Смотреть» → модалка с 3 находками), постинг (клик «Постить всё» → DONE), drag-and-drop (INBOX → PROGRESS), API degraded (баннер ошибки), error state (API 500 → alert)
- [x] `2026-07-10T16:00:00Z` Created `e2e/inbox-serve/dashboard.aria.spec.ts` — 6 ARIA-тестов: структура ролей (`region "reviewer"` с 4 колонками), колонки и карточки (`listitem "group/proj !510 · 3h"` в `region "INBOX"`), модалка отчёта, структура без роли, error state (`alert`), динамический контент
- [x] `2026-07-10T16:00:00Z` Created `e2e/inbox-serve/dashboard.layout.spec.ts` — 5 layout-тестов: порядок колонок (INBOX левее PROGRESS, PROGRESS левее AWAITING, AWAITING левее DONE), порядок блоков (reviewer выше author, author выше «БЕЗ РОЛИ»), модалка перекрывает (z-index выше, центрирована), error state не ломает layout, равная ширина карточек в колонке
- [x] `2026-07-10T16:05:00Z` ver `npx playwright test --config=e2e/inbox-serve/playwright.config.ts --list` → 21 tests discovered (7 behavioral + 6 ARIA + 5 layout + 3 smoke)
- [x] `2026-07-10T16:05:00Z` DONE
- [x] **Handoff →** artifacts: [dashboard.spec.ts, dashboard.aria.spec.ts, dashboard.layout.spec.ts]; decisions: [D_playwright_tests=21, D_aria_via_captureAriaSnapshot, D_layout_via_isLeftOf/isBelow, D_single_webServer=simplified]; open: []

#### P2

- [x] `2026-07-10T16:10:00Z` ver `npx playwright test --config=e2e/inbox-serve/playwright.config.ts` → pass exit=0 (21/21: 7 behavioral + 6 ARIA + 5 layout + 3 smoke)
- [x] `2026-07-10T16:10:00Z` DONE
- [x] **Handoff →** artifacts: [all e2e tests verified]; decisions: [test_counts=21, all_gates=pass]; open: []

#### Round close

- [x] `2026-07-10T16:15:00Z` sync inbox-dashboard e2e
- [x] `2026-07-10T16:15:00Z` DONE

### Round 2 — 2026-07-10, D-80 pivot (remove drag test)

#### P1 — remove drag test [x]

- [x] `2026-07-10T17:00:00Z` decision D-80=applied-to-e2e ← drag-and-drop тест удалён из `dashboard.spec.ts` (DnD удалён из кода в TSK-107 Round 2)
- [x] `2026-07-10T17:00:00Z` changed ← `dashboard.spec.ts`: убран тест «drag-and-drop MR from INBOX to PROGRESS», оставлено 6 поведенческих тестов
- [x] `2026-07-10T17:00:00Z` ver `npx playwright test --config=e2e/inbox-serve/playwright.config.ts` → pass exit=0 (20/20: 6 behavioral + 6 ARIA + 5 layout + 3 smoke)
- [x] `2026-07-10T17:00:00Z` DONE
- [x] **Handoff →** artifacts: [dashboard.spec.ts (-drag test)]; decisions: [D-80=drag_test_removed, test_counts=20]; open: []

#### Round close

- [x] `2026-07-10T17:00:00Z` sync inbox-dashboard e2e
- [x] `2026-07-10T17:00:00Z` DONE
