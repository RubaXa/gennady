# Task: TSK-172 — Isolate runtime profiles and bootstrap the pivot

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-172
- **Status:** [x] DONE
- **Reopens:** 1
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
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

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

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Required by               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `npm run type-check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | typescript-rules          |
| `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.test.ts services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.integration.test.ts && node --import tsx --test --experimental-test-module-mocks --test-name-pattern='bootstrap — runtime safety boundary' services/agent-inbox/serve/__tests__/bootstrap.test.ts && node --import tsx --test --experimental-test-module-mocks --test-name-pattern=gracefulShutdown services/agent-inbox/serve/__tests__/shutdown.test.ts` | testing-common, node-test |

- **Task-specific Completion additions:** prove isolation with distinct real paths.
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- profile exhaustive [`contract-only`] → `runtime-profile.test.ts` :: `accepts only the four safe runtime profile combinations`
- reset isolation [`simulation-backed`, real filesystem] → `runtime-profile.integration.test.ts` :: `test reset cannot read write or delete production state`
- unsafe effects [`simulation-backed`] → `bootstrap.test.ts` :: `real effects without allowlist fail before adapters start`
- diagnostic isolation [`simulation-backed`, real filesystem] → `runtime-profile.integration.test.ts` :: `saved run reopens read only and foreign reset or root collision is rejected`
- lazy worktree [`simulation-backed`] → `bootstrap.test.ts` :: `ready boot defers worktree until the first content task`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-10, initial

#### P1

- [x] `2026-08-10T17:31Z` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-10T17:31Z` DONE
      **Handoff →** artifacts: [`runtime-profile.ts`, `runtime-profile.port.ts`, profile type contracts, profile-bound `StateStore`, bootstrap safety binding]; decisions: [production uses `~/.gennady`; real test/mock default to distinct OS-temp roots; saved real test runs reopen only as readonly; production has no reset surface]; open: [effect-port allowlist enforcement remains owned by TSK-174]

#### P2

