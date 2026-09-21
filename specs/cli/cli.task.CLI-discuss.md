# Task: CLI-discuss — CLI команда vcs-discussions

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** CLI-discuss
- **Status:** [ ] TODO
- **Purpose:** CLI-команда `gennady vcs-discussions` — человекочитаемый вывод дискуссий GitLab MR. Тонкая обёртка над существующим `VcsClientMergeDiscussions.getAll()`.
- **Scope:** `vcs-mr-management`
- **Module:** `cli/vcs-discussions`
- **Dependencies:** None
- **Spec References:** FR-MR-17, FR-MR-18, FR-MR-19, FR-MR-19a, FR-MR-19b, D-004
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status   |
| --- | ---- | ---- | -------- |
| P1  | impl | —    | [ ] DONE |
| P2  | test | P1   | [ ] DONE |

<!--/SECTION:PHASES_OVERVIEW-->
<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** CLI команда на `resolveVcsContext`. `--ref <group/repo!iid>` или `--project` + `--iid`. Флаги: `--all` (показать resolved), `--json`. Вызов `client.MergeDiscussions.getAll()`. Формат вывода: `[shortId] author: body (file:line)` / `(resolved)` / `(no text)`. `--json`: массив объектов с `{ id, shortId, author, body, file?, line?, resolved, notes }`. Пустой результат: `No discussions found` или `[]`.
- **Target Files:**
  - `cli/cmd/vcs-discussions/vcs-discussions.cmd.ts` (NEW)
  - `cli/cmd/vcs-discussions/index.ts` (NEW)
  - `cli/cmd/vcs-discussions/help.ts` (NEW)

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-тесты: happy path, --all, --json, empty, --dry-run, error paths.
- **Target Files:**
  - `cli/cmd/vcs-discussions/__tests__/vcs-discussions.test.ts` (NEW)

<!--/SECTION:PHASE_P2-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command                                                                              | Required by      | Role  |
| ------------------------------------------------------------------------------------ | ---------------- | ----- |
| `tsc --noEmit`                                                                       | typescript-rules | extra |
| `node --import tsx --test cli/cmd/vcs-discussions/__tests__/vcs-discussions.test.ts` | node-test        | extra |

<!--/SECTION:VERIFICATION-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = один execute-then-audit цикл.)_

| Round | Date       | Status | Notes                                                                                                                                                                    |
| ----- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1    | 2025-06-29 | PASS   | Command created per spec: getAll() wrapper, human/JSON output. Later enhanced: --draft (draft notes), --since (cursor filter), --vcs-host alias, fullId in human output. |

### Round 1 — 2026-09-21, migration evidence reconciliation

#### P1

- [ ] migration reopened: prior phase evidence is incomplete

#### P2

- [ ] migration reopened: prior phase evidence is incomplete

#### Round close

- [ ] migration round remains open until every phase has a CLI-owned receipt

<!--/SECTION:EXECUTION_LOG-->
