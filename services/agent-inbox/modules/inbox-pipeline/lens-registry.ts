// @file: LensRegistry — LensSpec with inputs-waves, DAG ordering (B dependsOn A if B.inputs includes A id), within-wave parallelism, 7 starter lenses
// @consumers: PlanTemplate, inbox-pipeline
// @tasks: TSK-161

import { logger } from '#logger';

/** @purpose Specification for a review lens — a measurement dimension with optional input dependencies */
export type LensSpec = {
  /** @purpose Unique lens identifier */
  id: string;
  /** @purpose Human-readable lens name */
  name: string;
  /** @purpose Review track this lens belongs to */
  track: string;
  /** @purpose Lens ids that must complete before this lens starts (forms DAG edges) */
  inputs: string[];
  /** @purpose Whether this lens is mandatory (blocking for gate) */
  mandatory: boolean;
  /** @purpose Whether this lens is advisory (proposed by enrich) */
  proposed: boolean;
};

/** @purpose A wave in the lens DAG — lenses that can execute in parallel */
export type DAGWave = {
  /** @purpose Zero-based wave index */
  wave: number;
  /** @purpose Lenses in this wave (parallel execution) */
  lenses: LensSpec[];
};

// #region START_STARTER_LENSES — 7 built-in review dimensions per D-326
// purpose: declarative definition — adding a lens = adding a record here.
// architecture depends on tests (inputs: [tests]), rest have no inputs.

const STARTER_LENSES: LensSpec[] = [
  {
    id: 'lens-tests',
    name: '🧪 тесты',
    track: 'logic',
    inputs: [],
    mandatory: true,
    proposed: false,
  },
  {
    id: 'lens-architecture',
    name: '🏛 архитектура',
    track: 'logic',
    inputs: ['lens-tests'],
    mandatory: true,
    proposed: false,
  },
  {
    id: 'lens-business',
    name: '🎯 бизнес-цели',
    track: 'logic',
    inputs: [],
    mandatory: true,
    proposed: false,
  },
  {
    id: 'lens-specs',
    name: '📜 спецификации',
    track: 'docs',
    inputs: [],
    mandatory: true,
    proposed: false,
  },
  {
    id: 'lens-security',
    name: '🔐 security',
    track: 'logic',
    inputs: [],
    mandatory: true,
    proposed: false,
  },
  {
    id: 'lens-optimization',
    name: '⚡ оптимизация',
    track: 'logic',
    inputs: [],
    mandatory: true,
    proposed: false,
  },
  {
    id: 'lens-codelines',
    name: '🧾 код-строки',
    track: 'logic',
    inputs: [],
    mandatory: true,
    proposed: false,
  },
];

// #endregion END_STARTER_LENSES

/**
 * @purpose Compute DAG waves for lenses: topological sort by input dependencies, within wave = parallel.
 * @param lenses Array of LensSpec to order.
 * @returns Ordered waves — lenses without dependencies in wave 0, dependent lenses in later waves.
 */
function computeWaves(lenses: LensSpec[]): DAGWave[] {
  const lensMap = new Map(lenses.map((l) => [l.id, l]));
  const remaining = new Set(lenses.map((l) => l.id));
  const resolved = new Set<string>();
  const waves: DAGWave[] = [];

  while (remaining.size > 0) {
    const waveLenses: LensSpec[] = [];
    for (const id of remaining) {
      const lens = lensMap.get(id);
      if (!lens) continue;
      const allInputsResolved = lens.inputs.every((inputId) => resolved.has(inputId));
      if (allInputsResolved) {
        waveLenses.push(lens);
      }
    }

    // #region START_CYCLE_DETECTION — no progress in wave resolution means a cycle or missing input
    if (waveLenses.length === 0) {
      const unresolvedIds = [...remaining].join(', ');
      logger.error('[LensRegistry#computeWaves] [resolving → cycle_or_missing]', {
        unresolved: unresolvedIds,
      });
      break;
    }
    // #endregion END_CYCLE_DETECTION

    for (const lens of waveLenses) {
      remaining.delete(lens.id);
      resolved.add(lens.id);
    }
    waves.push({ wave: waves.length, lenses: waveLenses });
  }

  return waves;
}

/**
 * @purpose Registry of review lenses — resolves mandatory + proposed lenses into DAG waves.
 * @invariant Pure function over the lens set — no mutable state.
 * @invariant Wave ordering is deterministic: topological sort by inputs, same set → same waves.
 */
export class LensRegistry {
  /** @purpose Registered lenses */
  protected _lenses: LensSpec[];

  /**
   * @purpose Create a lens registry with optional custom lenses on top of starters.
   * @param [customLenses] Additional lenses beyond the 7 starters.
   */
  constructor(customLenses: LensSpec[] = []) {
    this._lenses = [...STARTER_LENSES, ...customLenses];
    logger.debug('[LensRegistry#constructor] [init → ready]', { lensCount: this._lenses.length });
  }

  /**
   * @purpose Filter lenses applicable to the given tracks.
   * @param trackIds Active track identifiers from the plan.
   * @returns Lenses whose track matches an active track or whose track is empty (universal).
   */
  resolveForTracks(trackIds: string[]): LensSpec[] {
    const trackSet = new Set(trackIds);
    return this._lenses.filter((l) => l.track === '' || trackSet.has(l.track));
  }

  /**
   * @purpose Partition lenses into mandatory and proposed sets.
   * @param lenses Lens list to partition.
   * @returns Separate mandatory and proposed lens arrays.
   */
  partition(lenses: LensSpec[]): { mandatoryLenses: LensSpec[]; proposedLenses: LensSpec[] } {
    // #region START_PARTITION — separate by mandatory flag
    const mandatoryLenses = lenses.filter((l) => l.mandatory && !l.proposed);
    const proposedLenses = lenses.filter((l) => l.proposed);
    return { mandatoryLenses, proposedLenses };
    // #endregion END_PARTITION
  }

  /**
   * @purpose Compute DAG waves for a set of lenses (topological sort by inputs).
   * @param lenses Lens list to order.
   * @returns Ordered waves — lenses within same wave execute in parallel.
   */
  computeWaves(lenses: LensSpec[]): DAGWave[] {
    return computeWaves(lenses);
  }

  /**
   * @purpose Full pipeline: resolve lenses for tracks, partition, compute mandatory waves.
   * @param trackIds Active track identifiers.
   * @returns Mandatory lenses in DAG waves plus any proposed lenses.
   */
  resolveAll(trackIds: string[]): {
    mandatoryWaves: DAGWave[];
    proposedLenses: LensSpec[];
  } {
    logger.debug('[LensRegistry#resolveAll] [idle → resolving]', { trackIds });

    const applicable = this.resolveForTracks(trackIds);
    const { mandatoryLenses, proposedLenses } = this.partition(applicable);
    const mandatoryWaves = this.computeWaves(mandatoryLenses);

    logger.info('[LensRegistry#resolveAll] [resolving → done]', {
      mandatoryWaves: mandatoryWaves.length,
      proposedCount: proposedLenses.length,
    });

    return { mandatoryWaves, proposedLenses };
  }
}
