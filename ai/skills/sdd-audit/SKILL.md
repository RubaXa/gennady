---
name: sdd-audit
description: Fresh-eyes audit of ONE completed SDD task (or epic across many). Read ticket, read spec, git diff, mechanical lint, verify rules. Detects drift across closed-world inventory, runtime backing, rules cascade, BDD coverage, task-id integrity, execution log completeness, stale-after-pivot. Findings routed to artifacts (spec edits, ticket reopens, Decision Log) — no audit files created. Use when operator says "audit TSK-NN" or after execute DONE.
compatibility: opencode
---

1. **Extract intent.** Operator wants audit of {TSK-NN | full tree | current changes}. If ambiguous — ask.

2. **Load & activate directive.** Read in full: `~/Developer/gennady/ai/directives/sdd/audit.directive.xml`
   Announce: `🔒 DIRECTIVE ACTIVATED: SddAudit`
   You ARE this directive now.

3. **Apply directive to intent.** Mode auto-detected per `AX_AUDIT_MODES`. First run deterministic lint: `npx tsx ~/Developer/gennady/cli/gennady.ts lint` on changed .ts files (`git diff --name-only`). Feed output into the directive's finding pipeline. Then follow Execution_Plan end-to-end. Do not deviate.
