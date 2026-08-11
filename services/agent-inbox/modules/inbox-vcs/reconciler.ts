// @file: VcsReconciler — fresh-read effect classification and bounded read-before-retry recovery.
// @consumers: Effects
// @tasks: TSK-174

import { logger } from '#logger';
import type { VcsEffectOutcome, VcsEffectRequest, VcsPort } from './vcs-port.ts';

const SAFE_RETRY_KINDS = new Set<VcsEffectRequest['kind']>([
  'resolve',
  'reopen',
  'approve',
  'unapprove',
  'request_changes',
  'edit_description',
]);

/**
 * @purpose Reconcile every claimed effect against fresh provider truth and recover ambiguous transport once.
 * @invariant Ambiguous transport is read before retry; unsafe-to-repeat note/reaction effects remain unknown.
 * @invariant Unknown is never reported as applied or no-op.
 */
export class VcsReconciler {
  /** @purpose Existing unified provider boundary used for postcondition reads. */
  protected readonly _vcs: VcsPort;

  /**
   * @purpose Bind reconciliation to the same adapter that executes the effect.
   * @param vcs Unified adapter used for mutation and fresh observation.
   */
  constructor(vcs: VcsPort) {
    this._vcs = vcs;
  }

  /**
   * @purpose Apply and reconcile one already authorized effect.
   * @param request Validated stable effect request.
   * @param execute External mutation attempt.
   * @returns Applied, no-op, failed, or unknown with read/retry evidence.
   * @sideEffect Performs fresh reads and at most two mutation attempts.
   */
  async applyAndReconcile(
    request: VcsEffectRequest,
    execute: () => Promise<void>
  ): Promise<VcsEffectOutcome> {
    const initialObservation = await this._observeSafely(request);
    if (initialObservation === true) {
      return this._outcome(request, 'no_op', 'desired-effect-already-observed', false);
    }
    if (initialObservation === null) {
      return this._outcome(request, 'unknown', 'precondition-read-unavailable', false);
    }

    try {
      await execute();
    } catch (cause) {
      if (!this._isAmbiguousTransport(cause)) {
        logger.error('[VcsReconciler#applyAndReconcile] [applying → failed]', { cause });
        return this._outcome(request, 'failed', 'provider-rejected-effect', false);
      }
      return this._reconcileAmbiguous(request, execute, cause);
    }

    return (await this._observeSafely(request)) === true
      ? this._outcome(request, 'applied', 'fresh-read-observed-effect', false)
      : this._outcome(request, 'unknown', 'provider-accepted-but-postcondition-unobserved', false);
  }

  /**
   * @purpose Read provider truth before considering one bounded retry after ambiguous transport.
   * @param request Stable effect request.
   * @param execute External mutation attempt.
   * @param cause Ambiguous transport failure retained for diagnostics.
   * @returns Reconciled applied, failed, or unknown outcome.
   */
  protected async _reconcileAmbiguous(
    request: VcsEffectRequest,
    execute: () => Promise<void>,
    cause: unknown
  ): Promise<VcsEffectOutcome> {
    logger.warn('[VcsReconciler#_reconcileAmbiguous] [ambiguous → reading_before_retry]', {
      cause,
      effectId: request.effectId,
    });
    const observation = await this._observeSafely(request);
    if (observation === true) {
      return this._outcome(request, 'applied', 'ambiguous-response-effect-observed', true);
    }
    if (observation === null) {
      return this._outcome(request, 'unknown', 'ambiguous-reconciliation-read-unavailable', true);
    }
    if (!SAFE_RETRY_KINDS.has(request.kind)) {
      return this._outcome(request, 'unknown', 'ambiguous-unsafe-effect-not-retried', true);
    }

    try {
      await execute();
    } catch (retryCause) {
      logger.error('[VcsReconciler#_reconcileAmbiguous] [retrying → failed]', { retryCause });
      return (await this._observeSafely(request)) === true
        ? this._outcome(request, 'applied', 'retry-failed-but-effect-observed', true)
        : this._outcome(request, 'unknown', 'retry-failed-and-effect-unobserved', true);
    }
    return (await this._observeSafely(request)) === true
      ? this._outcome(request, 'applied', 'safe-retry-effect-observed', true)
      : this._outcome(request, 'unknown', 'safe-retry-effect-unobserved', true);
  }

  /**
   * @purpose Preserve unavailable observation distinctly so no mutation or retry can fabricate safety.
   * @param request Validated desired effect.
   * @returns Observed state, or null when provider truth is unavailable.
   */
  protected async _observeSafely(request: VcsEffectRequest): Promise<boolean | null> {
    try {
      return await this._vcs.observeEffect(request);
    } catch (cause) {
      logger.error('[VcsReconciler#_observeSafely] [reading → unavailable]', { cause });
      return null;
    }
  }

  /**
   * @purpose Classify only transport-loss failures as ambiguous.
   * @param cause Provider or transport failure.
   * @returns Whether the failure leaves mutation application uncertain.
   */
  protected _isAmbiguousTransport(cause: unknown): boolean {
    if (typeof cause === 'object' && cause !== null && 'ambiguous' in cause) {
      return (cause as { ambiguous?: unknown }).ambiguous === true;
    }
    return (
      cause instanceof Error && /timeout|timed out|ECONNRESET|socket hang up/i.test(cause.message)
    );
  }

  /**
   * @purpose Compose one closed reconciled result.
   * @param request Validated desired effect.
   * @param status Closed reconciled state.
   * @param evidence Stable reason supporting the state.
   * @param readBeforeRetry Whether ambiguity was observed before retry.
   * @returns Closed reconciled outcome.
   */
  protected _outcome(
    request: VcsEffectRequest,
    status: VcsEffectOutcome['status'],
    evidence: string,
    readBeforeRetry: boolean
  ): VcsEffectOutcome {
    return { effectId: request.effectId, kind: request.kind, status, evidence, readBeforeRetry };
  }
}
