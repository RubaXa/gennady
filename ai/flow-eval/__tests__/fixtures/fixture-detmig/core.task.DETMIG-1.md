<!--SECTION:META-->
## Meta
- **Task-ID:** DETMIG-1
- **Status:** [ ] TODO
- **Purpose:** implement deterministic demo behavior
- **Scope:** demo
- **Module:** core
- **Structural Owner:** module
- **Owning Spec:** [Owning spec](./core.spec.md)
- **Dependencies:** None
- **Spec References:**
  - Contract: [run](./core.spec.md#module-contracts)
- **Runtime Backing:** real-runtime
- **Verification Levels:** contract, unit
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

## Phases Overview
<!--SECTION:PHASES_OVERVIEW-->
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | — | [ ] |
| P2 | test | P1 | [ ] |
<!--/SECTION:PHASES_OVERVIEW-->

### P1 — impl
<!--SECTION:PHASE_P1-->
- **Objective:** implement run
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Spec Refs:**
  - [run](./core.spec.md#module-contracts)
- **Target Files:**
  - src/demo.ts
- **Deleted Files:**
  - none
- **Inputs:** none
- **Exit:** implementation satisfies the approved contract
<!--/SECTION:PHASE_P1-->

### P2 — test
<!--SECTION:PHASE_P2-->
- **Objective:** verify normal and boundary inputs
- **Rules:**
  - [testing-common](../../../ai/directives/testing/common.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - src/demo.test.ts
- **Deleted Files:**
  - none
- **Inputs:** P1 handoff
- **Exit:** tests pass
<!--/SECTION:PHASE_P2-->

## Acceptance Criteria (BDD)
<!--SECTION:BDD-->
**Feature:** demo rules

**Scenario:** run contract [contract] [DEM-REQ-1]
- **Given** a caller uses the public contract
- **When** run receives input
- **Then** it returns the declared result type
<!--/SECTION:BDD-->

## Verification
<!--SECTION:VERIFICATION-->
| Command | Required by |
|---------|-------------|
| `npm test` | this ticket |
<!--/SECTION:VERIFICATION-->

## Test Scenario Coverage
<!--SECTION:TEST_COVERAGE-->
- run contract → `src/demo.test.ts` :: `[DEM-REQ-1] run contract`
<!--/SECTION:TEST_COVERAGE-->

## Execution Log
<!--SECTION:EXECUTION_LOG-->
*(Round = one execute-then-audit attempt; per-phase blocks within a Round. A checked line still carrying an unreplaced angle-bracket token is a fabricated DONE.)*

- 2026-09-07 migrated from v1 — no rounds/phases recorded in v1 format
<!--/SECTION:EXECUTION_LOG-->

## Decision Log
<!--SECTION:DECISION_LOG-->
<!--/SECTION:DECISION_LOG-->
