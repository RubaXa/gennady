# Task: TSK-184 — Recover truthful status and wire the production control plane

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-184
- **Status:** [x] DONE
- **Reopens:** 2 (2026-08-13 — Round 3 removes audit-detected false-green manifest, evidence and freshness paths)
- **Purpose:** Replace the falsely accepted cutover with one production composition root that instantiates and runs the deterministic review control plane.
- **Scope:** agent-inbox
- **Module:** scope composition
- **Dependencies:** TSK-176, TSK-177, TSK-178, TSK-179, TSK-181
- **Spec References:** [Architecture](../../specs/agent-inbox/agent-inbox.spec.md#5-high-level-architecture), [Pipeline DbC](../../specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md#5-module-contracts-dbc)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `integration`
- **Deferred Runtime Scope:** Real GitLab effects remain deferred to TSK-186 and require an exact allowlist.

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind     | Deps | Status |
| --- | -------- | ---- | ------ |
| P1  | refactor | —    | [x]    |
| P2  | test     | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — refactor

- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Objective:** Wire manifest, contract compiler, trusted receipts, validator, repair, freshness, synthesis, queue and handoff into `serve/bootstrap.ts`; migrate the real one-shot/eval/CLI acceptance consumers to that same boot-owned `PipelineRuntime`; expose bounded completion/readback without `RoleEngine`/`RoleInstance`; and repair production task resolution/recovery.
- **Target Files:**
  - `services/agent-inbox/serve/bootstrap.ts`
  - `services/agent-inbox/serve/run-mode.ts`
  - `cli/cmd/inbox/serve.cmd.ts`
  - `services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts`
  - `services/agent-inbox/modules/inbox-pipeline/review/review-orchestrator.ts`
  - `services/agent-inbox/modules/inbox-pipeline/coverage/review-structural-validator.ts`
  - `services/agent-inbox/modules/inbox-pipeline/coverage/review-repair-coordinator.ts`
  - `services/agent-inbox/modules/inbox-pipeline/verification/review-freshness-gate.ts`
  - `services/agent-inbox/modules/inbox-queue/effects/review-effect-coordinator.ts`
  - `services/agent-inbox/modules/inbox-queue/task-registry.ts`
  - `services/agent-inbox/modules/inbox-eval/eval-driver.ts`
  - `cli/cmd/inbox-eval/inbox-eval.cmd.ts`
  - `services/agent-inbox/modules/inbox-eval/profiles/real-readonly.profile.ts`
  - `services/agent-inbox/modules/inbox-eval/profiles/real-effects.profile.ts`
  - `services/agent-inbox/modules/inbox-eval/harness/review-eval-harness.ts`
- **Inputs:** TSK-176/177/178/179 handoffs and audit evidence that TSK-181 did not wire the control plane.
- **Exit:** a real boot exposes one runtime identity and construction trace for every mandatory control-plane boundary; one-shot serve, eval driver, eval profiles and eval harness execute through that runtime's bounded completion/readback API; `RoleEngine` and `RoleInstance` are unreachable from those acceptance consumers.

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:**
  - [testing-common](../../ai/directives/testing/common.xml)
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Objective:** Prove production construction, persisted task recovery and fail-closed publication.
- **Target Files:**
  - `services/agent-inbox/serve/__tests__/bootstrap.control-plane.integration.test.ts`
  - `services/agent-inbox/serve/__tests__/run-mode.test.ts`
  - `services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts`
  - `services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.control-plane.integration.test.ts`
  - `services/agent-inbox/modules/inbox-eval/__tests__/eval-driver.test.ts`
  - `services/agent-inbox/modules/inbox-eval/__tests__/review-eval.contract.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-repair-coordinator.integration.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-freshness-gate.integration.test.ts`
- **Inputs:** P1 handoff.
- **Exit:** tests invoke the shippable composition root, not direct class fixtures; canonical behavior proves one-shot/eval completion and readback come from the same `PipelineRuntime` identity used by serve.

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** production adapters satisfy control-plane DbC [`contract`]

- **Given** the manifest builder, contract compiler, receipt recorder, structural validator, repair coordinator, freshness gate, orchestrator and effect coordinator declared by the pipeline and queue specs
- **When** bootstrap exposes its typed runtime construction trace
- **Then** each concrete adapter is assignable to its declared Port or Service contract and exactly one reachable production instance owns each boundary

**Scenario:** production boot owns the deterministic control plane [`integration`]

- **Given** the real serve profile
- **When** bootstrap becomes ready
- **Then** manifest→contract→receipts→validation→repair→freshness→synthesis→queue is observable from one runtime and no legacy role engine executes review acceptance
- **And** the existing `PipelineRuntime` drives those boundaries; constructing a disconnected parallel runtime does not satisfy the scenario

**Scenario:** incomplete work cannot publish [`contract`]

- **Given** a missing slot, forged receipt, exhausted repair or stale cursor
- **When** a round reaches its boundary
- **Then** the journal records BLOCKED or STALE and creates no package, handoff or effect

**Scenario:** restart resumes durable work once [`integration`]

- **Given** persisted running tasks and consumed receipts
- **When** the production root restarts
- **Then** it resumes the same MR lane without repeating acknowledged work or a provider write

**Scenario:** one-shot and eval use the production acceptance owner [`integration`]

- **Given** `gennady inbox serve --mrs --once`, `runEval`, a real eval profile or the eval harness
- **When** the consumer submits an MR and waits for bounded completion
- **Then** the boot-owned `PipelineRuntime` materializes and drains the review, and the consumer reads the terminal state and artifacts from its durable queue/journal surfaces
- **And** the observed runtime identity matches the production composition trace; no `RoleEngine` or `RoleInstance` is constructed on that path

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Required by                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `npm run type-check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `typescript-rules`                  |
| `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/serve/__tests__/bootstrap.control-plane.integration.test.ts services/agent-inbox/serve/__tests__/run-mode.test.ts services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.control-plane.integration.test.ts services/agent-inbox/modules/inbox-eval/__tests__/eval-driver.test.ts services/agent-inbox/modules/inbox-eval/__tests__/review-eval.contract.test.ts test/agent-inbox/inbox-pipeline/review-repair-coordinator.integration.test.ts test/agent-inbox/inbox-pipeline/review-freshness-gate.integration.test.ts` | canonical acceptance behavior proof |
| `! rg -n -e RoleEngine -e RoleInstance services/agent-inbox/serve/run-mode.ts cli/cmd/inbox/serve.cmd.ts services/agent-inbox/modules/inbox-eval/eval-driver.ts cli/cmd/inbox-eval/inbox-eval.cmd.ts services/agent-inbox/modules/inbox-eval/profiles/real-readonly.profile.ts services/agent-inbox/modules/inbox-eval/profiles/real-effects.profile.ts services/agent-inbox/modules/inbox-eval/harness/review-eval-harness.ts`                                                                                                                                                                                                                                                          | legacy consumer inventory guard     |
| `ai/skills/sdd-execute/scripts/sdd check --task TSK-184`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | SDD integrity                       |

- **Task-specific Completion additions:** TSK-181 and TSK-183 remain historical evidence; this task may be DONE only with shippable-root runtime proof, not direct-class tests.

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- production root → `bootstrap.control-plane.integration.test.ts` :: `real bootstrap constructs and drives every deterministic control-plane boundary`
- typed composition → `bootstrap.control-plane.integration.test.ts` :: `production adapters satisfy declared control-plane contracts and have one reachable instance`
- fail closed → `bootstrap.control-plane.integration.test.ts` :: `non pass review creates no publication package handoff or effect`
- restart → `full-flow.blackbox.test.ts` :: `production restart resumes durable task and receipt consumption without duplicate write`
- durable repair/freshness → `pipeline-runtime.control-plane.integration.test.ts` :: `existing runtime persists observed revision repair state and protected transitions before dispatch and restores them on restart`
- bounded completion/readback → `pipeline-runtime.control-plane.integration.test.ts` :: `one-shot submission drains to a terminal durable state and reads canonical artifacts from the owning runtime`
- one-shot CLI acceptance → `run-mode.test.ts` :: `one-shot acceptance delegates to the boot-owned pipeline without constructing a legacy role instance`
- shared production identity → `full-flow.blackbox.test.ts` :: `serve and one-shot acceptance expose the same pipeline runtime identity and durable result`
- eval driver acceptance → `eval-driver.test.ts` :: `eval derives stages and gates from pipeline completion readback rather than role artifacts`
- eval composition contract → `review-eval.contract.test.ts` :: `mock and real eval profiles expose the pipeline-owned acceptance surface without a role engine`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-13, recovery

#### P1

- [x] `2026-08-13T14:02:10Z` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-13T14:02:32Z` ver `! rg -n "new RoleEngine\|RoleEngine" services/agent-inbox/serve services/agent-inbox/modules/inbox-eval` → `pass` exit=`0`
- 🛑 `2026-08-13T14:04:34Z` BLOCKED: `services/agent-inbox/serve/run-mode.ts` remains a real RoleEngine/RoleInstance acceptance path; removing it requires migrating CLI/eval consumers outside TSK-184 Target Files.
  - 🔗 axiom: AX_PHASE_SCOPE_LOCK
  - 💬 unblock: expand TSK-184 Target Files to the run-mode CLI/eval composition consumers or create a prerequisite migration ticket.

#### P2

- [x] `2026-08-13T14:04:34Z` NOT RUN — execution stopped at the Round 1 scope blocker before audit eligibility.

#### Round close

- [x] `2026-08-13T14:04:34Z` BLOCKED — reopened by the technical scope decision below.

### Recovery Decision — 2026-08-13, technical scope resolution

- [x] `2026-08-13T14:44:29Z` decision `expand-in-place` ← the blocked path is an existing technical consumer migration required by TSK-184's acceptance objective, not a new product decision.
- [x] `2026-08-13T14:44:29Z` decision `closed-target-inventory` ← P1 now names `run-mode.ts`, `serve.cmd.ts`, eval driver/CLI, both real profiles and the eval harness; P2 names their canonical behavior tests plus both new control-plane integration files.
- ✅ `2026-08-13T14:44:29Z` RESOLVED: Round 1 `AX_PHASE_SCOPE_LOCK` blocker; TSK-184 now authorizes migration of every known one-shot/eval acceptance consumer.

### Round 2 — 2026-08-13, one-shot/eval acceptance migration

#### P1

- [x] `2026-08-13T15:11:39Z` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-13T15:11:39Z` ver `npm run lint` → `pass` exit=`0`
- [x] `2026-08-13T15:11:39Z` ver `! rg -n -e RoleEngine -e RoleInstance <closed acceptance consumer inventory>` → `pass` exit=`0`
- [x] `2026-08-13T15:11:39Z` DONE
      **Handoff →** artifacts: boot-owned `PipelineRuntime`, separate durable control journal and receipts, bounded completion/readback, migrated one-shot/eval consumers; decisions: exact head/cursor capture and explicit role policy fail closed; open: ignored production coverage files require `git add -f` by the parent.

#### P2

- [x] `2026-08-13T15:11:39Z` ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/serve/__tests__/bootstrap.control-plane.integration.test.ts services/agent-inbox/serve/__tests__/run-mode.test.ts services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.control-plane.integration.test.ts services/agent-inbox/modules/inbox-eval/__tests__/eval-driver.test.ts services/agent-inbox/modules/inbox-eval/__tests__/review-eval.contract.test.ts test/agent-inbox/inbox-pipeline/review-repair-coordinator.integration.test.ts test/agent-inbox/inbox-pipeline/review-freshness-gate.integration.test.ts` → `pass` exit=`0` tests=`28/28`
- [x] `2026-08-13T15:11:39Z` ver `ai/skills/sdd-execute/scripts/sdd check --task TSK-184` → `pass` exit=`0` findings=`0`
- [x] `2026-08-13T15:11:39Z` DONE
      **Handoff →** artifacts: bootstrap/one-shot black-box proof, persistence rejection, await-order and crash-resume proofs; decisions: no provider mutation; open: independent isolated SDD audit remains mandatory.

#### Round close

- [x] `2026-08-13T15:11:39Z` DONE — implementation gates green; ready for isolated audit.

### Round 3 — 2026-08-13, false-green recovery

#### P1

- [x] `2026-08-13T15:32:28Z` fix `manifest truth` ← run-mode now captures distinct versioned goal, architecture, specification, tests, security, optimality, review-lens, changed-file, entity and discussion inputs from the real worktree/VCS context; absent complete inventory is explicitly `BLOCKED` before queue work.
- [x] `2026-08-13T15:32:28Z` fix `agent evidence truth` ← removed generic `_authorizeControlPlane` source-copy artifacts/fields/receipts and canned control-plane PASS runner; structural validation now consumes persisted agent-authored artifacts/evidence backed by actual OpenCode tool-call receipts.
- [x] `2026-08-13T15:32:28Z` fix `durable-before-effect` ← freshness transition append completes before queue/effect callback invocation; append rejection produces zero callback and queue materialization.
- [x] `2026-08-13T15:32:28Z` fix `closed-world` ← all six audit-identified `PipelineControlPlane*` DTO/config types are internal rather than new exported entities.
- [x] `2026-08-13T15:32:28Z` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-13T15:32:28Z` ver `npm run lint` → `pass after JSDoc correction`; scoped contract lint → `pass` exit=`0`
- [x] `2026-08-13T15:32:28Z` ver `! rg -n '_authorizeControlPlane|Deterministic control-plane review completed|controlPlaneAuthorized === true' services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts` → `pass` exit=`0`
- [x] `2026-08-13T15:32:28Z` DONE
      **Handoff →** artifacts: exhaustive real-input capture, actual worker/tool-backed evidence, durable-before-callback freshness, internal control DTOs; decisions: missing inventory/evidence/receipt is fail-closed; open: isolated audit remains mandatory.

#### P2

- [x] `2026-08-13T15:32:28Z` ver `node --import tsx --test --experimental-test-module-mocks <canonical TSK-184 suite>` → `pass` exit=`0` tests=`31/31`
- [x] `2026-08-13T15:32:28Z` ver `no agent evidence cannot publish; incomplete inventory blocks; rejected freshness append invokes zero callback` → `pass` exit=`0`
- [x] `2026-08-13T15:32:28Z` ver `! rg -n -e RoleEngine -e RoleInstance <closed acceptance consumer inventory>` → `pass` exit=`0`
- [x] `2026-08-13T15:32:28Z` ver `ai/skills/sdd-execute/scripts/sdd check --task TSK-184` → `pass` exit=`0` findings=`0`
- [x] `2026-08-13T15:32:28Z` ver `npx prettier --check <round-3 changed files>; git diff --check` → `pass` exit=`0`
- [x] `2026-08-13T15:32:28Z` DONE
      **Handoff →** artifacts: negative acceptance coverage for all audit findings F1–F4; decisions: no GitLab mutation, commit, nested Codex or escalation; open: independent isolated SDD audit remains mandatory.

#### Round close

- [x] `2026-08-13T15:32:28Z` DONE — audit FAIL B findings recovered; ready for isolated audit.

<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Accepted: shippable bootstrap construction, fail-closed publication and durable restart are independent mandatory proofs.
- Accepted: production `effect_*` task resolution is repaired instead of hidden by the historical test-only registry.
- Accepted BDD review: missing, forged, stale, repair-exhausted, crash-after-ack and duplicate-runtime cases remain distinct because they guard different trust boundaries.
- Accepted BDD review: the public runtime construction trace and behavior test, not source grep, prove the legacy path unreachable.
- Accepted BDD review: repair/freshness storage uses a separate profile-rooted `JournalPort`; generic control records never enter canonical `review-events.jsonl`.
- Rejected: direct construction of pipeline classes as evidence that production bootstrap uses them.
- Rejected: broad legacy deletion outside a proven consumer migration.
- Rejected: provider mutation in this ticket; exact-allowlist effect proof belongs to a later runtime task.
- Rejected: a new parallel `ReviewControlPlaneRuntime`; the pipeline spec explicitly requires modifying the existing `PipelineRuntime`.
- Accepted recovery: the known one-shot/eval/CLI consumers are part of TSK-184 because they are the real acceptance path the original cutover objective must make truthful; no product behavior or external-effect authority changes.
- Accepted recovery: canonical behavior tests are completion proof; the corrected unescaped `rg` expression is only a closed consumer-inventory guard.
