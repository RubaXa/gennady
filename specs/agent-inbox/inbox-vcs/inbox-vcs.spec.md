# Module: inbox-vcs

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Единственная граница GitLab: полное чтение участия и MR facts, нормализация событий,
безопасное выполнение effects только для exact guarded manifest key и обязательная
reconciliation. VCS не решает, какое действие нужно оператору: он fail-closed
проверяет permission/freshness/provider capability и честно сообщает внешний факт.
Parent: [agent-inbox](../agent-inbox.spec.md).

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```ts
const snapshot = await vcsRead.readMr(ref);
await journal.appendAll(normalizer.diff(previous, snapshot));

const capabilities = await vcsRead.probeCapabilities(snapshot.identity);
const request = VcsEffectRequest.fromGuardedIntent(approvedEffect, capabilities);
const dispatch = await vcsEffects.apply(request);

if (dispatch.kind === 'intent-invalidated') return dispatch;
const outcome = await reconciler.reconcile(request, dispatch);
// reconciled: applied | not-applied | ambiguous
```

Если action поддерживает provider precondition, request несёт exact revision token и
conditional reject возвращается как `not-applied`. Если не поддерживает, adapter
делает не более одного write-вызова на attempt, сохраняет `unconfirmed` и немедленно
передаёт его в mandatory read-after-effect reconciliation. Новое наблюдаемое
`head SHA + event cursor` возвращает typed `intent-invalidated` без mutation.

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
| `VcsEffectRequest`         | Value Object | Guarded idempotency-addressed provider mutation с dispatch policy.      |
| `VcsCapabilities`          | Value Object | Versioned per-action precondition/reconciliation capability snapshot.   |
| `VcsEffectOutcome`         | Value Object | Typed reconciliation либо pre-dispatch intent invalidation.             |
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
- **Public Operations:** выполнить один validated guarded request для comment/reply,
  react, resolve/reopen allowed thread, approve/unapprove, request changes или edit
  description; вернуть conditional reject, unconfirmed dispatch либо typed
  pre-dispatch invalidation без встроенного retry.
- **Lifecycle:** every created request has stable effect/attempt identity; он
  завершается typed pre-dispatch invalidation либо reconciliation, а reconcile-only
  dispatch сохраняет промежуточный `unconfirmed` до readback.
- **Errors & Degradation:** ambiguous transport failure и write без provider
  precondition остаются `unconfirmed` до mandatory reconciliation; adapter не
  повторяет mutation самостоятельно.
- **Consumers:** effect coordinator.

### `VcsPort`

- **Type:** Port
- **Purpose:** Сохраняет существующий compatibility root для потребителей, которым
  пока нужен объединённый read/effect surface.
- **Public Properties:** N/A.
- **Public Operations:** делегировать все операции `VcsReadPort` и `VcsEffectPort`
  без изменения request/outcome contracts.
- **Lifecycle:** process-scoped compatibility boundary; новые consumers используют
  раздельные ports.
- **Events Emitted:** N/A.
- **Errors & Degradation:** сохраняет typed read/effect failures без обёртки в общий
  boolean/result.
- **Consumers:** Internal — legacy inbox CLI/skill and composition root; External — N/A.

### `VcsGitlabPort`

- **Type:** Adapter
- **Purpose:** Единственный real GitLab adapter для read и effect surfaces.
- **Public Properties:** host/operator identity; capability probe version; provider client.
- **Public Operations:** реализовать `VcsReadPort` и `VcsEffectPort`; выполнить
  guarded conditional/reconcile-only dispatch.
- **Lifecycle:** process-scoped, selected for production/real-readonly/real-effects.
- **Events Emitted:** N/A.
- **Errors & Degradation:** API limits, stale guards, permission и provider failures
  сохраняют typed evidence.
- **Consumers:** Internal — composition root; External — GitLab API.

### `ReadonlyEffectGuard`

- **Type:** Adapter
- **Purpose:** Реализует `VcsEffectPort` с гарантированным zero-write поведением.
- **Public Properties:** selected runtime profile.
- **Public Operations:** отклонить любой effect request typed
  `ReadonlyVcsEffectError` до provider I/O.
- **Lifecycle:** process-scoped effect surface в readonly profile.
- **Events Emitted:** N/A.
- **Errors & Degradation:** отказ является ожидаемым typed outcome boundary, не
  fallback к real adapter.
