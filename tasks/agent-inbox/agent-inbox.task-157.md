# Task: TSK-157 — inbox-core: датасет решений + барьер готовности + dry-run

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-157
- **Status:** [x] DONE
- **Purpose:** Proposal/Decision записи (D-302), capability-режимы (`proposal|auto`, порог 90%/20), барьер готовности (фазы + `/api/boot` контракт), dry-run контракт.
- **Scope:** `agent-inbox`
- **Module:** `inbox-core`
- **Dependencies:** TSK-156
- **Spec References:**
  - Module spec: [inbox-core](../../specs/agent-inbox/inbox-core/inbox-core.spec.md) §2.1, §4, §5
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None
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

### P1 — impl

- **Objective:** DecisionJournal (write proposal/decision поверх EventJournal, замкнутый набор capability, accept-rate reader), CapabilityModes (хранение в registry `capabilities`, flip по порогу), BootReadiness (машина фаз connect→poll→reconcile→restore→ready/failed, `progress {done,total,label}`, слушатель ДО connect), dry-run (подавление effect\_\*, запись system/dryrun).
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-core/decision-journal.ts`
  - `services/agent-inbox/modules/inbox-core/capability-modes.ts`
  - `services/agent-inbox/modules/inbox-core/boot-readiness.ts`
  - `services/agent-inbox/modules/inbox-core/state-store.ts` (монтирование новых полей/модулей: capabilities, lastReadAt, boot-readiness — v1-агрегатор состояния, расширяется, не переписывается)
- **Inputs:** TSK-156 P1 handoff (EventJournal)
- **Exit:** `npm run type-check` exit 0; фазы эмитятся в правильном порядке
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** тесты датасета, градации, фаз, dry-run.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-core/__tests__/decision-journal.test.ts`
  - `services/agent-inbox/modules/inbox-core/__tests__/boot-readiness.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты; `npm test` по файлам exit 0
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** датасет решений и барьер готовности

**Scenario:** типинг-контракт Proposal/DecisionRecord [`contract`]

- **Given** схемы proposal `{proposalId, capability, mr, payload, producedBy}` и decision `{proposalId, verdict, diff?, actor}`
- **When** type-check
- **Then** verdict ∈ accept|edit|reject; capability ∈ замкнутый набор из 6

**Scenario:** proposal+decision пишутся в журнал MR [`integration`]

- **Given** журнал MR
- **When** writeProposal + writeDecision(edit, diff)
- **Then** обе записи читаются через since(); accept-rate per capability вычисляется

**Scenario:** градация capability по порогу [`unit`]

- **Given** 19 accept подряд по `react`
- **When** 20-й accept
- **Then** режим `react` → auto (accept ≥ 90% при n ≥ 20); при n=19 — остаётся proposal

**Scenario:** фазы загрузки наблюдаемы с первой [`unit`]

- **Given** BootReadiness
- **When** прогон connect→poll→reconcile→restore→ready
- **Then** `/api/boot`-снимок доступен ДО connect; progress = {done,total,label} монотонен; падение фазы → failed + reason + retry

**Scenario:** dry-run подавляет все эффекты с журнальным следом [`integration`]

- **Given** dry-run включён, capability в auto
- **When** effect_post исполняется
- **Then** в GitLab ничего не уходит; в журнал MR — `system/dryrun` на каждый подавленный эффект

**Scenario:** битый/отсутствующий config → failed без throw [`unit`]

- **Given** config.json отсутствует/бит
- **When** boot
- **Then** `{configured:false, missing[]}` без throw; фаза `failed` с причиной в /api/boot

**Scenario:** граница порога 90% [`unit`]

- **Given** 18 accept + 2 reject (n=20) по react
- **When** вычисление режима
- **Then** flip → auto; при 17 accept + 3 reject — остаётся proposal
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                           | Required by      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `npm run type-check`                                                                                                                                              | typescript-rules |
| `npm test -- services/agent-inbox/modules/inbox-core/__tests__/decision-journal.test.ts services/agent-inbox/modules/inbox-core/__tests__/boot-readiness.test.ts` | node-test        |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- типинг-контракт → `decision-journal.test.ts` :: `contract: proposal and decision envelope`
- записи+accept-rate → `decision-journal.test.ts` :: `proposal and decision are journaled and rated per capability`
- градация по порогу (per-row) → `decision-journal.test.ts` :: `remains proposal at n=19 even at 100% accept rate`, `graduates to auto at n=20 with 100% accept rate`, `graduates to auto at 18 accept + 2 reject (90% of 20)`, `remains proposal at 17 accept + 3 reject (85% of 20)`, `remains proposal when rate is NaN (zero decisions)`
- фазы (per-row) → `boot-readiness.test.ts` :: `provides snapshot before any transition`, `transitions connect→poll and progress is monotonic`, `transitions poll→reconcile`, `transitions reconcile→restore`, `transitions restore→ready and marks ready=true`, `silently skips duplicate phase transition (no regression)`, `silently ignores backward transition (no regression, no throw)`, `fail() transitions to failed with reason`, `listener fires on every phase transition`, `listener fires on fail()`
- dry-run → `decision-journal.test.ts` :: `dry run suppresses all effects with journal trail`
- битый config → `boot-readiness.test.ts` :: `broken config yields failed phase without throw`, `config status settable independently of phase transitions`
- граница порога → covered by per-row graduation tests above
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [x] `2026-08-06T11:11:17Z` intro `DecisionJournal` ← D-302: proposal/decision recording atop EventJournal
- [x] `2026-08-06T11:11:17Z` intro `ProposalRecord` ← D-302: proposal envelope (capability, mr, payload, producedBy)
- [x] `2026-08-06T11:11:17Z` intro `DecisionRecord` ← D-302: decision envelope (proposalId, verdict, diff, actor)
- [x] `2026-08-06T11:11:17Z` intro `AcceptRate` ← D-302: capability accept-rate metrics for graduation
- [x] `2026-08-06T11:11:17Z` intro `Capability` ← D-302: closed set of 6 capabilities
- [x] `2026-08-06T11:11:17Z` intro `CapabilityModes` ← D-302: stateless graduation engine (90%/20 threshold)
- [x] `2026-08-06T11:11:17Z` intro `GraduationConfig` ← D-302: parameterised threshold/minSampleSize config
- [x] `2026-08-06T11:11:17Z` intro `CapabilityRegistry` ← D-302: per-capability mode registry
- [x] `2026-08-06T11:11:17Z` intro `BootReadiness` ← D-305: phase state machine connect→poll→reconcile→restore→ready/failed
- [x] `2026-08-06T11:11:17Z` intro `BootState` ← D-305: /api/boot snapshot contract (phase, progress, error, configured)
- [x] `2026-08-06T11:11:17Z` intro `StateStore#recordLastRead` ← D-317: delegation to InboxRegistryAccess
- [x] `2026-08-06T11:11:17Z` intro `StateStore#retrieveCapabilities` ← D-302: delegation to InboxRegistryAccess
- [x] `2026-08-06T11:11:17Z` intro `StateStore#storeCapabilities` ← D-302: delegation to InboxRegistryAccess
- [x] `2026-08-06T11:11:17Z` decision threshold=0.9,minSampleSize=20 ← spec §2.1 rolling-window graduation
- [x] `2026-08-06T11:11:17Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-06T11:11:17Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-core/decision-journal.ts, services/agent-inbox/modules/inbox-core/capability-modes.ts, services/agent-inbox/modules/inbox-core/boot-readiness.ts, services/agent-inbox/modules/inbox-core/state-store.ts]; decisions: [threshold=0.9, minSampleSize=20, capabilities=6 (post_findings|post_reply|react|resolve|approve|update_description), graduation=stateless CapabilityModes.evaluateGraduation, boot-phase-order=connect→poll→reconcile→restore→ready, dryrun-suppression=recordDryRunSuppression writes kind=system payload.event=dryrun, decision-mr-field=empty-string (decision events are global, not per-MR)]; open: []

#### P2

- [x] `2026-08-06T11:17:26Z` intro `decision-journal.test.ts` ← BDD-контракт на DecisionJournal: proposal/decision-записи, accept-rate, dry-run, порог градации (per-row)
- [x] `2026-08-06T11:17:26Z` intro `boot-readiness.test.ts` ← BDD-контракт на BootReadiness: фазы, снапшот, fail, listener, config-статус (per-row)
- [x] `2026-08-06T11:17:26Z` decision perRowFixtures ← урок TSK-158: табличные функции (градация capability, фазы загрузки) требуют per-row fixtures; каждый ряд таблицы решений — отдельный it
- [x] `2026-08-06T11:17:26Z` tried npm test → import error: CapabilityModes не экспортируется из decision-journal.ts → исправлен импорт на capability-modes.ts, перезапуск
- [x] `2026-08-06T11:17:26Z` tried format:check → fail → исправлен prettier --write на decision-journal.test.ts
- [x] `2026-08-06T11:17:26Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-06T11:17:26Z` ver `npm test -- services/agent-inbox/modules/inbox-core/__tests__/decision-journal.test.ts services/agent-inbox/modules/inbox-core/__tests__/boot-readiness.test.ts` → pass exit=0
- [x] `2026-08-06T11:17:26Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-core/__tests__/decision-journal.test.ts, services/agent-inbox/modules/inbox-core/__tests__/boot-readiness.test.ts]; decisions: [perRowFixtures, graduation-boundary-tested=n19_proposal/n20_auto/17acc3rej_proposal/18acc2rej_auto, boot-phases-tested=connect→poll→reconcile→restore→ready+fail+snapshot+listener, dryrun-tested=journal_trail+no_network_call, broken-config-tested=no_throw+configured_false]; open: []

#### Round close

- [x] 2026-08-06T11:25:00Z sync agent-inbox+root trackers
- [x] 2026-08-06T11:25:00Z DONE
<!--/SECTION:EXECUTION_LOG-->
