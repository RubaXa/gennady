# Task: TSK-97 — Autonomous adaptive SDD execution

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-97
- **Status:** [x] DONE
- **Purpose:** Сохранить автономность `sdd-execute` при безопасно разрешимых расхождениях spec/task/runtime и предъявить принятые решения оператору после проверки.
- **Scope:** ai-skills
- **Module:** sdd-skills
- **Dependencies:** None
- **Reopens:** 5 (2026-09-02 — Audit Round 9 findings F-01–F-02)
- **Spec References:**
  - Module: [`sdd-skills` §4 `OrchestratorProtocol`, `HandoffPayload`](../../../specs/ai-skills/sdd-skills/sdd-skills.spec.md)
  - Decisions: [`sdd-skills` D-M003, D-M004](../../../specs/ai-skills/sdd-skills/sdd-skills.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `integration`, `smoke`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status   |
| --- | ---- | ---- | -------- |
| P1  | impl | —    | [x] DONE |
| P2  | test | P1   | [x] DONE |
| P3  | docs | P1   | [x] DONE |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Сохранить разные обязанности critic/audit и передать orchestration сохранение результата, маршрутизацию каждого finding и повторный запуск.
- **Rules:**
  - None — prompt and specification artifacts do not activate coding/testing/infra rules.
- **Target Files:**
  - `ai/directives/sdd/phase-execution-protocol.xml`
  - `ai/directives/sdd/scaffold.directive.xml`
  - `ai/directives/sdd/audit.directive.xml`
  - `ai/directives/sdd/critic.directive.xml`
  - `ai/skills/sdd-execute/SKILL.md`
  - `ai/skills/sdd-execute-batch/SKILL.md`
  - `ai/skills/sdd-audit/SKILL.md`
  - `ai/skills/sdd-check/SKILL.md`
- **Inputs:** independent simulations of TSK-23, TSK-56 and TSK-97.
- **Exit:** critic сохраняет компактный CLEAN; audit автономно возвращает terminal result; execution обрабатывает все finding owners.
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Покрыть контракт автономного flow и воспроизводимый false positive `[RULES]` механическими тестами.
- **Rules:**
  - `ai/directives/coding/typescript-rules.xml`
  - `ai/directives/testing/node-test.xml`
  - `ai/directives/testing/common.xml`
- **Target Files:**
  - `ai/skills/sdd-execute/scripts/check.sh`
  - `ai/skills/sdd-execute/scripts/_sdd-lib.sh`
  - `ai/skills/sdd-execute/scripts/scan.sh`
  - `ai/skills/sdd-execute/scripts/sdd`
  - `ai/skills/sdd-execute/scripts/extract-section.sh`
  - `scripts/__tests__/directive-markup-contract.test.ts`
  - `scripts/__tests__/critic-directive-contract.test.ts`
  - `scripts/__tests__/sdd-adaptive-execution-contract.test.ts`
  - `scripts/__tests__/sdd-review-lifecycle-contract.test.ts`
  - `scripts/__tests__/sdd-check-log.test.ts`
  - `scripts/__tests__/sdd-check-rules.test.ts`
- **Inputs:** P1 execution and audit contract.
- **Exit:** tests подтверждают перенос решения, автономный audit, critic evidence, mixed finding routes и legacy fallback.
<!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->

### P3 — docs

- **Objective:** Описать автономный выбор, проверку и операторский backflow в основном SDD flow.
- **Rules:**
  - None — documentation artifacts do not activate coding/testing/infra rules.
- **Target Files:**
  - `docs/sdd-flow.md`
  - `AGENTS.md`
  - `ai/skills/README.md`
  - `ai/directives/sdd/README.md`
  - `ai/skills/sdd-execute/scripts/README.md`
- **Inputs:** P1 and P2 contracts.
- **Exit:** docs show decision/insight → Handoff → audit PASS/FAIL → operator refine/reopen/follow-up.
<!--/SECTION:PHASE_P3-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** Autonomous adaptive execution

**Scenario:** Safe mismatch does not stop execution [`contract`]

- **Given** phase execution finds a spec/task/runtime mismatch with a verifiable option preserving named functional and Vision requirements
- **When** the phase applies the option
- **Then** it records `decision` and, when canonical text is stale, `insight` in the task Execution Log
- **And** Handoff carries the choice to subsequent phases and audit

**Scenario:** Audit validates the resulting behavior [`contract`]

- **Given** a phase continued through a non-routine choice
- **When** fresh-eyes audit runs
- **Then** it verifies behavior against spec, BDD, tests, and implementation evidence
- **And** routes stale canonical text as `INSIGHT_BACKFLOW`

**Scenario:** Operator reviews backflow after execution [`contract`]

- **Given** audit returned PASS with decision or insight entries
- **When** execute prints the final summary
- **Then** it groups the audited choices and backflow proposals once
- **And** the operator routes them through refine, reopen, or follow-up

**Scenario:** Protocol references stay outside the rules cascade [`integration`]

- **Given** a task names an SDD protocol in Target Files and coding/testing/infra rules in Rules
- **When** `sdd check --task` resolves activated rules
- **Then** it checks only the cited cascade-rule files

**Scenario:** Critic and audit keep separate responsibilities [`contract`]

- **Given** critic reviews task/spec before execution and audit reviews implementation after execution
- **When** either role reaches a terminal result
- **Then** its result is persisted without merging the roles' criteria

**Scenario:** Mixed audit findings all receive an owner [`contract`]

- **Given** one FAIL contains phase, ticket, spec, and project findings
- **When** execution resolves the audit result
- **Then** every finding is processed once by its explicit route and phase owner
- **And** document findings are not discarded when phase fixes are present

**Scenario:** Automated audit has no hidden operator pause [`contract`]

- **Given** execution dispatches a fresh audit subagent
- **When** the audit runs its checks
- **Then** it persists and returns one terminal result without intermediate approval

**Scenario:** Readable legacy ticket remains executable [`contract`]

- **Given** an older ticket has no normative section anchors but its sections are unambiguous
- **When** phase execution and audit read it
- **Then** both use full-file fallback and audit records at most a non-blocking ticket update

**Scenario:** Review quality follows the configured runtime [`contract`]

- **Given** execution dispatches a phase, critic, or audit in fresh context
- **When** the subagent is created
- **Then** it inherits the caller's configured model without a provider-specific model pin
- **And** activation and internal step transitions are not narrated to the operator

**Scenario:** Audit converges without operator attempt tokens [`contract`]

- **Given** an audit returns blocking findings and the orchestrator applies their owned remediations
- **When** a fresh audit closes at least one preceding blocking finding
- **Then** execution continues autonomously regardless of the numeric audit round
- **And** it blocks only when an equivalent finding set returns without new evidence or a different in-scope remediation, or needs an external/requirements decision

**Scenario:** Execution invocation does not require duplicate authorization [`contract`]

- **Given** the operator invokes single or batch execution
- **When** a deterministic task or batch plan is available
- **Then** execution reports the selection and starts without another confirmation
- **And** it pauses only for an actual requirements, external-state, or unresolved-blocker decision

**Scenario:** Runtime claims require executed evidence [`contract`]

- **Given** a phase log or script contains a verification command or runtime claim
- **When** audit determines PASS or FAIL
- **Then** a printed command or static code reading alone is not treated as runtime proof
- **And** runnable acceptance behavior is checked by a bounded command or probe with an observed result

**Scenario:** Reopens records audit causation [`integration`]

- **Given** a ticket contains initial, investigative, and audit-triggered Execution Rounds
- **When** `sdd check` validates Meta `Reopens`
- **Then** it counts persisted audit records whose `triggered-reopen` is not `none`
- **And** validates audit ↔ phase-owned finding causation in both directions
- **And** a latest declared reopen without its Round is `PENDING`, while unrelated Execution Round headers do not increment the counter

**Scenario:** Batch reuses the canonical task lifecycle [`contract`]

- **Given** a queue contains TODO, IN_PROGRESS, audit-only, blocked, and dependent tasks in one worktree
- **When** batch execution runs
- **Then** it schedules one canonical `sdd-execute` lane at a time and refreshes dependencies after every terminal state
- **And** its invocation-local terminal registry prevents repeated dispatch of PAUSED/FAILED lanes
- **And** it does not duplicate retry/audit logic or mix concurrent task diffs and tracker writes

**Scenario:** Scaffolded Round is filled rather than duplicated [`contract`]

- **Given** a fresh ticket already contains the scaffolded Round 1 phase skeletons
- **When** the first phase starts
- **Then** it fills the unique existing phase block in place and does not append another Round or phase header

**Scenario:** Persisted audit failure is resumable [`contract`]

- **Given** every phase is DONE and the latest persisted audit is FAIL
- **When** execution resumes after interruption
- **Then** it routes that terminal record from step 6 before opening any selective-fix Round

**Scenario:** Current Task-ID convention is mechanically checkable [`integration`]

- **Given** a ticket uses a prefixed Task-ID and a non-legacy filename
- **When** `sdd check --task TSK-{PREFIX}-{NNN}` runs
- **Then** it resolves identity from ticket Meta and performs the same checks as for legacy `TSK-NN`
- **And** a valid but nonexistent ID returns a counted `missing` finding rather than clean output

**Scenario:** Fabricated checked evidence is detected mechanically [`integration`]

- **Given** a checked Execution Log protocol line retains a known scaffold placeholder
- **When** `sdd check` scans the log
- **Then** it emits a counted `fabricated-placeholder` finding
- **And** the same literal in ordinary `decision`/`insight` prose is not classified as fabricated closing evidence

**Scenario:** Audit and orchestrator have explicit remediation authority [`contract`]

- **Given** audit has produced evidence and owned routes
- **When** execution handles the result
- **Then** audit has changed no implementation or contract artifact beyond appending its evidence record
- **And** the orchestrator applies only exact bounded corrections while requirement, Vision, external-state, risk, and optional insight choices remain with the operator

**Scenario:** Audit and Execution Rounds advance independently [`contract`]

- **Given** a document-only correction requires a fresh audit without an Execution Round
- **When** the orchestrator dispatches the audit
- **Then** it passes the next Audit Round number and current closed Execution Round number as distinct fields

**Scenario:** Risk acknowledgement cannot be manufactured [`contract`]

- **Given** audit routes a proposed `decision-log` acknowledgement
- **When** execution handles the finding
- **Then** it pauses for the operator and never writes acceptance autonomously
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                                                                                                                                                                                                | Required by      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `bash -n ai/skills/sdd-execute/scripts/check.sh ai/skills/sdd-execute/scripts/scan.sh ai/skills/sdd-execute/scripts/_sdd-lib.sh ai/skills/sdd-execute/scripts/sdd ai/skills/sdd-execute/scripts/extract-section.sh`                                                                                                                    | shell-sanity     |
| `node --import tsx --test scripts/__tests__/directive-markup-contract.test.ts scripts/__tests__/critic-directive-contract.test.ts scripts/__tests__/sdd-adaptive-execution-contract.test.ts scripts/__tests__/sdd-review-lifecycle-contract.test.ts scripts/__tests__/sdd-check-log.test.ts scripts/__tests__/sdd-check-rules.test.ts` | P2               |
| `npm run type-check`                                                                                                                                                                                                                                                                                                                   | project gate     |
| `npm test -- --test-concurrency=1`                                                                                                                                                                                                                                                                                                     | regression       |
| `npm run format:check`                                                                                                                                                                                                                                                                                                                 | formatting       |
| `npm run build:publish`                                                                                                                                                                                                                                                                                                                | deployed surface |
| `npm_config_cache=/tmp/gennady-npm-cache npm run test:smoke`                                                                                                                                                                                                                                                                           | packaged runtime |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- `scripts/__tests__/sdd-adaptive-execution-contract.test.ts` :: `uses the existing Execution Log and Handoff for safe runtime choices`
- `scripts/__tests__/sdd-adaptive-execution-contract.test.ts` :: `audits choices through the existing finding taxonomy and persists PASS`
- `scripts/__tests__/sdd-adaptive-execution-contract.test.ts` :: `reports audited decisions and backflow proposals at the end`
- `scripts/__tests__/sdd-check-rules.test.ts` :: `task mode ignores cited SDD protocols outside rule cascade categories`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `keeps critic and audit as separate roles with durable terminal results`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `processes phase and artifact findings from the same FAIL`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `lets a dispatched audit reach one terminal result without operator interaction`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `accepts readable legacy tickets and blocks only ambiguous structure`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `inherits the configured model for every fresh reviewer and executor`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `applies dispatched directives without exposing activation machinery`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `continues improving audit rounds without an operator attempt token`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `treats an execution invocation as authorization instead of requesting it twice`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `requires executed evidence and keeps harmless paper drift non-blocking`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `defines Reopens from persisted audit causation in every owner`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `keeps one per-task lifecycle and makes batch a serial adaptive scheduler`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `separates audit evidence from autonomous bounded remediation authority`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `reuses scaffolded execution skeletons instead of duplicating Round headers`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `resumes a persisted audit FAIL without re-running completed phases blindly`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `keeps standalone audit and check on the loaded installation and shared mechanics`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `keeps audit numbering independent from execution numbering`
- `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` :: `requires the operator to own risk acknowledgement and decision-log acceptance`
- `scripts/__tests__/sdd-check-log.test.ts` :: `counts only audit-triggered reopens`
- `scripts/__tests__/sdd-check-log.test.ts` :: `flags Reopens metadata that counts unrelated execution rounds`
- `scripts/__tests__/sdd-check-log.test.ts` :: `flags a fabricated checked line that still contains scaffold placeholders`
- `scripts/__tests__/sdd-check-log.test.ts` :: `allows scaffold-like literals in checked engineering event prose`
- `scripts/__tests__/sdd-check-log.test.ts` :: `discovers current prefixed Task-IDs independently of legacy ticket filenames`
- `scripts/__tests__/sdd-check-log.test.ts` :: `does not return clean for a well-formed but nonexistent prefixed Task-ID`
- `scripts/__tests__/sdd-check-log.test.ts` :: `flags a triggered reopen whose target round is not caused by the preceding audit`
- `scripts/__tests__/sdd-check-log.test.ts` :: `flags a phase-owned audit finding that falsely declares no reopen`
- `scripts/__tests__/sdd-check-log.test.ts` :: `reports the latest causative audit as pending until its declared Round is created`
- HTML-like directive semantics → `scripts/__tests__/directive-markup-contract.test.ts`.
- Existing Execution Log vocabulary → `scripts/__tests__/sdd-check-log.test.ts`.
- Published directives and skills → `npm run build:publish` + packaged smoke.
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-09-01, implementation

#### P1

- [x] `2026-09-01T19:05:00+03:00` decision `mismatch-handling=continue-when-verifiable` ← Execution Log, Handoff and audit already carry the choice through the full lifecycle
- [x] `2026-09-01T19:07:00+03:00` ver `architectural contract review` → pass exit=0
- [x] `2026-09-01T19:07:01+03:00` DONE

**Handoff →** artifacts: [spec, phase/scaffold/audit directives, execute/audit skills]; decisions: [mismatch-handling=continue-when-verifiable]; open: []

#### P2

- [x] `2026-09-01T19:10:00+03:00` ver `node --import tsx --test scripts/__tests__/directive-markup-contract.test.ts scripts/__tests__/sdd-adaptive-execution-contract.test.ts scripts/__tests__/sdd-check-log.test.ts scripts/__tests__/sdd-check-rules.test.ts` → pass exit=0
- [x] `2026-09-01T19:10:01+03:00` ver `npm run type-check` → pass exit=0
- [x] `2026-09-01T19:10:02+03:00` ver `npm test -- --test-concurrency=1` → pass exit=0
- [x] `2026-09-01T19:10:03+03:00` ver `npm run format:check` → pass exit=0
- [x] `2026-09-01T19:10:04+03:00` ver `npm run build:publish` → pass exit=0
- [x] `2026-09-01T19:10:05+03:00` ver `npm_config_cache=/tmp/gennady-npm-cache npm run test:smoke` → pass exit=0
- [x] `2026-09-01T19:10:06+03:00` DONE

**Handoff →** artifacts: [check.sh, directive-markup/behavior/log/rules tests]; decisions: [mechanical tests cover observable contracts]; open: []

#### P3

- [x] `2026-09-01T19:12:00+03:00` ver `documentation contract review` → pass exit=0
- [x] `2026-09-01T19:12:01+03:00` DONE

**Handoff →** artifacts: [docs/sdd-flow.md, SDD README, script README]; decisions: [operator backflow is shown after audit]; open: []

#### Round close

- [x] `2026-09-01T19:12:02+03:00` DONE

### Round 2 — 2026-09-01, independent review lifecycle simulation

#### P1

- [x] `2026-09-01T20:05:00+03:00` discovery independent simulations reproduced a valid selective audit loop on TSK-23 and orchestration contradictions on TSK-56/TSK-97
- [x] `2026-09-01T20:06:00+03:00` decision `review-roles=separate` ← critic keeps pre-execution criteria; audit keeps post-execution criteria; execution owns remediation transitions
- [x] `2026-09-01T20:10:00+03:00` ver `npm run type-check` → pass exit=0
- [x] `2026-09-01T20:10:01+03:00` DONE

**Handoff →** artifacts: [critic/audit directives, execute skills, module spec]; decisions: [review-roles=separate, remediation=per-finding-owner]; open: []

#### P2

- [x] `2026-09-01T20:18:00+03:00` ver `node --import tsx --test scripts/__tests__/directive-markup-contract.test.ts scripts/__tests__/critic-directive-contract.test.ts scripts/__tests__/sdd-adaptive-execution-contract.test.ts scripts/__tests__/sdd-review-lifecycle-contract.test.ts scripts/__tests__/sdd-check-log.test.ts scripts/__tests__/sdd-check-rules.test.ts` → 32 pass exit=0
- [x] `2026-09-01T20:18:01+03:00` ver `npm test -- --test-concurrency=1` → 1434 pass, 1 skip exit=0
- [x] `2026-09-01T20:18:02+03:00` DONE

**Handoff →** artifacts: [review lifecycle contract tests]; decisions: []; open: []

#### P3

- [x] `2026-09-01T20:18:03+03:00` ver `skip:doc-phase` → documentation-only phase
- [x] `2026-09-01T20:18:04+03:00` DONE

**Handoff →** artifacts: [SDD flow docs]; decisions: []; open: []

#### Round close

- [x] `2026-09-01T20:18:05+03:00` DONE

### Round 3 — 2026-09-01, audit-driven lifecycle contract closure

#### P1

- [x] `2026-09-01T20:30:00+03:00` decision `risk-status=keep-existing-token` ← remove the PR-local `PASS_RISK` alias instead of creating a protocol migration
- [x] `2026-09-01T20:31:00+03:00` ver `ai/skills/sdd-execute/scripts/sdd verify --wip specs/ai-skills/sdd-skills/sdd-skills.spec.md ai/directives/sdd/phase-execution-protocol.xml ai/directives/sdd/scaffold.directive.xml ai/directives/sdd/audit.directive.xml ai/directives/sdd/critic.directive.xml ai/skills/sdd-execute/SKILL.md ai/skills/sdd-execute-batch/SKILL.md ai/skills/sdd-audit/SKILL.md` → ALL_GATES_PASS (4/4) exit=0
- [x] `2026-09-01T20:31:01+03:00` DONE

**Handoff →** artifacts: [specs/ai-skills/sdd-skills/sdd-skills.spec.md, ai/directives/sdd/phase-execution-protocol.xml, ai/directives/sdd/scaffold.directive.xml, ai/directives/sdd/audit.directive.xml, ai/directives/sdd/critic.directive.xml, ai/skills/sdd-execute/SKILL.md, ai/skills/sdd-execute-batch/SKILL.md, ai/skills/sdd-audit/SKILL.md]; decisions: [review-roles=separate, remediation=per-finding-owner, risk-status=keep-existing-token]; open: []

#### P2

- [x] `2026-09-01T20:32:00+03:00` ver `node --import tsx --test scripts/__tests__/directive-markup-contract.test.ts scripts/__tests__/critic-directive-contract.test.ts scripts/__tests__/sdd-adaptive-execution-contract.test.ts scripts/__tests__/sdd-review-lifecycle-contract.test.ts scripts/__tests__/sdd-check-log.test.ts scripts/__tests__/sdd-check-rules.test.ts` → 33 pass exit=0
- [x] `2026-09-01T20:32:30+03:00` ver `ai/skills/sdd-execute/scripts/sdd verify --wip ai/skills/sdd-execute/scripts/check.sh scripts/__tests__/directive-markup-contract.test.ts scripts/__tests__/critic-directive-contract.test.ts scripts/__tests__/sdd-adaptive-execution-contract.test.ts scripts/__tests__/sdd-review-lifecycle-contract.test.ts scripts/__tests__/sdd-check-log.test.ts scripts/__tests__/sdd-check-rules.test.ts` → ALL_GATES_PASS (4/4) exit=0
- [x] `2026-09-01T20:32:31+03:00` DONE

**Handoff →** artifacts: [ai/skills/sdd-execute/scripts/check.sh, scripts/__tests__/directive-markup-contract.test.ts, scripts/__tests__/critic-directive-contract.test.ts, scripts/__tests__/sdd-adaptive-execution-contract.test.ts, scripts/__tests__/sdd-review-lifecycle-contract.test.ts, scripts/__tests__/sdd-check-log.test.ts, scripts/__tests__/sdd-check-rules.test.ts]; decisions: [mechanical-tests=observable-contracts]; open: []

#### P3

- [x] `2026-09-01T20:33:00+03:00` ver `ai/skills/sdd-execute/scripts/sdd verify --wip docs/sdd-flow.md AGENTS.md ai/directives/sdd/README.md ai/skills/sdd-execute/scripts/README.md tasks/README.md tasks/ai-skills/README.md tasks/ai-skills/sdd-skills/sdd-skills.task-97.md` → ALL_GATES_PASS (4/4) exit=0
- [x] `2026-09-01T20:33:01+03:00` DONE

**Handoff →** artifacts: [docs/sdd-flow.md, AGENTS.md, ai/directives/sdd/README.md, ai/skills/sdd-execute/scripts/README.md, tasks/README.md, tasks/ai-skills/README.md, tasks/ai-skills/sdd-skills/sdd-skills.task-97.md]; decisions: [operator-backflow=after-terminal-audit]; open: []

#### Round close

- [x] `2026-09-01T20:33:02+03:00` DONE

### Round 4 — 2026-09-01, audit-driven cascade and phase-scope closure

#### P1

- [x] `2026-09-01T21:01:00+03:00` insight module orchestration contract belongs to canonical spec backflow, not phase-owned output → `sdd-skills.spec.md` D-M004, spec-edit applied outside phase
- [x] `2026-09-01T21:02:00+03:00` ver `ai/skills/sdd-execute/scripts/sdd verify --wip ai/directives/sdd/phase-execution-protocol.xml ai/directives/sdd/scaffold.directive.xml ai/directives/sdd/audit.directive.xml ai/directives/sdd/critic.directive.xml ai/skills/sdd-execute/SKILL.md ai/skills/sdd-execute-batch/SKILL.md ai/skills/sdd-audit/SKILL.md` → ALL_GATES_PASS (4/4) exit=0
- [x] `2026-09-01T21:02:01+03:00` DONE

**Handoff →** artifacts: []; decisions: [spec-edit=orchestrator-owned]; open: []

#### P2

- [x] `2026-09-01T21:03:00+03:00` ver `node --import tsx --test scripts/__tests__/directive-markup-contract.test.ts scripts/__tests__/critic-directive-contract.test.ts scripts/__tests__/sdd-adaptive-execution-contract.test.ts scripts/__tests__/sdd-review-lifecycle-contract.test.ts scripts/__tests__/sdd-check-log.test.ts scripts/__tests__/sdd-check-rules.test.ts` → 33 pass exit=0
- [x] `2026-09-01T21:03:30+03:00` ver `ai/skills/sdd-execute/scripts/sdd verify --wip ai/skills/sdd-execute/scripts/check.sh scripts/__tests__/directive-markup-contract.test.ts scripts/__tests__/critic-directive-contract.test.ts scripts/__tests__/sdd-adaptive-execution-contract.test.ts scripts/__tests__/sdd-review-lifecycle-contract.test.ts scripts/__tests__/sdd-check-log.test.ts scripts/__tests__/sdd-check-rules.test.ts` → fail exit=1, one parallel regression failure
- [x] `2026-09-01T21:04:00+03:00` discovery parallel full-suite failure did not reproduce under the canonical sequential diagnostic run
- [x] `2026-09-01T21:05:00+03:00` ver `npm test -- --test-concurrency=1` → 1435 pass, 1 skip exit=0
- [x] `2026-09-01T21:06:00+03:00` ver `ai/skills/sdd-execute/scripts/sdd verify --wip ai/skills/sdd-execute/scripts/check.sh scripts/__tests__/directive-markup-contract.test.ts scripts/__tests__/critic-directive-contract.test.ts scripts/__tests__/sdd-adaptive-execution-contract.test.ts scripts/__tests__/sdd-review-lifecycle-contract.test.ts scripts/__tests__/sdd-check-log.test.ts scripts/__tests__/sdd-check-rules.test.ts` → ALL_GATES_PASS (4/4) exit=0
- [x] `2026-09-01T21:06:01+03:00` DONE

**Handoff →** artifacts: [scripts/__tests__/sdd-review-lifecycle-contract.test.ts]; decisions: [phase-anchors=policy-bearing-test-phases]; open: []

#### P3

- [x] `2026-09-01T21:07:00+03:00` ver `ai/skills/sdd-execute/scripts/sdd verify --wip docs/sdd-flow.md AGENTS.md ai/skills/README.md ai/directives/sdd/README.md ai/skills/sdd-execute/scripts/README.md` → ALL_GATES_PASS (4/4) exit=0
- [x] `2026-09-01T21:07:01+03:00` DONE

**Handoff →** artifacts: [ai/skills/README.md]; decisions: [canonical-skill-docs=synchronized]; open: []

#### Round close

- [x] `2026-09-01T21:07:02+03:00` DONE

### Round 5 — 2026-09-01, audit-driven test anchor closure

#### P2

- [x] `2026-09-01T21:16:00+03:00` ver `node --import tsx --test scripts/__tests__/directive-markup-contract.test.ts scripts/__tests__/critic-directive-contract.test.ts scripts/__tests__/sdd-adaptive-execution-contract.test.ts scripts/__tests__/sdd-review-lifecycle-contract.test.ts scripts/__tests__/sdd-check-log.test.ts scripts/__tests__/sdd-check-rules.test.ts` → 33 pass exit=0
- [x] `2026-09-01T21:17:00+03:00` ver `ai/skills/sdd-execute/scripts/sdd verify --wip ai/skills/sdd-execute/scripts/check.sh scripts/__tests__/directive-markup-contract.test.ts scripts/__tests__/critic-directive-contract.test.ts scripts/__tests__/sdd-adaptive-execution-contract.test.ts scripts/__tests__/sdd-review-lifecycle-contract.test.ts scripts/__tests__/sdd-check-log.test.ts scripts/__tests__/sdd-check-rules.test.ts` → ALL_GATES_PASS (4/4) exit=0
- [x] `2026-09-01T21:17:01+03:00` DONE

**Handoff →** artifacts: [scripts/__tests__/critic-directive-contract.test.ts, scripts/__tests__/sdd-check-log.test.ts]; decisions: [phase-anchors=all-changed-policy-phases]; open: []

#### Round close

- [x] `2026-09-01T21:17:02+03:00` DONE

### Round 6 — 2026-09-02, report-driven flow architecture review

#### P1

- [x] `2026-09-02T13:12:00+03:00` decision `batch=serial-canonical-lifecycle` ← one shared worktree cannot isolate concurrent task diff, audit evidence, or tracker writes
- [x] `2026-09-02T13:23:00+03:00` decision `authority=audit-proposes-orchestrator-bounded-operator-contract` ← only exact requirement-preserving corrections are autonomous; decision-log and optional backflow remain operator-owned
- [x] `2026-09-02T13:44:00+03:00` ver `three independent post-change flow simulations` → single PASS, batch PASS, audit-mechanics PASS exit=0
- [x] `2026-09-02T13:44:01+03:00` DONE

**Handoff →** artifacts: [single/batch execution skills, phase/scaffold/audit directives, audit/check skills]; decisions: [one canonical lifecycle, serial shared-worktree queue, distinct audit/execution rounds, resumable persisted FAIL]; open: []

#### P2

- [x] `2026-09-02T13:48:00+03:00` ver `bash -n ai/skills/sdd-execute/scripts/check.sh ai/skills/sdd-execute/scripts/scan.sh ai/skills/sdd-execute/scripts/_sdd-lib.sh ai/skills/sdd-execute/scripts/sdd ai/skills/sdd-execute/scripts/extract-section.sh` → pass exit=0
- [x] `2026-09-02T13:48:01+03:00` ver `node --import tsx --test scripts/__tests__/directive-markup-contract.test.ts scripts/__tests__/critic-directive-contract.test.ts scripts/__tests__/sdd-adaptive-execution-contract.test.ts scripts/__tests__/sdd-review-lifecycle-contract.test.ts scripts/__tests__/sdd-check-log.test.ts scripts/__tests__/sdd-check-rules.test.ts` → 55 pass exit=0
- [x] `2026-09-02T13:48:02+03:00` ver `npm run type-check` → pass exit=0
- [x] `2026-09-02T13:48:03+03:00` ver `npm test -- --test-concurrency=1` → 1457 pass, 1 skip exit=0
- [x] `2026-09-02T13:48:04+03:00` DONE

**Handoff →** artifacts: [check/_sdd-lib/scan scripts, lifecycle and log contract tests]; decisions: [prefixed Task-ID=Meta identity, Reopens=bidirectional causation, checked-placeholder=closing tokens only]; open: []

#### P3

- [x] `2026-09-02T13:55:00+03:00` ver `npm run format:check` → pass exit=0
- [x] `2026-09-02T13:57:00+03:00` ver `npm run build:publish` → pass exit=0
- [x] `2026-09-02T13:59:00+03:00` ver `npm_config_cache=/tmp/gennady-npm-cache npm run test:smoke` → 3 pass exit=0
- [x] `2026-09-02T13:59:01+03:00` DONE

**Handoff →** artifacts: [docs/sdd-flow.md, SDD READMEs, module spec, task/tracker state]; decisions: [batch docs match serial scheduler, tool paths resolve loaded installation]; open: []

#### Round close

- [x] `2026-09-02T14:00:00+03:00` DONE

### Round 7 — 2026-09-02, audit-driven PR review closure

#### P1

- [x] `2026-09-02T14:24:00+03:00` decision `placeholder-check=token-aware-required-fields` ← catch fabricated protocol evidence without treating arbitrary HTML-like or generic prose as a placeholder
- [x] `2026-09-02T14:32:00+03:00` decision `anchor-empty=distinct-corruption` ← present empty current-format sections cannot enter readable-legacy fallback
- [x] `2026-09-02T14:41:00+03:00` decision `tracker-exemption=active-task-only` ← unrelated tracker edits remain visible to diff audit
- [x] `2026-09-02T14:49:00+03:00` ver `review lifecycle contract probes` → fix-phase BLOCKED, anchor exits, tracker scope, and semantic phase ownership pass exit=0
- [x] `2026-09-02T14:49:01+03:00` DONE

**Handoff →** artifacts: [phase/scaffold/audit directives, canonical execute lifecycle]; decisions: [fix-phase BLOCKED leaves Round open, ANCHOR_EMPTY exit=5, control-plane exemption is task-bounded]; open: []

#### P2

- [x] `2026-09-02T14:52:00+03:00` decision `rule-path=one-shared-predicate` ← tree and task scans must recognize the same canonical cascade categories
- [x] `2026-09-02T14:55:00+03:00` ver `bash -n ai/skills/sdd-execute/scripts/check.sh ai/skills/sdd-execute/scripts/scan.sh ai/skills/sdd-execute/scripts/_sdd-lib.sh ai/skills/sdd-execute/scripts/sdd ai/skills/sdd-execute/scripts/extract-section.sh` → pass exit=0
- [x] `2026-09-02T14:56:00+03:00` ver `node --import tsx --test scripts/__tests__/directive-markup-contract.test.ts scripts/__tests__/critic-directive-contract.test.ts scripts/__tests__/sdd-adaptive-execution-contract.test.ts scripts/__tests__/sdd-review-lifecycle-contract.test.ts scripts/__tests__/sdd-check-log.test.ts scripts/__tests__/sdd-check-rules.test.ts` → 59 pass exit=0
- [x] `2026-09-02T14:57:00+03:00` ver `npm run type-check` → pass exit=0
- [x] `2026-09-02T15:03:00+03:00` ver `npm test -- --test-concurrency=1` → 1461 pass, 1 skip exit=0
- [x] `2026-09-02T15:03:01+03:00` DONE

**Handoff →** artifacts: [check/_sdd-lib/extract scripts, log/rules/lifecycle/adaptive contract tests]; decisions: [architecture/coding/infra/quality/testing share one rule predicate, exact operator-summary anchors replace no-op assertions]; open: []

#### P3

- [x] `2026-09-02T15:04:00+03:00` ver `npm run format:check` → pass exit=0
- [x] `2026-09-02T15:05:00+03:00` ver `npm run build:publish` → pass exit=0
- [x] `2026-09-02T15:06:00+03:00` ver `npm_config_cache=/tmp/gennady-npm-cache npm run test:smoke` → 3 pass exit=0
- [x] `2026-09-02T15:06:01+03:00` DONE

**Handoff →** artifacts: [module spec and PR evidence]; decisions: [review findings and regression proof are part of the same task history]; open: []

#### Round close

- [x] `2026-09-02T15:06:02+03:00` DONE

### Round 8 — 2026-09-02, review-summary findings closure

#### P1

- [x] `2026-09-02T15:48:00+03:00` decision `audit-persistence=validated-candidate-then-single-caller-write` ← append-only history cannot accept a malformed record and later pretend it was superseded
- [x] `2026-09-02T15:52:00+03:00` decision `low-confidence=non-blocking-observation` ← uncertainty must remain visible without authorizing autonomous remediation or adding an interactive halt
- [x] `2026-09-02T15:56:00+03:00` ver `review-summary contract inspection` → confidence has a verdict role and malformed audit candidates stay unpersisted exit=0
- [x] `2026-09-02T15:56:01+03:00` DONE

**Handoff →** artifacts: [ai/directives/sdd/audit.directive.xml, ai/skills/sdd-execute/SKILL.md, ai/skills/sdd-audit/SKILL.md]; decisions: [caller owns single validated persistence, LOW cannot cause FAIL or mutation]; open: []

#### P2

- [x] `2026-09-02T16:00:00+03:00` ver `node --import tsx --test --test-concurrency=1 scripts/__tests__/directive-markup-contract.test.ts scripts/__tests__/critic-directive-contract.test.ts scripts/__tests__/sdd-adaptive-execution-contract.test.ts scripts/__tests__/sdd-review-lifecycle-contract.test.ts scripts/__tests__/sdd-check-log.test.ts scripts/__tests__/sdd-check-rules.test.ts` → 62 pass exit=0
- [x] `2026-09-02T16:05:00+03:00` ver `npm run type-check` → pass exit=0
- [x] `2026-09-02T16:07:00+03:00` ver `npm test -- --test-concurrency=1` → 1464 pass, 1 skip exit=0
- [x] `2026-09-02T16:07:01+03:00` DONE

**Handoff →** artifacts: [scripts/__tests__/sdd-adaptive-execution-contract.test.ts, scripts/__tests__/sdd-review-lifecycle-contract.test.ts]; decisions: [confidence, single-write persistence, and scope tracker structure are regression contracts]; open: []

#### P3

- [x] `2026-09-02T16:02:00+03:00` decision `ai-skills-tracker=canonical-scope-shape` ← the tracker introduced by this task must match its own title, prefix, DAG, and six-column contract
- [x] `2026-09-02T16:03:00+03:00` ver `canonical scope tracker contract test` → title, Prefix, Intra-Scope DAG, and tracker columns present exit=0
- [x] `2026-09-02T16:08:00+03:00` ver `npm run format:check` → pass exit=0
- [x] `2026-09-02T16:09:00+03:00` ver `npm run build:publish` → pass exit=0
- [x] `2026-09-02T16:10:00+03:00` ver `npm_config_cache=/tmp/gennady-npm-cache npm run test:smoke` → 3 pass exit=0
- [x] `2026-09-02T16:10:01+03:00` DONE

**Handoff →** artifacts: [tasks/ai-skills/README.md, tasks/ai-skills/sdd-skills/sdd-skills.task-97.md]; decisions: [legacy TSK-NN stays, future ai-skills prefix is AI]; open: []

#### Round close

- [x] `2026-09-02T16:10:01+03:00` DONE
<!--/SECTION:EXECUTION_LOG-->

<!--SECTION:AUDIT_ROUNDS-->

## Audit Rounds

### Audit Round 1 — 2026-09-01, after Execution Round 1

```text
@audit task=TSK-97 round=1 after-exec-round=1 triggered-reopen=none status=PASS counts=B0·M0·m0·I0
```

### Audit Round 2 — 2026-09-01, after Execution Round 2

```text
@audit task=TSK-97 round=2 after-exec-round=2 triggered-reopen=Round-3 status=FAIL counts=B0·M11·m0·I0
F-01 | sev=M | type=COMPLETENESS_GAP | conf=H | loc=ai/directives/sdd/audit.directive.xml:315 | phase=P1 | src=tasks/ai-skills/sdd-skills/sdd-skills.task-97.md#4 | route=ticket-reopen | act=убрать интерактивные `H_LOW_CONFIDENCE` и `H_OPERATOR_REJECT` из автономного audit flow и определить терминальный результат без ожидания оператора
F-02 | sev=M | type=COMPLETENESS_GAP | conf=H | loc=ai/directives/sdd/audit.directive.xml:537 | phase=P1 | src=ai/directives/sdd/audit.directive.xml#AUDIT_SESSION_SUMMARY_FORMAT | route=ticket-reopen | act=добавить обязательное поле `phase` во все terminal и persisted примеры findings и в форму Audit Round
F-03 | sev=M | type=COMPLETENESS_GAP | conf=H | loc=ai/skills/sdd-execute/SKILL.md:139 | phase=P1 | src=ai/directives/sdd/audit.directive.xml#AUDIT_SESSION_SUMMARY_FORMAT | route=ticket-reopen | act=научить оба execute-навыка ветвиться по каноническому terminal token `PASS_RISK`
F-04 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tasks/ai-skills/sdd-skills/sdd-skills.task-97.md:221 | phase=P1 | src=ai/directives/sdd/phase-execution-protocol.xml#STEP_5_VERIFY | route=ticket-reopen | act=выполнить обязательный `sdd verify --wip` для P1 и записать в Handoff фактические пути артефактов
F-05 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tasks/ai-skills/sdd-skills/sdd-skills.task-97.md:228 | phase=P2 | src=ai/directives/sdd/phase-execution-protocol.xml#STEP_5_VERIFY | route=ticket-reopen | act=выполнить обязательный `sdd verify --wip`, точную команду из §5 без добавочного файла и записать фактические пути артефактов P2
F-06 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tasks/ai-skills/sdd-skills/sdd-skills.task-97.md:236 | phase=P3 | src=ai/directives/sdd/phase-execution-protocol.xml#STEP_5_VERIFY | route=ticket-reopen | act=выполнить обязательный `sdd verify --wip` перед допустимым `skip:doc-phase` и записать фактические пути документации
F-07 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=scripts/__tests__/critic-directive-contract.test.ts:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_GIT_DIFF_SCAN | route=ticket-update | act=объявить изменённый critic contract test в Target Files P2 и в его Handoff
F-08 | sev=M | type=TASK_ID_DRIFT | conf=H | loc=scripts/__tests__/critic-directive-contract.test.ts:3 | phase=P2 | src=ai/directives/sdd/audit.directive.xml#AX_TASK_ID_INTEGRITY | route=code-fix | act=добавить `TSK-97` в append-only поле `@tasks`
F-09 | sev=M | type=TASK_ID_DRIFT | conf=H | loc=scripts/__tests__/sdd-check-log.test.ts:3 | phase=P2 | src=ai/directives/sdd/audit.directive.xml#AX_TASK_ID_INTEGRITY | route=code-fix | act=добавить `TSK-97` в append-only поле `@tasks`
F-10 | sev=M | type=RULES_CASCADE_MISMATCH | conf=H | loc=tasks/ai-skills/README.md:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_CASCADE_VERIFICATION | route=ticket-update | act=восстановить Cascade Table и заменить ссылки на spec-контракты в Rules фаз на вычисленные пути coding, testing и infra rules с зависимостями
F-11 | sev=M | type=BDD_COVERAGE_MISMATCH | conf=H | loc=tasks/ai-skills/sdd-skills/sdd-skills.task-97.md:170 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_BDD_COVERAGE_VERIFICATION | route=ticket-update | act=сопоставить все восемь BDD-сценариев с точными именами `it` из тестов
```

### Audit Round 3 — 2026-09-01, after Execution Round 3

```text
@audit task=TSK-97 round=3 after-exec-round=3 triggered-reopen=Round-4 status=FAIL counts=B0·M5·m2·I0
F-01 | sev=M | type=RULES_CASCADE_MISMATCH | conf=H | loc=tasks/ai-skills/README.md:11 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_CASCADE_VERIFICATION | route=ticket-update | act=добавить `nodejs-npm-setup` в Cascade Table и исправить источник правил scope на §3.5
F-02 | sev=M | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=tasks/ai-skills/sdd-skills/sdd-skills.task-97.md:44 | phase=P1 | src=ai/directives/sdd/phase-execution-protocol.xml#AX_SPEC_NEVER_EDITED | route=ticket-reopen | act=убрать module spec из phase-owned output и провести изменение спецификации через insight/spec-edit lifecycle
F-03 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tasks/ai-skills/sdd-skills/sdd-skills.task-97.md:273 | phase=P3 | src=ai/directives/sdd/phase-execution-protocol.xml#AX_PHASE_SCOPE_LOCK | route=ticket-reopen | act=повторить P3 verification и Handoff только для объявленных Target Files без ticket и scope tracker
F-04 | sev=M | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=scripts/__tests__/sdd-review-lifecycle-contract.test.ts:40 | phase=P2 | src=ai/directives/testing/common.xml#AX_PHASE_ANCHORS | route=ticket-reopen | act=добавить парные phase anchors в многооператорные и policy-bearing фазы изменённых P2 tests
F-05 | sev=M | type=COMPLETENESS_GAP | conf=M | loc=ai/skills/README.md:30 | phase=P3 | src=specs/ai-skills/ai-skills.spec.md#FR-08 | route=ticket-reopen | act=синхронизировать canonical skills README с изменёнными autonomous audit и per-finding routing contracts
F-06 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/common.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=добавить отсутствующие AntiPatterns, VerificationHooks и RewardCriteria отдельной project-scope задачей
F-07 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/node-test.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=добавить отсутствующий RewardCriteria отдельной project-scope задачей
```

### Audit Round 4 — 2026-09-01, after Execution Round 4

```text
@audit task=TSK-97 round=4 after-exec-round=4 triggered-reopen=Round-5 status=FAIL counts=B0·M2·m2·I0
F-01 | sev=M | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=scripts/__tests__/critic-directive-contract.test.ts:59 | phase=P2 | src=ai/directives/testing/common.xml#AX_PHASE_ANCHORS | route=ticket-reopen | act=обернуть многооператорную ASSERT-фазу изменённого critic contract case парными intent anchors
F-02 | sev=M | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=scripts/__tests__/sdd-check-log.test.ts:87 | phase=P2 | src=ai/directives/testing/common.xml#AX_PHASE_ANCHORS | route=ticket-reopen | act=обернуть SETUP и многооператорную ASSERT-фазу изменённого canonical-token case парными intent anchors
F-03 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/common.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=добавить отсутствующие AntiPatterns, VerificationHooks и RewardCriteria отдельной project-scope задачей
F-04 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/node-test.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=добавить отсутствующий RewardCriteria отдельной project-scope задачей
```

### Audit Round 5 — 2026-09-01, after Execution Round 5

```text
@audit task=TSK-97 round=5 after-exec-round=5 triggered-reopen=none status=PASS counts=B0·M0·m2·I0
F-01 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/common.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=добавить отсутствующие AntiPatterns, VerificationHooks и RewardCriteria отдельной project-scope задачей
F-02 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/node-test.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=добавить отсутствующий RewardCriteria отдельной project-scope задачей
```

### Audit Round 6 — 2026-09-02, after Execution Round 6

```text
@audit task=TSK-97 round=6 after-exec-round=6 triggered-reopen=none status=PASS counts=B0·M0·m2·I0
F-01 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/common.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=добавить отсутствующие AntiPatterns, VerificationHooks и RewardCriteria отдельной project-scope задачей
F-02 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/node-test.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=добавить отсутствующий RewardCriteria отдельной project-scope задачей
```

### Audit Round 7 — 2026-09-02, after Execution Round 6

```text
@audit task=TSK-97 round=7 after-exec-round=6 triggered-reopen=Round-7 status=FAIL counts=B0·M6·m2·I0
F-01 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=ai/skills/sdd-execute/scripts/check.sh:450 | phase=P2 | src=ai/directives/sdd/scaffold.directive.xml#AX_EXECUTION_LOG_PLAN_VS_FACT | route=code-fix | act=проверять обязательные placeholder-поля для каждого token и сохранить допустимый angle-bracket текст в обычном описании
F-02 | sev=M | type=COMPLETENESS_GAP | conf=H | loc=ai/skills/sdd-execute/scripts/extract-section.sh:215 | phase=P1 | src=ai/directives/sdd/audit.directive.xml#AX_TASK_ID_INTEGRITY | route=ticket-reopen | act=развести ANCHOR_NOT_FOUND и ANCHOR_EMPTY по exit code и оставить legacy fallback только для отсутствующего anchor
F-03 | sev=M | type=COMPLETENESS_GAP | conf=H | loc=ai/skills/sdd-execute/SKILL.md:213 | phase=P1 | src=ai/skills/sdd-execute/SKILL.md#7 | route=ticket-reopen | act=не закрывать Round и не запускать audit после BLOCKED или FAIL fix-фазы
F-04 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=ai/directives/sdd/audit.directive.xml:417 | phase=P1 | src=ai/directives/sdd/audit.directive.xml#AX_GIT_DIFF_SCAN | route=ticket-reopen | act=ограничить control-plane exemption активным тикетом и его собственными tracker rows
F-05 | sev=M | type=RULES_CASCADE_MISMATCH | conf=H | loc=ai/skills/sdd-execute/scripts/check.sh:368 | phase=P2 | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=code-fix | act=использовать один predicate категорий rule-файлов в tree и task режимах с поддержкой architecture и quality
F-06 | sev=M | type=BDD_COVERAGE_MISMATCH | conf=H | loc=scripts/__tests__/sdd-adaptive-execution-contract.test.ts:58 | phase=P2 | src=ai/directives/testing/common.xml#AX_PHASE_ANCHORS | route=code-fix | act=заменить no-op decisions assertion точными operator-summary anchors и добавить парные intent regions
F-07 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/common.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=добавить отсутствующие AntiPatterns, VerificationHooks и RewardCriteria отдельной project-scope задачей
F-08 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/node-test.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=добавить отсутствующий RewardCriteria отдельной project-scope задачей
```

### Audit Round 8 — 2026-09-02, after Execution Round 7

```text
@audit task=TSK-97 round=8 after-exec-round=7 triggered-reopen=none status=PASS counts=B0·M0·m2·I0
F-01 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/common.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=добавить отсутствующие AntiPatterns, VerificationHooks и RewardCriteria отдельной project-scope задачей
F-02 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/node-test.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=добавить отсутствующий RewardCriteria отдельной project-scope задачей
```

### Audit Round 9 — 2026-09-02, after Execution Round 7

```text
@audit task=TSK-97 round=9 after-exec-round=7 triggered-reopen=Round-8 status=FAIL counts=B0·M3·m0·I0
F-01 | sev=M | type=COMPLETENESS_GAP | conf=H | loc=ai/directives/sdd/audit.directive.xml:368 | phase=P1 | src=ai/directives/sdd/audit.directive.xml#AX_DIALOGUE_DISCIPLINE | route=ticket-reopen | act=дать `conf` неинтерактивную роль в verdict и запретить LOW-наблюдению запускать автономное исправление
F-02 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=ai/skills/sdd-execute/SKILL.md:162 | phase=P1 | src=ai/directives/sdd/audit.directive.xml#AX_AUDIT_ROUNDS_IN_TICKET | route=ticket-reopen | act=валидировать audit candidate до единственной записи, чтобы malformed result не требовал неописанного supersede в append-only истории
F-03 | sev=M | type=RULES_CASCADE_MISMATCH | conf=H | loc=tasks/ai-skills/README.md:1 | phase=— | src=ai/directives/sdd/scaffold.directive.xml#SCOPE_TASKS_README_STRUCTURE | route=ticket-update | act=привести созданный scope tracker к каноническим title, Prefix, Intra-Scope DAG и колонкам Tracker
```

### Audit Round 10 — 2026-09-02, after Execution Round 8

```text
@audit task=TSK-97 round=10 after-exec-round=8 triggered-reopen=none status=PASS counts=B0·M0·m2·I0
F-01 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/common.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=закрывается связанным PR #18
F-02 | sev=m | type=RULE_FILE_INCOMPLETE | conf=H | loc=ai/directives/testing/node-test.xml:1 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES | route=rule-file-fix | act=закрывается связанным PR #18
```

<!--/SECTION:AUDIT_ROUNDS-->
