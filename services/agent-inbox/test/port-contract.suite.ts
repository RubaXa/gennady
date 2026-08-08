// @file: port-contract.suite — shared fake-vs-real adapter equivalence assertion.
// @consumers: agent-inbox VCS and OpenCode adapter contract tests
// @tasks: TSK-166

import assert from 'node:assert/strict';

/** @purpose Inputs for comparing one port operation across fake and cassette-backed real adapters. */
export type PortContractSuite<Input, Output> = {
  /** @purpose Stable operation name included in drift diagnostics. */
  name: string;
  /**
   * @purpose Creates the deterministic fake port implementation
   * @returns Fake port used as the contract baseline.
   */
  createFake: () => Input;
  /**
   * @purpose Creates the real adapter while its HTTP transport is cassette-replayed
   * @returns Real port exercised against recorded traffic.
   */
  createReal: () => Input;
  /**
   * @purpose Evaluates the public port operation against one implementation
   * @param port Port instance under comparison
   * @returns Observable output compared across the fake and real ports.
   */
  exercise: (port: Input) => Promise<Output> | Output;
};

/** @purpose Return the first divergent object path to make port drift actionable. */
function locateDifference(left: unknown, right: unknown, path = '$'): string | null {
  if (Object.is(left, right)) return null;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return path;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return path;
    for (let index = 0; index < left.length; index += 1) {
      const difference = locateDifference(left[index], right[index], `${path}.${index}`);
      if (difference) return difference;
    }
    return null;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  for (const key of keys) {
    const leftValue = leftRecord[key];
    const rightValue = rightRecord[key];
    if (leftValue === undefined && rightValue === undefined) continue;
    const difference = locateDifference(leftValue, rightValue, `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

/**
 * @purpose Assert that fake and cassette-backed real adapters expose identical port output.
 * @param suite Port operation setup.
 * @throws When a divergent field is found; the message includes its object path.
 * @returns The shared output, convenient for additional scenario assertions.
 */
export async function assertPortContract<Input, Output>(
  suite: PortContractSuite<Input, Output>
): Promise<Output> {
  const fake = await suite.exercise(suite.createFake());
  const real = await suite.exercise(suite.createReal());
  const difference = locateDifference(fake, real);
  if (difference) {
    throw new Error(`[assertPortContract] ${suite.name} diverges at ${difference}`);
  }
  assert.deepStrictEqual(fake, real);
  return real;
}
