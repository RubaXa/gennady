# Task: VMM-gh-crud — GitHub adapter: MR/PR create + update + getList + getByIid

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** VMM-gh-crud
- **Status:** [ ] TODO
- **Purpose:** Реализовать `create`, `update`, `getList`, `getByIid` в GitHub-адаптере `VcsGithubMergeRequests` через REST API. Заменить stub-заглушки.
- **Scope:** `vcs-mr-management`
- **Module:** `vcs-mr-client`
- **Dependencies:** VMM-core
- **Reopens:** 0
- **Spec References:**
  - FR-MR-03, FR-MR-07, FR-MR-09, FR-DEP-01, D-002
- **Runtime Backing:** `real-runtime` (GitHub REST API)
- **Verification Levels:** `unit`
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status   |
| --- | ---- | ---- | -------- |
| P1  | impl | —    | [ ] TODO |
| P2  | test | P1   | [ ]      |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** `create`: `POST /repos/:owner/:repo/pulls`. `update`: `PATCH /repos/:owner/:repo/pulls/:number`. `getList`: `GET /repos/:owner/:repo/pulls` с параметрами фильтрации. `getByIid`: `GET /repos/:owner/:repo/pulls/:number`. Draft через нативное поле `draft` (GitHub API). `addLabels`/`removeLabels` через `GET` текущих labels → compute → `PATCH`.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/github/vcs-github-merge-requests.ts` (MODIFY: +create, +update, fix getList/getByIid stubs)
- **Exit:** все 4 метода работают; getList/getByIid больше не throw 'not implemented'
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-тесты с моками fetch. Happy path для всех методов. Error paths.
- **Target Files:**
  - `services/vcs-client/github/__tests__/vcs-github-merge-requests.create-update.test.ts` (NEW)
  - `services/vcs-client/github/__tests__/vcs-github-merge-requests.test.ts` (MODIFY: remove 'not implemented' expects)
- **Exit:** BDD pass; старые тесты обновлены
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:VERIFICATION-->
  <!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command                                                                                                         | Required by      | Role  |
| --------------------------------------------------------------------------------------------------------------- | ---------------- | ----- |
| `tsc --noEmit`                                                                                                  | typescript-rules | extra |
| `node --import tsx --test services/vcs-client/github/__tests__/vcs-github-merge-requests.create-update.test.ts` | node-test        | extra |

<!--/SECTION:VERIFICATION-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = один execute-then-audit цикл.)_

### Round 1 — 2026-09-21, initial

#### P1

- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
