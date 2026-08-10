# Task: TSK-177 — Hybrid action packages and intent-preserving automation

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-177
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Extend per-MR execution with one action catalog, hybrid packages, independent outcomes and safe automation.
- **Scope:** agent-inbox
- **Module:** inbox-queue
- **Dependencies:** TSK-173, TSK-174, TSK-176
- **Spec References:** [Queue inventory](../../../specs/agent-inbox/inbox-queue/inbox-queue.spec.md#3-entity-inventory-closed-world), [DbC](../../../specs/agent-inbox/inbox-queue/inbox-queue.spec.md#5-module-contracts-dbc)
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

- **Objective:** Add action catalog, proposals/decisions/packages/effects/outcomes, dependency-aware coordinator, stale invalidation and explicit auto-resolve/restore-approve policies.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-queue/`, `services/agent-inbox/modules/inbox-vcs/effects*`
- **Inputs:** upstream handoffs
- **Exit:** manual/auto share one executor; independent actions continue after sibling failure; every action is attributed.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Exhaustive package/action typing, alternatives/dependencies, staleness, partial failure, idempotent retry and automation gates.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-queue/__tests__/`
- **Inputs:** P1 handoff
- **Exit:** all catalog actions and outcome branches map to contract tests.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** action/package/outcome types are exhaustive [`contract`]

- **Given** every action kind, dependency, decision and outcome
- **When** catalog/package types are checked
- **Then** unknown or invalid combinations are rejected before execution

**Scenario:** package defaults and alternatives are coherent [`unit`]

- **Given** recommended independent actions and refusal alternatives
- **When** package is built
- **Then** recommendations are selected and mutually exclusive choices cannot co-execute

**Scenario:** new event leaves stale package visible but disabled [`integration`]

- **Given** an unapplied package
- **When** any MR event enters its batch
- **Then** apply is rejected while revision/reason/replacement reference remain queryable

**Scenario:** partial failure preserves independent success [`integration`]

- **Given** an effect graph with successful sibling, failed effect, its dependant and another independent sibling
- **When** package executes
- **Then** successful independent siblings continue, the failed effect is failed and only its dependant is blocked

**Scenario:** automation restores intent only [`unit`]

- **Given** prior operator approval and verified allowed thread fix
- **When** gates pass or fail
- **Then** only proven resolve/prior-approve restoration runs automatically

**Scenario:** executor ordering, recovery and retry remain safe [`integration`]

- **Given** two MR queues, operator/background priorities, an acknowledged task and ambiguous effect
- **When** execution/restart/retry occur
- **Then** each MR is sequential, MR run in parallel, priority is operator→event→background, acknowledged task is not repeated and ambiguous effect reconciles with individual retry history

**Scenario:** typed registry enforces scheduling policies [`contract`]

- **Given** duplicate, dependent, mutually exclusive, superseding and session-bound tasks
- **When** registry accepts and schedules them
- **Then** deduplication, dependency, exclusion, supersede and session policies produce one exhaustive typed decision

**Scenario:** automation ownership truth table denies unsafe branches [`unit`]

- **Given** operator thread, bot thread on author/non-author MR, foreign thread, missing coverage, blocking finding and absent prior approval
- **When** automatic policy evaluates
- **Then** only verified operator thread, author-owned allowlisted bot thread or proven prior-approval restoration executes; other cases yield proposal/no-action
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                           | Required by               |
| ----------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                              | typescript-rules          |
| `npm test -- services/agent-inbox/modules/inbox-queue/__tests__/` | testing-common, node-test |

- **Task-specific Completion additions:** reconcile duplicate/ambiguous effects through the unified coordinator.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- types → `review-action.contract.test.ts` :: `action package and outcome variants are exhaustive`
- alternatives → `review-package.test.ts` :: `recommended actions default selected and alternatives are exclusive`
- stale → `review-package.integration.test.ts` :: `new event preserves stale package disabled with replacement reference`
- partial → `review-effect-coordinator.integration.test.ts` :: `independent effects continue after partial failure`
- automation → `review-automation-policy.test.ts` :: `automation restores only verified prior operator intent`
- executor → `review-task-executor.integration.test.ts` :: `per MR ordering cross MR parallelism priority recovery and ambiguous retry are safe`
- registry policies → `review-task-registry.contract.test.ts` :: `dedup dependency exclusion supersede and session variants are exhaustive`
- auto truth table → `review-automation-policy.test.ts` :: `automation ownership coverage blocking and prior approval truth table denies unsafe branches`
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

- Consolidate legacy `EffectExecutor` and VCS `Effects`; generic accept-rate automation is removed.
- BDD critic: merged executor/recovery/dependency failure and full automation truth table; rejected accept-rate, second executor and ambiguous autonomy.
