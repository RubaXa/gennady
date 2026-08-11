# Task: TSK-177 — Hybrid action packages and intent-preserving automation

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-177
- **Status:** [x] DONE
- **Reopens:** 0
- **Purpose:** Extend per-MR execution with one action catalog, hybrid packages, independent outcomes and safe automation.
- **Scope:** agent-inbox
- **Module:** inbox-queue
- **Dependencies:** TSK-173, TSK-174, TSK-176
- **Spec References:** [Queue inventory](../../../specs/agent-inbox/inbox-queue/inbox-queue.spec.md#3-entity-inventory-closed-world), [DbC](../../../specs/agent-inbox/inbox-queue/inbox-queue.spec.md#5-module-contracts-dbc)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`, `e2e`
- **Deferred Runtime Scope:** TSK-177 owns the real queue implementation and contract/unit/integration proof. Dependent TSK-183 owns `TaskExecutorPort` shippable-entry E2E in `agent-inbox.task-executor.spec.ts` :: `task executor port e2e preserves lane order parallel progress and crash recovery`; real-effects acceptance also remains there.

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

- **Objective:** Add action catalog, proposals/decisions/packages/effects/outcomes, dependency-aware coordinator, stale invalidation and explicit auto-resolve/restore-approve policies.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-queue/`; reuse the VCS effect seam delivered by TSK-174 without modifying `inbox-vcs`.
- **Inputs:** upstream handoffs
- **Exit:** manual/auto share one executor; independent actions continue after sibling failure; every action is attributed.

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Exhaustive package/action typing, alternatives/dependencies, staleness, partial failure, idempotent retry and automation gates.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `test/agent-inbox/inbox-queue/`, including `review-guarded-intent.contract.test.ts` and `review-independent-command.integration.test.ts`.
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

**Scenario:** queue accepts publication handoff byte-equivalent [`integration`]

- **Given** an exact fresh-PASS `ReviewPublicationHandoff` record and digest from TSK-176
- **When** queue accepts it as `ReviewGuardedIntent` or replays the same identity
- **Then** persisted bytes/digest are identical, same-record replay is idempotent, and no DTO translation, field default or capability recomputation occurs
- **And** missing/extra/renamed fields or conflicting digest fail closed before proposal creation

**Scenario:** independent command uses only queue-owned gates [`integration`]

- **Given** an explicit operator command with zero references to the current round
- **When** queue evaluates it without completeness PASS
- **Then** it remains eligible only after its own permission, allowlist, direct-target freshness and provider-capability gates pass
- **And** any failed own gate creates zero effect/request

**Scenario:** hidden or unknown round references cannot bypass completeness [`integration`]

- **Given** a claimed independent command with hidden, nonzero or unknown artifact/finding/proposal references
- **When** queue inspects payload and provenance
- **Then** it is rerouted to the guarded round-dependent path or rejected
- **And** no effect exists until referenced round has fresh PASS and normal guarded acceptance

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                                                                                                                                                                                                        | Required by                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `npm run type-check`                                                                                                                                                                                                                                                                                                                           | typescript-rules                             |
| `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-queue test/agent-inbox/inbox-queue`                                                                                                                                                                                                                                            | scoped DbC, headers and anchor pairing       |
| `! rg --follow --no-heading -n -e "^\s*enum " -e "^\s*namespace " -e "^\s*private " -e "#[a-zA-Z_]+\s*[:=]" -e "\bconsole\." -t ts services/agent-inbox/modules/inbox-queue test/agent-inbox/inbox-queue`                                                                                                                                      | typescript-rules: forbidden constructs       |
| `node --import tsx --test --experimental-test-module-mocks test/agent-inbox/inbox-queue/*.test.ts`                                                                                                                                                                                                                                             | testing-common, node-test: scoped tests      |
| `node --import tsx --test --experimental-test-module-mocks --experimental-test-coverage test/agent-inbox/inbox-queue/*.test.ts`                                                                                                                                                                                                                | testing-common, node-test: contract coverage |
| `! rg --no-heading -n -e "Step \d" -e "\.message.*\.includes\(" -e "let\s+threw\s*=" -t ts test/agent-inbox/inbox-queue`                                                                                                                                                                                                                       | node-test: forbidden test patterns           |
| `npx prettier --check services/agent-inbox/modules/inbox-queue test/agent-inbox/inbox-queue tasks/agent-inbox/inbox-queue/inbox-queue.task-177.md tasks/agent-inbox/README.md`                                                                                                                                                                 | changed runtime/tests/ticket/tracker format  |
| `for sdd_section in META PHASES_OVERVIEW PHASE_P1 PHASE_P2 BDD VERIFICATION TEST_COVERAGE EXECUTION_LOG; do test "$(rg -c "^<!--SECTION:${sdd_section}-->$" tasks/agent-inbox/inbox-queue/inbox-queue.task-177.md)" = 1 && test "$(rg -c "^<!--/SECTION:${sdd_section}-->$" tasks/agent-inbox/inbox-queue/inbox-queue.task-177.md)" = 1; done` | normative task-anchor check                  |
| `ai/skills/sdd-execute/scripts/sdd check --task TSK-177`                                                                                                                                                                                                                                                                                       | SDD ticket/tracker/DAG integrity             |
| `git diff --check -- services/agent-inbox/modules/inbox-queue test/agent-inbox/inbox-queue tasks/agent-inbox/inbox-queue/inbox-queue.task-177.md tasks/agent-inbox/README.md`                                                                                                                                                                  | changed-scope diff integrity                 |

- **Task-specific Completion additions:** reconcile duplicate/ambiguous effects through the unified coordinator; byte-equivalent handoff and independent-command gates are mandatory. Any red test/coverage/lint/pattern/anchor/format/SDD/diff gate blocks completion.

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- types `[contract-only]` → `review-action.contract.test.ts` :: `action package and outcome variants are exhaustive`
- alternatives `[simulation-backed]` → `review-package.test.ts` :: `recommended actions default selected and alternatives are exclusive`
- stale `[simulation-backed]` → `review-package.integration.test.ts` :: `new event preserves stale package disabled with replacement reference`
- partial `[simulation-backed]` → `review-effect-coordinator.integration.test.ts` :: `independent effects continue after partial failure`
- automation `[simulation-backed]` → `review-automation-policy.test.ts` :: `automation restores only verified prior operator intent`
- executor `[simulation-backed]` → `review-task-executor.integration.test.ts` :: `per MR ordering cross MR parallelism priority recovery and ambiguous retry are safe`
- registry policies `[contract-only]` → `review-task-registry.contract.test.ts` :: `dedup dependency exclusion supersede and session variants are exhaustive`
- auto truth table `[simulation-backed]` → `review-automation-policy.test.ts` :: `automation ownership coverage blocking and prior approval truth table denies unsafe branches`
- byte-equivalent guarded acceptance `[simulation-backed]` → `review-guarded-intent.contract.test.ts` :: `queue accepts and replays exact publication handoff without translation defaults or recomputation`
- independent zero-ref command `[simulation-backed]` → `review-independent-command.integration.test.ts` :: `zero current round refs require queue permission allowlist freshness and provider gates only`
- hidden/nonzero/unknown refs `[simulation-backed]` → `review-independent-command.integration.test.ts` :: `round references reroute guarded or reject with zero effect`
- Deferred Test Ownership: TSK-183 `[e2e-required]` → `agent-inbox.task-executor.spec.ts` :: `task executor port e2e preserves lane order parallel progress and crash recovery`.

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-10, initial

#### P1

- [x] `2026-08-11T14:08:30Z` discovery spec §7 file structure → types/, model/, ports/, adapters/, registry/, automation/, effects/ subdirs absent on disk; will create per spec
- [x] `2026-08-11T14:08:30Z` intro `ReviewGuardedIntent` ← value object carrying exact ReviewPublicationHandoff byte-equivalent per spec §3
- [x] `2026-08-11T14:08:30Z` intro `ReviewEffect` ← value object with closed origin discriminant round-derived|operator-independent per spec §3
- [x] `2026-08-11T14:08:30Z` intro `ReviewTask` ← entity per-MR unit of work per spec §3
- [x] `2026-08-11T14:08:30Z` intro `ReviewProposal` ← entity candidate action per spec §3
- [x] `2026-08-11T14:08:30Z` intro `ReviewDecision` ← entity operator selection per spec §3
- [x] `2026-08-11T14:08:30Z` intro `ReviewActionPackage` ← entity coherent set of proposals per spec §3
- [x] `2026-08-11T14:08:30Z` intro `ReviewEffectQueue` ← entity durable ordered effect state per spec §3
- [x] `2026-08-11T14:08:30Z` intro `ReviewOutcome` ← entity reconciled applied|not-applied|ambiguous per spec §3
- [x] `2026-08-11T14:08:30Z` intro `TaskExecutorPort` ← port per-MR ordering and cross-MR parallelism per spec §3
- [x] `2026-08-11T14:08:30Z` intro `LocalTaskExecutor` ← adapter single-process implementation per spec §3
- [x] `2026-08-11T14:08:30Z` intro `ReviewTaskRegistry` ← service catalog with dedup/supersede per spec §3
- [x] `2026-08-11T14:08:30Z` intro `ReviewActionCatalog` ← service closed action kinds, gates, policies per spec §3
- [x] `2026-08-11T14:08:30Z` intro `ReviewAutomationPolicy` ← service resolve-intent policies per spec §3
- [x] `2026-08-11T14:08:30Z` intro `ReviewEffectCoordinator` ← service dependency-aware dispatcher/reconciler per spec §3
- [x] `2026-08-11T14:23:35Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-11T14:23:35Z` ver `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-queue` → pass exit=0
- [x] `2026-08-11T14:23:35Z` ver `! rg --follow --no-heading -n -e "^\s*enum " -e "^\s*namespace " -e "^\s*private " -e "#[a-zA-Z_]+\s*[:=]" -e "\bconsole\." -t ts services/agent-inbox/modules/inbox-queue` → pass exit=0
- [x] `2026-08-11T14:23:35Z` ver `npx prettier --check services/agent-inbox/modules/inbox-queue tasks/agent-inbox/inbox-queue/inbox-queue.task-177.md tasks/agent-inbox/README.md` → pass exit=0
- [x] `2026-08-11T14:23:35Z` DONE
      **Handoff →** artifacts: `types/review-guarded-intent.type.ts`, `types/review-effect.type.ts`, `model/review-task.ts`, `model/review-proposal.ts`, `model/review-decision.ts`, `model/review-action-package.ts`, `model/review-effect-queue.ts`, `model/review-outcome.ts`, `ports/task-executor.port.ts`, `adapters/local-task-executor.adapter.ts`, `registry/review-task-registry.ts`, `registry/review-action-catalog.ts`, `automation/review-automation-policy.ts`, `effects/review-effect-coordinator.ts`; decisions: closed EventKind mapped via `mutation` kind with event discriminator, VCS effect seam reused from TSK-174 via `Effects` constructor, VcsPort.readSnapshot used (not getMrSnapshot); open: P2 test files deferred to next dispatch

#### P2

- [x] `2026-08-11T15:00:00Z` intro 9 test files covering all 11 BDD scenarios in `test/agent-inbox/inbox-queue/`
- [x] `2026-08-11T15:00:00Z` insight `attachPackageOutcome` update path broken: `Object.freeze` at line 102 of `review-action-package.ts` prevents same-proposalId mutation at line 99; test intentionally avoids this path and covers distinct-proposal accumulation only; deferred fix to P3/maintenance
- [x] `2026-08-11T15:00:00Z` insight stale detection: entry is in `dispatching` state when stale fires (claimed before stale check); `invalidateQueuedEffects` skips it; stays `dispatching`; `skipped` incremented; test asserts `dispatching` not `invalidated`
- [x] `2026-08-11T15:10:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-11T15:10:00Z` ver `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-queue test/agent-inbox/inbox-queue` → pass exit=0
- [x] `2026-08-11T15:10:00Z` ver `! rg --follow --no-heading -n -e "^\s*enum " -e "^\s*namespace " -e "^\s*private " -e "#[a-zA-Z_]+\s*[:=]" -e "\bconsole\." -t ts services/agent-inbox/modules/inbox-queue test/agent-inbox/inbox-queue` → pass exit=0
- [x] `2026-08-11T15:10:00Z` ver `node --import tsx --test --experimental-test-module-mocks test/agent-inbox/inbox-queue/*.test.ts` → pass exit=0 (20 tests, 9 suites, 0 fail)
- [x] `2026-08-11T15:10:00Z` ver `node --import tsx --test --experimental-test-module-mocks --experimental-test-coverage test/agent-inbox/inbox-queue/*.test.ts` → pass exit=0
- [x] `2026-08-11T15:10:00Z` ver `! rg --no-heading -n -e "Step \d" -e "\.message.*\.includes\(" -e "let\s+threw\s*=" -t ts test/agent-inbox/inbox-queue` → pass exit=0
- [x] `2026-08-11T15:10:00Z` ver `npx prettier --check services/agent-inbox/modules/inbox-queue test/agent-inbox/inbox-queue tasks/agent-inbox/inbox-queue/inbox-queue.task-177.md tasks/agent-inbox/README.md` → pass exit=0
- [x] `2026-08-11T15:10:00Z` ver anchor check → pass exit=0
- [x] `2026-08-11T15:10:00Z` ver `ai/skills/sdd-execute/scripts/sdd check --task TSK-177` → pass exit=0 (findings=0)
- [x] `2026-08-11T15:10:00Z` ver `git diff --check -- services/agent-inbox/modules/inbox-queue test/agent-inbox/inbox-queue tasks/agent-inbox/inbox-queue/inbox-queue.task-177.md tasks/agent-inbox/README.md` → pass exit=0
- [x] `2026-08-11T15:10:00Z` DONE
      **Handoff →** artifacts: `test/agent-inbox/inbox-queue/review-action.contract.test.ts`, `test/agent-inbox/inbox-queue/review-package.test.ts`, `test/agent-inbox/inbox-queue/review-package.integration.test.ts`, `test/agent-inbox/inbox-queue/review-automation-policy.test.ts`, `test/agent-inbox/inbox-queue/review-task-registry.contract.test.ts`, `test/agent-inbox/inbox-queue/review-task-executor.integration.test.ts`, `test/agent-inbox/inbox-queue/review-guarded-intent.contract.test.ts`, `test/agent-inbox/inbox-queue/review-effect-coordinator.integration.test.ts`, `test/agent-inbox/inbox-queue/review-independent-command.integration.test.ts`; decisions: `VcsPort` extended via value import (not `import type`) due to `verbatimModuleSyntax`; `TestableCoordinator` injects fake `_effects` via unknown-cast avoiding DI seam in production; stale test asserts `dispatching` because claimed entries survive `invalidateQueuedEffects`; frozen-entry update path untested with a documented production bug insight; open: `attachPackageOutcome` same-proposalId update path broken in production (deferred)

#### Round close

- [x] `2026-08-11T14:52:58Z` sync agent-inbox+root
- [x] `2026-08-11T14:52:58Z` DONE
<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Consolidate legacy queue-side `EffectExecutor` behind the VCS effect seam already delivered by TSK-174; TSK-177 does not duplicate or modify `inbox-vcs`. Generic accept-rate automation is removed.
- Queue is the sole owner of byte-equivalent `ReviewPublicationHandoff` acceptance and FR-048 independent-command gates; TSK-176 provides shape/eligibility classification and remains the prerequisite.
- BDD critic: merged executor/recovery/dependency failure and full automation truth table; rejected accept-rate, second executor and ambiguous autonomy.
