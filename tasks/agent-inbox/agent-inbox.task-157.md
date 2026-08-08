# Task: TSK-157 — inbox-core: датасет решений + барьер готовности + dry-run

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-157
- **Status:** [x] DONE
- **Reopens:** 3 (Rounds 2–4: independent-audit runtime remediation)
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
- `services/agent-inbox/serve/bootstrap.ts` (live boot HTTP lifecycle and MR-scoped persistence wiring)
- `services/agent-inbox/modules/inbox-api/http-server.ts` (early boot surface, runtime attach)
- `services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts` (production proposal persistence seam)
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
- `services/agent-inbox/modules/inbox-api/__tests__/foundation-runtime.integration.test.ts`
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
- public lifecycle → `foundation-runtime.integration.test.ts` :: `serves real /api/boot snapshots before and through every bootstrap phase`
- canonical dry-run persistence → `foundation-runtime.integration.test.ts` :: `persists MR-scoped dry-run before its live broadcaster can observe it`
- canonical reviewer-tail persistence → `pipeline-runtime.integration.test.ts` :: `persists a reviewer tail proposal and capability cache under its canonical MR ref`
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

### Round 2 — 2026-08-08, audit remediation

#### P1

- [x] `2026-08-08T00:26:00Z` wire `BootReadiness` as the single bootstrap/HTTP `/api/boot` state source; snapshot now includes `ready`, configuration state and missing fields
- [x] `2026-08-08T00:26:00Z` persist `dryRun` in inbox config and route every suppressed effect through durable `system/dryrun` recording before SSE broadcast
- [x] `2026-08-08T00:26:00Z` scope decision/proposal journal selection by canonical MR ref; decisions inherit a proposal MR instead of writing an empty MR
- [x] `2026-08-08T00:26:00Z` recompute and atomically persist D-302 capability modes after a live MR decision

#### P2

- [x] `2026-08-08T00:26:00Z` intro `foundation-runtime.integration.test.ts` ← BDD: shared `/api/boot` readiness and MR-scoped proposal/decision durable journal
- [x] `2026-08-08T00:26:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-08T00:26:00Z` ver focused core/API/bootstrap tests → pass (46/46)
- [x] `2026-08-08T00:26:00Z` ver `npx tsx cli/gennady.ts lint` (changed runtime files) → pass
- [x] `2026-08-08T00:26:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/serve/bootstrap.ts, services/agent-inbox/modules/inbox-api/routers/boot.router.ts, services/agent-inbox/modules/inbox-api/routers/decision.router.ts, services/agent-inbox/modules/inbox-core/dry-run.ts, services/agent-inbox/modules/inbox-api/__tests__/foundation-runtime.integration.test.ts]; decisions: [one-shared-boot-readiness, decision-journals-per-MR, dryrun-durable-before-SSE]; open: [independent audit]

### Round 3 — 2026-08-08, audit-r2 runtime remediation

#### P1

- [x] `2026-08-08T03:40:00+03:00` wire `HttpServer` to listen before config/connect/poll/reconcile/restore and attach the complete runtime only before ready
- [x] `2026-08-08T03:40:00+03:00` wire reviewer pipeline tail to persist `post_findings` proposal in canonical MR `DecisionJournal`, then recompute/persist D-302 capability cache
- [x] `2026-08-08T03:40:00+03:00` persist MR dry-run `system/dryrun` in canonical MR journal before SSE broadcaster

#### P2

- [x] `2026-08-08T03:40:00+03:00` intro `foundation-runtime.integration.test.ts` ← BDD: public bootstrap HTTP probes observe connect→poll→reconcile→restore→ready, and MR dry-run persistence
- [x] `2026-08-08T03:40:00+03:00` ver `npm run type-check` → pass exit=0
- [x] `2026-08-08T03:40:00+03:00` ver `npx tsx --test services/agent-inbox/modules/inbox-api/__tests__/foundation-runtime.integration.test.ts services/agent-inbox/modules/inbox-core/__tests__/decision-journal.test.ts services/agent-inbox/modules/inbox-core/__tests__/boot-readiness.test.ts` → pass 24/24
- [x] `2026-08-08T03:40:00+03:00` ver `npx tsx --test services/agent-inbox/serve/__tests__/bootstrap.test.ts services/agent-inbox/serve/__tests__/shutdown.test.ts` → pass exit=0
- [x] `2026-08-08T03:40:00+03:00` ver `npx prettier --check` changed files → pass
- [x] `2026-08-08T03:40:00+03:00` DONE
      **Handoff →** artifacts: [services/agent-inbox/serve/bootstrap.ts, services/agent-inbox/modules/inbox-api/http-server.ts, services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts, services/agent-inbox/modules/inbox-api/__tests__/foundation-runtime.integration.test.ts]; decisions: [early-live-boot-surface, phased-http-observation, MR-canonical-dryrun-before-SSE, pipeline-proposal-and-capability-persistence]; open: [independent audit]

#### Round close

- [x] `2026-08-08T03:40:00+03:00` task traceability reconciled; Reopens=2 for three immutable execution rounds
- [x] `2026-08-08T03:40:00+03:00` DONE

### Round 4 — 2026-08-08, audit-r3 canonical MR identity remediation

#### P1

- [x] `2026-08-08T03:50:00+03:00` wire `RoleScheduler` root and delta pipeline starts to canonical `project!iid`, retaining web URLs only for VCS/role-instance transport
- [x] `2026-08-08T03:50:00+03:00` preserve the same canonical ref through reviewer-tail proposal persistence and `storeCapabilitiesForRef` cache recomputation

#### P2

- [x] `2026-08-08T03:50:00+03:00` intro `pipeline-runtime.integration.test.ts` ← BDD: reviewer tail writes canonical proposal journal and refreshes canonical capability cache
- [x] `2026-08-08T03:50:00+03:00` ver `npm run type-check` → pass exit=0
- [x] `2026-08-08T03:50:00+03:00` ver focused core/scheduler/pipeline/bootstrap tests → pass
- [x] `2026-08-08T03:50:00+03:00` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/role-scheduler.ts, services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.test.ts, services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.integration.test.ts]; decisions: [pipeline-identity=project!iid, reviewer-tail-journal-and-capability-cache-share-ref]; open: [independent audit]

#### Round close

- [x] `2026-08-08T03:50:00+03:00` task traceability reconciled; Reopens=3 for four immutable execution rounds
- [x] `2026-08-08T03:50:00+03:00` DONE
<!--/SECTION:EXECUTION_LOG-->
