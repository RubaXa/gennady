# Module: inbox-chat

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

MR-scoped operator dialogue, artifact anchors/mutations and clipboard handoff to a DEV-agent.
Parent: [agent-inbox](../agent-inbox.spec.md).

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```ts
await chat.ask(mr, question, artifactAnchor);
const handoff = await handoffs.generate(mr, { mode: 'delta' });
await handoffs.acknowledgeDelivery(handoff.id, browserDeliveryReceipt);
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                     | Type         | Purpose                                                       |
| ------------------------ | ------------ | ------------------------------------------------------------- |
| `ReviewChatSession`      | Entity       | Persistent operator dialogue for one MR.                      |
| `ReviewChatTurn`         | Event        | Attributed operator or agent message.                         |
| `ReviewAnchor`           | Value Object | Widget, fragment and artifact address.                        |
| `ReviewMutation`         | Entity       | Versioned artifact change with undo snapshot.                 |
| `ReviewHandoff`          | Entity       | Clipboard-ready DEV-agent instruction.                        |
| `ReviewHandoffSnapshot`  | Entity       | Baseline for later delta handoff.                             |
| `ReviewHandoffGenerator` | Service      | Generate full or delta instruction from artifacts.            |
| `ReviewHandoffDelivery`  | Event        | Acknowledged clipboard delivery used to advance the baseline. |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### Chat, turns and anchors

- **Public Operations:** ask, stream, attach anchor, route follow-up to required session.
- **Lifecycle:** one persistent chat per MR; turns are append-only journal events.
- **Errors & Degradation:** unavailable agent preserves pending question and supports retry.
- **Consumers:** dashboard and agent runtime.

### Artifact mutation

- **Public Operations:** propose, apply after decision, record revision, undo from snapshot.
- **Lifecycle:** serialized per artifact; every mutation is attributable.
- **Errors & Degradation:** revision conflict rejects mutation and refreshes current artifact.
- **Consumers:** chat and artifact viewer.

### Handoff and clipboard

- **Public Operations:** generate full context or delta since prior acknowledged delivery; acknowledge delivered text and advance baseline.
- **Lifecycle:** generation creates a pending handoff; baseline advances only after the browser confirms successful clipboard write.
- **Errors & Degradation:** an unacknowledged handoff remains pending and cannot consume the delta baseline.
- **Consumers:** operator and external DEV-agent.
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

- Handoff is available on every tracked MR, independent of participation role.
- Default repeat handoff contains changed artifact fragments and required artifact pointers.
- Full mode references the complete current artifact set without embedding repository content.
- Every handoff includes current SHA, MR goal, selected findings, changed artifact fragments, mandatory paths/anchors and verification criteria.
- A single finding or an operator-selected finding group can be generated as a task through the same generator and baseline model.
- Empty delta produces an explicit “no artifact changes since delivered baseline” instruction; a missing required artifact blocks generation and lists the missing address.
- Anchors survive feed reorder through stable widget/fragment/artifact identity.

### Handoff delivery contract

- **Preconditions:** candidate belongs to the current MR/baseline and receipt confirms browser clipboard success.
- **Postconditions:** one delivery event is journaled and the next delta uses this candidate as baseline.
- **Invariants:** generation or failed clipboard write never advances the baseline.
- **Runtime Backing:** real local generator plus browser receipt through API; deterministic test adapters.
- **Verification Levels:** unit, integration and browser e2e.
<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

- Handoff mode: `delta` by default, `full` explicitly.
- Clipboard only; downloadable task files are out of scope.
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```text
inbox-chat/
├── chat/
├── anchors/
├── mutations/
├── handoff/
└── handoff/delivery-events/
```

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

- `D-CHAT-01`: existing fix-task copy is extracted and extended, not reimplemented in React.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** [core](../inbox-core/inbox-core.spec.md), [pipeline](../inbox-pipeline/inbox-pipeline.spec.md), [opencode](../inbox-opencode/inbox-opencode.spec.md).
- **Provides directly to:** [API](../inbox-api/inbox-api.spec.md). Dashboard consumes chat state transitively through API.
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to task-scaffolding

- Preserve current transcript, anchor and mutation machinery.
- Extract `composeFixTask`/delta behavior from the legacy dashboard component.
- Stack: TypeScript; node:test and browser integration tests. Module Rules Additions: None.
<!--/SECTION:HANDOFF-->
