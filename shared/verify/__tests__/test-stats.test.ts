// @file: Strict normalized adapters for supported runner-owned test-statistics protocols.
// @consumers: CI
// @spec: CLI-VERIFY

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { parseVerifyTestStats } from '../test-stats.ts';

it('parses machine-readable Vitest JSON only when its complete count contract is present', () => {
  const parsed = parseVerifyTestStats(
    {
      policy: 'required',
      protocol: 'vitest-json-v1',
      runner: 'vitest',
      source: 'detected:package.json#devDependencies.vitest',
    },
    '> project test\n> vitest run --reporter=json\n' +
      JSON.stringify({
        numTotalTests: 5,
        numPassedTests: 3,
        numFailedTests: 1,
        numPendingTests: 0,
        numTodoTests: 1,
      }),
    ''
  );
  assert.deepEqual(parsed, {
    schema: 'gennady.verify-test-stats.v1',
    policy: 'required',
    protocol: 'vitest-json-v1',
    runner: 'vitest',
    source: 'detected:package.json#devDependencies.vitest',
    executed: 5,
    passed: 3,
    failed: 1,
    skipped: 1,
  });
  assert.equal(
    parseVerifyTestStats(
      {
        policy: 'required',
        protocol: 'vitest-json-v1',
        runner: 'vitest',
        source: 'detected',
      },
      '{"numTotalTests":1,"numPassedTests":1}',
      ''
    ),
    null
  );
});

it('accepts only one coherent runner-owned Gennady topology aggregate', () => {
  const policy = {
    policy: 'required' as const,
    protocol: 'gennady-test-topology-v1' as const,
    runner: 'gennady-test-topology' as const,
    source: 'detected:package.json#scripts.test+scripts/test-topology.ts',
  };
  assert.deepEqual(
    parseVerifyTestStats(
      policy,
      '[test-topology] local: 3 files\n' +
        '[gennady-test-topology-stats] {"executed":12,"passed":10,"failed":1,"skipped":1}\n',
      ''
    ),
    {
      schema: 'gennady.verify-test-stats.v1',
      ...policy,
      executed: 12,
      passed: 10,
      failed: 1,
      skipped: 1,
    }
  );
  assert.equal(
    parseVerifyTestStats(
      policy,
      '[gennady-test-topology-stats] {"executed":2,"passed":2,"failed":0,"skipped":0}\n' +
        '[gennady-test-topology-stats] {"executed":2,"passed":2,"failed":0,"skipped":0}\n',
      ''
    ),
    null
  );
});

it('normalizes Go JSON and Swift/XCTest summaries without deriving counts from exit status', () => {
  const go = parseVerifyTestStats(
    {
      policy: 'required',
      protocol: 'go-test-json-v1',
      runner: 'go-test',
      source: 'builtin:golang',
    },
    [
      '{"Action":"run","Package":"example/pkg","Test":"TestA"}',
      '{"Action":"pass","Package":"example/pkg","Test":"TestA"}',
      '{"Action":"skip","Package":"example/pkg","Test":"TestB"}',
    ].join('\n'),
    ''
  );
  assert.deepEqual(go, {
    schema: 'gennady.verify-test-stats.v1',
    policy: 'required',
    protocol: 'go-test-json-v1',
    runner: 'go-test',
    source: 'builtin:golang',
    executed: 2,
    passed: 1,
    failed: 0,
    skipped: 1,
  });

  const xctest = parseVerifyTestStats(
    {
      policy: 'required',
      protocol: 'xctest-summary-v1',
      runner: 'xcodebuild',
      source: 'builtin:swift',
    },
    "Test Case '-[AppTests testSkip]' skipped (0.0 seconds).\nExecuted 3 tests, with 1 failure (0 unexpected) in 0.1 seconds",
    ''
  );
  assert.deepEqual(xctest, {
    schema: 'gennady.verify-test-stats.v1',
    policy: 'required',
    protocol: 'xctest-summary-v1',
    runner: 'xcodebuild',
    source: 'builtin:swift',
    executed: 3,
    passed: 1,
    failed: 1,
    skipped: 1,
  });
  assert.equal(
    parseVerifyTestStats(
      {
        policy: 'required',
        protocol: 'swift-test-summary-v1',
        runner: 'swift-test',
        source: 'builtin:swift',
      },
      'process exited 0 without a runner summary',
      ''
    ),
    null
  );
});
