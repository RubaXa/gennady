# Task: TSK-82 — getPipeline порт + адаптер

## 1. Meta

- **Task-ID:** TSK-82 | **Status:** [ ] TODO | **Scope:** vcs | **Module:** vcs-client | **Dependencies:** None
- **Purpose:** `VcsClientMergeRequests.getPipeline` + `VcsPipeline` + GitLab GraphQL адаптер. GitHub stub.
- **Spec:** [vcs.spec.md §FR-48..50](../../specs/vcs/vcs.spec.md) | **Runtime:** real-runtime | **Verification:** contract, unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

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

## 6. Test Scenario Coverage

| #   | Case name                                                        | Scenario kind | Binds to BDD # | Runtime Fidelity |
| --- | ---------------------------------------------------------------- | ------------- | -------------- | ---------------- |
| 1   | returns pipeline status and jobs from GraphQL headPipeline query | happy-path    | 1              | contract-only    |
| 2   | returns empty status and empty jobs when headPipeline is absent  | boundary      | 2              | contract-only    |
| 3   | throws when GraphQL transport is not configured                  | failure-path  | —              | contract-only    |
| 4   | satisfies VcsPipeline type contract                              | type-contract | 3              | contract-only    |

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-06-26T18:29:33Z` intro VcsPipeline ← FR-50: value object for pipeline status and job list
- [x] `2026-06-26T18:29:33Z` intro VcsPipelineQuery ← FR-48: query parameters for getPipeline port method
- [x] `2026-06-26T18:29:33Z` intro VcsClientMergeRequests.getPipeline ← FR-48: abstract port method returning Promise<VcsPipeline>
- [x] `2026-06-26T18:29:33Z` intro VcsGitlabMergeRequests.getPipeline ← FR-49: GraphQL headPipeline { status jobs { nodes { name status } } } implementation
- [x] `2026-06-26T18:29:33Z` intro VcsGithubMergeRequests.getPipeline ← stub: GitHub pipelines deferred per scope spec
- [x] `2026-06-26T18:29:33Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:29:33Z` ver npm run lint:contracts → pass exit=0
- [x] `2026-06-26T18:29:33Z` ver npm run test → pass exit=0
- [x] `2026-06-26T18:29:33Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:31:12Z` DONE
      **Handoff →** artifacts: [services/vcs-client/entities/vcs-pipeline.type.ts, services/vcs-client/abstract/vcs-client-merge-requests.ts, services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts, services/vcs-client/github/vcs-github-merge-requests.ts]; decisions: [graphql-injection=optional-constructor-param, pipeline-absence=empty-result, github-stub=deferred]; open: [WIRE_GRAPHQL: vcs-gitlab-client.ts must pass graphql to VcsGitlabMergeRequests constructor for getPipeline to work at runtime]

#### P2

- [x] `2026-06-26T18:34:05Z` intro VcsGitlabMergeRequests.getPipeline test file ← TSK-82 P2: covers happy path, absent pipeline, missing graphql transport, type contract
- [x] `2026-06-26T18:34:05Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:34:05Z` ver npm run lint:contracts → pass exit=0
- [x] `2026-06-26T18:34:05Z` ver npm run test → pass exit=0
- [x] `2026-06-26T18:34:05Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:34:05Z` DONE
      **Handoff →** artifacts: [services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.pipeline.test.ts]; decisions: []; open: [WIRE_GRAPHQL: vcs-gitlab-client.ts must pass graphql to VcsGitlabMergeRequests constructor for getPipeline to work at runtime]
