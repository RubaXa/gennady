# Task: TSK-107 — inbox-dashboard: React SPA дашборд

## 1. Meta

- **Task-ID:** TSK-107 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-dashboard | **Dependencies:** TSK-105 (mocks), TSK-106 (API)
- **Purpose:** React SPA дашборд: Kanban по ролям, карточки MR, модалка отчёта. shadcn/ui + dnd-kit. Данные из API.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-03, [inbox-dashboard.spec.md](../../specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1 | impl | —    | [ ]    |
| P2 | impl | P1   | [ ]    |
| P3 | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/App.tsx` — Entry point, BoardStore.Provider
  - `services/agent-inbox/modules/inbox-dashboard/components/BoardPage.tsx` — корневая страница, polling
  - `services/agent-inbox/modules/inbox-dashboard/components/Header.tsx` — шапка: заголовок, статус OpenCode/polling
  - `services/agent-inbox/modules/inbox-dashboard/components/RoleBlock.tsx` — блок роли + KanbanLane × 4
  - `services/agent-inbox/modules/inbox-dashboard/components/KanbanLane.tsx` — колонка с dnd-kit Droppable
  - `services/agent-inbox/modules/inbox-dashboard/components/MrCard.tsx` — карточка MR с dnd-kit Draggable
  - `services/agent-inbox/modules/inbox-dashboard/components/MrDetailModal.tsx` — модалка отчёта
  - `services/agent-inbox/modules/inbox-dashboard/services/api-client.ts` — fetch-обёртка к API
  - `services/agent-inbox/modules/inbox-dashboard/services/board-store.ts` — React Context + useReducer
  - `services/agent-inbox/modules/inbox-dashboard/styles/index.css` — Tailwind v4 entry
- **Exit:** Vite dev server показывает Kanban-доску с мок-данными. Drag-and-drop работает.

### P2 — impl (e2e харнесс)
- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `e2e/inbox-serve/playwright.config.ts` — webServer: inbox-api + vite dev
  - `e2e/inbox-serve/fixtures/mock-data.ts` — сценарии мок-данных
  - `e2e/inbox-serve/smoke.spec.ts` — открыть дашборд, проверить шапку
- **Exit:** `npx playwright test --config=e2e/inbox-serve/playwright.config.ts` → smoke pass.

### P3 — test (компоненты)

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/BoardPage.test.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/MrCard.test.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/RoleBlock.test.tsx`
- **Exit:** Компоненты рендерятся с тестовыми данными.

## 4. BDD

- GIVEN API возвращает 2 роли и 3 MR WHEN дашборд загружен THEN 2 блока ролей + блок «БЕЗ РОЛИ»
- GIVEN MR в INBOX WHEN пользователь кликает «Назначить ▼» → reviewer THEN POST /api/mr/:id/assign, карточка в INBOX reviewer
- GIVEN MR в AWAITING ME WHEN пользователь кликает «Смотреть» THEN модалка с находками
- GIVEN модалка открыта WHEN пользователь кликает «Постить всё» THEN POST /api/mr/:id/action, карточка в DONE
- GIVEN API недоступен WHEN polling THEN баннер «API недоступен», старые данные на доске
- GIVEN карточка в INBOX WHEN drag в PROGRESS THEN onDrop → API-запрос, оптимистичное обновление

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-dashboard/__tests__/*.test.tsx'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                | Level | Test File          |
| ----------------------- | ----- | ------------------ |
| BoardPage renders roles | unit  | BoardPage.test.tsx |
| MrCard renders info     | unit  | MrCard.test.tsx    |
| RoleBlock shows lanes   | unit  | RoleBlock.test.tsx |
| Kanban drag-and-drop    | e2e   | TSK-108            |

## 7. Execution Log

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
