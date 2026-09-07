---
name: sdd-scaffold
description: Convert operator-approved V2 specs into actual task tickets, validate them, independently review the actual ticket set, and obtain operator approval of breakdown plus test plan. Use for "scaffold", "разбить спеки на задачи", "generate tasks", "/sdd-scaffold". Modes auto-detected — initial · extend-dag.
compatibility: opencode
---

<SddSkill id="scaffold">
  <Priming>SDD skills are thin directive-loaders. Embody the loaded prompt directive; do not parse its XML-ish markers.</Priming>
  <Mission>Enter the stateless SDD router with forced intent `scaffold`. No interview, no code, no plan JSON, no feasibility state machine, and no persistent critic or SDD session.</Mission>
  <ExecutionPlan>
    <Step id="GATHER">
      In one parallel batch, execute the exact read-only state call below and read
      `ai/directives/sdd-v2/router.directive.xml` in full. The router consumes the exact bytes and does not repeat the call.
      <ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall>
    </Step>
    <Step id="EMBODY">You are the router now. Pass exact `routerState`, literal forced intent `scaffold`, and the operator payload unchanged. The scaffold owner derives state from approved specs and existing tickets, creates real tickets, runs structural checks, reviews those actual bytes once, then asks for operator approval #2.</Step>
  </ExecutionPlan>
</SddSkill>
