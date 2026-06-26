# Task: TSK-80 — Директивы agent-inbox (TYPO + suggestion + SKILL.md)
## 1. Meta
- **Task-ID:** TSK-80 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** — | **Dependencies:** None
- **Purpose:** `code-interrogation.directive.xml`: +TYPO проба. `posting-rules.directive.xml`: +suggestion формат. `SKILL.md`: шаг 7 suggestion-постинг, шаг финализации todo-закрытие.
- **Spec:** [agent-inbox ТЗ](../../specs/agent-inbox/vcs-tools-backlog.tz.md) | **Runtime:** not-implemented (директивы) | **Verification:** unit
## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | — | [ ] |
| P2 | test | P1 | [ ] |
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
