# Task: TSK-113 — inbox-roles: node-model RoleEngine + OutcomeClassifier + recovery ladder

## 1. Meta

- **Task-ID:** TSK-113 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-roles | **Dependencies:** TSK-109 (core), TSK-110 (VCS), TSK-111 (opencode), TSK-116 (ai-kit)
- **Purpose:** Role Engine на узловой модели: RoleNode (session/gate/ask/effect), OutcomeClassifier, recovery ladder, ReviewerRole (граф 9 узлов = существующий конвейер D57/D70), AuthorRole, RightsEscalator (нотификации по таймеру).
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-04, [inbox-roles.spec.md](../../specs/agent-inbox/inbox-roles/inbox-roles.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps  | Status |
| --- | ---- | ----- | ------ |
| P1  | impl | —     | [ ]    |
| P2  | impl | P1    | [ ]    |
| P3  | test | P1,P2 | [ ]    |

## 3. Phases

### P1 — impl (Engine + Scheduler + Node)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/role-engine.ts` — RoleEngine: loadAll, activate, deactivate
  - `services/agent-inbox/modules/inbox-roles/role-scheduler.ts` — RoleScheduler: tick, assignManual
  - `services/agent-inbox/modules/inbox-roles/role-node.ts` — RoleNode: типы (session/gate/ask/effect), Edge
  - `services/agent-inbox/modules/inbox-roles/errors.ts` — RoleError
- **Exit:** Engine загружает роли. Scheduler выполняет tick с мок-VCS.

### P2 — impl (Instance + Roles + Classifier + Escalator)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/role-instance.ts` — RoleInstance: step() (выполнить узел, классифицировать исход, перейти по edge), счётчики continue/restart
  - `services/agent-inbox/modules/inbox-roles/outcome-classifier.ts` — OutcomeClassifier: классы (OK, NO_RESULT, PARSE_ERROR, SCHEMA_MISMATCH, SESSION_ERROR, TIMEOUT, INCOMPLETE_ARTIFACT) + remediation-сигналы
  - `services/agent-inbox/modules/inbox-roles/reviewer.role.ts` — ReviewerRole: граф 9 узлов = scaffold(session)→gate(validate)→enrich(session)→gate→sessions(fan-out)→gate→synthesize(session)→ask→effect(post)→done
  - `services/agent-inbox/modules/inbox-roles/author.role.ts` — AuthorRole: fetch(session)→gate→summary(session)→ask→effect(react/reply)→done
  - `services/agent-inbox/modules/inbox-roles/rights-escalator.ts` — RightsEscalator: evaluate (24h бездействия → нотификация), schedule. Читает `operator_action` из audit.
- **Exit:** RoleInstance выполняет граф. Gate-узлы используют `inbox-review-plan --validate`. Effect-узлы — vcs-reply/approve. Нотификации по таймеру.

### P3 — test

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/__tests__/role-engine.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/role-instance.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/outcome-classifier.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/rights-escalator.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/reviewer.role.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/author.role.test.ts`

## 4. BDD

- GIVEN reviewer.role.ts загружен WHEN step() на узле 'scaffold' THEN session → промпт → structured output → переход 'ok' на 'gate_scaffolded'
- GIVEN reviewer на gate-узле WHEN verify(артефакты) THEN детерминированный pass/fail → переход по edge
- GIVEN session-узел вернул PARSE_ERROR WHEN OutcomeClassifier THEN класс + remediation-сигнал → continue в ту же сессию, continueCount++
- GIVEN continueMax исчерпан WHEN recovery THEN restart узла в свежей сессии, restartCount++
- GIVEN restartMax исчерпан WHEN recovery THEN RoleInstance → AWAITING_OPERATOR с накопленной диагностикой
- GIVEN reviewer на ask-узле WHEN оператор не реагирует 24h THEN RightsEscalator → нотификация (VK Teams-пинг)
- GIVEN оператор сделал POST /api/mr/:id/action WHEN следующий evaluate THEN таймер сброшен (operator_action в audit)
- GIVEN effect-узел 'post' выполнен WHEN restart узла THEN effect не выполняется повторно (маркер в артефактах)
- GIVEN author.role.ts загружен WHEN step() THEN fetch discussions → classify → summary → ask → effect react/reply → done

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                                               | Level | Test File                  |
| ------------------------------------------------------ | ----- | -------------------------- |
| Engine: load + activate                                | unit  | role-engine.test.ts        |
| Scheduler: tick → assign                               | unit  | role-scheduler.test.ts     |
| Scheduler: tick → step                                 | unit  | role-scheduler.test.ts     |
| Instance: session узел → gate                          | unit  | role-instance.test.ts      |
| Instance: recovery ladder (continue)                   | unit  | role-instance.test.ts      |
| Instance: recovery ladder (restart)                    | unit  | role-instance.test.ts      |
| Instance: recovery ladder (AWAITING)                   | unit  | role-instance.test.ts      |
| Classifier: PARSE_ERROR → signal                       | unit  | outcome-classifier.test.ts |
| Classifier: SESSION_ERROR → signal                     | unit  | outcome-classifier.test.ts |
| Classifier: SCHEMA_MISMATCH → signal                   | unit  | outcome-classifier.test.ts |
| Reviewer: scaffold → gate → enrich                     | unit  | reviewer.role.test.ts      |
| Reviewer: sessions fan-out → synthesize → ask → effect | unit  | reviewer.role.test.ts      |
| Author: fetch → classify → summary → ask → effect      | unit  | author.role.test.ts        |
| Escalator: 24h → нотификация                           | unit  | rights-escalator.test.ts   |
| Escalator: POST → таймер сброшен                       | unit  | rights-escalator.test.ts   |

## 7. Execution Log

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE

#### P3

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
