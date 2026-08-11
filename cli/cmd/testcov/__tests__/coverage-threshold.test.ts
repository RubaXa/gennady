// @file: Unit tests for coverage-threshold — the pure aggregation + comparison behind `testcov --min`.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLineCoverage, linePct, meetsMinCoverage } from '../coverage-threshold.ts';

describe('aggregateLineCoverage', () => {
  it('суммирует hit/total по нескольким корзинам', () => {
    const buckets = [
      { sH: 8, sT: 10 },
      { sH: 40, sT: 50 },
    ];
    assert.deepStrictEqual(aggregateLineCoverage(buckets), { hit: 48, total: 60 });
  });

  it('пустой список корзин → total=0', () => {
    assert.deepStrictEqual(aggregateLineCoverage([]), { hit: 0, total: 0 });
  });
});

describe('linePct', () => {
  it('вычисляет процент', () => {
    assert.strictEqual(linePct({ hit: 48, total: 60 }), 80);
  });

  it('total=0 → null (не 0%, не 100% — ничего не инструментировано)', () => {
    assert.strictEqual(linePct({ hit: 0, total: 0 }), null);
  });
});

describe('meetsMinCoverage', () => {
  it('покрытие выше порога → true', () => {
    assert.strictEqual(meetsMinCoverage({ hit: 90, total: 100 }, 80), true);
  });

  it('покрытие точно на пороге → true (>=, не >)', () => {
    assert.strictEqual(meetsMinCoverage({ hit: 80, total: 100 }, 80), true);
  });

  it('покрытие ниже порога → false', () => {
    assert.strictEqual(meetsMinCoverage({ hit: 79, total: 100 }, 80), false);
  });

  it('total=0 (ничего не инструментировано) → false, даже для порога 0', () => {
    assert.strictEqual(meetsMinCoverage({ hit: 0, total: 0 }, 0), false);
  });
});
