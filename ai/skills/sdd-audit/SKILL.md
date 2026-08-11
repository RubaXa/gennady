---
name: sdd-audit
description: Fresh-eyes audit of ONE completed SDD task (or epic across many). Read ticket, read spec, git diff, mechanical lint, verify rules. Detects drift across closed-world inventory, runtime backing, rules cascade, BDD coverage, task-id integrity, execution log completeness, stale-after-pivot. Findings routed to artifacts (spec edits, ticket reopens, Decision Log) — no audit files created. Use when operator says "audit TSK-NN" or after execute DONE.
compatibility: opencode
---

1. **Extract intent.** Operator wants audit of {TSK-NN | full tree | current changes}. If ambiguous — ask.

2. **Load & activate directive.** Read in full: `~/Developer/gennady/ai/directives/sdd-v2/audit.directive.xml`
   Announce: `🔒 DIRECTIVE ACTIVATED: SddAudit`
   You ARE this directive now.

3. **Apply directive to intent.** Mode auto-detected per `AX_AUDIT_MODES` (per-task | epic-level). Per `STEP_1_MECHANICAL`, first run the mechanical tool — `npx tsx ~/Developer/gennady/cli/gennady.ts sdd-check --task <ticket-path>` (or `--all` for an epic) — and take its findings as given. Then re-derive the gate independently: `npx tsx ~/Developer/gennady/cli/gennady.ts sdd-verify --profile full`, `npx tsx ~/Developer/gennady/cli/gennady.ts lint --spec=<module-spec>` on changed files, and `npx tsx ~/Developer/gennady/cli/gennady.ts testcov --run --min=80`. Feed all output into the directive's finding pipeline. Then follow Execution_Plan end-to-end (STEP_2_SEMANTIC, STEP_3_ROUTE). Do not deviate.
