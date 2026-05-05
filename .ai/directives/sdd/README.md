# SDD Directives

Spec-Driven Development flow. Each directive runs as **its own isolated session** and produces a self-contained artifact that becomes the sole input for the next directive.

## Flow

| # | Directive | Input | Output |
|---|-----------|-------|--------|
| 1 | `discovery.directive.xml` | raw operator idea | `specs/<root>.spec.md` (Vision, Project Type, Golden DX, Requirements, Architecture, Decision Log) |
| 2 | `domain-modeling.directive.xml` | root spec | hierarchy of `specs/<domain>/<domain>.spec.md` with entity inventory and DbC contracts per domain |
| 3 | `task-scaffolding.directive.xml` | spec tree | `tasks/<scope>/<scope>.task-NN.md` (DAG of tasks, mandatory linkage to `coding/` and `testing/` rules) |
| 4 | `audit.directive.xml` | task ticket with completed Execution Log + code | `audits/<task-id>.audit.md` with findings and remediation proposals |

Between step 3 and step 4 — task execution by an execution agent (outside the SDD flow itself).

## Principles

- **Isolated sessions.** Each directive runs in its own session. Do not merge directives into a single pass — isolation breaks and context noise accumulates.
- **Stateless artifacts.** Each session's final artifact is 100% self-contained. The next session reads only the artifact, not the conversation history.
- **Closed-world fidelity.** Implementation must not introduce entities absent from the spec. Any deviation is an audit candidate.
- **Decision Log.** Architectural decisions with risks or alternative choices are recorded with rationale **in the operator's own words**. Stable `D-NNN` IDs, extensible format, supersession without deletion of older entries.
- **Mandatory rules linkage.** Every task ticket must reference the relevant `coding/<lang>-rules.xml` and `testing/<framework>.xml`. If rules are missing, the task cannot be generated.
- **Agent neutrality.** Directives surface trade-offs objectively and do not push a single viewpoint. The agent does not auto-agree with the operator: it asks for justification, surfaces risks, and refuses to record a choice without explicit rationale.
- **Phase gates by operator.** The agent signals phase readiness (`READY_TO_ADVANCE`), but only the operator closes the phase. Phase Progress is shown every round.
- **Versioning per directive.** Each directive carries its own `ver` in the root tag. Bump on behavior-affecting changes. History lives in VCS.

## Read first

Before invoking any directive, read `.ai/knowledge.xml` — it contains selection signals (Triggers, SkipWhen, Keywords, Preconditions) for picking the right directive.

## Output paths

- `specs/<root>.spec.md` — root project spec (output of `discovery`).
- `specs/<domain>/<domain>.spec.md` — domain specs, cross-linked (output of `domain-modeling`).
- `specs/README.md` — navigation across the spec tree (output of `domain-modeling`).
- `tasks/<scope>/<scope>.task-NN.md` — task tickets (output of `task-scaffolding`).
- `tasks/README.md` — task tracker with DAG and statuses (output of `task-scaffolding`).
- `audits/<task-id>.audit.md` — audit reports (output of `audit`).
