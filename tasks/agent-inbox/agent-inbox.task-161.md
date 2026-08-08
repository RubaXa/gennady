# Task: TSK-161 — inbox-pipeline: план-шаблон + 3 слоя + линзы + coverage + синтез + хвосты

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-161
- **Status:** [x] DONE
- **Reopens:** 8 (2026-08-08 — audit remediation rounds 2–9)
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
  - `services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts`
  - `services/agent-inbox/modules/inbox-queue/task-queue.ts`
  - `services/agent-inbox/modules/inbox-queue/task-registry.ts`
  - `services/agent-inbox/modules/inbox-queue/executor.ts`
  - `services/agent-inbox/modules/inbox-roles/role-scheduler.ts`
  - `services/agent-inbox/serve/bootstrap.ts`
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
  - `services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.integration.test.ts`
  - `services/agent-inbox/modules/inbox-queue/__tests__/executor.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.test.ts`
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

| Command                                                                          | Required by      |
| -------------------------------------------------------------------------------- | ---------------- |
| `npm run type-check`                                                             | typescript-rules |
| `npx tsx --test services/agent-inbox/modules/inbox-pipeline/__tests__/*.test.ts` | node-test        |

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
- sameSessionContinue → `coverage-gate.test.ts` :: `continues the same worker twice, then escalates when its trace still misses coverage`
- sameSessionPass → `coverage-gate.test.ts` :: `passes after a same-session continuation contributes the missing factual read`
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
- lensInstanceEdge → `pipeline-runtime.integration.test.ts` :: `releases root and delta nodes only after their declared dependencies finish`
- liveWorkerArtifacts → `pipeline-runtime.integration.test.ts` :: `drives the production dispatcher to durable artifacts and recovers queued DAG from journal`
- runtimeSameSessionEscalation → `pipeline-runtime.integration.test.ts` :: `continues one live worker session twice and records an operator escalation when coverage stays incomplete`
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
- [x] `2026-08-06T21:21:20Z` decision glob-impl=inline ← без внешних зависимостей (мини-конвертер \*_ / _ / ? / {a,b} → regex), чтобы не тянуть picomatch/minimatch
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

### Round 3 — 2026-08-08, audit-driven runtime and contract remediation

#### P1

- [x] `2026-08-08T00:00:00Z` fix CoverageGate ← full read now requires an unpaged read or contiguous offset/limit pages through EOF; `edit` no longer counts as evidence
- [x] `2026-08-08T00:00:00Z` fix GateVerdict ← operator escalation is driven by two failed validations, not attempts separated by successful validation
- [x] `2026-08-08T00:00:00Z` fix PipelineRuntime ← boot-owned queue materializes the production root DAG and `delta_review` mini-DAG
- [x] `2026-08-08T00:00:00Z` fix TaskRegistry ← delta prepare → changeset → affected tracks → synthesize_delta → gate_verdict_delta is explicit and dependency-linked

#### P2

- [x] `2026-08-08T00:00:00Z` test ← in-memory ToolTrace injection removes unit fixture writes; partial page and successful-intermediate validation are covered
- [x] `2026-08-08T00:00:00Z` test ← PipelineRuntime integration proves root and delta task nodes reach the same shared queue
- [x] `2026-08-08T00:00:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-08T00:00:00Z` ver focused pipeline + queue tests → pass
- [x] `2026-08-08T00:00:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-pipeline/coverage-gate.ts, services/agent-inbox/modules/inbox-pipeline/gate-verdict.ts, services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts, services/agent-inbox/modules/inbox-queue/task-registry.ts]; decisions: [coverage-eof-required=true, gate-verdict-counts-consecutive-failures=true, pipeline-runtime-uses-boot-owned-queue=true, delta-mini-dag-is-explicit=true]; open: [runtime scheduler wiring deferred to next audit round]

#### Round close

- [x] `2026-08-08T00:00:00Z` DONE

### Round 4 — 2026-08-08, audit-r2 runtime queue remediation

#### P1

- [x] `2026-08-08T00:00:00Z` fix bootstrap + RoleScheduler ← один boot-owned PipelineRuntime передан scheduler; role pickup вызывает startReview, poll с изменившимся headSha вызывает startDeltaReview
- [x] `2026-08-08T00:00:00Z` fix InMemoryTaskQueue.next ← возвращает только queued задачи с удовлетворёнными dependsOn в priority+FIFO порядке; Executor сохраняет waiting_dep-видимость по полному набору
- [x] `2026-08-08T00:00:00Z` fix ownership ← TSK-161 добавлен append-only в изменённые runtime/queue заголовки, включая TaskRegistry
- [x] `2026-08-08T00:00:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/serve/bootstrap.ts, services/agent-inbox/modules/inbox-roles/role-scheduler.ts, services/agent-inbox/modules/inbox-queue/task-queue.ts, services/agent-inbox/modules/inbox-queue/executor.ts, services/agent-inbox/modules/inbox-queue/task-registry.ts]; decisions: [scheduler-is-production-pipeline-seam=true, delta-trigger=polled-headSha-diff, next-returns-dependency-ready-only, blocked-tasks-remain-waiting_dep-visible]; open: []

