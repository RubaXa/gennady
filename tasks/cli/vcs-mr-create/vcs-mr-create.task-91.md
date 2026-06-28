# Task: TSK-91 — CLI команда vcs-mr-create

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-91
- **Status:** [ ] TODO
- **Purpose:** Реализовать CLI-команду `gennady vcs-mr-create` — создание GitLab MR из текущей ветки, с авто-детектом через `vcs-context-resolver`.
- **Scope:** `vcs-mr-management`
- **Module:** `cli/vcs-mr-create`
- **Dependencies:** TSK-88, TSK-89
- **Spec References:** FR-MR-10, FR-MR-11, FR-MR-12, FR-MR-10a, FR-MR-20, FR-MR-21, FR-MR-22, D-003
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps           | Status   |
| --- | ---- | -------------- | -------- |
| P1  | impl | TSK-88, TSK-89 | [ ] TODO |
| P2  | test | P1             | [ ]      |

### P1 — impl

- **Objective:** CLI команда по паттерну `vcs-approve`. Парсинг: `--title`, `--description`, `--target-branch`, `--draft`, `--label`, `--assignee`, `--reviewer`, `--milestone`, `--host`, `--dry-run`. sourceBranch из `git rev-parse --abbrev-ref HEAD`. targetBranch каскад: `--target-branch` → `git remote show origin` → `main`. Вывод URL.
- **Target Files:**
  - `cli/cmd/vcs-mr-create/vcs-mr-create.cmd.ts` (NEW)
  - `cli/cmd/vcs-mr-create/index.ts` (NEW)
  - `cli/cmd/vcs-mr-create/help.ts` (NEW)

### P2 — test

- **Objective:** Unit-тесты: happy path, --draft, --dry-run, --title required, --target-branch, error paths (no token, no git, network error).
- **Target Files:**
  - `cli/cmd/vcs-mr-create/__tests__/vcs-mr-create.test.ts` (NEW)

## 5. Verification

| Command                                                                          | Required by      |
| -------------------------------------------------------------------------------- | ---------------- |
| `tsc --noEmit`                                                                   | typescript-rules |
| `node --import tsx --test cli/cmd/vcs-mr-create/__tests__/vcs-mr-create.test.ts` | node-test        |

## 7. Execution Log

_(Round = один execute-then-audit цикл.)_
