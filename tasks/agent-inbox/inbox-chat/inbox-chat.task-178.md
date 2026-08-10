# Task: TSK-178 — MR chat, artifact mutation and full/delta DEV handoff

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-178
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Preserve anchored MR chat and add acknowledged clipboard handoff with correct full/delta baselines.
- **Scope:** agent-inbox
- **Module:** inbox-chat
- **Dependencies:** TSK-173, TSK-175, TSK-176, TSK-177
- **Spec References:** [Chat inventory](../../../specs/agent-inbox/inbox-chat/inbox-chat.spec.md#3-entity-inventory-closed-world), [Handoff DbC](../../../specs/agent-inbox/inbox-chat/inbox-chat.spec.md#5-module-contracts-dbc)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** browser clipboard write owned by TSK-182
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

- **Objective:** Keep transcript/anchors/mutations; extract fix-task composition into full/delta generator, immutable candidate and delivery acknowledgement baseline.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-chat/`, `services/agent-inbox/modules/inbox-dashboard/components/ActionPanel.tsx`
- **Inputs:** upstream handoffs
- **Exit:** any MR can generate SHA/goal/findings/artifact pointers/criteria; generation alone never advances baseline.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Contract tests for anchors/mutations/handoff payload, group findings, empty delta, missing artifact, failed delivery and successful acknowledgement.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-chat/__tests__/`
- **Inputs:** P1 handoff
- **Exit:** all baseline transitions and anchor persistence scenarios pass.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** chat/handoff types are exhaustive [`contract`]

- **Given** all anchor, mutation, candidate, delivery and snapshot variants
- **When** boundary values are checked
- **Then** missing SHA/provenance/pointers are rejected

**Scenario:** handoff includes complete required instruction [`unit`]

- **Given** selected finding group and current artifacts
- **When** full or delta handoff is generated
- **Then** SHA, goal, findings, changed fragments, paths/anchors and verification criteria are present

**Scenario:** failed copy does not consume delta [`integration`]

- **Given** generated candidate and failed browser receipt
- **When** another delta is generated
- **Then** prior delivered baseline remains and no facts disappear

**Scenario:** delivery and artifact failures are safe [`integration`]

- **Given** empty delta, missing required artifact, success/duplicate/stale/wrong-MR receipt and conflicting artifact revision
- **When** handoff delivery or mutation executes
- **Then** empty delta is explicit, missing artifact blocks generation, success advances once, invalid receipts are rejected, conflict preserves current revision and undo remains available

**Scenario:** artifact anchor survives feed reorder [`unit`]

- **Given** widget/fragment/artifact anchor
- **When** feed ordering changes
- **Then** chat resolves the same artifact fragment
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                          | Required by               |
| ---------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                             | typescript-rules          |
| `npm test -- services/agent-inbox/modules/inbox-chat/__tests__/` | testing-common, node-test |

- **Task-specific Completion additions:** old React-local composer has no remaining business ownership.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- types → `review-chat.contract.test.ts` :: `chat handoff and mutation contracts are exhaustive`
- payload → `review-handoff.test.ts` :: `full and delta handoffs include every required instruction field`
- receipt → `review-handoff.integration.test.ts` :: `failed clipboard receipt never advances delivered baseline`
- delivery/mutation → `review-handoff.integration.test.ts` :: `empty missing duplicate stale wrong MR and mutation conflict paths preserve baseline and artifact revision`
- anchor → `review-anchor.test.ts` :: `artifact anchor survives feed reorder`
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

- Clipboard side effect stays in dashboard; chat owns candidate generation and delivery acknowledgement only.
- BDD critic: merged empty/missing/delivery/mutation failure paths and full contract attribution; rejected browser-side assertions here and downloadable/inline task files.
