# Module: inbox-core

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Каноническая локальная модель MR: нормализованные события, восстанавливаемое состояние,
participation, lifecycle, накопленная change batch и физически изолированные runtime profiles.
Модуль не знает GitLab DTO, agent sessions, HTTP или React. Parent: [agent-inbox](../agent-inbox.spec.md).

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```ts
await journal.append(mrEvent);
const state = reviewState.fold(await journal.read(mrEvent.mr));
if (state.changeBatch.verificationDue) scheduleVerification(state.changeBatch);
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

_Это полный список публичных сущностей `inbox-core`. Новая публичная сущность требует обновления spec._

| Name                               | Type         | Purpose                                                               |
| ---------------------------------- | ------------ | --------------------------------------------------------------------- |
| `ReviewEvent`                      | Event        | Версионированный факт, изменяющий локальную модель MR.                |
| `ReviewState`                      | Entity       | Восстанавливаемое актуальное состояние одного MR.                     |
| `ReviewParticipation`              | Value Object | Причины участия оператора и responsibility group.                     |
| `ReviewLifecycle`                  | Value Object | Tracking, terminal и operator-completed состояние MR.                 |
| `ReviewChangeBatch`                | Entity       | Накопленная unapplied delta и сроки её верификации.                   |
| `ReviewConfig`                     | Value Object | Публичные локальные политики runtime.                                 |
| `JournalPort`                      | Port         | Append/replay событий с crash recovery.                               |
| `ArtifactStorePort`                | Port         | Адресуемое хранение evidence и review artifacts.                      |
| `ClockPort`                        | Port         | Время и таймеры с controlled test implementation.                     |
| `SystemClock`                      | Adapter      | Production wall-clock и cancellable timer implementation.             |
| `ControlledClock`                  | Adapter      | Детерминированные время и таймеры для test/mock runtime.              |
| `InMemoryJournal`                  | Adapter      | Детерминированный JournalPort для test/mock runtime.                  |
| `InMemoryArtifactStore`            | Adapter      | Изолированный ArtifactStorePort для test/mock runtime.                |
| `LocalArtifactStore`               | Adapter      | Atomic profile-rooted artifact storage для production runtime.        |
| `RuntimeProfilePort`               | Port         | Физически разделённые production/test/mock namespaces.                |
| `ReviewRuntimeProfile`             | Value Object | Допустимая комбинация state namespace и external I/O policy.          |
| `ReviewStateNamespace`             | Type         | Закрытый набор production/test/mock state namespaces.                 |
| `ReviewExternalIoPolicy`           | Type         | Закрытый набор допустимых external I/O capabilities.                  |
| `ReviewRuntimeProfileSpec`         | Type         | Декларативный вход для composition gate профиля.                      |
| `ReviewRuntimeRoots`               | Type         | Три физически разделённых namespace root.                             |
| `ReviewRuntimeBinding`             | Type         | Проверенная связь профиля с каноническим state root.                  |
| `OpenRuntimeProfileOptions`        | Type         | Controlled policy fresh/reopen/explicit-root открытия.                |
| `composeDefaultReviewRuntimeRoots` | Function     | Default production/test/mock roots без пересечения.                   |
| `BootReadiness`                    | Service      | Наблюдаемый boot/reconcile/restore и lazy-worktree barrier.           |
| `WorktreePreparationState`         | Type         | Наблюдаемая deferred/preparing/ready/failed фаза content worktree.    |
| `BootstrapSafetyError`             | Error        | Failed boot snapshot и cause отказа safety/storage до старта adapter. |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### `ReviewEvent`

- **Type:** Event
- **Public Properties:** version, id, MR reference, kind, actor, occurredAt, payload.
- **Public Operations:** validate; identify causal batch.
- **Lifecycle:** immutable after append.
- **Events Emitted:** N/A.
- **Errors & Degradation:** unknown version is quarantined and visible.
- **Consumers:** `ReviewState`, projections, recovery.

### `ReviewState`

- **Type:** Entity
- **Public Properties:** MR identity, participation, lifecycle, change batch, review/effect summaries.
- **Public Operations:** fold ordered events; expose deterministic snapshot.
- **Lifecycle:** one logical instance per tracked MR; recoverable from journal.
- **Events Emitted:** N/A.
- **Errors & Degradation:** incomplete external data is marked stale, never invented.
- **Consumers:** pipeline, queue, API.

### `ReviewParticipation`

- **Type:** Value Object
- **Public Properties:** author, reviewer, assignee, mentioned, commented, approved; responsibility group.
- **Public Operations:** merge inclusive signals; derive one of `review` or `owned` display groups.
- **Lifecycle:** recomputed from VCS facts; historical participation remains tracked.
- **Events Emitted:** N/A.
- **Errors & Degradation:** uncertain signals are marked estimated.
- **Consumers:** discovery, projections.

### `ReviewLifecycle`

- **Type:** Value Object
- **Public Properties:** open/merged/closed, trackedAt, lastActivityAt, completedAt.
- **Public Operations:** determine tracking and visibility independently; mark operator completion when terminal; observe activity.
- **Lifecycle:** completion is explicit and local; every newly observed MR event refreshes `lastActivityAt`, clears `completedAt` and re-evaluates participation, so a previously completed or horizon-hidden MR can return.
- **Events Emitted:** lifecycle changed, completed.
- **Errors & Degradation:** completion is rejected for open MR.
- **Consumers:** sync, dashboard.

#### Visibility truth table

| MR state      | Within 3-month horizon | Completed locally | Dashboard                                                         |
| ------------- | ---------------------: | ----------------: | ----------------------------------------------------------------- |
| open          |                    yes |               N/A | visible when participation matches                                |
| open          |                     no |               N/A | hidden; a new event may restore visibility                        |
| merged/closed |                    yes |                no | visible with **Complete**                                         |
| merged/closed |                     no |                no | hidden automatically; history retained                            |
| merged/closed |                    any |               yes | hidden until a new event clears completion and refreshes activity |

### `ReviewChangeBatch`

- **Type:** Entity
- **Public Properties:** event range, base/head, accumulated changes, debounce/quiet deadlines, status.
- **Public Operations:** accumulate event; postpone deadlines; mark verifying/applied/stale.
- **Lifecycle:** one current batch per MR; any new event invalidates its unapplied package in v0.
- **Events Emitted:** batch changed, verification due, batch invalidated.
- **Errors & Degradation:** missing comparison data forces full verification.
- **Consumers:** pipeline, queue, dashboard.

### `ReviewConfig`

- **Type:** Value Object
- **Public Properties:** debounce, quiet timeout, activity horizon, bot allowlist, state roots, effect allowlist.
- **Public Operations:** validate and resolve defaults.
- **Lifecycle:** loaded at boot; changes create a system event.
- **Events Emitted:** configuration changed.
- **Errors & Degradation:** invalid safety settings fail boot; optional values use documented defaults.
- **Consumers:** composition root and policies.

### `JournalPort`, `ArtifactStorePort`, `ClockPort`, `RuntimeProfilePort`

- **Type:** Port
- **Public Properties:** implementation identity and health.
- **Public Operations:** append/replay; put/read/list; now/schedule; open/reset permitted namespace.
- **Lifecycle:** process-scoped adapters; durable data outlives process where applicable.
- **Events Emitted:** storage/profile failures as system events.
- **Errors & Degradation:** never cross profile boundaries; failed durable writes are not acknowledged.
- **Consumers:** all runtime modules and tests.

### `SystemClock`, `ControlledClock`, `InMemoryJournal`, `InMemoryArtifactStore`, `LocalArtifactStore`

- **Type:** Adapters.
- **Public Properties:** implementation identity; latest health through the implemented port.
- **Public Operations:** exactly the corresponding `ClockPort`, `JournalPort` or `ArtifactStorePort`
  operations; `ControlledClock` additionally advances deterministic test time.
- **Lifecycle:** process-scoped; local durable adapters retain acknowledged bytes across restart,
  in-memory adapters retain only process-local test state.
- **Events Emitted:** storage failures are exposed by failed health and trace-prefixed errors; timer
  callbacks create canonical verification-request events through the production consumer.
- **Errors & Degradation:** invalid schedule/address and failed durable I/O are rejected visibly;
  cancellations never invoke the callback.
- **Consumers:** production composition (`SystemClock`, `LocalArtifactStore`), deterministic contract
  and integration tests (`ControlledClock`, in-memory adapters).

### `ReviewRuntimeProfile`

- **Type:** Value Object
- **Public Properties:** state namespace, run-id, external I/O policy, effect allowlist identity.
- **Public Operations:** validate an allowed profile combination; resolve physical root.
- **Lifecycle:** immutable for one process/test run.
- **Events Emitted:** N/A.
- **Errors & Degradation:** an invalid or unsafe combination fails before adapters start.
- **Consumers:** composition root, mocks and eval.

### Runtime profile support surface

- **Types:** `ReviewStateNamespace`, `ReviewExternalIoPolicy`, `ReviewRuntimeProfileSpec`,
  `ReviewRuntimeRoots`, `ReviewRuntimeBinding`, `OpenRuntimeProfileOptions`.
- **Function:** `composeDefaultReviewRuntimeRoots` resolves pairwise-disjoint production, test and
  mock parents before `RuntimeProfilePort` canonicalizes them.
- **Error:** `BootstrapSafetyError` carries the failed `BootReadiness` snapshot and original cause
  when profile validation or namespace binding rejects boot before adapters start.
- **Consumers:** composition root, `StateStore`, integration/eval harnesses.

### `BootReadiness`

- **Type:** Service
- **Public Properties:** phase, progress, readiness, failure.
- **Public Operations:** advance connect→poll→reconcile→restore→ready; prepare the first content
  worktree once after ready and expose `WorktreePreparationState`; retry recoverable phase.
- **Lifecycle:** one per process.
- **Events Emitted:** boot phase changed.
- **Errors & Degradation:** read-only UI may open explicitly before ready; effects remain disabled.
- **Consumers:** API and dashboard.
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

### Canonical-state invariant

- Events are append-only and ordered per MR.
- Every acknowledged mutation can be reconstructed from journal data.
- Registry and projections are disposable caches, never canonical truth.
- Production, test and mock roots cannot resolve to the same physical namespace.
- Every observed MR event accumulates into the current change batch and postpones its quiet deadline.
- Any human discussion reply schedules verification through the debounce deadline; manual verification bypasses both timers.
- Real `SyncService` composition appends canonical observations, folds `ReviewState` and re-arms the
  next deadline with `SystemClock`; the timer appends `verification_requested(mode=timer)` durably.

### Storage ports

- **Runtime Backing:** local files in production; in-memory adapters in deterministic tests.
- **Verification Levels:** contract, unit, integration, e2e.
- **Preconditions:** validated event/profile/artifact address.
- **Postconditions:** acknowledged writes survive adapter recovery guarantees.
- **Invariants:** an adapter cannot read or reset another runtime profile.
<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

- Human-reply debounce: default 5 minutes, configurable.
- MR quiet timeout: default 10 minutes, configurable; every MR event postpones it.
- Activity horizon: 3 months from last MR activity.
- Test reset accepts test run-id only; production reset is not a public operation.
- Allowed combinations are only `production + real-work`, `test + real-readonly`, `test + real-effects`, and `mock + deterministic-mock`; real test profiles never bind production state.
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```text
inbox-core/
├── types/                 # Review* value objects/events
├── state/                 # fold, lifecycle, change batch
├── ports/                 # journal/artifact/clock/profile contracts
├── adapters/              # local and in-memory backing
└── boot/                  # readiness and config
```

Existing implementations are moved, not duplicated.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

- `D-CORE-01`: journal is canonical; caches are rebuildable.
- `D-CORE-02`: participation is inclusive, while dashboard placement is singular.
- `D-CORE-03`: profile isolation is a safety boundary, not a naming convention.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** none inside agent-inbox.
- **Provides to:** every sibling module.
- **Scope Reference:** root constraints in [agent-inbox](../agent-inbox.spec.md#4-requirements--constraints).
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to task-scaffolding

- Modify existing journal, state, config, registry and boot implementations.
- Add the four new domain contracts without introducing new runtime services.
- Remove duplicate legacy VCS types only after consumer migration.
- Stack: TypeScript; node:test. Module Rules Additions: None.
<!--/SECTION:HANDOFF-->
