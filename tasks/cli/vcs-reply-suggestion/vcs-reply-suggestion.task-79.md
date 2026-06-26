# Task: TSK-79 — vcs-reply suggestion блоки
## 1. Meta
- **Task-ID:** TSK-79 | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-reply | **Dependencies:** None
- **Purpose:** line-item vcs-reply: `suggestion` + `suggestionRange` поля → сборка ```suggestion:-A+B блока
- **Spec:** [cli.spec.md §FR-VR-15..17](../../specs/cli/cli.spec.md) | **Runtime:** real-runtime | **Verification:** unit
## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | — | [ ] |
| P2 | test | P1 | [ ] |
## 3. Phases
### P1 — impl
- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `cli/cmd/vcs-reply/vcs-reply.cmd.ts`
- **Exit:** suggestion поле парсится; suggestionRange → корректный :-A+B; блок добавляется в body
### P2 — test
- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `cli/cmd/vcs-reply/__tests__/vcs-reply.suggestion.test.ts`
- **Exit:** 4 BDD covered
## 4. BDD
- suggestion + position (линия) → ```suggestion:-0+0\n<suggestion>\n``` в body
- suggestionRange {above:1, below:2} → ```suggestion:-1+2
- suggestion + body → блок добавлен к body
- --dry-run → показывает итоговый body с suggestion-блоком
