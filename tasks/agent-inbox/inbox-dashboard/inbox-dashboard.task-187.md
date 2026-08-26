# Task: TSK-187 — Recompose the Carbon & Steel operator cockpit

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-187
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Replace the chaotic prototype layout with a usable real-data two-queue cockpit and evidence-first MR workspace.
- **Scope:** agent-inbox
- **Module:** inbox-dashboard
- **Dependencies:** TSK-185
- **Spec References:** [Dashboard spec](../../../specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md), [Design system](../../../specs/agent-inbox/inbox-dashboard/design-system.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`, `e2e`, `visual`
- **Deferred Runtime Scope:** None

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind            | Deps | Status |
| --- | --------------- | ---- | ------ |
| P1  | design/refactor | —    | [ ]    |
| P2  | visual-e2e      | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — design/refactor

- **Objective:** Implement compact header, exactly two responsibility queues, informative MR cards, truthful sync/empty/error states and an evidence-first workspace with stable action rail.
- **Target Files:** `services/agent-inbox/modules/inbox-dashboard/`.
- **Inputs:** user-provided Carbon & Steel prototypes and TSK-185 real API.
- **Exit:** one coherent hierarchy at 1280/1440/1920 with no competing panels or hidden operator state.

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — visual-e2e

- **Objective:** Validate layout and product flow through rebuilt production bundle, real local server, real `~/.gennady` and real GitLab reads.
- **Target Files:** dashboard tests, `e2e/inbox-serve/`, visual artifacts.
- **Exit:** every required state/width has DOM geometry assertions and a screenshot with explanatory evidence.

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** board has two clear queues [`integration`]

- **Given** overlapping reviewer and mine/assigned participation
- **When** board renders
- **Then** each MR appears once under exactly `Ревью` or `Мои / назначенные`, with role/reason, facts, progress and one primary next action

**Scenario:** sync is not fake empty [`e2e`]

- **Given** production discovery is running
- **When** board has no projection yet
- **Then** it shows sync progress; true empty appears only after completed sync with zero eligible MRs

**Scenario:** workspace separates facts and decisions [`integration`]

- **Given** summary, findings, discussions, delta, plan, artifacts, package, handoff and chat
- **When** workspace opens
- **Then** chronological facts occupy the main stream and selected package/handoff/chat remain in a stable right rail; action is adjacent to its evidence

**Scenario:** package is editable and failures local [`e2e`]

- **Given** default-selected hybrid checkbox/radio actions
- **When** operator edits and applies
- **Then** exact selection persists, each outcome renders beside its action, and one failure does not obscure or cancel independent outcomes

**Scenario Outline:** desktop geometry remains coherent [`visual`]

- **Given** `<state>` at viewport `<width>`
- **When** the rebuilt production dashboard renders real state
- **Then** header and panels do not overlap, clip or create horizontal scroll; hierarchy remains compact and screenshot evidence is stored

| state      | width |
| ---------- | ----- |
| sync       | 1280  |
| true-empty | 1280  |
| populated  | 1280  |
| workspace  | 1280  |
| sync       | 1440  |
| true-empty | 1440  |
| populated  | 1440  |
| workspace  | 1440  |
| sync       | 1920  |
| true-empty | 1920  |
| populated  | 1920  |
| workspace  | 1920  |

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                                                        | Required by           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------- | ----------------------- |
| `npm run type-check`                                                                                                                                                                           | TypeScript contracts  |
| `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-dashboard/__tests__/*.test.ts services/agent-inbox/modules/inbox-dashboard/__tests__/*.test.tsx` | component/composition |
| `npm run inbox-serve:build && npm run test:e2e:prod`                                                                                                                                           | production visual E2E |
| `! rg -n "page\.route                                                                                                                                                                          | routeFromHAR          | \.fulfill\(" e2e/inbox-serve` | no HTTP mock acceptance |
| `ai/skills/sdd-execute/scripts/sdd check --task TSK-187`                                                                                                                                       | SDD integrity         |

- **Task-specific Completion additions:** mandatory screenshots for all 12 rows use the real production server/data; mock/demo screenshots cannot satisfy the task.

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- queues → `BoardPage.test.tsx` :: `each real projection appears once in one of two responsibility queues`
- sync → `agent-inbox.real-dashboard.spec.ts` :: `sync and true empty states cannot be confused`
- workspace → `MrWorkspace.test.tsx` :: `fact stream and stable action rail preserve operator hierarchy`
- package → `agent-inbox.real-dashboard.spec.ts` :: `edited action package persists exact local outcomes`
- geometry → same spec :: `twelve real state and viewport cases pass DOM geometry and screenshot assertions`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-13, recovery

#### P1

- [ ] `<ts>` ver `component and type gates` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `real visual E2E gates` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->
