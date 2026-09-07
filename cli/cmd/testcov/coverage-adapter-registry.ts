// @file: Fail-closed adapter selection for platform-neutral testcov orchestration.
// @consumers: testcov.cmd.ts, coverage-adapter-registry.test.ts

import type { CoverageAdapter, CoverageAdapterSelection } from './coverage-adapter.types.ts';
import { istanbulCoverageAdapter } from './istanbul-coverage-adapter.ts';

/** @purpose Sole registration point; add future platform adapters without changing orchestration. */
const COVERAGE_ADAPTERS: readonly CoverageAdapter[] = [istanbulCoverageAdapter];

/**
 * @purpose Select exactly one adapter from concrete project/report evidence.
 * @param root Exact project root to inspect.
 * @param [adapters] Registry to evaluate; injectable for deterministic selection tests.
 * @returns Selected adapter, unsupported capability, or all ambiguous matches.
 */
export function selectCoverageAdapter(
  root: string,
  adapters: readonly CoverageAdapter[] = COVERAGE_ADAPTERS
): CoverageAdapterSelection {
  const matches = adapters
    .map((adapter) => ({ adapter, detection: adapter.detect(root) }))
    .filter(({ detection }) => detection.matched);
  if (matches.length === 1) return { kind: 'selected', adapter: matches[0]!.adapter };
  if (matches.length === 0) return { kind: 'unsupported', available: adapters.map(({ id }) => id) };
  return {
    kind: 'ambiguous',
    matches: matches.map(({ adapter, detection }) => ({
      id: adapter.id,
      evidence: detection.evidence,
    })),
  };
}
