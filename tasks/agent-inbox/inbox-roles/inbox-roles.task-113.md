# Task: TSK-113 — inbox-roles: RoleEngine + Scheduler + RoleInstance + RightsEscalator

## 1. Meta

- **Task-ID:** TSK-113 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-roles | **Dependencies:** TSK-109 (core state), TSK-110 (VCS port), TSK-111 (opencode port)
- **Purpose:** Role Engine, Scheduler, RoleInstance (стейт-машина), RightsEscalator. Роли reviewer и author. Интеграция всех компонентов.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-04, SV-07–SV-11, [inbox-roles.spec.md](../../specs/agent-inbox/inbox-roles/inbox-roles.spec.md) | **Runtime:** not-implemented | **Verification:** unit, integration

## 2. Phases Overview

| ID  | Kind | Deps  | Status |
| --- | ---- | ----- | ------ |
| P1  | impl | —     | [ ]    |
| P2  | impl | P1    | [ ]    |
| P3  | test | P1,P2 | [ ]    |

## 3. Phases

### P1 — impl (Engine + Scheduler)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/role-engine.ts` — RoleEngine: loadAll, activate, deactivate, list
  - `services/agent-inbox/modules/inbox-roles/role-scheduler.ts` — RoleScheduler: tick (polling → delta → assign → advance → escalate), assignManual, activeCount
  - `services/agent-inbox/modules/inbox-roles/errors.ts` — RoleError
- **Exit:** RoleEngine загружает роли. Scheduler выполняет tick-цикл с мок-VCS.

### P2 — impl (Instance + Roles + Escalator)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/role-instance.ts` — RoleInstance: advance, onContextUpdate, updateRights, getBoardView. Вызывает `services/ai-kit` для сборки system prompt из AIKit-директив (SV-12).
  - `services/agent-inbox/modules/inbox-roles/reviewer.role.ts` — ReviewerRole: states, transitions, buildSystemPrompt (делегирует в ai-kit)
  - `services/agent-inbox/modules/inbox-roles/author.role.ts` — AuthorRole
  - `services/agent-inbox/modules/inbox-roles/rights-escalator.ts` — RightsEscalator: evaluate (24h→canPost, 72h→canApprove), schedule
- **Exit:** RoleInstance выполняет стейт-машину. AI-узлы через мок-OpenCode. Права эскалируются. System prompt собирается через ai-kit.

### P3 — test

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/__tests__/role-engine.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/role-instance.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/rights-escalator.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/reviewer.role.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/author.role.test.ts`
- **Exit:** Полный цикл tick → assign → advance → escalate.

## 4. BDD

- GIVEN RoleEngine.loadAll() WHEN роли загружены THEN list() = [{ name:'reviewer', active: false }, { name:'author', active: false }]
- GIVEN reviewer активирован WHEN tick() с новым MR (role=reviewer) THEN RoleInstance создан, MR в IN_PROGRESS
- GIVEN RoleInstance в IN_PROGRESS WHEN advance() THEN buildSystemPrompt → OpenCode.prompt() → state = AWAITING_OPERATOR, prevState = IN_PROGRESS
- GIVEN оператор не реагировал 24h WHEN RightsEscalator.evaluate() THEN rights.canPost = true
- GIVEN оператор выполнил POST /api/mr/:id/action WHEN следующий evaluate() THEN таймер сброшен
- GIVEN RoleInstance в AWAITING_OPERATOR с canPost=true WHEN advance() THEN авто-постинг → DONE
- GIVEN ручное назначение WHEN assignManual(mr, 'reviewer', { canPost: false }) THEN RoleInstance с переданными правами

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                                 | Level | Test File                |
| ---------------------------------------- | ----- | ------------------------ |
| RoleEngine: load + activate              | unit  | role-engine.test.ts      |
| Scheduler: tick → assign                 | unit  | role-scheduler.test.ts   |
| Scheduler: tick → advance                | unit  | role-scheduler.test.ts   |
| Scheduler: manual assign                 | unit  | role-scheduler.test.ts   |
| Instance: advance IN_PROGRESS → AWAITING | unit  | role-instance.test.ts    |
| Instance: prevState tracking             | unit  | role-instance.test.ts    |
| Instance: getBoardView                   | unit  | role-instance.test.ts    |
| RightsEscalator: 24h → canPost           | unit  | rights-escalator.test.ts |
| RightsEscalator: действие → сброс        | unit  | rights-escalator.test.ts |
| Reviewer: buildSystemPrompt              | unit  | reviewer.role.test.ts    |

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