- [x] `2026-08-10T17:31Z` ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.test.ts services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.integration.test.ts` → `pass` exit=`0`, tests=`3/3`
- [x] `2026-08-10T17:31Z` ver `node --import tsx --test --experimental-test-module-mocks --test-name-pattern='bootstrap — mock mode|runtime safety boundary|gracefulShutdown' services/agent-inbox/serve/__tests__/bootstrap.test.ts services/agent-inbox/serve/__tests__/shutdown.test.ts` → `pass` exit=`0`, tests=`11/11`
- [x] `2026-08-10T17:29Z` ver literal ticket command `npm test -- services/agent-inbox/modules/inbox-core/__tests__/ services/agent-inbox/serve/__tests__/` → `fail` exit=`1`: repository `npm test` appends directory arguments to `node --test`, which resolves them as missing `__tests__/index.json`; explicit file expansion was used above. The expanded all-files run additionally exposed pre-existing environment reds in real-opencode suites (port 4174 occupied / opencode child unavailable), while all TSK-172 and mock bootstrap/shutdown cases passed.
- [x] `2026-08-10T17:31Z` DONE
      **Handoff →** artifacts: [`runtime-profile.test.ts`, `runtime-profile.integration.test.ts`, `bootstrap.test.ts`]; decisions: [physical isolation assertions compare real production bytes and canonical temp paths; unsafe/storage failures expose only `connect → failed`]; open: [none for TSK-172]

#### Round close

- [x] `2026-08-10T17:31Z` DONE

### Round 2 — 2026-08-10, audit-r1 remediation F-01…F-08

#### P1 — re-run: runtime wiring, closed-world contracts, DbC and traceability

- [x] `2026-08-10T17:49:27Z` intro `ReviewStateNamespace` ← closed production/test/mock state namespace vocabulary used by the runtime composition gate
- [x] `2026-08-10T17:49:27Z` intro `ReviewExternalIoPolicy` ← closed real-work/readonly/effects/deterministic-mock capability vocabulary
- [x] `2026-08-10T17:49:27Z` intro `ReviewRuntimeProfileSpec` ← declarative composition input validated before adapter construction
- [x] `2026-08-10T17:49:27Z` intro `ReviewRuntimeRoots` ← pairwise-disjoint physical parents for production, test and mock state
- [x] `2026-08-10T17:49:27Z` intro `ReviewRuntimeBinding` ← canonical profile-to-state-root binding consumed by stateful adapters
- [x] `2026-08-10T17:49:27Z` intro `OpenRuntimeProfileOptions` ← controlled fresh/reopen/explicit-root opening policy
- [x] `2026-08-10T17:49:27Z` intro `composeDefaultReviewRuntimeRoots` ← safe default roots outside the production work namespace
- [x] `2026-08-10T17:49:27Z` intro `WorktreePreparationState` ← observable lazy content worktree lifecycle after the read-ready barrier
- [x] `2026-08-10T17:49:27Z` intro `BootstrapSafetyError` ← failed boot snapshot plus original profile/storage rejection cause
- [x] `2026-08-10T17:49:27Z` intro `BootReadiness#prepareWorktreeOnce` ← single-flight first-content-task worktree preparation behind ready
- [x] `2026-08-10T17:55:00Z` ver `npm run type-check` → pass exit=`0`
- [x] `2026-08-10T17:55:00Z` ver `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-core/boot-readiness.ts services/agent-inbox/modules/inbox-core/state-store.ts services/agent-inbox/modules/inbox-core/test-support/test-tmp.ts services/agent-inbox/modules/inbox-core/runtime-profile.port.ts services/agent-inbox/modules/inbox-core/runtime-profile.ts services/agent-inbox/modules/inbox-core/types/review-runtime-binding.type.ts services/agent-inbox/modules/inbox-core/types/review-runtime-profile-spec.type.ts services/agent-inbox/modules/inbox-core/types/review-runtime-roots.type.ts services/agent-inbox/modules/inbox-roles/role-scheduler.ts services/agent-inbox/serve/bootstrap.ts services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.integration.test.ts services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.test.ts services/agent-inbox/serve/__tests__/bootstrap.test.ts` → pass exit=`0`, errors=`0`
- [x] `2026-08-10T17:55:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-core/boot-readiness.ts, services/agent-inbox/modules/inbox-core/state-store.ts, services/agent-inbox/modules/inbox-core/test-support/test-tmp.ts, services/agent-inbox/modules/inbox-core/runtime-profile.port.ts, services/agent-inbox/modules/inbox-core/runtime-profile.ts, services/agent-inbox/modules/inbox-core/types/review-runtime-binding.type.ts, services/agent-inbox/modules/inbox-core/types/review-runtime-profile-spec.type.ts, services/agent-inbox/modules/inbox-core/types/review-runtime-roots.type.ts, services/agent-inbox/modules/inbox-roles/role-scheduler.ts, services/agent-inbox/serve/bootstrap.ts, specs/agent-inbox/inbox-core/inbox-core.spec.md]; decisions: [F-01=real-assignment-content-path-crosses-shared-BootReadiness, F-02=runtime-profile-support-entities-in-closed-world-inventory, F-03=DbC-contracts-reconciled, F-04=current-task-headers-appended-without-removing-history]; open: []

#### P2 — re-run: production-path integration and executable verification

- [x] `2026-08-10T17:55:00Z` ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.test.ts services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.integration.test.ts && node --import tsx --test --experimental-test-module-mocks --test-name-pattern='bootstrap — runtime safety boundary' services/agent-inbox/serve/__tests__/bootstrap.test.ts && node --import tsx --test --experimental-test-module-mocks --test-name-pattern=gracefulShutdown services/agent-inbox/serve/__tests__/shutdown.test.ts` → pass exit=`0`, tests=`8/8`
- [x] `2026-08-10T17:55:00Z` ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.test.ts services/agent-inbox/modules/inbox-roles/__tests__/assignment-persistence.test.ts` → pass exit=`0`, tests=`10/10`
- [x] `2026-08-10T17:55:00Z` ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-core/__tests__/boot-readiness.test.ts` → pass exit=`0`, tests=`12/12`
- [x] `2026-08-10T17:55:00Z` ver `ai/skills/sdd-execute/scripts/sdd check --files services/agent-inbox/modules/inbox-core/boot-readiness.ts services/agent-inbox/modules/inbox-core/state-store.ts services/agent-inbox/modules/inbox-core/test-support/test-tmp.ts services/agent-inbox/modules/inbox-core/runtime-profile.port.ts services/agent-inbox/modules/inbox-core/runtime-profile.ts services/agent-inbox/modules/inbox-core/types/review-runtime-binding.type.ts services/agent-inbox/modules/inbox-core/types/review-runtime-profile-spec.type.ts services/agent-inbox/modules/inbox-core/types/review-runtime-roots.type.ts services/agent-inbox/modules/inbox-roles/role-scheduler.ts services/agent-inbox/serve/bootstrap.ts services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.integration.test.ts services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.test.ts services/agent-inbox/serve/__tests__/bootstrap.test.ts` → pass exit=`0`, findings=`0`
- [x] `2026-08-10T17:55:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.integration.test.ts, services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.test.ts, services/agent-inbox/serve/__tests__/bootstrap.test.ts]; decisions: [F-05=test-header-carries-TSK-172, F-06=PHASE_P1-and-PHASE_P2-extract-non-empty, F-07=verification-table-command-is-explicit-and-executable, F-08=public-runtime-entities-have-intro-reasons, worktree-preparation=single-flight-preparing-to-ready]; open: [independent-audit=round-2]

#### Round close

- [x] `2026-08-10T17:55:00Z` DONE
<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- Supersedes bootstrap assumptions in TSK-156 for the v0 pivot; historical ticket remains immutable.
- BDD critic: merged run reopen/foreign reset/root canonicalization and boot-write failure; rejected remote/multi-account profiles as out of scope.

## Audit Rounds

### Audit Round 1 — 2026-08-10, after Execution Round 1

```text
@audit task=TSK-172 round=1 after-exec-round=1 triggered-reopen=Round-2 status=FAIL counts=B2·M6·m0·I0 phases_to_fix=[P1,P2]
F-01 | sev=B | type=COMPLETENESS_GAP | conf=H | loc=services/agent-inbox/serve/bootstrap.ts:890 | phase=P1 | src=tasks/agent-inbox/agent-inbox.task-172.md#4 | route=ticket-reopen | act=подключить `BootReadiness.prepareWorktreeOnce` к реальному пути первого content task и проверить наблюдаемые `preparing/ready`, а не вызывать helper напрямую из теста
F-02 | sev=B | type=CLOSED_WORLD_DRIFT | conf=H | loc=services/agent-inbox/modules/inbox-core/types/review-runtime-profile-spec.type.ts:6 | phase=P1 | src=specs/agent-inbox/inbox-core/inbox-core.spec.md#3 | route=spec-edit | act=добавить новые публичные runtime profile shapes/function/error в Entity Inventory либо сделать их непубличными внутренними деталями
F-03 | sev=M | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=services/agent-inbox/modules/inbox-core/runtime-profile.port.ts:31 | phase=P1 | src=ai/directives/coding/typescript-rules.xml#AX_BASE_CONTRACT_SHAPE | route=ticket-reopen | act=исправить 17 ошибок DbC lint по `@param` и `@returns` в runtime-profile port/profile/bootstrap
F-04 | sev=M | type=TASK_ID_DRIFT | conf=H | loc=services/agent-inbox/modules/inbox-core/state-store.ts:3 | phase=P1 | src=ai/directives/sdd/audit.directive.xml#AX_TASK_ID_INTEGRITY | route=code-fix | act=добавить `TSK-172` в `@tasks` production-файлов `state-store.ts`, `test-tmp.ts`, `bootstrap.ts` без удаления прежних ID
F-05 | sev=M | type=TASK_ID_DRIFT | conf=H | loc=services/agent-inbox/serve/__tests__/bootstrap.test.ts:3 | phase=P2 | src=ai/directives/sdd/audit.directive.xml#AX_TASK_ID_INTEGRITY | route=code-fix | act=добавить `TSK-172` в `@tasks` изменённого `bootstrap.test.ts` без удаления прежних ID
F-06 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tasks/agent-inbox/agent-inbox.task-172.md:42 | phase=P2 | src=ai/directives/sdd/audit.directive.xml#AX_TASK_ID_INTEGRITY | route=ticket-update | act=выровнять маркеры `PHASE_P1`/`PHASE_P2`, чтобы `sdd extract ... PHASE_P2` возвращал содержимое с exit 0
F-07 | sev=M | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=tasks/agent-inbox/agent-inbox.task-172.md:128 | phase=P2 | src=ai/directives/testing/common.xml#HOOK_TEST_RUNNER | route=ticket-reopen | act=заменить неисполняемую directory-argument verification-команду на точную file-expansion команду и завершить P2 только после её exit 0
F-08 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tasks/agent-inbox/agent-inbox.task-172.md:122 | phase=P1 | src=ai/directives/sdd/audit.directive.xml#AX_EXECUTION_LOG_VERIFICATION | route=ticket-update | act=добавить формальные `intro <X> ← <reason>` строки для новых публичных runtime entities либо устранить публичный drift
```

### Audit Round 2 — 2026-08-10, after Execution Round 2

```text
@audit task=TSK-172 round=2 after-exec-round=2 triggered-reopen=none status=FAIL counts=B1·M1·m1·I0 phases_to_fix=[]
F-01 | sev=B | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tasks/agent-inbox/agent-inbox.task-172.md:161 | phase=P2 | src=ai/directives/sdd/audit.directive.xml#AX_EXECUTION_LOG_VERIFICATION | route=ticket-update | act=заменить буквальные placeholders `<13 changed TS files>` в строках 161 и 165 на точный список файлов или ссылку на неизменяемый manifest с фактической командой
F-02 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tasks/agent-inbox/agent-inbox.task-172.md:153 | phase=P1 | src=ai/directives/sdd/audit.directive.xml#AX_EXECUTION_LOG_VERIFICATION | route=ticket-update | act=зафиксировать для P1 Round 2 собственные `ver`, `DONE` и `Handoff →` с фактическим результатом и артефактами
F-03 | sev=m | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tasks/agent-inbox/agent-inbox.task-172.md:151 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_EXECUTION_LOG_VERIFICATION | route=ticket-update | act=вынести строки с токенами `fix` и `tracker/ticket reconciled` из checked execution vocabulary либо записать их в допустимые `Handoff →` decisions
```
