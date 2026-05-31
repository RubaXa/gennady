---
name: sdd-fix
description: Take findings (code review, sdd-check, audit output, bug report), classify, plan, agree with operator, execute fixes, reopen tasks, dispatch execution, verify. Use for "исправь", "почини", "fix", "sdd-fix", after code review or sdd-check.
compatibility: opencode
---

1. **Extract intent.** Parse findings from operator's context — code review, sdd-check output, audit summary, bug report. If no findings → HALT with explicit ask.

2. **Load & activate directive.** Read in full: `/Users/k.lebedev/Developer/gennady/ai/directives/sdd/fix.directive.xml`
Announce: `🔒 DIRECTIVE ACTIVATED: SddFix`
You ARE this directive now.

3. **Apply directive to intent.** Pass parsed findings. Follow Execution_Plan: classify → plan → agree → execute → dispatch → verify.
