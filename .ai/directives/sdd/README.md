# SDD Directives

Spec-Driven Development. Two **orthogonal tracks** converge at task-scaffolding. Each directive runs in **its own isolated session** and produces a self-contained artifact.

## Flow

```
              Application track (what we build)
              ┌───────────────────────────────────────┐
              │ discovery (1) → domain-modeling (2)   │──┐
              └───────────────────────────────────────┘  │
                                                         ├──> task-scaffolding ──> task-execution ──> audit
              Infrastructure track (how we work)         │
              ┌───────────────────────────────────────┐  │
              │ infra-discovery (independent)         │──┘
              └───────────────────────────────────────┘
```

The two tracks are independent. Either or both can be active:
- **SANDBOX-style projects** (pure dev environment / tooling repo) — only the infrastructure track is run.
- **Application without SDD-owned infra** — only the application track (rare; usually means infra exists outside SDD ownership).
- **Full project** (e.g., messenger) — both tracks, in any order, in separate sessions.

Both tracks converge at `task-scaffolding`, which detects which tracks are present and produces a unified DAG.

| Directive | Track | Input | Output |
|-----------|-------|-------|--------|
| `discovery.directive.xml` | application | raw operator idea | `specs/<root>.spec.md` (Vision, Project Type, Golden DX, Requirements incl. §4.5 Project-Wide Rules, Architecture, Decision Log, Handoff) |
| `domain-modeling.directive.xml` | application | root spec | hierarchy of `specs/<domain>/<domain>.spec.md` with entity inventory, DbC contracts, Domain Rules Additions per domain |
| `infra-discovery.directive.xml` | infrastructure | raw operator tooling intent | `specs/_infrastructure/_infrastructure.spec.md` (Vision, Tool Stack via Decision Log, Developer Workflow Example, File Structure, Effective Rules for cascade, Handoff) |
| `task-scaffolding.directive.xml` | convergence | both spec trees (or one) | hierarchical `tasks/` (project README + `_infrastructure/` README + per-domain READMEs) with 4-tier Cascade Table, Project-Wide Conventions, DAG, compact tickets |
| `task-execution.directive.xml` | execution | one ticket + cascade rules | filled Execution Log round + code/config changes; spec updates only proposed, never written |
| `audit.directive.xml` | verification | DONE round + code | `audits/<task-id>.audit.md` (round-structured, append-only) with findings and remediation proposals |

## Principles

- **Isolated sessions.** Each directive runs in its own session. Do not merge directives into a single pass — isolation breaks and context noise accumulates.
- **Stateless artifacts.** Each session's final artifact is 100% self-contained. The next session reads only the artifact, not the conversation history.
- **Closed-world fidelity.** Implementation must not introduce entities absent from the spec. Any deviation is an audit candidate.
- **Decision Log.** Architectural decisions with risks or alternative choices are recorded with rationale **in the operator's own words**. Stable `D-NNN` IDs, extensible format, supersession without deletion of older entries.
- **Rules cascade (4 tiers).** Rules are declared at four orthogonal levels: `infra` (infrastructure spec §5, derived from chosen tools — when infra track present), `project` (root spec §4.5 — when application track present), `domain:<name>` (domain spec §9), `task` (ticket additions). Effective set per task = union of all present tiers, with later tiers overriding earlier on collisions. Cascade Table is materialized once in `tasks/README.md`; per-task effective set is baked into each ticket. Categories: `coding`, `testing`, `architecture`, `quality`. Missing rule files abort the directive.
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
| «infra-discovery agent» / «DevOps engineer / tooling architect» | agent under `infra-discovery` | `infra-discovery.directive.xml` |
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
| `infra-discovery` | `greenfield` / `extension` / `pivot` | No infra spec link → greenfield. Spec link + verb «extend / add tool» → extension. Spec link + verb «pivot / replace» → pivot. Spec link without verb → HALT. |
| `task-scaffolding` | `initial` / `extend-dag` | No `tasks/` → initial. `tasks/` exists + clear extension target → extend-dag. Also detects which tracks (infra / application / both) are present in spec tree. |
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
| `infra-discovery` + anything | same isolation principle as `discovery` — tooling decisions need a clean room |
| `discovery` + `infra-discovery` | even though tracks are orthogonal, mixing application and infra dialogue in one session loses focus; run each in its own session |
| `domain-modeling` + `task-scaffolding` | scaffolding reads specs; domain-modeling is still mutating them |
| `task-scaffolding` + `task-execution` | execution starts implementing while planning is unfinished — scope creep |
| `task-execution` + `audit` | self-audit by the same agent is biased; audit needs a fresh-eyes context boundary |

