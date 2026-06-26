# TSK-86 — deleteDiscussion + draft methods (port + adapter)

## 1. Meta

- **Task-ID:** TSK-86 | **Status:** [ ] TODO | **Scope:** vcs | **Module:** vcs-client | **Deps:** None
- **Purpose:** `deleteDiscussion` + `createDraftNote`/`updateDraftNote`/`deleteDraftNote`/`publishDraftNote` на `VcsClientMergeDiscussions` + GitLab-адаптер. `VcsDraftNote` VO.
- **Spec:** vcs.spec.md §FR-55..60 | **Runtime:** real-runtime | **Verify:** contract, unit

## 2. Phases

| ID  | Kind | Deps |
| --- | ---- | ---- | --- |
| P1  | impl | —    | [x] |
| P2  | test | P1   | [x] |

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

## 7. Execution Log

#### Round 1 — initial

##### P1

- [x] `2026-06-26T21:10:06Z` intro VcsDraftNote ← новый VO: id, body, author — контракт из BDD
- [x] `2026-06-26T21:10:06Z` intro VcsDeleteDiscussionQuery ← новый VO для параметров удаления треда
- [x] `2026-06-26T21:10:06Z` intro VcsCreateDraftNoteQuery, VcsUpdateDraftNoteQuery, VcsDeleteDraftNoteQuery, VcsPublishDraftNoteQuery ← типы для черновиков, inline в порте
- [x] `2026-06-26T21:10:06Z` intro deleteDiscussion + createDraftNote/updateDraftNote/deleteDraftNote/publishDraftNote ← 5 новых методов на VcsClientMergeDiscussions + VcsGitlabMergeDiscussions
- [x] `2026-06-26T21:10:45Z` tried fix DBC lint: @see-only → full JSDoc (@param, @returns, @sideEffect, @see) на 5 новых методах адаптера — lint прошёл
- [x] `2026-06-26T21:11:30Z` tried fix format: prettier —write на vcs-gitlab-merge-discussions.ts — format прошёл
- [x] `2026-06-26T21:11:45Z` discovery тест cli/cmd/lint/**tests**/lint.cmd.test.ts падает в параллельном прогоне (ERR_TEST_FAILURE: Unable to deserialize cloned data), при изолированном запуске проходит — pre-existing race condition в инфраструктуре тестов
- [x] `2026-06-26T21:12:30Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T21:12:30Z` ver gennady lint → pass exit=0
- [x] `2026-06-26T21:12:30Z` ver npm run test → pass exit=0
- [x] `2026-06-26T21:12:30Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T21:12:40Z` DONE
      **Handoff →** artifacts: [services/vcs-client/entities/vcs-draft-note.type.ts, services/vcs-client/entities/vcs-delete-discussion-query.type.ts, services/vcs-client/abstract/vcs-client-merge-discussions.ts, services/vcs-client/gitlab/vcs-gitlab-merge-discussions.ts]; decisions: [DraftNoteQueryTypes=inline-in-port, DraftNotePosition=reuses-VcsDiscussionPosition]; open: []

##### P2

- 🛑 `2026-06-26T21:13:34Z` BLOCKED: P2 phase block missing from ticket §3 — секция P2 отсутствует в разделе Phases (нет Rules, Target, Exit, Inputs)
  - 🔗 axiom: AX_BLOCKER_ESCALATION
  - 💬 unblock: добавить секцию P2 в §3 Phases тикета (Rules, Target, Exit, Inputs), а также недостающие §5 Verification и §6 Test Scenario Coverage

#### P2 — re-run: resume after blocker

- [x] `2026-06-26T21:17:15Z` discovery секции §5 Verification и §6 Test Scenario Coverage отсутствуют в тикете — unblock-условия BLOCKER-а требовали их добавить; оператор разрешил продолжить без них
- [x] `2026-06-26T21:17:15Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T21:17:15Z` ver gennady lint → pass exit=0
- [x] `2026-06-26T21:17:15Z` ver npm run test → pass exit=0
- [x] `2026-06-26T21:17:15Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T21:17:15Z` DONE
      **Handoff →** artifacts: [services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-discussions.draft.test.ts]; decisions: [test-strategy=mock.fn, coverage=8-tests-6-BDD+position+error]; open: [T-1: §5 Verification и §6 Test Scenario Coverage всё ещё отсутствуют в тикете]

### P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-discussions.draft.test.ts`
- **Inputs:** P1 handoff
- **Exit:** 6 BDD covered; tests pass; typecheck+format clean
