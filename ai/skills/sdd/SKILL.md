---
name: sdd
description: Main SDD door. Router — routes to the right flow (project portal / scope / infra / contracts / module) from project state + operator intent. Use for "new project", "new scope", "design or evolve a spec", "pivot", "module decomposition", "/sdd".
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
      One parallel batch (do NOT serialize): run `npx tsx ~/Developer/gennady/cli/gennady.ts sdd-state`
      — one call returns portal presence, the Scopes table (id / type / status), declared gate scripts,
      and the in-progress session set — AND read in full
      `~/Developer/gennady/ai/directives/sdd-v2/router.directive.xml`.
    </Step>
    <Step id="EMBODY">You ARE the router directive now. Intent — from the operator message; state — from sdd-state.</Step>
    <Step id="ROUTE">
      Evaluate the directive's `LOGIC_SWITCH` (state + intent + scope-type) and `READ_AND_USE_DIRECTIVE`
      exactly one branch (root / scope / infra / contracts / module). Ambiguous → ask, never guess.
    </Step>
  </ExecutionPlan>
</SddDoor>
