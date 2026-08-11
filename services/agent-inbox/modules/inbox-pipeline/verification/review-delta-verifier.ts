// @file: Complete accumulated delta derivation with explicit full-review fallback.
// @consumers: ReviewOrchestrator, queue triggers, chat manual verification
// @tasks: TSK-176

import type { ReviewEvidence } from '../types/review-evidence.type.ts';
import type { ReviewIntent, ReviewManifestKey } from '../types/review-intent.type.ts';

/** @purpose Versioned accumulated event batch evaluated from one prior baseline. */
export type ReviewDeltaBatch = {
  /** @purpose Exact new observed MR revision. */
  key: ReviewManifestKey;
  /** @purpose Every accumulated event after the baseline. */
  eventIds: readonly string[];
  /** @purpose Every input affected by the accumulated event batch. */
  changedInputIds: readonly string[];
  /** @purpose Version-addressable prior manifest and evidence baseline. */
  baseline?: { manifestRef: string; evidenceRef: string };
};

/** @purpose Delta preparation result preserving fallback and revalidated evidence explicitly. */
export type ReviewDeltaResult = {
  /** @purpose Complete delta or deterministic full fallback intent. */
  intent: ReviewIntent;
  /** @purpose Every accumulated event covered by the intent. */
  coveredEventIds: readonly string[];
  /** @purpose Every changed input preserved in the intent. */
  affectedInputIds: readonly string[];
  /** @purpose Prior evidence explicitly revalidated for the exact baseline. */
  carriedEvidence: readonly ReviewEvidence[];
  /** @purpose Persistable reason for full-review fallback. */
  fallbackReason?: string;
};

/** @purpose Derive a complete delta or persisted full-review fallback without narrowing inputs. */
export class ReviewDeltaVerifier {
  /**
   * @purpose Derive a complete delta or persisted full-review fallback without narrowing inputs.
   * @param batch Complete accumulated event and input batch.
   * @param priorEvidence Candidate baseline evidence.
   * @returns Complete intent and explicitly revalidated carry-forward set.
   */
  deriveIntent(
    batch: ReviewDeltaBatch,
    priorEvidence: readonly ReviewEvidence[]
  ): ReviewDeltaResult {
    if (!batch.baseline) {
      return {
        intent: {
          kind: 'full',
          manifestKey: batch.key,
          trigger: 'delta-baseline-missing',
          requester: 'control-plane',
        },
        coveredEventIds: [...batch.eventIds],
        affectedInputIds: [...batch.changedInputIds],
        carriedEvidence: [],
        fallbackReason: 'missing or ambiguous baseline',
      };
    }
    return {
      intent: {
        kind: 'delta',
        manifestKey: batch.key,
        trigger: 'accumulated-events',
        requester: 'control-plane',
        baseline: batch.baseline,
      },
      coveredEventIds: [...batch.eventIds],
      affectedInputIds: [...batch.changedInputIds],
      carriedEvidence: priorEvidence.filter(
        (evidence) => evidence.manifestRef === batch.baseline?.manifestRef
      ),
    };
  }
}
