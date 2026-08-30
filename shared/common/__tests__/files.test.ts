// @file: Unit tests for the test-territory predicates every diff-scoped gate relies on.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isTestFile, isUnderTestDirectory } from '../files.ts';

describe('isTestFile', () => {
  it('matches the .test./.spec. naming, in any directory', () => {
    assert.strictEqual(isTestFile('cli/cmd/foo/foo.test.ts'), true);
    assert.strictEqual(isTestFile('shared/sdd/readiness.spec.ts'), true);
    assert.strictEqual(isTestFile('cli/cmd/foo/foo.ts'), false);
  });

  it('does not match a helper that merely lives beside tests', () => {
    assert.strictEqual(isTestFile('cli/__tests__/tool-behavior/fixture.ts'), false);
  });

  it('matches helpers whose filename explicitly declares test-only ownership', () => {
    assert.strictEqual(isTestFile('cli/cmd/foo/foo.test-helper.ts'), true);
    assert.strictEqual(isTestFile('shared/sdd/readiness.spec-helpers.ts'), true);
    assert.strictEqual(isTestFile('cli/cmd/foo/contest-helper.ts'), false);
  });
});

describe('isUnderTestDirectory', () => {
  it('matches the three test-territory directory names at any depth', () => {
    assert.strictEqual(isUnderTestDirectory('cli/__tests__/tool-behavior/fixture.ts'), true);
    assert.strictEqual(isUnderTestDirectory('shared/sdd/__mocks__/clock.ts'), true);
    assert.strictEqual(isUnderTestDirectory('services/dbc/__fixtures__/sample.ts'), true);
  });

  it('leaves production paths alone, including near-miss names', () => {
    assert.strictEqual(isUnderTestDirectory('cli/cmd/foo/foo.ts'), false);
    assert.strictEqual(isUnderTestDirectory('cli/tests/foo.ts'), false);
    assert.strictEqual(isUnderTestDirectory('cli/__testsuite__/foo.ts'), false);
  });
});
