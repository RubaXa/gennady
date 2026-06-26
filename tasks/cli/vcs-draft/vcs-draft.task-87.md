# TSK-87 — vcs-reply delete discussion + vcs-draft CLI

## 1. Meta

- **Task-ID:** TSK-87 | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-draft | **Deps:** TSK-86
- **Purpose:** A) vcs-reply: `{discussionId, delete:true}` без noteId → deleteDiscussion. B) vcs-draft: --list|--create|--update|--delete|--publish. vcs-context-resolver.
- **Spec:** cli.spec.md §FR-VR-18, §4.1.22 | **Runtime:** real-runtime | **Verify:** unit

## 2. Phases

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. P1 — impl

- **Rules:** typescript-rules
- **Target:** `cli/cmd/vcs-reply/vcs-reply.cmd.ts` (+delete discussion), `cli/cmd/vcs-draft/vcs-draft.cmd.ts`, `cli/cmd/vcs-draft/index.ts`, `cli/cmd/vcs-draft/help.ts`, `cli/gennady.ts`
- **Exit:** delete discussion в vcs-reply; vcs-draft команда зарегистрирована

## 4. BDD

- vcs-reply: {discussionId, delete:true} → deleteDiscussion
- vcs-draft --list → listDraftNotes → вывод списка
- vcs-draft --create "text" → createDraftNote
- vcs-draft --update <id> "text" → updateDraftNote
- vcs-draft --delete <id> → deleteDraftNote
- vcs-draft --publish <id> → publishDraftNote

## 7. Execution Log

### Round 1

#### P1

- [x] `2026-06-26T21:20:56Z` intro VcsDraftDeps ← DI-тип для команды vcs-draft (по образцу VcsApproveDeps)
- [x] `2026-06-26T21:20:56Z` intro run ← экспортируемая точка входа vcs-draft (resolveContext + dispatch)
- [x] `2026-06-26T21:20:56Z` intro printHelp ← CLI-хелп vcs-draft
- [x] `2026-06-26T21:20:56Z` ver sdd verify → pass
- [x] `2026-06-26T21:20:56Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-reply/vcs-reply.cmd.ts, cli/cmd/vcs-draft/vcs-draft.cmd.ts, cli/cmd/vcs-draft/index.ts, cli/cmd/vcs-draft/help.ts, cli/gennady.ts]; decisions: [deleteDiscussion=via-{discussionId-delete:true-without-noteId}, vcs-draft-di=vcs-approve-pattern-with-VcsDraftDeps, vcs-draft-actions=list-create-update-delete-publish]; open: []

### P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `cli/cmd/vcs-draft/__tests__/vcs-draft.test.ts`, `cli/cmd/vcs-reply/__tests__/vcs-reply.delete.test.ts`
- **Inputs:** P1 handoff
- **Exit:** 7 BDD covered; tests pass; typecheck+format clean

- [x] `2026-06-26T21:36:35Z` intro vcs-draft.test.ts ← BDD-покрытие CLI-команды vcs-draft (--list|--create|--update|--delete|--publish, dry-run, валидация, ошибки API)
- [x] `2026-06-26T21:36:35Z` intro vcs-reply.delete.test.ts ← BDD-покрытие delete discussion для vcs-reply ({discussionId, delete:true} → deleteDiscussion)
- [x] `2026-06-26T21:36:35Z` insight listDrafts при пустом списке делает return вместо deps.exit — возможный баг (не завершает процесс)
- [x] `2026-06-26T21:36:35Z` ver sdd verify → pass exit=0 (4/4 gates)
- [x] `2026-06-26T21:36:35Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-draft/__tests__/vcs-draft.test.ts, cli/cmd/vcs-reply/__tests__/vcs-reply.delete.test.ts]; decisions: [vcs-draft-test-strategy=fetch-mock-via-process.exit-override, vcs-reply-delete-test=follows-edit.test.ts-pattern]; open: [H-01: listDrafts пустой список не вызывает exit, процесс не завершается]
