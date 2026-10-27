// @file: Bound passive eval operations even when a backend ignores AbortSignal.
// @spec: AI-SKILLS
// @consumers: OpenCode runtime, post-task reflection

/** @purpose Race one operation against an already owned deadline; remove listeners after settling. */
export async function withEvalSignal<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  signal?.throwIfAborted();
  if (!signal) return operation();
  let onAbort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason ?? new Error('Eval operation cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(operation), cancelled]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
