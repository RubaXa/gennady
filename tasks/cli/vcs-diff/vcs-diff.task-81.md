# Task: TSK-81 — vcs-diff CLI (getChanges)

## 1. Meta

- **Task-ID:** TSK-81 | **Status:** [x] DONE | **Scope:** cli | **Module:** vcs-diff | **Dependencies:** None
- **Purpose:** `gennady vcs-diff --ref <ref>` — список изменённых файлов MR через getChanges. `--path <file>` → содержимое через getFileContent.
- **Spec:** [cli.spec.md §FR-VD-01..03](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

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

## 7. Execution Log

### Round 1 — P1 initial impl

#### P1

- [x] `2026-06-26T18:02:35Z` intro VcsDiffDeps ← DI-контракт для тестируемой команды
- [x] `2026-06-26T18:02:35Z` intro formatChangeLine ← формат вывода одного изменённого файла
- [x] `2026-06-26T18:02:35Z` intro resolveContextOrFail ← обёртка резолва VCS-контекста с выходом при ошибке
- [x] `2026-06-26T18:02:35Z` intro locateMrByBranch ← поиск MR по ветке через getOne
- [x] `2026-06-26T18:02:35Z` intro fetchChanges ← вызов getChanges для списка файлов MR
- [x] `2026-06-26T18:02:35Z` intro fetchFileContent ← вызов getFileContent для содержимого файла
- [x] `2026-06-26T18:02:35Z` intro run ← точка входа команды vcs-diff
- [x] `2026-06-26T18:02:35Z` tried фикс resolveBody в vcs-reply.cmd.ts → устранил TS2304 Cannot find name, дубликат константы удалён
- [x] `2026-06-26T18:02:35Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T18:02:35Z` ver gennady lint 4 files → pass exit=0
- [x] `2026-06-26T18:02:35Z` ver npm run test → pass exit=0
- [x] `2026-06-26T18:02:35Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T18:02:35Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-diff/vcs-diff.cmd.ts, cli/cmd/vcs-diff/index.ts, cli/cmd/vcs-diff/help.ts, cli/gennady.ts]; decisions: [pattern=vcs-approve DI, vcs-client=VcsGitlabClient, resolver=vcs-context-resolver]; open: [README-update: cli/cmd/README.md и AGENTS.md таблица не обновлены — вне Target Files]

### Round 2 — P2 test

#### P2

- [x] `2026-06-26T18:24:21Z` discovery ticket missing §5 Verification and §6 Test Scenario Coverage sections — верификация выполнена через sdd verify + node-test hooks
- [x] `2026-06-26T18:24:21Z` ver sdd verify cli/cmd/vcs-diff/**tests**/vcs-diff.test.ts → pass exit=0
- [x] `2026-06-26T18:24:21Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-diff/__tests__/vcs-diff.test.ts]; decisions: [test-pattern=vcs-approve DI + module mock, parser=parseArgs, arg-format=--key=value]; open: [ticket-§5-§6-missing: ticket lacks §5 Verification and §6 Test Scenario Coverage — audit shall propose addition]
