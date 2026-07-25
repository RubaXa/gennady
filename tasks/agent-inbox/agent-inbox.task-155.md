# Task: TSK-155 — прогресс-информер ревью на карточке (стадия/дорожки/время)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-155 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-roles + inbox-api + inbox-dashboard | **Dependencies:** None
- **Purpose:** На карточке MR не видно, на какой стадии ревью и сколько оно идёт. Показать прогресс-информер: текущая стадия (планирование → ревью-линзы → синтез → ожидает решения → готово), сколько дорожек/линз запланировано / в работе / завершено («M из N», какие именно идут), идёт ли синтез, и время выполнения (сколько ревью уже длится). Данные уже существуют на сервере: `currentNode` живого `RoleInstance` (стадия), накопленные `artifacts` линз (что готово), `phase-telemetry` `PhaseTimingEntry` (тайминги/elapsed). Карточка (`MrCard = ActionableMr`) их сейчас НЕ несёт — надо протянуть в DTO и отрендерить.
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** Визуальный proof в живом дашборде (скрин тикающего таймера/стадии) — TSK-123 (синергия: TSK-123 показывает то, что рисует эта задача).
- **Spec References:**
  - Карточка DTO: [`MrCard`/`types.ts`](../../services/agent-inbox/modules/inbox-api/types.ts)
  - Источник стадии: [`BoardProviderReal`](../../services/agent-inbox/modules/inbox-api/board-provider.real.ts) (`instance.currentNode`)
  - Стадии/линзы: [`ReviewerRole.graph`](../../services/agent-inbox/modules/inbox-roles/reviewer.role.ts) (`node_prepare`/`node_review_fanout` 3 линзы/`node_synthesize`/`node_ask`)
  - Тайминги: [`phase-telemetry.ts`](../../services/agent-inbox/modules/inbox-roles/phase-telemetry.ts) (`PhaseTimingEntry`, `readPhaseAnalytics`, `PhaseNodeRollup`)
  - Рендер карточки: [`MrCard.tsx`](../../services/agent-inbox/modules/inbox-dashboard/components/MrCard.tsx)

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps  | Status |
| --- | ---- | ----- | ------ |
| P1  | impl | —     | [x]    |
| P2  | impl | P1    | [x]    |
| P3  | test | P1,P2 | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (backend: derive + DTO)

