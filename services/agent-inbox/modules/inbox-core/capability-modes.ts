// @file: CapabilityModes — graduation logic: determine proposal|auto mode per capability from accept-rate metrics
// @consumers: inbox-queue, inbox-api
// @tasks: TSK-157

import { type AcceptRate, type Capability } from './decision-journal.ts';

/** @purpose Granularity mode — proposal (operator decides) or auto (machine acts) (D-302). */
export type CapabilityMode = 'proposal' | 'auto';

/** @purpose Per-capability mode registry — keyed by capability name. */
export type CapabilityRegistry = Record<Capability, CapabilityMode>;

/** @purpose Configuration for the capability graduation threshold (D-302 / §2.1). */
export type GraduationConfig = {
  /** @purpose Minimum accept rate to flip to auto | @invariant 0..1 */
  threshold: number;
  /** @purpose Minimum sample size before graduation is permitted */
  minSampleSize: number;
};

/** @purpose Default graduation config — 90% accept rate over at least 20 decisions. */
const DEFAULT_GRADUATION: GraduationConfig = {
  threshold: 0.9,
  minSampleSize: 20,
};

/**
 * @purpose Stateless graduation engine: evaluates accept-rate metrics and produces a CapabilityRegistry.
 * @invariant Graduation is table-driven — thresholds in GraduationConfig, not hardcoded.
 * @invariant n < minSampleSize → always 'proposal' regardless of rate.
 */
export class CapabilityModes {
  /**
   * @purpose Determine the mode for a single capability given its accept-rate metrics.
   * @param acceptRate Computed accept-rate for the capability.
   * @param [config] Graduation configuration (defaults to 90%/20).
   * @returns 'auto' when the capability meets the graduation threshold; 'proposal' otherwise.
   */
  static evaluateGraduation(acceptRate: AcceptRate, config?: GraduationConfig): CapabilityMode {
    const cfg = config ?? DEFAULT_GRADUATION;

    // #region START_EVALUATE_GRADUATION
    // invariant: n >= minSampleSize AND rate >= threshold → auto; otherwise proposal
    // invariant: NaN rate (zero decisions) → proposal
    if (acceptRate.totalDecisions < cfg.minSampleSize) return 'proposal';
    if (Number.isNaN(acceptRate.rate)) return 'proposal';
    return acceptRate.rate >= cfg.threshold ? 'auto' : 'proposal';
    // #endregion END_EVALUATE_GRADUATION
  }

  /**
   * @purpose Build a full capability registry from a set of accept-rate metrics.
   * @param rates Accept-rate entries (one per capability).
   * @param [config] Graduation configuration.
   * @returns Registry mapping each capability to its computed mode.
   */
  static computeRegistry(rates: AcceptRate[], config?: GraduationConfig): CapabilityRegistry {
    const registry = {} as Record<string, CapabilityMode>;

    // #region START_COMPUTE_REGISTRY
    for (const rate of rates) {
      registry[rate.capability] = CapabilityModes.evaluateGraduation(rate, config);
    }
    // #endregion END_COMPUTE_REGISTRY

    return registry as CapabilityRegistry;
  }
}
