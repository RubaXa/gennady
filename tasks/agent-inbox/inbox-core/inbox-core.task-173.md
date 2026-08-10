# Task: TSK-173 — Canonical review state and accumulated change batches

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-173
- **Status:** [x] DONE
- **Reopens:** 1 (2026-08-10 — audit-r1: production backing, closed-world and coverage gaps)
- **Purpose:** Make journal-backed `ReviewState`, inclusive participation, lifecycle visibility and timer-driven `ReviewChangeBatch` canonical.
- **Scope:** agent-inbox
- **Module:** inbox-core
- **Dependencies:** TSK-172
- **Spec References:** [Inventory](../../../specs/agent-inbox/inbox-core/inbox-core.spec.md#3-entity-inventory-closed-world), [Contracts](../../../specs/agent-inbox/inbox-core/inbox-core.spec.md#5-module-contracts-dbc)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None
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

- **Objective:** Reuse journal/config/registry/boot code while adding versioned events, deterministic fold, participation/lifecycle and change-batch timers.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-core/`
  - `services/agent-inbox/modules/inbox-vcs/sync.ts`
  - `services/agent-inbox/serve/bootstrap.ts`
  - `services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts` — compatibility implementation
    of the extended `JournalPort` identity/health contract
- **Inputs:** TSK-172 handoff
- **Exit:** registry/projections are rebuildable; every MR event postpones quiet deadline; manual verify bypasses timers.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Cover event/version types, crash-tail recovery, lifecycle truth table, inclusive participation and controlled-clock debounce/quiet paths.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-core/__tests__/`
- **Inputs:** P1 handoff
- **Exit:** every inventory contract has a mapped contract test and all lifecycle/timer BDD cases pass.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** core contract shapes are exhaustive [`contract`]

- **Given** ReviewEvent, ReviewState, Participation, Lifecycle, ChangeBatch and port types
- **When** valid and invalid variants cross the boundary
- **Then** valid variants fold and unknown versions/kinds are rejected visibly

**Scenario:** every event accumulates and postpones quiet verification [`unit`]

- **Given** an open change batch and controlled clock
- **When** commits, description, approval and discussion events arrive
- **Then** all are retained and the quiet deadline follows the newest event

**Scenario:** any human reply uses debounce while manual verify is immediate [`unit`]

- **Given** a human reply and configured deadlines
- **When** time advances or operator verifies manually
- **Then** debounce/quiet rules are deterministic and manual verification is due immediately

**Scenario:** terminal inactive MR hides automatically [`unit`]

- **Given** tracked merged MR not completed and last activity older than three months
- **When** visibility is projected
- **Then** it is hidden while history remains recoverable

**Scenario:** lifecycle truth table and recovery are complete [`integration`]

- **Given** open/terminal × within/outside horizon × completed states, a torn journal tail and deleted caches
- **When** completion/new activity/restart occur
- **Then** open completion is rejected, a new event refreshes activity and clears terminal completion before restoring visibility, torn tail is discarded, durable failure is not acknowledged and rebuilt state is byte-equivalent
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Required by               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                | typescript-rules          |
| `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-core/__tests__/review-core.contract.test.ts services/agent-inbox/modules/inbox-core/__tests__/review-change-batch.test.ts services/agent-inbox/modules/inbox-core/__tests__/review-lifecycle.test.ts services/agent-inbox/modules/inbox-core/__tests__/review-core-recovery.integration.test.ts services/agent-inbox/modules/inbox-core/__tests__/review-runtime.integration.test.ts` | testing-common, node-test |

- **Task-specific Completion additions:** delete/rebuild registry and prove identical state.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- shapes [`contract-only`] → `review-core.contract.test.ts` :: `review core contracts reject unknown variants exhaustively`
- accumulation [`simulation-backed`, controlled clock] → `review-change-batch.test.ts` :: `every MR event accumulates and postpones quiet deadline`
- reply/manual [`simulation-backed`, controlled clock] → `review-change-batch.test.ts` :: `human reply debounces and manual verify is immediate`
- visibility [`simulation-backed`] → `review-lifecycle.test.ts` :: `inactive terminal MR hides while history remains`
- completed reactivation [`simulation-backed`] → `review-lifecycle.test.ts` :: `new event clears completedAt and returns both completed and horizon-hidden terminal MR`
- lifecycle/recovery [`simulation-backed`, real filesystem] → `review-core-recovery.integration.test.ts` :: `lifecycle truth table and crash cache recovery preserve canonical state`
- production backing [`integration`, real SystemClock] → `review-runtime.integration.test.ts` :: `real sync ingestion uses SystemClock and durably requests timer verification`
  <!--/SECTION:TEST_COVERAGE-->
  <!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-10, initial

#### P1

- [x] `2026-08-10T17:49:00Z` intro `ReviewEvent` ← versioned canonical journal fact with visible rejection of unknown versions and kinds
- [x] `2026-08-10T17:49:00Z` intro `ReviewState` ← deterministic per-MR fold whose snapshot is rebuildable from journal append order
- [x] `2026-08-10T17:49:00Z` intro `ReviewParticipation` ← inclusive participation signals with singular owned/review placement
- [x] `2026-08-10T17:49:00Z` intro `ReviewLifecycle` ← independent tracking, terminal completion, activity horizon and reactivation truth table
- [x] `2026-08-10T17:49:00Z` intro `ReviewChangeBatch` ← all-event accumulation with newest-event quiet deadline, reply debounce and manual bypass
- [x] `2026-08-10T17:49:00Z` intro `ReviewConfig` ← validated debounce, quiet and activity-horizon policy consumed by deterministic folds
- [x] `2026-08-10T17:49:00Z` intro `JournalPort` ← existing EventJournal contract extended with canonical append/replay instead of creating a second journal hierarchy
- [x] `2026-08-10T17:49:00Z` intro `ArtifactStorePort` ← addressed durable evidence boundary with local and deterministic in-memory adapters
- [x] `2026-08-10T17:49:00Z` intro `ClockPort` ← system and controlled time boundary for deterministic timer policy
- [x] `2026-08-10T17:49:00Z` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-10T17:49:00Z` DONE
      **Handoff →** artifacts: [`types/review-event.type.ts`, `review-config.ts`, `state/review-participation.ts`, `state/review-lifecycle.ts`, `state/review-change-batch.ts`, `state/review-state.ts`, `event-journal.ts`, `state-store.ts`, `ports/artifact-store.port.ts`, `ports/clock.port.ts`, `adapters/`]; decisions: [reuse `EventJournal`/`JournalPort` and `StateStore`; retain TSK-172 runtime-profile/readiness surfaces; canonical cache is key-sorted and disposable]; open: [none]

#### P2

- [x] `2026-08-10T17:41:00Z` ver targeted four-file command → `fail` exit=`1`: recovery test imported nonexistent `createTestTmpDir`; corrected to the existing isolated `makeTestTmpDir` helper
- [x] `2026-08-10T17:49:00Z` ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-core/__tests__/review-core.contract.test.ts services/agent-inbox/modules/inbox-core/__tests__/review-change-batch.test.ts services/agent-inbox/modules/inbox-core/__tests__/review-lifecycle.test.ts services/agent-inbox/modules/inbox-core/__tests__/review-core-recovery.integration.test.ts` → `pass` exit=`0`, tests=`6/6`
- [x] `2026-08-10T17:49:00Z` ver `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-core/event-journal.ts services/agent-inbox/modules/inbox-core/state-store.ts services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts services/agent-inbox/modules/inbox-core/review-config.ts services/agent-inbox/modules/inbox-core/types/review-event.type.ts services/agent-inbox/modules/inbox-core/state/review-participation.ts services/agent-inbox/modules/inbox-core/state/review-lifecycle.ts services/agent-inbox/modules/inbox-core/state/review-change-batch.ts services/agent-inbox/modules/inbox-core/state/review-state.ts services/agent-inbox/modules/inbox-core/ports/clock.port.ts services/agent-inbox/modules/inbox-core/ports/artifact-store.port.ts services/agent-inbox/modules/inbox-core/adapters/system-clock.ts services/agent-inbox/modules/inbox-core/adapters/controlled-clock.ts services/agent-inbox/modules/inbox-core/adapters/in-memory-artifact-store.ts services/agent-inbox/modules/inbox-core/adapters/local-artifact-store.ts services/agent-inbox/modules/inbox-core/adapters/in-memory-journal.ts services/agent-inbox/modules/inbox-core/__tests__/review-core.contract.test.ts services/agent-inbox/modules/inbox-core/__tests__/review-change-batch.test.ts services/agent-inbox/modules/inbox-core/__tests__/review-lifecycle.test.ts services/agent-inbox/modules/inbox-core/__tests__/review-core-recovery.integration.test.ts` → `pass` exit=`0`, errors=`0`
- [x] `2026-08-10T17:54:00Z` ver exact targeted rerun → `fail` exit=`1`: artifact-buffer prototype did not satisfy the exact `Uint8Array` port contract; normalized adapter reads to `Uint8Array`
- [x] `2026-08-10T18:00:00Z` ver final targeted rerun → `pass` exit=`0`, tests=`6/6`; `npm run type-check`, targeted DbC lint and `sdd-check` also passed
- [x] `2026-08-10T17:49:00Z` DONE
      **Handoff →** artifacts: [`review-core.contract.test.ts`, `review-change-batch.test.ts`, `review-lifecycle.test.ts`, `review-core-recovery.integration.test.ts`, `pipeline-runtime.ts` compatibility update]; decisions: [controlled clock proves debounce/quiet boundaries without sleeps; integration deletes and byte-compares rebuilt cache; durable journal failure is rejected and torn tail discarded]; open: [independent audit]

#### Round close

- [x] `2026-08-10T17:49:00Z` DONE

### Round 2 — 2026-08-10, audit reopen

#### P1

- [x] `2026-08-10T19:12:00Z` fix audit-r1 F-01/F-03: real `SyncService` ingestion now appends canonical observations, folds `ReviewState`, re-arms deadlines through production `SystemClock` and durably appends timer verification requests
- [x] `2026-08-10T19:17:00Z` intro `SystemClock` ← production wall-clock and cancellable verification timers
- [x] `2026-08-10T19:17:00Z` intro `ControlledClock` ← deterministic scheduling, cancellation and stable callback order
- [x] `2026-08-10T19:17:00Z` intro `InMemoryJournal` ← isolated canonical/compatibility journal adapter
- [x] `2026-08-10T19:17:00Z` intro `InMemoryArtifactStore` ← isolated exact-byte artifact adapter
- [x] `2026-08-10T19:17:00Z` intro `LocalArtifactStore` ← atomic profile-rooted durable artifact adapter
- [x] `2026-08-10T19:18:00Z` fix audit-r1 F-02/F-03: closed-world adapter inventory, config allowlists/change event, state summaries, lifecycle/batch emissions and port identity/health implemented
- [x] `2026-08-10T19:20:00Z` ver `npm run type-check` → `fail` exit=`2`: `VolatileJournal` lacked newly required identity/health; compatibility implementation added in declared `pipeline-runtime.ts` target
- [x] `2026-08-10T19:21:00Z` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-10T19:21:00Z` DONE
      **Handoff →** artifacts: [`services/agent-inbox/modules/inbox-core/`, `services/agent-inbox/modules/inbox-vcs/sync.ts`, `services/agent-inbox/serve/bootstrap.ts`, `services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts`, `specs/agent-inbox/inbox-core/inbox-core.spec.md`]; decisions: [canonical observations are deduplicated by observed aggregate; timer requests are journal facts and suppress duplicate scheduling until new activity]; open: [none]

#### P2

- [x] `2026-08-10T19:22:00Z` ver four-file targeted suite → `pass` exit=`0`, tests=`11/11`
- [x] `2026-08-10T19:22:00Z` ver `review-runtime.integration.test.ts` → `pass` exit=`0`, tests=`1/1`, real `SystemClock` path observed
- [x] `2026-08-10T19:23:00Z` ver targeted DbC lint → `fail` exit=`1`, errors=`13`: missing `@param`/`@returns` tags on new contracts; contracts completed
- [x] `2026-08-10T19:24:00Z` ver targeted DbC lint → `pass` exit=`0`, errors=`0`
- [x] `2026-08-10T19:24:00Z` ver all eight required `sdd-extract` anchors → `pass`, each exit=`0`; `sdd check --files` → `pass` exit=`0`, files=`23`; `check-blockers` → `CLEAR`
- [x] `2026-08-10T19:24:00Z` ver `sdd check --task TSK-173` → `fail` exit=`3`: expected temporary tracker mismatch while reopened ticket was `IN_PROGRESS` and tracker retained `DONE`
- [x] `2026-08-10T19:25:00Z` ver targeted Prettier write → `pass` exit=`0`, manifest=`23 TypeScript + spec + ticket + tracker`; subsequent check passed for TypeScript/spec/tracker and ticket anchors were restored at column zero after Markdown formatting
- [x] `2026-08-10T19:26:27Z` ver exact §5 five-file suite → `pass` exit=`0`, tests=`12/12`; `npm run type-check` → `pass` exit=`0`; targeted DbC lint → `pass` exit=`0`
- [x] `2026-08-10T19:27:21Z` ver final `sdd check --task TSK-173`, `sdd check --files`, `sdd-check`, `check-blockers` and `git diff --check` → `pass` exit=`0`, tracker=`DONE=DONE`, findings=`0`
- [x] `2026-08-10T19:27:21Z` DONE
      **Handoff →** artifacts: [`review-core.contract.test.ts`, `review-change-batch.test.ts`, `review-lifecycle.test.ts`, `review-core-recovery.integration.test.ts`, `review-runtime.integration.test.ts`]; decisions: [public transition/boundary/failure matrix covers config, state streams, lifecycle/batch emissions, clock cancellation, adapter health/failure and production SystemClock ingestion]; open: [none]

#### Round close

- [x] `2026-08-10T19:26:27Z` DONE
<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Reuse mapping: existing EventJournal/StateStore/BootReadiness are modified; duplicate VCS types are removed only after TSK-174.
- BDD critic: merged complete lifecycle/recovery and event-kind matrix requirements; rejected selective invalidation and GitLab DTO parsing in core.