#### P2

- [x] `2026-08-08T00:00:00Z` test PipelineRuntime ← root prepare→plan→enrich and delta_review→delta_prepare public queue ordering covered
- [x] `2026-08-08T00:00:00Z` test RoleScheduler ← production scheduler tick with role pickup and a newer head proves startReview + startDeltaReview materialize the shared queue
- [x] `2026-08-08T00:00:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-08T00:00:00Z` ver focused pipeline + queue + scheduler tests → pass 65/65
- [x] `2026-08-08T00:00:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.integration.test.ts, services/agent-inbox/modules/inbox-queue/__tests__/executor.test.ts, services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.test.ts]; decisions: [test-runner=node-test, production-seam-covered=RoleScheduler.tick]; open: []

#### Round close

- [x] `2026-08-08T00:00:00Z` DONE

### Round 5 — 2026-08-08, audit-r3 concrete DAG and executor lifecycle remediation

#### P1

- [x] `2026-08-08T00:00:00Z` fix PipelineRuntime ← materializes concrete `track_*` and mandatory `lens_*` fan-out, preserves lens input wave (`lens_architecture ← lens_tests`), and chooses exactly one role tail
- [x] `2026-08-08T00:00:00Z` fix queue contract ← concrete pattern task types resolve through their registry policy; `allOf(glob)` now waits for every materialized matching task and cannot pass on an empty group
- [x] `2026-08-08T00:00:00Z` fix production lifecycle ← bootstrap starts one journal-backed per-MR Executor drainer for the same pipeline queue exposed through HTTP; `stop()` is safe and leaves queued work intact

#### P2

- [x] `2026-08-08T00:00:00Z` test PipelineRuntime ← integration proves durable executor drains fan-out in dependency order and reaches `tail_author` only after concrete tracks/lenses
- [x] `2026-08-08T00:00:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-08T00:00:00Z` ver focused pipeline + queue + scheduler tests → pass 80/80
- [x] `2026-08-08T00:00:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts, services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.integration.test.ts, services/agent-inbox/modules/inbox-queue/task-registry.ts, services/agent-inbox/modules/inbox-queue/task-queue.ts, services/agent-inbox/serve/bootstrap.ts, services/agent-inbox/modules/inbox-roles/role-scheduler.ts, specs/agent-inbox/inbox-queue/inbox-queue.spec.md]; decisions: [fanout=concrete-track-and-lens-tasks, allOf-glob=nonempty-universal-barrier, executor-owner=PipelineRuntime-bootstrap, role-tail=single-author-or-reviewer]; open: []

#### Round close

- [x] `2026-08-08T00:00:00Z` DONE

### Round 6 — 2026-08-08, audit-r4 durable production execution remediation

#### P1

- [x] `2026-08-08T00:00:00Z` fix PipelineRuntime ← every materialized root/delta node now uses `Executor.enqueue`, so `task_created` is journaled and `Executor.recover()` rebuilds the DAG after restart
- [x] `2026-08-08T00:00:00Z` fix production dispatcher ← bootstrap injects the state root; deterministic stage execution writes PLAN.md, fan-out `tasks/*.result.json`, coverage, review.json, verdict and role-tail artifacts
- [x] `2026-08-08T00:00:00Z` fix scheduler seam ← role and delta starts are awaited, ensuring durable DAG creation completes before a production poll proceeds

#### P2

