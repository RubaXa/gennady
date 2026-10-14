# CLI-draft — vcs-reply delete discussion + vcs-draft-note CLI

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** CLI-draft | **Status:** [ ] TODO | **Scope:** cli | **Module: vcs-draft-note | **Deps:\*\* VC-drafts
- **Purpose:** A) vcs-reply: `{discussionId, delete:true}` без noteId → deleteDiscussion. B) vcs-draft-note: --list|--create|--update|--delete|--publish. vcs-context-resolver.
- **Spec:** cli.spec.md §FR-VR-18, §4.1.22 | **Runtime:** real-runtime | **Verify:** unit

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->
<!--SECTION:PHASE_P1-->

## 3. P1 — impl

- **Rules:** typescript-rules
- **Target Files:**
  - `cli/cmd/vcs-reply/vcs-reply.cmd.ts`
  - `cli/cmd/vcs-draft-note/vcs-draft-note.cmd.ts`
  - `cli/cmd/vcs-draft-note/index.ts`
  - `cli/cmd/vcs-draft-note/help.ts`
  - `cli/gennady.ts`
- **Exit:** delete discussion в vcs-reply; vcs-draft-note команда зарегистрирована

<!--/SECTION:PHASE_P1-->
<!--SECTION:BDD-->

## 4. BDD

- vcs-reply: {discussionId, delete:true} → deleteDiscussion
- vcs-draft-note --list → listDraftNotes → вывод списка
- vcs-draft-note --create "text" → createDraftNote
- vcs-draft-note --update <id> "text" → updateDraftNote
- vcs-draft-note --delete <id> → deleteDraftNote
- vcs-draft-note --publish <id> → publishDraftNote

**Scenario:** Ошибка API при удалении draft note [`unit`]

- **Given** VCS adapter отклоняет `deleteDraftNote`
- **When** выполняется `vcs-draft-note --delete`
- **Then** ошибка попадает в stderr, а команда завершается с exit 1

<!--/SECTION:BDD-->
<!--SECTION:TEST_COVERAGE-->

## 5. Test Scenario Coverage

- Ошибка API при удалении draft note → `vcs-draft-note.test.ts` :: `should propagate deleteDraftNote error to stderr and exit 1`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1

#### P1

- [x] `2026-06-26T21:20:56Z` intro VcsDraftDeps ← DI-тип для команды vcs-draft-note (по образцу VcsApproveDeps)
- [x] `2026-06-26T21:20:56Z` intro run ← экспортируемая точка входа vcs-draft-note (resolveContext + dispatch)
- [x] `2026-06-26T21:20:56Z` intro printHelp ← CLI-хелп vcs-draft
- [x] `2026-06-26T21:20:56Z` ver sdd verify → pass
- [x] `2026-06-26T21:20:56Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-reply/vcs-reply.cmd.ts, cli/cmd/vcs-draft-note/vcs-draft-note.cmd.ts, cli/cmd/vcs-draft-note/index.ts, cli/cmd/vcs-draft-note/help.ts, cli/gennady.ts]; decisions: [deleteDiscussion=via-{discussionId-delete:true-without-noteId}, vcs-draft-di=vcs-approve-pattern-with-VcsDraftDeps, vcs-draft-actions=list-create-update-delete-publish]; open: []

#### P2 — test

- [x] `2026-06-26T21:36:35Z` intro vcs-draft-note.test.ts ← BDD-покрытие CLI-команды vcs-draft-note (--list|--create|--update|--delete|--publish, dry-run, валидация, ошибки API)
- [x] `2026-06-26T21:36:35Z` intro vcs-reply.delete.test.ts ← BDD-покрытие delete discussion для vcs-reply ({discussionId, delete:true} → deleteDiscussion)
- [x] `2026-06-26T21:36:35Z` insight listDrafts при пустом списке делает return вместо deps.exit — возможный баг (не завершает процесс)
- [x] `2026-06-26T21:36:35Z` ver sdd verify → pass exit=0 (4/4 gates)
- [x] `2026-06-26T21:36:35Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-draft-note/__tests__/vcs-draft-note.test.ts, cli/cmd/vcs-reply/__tests__/vcs-reply.delete.test.ts]; decisions: [vcs-draft-test-strategy=fetch-mock-via-process.exit-override, vcs-reply-delete-test=follows-edit.test.ts-pattern]; open: [H-01: listDrafts пустой список не вызывает exit, процесс не завершается]

### Round 2 — 2026-09-21, migration evidence reconciliation

#### P1

- [ ] migration reopened: prior phase evidence is incomplete

#### P2

- [ ] migration reopened: prior phase evidence is incomplete

#### Round close

- [ ] migration round remains open until every phase has a CLI-owned receipt

<!--/SECTION:EXECUTION_LOG-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `cli/cmd/vcs-draft-note/__tests__/vcs-draft-note.test.ts`, `cli/cmd/vcs-reply/__tests__/vcs-reply.delete.test.ts`
- **Inputs:** P1 handoff
- **Exit:** 7 BDD covered; tests pass; typecheck+format clean

<!--/SECTION:PHASE_P2-->
