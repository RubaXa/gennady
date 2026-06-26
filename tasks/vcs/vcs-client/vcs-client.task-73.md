# Task: TSK-73 — unapprove() на MergeRequests порте
## 1. Meta
- **Task-ID:** TSK-73 | **Status:** [ ] TODO | **Scope:** vcs | **Module:** vcs-client | **Dependencies:** None
- **Purpose:** `VcsClientMergeRequests.unapprove(query)` + `VcsGitlabMergeRequests.unapprove` (POST /unapprove). GitHub stub.
- **Spec:** [vcs.spec.md §FR-35..37](../../specs/vcs/vcs.spec.md) | **Runtime:** real-runtime | **Verification:** contract, unit
## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | — | [ ] |
| P2 | test | P1 | [ ] |
## 3. Phases
### P1 — impl
- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/vcs-client/entities/vcs-merge-request-approve-query.type.ts`, `services/vcs-client/abstract/vcs-client-merge-requests.ts`, `services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts`
- **Exit:** typecheck pass; unapprove() на порте + GitLab-адаптер
### P2 — test
- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.unapprove.test.ts`
- **Exit:** 4 BDD covered (success, 403, 409, contract); tests pass
## 4. BDD
- **Success:** `unapprove({repository, iid})` → POST /unapprove, 200 → void
- **Not approved:** 409 → idempotent (информационное сообщение в CLI)
- **Self-unapprove:** 403 → ошибка
- **Contract:** `VcsMergeRequestApproveQuery` переиспользован
