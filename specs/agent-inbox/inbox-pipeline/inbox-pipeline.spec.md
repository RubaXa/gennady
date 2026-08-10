# Module: inbox-pipeline

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Полноценный role-invariant review: план, evidence, findings, artifacts, cross-review,
delta verification, hard coverage gate и synthesis. Parent: [agent-inbox](../agent-inbox.spec.md).

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```ts
const result = await orchestrator.review(intent);
if (!result.coverage.proven) throw new ReviewCoverageError(result.coverage.gaps);
await proposals.prepare(result.synthesis);
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                  | Type         | Purpose                                                 |
| --------------------- | ------------ | ------------------------------------------------------- |
| `ReviewIntent`        | Value Object | Full, delta, thread or manual verification request.     |
| `ReviewPlan`          | Entity       | Deterministic review lanes and file checklist.          |
| `ReviewEvidence`      | Value Object | Traceable fact about current code/MR.                   |
| `ReviewFinding`       | Entity       | Verified actionable issue with severity and provenance. |
| `ReviewArtifact`      | Entity       | Durable analysis output addressed by MR/task/revision.  |
| `ReviewCoverage`      | Value Object | Proof that required files and lenses were inspected.    |
| `ReviewOrchestrator`  | Service      | Execute the shared review DAG.                          |
| `ReviewDeltaVerifier` | Service      | Verify accumulated change batch against prior evidence. |
| `ReviewCrossReviewer` | Service      | Recheck discussions and other reviewers' claims.        |
| `ReviewSynthesis`     | Entity       | Fact summary, verdict and proposed actions.             |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### `ReviewIntent`, `ReviewPlan`

- **Type:** Value Object / Entity
- **Public Operations:** bind MR revision and batch; derive required lanes/files; track progress.
- **Lifecycle:** one plan per task; same DAG for every participation role.
- **Errors & Degradation:** missing context stops the affected gate rather than shrinking review silently.
- **Consumers:** orchestrator and dashboard projections.

### `ReviewEvidence`, `ReviewFinding`, `ReviewArtifact`

- **Type:** Value Object / Entity
- **Public Operations:** attribute to source, SHA, task, session and model; classify finding/thread as blocking or non-blocking; supersede with newer evidence.
- **Lifecycle:** immutable revisions; findings retain resolution history.
- **Errors & Degradation:** stale or unverified material cannot support a positive decision.
- **Consumers:** synthesis, packages, feed, handoff.

### `ReviewCoverage`

- **Type:** Value Object
- **Public Operations:** compare required checklist with observed tool trace; enumerate gaps.
- **Lifecycle:** recomputed after every continuation.
- **Errors & Degradation:** absent trace equals unproven coverage.
- **Consumers:** verdict gate, eval.

### `ReviewOrchestrator`, `ReviewDeltaVerifier`, `ReviewCrossReviewer`

- **Type:** Service
- **Public Operations:** prepare, plan, enrich, execute lanes, enforce coverage, synthesize; verify batch; assess threads and prior reviews.
- **Lifecycle:** task-scoped; continuation reuses producer context when required.
- **Errors & Degradation:** lane failure is visible and retryable; it cannot be omitted from synthesis.
- **Consumers:** queue and chat.

### `ReviewSynthesis`

- **Type:** Entity
- **Public Operations:** summarize facts, risks, threads, verdict and candidate actions with provenance.
- **Lifecycle:** belongs to one MR revision/change batch and becomes stale on any new MR event.
- **Errors & Degradation:** conflicting evidence is surfaced, not arbitrarily collapsed.
- **Consumers:** action package, API, operator.
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

- Full review is mandatory regardless of author/reviewer/assignee/mention participation.
- Worktree/context preparation is lazy and task-scoped; first discovery does not eagerly materialize every repository.
- Review execution preserves mechanical checks, event-triggered verification and intelligent semantic analysis as observable layers of one DAG.
- Other reviews and discussions are additional evidence requiring independent verification.
- Delta is measured against stored batch/evidence baselines; missing baseline triggers full review.
- A positive verdict and approve proposal require proven coverage and no blocking finding.
- Non-blocking threads may coexist with approve.
- An approval observed while a thread is open is evidence that the thread is non-blocking until the operator explicitly changes that decision.
- Author refusal on a non-blocking thread produces operator alternatives—agree and resolve, object, or ask a question—without blocking prior-approve restoration.
- Runtime backing: real agent runtime in production, deterministic adapter in tests.
- Verification: unit, contract, integration, real-MR e2e.
<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

- Review lenses are declarative and additive.
- v0 invalidates the complete unapplied synthesis/package on every new MR event.
- Default model count is one; multi-model attribution remains supported but not required.
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```text
inbox-pipeline/
├── types/
├── planning/
├── review/
├── verification/
├── coverage/
└── synthesis/
```

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

- `D-PIPE-01`: participation changes permissions and presentation, never review depth.
- `D-PIPE-02`: tool trace, not agent self-report, proves coverage.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** [core](../inbox-core/inbox-core.spec.md), [VCS](../inbox-vcs/inbox-vcs.spec.md), [opencode](../inbox-opencode/inbox-opencode.spec.md).
- **Provides to:** [queue](../inbox-queue/inbox-queue.spec.md), [chat](../inbox-chat/inbox-chat.spec.md), [API](../inbox-api/inbox-api.spec.md), [eval](../inbox-eval/inbox-eval.spec.md).
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to task-scaffolding

- Modify existing `PipelineRuntime`; preserve current coverage and session continuation machinery.
- Move reusable artifact/trace logic out of legacy roles before deleting them.
- Stack: TypeScript; node:test. Module Rules Additions: None.
<!--/SECTION:HANDOFF-->
