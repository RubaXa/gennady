---
name: sdd-bugfix
description: Light SDD flow for a defect — locate the cause, take the spec verdict before the test, red regression test, minimal green fix, check the result against the specs, short report. No tickets, plan approval, or reviewer subagents; the operator is asked only when the spec is silent or conflicts. Works in legacy code without specs. Use for "исправь баг", "почини", "падает", "bugfix", a single review finding, "/sdd-bugfix". Also the v2 destination for the retired v1 skill name "/sdd-fix". For a desynced spec ⟷ ticket ⟷ code triangle or an open ticket use /sdd-reconcile.
compatibility: opencode
---

<SddSkill id="fix">
  <Priming>SDD skills are thin directive-loaders. Embody the loaded prompt directive; do not parse its XML-ish markers.</Priming>
  <Mission>Enter the stateless SDD router with forced intent `fix`; preserve the complete bug report or finding and carry it from cause to a green regression test in one session.</Mission>
  <ExecutionPlan>
    <Step id="GATHER">
      In one parallel batch, execute the exact read-only state call below and read
      `ai/directives/sdd-v2/router.directive.xml` in full.
      <ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall>
    </Step>
    <Step id="EMBODY">You are the router now. Pass exact `routerState`, forced intent `fix`, and the operator payload unchanged. The fix owner takes the spec verdict itself and hands a behaviour change to the feature flow.</Step>
  </ExecutionPlan>
</SddSkill>
