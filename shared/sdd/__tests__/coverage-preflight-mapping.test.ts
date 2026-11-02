// @file: Early mapping diagnostics preserve preparation and the strict final ownership audit.
// @spec: SHARED
// @consumers: declared coverage lifecycle

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSddCoverage } from '../coverage.ts';
import type { CoverageInput } from '../coverage.types.ts';

const input: CoverageInput = {
  selection: { kind: 'phase', task: 'CORE-work', phase: 'P1' },
  stage: 'preflight',
  specs: [{ id: 'CORE', path: 'specs/core/core.spec.md', children: [], files: [] }],
  targets: [
    {
      task: 'CORE-work',
      phase: 'P1',
      path: 'src/value.test.ts',
      specId: 'CORE',
      operation: 'write',
    },
  ],
  observations: [{ path: 'src/value.test.ts', state: 'missing', specIds: [] }],
};

test('future target has actionable mapping notice before any code is written', () => {
  const result = resolveSddCoverage(input);
  assert.equal(result.canProceed, true);
  assert.ok(result.findings.some((f) => f.code === 'MAPPING_REQUIRED' && f.severity === 'pending'));
  assert.match(result.findings.find((f) => f.code === 'MAPPING_REQUIRED')!.detail, /CORE/);
});

test('declaring the file removes the early notice; ready code still requires mapping at audit', () => {
  const mapped = { ...input, specs: [{ ...input.specs[0]!, files: ['src/value.test.ts'] }] };
  assert.ok(!resolveSddCoverage(mapped).findings.some((f) => f.code === 'MAPPING_REQUIRED'));
  const ready = {
    ...input,
    observations: [{ path: 'src/value.test.ts', state: 'file' as const, specIds: ['CORE'] }],
  };
  assert.equal(resolveSddCoverage({ ...ready, stage: 'audit' }).canProceed, false);
});
