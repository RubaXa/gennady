// @file: Shared source registry, test naming, and language evidence-level tests.
// @spec: SHARED
// @consumers: N/A

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSddSourceFile, isSddTestFile, sourceEvidenceLevel } from '../source-extensions.ts';

describe('SDD source extensions', () => {
  it('recognizes Swift production and test fixtures through one registry', () => {
    assert.strictEqual(isSddSourceFile('Sources/Foo.swift'), true);
    assert.strictEqual(isSddSourceFile('Tests/FooTests.swift'), true);
    assert.strictEqual(isSddTestFile('Sources/Foo.swift'), false);
    assert.strictEqual(isSddTestFile('Tests/FooTests.swift'), true);
  });

  it('publishes exact evidence only for ts/tsx and approximate evidence for other languages', () => {
    assert.strictEqual(sourceEvidenceLevel('src/a.ts'), 'exact');
    assert.strictEqual(sourceEvidenceLevel('src/a.tsx'), 'exact');
    for (const path of ['src/a.js', 'src/a.go', 'src/a.swift', 'src/a.mm', 'src/a.kt']) {
      assert.strictEqual(sourceEvidenceLevel(path), 'approximate', path);
    }
    assert.strictEqual(sourceEvidenceLevel('README.md'), null);
  });

  it('rejects unsupported lookalikes instead of inferring from basename substrings', () => {
    assert.strictEqual(isSddSourceFile('Foo.swift.md'), false);
    assert.strictEqual(isSddTestFile('Contest.swift'), false);
    assert.strictEqual(isSddTestFile('Testament.java'), false);
  });
});
