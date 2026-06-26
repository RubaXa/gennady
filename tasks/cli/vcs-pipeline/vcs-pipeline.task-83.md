# Task: TSK-83 — vcs-pipeline CLI
## 1. Meta
- **Task-ID:** TSK-83 | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-pipeline | **Dependencies:** TSK-82
- **Purpose:** `gennady vcs-pipeline --ref <ref>` — статус пайплайна + упавшие джобы
- **Spec:** [cli.spec.md §FR-VP-01..03](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit
## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | — | [ ] |
| P2 | test | P1 | [ ] |
## 3. Phases
### P1 — impl
- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `cli/cmd/vcs-pipeline/vcs-pipeline.cmd.ts`, `cli/cmd/vcs-pipeline/index.ts`, `cli/cmd/vcs-pipeline/help.ts`, `cli/gennady.ts`
- **Exit:** команда зарегистрирована; getPipeline + vcs-context-resolver интегрированы
### P2 — test
- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `cli/cmd/vcs-pipeline/__tests__/vcs-pipeline.test.ts`
- **Exit:** 3 BDD covered
## 4. BDD
- --ref <ref> → статус пайплайна + список упавших джобов
- Нет пайплайна → «No pipeline found», exit 0
- --dry-run → «Would fetch pipeline for: <ref>»
