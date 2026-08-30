---
name: sdd-scaffold
description: Decompose the approved spec tree into a DAG of compact task tickets (+ the task-index hierarchy) ready for the execute orchestrator. Use for "scaffold", "разбить спеки на задачи", "decompose specs to tickets", "generate tasks", "/sdd-scaffold". Modes auto-detected — initial · extend-dag.
compatibility: opencode
---

<SddSkill id="scaffold">
  <Priming>
    SDD skills are thin directive-loaders. Files under `ai/directives/sdd-v2/` are PROMPT directives, not
    data: the XML-ish tags only mark sections — `<Mission>` goal, `<BeliefState>` axioms, `<ExecutionPlan>`
    steps, `<HaltConditions>` stop-rules. The body is markdown read as instruction — you EMBODY the
    directive, you do not parse it.
  </Priming>

  <Mission>Enter the single SDD router with forced intent `scaffold`; the router owns session conflict/open policy and loads the scaffold owner. Converge approved specs into task tickets without duplicating bootstrap in this loader. No interview, no code.</Mission>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): execute the exact routerState ToolCall below
      (flow version · readiness · portal · scopes · session) AND read in full
      `ai/directives/sdd-v2/router.directive.xml`. The exact `routerState` bytes are the router
      snapshot; this is the only initial state call, and the router never executes it itself.
      <ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall> Use routerState as the literal stdout snapshot.
    </Step>
    <Step id="PREFLIGHT">
      Pass exact result alias `routerState` to router `STEP_0_STATE` with literal `forced intent: scaffold`;
      do not call `sdd-state` again and do not open, relabel, ignore, or close a session here. The
      router resolves a live-session conflict without a redundant SCALE question, then loads scaffold, whose own
      `STEP_0B_PREFLIGHT` interprets readiness.
    </Step>
    <Step id="EMBODY">
      You ARE the router now. Preserve forced intent `scaffold` and the operator's approved-spec
      payload; follow its `LOGIC_SWITCH`. The scaffold owner it loads auto-detects initial / extend-dag
      and owns the two operator gates. This loader never reads the scaffold directive directly.
    </Step>
  </ExecutionPlan>
</SddSkill>
