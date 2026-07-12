# Task: TSK-107 — inbox-dashboard: React SPA + браузер артефактов

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-107 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-dashboard | **Dependencies:** TSK-105 (mocks), TSK-106 (API)
- **Purpose:** React SPA: очередь «Ждут меня» + Kanban-обзор (read-only), экран `#/mr/:id` = **полный браузер артефактов** (навигация + рендер md/mermaid) + `ActionPanel`. Реврайт под D-86 (существующие компоненты Round-1 дорабатываются; добавляются ArtifactBrowser/ArtifactView/ActionPanel).
- **Spec:** [inbox-dashboard.spec.md](../../specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md), [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-03 | **Runtime:** not-implemented | **Verification:** unit
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | impl | P1   | [ ]    |
| P3  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (браузер артефактов + панель действий)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/components/MrDetailPage.tsx` — экран `#/mr/:id`: слева `ArtifactBrowser`, справа `ActionPanel` (заменяет прежнюю модалку)
  - `services/agent-inbox/modules/inbox-dashboard/components/ArtifactBrowser.tsx` — навигация по `GET /api/mr/:id/artifacts` (REPORT/PLAN/дорожки/HISTORY/coverage/tool-log)
  - `services/agent-inbox/modules/inbox-dashboard/components/ArtifactView.tsx` — рендер md+mermaid (переиспользовать рендерер `ai/inspector/web/markdown.js`); дорожка → находки/кандидаты/вердикт
  - `services/agent-inbox/modules/inbox-dashboard/components/ActionPanel.tsx` — reviewer: `[Постить выбранное] [Approve (гейт)] [Дослать] [Skip]`; author: `[Опубликовать черновики] [👍] [Копировать задание] [Обновить описание] [Дослать] [Skip]`; кандидаты чекбоксами + inline-правка
  - `services/agent-inbox/modules/inbox-dashboard/components/MrCard.tsx` — статус = узел графа + прогресс дорожек
  - `services/agent-inbox/modules/inbox-dashboard/services/api-client.ts` — + `listArtifacts`, `readArtifact`
  - `services/agent-inbox/modules/inbox-dashboard/App.tsx` — hash-роутер (`#/`, `#/mr/:id`), сохранить
- **Exit:** Vite dev: очередь + обзор; `#/mr/:id` рендерит REPORT (md+mermaid), навигация по артефактам, ActionPanel с action → POST /api/mr/:id/action.
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — impl (e2e харнесс)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:** `e2e/inbox-serve/playwright.config.ts`, `e2e/inbox-serve/fixtures/mock-data.ts` (+ артефакты), `e2e/inbox-serve/smoke.spec.ts` (открыть #/mr/:id, увидеть REPORT + артефакты)
- **Exit:** `npx playwright test` smoke pass.
<!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->

### P3 — test (компоненты)

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/ArtifactBrowser.test.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/ActionPanel.test.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/BoardPage.test.tsx`
- **Exit:** Компоненты рендерятся с тестовыми данными.
<!--/SECTION:PHASE_P3-->

<!--SECTION:BDD-->

## 4. BDD

- GIVEN #/mr/:id открыт WHEN загружен THEN слева список артефактов, справа REPORT (md+mermaid отрендерен)
- GIVEN клик по дорожке security WHEN ArtifactView THEN находки (file:line) + вердикт + coverage/tool-log
- GIVEN reviewer-отчёт с 3 кандидатами WHEN ActionPanel THEN чекбоксы + inline-правка + [Постить][Approve][Дослать][Skip]
- GIVEN author-MR WHEN ActionPanel THEN [Копировать задание (FIX_TASK.md)] + без Approve
- GIVEN клик «Постить выбранное» WHEN 2 из 3 отмечены THEN POST action {choice:post, payload: выбранные}
- GIVEN deep-link #/mr/510 напрямую WHEN загружен THEN отчёт без захода на доску
- GIVEN mermaid в REPORT WHEN рендер THEN диаграмма нарисована (не сырой текст)
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-dashboard/__tests__/*.test.tsx'` — pass
- `npm run format:check` — pass
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                      | Level | Test File                |
| ----------------------------- | ----- | ------------------------ |
| ArtifactBrowser список+рендер | unit  | ArtifactBrowser.test.tsx |
| ActionPanel reviewer/author   | unit  | ActionPanel.test.tsx     |
| BoardPage очередь+роли        | unit  | BoardPage.test.tsx       |
| Deep-link + mermaid рендер    | e2e   | TSK-108                  |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

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
<!--/SECTION:EXECUTION_LOG-->
