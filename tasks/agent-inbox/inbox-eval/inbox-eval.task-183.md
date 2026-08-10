# Task: TSK-183 — Adaptive real validation and product acceptance

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-183
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Deliver deterministic, real-readonly and allowlisted real-effects validation with evidence-backed statuses.
- **Scope:** agent-inbox
- **Module:** inbox-eval
- **Dependencies:** TSK-174, TSK-176, TSK-177, TSK-179, TSK-180, TSK-181, TSK-182
- **Spec References:** [Eval inventory](../../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md#3-entity-inventory-closed-world), [DbC](../../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md#5-module-contracts-dbc), [Root acceptance](../../../specs/agent-inbox/agent-inbox.spec.md#acceptance-after-downstream-regeneration)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `integration`, `e2e`
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

- **Objective:** Extend harness with explicit MR pool, probes, statuses/reports, saved-run reopen, port contract kit and isolated readonly/effects profiles.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-eval/`, `services/agent-inbox/serve/run-mode.ts`
- **Inputs:** completed product modules
- **Exit:** every required scenario declares observable preconditions and evidence; all-skipped cannot pass.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Execute deterministic full matrix, real-readonly adaptive pool and allowlisted real-effects closed-loop acceptance including visual proof.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml), [playwright-cli](../../../ai/directives/testing/playwright-cli.xml), [playwright-e2e](../../../ai/directives/testing/playwright-e2e.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-eval/__tests__/`, `e2e/inbox-serve/`
- **Inputs:** P1 handoff
- **Exit:** reports preserve honest non-green results, but this task cannot be DONE until mandatory root acceptance 1–7 all have PASS evidence.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** eval status/report/profile types are exhaustive [`contract`]

- **Given** PASS/FAIL/SKIP/INCONCLUSIVE and every allowed profile
- **When** report types aggregate
- **Then** invalid combinations fail and all-skipped verdict is non-PASS

**Scenario:** real readonly adapts honestly [`integration`]

- **Given** explicit live MR pool with mixed prerequisites
- **When** probes and scenarios run
- **Then** runnable branches assert normally and impossible/unstable branches explain SKIP/INCONCLUSIVE

**Scenario:** saved runs reopen without mutation [`integration`]

- **Given** a completed report with its declared MR pool and profile
- **When** the saved run is reopened
- **Then** evidence is reproduced read-only without discovering new targets or broadening the pool

**Scenario:** real effects cannot broaden target [`e2e`]

- **Given** allowlisted and discovered non-allowlisted MR
- **When** effects scenario runs
- **Then** only allowlisted target mutates and report records reconciliation evidence

**Scenario:** full operator flow passes without GitLab UI [`e2e`]

- **Given** rebuilt production dashboard and real allowlisted MR
- **When** review, package apply, handoff, delta verification and completion flow execute
- **Then** root acceptance has artifacts, GitLab outcomes and per-step screenshots

**Scenario:** deterministic matrix proves every port contract [`contract`]

- **Given** the full profile combination matrix and shared contract kit for every variable port
- **When** deterministic evaluation runs
- **Then** every allowed combination and port contract has evidence and every forbidden combination fails before adapters start
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                          | Required by                    |
| ---------------------------------------------------------------- | ------------------------------ |
| `npm run type-check`                                             | typescript-rules               |
| `npm test -- services/agent-inbox/modules/inbox-eval/__tests__/` | testing-common, node-test      |
| `npm run inbox-serve:build && npm run test:e2e:prod`             | playwright-cli, playwright-e2e |

- **Task-specific Completion additions:** all seven mandatory root acceptance clauses are PASS; any FAIL/SKIP/INCONCLUSIVE leaves the task TODO or BLOCKED with evidence.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- types → `review-eval.contract.test.ts` :: `eval statuses reports and profiles are exhaustive and all skipped is not pass`
- readonly → `review-eval.real-readonly.test.ts` :: `real readonly probes explain pass fail skip and inconclusive honestly`
- saved run → `review-eval.saved-run.test.ts` :: `reopen reproduces declared evidence without mutation or target discovery`
- effects → `review-eval.real-effects.test.ts` :: `real effects mutate only explicit allowlisted MR and reconcile outcomes`
- flow → `agent-inbox.closed-loop.spec.ts` :: `operator completes review action handoff verification and lifecycle without GitLab UI`
- matrix/contracts → `review-eval.contract.test.ts` :: `all profile combinations and variable port contracts are covered deterministically`
- acceptance 1 / closed loop → `agent-inbox.closed-loop.spec.ts` :: `real allowlisted MR is operated without GitLab UI`
- acceptance 2 / concurrency and recovery → producer `TSK-181 full-flow.blackbox.test.ts`; aggregator `review-eval.acceptance-report.test.ts` :: `two MR progress independently and recover after termination`
- acceptance 3 / coverage and safe automation → producers `TSK-176 review-coverage.integration.test.ts` and `TSK-177 review-automation-policy.test.ts`; aggregator `review-eval.acceptance-report.test.ts` :: `coverage blocks approve and verified fixes obey resolve and prior-approve gates`
- acceptance 4 / partial effects → producers `TSK-177 review-effect-coordinator.integration.test.ts` and `TSK-174 vcs-effects.real-integration.test.ts`; aggregator `review-eval.acceptance-report.test.ts` :: `real hybrid effects record failure independent continuation reconciliation and safe retry`
- acceptance 5 / handoff and delta → `agent-inbox.closed-loop.spec.ts` :: `full and delta clipboard handoff preserve baselines and manual verification`
- acceptance 6 / adaptive validation → `review-eval.acceptance-report.test.ts` :: `mock matrix and adaptive real results expose preconditions and never pass all-skipped`
- acceptance 7 / visual proof → `agent-inbox.closed-loop.spec.ts` :: `each key step stores a screenshot address from rebuilt production dashboard real GitLab and real local state`
  <!--/SECTION:TEST_COVERAGE-->
  <!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-10, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- services/agent-inbox/modules/inbox-eval/__tests__/` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` ver `npm run inbox-serve:build && npm run test:e2e:prod` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Adaptive means evidence-aware result classification, never weaker assertions.
- BDD critic: merged status matrix, saved-run immutability, allowlist-before-adapter, full profile/port matrix and named acceptance evidence; rejected discovery-driven mutation scope and an all-skipped green verdict.
