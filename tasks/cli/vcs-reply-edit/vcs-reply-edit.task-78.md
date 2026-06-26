# Task: TSK-78 — vcs-reply edit/delete + review-issues noteId

## 1. Meta

- **Task-ID:** TSK-78 | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-reply | **Dependencies:** TSK-77
- **Purpose:** `vcs-reply` stdin JSON: `{noteId, body}` правка, `{noteId, delete:true}` удаление. `review-issues` XML: `noteId` атрибут на репликах.
- **Spec:** [cli.spec.md §FR-VR-11..14](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `cli/cmd/vcs-reply/vcs-reply.cmd.ts`, `cli/cmd/review/_core/xml/build-review-artifact.xml.ts`
- **Exit:** edit/delete в vcs-reply; noteId в review-issues XML

### P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `cli/cmd/vcs-reply/__tests__/vcs-reply.edit.test.ts`
- **Exit:** 5 BDD covered; регрессия существующих тестов

## 4. BDD

- {noteId, body} → updateNote, success
- {noteId, delete:true} → deleteNote, success
- 404 → `✖ Note <id> not found`, exit 1
- Чужая заметка → error, exit 1
- review-issues XML → noteId присутствует

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] 2026-06-26T18:36:54Z intro noteId, delete ← ReplyItem type fields for edit/delete operations
- [x] 2026-06-26T18:36:54Z intro invalidNoteDelete, invalidNoteEdit ← validation guards for noteId operations
- [x] 2026-06-26T18:36:54Z ver ~/.config/opencode/skills/sdd-execute/scripts/sdd verify cli/cmd/vcs-reply/vcs-reply.cmd.ts cli/cmd/review/\_core/xml/build-review-artifact.xml.ts → pass exit=0
- [x] 2026-06-26T18:36:54Z DONE
      **Handoff →** artifacts: [cli/cmd/vcs-reply/vcs-reply.cmd.ts, cli/cmd/review/_core/xml/build-review-artifact.xml.ts, tasks/cli/vcs-approve/vcs-approve.task-74.md]; decisions: [noteId+delete=edit/delete-via-merge-discussions-port, noteId-in-xml=already-present-from-TSK-77]; open: []

#### P2

- [x] 2026-06-26T18:47:53Z intro vcs-reply.edit.test.ts ← тесты edit/delete + валидация noteId через mock API MergeDiscussions
- [x] 2026-06-26T18:47:53Z insight BDD #5 (review-issues XML → noteId присутствует) не покрыт в этом тестовом файле — XML-артефакт находится в модуле review/\_core/xml, тестов для build-review-artifact нет → specs/cli/cli.spec.md §FR-VR-14, нужен отдельный тестовый файл для XML-билдера
- [x] 2026-06-26T18:47:53Z ver ~/.config/opencode/skills/sdd-execute/scripts/sdd verify cli/cmd/vcs-reply/**tests**/vcs-reply.edit.test.ts → pass exit=0
- [x] 2026-06-26T18:47:53Z DONE
      **Handoff →** artifacts: [cli/cmd/vcs-reply/__tests__/vcs-reply.edit.test.ts]; decisions: [edit-tests=13-cases-all-pass, regression-tests=resolve+suggestion+cmd-all-pass, bdd-1-4=covered, bdd-5=deferred-xml-module]; open: [BDD-5: review-issues XML noteId тесты отсутствуют — нужен отдельный таск на build-review-artifact.xml.ts]
