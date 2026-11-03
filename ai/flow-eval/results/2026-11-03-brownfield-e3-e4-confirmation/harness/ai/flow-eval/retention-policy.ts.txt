// @file: One bounded retention policy shared by flow-eval lifecycle and dependency storage.
// @spec: AI-SKILLS
// @consumers: dependency-store.ts; sandbox-lifecycle.ts

/** @purpose Single production policy for every transient flow-eval storage class. */
export const SDD_EVAL_RETENTION_POLICY = Object.freeze({
  dependencyStore: Object.freeze({
    maxEntries: 2,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    leaseHeartbeatMs: 30 * 1000,
    leaseStaleMs: 2 * 60 * 1000,
    lockStaleMs: 60 * 1000,
  }),
  debugSandbox: Object.freeze({ maxEntries: 2, maxAgeMs: 24 * 60 * 60 * 1000 }),
  transientResult: Object.freeze({ maxEntries: 10, maxAgeMs: 7 * 24 * 60 * 60 * 1000 }),
});
