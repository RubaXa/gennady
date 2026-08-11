# Task: TSK-178 — MR chat, artifact mutation and full/delta DEV handoff

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-178
- **Status:** [x] DONE
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
| P1  | refactor | —    | [x]    |
| P2  | test     | P1   | [x]    |

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

- [x] `2026-08-11T15:06:12Z` intro `ReviewHandoff` ← тип кандидата (clipboard-ready инструкция); требует spec entity inventory
- [x] `2026-08-11T15:06:12Z` intro `ReviewHandoffSnapshot` ← тип baseline (last acknowledged delivery)
- [x] `2026-08-11T15:06:12Z` intro `ReviewHandoffDelivery` ← тип события подтверждения доставки
- [x] `2026-08-11T15:06:12Z` intro `ReviewHandoffGenerator` ← сервис: compose full/delta + acknowledgeDelivery; baseline только после success receipt
- [x] `2026-08-11T15:06:12Z` decision compose-before-clipboard=true ← исправляет порядок: сначала compose+clipboard, потом server audit (failed clipboard не advance-ит baseline)
- [x] `2026-08-11T15:17:23Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-11T15:17:23Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-chat/review-handoff-generator.ts, services/agent-inbox/modules/inbox-dashboard/components/ActionPanel.tsx]; decisions: [ReviewHandoffGenerator=introduced, delivery-order=compose-then-clipboard-then-ack, ReactLocalComposer=removed]; open: []

#### P2

- [x] `2026-08-11T15:24:47Z` intro `review-chat.contract.test.ts` ← type exhaustiveness: все export-типы handoff/anchor/mutation проверены с @ts-expect-error на invalid variants
- [x] `2026-08-11T15:24:47Z` intro `review-handoff.test.ts` ← unit: compose() возвращает полный payload в full и delta режимах
- [x] `2026-08-11T15:24:47Z` intro `review-handoff.integration.test.ts` ← integration: все non-success receipts и конфликтные пути не advance-ят baseline
- [x] `2026-08-11T15:24:47Z` intro `review-anchor.test.ts` ← anchor: quote-first resolution переживает reorder ленты
- [x] `2026-08-11T15:35:00Z` tried `npm test -- services/agent-inbox/modules/inbox-chat/__tests__/` → ERR_MODULE_NOT_FOUND exit=1 (ESM/tsx лоадер не поддерживает директорный импорт; false positive, RUNBOOK §3)
- [x] `2026-08-11T15:35:00Z` insight §5 test command использует директорный путь → известный false positive с ESM/tsx лоадером; применён glob-эквивалент согласно RUNBOOK §3 → §5 Verification table
- [x] `2026-08-11T15:37:12Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-11T15:40:54Z` ver `npm test -- services/agent-inbox/modules/inbox-chat/__tests__/review-chat.contract.test.ts services/agent-inbox/modules/inbox-chat/__tests__/review-handoff.test.ts services/agent-inbox/modules/inbox-chat/__tests__/review-handoff.integration.test.ts services/agent-inbox/modules/inbox-chat/__tests__/review-anchor.test.ts` → pass exit=0
- [x] `2026-08-11T15:40:54Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-chat/__tests__/review-chat.contract.test.ts, services/agent-inbox/modules/inbox-chat/__tests__/review-handoff.test.ts, services/agent-inbox/modules/inbox-chat/__tests__/review-handoff.integration.test.ts, services/agent-inbox/modules/inbox-chat/__tests__/review-anchor.test.ts]; decisions: [test-command-form=explicit-file-paths (ESM/tsx directory quirk per RUNBOOK §3)]; open: []

#### Round close

- [x] `2026-08-11T15:42:05Z` sync agent-inbox+root
- [x] `2026-08-11T15:42:05Z` DONE
<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Clipboard side effect stays in dashboard; chat owns candidate generation and delivery acknowledgement only.
- BDD critic: merged empty/missing/delivery/mutation failure paths and full contract attribution; rejected browser-side assertions here and downloadable/inline task files.
