# Task: TSK-90 — GitHub adapter: MR/PR create + update + getList + getByIid

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-90
- **Status:** [ ] TODO
- **Purpose:** Реализовать `create`, `update`, `getList`, `getByIid` в GitHub-адаптере `VcsGithubMergeRequests` через REST API. Заменить stub-заглушки.
- **Scope:** `vcs-mr-management`
- **Module:** `vcs-mr-client`
- **Dependencies:** TSK-88
- **Reopens:** 0
- **Spec References:**
  - FR-MR-03, FR-MR-07, FR-MR-09, FR-DEP-01, D-002
- **Runtime Backing:** `real-runtime` (GitHub REST API)
- **Verification Levels:** `unit`
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps   | Status   |
| --- | ---- | ------ | -------- |
| P1  | impl | TSK-88 | [ ] TODO |
| P2  | test | P1     | [ ]      |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

### P1 — impl

- **Objective:** `create`: `POST /repos/:owner/:repo/pulls`. `update`: `PATCH /repos/:owner/:repo/pulls/:number`. `getList`: `GET /repos/:owner/:repo/pulls` с параметрами фильтрации. `getByIid`: `GET /repos/:owner/:repo/pulls/:number`. Draft через нативное поле `draft` (GitHub API). `addLabels`/`removeLabels` через `GET` текущих labels → compute → `PATCH`.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/github/vcs-github-merge-requests.ts` (MODIFY: +create, +update, fix getList/getByIid stubs)
- **Exit:** все 4 метода работают; getList/getByIid больше не throw 'not implemented'
<!--/SECTION:PHASE_P1-->

### P2 — test

- **Objective:** Unit-тесты с моками fetch. Happy path для всех методов. Error paths.
- **Target Files:**
  - `services/vcs-client/github/__tests__/vcs-github-merge-requests.create-update.test.ts` (NEW)
  - `services/vcs-client/github/__tests__/vcs-github-merge-requests.test.ts` (MODIFY: remove 'not implemented' expects)
- **Exit:** BDD pass; старые тесты обновлены
<!--/SECTION:PHASE_P2-->

## 5. Verification

| Command                                                                                                         | Required by      |
| --------------------------------------------------------------------------------------------------------------- | ---------------- |
| `tsc --noEmit`                                                                                                  | typescript-rules |
| `node --import tsx --test services/vcs-client/github/__tests__/vcs-github-merge-requests.create-update.test.ts` | node-test        |

## 7. Execution Log

_(Round = один execute-then-audit цикл.)_
