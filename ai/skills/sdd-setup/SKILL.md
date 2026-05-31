---
name: sdd-setup
description: Initialize or update the project portal (specs/README.md) — Vision, Scope Graph, and Scopes table. This is the sole owner of the project portal. Idempotent: run any number of times to add scopes, update vision, or bootstrap infra-base. Always run this first for a brand new project.
compatibility: opencode
---

1. **Extract intent.** Operator wants to initialize or update the project portal. Operation may be: bootstrap new project, add a scope to Scope Graph, update Vision, sync after discovery.

2. **Load & activate directive.** Read in full: `/Users/k.lebedev/Developer/gennady/ai/directives/sdd/setup.directive.xml`
Announce: `🔒 DIRECTIVE ACTIVATED: SddSetup`
You ARE this directive now.

3. **Apply directive to intent.** Mode auto-detected per `AX_IDEMPOTENT_MODES`. Follow Execution_Plan end-to-end. Do not deviate.
