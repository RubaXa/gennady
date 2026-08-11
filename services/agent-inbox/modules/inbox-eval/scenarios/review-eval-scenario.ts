// @file: Core eval domain types — profile kinds, outcome statuses, scenario contract, run entity.
// @consumers: ReviewEvalHarness, ReviewEvalReport, ReviewPreconditionProbe, ReviewPortContractKit
// @tasks: TSK-183

/**
 * @purpose Eval profile identifier aligned to the closed capability matrix from ReviewRuntimeProfile.
 * @invariant 'mock' maps to deterministic-mock I/O; 'real-readonly' maps to test+real-readonly;
 *   'real-effects' maps to test+real-effects with an explicit MR allowlist.
 */
export type ReviewEvalProfile = 'mock' | 'real-readonly' | 'real-effects';

/**
 * @purpose Evidence-backed scenario result status.
 * @invariant SKIP means the tested branch was not reachable given the current MR pool.
 * @invariant INCONCLUSIVE means infrastructure or preconditions were unobservable — not a product FAIL.
 * @invariant PASS requires at least one concrete evidence address; evidence-less PASS is invalid.
 */
export type ReviewEvalOutcome = 'PASS' | 'FAIL' | 'SKIP' | 'INCONCLUSIVE';

/** @purpose Concrete address-and-summary evidence pair attached to a scenario result. */
export type ReviewScenarioEvidence = {
  /** @purpose Filesystem path, URL, screenshot path or assertion label identifying the artifact */
  address: string;
  /** @purpose One-line summary of what this evidence proves | @invariant Must not be a generic placeholder */
  summary: string;
};

/** @purpose Observable precondition declared by a scenario and checked by the probe before execution. */
export type ReviewObservablePrecondition = {
  /** @purpose Unique precondition name within the scenario */
  name: string;
  /** @purpose Whether the precondition was satisfied in the current MR pool and profile */
  observed: boolean;
  /** @purpose Human-readable detail when not observed — skip reason or inconclusive cause */
  detail?: string;
};

/**
 * @purpose Abstract execution surface the harness provides to each scenario at run time.
 * @invariant `effectAllowlist` is absent outside real-effects runs; scenarios must not widen it.
 */
export type ReviewScenarioExecutionContext = {
  /** @purpose Explicit MR pool bound for this eval run */
  mrs: readonly string[];
  /** @purpose Whether graph effects are globally suppressed for this pass */
  dryRun: boolean;
  /** @purpose MR URLs permitted to receive real effects; absent unless profile is real-effects */
  effectAllowlist?: ReadonlySet<string>;
};

/**
 * @purpose Self-describing eval scenario with observable preconditions and its executable entry point.
 * @invariant `preconditions` names must align with `ReviewObservablePrecondition.name` values returned
 *   by the probe — the harness matches them by name to decide runnability.
 * @invariant `execute` MUST return SKIP when all preconditions are absent; INCONCLUSIVE when
 *   preconditions were observable but could not be confirmed; FAIL only for product defects.
 */
export type ReviewEvalScenario = {
  /** @purpose Unique scenario identifier matching the Test Scenario Coverage table */
  id: string;
  /** @purpose Human-readable description aligned to the BDD scenario text */
  description: string;
  /**
   * @purpose Minimum profile required to run this scenario.
   * @invariant Harness skips the scenario rather than promoting it to a stronger profile.
   */
  requiredProfile: ReviewEvalProfile;
  /**
   * @purpose Names of observable preconditions the probe must satisfy before this scenario can run.
   * @invariant An empty array means the scenario has no external prereqs and runs in any matching profile.
   */
  preconditions: readonly string[];
  /**
   * @purpose Execute the scenario given the harness-provided context and return its result.
   * @param ctx Bound execution context supplied by the harness.
   * @returns Scenario result with outcome and concrete evidence.
   * @sideEffect May drive the real role graph or read GitLab state depending on profile.
   */
  execute: (ctx: ReviewScenarioExecutionContext) => Promise<ReviewScenarioResult>;
};

/** @purpose Per-scenario result with precondition observations, outcome and concrete evidence. */
export type ReviewScenarioResult = {
  /** @purpose Identity of the scenario that produced this result */
  scenarioId: string;
  /** @purpose Evidence-backed outcome — SKIP/INCONCLUSIVE must carry a reason; PASS must carry evidence */
  outcome: ReviewEvalOutcome;
  /** @purpose Precondition observations at the time of execution */
  preconditions: ReviewObservablePrecondition[];
  /**
   * @purpose Concrete evidence collected during execution.
   * @invariant Must be non-empty when outcome is PASS; empty only for SKIP.
   */
  evidence: ReviewScenarioEvidence[];
  /** @purpose Why execution was skipped | @invariant Required when outcome is SKIP */
  skipReason?: string;
  /** @purpose Infrastructure or precondition ambiguity cause | @invariant Required when outcome is INCONCLUSIVE */
  inconclusiveReason?: string;
};

/** @purpose Isolated execution of selected scenarios over an explicit MR pool within one profile. */
export type ReviewEvalRun = {
  /**
   * @purpose Globally unique run identity.
   * @invariant Non-production, single-segment identifier safe for filesystem path use.
   */
  runId: string;
  /** @purpose Profile this run executed under */
  profile: ReviewEvalProfile;
  /** @purpose Explicit MR pool bound at harness construction time */
  mrs: readonly string[];
  /** @purpose Results per executed or skipped scenario, in execution order */
  results: ReviewScenarioResult[];
  /** @purpose ISO timestamp when the run started */
  startedAt: string;
  /** @purpose ISO timestamp when the run finished */
  finishedAt: string;
};
