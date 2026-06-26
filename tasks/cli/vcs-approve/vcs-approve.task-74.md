# Task: TSK-74 — vcs-approve --revoke (unapprove)

## 1. Meta

- **Task-ID:** TSK-74 | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-approve | **Dependencies:** TSK-73
- **Purpose:** `--revoke` / `--unapprove` на vcs-approve. Idempotent (not approved → info). Dry-run.
- **Spec:** [cli.spec.md §FR-VA-09..13](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `cli/cmd/vcs-approve/vcs-approve.cmd.ts`
- **Exit:** `--revoke` парсится, вызывает unapprove(), idempotent для not-approved

### P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `cli/cmd/vcs-approve/__tests__/vcs-approve.test.ts`
- **Exit:** 5 BDD covered; существующие тесты не сломаны

## 4. BDD

- --revoke success → `✓ MR !42 unapproved`, exit 0
- Not approved → `ℹ MR !42 is not approved`, exit 0
- --dry-run → `Would unapprove: ...`
- 403/409 API error → exit 1
- Без --revoke → поведение без изменений (approve)
