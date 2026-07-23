# Task: TSK-141 — inbox-roles: авто-наблюдение за взятым MR + дебаунс + триггер дельта-ревью

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-141 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-roles | **Dependencies:** TSK-140 (реконсиляция — MR при (пере)старте уже корректно восстановлен, эта задача добавляет наблюдение ПОСЛЕ этого), TSK-109 (владеет `inbox-registry.ts`, где живёт `promoteReviewedHeadSha` — этот тикет добавляет вызывающую сторону, не меняет саму функцию)
- **Purpose:** MR, взятый в ревью, сегодня наблюдается только один раз при назначении — `RoleScheduler` не перечитывает контекст, пока оператор не ответит (`!existingInstance`-гард уже устранён TSK-140 для СТАРТА, но между тиками ничего не следит за новыми коммитами/ответами взятого MR). Реализует SV-19/SV-20/SV-21 (specs/agent-inbox §4.1.5): (1) на каждом тике для MR с активным инстансом проверяются новые коммиты (`headChanged` vs `lastReviewedHeadSha`) и новые заметки в моих тредах; (2) дебаунс — тихий период 5 минут БЕЗ новых событий по MR, сбрасывается на каждое новое событие, ПЕРЕД любым разбором; (3) коммиты без ответа мне → только счётчик, разбор не запускается; первый ответ мне после тихого периода → включается дельта-ревью — сегодня недостижимая ветка `node_delta_review`/`gate_delta`/`node_synthesize_delta` (`reviewer.role.ts:739-812`, владелец TSK-113), недостижимая потому, что `promoteReviewedHeadSha` (`inbox-registry.ts:149`) не имеет вызывающей стороны в serve. Этот тикет добавляет вызов `promoteReviewedHeadSha` по завершении КАЖДОГО разбора (полного и дельта), чтобы `_classifyHeadChanged` (`context-builder.ts:191-205`) видел актуальную базу сравнения на следующем тике.
- **Spec References:**
  - Requirements: [§4.1.5 «Авто-наблюдение, дебаунс, дельта-ревью, авто-резолюция»](../../../specs/agent-inbox/agent-inbox.spec.md#415-авто-наблюдение-дебаунс-дельта-ревью-авто-резолюция-refine--d-130d-135) (SV-19, SV-20, SV-21)
  - Decision: [D-130, D-131, D-132](../../../specs/agent-inbox/agent-inbox.spec.md#6-decision-log)
  - Consumer: `reviewer.role.ts` `preparePrepNode`/`node_delta_review` branch (`:582-599`, `:739-763`, владелец TSK-113); `RoleScheduler.tick()` (`role-scheduler.ts:145-290`, владелец TSK-113/расширяется TSK-140)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** Классификация сигналов треда (claim/commit/verified) и автономная реакция резолв/лайк/пинг — TSK-142 (этот тикет только доводит MR до точки «дельта-ревью запущен/не запущен», не решает что делать с находками разбора).

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

### P1 — impl (наблюдение + дебаунс + промоушен lastReviewedHeadSha)

- **Objective:** Новый модуль `mr-watch.ts`: (a) `detectMrEvents(mr, discussions, headChanged): MrEventSignal` — классифицирует состояние MR с уже активным инстансом на новые коммиты (`headChanged.kind !== 'none'`) и новые заметки в моих тредах (последняя заметка от НЕ меня новее `lastReviewedHeadSha`-момента); (b) `DebounceTracker` — per-MR тихий период (персистентная отметка `quietSince`/`lastEventAt` — часть артефакта MR в `reports/<mr>/`, НЕ глобальное состояние, консистентно с D-127); `shouldTriggerAnalysis(mr, now): boolean` — true только когда с последнего события прошло ≥5 минут (конфигурируемо, аналогично `pollingInterval`); новое событие сбрасывает отметку. `role-scheduler.ts`: `tick()` для каждого активного инстанса зовёт `detectMrEvents`+`shouldTriggerAnalysis` ПЕРЕД тем, как решать, тянуть ли `instance.step()` дальше — коммиты без моего ответа → только обновление счётчика (не запускает step); первый ответ мне → ждать тихий период → затем допустить обычный `step()` (граф сам разрулит `review_needed`/`delta` через `preparePrepNode`, если `promoteReviewedHeadSha` вызывался раньше). `reviewer.role.ts`/`role-instance.ts`: по завершении gate `gate_review_synthesis`/`gate_delta_synthesis` (успешный синтез, полный или дельта) — вызвать `promoteReviewedHeadSha(registry, mr, currentHeadSha)` (`inbox-registry.ts:149`, TSK-109), чтобы следующий тик видел актуальную базу.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/mr-watch.ts` (new)
  - `services/agent-inbox/modules/inbox-roles/role-scheduler.ts` (touched — `tick()` вызывает `detectMrEvents`/`shouldTriggerAnalysis` перед `step()`)
  - `services/agent-inbox/modules/inbox-roles/role-instance.ts` (touched — вызов `promoteReviewedHeadSha` после успешного gate синтеза, полного и дельта)
- **Inputs:** none
- **Exit:** typecheck pass; коммит без ответа мне НЕ запускает `step()` (только обновляет счётчик); первый ответ мне запускает `step()` только после ≥5 мин тишины; `promoteReviewedHeadSha` реально вызывается по завершении разбора (проверяемо на реальном MR через изменение `lastReviewedHeadSha` в реестре).

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-покрытие `detectMrEvents`/`DebounceTracker` (детерминированная логика на синтетических состояниях — коммит без ответа/ответ без коммита/оба/дебаунс-сброс) + integration-сценарий на РЕАЛЬНЫХ данных (D-116): read-only живой запрос (`getActionable`/`getDiscussions`, реальный токен оператора, БЕЗ записи) к текущему actionable-набору — найти MR с реальными открытыми тредами, прогнать `detectMrEvents` на реальном ответе GitLab, assert структура результата корректна на реальной форме данных (не синтетика). Отдельный сценарий: после симулированного успешного gate-синтеза (можно на изолированном тестовом MR/state dir, без реального live-прогона ~15-20 мин) — `promoteReviewedHeadSha` реально пишет `lastReviewedHeadSha` в реестр этого state dir, и следующий вызов `preparePrepNode` с тем же MR при новом коммите выбирает ветку `update-review`, а не `review_needed` — доказывает, что дельта-ревью структурно ДОСТИЖИМА (не гоняет полный ~15-20 мин live LLM-прогон дельты — это принадлежит будущему e2e, здесь доказывается только реконструированный путь до узла).
- **Rules:**
  - [testing-common](../../../ai/directives/testing/common.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/__tests__/mr-watch.test.ts` (new)
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References (SV-19…21, D-130…132).

**Feature:** Авто-наблюдение за взятым MR + дебаунс + достижимость дельта-ревью

**Scenario:** новые коммиты без ответа мне — только счётчик [`unit`]

- **Given** MR с новыми коммитами (`headChanged.kind='fast_forward'`) и без новой заметки от кого-либо в моих тредах с последнего разбора
- **When** `detectMrEvents` + `shouldTriggerAnalysis` вызываются на тике
- **Then** результат — обновлённый счётчик новых коммитов, `step()` НЕ вызывается

**Scenario:** первый ответ мне запускает дебаунс, не мгновенный разбор [`unit`]

- **Given** новая заметка от автора в моём треде появилась только что
- **When** `shouldTriggerAnalysis` вызывается сразу после появления заметки
- **Then** возвращает `false` (тихий период ещё не истёк)

**Scenario:** дебаунс сбрасывается на новое событие [`unit`]

- **Given** тихий период уже отсчитывает 4 минуты
- **When** приходит ещё одна новая заметка/коммит
- **Then** отметка тихого периода сбрасывается заново — 5 минут снова с этого момента

**Scenario:** тишина ≥5 минут допускает разбор [`unit`]

- **Given** с последнего события прошло ≥5 минут
- **When** `shouldTriggerAnalysis`
- **Then** возвращает `true`

**Scenario:** реальные обсуждения реального MR классифицируются корректно [`integration`]

- **Given** живой read-only запрос к actionable MR оператора с реальными тредами (без записи)
- **When** `detectMrEvents` применяется к реальному ответу `getDiscussions`
- **Then** результат структурно корректен (не падает, не даёт NaN/undefined на реальной форме данных GitLab)

**Scenario:** `promoteReviewedHeadSha` открывает путь к `update-review` [`integration`]

- **Given** изолированный state dir с завершённым (симулированным) `gate_delta_synthesis`/`gate_review_synthesis`
- **When** `promoteReviewedHeadSha` вызван, затем MR получает новый коммит и `preparePrepNode` вызывается снова
- **Then** выбранная ветка — `update-review`, не `review_needed` (сегодня недостижимо — `lastReviewedHeadSha` никогда не пишется)

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                           | Required by               |
| --------------------------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                                              | typescript-rules          |
| `node --test services/agent-inbox/modules/inbox-roles/__tests__/mr-watch.test.ts` | testing-common, node-test |

- **Task-specific Completion additions:** none beyond project baseline.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «коммит без ответа — только счётчик» → `mr-watch.test.ts` :: `commit without my-thread reply does not trigger step`
- Scenario «первый ответ — дебаунс, не мгновенно» → `mr-watch.test.ts` :: `first reply starts debounce, does not trigger immediately`
- Scenario «дебаунс сбрасывается» → `mr-watch.test.ts` :: `new event resets debounce timer`
- Scenario «тишина допускает разбор» → `mr-watch.test.ts` :: `quiet period elapsed allows analysis`
- Scenario «реальные обсуждения» → `mr-watch.test.ts` :: `classifies real live MR discussions`
- Scenario «promoteReviewedHeadSha открывает update-review» → `mr-watch.test.ts` :: `promoteReviewedHeadSha unlocks update-review branch`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-22, initial

#### P1

- [x] `2026-07-22T17:24:14Z` intro `detectMrEvents` ← SV-19 сигнал новых коммитов/ответов в моих тредах
- [x] `2026-07-22T17:24:14Z` intro `DebounceTracker` ← SV-20 персистентный тихий период per-MR (reports/<mr>/)
- [x] `2026-07-22T17:24:14Z` intro `MrEventSignal` ← типизированный результат detectMrEvents
- [x] `2026-07-22T17:24:14Z` discovery полный прогон `npm run test` (запускается `sdd verify` как gate) содержит 10 pre-existing падений вне Target Files этой фазы (mr-stats stub, vcs-worktree GC, ChatRouter/ChatApiClient integration, reviewer-disk-artifact.test.ts) — подтверждено `git stash` до правок этой фазы: идентичный набор падений без изменений P1; вне AX_PHASE_SCOPE_LOCK, не эта фаза правит эти файлы
- [x] `2026-07-22T17:24:14Z` ver `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-roles/mr-watch.ts services/agent-inbox/modules/inbox-roles/role-scheduler.ts services/agent-inbox/modules/inbox-roles/role-instance.ts` → pass exit=0
- [x] `2026-07-22T17:24:14Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-22T17:24:14Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/mr-watch.ts, services/agent-inbox/modules/inbox-roles/role-scheduler.ts, services/agent-inbox/modules/inbox-roles/role-instance.ts]; decisions: [debounce-storage=reports/<mr>/watch-debounce.json, gate-scope=node_prepare-only, promotion-gates=gate_review_synthesis+gate_delta_synthesis, candidateHeadSha=written-in-role-instance-before-promote]; open: [P2: mr-watch.test.ts unit+integration coverage per §6 Test Scenario Coverage]

#### P2

- [x] `2026-07-22T17:32:12Z` discovery `sdd verify` test-gate (`npm run test`) реально запускает `verify.sh`, который останавливается на ПЕРВОМ упавшем гейте (`|| exit 1`), а не RUN-ALL, как описано в директиве — инструментальное поведение, вне Target Files этой фазы, не правится
- [x] `2026-07-22T17:32:12Z` discovery `npm run test` внутри `sdd verify` падает на том же наборе из 10 pre-existing тестов, что и в P1 (mr-stats stub, vcs-worktree GC, ChatRouter/ChatApiClient integration, reviewer-disk-artifact.test.ts) — ни один из них не задет `mr-watch.test.ts`; typecheck и gennady lint внутри того же прогона прошли ✅ до этого гейта
- [x] `2026-07-22T17:32:12Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-22T17:32:12Z` ver `node --test services/agent-inbox/modules/inbox-roles/__tests__/mr-watch.test.ts` → pass exit=0
- [x] `2026-07-22T17:32:12Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/__tests__/mr-watch.test.ts]; decisions: [live-integration-scenario=ran-against-real-GitLab (GITLAB_PERSONAL_TOKEN present, no skip), promote-scenario=exercises-ReviewerRole.graph.node_prepare-directly (public surface, no export added to reviewer.role.ts)]; open: [same 10 pre-existing unrelated test failures already logged in TSK-140/P1 — reconfirmed identical in this phase's own `sdd verify` run, unrelated to mr-watch.ts/mr-watch.test.ts]

#### Round close

- [x] `2026-07-22T17:32:12Z` DONE

### Round 2 — 2026-07-22, audit-driven fix: F-01

#### P1 — re-run: fix: address audit finding F-01

- [x] `2026-07-22T17:39:53Z` discovery заявленный в F-01 `TypeError: ctx.store.promoteReviewedHeadSha is not a function` в текущем коде не воспроизводится напрямую — `_promoteReviewedHead` (`role-instance.ts:1023-1035`) делает `const entry = registry.entries[this.mr]; if (!entry) return;` ДО вызова `promoteReviewedHeadSha`, а `FakeStateStore.loadRegistry()` в этом файле всегда возвращала `{ version: 1, entries: {} }` — `entry` всегда `undefined`, ранний `return` срабатывает раньше вызова недостающего метода. Несмотря на это, добавление стабов — правильный, безопасный и явно затребованный фикс: `FakeStateStore` обязана удовлетворять полному контракту, который `_promoteReviewedHead` вызывает при других формах реестра (реальный `StateStore`), и делает тест устойчивым к будущим изменениям порядка проверок в `_promoteReviewedHead`
- [x] `2026-07-22T17:39:53Z` discovery сценарий (d) `materializeReviewJson merges disk-artifact lens findings` в этом файле падает с ДРУГОЙ, предсуществующей ошибкой — `AssertionError: expected 'node_ask', actual 'node_synthesize'` (gate `gate_review_synthesis.verify()` возвращает `pass:false`) — идентично воспроизведено на `git stash` (код до P1 Round 1 этого тикета): тот же assert-mismatch, без разницы. Это тот же самый pre-existing failure, что и задокументированный в Round 1 discovery («10 pre-existing падений ... reviewer-disk-artifact.test.ts») — не 11-й новый, а часть уже известных 10; вне `AX_PHASE_SCOPE_LOCK` этой фазы, не правится здесь
- [x] `2026-07-22T17:39:53Z` discovery буквальный `node --test services/agent-inbox/modules/inbox-roles/__tests__/reviewer-disk-artifact.test.ts` (без `--import tsx`) падает с `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]` на предсуществующей конструкторной parameter-property (`constructor(private readonly _stateDir: string)`, строка 24, вне Target Files этой фазы) — Node native strip-only не поддерживает эту синтаксическую форму; проект гоняет тесты через `npm run test` = `node --import tsx --test --experimental-test-module-mocks`, что и было использовано ниже для реальной проверки
- [x] `2026-07-22T17:39:53Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-22T17:39:53Z` ver `node --test services/agent-inbox/modules/inbox-roles/__tests__/mr-watch.test.ts` → pass exit=0
- [x] `2026-07-22T17:39:53Z` ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-roles/__tests__/reviewer-disk-artifact.test.ts` → pass 3/4 exit=1 (единственный fail — сценарий (d), pre-existing per discovery выше, идентичен `<sdd-path> verify` run)
- [x] `2026-07-22T17:39:53Z` ver `<sdd-path> verify services/agent-inbox/modules/inbox-roles/__tests__/reviewer-disk-artifact.test.ts services/agent-inbox/modules/inbox-roles/mr-watch.ts services/agent-inbox/modules/inbox-roles/role-scheduler.ts services/agent-inbox/modules/inbox-roles/role-instance.ts` → typecheck/lint/format pass; test gate fail 10 (same 10 pre-existing suites as Round 1: mr-stats stub×2, vcs-worktree GC cluster, ChatRouter stop, ChatApiClient integration, reviewer-disk-artifact scenario (d)) — no new failure, no `TypeError: promoteReviewedHeadSha` anywhere in output
- [x] `2026-07-22T17:39:53Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/__tests__/reviewer-disk-artifact.test.ts]; decisions: [FakeStateStore-methods-added=promoteReviewedHeadSha+saveRegistry (no-op stubs, real round-trip covered by mr-watch.test.ts), F-01-reproduction=not-reproduced-but-fix-applied-defensively]; open: [same 10 pre-existing unrelated test failures already logged in Round 1 — reconfirmed identical, includes reviewer-disk-artifact.test.ts scenario (d) which is pre-existing and unrelated to F-01]

#### Round close

- [x] `2026-07-22T17:39:53Z` DONE

<!--/SECTION:EXECUTION_LOG-->
