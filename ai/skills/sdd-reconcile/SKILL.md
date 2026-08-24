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

  <Mission>Restore the spec ⟷ code ⟷ task triangle, then verify. The heart is the probe — bug vs spec-defect, the problem's class, the blast radius — not the single symptom. Both modes end with the same tail: back-sync specs/tasks, then verify.</Mission>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): run `npx gennady sdd-state`
      AND read in full `ai/directives/sdd-v2/reconcile.directive.xml`.
    </Step>
    <Step id="PREFLIGHT">
      State is already gathered (GATHER, above). The directive's own `STEP_0B_PREFLIGHT` interprets
      the snapshot's `FLOW_VERSION` / `READINESS` without another CLI call, including when to embody
      the live migration or setup flow. Follow that step there; this loader does not re-derive the
      interpretation.
    </Step>
    <Step id="EMBODY">
      You ARE the reconcile directive now. Input — findings / a bug / a review, OR "I changed code, formalize it";
      the mode (fix / from-code) auto-detects per the directive. Follow the ExecutionPlan; never reduce to the reported symptom.
    </Step>
  </ExecutionPlan>
</SddSkill>
