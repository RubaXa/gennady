# Module: inbox-api

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Transport-neutral projections and typed HTTP/SSE boundary for the local dashboard.
It exposes domain state but owns no review decisions. Parent: [agent-inbox](../agent-inbox.spec.md).

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```ts
const board = await queries.board();
const accepted = await commands.applyPackage(mr, selection);
events.subscribe(mr, (frame) => reconcile(frame));
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                       | Type    | Purpose                                                                     |
| -------------------------- | ------- | --------------------------------------------------------------------------- |
| `ReviewBoardProjection`    | Query   | Two responsibility queues with unique MR cards.                             |
| `ReviewFeedProjection`     | Query   | Ordered smart-widget feed and unread cursor.                                |
| `ReviewMrProjection`       | Query   | Complete MR workspace state.                                                |
| `ReviewPackageProjection`  | Query   | Current and stale selectable actions, invalidation and individual outcomes. |
| `ReviewTestRunProjection`  | Query   | Adaptive test status and observed preconditions.                            |
| `ProjectionPort`           | Port    | Build transport-neutral state views from canonical events/state.            |
| `JournalProjectionAdapter` | Adapter | Production journal-backed projection implementation.                        |
| `ReviewCommandRouter`      | Service | Validate and dispatch typed operator commands.                              |
| `ReviewQueryRouter`        | Service | Serve projections without domain mutation.                                  |
| `ReviewEventStream`        | Service | Per-MR SSE plus reconciliation cursor.                                      |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### Projections

- **Public Operations:** board, feed, MR detail, current/stale package and outcomes, artifacts and test report queries.
- **Lifecycle:** rebuilt from journal/state; disposable transport models.
- **Errors & Degradation:** freshness and partial/stale state are explicit.
- **Consumers:** browser dashboard and eval reporter.

### Projection contract

- **Public Operations:** project board/feed/MR/package/test views from a cursor; rebuild from canonical state.
- **Lifecycle:** production adapter is journal-backed; deterministic adapter is used in tests.
- **Errors & Degradation:** partial rebuild exposes cursor/freshness and never invents missing state.
- **Consumers:** query router and SSE reconciliation.

### Command/query routers

- **Public Operations:** verify now, apply/edit/reject package, retry effect, complete terminal MR, update description, generate handoff, acknowledge clipboard delivery, chat/mutate/undo.
- **Lifecycle:** request-scoped; accepted command returns task/effect identity immediately.
- **Errors & Degradation:** malformed/stale command is rejected before mutation.
- **Consumers:** dashboard.

### Event stream

- **Public Operations:** subscribe by MR, stream progress/chat/projection/outcome frames, resume from cursor.
- **Lifecycle:** reconnectable; polling reconciliation remains available.
- **Errors & Degradation:** disconnect never implies task failure.
- **Consumers:** dashboard.
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

- A board projection contains an MR exactly once.
- Commands use version/batch identity to reject stale package application.
- A stale package remains queryable with its bound revision, invalidating event/reason, disabled controls and replacement verification/task reference.
- Optimistic acceptance is distinct from reconciled GitLab success.
- The API starts before boot readiness is complete so progress remains observable.
- Runtime backing: local HTTP and SSE; contract/integration/e2e verification.
<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

- Read-only opening before readiness is explicit and effect-disabled.
- SSE reconnect uses bounded backoff and snapshot reconciliation.
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```text
inbox-api/
├── projections/
├── dto/
├── routers/commands/
├── routers/queries/
└── transport/http-sse/
```

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

- `D-API-01`: BoardProvider is migrated from RoleScheduler to journal-backed projections.
- `D-API-02`: manual RoleRouter is retired.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** [core](../inbox-core/inbox-core.spec.md), [pipeline](../inbox-pipeline/inbox-pipeline.spec.md), [queue](../inbox-queue/inbox-queue.spec.md), [chat](../inbox-chat/inbox-chat.spec.md).
- **Provides to:** [dashboard](../inbox-dashboard/inbox-dashboard.spec.md), [eval](../inbox-eval/inbox-eval.spec.md).
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to task-scaffolding

- Reuse HTTP server, SSE hub and artifact guards.
- Replace role-based board provider after new projections are verified.
- Stack: TypeScript; node:test. Module Rules Additions: None.
<!--/SECTION:HANDOFF-->
