# Task: TSK-188 — Final real product acceptance

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-188
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Close Agent Inbox only after every mandatory product, control-plane and visual scenario passes through the real shippable entrypoint.
- **Scope:** agent-inbox
- **Module:** inbox-eval
- **Dependencies:** TSK-186, TSK-187
- **Spec References:** [Root acceptance](../../../specs/agent-inbox/agent-inbox.spec.md#acceptance-after-downstream-regeneration), [Eval spec](../../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `e2e`, `visual`, `acceptance`
- **Deferred Runtime Scope:** None; missing external prerequisites make the task BLOCKED, never DONE.

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind       | Deps | Status |
| --- | ---------- | ---- | ------ |
| P1  | acceptance | —    | [ ]    |
| P2  | audit      | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — acceptance

- **Objective:** Replace every former `fixme`/mock acceptance with real product execution and aggregate root clauses, eleven pipeline cases, TaskExecutorPort, API, walking skeleton and visual matrix.
- **Target Files:** `e2e/inbox-serve/`, eval reports and acceptance artifacts only; product defects route back to their owning ticket.
- **Exit:** every mandatory named scenario is PASS with product-written evidence.

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — audit

- **Objective:** Independently prove no false-green mechanism and issue an honest release verdict.
- **Target Files:** acceptance report and immutable evidence index.
- **Exit:** zero mandatory non-PASS and complete real-data visual/runtime evidence.

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** all deterministic control-plane cases pass [`e2e`]

- **Given** the eleven named TSK-183 pipeline cases and TaskExecutorPort case
- **When** each runs through managed `gennady inbox serve`
- **Then** each has its own PASS and product-written artifact; umbrella tests cannot substitute it

**Scenario:** operator completes the product loop [`e2e`]

- **Given** a real MR and exact effect allowlist where required
- **When** discovery, full/cross review, repair, package edit/apply, handoff, delta verification, lifecycle and restart execute
- **Then** the operator never needs GitLab UI and every provider outcome is reconciled

**Scenario:** acceptance cannot hide non-green work [`acceptance`]

- **Given** required test results and source
- **When** report aggregates
- **Then** any FAIL, SKIP, INCONCLUSIVE, `test.fixme`, `test.skip`, TODO, missing screenshot/artifact, `page.route`, `routeFromHAR`, `fulfill`, demo seed or HTTP stub makes the release verdict non-PASS

**Scenario:** real compatibility and visual proof survive [`visual`]

- **Given** real `~/.gennady`, real GitLab, rebuilt bundle and production server
- **When** CLI, board and all twelve viewport/state cases run
- **Then** CLI remains green, board identities are explainable, and every screenshot/geometry assertion passes

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                              | Required by               |
| ------------------------------------------------------------------------------------ | ------------------------- | ----------- | ------------ | ----------- | ---- | ------------------------------ | ----------------------- |
| `npm run type-check && npm test`                                                     | repository regression     |
| `npm run inbox-serve:build && npm run test:e2e:review-flow && npm run test:e2e:prod` | real shippable acceptance |
| `! rg -n "test\.(fixme                                                               | skip)                     | page\.route | routeFromHAR | \.fulfill\( | TODO | INCONCLUSIVE" e2e/inbox-serve` | false-green prohibition |
| `npx tsx cli/gennady.ts inbox --json --no-save --vcs-host=gitlab.corp.mail.ru`       | legacy real compatibility |
| `ai/skills/sdd-execute/scripts/sdd check --task TSK-188`                             | SDD integrity             |

- **Task-specific Completion additions:** every root clause, all eleven pipeline cases, TaskExecutorPort, real walking skeleton and twelve visual rows must PASS. Missing allowlist or unstable external state is BLOCKED, not a waived acceptance.

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- pipeline/task executor → `agent-inbox.pipeline-control-plane.spec.ts`, `agent-inbox.task-executor.spec.ts`
- operator loop → `agent-inbox.real-walking-skeleton.spec.ts`
- false green → `review-eval-acceptance-report.test.ts` :: `mandatory non pass mock or missing evidence prevents release pass`
- compatibility/visual → `agent-inbox.real-dashboard.spec.ts` plus real CLI evidence

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-13, recovery

#### P1

- [ ] `<ts>` ver `all real acceptance commands` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `fresh isolated epic audit` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->
