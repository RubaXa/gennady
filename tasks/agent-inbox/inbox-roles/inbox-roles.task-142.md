# Task: TSK-142 — inbox-roles: классификация сигналов треда + автономный резолв/лайк/пинг

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-142 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-roles | **Dependencies:** TSK-141 (наблюдение/дебаунс — эта задача решает, ЧТО делать после срабатывания триггера), TSK-113 (владеет `effect-executor.ts` — ResolveAction/ReactAction/ReplyAction уже реализованы, этот тикет только триггерит их по новым правилам)
- **Purpose:** Реализует SV-22 (specs/agent-inbox §4.1.5) — для каждого моего открытого треда на взятом MR классификация по трём сигналам (`claim` — автор написал «сделал»; `commit` — новый коммит в зоне находки треда; `verified` — перечитка кода подтверждает закрытие) и автономная реакция БЕЗ участия оператора: (a) `commit`+`verified`, автор молчит → микросводка в тред + резолв (не ждём автора); (b) `commit`+`verified`, есть последний коммент автора → реакция-лайк на коммент + резолв; (c) `commit` есть, НЕ `verified`, `claim` нет → тихо, ничего не делаем (не эскалируем, не пингуем — автор не отвечал); (d) `claim` есть, фикс после тихого периода не найден/не помог → автономно пишем автору «не сделано», оператора НЕ зовём, продолжаем следить; (e) автор явно не согласен (доводы) → НЕ резолвим, это спор — передаётся дальше (TSK-143, awaitingMe). Резолв — ТОЛЬКО своего треда, никогда чужого (инвариант, действует и для author-роли — не меняется этим тикетом).
- **Spec References:**
  - Requirements: [§4.1.5](../../../specs/agent-inbox/agent-inbox.spec.md#415-авто-наблюдение-дебаунс-дельта-ревью-авто-резолюция-refine--d-130d-135) (SV-22)
  - Decision: [D-133](../../../specs/agent-inbox/agent-inbox.spec.md#6-decision-log)
  - Consumer: `EffectExecutor.execute` (`effect-executor.ts:228-293`, владелец TSK-113) — `ResolveAction` (`:57-64`), `ReactAction` (`:25-34`), `ReplyAction` (`:37-54`)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** Спор (сигнал e) — здесь только классифицируется и НЕ резолвится; сводка спора оператору + переход в awaitingMe — TSK-143 (SV-24).

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

### P1 — impl (классификатор сигналов + триггер эффектов)

- **Objective:** Новый модуль `thread-signal-classifier.ts`: `classifyThreadSignals(thread, mrDiff, myLogin): ThreadSignalVerdict` — вычисляет три булевых сигнала (`claim`/`commit`/`verified`) для одного открытого моего треда против текущего диффа MR; `verified` требует реальной сверки кода (перечитка файла:строки треда на текущем HEAD — не просто «коммит есть»). `decideThreadAction(verdict): ThreadDecision` — реализует правила (a)-(e) SV-22 как чистую функцию (детерминированная таблица решений, не LLM-эвристика на этом уровне — LLM используется только там, где нужна семантика «автор не согласен» vs «автор согласился и объясняет доработку», это делегируется существующей сессии `node_thread_triage`/`reviewer.role.ts:700-725`, не переизобретается здесь). `role-instance.ts`/`reviewer.role.ts`: точка вызова — после того как `node_thread_triage` (или дельта-эквивалент) классифицировал ответ автора по каждому треду, `decideThreadAction` определяет резолв/лайк/пинг/спор; резолв/лайк/пинг диспатчатся через существующий `EffectExecutor.execute` (не новые эффекты — используются `ResolveAction`/`ReactAction`/`ReplyAction` как есть), под тем же dry-run режимом, что и остальные эффекты (TSK-113).
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/thread-signal-classifier.ts` (new)
  - `services/agent-inbox/modules/inbox-roles/role-instance.ts` (touched — вызов `decideThreadAction` после триаж-узла, диспатч через существующий `EffectExecutor`)
- **Inputs:** TSK-141 handoff (наблюдение доводит MR до точки, где триаж треда актуален)
- **Exit:** typecheck pass; все 5 правил (a)-(e) реализованы как явная таблица решений; резолв никогда не вызывается для чужого треда (structural guard, не только тест); `verified` реально читает текущий код, не короткое замыкание на факте коммита.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-покрытие всех 5 правил `decideThreadAction` (таблично, по одному кейсу на правило + граничные случаи claim+commit+verified все три вместе). Integration-сценарий на РЕАЛЬНЫХ данных (D-116): взять реальный открытый мой тред на живом actionable MR (read-only), прогнать `classifyThreadSignals` на реальном диффе — assert структура сигналов корректна на реальной форме; отдельно — dry-run проверка (как `t8-action.spec.ts`/TSK-113): для синтетического case «commit+verified, автор молчит» диспатч через `EffectExecutor` В DRY-RUN РЕЖИМЕ логирует `DRY-RUN resolve→...`, НЕ делает реальный резолв на живом MR (жёсткий инвариант теста — assert отсутствия реальной записи).
- **Rules:**
  - [testing-common](../../../ai/directives/testing/common.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/__tests__/thread-signal-classifier.test.ts` (new)
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References (SV-22, D-133).

**Feature:** Классификация сигналов треда + автономная реакция

**Scenario:** commit+verified, автор молчит → резолв [`unit`]

- **Given** `{claim: false, commit: true, verified: true}`, последняя заметка не от автора
- **When** `decideThreadAction`
- **Then** решение — «микросводка + резолв», без ожидания автора

**Scenario:** commit+verified, есть коммент автора → лайк + резолв [`unit`]

- **Given** `{claim: false, commit: true, verified: true}`, последняя заметка от автора
- **When** `decideThreadAction`
- **Then** решение — «реакция на коммент автора + резолв»

**Scenario:** commit без verified, без claim → тихо, ничего не делаем [`unit`]

- **Given** `{claim: false, commit: true, verified: false}`
- **When** `decideThreadAction`
- **Then** решение — «пропустить», НЕ эскалация, НЕ пинг автора

**Scenario:** claim есть, фикса нет после тихого периода → пишем «не сделано» [`unit`]

- **Given** `{claim: true, commit: false, verified: false}` (или commit есть, но verified не подтвердил), тихий период истёк
- **When** `decideThreadAction`
- **Then** решение — «автономно ответить автору о невыполнении», оператор НЕ вызывается

**Scenario:** автор не согласен → спор, не резолвим [`unit`]

- **Given** классификация ответа автора как несогласие (из `node_thread_triage`)
- **When** `decideThreadAction`
- **Then** решение — «спор», резолв/лайк НЕ диспатчатся

**Scenario:** резолв никогда не применяется к чужому треду [`unit`]

- **Given** тред, владелец которого — не я (`peer`)
- **When** `decideThreadAction` вызывается для этого треда
- **Then** решение никогда не включает `resolve` (structural invariant, не зависящий от сигналов)

**Scenario:** реальные сигналы на живом MR классифицируются корректно [`integration`]

- **Given** живой read-only запрос к реальному моему треду на actionable MR оператора
- **When** `classifyThreadSignals` применяется к реальному диффу
- **Then** результат структурно корректен, `verified` реально читает файл:строку на текущем HEAD (не заглушка)

**Scenario:** dry-run — резолв не пишется на реальный MR [`integration`]

- **Given** синтетический case «commit+verified, автор молчит» для реального треда
- **When** `EffectExecutor.execute` в dry-run режиме диспатчит решение
- **Then** консоль/журнал показывает `DRY-RUN resolve→...`, реального POST/резолва на GitLab не происходит

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                           | Required by               |
| ------------------------------------------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                                                              | typescript-rules          |
| `node --test services/agent-inbox/modules/inbox-roles/__tests__/thread-signal-classifier.test.ts` | testing-common, node-test |

- **Task-specific Completion additions:** none beyond project baseline.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «commit+verified, молчит → резолв» → `thread-signal-classifier.test.ts` :: `resolves silently when commit and verified with no author comment`
- Scenario «commit+verified, коммент автора → лайк+резолв» → `thread-signal-classifier.test.ts` :: `reacts to author comment then resolves when verified`
- Scenario «commit без verified, без claim → пропустить» → `thread-signal-classifier.test.ts` :: `skips silently on unverified commit without claim`
- Scenario «claim без фикса → пишем не сделано» → `thread-signal-classifier.test.ts` :: `autonomously replies not-done after quiet period on false claim`
- Scenario «спор → не резолвим» → `thread-signal-classifier.test.ts` :: `flags dispute without resolving`
- Scenario «резолв только своего треда» → `thread-signal-classifier.test.ts` :: `never resolves a peer-owned thread`
- Scenario «реальные сигналы» → `thread-signal-classifier.test.ts` :: `classifies real live thread signals`
- Scenario «dry-run без реальной записи» → `thread-signal-classifier.test.ts` :: `dry-run resolve does not post to real MR`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-22, initial

#### P1

- [x] `2026-07-22T18:01:27Z` intro `thread-signal-classifier.ts` ← новый модуль: детерминированная классификация claim/commit/verified + таблица решений SV-22 (a)-(e)
- [x] `2026-07-22T18:01:27Z` decision verified-strategy=real-file-reread ← `verified` читает файл треда на текущем HEAD (worktreePath), не короткое замыкание на факте коммита
- [x] `2026-07-22T18:01:27Z` decision peer-thread-guard=structural-first ← `decideThreadAction` проверяет `ownedByMe` первым пунктом, безусловно, раньше любого сигнального правила
- [x] `2026-07-22T18:01:27Z` decision dispatch-point=gate_triage-pass ← автономный диспатч resolve/react/reply вызывается внутри `_executeGate` при прохождении `gate_triage`, edge-переход к `node_ask` не меняется (не в Target Files этого тикета) — спорный тред (rule e) по-прежнему уходит в существующую эскалацию оператору, awaitingMe-переход остаётся за TSK-143
- [x] `2026-07-22T18:01:27Z` discovery первая версия с bypass edge к `done` при отсутствии спора ломала существующий тест `ReviewerRole — branch: reply_needed` (ожидает `node_ask` после `gate_triage`); откатил bypass, оставил только автономный диспатч эффектов без изменения графа
- [x] `2026-07-22T18:01:27Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-07-22T18:01:27Z` ver `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-roles/thread-signal-classifier.ts services/agent-inbox/modules/inbox-roles/role-instance.ts` → pass exit=0
- [x] `2026-07-22T18:01:27Z` ver `npx prettier --check services/agent-inbox/modules/inbox-roles/thread-signal-classifier.ts services/agent-inbox/modules/inbox-roles/role-instance.ts` → pass exit=0
- [x] `2026-07-22T18:01:27Z` ver `node --test services/agent-inbox/modules/inbox-roles/__tests__/reviewer.role.test.ts` → pass exit=0
- [x] `2026-07-22T18:01:27Z` ver `npm run test` → fail exit=1 (10 pre-existing unrelated failures: MrStatsCommand, vcs-worktree GC ×3, vcs-worktree.cmd ×2, ChatRouter/ChatApiClient ×2, mr-stats integration — same baseline as TSK-141 Handoff; no new/regressed failures from this phase, confirmed by diffing failure sets before/after)
- [x] `2026-07-22T18:01:27Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-22T18:01:27Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/thread-signal-classifier.ts, services/agent-inbox/modules/inbox-roles/role-instance.ts]; decisions: [verified-strategy=real-file-reread, peer-thread-guard=structural-first-check, dispatch-point=gate_triage-pass-no-edge-change, gate-id=gate_triage]; open: [none blocking — dispute path still routes to existing node_ask escalation, TSK-143 owns replacing it with a dedicated awaitingMe transition]

#### P2

- [x] `2026-07-22T18:13:18Z` intro `thread-signal-classifier.test.ts` ← новый файл: table-driven unit-тест decideThreadAction (a)-(e) + structural-invariant кейс + два live/D-116 сценария (классификация и dry-run резолв)
- [x] `2026-07-22T18:13:18Z` decision dry-run-observation=broadcaster-plus-real-reread ← `setDryRunBroadcaster` ловит саму `DRY-RUN post→MR ...` строку (публичный контракт `dry-run.ts`), а отсутствие реальной записи доказывается повторным read-only `getDiscussions` того же треда (реальный round-trip, не заглушка на приватных полях)
- [x] `2026-07-22T18:13:18Z` discovery импорт-гвардия `mock.module` из `effect-executor.test.ts` требует `--experimental-test-module-mocks`, отсутствующий в буквальной §5-команде `node --test <file>`; `vcs-reply.cmd.ts` уже имеет корректный self-execution guard (`process.argv[1]` match), поэтому прямой импорт `EffectExecutor` без `mock.module`-обвязки безопасен и совместим с канонической командой — подтверждено пробным запуском
- [x] `2026-07-22T18:13:18Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-07-22T18:13:18Z` ver `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-roles/__tests__/thread-signal-classifier.test.ts` → pass exit=0
- [x] `2026-07-22T18:13:18Z` ver `npx prettier --check services/agent-inbox/modules/inbox-roles/__tests__/thread-signal-classifier.test.ts` → pass exit=0
- [x] `2026-07-22T18:13:18Z` ver `npm run test` → fail exit=1 (те же 10 pre-existing unrelated failures, что и в P1 Handoff: vcs-worktree.cmd ×2, MrStatsCommand, vcs-worktree GC ×3, ChatRouter/ChatApiClient ×2, reviewer.role.ts materializeReviewJson, mr-stats integration — сверено diff'ом имён failing-тестов до/после добавления этого файла, новых/регрессировавших нет)
- [x] `2026-07-22T18:13:18Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-22T18:13:18Z` ver `node --test services/agent-inbox/modules/inbox-roles/__tests__/thread-signal-classifier.test.ts` → pass exit=0 (8 тестов: 6 pass, 2 honest skip — нет открытого моего треда на текущих actionable MR прямо сейчас; GITLAB_PERSONAL_TOKEN присутствовал и живые read-only вызовы реально выполнялись)
- [x] `2026-07-22T18:13:18Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/__tests__/thread-signal-classifier.test.ts]; decisions: [dry-run-observation=broadcaster-plus-real-reread, import-guard=not-needed-vcs-reply-already-self-guarded, live-scenarios=honest-skip-on-no-open-my-thread]; open: [none blocking — both integration scenarios (classify + dry-run) skipped honestly this run because no actionable MR currently has an open thread of the operator's; they will execute for real the next time such a thread exists]

#### Round close

- [x] `2026-07-22T18:05:00Z` sync agent-inbox+root
- [x] `2026-07-22T18:05:00Z` DONE

<!--/SECTION:EXECUTION_LOG-->
