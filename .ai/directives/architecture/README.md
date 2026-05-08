# Architecture rules

Architectural patterns constraining HOW components compose and depend on each other.

Distinct from `coding/` (language-level rules) and `quality/` (cross-cutting code quality).

## Currently available

_(none yet)_

## Planned

- `ports-adapters.xml` — hexagonal architecture: ports as abstractions, adapters as implementations, dependency direction (business logic depends on ports, not adapters).
- `ddd.xml` — Domain-Driven Design tactical patterns: aggregates, entities vs value objects, domain events, bounded contexts.
- `event-sourcing.xml` — event-sourced state: append-only event log, projections, eventual consistency.
- `cqrs.xml` — command/query separation: write models vs read models.
- `layered.xml` — classic n-tier (presentation / application / domain / infrastructure).

## How they're activated

Architecture rules are referenced from `discovery` §4.5 Project-Wide Rules (when chosen at project level) or from domain spec §9 Domain Rules Additions (when scoped to one domain). They typically activate `now` per `AX_RULE_ACTIVATION_DEFAULTS` — strong opinions deserve operator buy-in.
