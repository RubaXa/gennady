# Task: TSK-161 — inbox-pipeline: план-шаблон + 3 слоя + линзы + coverage + синтез + хвосты

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-161
- **Status:** [x] DONE
- **Reopens:** 1 (2026-08-06 — audit: отсутствовал gate-verdict.test.ts; добавлен)
- **Purpose:** Единый ревью-пайплайн: план-DAG (prepare→plan→enrich→fan-out→gate_coverage→synthesize→gate_verdict→хвост), 3 слоя дорожек, линзы-волны, мульти-модель (N артефактов + findings.jsonl), coverage-гейт по tool-trace, синтез с read-тулами, role-хвосты + delta_review мини-DAG.
- **Scope:** `agent-inbox`
- **Module:** `inbox-pipeline`
- **Reopens:** 1
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
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

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

- contract → `plan-template.test.ts` :: `contract: lens and track specs discriminated`
- depsVuln → `plan-template.test.ts` :: `deps manifest spawns triggered track and mandatory coverage is full`
- layer1 → `plan-template.test.ts` :: `layer 1 mandatory always present covers all core files`
- layer2 → `plan-template.test.ts` :: `layer 2 triggered spawns from triggers when files match glob patterns`
- layer3 → `plan-template.test.ts` :: `layer 3 proposed tracks are allocated as empty placeholder for enrich stage`
- coverage100 → `plan-template.test.ts` :: `mandatory plus triggered tracks cover all changed files at 100 percent`
- deterministic → `plan-template.test.ts` :: `deterministic output: same changeset produces identical track ordering and stage structure`
- dagWaves → `plan-template.test.ts` :: `lens inputs create DAG waves`
- pass → `coverage-gate.test.ts` :: `all files read returns pass with empty missing list`
- missing → `coverage-gate.test.ts` :: `missing file returns fail with missing file list`
- partial → `coverage-gate.test.ts` :: `partial read detected from tool trace is reported as missing`
- deleted → `coverage-gate.test.ts` :: `deleted files are excluded from checklist`
- binary → `coverage-gate.test.ts` :: `binary files are excluded from checklist`
- continue2 → `coverage-gate.test.ts` :: `max continue equals 2: first continue ok, second continue last chance, third throws escalation`
- emptyChecklist → `coverage-gate.test.ts` :: `empty checklist returns pass with nothing to check`
- consensus → `synthesize.test.ts` :: `two models same finding marks consensus`
- dispute → `synthesize.test.ts` :: `two models different findings on same line marks dispute`
- unique → `synthesize.test.ts` :: `only one model has finding marks unique`
- empty → `synthesize.test.ts` :: `empty model results produce empty synthesized output`
- majority → `synthesize.test.ts` :: `three plus models: majority agreement yields consensus plus unique for outlier`
- source → `synthesize.test.ts` :: `findings carry source model and runId`
- verdictCount → `tails.test.ts` :: `summary includes verdict finding count and MR info`
- emptyFindings → `tails.test.ts` :: `empty findings produces no issues found default`
- severityOrder → `tails.test.ts` :: `top findings are ordered by severity: error before warning before info`
- disputeReply → `tails.test.ts` :: `dispute findings trigger proposed reply for operator decision`
- groupedByMark → `tails.test.ts` :: `findings are grouped by mark counts: consensus dispute unique`
- verdictErrors → `tails.test.ts` :: `recommended verdict is REQUEST_CHANGES when errors present`
- verdictApprove → `tails.test.ts` :: `recommended verdict is APPROVE when no findings exist`
- dedup → `tails.test.ts` :: `existing thread on same file line deduplicates as reply action`
- skipDispute → `tails.test.ts` :: `disputed findings are skipped from posting candidates`
- recommendations → `tails.test.ts` :: `recommendations include dispute and consensus counts for reviewer`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [x] `2026-08-06T21:21:20Z` intro PlanTemplate ← ядро: детерминированный DAG-план из changeset (prepare→plan→enrich→fan-out→gate_coverage→synthesize→gate_verdict→tails), 3 слоя дорожек
- [x] `2026-08-06T21:21:20Z` intro TriggerRegistry ← реестр glob-правил (стартовые: deps-vuln, secrets, spec-compliance, migration-safety), матчер glob→regex без зависимостей
- [x] `2026-08-06T21:21:20Z` intro LensRegistry ← 7 стартовых линз (architecture, business, specs, tests, security, optimization, code-lines), DAG-волны по inputs, mandatory/proposed фильтр
- [x] `2026-08-06T21:21:20Z` intro CoverageGate ← проверка tool-trace.jsonl против чеклиста, предикат частичных чтений, исключения удалённых/бинарных, max continue=2
- [x] `2026-08-06T21:21:20Z` intro FindingsJournal ← append-only findings.jsonl (O_APPEND+fsync), F-n нумерация, source:model атрибуция
- [x] `2026-08-06T21:21:20Z` intro Synthesize ← мульти-модель синтез: кластеризация по (file, line bucket, normalized summary), разметка consensus/dispute/unique, запись в findings.jsonl
- [x] `2026-08-06T21:21:20Z` intro GateVerdict ← валидация review.json по §2.1 критериям: verdict, file:line на каждой находке, revision, до 2 попыток → эскалация
- [x] `2026-08-06T21:21:20Z` intro AuthorTail ← подготовка нотификации автору: сводка находок, топ-5, proposed replies
- [x] `2026-08-06T21:21:20Z` intro ReviewerTail ← сводка ревьюверу: recommended verdict, posting candidates, dedup, decision recommendations
- [x] `2026-08-06T21:21:20Z` decision layer1-classification=REUSE_v1 ← TRACK_RULES портированы из cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts, не новый алгоритм (per §3)
- [x] `2026-08-06T21:21:20Z` decision glob-impl=inline ← без внешних зависимостей (мини-конвертер ** / * / ? / {a,b} → regex), чтобы не тянуть picomatch/minimatch
- [x] `2026-08-06T21:21:20Z` decision cluster-key=file:lineBucket:normSummary ← кластеризация по (файл, line/5 bucket, нормализованный summary до 80 символов) — детерминированный дедуп между моделями
- [x] `2026-08-06T21:27:45Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-06T21:27:45Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-pipeline/plan-template.ts, services/agent-inbox/modules/inbox-pipeline/trigger-registry.ts, services/agent-inbox/modules/inbox-pipeline/lens-registry.ts, services/agent-inbox/modules/inbox-pipeline/coverage-gate.ts, services/agent-inbox/modules/inbox-pipeline/findings-journal.ts, services/agent-inbox/modules/inbox-pipeline/synthesize.ts, services/agent-inbox/modules/inbox-pipeline/gate-verdict.ts, services/agent-inbox/modules/inbox-pipeline/tails/author-tail.ts, services/agent-inbox/modules/inbox-pipeline/tails/reviewer-tail.ts]; decisions: [layer1-classification=REUSE_v1, glob-impl=inline, cluster-key=file:lineBucket:normSummary, trigger-starters={deps-vuln|secrets|spec-compliance|migration-safety}, lens-starters={architecture|business|specs|tests|security|optimization|codelines}, coverage-max-continue=2, gate-verdict-max-attempts=2]; open: []

#### P2

- [x] `2026-08-06T21:37:11Z` intro PlanTemplate.test.ts ← 8 cases: contract, deps trigger, 3 layers, 100% coverage, deterministic output, DAG waves
- [x] `2026-08-06T21:37:11Z` intro CoverageGate.test.ts ← 7 cases: pass, fail/missing, partial read, deleted exclusion, binary exclusion, max continue=2, empty checklist
- [x] `2026-08-06T21:37:11Z` intro Synthesize.test.ts ← 6 cases: consensus, dispute, unique, empty, majority, source attribution
- [x] `2026-08-06T21:37:11Z` intro Tails.test.ts ← 10 cases (4 author + 6 reviewer): verdict/summary, empty default, severity order, dispute reply, mark counts, verdict derivation, dedup, skip dispute, recommendations
- [x] `2026-08-06T21:37:11Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-06T21:37:11Z` ver `npm test -- services/agent-inbox/modules/inbox-pipeline/__tests__/` → pass exit=0
- [x] `2026-08-06T21:37:11Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-pipeline/__tests__/plan-template.test.ts, services/agent-inbox/modules/inbox-pipeline/__tests__/coverage-gate.test.ts, services/agent-inbox/modules/inbox-pipeline/__tests__/synthesize.test.ts, services/agent-inbox/modules/inbox-pipeline/__tests__/tails.test.ts]; decisions: [test-runner=node-test, assertion-lib=node:assert/strict, mock-strategy=as-cast-without-mock.fn, coverage-gate-requires-tempfiles=true]; open: []

