---
name: sdd-critic
description: On-demand independent semantic review of a bounded SDD artifact set. Reports concrete contradictions, omissions, and untestable claims; the invoking author owns correction and recheck. Use for "покритикуй", "проверь спеку", "проверь таск", "найди слепые пятна", "/sdd-critic".
compatibility: opencode
---

<SddSkill id="critic">
  <Priming>SDD skills are thin directive-loaders. Embody the loaded prompt directive; do not parse its XML-ish markers.</Priming>
  <Mission>Run one fresh independent semantic review of an explicitly bounded target. Do not maintain a durable critic session, automatic five-round loop, or hidden write state.</Mission>
  <ExecutionPlan>
    <Step id="GATHER">
      In one parallel batch, execute the exact read-only state call below and read
      `ai/directives/sdd-v2/router.directive.xml` in full.
      <ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall>
    </Step>
    <Step id="EMBODY">You are the router now. Pass exact `routerState`, forced intent `critic`, and the bounded target unchanged. The critic returns evidence-backed findings or CLEAN; it never edits the target.</Step>
  </ExecutionPlan>
</SddSkill>
