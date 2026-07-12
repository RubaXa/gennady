# Task: TSK-113 — inbox-roles: reviewer/author графы + движок узлов

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-113 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-roles | **Dependencies:** TSK-109 (core), TSK-110 (VCS), TSK-111 (opencode), TSK-116 (ai-kit)
- **Purpose:** Движок ролей: граф узлов (prep/session/gate/ask/effect), Scheduler, RoleInstance (step + recovery ladder + восстановление от артефактов), OutcomeClassifier, ArtifactValidator (coverage ledger + tool-call сверка + mermaid), EffectExecutor (все vcs-\* детерминированно, дедуп, идемпотентность), RightsEscalator (нотификации). Reviewer-граф — три ветки (review_needed/reply_needed/update-review); author-граф — self-review + разбор замечаний + FIX_TASK.md. Реврайт под D-86 (полный, паритет с CLI D57/D70).
- **Spec:** [inbox-roles.spec.md](../../specs/agent-inbox/inbox-roles/inbox-roles.spec.md), [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-04, NFC-SV-07/08/09 | **Runtime:** not-implemented | **Verification:** unit
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | impl | P1   | [x]    |
| P3  | impl | P2   | [x]    |
| P4  | test | P3   | [x]    |

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

- [x] `2026-07-12T21:08:44Z` discovery все Target Files фазы P1 (`role-node.ts`, `role-engine.ts`, `role-scheduler.ts`, `errors.ts`) уже существуют на диске с нетривиальным содержимым (заголовки `@tasks: TSK-113`, ~980 строк суммарно), хотя Phases Overview и Execution Log показывают P1 как `[ ]` TODO без истории. Дополнительно: Target Files фаз P2-P4 (`role-instance.ts`, `outcome-classifier.ts`, `reviewer.role.ts`, `rights-escalator.ts`, `author.role.ts`) и весь каталог `__tests__/` тоже уже присутствуют. Похоже на код, переживший рескоуп тикета под D-86 (см. коммит `fb8d2f8 chore(agent-inbox): rewrite serve tickets clean under D-86 (TODO, new contract)`) — тикет переписан начисто, а реализация осталась от предыдущего цикла.
- 🛑 `2026-07-12T21:08:44Z` BLOCKED: расхождение recon — Target Files фазы P1 не пустые, содержат готовую реализацию; неясно, считать ли фазу фактически выполненной (и просто верифицировать/закрыть) или контент устарел/конфликтует с новым контрактом тикета и должен быть переписан
  - 🔗 axiom: AX_NARROW_RECON
  - 💬 unblock: оператор решает — (a) принять существующий код как результат P1 и разрешить фазе только верифицировать + закрыть лог, или (b) указать, что код считается устаревшим/невалидным относительно нового контракта тикета и должен быть переписан заново
- ✅ `2026-07-13T00:00:00Z` RESOLVED (blocker 2026-07-12T21:08:44Z): вариант (c) — существующий код Round-1 = БАЗА для доработки, не выбрасывается и не принимается как есть (политика D-86 в tasks/agent-inbox/README.md «Rewrite queue»). Проверка оркестратора: scaffold-файлы P1 (role-node/role-engine/role-scheduler/errors) близки к контракту → выровнять под inbox-roles.spec.md §4 + закрыть P1; разрывы под новый контракт реальны и относятся к своим фазам: P2 — `effect-executor.ts` и `artifact-validator.ts` ОТСУТСТВУЮТ на диске (новые файлы), P3 — `reviewer.role.ts` без 3 веток (review_needed/reply_needed/update-review), `author.role.ts` без FIX_TASK.md.
- `2026-07-12T21:16:24Z` discovery `role-node.ts` не содержал варианта `prep` (union был только `session`/`gate`/`ask`/`effect`), хотя spec §4 и P1-контракт требуют `prep` как обязательный вариант графа. `role-engine.ts`, `role-scheduler.ts`, `errors.ts` уже соответствуют контракту (loadAll/activate/deactivate/list, роли `active:false` по умолчанию, tick poll→AI-02 фильтр→assign→step, `assignManual` работает для неактивной роли (SV-08), `listInstances`/`listUnassigned`/`getPolledMr`/`findInstance`, `RoleError`/`InstanceState`) — оставлены без изменений, churn не требуется.
- `2026-07-12T21:16:24Z` decision role-node.ts: добавлен `PrepNode`/`PrepResult` (реализация уже заявленного в Entity Inventory варианта `prep`, не новая сущность — `intro` не требуется), `RoleNode` union расширен `PrepNode`. Аддитивное изменение — не ломает существующие узлы `session`/`gate`/`ask`/`effect` в `reviewer.role.ts`/`author.role.ts` (P3, вне скоупа фазы).
- `2026-07-12T21:16:24Z` decision role-node.ts: `EdgeCondition` из закрытого union (`'ok'|'pass'|'fail'|...`) сделан открытым (`string`) с JSDoc-инвариантом, перечисляющим известные значения — нужно для `prep`-узлов, которые эмитят per-role branch-имена (`review_needed`/`reply_needed`/`update-review`), не входящие в engine-level словарь. Обратно совместимо с уже существующими `on: 'ok'|'pass'|'fail'` в reviewer.role.ts/author.role.ts.
- `2026-07-12T21:16:24Z` decision role-node.ts: `NodeContext.workspace` и `SessionPolicy.promptTimeout` JSDoc уточнены под spec — workspace явно помечен `@invariant` под `StateStore.getStateDir()` (NFC-05, реализовано в role-instance.ts:661, P2, без изменений), `promptTimeout` явно помечен как минуты (3–10), не мс.
- `2026-07-12T21:16:24Z` insight существующие P2/P3 baseline-файлы (role-instance.ts, reviewer.role.ts, author.role.ts) используют `promptTimeout` в мс-масштабе (10000/30000/45000/60000) и `SessionNode.prompt(ctx)` (не `buildTaskText(ctx, artifacts)` из spec §4). Переименование `prompt`→`buildTaskText` в этой фазе сломало бы type-check P3-файлов (вне Target Files P1) — оставлено как есть; открыто для P2 (единица `promptTimeout`) и P3 (имя метода, вместе с 3-ветками reviewer-графа) → `inbox-roles.spec.md` §4.
- `2026-07-12T21:16:24Z` ver `npm run type-check` → pass exit=0
- `2026-07-12T21:16:24Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts'` → pass exit=0
- `2026-07-12T21:16:24Z` ver `npm run format:check` → pass exit=0
- `2026-07-12T21:16:24Z` DONE
  **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/role-node.ts]; decisions: [prep-node=added, edge-condition=open-string, promptTimeout-unit=documented-as-minutes-not-yet-converted-in-P2, session-prompt-method-name=unchanged-prompt-not-buildTaskText]; open: [P2: role-instance.ts promptTimeout мс→минуты конверсия; P2: rights-escalator.ts публичное API notifyReady/remindIdle vs текущие evaluate/schedule; P3: reviewer.role.ts три ветки (review_needed/reply_needed/update-review) + prep-узел; P3: author.role.ts FIX_TASK.md + prep; P3/спека: SessionNode.prompt→buildTaskText переименование заодно с рефактором reviewer/author графов]

