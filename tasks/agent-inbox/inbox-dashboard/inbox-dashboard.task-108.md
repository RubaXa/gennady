# Task: TSK-108 — inbox-dashboard e2e (Playwright)

## 1. Meta

- **Task-ID:** TSK-108 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-dashboard | **Dependencies:** TSK-107 (dashboard), TSK-114 (visual-testing)
- **Purpose:** Playwright e2e-тесты дашборда: полный сценарий пользователя на мок-данных.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) Golden DX §3.2 | **Runtime:** not-implemented | **Verification:** e2e

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

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

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
