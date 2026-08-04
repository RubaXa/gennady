# Task: TSK-164 — inbox-dashboard: загрузка / доска / лента / чат-колонка

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-164
- **Status:** [ ] TODO
- **Purpose:** SPA трёх экранов: загрузка с фазами, доска внимания (5 групп + degraded), карточка A, лента виджетов (7 типов, жизненный цикл), S8-поверхность (decision/undo/auto-бейдж), чат-колонка с якорями, оптимизм+скелетоны+SSE.
- **Scope:** `agent-inbox`
- **Module:** `inbox-dashboard`
- **Dependencies:** TSK-162, TSK-166
- **Spec References:**
  - Module spec: [inbox-dashboard](../../specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md) §2–§4
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`, `e2e`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind       | Deps | Status |
| --- | ---------- | ---- | ------ |
| P1  | impl       | —    | [ ]    |
| P2  | test       | P1   | [ ]    |
| P3  | test (e2e) | P2   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Компоненты §4 спеки (15): LoadingScreen, AttentionBoard (+degraded-индикатор), MrCard (вариант A), FeedList, виджеты (Findings/Threads/ArtifactPost/ArtifactFullView/Plan/GitlabEvent/ProgressGroup/Action), ChatColumn, SelectionPill (мета-якорь), HeaderInformer. Живость §3: оптимизм ⏳+taskId, SSE фрейм→поведение, батч-реконсиляция+backoff, скелетоны, read-cursor.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/dashboard-entry.tsx` (app-shell: entry, роутер, токены)
  - `services/agent-inbox/modules/inbox-dashboard/App.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/index.html`
  - `services/agent-inbox/modules/inbox-dashboard/styles/index.css`
  - `services/agent-inbox/modules/inbox-dashboard/screens/LoadingScreen.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/board/AttentionBoard.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/board/MrCard.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/feed/` (FeedList + 8 виджетов)
  - `services/agent-inbox/modules/inbox-dashboard/chat/ChatColumn.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/chat/SelectionPill.tsx`
- **Inputs:** TSK-162 (REST/SSE контракты)
- **Exit:** `npm run type-check` exit 0; `npm run inbox-serve:build` exit 0
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** unit/integration тесты: карточка A (все поля), жизненный цикл виджетов (bump/скрытые/одноразовые), оптимизм (⏳ мгновенно), read-cursor, degraded, decision/undo. Харнесс .tsx: node:test + `react-dom/server` renderToString (строковые рендер-ассерты, как в v1-тестах); DOM-поведение — только в P3 e2e.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/MrCard.test.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/feed-lifecycle.test.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/optimistic.test.tsx`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 (unit/integration) покрыты; `npm test` по файлам exit 0
<!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->

### P3 — test (e2e)

- **Objective:** Playwright e2e против РЕАЛЬНОГО serve: фазы загрузки → доска без мерцания → лента → чат-якорь → decision flow.
- **Rules:**
  - [playwright-cli](../../ai/directives/testing/playwright-cli.xml)
  - [playwright-e2e](../../ai/directives/testing/playwright-e2e.xml)
- **Target Files:**
  - `e2e/inbox-serve/dashboard-v2.spec.ts`
- **Inputs:** P2 handoff
- **Exit:** сценарии e2e §4 зелёные; скриншоты каждой стадии (visual proof)
<!--/SECTION:PHASE_P3-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** живая доска и лента машины ревью

**Scenario:** карточка A со всеми полями [`unit`]

- **Given** MrCard DTO с counters
- **When** рендер
- **Then** 4 строки: идентичность+📬🔀 / заголовок / ✅n/m 👁 🏗 💬⏳ / ⚙ работа+таймер

**Scenario:** циклический виджет показывает только новое [`unit`]

- **Given** находки F1-F3 запощены, новые коммиты принесли F4
- **When** bump виджета
- **Then** видны только F4 (+2 скрыты в истории); lastActivity обновлён

**Scenario:** одноразовый виджет тонет при resolved [`unit`]

- **Given** эффект «постинг» выполнен
- **When** resolved=true
- **Then** виджет не всплывает; новый эффект — новый инстанс

**Scenario:** оптимизм действия [`integration`]

- **Given** клик «углубить»
- **When** POST /task ещё в полёте
- **Then** виджет уже «⏳ #N» (<100 мс локально); подтверждение по SSE; ошибка → ❌+retry

**Scenario:** e2e загрузка→доска→лента→decision [`e2e`]

- **Given** serve на temp stateDir с seed-фикстурой TSK-166 (2 МР в заданных состояниях; dry-run эффектов)
- **When** прогон сценария
- **Then** фазы → ready без мерцания; лента с виджетами; decision → effect-задача в очереди + dryrun-маркер виден (под dry-run эффект не исполняется); скриншоты стадий

**Scenario:** резолв чужого треда недоступен [`unit`]

- **Given** ThreadsWidget с тредом не оператора и не бота
- **When** рендер реакций
- **Then** «👍+резолв» disabled + причина; клик не порождает задачу

**Scenario:** разрыв SSE — backoff + баннер [`integration`]

- **Given** открытый MR-стрим, соединение оборвано
- **When** детект разрыва
- **Then** батч /api/state 3–5 сек с backoff до 30 сек + баннер; восстановление стрима прекращает поллинг

**Scenario:** ошибка фазы загрузки видима с retry [`integration`]

- **Given** фаза reconcile упала
- **When** рендер LoadingScreen
- **Then** ошибка видима (не вечный ⏳) + retry; ложного «пусто» нет
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                         | Required by               |
| ------------------------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                                            | typescript-rules          |
| `npm test -- services/agent-inbox/modules/inbox-dashboard/__tests__/`           | node-test                 |
| `npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts` | playwright-e2e            |
| `npm run inbox-serve:build`                                                     | дисциплина бандла (D-204) |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- карточка A → `MrCard.test.tsx` :: `card renders all four rows with counters`
- циклический виджет → `feed-lifecycle.test.tsx` :: `recurring widget shows only new items after bump`
- одноразовый → `feed-lifecycle.test.tsx` :: `one-shot widget sinks when resolved`
- оптимизм → `optimistic.test.tsx` :: `action shows pending state before server confirms`
- e2e → `dashboard-v2.spec.ts` :: `boot to board to feed to decision flow on real serve`

- резолв чужого → `feed-lifecycle.test.tsx` :: `foreign thread resolve is disabled with reason`
- разрыв SSE → `optimistic.test.tsx` :: `sse break falls back to batch with backoff and banner`
- ошибка фазы → `dashboard-v2.spec.ts` :: `boot phase error is visible with retry`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- inbox-dashboard/__tests__` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P3

- [ ] `<ts>` ver `npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
