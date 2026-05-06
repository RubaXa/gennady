# SDD Directives

Spec-Driven Development flow. Each directive runs as **its own isolated session** and produces a self-contained artifact that becomes the sole input for the next directive.

## Flow

| # | Directive | Input | Output |
|---|-----------|-------|--------|
| 1 | `discovery.directive.xml` | raw operator idea | `specs/<root>.spec.md` (Vision, Project Type, Golden DX, Requirements & Constraints incl. §4.5 Project-Wide Rules, Architecture, Decision Log, Handoff) |
| 2 | `domain-modeling.directive.xml` | root spec | hierarchy of `specs/<domain>/<domain>.spec.md` with entity inventory, DbC contracts, and Domain Rules Additions per domain |
| 3 | `task-scaffolding.directive.xml` | spec tree | hierarchical `tasks/` (project README + per-domain READMEs) with Cascade Table, Project-Wide Conventions, DAG, and compact task tickets |
| 4 | `task-execution.directive.xml` | one task ticket + cascade rules | filled Execution Log round + code/test changes; spec updates only proposed, never written by execution |
| 5 | `audit.directive.xml` | DONE round + code | `audits/<task-id>.audit.md` (round-structured, append-only) with findings and remediation proposals |

## Principles

- **Isolated sessions.** Each directive runs in its own session. Do not merge directives into a single pass — isolation breaks and context noise accumulates.
- **Stateless artifacts.** Each session's final artifact is 100% self-contained. The next session reads only the artifact, not the conversation history.
- **Closed-world fidelity.** Implementation must not introduce entities absent from the spec. Any deviation is an audit candidate.
- **Decision Log.** Architectural decisions with risks or alternative choices are recorded with rationale **in the operator's own words**. Stable `D-NNN` IDs, extensible format, supersession without deletion of older entries.
- **Rules cascade.** Rules are declared at three levels — project (root spec §4.5), domain (domain spec §9), task (ticket additions). Effective set per task = union(project ∪ domain ∪ task). The Cascade Table is materialized once in `tasks/README.md`; per-task effective set is baked into each ticket. Categories: `coding`, `testing`, `architecture`, `quality`. Missing rule files abort the directive.
- **Hierarchical tasks.** `tasks/` mirrors `specs/` hierarchy: project-level README at the root with high-level (inter-domain) DAG, per-domain READMEs with intra-domain DAG and detailed tracker, cross-domain integration tasks under `tasks/_integration/`. This scales beyond ~30 tasks where a flat tracker degrades.
- **Compact tickets.** Project-wide content (file-header convention, baseline Completion Rule, Execution Log template, post-task audit hint) lives once in `tasks/README.md`, not duplicated into every ticket. Tickets carry only task-specific Meta + BDD + Verification + Test Coverage + the round-structured Execution Log instance.
- **Task-IDs are stable.** Project-wide unique sequential `TSK-NN`. Code references via `// @tasks TSK-04, TSK-12` (IDs only, never paths). Multiple IDs per file are expected when more than one task touched a file. Append-only — prior IDs are preserved.
- **Append-only logs.** Execution Log structured by rounds; on reopen a new `### Round N` section is appended; prior rounds are immutable. Audit reports follow the same round-append discipline.
- **Reopen vs new task.** A task is reopened (rather than a new bugfix ticket spawned) when the contract holds: same BDD scenarios, same Target Files, internal cause (rules update, refinement, late-detected bug). New scenarios or expanded scope require a new task. Operator triggers reopen; execution agent never decides unilaterally.
- **Spec updates only via proposal.** Execution agent records `Insight: ... Suggested spec update: ...` in the Execution Log. Audit converts these into `INSIGHT_BACKFLOW` findings. Operator approves and applies. Specs are never edited by execution.
- **Mandatory rules linkage.** Every effective rule reference in any source must resolve to an existing file under `.ai/directives/<category>/<rule>.xml`. If anything is missing, scaffolding aborts.
- **Agent neutrality.** Directives surface trade-offs objectively and do not push a single viewpoint. The agent does not auto-agree with the operator: it asks for justification, surfaces risks, and refuses to record a choice without explicit rationale.
- **Phase gates by operator.** The agent signals phase readiness (`READY_TO_ADVANCE`), but only the operator closes the phase. Phase Progress is shown every round.
- **Versioning per directive.** Each directive carries its own `ver` in the root tag. Bump on behavior-affecting changes. History lives in VCS.

## Roles, agents, and activation

Directives govern agents. When directive prose mentions an «agent», «auditor», or similar role, it means: the agent operating under a specific directive. The mapping is:

| Phrase in prose | Means | Activated by |
|---|---|---|
| «discovery agent» / «DX Designer» | agent under `discovery` | `discovery.directive.xml` |
| «domain-modeler» | agent under `domain-modeling` | `domain-modeling.directive.xml` |
| «scaffolding agent» / «task planner» | agent under `task-scaffolding` | `task-scaffolding.directive.xml` |
| «execution agent» / «implementer» | agent under `task-execution` | `task-execution.directive.xml` |
| «auditor» / «audit agent» | agent under `audit` | `audit.directive.xml` |
| «operator» | human triggering directives | — |

