# Task: TSK-175 — Agent runtime contracts, sessions and coverage traces

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-175
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Generalize the existing OpenCode boundary into `AgentRuntimePort` without replacing working session infrastructure.
- **Scope:** agent-inbox
- **Module:** inbox-opencode
- **Dependencies:** TSK-173
- **Spec References:** [Inventory](../../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md#3-entity-inventory-closed-world), [Contracts](../../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md#5-module-contracts-dbc)
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

- **Objective:** Adapt port/naming, pointer prompts, schema validation, semantic session routing, TTL recovery, outcome classification and tool trace attribution.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-opencode/`
- **Inputs:** TSK-173 handoff
- **Exit:** one runtime hierarchy and one shared session pool remain.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Contract tests for run/continue/failure, prompt pointers, schema mismatch, context routing, expiry and coverage trace absence.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-opencode/__tests__/`
- **Inputs:** P1 handoff
- **Exit:** real intercepted-network and deterministic adapters satisfy identical runtime contracts.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** agent runtime contracts are exhaustive [`contract`]

- **Given** session, outcome, schema and trace variants
- **When** boundary values are validated
- **Then** invalid variants and missing attribution are rejected

**Scenario:** continuation preserves producer context [`integration`]

- **Given** a coverage retry for a live producer task
- **When** it is routed
- **Then** the same session continues and tool trace accumulates

**Scenario:** widening uses independent context [`unit`]

- **Given** a widen/fact-check task
- **When** session policy is evaluated
- **Then** a new independent session is selected

**Scenario:** unavailable runtime is visible [`integration`]

- **Given** OpenCode cannot respond
- **When** a task runs
- **Then** the task fails visibly with retry metadata and no fabricated result

**Scenario:** prompt/schema/TTL boundary is strict [`integration`]

- **Given** stable paths/SHA/artifact addresses, invalid structured output and expired producer session
- **When** prompt runs or continuation is requested
- **Then** repository content is not copied inline, raw invalid output is retained for retry and expired context requires an explicit fresh run while operator sessions remain MR-isolated
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                              | Required by               |
| -------------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                                 | typescript-rules          |
| `npm test -- services/agent-inbox/modules/inbox-opencode/__tests__/` | testing-common, node-test |

- **Task-specific Completion additions:** prove no second session registry/pool is introduced.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- shapes → `agent-runtime.contract.test.ts` :: `agent runtime contracts require exhaustive outcomes and attribution`
- continuation → `session-routing.integration.test.ts` :: `coverage retry continues the producer session and trace`
- widen → `session-routing.test.ts` :: `widen and fact check select independent context`
- unavailable → `agent-runtime.integration.test.ts` :: `runtime failure is visible and never fabricates output`
- prompt/schema/TTL → `agent-runtime.integration.test.ts` :: `pointer prompt schema failure and session expiry preserve strict runtime boundaries`
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

- Existing session registry/pool/lifecycle are reuse targets; port generalization is an in-place migration.
- BDD critic: merged pointer/schema/TTL/operator-session cases and unit label; rejected a second runtime/session hierarchy.
