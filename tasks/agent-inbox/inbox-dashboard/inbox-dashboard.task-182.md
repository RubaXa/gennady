# Task: TSK-182 — Carbon & Steel operator dashboard and MR workspace

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-182
- **Status:** [ ] TODO
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
| P1  | refactor | —    | [ ]    |
| P2  | test     | P1   | [ ]    |

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
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml), [playwright-cli](../../../ai/directives/testing/playwright-cli.xml), [playwright-e2e](../../../ai/directives/testing/playwright-e2e.xml)
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

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- services/agent-inbox/modules/inbox-dashboard/__tests__/` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` ver `npm run inbox-serve:build && npm run test:e2e:prod` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Behaviour comes from current specs; v3 prototypes are visual language, not the obsolete four-column structure.
- BDD critic: merged lifecycle controls, seven-widget chronology, non-colour facts, local errors, horizon/history split and mounted responsive state; real-data screenshots cover apply and clipboard on the rebuilt production bundle.
