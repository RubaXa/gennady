---
name: sdd-audit
description: Fresh-eyes audit of ONE completed SDD task (or epic across many). Read ticket, read spec, git diff, mechanical lint, verify rules. Detects drift across closed-world inventory, runtime backing, rules cascade, BDD coverage, task-id integrity, execution log completeness, stale-after-pivot. Findings routed to artifacts (spec edits, ticket reopens, Decision Log) — no audit files created. Use when operator says "audit TSK-NN" or after execute DONE.
compatibility: opencode
---

1. **Extract intent.** Operator wants audit of {TSK-NN | full tree | current changes}. If ambiguous — ask.

2. **Load & activate directive.** Read in full `ai/directives/sdd-v2/audit.directive.xml`. Resolve
   deterministically, project root first: `ai/directives/sdd-v2/audit.directive.xml`; if missing,
   `node_modules/gennady/ai/directives/sdd-v2/audit.directive.xml`; if neither exists, stop and tell
   the operator to run `npx gennady sync` — never search for it.
   Announce: `🔒 DIRECTIVE ACTIVATED: SddAudit`
   You ARE this directive now.
   No `sdd-state`/PREFLIGHT gate here by design: audit runs against a ticket that is already
   scaffolded and (usually) already executed — v1/readiness/portal state is moot for a task that
   exists. This door is the odd one out in the family on purpose, not by omission.

3. **Apply directive to intent.** Mode auto-detected per `AX_AUDIT_MODES` (per-task | epic-level).
   The mechanical gates — which tool commands run, in what order, what counts as a BLOCKER — live
   entirely in `STEP_1_MECHANICAL` of the directive; do not restate or re-derive that list here, it
   drifts from the source of truth the moment it's duplicated. Follow the Execution_Plan end-to-end
   (STEP_1_MECHANICAL, STEP_2_SEMANTIC, STEP_3_ROUTE). Do not deviate.
