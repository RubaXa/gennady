# Task: TSK-71 — Метод resolveDiscussion на MergeDiscussions порте

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-71
- **Status:** [ ] TODO
- **Purpose:** Добавить `resolveDiscussion(query)` на порт `VcsClientMergeDiscussions` + VO `VcsResolveDiscussionQuery` + реализацию в `VcsGitlabMergeDiscussions` (`PUT /discussions/:id?resolved=true|false`)
- **Scope:** `vcs`
- **Module:** `vcs-client`
- **Dependencies:** None
- **Reopens:** 0
- **Spec References:**
  - Scope spec: [vcs.spec.md §FR-30..FR-34](../../../specs/vcs/vcs.spec.md)
  - Port: [VcsClientMergeDiscussions](../../../specs/vcs/vcs-client/vcs-client.spec.md)
- **Runtime Backing:** `real-runtime`
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

- **Objective:** Создать `VcsResolveDiscussionQuery`, добавить `resolveDiscussion()` на порт `VcsClientMergeDiscussions`, реализовать в GitLab-адаптере (`PUT /projects/:id/merge_requests/:iid/discussions/:discussion_id?resolved=true|false`). GitHub — stub deferred.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/entities/vcs-resolve-discussion-query.type.ts`
  - `services/vcs-client/abstract/vcs-client-merge-discussions.ts`
  - `services/vcs-client/gitlab/vcs-gitlab-merge-discussions.ts`
- **Inputs:** none
- **Exit:** `resolveDiscussion` на порте; GitLab-адаптер делает PUT с `resolved=true|false`; typecheck pass
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-тесты: resolve success, reopen, 403 forbidden, 404 not found.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-discussions.resolve.test.ts`
- **Inputs:** P1 handoff
- **Exit:** 4 BDD сценария покрыты; tests pass
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** Resolve GitLab Merge Request discussion

**Scenario:** Resolve success [`unit`]

- **Given** GitLab возвращает 200
- **When** `resolveDiscussion({ project: "g/r", iid: 42, discussionId: "abc", resolved: true })`
- **Then** PUT на `/projects/g%2Fr/merge_requests/42/discussions/abc?resolved=true`
- **And** Promise resolved (void)

**Scenario:** Reopen [`unit`]

- **Given** GitLab возвращает 200
- **When** `resolveDiscussion({ project: "g/r", iid: 42, discussionId: "abc", resolved: false })`
- **Then** PUT с `resolved=false`

**Scenario:** Типизация — обязательные поля [`contract`]

- **Given** `VcsResolveDiscussionQuery`
- **Then** `project`, `iid`, `discussionId`, `resolved` — все обязательны

- **And** compile-time gate: `@ts-expect-error` при вызове без `resolved`**Scenario:** 403/404 ошибки [`unit`]

- **Given** GitLab возвращает 403 или 404
- **When** `resolveDiscussion(...)`
- **Then** выбрасывается `VcsError` с полем `status` (403 или 404)

**Scenario:** 500 ошибка [`unit`]
- **Given** GitLab возвращает 500
- **When** `resolveDiscussion(...)`
- **Then** выбрасывается `VcsError` со статусом 500<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                      | Required by      |
| ------------------------------------------------------------------------------------------------------------ | ---------------- |
| `tsc --noEmit`                                                                                               | typescript-rules |
| `node --import tsx --test services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-discussions.resolve.test.ts` | node-test        |

- **Task-specific Completion additions:** None
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Resolve success → `resolve.test.ts` :: `resolveDiscussion resolved=true — PUT success`
- Reopen → `resolve.test.ts` :: `resolveDiscussion resolved=false — reopen`
- Типизация → `resolve.test.ts` :: `VcsResolveDiscussionQuery type contract`
- 403/404 → `resolve.test.ts` :: `resolveDiscussion 403/404 — VcsError`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — <YYYY-MM-DD>, initial

#### P1

- [ ] `<ts>` ver `tsc --noEmit` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []

#### P2

- [ ] `<ts>` ver `node --import tsx --test ...` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
