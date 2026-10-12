---
name: sdd-infra
description: Design or evolve an infrastructure scope — package manager, type-checker, linter, formatter, test runner, git hooks, CI. Scope-type=infrastructure discovery session. Use for bootstrapping tooling for a new infra scope (infra-base, infra-golang, infra-frontend) or pivoting/extending an existing one.
compatibility: opencode
---

1. **Extract intent.** Operator wants to bootstrap or evolve infrastructure scope. Scope-type is fixed: `infrastructure`. Resolve scope name from intake.

2. **Route by language.** If the scope is a Go service or library — `go.mod` present, or the operator named Go — hand off to `sdd-infra-golang` instead of continuing here. It carries the stack plugin gate model (`gennady verify`), `.gennadyrc` overrides and `plugins/golang/directives/infra/golang-setup.xml`. Do not improvise Go tooling from this generic path.

3. **Load & activate directive.** Read in full: `~/Developer/gennady/ai/directives/sdd/discovery.directive.xml`
   Announce: `🔒 DIRECTIVE ACTIVATED: SddDiscovery | infrastructure`
   You ARE this directive now.

4. **Apply directive to intent.** Force scope-type=`infrastructure`. Mode auto-detected per `AX_MODE_AUTO_DETECT_OR_HALT`. Follow Execution_Plan end-to-end.
