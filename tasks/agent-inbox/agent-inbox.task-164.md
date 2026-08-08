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
| P1  | impl       | —    | [x]    |
| P2  | test       | P1   | [x]    |
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
  - `services/agent-inbox/modules/inbox-dashboard/styles/index.css` (токены Carbon & Steel из design-system.md: цвета/типографика Geist+JetBrains Mono/плотность/глубина)
  - `services/agent-inbox/modules/inbox-dashboard/lib/icons.ts` (inline-SVG подмножество Material Symbols — не CDN)
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

| Command                                                                          | Required by               |
| -------------------------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                                             | typescript-rules          |
| `npm test -- services/agent-inbox/modules/inbox-dashboard/__tests__/*.test.tsx`  | node-test                 |
| `npx playwright test --config=e2e/inbox-serve/playwright.dashboard-v2.config.ts` | playwright-e2e            |
| `npm run inbox-serve:build`                                                      | дисциплина бандла (D-204) |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- карточка A → `MrCard.test.tsx` :: `card renders all four rows with counters`
- циклический виджет → `feed-lifecycle.test.tsx` :: `recurring widget shows only new items after bump`
- одноразовый → `feed-lifecycle.test.tsx` :: `one-shot widget sinks when resolved`
- оптимизм → `optimistic.test.tsx` :: `action shows pending state before server confirms`
- e2e → `dashboard-v2.spec.ts` :: `selection → anchored chat request → SSE answer stays observable`

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

### Round 2 — 2026-08-08, v2 implementation

#### P1

- [x] `2026-08-08T02:10Z` ver `npm run type-check && npm run inbox-serve:build` → pass exit=`0`
- [x] `2026-08-08T02:10Z` DONE
      **Handoff →** artifacts: `dashboard-v2-api.ts`, `dashboard-v2-ui.tsx`, `v2-types.ts`, `App.tsx`, `styles/index.css`; decisions: canonical v2 endpoints drive Boot/Board/MR state and per-MR SSE, with exponential state reconciliation after stream loss; open: browser policy blocks local visual interaction.

#### P2

- [x] `2026-08-08T02:12Z` ver `npm test -- inbox-dashboard/__tests__/MrCard.test.tsx feed-lifecycle.test.tsx optimistic.test.tsx` → pass exit=`0` (11 tests)
- [x] `2026-08-08T02:12Z` DONE
      **Handoff →** coverage: card/four-row compatible rendering, recurring/one-shot lifecycle, foreign-thread disabled action, unread divider, optimistic pending overlay; open: DOM/SSE lifecycle still requires e2e proof.

#### P3

- [ ] `2026-08-08T02:13Z` ver real `gennady inbox serve --port=4187` → server boot endpoint pass; visual browser proof blocked by admin policy (`http://127.0.0.1:4187` navigation denied).
- [ ] `2026-08-08T02:13Z` BLOCKED — mandatory real-dashboard screenshots cannot be captured from this execution environment. No mock visual proof was substituted.

#### Round close

- [ ] `2026-08-08T02:13Z` BLOCKED pending a browser environment permitted to reach the real local serve.

### Round 3 — 2026-08-08, audit-r1 remediation

#### P1

- [x] `2026-08-08T02:17Z` ver `npm run type-check && npm run inbox-serve:build` → pass exit=`0`
- [x] `2026-08-08T02:17Z` DONE
      **Handoff →** artifacts: `dashboard-v2-api.ts`, `dashboard-v2-ui.tsx`, `v2-types.ts`, `App.tsx`; decisions: canonical four-row card, HeaderInformer, selection anchor and MR-scoped `POST /api/mr/:ref/chat` are wired to server contracts; open: real-browser proof remains environment-blocked.

#### P2

- [x] `2026-08-08T02:17Z` ver `npm test -- …MrCard.test.tsx …feed-lifecycle.test.tsx …optimistic.test.tsx …dashboard-v2.contract.test.tsx` → pass exit=`0` (14 tests)
- [x] `2026-08-08T02:17Z` ver `npx tsx cli/gennady.ts lint dashboard-v2-api.ts dashboard-v2-ui.tsx v2-types.ts` → pass exit=`0`
- [x] `2026-08-08T02:17Z` DONE
      **Handoff →** coverage: canonical DashboardV2Ui.MrCard four-row counters, phase error+retry, and bounded SSE backoff/reset; open: transport lifecycle needs a browser connected to real serve.

#### P3

