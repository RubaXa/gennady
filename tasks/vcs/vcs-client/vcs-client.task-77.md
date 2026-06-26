# Task: TSK-77 — updateNote/deleteNote порт + адаптер

## 1. Meta

- **Task-ID:** TSK-77 | **Status:** [x] DONE | **Scope:** vcs | **Module:** vcs-client | **Dependencies:** None
- **Purpose:** `VcsClientMergeDiscussions.updateNote/deleteNote` + GitLab-адаптер + `VcsDiscussionNote.noteId`. Guard: только свои заметки.
- **Spec:** [vcs.spec.md §FR-42..47](../../specs/vcs/vcs.spec.md) | **Runtime:** real-runtime | **Verification:** contract, unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

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

## 7. Execution Log

### Round 1

#### P1

- [x] 2026-06-26T18:03:01Z intro VcsUpdateNoteQuery ← FR-42 updateNote port contract
- [x] 2026-06-26T18:03:01Z intro VcsDeleteNoteQuery ← FR-43 deleteNote port contract
- [x] 2026-06-26T18:03:01Z tried JSDoc @throws before @returns → ERR_DBC_ORDER → swapped order
- [x] 2026-06-26T18:03:01Z tried \_verifyNoteOwnership missing @returns → ERR_DBC_LINT_RETURNS_MISSING → added tag
- [x] 2026-06-26T18:03:01Z ver npm run type-check → pass exit=0
- [x] 2026-06-26T18:03:01Z ver npm run test → pass exit=0
- [x] 2026-06-26T18:03:01Z ver npm run format:check → pass exit=0
- [x] 2026-06-26T18:03:01Z DONE
**Handoff →** artifacts: [services/vcs-client/entities/vcs-update-note-query.type.ts, services/vcs-client/entities/vcs-delete-note-query.type.ts, services/vcs-client/abstract/vcs-client-merge-discussions.ts, services/vcs-client/gitlab/vcs-gitlab-merge-discussions.ts, cli/cmd/review/_core/xml/build-review-artifact.xml.ts]; decisions: [guard=_verifyNoteOwnership via GET note + GET /user]; open: []

#### P2
- [x] 2026-06-26T18:25:51Z ver npm run type-check → pass exit=0
- [x] 2026-06-26T18:25:51Z ver npm run test → pass exit=0
- [x] 2026-06-26T18:25:51Z ver npm run format:check → pass exit=0
- [x] 2026-06-26T18:25:51Z DONE
**Handoff →** artifacts: [services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-discussions.edit.test.ts]; decisions: []; open: []
