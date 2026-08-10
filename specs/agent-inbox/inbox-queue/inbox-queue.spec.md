# Module: inbox-queue

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Per-MR execution, hybrid action packages, operator decisions, intent-preserving automation
and independent reconciled outcomes. Parent: [agent-inbox](../agent-inbox.spec.md).

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```ts
const packageView = packageBuilder.from(synthesis);
const decision = await decisions.accept(packageView.withSelection(operatorSelection));
const outcomes = await coordinator.execute(decision);
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                      | Type         | Purpose                                                            |
| ------------------------- | ------------ | ------------------------------------------------------------------ |
| `ReviewTask`              | Entity       | Typed per-MR unit of work.                                         |
| `ReviewTaskRegistry`      | Service      | Catalog dependencies, exclusions, dedup and session policy.        |
| `ReviewActionCatalog`     | Service      | Canonical action kinds, gates, permissions and execution binding.  |
| `TaskExecutorPort`        | Port         | Execute tasks with per-MR ordering and cross-MR parallelism.       |
| `LocalTaskExecutor`       | Adapter      | Single-process production executor.                                |
| `ReviewProposal`          | Entity       | One candidate operator or automatic action.                        |
| `ReviewDecision`          | Entity       | Operator selection/edit/rejection or justified automatic decision. |
| `ReviewActionPackage`     | Entity       | Coherent set of independent and alternative actions.               |
| `ReviewEffect`            | Value Object | Idempotent external mutation intent.                               |
| `ReviewOutcome`           | Entity       | Applied, failed, no-op or unknown result with evidence.            |
| `ReviewAutomationPolicy`  | Service      | Resolve fixed allowed threads and restore prior approve.           |
| `ReviewEffectCoordinator` | Service      | Execute dependency-aware effects and reconcile outcomes.           |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### `ReviewTask`, `ReviewTaskRegistry`, `TaskExecutorPort`, `LocalTaskExecutor`

- **Type:** Entity / Service / Port / Adapter
- **Public Operations:** enqueue, supersede, deduplicate, prioritize, execute, recover and report progress.
- **Lifecycle:** sequential per MR; parallel across MR; durable status through journal.
- **Errors & Degradation:** failure is task-local and visible; recovery never duplicates an acknowledged task.
- **Consumers:** pipeline, API and sync triggers.

### `ReviewActionCatalog`

- **Type:** Service
- **Public Operations:** register typed action kind with manual/automatic mode, gates, permission policy, dependencies and effect binding; enumerate package candidates.
- **Lifecycle:** closed catalog loaded at boot; extensions require spec/task update.
- **Errors & Degradation:** unknown action kind is rejected before proposal or execution.
- **Consumers:** package builder, automation policy and effect coordinator.

### `ReviewProposal`, `ReviewDecision`, `ReviewActionPackage`

- **Type:** Entity
- **Public Operations:** group actions; select defaults; express alternatives/dependencies; edit, accept or reject; invalidate; propose comment/reply, reaction, resolve/reopen, approve/unapprove, request changes, description edit and thread response alternatives.
- **Lifecycle:** package is bound to one current change batch and cannot be applied after staleness.
- **Errors & Degradation:** invalid dependency selection is rejected before effects.
- **Consumers:** dashboard and effect coordinator.

### `ReviewEffect`, `ReviewOutcome`

- **Type:** Value Object / Entity
- **Public Operations:** derive stable id; track attempts; attach reconciliation evidence.
- **Lifecycle:** one terminal outcome per effect id, with retry history.
- **Errors & Degradation:** unknown remains retry/reconcile pending, never success.
- **Consumers:** VCS, journal and projections.

### `ReviewAutomationPolicy`, `ReviewEffectCoordinator`

- **Type:** Service
- **Public Operations:** prove automation preconditions; execute selected effects respecting dependencies; continue independent actions.
- **Lifecycle:** evaluated against the newest state immediately before execution.
- **Errors & Degradation:** failed gate produces a proposal or no action, never unsafe automation.
- **Consumers:** scheduler triggers and API.
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

- Recommended actions are selected by default; operator may edit or deselect before immediate apply.
- Mutually exclusive choices cannot both execute; dependencies are explicit.
- A new MR event invalidates every unapplied package for the previous batch.
- Running work finishes against its bound revision; new events supersede/deduplicate pending delta tasks instead of interrupting the running task.
- Independent effects continue after sibling failure and receive individual outcomes.
- Auto-resolve requires verified fix; an operator-authored thread is allowed, while an allowlisted-bot thread additionally requires the operator to be MR author.
- Auto-approve only restores an approval previously expressed by the operator, after full coverage and no blocking finding.
- Manual and automatic actions resolve through the same `ReviewActionCatalog` and `ReviewEffectCoordinator`; no second automation executor exists.
- Runtime backing: local executor and deterministic test executor; verification: contract, unit, integration, e2e.
<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

- Priority: operator action > human/GitLab trigger > quiet-time background work.
- Automatic policies are explicit; generic accept-rate promotion is removed from v0.
- Retry is effect-aware and idempotent.
- Findings, proposals, decisions, effects and outcomes retain MR, revision/batch, task, session/model, timestamp and provenance.
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```text
inbox-queue/
├── types/
├── registry/
├── execution/
├── packages/
├── automation/
└── effects/
```

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

- `D-QUEUE-01`: package is the operator decision unit; outcome remains per effect.
- `D-QUEUE-02`: automation restores proven intent instead of learning broad autonomy in v0.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** [core](../inbox-core/inbox-core.spec.md), [pipeline](../inbox-pipeline/inbox-pipeline.spec.md), [VCS](../inbox-vcs/inbox-vcs.spec.md).
- **Provides directly to:** [API](../inbox-api/inbox-api.spec.md), [eval](../inbox-eval/inbox-eval.spec.md). Dashboard consumes queue state transitively through API.
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to task-scaffolding

- Extend existing registry/queue/executor; consolidate both current effect executors.
- Remove legacy role lifecycle only after queue recovery owns the flow.
- Stack: TypeScript; node:test. Module Rules Additions: None.
<!--/SECTION:HANDOFF-->