- [x] `2026-08-08T02:18Z` ver `npx playwright test dashboard-v2.spec.ts --config=e2e/inbox-serve/playwright.config.ts` → pass exit=`0`, skipped because `GENNADY_V2_BASE_URL` (real serve target) is not available.
- [ ] `2026-08-08T02:18Z` BLOCKED — `e2e/inbox-serve/dashboard-v2.spec.ts` is real-serve-only and contains no route interception or mock response; this environment has no browser-permitted real serve target, so required screenshots cannot truthfully be captured.

#### Round close

- [ ] `2026-08-08T02:18Z` BLOCKED only on mandatory P3 visual proof / real-serve browser policy.

### Round 4 — 2026-08-08, audit-r2 remediation

#### P1

- [x] `2026-08-08T05:39Z` ver `npm run type-check && npm run inbox-serve:build` → pass exit=`0`
- [x] `2026-08-08T05:39Z` DONE
      **Handoff →** artifacts: durable `MrStateV2.transcript`, live token/turn_done SSE handling, quote/fragment-derived anchors, decision/undo/read-cursor actions; decisions: a successful EventSource reconnect clears the outage banner on `open`, not only on a data frame; open: none.

#### P2

- [x] `2026-08-08T05:40Z` ver `npm test -- …MrCard.test.tsx …feed-lifecycle.test.tsx …optimistic.test.tsx …dashboard-v2.contract.test.tsx && npm run type-check && gennady lint …` → pass exit=`0` (14 tests)
- [x] `2026-08-08T05:40Z` DONE
      **Handoff →** coverage: canonical card, feed lifecycle, pending action, selected anchor, durable chat projection and bounded SSE recovery; open: none.

#### P3

- [x] `2026-08-08T05:39Z` ver `npx playwright test --config=e2e/inbox-serve/playwright.dashboard-v2.config.ts` → pass exit=`0` (1 passed, 8.7s)
- [x] `2026-08-08T05:39Z` DONE — Playwright owned a temporary `GENNADY_STATE_DIR`, invoked real `gennady inbox serve --mocks` (no Vite/no route interception), seeded TSK-166 journal snapshots, killed the process to create an actual SSE TCP disconnect, restarted it, and captured five staged screenshots.

#### Round close

- [x] `2026-08-08T05:40Z` DONE
      **Handoff →** audit: fresh independent audit required; evidence: `.codex-agent-status/sdd-execute-batch-20260808T013000/TSK-164/execute-r3/`.

### Round 5 — 2026-08-08, audit-r3 remediation

#### P1

- [x] `2026-08-08T02:46Z` ver `npm run type-check && npm run inbox-serve:build` → pass exit=`0`
- [x] `2026-08-08T02:46Z` DONE
      **Handoff →** artifacts: `App.tsx`, `dashboard-v2-ui.tsx`, `sse-hub.ts`, `mutate.router.ts`; decisions: the dashboard retains only the actual snapshot id emitted after a successful mutation and posts it to the MR-scoped undo endpoint; open: real serve remains in boot `poll`.

#### P2

- [x] `2026-08-08T02:46Z` ver `npm test -- services/agent-inbox/modules/inbox-dashboard/__tests__/*.test.tsx` → pass exit=`0` (59 tests)
- [x] `2026-08-08T02:46Z` ver `npm test -- services/agent-inbox/modules/inbox-api/__tests__/sse-hub.test.ts services/agent-inbox/modules/inbox-api/__tests__/mutate.router.test.ts` → pass exit=`0` (10 tests)
- [x] `2026-08-08T02:46Z` DONE
      **Handoff →** coverage: concrete snapshot id → `POST /api/mr/:ref/chat/undo`; mutation SSE carries that id to the dashboard; exact test-file glob replaces the non-executable directory check.

#### P3

- [ ] `2026-08-08T02:47Z` ver real `gennady inbox serve --port=4199` against configured `~/.gennady` → BLOCKED: `/api/boot` remained `{ phase: "poll", ready: false }` for 24 seconds, so no real board/MR/anchor was available for browser interaction.
- [ ] `2026-08-08T02:47Z` BLOCKED — `dashboard-v2.spec.ts` now requires only `GENNADY_V2_BASE_URL` and `GENNADY_V2_MR_REF` for an already running real operator serve. It creates no temp state, uses no `--mocks`, seed, route interception, Vite, or `gitlab.invalid`. Screenshots were not fabricated.

#### Round close

- [ ] `2026-08-08T02:47Z` BLOCKED only on mandatory P3 real-data visual proof; P1/P2 are independently green. Evidence: `.codex-agent-status/sdd-execute-batch-20260808T013000/TSK-164/execute-r4/`.
<!--/SECTION:EXECUTION_LOG-->
