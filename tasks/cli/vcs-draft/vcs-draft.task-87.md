# TSK-87 — vcs-reply delete discussion + vcs-draft CLI
## 1. Meta
- **Task-ID:** TSK-87 | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-draft | **Deps:** TSK-86
- **Purpose:** A) vcs-reply: `{discussionId, delete:true}` без noteId → deleteDiscussion. B) vcs-draft: --list|--create|--update|--delete|--publish. vcs-context-resolver.
- **Spec:** cli.spec.md §FR-VR-18, §4.1.22 | **Runtime:** real-runtime | **Verify:** unit
## 2. Phases
| ID | Kind | Deps |
|----|------|------|
| P1 | impl | — |
| P2 | test | P1 |
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