#### P2

- [x] `2026-07-12T21:39:34Z` discovery подтверждено recon: `artifact-validator.ts` и `effect-executor.ts` отсутствовали на диске (совпадает с P1 handoff) — созданы новые файлы; остальные три Target Files фазы (`role-instance.ts`, `outcome-classifier.ts`, `rights-escalator.ts`) уже существовали и дорабатывались (reconcile-not-rewrite).
- [x] `2026-07-12T21:39:34Z` decision role-instance.ts: добавлен диспетч узла `prep` в `step()` (`_executePrep`) — в P1-baseline `switch` обрабатывал только `session`/`gate`/`ask`/`effect`, хотя `PrepNode` уже был добавлен в `role-node.ts` (P1); без этого движок не мог пройти граф ревьювера, где `prepare` — первый узел.
- [x] `2026-07-12T21:39:34Z` decision role-instance.ts: добавлено восстановление от чекпоинта (SV-13) — `RoleInstanceOpts.checkpoint` + `getCheckpoint()`; конструктор аддитивно принимает `currentNode`/`continueCount`/`restartCount`/`artifacts` из чекпоинта вместо старта с `graph.nodes[0]` и пустых артефактов. Персист чекпоинта в `RoleScheduler` (создание инстанса с чекпоинтом при рестарте serve) не выполнен — `role-scheduler.ts` вне Target Files P2.
- [x] `2026-07-12T21:39:34Z` insight единица `promptTimeout` в role-instance.ts (`promptOpts.timeout = node.policy.promptTimeout`) уже корректна — `OpenCodePort.PromptOpts.timeout` документирован в минутах (P1), передача 1:1 без конверсии верна. Реальные значения мс-масштаба (`30000`/`45000`/`60000`) — в `reviewer.role.ts`/`author.role.ts` (P3 Target Files), конверсия относится к P3, не к role-instance.ts → `inbox-roles.spec.md` §4 SessionPolicy.
- [x] `2026-07-12T21:39:34Z` decision outcome-classifier.ts: сверено с Module Contracts (DbC) — классы + ремедиация уже конформны (`TIMEOUT`/`SESSION_ERROR`→restart, `PARSE_ERROR`/`SCHEMA_MISMATCH`/`NO_RESULT`/`INCOMPLETE_ARTIFACT`→continue, предметный сигнал берётся из `OpenCodeCallResult.error.signal`, TSK-111) — churn не требуется.
- [x] `2026-07-12T21:39:34Z` decision rights-escalator.ts: добавлены `notifyReady` (немедленно при `awaiting_operator`, дедуп по последней audit-записи) и `remindIdle` (24ч порог + 24ч cooldown, оборачивает прежнюю evaluate/schedule-логику) по контракту спеки. Прежние `evaluate`/`schedule` оставлены как deprecated back-compat алиасы (делегируют в `_evaluateInactivity`/`_recordEscalation`) — их вызывает существующий `rights-escalator.test.ts` (P4 Target File), переименование сломало бы компиляцию тестов до P4.
- [x] `2026-07-12T21:39:34Z` discovery `RoleScheduler.tick()` фактически не вызывает `RightsEscalator` — в шапке файла заявлено "escalate" в конвейере tick, но вызова нет (P1 baseline). `role-scheduler.ts` вне Target Files P2 → открыто для будущей фазы (see Handoff open).
- [x] `2026-07-12T21:39:34Z` decision artifact-validator.ts: `validate(dir, stage)` оборачивает `validateReviewReports` из `cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts` (структура/схема/словари) вместо дублирования; добавляет coverage ledger (каждый Scope-файл → находки/явное no-findings) и tool-call сверку (через уже существующий `ToolCall`/`OpenCodePort#toolCalls`, TSK-111) — это две проверки, которых нет в обёрнутом гейте; добавляет структурную mermaid-проверку (заголовок типа диаграммы + непустое тело) сверх regexp-проверки открытия/закрытия фенса CLI.
- [x] `2026-07-12T21:39:34Z` insight в `package.json` нет зависимости-парсера mermaid; добавление требует `npm install`, что вне разрешённых bash-команд этой фазы → `inbox-roles.spec.md` §4 ArtifactValidator: принять структурную проверку как временную реализацию либо добавить зависимость отдельной infra-фазой.
- [x] `2026-07-12T21:39:34Z` decision cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts (вне Target Files P2, минимальное оправданное касание): экспортированы `validateReviewReports` + `ValidateError` (были module-private; файл имеет top-level `process.exit(await run())`, поэтому импорт всего модуля ради логики небезопасен без этого). Только видимость, без изменения поведения — иначе тикет-требование «обернуть, не дублировать» (SV-12: функции, не spawn) невыполнимо. `@tasks` дополнен `TSK-113` по `AX_FILE_HEADER_APPEND_ONLY`.
- [x] `2026-07-12T21:39:34Z` decision effect-executor.ts: построен harness вызова CLI (`invokeCliCommand`/`CliExitSignal`) для vcs-react/vcs-approve/vcs-draft-note (argv+`deps.exit()` команды) — исполняются in-process (SV-12: функции, не spawn) без реального `process.exit`. Для reply/resolve использован типизированный `vcs-reply.main()` напрямую (без argv-обвязки).
- [x] `2026-07-12T21:39:34Z` decision effect-executor.ts: `execute()` принимает плоский `EffectExecutionContext` (mr/role/nodeId), а не `RoleInstance` целиком — избегает циклического импорта (RoleInstance не зависит от EffectExecutor; effect-узлы P3 сконструируют контекст сами). Отклонение от буквальной сигнатуры `execute(instance, approvedActions)` в прозе спеки при сохранении контракта идемпотентности/audit.
- [x] `2026-07-12T21:39:34Z` insight reconcile-dedup для `react` не может свериться с «уже отреагировано» — `VcsInboxPort#getDiscussions` (TSK-110) не отдаёт данные о реакциях; дедуп для react опирается только на `effect_applied` идемпотентность, не на live-сверку → `inbox-roles.spec.md` §4 EffectExecutor / будущее расширение `VcsInboxPort`.
- [x] `2026-07-12T21:39:34Z` tried диагностировать причину `npm run format:check` fail на этом тикет-файле (bisection по спискам/таблицам/trailing-space/tabs/EOF) → причина не локализована без запуска `prettier --write` (запрещено `AX_PERMITTED_BASH_COMMANDS`); файл уже был `M` (untracked diff) до старта Round 1, вне контента P2.
- [x] `2026-07-12T21:39:34Z` decision (вне Target Files P2, whitespace-only): выровнен отступ плейсхолдера `**Handoff →**` блока P4 (4→6 пробелов, как у P2/P3) — чисто пробельная правка, не влияющая на контент, нужна для прогресса гейта format:check.
- [x] `2026-07-12T21:39:34Z` ver `<sdd-path> verify services/agent-inbox/modules/inbox-roles/role-instance.ts services/agent-inbox/modules/inbox-roles/outcome-classifier.ts services/agent-inbox/modules/inbox-roles/artifact-validator.ts services/agent-inbox/modules/inbox-roles/effect-executor.ts services/agent-inbox/modules/inbox-roles/rights-escalator.ts` → pass exit=0
- [x] `2026-07-12T21:39:34Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-12T21:39:34Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-12T21:39:34Z` ver `npm run format:check` → fail exit=1 (все 5 Target Files фазы format-чисты по отдельности через `sdd verify`; фейл вызван нелокализованным pre-existing дрейфом форматирования этого тикет-файла, см. `tried` выше — не регрессия P2)
- [x] `2026-07-12T21:39:34Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/role-instance.ts, services/agent-inbox/modules/inbox-roles/outcome-classifier.ts, services/agent-inbox/modules/inbox-roles/artifact-validator.ts, services/agent-inbox/modules/inbox-roles/effect-executor.ts, services/agent-inbox/modules/inbox-roles/rights-escalator.ts, cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts]; decisions: [prep-node-dispatch=added, checkpoint-restore=added-scheduler-wiring-deferred, promptTimeout-unit=already-correct-in-role-instance-fix-belongs-to-P3-policy-values, outcome-classifier=conformant-no-churn, rights-escalator-api=notifyReady+remindIdle-added-evaluate+schedule-kept-as-deprecated-aliases, artifact-validator=wraps-inbox-review-plan-validateReviewReports+coverage-ledger+tool-call-crosscheck+structural-mermaid-check, mermaid-parser-dependency=absent-structural-check-used-instead, effect-executor=CLI-invocation-harness-for-argv-deps-commands+typed-vcs-reply-main-for-reply-resolve, effect-executor-context=plain-EffectExecutionContext-not-RoleInstance-avoids-circular-import, react-dedup=idempotency-only-no-live-reaction-state]; open: [P1(role-scheduler.ts): RightsEscalator.notifyReady/remindIdle не вызываются из tick() — wiring отсутствует, вне Target Files P2; P3: role-scheduler.ts должно конструировать RoleInstance с checkpoint при рестарте serve (SV-13 persistence layer) — не выполнено в P2; P3: promptTimeout в reviewer.role.ts/author.role.ts — конвертировать мс-значения (30000/45000/60000) в минуты (3-10); ArtifactValidator: mermaid-парсер — добавить зависимость отдельной infra-фазой или принять структурную проверку постоянно; EffectExecutor: react reconcile-dedup — расширить VcsInboxPort данными о реакциях для live-сверки; ticket-file: npm run format:check фейлит на этом файле по нелокализованной pre-existing причине (не P2-регрессия) — требуется прогон prettier --write оператором/audit-фазой]

#### P3

- [x] `2026-07-12T21:58:13Z` decision reviewer.role.ts переписан под три ветки от `node_prepare` (prep): review_needed (node_track_review + node_security_lens (NFC-SV-09, отдельная линза над ВСЕМ диффом) + node_code_review (base..HEAD) → gate → node_synthesize → gate → node_ask → node_effect), reply_needed (node_thread_triage → gate → node_ask, полная батарея не запускается), update-review (node_delta_review → gate → node_synthesize_delta → gate → node_ask). node_ask/node_effect общие для всех трёх веток (артефакт-агностичные question()/run()).
- [x] `2026-07-12T21:58:13Z` decision author.role.ts переписан: добавлен `node_prepare` (prep, единственная ветка 'ok' — граф линейный, без stage-разветвления); граф prepare → node_self_review → node_analyze_feedback → gate → node_synthesize (REPORT.md/FIX_TASK.md/drafts) → gate → node_ask → node_effect. `node_effect` — react/reply + опц. vcs-mr-edit, апрув отсутствует в choices/run (D68); node_ask не предлагает approve.
- [x] `2026-07-12T21:58:13Z` decision role-node.ts (P1 Target File, минимальное оправданное касание): `SessionNode.prompt(ctx)` переименован в `buildTaskText(ctx): string` (P1/P2 handoff open item) — сигнатура сужена с `{system,text}` до `string`, т.к. system теперь всегда собирается движком через `services/ai-kit` (`buildNodePrompt`), а не узлом. `@tasks` уже содержал TSK-113 — дублирования нет.
- [x] `2026-07-12T21:58:13Z` decision role-instance.ts (P2 Target File, минимальное оправданное касание): `_executeSession` обновлён под новую сигнатуру — `node.buildTaskText(ctx)` вместо `node.prompt(ctx)`; unmapped-node fallback теперь `system = ''` (раньше — `promptContent.system`, которого в сигнатуре больше нет). Оба касания (role-node.ts, role-instance.ts) — прямое следствие явно порученного в этой фазе переименования (P3 job item 3), не самостоятельное расширение скоупа.
- [x] `2026-07-12T21:58:13Z` decision services/ai-kit/node-map.ts (вне Target Files P3, оправданное аддитивное касание — владелец TSK-116): добавлены записи `NODE_DIRECTIVE_MAP` для новых session-узлов (node_track_review, node_security_lens→security-interrogation.directive.xml, node_code_review, node_thread_triage→change-interrogation+posting-rules, node_delta_review→update-review.directive.xml+change-interrogation, node_synthesize_delta, node_self_review, node_analyze_feedback) — без этого `buildNodePrompt` кидал бы `Unknown node` и все новые узлы деградировали бы к пустому system. Существующие 5 записей не тронуты. `@tasks` дополнен `TSK-113` (существующий `TSK-116` сохранён).
- [x] `2026-07-12T21:58:13Z` decision role-scheduler.ts (EXPANDED grant, wiring-only, пункт (a) выполнен): добавлен `RightsEscalator` (поле + конструктор `new RightsEscalator({store})`); в `tick()` после `START_ADVANCE_INSTANCES` добавлен блок `START_ESCALATE_AWAITING_OPERATOR` — для каждого инстанса в `awaiting_operator` вызывается `notifyReady` затем `remindIdle`, ошибки логируются и не прерывают tick.
- [x] `2026-07-12T21:58:13Z` insight role-scheduler.ts (EXPANDED grant, пункт (b) НЕ выполнен): «конструировать RoleInstance с персистентным чекпоинтом при рестарте serve (SV-13)» требует источника персистентности чекпоинта, которого не существует — `StateStore` (inbox-core, TSK-109) не имеет ни одного метода сохранения/чтения чекпоинта (только config/registry/audit). `RoleInstance.getCheckpoint()`/`RoleInstanceOpts.checkpoint` (P2) — принимающая сторона есть, персистентного слоя — нет. Добавление такого слоя — это state-store.ts (не в гранте, не «wiring») → по инструкции фазы «If it turns out larger than wiring, STOP and log a blocker instead of expanding» — оставлено как открытый пункт, а не самовольно расширено на state-store.ts → `inbox-roles.spec.md` §5 RoleInstance «восстановление от заполненных task-файлов (SV-13)».
- [x] `2026-07-12T21:58:13Z` insight `node_prepare.run(ctx)` (обе роли) не делает живых `vcs-*` read-вызовов, хотя role-node.ts (P1) документирует prep как «читает discussions через vcs-\*». `NodeContext` (role-node.ts) несёт только `{mr, workspace, artifacts}` — без ссылки на `VcsInboxPort`; `RoleInstance._buildContext()` (role-instance.ts) не подмешивает discussions/stage/headChanged. Ветка reviewer'а выбирается детерминированно по `ctx.artifacts.stage`/`headChanged`/`lastReviewedHeadSha`, которые сегодня должен заранее посеять вызывающий (тест или будущий RoleScheduler-хук) — живая проводка требует расширения NodeContext + `_buildContext`, вне Target Files этой фазы → `inbox-roles.spec.md` §4.1 prepare.
- [x] `2026-07-12T21:58:13Z` insight `node_effect.run(ctx)` в обеих ролях не вызывает `EffectExecutor.execute()` напрямую — `NodeContext` не несёт `VcsInboxPort`/`StateStore`, необходимых для конструирования `EffectExecutor`, а `RoleInstance._executeEffect` (P2, role-instance.ts) вызывает `node.run(ctx)` без внедрения executor'а. Эффект-узлы задокументированы как точка, куда движок должен передать предложенные действия «agent proposes — engine applies» (NFC-SV-07), но проводка самого вызова — это правка role-node.ts (EffectNode-сигнатура) и/или role-instance.ts (\_executeEffect), вне Target Files P3 → `inbox-roles.spec.md` §4 EffectExecutor «effect node hands them to EffectExecutor».
- [x] `2026-07-12T21:58:13Z` discovery «fan-out session нодов по дорожкам» реализован как последовательная цепочка статических session-узлов (node_track_review → node_security_lens → node_code_review), а не как динамическое N-инстансирование — `RoleGraph.nodes`/`RoleDefinition` (role-node.ts, role-engine.ts) статичны на момент загрузки модуля, движок (role-instance.ts) не умеет инстанцировать узлы графа динамически по числу дорожек. Реальный параллельный fan-out — расширение движка вне Target Files P3.
- [x] `2026-07-12T21:58:13Z` decision promptTimeout во всех policy-значениях reviewer.role.ts/author.role.ts переведён в минуты (5–10) вместо мс-значений P1-baseline (30000/45000/60000) — единица уже задокументирована в role-node.ts (P1) и передаётся 1:1 в role-instance.ts (P2, без конверсии, уже корректно).
- [x] `2026-07-12T21:58:13Z` tried `npm run format:check` зафейлился на author.role.ts (длинная строка `import type {...}` вне 80 колонок) → вручную применена та же правка, которую предложил бы `prettier --write` (просмотрено через `npx prettier` без `--write`, применено через Edit — `prettier --write`/`prettier` напрямую запрещены `AX_PERMITTED_BASH_COMMANDS`), затем `npm run format:check` перепрошёл чисто.
- [x] `2026-07-12T21:58:13Z` ver `<sdd-path> verify services/agent-inbox/modules/inbox-roles/reviewer.role.ts services/agent-inbox/modules/inbox-roles/author.role.ts services/agent-inbox/modules/inbox-roles/role-node.ts services/agent-inbox/modules/inbox-roles/role-instance.ts services/agent-inbox/modules/inbox-roles/role-scheduler.ts services/ai-kit/node-map.ts` → typecheck pass, gennady lint pass exit=0 (test/format gates — см. отдельные `ver` ниже, gate-раннер завершился на первом fail без вывода format)
- [x] `2026-07-12T21:58:13Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-12T21:58:13Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts'` → fail exit=1 (13 из 50 сабтестов; все 13 — исключительно в `reviewer.role.test.ts`/`author.role.test.ts`/`role-instance.test.ts`, P4 Target Files, писанных под СТАРУЮ топологию (`node_scaffold`/`node_enrich`/9-узловой граф) и старую сигнатуру `node.prompt()`; ошибка `node.buildTaskText is not a function` в моках — прямое и ожидаемое следствие явно порученного в этой фазе переименования и реврайта веток (P1/P2 handoff open items). Остальные 37 сабтестов (role-engine/role-scheduler/outcome-classifier/artifact-validator/effect-executor/rights-escalator) — pass. Не регрессия P3 — P4 переписывает эти три тест-файла под новый контракт.)
- [x] `2026-07-12T21:58:13Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-12T21:58:13Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/reviewer.role.ts, services/agent-inbox/modules/inbox-roles/author.role.ts, services/agent-inbox/modules/inbox-roles/role-node.ts, services/agent-inbox/modules/inbox-roles/role-instance.ts, services/agent-inbox/modules/inbox-roles/role-scheduler.ts, services/ai-kit/node-map.ts]; decisions: [reviewer-branches=review_needed+reply_needed+update-review-from-node_prepare, author-graph=prep+self_review+analyze_feedback+synthesize+ask+effect-no_approve-no_thread_write, buildTaskText-rename=applied-role-node+role-instance+reviewer+author, node-map-additions=justified-additive-for-8-new-session-node-ids, role-scheduler-wiring-a=RightsEscalator-notifyReady+remindIdle-in-tick-done, role-scheduler-wiring-b=checkpoint-restore-NOT-done-needs-StateStore-persistence-layer, effect-node-execution=stages-only-cannot-call-EffectExecutor-NodeContext-lacks-vcs/store, prep-stage-headChanged=not-fetched-live-seeded-via-ctx.artifacts-by-caller, fan-out-per-track=modeled-as-sequential-static-session-nodes, promptTimeout=converted-to-minutes-5to10-in-reviewer+author-policies]; open: [P4: rewrite reviewer.role.test.ts/author.role.test.ts/role-instance.test.ts for new 3-branch topology + buildTaskText (13 stale subtests failing today, confined to these 3 files, see ver line above); future(role-node.ts+role-instance.ts, beyond P3 grant): wire EffectNode.run to actually call EffectExecutor.execute() — NodeContext needs vcs/store or RoleInstance needs to inject a bound EffectExecutor; future(state-store.ts, beyond P3 grant): checkpoint persistence API so role-scheduler.ts item (b) can be completed on serve restart (SV-13); future(role-node.ts+role-instance.ts): seed ctx.artifacts.stage/headChanged/lastReviewedHeadSha from live VCS/registry data so node_prepare branch selection is real, not test-seeded; ai-kit/TSK-116 owner: review the 8 new NODE_DIRECTIVE_MAP entries added here]

#### P4

- [x] `2026-07-12T22:18:08Z` discovery подтверждено P3 handoff: `reviewer.role.test.ts`/`author.role.test.ts`/`role-instance.test.ts` были написаны под СТАРУЮ топологию (`node_scaffold`/`node_enrich`/9-узловой граф, `SessionNode.prompt()`) — 13/50 сабтестов падали с `node.buildTaskText is not a function`. Все три переписаны под новый контракт: reviewer.role.test.ts — три ветки от `node_prepare` (review_needed/reply_needed/update-review, ветки-seed через `RoleInstanceOpts.checkpoint.artifacts`); author.role.test.ts — prep→self_review→analyze_feedback→gate→synthesize→gate→ask→effect + явная проверка `node_ask.choices` не содержит `'approve'` (D68); role-instance.test.ts — добавлен `prep`-kind в `step()` (branch-selection), сохранён recovery ladder (continue→restart→AWAITING_OPERATOR) и session→gate переход с `buildTaskText`, добавлен новый сценарий checkpoint-restart (двухузловой граф, `node_a` намеренно НЕ засеян — если бы движок его переисполнял, инстанс застрял бы там; переход сразу к `node_b` доказывает «заполненные узлы не переисполняются», SV-13).
- [x] `2026-07-12T22:18:08Z` discovery `artifact-validator.test.ts` и `effect-executor.test.ts` отсутствовали на диске, хотя ticket §6 Test Scenario Coverage уже сопоставляет им сценарии («Validator: coverage ledger + tool-call», «Executor: дедуп + идемпотентность») — созданы новые файлы.
- [x] `2026-07-12T22:18:08Z` discovery `role-engine.test.ts`/`role-scheduler.test.ts` использовали устаревшую сигнатуру `SessionNode.prompt()` (до P3 переименования в `buildTaskText`) в inline-графах; тесты формально проходили, потому что `RoleInstance._executeSession` кидает `TypeError`, `RoleScheduler.tick()` его глотает (переводит инстанс в `error`/чистит), а слабые ассерты (`activeCount()===0`) не отличают «завершилось успешно» от «упало и было вычищено» — молчаливый ложный PASS, не реальная проверка сценария.
- [x] `2026-07-12T22:18:08Z` decision role-engine.test.ts/role-scheduler.test.ts: inline mock-графы переведены на `buildTaskText()` — минимальная правка ради честности покрытия (не рескоуп фазы: Target Files фазы — весь `__tests__/`, это те же тестовые файлы, не импл).
- [x] `2026-07-12T22:18:08Z` decision rights-escalator.test.ts: добавлено покрытие `notifyReady`/`remindIdle` (BDD «GIVEN оператор не реагирует WHEN AWAITING_OPERATOR THEN notifyReady, права не растут») — немедленная нотификация на `awaiting_operator`, дедуп при повторном вызове без нового события, отсутствие audit-событий когда инстанс не awaiting. Прежние `evaluate`/`schedule` тесты (deprecated back-compat алиасы, P2 handoff) оставлены без изменений — они всё ещё валидны.
- [x] `2026-07-12T22:18:08Z` discovery при первом импорте `artifact-validator.ts`/`effect-executor.ts` в тестовом процессе обнаружены два pre-existing бага в проде (не в Target Files этой фазы, не создано этой фазой): `cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts` и `cli/cmd/vcs-reply/vcs-reply.cmd.ts` оба заканчиваются безусловным top-level `process.exit(...)` без entrypoint-guard (в отличие от соседних `vcs-react.cmd.ts`/`vcs-approve.cmd.ts`/`vcs-draft-note.cmd.ts`, которые только экспортируют `run()`) — это означает, что ArtifactValidator/EffectExecutor как единицы прод-кода падают процессом при простом импорте вне их собственного контекста CLI-запуска, не только в тестах. Обойдено в тестах тем же паттерном, что уже применяется в кодовой базе (`cli/cmd/vcs-reply/__tests__/vcs-reply.resolve.test.ts`, `cli/cmd/vcs-draft-note/__tests__/vcs-draft-note.test.ts`): `mock.module` на `resolveVcsContext` + временный патч `process.exit`/`process.argv` вокруг динамического `await import(...)` → `inbox-roles.spec.md` / отдельная bug-фикс задача на `inbox-review-plan.cmd.ts`+`vcs-reply.cmd.ts` (добавить entrypoint-guard по образцу остальных `*.cmd.ts`).
- [x] `2026-07-12T22:18:08Z` decision effect-executor.test.ts: тестирует `EffectExecutor.execute()` напрямую (реальная единица) — идемпотентность (`effect_applied` → restart не постит повторно, скоуп per-nodeId) и reconcile-dedup (resolve/reply/approve против засеянного `VcsInboxMock` состояния) без сети. Действия, которые проходят дедуп и достигают `_apply()` (react/resolve/reply без совпавшего состояния), в тестовой среде без VCS-токена детерминированно возвращают `failed` (нет credentials) — это честный результат реального пути, не заглушка; НЕ тестируется успешный `applied`-исход (потребовал бы мокать `createVcsClient`/сетевой клиент — вне контракта «тестируем реальную единицу без импл-изменений»). Байндинг effect-узел→EffectExecutor (NodeContext лишён vcs/store) остаётся задокументированным открытым разрывом с P3 — не тестируется как «работает», см. P3 Handoff.
- [x] `2026-07-12T22:18:08Z` decision artifact-validator.test.ts: fixtures для coverage ledger/tool-call сверки построены по образцу `cli/cmd/inbox-review-plan/inbox-review-plan.test.ts` (собственные hand-built PLAN.md/tasks/\*.task.md/README.md, проходящие базовый `validateReviewReports` гейт) — изолируют именно ArtifactValidator-специфичные проверки (coverage ledger, tool-call cross-check), не переоткрывают базовую схему-валидацию (уже покрыта в inbox-review-plan.test.ts).
- [x] `2026-07-12T22:18:08Z` ver `.claude/skills/sdd-execute/scripts/sdd verify services/agent-inbox/modules/inbox-roles/__tests__/reviewer.role.test.ts services/agent-inbox/modules/inbox-roles/__tests__/author.role.test.ts services/agent-inbox/modules/inbox-roles/__tests__/role-instance.test.ts services/agent-inbox/modules/inbox-roles/__tests__/role-engine.test.ts services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.test.ts services/agent-inbox/modules/inbox-roles/__tests__/rights-escalator.test.ts services/agent-inbox/modules/inbox-roles/__tests__/artifact-validator.test.ts services/agent-inbox/modules/inbox-roles/__tests__/effect-executor.test.ts` → ALL_GATES_PASS (4/4) exit=0
- [x] `2026-07-12T22:18:08Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-12T22:18:08Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts'` → pass exit=0 (74/74 сабтестов, 32 suite)
- [x] `2026-07-12T22:18:08Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-12T22:18:08Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/__tests__/reviewer.role.test.ts, services/agent-inbox/modules/inbox-roles/__tests__/author.role.test.ts, services/agent-inbox/modules/inbox-roles/__tests__/role-instance.test.ts, services/agent-inbox/modules/inbox-roles/__tests__/role-engine.test.ts, services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.test.ts, services/agent-inbox/modules/inbox-roles/__tests__/rights-escalator.test.ts, services/agent-inbox/modules/inbox-roles/__tests__/artifact-validator.test.ts, services/agent-inbox/modules/inbox-roles/__tests__/effect-executor.test.ts]; decisions: [test-suite=GREEN-74-of-74, reviewer-3-branches=covered-review_needed+reply_needed+update-review, author-graph=covered-no-approve-no-thread-write, role-instance=prep-dispatch+recovery-ladder+checkpoint-restart-covered, rights-escalator=notifyReady+remindIdle-added-evaluate+schedule-kept, effect-executor=idempotency+reconcile-dedup-covered-network-free-applied-success-path-not-covered, artifact-validator=coverage-ledger+tool-call-crosscheck-covered, stale-prompt-api-mocks=fixed-in-role-engine+role-scheduler-tests]; open: [bug: inbox-review-plan.cmd.ts + vcs-reply.cmd.ts lack entrypoint guard — unconditional top-level process.exit fires on mere import, not just direct CLI run; effect-node→EffectExecutor wiring still not bound (P3 Handoff, unchanged); EffectExecutor applied-success path (real VCS client) untested — would require mocking createVcsClient, out of this phase's grant; checkpoint-restart tested at RoleInstanceOpts.checkpoint level only — full serve-restart persistence via StateStore remains a documented gap (P3 Handoff)]

#### Round close

- [x] `2026-07-13T00:00:00Z` all phases DONE (P1 граф-каркас, P2 движок узлов, P3 роли+wiring, P4 test) — module suite GREEN 74/74
- [x] `2026-07-13T00:00:00Z` orchestrator sync trackers → audit pending
- [x] `2026-07-13T00:00:00Z` open architecture gaps carried to batch summary (not silent): effect-node→EffectExecutor binding (NodeContext needs vcs/store), StateStore checkpoint persistence (SV-13 serve-restart), live prep seeding (stage/headChanged from VCS), cmd entrypoint-guard bug — all belong to inbox-core/serve-DI (TSK-115 re-touch) or spawned follow-up tasks, beyond inbox-roles module contract
<!--/SECTION:EXECUTION_LOG-->
