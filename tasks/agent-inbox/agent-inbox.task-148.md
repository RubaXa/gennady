# Task: TSK-148 — детерминированный тест SV-19 commit-only-hold

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-148 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-roles | **Dependencies:** TSK-147 (даёт настоящий git-worktree, чтобы `headChanged='fast_forward'` был реальным, а не сеяным)
- **Purpose:** Закрыть честную дыру, явно оставленную в D-212: SV-19 «новый коммит без ответа в моём треде → не разбирать (hold)» сейчас покрыт только live/integration путём (D-210), потому что `hasNewCommit` рождается лишь из живого git-worktree через `_classifyHeadChanged`. Дать детерминированный тест `RoleScheduler#_shouldAdvanceInstance`, дополняющий существующий `role-scheduler.observation.test.ts` (там уже SV-20/SV-21/default/D-138).
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`
- **Deferred Runtime Scope:** None
- **Spec References:**
  - Гейт наблюдения: [`_shouldAdvanceInstance`](../../services/agent-inbox/modules/inbox-roles/role-scheduler.ts) (SV-19/20/21)
  - Классификатор событий: [`detectMrEvents`](../../services/agent-inbox/modules/inbox-roles/mr-watch.ts)
  - Существующий набор: [role-scheduler.observation.test.ts](../../services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.observation.test.ts)
  - Прецедент дыры: [tasks/README.md#D-212](../README.md), фикс D-138: [tasks/README.md#D-210](../README.md)

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | test | —    | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — test

- **Objective:** Добавить в `role-scheduler.observation.test.ts` кейс: у меня ЕСТЬ тред (непустой `{my:true}`), свежего чужого ответа нет, но head реально сдвинулся (`fast_forward` через фикстуру TSK-147, `worktreePath` пробрасывается так, чтобы `buildNodeContext` дал `headChanged='fast_forward'`) → `_shouldAdvanceInstance` возвращает `false` (SV-19 hold). Не ослаблять существующие кейсы. **Adaptive:** если Handoff TSK-147 сообщил «git-in-test нельзя» — вместо теста внести в этот файл явный `it.skip` с причиной-ссылкой на live-путь D-210 (не молчаливый пропуск) и зафиксировать в Execution Log как `discovery`.
- **Rules:**
  - [testing/node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.observation.test.ts`
- **Inputs:** TSK-147 handoff (`#utils/test/git-fixture.ts`)
- **Exit:** новый кейс зелёный (или обоснованный `skip`); весь файл проходит; commit-only-hold больше не «только live».

<!--/SECTION:PHASE_P1-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References.

**Feature:** гейт непрерывного наблюдения — SV-19

**Scenario:** новый коммит без ответа держит тик [`integration`]

- **Given** у меня есть тред на MR (непустой `{my:true}`), в нём нет чужого ответа после `since`
- **And** head сдвинулся вперёд (реальный `fast_forward` из git-фикстуры) → `hasNewCommit` истинно
- **When** вызван `_shouldAdvanceInstance`
- **Then** результат `false` (разбор не запускается — ждём ответа, а не голого коммита)
- **And** окно дебаунса НЕ вооружается (commit-only не армит — только reply)

**Scenario:** git-фикстура недоступна → честный skip [`integration`]

- **Given** TSK-147 зафиксировал непригодность git-в-тестах в этом окружении
- **When** пишется покрытие SV-19
- **Then** кейс помечен `skip` с причиной и ссылкой на live-путь D-210, а не удалён/замолчан

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                          | Required by       |
| ---------------------------------------------------------------------------------------------------------------- | ----------------- |
| `node --import tsx --test services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.observation.test.ts` | testing/node-test |

- **Task-specific Completion additions:** прогон должен завершаться (не виснуть) — `repos.json` в temp-stateDir обязателен (иначе `buildNodeContext` уходит в реальный сетевой clone, см. D-212).

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «новый коммит без ответа держит тик» → `role-scheduler.observation.test.ts` :: `SV-19: a new commit with no reply in my thread holds the tick`
- Scenario «git-фикстура недоступна → skip» → `role-scheduler.observation.test.ts` :: `SV-19: documented skip when git-in-test is unavailable` (только если сработала Adaptive-ветка)

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = один execute-then-audit проход.)_

### Round 1 — 2026-07-23, initial

#### P1

- [x] `2026-07-23T13:33:45Z` decision adaptive-mode=real-test ← TSK-147 подтвердил git-in-test быстрым (~100-180ms/call); пишем реальный SV-19-кейс, вторую (skip) BDD-ветку не пишем — она применима только при непригодности git, которая не сработала
- [x] `2026-07-23T13:33:45Z` decision wiring=fixture-doubles-as-origin ← `createGitFixture` даёт единственный worktree без `origin`; `buildNodeContext`→`prepareMrWorktree` жёстко фетчит `origin merge-requests/<iid>/head`, поэтому фикстурный репозиторий добавлен себе же в `origin` (fetch-from-self — локальное чтение, не сеть) и получил `refs/merge-requests/7/head`; `repos.json` указывает на путь фикстуры напрямую (без реального clone), `inbox-registry.json` сеет `lastReviewedHeadSha=baseSha` для честного `_classifyHeadChanged` → `fast_forward`
- [x] `2026-07-23T13:33:45Z` discovery `resolveVcsContext` (внутри `_prepareWorktreeAndChangeset`) требует `GITLAB_PERSONAL_TOKEN` даже когда `repos.json` покрывает clone — токен выставлен только на время теста и восстановлен в `finally`
- [x] `2026-07-23T13:33:45Z` ver `node --import tsx --test services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.observation.test.ts` → pass exit=0
- [x] `2026-07-23T13:33:45Z` ver `<sdd-path> verify services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.observation.test.ts` → pass (12 pre-existing failing suites unrelated to this file: MrStatsCommand, vcs-worktree.cmd tests, gcStaleWorktrees, removeAllWorktrees, prepareMrWorktree, ChatRouter, ChatApiClient integration, PhaseTelemetry, reviewer.role.ts, selectDirective snapshot, mr-stats integration — per D-214 scoped gate, zero NEW failures beyond baseline)
- [x] `2026-07-23T13:33:45Z` ver `tsc --noEmit` → pass exit=0
- [x] `2026-07-23T13:33:45Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.observation.test.ts]; decisions: [adaptive-mode=real-test, wiring=fixture-doubles-as-origin, SV-19-coverage=real-not-skip]; open: []

#### Round close

- [x] `2026-07-23T13:45:00Z` sync agent-inbox+root
- [x] `2026-07-23T13:45:00Z` DONE

<!--/SECTION:EXECUTION_LOG-->
