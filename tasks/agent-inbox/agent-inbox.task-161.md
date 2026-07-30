# Task: TSK-161 — inbox-pipeline: план-шаблон + 3 слоя + линзы + coverage + синтез + хвосты

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-161
- **Status:** [ ] TODO
- **Purpose:** Единый ревью-пайплайн: план-DAG (prepare→plan→enrich→fan-out→gate_coverage→synthesize→gate_verdict→хвост), 3 слоя дорожек, линзы-волны, мульти-модель (N артефактов + findings.jsonl), coverage-гейт по tool-trace, синтез с read-тулами, role-хвосты + delta_review мини-DAG.
- **Scope:** `agent-inbox`
- **Module:** `inbox-pipeline`
- **Dependencies:** TSK-159
- **Spec References:**
  - Module spec: [inbox-pipeline](../../specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md) §2–§8
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

- **Objective:** PlanTemplate (DAG → задачи inbox-queue; минимальный PLAN.md детерминированно из plan), TriggerRegistry (glob, TS-модуль, стартовые правила), LensRegistry (LensSpec, inputs-волны, mandatory/proposed), CoverageGate (tool-trace × чеклист, предикат частичных чтений, исключения, max continue=2), FindingsJournal (findings.jsonl append-only, source:model), Synthesize (read-тулы, указатели, консенсус/спор/уникальные), GateVerdict (§2.1 критерии), хвосты (author/reviewer), delta_review мини-DAG.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-pipeline/plan-template.ts`
  - `services/agent-inbox/modules/inbox-pipeline/trigger-registry.ts`
  - `services/agent-inbox/modules/inbox-pipeline/lens-registry.ts`
  - `services/agent-inbox/modules/inbox-pipeline/coverage-gate.ts`
  - `services/agent-inbox/modules/inbox-pipeline/findings-journal.ts`
  - `services/agent-inbox/modules/inbox-pipeline/synthesize.ts`
  - `services/agent-inbox/modules/inbox-pipeline/gate-verdict.ts`
  - `services/agent-inbox/modules/inbox-pipeline/tails/author-tail.ts`
  - `services/agent-inbox/modules/inbox-pipeline/tails/reviewer-tail.ts`
- **Inputs:** TSK-159 (queue), TSK-160 (сессии/tool-trace), TSK-158 (changeset/discussions)
- **Exit:** `npm run type-check` exit 0; gate_verdict резолвит §2.1 критерии
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** тесты: слои в PLAN.md, триггеры, волны линз, coverage-предикат (частичные/удалённые/max continue), мульти-модель синтез, gate_verdict pass/fail, хвосты, delta.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-pipeline/__tests__/plan-template.test.ts`
  - `services/agent-inbox/modules/inbox-pipeline/__tests__/coverage-gate.test.ts`
  - `services/agent-inbox/modules/inbox-pipeline/__tests__/synthesize.test.ts`
  - `services/agent-inbox/modules/inbox-pipeline/__tests__/tails.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты; `npm test` по файлам exit 0
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** детерминированный ревью-пайплайн с интеллектуальным расширением

**Scenario:** типинг-контракт LensSpec/TrackSpec/ReviewVerdict [`contract`]

- **Given** LensSpec, TrackSpec (источник mandatory|triggered:<rule>|proposed), review.json схема
- **When** type-check
- **Then** источник дорожки дискриминирован; findings F-n несут file:line+summary+source

**Scenario:** триггер deps-манифеста порождает deps-vuln дорожку [`unit`]

- **Given** changeset с `package.json`
- **When** plan()
- **Then** в плане дорожка `triggered:deps-vuln` (слой 2) + mandatory-дорожки покрывают 100% файлов

**Scenario:** линзы идут волнами по inputs [`unit`]

- **Given** линзы 🧪 и 🏛 (inputs: [🧪])
- **When** инстанцирование DAG
- **Then** 🏛 dependsOn 🧪; внутри волны — параллельно

**Scenario:** coverage-гейт ловит недочит и доезжает continue [`integration`]

- **Given** чеклист 4 файла, tool-trace: 3 read + 1 отсутствует
- **When** gate_coverage
- **Then** fail со списком; после continue с read 4-го — pass; удалённые/бинарные исключены заранее

**Scenario:** мульти-модель: консенсус/спор/уникальные [`unit`]

- **Given** `<track>.kimi.result.json` и `<track>.deepseek.result.json` с пересечением
- **When** synthesize
- **Then** разметка ✅/⚡/○ в findings.jsonl с source на каждую находку

**Scenario:** gate_verdict блокирует неполный review.json [`unit`]

- **Given** review.json без verdict / находка без file:line
- **When** gate_verdict
- **Then** fail + возврат в synthesize с причинами; после 2 — эскалация
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                              | Required by      |
| -------------------------------------------------------------------- | ---------------- |
| `npm run type-check`                                                 | typescript-rules |
| `npm test -- services/agent-inbox/modules/inbox-pipeline/__tests__/` | node-test        |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- типинг-контракт → `plan-template.test.ts` :: `contract: lens and track specs discriminated`
- триггеры+слои → `plan-template.test.ts` :: `deps manifest spawns triggered track and mandatory coverage is full`
- волны → `plan-template.test.ts` :: `lens inputs create DAG waves`
- coverage → `coverage-gate.test.ts` :: `underread fails gate and continue completes checklist`
- мульти-модель → `synthesize.test.ts` :: `multi model synthesis marks consensus dispute unique`
- gate_verdict → `synthesize.test.ts` :: `verdict gate blocks incomplete review json`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- inbox-pipeline/__tests__` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
