# Module: inbox-eval

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Evidence-backed deterministic and real-GitLab validation with explicit observed preconditions,
legitimate skips and isolated effect safety. Parent: [agent-inbox](../agent-inbox.spec.md).

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```ts
const probe = await harness.probe({ profile: 'real-readonly', mrs: explicitPool });
const report = await harness.run(probe.pickRunnableScenarios());
if (report.verdict !== 'PASS') explain(report);
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                      | Type         | Purpose                                          |
| ------------------------- | ------------ | ------------------------------------------------ |
| `ReviewEvalRun`           | Entity       | Isolated execution of selected scenarios.        |
| `ReviewEvalScenario`      | Entity       | Preconditions, steps and evidence criteria.      |
| `ReviewPreconditionProbe` | Service      | Observe whether a real MR can exercise a branch. |
| `ReviewEvalOutcome`       | Value Object | PASS, FAIL, SKIP or INCONCLUSIVE result.         |
| `ReviewEvalReport`        | Entity       | Evidence, observations and aggregate verdict.    |
| `ReviewEvalHarness`       | Service      | Compose profiles and execute scenarios.          |
| `ReviewPortContractKit`   | Service      | Shared adapter conformance suite.                |
| `RealReadonlyProfile`     | Adapter      | Real GitLab reads with all effects denied.       |
| `RealEffectsProfile`      | Adapter      | Real GitLab effects restricted by allowlist.     |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### Run, scenario, outcome and report

- **Public Operations:** select pool; probe; execute; attach evidence; aggregate verdict; explain skips/inconclusive state; reopen a saved run-id for diagnosis.
- **Lifecycle:** unique run-id and isolated state root; report is immutable after close.
- **Errors & Degradation:** infrastructure ambiguity becomes INCONCLUSIVE, not PASS or product FAIL.
- **Consumers:** PM, architect and execution agents.

### Harness, probes and contract kit

- **Public Operations:** inspect live prerequisites; run deterministic/readonly/effects suites; verify adapters uniformly.
- **Lifecycle:** run-scoped; real state is never reset.
- **Errors & Degradation:** missing scenario precondition produces justified SKIP; inability to observe it is INCONCLUSIVE.
- **Consumers:** task acceptance and audits.

### Real profiles

- **Public Operations:** bind explicit MR pool and permitted adapter set.
- **Lifecycle:** created per run and physically isolated from work profile.
- **Errors & Degradation:** missing allowlist disables effects profile before execution.
- **Consumers:** harness.
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

- All-skipped and no-runnable-scenario reports cannot be green.
- Every result records observed GitLab/profile preconditions and evidence addresses.
- Tests adapt by skipping impossible branches, not by weakening their expected result.
- Real-readonly never writes; real-effects writes only to explicit project/MR allowlist.
- Acceptance and visual proof use rebuilt production dashboard with real GitLab/state unless mock proof was explicitly requested.

### Saved run and profile contract

- **Preconditions:** explicit non-production run-id, allowed profile combination and MR pool where required.
- **Postconditions:** closed reports are immutable and can be reopened read-only with all evidence addresses.
- **Invariants:** reopen never resumes effects; real-readonly never writes; real-effects never broadens its allowlist.
- **Runtime Backing:** deterministic adapters or allowlisted real GitLab according to profile.
- **Verification Levels:** unit, contract, integration and real-MR e2e.
<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

- Profiles: deterministic mock, real-readonly, real-effects.
- Profile binding follows core combinations: `mock + deterministic-mock`, `test + real-readonly`, or `test + real-effects`; eval cannot open `production + real-work`.
- MR pool is explicit input; implicit discovery may suggest candidates but cannot silently broaden effects scope.
- Report statuses: `PASS`, `FAIL`, `SKIP`, `INCONCLUSIVE`.
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```text
inbox-eval/
├── scenarios/
├── probes/
├── profiles/
├── contracts/
├── reports/
└── harness/
```

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

- `D-EVAL-01`: adaptive means evidence-aware status, never adaptive assertion weakening.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** [core](../inbox-core/inbox-core.spec.md), [VCS](../inbox-vcs/inbox-vcs.spec.md), [pipeline](../inbox-pipeline/inbox-pipeline.spec.md), [queue](../inbox-queue/inbox-queue.spec.md), [opencode](../inbox-opencode/inbox-opencode.spec.md), [chat](../inbox-chat/inbox-chat.spec.md), [API](../inbox-api/inbox-api.spec.md), [dashboard](../inbox-dashboard/inbox-dashboard.spec.md), and [mocks](../inbox-mocks/inbox-mocks.spec.md).
- **Provides to:** task acceptance and SDD audit.
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to task-scaffolding

- Evolve existing harness and reports; preserve reflection lessons.
- Add precondition probes and profile isolation before real effects scenarios.
- Stack: TypeScript; node:test and Playwright. Module Rules Additions: existing visual-proof rules.
<!--/SECTION:HANDOFF-->
