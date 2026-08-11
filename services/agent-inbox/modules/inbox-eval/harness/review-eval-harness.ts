// @file: ReviewEvalHarness — compose eval profiles, probe preconditions, execute scenarios, persist reports.
// @consumers: cli/cmd/inbox-eval, acceptance test orchestration
// @tasks: TSK-183

import { logger } from '#logger';
import type { RunModeDeps } from '../../../serve/run-mode.ts';
import type {
  ReviewEvalProfile,
  ReviewEvalScenario,
  ReviewEvalRun,
  ReviewScenarioResult,
  ReviewScenarioExecutionContext,
} from '../scenarios/review-eval-scenario.ts';
import {
  composeReviewEvalReport,
  persistReviewEvalReport,
  reopenReviewEvalReport,
  type ReviewEvalReport,
} from '../reports/review-eval-report.ts';
import {
  buildProbeForProfile,
  type ProbeOptions,
  type ProbeResult,
} from '../probes/review-precondition-probe.ts';
import {
  RealReadonlyProfile,
  type RealReadonlyProfileOptions,
} from '../profiles/real-readonly.profile.ts';
import {
  RealEffectsProfile,
  type RealEffectsProfileOptions,
} from '../profiles/real-effects.profile.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import { RoleEngine } from '../../inbox-roles/role-engine.ts';
import { StateStore } from '../../inbox-core/state-store.ts';

/** @purpose Caller-supplied options for constructing a `ReviewEvalHarness`. */
export type ReviewEvalHarnessOptions = {
  /** @purpose Eval profile — determines adapter wiring, dryRun policy and effect allowlist */
  profile: ReviewEvalProfile;
  /**
   * @purpose Explicit MR pool for this eval run.
   * @invariant Never implicitly broadened; discovery may suggest candidates but cannot silently add them.
   */
  mrs: readonly string[];
  /**
   * @purpose MR allowlist for real-effects profile — required when profile is real-effects.
   * @invariant Absent outside real-effects profile; never broadened after construction.
   */
  effectAllowlist?: readonly string[];
  /** @purpose Human-readable allowlist identity label for the profile marker */
  effectAllowlistIdentity?: string;
  /** @purpose Unique run identifier; must satisfy single-segment safe pattern */
  runId: string;
  /** @purpose Override for the gennady state directory */
  stateDir?: string;
  /** @purpose Override for the run state root (where reports are written) */
  runRoot?: string;
  /** @purpose Clock override for deterministic timestamp injection | @returns Current timestamp as an ISO string */
  now?: () => string;
  /**
   * @purpose Direct `RunModeDeps` override for tests — skips all profile-based wiring.
   * @invariant When present, `profile`, `effectAllowlist` and `stateDir` are ignored for dep composition.
   */
  runModeDeps?: RunModeDeps;
};

/**
 * @purpose Orchestrate precondition probing, scenario execution and report persistence for one eval run.
 * @invariant Report is immutable once `run()` returns — harness cannot be reused across runs.
 * @invariant All-skipped outcome aggregation produces INCONCLUSIVE, never PASS.
 * @invariant Saved-run reopen is a static operation — it does not resume or extend the original run.
 */
export class ReviewEvalHarness {
  /** @purpose Harness configuration bound at construction time */
  protected readonly _options: ReviewEvalHarnessOptions;
  /** @purpose Timestamp function — injected override or `Date.prototype.toISOString` */
  protected readonly _now: () => string;

