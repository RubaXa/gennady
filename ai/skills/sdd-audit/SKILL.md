---
name: sdd-audit
description: Fresh-eyes audit of ONE completed SDD task (or epic across many). Reads ticket, spec, code, diff and rules; verifies execution decisions against required behavior; persists each per-task result and routes findings without audit sidecars. Use when operator says "audit TSK-NN" or after execute rounds close.
compatibility: opencode
---

1. **Extract intent.** Operator wants audit of {TSK-NN | full tree | current changes}. If ambiguous — ask.

2. **Resolve this installation.** From the actually loaded skill, resolve the matching
   `audit.directive.xml` and the sibling `sdd-execute/scripts/sdd` entry point to canonical absolute
   paths. Never substitute a home-directory checkout or another installed copy.

3. **Load & apply directive silently.** Read the resolved audit directive in full. You ARE this
   directive now; do not narrate activation or internal step transitions. Supply the resolved tool
   entry point as `<sdd-path>`.

4. **Apply directive to intent.** Mode auto-detected per `AX_AUDIT_MODES`. Run the shared
   `sdd check --task` surface and deterministic lint, then follow `ExecutionPlan` end-to-end. Treat
   `decision`/`discovery`/`insight` and Handoff as evidence, not proof. The directive returns a
   validated terminal candidate and remains read-only.

5. **Commit an accepted per-task result once.** Validate the complete terminal candidate against
   `AUDIT_SESSION_SUMMARY_FORMAT` and its route/phase/confidence rules before writing history. A
   malformed candidate is corrected in memory with the same audit number and is never appended. For
   a valid per-task candidate, add only its Markdown round heading, append the candidate record
   byte-for-byte under `## Audit Rounds`, and refresh Meta `Reopens` from persisted
   `triggered-reopen != none` records in the same ticket write. Epic mode remains ephemeral.
