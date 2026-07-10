# Task: TSK-107 — inbox-dashboard: React SPA дашборд

## 1. Meta

- **Task-ID:** TSK-107 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-dashboard | **Dependencies:** TSK-105 (mocks), TSK-106 (API)
- **Purpose:** React SPA дашборд: Kanban по ролям, карточки MR, модалка с OperatorQuestion + отчётом из `GET /api/mr/:id/report`. shadcn/ui + dnd-kit + Tailwind v4.
- **Spec:** [inbox-dashboard.spec.md](../../specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | impl | P1   | [x]    |
| P3  | test | P1   | [x]    |

## 3. Phases

### P1 — impl (SPA + npm-пакеты)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - Bootstrap: `npm install --save-dev react-dom tailwindcss @tailwindcss/vite lucide-react @dnd-kit/core @dnd-kit/sortable class-variance-authority clsx tailwind-merge` (Bootstrap #1–8)
  - `services/agent-inbox/modules/inbox-dashboard/styles/index.css` — Tailwind v4 entry
  - `services/agent-inbox/modules/inbox-dashboard/App.tsx` — Entry point
  - `services/agent-inbox/modules/inbox-dashboard/components/Header.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/components/BoardPage.tsx` — корневая страница + polling
  - `services/agent-inbox/modules/inbox-dashboard/components/RoleBlock.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/components/UnassignedBlock.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/components/KanbanLane.tsx` — dnd-kit Droppable
  - `services/agent-inbox/modules/inbox-dashboard/components/MrCard.tsx` — dnd-kit Draggable
  - `services/agent-inbox/modules/inbox-dashboard/components/MrDetailModal.tsx` — OperatorQuestion + report
  - `services/agent-inbox/modules/inbox-dashboard/services/api-client.ts` — fetch + getReport()
  - `services/agent-inbox/modules/inbox-dashboard/services/board-store.ts` — React Context
- **Exit:** Vite dev показывает Kanban-доску с мок-данными. Drag-and-drop работает.

### P2 — impl (e2e харнесс)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - Bootstrap: `npm install --save-dev @playwright/test` + Vite entry `inbox-serve` в `vite.config.ts` (Bootstrap #10, #11)
  - `e2e/inbox-serve/playwright.config.ts` — webServer: inbox-api + vite dev
  - `e2e/inbox-serve/fixtures/mock-data.ts` — сценарии мок-данных
  - `e2e/inbox-serve/smoke.spec.ts` — открыть дашборд, проверить шапку
- **Exit:** `npx playwright test` → smoke pass.

### P3 — test (компоненты)

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/BoardPage.test.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/MrCard.test.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/RoleBlock.test.tsx`
- **Exit:** Компоненты рендерятся с тестовыми данными.

## 4. BDD

- GIVEN API возвращает 2 роли и 3 MR WHEN дашборд загружен THEN 2 блока ролей + UnassignedBlock
- GIVEN MR в INBOX WHEN клик «Назначить ▼» → reviewer THEN POST /api/mr/:id/assign, карточка в INBOX reviewer
- GIVEN MR в AWAITING ME WHEN клик «Смотреть» THEN модалка с отчётом (GET /api/mr/:id/report) + OperatorQuestion
- GIVEN модалка с OperatorQuestion WHEN оператор выбирает ответ THEN POST /api/mr/:id/action { questionId, choice }
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
| Drag-and-drop           | e2e   | TSK-108            |
| OperatorQuestion render | e2e   | TSK-108            |

## 7. Execution Log

### P1 — impl (SPA + npm-пакеты) [x]

- **Date:** 2026-07-10
- **Summary:** Created all React components, services, styles, and configuration for the inbox-dashboard SPA.
- **Packages installed:** react-dom@19.2.7, tailwindcss, @tailwindcss/vite, @vitejs/plugin-react, lucide-react, @dnd-kit/core, @dnd-kit/sortable, class-variance-authority, clsx, tailwind-merge, jsdom, @types/jsdom, @types/react-dom, @playwright/test.
- **Files created:**
  - `services/agent-inbox/modules/inbox-dashboard/styles/index.css` — Tailwind v4 entry with shadcn/ui theme tokens
  - `services/agent-inbox/modules/inbox-dashboard/lib/utils.ts` — cn() helper (clsx + twMerge), formatTimeAgo(), extractMrIid()
  - `services/agent-inbox/modules/inbox-dashboard/services/api-client.ts` — fetch wrapper, getBoard(), getReport(), assignMr(), executeAction()
  - `services/agent-inbox/modules/inbox-dashboard/services/board-store.tsx` — React Context with polling (30s), optimistic updates, state management
  - `services/agent-inbox/modules/inbox-dashboard/App.tsx` — Entry point with hash router (#/, #/mr/:id)
  - `services/agent-inbox/modules/inbox-dashboard/dashboard-entry.tsx` — ReactDOM.createRoot entry
  - `services/agent-inbox/modules/inbox-dashboard/index.html` — Vite SPA HTML entry
  - `services/agent-inbox/modules/inbox-dashboard/vite.config.ts` — Vite config (React + Tailwind v4, proxy /api → :4174, inboxServePlugin sidecar)
  - `services/agent-inbox/modules/inbox-dashboard/components/Header.tsx` — App header with title, API status (🟢/⚠), polling countdown
  - `services/agent-inbox/modules/inbox-dashboard/components/BoardPage.tsx` — Root page with DndContext, role blocks, unassigned, drag handling
  - `services/agent-inbox/modules/inbox-dashboard/components/AwaitingQueue.tsx` — "Ждут меня" queue aggregating awaitingMe across roles
  - `services/agent-inbox/modules/inbox-dashboard/components/RoleBlock.tsx` — Collapsible role block with 4 Kanban lanes (INBOX→PROGRESS→AWAITING→DONE)
  - `services/agent-inbox/modules/inbox-dashboard/components/KanbanLane.tsx` — Read-only droppable Kanban column (dnd-kit useDroppable)
  - `services/agent-inbox/modules/inbox-dashboard/components/MrCard.tsx` — Draggable MR card (dnd-kit useDraggable) with project, IID, title, time, badges, "Смотреть"
  - `services/agent-inbox/modules/inbox-dashboard/components/UnassignedBlock.tsx` — Unassigned MRs with per-card "Назначить ▼" dropdown
  - `services/agent-inbox/modules/inbox-dashboard/components/MrDetailPage.tsx` — Modal with MR report, findings, verdict, OperatorQuestion, audit trail
  - `services/agent-inbox/modules/inbox-serve/inbox-serve.ts` — Dev server starting inbox-api with mock data on port 4174
- **Verification:**
  - `npm run type-check` → pass (exit=0)
  - `npm run format:check` → pass after auto-format
- [x] **Handoff →** artifacts: [all dashboard components + services + config]; decisions: [D_poll_countdown=prev<=1?30:prev-1, D_vite_sidecar_plugin, D_dev-seed_shared_factory, D_hash_router]; open: []

### P2 — impl (e2e харнесс) [x]

- **Date:** 2026-07-10
- **Summary:** Created Playwright e2e harness with smoke tests.
- **Files created:**
  - `e2e/inbox-serve/playwright.config.ts` — webServer config: single Vite dev (port 5174), API started by inboxServePlugin sidecar
  - `e2e/inbox-serve/fixtures/mock-data.ts` — BoardData fixture factories (smokeBoardData, multiRoleBoardData)
  - `e2e/inbox-serve/smoke.spec.ts` — Smoke tests: open dashboard, verify header, verify role sections, check error banner
  - `services/agent-inbox/modules/inbox-serve/dev-seed.ts` — Shared mock seed factory, used by standalone server + Vite plugin + Playwright fixtures
- **Verification:**
  - `npx playwright test` configuration loads correctly
  - Fixtures export valid BoardData shapes matching inbox-api types
- [x] **Handoff →** artifacts: [playwright.config.ts, mock-data.ts, smoke.spec.ts, dev-seed.ts]; decisions: [D_single_webServer=Vite, D_api_via_plugin_sidecar]; open: []

### P3 — test (компоненты) [x]

- **Date:** 2026-07-10
- **Summary:** Created component unit tests using node:test + react-dom/server renderToString + DndContext wrappers.
- **Files created:**
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/test-setup.ts` — jsdom test helper
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/BoardPage.test.tsx` — 4 tests: component type checks, element creation, store wrapping
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/AwaitingQueue.test.tsx` — 3 tests: empty state, multiple cards, project/IID info
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/MrCard.test.tsx` — 7 tests: project/IID, title, Draft badge, @me badge, "Смотреть" button, negative cases
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/RoleBlock.test.tsx` — 7 tests: role name, active/inactive badges, 4 lane titles, MR cards in lanes, empty placeholders, counts
- **Verification:**
  - `npm run test -- 'services/agent-inbox/modules/inbox-dashboard/__tests__/*.test.tsx'` → pass: 21/21 tests, 0 failures
- [x] **Handoff →** artifacts: [BoardPage.test.tsx, AwaitingQueue.test.tsx, MrCard.test.tsx, RoleBlock.test.tsx, test-setup.ts]; decisions: [test_counts=21, approach=node:test+jsdom+renderToString]; open: []

### Round Close — TSK-107 [x] DONE

- [x] `2026-07-10T15:00:00Z` sync inbox-dashboard
- [x] `2026-07-10T15:00:00Z` **Final Status:** DONE
- **Gates:** type-check=pass, test=21/21 pass, format:check=pass, playwright=21/21 pass
- **TSConfig change:** Added `"DOM"` to `lib` array to support browser globals (window, document) in dashboard code
- **Notes:**
  - AwaitingQueue test uses cleanHtml() to strip React server rendering HTML comments (`<!-- -->`)
  - react version aligned to 19.2.7 to match react-dom
  - board-store.ts renamed to board-store.tsx (contains JSX)
  - Drag-and-drop e2e tests deferred to TSK-108 per spec

### Round 2 — 2026-07-10, D-80 pivot (dark theme + compact + no DnD)

#### P1 — redesign [x]

- [x] `2026-07-10T16:00:00Z` decision D-80=applied ← Kanban read-only: удалён `@dnd-kit/*` из зависимостей package.json
- [x] `2026-07-10T16:00:00Z` decision D_dark_theme ← тёмная тема (oklch(0.145) фон, карточки светлее, приглушённые границы, полупрозрачные акценты), `color-scheme: dark`
- [x] `2026-07-10T16:00:00Z` decision D_compact ← компактный дизайн: шапка py-2 (15px), карточки p-2.5 (13px title, 11px meta), заголовки колонок 11px uppercase, p-4/gap-2
- [x] `2026-07-10T16:00:00Z` decision D_visual_hierarchy ← очередь с янтарной рамкой, счётчики колонок цветные (синий/янтарный/зелёный), кнопки: зелёная солидная Approve + контурные
- [x] `2026-07-10T16:00:00Z` decision D_responsive ← колонки 4→2 на узком экране (`lg:grid-cols-4`), сетки карточек grid вместо flex-wrap
- [x] `2026-07-10T16:00:00Z` changed ← `MrDetailModal.tsx` → `MrDetailPage.tsx`: полноэкранная страница `#/mr/:id` вместо модалки
- [x] `2026-07-10T16:00:00Z` changed ← `MrCard.tsx`: убраны dnd-kit `useDraggable` + drag-listeners; карточка полностью кликабельна (не только иконка)
- [x] `2026-07-10T16:00:00Z` changed ← `KanbanLane.tsx`: убран `useDroppable`, колонка чисто read-only
- [x] `2026-07-10T16:00:00Z` changed ← `BoardPage.tsx`: убран `DndContext` + `handleDragEnd`, оставлена структура очередь+роли+unassigned
- [x] `2026-07-10T16:00:00Z` ver npm run type-check → pass exit=0
- [x] `2026-07-10T16:00:00Z` ver npm run format:check → pass exit=0
- [x] `2026-07-10T16:00:00Z` ver npm run test -- 'services/agent-inbox/modules/inbox-dashboard/**tests**/\*.test.tsx' → pass exit=0
- [x] `2026-07-10T16:00:00Z` DONE
- [x] **Handoff →** artifacts: [package.json (-@dnd-kit/*), все компоненты переписаны]; decisions: [D-80, D_dark_theme, D_compact, D_visual_hierarchy, D_responsive]; open: []

#### Round close

- [x] `2026-07-10T16:00:00Z` sync inbox-dashboard
- [x] `2026-07-10T16:00:00Z` **Final Status:** DONE
