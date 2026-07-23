# Task: TSK-143 — inbox-roles: авто-approve при ясности + awaitingMe по 4 триггерам

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-143 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-roles | **Dependencies:** TSK-142 (спор-сигнал — один из 4 триггеров awaitingMe, эта задача его потребляет)
- **Purpose:** **Поведенчески значимое изменение** — меняет, КОГДА оператор вообще узнаёт о MR. Реализует SV-23/SV-24 (specs/agent-inbox §4.1.5): сегодня `node_ask`/`_executeAsk` (`role-instance.ts:1013`) безусловно переводит MR в `awaiting_operator` после ЛЮБОГО завершённого разбора, включая 0 находок — избыточные обращения к оператору. Меняет на условный переход по ЗАКРЫТОМУ списку из 4 триггеров: (1) новые находки в дельта-разборе; (2) спор — автор не согласен (из TSK-142); (3) находка `severity=error`; (4) неоднозначность — классификатор TSK-142 не смог однозначно решить. Когда НИ ОДИН триггер не сработал и все мои треды закрыты (включая только что автономно резолвленные TSK-142) без новых находок и без `severity=error` — автономный `vcs-approve` (`ApproveAction`, уже реализован `effect-executor.ts:67-72`) вместо перехода к оператору. Для триггера «спор» — готовится краткая сводка (находка/довод автора/код/рекомендация), не просто пометка «спорно».
- **Spec References:**
  - Requirements: [§4.1.5](../../../specs/agent-inbox/agent-inbox.spec.md#415-авто-наблюдение-дебаунс-дельта-ревью-авто-резолюция-refine--d-130d-135) (SV-23, SV-24)
  - Decision: [D-134, D-135](../../../specs/agent-inbox/agent-inbox.spec.md#6-decision-log)
  - Consumer: `role-instance.ts` `_executeAsk`/`node_ask` (`:879-897`, `:1013`, владелец TSK-113); `ApproveAction` (`effect-executor.ts:67-72`, уже реализован)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None.

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (условный ask-гейт + авто-approve)

- **Objective:** Новая функция `shouldEscalateToOperator(reviewOutcome, threadDecisions): EscalationVerdict` в `role-instance.ts` (или отдельный модуль `escalation-gate.ts`, если объём оправдывает — решает исполнитель фазы по фактическому размеру): реализует закрытый список 4 триггеров как явную таблицу, не имплицитно из «гейт вернул что-то». `_executeAsk`/`node_ask` вызывает эту функцию ПЕРЕД безусловным переходом в `awaiting_operator`: ни один триггер не сработал И все треды закрыты (используя решения `decideThreadAction` из TSK-142) И нет находки `severity=error` → диспатч `ApproveAction` автономно, MR переходит в `done` (не `awaiting_operator`); иначе — как сегодня, `awaiting_operator`, но для триггера «спор» артефакт несёт краткую сводку (находка/довод автора/фрагмент кода/рекомендация ассистента), не только флаг.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/role-instance.ts` (touched — `_executeAsk`/`node_ask` условная логика)
- **Inputs:** TSK-142 handoff (`ThreadDecision[]` — источник триггера «спор» и статуса резолва каждого треда)
- **Exit:** typecheck pass; MR с 0 находками и без находок `severity=error` НЕ переходит в `awaiting_operator` (регрессионный тест против сегодняшнего безусловного поведения); MR со спором ИЛИ находкой `severity=error` ИЛИ новыми находками в дельте ИЛИ неоднозначностью — переходит в `awaiting_operator` как раньше; авто-approve диспатчится только когда закрытый список триггеров пуст.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-покрытие `shouldEscalateToOperator` — по одному кейсу на каждый из 4 триггеров (срабатывает/не срабатывает) + явный регрессионный кейс «0 находок, всё закрыто → approve, НЕ awaiting_operator» (сегодняшнее поведение до этого тикета — наоборот). Integration/dry-run сценарий (D-116, паттерн TSK-113/t8): на синтетическом «чистом» MR-состоянии — `ApproveAction` диспатчится через `EffectExecutor` в DRY-RUN, журнал показывает `DRY-RUN approve→...`, реального apply на живой MR не происходит.
- **Rules:**
  - [testing-common](../../../ai/directives/testing/common.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/__tests__/role-instance.test.ts` (touched — новые кейсы; либо `__tests__/escalation-gate.test.ts` new, если P1 вынес логику в отдельный модуль)
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References (SV-23, SV-24, D-134, D-135).

**Feature:** Условная эскалация оператору + авто-approve при ясности

**Scenario:** 0 находок, все треды закрыты → авто-approve, не awaiting_operator [`unit`]

- **Given** разбор завершён без находок, все треды резолвлены (или не было открытых), нет `severity=error`
- **When** `shouldEscalateToOperator` вызывается
- **Then** результат — «не эскалировать»; MR переходит в `done` через автономный `ApproveAction`, НЕ в `awaiting_operator`

**Scenario:** новые находки в дельте → эскалация [`unit`]

- **Given** дельта-разбор нашёл новые находки, которых не было в прошлом разборе
- **When** `shouldEscalateToOperator`
- **Then** результат — «эскалировать» (триггер 1)

**Scenario:** спор → эскалация со сводкой [`unit`]

- **Given** `decideThreadAction` вернул решение «спор» хотя бы для одного треда
- **When** `shouldEscalateToOperator`
- **Then** результат — «эскалировать» (триггер 2); артефакт несёт краткую сводку спора (находка/довод автора/код/рекомендация), не только флаг

**Scenario:** severity=error → эскалация независимо от прочего [`unit`]

- **Given** хотя бы одна находка `severity=error`, остальное чисто
- **When** `shouldEscalateToOperator`
- **Then** результат — «эскалировать» (триггер 3), авто-approve НЕ диспатчится

**Scenario:** неоднозначность классификации → эскалация [`unit`]

- **Given** `decideThreadAction`/`classifyThreadSignals` не смог однозначно определить сигналы для треда
- **When** `shouldEscalateToOperator`
- **Then** результат — «эскалировать» (триггер 4)

**Scenario:** авто-approve — dry-run, не реальный apply [`integration`]

- **Given** синтетическое «чистое» MR-состояние (закрытый список триггеров пуст)
- **When** `ApproveAction` диспатчится через `EffectExecutor` в dry-run режиме
- **Then** журнал показывает `DRY-RUN approve→...`, реального `vcs-approve` на живой MR не происходит

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                | Required by               |
| -------------------------------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                                                   | typescript-rules          |
| `node --test services/agent-inbox/modules/inbox-roles/__tests__/role-instance.test.ts` | testing-common, node-test |

- **Task-specific Completion additions:** none beyond project baseline.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «0 находок → авто-approve» → `role-instance.test.ts` :: `auto-approves when zero findings and all threads closed`
- Scenario «новые находки → эскалация» → `role-instance.test.ts` :: `escalates on new delta findings`
- Scenario «спор → эскалация со сводкой» → `role-instance.test.ts` :: `escalates with dispute summary on author disagreement`
- Scenario «severity=error → эскалация» → `role-instance.test.ts` :: `escalates on error-severity finding regardless of other state`
- Scenario «неоднозначность → эскалация» → `role-instance.test.ts` :: `escalates on classification ambiguity`
- Scenario «авто-approve dry-run» → `role-instance.test.ts` :: `auto-approve dry-run does not post to real MR`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-22, initial

#### P1

- [x] `2026-07-22T18:10:00Z` intro `EscalationTrigger` ← SV-24 closed 4-trigger vocabulary (`role-instance.ts`)
- [x] `2026-07-22T18:10:05Z` intro `ReviewOutcome` ← findings + ambiguous-thread aggregate the escalation gate reads
- [x] `2026-07-22T18:10:10Z` intro `ThreadEscalationSignal` ← per-thread decision+thread+ambiguous, threaded from `gate_triage` to `node_ask`
- [x] `2026-07-22T18:10:15Z` intro `EscalationVerdict` ← escalation-gate result type (escalate:false | escalate:true+trigger)
- [x] `2026-07-22T18:10:20Z` intro `DisputeSummary` ← SV-24 trigger-2 payload (finding/довод автора/код/рекомендация), не просто флаг
- [x] `2026-07-22T18:10:25Z` intro `shouldEscalateToOperator` ← SV-24/D-135 pure decision gate, replaces `_executeAsk`'s безусловный переход
- [x] `2026-07-22T18:10:30Z` intro `RoleInstance#_dispatchAutonomousApprove` ← SV-23/D-134 автономный approve через тот же `EffectExecutor`/dry-run, что и SV-22
- [x] `2026-07-22T18:10:35Z` intro `RoleInstance#_buildDisputeSummary` ← материализует сводку спора в артефакт ask-узла
- [x] `2026-07-22T18:10:40Z` intro `RoleInstance#_readDisputeCodeSnippet` ← читает несколько строк кода вокруг спорного треда для сводки
- [x] `2026-07-22T18:15:00Z` decision ambiguous-signal-source=triageEntry.status∈{ambiguous,unclear} ← `thread-signal-classifier.ts` (TSK-142, вне Target Files этой фазы) не несёт статус «неоднозначно» в `ThreadDecision`; расширение симметрично уже существующему оверлею `disputed` из `status==='disagree'`
- [x] `2026-07-22T18:15:10Z` decision new_findings-trigger=findings.length>0 (не только дельта) ← постоянного «снимка прошлых находок» нет нигде в модели; любой проход с находками (полный или дельта) — новый относительно последнего видимого оператору состояния; совпадает с Exit-критерием тикета буквально
- [x] `2026-07-22T18:30:00Z` decision reviewer.role.test.ts:reply_needed обновлён ← ровно тот регресс, что предсказан в контексте фазы: 0 реальных thread-сигналов (vcs-мок не содержит discussion для треда t1) + 0 находок — легитимный новый кейс SV-23 auto-approve, не регресс для сохранения; assert заменён на `state==='done'`, добавлен `dryRun:true`
- [x] `2026-07-22T18:32:00Z` discovery `reviewer-disk-artifact.test.ts` :: «materializeReviewJson merges disk-artifact lens findings» падает (currentNode застревает на `node_synthesize`, не доходит до `node_ask`) — подтверждено git-stash A/B: падение идентично с диффом этой фазы и без него, к TSK-143 не относится
- [x] `2026-07-22T18:33:00Z` discovery `sdd verify`'s full `npm run test` gate также показывает неродственные пред-существующие падения (mr-stats CLI, vcs-worktree GC, ChatRouter /chat/stop, ChatApiClient integration) — другие модули, не затронутые Target Files этой фазы
- [x] `2026-07-22T18:36:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-22T18:36:10Z` ver `node --test services/agent-inbox/modules/inbox-roles/__tests__/role-instance.test.ts` → pass exit=0
- [x] `2026-07-22T18:36:20Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/role-instance.ts, services/agent-inbox/modules/inbox-roles/__tests__/reviewer.role.test.ts]; decisions: [gate-fn=shouldEscalateToOperator(reviewOutcome,threadSignals), triggers=new_findings|dispute|error_severity|ambiguous_classification, thread-signals-key=thread_triage_escalation_signals (module-level artifact constant, producer=gate_triage consumer=node_ask), auto-approve-path=_dispatchAutonomousApprove (reuses EffectExecutor+this._dryRun, transitions currentNode='done'), dispute-summary-injected-into=`${node.id}_question` artifact (merged, node.question() itself untouched — reviewer.role.ts stays out of Target Files)]; open: [pre-existing-test-failures: reviewer-disk-artifact.test.ts materializeReviewJson case + unrelated mr-stats/vcs-worktree/ChatRouter/ChatApiClient failures — confirmed unrelated to this phase via git-stash A/B, not fixed here (out of scope)]

#### P2

- [x] `2026-07-22T18:40:00Z` decision target-file=role-instance.test.ts (не escalation-gate.test.ts) ← P1 не выносил `shouldEscalateToOperator` в отдельный модуль (осталась в `role-instance.ts`); тикетное условие для нового файла ("если P1 вынес логику в отдельный модуль") не выполнено — файл уже существует (TSK-113/TSK-124), новые кейсы добавлены в него
- [x] `2026-07-22T18:40:30Z` decision integration-scenario=makeAskOnlyGraph (одноузловой синтетический `ask`-граф внутри `role-instance.test.ts`) ← держит BDD-сценарий 6 в границах Target Files этой фазы, не трогая `reviewer.role.test.ts`; P1-овский `reply_needed`-кейс уже проверяет тот же путь end-to-end через реальный граф `ReviewerRole` — этот кейс дополняет, не дублирует
- [x] `2026-07-22T18:41:00Z` decision dry-run-observed-via=setDryRunBroadcaster (`dry-run.ts`), паттерн D-116 из `thread-signal-classifier.test.ts` ← ассерт на реальную журнальную строку `DRY-RUN post→MR ...approve...`, не на внутреннее состояние
- [x] `2026-07-22T18:43:00Z` discovery `sdd verify`'s holistic `npm run test` gate воспроизводит те же 10 пред-существующих падений, что P1 уже подтвердил через git-stash A/B (`MrStatsCommand`, `vcs-worktree.cmd.error.test.ts`, `vcs-worktree.cmd.test.ts`, `gcStaleWorktrees`, `removeAllWorktrees`, `prepareMrWorktree`, `ChatRouter — POST /chat/stop`, `ChatApiClient integration`, `reviewer.role.ts — materializeReviewJson merges disk-artifact lens findings`, `mr-stats integration`) — ни один не касается `role-instance.test.ts`; список идентичен P1, новых падений эта фаза не внесла; не чинится здесь (вне Target Files этой фазы)
- [x] `2026-07-22T18:44:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-22T18:44:10Z` ver `node --test services/agent-inbox/modules/inbox-roles/__tests__/role-instance.test.ts` → pass exit=0
- [x] `2026-07-22T18:44:20Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/__tests__/role-instance.test.ts]; decisions: [target-file=role-instance.test.ts (existing, no new escalation-gate.test.ts — P1 kept the gate in role-instance.ts), unit-cases=5 (one per shouldEscalateToOperator branch, verbatim BDD names from §6), integration-case=auto-approve dry-run does not post to real MR (standalone makeAskOnlyGraph fixture + setDryRunBroadcaster, D-116 pattern), all-BDD-scenarios-covered=6/6 (5 unit in this phase + reply_needed dry-run in reviewer.role.test.ts from P1 as the ReviewerRole-graph companion)]; open: [pre-existing-test-failures: same 10 failures P1 confirmed via git-stash A/B (MrStatsCommand, vcs-worktree x3, ChatRouter, ChatApiClient, reviewer-disk-artifact.test.ts materializeReviewJson, mr-stats integration) — unchanged by this phase, not fixed (out of scope)]

#### Round close

- [x] `2026-07-22T18:46:00Z` sync agent-inbox+root
- [x] `2026-07-22T18:46:00Z` DONE

<!--/SECTION:EXECUTION_LOG-->
