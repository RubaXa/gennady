// @file: Clock boundary for production timers and deterministic review-batch tests.
// @consumers: inbox-core, inbox-queue, inbox-mocks
// @tasks: TSK-173

/**
 * @purpose Provide current time and cancellable scheduling without binding domain state to system timers.
 * @invariant Scheduled callbacks run no earlier than their requested instant.
 */
export interface ClockPort {
  /** @purpose Stable adapter identity exposed to runtime diagnostics. */
  readonly identity: string;

  /**
   * @purpose Report whether this process-scoped clock can accept scheduling work.
   * @returns Current adapter health and optional failure detail.
   */
  health(): { status: 'healthy' | 'failed'; detail?: string };

  /**
   * @purpose Retrieve the current clock instant as an ISO timestamp.
   * @returns Current adapter instant.
   */
  now(): string;

  /**
   * @purpose Schedule one callback at an absolute ISO instant.
   * @param at Requested execution instant.
   * @param callback Domain callback invoked once unless cancelled.
   * @returns Cancellation handle for superseded batch timers.
   * @sideEffect Registers a timer in the adapter.
   */
  schedule(at: string, callback: () => void): { cancel(): void };
}
