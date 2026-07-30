# Task: TSK-157 — inbox-core: датасет решений + барьер готовности + dry-run

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-157
- **Status:** [ ] TODO
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
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

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
  - `services/agent-inbox/modules/inbox-core/state-store.ts`
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
- градация по порогу → `decision-journal.test.ts` :: `capability flips to auto at 90 percent over 20`
- фазы → `boot-readiness.test.ts` :: `boot phases are observable before connect and fail visibly`

- dry-run → `decision-journal.test.ts` :: `dry run suppresses all effects with journal trail`
- битый config → `boot-readiness.test.ts` :: `broken config yields failed phase without throw`
- граница порога → `decision-journal.test.ts` :: `graduation threshold is inclusive at 90 percent of 20`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- decision-journal.test.ts boot-readiness.test.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