When a directive says «activate the `<name>` directive» or «run the `<name>` directive», it means: open a fresh isolated session and load that directive file. Cross-directive axiom references take the form `AX_<NAME>` in `<directive-name>`.

## Modes per directive

Each phase directive auto-detects its operating mode from the operator's intake. Ambiguity halts the directive with a binary clarifying question — modes are NEVER assumed silently.

| Directive | Modes | Detection signal |
|---|---|---|
| `discovery` | `greenfield` / `extension` / `pivot` | No spec link → greenfield. Spec link + verb «extend / add» → extension. Spec link + verb «pivot / replace» → pivot. Spec link without verb → HALT, ask binary question. |
| `domain-modeling` | `initial` / `add-domain` / `refine-domain` | No domain specs yet → initial. Spec tree + «add domain X» → add-domain. Spec tree + «refine X» OR Pivot Invalidation List → refine-domain. Ambiguous → HALT. |
| `task-scaffolding` | `initial` / `extend-dag` | No `tasks/` → initial. `tasks/` exists + clear extension target → extend-dag. Ambiguous → HALT. |
| `task-execution` | (single mode — atomic per task) | — |
| `audit` | `per-task` / `epic-level` (existing `AX_AUDIT_MODES`) | Operator passes one Task-ID → per-task. List of IDs or scope → epic-level. |

**Key rules across all directives:**

- **No spec link = greenfield default.** Silence about existing artifacts means new project from scratch. The directive does NOT scan `specs/` searching for context.
- **Spec link is authoritative.** Cannot be treated as inspiration. If operator means inspiration, they must describe patterns without linking; the directive halts otherwise.
- **Code is never read by phase directives** (`AX_SPEC_IS_SOLE_SOURCE`). Spec is the only source of truth. The single exception is `audit`.

## Pivot mechanics

Pivot mode in `discovery` is the formal mechanism for evolving an existing project's foundational decisions:

- The root spec is **reworked in place** — old content is removed from spec body, not marked `superseded` inline.
- Each rework gets a self-contained Decision Log entry: `Was → Now`, `Why`, `Risk`, `Supersedes`, `Pre-rework state` (git commit-sha for predecessor state).
- §7.1 Pivot Invalidation List enumerates downstream artifacts that became stale: domain specs to refine, tasks to reopen, rules to revisit.
- Downstream phases react: `domain-modeling` runs `refine-domain` for listed domains; `task-execution` reopens listed tasks (new round); `audit` raises `STALE_AFTER_PIVOT` findings for unaddressed items.

Git is the version control mechanism. Old spec states live in git history; the Decision Log entry alone is enough for downstream phases to reconstruct context without reading git.

## Session isolation

**Strict rule:** no two phase directives coexist in one session. The artifact-based handoff requires a clean context boundary between phases. Mixing produces:

| Pair | Why forbidden |
|---|---|
| `discovery` + anything | `AX_ISOLATED_THINKING` forbids reading code/specs while drafting; later phases require reading them |
| `domain-modeling` + `task-scaffolding` | scaffolding reads specs; domain-modeling is still mutating them |
| `task-scaffolding` + `task-execution` | execution starts implementing while planning is unfinished — scope creep |
| `task-execution` + `audit` | self-audit by the same agent is biased; audit needs a fresh-eyes context boundary |

Allowed within ONE session:
- the directive itself + its referenced rule files (`.ai/directives/<category>/<rule>.xml`);
- the directive itself + the spec/ticket artifacts it consumes;
- one directive in `epic-mode` over multiple targets (e.g., `audit` over a list of task-IDs per `AX_AUDIT_MODES`).

## Read first

Before invoking any directive, read `.ai/knowledge.xml` — it contains selection signals (Triggers, SkipWhen, Keywords, Preconditions) for picking the right directive.

## Output paths

- `specs/<root>.spec.md` — root project spec (output of `discovery`).
- `specs/<domain>/<domain>.spec.md` — domain specs, cross-linked (output of `domain-modeling`).
- `specs/README.md` — navigation across the spec tree (output of `domain-modeling`).
- `tasks/README.md` — project-level tracker: Cascade Table, Project-Wide Conventions, high-level DAG, Domain Tracker Index (output of `task-scaffolding`).
- `tasks/<domain>/README.md` — per-domain tracker: intra-domain DAG and detailed task list (output of `task-scaffolding`).
- `tasks/<scope>/<scope>.task-NN.md` — task tickets (output of `task-scaffolding`; updated by `task-execution` per round).
- `tasks/_integration/<scope>.task-NN.md` — cross-domain integration tickets.
- `audits/<task-id>.audit.md` — audit reports, round-structured (output of `audit`).

## Rule directories

- `.ai/directives/coding/` — language and framework rules (e.g., `typescript-rules.xml`, `react-rules.xml`).
- `.ai/directives/testing/` — test framework rules (e.g., `node-test.xml`, `vitest.xml`, `playwright.xml`).
- `.ai/directives/architecture/` — composition pattern rules (e.g., `ports-adapters.xml`, `ddd.xml`).
- `.ai/directives/quality/` — cross-cutting rules (e.g., `naming.xml`, `security.xml`, `accessibility.xml`).
