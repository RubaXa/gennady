// @file: ReviewPreconditionProbe — observe whether a real MR pool can exercise each scenario branch.
// @consumers: ReviewEvalHarness
// @tasks: TSK-183

import { logger } from '#logger';
import type { VcsInboxPort } from '../../inbox-core/vcs-inbox.port.ts';
import type {
  ReviewEvalProfile,
  ReviewEvalScenario,
  ReviewObservablePrecondition,
} from '../scenarios/review-eval-scenario.ts';

/** @purpose Outcome of probing one MR for a named precondition. */
export type MrPreconditionObservation = {
  /** @purpose MR web URL that was probed */
  mr: string;
  /** @purpose Name of the precondition that was checked */
  preconditionName: string;
  /** @purpose Whether the precondition was satisfied by this MR */
  satisfied: boolean;
  /** @purpose Detail when not satisfied — reason for SKIP or INCONCLUSIVE */
  detail?: string;
};

/** @purpose Aggregate probe result for one scenario over the full MR pool. */
export type ScenarioPreconditionStatus = {
  /** @purpose Scenario identity */
  scenarioId: string;
  /** @purpose Whether all preconditions for this scenario were satisfied by at least one MR */
  runnable: boolean;
  /** @purpose Individual precondition observations across the pool */
  observations: MrPreconditionObservation[];
  /** @purpose Why the scenario cannot run (first unmet precondition detail) */
  skipReason?: string;
  /** @purpose Why the scenario outcome would be inconclusive (unobservable precondition) */
  inconclusiveReason?: string;
};

/** @purpose Options for a precondition probe pass. */
export type ProbeOptions = {
  /** @purpose Runtime profile for this probe — constrains which operations are permitted */
  profile: ReviewEvalProfile;
  /** @purpose Explicit MR pool to probe */
  mrs: readonly string[];
};

/** @purpose Result of a probe pass — includes per-scenario status and runnable scenario selection. */
export type ProbeResult = {
  /** @purpose Per-scenario precondition status across the MR pool */
  statuses: ScenarioPreconditionStatus[];
  /**
   * @purpose Select runnable scenarios from a candidate list given the observed preconditions.
   * @param candidates Full scenario list to filter.
   * @returns Only those scenarios whose preconditions were satisfied in this pool.
   */
  pickRunnableScenarios: (candidates: ReviewEvalScenario[]) => ReviewEvalScenario[];
};

/**
 * @purpose Port for observing whether real MR prerequisites are present before scheduling scenarios.
 * @invariant Probe never mutates MR state; always read-only.
 * @invariant Inability to observe a precondition yields INCONCLUSIVE evidence — not a skip.
 */
export interface ReviewPreconditionProbe {
  /**
   * @purpose Probe the MR pool for each scenario's preconditions and return runnability status.
   * @param options Profile and explicit MR pool.
   * @param scenarios Candidates whose preconditions to check.
   * @returns Aggregate probe result with runnable scenario selector.
   * @sideEffect Network: read-only VCS API calls (getMrContext, getDiscussions) for each MR.
   */
  probe(options: ProbeOptions, scenarios: ReviewEvalScenario[]): Promise<ProbeResult>;
}

/**
 * @purpose Live VCS-backed precondition probe for real-readonly and real-effects profiles.
 * @implements {ReviewPreconditionProbe} in ./review-precondition-probe.ts
 * @invariant Uses VCS read operations only; never calls effect or mutation paths.
 */
export class LivePreconditionProbe implements ReviewPreconditionProbe {
  /** @purpose VCS adapter for read-only MR context lookups */
  protected readonly _vcs: VcsInboxPort;

  /**
   * @purpose Bind the VCS adapter for read-only MR inspection.
   * @param vcs VCS adapter — read operations only.
   */
  constructor(vcs: VcsInboxPort) {
    this._vcs = vcs;
  }

