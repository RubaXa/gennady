# Task: TSK-78 — vcs-reply edit/delete + review-issues noteId

## 1. Meta

- **Task-ID:** TSK-78 | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-reply | **Dependencies:** TSK-77
- **Purpose:** `vcs-reply` stdin JSON: `{noteId, body}` правка, `{noteId, delete:true}` удаление. `review-issues` XML: `noteId` атрибут на репликах.
- **Spec:** [cli.spec.md §FR-VR-11..14](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

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
