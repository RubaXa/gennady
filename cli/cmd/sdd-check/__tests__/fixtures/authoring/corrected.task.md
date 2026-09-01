# Task: INF-tool — Authoring fixture

<!--SECTION:META-->
## Meta
- **Task-ID:** INF-tool
- **Status:** [ ] TODO
- **Purpose:** author one deterministic infrastructure ticket
- **Scope:** infra-base
- **Module:** N/A
- **Structural Owner:** infrastructure-flat
- **Owning Spec:** [Owning spec](./infra-base.spec.md)
- **Dependencies:** None
- **Spec References:**
  - Contract: [Toolchain](./infra-base.spec.md#service-toolchain)
- **Runtime Backing:** not-implemented
- **Verification Levels:** contract, unit
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->
## Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | — | [ ] |
| P2 | test | P1 | [ ] |
<!--/SECTION:PHASES_OVERVIEW-->

<!--SECTION:PHASE_P1-->
### P1 — impl
- **Objective:** create the toolchain contract implementation
- **Rules:**
  - [test-rule](../../ai/directives/test-rule.xml)
- **Target Files:**
  - src/toolchain.ts
- **Deleted Files:**
  - none
- **Inputs:** none
- **Exit:** the contract implementation type-checks
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->
### P2 — test
- **Objective:** prove the toolchain contract behavior
- **Rules:**
  - [test-rule](../../ai/directives/test-rule.xml)
- **Target Files:**
  - test/toolchain.test.ts
- **Deleted Files:**
  - none
- **Inputs:** P1 handoff
- **Exit:** the contract scenario passes
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->
## Acceptance Criteria (BDD)
**Scenario:** creates the project toolchain [`contract`] `[INF-REQ-1]`
- **Given** an empty project
- **When** the toolchain setup runs
- **Then** the project toolchain is available

**Scenario:** rejects an invalid project root [`unit`] `[INF-REQ-2]`
- **Given** a project root outside the repository
- **When** the toolchain setup runs
- **Then** it rejects the invalid project root
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->
## Verification
<!--COVERAGE_POLICY:v1-->
- **Coverage Policy:** not-applicable
- **Coverage Reason:** this fixture validates task authoring without a runtime coverage producer
| Command | Required by | Role |
|---------|-------------|------|
| — | — | extra |
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->
## Test Scenario Coverage
- creates the project toolchain → `test/toolchain.test.ts` :: `[INF-REQ-1] creates the project toolchain`
- rejects an invalid project root → `test/toolchain.test.ts` :: `[INF-REQ-2] rejects an invalid project root`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->
## Execution Log
- pending
<!--/SECTION:EXECUTION_LOG-->
