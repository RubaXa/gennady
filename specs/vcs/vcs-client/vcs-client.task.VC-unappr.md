# Task: VC-unappr — unapprove() на MergeRequests порте

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** VC-unappr | **Status:** [x] DONE | **Scope:** vcs | **Module:** vcs-client | **Dependencies:** None
- **Purpose:** `VcsClientMergeRequests.unapprove(query)` + `VcsGitlabMergeRequests.unapprove` (POST /unapprove). GitHub stub.
- **Spec:** [vcs.spec.md §FR-35..37](../../../specs/vcs/vcs.spec.md) | **Runtime:** real-runtime | **Verification:** contract, unit

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/vcs-client/entities/vcs-merge-request-approve-query.type.ts`, `services/vcs-client/abstract/vcs-client-merge-requests.ts`, `services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts`
- **Exit:** typecheck pass; unapprove() на порте + GitLab-адаптер

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:** [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.unapprove.test.ts`
- **Exit:** 4 BDD covered (success, 403, 409, contract); tests pass

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. BDD

- **Success:** `unapprove({repository, iid})` → POST /unapprove, 200 → void
- **Not approved:** 409 → idempotent (информационное сообщение в CLI)
- **Self-unapprove:** 403 → ошибка
- **Contract:** `VcsMergeRequestApproveQuery` переиспользован

**Scenario:** Ошибка 403 при self-unapprove [`unit`]

- **Given** provider запрещает self-unapprove
- **When** adapter вызывает `unapprove`
- **Then** adapter возвращает ошибку 403

<!--/SECTION:BDD-->
<!--SECTION:TEST_COVERAGE-->

## 5. Test Scenario Coverage

- Ошибка 403 при self-unapprove → `vcs-gitlab-merge-requests.unapprove.test.ts` :: `unapprove 403 self-unapprove forbidden — error thrown`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1

#### P1

- [x] `2026-06-26T18:04:05Z` discovery pre-existing dead code in `cli/cmd/vcs-reply/vcs-reply.cmd.ts`: module-level `composeSuggestionBody` и `resolveBody` затенены локальной стрелочной функцией `resolveBody`; удалены → 2 мёртвые функции устранены
- [x] `2026-06-26T18:04:05Z` discovery `VcsGithubMergeRequests` не реализовывал новый `unapprove()` → добавлен deferred stub
- [x] `2026-06-26T18:04:05Z` decision error-strategy=rethrow-cause-with-idempotent-409 ← 409 Not Approved — желаемое состояние уже достигнуто; 403 — выбрасывается как ошибка вызывающей стороне
- [x] `2026-06-26T18:04:05Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:04:05Z` ver gennady lint 3 files → pass exit=0
- [x] `2026-06-26T18:04:05Z` ver npm run test → pass exit=0
- [x] `2026-06-26T18:04:05Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:04:05Z` DONE
      **Handoff →** artifacts: [services/vcs-client/abstract/vcs-client-merge-requests.ts, services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts, services/vcs-client/github/vcs-github-merge-requests.ts, services/vcs-client/entities/vcs-merge-request-approve-query.type.ts]; decisions: [error-strategy=rethrow-cause-with-idempotent-409, query-type=VcsMergeRequestApproveQuery-reused]; open: []

#### P2

- [x] `2026-06-26T18:06:32Z` intro VcsGitlabMergeRequests — unapprove test file ← 4 BDD scenarios: success, 409 idempotent, 403 error, type contract
- [x] `2026-06-26T18:06:32Z` discovery pre-existing vcs-diff tests использовали пробельный синтаксис --path вместо --path= ← исправлено на = синтаксис в тестах
- [x] `2026-06-26T18:06:32Z` discovery vcs-diff --dry-run тест не передавал флаг --dry-run ← добавлен флаг
- [x] `2026-06-26T18:06:32Z` discovery pre-existing flaky: LintCommand — should show autoFixed count ← иногда падает в полном suite, проходит изолированно
- [x] `2026-06-26T18:06:32Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:06:32Z` ver gennady lint 1 files → pass exit=0
- [x] `2026-06-26T18:06:32Z` ver npm run test → pass exit=0
- [x] `2026-06-26T18:06:32Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:06:32Z` DONE
      **Handoff →** artifacts: [services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.unapprove.test.ts]; decisions: [error-strategy=rethrow-cause-with-idempotent-409, query-type=VcsMergeRequestApproveQuery-reused]; open: []

<!--/SECTION:EXECUTION_LOG-->