- **Consumers:** Internal — `selectVcsRuntime`; External — real-readonly tests.

### `selectVcsRuntime`

- **Type:** Composition
- **Purpose:** Независимо выбирает read/effect surfaces без смешения state profiles.
- **Public Properties:** N/A.
- **Public Operations:** построить `VcsRuntime` из закрытой `VcsRuntimePolicy`;
  сохранить real reads и поставить `ReadonlyEffectGuard` в readonly profile;
  выбрать isolated mock pair в mock profile.
- **Lifecycle:** вызывается один раз composition root при boot.
- **Events Emitted:** N/A.
- **Errors & Degradation:** неизвестный/неполный profile fail-closed до запуска sync.
- **Consumers:** Internal — application composition root; External — N/A.

### `ReadonlyVcsEffectError`

- **Type:** Error
- **Purpose:** Типизированный zero-write отказ readonly boundary.
- **Public Properties:** runtime profile; effect/attempt identity; reason code.
- **Public Operations:** expose structured diagnostics.
- **Lifecycle:** immutable per rejected request.
- **Events Emitted:** N/A.
- **Errors & Degradation:** N/A; сам является degradation result.
- **Consumers:** Internal — `ReadonlyEffectGuard`; External — queue/API diagnostics.

### `validateVcsEffectRequest`

- **Type:** Function
- **Purpose:** Closed-world validation созданного request непосредственно до I/O.
- **Public Properties:** N/A.
- **Public Operations:** проверить action payload, available capability binding,
  guard, permission evidence, attempt identity и conditional token.
- **Lifecycle:** pure call per dispatch; не создаёт request и не выполняет I/O.
- **Events Emitted:** N/A.
- **Errors & Degradation:** возвращает typed invalid request reasons; unsupported
  capability сюда не попадает, потому что request для неё не создаётся.
- **Consumers:** Internal — `VcsGitlabPort`, `ReadonlyEffectGuard`; External — N/A.

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
  `VcsCapabilities`, `VcsEffectOutcome`.
- **Coordinator support:** `VcsNormalizationResult`, `VcsSyncTarget`, `VcsSyncResult`,
  `VcsPermissionDecision`.
- **Runtime support:** `VcsRuntimePolicy`, `VcsRuntime`.
- **Lifecycle:** immutable per call; no independent persistence.
- **Errors & Degradation:** completeness and unknown outcome remain explicit rather than aliasing
  success.

### `VcsEffectRequest`

- **Type:** Value Object
- **Purpose:** Переносит в единственный VCS write exact queue intent и защиту от
  применения результата не к той версии MR.
- **Public Properties:** effect ID; attempt identity; action kind; normalized payload
  digest; idempotency key; operator/permission evidence; guarded manifest key
  `MR + head SHA + event cursor`; guarded transition/handoff identity; capability
  snapshot version; dispatch policy `conditional-precondition | reconcile-only`;
  provider revision/precondition token для conditional action.
- **Public Operations:** validate closed action payload; verify manifest/capability
  identity; bind provider precondition; derive stable dispatch identity.
- **Lifecycle:** immutable; один external write максимум на attempt identity; новый
  payload, guard или capability binding создаёт новый request digest.
- **Events Emitted:** N/A.
- **Errors & Degradation:** missing guard/permission, stale available capability или
  отсутствие обязательного precondition token отклоняется до I/O; capability
  `unsupported` даёт unavailable evidence до construction, поэтому request не создаётся.
- **Consumers:** Internal — `validateVcsEffectRequest`, `VcsGitlabPort`,
  `VcsPermissionPolicy`, `VcsReconciler`; External — inbox-queue coordinator.

### `VcsCapabilities`

- **Type:** Value Object
- **Purpose:** Фиксирует action-specific возможность provider-side conditional
  mutation, не выдавая глобальный capability за гарантию каждого effect kind.
- **Public Properties:** host/operator; probe version; observed MR identity, head SHA
  и event cursor; per-`VcsEffectKind` mode `conditional-precondition`,
  `reconcile-only` или `unsupported`; provider token kind; reconciliation probe kind;
  observed time/source evidence.
- **Public Operations:** resolve exact action capability; verify snapshot against
  newest observation; вернуть discriminated `available` либо `unavailable` с evidence;
  require supported reconciliation probe для каждого available kind.