  /**
   * @purpose Bind options and clock for later composition and execution.
   * @param options Harness construction parameters.
   */
  constructor(options: ReviewEvalHarnessOptions) {
    this._options = options;
    this._now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * @purpose Probe the MR pool for each scenario's preconditions using the bound profile.
   * @param scenarios Candidate scenarios to probe.
   * @throws {Error} When profile adapter composition fails.
   * @returns Probe result with per-scenario status and runnable scenario selector.
   * @sideEffect Network (real profiles): read-only VCS calls per MR.
   */
  async probe(scenarios: ReviewEvalScenario[]): Promise<ProbeResult> {
    logger.debug('[ReviewEvalHarness#probe] [idle → probing]', {
      profile: this._options.profile,
      mrCount: this._options.mrs.length,
    });

    const probeOptions: ProbeOptions = {
      profile: this._options.profile,
      mrs: this._options.mrs,
    };

    if (this._options.profile === 'mock' || this._options.runModeDeps) {
      const mockVcs = new VcsInboxMock();
      const probe = buildProbeForProfile(this._options.profile, mockVcs);
      return probe.probe(probeOptions, scenarios);
    }

    // #region START_BUILD_LIVE_PROBE — invariant: only real-readonly and real-effects reach here
    let vcs;
    if (this._options.profile === 'real-readonly') {
      const profile = new RealReadonlyProfile({
        stateDir: this._options.stateDir,
        mrs: this._options.mrs,
      } satisfies RealReadonlyProfileOptions);
      const deps = await profile.composeDeps();
      vcs = deps.vcs;
    } else {
      // real-effects
      if (!this._options.effectAllowlist?.length || !this._options.effectAllowlistIdentity) {
        throw new Error(
          '[ReviewEvalHarness#probe] real-effects profile requires effectAllowlist and effectAllowlistIdentity'
        );
      }
      const profile = new RealEffectsProfile({
        effectAllowlist: this._options.effectAllowlist,
        effectAllowlistIdentity: this._options.effectAllowlistIdentity,
        stateDir: this._options.stateDir,
        mrs: this._options.mrs,
      } satisfies RealEffectsProfileOptions);
      const deps = await profile.composeDeps();
      vcs = deps.vcs;
    }

    const probe = buildProbeForProfile(this._options.profile, vcs);
    return probe.probe(probeOptions, scenarios);
    // #endregion END_BUILD_LIVE_PROBE
  }

  /**
   * @purpose Execute selected scenarios, persist the closed report and return it.
   * @invariant Report verdict derives from all results — all-skipped yields INCONCLUSIVE, never PASS.
   * @invariant Returned report is immutable; callers cannot extend or modify it.
   * @param scenarios Runnable scenarios selected by `probe().pickRunnableScenarios()`.
   * @throws {Error} When adapter composition fails or no scenarios are provided.
   * @returns Persisted closed eval report.
   * @sideEffect Network (real profiles): drives the role graph or calls VCS. Filesystem: persists report.
   */
  async run(scenarios: ReviewEvalScenario[]): Promise<ReviewEvalReport> {
    const startedAt = this._now();
    logger.info('[ReviewEvalHarness#run] [idle → running]', {
      runId: this._options.runId,
      profile: this._options.profile,
      scenarioCount: scenarios.length,
    });

    const ctx = await this._buildExecutionContext();
    const results: ReviewScenarioResult[] = [];

    // #region START_EXECUTE_SCENARIOS — invariant: scenarios are independent; a single exception
    // becomes FAIL evidence rather than aborting the whole run
    for (const scenario of scenarios) {
      try {
        const result = await scenario.execute(ctx);
        results.push(result);
        logger.info(
          `[ReviewEvalHarness#run] [running → scenario_done] ${scenario.id}: ${result.outcome}`
        );
      } catch (cause) {
        const error = new Error(
          `[ReviewEvalHarness#run] Scenario ${scenario.id} threw unexpectedly`,
          { cause }
        );
        logger.error('[ReviewEvalHarness#run] [running → scenario_error]', {
          scenarioId: scenario.id,
          error,
        });
        results.push({
          scenarioId: scenario.id,
          outcome: 'FAIL',
          preconditions: [],
          evidence: [
            {
              address: `scenario:${scenario.id}:exception`,
              summary: (cause as Error)?.message ?? String(cause),
            },
          ],
        });
      }
    }
    // #endregion END_EXECUTE_SCENARIOS

    const finishedAt = this._now();

    const run: ReviewEvalRun = {
      runId: this._options.runId,
      profile: this._options.profile,
      mrs: this._options.mrs,
      results,
      startedAt,
      finishedAt,
    };

    const report = composeReviewEvalReport(run);

    const runRoot = this._options.runRoot ?? this._deriveDefaultRunRoot();

    // #region START_PERSIST_REPORT — best-effort: persist failure must not mask the computed report
    try {
      persistReviewEvalReport(report, runRoot);
    } catch (cause) {
      const error = new Error(
        '[ReviewEvalHarness#run] Report persist failed — report is still returned',
        {
          cause,
        }
      );
      logger.error('[ReviewEvalHarness#run] [running → persist_degraded]', { error });
    }
    // #endregion END_PERSIST_REPORT

    logger.info('[ReviewEvalHarness#run] [running → done]', {
      verdict: report.verdict,
      runId: report.runId,
    });

    return report;
  }

  /**
   * @purpose Reopen a previously persisted eval report read-only from the run root.
   * @invariant Read-only: this method never modifies the persisted report or resumes execution.
   * @invariant Effects profile reports can be reopened only under real-readonly policy.
   * @param runRoot Absolute filesystem path of the saved run's state root.
   * @throws {Error} When the run root does not contain a valid saved report.
   * @returns The immutable persisted eval report.
   */
  static reopenSavedRun(runRoot: string): ReviewEvalReport {
    logger.info('[ReviewEvalHarness#reopenSavedRun] [idle → reading]', { runRoot });
    return reopenReviewEvalReport(runRoot);
  }

  /**
   * @purpose Build the scenario execution context from the bound profile.
   * @returns Scenario execution context ready for passing to `scenario.execute()`.
   * @sideEffect May compose real adapters (network, filesystem) for non-mock profiles.
   */
  protected async _buildExecutionContext(): Promise<ReviewScenarioExecutionContext> {
    if (this._options.runModeDeps) {
      return { mrs: this._options.mrs, dryRun: true, effectAllowlist: undefined };
    }

    if (this._options.profile === 'mock') {
      return { mrs: this._options.mrs, dryRun: true, effectAllowlist: undefined };
    }

    if (this._options.profile === 'real-readonly') {
      return { mrs: this._options.mrs, dryRun: true, effectAllowlist: undefined };
    }

    // real-effects
    if (!this._options.effectAllowlist?.length || !this._options.effectAllowlistIdentity) {
      throw new Error(
        '[ReviewEvalHarness#_buildExecutionContext] real-effects profile requires effectAllowlist and effectAllowlistIdentity'
      );
    }
    return {
      mrs: this._options.mrs,
      dryRun: false,
      effectAllowlist: new Set(this._options.effectAllowlist),
    };
  }

  /**
   * @purpose Derive the default run root path from the state store when not explicitly overridden.
   * @returns Absolute path for the run's state root under the gennady state directory.
   */
  protected _deriveDefaultRunRoot(): string {
    const store = new StateStore(this._options.stateDir);
    return `${store.getStateDir()}/agent-inbox/eval-runs/${this._options.runId}`;
  }
}

/**
 * @purpose Compose a mock-profile harness backed by deterministic adapters — for contract and unit tests.
 * @param options Harness options (must not include real credentials or effect allowlists).
 * @param [mockRunModeDeps] Override RunModeDeps for fully deterministic execution.
 * @returns Harness instance in mock profile.
 */
export async function composeMockHarness(
  options: Omit<ReviewEvalHarnessOptions, 'profile'>,
  mockRunModeDeps?: RunModeDeps
): Promise<ReviewEvalHarness> {
  if (mockRunModeDeps) {
    return new ReviewEvalHarness({ ...options, profile: 'mock', runModeDeps: mockRunModeDeps });
  }

  const engine = new RoleEngine();
  await engine.loadAll();
  const store = new StateStore(options.stateDir);
  const vcs = new VcsInboxMock();
  const opencode = new OpenCodeMock();
  const runModeDeps: RunModeDeps = { engine, store, vcs, opencode };

  return new ReviewEvalHarness({ ...options, profile: 'mock', runModeDeps });
}
