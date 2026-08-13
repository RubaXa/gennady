# Task: TSK-185 — Restore the real board, API commands and live projections

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-185
- **Status:** [ ] TODO
- **Reopens:** 0
- **Purpose:** Make the production board converge on real GitLab state and expose every dashboard command through typed API/SSE adapters.
- **Scope:** agent-inbox
- **Module:** inbox-api
- **Dependencies:** TSK-174, TSK-190
- **Spec References:** [API spec](../../../specs/agent-inbox/inbox-api/inbox-api.spec.md), [Root lifecycle](../../../specs/agent-inbox/agent-inbox.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `integration`, `e2e`
- **Deferred Runtime Scope:** Effect mutation proof belongs to TSK-186.

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

- **Objective:** Repair discovery→journal→projection convergence and implement typed `/package`, `/package/apply`, `/handoff`, `/complete`, `/description/update`, `/verify` commands plus SSE state transitions.
- **Target Files:** `services/agent-inbox/modules/inbox-api/`, `services/agent-inbox/serve/`, shared dashboard API types.
- **Exit:** real board leaves syncing, exposes explained MR inclusion/exclusion, and every dashboard command has a real adapter.

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Prove real discovery compatibility, lifecycle/horizon/participation rules, endpoint contracts and SSE recovery.
- **Target Files:** `services/agent-inbox/modules/inbox-api/__tests__/`, `services/agent-inbox/serve/__tests__/`, legacy inbox discovery tests.
- **Exit:** API MR identities/counts are explainable against the same real GitLab observation as CLI.

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** board converges on real GitLab [`e2e`]

- **Given** real `~/.gennady`, token and production server
- **When** discovery completes
- **Then** board leaves syncing and each concrete MR is shown or excluded with a typed reason comparable to `inbox --json --no-save`

**Scenario:** participation and horizon are deterministic [`integration`]

- **Given** author, reviewer, assignee, mention, comment and approval provenance plus activity around three months
- **When** projection builds
- **Then** every participation reason is retained, older MRs are hidden, and merged/closed remain completable until hidden

**Scenario:** commands and SSE use the same state [`contract`]

- **Given** a selected MR and package
- **When** package/apply, handoff, complete, description/update or verify is called
- **Then** typed command result and subsequent SSE event share MR, head SHA, cursor and outcome ledger; failures stay local

**Scenario:** legacy inbox discovery remains bounded [`integration`]

- **Given** real GitLab
- **When** `inbox --json --no-save` runs
- **Then** it succeeds using the bounded four-query discovery path without GraphQL complexity regression

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                               | Required by                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `npm run type-check`                                                                                                                                                  | TypeScript contracts        |
| `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-api/__tests__/*.test.ts services/agent-inbox/serve/__tests__/*.test.ts` | API/projection contracts    |
| `npx tsx cli/gennady.ts inbox --json --no-save --vcs-host=gitlab.corp.mail.ru`                                                                                        | real readonly compatibility |
| `ai/skills/sdd-execute/scripts/sdd check --task TSK-185`                                                                                                              | SDD integrity               |

- **Task-specific Completion additions:** real-readonly evidence includes concrete MR IDs and terminal board state; no fixture, demo seed or intercepted HTTP counts as acceptance.

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- convergence → `board-real-sync.integration.test.ts` :: `real discovery reaches terminal projection with explainable MR identities`
- participation/horizon → `projection-lifecycle.contract.test.ts` :: `participation horizon completion and reactivation truth table is exhaustive`
- commands/SSE → `review-command-api.contract.test.ts` :: `all dashboard commands and SSE events preserve manifest identity and outcomes`
- compatibility → `vcs-gitlab-inbox.blackbox.test.ts` :: `legacy inbox uses four bounded source queries and returns real MRs`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-13, recovery

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `API and real-readonly gates` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->
