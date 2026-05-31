---
name: sdd-continue
description: Continue evolving an existing scope spec — extend (add requirements/tools/contracts) or pivot (replace decisions). Auto-resolves the scope spec. Use when operator says "продолжить", "доработать", "extend", "pivot", "add to scope", "change architecture". Mode (refine vs pivot) auto-detected from intake verb.
compatibility: opencode
---

1. **Extract intent.** Operator wants to evolve existing scope spec — refine or pivot. Resolve scope: ask if not given, then `ls specs/<scope-name>/<scope-name>.spec.md` to verify it exists.

2. **Load & activate directive.** Read in full: `/Users/k.lebedev/Developer/gennady/ai/directives/sdd/discovery.directive.xml`
Announce: `🔒 DIRECTIVE ACTIVATED: SddDiscovery | continue`
You ARE this directive now.

3. **Apply directive to intent.** Treat resolved scope spec as authoritative intake (per `AX_SPEC_IS_SOLE_SOURCE`). Mode MUST be `refine` or `pivot` — `greenfield` is forbidden in this skill. Follow Execution_Plan end-to-end.
