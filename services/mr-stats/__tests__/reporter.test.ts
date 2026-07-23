// @file: Unit tests for mr-stats reporter — composeReport, buildRealCodeCategory, empty category factories.
// @consumers: node:test runner
// @tasks: TSK-139

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptySimpleCategory,
  emptyRealCodeCategory,
  composeReport,
  buildRealCodeCategory,
} from '../reporter.ts';
import { CANONICAL_CATEGORY_ORDER } from '../mr-stats.types.ts';
import type { MrMetadata, EntityDelta, LineDiff, DuplicateReport } from '../mr-stats.types.ts';

const mockMetadata: MrMetadata = {
  iid: '!14',
  title: 'Test MR',
  project: 'mail/messenger',
  sourceBranch: 'feature/test',
  targetBranch: 'master',
  mergedAt: '2026-01-01T00:00:00Z',
  author: 'testuser',
};

const zeroLineDiff: LineDiff = { added: 0, removed: 0 };
const zeroEntityDelta: EntityDelta = { introduced: [], modified: [], removed: [] };
const zeroDuplicates: DuplicateReport = { clonesFound: 0, clonedLines: 0, percentage: 0 };

describe('reporter — empty category factories', () => {
  it('emptySimpleCategory produces all-zeros', () => {
    // contract: every field is zero — used as fallback for missing categories
    const cat = emptySimpleCategory();
    assert.deepStrictEqual(cat, { files: 0, added: 0, removed: 0 });
  });

  it('emptyRealCodeCategory produces all-zeros with extended fields', () => {
    // contract: every field including nested ones is zero
    const cat = emptyRealCodeCategory();
    assert.deepStrictEqual(cat, {
      files: 0,
      added: 0,
      removed: 0,
      commentLines: { added: 0, removed: 0 },
      codeLines: { added: 0, removed: 0 },
      blankLines: { added: 0, removed: 0 },
      entities: { introduced: 0, modified: 0, removed: 0 },
      duplicates: { clonesFound: 0, clonedLines: 0, percentage: 0 },
    });
  });
});

describe('reporter — composeReport', () => {
  it('empty diff produces all-zeros categories', () => {
    // contract: BDD scenario "Пустой MR" — all 10 categories present with zeros
    // failure mode: missing category key breaks JSON contract downstream
    const report = composeReport(mockMetadata, {}, CANONICAL_CATEGORY_ORDER);

    assert.strictEqual(report.mr.iid, '!14');
    assert.strictEqual(report.mr.title, 'Test MR');
    assert.strictEqual(report.mr.project, 'mail/messenger');

    const keys = Object.keys(report.categories);
    assert.strictEqual(keys.length, 10);

    for (const name of CANONICAL_CATEGORY_ORDER) {
      assert.ok(name in report.categories, `category ${name} missing`);
      assert.deepStrictEqual(report.categories[name], { files: 0, added: 0, removed: 0 });
    }
  });

  it('fills missing categories with emptySimpleCategory', () => {
    // contract: categories not provided are filled with zeroed defaults
    const partial: Record<string, typeof emptySimpleCategory extends () => infer R ? R : never> = {
      realCode: buildRealCodeCategory(
        3,
        10,
        2,
        zeroLineDiff,
        zeroLineDiff,
        zeroLineDiff,
        zeroEntityDelta,
        zeroDuplicates
      ),
    };
    const report = composeReport(mockMetadata, partial, CANONICAL_CATEGORY_ORDER);

    assert.strictEqual(report.categories.realCode.files, 3);
    assert.strictEqual(report.categories.configs.files, 0);
    assert.strictEqual(Object.keys(report.categories).length, 10);
  });

  it('preserves canonical category order in output keys', () => {
    // contract: JSON output MUST follow CANONICAL_CATEGORY_ORDER
    const report = composeReport(mockMetadata, {}, CANONICAL_CATEGORY_ORDER);
    const keys = Object.keys(report.categories);

    assert.deepStrictEqual(keys, [...CANONICAL_CATEGORY_ORDER]);
  });

  it('preserves provided categories when all present', () => {
    // contract: existing category data is not overwritten by defaults
    const provided: Record<string, ReturnType<typeof emptySimpleCategory>> = {};
    for (let i = 0; i < CANONICAL_CATEGORY_ORDER.length; i += 1) {
      const name = CANONICAL_CATEGORY_ORDER[i];
      provided[name] = { files: i, added: i * 2, removed: i };
    }

    const report = composeReport(mockMetadata, provided, CANONICAL_CATEGORY_ORDER);

    for (let i = 0; i < CANONICAL_CATEGORY_ORDER.length; i += 1) {
      const name = CANONICAL_CATEGORY_ORDER[i];
      assert.deepStrictEqual(report.categories[name], { files: i, added: i * 2, removed: i });
    }
  });
});

describe('reporter — buildRealCodeCategory', () => {
  it('aggregates file count and line counts from numstat', () => {
    const cat = buildRealCodeCategory(
      5,
      42,
      10,
      { added: 30, removed: 5 },
      { added: 10, removed: 2 },
      { added: 2, removed: 3 },
      { introduced: [{ file: 'a.ts', symbol: 'foo' }], modified: [], removed: [] },
      { clonesFound: 2, clonedLines: 100, percentage: 5.5 }
    );

    assert.strictEqual(cat.files, 5);
    assert.strictEqual(cat.added, 42);
    assert.strictEqual(cat.removed, 10);
    assert.deepStrictEqual(cat.codeLines, { added: 30, removed: 5 });
    assert.deepStrictEqual(cat.commentLines, { added: 10, removed: 2 });
    assert.deepStrictEqual(cat.blankLines, { added: 2, removed: 3 });
  });

  it('maps entity delta lengths to counts', () => {
    const delta: EntityDelta = {
      introduced: [
        { file: 'a.ts', symbol: 'newFn' },
        { file: 'a.ts', symbol: 'NewClass' },
      ],
      modified: [{ file: 'b.ts', symbol: 'oldFn' }],
      removed: [
        { file: 'c.ts', symbol: 'deadFn' },
        { file: 'c.ts', symbol: 'UnusedType' },
        { file: 'c.ts', symbol: 'OldConst' },
      ],
    };

    const cat = buildRealCodeCategory(
      3,
      0,
      0,
      zeroLineDiff,
      zeroLineDiff,
      zeroLineDiff,
      delta,
      zeroDuplicates
    );

    assert.strictEqual(cat.entities.introduced, 2);
    assert.strictEqual(cat.entities.modified, 1);
    assert.strictEqual(cat.entities.removed, 3);
  });

  it('maps duplicate report fields directly', () => {
    const dup: DuplicateReport = { clonesFound: 7, clonedLines: 350, percentage: 12.3 };

    const cat = buildRealCodeCategory(
      1,
      0,
      0,
      zeroLineDiff,
      zeroLineDiff,
      zeroLineDiff,
      zeroEntityDelta,
      dup
    );

    assert.deepStrictEqual(cat.duplicates, { clonesFound: 7, clonedLines: 350, percentage: 12.3 });
  });
});
