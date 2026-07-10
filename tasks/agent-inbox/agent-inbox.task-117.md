# Task: TSK-117 — inbox-serve: real-smoke против GitLab + OpenCode

## 1. Meta

- **Task-ID:** TSK-117 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** serve (integration) | **Dependencies:** TSK-115 (bootstrap)
- **Purpose:** Golden-прогон serve против реального GitLab (или GitHub) + реального OpenCode. Ручной прогон DX §3.2. Верификация: дашборд показывает реальные MR, AI-узел выполняет ревью, оператор постит находки.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) Golden DX §3.2 | **Runtime:** real-runtime | **Verification:** manual

## 2. Phases Overview

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | verify | —    | [ ]    |

## 3. Phases

### P1 — verify (ручной golden-прогон)

- **Rules:** none
- **Exit (критерии прохождения):**
  1. `gennady inbox serve` стартует, OpenCode spawn, polling VCS
  2. Дашборд показывает реальные MR
  3. Reviewer-граф: scaffold → gate → enrich → gate → sessions → gate → synthesize → ask → effect(post) → done
  4. Оператор видит OperatorQuestion в модалке, отвечает, находки в GitLab
  5. **Recovery ladder:** убить сессию OpenCode среди AI-узла → OutcomeClassifier → continue-сигнал в ту же сессию → узел завершён
  6. **Recovery ladder:** исчерпан continueMax → restart узла в свежей сессии от артефактов → узел завершён
  7. **Restart serve:** убить процесс среди ревью → RoleInstance пересозданы от чекпоинтов артефактов → граф продолжен
  8. Audit log содержит все переходы + исходы
  9. Нотификация при 24h бездействия (VK Teams-пинг)
  10. SIGTERM → graceful shutdown

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
