# Task: TSK-154 — mr-stats тесты: герметичность + корректный gating

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-154 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** N/A (`cli/cmd/mr-stats` + `services/mr-stats`) | **Dependencies:** None
- **Purpose:** 2 red-теста mr-stats (недавняя фича, d76451e/TSK-139) — test-side: (1) `mr-stats.cmd.test.ts` ждёт старый стаб-контракт (`--help` → `ok:true`; URL → «not implemented»), тогда как стаб заменён реальным пайплайном (glab→worktree→diff→classify→cloc→jscpd); (2) `mr-stats.integration.test.ts` падает `TypeError: ctx.allTools` — синхронная оценка `skip` в опциях `it()` до async `before()`. Плюс тесты не герметичны (нужны живые glab-auth/jscpd/сеть). Сделать deterministic-часть зелёной и корректно гейтить сетевую.
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** Сетевой прогон mr-stats против реального MR (live glab + jscpd) — гейтится skip-when-absent, не выполняется в hermetic-прогоне.
- **Spec References:**
  - `cli/cmd/mr-stats/mr-stats.cmd.ts` (`MrStatsOutcome`: `{ok:true,report}` | `{ok:false,exitCode,message}` — нет `{ok:true,message}`)
  - `services/mr-stats/mr-stats.types.ts`
  - Прецедент: [tasks/README.md#D-215](../README.md)

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

- **Objective:** (1) `mr-stats.cmd.test.ts`: кейс `--help` — ассертить актуальный контракт `{ok:false, exitCode:0}` (тип не допускает `{ok:true,message}`). (2) Кейс «URL» — НЕ бьёт в реальный glab/сеть: либо замокать seam (`execFileSync('glab',…)`/`createVcsClient`), либо перенести сценарий в integration с skip-when-absent; выбрать test-only путь по умолчанию, продуктовый код `mr-stats.cmd.ts` менять только при явной необходимости инъекции seam (тогда `decision`-строка). (3) `mr-stats.integration.test.ts`: починить sync/async баг — вычислять skip лениво в теле теста (`if (!ctx.allTools) { t.skip(); return; }`), не в опциях `it()`; тест должен ЧИСТО скипаться при отсутствии glab-auth/jscpd/сети, а не падать. **Adaptive:** если сделать URL-кейс герметичным без инъекции seam невозможно — честно зафиксировать `discovery` и оставить его gated-integration (skip), не фабриковать прохождение против несуществующей сети.
- **Rules:**
  - [testing/node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/mr-stats/__tests__/mr-stats.cmd.test.ts`
  - `services/mr-stats/__tests__/mr-stats.integration.test.ts`
- **Inputs:** none
- **Exit:** deterministic-кейсы зелёные; сетевые — чисто skip при отсутствии инструментов (не fail); продуктовый код mr-stats не тронут (или узкая инъекция с `decision`-логом); 0 новых падений против baseline.

<!--/SECTION:PHASE_P1-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References.

**Feature:** mr-stats тесты герметичны или корректно гейтятся

**Scenario:** --help отражает актуальный outcome-контракт [`unit`]

- **Given** `mr-stats --help`
- **When** прогоняется команда
- **Then** `outcome.ok === false && outcome.exitCode === 0` (тип `MrStatsOutcome` не имеет `{ok:true,message}`)

**Scenario:** integration чисто скипается без инструментов [`integration`]

- **Given** отсутствуют glab-auth/jscpd/сеть
- **When** регистрируется integration-suite
- **Then** кейсы скипаются лениво в теле (не `TypeError` на `ctx.allTools`), прогон не падает

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                              | Required by       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `node --import tsx --test --experimental-test-module-mocks cli/cmd/mr-stats/__tests__/mr-stats.cmd.test.ts services/mr-stats/__tests__/mr-stats.integration.test.ts` | testing/node-test |
| `npx tsc --noEmit`                                                                                                                                                   | testing/node-test |

- **Task-specific Completion additions:** SCOPED gate (D-214); сетевые кейсы гейтятся skip-when-absent (не удаление покрытия — задокументировать `insight`/`decision`).

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «--help контракт» → `mr-stats.cmd.test.ts` :: `MrStatsCommand` (help case)
- Scenario «integration чистый skip» → `mr-stats.integration.test.ts` :: `mr-stats integration`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-23, initial

#### P1

- [x] `2026-07-23T14:27:31Z` decision `url-case=mocked-seam` ← пайплайн после d76451e гейтит на `isToolAvailable('glab')` (`services/mr-stats/line-counter.ts`) раньше любого сетевого/worktree-обращения; замокан именно этот seam (`mock.module` с `--experimental-test-module-mocks`, spread реальных exports + override `isToolAvailable`), продуктовый код не тронут — сценарий герметичен, injection seam не понадобился
- [x] `2026-07-23T14:27:31Z` discovery `sdd verify` авто-обнаружение зовёт несуществующие npm-скрипты `typecheck`/`test:coverage` (в package.json — `type-check`, `test:coverage` отсутствует вовсе) — pre-existing infra-gap вне Target Files этой фазы; SCOPED gate (D-214) из диспатча явно сузил гейт до `npx tsc --noEmit` + канонической `node --test` команды, поэтому не чинил (H_OUT_OF_PHASE_WRITE risk)
- [x] `2026-07-23T14:27:31Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-07-23T14:27:31Z` ver `node --import tsx --test --experimental-test-module-mocks cli/cmd/mr-stats/__tests__/mr-stats.cmd.test.ts services/mr-stats/__tests__/mr-stats.integration.test.ts` → pass exit=0
- [x] `2026-07-23T14:27:31Z` DONE
      **Handoff →** artifacts: [cli/cmd/mr-stats/__tests__/mr-stats.cmd.test.ts, services/mr-stats/__tests__/mr-stats.integration.test.ts]; decisions: [url-case=mocked-seam, product-code=untouched, integration-skip=lazy-in-body]; open: []

<!--/SECTION:EXECUTION_LOG-->
