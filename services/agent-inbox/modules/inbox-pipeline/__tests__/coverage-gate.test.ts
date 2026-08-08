// @file: Tests for CoverageGate — tool-trace checklist verification with partial-read predicate, exclusions, max continue=2
// @consumers: node:test runner
// @tasks: TSK-161

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { CoverageGate } from '../coverage-gate.ts';
import type { ToolTrace } from '../coverage-gate.ts';

function readEntry(file: string, extra: Partial<ToolTrace> = {}): ToolTrace {
  return { tool: 'read', file, ts: '2026-08-06T12:45:00Z', ...extra };
}

describe('CoverageGate', () => {
  it('all files read returns pass with empty missing list', () => {
    const trace = [
      readEntry('src/index.ts'),
      readEntry('src/utils.ts'),
      readEntry('tests/spec.test.ts'),
    ];
    const gate = new CoverageGate();
    const checklist = ['src/index.ts', 'src/utils.ts', 'tests/spec.test.ts'];

    const verdict = gate.check(checklist, trace);

    assert.strictEqual(verdict.status, 'pass');
    assert.strictEqual(verdict.missingFiles.length, 0);
    assert.strictEqual(verdict.continueCount, 0);
  });

  it('missing file returns fail with missing file list', () => {
    const trace = [readEntry('src/index.ts'), readEntry('src/utils.ts')];
    const gate = new CoverageGate();
    const checklist = ['src/index.ts', 'src/utils.ts', 'tests/missing.test.ts'];

    const verdict = gate.check(checklist, trace);

    assert.strictEqual(verdict.status, 'fail');
    assert.deepStrictEqual(verdict.missingFiles, ['tests/missing.test.ts']);
  });

  it('partial read detected from tool trace is reported as missing', () => {
    const trace = [
      readEntry('src/index.ts'),
      readEntry('src/helpers.ts', { offset: 0, limit: 20, fileSize: 100 }),
    ];
    const gate = new CoverageGate();
    const checklist = ['src/index.ts', 'src/helpers.ts'];

    const verdict = gate.check(checklist, trace);

    assert.strictEqual(verdict.status, 'fail');
    assert.deepStrictEqual(verdict.missingFiles, ['src/helpers.ts']);
  });

  it('deleted files are excluded from checklist', () => {
    const trace = [readEntry('src/index.ts')];
    const gate = new CoverageGate();
    const checklist = ['src/index.ts', 'src/obsolete.ts'];
    const deletedFiles = ['src/obsolete.ts'];

    const verdict = gate.check(checklist, trace, deletedFiles);

    assert.strictEqual(verdict.status, 'pass');
    assert.ok(verdict.excludedFiles.includes('src/obsolete.ts'));
    assert.strictEqual(verdict.missingFiles.length, 0);
  });

  it('binary files are excluded from checklist', () => {
    const trace = [readEntry('src/index.ts')];
    const gate = new CoverageGate();
    const checklist = ['src/index.ts', 'assets/logo.png', 'assets/icon.svg'];

    const verdict = gate.check(checklist, trace);

    assert.strictEqual(verdict.status, 'pass');
    assert.ok(verdict.excludedFiles.some((f) => f === 'assets/logo.png'));
    assert.ok(verdict.excludedFiles.some((f) => f === 'assets/icon.svg'));
  });

  it('max continue equals 2: first continue ok, second continue last chance, third throws escalation', () => {
    const trace = [readEntry('src/index.ts')];
    const gate = new CoverageGate();
    const checklist = ['src/index.ts', 'src/utils.ts'];

    // first continue — ok (continueCount becomes 1)
    const verdict1 = gate.continueCheck(checklist, trace);
    assert.strictEqual(verdict1.status, 'fail');
    assert.strictEqual(verdict1.continueCount, 1);

    // second continue — ok, last chance (continueCount becomes 2)
    const updatedTrace = [readEntry('src/index.ts'), readEntry('src/utils.ts')];
    const verdict2 = gate.continueCheck(checklist, updatedTrace);
    assert.strictEqual(verdict2.status, 'pass');
    assert.strictEqual(verdict2.continueCount, 2);

    // third continue — escalation (continueCount becomes 3, exceeds max)
    assert.throws(
      () => gate.continueCheck(checklist, updatedTrace),
      (err: Error) => {
        assert.match(err.message, /Max continue attempts/);
        return true;
      }
    );
  });

  it('continues the same worker twice, then escalates when its trace still misses coverage', async () => {
    const gate = new CoverageGate();
    const sessions: Array<{ missing: string[]; attempt: number }> = [];

    await assert.rejects(
      () =>
        gate.recoverWithContinue(['src/index.ts'], [], async (missing, attempt) => {
          sessions.push({ missing, attempt });
          return [];
        }),
      /after 2 same-session continues/
    );
    assert.deepStrictEqual(sessions, [
      { missing: ['src/index.ts'], attempt: 1 },
      { missing: ['src/index.ts'], attempt: 2 },
    ]);
  });

  it('passes after a same-session continuation contributes the missing factual read', async () => {
    const gate = new CoverageGate();
    const verdict = await gate.recoverWithContinue(
      ['src/index.ts', 'src/utils.ts'],
      [readEntry('src/index.ts')],
      async (missing, attempt) => {
        assert.deepStrictEqual(missing, ['src/utils.ts']);
        assert.strictEqual(attempt, 1);
        return [readEntry('src/index.ts'), readEntry('src/utils.ts')];
      }
    );
    assert.strictEqual(verdict.status, 'pass');
    assert.strictEqual(verdict.continueCount, 1);
  });

  it('empty checklist returns pass with nothing to check', () => {
    const trace: ToolTrace[] = [];
    const gate = new CoverageGate();

    const verdict = gate.check([], trace);

    assert.strictEqual(verdict.status, 'pass');
    assert.strictEqual(verdict.missingFiles.length, 0);
    assert.strictEqual(verdict.excludedFiles.length, 0);
  });
});
