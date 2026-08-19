---
name: sdd
description: SDD entry point. Router — picks the right flow (project portal / scope / infra / interface / module / recover a spec from an existing path) from project state + operator intent. Use for "new project", "new scope", "design or evolve a spec", "pivot", "module decomposition", "воссоздай спеку для services/foo по коду", "/sdd".
compatibility: opencode
---

<SddDoor door="router">
  <Mission>Route the operator to exactly one SDD flow: gather state, embody the router directive, hand off.</Mission>

  <Priming>
    SDD doors are thin directive-loaders. Files under `ai/directives/sdd-v2/` are PROMPT directives, not
    data: the XML-ish tags only mark sections — `<Mission>` goal, `<BeliefState>` axioms, `<ExecutionPlan>`
    steps, `<HaltConditions>` stop-rules. The body is markdown read as instruction — you EMBODY the
    directive, you do not parse it. A door gathers context fast, then hands control to its directive.
  </Priming>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): run `npx gennady sdd-state`
      — one call returns portal presence, the Scopes table (id / type / status), declared gate scripts,
      and the in-progress session set — AND read in full `ai/directives/sdd-v2/router.directive.xml`.
      Resolve deterministically, project root first: `ai/directives/sdd-v2/router.directive.xml`; if
      missing, `node_modules/gennady/ai/directives/sdd-v2/router.directive.xml`; if neither exists,
      stop and tell the operator to run `npx gennady sync` — never search for it.
    </Step>
    <Step id="EMBODY">You ARE the router directive now. Intent — from the operator message; state — from sdd-state.</Step>
    <Step id="ROUTE">
      Evaluate the directive's `LOGIC_SWITCH` (state + intent + scope-type) and `READ_AND_USE_DIRECTIVE`
      exactly one branch (root / recover-from-code / scope / infra / interface / module). Ambiguous → ask, never guess.
    </Step>
  </ExecutionPlan>
</SddDoor>
