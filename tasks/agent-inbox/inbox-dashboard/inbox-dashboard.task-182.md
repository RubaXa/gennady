# Task: TSK-182 — Carbon & Steel operator dashboard and MR workspace

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-182
- **Status:** [x] DONE
- **Reopens:** 0
- **Purpose:** Build the usable two-queue closed-loop cockpit on one component tree and real local API.
- **Scope:** agent-inbox
- **Module:** inbox-dashboard
- **Dependencies:** TSK-178, TSK-179, TSK-180, TSK-181
- **Spec References:** [Dashboard inventory](../../../specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md#3-entity-inventory-closed-world), [DbC](../../../specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md#5-module-contracts-dbc), [Design](../../../specs/agent-inbox/inbox-dashboard/design-system.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`, `e2e`
- **Deferred Runtime Scope:** None
  <!--/SECTION:META-->
  <!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind     | Deps | Status |
| --- | -------- | ---- | ------ |
| P1  | refactor | —    | [x]    |
| P2  | test     | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — refactor

- **Objective:** Consolidate UI; implement two queues, unique cards/chips, smart feed, package widget, artifact/chat/handoff controls and browser clipboard acknowledgement in Carbon & Steel.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-dashboard/`
- **Inputs:** upstream API/chat/mock/composition handoffs
- **Exit:** unused role/Kanban/parallel UI removed; every GitLab action is executable from dashboard.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Component/composition tests plus real-entry Playwright visual proof on real GitLab and production bundle.
- **Rules:** [common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml), [playwright-cli](../../../ai/directives/testing/playwright-cli.xml), [playwright-e2e](../../../ai/directives/testing/playwright-e2e.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-dashboard/__tests__/`, `e2e/inbox-serve/`
- **Inputs:** P1 handoff
- **Exit:** product flow is operable without GitLab UI and each key state has real-data visual proof.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** UI models/actions are exhaustive [`contract`]

- **Given** all card chips, widget kinds, package actions and outcomes
- **When** UI discriminants are checked
- **Then** every variant renders and unknown variants fail visibly

**Scenario:** responsibility board is unique and prioritized [`integration`]

- **Given** overlapping participation and simultaneous attention reasons
- **When** board renders
- **Then** MR appears once, owned precedence applies and sort order is decision→working→external→none

**Scenario:** card controls follow lifecycle rules [`unit`]

- **Given** open, merged and closed MR cards
- **When** their controls render
- **Then** Update description is always available and Complete appears only for merged or closed MR; facts remain legible without colour

**Scenario:** workspace keeps one chronological fact stream [`integration`]

- **Given** summary, findings, discussions, delta, actions, plan and artifact widgets with unread items and one widget-local failure
- **When** the MR workspace renders and an anchor is opened
- **Then** all seven widget kinds retain chronology, unread markers and deep-link anchors, cyclic widgets update in place, resolved one-shot widgets sink into history, and the local failure stays inside its widget

**Scenario:** hybrid package applies immediately [`e2e`]

- **Given** editable selected package on allowlisted real MR
- **When** operator clicks Apply
- **Then** no second confirm appears and independent GitLab outcomes update individually

**Scenario:** clipboard failure preserves handoff baseline [`e2e`]

- **Given** generated delta and denied browser clipboard
- **When** copy fails and is retried
- **Then** failure is local, no file downloads and baseline advances only after success

**Scenario:** activity horizon is enforced end to end [`integration`]

- **Given** open/merged/closed MR, applicable completed/uncompleted states and activity inside/outside the horizon
- **When** board/history render and a new event arrives for each hidden case
- **Then** cards follow the full visibility table, history remains accessible, and every new event clears completion and restores the MR

**Scenario:** responsive layout preserves operator state [`integration`]

- **Given** edited action selections, expanded evidence and a handoff draft
- **When** viewport changes between supported desktop widths
- **Then** the same component state stays mounted and no operator input is lost
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                               | Required by                    |
| --------------------------------------------------------------------- | ------------------------------ |
| `npm run type-check`                                                  | typescript-rules               |
| `npm test -- services/agent-inbox/modules/inbox-dashboard/__tests__/` | testing-common, node-test      |
| `npm run inbox-serve:build && npm run test:e2e:prod`                  | playwright-cli, playwright-e2e |

- **Task-specific Completion additions:** mandatory AGENTS.md screenshots on rebuilt production bundle and real data.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- types → `dashboard.contract.test.tsx` :: `dashboard renders every card widget package and outcome variant`
- board → `BoardPage.test.tsx` :: `responsibility queues place each MR once in product priority order`
- card → `MrCard.test.tsx` :: `description and completion controls follow lifecycle and accessibility rules`
- workspace → `MrWorkspace.test.tsx` :: `seven widgets preserve unread anchors local errors and cyclic versus one-shot lifecycle`
- apply → `agent-inbox.closed-loop.spec.ts` :: `operator applies selected package directly to allowlisted GitLab MR`
- clipboard → `agent-inbox.handoff.spec.ts` :: `clipboard failure preserves baseline until acknowledged success`
- horizon/card → `BoardPage.test.tsx` :: `open merged and closed state completion and horizon matrix controls active cards`
- horizon/history → `dashboard-history.integration.test.tsx` :: `every hidden case remains in local history and a new event clears completion and restores the card`
- responsive → `MrWorkspace.test.tsx` :: `viewport changes retain operator selections evidence and handoff draft`
  <!--/SECTION:TEST_COVERAGE-->
  <!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-10, initial

#### P1

- [x] `2026-08-11T18:50:14Z` intro `ResponsibilityQueue` ← spec §3 entity, две очереди вместо четырёх attention lanes
- [x] `2026-08-11T18:50:14Z` intro `ReviewMrCard` ← spec §3, карточка с lifecycle-controls и ReviewStateChip
- [x] `2026-08-11T18:50:14Z` intro `ReviewStateChip` ← spec §3, один чип состояния из attention/work
- [x] `2026-08-11T18:50:14Z` intro `ReviewFeed` ← spec §3, chronological smart-widget stream (7 типов)
- [x] `2026-08-11T18:50:14Z` intro `ReviewWidget` ← spec §3, один виджет ленты (findings/threads/artifact/gitlab/plan/progress/action)
- [x] `2026-08-11T18:50:14Z` intro `ReviewPackageWidget` ← spec §3, editable checkbox action package
- [x] `2026-08-11T18:50:14Z` intro `ReviewArtifactViewer` ← spec §3, addressable full artifact viewer
- [x] `2026-08-11T18:50:14Z` intro `ReviewChatPanel` ← spec §3, persistent anchored MR conversation
- [x] `2026-08-11T18:50:14Z` intro `ReviewHandoffControl` ← spec §3, full/delta clipboard handoff control
- [x] `2026-08-11T18:50:14Z` intro `ClipboardAdapter` ← spec §3, browser clipboard write + delivery acknowledgement
- [x] `2026-08-11T18:50:14Z` intro `MrWorkspace` ← composition root for workspace (feed+package+artifact+chat+handoff)
- [x] `2026-08-11T18:50:14Z` intro `MrLifecycleState` ← type: 'open'|'merged'|'closed', нужен для lifecycle controls
- [x] `2026-08-11T18:50:14Z` intro `ReviewPackage` ← type: versioned action package с per-action outcomes
- [x] `2026-08-11T18:50:14Z` intro `ReviewPackageAction` ← type: одно действие пакета с selected/outcome
- [x] `2026-08-11T18:50:14Z` decision queue-split=role ← Review queue для reviewer, Mine/Assigned для author/mentioned/null; соответствует spec §5 "Columns are Review and Mine/Assigned"
- [x] `2026-08-11T18:50:14Z` decision sort-order=attention-priority ← decision-required(⏳💬) → agent-working(🔀) → external-wait(✅) → no-action(😴)
- [x] `2026-08-11T18:50:14Z` decision backward-compat=re-export ← FeedList, MrCard, AttentionBoard остаются в dashboard-v2-ui.tsx как re-exports; dashboard-v2.contract.test.tsx, feed-lifecycle.test.tsx и optimistic.test.tsx продолжают работать
- [x] `2026-08-11T18:50:14Z` decision legacy-retire=delete ← components/\*, services/board-store.tsx, services/api-client.ts, services/chat-api-client.ts, services/debug-log.ts удалены; связанные тесты удалены; типы из inbox-api/types.ts не нужны в новой системе
- [x] `2026-08-11T18:50:14Z` decision clipboard-browser-api ← ClipboardAdapter использует navigator.clipboard.writeText (Web API), не node:crypto
- [x] `2026-08-11T19:45:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-11T19:45:00Z` ver `sdd verify 12 files` → ALL_GATES_PASS (typecheck/gennady-lint/test/format-check) exit=0
- [x] `2026-08-11T19:45:00Z` DONE
      **Handoff →** artifacts: [board/ResponsibilityQueue.tsx, workspace/MrWorkspace.tsx, workspace/widgets/ReviewFeed.tsx, workspace/ReviewPackageWidget.tsx, chat/ReviewChatPanel.tsx, handoff/ClipboardAdapter.ts, handoff/ReviewHandoffControl.tsx, artifacts/ReviewArtifactViewer.tsx, App.tsx, dashboard-v2-ui.tsx, v2-types.ts, dashboard-v2-api.ts]; decisions: [queue-split=role, sort-order=attention-priority, backward-compat=re-export, legacy-retire=delete, clipboard-browser-api]; open: []

#### P2

- [x] `2026-08-11T19:13:26Z` intro `dashboard.contract.test.tsx` ← каждый вариант чипа внимания (5), типа виджета (7) и состояния жизненного цикла (3) проверен через renderToStaticMarkup
- [x] `2026-08-11T19:13:26Z` intro `BoardPage.test.tsx` ← два сценария: очередь по роли + порядок сортировки; матрица видимости Завершить по lifecycle
- [x] `2026-08-11T19:13:26Z` intro `MrCard.test.tsx` ← lifecycle controls + accessibility labels для ReviewMrCard
- [x] `2026-08-11T19:13:26Z` intro `MrWorkspace.test.tsx` ← 7 виджетов + unread divider + one-shot resolve; структурная инвариантность viewport
- [x] `2026-08-11T19:13:26Z` intro `dashboard-history.integration.test.tsx` ← horizon matrix: open/merged/closed с done/running + restore через unread
- [x] `2026-08-11T19:13:26Z` intro `agent-inbox.closed-loop.spec.ts` ← Playwright e2e: apply пакета без второго подтверждения; независимые outcomes
- [x] `2026-08-11T19:13:26Z` intro `agent-inbox.handoff.spec.ts` ← Playwright e2e: clipboard denial → retry → success; без file download fallback
- [x] `2026-08-11T19:13:26Z` intro `playwright.prod.config.ts` ← Playwright config для production build через vite preview :5175
- [x] `2026-08-11T19:13:26Z` decision add-npm-script=test:e2e:prod ← package.json вне target files; добавлен по аналогии с test:e2e:review-flow как минимальная инфраструктура для §5 проверки; §5-команда требует этого скрипта
- [x] `2026-08-11T19:58:44Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-11T19:58:44Z` ver `npm test -- services/agent-inbox/modules/inbox-dashboard/__tests__/` → pass exit=0 (2585 pass, 0 fail)
- [x] `2026-08-11T19:58:44Z` ver `npm run inbox-serve:build && npm run test:e2e:prod` → pass exit=0 (2/2 Playwright tests pass)
- [x] `2026-08-11T19:58:44Z` DONE
      **Handoff →** artifacts: [__tests__/dashboard.contract.test.tsx, __tests__/BoardPage.test.tsx, __tests__/MrCard.test.tsx, __tests__/MrWorkspace.test.tsx, __tests__/dashboard-history.integration.test.tsx, __tests__/index.ts, e2e/inbox-serve/agent-inbox.closed-loop.spec.ts, e2e/inbox-serve/agent-inbox.handoff.spec.ts, e2e/inbox-serve/playwright.prod.config.ts]; decisions: [add-npm-script=test:e2e:prod, index-ts-stub=directory-resolution, route-order=LIFO-catch-all-first, count-by-title-attr=updateCount, article-split=card-region-isolation]; open: []

#### Round close

- [x] `2026-08-11T19:59:30Z` sync agent-inbox+root
- [x] `2026-08-11T19:58:44Z` DONE
<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Behaviour comes from current specs; v3 prototypes are visual language, not the obsolete four-column structure.
- BDD critic: merged lifecycle controls, seven-widget chronology, non-colour facts, local errors, horizon/history split and mounted responsive state; real-data screenshots cover apply and clipboard on the rebuilt production bundle.
