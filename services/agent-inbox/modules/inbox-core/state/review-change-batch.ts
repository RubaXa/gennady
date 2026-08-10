// @file: Accumulated MR event delta with deterministic debounce, quiet and manual verification rules.
// @consumers: ReviewState, inbox-pipeline, inbox-queue
// @tasks: TSK-173

import { ReviewConfig } from '../review-config.ts';
import { ReviewEvent } from '../types/review-event.type.ts';

type ReviewChangeBatchStatus = 'open' | 'verifying' | 'applied' | 'stale';

/**
 * @purpose Accumulate every observed MR event into one timer-driven delta verification batch.
 * @invariant Quiet deadline follows the newest event; human replies also replace the debounce deadline.
 */
export class ReviewChangeBatch {
  /** @purpose Validated timing policy used for every deadline. */
  protected readonly _config: ReviewConfig;
  /** @purpose Complete ordered observed-event range retained for delta verification. */
  protected _events: Array<{ id: string; kind: string; occurredAt: string }> = [];
  /** @purpose Oldest known comparison SHA or null when full verification is required. */
  protected _baseSha: string | null = null;
  /** @purpose Newest observed comparison SHA. */
  protected _headSha: string | null = null;
  /** @purpose Latest human-reply debounce deadline. */
  protected _debounceDeadline: string | null = null;
  /** @purpose Quiet deadline replaced by every observed MR event. */
  protected _quietDeadline: string | null = null;
  /** @purpose Explicit operator bypass of both timers. */
  protected _manualRequested = false;
  /** @purpose Whether the current range already emitted a timer verification request. */
  protected _timerRequested = false;
  /** @purpose Current verification lifecycle of the accumulated range. */
  protected _status: ReviewChangeBatchStatus = 'open';
  /** @purpose Whether missing comparison coordinates require a full verification. */
  protected _forceFullVerification = false;
  /** @purpose Deterministic batch notifications emitted while folding journal facts. */
  protected _eventsEmitted: Array<Record<string, unknown>> = [];

  /**
   * @purpose Bind batch deadline calculations to validated runtime policy.
   * @param config Validated debounce and quiet policies.
   */
  constructor(config: ReviewConfig) {
    this._config = config;
  }

  /**
   * @purpose Retain one observed event and postpone the applicable verification deadlines.
   * @param event Validated canonical MR activity event.
   * @throws {Error} When a local control event is passed as observed MR activity.
   */
  accumulate(event: ReviewEvent): void {
    if (!event.changesObservedMr()) {
      throw new Error('[ReviewChangeBatch#accumulate] Event is not observed MR activity');
    }

    // #region START_PRESERVE_VERIFICATION_RANGE_SEMANTICS
    if (this._status === 'applied') {
      this._events = [];
      this._baseSha = this._headSha;
      this._debounceDeadline = null;
      this._manualRequested = false;
      this._forceFullVerification = false;
      this._status = 'open';
    } else if (this._status === 'verifying') {
      this._status = 'stale';
      this._eventsEmitted.push({
        kind: 'batch_invalidated',
        eventId: event.id,
        occurredAt: event.occurredAt,
      });
    }
    // #endregion END_PRESERVE_VERIFICATION_RANGE_SEMANTICS

    this._events.push({ id: event.id, kind: event.kind, occurredAt: event.occurredAt });
    this._timerRequested = false;
    const eventTime = Date.parse(event.occurredAt);
    this._quietDeadline = new Date(eventTime + this._config.quietMs).toISOString();

    // #region START_RESOLVE_EVENT_SPECIFIC_DEADLINES_AND_SHAS
    if (event.kind === 'discussion_changed' && event.payload.humanReply === true) {
      this._debounceDeadline = new Date(eventTime + this._config.debounceMs).toISOString();
    }
    if (event.kind === 'mr_observed' || event.kind === 'commit_pushed') {
      const baseSha = event.payload.baseSha;
      const headSha = event.payload.headSha;
      if (typeof baseSha === 'string') this._baseSha ??= baseSha;
      if (typeof headSha === 'string') this._headSha = headSha;
      if (!this._baseSha || !this._headSha) this._forceFullVerification = true;
    }
    this._eventsEmitted.push({
      kind: 'batch_changed',
      eventId: event.id,
      occurredAt: event.occurredAt,
    });
    // #endregion END_RESOLVE_EVENT_SPECIFIC_DEADLINES_AND_SHAS
  }

  /** @purpose Bypass debounce and quiet deadlines for an explicit operator verification. */
  requestManualVerification(): void {
    this._manualRequested = true;
    if (this._status === 'applied') this._status = 'open';
    this._eventsEmitted.push({ kind: 'verification_due', reason: 'manual' });
  }

  /** @purpose Mark the current range as already dispatched by the runtime timer. */
  requestTimerVerification(): void {
    this._timerRequested = true;
    this._eventsEmitted.push({ kind: 'verification_due', reason: 'timer' });
  }

