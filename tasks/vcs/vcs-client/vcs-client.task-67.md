# Task: TSK-67 — Метод approve на MergeRequests порте

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-67
- **Status:** [ ] TODO
- **Purpose:** Добавить метод `approve(query)` на порт `VcsClientMergeRequests` + value object `VcsMergeRequestApproveQuery` + реализацию в `VcsGitlabMergeRequests` (`POST /projects/:id/merge_requests/:iid/approve`)
- **Scope:** `vcs`
- **Module:** `vcs-client`
- **Dependencies:** None (существующие порты и адаптеры уже реализованы)
- **Reopens:** 0
- **Spec References:**
  - Scope spec: [vcs.spec.md §FR-26..FR-29](../../../specs/vcs/vcs.spec.md)
  - Port: [VcsClientMergeRequests](../../../specs/vcs/vcs-client/vcs-client.spec.md#vcsclientmergerequests)
  - Value Object: [VcsMergeRequestApproveQuery](../../../specs/vcs/vcs-client/vcs-client.spec.md)
- **Runtime Backing:** `real-runtime` (GitLab API через `fetch`)
- **Verification Levels:** `contract`, `unit`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Создать `VcsMergeRequestApproveQuery`, добавить `approve()` на порт и реализовать в GitLab-адаптере.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/entities/vcs-merge-request-approve-query.type.ts`
  - `services/vcs-client/abstract/vcs-client-merge-requests.ts`
  - `services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts`
- **Inputs:** none
- **Exit:** `approve({repository, iid})` определён на порте; `VcsGitlabMergeRequests.approve` делает `POST /projects/:id/merge_requests/:iid/approve` с `fetch` и авторизацией через `PRIVATE-TOKEN`; все экспорты покрыты DBC-контрактами; typecheck pass
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-тесты: approve-query shape, approve success, approve 409 (already approved), approve 403 (self-approve).
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.approve.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии покрыты; tests pass
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: `VcsClientMergeRequests.approve(VcsMergeRequestApproveQuery) → Promise<void>`

**Feature:** Approve GitLab Merge Request

**Scenario:** Успешный approve [`unit`]

- **Given** GitLab возвращает 200 с `{ "approved": true }`
- **When** вызывается `approve({ repository: "group/repo", iid: 42 })`
- **Then** запрос отправлен на `POST /api/v4/projects/group%2Frepo/merge_requests/42/approve`
- **And** Promise resolved (void)

**Scenario:** MR уже approved — idempotent (409) [`unit`]

- **Given** GitLab возвращает 409 с телом `"Merge request is already approved"`
- **When** вызывается `approve({ repository: "group/repo", iid: 42 })`
- **Then** выбрасывается `VcsApproveError` с кодом `ALREADY_APPROVED`

**Scenario:** Self-approve forbidden (403) [`unit`]

- **Given** GitLab возвращает 403 с телом, содержащим `"its author"`
- **When** вызывается `approve({ repository: "group/repo", iid: 42 })`
- **Then** выбрасывается `VcsApproveError` с кодом `SELF_APPROVE_FORBIDDEN`

**Scenario:** Типизация — VcsMergeRequestApproveQuery shape [`contract`]

- **Given** тип `VcsMergeRequestApproveQuery`
- **When** передаётся `{ repository: "g/r", iid: 42 }`
- **Then** поля `repository: string`, `iid: string | number` — обязательны

**Scenario:** Merge conflict (409) [`unit`]

- **Given** GitLab возвращает 409 с `"Merge request cannot be approved"`
- **When** вызывается `approve({ repository: "group/repo", iid: 42 })`
- **Then** выбрасывается `VcsApproveError` с кодом `CANNOT_APPROVE`
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                   | Required by      |
| --------------------------------------------------------------------------------------------------------- | ---------------- |
| `tsc --noEmit`                                                                                            | typescript-rules |
| `node --import tsx --test services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.approve.test.ts` | node-test        |

- **Task-specific Completion additions:** None beyond project baseline
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Успешный approve → `vcs-gitlab-merge-requests.approve.test.ts` :: `approve success — POST with correct URL and token`
- MR уже approved → `vcs-gitlab-merge-requests.approve.test.ts` :: `approve 409 ALREADY_APPROVED — idempotent error`
- Self-approve forbidden → `vcs-gitlab-merge-requests.approve.test.ts` :: `approve 403 SELF_APPROVE_FORBIDDEN`
- Типизация query → `vcs-gitlab-merge-requests.approve.test.ts` :: `VcsMergeRequestApproveQuery type contract`
- Merge conflict → `vcs-gitlab-merge-requests.approve.test.ts` :: `approve 409 CANNOT_APPROVE — conflict error`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt. Per-phase blocks within a Round. Skeleton is minimal.)_

### Round 1 — <YYYY-MM-DD>, initial

#### P1

- [ ] `<ts>` ver `tsc --noEmit` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [vcs-merge-request-approve-query.type.ts, vcs-client-merge-requests.ts (+approve), vcs-gitlab-merge-requests.ts (+approve)]; decisions: []; open: []

#### P2

- [ ] `<ts>` ver `node --import tsx --test services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.approve.test.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [vcs-gitlab-merge-requests.approve.test.ts]; decisions: []; open: []

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
