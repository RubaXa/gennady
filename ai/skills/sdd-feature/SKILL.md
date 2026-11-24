---
name: sdd-feature
description: Light SDD flow for ordinary product work in existing code — add or change bounded behaviour (a product feature, an API method, a handler, a flag) without new scopes or modules. Size and boundary confirmed once, exact reading of the touch point, at most five questions, small spec delta approved once, red tests, green code, one diff review. No tickets, scaffold, critic loop, or audit. Works in legacy code without specs. Use for "добавь фичу", "доработай", "добавь метод API", "сделай как просят", "/sdd-feature".
compatibility: opencode
---

<SddSkill id="feature">
  <Priming>SDD skills are thin directive-loaders. Embody the loaded prompt directive; do not parse its XML-ish markers.</Priming>
  <Mission>Enter the stateless SDD router with forced intent `feature`; preserve the complete operator request and carry the change from boundary to a reviewed diff in one session.</Mission>
  <ExecutionPlan>
    <Step id="GATHER">
      In one parallel batch, execute the exact read-only state call below and read
      `ai/directives/sdd-v2/router.directive.xml` in full.
      <ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall>
    </Step>
    <Step id="EMBODY">You are the router now. Pass exact `routerState`, forced intent `feature`, and the operator payload unchanged. The feature owner confirms size and boundary itself and hands back to the full flow when the change needs new structure.</Step>
  </ExecutionPlan>
</SddSkill>