  /**
   * @purpose Determine whether the current accumulated delta is due at controlled time.
   * @param now Controlled observation timestamp.
   * @returns Whether manual, debounce or quiet policy makes verification due.
   */
  isVerificationDue(now: string): boolean {
    if (
      this._events.length === 0 ||
      this._timerRequested ||
      this._status === 'verifying' ||
      this._status === 'applied'
    ) {
      return false;
    }
    const observedAt = Date.parse(now);
    return (
      this._manualRequested ||
      (this._debounceDeadline !== null && observedAt >= Date.parse(this._debounceDeadline)) ||
      (this._quietDeadline !== null && observedAt >= Date.parse(this._quietDeadline))
    );
  }

  /**
   * @purpose Mark the exact current event range as actively verifying.
   * @param batchLastEventId Claimed causal range end.
   */
  markVerifying(batchLastEventId: string): void {
    if (this.lastEventId() !== batchLastEventId) {
      throw new Error('[ReviewChangeBatch#markVerifying] Event range is stale');
    }
    this._status = 'verifying';
    this._manualRequested = false;
    this._timerRequested = false;
    this._eventsEmitted.push({ kind: 'batch_changed', status: 'verifying', batchLastEventId });
  }

  /**
   * @purpose Apply verification only when it still covers the exact current event range.
   * @param batchLastEventId Verified causal range end.
   * @param baseSha Verified comparison base.
   * @param headSha Verified comparison head.
   */
  markApplied(batchLastEventId: string, baseSha: string, headSha: string): void {
    if (this.lastEventId() !== batchLastEventId) {
      this._status = 'stale';
      return;
    }
    this._baseSha = baseSha;
    this._headSha = headSha;
    this._status = 'applied';
    this._manualRequested = false;
    this._eventsEmitted.push({ kind: 'batch_changed', status: 'applied', batchLastEventId });
  }

  /**
   * @purpose Return a failed current verification to deterministic timer/manual eligibility.
   * @param batchLastEventId Failed causal range end.
   */
  markVerificationFailed(batchLastEventId: string): void {
    if (this.lastEventId() === batchLastEventId) {
      this._status = 'open';
      this._timerRequested = false;
      this._eventsEmitted.push({ kind: 'batch_changed', status: 'open', batchLastEventId });
    }
  }

  /**
   * @purpose Identify the current causal event-range end.
   * @returns Last retained event identity or null for an empty batch.
   */
  lastEventId(): string | null {
    return this._events.at(-1)?.id ?? null;
  }

  /**
   * @purpose Resolve the next timer boundary for production ClockPort scheduling.
   * @returns Earliest active debounce/quiet deadline or null when no timer is eligible.
   */
  nextVerificationAt(): string | null {
    if (
      this._events.length === 0 ||
      this._timerRequested ||
      this._status === 'verifying' ||
      this._status === 'applied'
    ) {
      return null;
    }
    const deadlines = [this._debounceDeadline, this._quietDeadline].filter(
      (deadline): deadline is string => deadline !== null
    );
    return deadlines.sort()[0] ?? null;
  }

  /**
   * @purpose Expose fold-emitted batch transitions without permitting mutation.
   * @returns Copies of deterministic emitted batch events.
   */
  emittedEvents(): readonly Record<string, unknown>[] {
    return this._eventsEmitted.map((event) => ({ ...event }));
  }

  /**
   * @purpose Summarize review verification state for queue and API projections.
   * @param [now] Optional controlled observation time for the due flag.
   * @returns Stable review summary.
   */
  reviewSummary(now?: string): Record<string, unknown> {
    return {
      status: this._status,
      firstEventId: this._events[0]?.id ?? null,
      lastEventId: this.lastEventId(),
      baseSha: this._baseSha,
      headSha: this._headSha,
      verificationDue: now ? this.isVerificationDue(now) : false,
      forceFullVerification: this._forceFullVerification,
    };
  }

  /**
   * @purpose Expose stable accumulated delta and timer state for projections and recovery comparison.
   * @param [now] Optional controlled instant for the derived due flag.
   * @returns Stable event range, comparison coordinates, deadlines and status.
   */
  toSnapshot(now?: string): Record<string, unknown> {
    return {
      firstEventId: this._events[0]?.id ?? null,
      lastEventId: this.lastEventId(),
      events: this._events.map((event) => ({ ...event })),
      baseSha: this._baseSha,
      headSha: this._headSha,
      debounceDeadline: this._debounceDeadline,
      quietDeadline: this._quietDeadline,
      manualRequested: this._manualRequested,
      timerRequested: this._timerRequested,
      verificationDue: now ? this.isVerificationDue(now) : false,
      status: this._status,
      forceFullVerification: this._forceFullVerification,
      eventsEmitted: this.emittedEvents(),
    };
  }
}
