// @file: Tracking, terminal completion, activity horizon and visibility policy for one MR.
// @consumers: ReviewState, inbox-api
// @tasks: TSK-173

type ReviewLifecycleState = 'open' | 'merged' | 'closed';

/**
 * @purpose Track MR lifecycle independently from dashboard visibility and local completion.
 * @invariant Every observed MR event refreshes activity and clears terminal completion.
 */
export class ReviewLifecycle {
  /** @purpose Latest observed external MR lifecycle state. */
  protected _state: ReviewLifecycleState;
  /** @purpose First canonical tracking instant retained for history. */
  protected _trackedAt: string;
  /** @purpose Latest observed MR activity instant driving the horizon. */
  protected _lastActivityAt: string;
  /** @purpose Explicit local terminal completion instant, cleared by new activity. */
  protected _completedAt: string | null;
  /** @purpose Deterministic lifecycle notifications emitted while folding journal facts. */
  protected _eventsEmitted: Array<Record<string, unknown>> = [];

  /**
   * @purpose Start lifecycle tracking from the first canonical MR observation.
   * @param state Observed GitLab lifecycle state.
   * @param occurredAt First observed activity timestamp.
   */
  constructor(state: ReviewLifecycleState, occurredAt: string) {
    this._state = state;
    this._trackedAt = occurredAt;
    this._lastActivityAt = occurredAt;
    this._completedAt = null;
    this._eventsEmitted.push({ kind: 'lifecycle_changed', state, occurredAt });
  }

  /**
   * @purpose Replace externally observed MR state and reactivate local visibility.
   * @param state Latest external lifecycle state.
   * @param occurredAt Observation timestamp.
   */
  observeState(state: ReviewLifecycleState, occurredAt: string): void {
    const previous = this._state;
    this._state = state;
    this.observeActivity(occurredAt);
    if (previous !== state) {
      this._eventsEmitted.push({ kind: 'lifecycle_changed', state, occurredAt });
    }
  }

  /**
   * @purpose Refresh last activity and clear explicit completion after any new MR event.
   * @param occurredAt Observed event timestamp.
   */
  observeActivity(occurredAt: string): void {
    if (Date.parse(occurredAt) >= Date.parse(this._lastActivityAt)) {
      this._lastActivityAt = occurredAt;
    }
    if (this._completedAt !== null) {
      this._completedAt = null;
      this._eventsEmitted.push({
        kind: 'lifecycle_changed',
        state: this._state,
        occurredAt,
        reactivated: true,
      });
    }
  }

  /**
   * @purpose Mark a terminal MR complete for the operator without deleting history.
   * @param occurredAt Local completion timestamp.
   * @throws {Error} When completion is requested while the MR is open.
   */
  complete(occurredAt: string): void {
    if (this._state === 'open') {
      throw new Error('[ReviewLifecycle#complete] Open MR cannot be completed');
    }
    this._completedAt = occurredAt;
    this._eventsEmitted.push({ kind: 'completed', state: this._state, occurredAt });
  }

  /**
   * @purpose Apply the lifecycle truth table at a controlled observation time.
   * @param now Controlled visibility observation time.
   * @param activityHorizonMs Maximum visible inactivity duration.
   * @returns Whether the retained lifecycle is currently visible.
   */
  isVisible(now: string, activityHorizonMs: number): boolean {
    if (this._completedAt) return false;
    return Date.parse(now) - Date.parse(this._lastActivityAt) <= activityHorizonMs;
  }

  /**
   * @purpose Expose deterministic lifecycle state while retaining hidden history.
   * @returns Stable lifecycle projection.
   */
  toSnapshot(): Record<string, unknown> {
    return {
      state: this._state,
      trackedAt: this._trackedAt,
      lastActivityAt: this._lastActivityAt,
      completedAt: this._completedAt,
      eventsEmitted: this.emittedEvents(),
    };
  }

  /**
   * @purpose Expose fold-emitted lifecycle transitions without permitting mutation.
   * @returns Copies of deterministic emitted lifecycle events.
   */
  emittedEvents(): readonly Record<string, unknown>[] {
    return this._eventsEmitted.map((event) => ({ ...event }));
  }
}