- **Lifecycle:** immutable read-only probe result; перечитывается перед каждым dispatch.
- **Events Emitted:** N/A.
- **Errors & Degradation:** unknown action/mode, missing reconciliation probe или
  capability для другой observation fail-closed.
- **Consumers:** Internal — `VcsEffectRequest`, `VcsGitlabPort`, `VcsReconciler`;
  External — inbox-queue.

### `VcsEffectOutcome`

- **Type:** Value Object
- **Purpose:** Отделяет внешний reconciled факт от typed отказа применять уже
  устаревший remaining intent.
- **Public Properties:** kind `reconciled | intent-invalidated`; request/effect/attempt
  identity; guarded manifest key; newest observed key; reconciliation status
  `applied | not-applied | ambiguous` только для `reconciled`; provider conditional
  response; read-after-effect observation/revision; evidence; reason code; time.
- **Public Operations:** classify provider reject/readback; report guard mismatch
  before mutation; prove whether dispatch occurred; expose retry evidence без решения
  о retry.
- **Lifecycle:** immutable; `intent-invalidated` не является reconciled outcome и
  доказывает zero dispatch; `reconciled` создаётся после mandatory provider evidence.
- **Events Emitted:** N/A.
- **Errors & Degradation:** HTTP success/timeout/exception без readback evidence не
  равен `applied`; невозможная классификация остаётся `ambiguous`.
- **Consumers:** Internal — `VcsReconciler`, `VcsSyncCoordinator`; External —
  inbox-queue effect coordinator/API diagnostics.

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
- **Public Operations:** выполнить action-specific read-after-effect; классифицировать
  только `applied | not-applied | ambiguous`; вернуть observation evidence и newly
  observed key; определить retry eligibility без выполнения retry.
- **Lifecycle:** invoked after every effect and recovery.
- **Errors & Degradation:** unknown/ambiguous никогда не reported as success и не
  вызывает blind retry; unavailable reconciliation остаётся наблюдаемым unresolved
  состоянием.
- **Consumers:** queue and API.

### `VcsPermissionPolicy`

- **Type:** Service
- **Public Operations:** authorize action against operator identity, MR ownership and thread authorship.
- **Lifecycle:** evaluated при request validation и повторно непосредственно перед
  external I/O против newest observation.
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
- **Verification Levels:** contract, integration, allowlisted real-effects e2e.
- Каждый effect permission-checked, idempotency-addressed и связан с immutable
  `MR + head SHA + event cursor` guarded manifest key и local transition/handoff ID.
- `validateVcsEffectRequest` до external I/O проверяет closed action payload,
  permission evidence, newest observed key, current per-action capability и dispatch
  policy. Guard mismatch возвращает `VcsEffectOutcome(kind=intent-invalidated)` и
  доказывает, что mutation не dispatch-илась.
- Для `conditional-precondition` request обязан нести exact provider revision/token;
  adapter передаёт его mutation endpoint. Provider conditional reject
  классифицируется `not-applied`, после чего newly observed key инвалидирует
  remaining queue intents.
- Для `reconcile-only` один attempt identity вызывает external mutation не более
  одного раза, затем durable state становится `unconfirmed` независимо от transport
  success. `VcsReconciler` обязательно выполняет action-specific read-after-effect и
  выдаёт ровно `applied | not-applied | ambiguous`.
- Ни `VcsGitlabPort`, ни `VcsReconciler` не делают retry. `ambiguous` запрещает blind
  retry; доказанный `not-applied` лишь возвращает retry eligibility для отдельного
  решения queue с новым attempt record и тем же guarded effect identity.
- Newly observed head/cursor в любом pre-dispatch read возвращает typed
  `intent-invalidated`; observation, появившаяся при reconciliation, включается в
  outcome, чтобы queue инвалидировала ещё не отправленный remainder и запросила delta.
- HTTP success, timeout или exception сами по себе не являются `applied`.
- Resolve truth table: an operator-authored thread is allowed; an allowlisted-bot thread is allowed only when the operator is MR author; every other thread is denied.
- A failed independent effect does not roll back successful siblings.

### Value Object ownership: `VcsCapabilities`, `VcsEffectRequest`, `VcsEffectOutcome`