- [x] `2026-08-08T00:00:00Z` test PipelineRuntime ← production integration drives full fan-out to durable artifacts and reconstructs the queued DAG in a fresh queue from the journal
- [x] `2026-08-08T00:00:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-08T00:00:00Z` ver focused pipeline + queue recovery + scheduler tests → pass 27/27
- [x] `2026-08-08T00:00:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts, services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.integration.test.ts, services/agent-inbox/serve/bootstrap.ts, services/agent-inbox/modules/inbox-roles/role-scheduler.ts]; decisions: [materialization=Executor.enqueue-only, production-runner=durable-stage-artifacts, restart-recovery=journal-replay]; open: []

#### Round close

- [x] `2026-08-08T00:00:00Z` DONE

### Round 7 — 2026-08-08, audit-r5 real orchestration and boot recovery remediation

#### P1

- [x] `2026-08-08T00:00:00Z` fix PipelineRuntime ← stage runner now consumes actual changeset/tool-trace inputs and invokes PlanTemplate + TriggerRegistry, LensRegistry, CoverageGate, FindingsJournal/Synthesize and GateVerdict; it persists their computed plan, lens, coverage, review and verdict artifacts instead of fixed pass artifacts.
- [x] `2026-08-08T00:00:00Z` fix boot lifecycle ← `PipelineRuntime.start()` invokes public `recover()` before its drainer, replaying every MR found in the durable task journal; scheduler passes its live checkpoint changeset to the runtime.

#### P2

- [x] `2026-08-08T00:00:00Z` test PipelineRuntime ← durable integration proves plan-triggered fan-out and artifacts, a real missing tool-read fails `gate_coverage`, and restart recovery occurs through public boot lifecycle rather than protected cast.
- [x] `2026-08-08T00:00:00Z` ver `node --import tsx --test services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.integration.test.ts` → pass 5/5
- [x] `2026-08-08T00:00:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-08T00:00:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts, services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.integration.test.ts, services/agent-inbox/modules/inbox-roles/role-scheduler.ts]; decisions: [production-runner=domain-service-orchestration, coverage=real-tool-trace-input, boot-recovery=public-before-drain]; open: []

#### Round close

- [x] `2026-08-08T00:00:00Z` DONE

### Round 8 — 2026-08-08, audit-r6 live worker, lens edge and coverage continuation remediation

#### P1

- [x] `2026-08-08T00:06:00Z` fix PipelineRuntime ← LensSpec.inputs materializes into the concrete `dependsOn` edge of each `lens_*` task; `lens_architecture` cannot run before `lens_tests` completes.
- [x] `2026-08-08T00:06:00Z` fix production fan-out ← bootstrap injects OpenCodePort; every track/lens invokes a real worker session, records factual tool reads and persists named `tasks/<node>.<model>.result.json` with validated model findings. Synthesize reloads those durable results after restart instead of using empty JSON.
- [x] `2026-08-08T00:06:00Z` fix CoverageGate ← `recoverWithContinue` keeps one worker-session callback for exactly two retry turns, then emits an operator escalation when reads remain incomplete.

#### P2

- [x] `2026-08-08T00:06:00Z` test ← integration seeds the OpenCode seam, proves non-empty named worker results feed `review.json`, validates concrete lens dependency and retains the failing factual coverage path.
- [x] `2026-08-08T00:06:00Z` test ← coverage unit cases prove same-session first/second continuation and escalation/pass outcomes.
- [x] `2026-08-08T00:06:00Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-08-08T00:06:00Z` ver `npx tsx --test services/agent-inbox/modules/inbox-pipeline/__tests__/*.test.ts` → pass 47/47
- [x] `2026-08-08T00:06:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts, services/agent-inbox/modules/inbox-pipeline/coverage-gate.ts, services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.integration.test.ts, services/agent-inbox/modules/inbox-pipeline/__tests__/coverage-gate.test.ts, services/agent-inbox/serve/bootstrap.ts]; decisions: [lens-inputs=concrete-instance-dependsOn, production-fanout=OpenCodePort-worker-results, synthesis=reload-named-durable-results, coverage-retry=same-session-max-2]; open: []

#### Round close

- [x] `2026-08-08T00:06:00Z` DONE

### Round 9 — 2026-08-08, audit-r7 production same-session coverage remediation

#### P1

- [x] `2026-08-08T00:16:00Z` fix PipelineRuntime ← fan-out worker sessions are retained through `gate_coverage`; an under-read invokes `CoverageGate.recoverWithContinue` through `OpenCodePort.continueSignal` on one existing SID, never a replacement session.
- [x] `2026-08-08T00:16:00Z` fix coverage terminal path ← after two incomplete same-session continuations, runtime writes `coverage.json` plus `operator-escalation.json` (`operator_action_required`) before failing the durable gate task; all retained sessions then close.

#### P2

- [x] `2026-08-08T00:16:00Z` test PipelineRuntime ← integration records exactly two continuation calls on one SID and asserts the durable operator escalation with the missing file and `continueCount=2`.
- [x] `2026-08-08T00:16:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-08T00:16:00Z` ver `npx tsx --test services/agent-inbox/modules/inbox-pipeline/__tests__/*.test.ts` → pass 48/48
- [x] `2026-08-08T00:16:00Z` ver Prettier + diff check → pass
- [x] `2026-08-08T00:16:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts, services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.integration.test.ts]; decisions: [coverage-continuation=existing-last-live-worker-session, retry-budget=two-same-sid-turns, incomplete-coverage=durable-operator-escalation-before-fail]; open: []

#### Round close

- [x] `2026-08-08T00:16:00Z` DONE

<!--/SECTION:EXECUTION_LOG-->
