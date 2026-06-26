# TSK-86 — deleteDiscussion + draft methods (port + adapter)
## 1. Meta
- **Task-ID:** TSK-86 | **Status:** [ ] TODO | **Scope:** vcs | **Module:** vcs-client | **Deps:** None
- **Purpose:** `deleteDiscussion` + `createDraftNote`/`updateDraftNote`/`deleteDraftNote`/`publishDraftNote` на `VcsClientMergeDiscussions` + GitLab-адаптер. `VcsDraftNote` VO.
- **Spec:** vcs.spec.md §FR-55..60 | **Runtime:** real-runtime | **Verify:** contract, unit
## 2. Phases
| ID | Kind | Deps |
|----|------|------|
| P1 | impl | — |
| P2 | test | P1 |
## 3. P1 — impl
- **Rules:** typescript-rules
- **Target:** `services/vcs-client/entities/vcs-draft-note.type.ts`, `services/vcs-client/entities/vcs-delete-discussion-query.type.ts`, `services/vcs-client/abstract/vcs-client-merge-discussions.ts`, `services/vcs-client/gitlab/vcs-gitlab-merge-discussions.ts`
- **Exit:** deleteDiscussion + 4 draft methods on port; GitLab REST адаптер; VcsDraftNote VO; typecheck
## 4. BDD
- deleteDiscussion → DELETE /discussions/:id → void
- createDraftNote → POST /draft_notes → VcsDraftNote
- updateDraftNote → PUT /draft_notes/:id → VcsDraftNote
- deleteDraftNote → DELETE /draft_notes/:id → void
- publishDraftNote → PUT /draft_notes/:id/publish → void
- contract: VcsDraftNote { id, body, author }
