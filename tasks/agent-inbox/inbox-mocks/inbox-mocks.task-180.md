# Task: TSK-180 — Deterministic isolated mock runtime and port contract kit

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-180
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Expand existing factories into strict adapters/scenarios for every variable port and failure branch.
- **Scope:** agent-inbox
- **Module:** inbox-mocks
- **Dependencies:** TSK-173, TSK-174, TSK-175, TSK-177, TSK-179
- **Spec References:** [Mocks inventory](../../../specs/agent-inbox/inbox-mocks/inbox-mocks.spec.md#3-entity-inventory-closed-world), [Runtime contract](../../../specs/agent-inbox/inbox-mocks/inbox-mocks.spec.md#5-module-contracts-dbc)
- **Runtime Backing:** `simulation`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None
  <!--/SECTION:META-->
  <!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Implement strict ReviewScenario, mock VCS/agent/journal/artifact/clock/executor/profile/projection adapters and run-id reset.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-mocks/`, `services/agent-inbox/test/`
- **Inputs:** upstream port contracts
- **Exit:** unspecified calls fail; no network/production fallback; controlled time drives all timers.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Run every shared port contract twice and mandatory capability matrix including partial/ambiguous failure, approval reset and crash recovery.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-mocks/__tests__/`, `services/agent-inbox/test/__tests__/`
- **Inputs:** P1 handoff
- **Exit:** identical scenario input/time yields byte-equivalent journal and projections.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** mock adapter contracts are exhaustive [`contract`]

- **Given** every production port contract
- **When** mock adapters run the shared suite
- **Then** shapes/errors/outcomes match and unknown calls fail

**Scenario:** scenario is deterministic [`integration`]

- **Given** identical events, agent results and controlled clock
- **When** two isolated runs execute
- **Then** journals, tasks, packages and projections are identical

**Scenario:** capability matrix covers recovery [`unit`]

- **Given** every effect, partial/ambiguous failure, approval reset and crash point
- **When** scenarios execute
- **Then** every branch has an explicit observation and no skipped default

**Scenario:** isolated run cannot escape its boundary [`integration`]

- **Given** a simulation run-id and attempts to reset a foreign run-id or reach production network/filesystem
- **When** the mock runtime executes them
- **Then** every attempt is physically denied and production state remains unchanged

**Scenario:** controlled time drives scheduling [`unit`]

- **Given** event debounce and quiet-timeout scenarios
- **When** the controlled clock advances across their boundaries
- **Then** scheduling is deterministic and no wall-clock sleep is used

**Scenario:** crash and ambiguous effects remain distinct [`integration`]

- **Given** one crash before persistence and one effect with unknown remote outcome
- **When** recovery runs
- **Then** persisted work resumes while the ambiguous effect is reconciled before any retry
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                | Required by               |
| ------------------------------------------------------------------------------------------------------ | ------------------------- |
| `npm run type-check`                                                                                   | typescript-rules          |
| `npm test -- services/agent-inbox/modules/inbox-mocks/__tests__/ services/agent-inbox/test/__tests__/` | testing-common, node-test |

- **Task-specific Completion additions:** prove network and production paths are unreachable.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- contracts → `mock-port.contract.test.ts` :: `all mock adapters satisfy shared port contracts exhaustively`
- deterministic → `review-scenario.integration.test.ts` :: `same scenario and time produce identical journal and projections`
- matrix → `review-scenario.test.ts` :: `mandatory failure reset effect and recovery matrix has no uncovered branch`
- isolation → `review-scenario.integration.test.ts` :: `foreign reset network and production filesystem access are denied`
- clock → `review-scenario.test.ts` :: `controlled clock drives debounce and quiet timeout without sleeping`
- recovery → `review-scenario.integration.test.ts` :: `crash recovery and ambiguous effect reconciliation follow distinct paths`
- VCS read/effect, agent, journal, artifact, clock, executor, profile and projection ports → `mock-port.contract.test.ts` :: one named shared contract suite per port
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

- Existing factories/cassettes are reuse inputs; mock runtime never substitutes real acceptance.
- BDD critic: merged physical isolation, controlled-time and split recovery cases with port-by-port mapping; rejected mock-only acceptance and a second fixture model.
