# Task: TSK-71 — Метод resolveDiscussion на MergeDiscussions порте

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-71
- **Status:** [x] DONE
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
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

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
- 500 ошибка → `resolve.test.ts` :: `resolveDiscussion 500 — VcsError`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-06-26, initial

#### P1

- [x] `2026-06-26T16:47:37Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-26T16:47:37Z` ver `gennady lint 3 files` → pass exit=0
- [x] `2026-06-26T16:47:37Z` ver `npm run test` → pass exit=0
- [x] `2026-06-26T16:47:37Z` ver `npm run format:check` → pass exit=0
- [x] `2026-06-26T16:47:37Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-06-26T16:47:37Z` DONE
      **Handoff →** artifacts: [services/vcs-client/entities/vcs-resolve-discussion-query.type.ts, services/vcs-client/abstract/vcs-client-merge-discussions.ts, services/vcs-client/gitlab/vcs-gitlab-merge-discussions.ts]; decisions: [resolveDiscussion-method=abstract-on-port, resolveDiscussion-impl=PUT-with-resolved-query-param]; open: []

#### P2

- [x] `2026-06-26T16:51:31Z` insight VcsError не существует как отдельный класс; resolveDiscussion пробрасывает ошибки от \_request без оборачивания (в отличие от approve с VcsApproveError) → BDD §4 Scenario «403/404 ошибки» и «500 ошибка», требуется либо создать VcsError, либо обновить контракт
- [x] `2026-06-26T16:51:31Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-26T16:51:31Z` ver `gennady lint 1 files` → pass exit=0
- [x] `2026-06-26T16:51:31Z` ver `npm run test` → pass exit=0
- [x] `2026-06-26T16:51:31Z` ver `npm run format:check` → pass exit=0
- [x] `2026-06-26T16:51:31Z` ver `node --import tsx --test services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-discussions.resolve.test.ts` → pass exit=0
- [x] `2026-06-26T16:51:31Z` DONE
      **Handoff →** artifacts: [services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-discussions.resolve.test.ts]; decisions: [resolve-test-context=factory-pattern, resolve-error-propagation=no-domain-wrap, vcserror-class=absent]; open: [VCSERR-01: класс VcsError не создан — resolveDiscussion пробрасывает plain Error, контракт порта обещает VcsError]

#### Round close

- [x] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->

<!--SECTION:AUDIT_ROUNDS-->

## Audit Rounds

### Audit Round 1 — 2026-06-26, after Execution Round 1

```
@audit task=TSK-71 round=1 after-exec-round=1 triggered-reopen=Round-2 status=FAIL counts=B0·M1·m0·I0
F-01 | sev=M | type=COMPLETENESS_GAP | conf=H | loc=services/vcs-client/abstract/vcs-client-merge-discussions.ts:123 | phase=P1 | src=specs/vcs/vcs.spec.md#FR-33 | route=ticket-reopen | act=создать VcsError с полем status либо обновить FR-33+BDD+порт на plain Error; привести реализацию и тесты к единому контракту
```

<!--/SECTION:AUDIT_ROUNDS-->
