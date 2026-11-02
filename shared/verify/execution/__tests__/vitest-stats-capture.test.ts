// @file: Adversarial stream grammar and counter provenance controls for bounded Vitest statistics.
// @spec: CLI-VERIFY
// @consumers: VitestStatsCapture

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VitestStatsCapture } from '../vitest-stats-capture.ts';
import { parseVerifyTestStats } from '../../test-stats.ts';

const counters = {
  numTotalTests: 4,
  numPassedTests: 2,
  numFailedTests: 1,
  numPendingTests: 1,
  numTodoTests: 0,
};
function capture(source: string, chunk = 17) {
  const stream = new VitestStatsCapture();
  const data = Buffer.from(source);
  for (let i = 0; i < data.length; i += chunk) stream.write(data.subarray(i, i + chunk));
  return stream.finish();
}

test('chunk boundaries inside UTF8, escapes and nested payload preserve only root counters', () => {
  const source =
    '> test\n' +
    JSON.stringify({ ...counters, text: 'é\\"\n🙂', testResults: [{ numPassedTests: 9999 }] });
  for (const size of [1, 2, 3, 17, 4096])
    assert.deepEqual(JSON.parse(capture(source, size)!), counters);
});

for (const [name, source] of [
  ['trailing garbage', JSON.stringify(counters) + 'garbage'],
  ['second object', JSON.stringify(counters) + JSON.stringify(counters)],
  ['nested counters only', JSON.stringify({ testResults: [counters] })],
  ['wrong type', JSON.stringify({ ...counters, numPassedTests: '2' })],
  ['negative', JSON.stringify({ ...counters, numPassedTests: -1 })],
  ['unsafe number', JSON.stringify({ ...counters, numPassedTests: Number.MAX_SAFE_INTEGER + 1 })],
  ['duplicate', JSON.stringify(counters).slice(0, -1) + ',"numPassedTests":2}'],
  ['escaped duplicate', JSON.stringify(counters).slice(0, -1) + ',"numPassed\\u0054ests":2}'],
  ['trailing comma', JSON.stringify(counters).slice(0, -1) + ',"testResults":[1,]}'],
  ['mismatched close', JSON.stringify(counters).slice(0, -1) + ',"testResults":[1}}'],
  ['missing colon', JSON.stringify(counters).slice(0, -1) + ',"extra" true}'],
  ['incomplete escape', JSON.stringify(counters).slice(0, -1) + ',"extra":"\\u0'],
  ['invalid escape', JSON.stringify(counters).slice(0, -1) + ',"extra":"\\x"}'],
  [
    'excess depth',
    JSON.stringify(counters).slice(0, -1) +
      ',"extra":' +
      '['.repeat(129) +
      '0' +
      ']'.repeat(129) +
      '}',
  ],
] as const)
  test(`rejects ${name} without manufacturing partial counters`, () =>
    assert.equal(capture(source, 1), null));

test('unknown long strings and keys are streamed without changing normalized totals', () => {
  assert.deepEqual(
    JSON.parse(
      capture(JSON.stringify({ ...counters, ['k'.repeat(1000)]: 'x'.repeat(2_000_000) }))!
    ),
    counters
  );
});

test('existing protocol parser still rejects incoherent sums after streaming', () => {
  const compact = capture(JSON.stringify({ ...counters, numTotalTests: 99 }))!;
  assert.equal(
    parseVerifyTestStats(
      { policy: 'required', protocol: 'vitest-json-v1', runner: 'vitest', source: 'test' },
      compact,
      ''
    ),
    null
  );
});