  /** @see {ReviewPreconditionProbe#probe} in ./review-precondition-probe.ts */
  async probe(options: ProbeOptions, scenarios: ReviewEvalScenario[]): Promise<ProbeResult> {
    logger.debug('[LivePreconditionProbe#probe] [idle → probing]', {
      mrCount: options.mrs.length,
      scenarioCount: scenarios.length,
    });

    // #region START_PROBE_MR_CONTEXTS — invariant: getMrContext failures are INCONCLUSIVE, not product FAIL
    const mrContexts: Map<string, { reachable: boolean; role: string | null; detail?: string }> =
      new Map();

    for (const mr of options.mrs) {
      try {
        const ctx = await this._vcs.getMrContext(mr);
        mrContexts.set(mr, { reachable: true, role: ctx.myRole });
      } catch (cause) {
        const error = new Error(`[LivePreconditionProbe#probe] getMrContext failed for ${mr}`, {
          cause,
        });
        logger.warn('[LivePreconditionProbe#probe] [probing → inconclusive]', { mr, error });
        mrContexts.set(mr, {
          reachable: false,
          role: null,
          detail: `getMrContext failed: ${(cause as Error).message}`,
        });
      }
    }
    // #endregion END_PROBE_MR_CONTEXTS

    const statuses = scenarios.map((scenario) =>
      this._deriveScenarioPreconditionStatus(scenario, options.mrs, mrContexts)
    );

    const runnableIds = new Set(statuses.filter((s) => s.runnable).map((s) => s.scenarioId));

    logger.debug('[LivePreconditionProbe#probe] [probing → done]', {
      total: scenarios.length,
      runnable: runnableIds.size,
    });

    return {
      statuses,
      pickRunnableScenarios: (candidates) => candidates.filter((s) => runnableIds.has(s.id)),
    };
  }

  /**
   * @purpose Derive precondition status for one scenario against the probed MR pool.
   * @param scenario Scenario whose preconditions to evaluate.
   * @param mrs Explicit MR pool.
   * @param mrContexts Probed MR context map.
   * @returns Precondition status with runnability and per-observation detail.
   */
  protected _deriveScenarioPreconditionStatus(
    scenario: ReviewEvalScenario,
    mrs: readonly string[],
    mrContexts: Map<string, { reachable: boolean; role: string | null; detail?: string }>
  ): ScenarioPreconditionStatus {
    // A scenario with no declared preconditions is always runnable.
    if (scenario.preconditions.length === 0) {
      return { scenarioId: scenario.id, runnable: true, observations: [] };
    }

    const observations: MrPreconditionObservation[] = [];
    let anyMrSatisfiesAll = false;
    let firstUnobservable: string | undefined;
    let firstUnsatisfied: string | undefined;

    // #region START_CHECK_PRECONDITIONS_PER_MR — invariant: at least one MR must satisfy all named
    // preconditions for the scenario to be runnable; unobservable VCS means INCONCLUSIVE not SKIP
    for (const mr of mrs) {
      const ctx = mrContexts.get(mr);
      if (!ctx?.reachable) {
        observations.push({
          mr,
          preconditionName: scenario.preconditions[0] ?? 'reachable',
          satisfied: false,
          detail: ctx?.detail ?? 'MR not reachable',
        });
        firstUnobservable ??= ctx?.detail ?? 'MR context unobservable';
        continue;
      }

      const mrSatisfiesAll = this._mrSatisfiesAllPreconditions(
        mr,
        scenario.preconditions,
        ctx,
        observations
      );

      if (mrSatisfiesAll) anyMrSatisfiesAll = true;
      else firstUnsatisfied ??= `No MR in the pool satisfies all preconditions for ${scenario.id}`;
    }
    // #endregion END_CHECK_PRECONDITIONS_PER_MR

    if (anyMrSatisfiesAll) {
      return { scenarioId: scenario.id, runnable: true, observations };
    }
    if (firstUnobservable) {
      return {
        scenarioId: scenario.id,
        runnable: false,
        observations,
        inconclusiveReason: firstUnobservable,
      };
    }
    return {
      scenarioId: scenario.id,
      runnable: false,
      observations,
      skipReason: firstUnsatisfied ?? `Preconditions not met for ${scenario.id}`,
    };
  }

