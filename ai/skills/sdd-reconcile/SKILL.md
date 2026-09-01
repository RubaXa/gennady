---
name: sdd-reconcile
description: Restore the spec ⟷ code ⟷ task triangle after drift, then verify. Modes — fix and from-code. Uses current artifacts and Git, never a persistent SDD session. Use for findings, bugs, reviews, "исправь", "формализуй код", "/sdd-reconcile".
compatibility: opencode
---

<SddSkill id="reconcile">
  <Priming>SDD skills are thin directive-loaders. Embody the loaded prompt directive; do not parse its XML-ish markers.</Priming>
  <Mission>Enter the stateless SDD router with forced intent `reconcile`; preserve the complete finding or change payload and restore consistency from specs, tickets, Git, and real checks.</Mission>
  <ExecutionPlan>
    <Step id="GATHER">
      In one parallel batch, execute the exact read-only state call below and read
      `ai/directives/sdd-v2/router.directive.xml` in full.
      <ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall>
    </Step>
    <Step id="EMBODY">You are the router now. Pass exact `routerState`, forced intent `reconcile`, and the operator payload unchanged. The reconcile owner auto-detects fix/from-code and verifies the resulting artifacts.</Step>
  </ExecutionPlan>
</SddSkill>
