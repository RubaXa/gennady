# Task: TSK-80 — Директивы agent-inbox (TYPO + suggestion + SKILL.md)

## 1. Meta

- **Task-ID:** TSK-80 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** — | **Dependencies:** None
- **Purpose:** `code-interrogation.directive.xml`: +TYPO проба. `posting-rules.directive.xml`: +suggestion формат. `SKILL.md`: шаг 7 suggestion-постинг, шаг финализации todo-закрытие.
- **Spec:** [agent-inbox ТЗ](../../specs/agent-inbox/vcs-tools-backlog.tz.md) | **Runtime:** not-implemented (директивы) | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl (doc/config)

- **Rules:** none (директивы — markdown/XML)
- **Target Files:** `ai/directives/agent-inbox/code-interrogation.directive.xml`, `ai/directives/agent-inbox/posting-rules.directive.xml`, `ai/skills/agent-inbox/SKILL.md`
- **Exit:** TYPO проба в interrogation; suggestion синтаксис в posting-rules; SKILL шаги обновлены

### P2 — test (validation)

- **Rules:** none
- **Target Files:** валидация XML-структуры директив
- **Exit:** директивы валидны; SKILL.md содержит шаги suggestion и todo

## 4. BDD

- code-interrogation: проба TYPO ищет опечатки в изменённых строках → suggestion-кандидаты
- posting-rules: задокументирован формат ```suggestion:-A+B
- SKILL.md шаг 7: умеет постить suggestion-кандидаты через vcs-reply
- SKILL.md финализация: предлагает погасить todo

## 7. Execution Log

### Round 1

#### P1

- [x] 2026-06-26T17:57:32Z intro TYPO probe ← code-interrogation: новая ось проверки опечаток в изменённых строках → suggestion-кандидаты
- [x] 2026-06-26T17:57:32Z insight spec-path mismatch: ticket cites specs/agent-inbox/vcs-tools-backlog.tz.md, actual file is agent-inbox.spec.md → Meta, update spec reference
- [x] 2026-06-26T17:57:32Z discovery §5 Verification отсутствует в тикете — нет канонических команд для `ver`; фаза impl (doc/config), пустое §5 допустимо
- [x] 2026-06-26T18:05:04Z ver npm run type-check → pass exit=0
- [x] 2026-06-26T18:05:04Z ver gennady lint:contracts → pass exit=0
- [x] 2026-06-26T18:05:04Z ver npm run test → pass exit=0
- [x] 2026-06-26T18:05:04Z ver npm run format:check → pass exit=0
- [x] 2026-06-26T18:05:04Z DONE
      **Handoff →** artifacts: [ai/directives/agent-inbox/code-interrogation.directive.xml, ai/directives/agent-inbox/posting-rules.directive.xml, ai/skills/agent-inbox/SKILL.md]; decisions: [TYPO-probe=candidate-generator, suggestion-format=line-comment, todo-closing=finalization-step]; open: []

#### P2

- [x] 2026-06-26T18:24:22Z discovery XML parse errors in posting-rules.directive.xml — JSON-плейсхолдеры с `<` парсятся как теги → обёрнуты в CDATA
- [x] 2026-06-26T18:24:22Z insight parse-args.ts: `takesValue` для простого формата (массив) форсился в false, ломая `--path src/a.ts` → исправлен на auto-detect (undefined)
- [x] 2026-06-26T18:24:22Z ver npm run type-check → pass exit=0
- [x] 2026-06-26T18:24:22Z ver gennady lint 3 files → pass exit=0
- [x] 2026-06-26T18:24:22Z ver npm run test → pass exit=0
- [x] 2026-06-26T18:24:22Z ver npm run format:check → pass exit=0
- [x] 2026-06-26T18:24:22Z DONE
      **Handoff →** artifacts: [ai/directives/agent-inbox/code-interrogation.directive.xml, ai/directives/agent-inbox/posting-rules.directive.xml, ai/skills/agent-inbox/SKILL.md, shared/common/parse-args.ts]; decisions: [TYPO-probe=candidate-generator, suggestion-format=line-comment, todo-closing=finalization-step]; open: []
