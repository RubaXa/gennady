# Task: TSK-84 — VcsClientPipeline порт + VcsGitlabPipeline адаптер
## 1. Meta
- **Task-ID:** TSK-84 | **Status:** [ ] TODO | **Scope:** vcs | **Module:** vcs-client | **Dependencies:** None
- **Purpose:** VcsClientPipeline port (getJob/playJob/cancelJob/getJobLog) + VcsGitlabPipeline REST adapter + VcsJob/VcsJobQuery VOs + rename VcsPipeline→VcsPipelineStatus (+id in jobs)
- **Spec:** vcs.spec.md §FR-48..54 | **Runtime:** real-runtime | **Verify:** contract, unit
## 2. Phases
| ID | Kind | Deps |
|----|------|------|
| P1 | impl | — |
| P2 | test | P1 |
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
