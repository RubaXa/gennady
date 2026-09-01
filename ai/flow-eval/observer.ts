// @file: External bounded-tail observer for SDD worker sessions.
// @consumers: runner, evaluator, fake-backed tests

import { createHash } from 'node:crypto';
import type { SddEvalEvidenceSource, SddEvalObservation, SddEvalTailEntry } from './types.ts';

/** @purpose Build a stable short fingerprint for a bounded message tail entry. */
export function fingerprintTail(tail: SddEvalTailEntry[]): string {
  const value = tail
    .map(
      (entry) =>
        `${entry.messageId}:${entry.role}:${entry.text}:${entry.toolCalls
          .map((call) => `${call.callId}:${call.tool}:${call.status}:${call.inputSummary ?? ''}`)
          .join(',')}`
    )
    .join('\n');
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/** @purpose Observer dependency seam; avoids timers and real sessions in unit tests. */
export type SddEvalObserverClock = {
  now(): number;
  sleep(ms: number): Promise<void>;
};

const realClock: SddEvalObserverClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** @purpose Options controlling one bounded observation loop. */
export type SddEvalObserveOptions = {
  everyMs: number;
  stuckAfter: number;
  tailLimit: number;
  /** @purpose Stop polling once this predicate sees a terminal status. */
  isTerminal?: (status: SddEvalObservation['status']) => boolean;
  clock?: SddEvalObserverClock;
  /** @purpose Abort callback used exactly once when collect() marks a session stuck. */
  abort?: (sessionId: string) => Promise<void>;
  /** @purpose Emit each bounded snapshot without exposing the full transcript. */
  onObservation?: (sessionId: string, observation: SddEvalObservation) => void | Promise<void>;
};

/** @purpose Reads a fresh external snapshot and derives progress, repetition, errors, waiting, and deadlock. */
export class SddEvalObserver {
  readonly #source: SddEvalEvidenceSource;
  readonly #clock: SddEvalObserverClock;
  readonly #opts: Required<
    Omit<SddEvalObserveOptions, 'clock' | 'isTerminal' | 'abort' | 'onObservation'>
  > &
    Pick<SddEvalObserveOptions, 'isTerminal' | 'abort' | 'onObservation'>;

  constructor(source: SddEvalEvidenceSource, options: SddEvalObserveOptions) {
    if (options.everyMs < 0 || options.stuckAfter < 1 || options.tailLimit < 1) {
      throw new Error('observer everyMs must be >= 0, stuckAfter/tailLimit must be >= 1');
    }
    this.#source = source;
    this.#clock = options.clock ?? realClock;
    this.#opts = {
      everyMs: options.everyMs,
      stuckAfter: options.stuckAfter,
      tailLimit: options.tailLimit,
      isTerminal: options.isTerminal,
      abort: options.abort,
      onObservation: options.onObservation,
    };
  }

  /** @purpose Take one external snapshot; no writes and no transcript accumulation beyond tail. */
  async observe(sessionId: string, previous?: SddEvalObservation): Promise<SddEvalObservation> {
    let tail: SddEvalTailEntry[] = [];
    let events = [] as SddEvalObservation['events'];
    let status: SddEvalObservation['status'] = 'unknown';
    let readError: string | undefined;
    try {
      [tail, events, status] = await Promise.all([
        this.#source.readTail(sessionId, this.#opts.tailLimit),
        this.#source.readEvents(sessionId),
        this.#source.readStatus(sessionId),
      ]);
    } catch (cause) {
      readError = cause instanceof Error ? cause.message : String(cause);
      status = 'error';
    }
    const before = previous?.tail ?? [];
    const beforeFingerprint = fingerprintTail(before);
    const afterFingerprint = fingerprintTail(tail);
    const changed = previous === undefined || beforeFingerprint !== afterFingerprint;
    const repeated = previous !== undefined && !changed;
    const repeatCount = repeated ? previous.repeatCount + 1 : 0;
    const errors = events
      .filter((event) => event.type === 'session.error' || event.type.endsWith('.error'))
      .map((event) => event.summary ?? event.type);
    if (readError) errors.push(readError);
    const waiting =
      (repeated && previous?.waiting === true) ||
      (status === 'idle' && tail.at(-1)?.role === 'user') ||
      events.some(
        (event) =>
          event.type === 'permission.updated' ||
          event.type === 'permission.asked' ||
          event.type === 'session.waiting'
      );
    const stuck = previous?.stuck === true || (repeated && repeatCount >= this.#opts.stuckAfter);
    return {
      at: this.#clock.now(),
      status,
      tail,
      events,
      progress: changed,
      repeated,
      repeatCount,
      errors,
      waiting,
      stuck,
    };
  }

  /** @purpose Poll until terminal, an external deadlock, or an optional observation cap. */
  async collect(
    sessionId: string,
    maxObservations = Number.POSITIVE_INFINITY
  ): Promise<SddEvalObservation[]> {
    const observations: SddEvalObservation[] = [];
    const isTerminal =
      this.#opts.isTerminal ?? ((status) => status === 'completed' || status === 'error');
    while (observations.length < maxObservations) {
      const previous = observations.at(-1);
      const current = await this.observe(sessionId, previous);
      observations.push(current);
      await this.#opts.onObservation?.(sessionId, current);
      if (isTerminal(current.status)) break;
      if (current.stuck) {
        if (this.#opts.abort) await this.#opts.abort(sessionId);
        break;
      }
      if (this.#opts.everyMs > 0) await this.#clock.sleep(this.#opts.everyMs);
    }
    return observations;
  }
}
