# Task: TSK-173 — Canonical review state and accumulated change batches

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-173
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Make journal-backed `ReviewState`, inclusive participation, lifecycle visibility and timer-driven `ReviewChangeBatch` canonical.
- **Scope:** agent-inbox
- **Module:** inbox-core
- **Dependencies:** TSK-172
- **Spec References:** [Inventory](../../../specs/agent-inbox/inbox-core/inbox-core.spec.md#3-entity-inventory-closed-world), [Contracts](../../../specs/agent-inbox/inbox-core/inbox-core.spec.md#5-module-contracts-dbc)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
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

- **Objective:** Reuse journal/config/registry/boot code while adding versioned events, deterministic fold, participation/lifecycle and change-batch timers.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-core/`
- **Inputs:** TSK-172 handoff
- **Exit:** registry/projections are rebuildable; every MR event postpones quiet deadline; manual verify bypasses timers.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Cover event/version types, crash-tail recovery, lifecycle truth table, inclusive participation and controlled-clock debounce/quiet paths.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-core/__tests__/`
- **Inputs:** P1 handoff
- **Exit:** every inventory contract has a mapped contract test and all lifecycle/timer BDD cases pass.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** core contract shapes are exhaustive [`contract`]

- **Given** ReviewEvent, ReviewState, Participation, Lifecycle, ChangeBatch and port types
- **When** valid and invalid variants cross the boundary
- **Then** valid variants fold and unknown versions/kinds are rejected visibly

**Scenario:** every event accumulates and postpones quiet verification [`unit`]

- **Given** an open change batch and controlled clock
- **When** commits, description, approval and discussion events arrive
- **Then** all are retained and the quiet deadline follows the newest event

**Scenario:** any human reply uses debounce while manual verify is immediate [`unit`]

- **Given** a human reply and configured deadlines
- **When** time advances or operator verifies manually
- **Then** debounce/quiet rules are deterministic and manual verification is due immediately

**Scenario:** terminal inactive MR hides automatically [`unit`]

- **Given** tracked merged MR not completed and last activity older than three months
- **When** visibility is projected
- **Then** it is hidden while history remains recoverable

**Scenario:** lifecycle truth table and recovery are complete [`integration`]

- **Given** open/terminal × within/outside horizon × completed states, a torn journal tail and deleted caches
- **When** completion/new activity/restart occur
- **Then** open completion is rejected, a new event refreshes activity and clears terminal completion before restoring visibility, torn tail is discarded, durable failure is not acknowledged and rebuilt state is byte-equivalent
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                          | Required by               |
| ---------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                             | typescript-rules          |
| `npm test -- services/agent-inbox/modules/inbox-core/__tests__/` | testing-common, node-test |

- **Task-specific Completion additions:** delete/rebuild registry and prove identical state.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- shapes → `review-core.contract.test.ts` :: `review core contracts reject unknown variants exhaustively`
- accumulation → `review-change-batch.test.ts` :: `every MR event accumulates and postpones quiet deadline`
- reply/manual → `review-change-batch.test.ts` :: `human reply debounces and manual verify is immediate`
- visibility → `review-lifecycle.test.ts` :: `inactive terminal MR hides while history remains`
- completed reactivation → `review-lifecycle.test.ts` :: `new event clears completedAt and returns both completed and horizon-hidden terminal MR`
- lifecycle/recovery → `review-core-recovery.integration.test.ts` :: `lifecycle truth table and crash cache recovery preserve canonical state`
  <!--/SECTION:TEST_COVERAGE-->
  <!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-10, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- <target-tests>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Reuse mapping: existing EventJournal/StateStore/BootReadiness are modified; duplicate VCS types are removed only after TSK-174.
- BDD critic: merged complete lifecycle/recovery and event-kind matrix requirements; rejected selective invalidation and GitLab DTO parsing in core.
