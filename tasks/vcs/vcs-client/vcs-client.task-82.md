# Task: TSK-82 — getPipeline порт + адаптер

## 1. Meta

- **Task-ID:** TSK-82 | **Status:** [ ] TODO | **Scope:** vcs | **Module:** vcs-client | **Dependencies:** None
- **Purpose:** `VcsClientMergeRequests.getPipeline` + `VcsPipeline` + GitLab GraphQL адаптер. GitHub stub.
- **Spec:** [vcs.spec.md §FR-48..50](../../specs/vcs/vcs.spec.md) | **Runtime:** real-runtime | **Verification:** contract, unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/vcs-client/entities/` (VcsPipeline VO), `services/vcs-client/abstract/vcs-client-merge-requests.ts`, `services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts`
- **Exit:** getPipeline на порте; VcsPipeline тип; GraphQL `headPipeline { status jobs {...} }` в адаптере

### P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.pipeline.test.ts`
- **Exit:** 3 BDD covered

## 4. BDD

- getPipeline → GraphQL headPipeline, возвращает {status, jobs}
- Нет пайплайна → null/пустой ответ
- Contract: VcsPipeline.status: string, jobs: {name, status}[]
