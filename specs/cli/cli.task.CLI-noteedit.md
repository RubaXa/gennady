# Task: CLI-noteedit — vcs-reply edit/delete + review-issues noteId

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** CLI-noteedit | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-reply | **Dependencies:** VC-noteedit
- **Purpose:** `vcs-reply` stdin JSON: `{noteId, body}` правка, `{noteId, delete:true}` удаление. `review-issues` XML: `noteId` атрибут на репликах.
- **Spec:** [cli.spec.md §FR-VR-11..14](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/vcs-reply/vcs-reply.cmd.ts`
  - `cli/cmd/review/_core/xml/build-review-artifact.xml.ts`
- **Exit:** edit/delete в vcs-reply; noteId в review-issues XML

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `cli/cmd/vcs-reply/__tests__/vcs-reply.edit.test.ts`
- **Exit:** 5 BDD covered; регрессия существующих тестов

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. BDD

- {noteId, body} → updateNote, success
- {noteId, delete:true} → deleteNote, success
- 404 → `✖ Note <id> not found`, exit 1
- Чужая заметка → error, exit 1
- review-issues XML → noteId присутствует

**Scenario:** Ошибка: note не найден [`unit`]

- **Given** `updateNote` отвечает 404
- **When** `vcs-reply` обрабатывает edit
- **Then** stderr содержит `Note <id> not found`, а результат имеет один failure

<!--/SECTION:BDD-->
<!--SECTION:TEST_COVERAGE-->

## 5. Test Scenario Coverage

- Ошибка: note не найден → `vcs-reply.edit.test.ts` :: `should report Note not found and exit 1 on 404`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] 2026-06-26T18:36:54Z intro noteId, delete ← ReplyItem type fields for edit/delete operations
- [x] 2026-06-26T18:36:54Z intro invalidNoteDelete, invalidNoteEdit ← validation guards for noteId operations
- [x] 2026-06-26T18:36:54Z ver ~/.config/opencode/skills/sdd-execute/scripts/sdd verify cli/cmd/vcs-reply/vcs-reply.cmd.ts cli/cmd/review/\_core/xml/build-review-artifact.xml.ts → pass exit=0
- [x] 2026-06-26T18:36:54Z DONE
      **Handoff →** artifacts: [cli/cmd/vcs-reply/vcs-reply.cmd.ts, cli/cmd/review/_core/xml/build-review-artifact.xml.ts, tasks/cli/vcs-approve/vcs-approve.task-74.md]; decisions: [noteId+delete=edit/delete-via-merge-discussions-port, noteId-in-xml=already-present-from-VC-noteedit]; open: []

#### P2

- [x] 2026-06-26T18:47:53Z intro vcs-reply.edit.test.ts ← тесты edit/delete + валидация noteId через mock API MergeDiscussions
- [x] 2026-06-26T18:47:53Z insight BDD #5 (review-issues XML → noteId присутствует) не покрыт в этом тестовом файле — XML-артефакт находится в модуле review/\_core/xml, тестов для build-review-artifact нет → specs/cli/cli.spec.md §FR-VR-14, нужен отдельный тестовый файл для XML-билдера
- [x] 2026-06-26T18:47:53Z ver ~/.config/opencode/skills/sdd-execute/scripts/sdd verify cli/cmd/vcs-reply/**tests**/vcs-reply.edit.test.ts → pass exit=0
- [x] 2026-06-26T18:47:53Z DONE
      **Handoff →** artifacts: [cli/cmd/vcs-reply/__tests__/vcs-reply.edit.test.ts]; decisions: [edit-tests=13-cases-all-pass, regression-tests=resolve+suggestion+cmd-all-pass, bdd-1-4=covered, bdd-5=deferred-xml-module]; open: [BDD-5: review-issues XML noteId тесты отсутствуют — нужен отдельный таск на build-review-artifact.xml.ts]

<!--/SECTION:EXECUTION_LOG-->
