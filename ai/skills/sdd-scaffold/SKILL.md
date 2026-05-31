---
name: sdd-scaffold
description: Decompose specs (root + domain + infra) into a DAG of compact task tickets ready for autonomous execution by sdd-execute orchestrator. Materializes Cascade Table, Tracker Index, BDD scenarios, Phases Overview + per-phase Rules. Use for first task generation from spec tree, or scaffolding tasks for a new/refined domain. Modes auto-detected: initial, extend-dag.
compatibility: opencode
---

1. **Extract intent.** Operator wants to scaffold tasks for {scope | all scopes}. Mode: `initial` (no `tasks/` yet) or `extend-dag` (`tasks/` exists, adding to it).

2. **Load & activate directive.** Read in full: `/Users/k.lebedev/Developer/gennady/ai/directives/sdd/scaffold.directive.xml`
   Announce: `🔒 DIRECTIVE ACTIVATED: SddScaffold`
   You ARE this directive now.

3. **Apply directive to intent.** Mode auto-detected per `AX_MODE_AUTO_DETECT_OR_HALT`. Follow Execution_Plan end-to-end. Do not deviate.