  /**
   * @purpose Check whether one MR satisfies all declared preconditions for a scenario.
   * @param mr MR web URL.
   * @param preconditions Precondition names declared by the scenario.
   * @param ctx Probed MR context entry.
   * @param observations Mutable list to append per-precondition observations to.
   * @returns Whether this MR satisfies every precondition.
   */
  protected _mrSatisfiesAllPreconditions(
    mr: string,
    preconditions: readonly string[],
    ctx: { reachable: boolean; role: string | null; detail?: string },
    observations: MrPreconditionObservation[]
  ): boolean {
    let allSatisfied = true;

    for (const name of preconditions) {
      const satisfied = this._checkPrecondition(name, ctx);
      observations.push({ mr, preconditionName: name, satisfied });
      if (!satisfied) allSatisfied = false;
    }

    return allSatisfied;
  }

  /**
   * @purpose Evaluate a named precondition against observed MR context.
   * @param name Precondition name from `ReviewEvalScenario.preconditions`.
   * @param ctx Probed MR context for this MR.
   * @returns Whether the precondition is satisfied.
   */
  protected _checkPrecondition(
    name: string,
    ctx: { reachable: boolean; role: string | null }
  ): boolean {
    // purpose: map well-known precondition names to context predicates;
    // unknown names default to false (fail-closed) so new scenarios declare their needs explicitly
    switch (name) {
      case 'has-role-reviewer':
        return ctx.role === 'reviewer';
      case 'has-role-author':
        return ctx.role === 'author';
      case 'has-any-role':
        return ctx.role !== null;
      case 'reachable':
        return ctx.reachable;
      default:
        return false;
    }
  }
}

/**
 * @purpose No-op precondition probe for deterministic mock profile runs — all scenarios are runnable.
 * @implements {ReviewPreconditionProbe} in ./review-precondition-probe.ts
 * @invariant Never calls VCS; safe for mock/offline environments.
 */
export class DeterministicPreconditionProbe implements ReviewPreconditionProbe {
  /** @see {ReviewPreconditionProbe#probe} in ./review-precondition-probe.ts */
  async probe(_options: ProbeOptions, scenarios: ReviewEvalScenario[]): Promise<ProbeResult> {
    const statuses: ScenarioPreconditionStatus[] = scenarios.map((s) => ({
      scenarioId: s.id,
      runnable: true,
      observations: s.preconditions.map(
        (name): MrPreconditionObservation => ({
          mr: 'mock',
          preconditionName: name,
          satisfied: true,
        })
      ),
    }));
    return {
      statuses,
      pickRunnableScenarios: (candidates) => candidates,
    };
  }
}

/**
 * @purpose Build the correct probe implementation for the given eval profile.
 * @param profile Eval profile determining which probe to use.
 * @param vcs VCS adapter used only for real profiles; mock profile ignores it.
 * @returns Correct probe for the profile.
 */
export function buildProbeForProfile(
  profile: ReviewEvalProfile,
  vcs: VcsInboxPort
): ReviewPreconditionProbe {
  if (profile === 'mock') return new DeterministicPreconditionProbe();
  return new LivePreconditionProbe(vcs);
}

/**
 * @purpose Build precondition observations from a `ScenarioPreconditionStatus` for inclusion in scenario results.
 * @param status Probed status for one scenario.
 * @returns Observable precondition array suitable for `ReviewScenarioResult.preconditions`.
 */
export function buildPreconditionObservations(
  status: ScenarioPreconditionStatus
): ReviewObservablePrecondition[] {
  const seen = new Map<string, boolean>();
  const result: ReviewObservablePrecondition[] = [];

  for (const obs of status.observations) {
    if (seen.has(obs.preconditionName)) continue;
    seen.set(obs.preconditionName, obs.satisfied);
    result.push({
      name: obs.preconditionName,
      observed: obs.satisfied,
      detail: obs.detail,
    });
  }

  return result;
}
