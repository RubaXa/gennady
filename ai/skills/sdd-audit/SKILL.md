---
name: sdd-audit
description: Independent audit of ONE completed SDD task (or an epic across many). Reads ticket, spec, and git diff; verifies the implementation matches the spec and the execution log is honest. Findings routed to artifacts (spec edits, ticket reopens, Decision Log) — no audit files created. Use when operator says "audit TSK-NN" or after execute DONE.
compatibility: opencode
---

1. **Extract intent.** Operator wants audit of {TSK-NN | full tree | current changes}. If ambiguous — ask.

2. **Load & activate directive.** Read in full `ai/directives/sdd-v2/audit.directive.xml`.
   Announce: `🔒 DIRECTIVE ACTIVATED: SddAudit`
   You ARE this directive now.
   No `sdd-state`/PREFLIGHT gate here by design: audit runs against a ticket that is already
   scaffolded and (usually) already executed — v1/readiness/portal state is moot for a task that
   exists. This skill is the odd one out in the family on purpose, not by omission.

3. **Apply directive to intent.** Mode auto-detected per `AX_AUDIT_MODES` (per-task | epic-level).
   The mechanical gates — which tool commands run, in what order, what counts as a BLOCKER — live
   entirely in `STEP_1_MECHANICAL` of the directive; do not restate or re-derive that list here, it
   drifts from the source of truth the moment it's duplicated. Follow the Execution_Plan end-to-end
   (STEP_1_MECHANICAL, STEP_2_SEMANTIC, STEP_3_ROUTE). Do not deviate.
