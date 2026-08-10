# Operator Assistant Specifications

Навигационный индекс; продуктовые контракты принадлежат дочерним спецификациям.

1. [Chat and handoff](../inbox-chat/inbox-chat.spec.md).
2. [Local API](../inbox-api/inbox-api.spec.md).
3. [Dashboard](../inbox-dashboard/inbox-dashboard.spec.md).

```mermaid
flowchart LR
  Dashboard --> API --> Chat
```

Arrow direction: `module --> dependency`.
