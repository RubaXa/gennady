# Task: TSK-113 — inbox-roles: reviewer/author графы + движок узлов

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-113 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-roles | **Dependencies:** TSK-109 (core), TSK-110 (VCS), TSK-111 (opencode), TSK-116 (ai-kit)
- **Purpose:** Движок ролей: граф узлов (prep/session/gate/ask/effect), Scheduler, RoleInstance (step + recovery ladder + восстановление от артефактов), OutcomeClassifier, ArtifactValidator (coverage ledger + tool-call сверка + mermaid), EffectExecutor (все vcs-\* детерминированно, дедуп, идемпотентность), RightsEscalator (нотификации). Reviewer-граф — три ветки (review_needed/reply_needed/update-review); author-граф — self-review + разбор замечаний + FIX_TASK.md. Реврайт под D-86 (полный, паритет с CLI D57/D70).
- **Spec:** [inbox-roles.spec.md](../../specs/agent-inbox/inbox-roles/inbox-roles.spec.md), [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-04, NFC-SV-07/08/09 | **Runtime:** not-implemented | **Verification:** unit
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | impl | P1   | [ ]    |
| P3  | impl | P2   | [ ]    |
| P4  | test | P3   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (граф-каркас + Scheduler)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/role-node.ts` — RoleNode: варианты `prep`/`session`/`gate`/`ask`/`effect` + Edge; типы NodeContext (mr, workspace под state dir, artifacts), SessionPolicy (promptTimeout-минуты, continueMax, restartMax), GateResult, OperatorQuestion
  - `services/agent-inbox/modules/inbox-roles/role-engine.ts` — RoleEngine: loadAll/activate/deactivate/list (роли `active:false` по умолчанию)
  - `services/agent-inbox/modules/inbox-roles/role-scheduler.ts` — RoleScheduler: tick (poll → шумовой фильтр AI-02 → delta → assign → step → escalate); assignManual (работает и для неактивной роли, SV-08); listInstances/listUnassigned/getPolledMr/findInstance
  - `services/agent-inbox/modules/inbox-roles/errors.ts` — RoleError, InstanceState
- **Exit:** Engine грузит роли; Scheduler.tick с мок-VCS: новые MR → инстанс или в unassigned; type-check + format pass.
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — impl (движок узлов: instance, classifier, validator, executor, escalator)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/role-instance.ts` — RoleInstance: `step()` (выполнить узел по kind, классифицировать, перейти по edge), recovery ladder (continue→restart→AWAITING_OPERATOR), движок владеет status (NFC-SV-08), восстановление от заполненных артефактов при рестарте, `ctx.workspace` под `StateStore.getStateDir()` (NFC-05), `onContextUpdate`, `getBoardView`
  - `services/agent-inbox/modules/inbox-roles/outcome-classifier.ts` — классы + предметный remediation-сигнал
  - `services/agent-inbox/modules/inbox-roles/artifact-validator.ts` — validate(dir, stage): структура + схема + mermaid-валидность (парсер) + coverage ledger (каждый Scope-файл → находки/явное no-findings) + tool-call сверка (toolCalls из opencode vs Scope). Обёртка над `inbox-review-plan --validate`
  - `services/agent-inbox/modules/inbox-roles/effect-executor.ts` — единственный исполнитель vcs-\* (NFC-SV-07): reconcile-дедуп против тредов + ThreadModel/ReactionMatrix; vcs-react/vcs-reply/vcs-approve/резолв/vcs-draft-note; идемпотентность (`effect_applied` в audit)
  - `services/agent-inbox/modules/inbox-roles/rights-escalator.ts` — notifyReady (сразу при AWAITING_OPERATOR) + remindIdle; права не эскалирует
- **Exit:** Инстанс проходит граф на моках; ладдер, дедуп, идемпотентность, восстановление покрыты; агент vcs-\* не вызывает (только EffectExecutor).
<!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->

### P3 — impl (роли: reviewer + author)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/reviewer.role.ts` — три ветки от `prep`: review_needed (fan-out по дорожкам + security-линза NFC-SV-09 + code-review base..HEAD → synthesize → ask → effect), reply_needed (thread-triage без полной батареи), update-review (дельта). `session`-узлы строят system через `services/ai-kit` (buildNodePrompt), задача — предметная (адреса файлов), cwd=worktree
  - `services/agent-inbox/modules/inbox-roles/author.role.ts` — self-review + разбор замечаний ревьюеров (`vcs-discussions --all`) → REPORT.md (Сводка) + FIX_TASK.md (копируемое задание) + черновики; effect = react/reply + опц. vcs-mr-edit --description; свой MR не апрувит, в треды не пишет (D68)
- **Exit:** Обе роли выражают конвейер D57/D70 через граф; reviewer-граф проходит три ветки на моках (тест выразительности).
<!--/SECTION:PHASE_P3-->

<!--SECTION:PHASE_P4-->

### P4 — test

- **Rules:** none
- **Target Files:** `__tests__/` — role-engine, role-scheduler, role-instance, outcome-classifier, artifact-validator, effect-executor, rights-escalator, reviewer.role, author.role
- **Exit:** Полный цикл tick → prep → session → gate → synthesize → ask → effect; ладдер; дедуп; идемпотентность (двойной постинг при restart не происходит); три ветки reviewer; author FIX_TASK.
<!--/SECTION:PHASE_P4-->

<!--SECTION:BDD-->

## 4. BDD

- GIVEN reviewer активирован WHEN tick с новым MR (stage=review_needed) THEN prep → fan-out сессии по дорожкам + security-линза
- GIVEN stage=reply_needed WHEN prep THEN ветка thread-triage (полная батарея НЕ запускается)
- GIVEN headChanged=fast_forward + моё ревью WHEN prep THEN ветка update-review (дельта)
- GIVEN session вернула TIMEOUT WHEN recovery THEN continue→restart→AWAITING_OPERATOR (лимиты policy)
- GIVEN агент предложил действия в артефакте WHEN effect THEN EffectExecutor вызывает vcs-\* (агент сам не вызывал)
- GIVEN effect выполнен WHEN restart узла THEN повторно не постится (effect_applied)
- GIVEN Scope-файл без находок WHEN validate THEN требуется явное no-findings (coverage ledger)
- GIVEN агент не открывал Scope-файл WHEN validate THEN предупреждение (tool-call сверка)
- GIVEN рестарт serve с заполненными дорожками WHEN восстановление THEN готовые не переисполняются
- GIVEN author-MR WHEN граф THEN REPORT.md + FIX_TASK.md + черновики; approve отсутствует
- GIVEN оператор не реагирует WHEN AWAITING_OPERATOR THEN notifyReady (права не растут)
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                               | Level | Test File                  |
| -------------------------------------- | ----- | -------------------------- |
| Scheduler: tick → assign/unassigned    | unit  | role-scheduler.test.ts     |
| Instance: три ветки reviewer           | unit  | reviewer.role.test.ts      |
| Instance: recovery ladder              | unit  | role-instance.test.ts      |
| Instance: восстановление от артефактов | unit  | role-instance.test.ts      |
| Classifier: класс + сигнал             | unit  | outcome-classifier.test.ts |
| Validator: coverage ledger + tool-call | unit  | artifact-validator.test.ts |
| Executor: дедуп + идемпотентность      | unit  | effect-executor.test.ts    |
| Escalator: notifyReady                 | unit  | rights-escalator.test.ts   |
| Author: FIX_TASK + no-approve          | unit  | author.role.test.ts        |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []

#### P3

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []

#### P4

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
    **Handoff →** artifacts: []; decisions: []; open: []
<!--/SECTION:EXECUTION_LOG-->