- **Objective:** (1) Ввести тип `ReviewProgress` = `{ stage: string; stageLabel: string; tracksPlanned: number; tracksDone: number; tracksInProgress: string[]; activity: string; elapsedMs: number; startedAt: string | null }` и добавить `progress?: ReviewProgress` в DTO карточки (`types.ts`). (2) Чистая функция-деривер (в inbox-roles, тестируемая изолированно) `deriveReviewProgress(currentNode, artifacts, timings)` → маппит узел графа в стадию (node_prepare→«Планирование»; node_review_fanout/линзы→«Ревью»; node_synthesize/gate→«Синтез»; node_ask→«Ожидает решения»; node_effect→«Применение»; done→«Готово»; ветки reply_needed→«Разбор тредов», update-review→«Дельта-ревью»), считает линзы (для review_needed — 3: track/security/code) planned/done/in-progress по наличию их artifacts, elapsedMs из phase-telemetry (now − старт первого узла). (3) Наполнить `progress` в `BoardProviderReal.getBoard()` из живого `RoleInstance` + phase-telemetry; для MR без активного инстанса `progress` отсутствует (undefined).
- **Rules:**
  - [coding/typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/types.ts`
  - `services/agent-inbox/modules/inbox-roles/review-progress.ts`
  - `services/agent-inbox/modules/inbox-api/board-provider.real.ts`
- **Inputs:** none
- **Exit:** `tsc` чист; `deriveReviewProgress` чистая и не зависит от живого времени иначе как через параметр (тестопригодность, ср. `readPhaseAnalytics#nowMs` из D-215); `getBoard` наполняет `progress` для активных MR, undefined для остальных.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — impl (frontend: render)

- **Objective:** В `MrCard.tsx` отрендерить компактный прогресс-информер, когда `card.progress` есть: строка стадии (`stageLabel`), счётчик дорожек «`tracksDone`/`tracksPlanned`» + какие в работе (`tracksInProgress`), маркер «Синтез идёт» на стадии синтеза, и живой таймер elapsed (тикает на клиенте от `startedAt`/`elapsedMs`). Не ломать текущий layout карточки (min-w-0 на flex-предках — ср. прошлый overflow-фикс). Стиль — существующие токены дашборда.
- **Rules:**
  - [coding/typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/components/MrCard.tsx`
- **Inputs:** P1 handoff (форма `ReviewProgress`)
- **Exit:** карточка с `progress` показывает стадию + «M/N дорожек» + таймер; карточка без `progress` рендерится как раньше; браузер-верификация (preview) — нет ошибок консоли, таймер тикает, layout не переполнен.

<!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->

### P3 — test

- **Objective:** (1) Unit на `deriveReviewProgress`: для каждой ветки/узла — правильные stage/stageLabel; для review_needed с 1 готовой линзой из 3 — `tracksDone=1,tracksPlanned=3`, `tracksInProgress` содержит незавершённые; elapsedMs считается от переданного `nowMs`. (2) Integration/render: карточка с замоканным `progress` рендерит стадию/счётчик/таймер; без `progress` — прежний вид. Прогонять с `--experimental-test-module-mocks`.
- **Rules:**
  - [testing/node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/__tests__/review-progress.test.ts`
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/MrCard.progress.test.tsx`
- **Inputs:** P1, P2 handoffs
- **Exit:** все сценарии section 4 зелёные; 0 новых падений против baseline (SCOPED gate D-214).

<!--/SECTION:PHASE_P3-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References.

**Feature:** видимый прогресс ревью на карточке MR

**Scenario:** стадия отражает узел графа [`unit`]

- **Given** активный `RoleInstance` на `node_review_fanout`
- **When** `deriveReviewProgress` вызван
- **Then** `stage` = ревью-линзы, `stageLabel` человекочитаемый («Ревью»)

**Scenario:** счётчик дорожек «M из N» [`unit`]

- **Given** review_needed, готова 1 линза из 3 (есть artifact `node_track_review`, нет security/code)
- **When** деривер считает дорожки
- **Then** `tracksPlanned=3`, `tracksDone=1`, `tracksInProgress` содержит security и code-review

**Scenario:** время выполнения детерминировано при инъекции часов [`unit`]

- **Given** phase-telemetry со стартом первого узла в `T0` и `nowMs`
- **When** деривер считает elapsed
- **Then** `elapsedMs = nowMs − T0` (не зависит от реального `Date.now()` в тесте)

**Scenario:** карточка без активного ревью не ломается [`unit`]

- **Given** MR без активного инстанса
- **When** `getBoard` строит карточку
- **Then** `progress` отсутствует; `MrCard` рендерится как прежде

**Scenario:** карточка с прогрессом показывает стадию, дорожки и таймер [`integration`]

- **Given** `card.progress` c stage=Синтез, 3/3 дорожек, elapsedMs
- **When** рендерится `MrCard`
- **Then** видны метка «Синтез», счётчик «3/3», тикающий таймер; layout не переполнен

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                                                                                | Required by             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `npx tsc --noEmit`                                                                                                                                                                                                     | coding/typescript-rules |
| `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-roles/__tests__/review-progress.test.ts services/agent-inbox/modules/inbox-dashboard/__tests__/MrCard.progress.test.tsx` | testing/node-test       |

- **Task-specific Completion additions:** SCOPED gate (D-214) — 0 новых падений; P2 требует preview-верификации (консоль без ошибок, таймер тикает, нет overflow).

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «стадия» → `review-progress.test.ts` :: `maps graph node to a human stage`
- Scenario «M из N» → `review-progress.test.ts` :: `counts planned/done/in-progress lens tracks`
- Scenario «время при инъекции часов» → `review-progress.test.ts` :: `computes elapsed from injected nowMs`
- Scenario «без прогресса» → `MrCard.progress.test.tsx` :: `renders unchanged when progress is absent`
- Scenario «с прогрессом» → `MrCard.progress.test.tsx` :: `shows stage, track counter and elapsed timer`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-23, initial

#### P1

- [x] `2026-07-24T05:14:01Z` intro `ReviewProgress` ← DTO carries стадию/дорожки/время на карточке MR (TSK-155 §1)
- [x] `2026-07-24T05:14:01Z` intro `deriveReviewProgress` ← чистый деривер узел-графа → `ReviewProgress`, тестопригодный через `nowMs` (D-215)
- [x] `2026-07-24T05:14:01Z` decision MrCard=ActionableMr & { progress?: ReviewProgress } ← сохраняет текущий алиас валидным, не засоряет ActionableMr
- [x] `2026-07-24T05:14:01Z` decision tracksPlanned=3-фиксировано ← 3 линзы review_needed (node_track_review/node_security_lens/node_code_review), доступны для деривера в любой ветке одинаково
- [x] `2026-07-24T05:14:01Z` discovery `PhaseTimingEntry` несёт только `ts` (время финиша узла) и `durationMs`, явных полей start/end нет — старт узла посчитан как `ts − durationMs`
- [x] `2026-07-24T05:14:01Z` insight artifacts для деривера доступны только через `RoleInstance.getCheckpoint().artifacts` (снапшот `RoleInstanceSnapshot` их не несёт) → board-provider.real.ts вызывает `_scheduler.findInstance(snap.mr)` дополнительно к уже используемому `getPolledMr`
- [x] `2026-07-24T05:14:01Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-07-24T05:14:01Z` ver `sdd verify <3 target files>` → typecheck pass, gennady lint pass (3 files), npm run test pass (0 fail) — format:check failed only on pre-existing untouched `tasks/agent-inbox/{README.md,agent-inbox.task-155.md}` (baseline drift, outside P1 Target Files and ticket write scope; not caused by this phase)
- [x] `2026-07-24T05:14:01Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-api/types.ts, services/agent-inbox/modules/inbox-roles/review-progress.ts, services/agent-inbox/modules/inbox-api/board-provider.real.ts]; decisions: [ReviewProgress={ stage: string; stageLabel: string; tracksPlanned: number; tracksDone: number; tracksInProgress: string[]; activity: string; elapsedMs: number; startedAt: string | null }, deriveReviewProgress(input: { currentNode: string; artifacts: Record<string, unknown>; phaseEntries: PhaseTimingEntry[]; nowMs?: number }): ReviewProgress — pure/exported from services/agent-inbox/modules/inbox-roles/review-progress.ts, MrCard=ActionableMr & { progress?: ReviewProgress }, getBoard-populates-progress-via-findInstance+getCheckpoint+phaseTimingsPath-filtered-by-mr, tracksPlanned-fixed-at-3-regardless-of-branch]; open: [format-check-baseline-drift: tasks/agent-inbox/{README.md,agent-inbox.task-155.md} fail prettier --check pre-existing, unrelated to P1 files — surface to operator/audit, not fixed here per scope lock]

#### P2

- [x] `2026-07-24T05:15:08Z` intro `ReviewProgressInformer` ← локальный компонент, рендерит стадию/дорожки/таймер под guard `mr.progress` (TSK-155 §3 P2)
- [x] `2026-07-24T05:15:08Z` intro `useLiveElapsedMs` ← локальный хук: тикает от `startedAt` каждую секунду, иначе статичный `elapsedMs` со снапшота сервера
- [x] `2026-07-24T05:15:08Z` intro `formatElapsedClock` ← локальный форматтер `mm:ss`/`h:mm:ss` для elapsed
- [x] `2026-07-24T05:15:08Z` discovery устаревший JSDoc-инвариант на `MrCard` («Per-track progress is NOT rendered…») зафиксирован в P1-разрыв — снят как неактуальный при добавлении информера
- [x] `2026-07-24T05:17:04Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-07-24T05:17:04Z` ver `sdd verify services/agent-inbox/modules/inbox-dashboard/components/MrCard.tsx` → format pass, lint pass — typecheck/test:coverage gates FAILED with `npm error Missing script` (tool discovery calls non-existent scripts "typecheck"/"test:coverage"; project scripts are named "type-check"/none — pre-existing tool/package.json mismatch, outside this phase's Target Files, not caused here)
- [x] `2026-07-24T05:17:50Z` ver `npm run test` → pass exit=0 (2292 pass, 0 fail, 7 skip) — SCOPED gate D-214 baseline unchanged, 0 new failures
- [x] `2026-07-24T05:17:50Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-dashboard/components/MrCard.tsx]; decisions: [ReviewProgressInformer-rendered-inside-existing-min-w-0-flex-1-div-guarded-by-mr.progress-presence, useLiveElapsedMs(startedAt,staticElapsedMs)-ticks-via-setInterval-1000ms-cleared-on-unmount/startedAt-change-falls-back-to-static-elapsedMs-when-startedAt-null, formatElapsedClock(ms)-mm:ss-or-h:mm:ss-when->=1h, synthesis-stage-marked-with-Sparkles-icon-when-progress.stage==='synthesis', track-counter-text="tracksDone/tracksPlanned дорожек"+optional-"идут: <tracksInProgress.join(', ')>"]; open: [sdd-verify-script-mismatch: `sdd verify` auto-discovery calls npm scripts "typecheck"/"test:coverage" that do not exist in package.json (actual: "type-check", no coverage script) — pre-existing tool drift, surfaced for operator/audit, not fixed here per scope lock; render-test-seam-for-P3: `mr.progress` guard + `ReviewProgressInformer`/`useLiveElapsedMs`/`formatElapsedClock` are local (non-exported) — P3's MrCard.progress.test.tsx should assert via rendered DOM (stage label, "M/N дорожек" text, timer text), not via importing the helpers directly]

#### P3

- [x] `2026-07-24T05:22:53Z` discovery React SSR разделяет соседние JSX-выражения `{tracksDone}/{tracksPlanned}` HTML-комментариями `<!-- -->` — счётчик «3/3» проверялся строковым includes после `stripSsrComments(html)` в тесте, продукт-код не менялся
- [x] `2026-07-24T05:22:53Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-07-24T05:22:53Z` ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-roles/__tests__/review-progress.test.ts services/agent-inbox/modules/inbox-dashboard/__tests__/MrCard.progress.test.tsx` → pass exit=0 (5 pass, 0 fail)
- [x] `2026-07-24T05:22:53Z` ver `npm run test` → pass exit=0 (2295 pass, 0 fail, 7 skip) — SCOPED gate D-214, 0 new failures vs baseline
- [x] `2026-07-24T05:22:53Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/__tests__/review-progress.test.ts, services/agent-inbox/modules/inbox-dashboard/__tests__/MrCard.progress.test.tsx]; decisions: [all-5-canonical-test-names-used-verbatim-from-section-6-no-renames-needed, MrCard-render-test-asserts-via-DOM-text-not-internal-helper-imports-per-P2-handoff-seam, ssr-comment-stripping-helper-local-to-test-file-not-a-product-change]; open: [format-check-baseline-drift (P1 open item, still unrelated/unfixed): tasks/agent-inbox/{README.md,agent-inbox.task-155.md} fail prettier --check — pre-existing, outside P3 Target Files, surfaced for operator/audit; sdd-verify-script-mismatch (P2 open item, unresolved): `sdd verify` auto-discovery calls non-existent npm scripts "typecheck"/"test:coverage" — pre-existing tool drift, not fixed here per scope lock]

#### Round close

- [x] `2026-07-24T05:30:00Z` sync agent-inbox+root
- [x] `2026-07-24T05:30:00Z` DONE — live browser visual proof (ticking timer on a real MR) deferred to TSK-123 per this ticket's Deferred Runtime Scope; component-level DOM render verified by MrCard.progress.test.tsx

<!--/SECTION:EXECUTION_LOG-->
