# Task: TSK-81 — vcs-diff CLI (getChanges)
## 1. Meta
- **Task-ID:** TSK-81 | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-diff | **Dependencies:** None
- **Purpose:** `gennady vcs-diff --ref <ref>` — список изменённых файлов MR через getChanges. `--path <file>` → содержимое через getFileContent.
- **Spec:** [cli.spec.md §FR-VD-01..03](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit
## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | — | [ ] |
| P2 | test | P1 | [ ] |
## 3. Phases
### P1 — impl
- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `cli/cmd/vcs-diff/vcs-diff.cmd.ts`, `cli/cmd/vcs-diff/index.ts`, `cli/cmd/vcs-diff/help.ts`, `cli/gennady.ts`
- **Exit:** команда зарегистрирована; vcs-context-resolver + getChanges/getFileContent интегрированы
### P2 — test
- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `cli/cmd/vcs-diff/__tests__/vcs-diff.test.ts`
- **Exit:** 3 BDD covered
## 4. BDD
- --ref <ref> → список файлов (path, status, additions, deletions)
- --path <file> → содержимое файла на head MR
- --dry-run → `Would fetch diff for: <ref>`
