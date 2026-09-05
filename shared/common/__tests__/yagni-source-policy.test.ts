// @file: Unit tests for the shared YAGNI source-extension and test-territory policy.
// @consumers: node:test
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isYagniSourceFile, isYagniTestTerritory } from '../yagni-source-policy.ts';

describe('YAGNI source policy', () => {
  it('recognizes the closed exact/approximate adapter extension set', () => {
    for (const extension of [
      'ts',
      'tsx',
      'mts',
      'cts',
      'js',
      'jsx',
      'mjs',
      'cjs',
      'py',
      'go',
      'rb',
      'java',
    ]) {
      assert.strictEqual(isYagniSourceFile(`src/file.${extension}`), true, extension);
    }
    assert.strictEqual(isYagniSourceFile('src/file.swift'), false);
  });

  it('recognizes test territory for every supported language family without broad substrings', () => {
    for (const path of [
      'src/unit.test.ts',
      'src/unit.spec.mts',
      'src/unit_test.go',
      'tests/test_unit.py',
      'src/unit_test.py',
      'spec/unit_spec.rb',
      'src/UnitTest.java',
      'src/__tests__/helper.go',
    ]) {
      assert.strictEqual(isYagniTestTerritory(path), true, path);
    }
    for (const path of ['src/contest.py', 'src/testimonial.go', 'src/Testament.java']) {
      assert.strictEqual(isYagniTestTerritory(path), false, path);
    }
  });
});
