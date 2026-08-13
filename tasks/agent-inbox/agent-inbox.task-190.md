# Task: TSK-190 — Close the trusted control-plane observation boundary

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-190
- **Status:** [ ] TODO
- **Purpose:** Устранить F01–F06 финального аудита TSK-184: формировать trusted receipt только из наблюдения control-plane callback, атомарно защищать per-MR observed transition и доказать границу живым read-only OpenCode tool trace.
- **Scope:** agent-inbox
- **Module:** scope composition / inbox-pipeline
- **Dependencies:** TSK-184
- **Spec References:**
  - Root trust boundary: [FR-045, FR-052, FR-053 and NFR-013](../../specs/agent-inbox/agent-inbox.spec.md#deterministic-agent-control-loop)
  - Runtime backing: [real-runtime acceptance obligation](../../specs/agent-inbox/agent-inbox.spec.md#44-runtime-backing--deferred-scope)
  - Receipt surfaces: [`ReviewRuntimeReceipt` and `ReviewRuntimeReceiptRecorder`](../../specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md#reviewruntimereceipt)
  - Receipt DbC: [`ReviewRuntimeReceiptRecorder`](../../specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md#service-reviewruntimereceiptrecorder)
  - Freshness DbC: [`ReviewFreshnessGate`](../../specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md#service-reviewfreshnessgate)
  - Live tool trace: [`AgentCoverageTrace`](../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md#session-services-and-trace)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `integration`, `e2e`
- **Deferred Runtime Scope:** None; P2 обязан записать наблюдённый read-only OpenCode tool trace из живого runtime. GitLab mutations/effects запрещены.

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind     | Deps | Status |
| --- | -------- | ---- | ------ |
| P1  | refactor | —    | [ ]    |
| P2  | test     | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — refactor

- **Objective:** Сделать control plane единственным автором receipt facts и одной per-MR транзакцией выполнить observed update → manifest compare → guarded transition append до callback eligibility.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts`
  - `services/agent-inbox/modules/inbox-pipeline/receipts/review-runtime-receipt-recorder.ts`
  - `services/agent-inbox/modules/inbox-pipeline/verification/review-freshness-gate.ts`
- **Inputs:** TSK-184 implementation handoff; audit F01–F06; root FR-045/052/053, NFR-013 and pipeline recorder/freshness DbC.
- **Exit:** canonical source/target, normalized args, observed bytes/content digest and outcome/status digest выводятся из control-plane callback observation, а не agent JSON; per-MR observed update, comparison and transition append неделимы; callback не исполняется при stale/mismatch/append failure; все три файла имеют canonical `@file`, `@consumers`, `@tasks: ... TSK-190` headers и используют проектную log vocabulary.

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Доказать forged-agent, race/append-failure и живую read-only OpenCode границы через canonical case names без GitLab mutation/effect.
- **Rules:**
  - [testing-common](../../ai/directives/testing/common.xml)
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `test/agent-inbox/inbox-pipeline/review-runtime-receipt-recorder.integration.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-freshness-gate.integration.test.ts`
  - `services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.control-plane.integration.test.ts`
  - `services/agent-inbox/serve/__tests__/bootstrap.control-plane.integration.test.ts`
  - `services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts`
- **Inputs:** P1 handoff; живой OpenCode-compatible runtime; существующие GitLab credentials только для read-only `--dry-run` входа.
- **Exit:** каждый section 4 scenario имеет ровно совпадающий canonical case в section 6; focused suite зелёный; живой `gennady inbox serve --mrs --once --dry-run` сохраняет реальный OpenCode tool trace/receipt и нулевой effect ledger; timeout, unavailable runtime, пустой trace или `INCONCLUSIVE` являются non-PASS.

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** Trusted control-plane observation and atomic freshness eligibility.

**Scenario:** trusted receipt derives all operation facts from callback observation [`integration`]

- **Given** agent JSON заявляет source, target, arguments, content и outcome, отличающиеся от фактической callback operation
- **When** control plane выполняет callback и записывает receipt
- **Then** canonical source/target, normalized arguments, observed content digest и outcome/status digest совпадают только с control-plane observation
- **And** ни одно agent-authored поле не может закрыть slot или изменить receipt identity

**Scenario:** callback receipt becomes eligible only after durable append [`integration`]

- **Given** callback вернул наблюдённый content/outcome, но receipt store отклонил append либо durable acknowledgment
- **When** recorder завершает operation
- **Then** outcome не становится evidence-eligible, slot остаётся incomplete и проблема наблюдаема
- **And** retry того же control-plane observation идемпотентен только для той же receipt identity/digest

**Scenario:** observed update compare and transition append are one per MR transaction [`integration`]

- **Given** manifest ожидает head/cursor A, а concurrent observation меняет latest per-MR revision на B
- **When** freshness gate обновляет observed state, сравнивает manifest key и пытается append guarded transition
- **Then** одна сериализованная транзакция сохраняет `STALE` плюс delta request и не сохраняет guarded PASS/handoff transition
- **And** callback не вызывается ни до transition append, ни после mismatch/append failure

**Scenario:** matching freshness transition invokes callback after the same atomic append [`integration`]

- **Given** latest observed head/cursor совпадает с immutable manifest key
- **When** freshness gate защищает verdict, synthesis publication или queue handoff
- **Then** guarded transition с той же accepted observed revision durable до callback
- **And** readback не допускает split-brain между observed state, comparison result и transition identity

**Scenario:** live readonly OpenCode operation produces trusted tool trace without effects [`e2e`]

- **Given** shippable `gennady inbox serve --mrs --once --dry-run`, живой OpenCode-compatible runtime и реальный read-only MR input
- **When** production composition выполняет хотя бы одну source/tool callback operation
- **Then** durable receipt и tool trace содержат наблюдённые source/target/args/content/outcome facts из реального runtime
- **And** GitLab effect ledger остаётся пустым; mock, HTTP interception, agent self-report, timeout, `SKIP` или `INCONCLUSIVE` не считаются PASS

**Scenario:** audit proof is mechanically traceable [`contract`]

- **Given** закрытый список P1/P2 Target Files и canonical cases этого тикета
- **When** headers, case mapping, execution log и diff проходят SDD-проверку
- **Then** каждый изменённый файл сохраняет canonical `@file`/`@consumers`/`@tasks` header, test titles verbatim совпадают с section 6, а Execution Log использует только vocabulary из `tasks/README.md`
- **And** TSK-184 history и product behavior вне trusted observation boundary не изменены

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Required by                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `npm run type-check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `typescript-rules`                 |
| `node --import tsx --test --experimental-test-module-mocks test/agent-inbox/inbox-pipeline/review-runtime-receipt-recorder.integration.test.ts test/agent-inbox/inbox-pipeline/review-freshness-gate.integration.test.ts services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.control-plane.integration.test.ts services/agent-inbox/serve/__tests__/bootstrap.control-plane.integration.test.ts services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts`                                                                                                                                                                                                                                                                                                                            | `testing-common`, `node-test`      |
| `npx tsx cli/gennady.ts inbox serve --mrs --once --dry-run --vcs-host=gitlab.corp.mail.ru`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | live read-only runtime observation |
| `rg -n '^// @file:' services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts services/agent-inbox/modules/inbox-pipeline/receipts/review-runtime-receipt-recorder.ts services/agent-inbox/modules/inbox-pipeline/verification/review-freshness-gate.ts && rg -n '^// @consumers:' services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts services/agent-inbox/modules/inbox-pipeline/receipts/review-runtime-receipt-recorder.ts services/agent-inbox/modules/inbox-pipeline/verification/review-freshness-gate.ts && rg -n '^// @tasks: .*TSK-190' services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts services/agent-inbox/modules/inbox-pipeline/receipts/review-runtime-receipt-recorder.ts services/agent-inbox/modules/inbox-pipeline/verification/review-freshness-gate.ts` | task traceability guard            |
| `ai/skills/sdd-execute/scripts/sdd check --task TSK-190`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | SDD integrity                      |
| `npx prettier --check tasks/agent-inbox/agent-inbox.task-190.md tasks/agent-inbox/agent-inbox.task-184.md tasks/agent-inbox/inbox-api/inbox-api.task-185.md tasks/agent-inbox/README.md tasks/README.md && git diff --check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | headers/cases/log/diff hygiene     |

- **Task-specific Completion additions:** приложить read-only live observation с runtime identity, конкретным MR key, receipt/tool-trace facts и нулевым effect ledger; отсутствующий/пустой trace, agent JSON вместо callback observation, mock/intercepted runtime, mutation/effect, timeout, `SKIP` или `INCONCLUSIVE` запрещают DONE. Проверить F01–F06 по отдельности; umbrella PASS не заменяет named proof.

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- trusted receipt derives all operation facts from callback observation → `review-runtime-receipt-recorder.integration.test.ts` :: `trusted receipt derives all operation facts from callback observation`
- callback receipt becomes eligible only after durable append → `review-runtime-receipt-recorder.integration.test.ts` :: `callback receipt becomes eligible only after durable append`
- observed update compare and transition append are one per MR transaction → `review-freshness-gate.integration.test.ts` :: `observed update compare and transition append are one per MR transaction`
- matching freshness transition invokes callback after the same atomic append → `review-freshness-gate.integration.test.ts` :: `matching freshness transition invokes callback after the same atomic append`
- live readonly OpenCode operation produces trusted tool trace without effects → `full-flow.blackbox.test.ts` :: `live readonly OpenCode operation produces trusted tool trace without effects`
- audit proof is mechanically traceable → `pipeline-runtime.control-plane.integration.test.ts` :: `audit proof is mechanically traceable`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Canonical token vocabulary: [tasks/README.md#execution-log-template](../README.md#execution-log-template).)_

### Round 1 — 2026-08-13, initial

#### P1

- [x] `2026-08-13T16:02:15Z` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-13T16:02:15Z` DONE
      **Handoff →** artifacts: [trusted callback-owned receipt facts; atomic freshness guard transaction; read-only worktree capture recovery]; decisions: [agent JSON is artifact-only; source digest is recomputed from callback-read bytes; managed live clones remain under selected state root]; open: []

#### P2

- [x] `2026-08-13T16:02:15Z` ver `focused trusted-boundary suite` → `pass` exit=`0` tests=`10/10`
- [x] `2026-08-13T16:02:15Z` ver `run-mode read-only capture suite` → `pass` exit=`0` tests=`6/6`
- [ ] `2026-08-13T16:02:15Z` ver `GENNADY_STATE_DIR=/private/tmp/gennady-tsk190-live2 npx tsx cli/gennady.ts inbox serve --mrs --once --dry-run --vcs-host=gitlab.corp.mail.ru` → `fail` exit=`1`: real GitLab discovery returned `NETWORK: fetch failed`; no runtime receipt, tool trace or effect ledger was produced.
- [ ] `2026-08-13T16:02:15Z` BLOCKED — mandatory live read-only OpenCode observation is unavailable; no mock/intercepted result is substituted. Earlier bounded recovery run reached real MR reads but produced no eligible trace and was terminated by the executor after the external worktree boundary failed.
      **Handoff →** artifacts: [focused suite 10/10; run-mode suite 6/6; headers, SDD check, Prettier and diff hygiene green]; decisions: [live timeout, unavailable runtime and absent trace remain non-PASS]; open: [rerun the exact live read-only command when GitLab and OpenCode are reachable and record runtime identity, MR key, receipt/tool trace and zero effect ledger]

#### Round close

- [ ] `2026-08-13T16:02:15Z` BLOCKED — P1 and deterministic P2 gates pass; mandatory live read-only observation is absent, so TSK-190 remains TODO and no audit is authorized.

### Round 2 — 2026-08-13, managed-runtime recovery

#### P1

- [x] `2026-08-13T16:28:04Z` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-13T16:28:04Z` DONE
      **Handoff →** artifacts: [managed OpenCode one-shot lifecycle; exact base-SHA fetch; explicit control-plane model selection; exact structured-output prompt]; decisions: [model selection is an operator-visible runtime option; receipt source/content/outcome remain callback-observed and are not normalized from agent output]; open: []

#### P2

- [x] `2026-08-13T16:28:04Z` ver `focused trusted-boundary suite` → `pass` exit=`0` tests=`10/10`
- [x] `2026-08-13T16:28:04Z` ver `headers + sdd check + prettier + diff hygiene` → `pass` exit=`0`
- [ ] `2026-08-13T16:28:04Z` ver `GENNADY_STATE_DIR=/private/tmp/gennady-tsk190-r3f npx tsx cli/gennady.ts inbox serve --mrs=https://gitlab.corp.mail.ru/vk-workspace/superapp/-/merge_requests/696 --once --dry-run --vcs-host=gitlab.corp.mail.ru --opencode-model=llm-proxy/gpt-5.4-nano` → `fail` exit=`130`: bounded executor stop before the full contract reached a terminal result. Before the stop, the real runtime durably recorded `8` callback-owned receipts and `14` completed tool-trace rows for `vk-workspace/superapp!696`; no effect-ledger file or GitLab mutation was produced.
- [ ] `2026-08-13T16:28:04Z` BLOCKED — trusted live source/tool observations now exist, but the exact full-review command did not terminate inside the executor bound. Per the ticket, partial trace plus timeout is not PASS.
      **Handoff →** artifacts: [`/private/tmp/gennady-tsk190-r3f/agent-inbox/control-plane-receipts/production/contract:f69f8413a000c8de39b755e7d342ce8fb27916bda3748ba61b114d3b43f7176e/7c1071982d0d4686452efed1b26d234f93ba2f44df2821547b4d2540e56eab74/receipts.jsonl`; `/private/tmp/gennady-tsk190-r3f/agent-inbox/mrs/gitlab.corp.mail.ru__vk-workspace__superapp-696/report/telemetry/tool-trace.jsonl`]; decisions: [no partial or timed-out run is promoted to PASS]; open: [make the real full-contract pass bounded at the product runtime level, then rerun the exact live command to terminal completion]

#### Round close

- [ ] `2026-08-13T16:28:04Z` BLOCKED — deterministic acceptance and trusted live callback evidence pass independently; terminal full-contract live proof remains absent, so TSK-190 stays TODO and audit is not authorized.

### Round 3 — 2026-08-13, interrupted-run recovery inspection

#### P1

- [x] `2026-08-13T16:31:04Z` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-13T16:31:04Z` DONE
      **Handoff →** artifacts: [callback-owned receipt identity; semantic-only agent response mapping; per-MR freshness transaction]; decisions: [agent-authored `sourceId` remains ignored; artifact `content` and `fields` are semantic conclusions only; canonical source/target/bytes/outcome remain callback-observed]; open: []

#### P2

- [x] `2026-08-13T16:31:04Z` ver `focused trusted-boundary suite` → `pass` exit=`0` tests=`10/10`
- [x] `2026-08-13T16:31:04Z` ver `run-mode and managed base-SHA suite` → `pass` exit=`0` tests=`12/12`
- [ ] `2026-08-13T16:31:04Z` ver `inspect existing /private/tmp/gennady-tsk190-r3* live artifacts` → `fail`: the most complete real run (`r3g`, `vk-workspace/superapp!696`) contains `17/34` durable callback-owned slot receipts and `20` completed tool-trace rows, but no terminal `artifacts.json`, `evidence.json`, `review.json`, `verdict.json`, freshness PASS, or completed one-shot result. No effect-ledger artifact was found.
- [ ] `2026-08-13T16:31:04Z` BLOCKED — existing live evidence is trustworthy but incomplete because its one-shot process was interrupted before the full contract and terminal readback completed. The ticket explicitly forbids promoting partial or interrupted trace to PASS.
      **Handoff →** artifacts: [`/private/tmp/gennady-tsk190-r3g/agent-inbox/control-plane-receipts/production/contract:f69f8413a000c8de39b755e7d342ce8fb27916bda3748ba61b114d3b43f7176e/7c1071982d0d4686452efed1b26d234f93ba2f44df2821547b4d2540e56eab74/receipts.jsonl`; `/private/tmp/gennady-tsk190-r3g/agent-inbox/mrs/gitlab.corp.mail.ru__vk-workspace__superapp-696/report/telemetry/tool-trace.jsonl`]; decisions: [no new live run was started during recovery; stale PID files were not used to terminate any process because every recorded port was already unreachable and process ownership could not be proven]; open: [add a product-level bounded terminal strategy for large real contracts, then run one real read-only MR through terminal completion and persist an explicit zero-effect ledger]

#### Round close

- [ ] `2026-08-13T16:31:04Z` BLOCKED — deterministic trusted-boundary behavior is green and real receipts/tool traces exist, but mandatory terminal live proof is still absent; TSK-190 remains TODO and audit is not authorized.

<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Accepted F01: receipt source/target/args/content/outcome facts come from the control-plane callback observation; agent JSON is never a receipt input.
- Accepted F02: durable receipt append acknowledgment precedes evidence eligibility; append failure is fail-closed and observable.
- Accepted F03: observed update, manifest comparison and guarded transition append are one serialized per-MR transaction; external GitLab dispatch is outside and no effect is authorized here.
- Accepted F04: all modified implementation and test files preserve canonical headers with `TSK-190` traceability.
- Accepted F05: section 6 case names are normative and must match test titles verbatim.
- Accepted F06: execution evidence uses only the project-wide log vocabulary; audit prose is not fabricated as completed event lines.
- Accepted BDD review: forged agent claims, durable append failure, interleaving observation, matching transition and live-runtime absence are separate negative/trust-boundary cases.
- Rejected BDD review: mock or intercepted OpenCode as real-runtime proof; any GitLab mutation/effect; broad API/dashboard/eval recovery owned by TSK-185…188; edits to TSK-184 historical rounds.
