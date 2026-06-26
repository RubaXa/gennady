# Task: TSK-84 — VcsClientPipeline порт + VcsGitlabPipeline адаптер

## 1. Meta

- **Task-ID:** TSK-84 | **Status:** [ ] TODO | **Scope:** vcs | **Module:** vcs-client | **Dependencies:** None
- **Purpose:** VcsClientPipeline port (getJob/playJob/cancelJob/getJobLog) + VcsGitlabPipeline REST adapter + VcsJob/VcsJobQuery VOs + rename VcsPipeline→VcsPipelineStatus (+id in jobs)
- **Spec:** vcs.spec.md §FR-48..54 | **Runtime:** real-runtime | **Verify:** contract, unit

## 2. Phases

| ID  | Kind | Status      | Deps |
| --- | ---- | ----------- | ---- |
| P1  | impl | [x]         | —    |
| P2  | test | [x]          | P1   |

## 3. P1 — impl

- **Rules:** typescript-rules
- **Target:** `services/vcs-client/entities/vcs-job.type.ts`, `services/vcs-client/entities/vcs-job-query.type.ts`, `services/vcs-client/abstract/vcs-client-pipeline.ts`, `services/vcs-client/gitlab/vcs-gitlab-pipeline.ts`, `services/vcs-client/abstract/vcs-client.ts` (+Pipeline?), rename `vcs-pipeline.type.ts→vcs-pipeline-status.type.ts`
- **Exit:** port + adapter + VOs; VcsPipelineStatus.id в jobs; typecheck

## 4. BDD

- getJob → GET /projects/:id/jobs/:job_id, 200→VcsJob
- playJob → POST .../play, retry alias
- cancelJob → POST .../cancel
- getJobLog → GET .../trace → string
- VcsPipelineStatus.jobs содержит id для name→id резолва

## 5. Verification

| Command                | Required by      |
| ---------------------- | ---------------- |
| `npm run type-check`   | typescript-rules |
| `npm run format:check` | typescript-rules |

## 6. Test Scenario Coverage

| Scenario              | Test file                                                          |
| --------------------- | ------------------------------------------------------------------ |
| getJob → 200→VcsJob   | services/vcs-client/gitlab/\_\_tests\_\_/vcs-gitlab-pipeline.test.ts |
| playJob → retry alias | services/vcs-client/gitlab/\_\_tests\_\_/vcs-gitlab-pipeline.test.ts |
| cancelJob             | services/vcs-client/gitlab/\_\_tests\_\_/vcs-gitlab-pipeline.test.ts |
| getJobLog → string    | services/vcs-client/gitlab/\_\_tests\_\_/vcs-gitlab-pipeline.test.ts |

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-06-26T19:27:43Z` intro VcsJob ← FR-53: normalized CI/CD job representation
- [x] `2026-06-26T19:27:43Z` intro VcsJobQuery ← FR-54: scoping parameters for job operations
- [x] `2026-06-26T19:27:43Z` intro VcsPipelineStatus ← FR-50: rename VcsPipeline→VcsPipelineStatus, add id to jobs
- [x] `2026-06-26T19:27:43Z` intro VcsClientPipeline ← FR-51: optional port on VcsClient for job management
- [x] `2026-06-26T19:27:43Z` intro VcsGitlabPipeline ← FR-52: REST adapter for GitLab job endpoints
- [x] `2026-06-26T19:27:43Z` intro VcsClient.Pipeline ← FR-51: optional Pipeline port wired onto VcsClient
- [x] `2026-06-26T19:27:43Z` decision getPipeline-return-type=VcsPipelineStatus ← FR-48: renamed per spec
- [x] `2026-06-26T19:27:43Z` discovery ticket missing §5–§7 sections — added minimal Verification + Execution Log
- [x] `2026-06-26T19:27:43Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T19:27:43Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T19:27:43Z` DONE
      **Handoff →** artifacts: [services/vcs-client/entities/vcs-job.type.ts, services/vcs-client/entities/vcs-job-query.type.ts, services/vcs-client/entities/vcs-pipeline-status.type.ts, services/vcs-client/abstract/vcs-client-pipeline.ts, services/vcs-client/gitlab/vcs-gitlab-pipeline.ts, services/vcs-client/abstract/vcs-client.ts, services/vcs-client/gitlab/vcs-gitlab-client.ts, services/vcs-client/github/vcs-github-client.ts]; decisions: [getPipeline-return-type=VcsPipelineStatus, pipeline-port-optional=true, job-includes-id=true]; open: [P2: write unit tests for VcsGitlabPipeline]

#### P2

- 🛑 `2026-06-26T19:30:52Z` BLOCKED: отсутствует блок P2 в разделе ## 3. Phases — нет Rules, Target Files, Exit
  - 🔗 axiom: AX_PHASE_NOT_FOUND
  - 💬 unblock: добавить блок `## 3. P2 — test` с полями Rules, Target, Exit в тикет TSK-84
- ✅ `2026-06-26T19:34:57Z` RESOLVED: оператор добавил блок ## 3. P2 — test с Rules, Target Files, Inputs, Exit
- [x] `2026-06-26T19:34:57Z` discovery pre-existing OpencodeEngine test fail (readonly.config.json missing write/patch deny) → fixed per sdd verify error ownership
- [x] `2026-06-26T19:34:57Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T19:34:57Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T19:34:57Z` DONE
**Handoff →** artifacts: [services/vcs-client/gitlab/__tests__/vcs-gitlab-pipeline.test.ts]; decisions: []; open: []

## 3. P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/vcs-client/gitlab/__tests__/vcs-gitlab-pipeline.test.ts`
- **Inputs:** P1 handoff
- **Exit:** 4 BDD covered; tests pass; typecheck+format clean
