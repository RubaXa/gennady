# Task: TSK-76 — vcs-todo CLI
## 1. Meta
- **Task-ID:** TSK-76 | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-todo | **Dependencies:** TSK-75
- **Purpose:** `gennady vcs-todo --done <ref>` — закрыть todo(s) по MR через Inbox.markTodoDone
- **Spec:** [cli.spec.md §FR-TD-01..04](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit
## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | — | [ ] |
| P2 | test | P1 | [ ] |
## 3. Phases
### P1 — impl
- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `cli/cmd/vcs-todo/vcs-todo.cmd.ts`, `cli/cmd/vcs-todo/index.ts`, `cli/cmd/vcs-todo/help.ts`, `cli/gennady.ts`
- **Exit:** команда зарегистрирована; vcs-context-resolver + markTodoDone интегрированы
### P2 — test
- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `cli/cmd/vcs-todo/__tests__/vcs-todo.test.ts`
- **Exit:** 4 BDD covered
## 4. BDD
- --done <ref> → markTodoDone по каждому todoId → success
- --id <todoId> → markTodoDone напрямую
- Нет todo → «No pending todos», exit 0
- --dry-run → «Would mark todo done: <id>»
