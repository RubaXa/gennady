// @file: Tests for CoverageGate — tool-trace checklist verification with partial-read predicate, exclusions, max continue=2
// @consumers: node:test runner
// @tasks: TSK-161

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CoverageGate } from '../coverage-gate.ts';
import type { CoverageVerdict } from '../coverage-gate.ts';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'coverage-gate-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeTrace(lines: string[]): string {
  const path = join(tmpDir, 'tool-trace.jsonl');
  writeFileSync(path, lines.join('\n') + '\n', 'utf8');
  return path;
}

function readEntry(file: string): string {
  return JSON.stringify({ tool: 'read', file, ts: '2026-08-06T12:45:00Z' });
}

describe('CoverageGate', () => {
  it('all files read returns pass with empty missing list', () => {
    const tracePath = writeTrace([
      readEntry('src/index.ts'),
      readEntry('src/utils.ts'),
      readEntry('tests/spec.test.ts'),
    ]);
    const gate = new CoverageGate();
    const checklist = ['src/index.ts', 'src/utils.ts', 'tests/spec.test.ts'];

    const verdict = gate.check(checklist, tracePath);

    assert.strictEqual(verdict.status, 'pass');
    assert.strictEqual(verdict.missingFiles.length, 0);
    assert.strictEqual(verdict.continueCount, 0);
  });

  it('missing file returns fail with missing file list', () => {
    const tracePath = writeTrace([
      readEntry('src/index.ts'),
      readEntry('src/utils.ts'),
    ]);
    const gate = new CoverageGate();
    const checklist = ['src/index.ts', 'src/utils.ts', 'tests/missing.test.ts'];

    const verdict = gate.check(checklist, tracePath);

    assert.strictEqual(verdict.status, 'fail');
    assert.deepStrictEqual(verdict.missingFiles, ['tests/missing.test.ts']);
  });

  it('partial read detected from tool trace is reported as missing', () => {
    // contract: a file absent from tool-trace is missing — not partially read
    const tracePath = writeTrace([readEntry('src/index.ts')]);
    const gate = new CoverageGate();
    const checklist = ['src/index.ts', 'src/helpers.ts'];

    const verdict = gate.check(checklist, tracePath);

    assert.strictEqual(verdict.status, 'fail');
    assert.deepStrictEqual(verdict.missingFiles, ['src/helpers.ts']);
  });

  it('deleted files are excluded from checklist', () => {
    const tracePath = writeTrace([readEntry('src/index.ts')]);
    const gate = new CoverageGate();
    const checklist = ['src/index.ts', 'src/obsolete.ts'];
    const deletedFiles = ['src/obsolete.ts'];

    const verdict = gate.check(checklist, tracePath, deletedFiles);

    assert.strictEqual(verdict.status, 'pass');
    assert.ok(verdict.excludedFiles.includes('src/obsolete.ts'));
    assert.strictEqual(verdict.missingFiles.length, 0);
  });

  it('binary files are excluded from checklist', () => {
    const tracePath = writeTrace([readEntry('src/index.ts')]);
    const gate = new CoverageGate();
    const checklist = ['src/index.ts', 'assets/logo.png', 'assets/icon.svg'];

    const verdict = gate.check(checklist, tracePath);

    assert.strictEqual(verdict.status, 'pass');
    assert.ok(verdict.excludedFiles.some((f) => f === 'assets/logo.png'));
    assert.ok(verdict.excludedFiles.some((f) => f === 'assets/icon.svg'));
  });

  it('max continue equals 2: first continue ok, second continue last chance, third throws escalation', () => {
    const tracePath = writeTrace([readEntry('src/index.ts')]);
    const gate = new CoverageGate();
    const checklist = ['src/index.ts', 'src/utils.ts'];

    // first continue — ok (continueCount becomes 1)
    const verdict1 = gate.continueCheck(checklist, tracePath);
    assert.strictEqual(verdict1.status, 'fail');
    assert.strictEqual(verdict1.continueCount, 1);

    // second continue — ok, last chance (continueCount becomes 2)
    const updatedTrace = writeTrace([
      readEntry('src/index.ts'),
      readEntry('src/utils.ts'),
    ]);
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

  it('empty checklist returns pass with nothing to check', () => {
    const tracePath = writeTrace([]);
    const gate = new CoverageGate();

    const verdict = gate.check([], tracePath);

    assert.strictEqual(verdict.status, 'pass');
    assert.strictEqual(verdict.missingFiles.length, 0);
    assert.strictEqual(verdict.excludedFiles.length, 0);
  });
});
