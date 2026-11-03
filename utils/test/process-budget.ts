// @file: Shared watchdog budget for real test subprocesses (not application deadlines).
// @spec: INFRA-BASE
// @consumers: real-process test helpers and subprocess-policy gate

/**
 * @purpose Resolve one bounded test watchdog; callers cannot supply per-call budgets.
 * @param [env] Environment containing the single optional watchdog setting.
 * @throws When the configured value is not a bounded positive integer.
 * @returns Positive integer watchdog duration in milliseconds.
 */
export function testProcessTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.GENNADY_TEST_PROCESS_TIMEOUT_MS;
  if (raw === undefined) return 300_000;
  if (
    !/^[1-9]\d*$/.test(raw) ||
    !Number.isSafeInteger(Number(raw)) ||
    Number(raw) > 2_147_483_647
  ) {
    throw new Error('GENNADY_TEST_PROCESS_TIMEOUT_MS must be a positive integer <= 2147483647');
  }
  return Number(raw);
}

/** @purpose Shared upper bound, preserving the existing shared CI and longest test-case budget. */
export const TEST_PROCESS_TIMEOUT_MS = testProcessTimeoutMs();
