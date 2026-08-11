# Task: TSK-175 — Agent runtime contracts, sessions and coverage traces

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-175
- **Status:** [x] DONE
- **Reopens:** 2 (2026-08-11 — audit-r1: production wiring and contracts; recovery audit: canonical chat retry observation)
- **Purpose:** Generalize the existing OpenCode boundary into `AgentRuntimePort` without replacing working session infrastructure.
- **Scope:** agent-inbox
- **Module:** inbox-opencode
- **Dependencies:** TSK-173
- **Spec References:** [Inventory](../../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md#3-entity-inventory-closed-world), [Contracts](../../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md#5-module-contracts-dbc)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None
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

- **Objective:** Adapt port/naming, pointer prompts, schema validation, semantic session routing, TTL recovery, outcome classification and tool trace attribution.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-opencode/` plus the compatibility-only
  `services/agent-inbox/modules/inbox-roles/outcome-classifier.ts` alias that removes the duplicate
  legacy classifier implementation and
  `services/agent-inbox/modules/inbox-api/routers/chat.router.ts` production consumer wiring.
- **Inputs:** TSK-173 handoff
- **Exit:** one runtime hierarchy and one shared session pool remain.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Contract tests for run/continue/failure, prompt pointers, schema mismatch, context routing, expiry and coverage trace absence.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-opencode/__tests__/` and
  `services/agent-inbox/modules/inbox-api/__tests__/chat.router.test.ts` for the migrated canonical
  `AgentRuntimePort.run` context-overflow retry regression.
- **Inputs:** P1 handoff
- **Exit:** real intercepted-network and deterministic adapters satisfy identical runtime contracts.
  <!--/SECTION:PHASE_P2-->
  <!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** agent runtime contracts are exhaustive [`contract`]

- **Given** session, outcome, schema and trace variants
- **When** boundary values are validated
- **Then** invalid variants and missing attribution are rejected

**Scenario:** continuation preserves producer context [`integration`]

- **Given** a coverage retry for a live producer task
- **When** it is routed
- **Then** the same session continues and tool trace accumulates

**Scenario:** widening uses independent context [`unit`]

- **Given** a widen/fact-check task
- **When** session policy is evaluated
- **Then** a new independent session is selected

**Scenario:** unavailable runtime is visible [`integration`]

- **Given** OpenCode cannot respond
- **When** a task runs
- **Then** the task fails visibly with retry metadata and no fabricated result

**Scenario:** prompt/schema/TTL boundary is strict [`integration`]

- **Given** stable paths/SHA/artifact addresses, invalid structured output and expired producer session
- **When** prompt runs or continuation is requested
- **Then** repository content is not copied inline, raw invalid output is retained for retry and expired context requires an explicit fresh run while operator sessions remain MR-isolated
  <!--/SECTION:BDD-->
  <!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                     | Required by               |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                                                                                        | typescript-rules          |
| `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-opencode/__tests__/*.test.ts` | testing-common, node-test |

- **Task-specific Completion additions:** prove no second session registry/pool is introduced.
  <!--/SECTION:VERIFICATION-->
  <!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- shapes `[contract-only]` → `agent-runtime.contract.test.ts` :: `agent runtime contracts require exhaustive outcomes and attribution`
- continuation `[simulation-backed]` → `session-routing.integration.test.ts` :: `coverage retry continues the producer session and trace`
- widen `[simulation-backed]` → `session-routing.test.ts` :: `widen and fact check select independent context`
- unavailable `[simulation-backed]` → `agent-runtime.integration.test.ts` :: `runtime failure is visible and never fabricates output`
- prompt/schema/TTL `[simulation-backed]` → `agent-runtime.integration.test.ts` :: `pointer prompt schema failure and session expiry preserve strict runtime boundaries`
- context-overflow retry `[simulation-backed]` → `inbox-api/__tests__/chat.router.test.ts` :: `context overflow переиздаёт turn через durable digest без duplicate SSE answer`
  <!--/SECTION:TEST_COVERAGE-->
  <!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-10, initial

#### P1

- [x] 2026-08-10T19:54:01Z intro `AgentRuntimePort` ← one attributed run/continue/stream/cancel/inspect contract layered onto the existing OpenCode session hierarchy
- [x] 2026-08-10T19:54:01Z intro `OpenCodeAgentAdapter` ← spec-facing name for the existing intercepted-network production adapter; `OpenCodeReal` remains an alias, not a second adapter
- [x] 2026-08-10T19:54:01Z intro `AgentSession`, `AgentSessionPool`, `AgentSessionLifecycle` ← semantic producer/independent/operator routing, controlled 45-minute TTL and runtime-profile namespace isolation on the one existing registry/pool
- [x] 2026-08-10T19:54:01Z intro `AgentPromptCompiler`, `AgentSchemaRegistry` ← immutable SHA/path/artifact prompts and retryable raw-preserving structured-output validation
- [x] 2026-08-10T19:54:01Z intro `AgentOutcomeClassifier`, `AgentCoverageTrace` ← runtime-owned exhaustive outcome policy and factual attributed coverage evidence
- [x] 2026-08-10T19:54:01Z decision `legacy compatibility=aliases` ← old port/adapter/pool/lifecycle/compiler/schema names resolve to the same runtime classes; no parallel hierarchy exists
- [x] 2026-08-10T19:54:01Z decision `legacy role classifier=canonical alias` ← role consumer imports the runtime-owned classifier without duplicated classification logic
- [x] 2026-08-10T19:54:01Z ver `npm run type-check` → pass exit=`0`
- [x] 2026-08-10T19:54:01Z ver `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-opencode` → pass exit=`0`
- [x] 2026-08-10T19:54:01Z DONE
      **Handoff →** artifacts: [`opencode.port.ts`, `opencode.real.ts`, `opencode.mock.ts`, `agent-outcome-classifier.ts`, `agent-coverage-trace.ts`, `prompt-compile.ts`, `schema-registry.ts`, `session-registry.ts`, `session-pool.ts`, `session-lifecycle.ts`, `inbox-roles/outcome-classifier.ts`]; decisions: [in-place aliases, one shared registry/pool, controlled TTL, profile-isolated routing, raw evidence retained]; open: []

#### P2

- [x] 2026-08-10T19:54:01Z intro contract coverage ← exhaustive attributed outcomes, missing-attribution/trace rejection and deterministic/intercepted-network adapter parity
- [x] 2026-08-10T19:54:01Z intro routing coverage ← same producer continuation accumulates trace; widen/fact-check are fresh; expired producer context is explicit fresh; operator sessions remain MR/profile isolated
- [x] 2026-08-10T19:54:01Z intro boundary coverage ← unavailable runtime has retry metadata and no output; pointer prompt never embeds repository content; schema mismatch preserves raw response
- [x] 2026-08-10T19:54:01Z ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-opencode/__tests__/*.test.ts` → pass exit=`0` (163 tests)
- [x] 2026-08-10T19:54:01Z ver `node --import tsx --test --experimental-test-module-mocks --experimental-test-coverage <TSK-175 test files>` → pass exit=`0` (5 tests; coverage report emitted)
- [x] 2026-08-10T19:54:01Z ver `npx prettier --check services/agent-inbox/modules/inbox-opencode services/agent-inbox/modules/inbox-roles/outcome-classifier.ts` → pass exit=`0`
- [x] 2026-08-10T19:54:01Z DONE
      **Handoff →** artifacts: [`agent-runtime.contract.test.ts`, `agent-runtime.integration.test.ts`, `session-routing.test.ts`, `session-routing.integration.test.ts`, `prompt-compile.test.ts`]; decisions: [contract titles bound verbatim, controlled clock/no sleeps, no snapshots/mocks of SUT]; open: []

#### Round close

- [x] 2026-08-10T19:54:01Z proof `one registry/pool` ← definitions remain exactly one `SessionRegistry` and one `AgentSessionPool`; all old names are aliases
- [x] 2026-08-10T19:54:01Z DONE

### Round 2 — 2026-08-11, audit remediation

#### P1

- [x] 2026-08-11T08:26:05Z reopen `audit-r1 F-01..F-06` ← production backing, closed-world inventory, semantic producer routing, task traceability and assertion contracts
- [x] 2026-08-11T08:34:30Z mod `AgentSessionPool.run/continue` ← chat and role consumers now cross the attributed runtime boundary; strict schema outcome and factual trace are no longer test-only
- [x] 2026-08-11T08:34:30Z mod `bootstrap/session routing` ← context, SHA and runtime namespace survive registration; operator reuse consults the canonical lifecycle
- [x] 2026-08-11T08:34:30Z mod `chat.router.ts` ← production chat wiring forwards queue provenance through the canonical agent runtime boundary
- [x] 2026-08-11T08:34:30Z mod `coverage_retry` ← discriminated request requires producerTaskId and accepts only producer-owned context
- [x] 2026-08-11T08:34:30Z mod `closed-world inventory` ← reused SessionRegistry and deterministic OpenCodeMock are explicit module entities; aliases remain one hierarchy
- [x] 2026-08-11T08:34:30Z ver `npm run type-check` → pass exit=`0`
- [x] 2026-08-11T08:34:30Z ver `npx tsx cli/gennady.ts lint <changed runtime/consumer files>` → pass exit=`0`
- [x] 2026-08-11T08:34:30Z DONE
      **Handoff →** artifacts: [`session-pool.ts`, `session-lifecycle.ts`, `bootstrap.ts`, `role-instance.ts`, `chat-session.ts`, `session-router.ts`, `chat.router.ts`]; decisions: [canonical run/continue boundary, lifecycle-owned semantic reuse, no parallel registry/pool]; open: []

#### P2

- [x] 2026-08-11T08:34:30Z mod `contract assertions` ← discriminants are narrowed before diagnostic strict scalar equality assertions
- [x] 2026-08-11T08:34:30Z intro `negative semantic context` ← missing producer identity rejects; independent context cannot satisfy coverage retry
- [x] 2026-08-11T08:34:30Z ver `focused TSK-175 tests` → pass exit=`0` (18 tests)
- [x] 2026-08-11T08:34:30Z ver `full inbox-opencode suite` → pass exit=`0` (164 tests)
- [x] 2026-08-11T08:34:30Z ver `affected role/chat/session-router regression suite` → pass exit=`0` (33 tests)
- [x] 2026-08-11T08:34:30Z proof `real runtime without external writes` ← intercepted-network `OpenCodeAgentAdapter` and deterministic adapter satisfy identical run/trace contracts; bootstrap lifecycle proof passes with isolated mock namespace
- [x] 2026-08-11T08:34:30Z ver `npx prettier --check <TSK-175 scope>` → pass exit=`0`
- [x] 2026-08-11T08:34:30Z ver `npx gennady sdd-check --task tasks/agent-inbox/inbox-opencode/inbox-opencode.task-175.md` → pass exit=`0`
- [x] 2026-08-11T08:34:30Z DONE
      **Handoff →** artifacts: [`agent-runtime.contract.test.ts`, `agent-runtime.integration.test.ts`, `session-routing.integration.test.ts`, `chat-session.test.ts`, `bootstrap.test.ts`]; decisions: [no external GitLab writes, intercepted real adapter proof]; open: []

#### Round close

- [x] 2026-08-11T08:34:30Z proof `one registry/pool` ← exactly one SessionRegistry and one AgentSessionPool definition remain; compatibility exports are aliases
- [x] 2026-08-11T08:34:30Z DONE

### Recovery 2 — 2026-08-11, canonical chat retry observation

#### P2

- [x] 2026-08-11T09:02:32Z reopen `recovery-audit-r1 F-01` ← pre-existing context-overflow regression still mocked removed legacy `SessionPool.prompt` after production migrated to `AgentRuntimePort.run`
- [x] 2026-08-11T09:02:32Z mod `chat.router.test.ts` ← intercept canonical `SessionPool.run`, emit an attributed first-attempt `SESSION_ERROR`, then delegate the second attempt to the real pooled runtime boundary
- [x] 2026-08-11T09:02:32Z proof `retry semantics` ← exactly two canonical runtime attempts and one recovered SSE `turn_done`; no legacy prompt path or weakened assertion
- [x] 2026-08-11T09:04:25Z ver `chat.router.test.ts` → pass `5/5`, exit=`0`; canonical runtime attempts observed `2`
- [x] 2026-08-11T09:04:25Z ver focused TSK-175 → pass `18/18`; full inbox-opencode → pass `164/164`; affected runtime regression → pass `52/52`; TSK-174 compatibility smoke → pass `7/7`
- [x] 2026-08-11T09:04:25Z ver type-check, targeted DbC lint, scoped Prettier, `sdd-check --task`, and `git diff --check` → pass exit=`0`
- [x] 2026-08-11T09:04:25Z DONE
    **Handoff →** artifacts: [`services/agent-inbox/modules/inbox-api/__tests__/chat.router.test.ts`]; decisions: [canonical `AgentSessionPool.run` observation, attributed overflow result, exact two-attempt retry, single recovered SSE answer, no legacy prompt interception]; evidence: [`.codex-agent-status/sdd-batch-20260810T170955Z/TSK-175/recovery2-execute-r1/`]; open: [fresh independent recovery audit]
<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Existing session registry/pool/lifecycle are reuse targets; port generalization is an in-place migration.
- BDD critic: merged pointer/schema/TTL/operator-session cases and unit label; rejected a second runtime/session hierarchy.
