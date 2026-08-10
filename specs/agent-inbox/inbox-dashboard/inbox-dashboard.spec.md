# Module: inbox-dashboard

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Carbon & Steel cockpit: две очереди ответственности, одна карточка на MR, умная лента,
артефакты, чат и непосредственное применение GitLab actions. Parent: [agent-inbox](../agent-inbox.spec.md).
Visual references: [design system](./design-system.md), [use cases](./ux-usecases.md).

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```tsx
<ResponsibilityQueues onOpen={openMr} />
<MrWorkspace mr={selectedMr} onApplyPackage={applySelection} onVerify={verifyNow} />
await clipboard.writeAndAcknowledge(generatedHandoff);
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                   | Type            | Purpose                                                      |
| ---------------------- | --------------- | ------------------------------------------------------------ |
| `ResponsibilityQueue`  | UI Entity       | Review or owned/assigned prioritized MR list.                |
| `ReviewMrCard`         | UI Entity       | Unique compact MR summary and processing state.              |
| `ReviewStateChip`      | UI Value Object | One simultaneous reason for attention or progress.           |
| `ReviewFeed`           | UI Entity       | Chronological smart-widget stream.                           |
| `ReviewWidget`         | UI Entity       | Findings, thread, artifact, event, progress or action block. |
| `ReviewPackageWidget`  | UI Entity       | Editable checkbox action package and outcomes.               |
| `ReviewArtifactViewer` | UI Entity       | Addressable full artifact and selection context.             |
| `ReviewChatPanel`      | UI Entity       | Persistent anchored MR conversation.                         |
| `ReviewHandoffControl` | UI Entity       | Full/delta clipboard handoff control.                        |
| `ClipboardAdapter`     | Adapter         | Browser clipboard write and delivery acknowledgement.        |
| `ReviewDesignSystem`   | Pattern         | Carbon & Steel tokens, typography and interaction states.    |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### Queues, card and chips

- **Public Operations:** sort by `decision-required → agent-working → external-wait → no-action`, then urgency/activity; open MR; show roles, title, approvals, reviewers, CI, thread counts, unread, new commits, current work, verification timer and simultaneous attention states.
- **Lifecycle:** an MR appears in exactly one queue; a terminal MR within the activity horizon exposes Complete; description update is always available while the card is visible.
- **Errors & Degradation:** stale/degraded data is visible on the card.
- **Consumers:** operator.

### Feed and widgets

- **Public Operations:** render cyclic and one-shot widgets, unread boundary, expand history, invoke contextual actions.
- **Lifecycle:** cyclic widgets bump by last activity; resolved one-shot events sink into history.
- **Errors & Degradation:** failure stays inside the affected widget with retry.
- **Consumers:** operator.

### Package, artifact, chat and handoff

- **Public Operations:** select/edit/apply actions; inspect/anchor artifacts; chat; verify now; copy full/delta task.
- **Lifecycle:** package refreshes on invalidation; applied actions display independent outcomes.
- **Errors & Degradation:** clipboard/effect/chat failures remain local and actionable.
- **Consumers:** operator and DEV-agent via clipboard.
- **Stale package:** remains visible with old revision, invalidation reason, disabled apply controls and link/status for replacement verification.

### Clipboard adapter

- **Public Operations:** write generated text; acknowledge delivery only after browser success.
- **Lifecycle:** browser-scoped and invoked by `ReviewHandoffControl`.
- **Errors & Degradation:** permission failure leaves the previous handoff baseline unchanged and offers retry without file fallback.
- **Consumers:** handoff control.

### Design system

- **Public Operations:** provide carbon surfaces, GitLab orange accent, Geist and JetBrains Mono, dense cockpit states.
- **Lifecycle:** shared by all dashboard screens.
- **Errors & Degradation:** accessible labels and non-colour status cues are mandatory.
- **Consumers:** all UI entities.
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

- Columns are `Review` and `Mine / Assigned`; state chips do not duplicate cards.
- Cards older than the three-month activity horizon are absent even when terminal and not manually completed; their local history is retained outside the active dashboard.
- “Complete” exists only for merged/closed MR; “Update description” always exists.
- Recommended package actions start selected; alternatives and dependencies are understandable before apply.
- Apply is immediate for non-fatal GitLab writes; per-action progress/outcomes remain visible.
- Active MR feed is smart-widget chronology, not fixed sections or raw event log.
- The feed includes Findings, Awaiting Threads, Artifact Post, GitLab Event, Progress Group, Current Plan and one-shot Action Outcome widgets plus a new-since-last-read boundary.
- Runtime backing: production React/Vite bundle against real local API; visual e2e and real-MR proof.
<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

- Board is the v0 default; alternative board modes are deferred.
- Agent terminal/chat supplements contextual actions and never replaces them.
- Responsive layout may switch panels but must preserve mounted task/chat state.
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```text
inbox-dashboard/
├── app/
├── board/
├── workspace/widgets/
├── artifacts/
├── chat/
├── handoff/
├── services/
└── styles/
```

Retire unused role/Kanban components and the competing monolithic UI after feature migration.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

- `D-UI-01`: behaviour follows product specs; Carbon & Steel references govern visual language.
- `D-UI-02`: one component tree remains after migration.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** [API](../inbox-api/inbox-api.spec.md) only; clipboard is a dashboard-owned browser adapter.
- **Provides to:** local operator.
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to task-scaffolding

- Reuse artifact/chat/selection components and extract useful ActionPanel behavior.
- Rebuild production bundle before every visual acceptance run.
- Stack: TypeScript/React; node:test and Playwright. Module Rules Additions: existing visual-proof rules.
<!--/SECTION:HANDOFF-->
