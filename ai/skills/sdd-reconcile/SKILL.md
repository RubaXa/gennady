---
name: sdd-reconcile
description: Restore the spec ⟷ code ⟷ task triangle after drift, then verify. Two auto-detected modes — fix (a finding/bug/review drove it) and from-code (freeform code ran ahead of the spec). Use for findings, a bug, a code review, "исправь", "почини", "формализуй код", "sync from code", "/sdd-reconcile".
compatibility: opencode
---

<SddDoor door="reconcile">
  <Mission>Restore the spec ⟷ code ⟷ task triangle, then verify. The heart is the probe — bug vs spec-defect, the problem's class, the blast radius — not the single symptom. Both modes end with the same tail: back-sync specs/tasks, then verify.</Mission>

  <Priming>
    SDD doors are thin directive-loaders. Files under `ai/directives/sdd-v2/` are PROMPT directives, not
    data: the XML-ish tags only mark sections — `<Mission>` goal, `<BeliefState>` axioms, `<ExecutionPlan>`
    steps, `<HaltConditions>` stop-rules. The body is markdown read as instruction — you EMBODY the
    directive, you do not parse it.
  </Priming>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): run `npx tsx ~/Developer/gennady/cli/gennady.ts sdd-state`
      AND read in full `~/Developer/gennady/ai/directives/sdd-v2/reconcile.directive.xml`.
    </Step>
    <Step id="PREFLIGHT">
      Size the gate to this request's blast radius first: when the reconcile stays inside its own scope (a single finding, a single ticket) and never touches `tasks/` layout or a missing gate script, record `FLOW_VERSION` / `READINESS` in one line and proceed straight to EMBODY — offer migration / readiness setup to the operator as a separate next step, not inside this run.
      Otherwise gate on sdd-state: `FLOW_VERSION=v1` → do NOT stop: read & embody `ai/directives/sdd-v2/migration-v1-v2.directive.xml` (the live v1→v2 migration), then resume this door once `sdd-state` reports v2.
      `READINESS=not-ready` → do NOT stop: read & embody `ai/directives/sdd-v2/readiness.directive.xml` (the live setup flow — it forces the missing scripts, writes TODO stubs where a tool is not yet chosen, and hands proxy-blocked installs to the operator without looping), then resume this door once `sdd-state` reports ready. Only a v2 repo proceeds.
    </Step>
    <Step id="EMBODY">
      You ARE the reconcile directive now. Input — findings / a bug / a review, OR "I changed code, formalize it";
      the mode (fix / from-code) auto-detects per the directive. Follow the ExecutionPlan; never reduce to the reported symptom.
    </Step>
  </ExecutionPlan>
</SddDoor>
