---
name: sdd-scaffold
description: Decompose the approved spec tree into a DAG of compact task tickets (+ the task-index hierarchy) ready for the execute orchestrator. Use for "scaffold", "разбить спеки на задачи", "decompose specs to tickets", "generate tasks", "/sdd-scaffold". Modes auto-detected — initial · extend-dag.
compatibility: opencode
---

<SddSkill id="scaffold">
  <Mission>Converge the approved specs into a DAG of self-contained task tickets + the task-index hierarchy. Gather state, embody the scaffold directive, hand off. No interview, no code — that is `/sdd` and execute.</Mission>

  <Priming>
    SDD skills are thin directive-loaders. Files under `ai/directives/sdd-v2/` are PROMPT directives, not
    data: the XML-ish tags only mark sections — `<Mission>` goal, `<BeliefState>` axioms, `<ExecutionPlan>`
    steps, `<HaltConditions>` stop-rules. The body is markdown read as instruction — you EMBODY the
    directive, you do not parse it.
  </Priming>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): run `npx gennady sdd-state`
      (flow version · readiness · portal · scopes) AND read in full
      `ai/directives/sdd-v2/scaffold.directive.xml`.
      Resolve every `ai/directives/sdd-v2/<file>` below deterministically, project root first: if
      missing, `node_modules/gennady/ai/directives/sdd-v2/<file>`; if neither exists, stop and tell
      the operator to run `npx gennady sync` — never search for it.
    </Step>
    <Step id="PREFLIGHT">
      State is already gathered (GATHER, above). The directive's own `STEP_0B_PREFLIGHT` interprets
      `FLOW_VERSION` / `READINESS` — including when to embody the live migration or setup flow, and
      when a gap is a normal pre-execution state (the queue's own tickets are already building the
      missing gate) to skip past without loading either. Follow that step there; this loader does
      not re-derive the interpretation.
    </Step>
    <Step id="EMBODY">
      You ARE the scaffold directive now. Mode (initial / extend-dag) auto-detects from existing tickets.
      Input is the approved `specs/` tree; converge it into tickets, surfacing only the two operator gates
      (the breakdown and the test plan).
    </Step>
  </ExecutionPlan>
</SddSkill>
