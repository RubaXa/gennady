# Task: TSK-67 — Метод approve на MergeRequests порте

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-67
- **Status:** [x] DONE
- **Purpose:** Добавить метод `approve(query)` на порт `VcsClientMergeRequests` + value object `VcsMergeRequestApproveQuery` + реализацию в `VcsGitlabMergeRequests` (`POST /projects/:id/merge_requests/:iid/approve`)
- **Scope:** `vcs`
- **Module:** `vcs-client`
- **Dependencies:** None (существующие порты и адаптеры уже реализованы)
- **Reopens:** 1 (2026-06-26 — audit-driven fix: F-02 AX_CATCH_LOG_RECOVER)
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
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

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

### Round 1 — 2026-06-26, initial

#### P1

- [x] `2026-06-26T14:55:25Z` intro `VcsMergeRequestApproveQuery` ← P1: value object для параметров approve MR
- [x] `2026-06-26T14:55:25Z` intro `VcsApproveErrorCode` ← P1: union-тип кодов ошибок approve
- [x] `2026-06-26T14:55:25Z` intro `VcsApproveError` ← P1: доменный класс ошибки для отклонённого approve
- [x] `2026-06-26T14:55:25Z` discovery file `services/vcs-client/github/vcs-github-merge-requests.ts` missing `approve()` — добавлен stub (GitHub approve — deferred per spec)
- [x] `2026-06-26T14:55:25Z` discovery file `cli/cmd/_shared/vcs-context-resolver.ts` — pre-existing type errors (TS18047, TS2339) и format-расхождения исправлены по правилу ownership
- [x] `2026-06-26T14:55:25Z` ver `sdd verify → typecheck` → pass exit=0
- [x] `2026-06-26T14:55:25Z` ver `sdd verify → gennady lint` → pass exit=0
- [x] `2026-06-26T14:55:25Z` ver `sdd verify → test` → pass exit=0
- [x] `2026-06-26T14:55:25Z` ver `sdd verify → format` → pass exit=0
- [x] `2026-06-26T14:55:25Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-06-26T14:55:25Z` DONE
      **Handoff →** artifacts: [vcs-merge-request-approve-query.type.ts, vcs-client-merge-requests.ts, vcs-gitlab-merge-requests.ts]; decisions: [VcsApproveError=introduced, VcsApproveErrorCode=ALREADY_APPROVED|SELF_APPROVE_FORBIDDEN|CANNOT_APPROVE, approve-method=POST-/projects/:id/merge_requests/:iid/approve, github-approve=stub-deferred]; open: []

#### P2

- [x] `2026-06-26T14:59:55Z` discovery тесты размещены в `services/vcs-client/gitlab/__tests__/` (как указано в ticket Target Files), в то время как существующие тесты живут в `services/vcs-client/__tests__/gitlab/` — расхождение конвенций
- [x] `2026-06-26T14:59:55Z` ver `sdd verify → typecheck` → pass exit=0
- [x] `2026-06-26T14:59:55Z` ver `sdd verify → gennady lint` → pass exit=0
- [x] `2026-06-26T14:59:55Z` ver `sdd verify → test` → pass exit=0
- [x] `2026-06-26T14:59:55Z` ver `sdd verify → format` → pass exit=0
- [x] `2026-06-26T14:59:55Z` ver `node --import tsx --test services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.approve.test.ts` → pass exit=0
- [x] `2026-06-26T14:59:55Z` DONE
      **Handoff →** artifacts: [services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.approve.test.ts]; decisions: [approve-tests=5-cases, node-test-pass=5/5]; open: []

#### Round close

- [x] `2026-06-26T15:02:00Z` DONE

### Round 2 — 2026-06-26, fix: address audit finding F-02

#### P1 — re-run: fix: address audit finding F-02 — AX_CATCH_LOG_RECOVER violation in approve() catch block

- [x] `2026-06-26T15:10:00Z` ver `sdd verify → typecheck` → pass exit=0
- [x] `2026-06-26T15:10:00Z` ver `sdd verify → gennady lint` → pass exit=0
- [x] `2026-06-26T15:10:00Z` ver `sdd verify → test` → pass exit=0
- [x] `2026-06-26T15:10:00Z` ver `sdd verify → format` → pass exit=0
- [x] `2026-06-26T15:10:00Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-06-26T15:10:00Z` DONE
      **Handoff →** artifacts: [services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts]; decisions: [logger-import=added, logger.error=added-before-domain-error-mapping]; open: []

#### Round close

- [x] `2026-06-26T15:12:00Z` DONE
<!--/SECTION:EXECUTION_LOG-->