Allowed within ONE session:
- the directive itself + its referenced rule files (`.ai/directives/<category>/<rule>.xml`);
- the directive itself + the spec/ticket artifacts it consumes;
- one directive in `epic-mode` over multiple targets (e.g., `audit` over a list of task-IDs per `AX_AUDIT_MODES`).

## Read first

Before invoking any directive, read `.ai/knowledge.xml` — it contains selection signals (Triggers, SkipWhen, Keywords, Preconditions) for picking the right directive.

## File access discipline

**Open referenced files directly via the Read tool. Do NOT search-then-read.**

All paths in directives, specs, tickets, and cascade tables are canonical addresses — not hints. When a directive references `.ai/directives/<category>/<rule>.xml` or any other artifact, the Read tool with that exact path is the only tool needed.

Why this matters: the SDD meta-directory `.ai/` starts with a dot. Many tool environments (sandboxes, search utilities, IDEs with default filters) exclude hidden directories. An agent that runs `find` or `glob` before `Read` may get an empty result and falsely conclude the file is missing — when it simply wasn't searched. Read directly bypasses this entirely: it succeeds with content, or fails with a clear error you can escalate.

Discipline:
- Path is given → Read it. No verification step beforehand.
- Read fails → escalate via `[!] BLOCKED` with the exact failing path. Do NOT fall back to `find` / `glob` / `grep` looking for alternatives.
- Path is unknown (rare in SDD context — usually paths are explicit in cascade / ticket / spec) → only then is search appropriate.

## Output paths

**Application track:**
- `specs/<root>.spec.md` — root project spec (output of `discovery`).
- `specs/<domain>/<domain>.spec.md` — domain specs, cross-linked (output of `domain-modeling`).
- `specs/README.md` — navigation across the spec tree (output of `domain-modeling`).

**Infrastructure track:**
- `specs/_infrastructure/_infrastructure.spec.md` — infrastructure spec with Tool Stack, Developer Workflow Example, Effective Rules (output of `infra-discovery`).

**Tasks (convergence — both tracks contribute):**
- `tasks/README.md` — project-level tracker: 4-tier Cascade Table, Project-Wide Conventions, high-level DAG, Tracker Index (output of `task-scaffolding`).
- `tasks/_infrastructure/README.md` — infra tracker (when infra track is present).
- `tasks/<domain>/README.md` — per-domain tracker: intra-domain DAG and detailed task list (when application track is present).
- `tasks/<scope>/<scope>.task-NN.md` — task tickets (output of `task-scaffolding`; updated by `task-execution` per round).
- `tasks/_integration/<scope>.task-NN.md` — cross-domain integration tickets.

**Audit:**
- `audits/<task-id>.audit.md` — audit reports, round-structured (output of `audit`).

## Rule directories

Each category has its own README listing currently-available and planned rule files. Categories cascade: `infra` (from `infra-discovery`) → `project` (from `discovery` §4.5) → `domain` (from `domain-modeling` §9) → `task` (per ticket).

| Category | Purpose | Currently available |
|---|---|---|
| [`coding/`](../coding/README.md) | language + framework rules (HOW to write code) | `typescript-rules.xml` |
| [`testing/`](../testing/README.md) | test framework usage | `node-test.xml`, `vitest-rules.xml` |
| [`architecture/`](../architecture/README.md) | composition pattern rules | _(none yet — `ports-adapters.xml` planned)_ |
| [`quality/`](../quality/README.md) | cross-cutting code quality | `eslint-rules.xml` |
| [`vcs/`](../vcs/README.md) | repository management (mandatory in `infra-discovery`) | [`git.xml`](../vcs/git.xml) — mandatory |
| [`runtimes/`](../runtimes/README.md) | runtime setup per package-manager choice | `nodejs-npm-rules.xml` |
