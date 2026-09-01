---
name: sdd-execute
description: Execute approved task tickets end-to-end from ticket, Execution Log, Git, and real verification output. Supports one ticket or a deterministic `sdd-task` batch, bounded phase workers, audit, and code-review. Use for a Task-ID, "next", "pick", "batch"/"all", "выполни очередь", "/sdd-execute".
compatibility: opencode
---

<SddSkill id="execute">
  <Priming>SDD skills are thin directive-loaders. Embody the loaded prompt directive; do not parse its XML-ish markers.</Priming>
  <Mission>Enter the stateless SDD router with forced intent `execute`. Plan and dispatch; never write phase code yourself. Reconstruct progress from durable artifacts instead of a persistent SDD or worker session.</Mission>
  <ExecutionPlan>
    <Step id="GATHER">
      In one parallel batch, execute the exact read-only state call below and read
      `ai/directives/sdd-v2/router.directive.xml` in full. The router consumes the exact bytes and does not repeat the call.
      <ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall>
    </Step>
    <Step id="EMBODY">You are the router now. Pass exact `routerState`, forced intent `execute`, and the operator payload unchanged. Empty payload means show the execution-map selection and wait; it never aliases `next`. The execute owner resolves tickets with `sdd-task`, follows declared phases, records facts in Execution Log, runs real gates, then dispatches audit and code-review.</Step>
  </ExecutionPlan>
</SddSkill>
