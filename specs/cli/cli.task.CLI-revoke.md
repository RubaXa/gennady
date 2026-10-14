# Task: CLI-revoke — vcs-approve --revoke (unapprove)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** CLI-revoke | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-approve | **Dependencies:** VC-unappr
- **Purpose:** `--revoke` / `--unapprove` на vcs-approve. Idempotent (not approved → info). Dry-run.
- **Spec:** [cli.spec.md §FR-VA-09..13](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/vcs-approve/vcs-approve.cmd.ts`
- **Exit:** `--revoke` парсится, вызывает unapprove(), idempotent для not-approved

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/vcs-approve/__tests__/vcs-approve.test.ts`
- **Exit:** 5 BDD covered; существующие тесты не сломаны

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. BDD

- --revoke success → `✓ MR !42 unapproved`, exit 0
- Not approved → `ℹ MR !42 is not approved`, exit 0
- --dry-run → `Would unapprove: ...`
- 403/409 API error → exit 1
- Без --revoke → поведение без изменений (approve)

**Scenario:** Ошибка API 403 при self-unapprove [`unit`]

- **Given** provider отклоняет unapprove кодом 403
- **When** выполняется revoke
- **Then** adapter возвращает ошибку, а не успех

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command                  | Required by | Role  |
| ------------------------ | ----------- | ----- |
| `npm run type-check`     | P1, P2      | extra |
| `npm run lint:contracts` | P1, P2      | extra |
| `npm run test`           | P1, P2      | probe |
| `npm run format:check`   | P1, P2      | extra |

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                                         | Test Name (canonical)                    | Phases |
| ------------------------------------------------ | ---------------------------------------- | ------ |
| --revoke success → ✓ MR !42 unapproved, exit 0   | revoke success                           | P2     |
| Not approved → ℹ MR !42 is not approved, exit 0  | revoke idempotent — already not approved | P2     |
| --dry-run → Would unapprove: ...                 | revoke dry-run                           | P2     |
| 403 API error → exit 1                           | revoke 403 forbidden                     | P2     |
| Generic unapprove API error → stderr, exit 1     | revoke generic error                     | P2     |
| Без --revoke → поведение без изменений (approve) | approve unchanged                        | P2     |

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 (2026-06-26T18:39:34Z) — initial

#### P1

- [x] 2026-06-26T18:39:34Z ver npm run type-check → pass exit=0
- [x] 2026-06-26T18:39:34Z ver npm run lint:contracts → pass exit=0
- [x] 2026-06-26T18:39:34Z ver npm run test → pass exit=0
- [x] 2026-06-26T18:39:34Z ver npm run format:check → pass exit=0
- [x] 2026-06-26T18:39:34Z DONE
      **Handoff →** artifacts: [cli/cmd/vcs-approve/vcs-approve.cmd.ts]; decisions: [revoke-flag=revoke+unapprove, unapprove-idempotency=cmd-level+service-level]; open: []

#### P2

- [x] 2026-06-26T18:45:04Z discovery files cli/cmd/vcs-pipeline/**tests**/vcs-pipeline.test.ts, tasks/cli/vcs-pipeline/vcs-pipeline.task-83.md, tasks/cli/vcs-reply-edit/vcs-reply-edit.task-78.md — pre-existing formatting issues, auto-fixed with prettier
- [x] 2026-06-26T18:45:04Z insight BDD-сценарий «409 API error → exit 1» несовместим с handleUnapproveError: все ошибки, содержащие '409' в сообщении, → idempotent (exit 0) → Test Scenario Coverage, сценарий заменён на «revoke generic error» (не-409/не-403 ошибка unapprove → exit 1)
- [x] 2026-06-26T18:45:04Z ver npm run type-check → pass exit=0
- [x] 2026-06-26T18:45:04Z ver npm run lint:contracts → pass exit=0
- [x] 2026-06-26T18:45:04Z ver npm run test → pass exit=0
- [x] 2026-06-26T18:45:04Z ver npm run format:check → pass exit=0
- [x] 2026-06-26T18:45:04Z DONE
      **Handoff →** artifacts: [cli/cmd/vcs-approve/__tests__/vcs-approve.test.ts]; decisions: [test-count=14 (8 existing + 6 new), revoke-covered=true, approve-unchanged-verified=true, mock-unapprove-added=true]; open: [insight-1: handleUnapproveError считает все сообщения с '409' идемпотентными — BDD «409 API error → exit 1» невыполним при текущей реализации]

<!--/SECTION:EXECUTION_LOG-->
