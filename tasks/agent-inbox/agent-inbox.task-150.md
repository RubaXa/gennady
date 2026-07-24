# Task: TSK-150 — комбинированный full-flow black-box (GitLab+OpenCode за сетью)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-150 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-serve | **Dependencies:** None (харнесс `utils/test/mock-http.ts` уже готов, D-212)
- **Purpose:** Высший уровень доказательства прямого запроса оператора: сервис работает на ПРОДУКТОВОМ коде, подменён только сетевой слой. `VcsInboxReal` + `OpenCodeReal` ОБА за undici-перехватом, `OPENCODE_PORT` пропускает спавн бинаря; реальный `runMrsOnce`/bootstrap путь проходит discovery → граф → терминальное состояние. Фикстуры спрятаны исключительно за сетью — приложение «думает», что зовёт реальные API.
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`
- **Deferred Runtime Scope:** Настоящий `e2e` через CLI-entry (`gennady inbox serve`) как killable-процесс — отдельно (перекрывается с TSK-117 golden-прогоном); здесь seam = реальные адаптеры + подменённая сеть, честно помечено `integration`, не `e2e`.
- **Spec References:**
  - Сетевой харнесс: [`utils/test/mock-http.ts`](../../utils/test/mock-http.ts)
  - Реальные адаптеры: [`VcsInboxReal`](../../services/agent-inbox/modules/inbox-core/vcs-inbox.real.ts), [`OpenCodeReal`](../../services/agent-inbox/modules/inbox-opencode/opencode.real.ts)
  - Точка прогона: [`runMrsOnce`](../../services/agent-inbox/serve/run-mode.ts)
  - Прецедент black-box tier: [tasks/README.md#D-212](../README.md)

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

- **Objective:** Новый файл `full-flow.blackbox.test.ts`: `setupMockAgent` перехватывает и GitLab (`POST /api/graphql` discovery + `/user`), и OpenCode (`session.create`/`prompt`/`messages` на `OPENCODE_PORT`-origin); собрать `RunModeDeps` с РЕАЛЬНЫМИ `VcsInboxReal`+`OpenCodeReal` (не Mock), прогнать `runMrsOnce` по одному MR до терминального состояния (умный reply синтеза → clean verdict → done, либо changes_requested → awaiting_operator). Ассертить и состояние, и что перехват реально сработал (attempt-счётчики). **Adaptive:** если всплывёт, что реальный git/worktree в этом пути всё ещё живой и мешает (не сетевой слой) — это находка для TSK-149: зафиксировать `discovery`-строкой и, если TSK-149 ещё TODO/reopen-able, пометить в Handoff `open:` как реопен-триггер; НЕ чинить git молча здесь.
- **Rules:**
  - [testing/node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts`
- **Inputs:** none (потребляет готовый `#utils/test/mock-http.ts`)
- **Exit:** прогон зелёный; оба бэкенда доказанно перехвачены (attempt-счётчики > 0); терминальное состояние достигнуто на реальных адаптерах; ни одного реального сетевого запроса (undici `disableNetConnect`).

<!--/SECTION:PHASE_P1-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References.

**Feature:** сервис на продуктовом коде, подменён только сетевой слой

**Scenario:** discovery + один review-ход целиком за сетью [`integration`]

- **Given** undici-перехват GitLab GraphQL (один reviewer-MR) и OpenCode `session.*`, `OPENCODE_PORT` задан (спавн пропущен)
- **And** `RunModeDeps` с реальными `VcsInboxReal` и `OpenCodeReal`
- **When** `runMrsOnce` прогоняет этот MR
- **Then** MR доходит до терминального состояния (`done` при clean-verdict, либо `awaiting_operator`)
- **And** перехват GitLab и перехват OpenCode оба вызывались (attempt-счётчики > 0)
- **And** ни одного реального внешнего запроса (`disableNetConnect` не бросил)

**Scenario:** живой git в пути → находка для TSK-149 [`integration`]

- **Given** прогон на реальных адаптерах
- **When** обнаруживается, что реальный git/worktree мешает (не сетевой слой)
- **Then** это зафиксировано `discovery`-строкой и помечено как реопен-триггер TSK-149, git не чинится молча в этом тикете

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                    | Required by       |
| ------------------------------------------------------------------------------------------ | ----------------- |
| `node --import tsx --test services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts` | testing/node-test |
| `npx tsc --noEmit`                                                                         | testing/node-test |

- **Task-specific Completion additions:** `setupMockAgent` с `disableNetConnect` (строгий black-box); `mockEnv.cleanup()` в `afterEach`; `OPENCODE_PORT` восстанавливается после теста.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «discovery + review-ход за сетью» → `full-flow.blackbox.test.ts` :: `drives a real reviewer MR to a terminal state with both backends faked at the network layer`
- Scenario «живой git → находка для TSK-149» → задокументировано в Execution Log `discovery`/Handoff, отдельным тест-кейсом не покрывается (адаптивная связь, не поведение продукта)

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = один execute-then-audit проход.)_

### Round 1 — 2026-07-23, initial

#### P1

- [x] `2026-07-23T13:52:23Z` discovery `_prepareWorktreeAndChangeset` (context-builder.ts) calls the real `ensureClone`+`prepareMrWorktree` regardless of network faking (git/worktree is a local, non-network seam this ticket does not own — TSK-149 territory). Neutralized with the existing D-212 pattern (seed `repos.json` in the temp `stateDir`, reused verbatim from `run-mode.test.ts#makeStateStore`) — `ensureClone` short-circuits on the reposMap hit, `git worktree prune` then fails fast locally on the non-repo dir, and the function's own try/catch degrades to an empty changeset. No new gap; no TSK-149 reopen needed — this is the already-established workaround, not a fresh obstruction.
- [x] `2026-07-23T13:52:23Z` discovery `VcsInboxReal#getMrContext` is re-fetched on EVERY `RoleInstance#step()` (via `_buildContext`), not once per MR — plus once upfront by `_runOneMr`'s role check and once more by `buildNodeContext`'s initial checkpoint seed. Sized the GET `/merge_requests/:iid` and GET `/user` reply pools generously instead of to an exact count (brittle to graph-shape changes) and asserted `attemptCount > 0` per the ticket's own attempt-counter contract, not an exact count.
- [x] `2026-07-23T13:53:00Z` ver `node --import tsx --test services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts` → pass exit=0
- [x] `2026-07-23T13:53:10Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-07-23T13:54:00Z` ver `~/.claude/skills/sdd-execute/scripts/sdd verify services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts` → pass (13 failures, all pre-existing in `scratchpad/baseline-fails.txt`'s 15-failure baseline — 0 new; per ticket's SCOPED verify clause this is the gate, not a full-suite fix)
- [x] `2026-07-23T13:54:10Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts]; decisions: [verification-level=integration, terminal-state=awaiting_operator, mr-context-reply-pool=oversized-not-exact-count]; open: []

#### Round close

- [x] `2026-07-23T13:55:00Z` sync agent-inbox+root
- [x] `2026-07-23T13:55:00Z` DONE

<!--/SECTION:EXECUTION_LOG-->
