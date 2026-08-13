# Task: TSK-186 — Bind eval to production and prove one real walking skeleton

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-186
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Evaluate the same production runtime and prove one real MR closed loop with exact allowlisting and crash-safe reconciliation.
- **Scope:** agent-inbox
- **Module:** inbox-eval
- **Dependencies:** TSK-184, TSK-185
- **Spec References:** [Eval spec](../../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md), [Root acceptance](../../../specs/agent-inbox/agent-inbox.spec.md#acceptance-after-downstream-regeneration)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`, `e2e`
- **Deferred Runtime Scope:** A real effect runs only after the operator supplies an exact host/project/MR/SHA/effect allowlist.

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind     | Deps | Status |
| --- | -------- | ---- | ------ |
| P1  | refactor | —    | [ ]    |
| P2  | e2e      | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — refactor

- **Objective:** Remove legacy `RoleEngine` eval execution and bind probes/reports to the production composition root and product journals.
- **Target Files:** `services/agent-inbox/modules/inbox-eval/`, production test harness seams.
- **Exit:** eval cannot construct an alternate review pipeline and all PASS evidence references product-written artifacts.

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — e2e

- **Objective:** Drive a real readonly review and one separately authorized effect through discovery, review contract, trusted receipts, repair, package, selected actions, handoff, delta verify and reconciliation.
- **Target Files:** `e2e/inbox-serve/`, `services/agent-inbox/modules/inbox-eval/__tests__/`.
- **Exit:** walking skeleton has real MR IDs, product artifacts and exact pre/post/restart evidence.

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** eval uses the production root [`integration`]

- **Given** an eval profile
- **When** a run starts
- **Then** it calls the same bootstrap/runtime/API as the local product and cannot import or instantiate `RoleEngine`

**Scenario:** readonly walking skeleton produces trusted review [`e2e`]

- **Given** an explicit current real MR
- **When** full review runs
- **Then** product artifacts contain complete fixed sections, entities, files, six lenses, three typed diagrams, trusted receipts, cross-review and fresh structural PASS

**Scenario:** selected actions are exact [`e2e`]

- **Given** a default-checked editable package
- **When** the operator deselects actions and applies the rest
- **Then** only selected actions enter the ledger and unsupported/unauthorized actions produce zero provider writes

**Scenario:** allowlisted effect reconciles once [`e2e`]

- **Given** an exact effect allowlist and captured head SHA
- **When** one effect is dispatched and the process restarts at the ambiguous boundary
- **Then** pre/post GitLab reads and product journal converge to applied/not-applied/ambiguous with no blind duplicate write

**Scenario:** delta verification follows every MR mutation [`e2e`]

- **Given** accumulated MR changes or any human reply
- **When** debounce expires or operator clicks Verify
- **Then** the timer is reset by every MR mutation and the resulting delta or full fallback prepares a new editable package without unauthorized posting

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                        | Required by           |
| -------------------------------------------------------------- | --------------------- |
| `npm run type-check`                                           | TypeScript contracts  |
| `! rg -n "RoleEngine" services/agent-inbox/modules/inbox-eval` | same production root  |
| `npm run inbox-serve:build && npm run test:e2e:review-flow`    | real walking skeleton |
| `ai/skills/sdd-execute/scripts/sdd check --task TSK-186`       | SDD integrity         |

- **Task-specific Completion additions:** readonly proof is mandatory; effect proof is BLOCKED until an exact operator allowlist exists and may never broaden target or effect kind.

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- same root → `review-eval-production-root.integration.test.ts` :: `eval invokes production composition and product journals without legacy role engine`
- review → `agent-inbox.real-walking-skeleton.spec.ts` :: `real MR review reaches fresh complete structural pass with trusted artifacts`
- actions → same spec :: `operator deselection controls exact effect ledger`
- effect/restart → same spec :: `one exact allowlisted write reconciles after restart without duplicate`
- delta → same spec :: `MR mutations debounce and manual verify produce delta or full fallback package`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-13, recovery

#### P1

- [ ] `<ts>` ver `production-root eval gates` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `real walking-skeleton gates` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->
