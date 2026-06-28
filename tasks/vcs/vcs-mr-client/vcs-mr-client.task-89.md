# Task: TSK-89 — GitLab adapter: MR create + update

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-89
- **Status:** [ ] TODO
- **Purpose:** Реализовать `create` и `update` методы в GitLab-адаптере `VcsGitlabMergeRequests` через REST API.
- **Scope:** `vcs-mr-management`
- **Module:** `vcs-mr-client`
- **Dependencies:** TSK-88
- **Reopens:** 0
- **Spec References:**
  - Scope spec: [vcs-mr-management.spec.md §3](../../specs/vcs/vcs-mr-management/vcs-mr-management.spec.md) — `VcsGitlabMergeRequests.create`, `.update`
  - FR-MR-02, FR-MR-06, FR-MR-08, D-001
- **Runtime Backing:** `real-runtime` (GitLab REST API)
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps   | Status   |
| --- | ---- | ------ | -------- |
| P1  | impl | TSK-88 | [ ] TODO |
| P2  | test | P1     | [ ]      |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Реализовать `create(query)` и `update(query)` в `VcsGitlabMergeRequests`. `create`: `POST /projects/:id/merge_requests`. `update`: `PUT /projects/:id/merge_requests/:iid`. Draft-status через title-префикс `Draft: ` / `WIP: `.
- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts` (MODIFY: +create, +update)
- **Inputs:** TSK-88 handoff (query types, abstract port)
- **Exit:** `create(query)` → `POST /projects/:id/merge_requests` с маппингом полей; `update(query)` → `PUT /projects/:id/merge_requests/:iid`; draft: `title` префикс менеджмент (см. D-001); все параметры мапятся согласно §3 адаптера
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-тесты: create happy path, create with draft, update title, update draft↔ready, update draft+title together (guard от двойного префикса), update addLabels/removeLabels, error paths (401, 404, 409). Моки fetch.
- **Rules:** [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.create-update.test.ts` (NEW)
- **Inputs:** P1 handoff
- **Exit:** BDD сценарии покрыты; моки fetch; pass
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** GitLab MR create + update

**Scenario:** Create MR [`unit`]

- **Given** `VcsMergeRequestCreateQuery` с project, title, sourceBranch
- **When** `create()` вызван
- **Then** `POST /projects/:id/merge_requests` с телом `{ source_branch, target_branch, title }`
- **And** возвращает `{ webUrl, iid, title }`

**Scenario:** Create draft MR [`unit`]

- **Given** `VcsMergeRequestCreateQuery` с `draft: true`
- **When** `create()` вызван
- **Then** тело запроса содержит `draft: true`

**Scenario:** Update title [`unit`]

- **Given** `VcsMergeRequestUpdateQuery` с `title: 'New title'`
- **When** `update()` вызван
- **Then** `PUT /projects/:id/merge_requests/:iid` с телом `{ title: 'New title' }`

**Scenario:** Update draft → ready [`unit`]

- **Given** `VcsMergeRequestUpdateQuery` с `draft: false`, без title
- **When** `update()` вызван
- **Then** отправляет title с убранным префиксом `Draft: ` / `WIP: `

**Scenario:** Update draft + title (no double prefix) [`unit`]

- **Given** `draft: true` и `title: 'Fix bug'`
- **When** `update()` вызван
- **Then** отправляет `title: 'Draft: Fix bug'` (один префикс)

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                         | Required by      |
| --------------------------------------------------------------------------------------------------------------- | ---------------- |
| `tsc --noEmit`                                                                                                  | typescript-rules |
| `node --import tsx --test services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.create-update.test.ts` | node-test        |

<!--/SECTION:VERIFICATION-->

## 7. Execution Log

_(Round = один execute-then-audit цикл.)_
