# Task: TSK-180 — Deterministic isolated mock runtime and port contract kit

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-180
- **Status:** [x] DONE
- **Reopens:** 0
- **Purpose:** Expand existing factories into strict adapters/scenarios for every variable port and failure branch.
- **Scope:** agent-inbox
- **Module:** inbox-mocks
- **Dependencies:** TSK-173, TSK-174, TSK-175, TSK-177, TSK-179
- **Spec References:** [Mocks inventory](../../../specs/agent-inbox/inbox-mocks/inbox-mocks.spec.md#3-entity-inventory-closed-world), [Runtime contract](../../../specs/agent-inbox/inbox-mocks/inbox-mocks.spec.md#5-module-contracts-dbc)
- **Runtime Backing:** `simulation`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None
  <!--/SECTION:META-->
  <!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Implement strict ReviewScenario, mock VCS/agent/journal/artifact/clock/executor/profile/projection adapters and run-id reset.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-mocks/`, `services/agent-inbox/test/`
- **Inputs:** upstream port contracts
- **Exit:** unspecified calls fail; no network/production fallback; controlled time drives all timers.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Run every shared port contract twice and mandatory capability matrix including partial/ambiguous failure, approval reset and crash recovery.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-mocks/__tests__/`, `services/agent-inbox/test/__tests__/`
- **Inputs:** P1 handoff
- **Exit:** identical scenario input/time yields byte-equivalent journal and projections.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** mock adapter contracts are exhaustive [`contract`]

- **Given** every production port contract
- **When** mock adapters run the shared suite
- **Then** shapes/errors/outcomes match and unknown calls fail

**Scenario:** scenario is deterministic [`integration`]

- **Given** identical events, agent results and controlled clock
- **When** two isolated runs execute
- **Then** journals, tasks, packages and projections are identical

**Scenario:** capability matrix covers recovery [`unit`]

- **Given** every effect, partial/ambiguous failure, approval reset and crash point
- **When** scenarios execute
- **Then** every branch has an explicit observation and no skipped default

**Scenario:** isolated run cannot escape its boundary [`integration`]

- **Given** a simulation run-id and attempts to reset a foreign run-id or reach production network/filesystem
- **When** the mock runtime executes them
- **Then** every attempt is physically denied and production state remains unchanged

**Scenario:** controlled time drives scheduling [`unit`]

- **Given** event debounce and quiet-timeout scenarios
- **When** the controlled clock advances across their boundaries
- **Then** scheduling is deterministic and no wall-clock sleep is used

**Scenario:** crash and ambiguous effects remain distinct [`integration`]

- **Given** one crash before persistence and one effect with unknown remote outcome
- **When** recovery runs
- **Then** persisted work resumes while the ambiguous effect is reconciled before any retry
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                | Required by               |
| ------------------------------------------------------------------------------------------------------ | ------------------------- |
| `npm run type-check`                                                                                   | typescript-rules          |
| `npm test -- services/agent-inbox/modules/inbox-mocks/__tests__/ services/agent-inbox/test/__tests__/` | testing-common, node-test |

- **Task-specific Completion additions:** prove network and production paths are unreachable.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- contracts → `mock-port.contract.test.ts` :: `all mock adapters satisfy shared port contracts exhaustively`
- deterministic → `review-scenario.integration.test.ts` :: `same scenario and time produce identical journal and projections`
- matrix → `review-scenario.test.ts` :: `mandatory failure reset effect and recovery matrix has no uncovered branch`
- isolation → `review-scenario.integration.test.ts` :: `foreign reset network and production filesystem access are denied`
- clock → `review-scenario.test.ts` :: `controlled clock drives debounce and quiet timeout without sleeping`
- recovery → `review-scenario.integration.test.ts` :: `crash recovery and ambiguous effect reconciliation follow distinct paths`
- VCS read/effect, agent, journal, artifact, clock, executor, profile and projection ports → `mock-port.contract.test.ts` :: one named shared contract suite per port
  <!--/SECTION:TEST_COVERAGE-->
  <!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-10, initial

#### P1

- [x] `2026-08-11T16:48:26Z` intro `InMemoryJournalAdapter` ← реализация JournalPort без filesystem для изолированных тестов
- [x] `2026-08-11T16:48:26Z` intro `InMemoryArtifactAdapter` ← реализация ArtifactStorePort в памяти без filesystem
- [x] `2026-08-11T16:48:26Z` intro `ControlledClockAdapter` ← re-export ControlledClock под каноническим именем из spec
- [x] `2026-08-11T16:48:26Z` intro `MockVcsAdapter` ← scripted VcsPort с записью effect-вызовов и падением на unseeded reads
- [x] `2026-08-11T16:48:26Z` intro `MockAgentAdapter` ← scripted AgentRuntimePort с FIFO-очередью ответов на prompt
- [x] `2026-08-11T16:48:26Z` intro `DeterministicTaskExecutor` ← TaskExecutorPort в памяти с FIFO-порядком и journal-бэкингом
- [x] `2026-08-11T16:48:26Z` intro `MockRuntimeProfile` ← RuntimeProfilePort без filesystem, с защитой чужого run-id
- [x] `2026-08-11T16:48:26Z` intro `InMemoryProjectionAdapter` ← seeded ProjectionPort для сценарных тестов
- [x] `2026-08-11T16:48:26Z` intro `ReviewScenario` ← неизменяемое определение сценария; fresh runtime per test через start()
- [x] `2026-08-11T16:48:26Z` intro `composePortContractSuites` (test/) ← фабрики адаптеров для P2-контрактных тестов
- [x] `2026-08-11T17:12:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-11T17:12:00Z` ver `gennady lint 11 files` → pass exit=0
- [x] `2026-08-11T17:12:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-08-11T17:12:00Z` ver `npm test (target files: 19 tests)` → pass exit=0
- [x] `2026-08-11T17:12:00Z` DONE
      **Handoff →** artifacts: [adapters/in-memory-journal.adapter.ts, adapters/in-memory-artifact.adapter.ts, adapters/controlled-clock.adapter.ts, adapters/mock-vcs.adapter.ts, adapters/mock-agent.adapter.ts, adapters/deterministic-task-executor.adapter.ts, adapters/mock-runtime-profile.adapter.ts, adapters/in-memory-projection.adapter.ts, scenarios/review-scenario.ts, index.ts, test/mock-port-suites.ts]; decisions: [implements→@see-only, extends→@see+@param+@returns, class-body #region forbidden, @throws before @returns in tag order]; open: []

#### P2

- [x] `2026-08-11T17:26:31Z` intro `mock-port.contract.test.ts` ← port contract test file: all 7 adapters run twice + per-port describe blocks
- [x] `2026-08-11T17:26:31Z` intro `review-scenario.test.ts` ← unit tests: VCS effect matrix, partial/ambiguous failure, approval reset, controlled clock
- [x] `2026-08-11T17:26:31Z` intro `review-scenario.integration.test.ts` ← integration tests: determinism, run-id isolation, crash recovery, ambiguous reconciliation
- [x] `2026-08-11T17:36:06Z` discovery `npm test -- <dirs>` fails: tsx ESM resolver treats directory args as module paths (ERR_MODULE_NOT_FOUND index.json); file-arg form works; `npm run test` (sdd verify gate) discovers all target files via find and passes
- [x] `2026-08-11T17:36:06Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-11T17:36:06Z` ver `npm run test` → pass exit=0
- [x] `2026-08-11T17:36:06Z` ver `node --import tsx --test --experimental-test-module-mocks $(find services/agent-inbox/modules/inbox-mocks/__tests__/ services/agent-inbox/test/__tests__/ -name '*.test.ts')` → pass exit=0
- [x] `2026-08-11T17:36:06Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-mocks/__tests__/mock-port.contract.test.ts, services/agent-inbox/test/__tests__/review-scenario.test.ts, services/agent-inbox/test/__tests__/review-scenario.integration.test.ts]; decisions: [canonical-case-names=verbatim-per-§6, contract-twice=all-seven-adapters-run-twice-in-combined-it, matrix-covers=all-9-VCS-effects+partial-fail+approval-reset+ambiguous-claim, recovery-covers=crash-requeue+ambiguous-reconcile-to-empty, isolation-covers=mock-namespace-reset-denied+foreign-runid-denied+getHost-empty+unseeded-fails]; open: [scoped-test-command=§5-directory-arg-incompatible-with-tsx-ESM-loader-sdd-verify-npm-run-test-is-canonical-gate]

#### Round close

- [x] `2026-08-11T17:36:53Z` sync agent-inbox+root
- [x] `2026-08-11T17:36:53Z` DONE
<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Existing factories/cassettes are reuse inputs; mock runtime never substitutes real acceptance.
- BDD critic: merged physical isolation, controlled-time and split recovery cases with port-by-port mapping; rejected mock-only acceptance and a second fixture model.
