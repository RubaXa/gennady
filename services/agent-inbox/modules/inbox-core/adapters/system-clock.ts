// @file: System-time implementation of the canonical ClockPort.
// @consumers: production composition root
// @tasks: TSK-173

import type { ClockPort } from '../ports/clock.port.ts';

/**
 * @purpose Bind canonical review timers to the Node.js wall clock.
 * @implements {ClockPort} in ../ports/clock.port.ts
 */
export class SystemClock implements ClockPort {
  /** @see {ClockPort#identity} in ../ports/clock.port.ts */
  readonly identity = 'system-clock';
  /** @purpose Latest invalid scheduling request exposed to runtime diagnostics. */
  protected _healthFailure: string | null = null;

  /** @see {ClockPort#health} in ../ports/clock.port.ts */
  health(): { status: 'healthy' | 'failed'; detail?: string } {
    return this._healthFailure
      ? { status: 'failed', detail: this._healthFailure }
      : { status: 'healthy' };
  }

  /** @see {ClockPort#now} in ../ports/clock.port.ts */
  now(): string {
    return new Date().toISOString();
  }

  /** @see {ClockPort#schedule} in ../ports/clock.port.ts */
  schedule(at: string, callback: () => void): { cancel(): void } {
    const parsed = Date.parse(at);
    if (Number.isNaN(parsed)) {
      this._healthFailure = '[SystemClock#schedule] Scheduled time is invalid';
      throw new Error(this._healthFailure);
    }
    this._healthFailure = null;
    const delay = Math.max(0, parsed - Date.now());
    const timer = setTimeout(callback, delay);
    return { cancel: () => clearTimeout(timer) };
  }
}