- `VcsCapabilities` единолично владеет total per-effect-kind mapping provider
  capability. Его result — `available(mode, tokenKind, reconciliationProbe,
evidence)` либо `unavailable(effectKind, reason, evidence)`.
- `VcsEffectRequest` создаётся только из `available` capability и владеет immutable
  guard/attempt/precondition binding. Queue action с `unavailable` capability остаётся
  недоступным с evidence: request, dispatch и `VcsEffectOutcome` не создаются.
- `VcsEffectOutcome` владеет только результатом уже созданного request:
  pre-dispatch `intent-invalidated` либо post-dispatch `reconciled`. Он не кодирует
  package choice и не подменяет unavailable capability.

**Contract (DbC):**

- Preconditions: capability probe относится к newest exact MR observation и содержит
  terminal mapping для каждого закрытого `VcsEffectKind`; request получает только
  `available` result; outcome ссылается на существующий exact request/attempt.
- Postconditions: capability lookup всегда возвращает один typed result; unavailable
  result содержит provider/source/reason evidence и гарантирует zero request/zero
  write; created request/outcome сохраняют один guard digest без преобразования.
- Invariants: permission denial не маскируется capability unavailable; unsupported
  provider action не превращается в reconcile-only; transport result не изменяет
  capability mapping; outcome status вне закрытого discriminated union запрещён.

#### Closed per-effect-kind capability mapping

| `VcsEffectKind`    | Allowed available modes                        | `unsupported` mapping                                  |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------ |
| `comment`          | `conditional-precondition` or `reconcile-only` | unavailable evidence; zero `VcsEffectRequest`/write    |
| `reply`            | `conditional-precondition` or `reconcile-only` | unavailable evidence; zero `VcsEffectRequest`/write    |
| `reaction`         | `conditional-precondition` or `reconcile-only` | unavailable evidence; zero `VcsEffectRequest`/write    |
| `resolve`          | `conditional-precondition` or `reconcile-only` | unavailable evidence; zero `VcsEffectRequest`/write    |
| `reopen`           | `conditional-precondition` or `reconcile-only` | unavailable evidence; zero `VcsEffectRequest`/write    |
| `approve`          | `conditional-precondition` or `reconcile-only` | unavailable evidence; zero `VcsEffectRequest`/write    |
| `unapprove`        | `conditional-precondition` or `reconcile-only` | unavailable evidence; zero `VcsEffectRequest`/write    |
| `request_changes`  | `conditional-precondition` or `reconcile-only` | native action unavailable evidence; zero request/write |
| `edit_description` | `conditional-precondition` or `reconcile-only` | unavailable evidence; zero `VcsEffectRequest`/write    |

Capability probe обязан вернуть строку для всех девяти kinds даже если GitLab host не
поддерживает ни один из них. Отсутствующая строка или unknown kind делает весь probe
invalid; queue не получает частичный optimistic catalog.

### Adapter: `VcsGitlabPort`

- **Implements:** `VcsReadPort`, `VcsEffectPort` through compatibility `VcsPort`.
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** contract, integration, allowlisted e2e.
- **Deferred Runtime Scope:** None.

**Contract (DbC):**

- Preconditions: request прошёл `validateVcsEffectRequest` и
  `VcsPermissionPolicy`; newest observation/capability прочитаны непосредственно перед
  I/O; attempt ещё не отмечен queue как dispatched; conditional mode содержит exact
  provider token.
- Postconditions: stale guard даёт `intent-invalidated` и zero writes; conditional
  request передаёт provider token; reconcile-only request делает ровно один write и
  возвращает unconfirmed dispatch evidence для `VcsReconciler`.
- Invariants: adapter не меняет action kind/payload, не подставляет alternative, не
  объявляет transport success applied и не выполняет retry.

### Adapter: `ReadonlyEffectGuard`

- **Implements:** `VcsEffectPort`.
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** contract, integration.
- **Deferred Runtime Scope:** None.

**Contract (DbC):** любой effect request возвращает typed
`ReadonlyVcsEffectError` до provider I/O; real read surface и production namespace не
изменяются.

### Service: `VcsReconciler`

- **Runtime Backing:** GitLab real runtime; deterministic mock in tests.
- **Verification Levels:** unit, contract, integration, allowlisted e2e.
- **Deferred Runtime Scope:** None.

