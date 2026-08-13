# Task: TSK-184 — Recover truthful status and wire the production control plane

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-184
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Replace the falsely accepted cutover with one production composition root that instantiates and runs the deterministic review control plane.
- **Scope:** agent-inbox
- **Module:** scope composition
- **Dependencies:** TSK-176, TSK-177, TSK-178, TSK-179, TSK-181
- **Spec References:** [Architecture](../../specs/agent-inbox/agent-inbox.spec.md#5-high-level-architecture), [Pipeline DbC](../../specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md#5-module-contracts-dbc)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `integration`
- **Deferred Runtime Scope:** Real GitLab effects remain deferred to TSK-186 and require an exact allowlist.

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

- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Objective:** Wire manifest, contract compiler, trusted receipts, validator, repair, freshness, synthesis, queue and handoff into `serve/bootstrap.ts`; eliminate acceptance-path legacy bypasses and repair production task resolution/recovery.
- **Target Files:**
  - `services/agent-inbox/serve/bootstrap.ts`
  - `services/agent-inbox/serve/run-mode.ts`
  - `services/agent-inbox/modules/inbox-pipeline/review/review-orchestrator.ts`
  - `services/agent-inbox/modules/inbox-pipeline/verification/review-freshness-gate.ts`
  - `services/agent-inbox/modules/inbox-queue/effects/review-effect-coordinator.ts`
  - `services/agent-inbox/modules/inbox-queue/task-registry.ts`
- **Inputs:** TSK-176/177/178/179 handoffs and audit evidence that TSK-181 did not wire the control plane.
- **Exit:** a real boot exposes one runtime identity and construction trace for every mandatory control-plane boundary; `RoleEngine` is unreachable from the acceptance path.

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:**
  - [testing-common](../../ai/directives/testing/common.xml)
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Objective:** Prove production construction, persisted task recovery and fail-closed publication.
- **Target Files:**
  - `services/agent-inbox/serve/__tests__/bootstrap.control-plane.integration.test.ts`
  - `services/agent-inbox/__tests__/full-flow.blackbox.test.ts`
- **Inputs:** P1 handoff.
- **Exit:** tests invoke the shippable composition root, not direct class fixtures.

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** production adapters satisfy control-plane DbC [`contract`]

- **Given** the manifest builder, contract compiler, receipt recorder, structural validator, repair coordinator, freshness gate, orchestrator and effect coordinator declared by the pipeline and queue specs
- **When** bootstrap exposes its typed runtime construction trace
- **Then** each concrete adapter is assignable to its declared Port or Service contract and exactly one reachable production instance owns each boundary

**Scenario:** production boot owns the deterministic control plane [`integration`]

- **Given** the real serve profile
- **When** bootstrap becomes ready
- **Then** manifest→contract→receipts→validation→repair→freshness→synthesis→queue is observable from one runtime and no legacy role engine executes review acceptance

**Scenario:** incomplete work cannot publish [`contract`]

- **Given** a missing slot, forged receipt, exhausted repair or stale cursor
- **When** a round reaches its boundary
- **Then** the journal records BLOCKED or STALE and creates no package, handoff or effect

**Scenario:** restart resumes durable work once [`integration`]

- **Given** persisted running tasks and consumed receipts
- **When** the production root restarts
- **Then** it resumes the same MR lane without repeating acknowledged work or a provider write

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                             | Required by                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `npm run type-check`                                                                                                                                | `typescript-rules`            |
| `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/serve/__tests__/*.test.ts services/agent-inbox/__tests__/*.test.ts` | `testing-common`, `node-test` |
| `! rg -n "new RoleEngine\|RoleEngine" services/agent-inbox/serve services/agent-inbox/modules/inbox-eval`                                           | no legacy acceptance bypass   |
| `ai/skills/sdd-execute/scripts/sdd check --task TSK-184`                                                                                            | SDD integrity                 |

- **Task-specific Completion additions:** TSK-181 and TSK-183 remain historical evidence; this task may be DONE only with shippable-root runtime proof, not direct-class tests.

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- production root → `bootstrap.control-plane.integration.test.ts` :: `real bootstrap constructs and drives every deterministic control-plane boundary`
- typed composition → `bootstrap.control-plane.integration.test.ts` :: `production adapters satisfy declared control-plane contracts and have one reachable instance`
- fail closed → `bootstrap.control-plane.integration.test.ts` :: `non pass review creates no publication package handoff or effect`
- restart → `full-flow.blackbox.test.ts` :: `production restart resumes durable task and receipt consumption without duplicate write`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-13, recovery

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/serve/__tests__/*.test.ts services/agent-inbox/__tests__/*.test.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Accepted: shippable bootstrap construction, fail-closed publication and durable restart are independent mandatory proofs.
- Accepted: production `effect_*` task resolution is repaired instead of hidden by the historical test-only registry.
- Accepted BDD review: missing, forged, stale, repair-exhausted, crash-after-ack and duplicate-runtime cases remain distinct because they guard different trust boundaries.
- Accepted BDD review: the public runtime construction trace and behavior test, not source grep, prove the legacy path unreachable.
- Rejected: direct construction of pipeline classes as evidence that production bootstrap uses them.
- Rejected: broad legacy deletion outside a proven consumer migration.
- Rejected: provider mutation in this ticket; exact-allowlist effect proof belongs to a later runtime task.
