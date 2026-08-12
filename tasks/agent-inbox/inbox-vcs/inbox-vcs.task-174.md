# Task: TSK-174 — Unified GitLab read, sync, effects and reconciliation

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-174
- **Status:** [x] DONE
- **Reopens:** 3
- **Purpose:** Consolidate GitLab truth into one read/effect boundary with inclusive discovery, complete event ingestion and safe reconciliation.
- **Scope:** agent-inbox
- **Module:** inbox-vcs
- **Dependencies:** TSK-173
- **Spec References:** [Inventory](../../../specs/agent-inbox/inbox-vcs/inbox-vcs.spec.md#3-entity-inventory-closed-world), [Contracts](../../../specs/agent-inbox/inbox-vcs/inbox-vcs.spec.md#5-module-contracts-dbc)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `integration`, `real-observation` (Round 4)
- **Deferred Runtime Scope:** todos pagination beyond the 100-cap (silent truncation of review-requests past 100 pending todos) and periodic ghost-todo `todoMarkDone` cleanup — see D-343 residual gaps; owner: follow-up tickets.

[sdd-boundary-meta]: #

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

- **Objective:** Merge current VCS implementations; implement sync coordinator, event normalizer, permission truth table, idempotent effects, capability probe and reconciliation.
- **Rules:** [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-vcs/`, `services/agent-inbox/modules/inbox-core/vcs-inbox.real.ts`, `services/agent-inbox/modules/inbox-core/types/review-event.type.ts`, `services/agent-inbox/serve/bootstrap.ts`, `services/vcs-client/`, `cli/cmd/inbox/help.ts`, `specs/agent-inbox/inbox-vcs/inbox-vcs.spec.md`
- **Inputs:** TSK-173 handoff
- **Exit:** no parallel VCS source of truth remains; all effect kinds are capability/permission checked.

[sdd-boundary-phase-p1]: #

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Port contracts and allowlisted GitLab integration for discovery, event coverage, resolve truth table, request-changes and ambiguous reconciliation.
- **Rules:** [testing-common](../../../ai/directives/testing/common.xml), [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:** `services/agent-inbox/modules/inbox-vcs/__tests__/`, `services/vcs-client/__tests__/gitlab/vcs-gitlab-client.observation.test.ts`, `services/vcs-client/gitlab/__tests__/vcs-gitlab-inbox.test.ts`, `services/agent-inbox/modules/inbox-core/__tests__/vcs-inbox.real.blackbox.test.ts`, `services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts`
- **Inputs:** P1 handoff
- **Exit:** real and mock adapters pass the same contract suite; real-effects targets are allowlisted.

[sdd-boundary-phase-p2]: #

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Scenario:** VCS ports and outcomes are exhaustive [`contract`]

- **Given** all read/effect/action/outcome variants
- **When** boundary types are validated
- **Then** every supported kind is handled and unknown kinds fail before I/O

**Scenario:** discovery includes every participation signal [`integration`]

- **Given** MRs where operator is author, reviewer, assignee, mentioned, commenter or approver
- **When** initial discovery runs
- **Then** every open MR is tracked once and inactive older MR is hidden

**Scenario:** resolve permission truth table is enforced [`contract`]

- **Given** operator, allowlisted bot and foreign threads across author/non-author MR
- **When** manual or automatic resolve is requested
- **Then** only the two permitted ownership cases execute

**Scenario:** ambiguous effect reconciles before retry [`integration`]

- **Given** transport loses an effect response
- **When** coordinator handles retry
- **Then** it reads GitLab first and never duplicates an observed effect

**Scenario:** request changes uses native capability only [`integration`]

- **Given** supported and unsupported GitLab hosts
- **When** package requests changes
- **Then** supported host reconciles native reviewer state and unsupported host creates no effect

**Scenario:** sync cursor never advances on incomplete observation [`integration`]

- **Given** partial snapshot, polling failure and recovery with commits/description/discussion/approval/pipeline events
- **When** sync normalizes observations
- **Then** partial data requests refresh, failed poll preserves cursor, effects postpone and recovered events append in order

**Scenario:** negative effect gates deny before I/O [`contract`]

- **Given** missing identity/ownership, automatic reopen, stale request-changes revision, missing permission/body or unsupported host
- **When** permission/capability gates evaluate
- **Then** action is denied or marked unavailable without external effect/outcome

**Scenario:** allowlisted real-adapter effect reconciles [`integration`]

- **Given** explicit allowlisted GitLab MR and stable effect id
- **When** one supported effect is executed through the real adapter
- **Then** a fresh GitLab read observes exactly one effect and records reconciliation evidence

[sdd-boundary-bdd]: #

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Required by               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                                                                                                                                                                                                                                                                                                                                                                                                                              | typescript-rules          |
| `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-vcs/__tests__/vcs-port.contract.test.ts services/agent-inbox/modules/inbox-vcs/__tests__/vcs-permission.contract.test.ts services/agent-inbox/modules/inbox-vcs/__tests__/vcs-effects.integration.test.ts services/agent-inbox/modules/inbox-vcs/__tests__/vcs-sync.integration.test.ts services/vcs-client/__tests__/gitlab/vcs-gitlab-client.observation.test.ts` | testing-common, node-test |
| `node --import tsx --test --experimental-test-module-mocks services/vcs-client/gitlab/__tests__/vcs-gitlab-inbox.test.ts services/agent-inbox/modules/inbox-core/__tests__/vcs-inbox.real.blackbox.test.ts services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts`                                                                                                                                                                                       | testing-common, node-test |

- **Task-specific Completion additions:** live effects require explicit allowlisted MR evidence.

[sdd-boundary-verification]: #

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- shapes → `vcs-port.contract.test.ts` :: `VCS contracts handle every action and outcome exhaustively`
- adapter parity → `vcs-port.contract.test.ts` :: `{memory,readonly,real-gitlab} runtime passes the common read/effect port contract`
- real observation → `vcs-gitlab-client.observation.test.ts` :: `reads approvers from the dedicated approvals endpoint`; `returns the full ordered commit range and marks provider truncation incomplete`
- legacy discovery compatibility → `vcs-inbox.real.blackbox.test.ts` :: `should discover, dedup, and role-merge MRs via the real GraphQL path`; `full-flow.blackbox.test.ts` :: `drives a real reviewer MR to a terminal state with both backends faked at the network layer`
- participation → `vcs-sync.integration.test.ts` :: `discovery includes every explicit participation signal once`
- permissions → `vcs-permission.contract.test.ts` :: `resolve and reopen follow the ownership truth table`
- reconcile → `vcs-effects.integration.test.ts` :: `ambiguous effect reads GitLab before safe retry`
- request changes → `vcs-effects.integration.test.ts` :: `request changes probes native capability and never substitutes silently`
- sync cursor → `vcs-sync.integration.test.ts` :: `partial or failed sync preserves cursor and recovery appends every event in order`
- negative gates → `vcs-permission.contract.test.ts` :: `identity ownership automatic reopen and request changes negative gates deny before IO`
- real effect → `vcs-effects.real-integration.test.ts` :: `allowlisted real GitLab effect is observed exactly once after reconciliation`

[sdd-boundary-test-coverage]: #

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-10, initial

#### P1

- [x] `2026-08-10T20:04:19Z` ver `npm run type-check` → pass exit=`0`
- [x] `2026-08-10T20:04:19Z` DONE
      **Handoff →** artifacts: unified `VcsPort`, GitLab adapter/client, sync coordinator, event normalizer, permission policy, effects reconciler and production bootstrap; decisions: native GraphQL request-changes only, complete-snapshot cursor advancement, fresh-read-before-retry; open: none for P1.

#### P2

- [x] `2026-08-10T20:04:19Z` ver scoped mock/contract/integration tests → pass `43/43`, exit=`0`
- [ ] `2026-08-10T20:04:19Z` ver `vcs-effects.real-integration.test.ts` → fail exit=`1`: exact live-effect prerequisites absent; test intentionally does not skip or mutate an unallowlisted MR.
- [ ] `2026-08-10T20:04:19Z` BLOCKED
      **Handoff →** artifacts: exhaustive contract, permission, discovery, cursor/event and reconciliation matrices plus guarded real-adapter test; decisions: no mock may satisfy the real-effect exit; open: provide `TSK174_GITLAB_HOST`, `TSK174_GITLAB_PROJECT`, `TSK174_GITLAB_MR_IID`, `TSK174_GITLAB_REVISION`, `TSK174_GITLAB_REQUEST_CHANGES_BODY`, and exact `TSK174_GITLAB_EFFECT_ALLOW=request_changes:{host}/{project}!{iid}@{revision}` (`GITLAB_PERSONAL_TOKEN` is already set).

#### Round close

- [ ] `2026-08-10T20:04:19Z` BLOCKED only on explicit allowlisted real GitLab effect evidence; type-check and all non-mutating/scoped tests are green.

### Round 1 continuation — 2026-08-11, explicit target supplied

- [x] `2026-08-11T06:55:30Z` read-only before state → `mail/messenger!205`, revision `545714ba822192197641da996428988187312213`, state `opened`, operator `k.lebedev`, reviewers `[]`.
- [x] `2026-08-11T06:55:30Z` exact allowlist → `request_changes:gitlab.corp.mail.ru/mail/messenger!205@545714ba822192197641da996428988187312213`; no broader target authorized.
- [ ] `2026-08-11T06:55:30Z` ver `vcs-effects.real-integration.test.ts` → fail exit=`1` before mutation: host schema lacks `CurrentUser.mergeRequestInteraction`; read-only capability probe returns `requestChanges=false`.
- [x] `2026-08-11T06:55:30Z` fresh reconciliation read → same revision/state, capability remains unavailable; guarded attempt count `1`, blind retry count `0`, mutation count `0`.
- [ ] `2026-08-11T06:55:30Z` BLOCKED: supplied GitLab host/MR cannot produce the required supported native-effect evidence; the body was not posted and no MR state was changed.

### Round 1 continuation — 2026-08-11, supported effect correction

- [x] `2026-08-11T07:01:52Z` corrected real-effect harness → effect kind and payload are explicit inputs; exact kind/host/project/MR/revision allowlist remains mandatory and protected fields cannot be overridden by payload.
- [x] `2026-08-11T07:01:52Z` preserved real unsupported-host proof → native `request_changes=false` creates no effect; reviewer-state read degrades to `unknown` without blocking unrelated supported effects.
- [x] `2026-08-11T07:01:52Z` read-only permission proof → operator `k.lebedev`, project membership access level `50`; fresh target revision `545714ba822192197641da996428988187312213`.
- [x] `2026-08-11T07:01:52Z` exact allowlist → `comment:gitlab.corp.mail.ru/mail/messenger!205@545714ba822192197641da996428988187312213`; guarded real-effect test pass `1/1`, mutation attempts `1`, blind retries `0`.
- [x] `2026-08-11T07:01:52Z` fresh reconciliation read → exact comment count `1`, author `k.lebedev`, note id `62480336`, revision/state unchanged.
- [x] `2026-08-11T07:03:39Z` ver `npm run type-check` → pass exit=`0`; scoped mock/contract/integration tests → pass `43/43`; formatter → pass.
- [x] `2026-08-11T07:03:39Z` DONE
      **Handoff →** artifacts: generic exact-allowlist real-effect harness, real unsupported-capability evidence, one reconciled supported comment and adapter degradation for optional reviewer state; open: fresh isolated audit required.

### Round 2 — 2026-08-11, audit remediation

- ✅ RESOLVED Round 1 P2 blocker at `2026-08-10T20:04:19Z`: operator supplied the exact `mail/messenger!205` target and revision.
- ✅ RESOLVED Round 1 close blocker at `2026-08-10T20:04:19Z`: exact allowlisted live-effect evidence was recorded as comment note `62480336`.
- ✅ RESOLVED Round 1 continuation blocker at `2026-08-11T06:55:30Z`: the unsupported native action remained a proven no-effect and the explicitly selected supported comment completed the real-adapter proof without substitution.

#### P1

- [x] `2026-08-11T07:23:17Z` ver `npm run type-check` → pass exit=`0`
- [x] `2026-08-11T07:23:17Z` DONE
      **Handoff →** artifacts: `services/vcs-client/gitlab/vcs-gitlab-client.ts` real approvals/compare endpoints; `services/agent-inbox/modules/inbox-vcs/vcs-port.ts`, `vcs-gitlab.port.ts`, `readonly-effect.guard.ts`, `vcs-runtime.ts`, sync/effects/normalizer/reconciler/policy modules; compatibility bridges `services/agent-inbox/modules/inbox-core/vcs-inbox.real.ts`, `services/agent-inbox/modules/inbox-core/types/review-event.type.ts`; production composition `services/agent-inbox/serve/bootstrap.ts`; aligned `specs/agent-inbox/inbox-vcs/inbox-vcs.spec.md`. Decisions: incomplete approvals/commit comparison is explicit and cannot advance sync cursor; existing `VcsGitlabPort` is the single real adapter; readonly profile selects a deny-before-I/O effect guard independently from real reads. Open: none.

#### P2

- [x] `2026-08-11T07:23:17Z` ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-vcs/__tests__/vcs-port.contract.test.ts services/agent-inbox/modules/inbox-vcs/__tests__/vcs-permission.contract.test.ts services/agent-inbox/modules/inbox-vcs/__tests__/vcs-effects.integration.test.ts services/agent-inbox/modules/inbox-vcs/__tests__/vcs-sync.integration.test.ts services/vcs-client/__tests__/gitlab/vcs-gitlab-client.observation.test.ts` → pass `12/12`, exit=`0`
- [x] `2026-08-11T07:23:17Z` live evidence reused without another mutation → allowlisted comment note `62480336` remains the one Round-1 effect; unsupported native `request_changes` remains mutation count `0`.
- [x] `2026-08-11T07:26:52Z` ver targeted `gennady lint` → pass exit=`0`; scoped Prettier check → pass exit=`0`; all eight `sdd-extract` anchors → pass exit=`0`; `sdd-check --task` → clean exit=`0`.
- [x] `2026-08-11T07:23:17Z` DONE
      **Handoff →** artifacts: common memory/readonly/real-GitLab port suite, dedicated endpoint tests, permission/reconciliation/sync tests and canonical real-effect case name; attribution excludes every TSK-175 inbox-opencode path. Open: fresh isolated round-2 audit required.

#### Round close

- [x] `2026-08-11T07:26:52Z` DONE — F-01…F-08 remediated; exact gates and ticket anchors verified; no new GitLab mutation performed.

### Round 2 continuation — legacy entrypoint compatibility regression

- [x] `2026-08-11T07:41:26Z` P1 DONE — split `todos`, `reviewRequestedMergeRequests`, `assignedMergeRequests` and `authoredMergeRequests` into four independently bounded GraphQL documents; preserved web-URL deduplication, todo/event union and role precedence; corrected stale CLI/sync single-query documentation.
      **Handoff →** artifacts: `services/vcs-client/gitlab/vcs-gitlab-inbox.ts`, `cli/cmd/inbox/help.ts`, `services/agent-inbox/modules/inbox-vcs/sync.ts`; decisions: exactly one bounded root connection per request, assigned MRs remain the legacy `mentioned` placement role, no third discovery implementation; open: none.
- [x] `2026-08-11T07:41:26Z` ver `npm run type-check` → pass exit=`0`
- [x] `2026-08-11T07:41:26Z` ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-vcs/__tests__/vcs-port.contract.test.ts services/agent-inbox/modules/inbox-vcs/__tests__/vcs-permission.contract.test.ts services/agent-inbox/modules/inbox-vcs/__tests__/vcs-effects.integration.test.ts services/agent-inbox/modules/inbox-vcs/__tests__/vcs-sync.integration.test.ts services/vcs-client/__tests__/gitlab/vcs-gitlab-client.observation.test.ts` → pass `12/12`, exit=`0`
- [x] `2026-08-11T07:41:26Z` ver `node --import tsx --test --experimental-test-module-mocks services/vcs-client/gitlab/__tests__/vcs-gitlab-inbox.test.ts services/agent-inbox/modules/inbox-core/__tests__/vcs-inbox.real.blackbox.test.ts services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts` → pass `7/7`, exit=`0`
- [x] `2026-08-11T07:41:26Z` legacy exact-entrypoint proof → isolated state configured under `/tmp/tsk174-legacy-inbox.ISplOY`; `npx tsx /Users/k.lebedev/Developer/gennady/cli/gennady.ts inbox --json --no-save --state-dir /tmp/tsk174-legacy-inbox.ISplOY --vcs-host=gitlab.corp.mail.ru` returned `configured=true`, `total=19`, exit=`0`.
- [x] `2026-08-11T07:41:26Z` ver targeted `gennady lint` → pass exit=`0`; scoped Prettier check → pass exit=`0`; GitLab mutations=`0`.
- [x] `2026-08-11T07:41:26Z` P2 DONE
      **Handoff →** artifacts: source-specific bounded-query adapter blackbox, assigned-source assertion, full-flow legacy regression; attribution: compatibility tests are TSK-174, existing TSK-150/167/170 ownership remains; open: restarted fresh audit-r2 required.
- [x] `2026-08-11T07:41:26Z` DONE — compatibility regression closed; canonical and compatibility gates green; no GitLab mutation performed.

### Recovery after audit-r2 — 2026-08-11, operator-authorized

- [x] `2026-08-11T08:04:29Z` P1 DONE — internalized provider-only approval/comparison result types; reconciled GitLab client operations and every new inbox-vcs support entity with the closed-world specs; added trace-prefixed Catch-Log-Recover and cause chains to new client/adapter integration boundaries, including logged capability-probe degradation.
- [x] `2026-08-11T08:04:29Z` P2 DONE — appended `TSK-174` ownership to both affected legacy tests; preserved all 16 SECTION markers at column zero with non-rendering Markdown reference boundaries; ticket Prettier check passes.
- [x] `2026-08-11T08:04:29Z` ver `npm run type-check` → pass exit=`0`; canonical contract/integration tests → pass `12/12`, exit=`0`; compatibility tests → pass `7/7`, exit=`0`; targeted `gennady lint` → pass exit=`0`; scoped Prettier → pass exit=`0`; `sdd-check --task` → clean exit=`0`; `git diff --check` → pass exit=`0`.
- [x] `2026-08-11T08:04:29Z` real readonly legacy entrypoint → first attempt timed out before output; fresh isolated retry returned `configured=true`, `total=19`, exit=`0`; `--no-save` retained and GitLab mutations=`0`.
- [x] `2026-08-11T08:04:29Z` DONE — audit-r2 F-01…F-04 remediated without inbox-opencode/TSK-175 edits; fresh isolated recovery audit required.

### Recovery 2 — 2026-08-11, operator-authorized F-01 only

- [x] `2026-08-11T08:17:15Z` P1 DONE — wrapped `VcsGitlabPort.reopen` and `VcsGitlabPort.unapprove` in trace-prefixed Catch-Log-Recover; adapter errors preserve the exact provider failure as `cause` and prevent raw provider errors from escaping.
- [x] `2026-08-11T08:17:15Z` P2 DONE — targeted boundary proof passes `5/5`; canonical contract/integration suite passes `13/13`; `npm run type-check` passes; GitLab mutations=`0`.
- [x] `2026-08-11T08:19:00Z` ver targeted `gennady lint` → pass exit=`0`; scoped Prettier → pass exit=`0`; all eight `sdd-extract` sections → pass exit=`0`; `sdd-check --task` → clean exit=`0`; `git diff --check` → pass exit=`0`.
- [x] `2026-08-11T08:19:00Z` DONE — recovery audit F-01 remediated without discovery, legacy entrypoint, effect semantics or TSK-175 changes; fresh isolated audit required.

### Round 4 — 2026-08-12, late-detected real-runtime regression (D-343)

- [x] `2026-08-12` finding — `getActionable` accepted on green mock/contract tiers with `Deferred Runtime Scope: None`, but its `real-runtime` discovery capability was never observed for latency. The one live legacy run (Recovery block) `timed out before output` and the timeout was dismissed as a flake — `exit=0` of a fresh retry was recorded instead. Root cause: paper-fix for the GraphQL complexity error (split into 4 queries + `first: 100` on nested `reviewers`/`approvedBy`) made GitLab resolve the full nested projection across ~100 pending todos (~68 merged/closed ghosts), compounding superlinearly.
- [x] `2026-08-12` real observation `getActionable` wall-clock vs live `gitlab.corp.mail.ru` (@k.lebedev) → OLD (all-full 4 queries) median **14925ms**; per-source A/B isolated the cost to the full nested set on the capped todos source.
- [x] `2026-08-12` fix — todos targets use a light projection (filter/placement fields only); connection sources keep the full projection; merge order flipped so connections populate full fields before a light todo touches an MR. Commit `2d6b152`.
- [x] `2026-08-12` real observation after fix → NEW median **3383ms** (14.9s → 3.4s, 4.4×, −11.5s); `npm run type-check` pass; targeted `gennady lint` clean; affected suites `vcs-gitlab-inbox` + `port-contract` + consumer tests pass `38/38`.
- [x] `2026-08-12` DONE — regression closed with recorded live latency; `Deferred Runtime Scope` corrected from the false `None` to name the residual todos-cap and ghost-cleanup gaps (D-343).
<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Consolidate current `VcsInbox*` and `VcsGitlabPort/Effects`; creation of a third adapter hierarchy is forbidden.
- BDD critic: merged sync/cursor, complete permission/request-changes negatives and allowlisted real-effect proof; rejected silent fallback and discovery-broadened targets.
