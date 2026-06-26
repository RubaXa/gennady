# Task: TSK-77 — updateNote/deleteNote порт + адаптер
## 1. Meta
- **Task-ID:** TSK-77 | **Status:** [ ] TODO | **Scope:** vcs | **Module:** vcs-client | **Dependencies:** None
- **Purpose:** `VcsClientMergeDiscussions.updateNote/deleteNote` + GitLab-адаптер + `VcsDiscussionNote.noteId`. Guard: только свои заметки.
- **Spec:** [vcs.spec.md §FR-42..47](../../specs/vcs/vcs.spec.md) | **Runtime:** real-runtime | **Verification:** contract, unit
## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | — | [ ] |
| P2 | test | P1 | [ ] |
## 3. Phases
### P1 — impl
- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/vcs-client/entities/` (new VO), `services/vcs-client/abstract/vcs-client-merge-discussions.ts`, `services/vcs-client/gitlab/vcs-gitlab-merge-discussions.ts`, `review-issues` XML артефакт
- **Exit:** updateNote/deleteNote на порте; PUT/DELETE адаптер; noteId в артефакте
### P2 — test
- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-discussions.edit.test.ts`
- **Exit:** 4 BDD covered
## 4. BDD
- updateNote(noteId, body) → PUT /notes/:note_id, 200 → void
- deleteNote(noteId) → DELETE /notes/:note_id, 204 → void
- Чужая заметка (author != currentUser) → ошибка
- 404 → ошибка
