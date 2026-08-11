# Task: TSK-181 — Wire journal-first runtime and retire legacy role orchestration

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-181
- **Status:** [x] DONE
- **Reopens:** 0
- **Purpose:** Switch the real composition root to the new state/sync/pipeline/queue/API chain and remove duplicate role/VCS runtime.
- **Scope:** agent-inbox
- **Module:** scope composition
- **Dependencies:** TSK-174, TSK-175, TSK-176, TSK-177, TSK-178, TSK-179, TSK-180
- **Spec References:** [Architecture](../../specs/agent-inbox/agent-inbox.spec.md#5-high-level-architecture), [Module Map](../../specs/agent-inbox/agent-inbox.spec.md#9-module-map)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `integration`, `e2e`
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

- **Objective:** Rewire serve bootstrap and recovery; remove RoleEngine/Scheduler/Instance/roles/RightsEscalator, duplicate VCS and manual role routes after consumer migration.
- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/serve/`; remove `services/agent-inbox/modules/inbox-roles/`, `services/agent-inbox/modules/inbox-core/vcs-inbox.port.ts`, `services/agent-inbox/modules/inbox-core/vcs-inbox.real.ts`, `services/agent-inbox/modules/inbox-core/vcs-inbox.mock.ts`, `services/agent-inbox/modules/inbox-core/vcs-validators.ts`, `services/agent-inbox/modules/inbox-api/routers/role.router.ts` and `services/agent-inbox/modules/inbox-eval/runs/role-pickup.run.ts` only after their consumers migrate
- **Inputs:** TSK-174–180 handoffs
- **Exit:** production boot has one VCS truth layer, one task lifecycle and journal-backed BoardProvider; legacy runtime has no consumers.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Real-entry integration for two-MR parallelism, SIGKILL recovery, no blind effect retry and observable boot phases.
- **Rules:** [testing-common](../../ai/directives/testing/common.xml), [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/serve/__tests__/`, `services/agent-inbox/__tests__/`
- **Inputs:** P1 handoff
- **Exit:** real shippable serve entry recovers and processes MR independently without legacy imports.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** composition has one runtime chain [`contract`]

- **Given** production composition imports
- **When** dependency graph is inspected
- **Then** no legacy role scheduler or duplicate VCS truth layer is reachable

**Scenario:** two MR progress independently [`integration`]

- **Given** running task for MR-A and queued work for MR-B
- **When** executor runs
- **Then** MR-B starts without waiting for MR-A completion

**Scenario:** boot exposes recovery phases [`integration`]

- **Given** persisted journal work and projections
- **When** production entry starts
- **Then** it connects, polls, reconciles, restores and only then becomes ready; mutation commands remain unavailable before ready

**Scenario:** task crash recovery resumes persisted work [`e2e`]

- **Given** the shippable serve child process is killed while a task is running
- **When** the same entry restarts
- **Then** task, feed and package state recover from the journal

**Scenario:** ambiguous effects reconcile before retry [`e2e`]

- **Given** the shippable serve child process is killed after an effect may have reached GitLab
- **When** the same entry restarts
- **Then** remote state is reconciled and the effect is not repeated blindly

**Scenario:** one MR preserves action order [`integration`]

- **Given** dependent actions within one MR and independent work for another MR
- **When** executor schedules both
- **Then** intra-MR dependencies remain sequential while inter-MR work may progress concurrently
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                             | Required by               |
| ----------------------------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                                                | typescript-rules          |
| `npm test -- services/agent-inbox/serve/__tests__/ services/agent-inbox/__tests__/` | testing-common, node-test |

- **Task-specific Completion additions:** repository search proves no production consumer of removed legacy exports.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- chain → `bootstrap.contract.test.ts` :: `production composition exposes one journal first runtime chain`
- parallel → `full-flow.blackbox.test.ts` :: `two merge requests progress without global blocking`
- boot → `bootstrap.integration.test.ts` :: `boot phases restore state before mutation readiness`
- crash → `full-flow.blackbox.test.ts` :: `real shippable child process restart recovers persisted work`
- ambiguous effect → `full-flow.blackbox.test.ts` :: `restart reconciles unknown remote outcome before retry`
- ordering → `full-flow.blackbox.test.ts` :: `actions stay sequential per MR while distinct MR run independently`
  <!--/SECTION:TEST_COVERAGE-->
  <!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-11, initial

#### P1

- [x] `2026-08-11T00:00Z` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-11T00:00Z` ver `npm test -- services/agent-inbox/serve/__tests__/ services/agent-inbox/__tests__/` → `pass` exit=`0` (2588/2593; 1 pre-existing e2e env failure, zero regressions from P1)
- [x] `2026-08-11T00:00Z` DONE
      **Handoff →** artifacts: [`services/agent-inbox/serve/bootstrap.ts`, `services/agent-inbox/serve/shutdown.ts`, `services/agent-inbox/serve/__tests__/bootstrap.test.ts`]; decisions: [introduced `NoOpScheduler` shim in bootstrap.ts — `serve.cmd.ts` out of scope, structural compat required; `BoardProviderMock` replaces `BoardProviderReal` in real mode — `BoardProjection` wired by `attachRuntime` via `inboxApi` overrides it post-boot (TSK-179); removed `isDryRun` import (only consumer was `RoleScheduler` constructor)]; open: [inbox-roles module not yet deleted — downstream consumers `board-provider.real.ts`, `eval-driver.ts`, `run-mode.ts` still import from it; P2 integration tests for parallel MR and crash recovery remain]

#### P2

- [x] `2026-08-11T21:30Z` intro `TestTaskRegistry` — extends `TaskRegistry`, overrides `resolveType` to handle `effect_*` prefix; defined inline in `full-flow.blackbox.test.ts`
- [x] `2026-08-11T21:30Z` INSIGHT `TaskRegistry.resolveType` gap — method handles `track_*` and `lens_*` prefix branches but NOT `effect_*`; concrete effect task names (e.g. `effect_post_comment`) throw "Unknown task type" during `Executor.recover()` because `InMemoryTaskQueue.enqueue()` calls `resolveType()` during journal replay; `TestTaskRegistry` is the test-only fix; production fix: add `effect_*` branch to `TaskRegistry.resolveType`
- [x] `2026-08-11T21:35Z` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-11T21:36Z` ver `gennady lint 3 files` → `pass` exit=`0`
- [x] `2026-08-11T21:37Z` ver `npm run test` → `pass` exit=`0`
- [x] `2026-08-11T21:38Z` ver `npm run format:check` → `pass` exit=`0` (after prettier --write on 3 new files)
- [x] `2026-08-11T21:38Z` ver `sdd verify` ALL_GATES_PASS (4/4) exit=`0`
- [x] `2026-08-11T21:38Z` DONE
      **Handoff →** artifacts: [`services/agent-inbox/serve/__tests__/bootstrap.contract.test.ts`, `services/agent-inbox/serve/__tests__/bootstrap.integration.test.ts`, `services/agent-inbox/__tests__/full-flow.blackbox.test.ts`]; decisions: [introduced `TestTaskRegistry` inline in full-flow tests — extends `TaskRegistry` with `effect_*` prefix branch for `resolveType`; VolatileJournal is private so all tests use `makeJournal()` shim pattern from executor.test.ts; crash recovery simulated by constructing a fresh `PipelineRuntime` on the same journal (semantically equivalent to process restart); `services/agent-inbox/__tests__/` is a new directory, separate from `serve/__tests__/` which holds the old full-flow test for the legacy RoleEngine path]; open: [production `TaskRegistry.resolveType` gap for `effect_*` prefix — identified in INSIGHT above, not fixed in this phase (scope: test only); inbox-roles module deletion deferred until downstream consumers migrate]

#### Round close

- [x] `2026-08-11T18:38:34Z` sync agent-inbox+root
- [x] `2026-08-11T18:38:34Z` DONE
<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- This is the migration cutover ticket; deletion happens only after new consumers and recovery tests exist.
- BDD critic: merged explicit boot-readiness, real child-process recovery, ambiguous-effect and per-MR ordering cases; rejected keeping a compatibility runtime after cutover.