**Contract (DbC):**

- Preconditions: immutable request, dispatch evidence и action-specific
  reconciliation probe доступны; request/guard/attempt identities совпадают.
- Postconditions: свежий provider read даёт ровно один reconciled status
  `applied | not-applied | ambiguous`, observation identity/key и evidence; newly
  observed mismatch явно возвращается для invalidation queue remainder.
- Invariants: reconciler не выполняет mutation/retry; unavailable/contradictory
  evidence остаётся `ambiguous`, а не optimistic success.

### Service: `VcsPermissionPolicy`

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** unit, contract, integration.
- **Deferred Runtime Scope:** None.

**Contract (DbC):** permission decision содержит operator/MR/thread evidence и
проверяется повторно на newest observation перед I/O; отсутствие или mismatch любого
ownership fact даёт deny. Resolve/reopen следует таблице ниже без исключений для
manual/automatic caller.

#### `request_changes`

- **Preconditions:** current action-specific capability probe reports native
  request-changes support and its conditional/reconcile policy; operator has reviewer
  permission; effect is bound to guarded manifest key/current MR revision and contains
  the blocking review body.
- **Stable identity:** hash of MR, revision/change batch, action kind and normalized body.
- **Postconditions:** a fresh GitLab read observes the operator reviewer state as `requested_changes` on the bound revision.
- **Reconciliation:** transport ambiguity triggers mandatory readback without retry;
  already observed requested-changes state is `applied`, proven absence is
  `not-applied`, indeterminate state is `ambiguous`.
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
- Capability matrix is versioned per effect kind and observation; unknown capability
  fails closed, never silently downgrades conditional action.
- Readonly profile keeps real reads and always rejects writes before dispatch; mock
profile must model conditional reject, unconfirmed, all three reconciliation states
and intent invalidation deterministically.
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```text
services/vcs-client/
├── types/
├── gitlab/
│   ├── vcs-gitlab.port.ts
│   └── vcs-gitlab-inbox.ts
├── vcs-read.port.ts
├── vcs-effect.port.ts
├── vcs-port.ts
├── readonly-effect.guard.ts
├── vcs-runtime.ts
├── validate-vcs-effect-request.ts
├── permission-policy.ts
├── sync-coordinator.ts
├── event-normalizer.ts
└── reconciler.ts
```

**Closed Inventory → File Mapping:**

