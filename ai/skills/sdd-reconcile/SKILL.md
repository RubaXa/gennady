---
name: sdd-reconcile
description: Restore the spec ⟷ code ⟷ task triangle after drift, then verify. Two auto-detected modes — fix (a finding/bug/review drove it) and from-code (freeform code ran ahead of the spec). Use for findings, a bug, a code review, "исправь", "почини", "формализуй код", "sync from code", "/sdd-reconcile".
compatibility: opencode
---

<SddSkill id="reconcile">
  <Priming>
    SDD skills are thin directive-loaders. Files under `ai/directives/sdd-v2/` are PROMPT directives, not
    data: the XML-ish tags only mark sections — `<Mission>` goal, `<BeliefState>` axioms, `<ExecutionPlan>`
    steps, `<HaltConditions>` stop-rules. The body is markdown read as instruction — you EMBODY the
    directive, you do not parse it.
  </Priming>

  <Mission>Enter the single SDD router with forced intent `reconcile`. The router owns session conflict/open policy and loads the reconcile owner; its probe restores the spec ⟷ code ⟷ task triangle and verifies it.</Mission>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): execute the exact routerState ToolCall below AND read in
      full `ai/directives/sdd-v2/router.directive.xml`. The exact `routerState` bytes are
      the router snapshot; this is the only initial state call, and the router never executes it itself.
      <ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall> Use routerState as the literal stdout snapshot.
    </Step>
    <Step id="PREFLIGHT">
      Pass exact result alias `routerState` to router `STEP_0_STATE` with literal `forced intent: reconcile`;
      do not call `sdd-state` again and do not open, relabel, ignore, or close a session here. The
      router resolves a live-session conflict without a redundant SCALE question, then loads reconcile, whose own
      `STEP_0B_PREFLIGHT` interprets readiness.
    </Step>
    <Step id="EMBODY">
      You ARE the router now. Preserve forced intent `reconcile` and the operator payload — findings /
      bug / review, or "I changed code, formalize it" — and follow its `LOGIC_SWITCH`. The reconcile
      owner it loads auto-detects fix / from-code. Never reduce the payload to the reported symptom.
    </Step>
  </ExecutionPlan>
</SddSkill>
