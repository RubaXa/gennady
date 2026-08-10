# Task: TSK-174 — Unified GitLab read, sync, effects and reconciliation

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-174
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Consolidate GitLab truth into one read/effect boundary with inclusive discovery, complete event ingestion and safe reconciliation.
- **Scope:** agent-inbox
- **Module:** inbox-vcs
- **Dependencies:** TSK-173
- **Spec References:** [Inventory](../../../specs/agent-inbox/inbox-vcs/inbox-vcs.spec.md#3-entity-inventory-closed-world), [Contracts](../../../specs/agent-inbox/inbox-vcs/inbox-vcs.spec.md#5-module-contracts-dbc)
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

- **Objective:** Merge current VCS implementations; implement sync coordinator, event normalizer, permission truth table, idempotent effects, capability probe and reconciliation.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-vcs/`, `services/agent-inbox/modules/inbox-core/vcs*`
- **Inputs:** TSK-173 handoff
- **Exit:** no parallel VCS source of truth remains; all effect kinds are capability/permission checked.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Port contracts and allowlisted GitLab integration for discovery, event coverage, resolve truth table, request-changes and ambiguous reconciliation.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-vcs/__tests__/`
- **Inputs:** P1 handoff
- **Exit:** real and mock adapters pass the same contract suite; real-effects targets are allowlisted.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** VCS ports and outcomes are exhaustive [`contract`]

- **Given** all read/effect/action/outcome variants
- **When** boundary types are validated
- **Then** every supported kind is handled and unknown kinds fail before I/O

**Scenario:** discovery includes every participation signal [`integration`]

- **Given** MRs where operator is author, reviewer, assignee, mentioned, commenter or approver
- **When** initial discovery runs
- **Then** every open MR is tracked once and inactive older MR is hidden

**Scenario:** resolve permission truth table is enforced [`contract`]

- **Given** operator, allowlisted bot and foreign threads across author/non-author MR
- **When** manual or automatic resolve is requested
- **Then** only the two permitted ownership cases execute

**Scenario:** ambiguous effect reconciles before retry [`integration`]

- **Given** transport loses an effect response
- **When** coordinator handles retry
- **Then** it reads GitLab first and never duplicates an observed effect

**Scenario:** request changes uses native capability only [`integration`]

- **Given** supported and unsupported GitLab hosts
- **When** package requests changes
- **Then** supported host reconciles native reviewer state and unsupported host creates no effect

**Scenario:** sync cursor never advances on incomplete observation [`integration`]

- **Given** partial snapshot, polling failure and recovery with commits/description/discussion/approval/pipeline events
- **When** sync normalizes observations
- **Then** partial data requests refresh, failed poll preserves cursor, effects postpone and recovered events append in order

**Scenario:** negative effect gates deny before I/O [`contract`]

- **Given** missing identity/ownership, automatic reopen, stale request-changes revision, missing permission/body or unsupported host
- **When** permission/capability gates evaluate
- **Then** action is denied or marked unavailable without external effect/outcome

**Scenario:** allowlisted real-adapter effect reconciles [`integration`]

- **Given** explicit allowlisted GitLab MR and stable effect id
- **When** one supported effect is executed through the real adapter
- **Then** a fresh GitLab read observes exactly one effect and records reconciliation evidence
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                         | Required by               |
| --------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                            | typescript-rules          |
| `npm test -- services/agent-inbox/modules/inbox-vcs/__tests__/` | testing-common, node-test |

- **Task-specific Completion additions:** live effects require explicit allowlisted MR evidence.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- shapes → `vcs-port.contract.test.ts` :: `VCS contracts handle every action and outcome exhaustively`
- participation → `vcs-sync.integration.test.ts` :: `discovery includes every explicit participation signal once`
- permissions → `vcs-permission.contract.test.ts` :: `resolve and reopen follow the ownership truth table`
- reconcile → `vcs-effects.integration.test.ts` :: `ambiguous effect reads GitLab before safe retry`
- request changes → `vcs-effects.integration.test.ts` :: `request changes probes native capability and never substitutes silently`
- sync cursor → `vcs-sync.integration.test.ts` :: `partial or failed sync preserves cursor and recovery appends every event in order`
- negative gates → `vcs-permission.contract.test.ts` :: `identity ownership automatic reopen and request changes negative gates deny before IO`
- real effect → `vcs-effects.real-integration.test.ts` :: `allowlisted real GitLab effect is observed exactly once after reconciliation`
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

- Consolidate current `VcsInbox*` and `VcsGitlabPort/Effects`; creation of a third adapter hierarchy is forbidden.
- BDD critic: merged sync/cursor, complete permission/request-changes negatives and allowlisted real-effect proof; rejected silent fallback and discovery-broadened targets.
