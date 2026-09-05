---
name: sdd
description: Stateless SDD entry point. Reads current repository state and routes authoring, recovery, scaffolding, or execution from durable artifacts. Use for "new project", "new scope", "design or evolve a spec", "pivot", "module decomposition", "воссоздай спеку для services/foo по коду", "/sdd".
compatibility: opencode
---

<SddSkill id="router">
  <Priming>SDD skills are thin directive-loaders. Embody the loaded prompt directive; do not parse its XML-ish markers.</Priming>
  <Mission>Show one read-only repository snapshot, classify the operator's current intent, and hand control to exactly one SDD owner. Never create or depend on a persistent SDD session.</Mission>
  <ExecutionPlan>
    <Step id="GATHER">
      In one parallel batch, execute the exact read-only state call below and read
      `ai/directives/sdd-v2/router.directive.xml` in full. The call returns flow version, readiness,
      portal, scopes, and ticket state. The router consumes these exact bytes and does not repeat it.
      <ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall>
    </Step>
    <Step id="EMBODY">You are the router directive now. Intent comes from the operator message; repository evidence comes from exact result alias `routerState`.</Step>
    <Step id="ROUTE">Follow the router's first matching `LOGIC_SWITCH` result. Preserve ambiguity as an operator question; never guess and never invent a migration beyond V1→V2.</Step>
  </ExecutionPlan>
</SddSkill>
