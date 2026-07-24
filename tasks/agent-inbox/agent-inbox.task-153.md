# Task: TSK-153 — misc тест-долг: telemetry-clock DI + reviewer-seed + snapshot regen

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-153 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-roles + ai-kit | **Dependencies:** None
- **Purpose:** 3 несвязанных red-теста, все test-side (не баги продукта): (1) `PhaseTelemetry` — `readPhaseAnalytics` берёт реальный `Date.now()`, тест с фиксированным прошлым NOW отсекается 7-дневным окном (ENV-FLAKE); (2) `reviewer-disk-artifact.test.ts` сценарий 4 — сеет `node_synthesize` формой `{writeArtifact}`, а узел zero-tools JSON (D-120) → мок возвращает ack-текст, гейт не видит `reviewReport` (STALE-TEST); (3) `selectDirective snapshot` — 55c2571 добавил в шаблон `reviewReport`-требование, снапшот не перегенерён, вывод верный (STALE-SNAPSHOT, regen безопасен).
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
- **Spec References:**
  - `services/agent-inbox/modules/inbox-roles/phase-telemetry.ts` (`readPhaseAnalytics` vs уже-инъектируемый `gcStalePhaseTimings#nowMs`)
  - `services/agent-inbox/modules/inbox-roles/reviewer.role.ts` (`node_synthesize` — session+resultSchema, D-120)
  - `ai/kit/templates/sdd-v2/agent-inbox/synthesize.directive.hbs` (источник актуального снапшота)
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

