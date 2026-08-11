# Module: inbox-vcs

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Единственная граница GitLab: полное чтение участия и MR facts, нормализация событий,
безопасное выполнение effects и обязательная reconciliation. Parent: [agent-inbox](../agent-inbox.spec.md).

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```ts
const snapshot = await vcsRead.readMr(ref);
await journal.appendAll(normalizer.diff(previous, snapshot));
const outcome = await vcsEffects.apply(approvedEffect);
await reconciler.record(outcome);
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                       | Type         | Purpose                                                                 |
| -------------------------- | ------------ | ----------------------------------------------------------------------- |
| `VcsReadPort`              | Port         | Читать discovery, MR, discussions, approvals, commits и description.    |
| `VcsEffectPort`            | Port         | Выполнять разрешённые GitLab actions.                                   |
| `VcsPort`                  | Port         | Существующий совместимый root, объединяющий read/effect surfaces.       |
| `VcsGitlabPort`            | Adapter      | Единственный реальный GitLab adapter для обоих port surfaces.           |
| `ReadonlyEffectGuard`      | Adapter      | Запрещать effects в readonly profile.                                   |
| `ReadonlyVcsEffectError`   | Error        | Типизированный отказ readonly effect boundary.                          |
| `selectVcsRuntime`         | Composition  | Независимо выбирать read/effect surfaces по runtime profile.            |
| `VcsRuntimePolicy`         | Value Object | Закрытый профиль runtime backing.                                       |
| `VcsRuntime`               | Value Object | Выбранная пара read/effect surfaces.                                    |
| `MrDetail`                 | Value Object | Нормализованная детальная MR observation.                               |
| `VcsDiscussion`            | Value Object | Нормализованный discussion thread.                                      |
| `VcsDiscussionNote`        | Value Object | Одна note внутри discussion.                                            |
| `DiscussionsPageInfo`      | Value Object | Provider pagination state.                                              |
| `DiscussionsPage`          | Value Object | Одна полная страница discussions.                                       |
| `CompareResult`            | Value Object | Commit comparison с явной полнотой.                                     |
| `VcsApprovalsResult`       | Value Object | Dedicated approvals result с явной полнотой.                            |
| `VcsReviewerState`         | Value Object | Закрытое native review state.                                           |
| `VcsParticipation`         | Value Object | Inclusive причины участия оператора.                                    |
| `VcsSnapshotCompleteness`  | Value Object | Field-level completeness observation.                                   |
| `VcsSnapshot`              | Value Object | Нормализованный снимок внешнего состояния MR.                           |
| `VcsEffectKind`            | Value Object | Закрытый словарь GitLab effect kinds.                                   |
| `VcsEffectPermission`      | Value Object | Permission facts перед external I/O.                                    |
| `VcsEffectRequest`         | Value Object | Idempotency-addressed provider mutation.                                |
| `VcsCapabilities`          | Value Object | Результат read-only provider capability probe.                          |
| `VcsEffectOutcome`         | Value Object | Закрытый reconciled effect result.                                      |
| `validateVcsEffectRequest` | Function     | Closed-world validation до external I/O.                                |
| `VcsNormalizationResult`   | Value Object | Events и refresh requirement одного diff.                               |
| `VcsEventNormalizer`       | Service      | Превращать изменения снимка в `ReviewEvent`.                            |
| `VcsSyncTarget`            | Value Object | MR identity для coordinator refresh.                                    |
| `VcsSyncResult`            | Value Object | Snapshot/events/effect readiness одного sync.                           |
| `VcsSyncCoordinator`       | Service      | Владеть discovery, polling, cursors, retries and verification triggers. |
| `VcsReconciler`            | Service      | Сверять заявленный effect с наблюдаемым GitLab outcome.                 |
| `VcsPermissionDecision`    | Value Object | Разрешение/отказ permission policy с evidence.                          |
| `VcsPermissionPolicy`      | Service      | Проверять права для resolve/reopen/approve и bot threads.               |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### `VcsReadPort`

- **Type:** Port
- **Public Operations:** discover participation; read MR detail; compare revisions; refresh selected pool.
- **Lifecycle:** process-scoped; snapshots are immutable.
- **Errors & Degradation:** unavailable GitLab returns explicit stale/unavailable state.
- **Consumers:** sync, pipeline, eval.

### `VcsEffectPort`

- **Type:** Port
- **Public Operations:** comment/reply, react, resolve/reopen allowed thread, approve/unapprove, request changes, edit description.
- **Lifecycle:** every request has stable effect id and reconciled outcome.
- **Errors & Degradation:** ambiguous transport failure remains unknown until reconciliation.
- **Consumers:** effect coordinator.

### `VcsPort`, `VcsGitlabPort`, `ReadonlyEffectGuard`, `selectVcsRuntime`

- **Type:** Adapter
- **Public Operations:** `VcsGitlabPort` реализует оба surface через существующий `VcsPort`;
  `ReadonlyEffectGuard` реализует только effect surface и всегда запрещает запись;
  `selectVcsRuntime` сохраняет реальные reads, но подменяет effects guard-ом для readonly profile.
- **Lifecycle:** selected by runtime profile at composition root.
- **Errors & Degradation:** API limits and permission failures retain GitLab evidence.
- **Consumers:** production, real-readonly, real-effects and deterministic test profiles.

### `VcsSnapshot`

- **Type:** Value Object
- **Public Properties:** identity, state, timestamps, SHA, description, participants, notes, discussions, approvals, pipeline.
- **Public Operations:** compare identity/revision; expose completeness markers.
- **Lifecycle:** one immutable observation.
- **Errors & Degradation:** partial fields carry source and freshness.
- **Consumers:** normalizer and projections.

### Support value objects

- **Read support:** `MrDetail`, `VcsDiscussion`, `VcsDiscussionNote`, `DiscussionsPageInfo`,
  `DiscussionsPage`, `CompareResult`, `VcsApprovalsResult`, `VcsReviewerState`,
  `VcsParticipation`, `VcsSnapshotCompleteness`.
- **Effect support:** `VcsEffectKind`, `VcsEffectPermission`, `VcsEffectRequest`,
  `VcsCapabilities`, `VcsEffectOutcome`; `validateVcsEffectRequest` rejects unknown kinds and
  incomplete payloads before I/O.
- **Coordinator support:** `VcsNormalizationResult`, `VcsSyncTarget`, `VcsSyncResult`,
  `VcsPermissionDecision`.
- **Runtime support:** `VcsRuntimePolicy`, `VcsRuntime`; `ReadonlyVcsEffectError` is the typed
  readonly-boundary failure.
- **Lifecycle:** immutable per call; no independent persistence.
- **Errors & Degradation:** completeness and unknown outcome remain explicit rather than aliasing
  success.

### `VcsEventNormalizer`

- **Type:** Service
- **Public Operations:** calculate all MR changes between observations.
- **Lifecycle:** stateless.
- **Errors & Degradation:** uncertain delta emits refresh-required rather than a fabricated fine delta.
- **Consumers:** core journal.

### `VcsSyncCoordinator`

- **Type:** Service
- **Public Operations:** initial open-MR discovery; periodic/detail refresh; explicit pool refresh; persist cursor; append normalized events in order; request verification trigger.
- **Lifecycle:** one process-scoped coordinator with per-MR cursors and bounded retry.
- **Errors & Degradation:** polling failure retains prior snapshot as stale, postpones effects and retries without advancing cursor.
- **Consumers:** boot readiness, core journal and queue triggers.

### `VcsReconciler`

- **Type:** Service
- **Public Operations:** classify effect as applied, failed, no-op or unknown; safely retry idempotent effect.
- **Lifecycle:** invoked after every effect and recovery.
- **Errors & Degradation:** unknown is never reported as success.
- **Consumers:** queue and API.

### `VcsPermissionPolicy`

- **Type:** Service
- **Public Operations:** authorize action against operator identity, MR ownership and thread authorship.
- **Lifecycle:** evaluated immediately before effect.
- **Errors & Degradation:** missing identity or thread ownership denies mutation.
- **Consumers:** effect adapter and package builder.
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

### Read contract

- **Runtime Backing:** GitLab real runtime; deterministic mock in tests.
- **Verification Levels:** contract, integration, e2e.
- Discovery includes author, reviewer, assignee, mention, comment and approval signals.
- Initial discovery admits open MR only; tracked terminal MR remains eligible for local history.
- MR with last activity older than three months is excluded from the active dashboard regardless of terminal/completed state; a newly observed event refreshes activity and may restore visibility.
- Commits, description changes, discussion creation/edit/reply/resolve, approvals, pipeline changes and other observable MR mutations are normalized as events; no supported event may update a snapshot silently.
- Initial discovery, periodic sync and recovery reconciliation use the same coordinator and cursor ordering contract.

### Effect contract

- **Runtime Backing:** GitLab, readonly guard or mock-effects adapter.
- Every effect is permission-checked, idempotency-addressed and reconciled.
- Resolve truth table: an operator-authored thread is allowed; an allowlisted-bot thread is allowed only when the operator is MR author; every other thread is denied.
- A failed independent effect does not roll back successful siblings.

#### `request_changes`

- **Preconditions:** current GitLab adapter capability probe reports native request-changes support; operator has reviewer permission; effect is bound to current MR revision and contains the blocking review body.
- **Stable identity:** hash of MR, revision/change batch, action kind and normalized body.
- **Postconditions:** a fresh GitLab read observes the operator reviewer state as `requested_changes` on the bound revision.
- **Reconciliation:** transport ambiguity triggers read-before-retry; an already observed state is a no-op success.
- **Unsupported host:** capability probe prevents creation of the effect. The package marks the native action unavailable with evidence and may offer an explicit alternative group “blocking comment + unapprove”; the adapter never substitutes it silently and therefore emits no `ReviewOutcome` for an uncreated effect.
- **Runtime Backing:** capability-selected GitLab native review-state endpoint.
- **Verification Levels:** contract and allowlisted real-adapter integration in TSK-174; shippable-entry real-effects e2e is owned by TSK-183.

#### Resolve/reopen permission truth table

| Thread author          | Operator is MR author | Manual                         | Automatic after verified fix |
| ---------------------- | --------------------: | ------------------------------ | ---------------------------- |
| operator               |                   any | allow                          | allow                        |
| allowlisted review bot |                   yes | allow                          | allow                        |
| allowlisted review bot |                    no | deny: operator does not own MR | deny                         |
| other human/bot        |                   any | deny: foreign thread           | deny                         |

`reopen` follows the same ownership permission; automatic reopen is not enabled in v0.

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

- GitLab host and operator identity are required boot inputs.
- Bot thread allowlist is explicit.
- Real-effects tests require explicit project/MR allowlist; absence disables writes.
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```text
inbox-vcs/
├── vcs-port.ts
├── vcs-gitlab.port.ts
├── readonly-effect.guard.ts
├── vcs-runtime.ts
├── permission-policy.ts
├── sync-coordinator.ts
├── event-normalizer.ts
└── reconciler.ts
```

The legacy `VcsInbox*` hierarchy is removed after migration.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

- `D-VCS-01`: GitLab is canonical for external state; journal is canonical for local process history.
- `D-VCS-02`: reads and effects are separate ports because readonly and real-effects profiles vary independently.
- `D-VCS-03`: `VcsGitlabPort` is the introduced real adapter name; it implements both independent
surfaces through the pre-existing `VcsPort` compatibility root. Separate GitLab read/effect
classes are intentionally not introduced because that would create a third provider hierarchy.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** [inbox-core](../inbox-core/inbox-core.spec.md).
- **Provides directly to:** [pipeline](../inbox-pipeline/inbox-pipeline.spec.md), [queue](../inbox-queue/inbox-queue.spec.md), [eval](../inbox-eval/inbox-eval.spec.md). API observes VCS transitively through pipeline/queue.
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to task-scaffolding

- Consolidate the two existing VCS implementations; do not create a third.
- Extend sync before migrating BoardProvider and legacy scheduler consumers.
- Contract tests run against real, readonly and mock implementations.
- Stack: TypeScript; node:test. Module Rules Additions: None.
<!--/SECTION:HANDOFF-->
