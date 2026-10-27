// @file: Bound microprobe lifecycle calls and guarantee sandbox removal after failed deletion.
// @spec: AI-SKILLS
// @consumers: finite task-quality live runner

import { withEvalSignal } from './eval-signal.ts';

/** @purpose Stop waiting even when an SDK operation ignores its cancellation signal. */
export async function withTaskQualityDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parent?: AbortSignal
): Promise<T> {
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new Error('[taskQualityLive] Lifecycle deadline exceeded')),
    timeoutMs
  );
  const signal = parent ? AbortSignal.any([parent, deadline.signal]) : deadline.signal;
  try {
    return await withEvalSignal(() => operation(signal), signal);
  } finally {
    clearTimeout(timer);
  }
}

/** @purpose A failed/expired remote delete must never skip owned local cleanup. */
export async function cleanupTaskQualitySession(
  removeSession: (signal: AbortSignal) => Promise<boolean>,
  removeSandbox: () => void,
  timeoutMs = 5000
): Promise<boolean> {
  try {
    return await withTaskQualityDeadline(removeSession, timeoutMs);
  } catch {
    return false;
  } finally {
    removeSandbox();
  }
}
