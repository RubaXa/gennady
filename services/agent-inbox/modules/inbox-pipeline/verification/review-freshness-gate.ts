// @file: Per-MR serialized local freshness guard for verdict, synthesis and queue handoff.
// @consumers: ReviewStructuralValidator, ReviewSynthesis, ReviewPublicationHandoff
// @tasks: TSK-176, TSK-184, TSK-190

import type {
  ReviewCapabilitySnapshot,
  ReviewDispatchPolicy,
} from '../types/review-publication-handoff.type.ts';
import type { ReviewManifestKey } from '../types/review-intent.type.ts';

/** @purpose Closed local transition purposes protected by exact observed revision. */
export type ReviewFreshnessPurpose = 'VERDICT' | 'SYNTHESIS_PUBLICATION' | 'QUEUE_HANDOFF';

/** @purpose Context supplied only by a successful exact-match local guard. */
export type ReviewGuardedTransition = {
  /** @purpose Stable protected local transition identity. */
  id: string;
  /** @purpose Exact locally accepted head and event revision. */
  observedRevision: string;
  /** @purpose Action-specific capabilities captured inside the guard. */
  actionCapabilities: ReviewCapabilitySnapshot;
  /** @purpose Exact capability contract version. */
  capabilityVersion: string;
  /** @purpose External effect freshness and reconciliation policy. */
  dispatchPolicy: ReviewDispatchPolicy;
};

/** @purpose Journal seam that owns observed state and protected local transitions. */
export type ReviewFreshnessJournal = {
  /**
   * @purpose Atomically persist the observed revision, comparison result and optional protected transition.
   * @invariant One append is the complete durable state change for this guard attempt.
   * @param purpose Closed protected transition purpose.
   * @param key Exact expected manifest key.
   * @param observedRevision Latest revision observed inside the per-MR transaction.
   * @param [transition] Protected transition only when the observation matches the manifest.
   * @returns Promise resolved after the complete guard transaction is durably recorded.
   */
  recordGuardTransaction(
    purpose: ReviewFreshnessPurpose,
    key: ReviewManifestKey,
    observedRevision: string,
    transition?: ReviewGuardedTransition
  ): Promise<void>;
};

/** @purpose Fresh callback result, persisted stale result or fail-closed local ambiguity. */
export type ReviewFreshnessResult<T> =
  | { status: 'FRESH'; value: T; transition: ReviewGuardedTransition }
  | { status: 'STALE'; expectedRevision: string; observedRevision: string; deltaRequested: true }
  | { status: 'BLOCKED'; reason: string };

/** @purpose Serialize exact local revision checks independently per MR. */
export class ReviewFreshnessGate {
  /** @purpose Core-owned observed-state and transition journal. */
  protected readonly _journal: ReviewFreshnessJournal;
  /** @purpose Action-specific capability and dispatch policy provider. */
  protected readonly _capabilities: (
    purpose: ReviewFreshnessPurpose,
    key: ReviewManifestKey
  ) => Omit<ReviewGuardedTransition, 'id' | 'observedRevision'>;
  /** @purpose Per-MR local transaction serialization chains. */
  protected readonly _locks = new Map<string, Promise<unknown>>();

  /**
   * @purpose Configure local freshness state and action capability capture.
   * @param journal Core-owned observed-state and transition journal.
   * @param capabilities Action-specific capability provider.
   */
  constructor(
    journal: ReviewFreshnessJournal,
    capabilities: (
      purpose: ReviewFreshnessPurpose,
      key: ReviewManifestKey
    ) => Omit<ReviewGuardedTransition, 'id' | 'observedRevision'>
  ) {
    this._journal = journal;
    this._capabilities = capabilities;
  }

  /**
   * @purpose Guard one protected local transition without spanning an external GitLab effect.
   * @param purpose Closed protected transition purpose.
   * @param key Exact expected manifest key.
   * @param observeRevision Control-plane observation performed inside the per-MR transaction.
   * @param callback Idempotent local transition callback.
   * @returns Fresh callback value, persisted stale result or fail-closed ambiguity.
   */
  guard<T>(
    purpose: ReviewFreshnessPurpose,
    key: ReviewManifestKey,
    observeRevision: () => Promise<string | undefined> | string | undefined,
    callback: (transition: ReviewGuardedTransition) => Promise<T> | T
  ): Promise<ReviewFreshnessResult<T>> {
    const previous = this._locks.get(key.mr) ?? Promise.resolve();
    const current = previous.then(async () => {
      const observed = await observeRevision();
      if (!observed) return { status: 'BLOCKED', reason: 'observed revision unavailable' } as const;
      const expected = `${key.headSHA}:${key.eventCursor}`;
      if (observed !== expected) {
        await this._journal.recordGuardTransaction(purpose, key, observed);
        return {
          status: 'STALE',
          expectedRevision: expected,
          observedRevision: observed,
          deltaRequested: true,
        } as const;
      }
      const capability = this._capabilities(purpose, key);
      const transition: ReviewGuardedTransition = {
        id: `${purpose}:${key.mr}:${observed}`,
        observedRevision: observed,
        ...capability,
      };
      await this._journal.recordGuardTransaction(purpose, key, observed, transition);
      const value = await callback(transition);
      return { status: 'FRESH', value, transition } as const;
    });
    this._locks.set(key.mr, current);
    return current.finally(() => {
      if (this._locks.get(key.mr) === current) this._locks.delete(key.mr);
    });
  }
}
