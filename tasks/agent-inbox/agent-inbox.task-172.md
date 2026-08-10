# Task: TSK-172 — Isolate runtime profiles and bootstrap the pivot

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-172
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Ввести физически разделённые production/test/mock roots, controlled profile binding и безопасный boot barrier.
- **Scope:** agent-inbox
- **Module:** scope bootstrap
- **Dependencies:** None
- **Spec References:** [Bootstrap](../../specs/agent-inbox/agent-inbox.spec.md#8-bootstrap-requirements), [Core profiles](../../specs/agent-inbox/inbox-core/inbox-core.spec.md#reviewruntimeprofile)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `integration`
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

- **Objective:** Implement `ReviewRuntimeProfile`, namespace guards, profile-aware config/state roots and observable boot failure.
- **Rules:** [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-core/`, `services/agent-inbox/serve/`
- **Inputs:** none
- **Exit:** only four allowed profile combinations compose; production cannot be reset through test APIs.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Contract/integration proof of physical isolation, run-id reopening and failed unsafe binding.
- **Rules:** [testing-common](../../ai/directives/testing/common.xml), [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-core/__tests__/`, `services/agent-inbox/serve/__tests__/`
- **Inputs:** P1 handoff
- **Exit:** mapped BDD cases pass without touching the work root.
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** profile contract is exhaustive [`contract`]

- **Given** every allowed and forbidden namespace/I/O combination
- **When** the profile is validated
- **Then** only production+real-work, test+readonly/effects and mock+deterministic-mock are accepted

**Scenario:** test reset cannot address work state [`integration`]

- **Given** populated production state and a test run-id
- **When** test reset executes
- **Then** only the test root changes and production bytes remain identical

**Scenario:** unsafe effect profile fails before adapters start [`integration`]

- **Given** real-effects without allowlist
- **When** boot composes the runtime
- **Then** boot exposes a safety failure and no effect adapter starts

**Scenario:** diagnostic run and roots stay isolated [`integration`]

- **Given** a saved run-id, another run-id and canonicalized physical roots
- **When** the saved run is reopened read-only or a foreign reset/root collision is attempted
- **Then** reopen succeeds without effects while foreign reset and colliding roots are rejected; storage failure remains an observable unacknowledged boot failure

**Scenario:** worktree is lazy behind the ready barrier [`integration`]

- **Given** boot with no review task requiring repository content
- **When** connect, poll, reconcile and restore complete
- **Then** read-ready state creates no worktree; the first content task creates it once and exposes that phase
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                | Required by               |
| ------------------------------------------------------------------------------------------------------ | ------------------------- |
| `npm run type-check`                                                                                   | typescript-rules          |
| `npm test -- services/agent-inbox/modules/inbox-core/__tests__/ services/agent-inbox/serve/__tests__/` | testing-common, node-test |

- **Task-specific Completion additions:** prove isolation with distinct real paths.
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- profile exhaustive → `runtime-profile.test.ts` :: `accepts only the four safe runtime profile combinations`
- reset isolation → `runtime-profile.integration.test.ts` :: `test reset cannot read write or delete production state`
- unsafe effects → `bootstrap.test.ts` :: `real effects without allowlist fail before adapters start`
- diagnostic isolation → `runtime-profile.integration.test.ts` :: `saved run reopens read only and foreign reset or root collision is rejected`
- lazy worktree → `bootstrap.test.ts` :: `ready boot defers worktree until the first content task`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-10, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- <target-tests>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Supersedes bootstrap assumptions in TSK-156 for the v0 pivot; historical ticket remains immutable.
- BDD critic: merged run reopen/foreign reset/root canonicalization and boot-write failure; rejected remote/multi-account profiles as out of scope.
