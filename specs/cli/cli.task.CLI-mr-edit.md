# Task: CLI-mr-edit — CLI команда vcs-mr-edit

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** CLI-mr-edit
- **Status:** [ ] TODO
- **Purpose:** CLI-команда `gennady vcs-mr-edit` — редактирование GitLab MR: title, description, draft↔ready, labels, assignee, reviewer, target branch.
- **Scope:** `vcs-mr-management`
- **Module:** `cli/vcs-mr-edit`
- **Dependencies:** VMM-core, VMM-glcreate
- **Spec References:** FR-MR-13, FR-MR-14, FR-MR-15, FR-MR-16, FR-MR-30a, FR-MR-30b, FR-MR-31
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status   |
| --- | ---- | ---- | -------- |
| P1  | impl | —    | [ ] TODO |
| P2  | test | P1   | [ ]      |

<!--/SECTION:PHASES_OVERVIEW-->
<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** CLI команда. Обязательные: `--ref <group/repo!iid>` или `--project` + `--iid`. Опциональные: `--title`, `--description`, `--draft` / `--ready` (взаимоисключающие), `--label` / `--unlabel`, `--target-branch`, `--assignee`, `--reviewer`, `--milestone`. Pre-check существования MR через `getByIid` (опционально, для лучшей ошибки). Валидация: нет ни одного поля → error. Вывод URL.
- **Target Files:**
  - `cli/cmd/vcs-mr-edit/vcs-mr-edit.cmd.ts` (NEW)
  - `cli/cmd/vcs-mr-edit/index.ts` (NEW)
  - `cli/cmd/vcs-mr-edit/help.ts` (NEW)
  - `cli/gennady.ts`

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-тесты: happy path, --draft/--ready, --label --unlabel, --dry-run, no fields error, malformed --ref, missing --ref.
- **Target Files:**
  - `cli/cmd/vcs-mr-edit/__tests__/vcs-mr-edit.test.ts` (NEW)

<!--/SECTION:PHASE_P2-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command                                                                      | Required by      | Role  |
| ---------------------------------------------------------------------------- | ---------------- | ----- |
| `tsc --noEmit`                                                               | typescript-rules | extra |
| `node --import tsx --test cli/cmd/vcs-mr-edit/__tests__/vcs-mr-edit.test.ts` | node-test        | extra |

<!--/SECTION:VERIFICATION-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = один execute-then-audit цикл.)_

### Round 1 — 2026-09-21, migration evidence reconciliation

#### P1

- [ ] migration reopened: prior phase evidence is incomplete

#### P2

- [ ] migration reopened: prior phase evidence is incomplete

#### Round close

- [ ] migration round remains open until every phase has a CLI-owned receipt

<!--/SECTION:EXECUTION_LOG-->
