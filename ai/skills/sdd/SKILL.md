---
name: sdd
description: SDD entry point. Loads project state and delegates all route selection — including execute and multi-scope — to router.directive.xml's exact LOGIC_SWITCH. Use for "new project", "new scope", "design or evolve a spec", "pivot", "module decomposition", "воссоздай спеку для services/foo по коду", "/sdd".
compatibility: opencode
---

<SddSkill id="router">
  <Priming>
    SDD skills are thin directive-loaders. Files under `ai/directives/sdd-v2/` are PROMPT directives, not
    data: the XML-ish tags only mark sections — `<Mission>` goal, `<BeliefState>` axioms, `<ExecutionPlan>`
    steps, `<HaltConditions>` stop-rules. The body is markdown read as instruction — you EMBODY the
    directive, you do not parse it. A skill gathers context fast, then hands control to its directive.
  </Priming>

  <Mission>Route the operator to exactly one SDD flow: gather state, embody the router directive, hand off.</Mission>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): execute the exact routerState ToolCall below — one call
      returns portal presence, the Scopes table (id / type / status), declared gate scripts, and the
      in-progress session set — AND read in full
      `ai/directives/sdd-v2/router.directive.xml`. This is the only initial state call; the router
      consumes the exact `routerState` bytes and never executes that initial call itself.
      <ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall> Use routerState as the literal stdout snapshot.
    </Step>
    <Step id="EMBODY">You ARE the router directive now. Intent — from the operator message; state — exact result alias `routerState`.</Step>
    <Step id="ROUTE">
      Delegate route selection exclusively to the loaded router directive's exact `LOGIC_SWITCH`
      (state + intent + scope-type); this skill keeps no closed route inventory. Follow the first
      matching result and `READ_AND_USE_DIRECTIVE` the path it returns, including its execute and
      chained multi-scope outcomes. Handle ambiguity exactly as that switch directs; never guess.
    </Step>
  </ExecutionPlan>
</SddSkill>
