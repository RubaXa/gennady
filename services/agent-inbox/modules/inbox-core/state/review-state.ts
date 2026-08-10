// @file: Deterministic canonical MR state reconstructed exclusively from ordered journal events.
// @consumers: StateStore, inbox-pipeline, inbox-api
// @tasks: TSK-173

import { ReviewConfig } from '../review-config.ts';
import { ReviewEvent } from '../types/review-event.type.ts';
import { ReviewChangeBatch } from './review-change-batch.ts';
import { ReviewLifecycle } from './review-lifecycle.ts';
import { ReviewParticipation } from './review-participation.ts';

/**
 * @purpose Recover current participation, lifecycle and accumulated change batch for one tracked MR.
 * @invariant Ordered journal events are the only mutation input; snapshots are disposable projections.
 */
export class ReviewState {
  /** @purpose Canonical immutable MR identity shared by every folded event. */
  readonly mr: Readonly<{ project: string; iid: string }>;
  /** @purpose Validated policy used by lifecycle and batch projections. */
  protected readonly _config: ReviewConfig;
  /** @purpose Latest complete inclusive participation observation. */
  protected _participation: ReviewParticipation;
  /** @purpose Folded tracking, activity and completion lifecycle. */
  protected _lifecycle: ReviewLifecycle;
  /** @purpose Current accumulated delta verification batch. */
  protected _changeBatch: ReviewChangeBatch;
  /** @purpose Folded counts of local effects for stable operational summaries. */
  protected _effectSummary = {
    manualVerificationRequests: 0,
    timerVerificationRequests: 0,
    verificationStarts: 0,
    verificationApplications: 0,
    verificationFailures: 0,
    lifecycleCompletions: 0,
  };

  /**
   * @purpose Initialize canonical state from the first validated event.
   * @param firstEvent First event establishing MR identity and tracking time.
   * @param config Validated lifecycle and batch policy.
   */
  protected constructor(firstEvent: ReviewEvent, config: ReviewConfig) {
    this.mr = Object.freeze({ ...firstEvent.mr });
    this._config = config;
    this._participation = ReviewParticipation.empty();
    const initialState =
      firstEvent.kind === 'mr_observed'
        ? (firstEvent.payload.state as 'open' | 'merged' | 'closed')
        : 'open';
    this._lifecycle = new ReviewLifecycle(initialState, firstEvent.occurredAt);
    this._changeBatch = new ReviewChangeBatch(config);
  }

  /**
   * @purpose Deterministically rebuild one MR state from append order.
   * @param events Ordered validated or serialized canonical events for exactly one MR.
   * @param [config] Validated timing and horizon policy.
   * @throws {Error} On empty input, duplicate IDs, mixed MR identity or invalid event variant.
   * @returns Canonical state byte-equivalent for the same event stream and config.
   */
  static fold(
    events: readonly (ReviewEvent | unknown)[],
    config = new ReviewConfig()
  ): ReviewState {
    if (events.length === 0) {
      throw new Error('[ReviewState.fold] At least one event is required');
    }
    const validated = events.map((event) =>
      event instanceof ReviewEvent ? event : ReviewEvent.validate(event)
    );
    const state = new ReviewState(validated[0], config);
    const ids = new Set<string>();
    // #region START_ENFORCE_SINGLE_MR_APPEND_ORDER
    for (const event of validated) {
      if (event.identifyMr() !== `${state.mr.project}!${state.mr.iid}`) {
        throw new Error('[ReviewState.fold] Event stream contains more than one MR');
      }
      if (ids.has(event.id)) {
        throw new Error(`[ReviewState.fold] Duplicate event id: ${event.id}`);
      }
      ids.add(event.id);
      if (event.actor.kind === 'bot' && !config.permitsBot(event.actor.id)) {
        throw new Error(
          `[ReviewState.fold] Bot is outside the configured allowlist: ${event.actor.id}`
        );
      }
      state.applyEvent(event);
    }
    // #endregion END_ENFORCE_SINGLE_MR_APPEND_ORDER
    return state;
  }

  /**
   * @purpose Expose current inclusive participation without permitting mutation.
   * @returns Current participation value.
   */
  participation(): ReviewParticipation {
    return this._participation;
  }

  /**
   * @purpose Expose current lifecycle policy value without permitting replacement.
   * @returns Current lifecycle value.
   */
  lifecycle(): ReviewLifecycle {
    return this._lifecycle;
  }

  /**
   * @purpose Expose current accumulated verification batch.
   * @returns Current change batch.
   */
  changeBatch(): ReviewChangeBatch {
    return this._changeBatch;
  }

  /**
   * @purpose Combine participation eligibility with lifecycle visibility truth table.
   * @param now Controlled visibility observation timestamp.
   * @returns Whether projections should currently display the MR.
   */
  isVisible(now: string): boolean {
    return (
      this._participation.hasAnySignal() &&
      this._lifecycle.isVisible(now, this._config.activityHorizonMs)
    );
  }

  /**
   * @purpose Expose stable rebuild output suitable for a disposable registry cache.
   * @param [now] Optional controlled instant for derived verification due state.
   * @returns Stable canonical state projection.
   */
  toSnapshot(now?: string): Record<string, unknown> {
    return {
      mr: this.mr,
      participation: this._participation.toSnapshot(),
      lifecycle: this._lifecycle.toSnapshot(),
      changeBatch: this._changeBatch.toSnapshot(now),
      reviewSummary: this._changeBatch.reviewSummary(now),
      effectSummary: { ...this._effectSummary },
      eventsEmitted: [...this._lifecycle.emittedEvents(), ...this._changeBatch.emittedEvents()],
    };
  }

  /**
   * @purpose Apply one validated event according to the canonical fold truth table.
   * @param event Next append-ordered canonical event.
   */
  protected applyEvent(event: ReviewEvent): void {
    // #region START_FOLD_OBSERVED_ACTIVITY
    if (event.changesObservedMr()) {
      if (event.kind === 'mr_observed') {
        this._participation = ReviewParticipation.from(event.payload.participation);
        this._lifecycle.observeState(
          event.payload.state as 'open' | 'merged' | 'closed',
          event.occurredAt
        );
      } else {
        this._lifecycle.observeActivity(event.occurredAt);
      }
      this._changeBatch.accumulate(event);
      return;
    }
    // #endregion END_FOLD_OBSERVED_ACTIVITY

    // #region START_FOLD_LOCAL_CONTROL_FACTS
    switch (event.kind) {
      case 'lifecycle_completed':
        this._lifecycle.complete(event.occurredAt);
        this._effectSummary.lifecycleCompletions += 1;
        return;
      case 'verification_requested':
        if (event.payload.mode === 'manual') {
          this._changeBatch.requestManualVerification();
          this._effectSummary.manualVerificationRequests += 1;
        } else {
          this._changeBatch.requestTimerVerification();
          this._effectSummary.timerVerificationRequests += 1;
        }
        return;
      case 'verification_started':
        this._changeBatch.markVerifying(event.payload.batchLastEventId as string);
        this._effectSummary.verificationStarts += 1;
        return;
      case 'verification_applied':
        this._changeBatch.markApplied(
          event.payload.batchLastEventId as string,
          event.payload.baseSha as string,
          event.payload.headSha as string
        );
        this._effectSummary.verificationApplications += 1;
        return;
      case 'verification_failed':
        this._changeBatch.markVerificationFailed(event.payload.batchLastEventId as string);
        this._effectSummary.verificationFailures += 1;
        return;
    }
    // #endregion END_FOLD_LOCAL_CONTROL_FACTS
  }
}
