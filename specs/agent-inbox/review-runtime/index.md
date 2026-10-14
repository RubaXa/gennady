# Review Runtime Specifications

Навигационный индекс; не runtime-модуль и не владелец контрактов.

1. [Pipeline](../inbox-pipeline/inbox-pipeline.spec.md) — full/delta/cross-review и evidence.
2. [Queue](../inbox-queue/inbox-queue.spec.md) — tasks, packages, decisions, effects и outcomes.
3. [Agent Runtime](../inbox-opencode/inbox-opencode.spec.md) — prompts, sessions и tool trace.

```mermaid
flowchart LR
  Queue --> Pipeline
  Pipeline --> AgentRuntime
```
