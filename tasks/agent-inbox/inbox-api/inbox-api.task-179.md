# Task: TSK-179 — Journal projections and typed local API

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-179
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Replace RoleScheduler-backed board state with journal projections, typed commands and reconciled SSE.
- **Scope:** agent-inbox
- **Module:** inbox-api
- **Dependencies:** TSK-173, TSK-174, TSK-176, TSK-177, TSK-178
- **Spec References:** [API inventory](../../../specs/agent-inbox/inbox-api/inbox-api.spec.md#3-entity-inventory-closed-world), [DbC](../../../specs/agent-inbox/inbox-api/inbox-api.spec.md#5-module-contracts-dbc)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `integration`
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

- **Objective:** Implement ProjectionPort/adapter, two-queue board/feed/MR/package/test projections, commands and per-MR SSE cursor; retire RoleRouter.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-api/`
- **Inputs:** upstream handoffs
- **Exit:** BoardProvider no longer consumes RoleScheduler; stale/current packages and per-action outcomes are queryable.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Contract/integration tests for unique placement, commands, stale rejection, boot observability, SSE resume and handoff receipt.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-api/__tests__/`
- **Inputs:** P1 handoff
- **Exit:** projections rebuild identically from journal and in-memory adapters.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** API DTO/command/event variants are exhaustive [`contract`]

- **Given** every projection, command and SSE frame
- **When** boundary types are checked
- **Then** unknown/stale variants are rejected exhaustively

**Scenario:** MR appears once in responsibility board [`integration`]

- **Given** overlapping author/reviewer/assignee participation
- **When** board is rebuilt
- **Then** MR appears once in Mine/Assigned with all role chips

**Scenario:** visibility projection preserves the lifecycle truth table [`integration`]

- **Given** open/merged/closed MR, applicable completed/uncompleted states and activity inside/outside the horizon
- **When** board/history projections rebuild and a new event is appended
- **Then** active visibility matches core rules, hidden history remains queryable, and the new event clears completion and returns the MR

**Scenario:** stale apply is rejected but retained [`integration`]

- **Given** invalidated package
- **When** client queries and attempts apply
- **Then** old revision/reason/replacement remain visible and command is rejected

**Scenario:** SSE reconnect reconciles snapshot [`integration`]

- **Given** missed frames after cursor
- **When** client reconnects or SSE remains unavailable
- **Then** SSE or reconciliation polling supplies ordered delta/replacement snapshot without duplicating outcomes

**Scenario:** projection cache rebuild and boot boundary are honest [`integration`]

- **Given** deleted projection cache and API listening before ready
- **When** journal rebuild/boot failure occur
- **Then** board/feed/MR/package/test views and cursor rebuild identically, progress/failure remain readable and effects stay disabled pre-ready

**Scenario:** typed command gates reject unsafe mutation [`contract`]

- **Given** malformed/stale command, Complete on open MR, Update description on visible MR and clipboard delivery acknowledgement
- **When** commands validate
- **Then** malformed/stale/open-complete reject before mutation, description/handoff commands route correctly and optimistic acceptance is distinct from reconciled success
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                         | Required by               |
| --------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                            | typescript-rules          |
| `npm test -- services/agent-inbox/modules/inbox-api/__tests__/` | testing-common, node-test |

- **Task-specific Completion additions:** delete RoleRouter and prove journal rebuild.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- types → `review-api.contract.test.ts` :: `API commands projections and event frames are exhaustive`
- unique → `review-board-projection.integration.test.ts` :: `overlapping participation yields one owned MR card`
- visibility → `review-board-projection.integration.test.ts` :: `state completion and horizon matrix survives API projection rebuild and new-event reactivation`
- stale → `review-package-projection.integration.test.ts` :: `stale package remains visible disabled and cannot apply`
- SSE/polling → `review-event-stream.integration.test.ts` :: `SSE reconnect and polling fallback reconcile missed frames without duplicate outcome`
- rebuild/boot → `review-api.integration.test.ts` :: `journal rebuild restores all projections and pre ready API remains read only observable`
- command gates → `review-api.contract.test.ts` :: `typed command matrix rejects unsafe mutation and routes description and handoff receipt`
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

- Reuse HTTP/SSE/artifact guards; role-backed projections are replaced, not wrapped.
- BDD critic: merged rebuild/boot/typed-command and real HTTP-SSE boundary cases; rejected domain decision logic and RoleRouter wrapping.
