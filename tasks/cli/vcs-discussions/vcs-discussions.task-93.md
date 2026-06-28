# Task: TSK-93 — CLI команда vcs-discussions

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-93
- **Status:** [ ] TODO
- **Purpose:** CLI-команда `gennady vcs-discussions` — человекочитаемый вывод дискуссий GitLab MR. Тонкая обёртка над существующим `VcsClientMergeDiscussions.getAll()`.
- **Scope:** `vcs-mr-management`
- **Module:** `cli/vcs-discussions`
- **Dependencies:** None (API `getAll` уже существует)
- **Spec References:** FR-MR-17, FR-MR-18, FR-MR-19, FR-MR-19a, FR-MR-19b, D-004
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status   |
| --- | ---- | ---- | -------- |
| P1  | impl | —    | [ ] TODO |
| P2  | test | P1   | [ ]      |

### P1 — impl

- **Objective:** CLI команда на `resolveVcsContext`. `--ref <group/repo!iid>` или `--project` + `--iid`. Флаги: `--all` (показать resolved), `--json`. Вызов `client.MergeDiscussions.getAll()`. Формат вывода: `[shortId] author: body (file:line)` / `(resolved)` / `(no text)`. `--json`: массив объектов с `{ id, shortId, author, body, file?, line?, resolved, notes }`. Пустой результат: `No discussions found` или `[]`.
- **Target Files:**
  - `cli/cmd/vcs-discussions/vcs-discussions.cmd.ts` (NEW)
  - `cli/cmd/vcs-discussions/index.ts` (NEW)
  - `cli/cmd/vcs-discussions/help.ts` (NEW)

### P2 — test

- **Objective:** Unit-тесты: happy path, --all, --json, empty, --dry-run, error paths.
- **Target Files:**
  - `cli/cmd/vcs-discussions/__tests__/vcs-discussions.test.ts` (NEW)

## 5. Verification

| Command                                                                              | Required by      |
| ------------------------------------------------------------------------------------ | ---------------- |
| `tsc --noEmit`                                                                       | typescript-rules |
| `node --import tsx --test cli/cmd/vcs-discussions/__tests__/vcs-discussions.test.ts` | node-test        |

## 7. Execution Log

_(Round = один execute-then-audit цикл.)_
