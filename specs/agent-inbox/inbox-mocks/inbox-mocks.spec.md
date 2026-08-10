# Module: inbox-mocks

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Полный детерминированный test runtime для всех изменчивых ports без доступа к production state.
Parent: [agent-inbox](../agent-inbox.spec.md).

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```ts
const scenario = ReviewScenario.fixed({ mr, events, agentResults });
const runtime = scenario.start({ clock: ControlledClock.at(epoch) });
await runtime.advanceToQuietDeadline();
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                        | Type    | Purpose                                                 |
| --------------------------- | ------- | ------------------------------------------------------- |
| `ReviewScenario`            | Entity  | Complete deterministic input and expected observations. |
| `MockVcsAdapter`            | Adapter | Read/effect VCS test implementation.                    |
| `MockAgentAdapter`          | Adapter | Scripted structured agent runtime.                      |
| `InMemoryJournalAdapter`    | Adapter | Isolated journal implementation.                        |
| `InMemoryArtifactAdapter`   | Adapter | Isolated artifact store.                                |
| `ControlledClockAdapter`    | Adapter | Timer control without sleeps.                           |
| `DeterministicTaskExecutor` | Adapter | Predictable task scheduling.                            |
| `MockRuntimeProfile`        | Adapter | Run-id-scoped state namespace.                          |
| `InMemoryProjectionAdapter` | Adapter | Deterministic implementation of API `ProjectionPort`.   |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### `ReviewScenario`

- **Public Operations:** declare MR facts/events/results; start; advance; inspect observations.
- **Lifecycle:** immutable definition, fresh runtime per test.
- **Errors & Degradation:** unspecified dependency call fails loudly.
- **Consumers:** unit, integration and UI e2e tests.

### Mock adapters

- **Public Operations:** implement the corresponding core/VCS/agent/executor ports.
- **Lifecycle:** owned by one test run-id and resettable only within it.
- **Errors & Degradation:** no network or production filesystem fallback exists.
- **Consumers:** scenario runtime and port contract kit.

### `InMemoryProjectionAdapter`

- **Type:** Adapter
- **Public Operations:** rebuild and query board/feed/MR/package projections from deterministic state.
- **Lifecycle:** one instance per scenario run-id.
- **Errors & Degradation:** missing event/version fails the scenario rather than producing partial invented UI state.
- **Consumers:** API contract and dashboard composition tests.
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

- Same input and controlled time produce the same journal, tasks, packages and projections.
- Every production port with confirmed variability has a contract-compatible test adapter.
- Mock mode never masquerades as real acceptance or visual proof.
- Reset cannot address production or another test run-id.
- The mandatory scenario matrix covers discovery/detail reads, every effect kind, controlled time, partial and ambiguous failure, approval reset, process crash/recovery and effect reconciliation.
- Mock adapters have no network or production-filesystem fallback.

### Runtime contract

- **Preconditions:** unique non-production run-id and explicit scenario capabilities.
- **Postconditions:** all observations are reproducible from scenario input and controlled time.
- **Invariants:** no production root, network fallback or unspecified adapter call.
- **Runtime Backing:** deterministic in-memory simulation.
- **Verification Levels:** contract, unit, integration, UI e2e.
<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

- Strict mode rejects unspecified calls by default.
- Scenario time advances explicitly; blocking sleeps are forbidden.
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```text
inbox-mocks/
├── scenarios/
├── adapters/
├── factories/
└── runtime/
```

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

- `D-MOCK-01`: existing factories are expanded into adapters; they are not replaced by a second fixture system.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** contracts from [core](../inbox-core/inbox-core.spec.md), [VCS](../inbox-vcs/inbox-vcs.spec.md), [opencode](../inbox-opencode/inbox-opencode.spec.md), [queue](../inbox-queue/inbox-queue.spec.md), [API](../inbox-api/inbox-api.spec.md).
- **Provides to:** every module test suite and [eval](../inbox-eval/inbox-eval.spec.md) deterministic scenarios.
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to task-scaffolding

- Preserve existing DTO factories where compatible.
- Add contract suites and physical profile guards before scenario expansion.
- Stack: TypeScript; node:test and Playwright consumers. Module Rules Additions: None.
<!--/SECTION:HANDOFF-->
