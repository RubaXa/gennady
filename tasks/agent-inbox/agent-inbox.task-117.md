# Task: TSK-117 — inbox-serve: real-smoke против GitLab + OpenCode

## 1. Meta

- **Task-ID:** TSK-117 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** serve (integration) | **Dependencies:** TSK-115 (bootstrap)
- **Purpose:** Golden-прогон serve против реального GitLab (или GitHub) + реального OpenCode. Ручной прогон DX §3.2. Верификация: дашборд показывает реальные MR, AI-узел выполняет ревью, оператор постит находки.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) Golden DX §3.2 | **Runtime:** real-runtime | **Verification:** manual

## 2. Phases Overview

| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | verify | —    | [ ]    |

## 3. Phases

### P1 — verify (ручной golden-прогон)
- **Rules:** none
- **Exit (критерии прохождения):**
  1. `gennady inbox serve` стартует, OpenCode spawn, polling VCS
  2. Дашборд показывает реальные MR из GitLab/GitHub
  3. Роль reviewer берёт MR в ревью → AI-узел (OpenCode) → structured output
  4. Оператор видит находки в модалке, жмёт «Постить» → находки в GitLab
  5. Audit log содержит все переходы состояний
  6. Права эскалируются (ручная симуляция: перевести часы)
  7. SIGTERM → graceful shutdown, OpenCode-сессии закрыты

## 4. BDD

- GIVEN реальный GitLab с MR где я reviewer WHEN `inbox serve` THEN дашборд показывает MR в INBOX reviewer
- GIVEN MR в IN_PROGRESS WHEN AI-узел завершён THEN находки в модалке, MR в AWAITING_OPERATOR
- GIVEN находки в модалке WHEN оператор жмёт «Постить всё» THEN находки опубликованы в GitLab, MR в DONE
- GIVEN SIGTERM WHEN сервер завершается THEN no orphan OpenCode-сессий
- GIVEN реальный OpenCode WHEN prompt с JSON-схемой THEN structured output валиден

## 5. Verification

- Ручной прогон оператором по критериям P1.

## 7. Execution Log

### Round 1 — initial
#### P1
- [ ] `<ts>` DONE
