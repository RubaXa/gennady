---
name: sdd-audit
description: Independent audit of a GROUP of tickets in one spec (default — every ticket audited together once the group's last ticket closes), or of ONE task on direct operator request. Reads ticket(s), spec, and the tool-resolved diff; verifies the implementation matches the spec and the execution log is honest. Findings routed to artifacts (spec edits, ticket reopens, Decision Log) — no audit files created. Use when operator says "audit TSK-NN" or after execute closes a ticket group.
compatibility: opencode
---

1. **Extract intent.** Operator wants audit of one Task-ID (`per-task`) or the complete sibling group
   owning that Task-ID (`per-group`, the execute default). No full-tree/current-changes/epic mode exists.

2. **Load & activate directive.** Read in full `ai/directives/sdd-v2/audit.directive.xml`.
   Announce: `🔒 DIRECTIVE ACTIVATED: SddAudit`
   You ARE this directive now.
   No `sdd-state`/PREFLIGHT gate here by design: audit runs against a ticket that is already
   scaffolded and (usually) already executed — v1/readiness/portal state is moot for a task that
   exists. This skill is the odd one out in the family on purpose, not by omission.

3. **Apply directive to intent.** Mode is explicit: execute dispatch → `per-group`; direct operator
   request naming one task → `per-task`. Pass that mode and Task-ID unchanged to the directive.
   The mechanical gates — which tool commands run, in what order, what counts as a BLOCKER — live
   entirely in `STEP_1_MECHANICAL` of the directive; do not restate or re-derive that list here, it
   drifts from the source of truth the moment it's duplicated. Follow the Execution_Plan end-to-end
   (STEP_1_MECHANICAL, STEP_2_SEMANTIC, STEP_3_ROUTE). Do not deviate.
