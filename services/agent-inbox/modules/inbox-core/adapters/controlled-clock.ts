// @file: Deterministic ClockPort implementation advanced explicitly by tests and mock runtime.
// @consumers: inbox-core tests, inbox-mocks
// @tasks: TSK-173

import type { ClockPort } from '../ports/clock.port.ts';

type ScheduledCallback = {
  at: number;
  order: number;
  cancelled: boolean;
  callback: () => void;
};

/**
 * @purpose Execute timer policy deterministically without sleeps or global fake timers.
 * @implements {ClockPort} in ../ports/clock.port.ts
 * @invariant Due callbacks execute by instant then registration order.
 */
export class ControlledClock implements ClockPort {
  /** @see {ClockPort#identity} in ../ports/clock.port.ts */
  readonly identity = 'controlled-clock';

  /** @see {ClockPort#health} in ../ports/clock.port.ts */
  health(): { status: 'healthy' } {
    return { status: 'healthy' };
  }

  /** @purpose Current controlled epoch milliseconds. */
  protected _now: number;
  /** @purpose Registration sequence preserving stable same-time callback order. */
  protected _order = 0;
  /** @purpose Pending callbacks not yet cancelled or executed. */
  protected _scheduled: ScheduledCallback[] = [];

  /**
   * @purpose Start a controlled clock at an explicit ISO instant.
   * @param initialNow Initial current time.
   * @throws {Error} When the initial instant is invalid.
   */
  constructor(initialNow: string) {
    this._now = Date.parse(initialNow);
    if (Number.isNaN(this._now)) {
      throw new Error('[ControlledClock#constructor] Initial time is invalid');
    }
  }

  /** @see {ClockPort#now} in ../ports/clock.port.ts */
  now(): string {
    return new Date(this._now).toISOString();
  }

  /** @see {ClockPort#schedule} in ../ports/clock.port.ts */
  schedule(at: string, callback: () => void): { cancel(): void } {
    const parsed = Date.parse(at);
    if (Number.isNaN(parsed)) {
      throw new Error('[ControlledClock#schedule] Scheduled time is invalid');
    }
    const scheduled: ScheduledCallback = {
      at: parsed,
      order: this._order++,
      cancelled: false,
      callback,
    };
    this._scheduled.push(scheduled);
    return { cancel: () => (scheduled.cancelled = true) };
  }

  /**
   * @purpose Advance to an absolute instant and run every newly due callback deterministically.
   * @param at New current instant, never earlier than current time.
   * @throws {Error} On invalid time or clock regression.
   */
  advanceTo(at: string): void {
    const parsed = Date.parse(at);
    if (Number.isNaN(parsed) || parsed < this._now) {
      throw new Error('[ControlledClock#advanceTo] Clock cannot regress or accept invalid time');
    }
    this._now = parsed;
    // #region START_DRAIN_DUE_CALLBACKS_IN_STABLE_ORDER
    const due = this._scheduled
      .filter((scheduled) => !scheduled.cancelled && scheduled.at <= this._now)
      .sort((left, right) => left.at - right.at || left.order - right.order);
    this._scheduled = this._scheduled.filter((scheduled) => !due.includes(scheduled));
    for (const scheduled of due) scheduled.callback();
    // #endregion END_DRAIN_DUE_CALLBACKS_IN_STABLE_ORDER
  }
}