#### Round close

- [x] 2026-08-06T21:45:00Z sync agent-inbox+root trackers
- [x] 2026-08-06T21:45:00Z DONE

### Round 2 — 2026-08-06, audit-driven fix: F-01 (missing gate-verdict.test.ts)

#### P2 — re-run: fix: address audit finding F-01 — missing gate-verdict.test.ts

- [x] `2026-08-06T21:45:34Z` intro GateVerdict.test.ts ← 8 cases: verdict missing, finding без file:line, empty findings pass, empty summary fail, revision отсутствует, невалидный verdict, isEscalated после 2 попыток, полный review.json pass
- [x] `2026-08-06T21:45:34Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-06T21:45:34Z` ver `npm test -- "services/agent-inbox/modules/inbox-pipeline/__tests__/gate-verdict.test.ts"` → pass exit=0
- [x] `2026-08-06T21:45:34Z` ver `npm test -- "services/agent-inbox/modules/inbox-pipeline/__tests__/*.test.ts"` → pass exit=0
- [x] `2026-08-06T21:45:34Z` discovery sdd verify (full suite): 5 pre-existing integration test failures (full-flow, runMrsOnce — real GitLab env required), unrelated to gate-verdict; all inbox-pipeline gates pass
- [x] `2026-08-06T21:45:34Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-pipeline/__tests__/gate-verdict.test.ts]; decisions: [test-runner=node-test, assertion-lib=node:assert/strict, gate-verdict-test-cases=8, all-inbox-pipeline-tests=39-pass-0-fail]; open: []

#### Round close

- [x] 2026-08-06T22:00:00Z DONE
<!--/SECTION:EXECUTION_LOG-->