| Entity                     | Canonical owner file                                          | Explicit compatibility/transition path                                                                                |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `VcsReadPort`              | `services/vcs-client/vcs-read.port.ts`                        | re-export from `services/vcs-client/vcs-port.ts` until compatibility consumers migrate                                |
| `VcsEffectPort`            | `services/vcs-client/vcs-effect.port.ts`                      | re-export from `services/vcs-client/vcs-port.ts` until compatibility consumers migrate                                |
| `VcsPort`                  | `services/vcs-client/vcs-port.ts`                             | same file is the retained compatibility root; no replacement root                                                     |
| `VcsGitlabPort`            | `services/vcs-client/gitlab/vcs-gitlab.port.ts`               | delegates legacy inbox discovery entry at `services/vcs-client/gitlab/vcs-gitlab-inbox.ts`                            |
| `ReadonlyEffectGuard`      | `services/vcs-client/readonly-effect.guard.ts`                | None                                                                                                                  |
| `ReadonlyVcsEffectError`   | `services/vcs-client/types/readonly-vcs-effect-error.type.ts` | re-export from `services/vcs-client/readonly-effect.guard.ts` while callers migrate                                   |
| `selectVcsRuntime`         | `services/vcs-client/vcs-runtime.ts`                          | None                                                                                                                  |
| `VcsRuntimePolicy`         | `services/vcs-client/types/vcs-runtime-policy.type.ts`        | re-export from `services/vcs-client/vcs-runtime.ts`                                                                   |
| `VcsRuntime`               | `services/vcs-client/types/vcs-runtime.type.ts`               | re-export from `services/vcs-client/vcs-runtime.ts`                                                                   |
| `MrDetail`                 | `services/vcs-client/types/mr-detail.type.ts`                 | re-export from `services/vcs-client/vcs-port.ts`                                                                      |
| `VcsDiscussion`            | `services/vcs-client/types/vcs-discussion.type.ts`            | re-export from `services/vcs-client/vcs-port.ts`                                                                      |
| `VcsDiscussionNote`        | `services/vcs-client/types/vcs-discussion-note.type.ts`       | re-export from `services/vcs-client/vcs-port.ts`                                                                      |
| `DiscussionsPageInfo`      | `services/vcs-client/types/discussions-page-info.type.ts`     | re-export from `services/vcs-client/vcs-port.ts`                                                                      |
| `DiscussionsPage`          | `services/vcs-client/types/discussions-page.type.ts`          | re-export from `services/vcs-client/vcs-port.ts`                                                                      |
| `CompareResult`            | `services/vcs-client/types/compare-result.type.ts`            | re-export from `services/vcs-client/vcs-port.ts`                                                                      |
| `VcsApprovalsResult`       | `services/vcs-client/types/vcs-approvals-result.type.ts`      | re-export from `services/vcs-client/vcs-port.ts`                                                                      |
| `VcsReviewerState`         | `services/vcs-client/types/vcs-reviewer-state.type.ts`        | re-export from `services/vcs-client/vcs-port.ts`                                                                      |
| `VcsParticipation`         | `services/vcs-client/types/vcs-participation.type.ts`         | re-export from `services/vcs-client/vcs-port.ts`                                                                      |
| `VcsSnapshotCompleteness`  | `services/vcs-client/types/vcs-snapshot-completeness.type.ts` | re-export from `services/vcs-client/vcs-port.ts`                                                                      |
| `VcsSnapshot`              | `services/vcs-client/types/vcs-snapshot.type.ts`              | re-export from `services/vcs-client/vcs-port.ts`                                                                      |
| `VcsEffectKind`            | `services/vcs-client/types/vcs-effect-kind.type.ts`           | re-export from `services/vcs-client/vcs-effect.port.ts`                                                               |
| `VcsEffectPermission`      | `services/vcs-client/types/vcs-effect-permission.type.ts`     | re-export from `services/vcs-client/vcs-effect.port.ts`                                                               |
| `VcsEffectRequest`         | `services/vcs-client/types/vcs-effect-request.type.ts`        | re-export from `services/vcs-client/vcs-effect.port.ts`                                                               |
| `VcsCapabilities`          | `services/vcs-client/types/vcs-capabilities.type.ts`          | re-export from `services/vcs-client/vcs-port.ts` for compatibility probes                                             |
| `VcsEffectOutcome`         | `services/vcs-client/types/vcs-effect-outcome.type.ts`        | re-export from `services/vcs-client/vcs-effect.port.ts`                                                               |
| `validateVcsEffectRequest` | `services/vcs-client/validate-vcs-effect-request.ts`          | None                                                                                                                  |
| `VcsNormalizationResult`   | `services/vcs-client/types/vcs-normalization-result.type.ts`  | re-export from `services/vcs-client/event-normalizer.ts`                                                              |
| `VcsEventNormalizer`       | `services/vcs-client/event-normalizer.ts`                     | None                                                                                                                  |
| `VcsSyncTarget`            | `services/vcs-client/types/vcs-sync-target.type.ts`           | re-export from `services/vcs-client/sync-coordinator.ts`                                                              |
| `VcsSyncResult`            | `services/vcs-client/types/vcs-sync-result.type.ts`           | re-export from `services/vcs-client/sync-coordinator.ts`                                                              |
| `VcsSyncCoordinator`       | `services/vcs-client/sync-coordinator.ts`                     | `services/vcs-client/gitlab/vcs-gitlab-inbox.ts` remains a delegated legacy discovery entry, not a second coordinator |
| `VcsReconciler`            | `services/vcs-client/reconciler.ts`                           | None; never an effect executor                                                                                        |
| `VcsPermissionDecision`    | `services/vcs-client/types/vcs-permission-decision.type.ts`   | re-export from `services/vcs-client/permission-policy.ts`                                                             |
| `VcsPermissionPolicy`      | `services/vcs-client/permission-policy.ts`                    | None                                                                                                                  |

Таблица является total mapping всех 34 inventory entities. `vcs-port.ts` сохраняется
как один compatibility root, а `vcs-gitlab-inbox.ts` — как точка совместимости
рабочего `inbox --json`; они делегируют canonical owners и не владеют дублирующей
business logic. Никакой иной `VcsInbox*` hierarchy не создаётся. Каждый файл ≤1500
строк; Value Objects имеют отдельные `*.type.ts`.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