- **Objective:** (1) Добавить в `readPhaseAnalytics` опциональный `nowMs: number = Date.now()` (зеркало `gcStalePhaseTimings`) — чисто test-DI хук, дефолт не меняет поведение реальных вызовов; тест передаёт свой `NOW_MS`. Это правка продуктового `phase-telemetry.ts` + теста. (2) В `reviewer-disk-artifact.test.ts` сценарий 4 заменить сид `node_synthesize` с `{writeArtifact}` на прямой объект `{reviewReport:{summary,verdict,behavior,scenarios}, proposedActions:[]}`. (3) Перегенерить снапшот `selector.snapshot.test.ts` для кейса «renders synthesize base…» через snapshot-update flow — АВТОРИЗОВАНО (D-215): триаж доказал, что вывод корректен и совпадает с шаблоном + контрактом `_missingReviewReportFields`; это regen отставшего снапшота, не маскировка регрессии.
- **Rules:**
  - [testing/node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/phase-telemetry.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/phase-telemetry.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/reviewer-disk-artifact.test.ts`
  - `services/ai-kit/__tests__/selector.snapshot.test.ts` (+ его снапшот-файл)
- **Inputs:** none
- **Exit:** 3 теста зелёные; `readPhaseAnalytics` для реальных (без `nowMs`) вызовов не изменил поведение; снапшот перегенерён осознанно; 0 новых падений против baseline.

<!--/SECTION:PHASE_P1-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References.

**Feature:** устранение отставшего тест-долга без изменения поведения продукта

**Scenario:** phase-analytics детерминированна при инъекции часов [`unit`]

- **Given** `readPhaseAnalytics(entries, days, nowMs)` c фиксированным `nowMs`
- **When** записи в пределах окна относительно `nowMs`
- **Then** `entryCount`/`perNode` считаются верно; реальные вызовы без `nowMs` берут `Date.now()` (поведение не изменено)

**Scenario:** reviewer-disk сценарий 4 достигает node_ask [`unit`]

- **Given** `node_synthesize` засеян прямым объектом `reviewReport` (не `writeArtifact`)
- **When** граф идёт через `gate_review_synthesis`
- **Then** `currentNode === 'node_ask'`

**Scenario:** снапшот селектора отражает актуальный шаблон [`unit`]

- **Given** шаблон synthesize несёт требование `reviewReport` (55c2571)
- **When** снапшот перегенерён
- **Then** тест зелёный, вывод совпадает с шаблоном на диске (не регрессия)

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                                                                                                                                      | Required by       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-roles/__tests__/phase-telemetry.test.ts services/agent-inbox/modules/inbox-roles/__tests__/reviewer-disk-artifact.test.ts services/ai-kit/__tests__/selector.snapshot.test.ts` | testing/node-test |
| `npx tsc --noEmit`                                                                                                                                                                                                                                                           | testing/node-test |

- **Task-specific Completion additions:** SCOPED gate (D-214); правка `phase-telemetry.ts` строго аддитивна (опц. параметр); regen снапшота задокументирован `decision`-строкой.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «phase-analytics DI» → `phase-telemetry.test.ts` :: `PhaseTelemetry` (readPhaseAnalytics cases)
- Scenario «reviewer-disk сценарий 4» → `reviewer-disk-artifact.test.ts` :: `materializeReviewJson merges disk-artifact lens findings`
- Scenario «снапшот» → `selector.snapshot.test.ts` :: `renders synthesize base with no active mrShape flags`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-23, initial

#### P1

- [x] `2026-07-23T14:15:00Z` decision readPhaseAnalytics(stateDir, days, nowMs=Date.now()) ← аддитивный опциональный параметр, зеркалит gcStalePhaseTimings#nowMs; реальные вызовы без nowMs берут Date.now() как раньше, поведение не изменено
- [x] `2026-07-23T14:20:00Z` discovery node_track_review/node_security_lens/node_code_review в reviewer-disk-artifact.test.ts сценарий 4 несли тот же дефект, что и node_synthesize (не упомянутый в тикете): это structured-JSON сессии (resultSchema, без artifact:), а тест сеял их через writeArtifact — ctx.artifacts[lensId] получал ack-текст мока вместо {findings:[...]}, отсюда findings.length===0. Исправлено той же заменой на прямой объект — тот же корневой баг, тот же Target File, расширение по факту, не по объёму тикета
- [x] `2026-07-23T14:20:30Z` decision node_synthesize seed: {writeArtifact:{...}} → прямой объект {reviewReport:{...}, proposedActions:[]} ← zero-tools JSON сессия (D-120) возвращает resultSchema-JSON напрямую, никогда не пишет на диск для этого узла
- [x] `2026-07-23T14:23:00Z` decision snapshot regen (D-215, авторизовано тикетом): перегенерирован через `node --import tsx --test --test-update-snapshots services/ai-kit/__tests__/selector.snapshot.test.ts`; diff снапшота — единственное изменение — блок «renders synthesize base with no active mrShape flags» теперь содержит требование reviewReport (совпадает с synthesize.directive.hbs после 55c2571 и с \_missingReviewReportFields) — regen отставшего снапшота, не маскировка регрессии
- [x] `2026-07-23T14:26:00Z` ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-roles/__tests__/phase-telemetry.test.ts services/agent-inbox/modules/inbox-roles/__tests__/reviewer-disk-artifact.test.ts services/ai-kit/__tests__/selector.snapshot.test.ts` → pass exit=0
- [x] `2026-07-23T14:26:10Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-07-23T14:27:00Z` verified `npm test` (полный набор, SCOPED-дополнительно) → pass exit=0, 2299 tests / 2290 pass / 0 fail / 9 skip — 0 новых падений против baseline (12 из scratchpad/baseline-now.txt), фактически все 12 baseline-failures тоже зелёные в этом прогоне
- [x] `2026-07-23T14:27:30Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/phase-telemetry.ts, services/agent-inbox/modules/inbox-roles/__tests__/phase-telemetry.test.ts, services/agent-inbox/modules/inbox-roles/__tests__/reviewer-disk-artifact.test.ts, services/ai-kit/__tests__/selector.snapshot.test.ts, services/ai-kit/__tests__/snapshots/selector.snapshot.test.ts.snapshot]; decisions: [readPhaseAnalytics-nowMs=additive-DI-param, reviewer-disk-seed-fix=extended-to-3-lens-sessions-plus-synthesize, snapshot-regen=D-215-authorized]; open: []

<!--/SECTION:EXECUTION_LOG-->
