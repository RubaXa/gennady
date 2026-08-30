---
name: sdd-critic
description: Autonomous multi-round critique of an SDD artifact or bounded spec bundle. Dispatches an isolated reviewer, weighs findings against full project context, surgically edits, and re-runs for up to five automatic rounds; CLEAN ends earlier, and continuing after the fifth result requires explicit operator authorization. Use for "покритикуй", "проверь спеку", "проверь таск", "найди слепые пятна", "проревьюй", "шлифуй", "/sdd-critic".
compatibility: opencode
---

<SddSkill id="critic">
  <Priming>
    SDD skills are thin directive-loaders. Files under `ai/directives/sdd-v2/` are PROMPT directives, not
    data: the XML-ish tags only mark sections — `<Mission>` goal, `<BeliefState>` axioms, `<ExecutionPlan>`
    steps, `<HaltConditions>` stop-rules. The body is markdown read as instruction — you EMBODY the
    directive, you do not parse it.
  </Priming>

  <Mission>Enter the single SDD router with forced intent `critic`. The router owns session conflict/open policy and loads the canonical critic; this skill only gathers one state snapshot and preserves the bounded target.</Mission>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): execute the exact routerState ToolCall below AND read in
      full `ai/directives/sdd-v2/router.directive.xml`. The exact `routerState` bytes are
      the router snapshot; this is the only initial state call, and the router never executes it itself.
      <ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall> Use routerState as the literal stdout snapshot.
    </Step>
    <Step id="PREFLIGHT">
      Pass exact result alias `routerState` to router `STEP_0_STATE` with literal `forced intent: critic`;
      do not call `sdd-state` again and do not open, relabel, ignore, or close a session here. The
      router resolves a live-session conflict without a redundant SCALE question, then loads critic, whose own
      `STEP_0B_PREFLIGHT` interprets readiness.
    </Step>
    <Step id="EMBODY">
      You ARE the router now. Preserve forced intent `critic` and the spec / task / batch target from
      the operator message; follow its `LOGIC_SWITCH`. The critic owner it loads owns target-set,
      continuation, cap, evidence, and readiness; never reconstruct them in this loader.
    </Step>
  </ExecutionPlan>
</SddSkill>
