# Task: TSK-176 — Role-invariant full, delta and cross-review pipeline

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-176
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Evolve `PipelineRuntime` into one full/delta/cross-review DAG with hard tool-trace coverage.
- **Scope:** agent-inbox
- **Module:** inbox-pipeline
- **Dependencies:** TSK-173, TSK-174, TSK-175
- **Spec References:** [Pipeline inventory](../../../specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md#3-entity-inventory-closed-world), [DbC](../../../specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md#5-module-contracts-dbc)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** real-MR end-to-end proof is owned by TSK-183.
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

- **Objective:** Implement shared intent/plan/evidence/finding/artifact/coverage/synthesis contracts; delta verifier, cross-reviewer and refusal/thread semantics.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-pipeline/`
- **Inputs:** TSK-173/174/175 handoffs
- **Exit:** participation never changes depth; stale/missing baseline forces full review; approve cannot pass unproven coverage.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Cover contract shapes, identical role depth, trace gates, cross-review alternatives, running-old/pending-new delta behavior and provenance.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-pipeline/__tests__/`
- **Inputs:** P1 handoff
- **Exit:** BDD cases pass against deterministic adapters with real artifact/journal seams where marked integration.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** pipeline contracts are exhaustive [`contract`]

- **Given** every intent, evidence, finding, coverage and synthesis variant
- **When** boundary types are checked
- **Then** attribution/blocking discriminants are exhaustive and invalid forms fail

**Scenario:** every participation gets full review [`integration`]

- **Given** equivalent MR snapshots with each participation signal
- **When** review executes
- **Then** required files and all six lenses—goal, architecture, specifications, tests, security and optimality—are identical, each has a read/tool trace, and only permission metadata differs

**Scenario:** coverage blocks approval [`integration`]

- **Given** an unread required file or missing tool trace
- **When** synthesis reaches verdict gate
- **Then** positive verdict/approve proposal is absent and gaps are visible

**Scenario:** layered plan produces a per-file report [`integration`]

- **Given** deterministic mechanical and trigger layers plus optional intelligent enrichment
- **When** the full review plan executes
- **Then** enrichment cannot erase deterministic scope and every required file has checklist status, evidence, findings or an explicit no-finding result

**Scenario:** foreign discussion is cross-reviewed [`unit`]

- **Given** agreement, incomplete review, disagreement and author refusal cases
- **When** cross-review runs
- **Then** reaction, supplement, objection/question and refusal alternatives retain provenance

**Scenario:** delta and lane failures preserve the gap [`integration`]

- **Given** stored, missing or stale baseline; running old revision; newer pending events; one failed review lane
- **When** delta scheduling and synthesis run
- **Then** valid baseline scopes delta, missing/stale forces full review, running work is not interrupted, pending delta supersedes older pending work and lane failure stays visible/retryable

**Scenario:** approval fixes thread semantics [`unit`]

- **Given** approval with open thread, later explicit override and author refusal
- **When** blocking classification/cross-review runs
- **Then** approval implies non-blocking until override and refusal yields agree+resolve, object or ask without blocking prior-approve restoration
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                              | Required by               |
| -------------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                                 | typescript-rules          |
| `npm test -- services/agent-inbox/modules/inbox-pipeline/__tests__/` | testing-common, node-test |

- **Task-specific Completion additions:** demonstrate coverage from observed tool trace.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- shapes → `review-pipeline.contract.test.ts` :: `pipeline contract variants are exhaustive and attributed`
- role depth → `review-orchestrator.integration.test.ts` :: `participation never reduces review depth`
- six lenses → `review-orchestrator.integration.test.ts` :: `goal architecture specifications tests security and optimality each emit evidence and read/tool trace`
- coverage → `review-coverage.integration.test.ts` :: `missing observed file trace blocks positive verdict and approval`
- layers/report → `review-orchestrator.integration.test.ts` :: `mechanical trigger and enriched layers preserve deterministic scope and produce a per-file report`
- cross-review → `review-cross-reviewer.test.ts` :: `cross review prepares all discussion alternatives with provenance`
- delta/failure → `review-delta-verifier.integration.test.ts` :: `baseline fallback pending supersede and lane failure preserve complete review gap`
- approval/thread → `review-cross-reviewer.test.ts` :: `approval and author refusal produce explicit non blocking thread semantics`
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

- Reuse `PipelineRuntime`, coverage gates and artifact recovery; role-specific orchestration is retired.
- BDD critic: merged delta/failure and approval/refusal semantics; real-MR proof deferred to TSK-183; rejected role tails and mandatory multi-model review.
