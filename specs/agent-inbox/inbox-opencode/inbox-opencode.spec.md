# Module: inbox-opencode

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Agent runtime boundary: compiled prompts, structured outcomes, context-aware session routing
and auditable tool traces. Parent: [agent-inbox](../agent-inbox.spec.md).

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```ts
const session = await sessions.route(task.sessionPolicy);
const result = await agentRuntime.run(session, promptCompiler.compile(task));
schemas.assert(task.type, result.output);
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                     | Type         | Purpose                                                 |
| ------------------------ | ------------ | ------------------------------------------------------- |
| `AgentRuntimePort`       | Port         | Execute and continue structured agent work.             |
| `OpenCodeAgentAdapter`   | Adapter      | Real OpenCode-compatible implementation.                |
| `AgentPromptCompiler`    | Service      | Compile pointer-based versioned prompts.                |
| `AgentSchemaRegistry`    | Service      | Validate task outcomes.                                 |
| `AgentSession`           | Entity       | Task or operator context identity.                      |
| `AgentSessionPool`       | Service      | Limit and prioritize concurrent sessions.               |
| `AgentSessionLifecycle`  | Service      | Create, continue, park, restore and expire sessions.    |
| `SessionRegistry`        | Service      | Reused in-memory identity index for the one lifecycle.  |
| `AgentOutcomeClassifier` | Service      | Classify transport, schema and task outcomes.           |
| `AgentCoverageTrace`     | Value Object | Observed file/tool activity used by coverage gate.      |
| `OpenCodeMock`           | Adapter      | Deterministic adapter satisfying the same runtime port. |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### Runtime and adapter

- **Public Operations:** run, continue, stream, cancel and inspect session outcome.
- **Lifecycle:** one shared server; bounded session pool.
- **Errors & Degradation:** unavailable runtime fails affected tasks visibly; it does not fabricate output.
- **Consumers:** pipeline and chat.

### Prompt/schema services

- **Public Operations:** compile task intent with artifact/SHA pointers; validate versioned structured output.
- **Lifecycle:** stateless registries loaded at boot.
- **Errors & Degradation:** schema mismatch is retryable task failure with raw evidence retained.
- **Consumers:** all agent tasks.

### Session services and trace

- **Public Operations:** route by required context, park with TTL, restore metadata, expose tool trace.
- **Lifecycle:** producer continuation stays in the same session; fact-check/widen may use a new session; one persistent operator session per MR.
- **Errors & Degradation:** expired context requires explicit fresh run; coverage cannot be inferred without trace.
- **Consumers:** queue, pipeline, eval.
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

- Prompts pass stable paths, SHA and artifact addresses instead of copying repository content inline.
- Every result is attributed to session, task and model.
- Session choice follows semantic context, not arbitrary reuse.
- Runtime backing: OpenCode-compatible server; test double for deterministic tests.
- Verification: contract, integration and real review e2e.
<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

- Session TTL is configurable; exact default remains an implementation policy within 30–60 minutes.
- Pool concurrency and priorities cannot override per-MR task ordering.
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```text
inbox-opencode/
├── ports/
├── adapters/
├── prompts/
├── schemas/
├── sessions/
└── outcomes/
```

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

- `D-AGENT-01`: `AgentRuntimePort` generalizes the existing OpenCode port; no parallel hierarchy.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** [core](../inbox-core/inbox-core.spec.md) artifact/session metadata.
- **Provides to:** [pipeline](../inbox-pipeline/inbox-pipeline.spec.md), [chat](../inbox-chat/inbox-chat.spec.md).
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to task-scaffolding

- Rename/adapt current port without replacing working session registry, pool and lifecycle.
- Move outcome classifier and phase telemetry from legacy roles.
- Stack: TypeScript; node:test. Module Rules Additions: None.
<!--/SECTION:HANDOFF-->
