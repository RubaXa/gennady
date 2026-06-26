# Task: TSK-75 — todoIds + markTodoDone (Inbox порт)
## 1. Meta
- **Task-ID:** TSK-75 | **Status:** [ ] TODO | **Scope:** vcs | **Module:** vcs-client | **Dependencies:** None
- **Purpose:** `VcsActionableMr.todoIds`, расширение `getActionable` GraphQL, `Inbox.markTodoDone()`
- **Spec:** [vcs.spec.md §FR-38..41](../../specs/vcs/vcs.spec.md) | **Runtime:** real-runtime | **Verification:** contract, unit
## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | — | [ ] |
| P2 | test | P1 | [ ] |
## 3. Phases
### P1 — impl
- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/vcs-client/entities/vcs-actionable-mr.type.ts`, `services/vcs-client/abstract/vcs-client-inbox.ts`, `services/vcs-client/gitlab/vcs-gitlab-inbox.ts`
- **Exit:** `todoIds` в `VcsActionableMr`; `markTodoDone` на порте; GraphQL `todoMarkDone` в адаптере
### P2 — test
- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/vcs-client/gitlab/__tests__/vcs-gitlab-inbox.test.ts`
- **Exit:** 3 BDD covered; tests pass
## 4. BDD
- getActionable → todoIds из currentUser.todos.nodes для todo-источников
- markTodoDone → GraphQL todoMarkDone, success → void
- Connection-источники (reviewRequested/authored) → todoIds = []