- `D-VCS-01`: GitLab is canonical for external state; journal is canonical for local process history.
- `D-VCS-02`: reads and effects are separate ports because readonly and real-effects profiles vary independently.
- `D-VCS-03`: `VcsGitlabPort` is the introduced real adapter name; it implements both independent
  surfaces through the pre-existing `VcsPort` compatibility root. Separate GitLab read/effect
  classes are intentionally not introduced because that would create a third provider hierarchy.

### D-VCS-04 — Guarded action-specific dispatch and reconciliation

- **Status:** active
- **Recorded:** session ModuleDecomposition, agent-inbox/inbox-vcs, freshness refine
- **Why:** локально свежий queue intent не гарантирует неизменность GitLab перед
  mutation; VCS обязан применить provider precondition для конкретного action либо
  честно оставить единственный dispatch unconfirmed до read-after-effect.
- **Risk accepted:** provider без conditional endpoint может дать `ambiguous`, который
  требует operator/new observation и не повторяется автоматически.
- **Rejected alternatives:** глобальный capability flag; pre-effect read как
достаточная гарантия; retry внутри adapter/reconciler; HTTP success как applied.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** [inbox-core](../inbox-core/inbox-core.spec.md) — newest observed
  `MR + head SHA + event cursor`, journal evidence и normalized event ordering.
- **Provides directly to:** [pipeline](../inbox-pipeline/inbox-pipeline.spec.md), [queue](../inbox-queue/inbox-queue.spec.md), [eval](../inbox-eval/inbox-eval.spec.md). API observes VCS transitively through pipeline/queue.
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to task-scaffolding

- Consolidate the two existing VCS implementations; do not create a third.
- Extend sync before migrating BoardProvider and legacy scheduler consumers.
- Contract tests run against real, readonly and mock implementations.
- **Implementation files to create/modify:** files from §7; переиспользовать
  `VcsPort`, `VcsGitlabPort`, `VcsPermissionPolicy`, `VcsReconciler` и существующие
  effect methods, не вводить новый provider/executor hierarchy.
- **Test files to create/modify:** mirrored contract/unit/integration tests under
  `test/agent-inbox/inbox-vcs/`; allowlisted real-effects подтверждает только явно
  разрешённые targets.
- **Stack dependencies:**
  - Language: `TypeScript` (`ai/directives/coding/typescript-rules.xml`)
  - Test framework: `node:test` (`ai/directives/testing/common.xml`,
    `ai/directives/testing/node-test.xml`)
- **Module Rules Additions:** None.
- **Open risks & validation needs:** GitLab capability/precondition support нужно
  зафиксировать отдельно для каждого effect kind; recovery legacy attempts не может
  объявить applied без provider/readback evidence.

### Scaffolding coverage obligations

1. Guard BDD: mismatched `MR + head SHA + event cursor`, missing guarded transition
   или stale capability возвращает typed `intent-invalidated` с zero dispatch.
2. Capability BDD: probe возвращает terminal `available | unavailable` для всех
   девяти `VcsEffectKind`; каждая unavailable строка содержит evidence и создаёт zero
   `VcsEffectRequest`, zero dispatch и zero `VcsEffectOutcome`.
3. Conditional BDD: каждый supported effect kind несёт exact provider token;
   conditional rejection даёт `not-applied` и newest key для invalidation remainder.
4. Reconcile-only BDD: unsupported precondition выполняет максимум один write на
   attempt, становится `unconfirmed` и только mandatory readback даёт
   `applied | not-applied | ambiguous`; transport success не означает applied.
5. Recovery BDD: timeout/crash/ambiguous начинает с reconciliation; VCS adapter и
   reconciler никогда не выполняют blind retry. Доказанный `not-applied` возвращает
   только retry eligibility, не mutation.
6. Fresh observation BDD: новое head/cursor до dispatch даёт intent invalidation, а
   новое observation во время readback входит в outcome и инвалидирует remaining
   queue intents через typed handoff.
7. Policy/profile BDD: permission truth table неизменна; readonly делает zero writes;
mock детерминированно покрывает conditional reject, unconfirmed и все outcomes;
live writes требуют explicit allowlist.
<!--/SECTION:HANDOFF-->
