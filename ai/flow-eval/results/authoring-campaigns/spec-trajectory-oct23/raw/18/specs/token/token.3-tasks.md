# Tasks: token

## Scope Spec
- [Scope spec](./token.spec.md)

## Cascade Table
Effective rules for this scope, from the Scope Graph (depends-on transitive closure). Tier order (low → high on collision): traversed-scopes → target-scope → module → phase.
| Tier | coding | testing | architecture | infra |
|------|--------|---------|--------------|-------|
| infra-base (traversed) | — | — | — | — |
| token (target) | — | — | — | — |

## Inter-Module DAG
```mermaid
graph TD
  normalize
```

## Tracker
| Task-ID | Title | Module | Dependencies | Status | Reopens |
|---------|-------|--------|--------------|--------|---------|
| NOR-normalize | Normalize ASCII token | normalize | — | [ ] TODO | — |
| NOR-reject | Reject empty token | normalize | NOR-normalize | [ ] TODO | — |

## Decision Log (scope task level)
No scope-level decisions or approvals recorded; handoff remains pending-operator. Approval #2 is not applicable to this authoring pass because no reviewed ticket set exists and the module index is the narrowest ticket owner.
