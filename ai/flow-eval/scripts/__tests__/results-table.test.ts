// @file: Both-outcomes proof for results-table.ts (GAP-E-6, D-62) — proves the generator against
//   FROZEN FAKE summary.json fixtures (no live LLM run): the expected table comes out, changing a
//   number changes the table (both-way), and docs/journal/RESULTS.md — the real, committed file —
//   is currently up to date with what the generator would produce (the freshness gate a CI step or
//   pre-push hook can call as `npm run results:table:check`).
//
//   results-table.ts exports nothing (renderGeneratedBlock/spliceGeneratedBlock are private, single
//   in-file use — see the file's own comments): this test drives the real CLI entrypoint as a
//   subprocess (`node --import tsx results-table.ts --results-dir DIR --out FILE [--check]`), the
//   same way `npm run results:table[:check]` does, instead of importing internals.
// @consumers: N/A (test file)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { persistDurableResult, type SddEvalDurableSummary } from '../../results-archive.ts';

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = resolve(import.meta.dirname, '../../../..');
const SCRIPT = resolve(PROJECT_ROOT, 'ai/flow-eval/scripts/results-table.ts');
const RESULTS_MD = resolve(PROJECT_ROOT, 'ai/flow-eval/docs/journal/RESULTS.md');
const DEFAULT_RESULTS_DIR = resolve(PROJECT_ROOT, 'ai/flow-eval/results');

const BEGIN_MARKER = '<!-- GAP-E-6:GENERATED:BEGIN — do not hand-edit; run `results:table` -->';
const END_MARKER = '<!-- GAP-E-6:GENERATED:END -->';
const EMPTY_DOC = `${BEGIN_MARKER}\n${END_MARKER}\n`;

type RunResult = { stdout: string; stderr: string; code: number };

/** @purpose Invoke the real script as a subprocess — the same command `npm run results:table[:check]`
 *  runs — and capture its exit code instead of letting a non-zero code throw past the test. */
async function runResultsTable(args: readonly string[]): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', SCRIPT, ...args],
      { cwd: PROJECT_ROOT }
    );
    return { stdout, stderr, code: 0 };
  } catch (cause) {
    const err = cause as { stdout?: string; stderr?: string; code?: number };
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.code ?? 1 };
  }
}

function fakeSummary(overrides: Partial<SddEvalDurableSummary> = {}): SddEvalDurableSummary {
  return {
    scenarioId: 'fibonacci-library',
    date: '2026-09-08',
    timestamp: '2026-09-08T10:00:00.000Z',
    sha: 'deadbeef',
    model: { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' },
    judgeModel: { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' },
    budget: {
      concurrency: 1,
      maxObservations: 40,
      observeEveryMs: 90000,
      stuckAfter: 4,
      tailLimit: 8,
    },
    verdict: 'pass',
    status: 'completed',
    outcome: 'pass',
    actions: 74,
    durationMs: 15 * 60_000,
    usage: { total: 191000 },
    quality: { rule: 'R1', pass: true, detail: 'ok' },
    hasJudge: true,
    specFiles: [],
    ...overrides,
  };
}

function tempResultsDir(): string {
  return mkdtempSync(join(tmpdir(), 'results-table-'));
}

/** @purpose A throwaway target file the script can read/splice/write, seeded with `initialContent`. */
function tempOutFile(initialContent: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'results-table-out-'));
  const file = join(dir, 'OUT.md');
  writeFileSync(file, initialContent, 'utf8');
  return file;
}

function cleanupOutFile(file: string): void {
  rmSync(dirname(file), { recursive: true, force: true });
}

describe('GAP-E-6: results-table.ts generator (both-way, frozen fixtures, no live run, real subprocess)', () => {
  it('a single scenario with one run renders its exact numbers', async () => {
    const root = tempResultsDir();
    const outFile = tempOutFile(EMPTY_DOC);
    try {
      await persistDurableResult(root, fakeSummary());
      const { code, stderr } = await runResultsTable(['--results-dir', root, '--out', outFile]);
      assert.equal(code, 0, stderr);
      const written = await readFile(outFile, 'utf8');
      assert.match(written, /`fibonacci-library`/);
      assert.match(
        written,
        /\| `fibonacci-library` \| 1 \| 74 \| ~15 мин \| ~191 000 \| Проходит \(1\/1\) \|/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      cleanupOutFile(outFile);
    }
  });

  it('changing a number in the frozen summary.json changes the rendered table (both-way)', async () => {
    const rootA = tempResultsDir();
    const rootB = tempResultsDir();
    const outA = tempOutFile(EMPTY_DOC);
    const outB = tempOutFile(EMPTY_DOC);
    try {
      await persistDurableResult(rootA, fakeSummary({ actions: 74 }));
      await persistDurableResult(rootB, fakeSummary({ actions: 200 }));
      const runA = await runResultsTable(['--results-dir', rootA, '--out', outA]);
      const runB = await runResultsTable(['--results-dir', rootB, '--out', outB]);
      assert.equal(runA.code, 0, runA.stderr);
      assert.equal(runB.code, 0, runB.stderr);
      const blockA = await readFile(outA, 'utf8');
      const blockB = await readFile(outB, 'utf8');
      assert.notEqual(blockA, blockB, 'a different actions count must produce a different table');
      assert.match(blockA, /\| 74 \|/);
      assert.match(blockB, /\| 200 \|/);
    } finally {
      rmSync(rootA, { recursive: true, force: true });
      rmSync(rootB, { recursive: true, force: true });
      cleanupOutFile(outA);
      cleanupOutFile(outB);
    }
  });

  it('two runs of the same scenario report count=2 and the median of the two', async () => {
    const root = tempResultsDir();
    const outFile = tempOutFile(EMPTY_DOC);
    try {
      await persistDurableResult(root, fakeSummary({ actions: 60, durationMs: 10 * 60_000 }));
      await persistDurableResult(root, fakeSummary({ actions: 80, durationMs: 20 * 60_000 }));
      const { code, stderr } = await runResultsTable(['--results-dir', root, '--out', outFile]);
      assert.equal(code, 0, stderr);
      const written = await readFile(outFile, 'utf8');
      // median of [60, 80] = 70; median of [10, 20] min = 15 min
      assert.match(written, /\| `fibonacci-library` \| 2 \| 70 \| ~15 мин \|/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      cleanupOutFile(outFile);
    }
  });

  it('a mixed pass/fail scenario reports the mechanical outcome split, never invented prose', async () => {
    const root = tempResultsDir();
    const outFile = tempOutFile(EMPTY_DOC);
    try {
      await persistDurableResult(root, fakeSummary({ outcome: 'pass' }));
      await persistDurableResult(root, fakeSummary({ outcome: 'fail', verdict: 'fail' }));
      const { code, stderr } = await runResultsTable(['--results-dir', root, '--out', outFile]);
      assert.equal(code, 0, stderr);
      const written = await readFile(outFile, 'utf8');
      assert.match(written, /Смешанно: pass 1\/2/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      cleanupOutFile(outFile);
    }
  });

  it('an empty results directory renders the "no results yet" placeholder, not a broken table', async () => {
    const root = tempResultsDir();
    const outFile = tempOutFile(EMPTY_DOC);
    try {
      const { code, stderr } = await runResultsTable(['--results-dir', root, '--out', outFile]);
      assert.equal(code, 0, stderr);
      const written = await readFile(outFile, 'utf8');
      assert.match(written, /Пока нет ни одного постоянного результата/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      cleanupOutFile(outFile);
    }
  });

  it('replaces ONLY the marked region, leaving surrounding hand-written text untouched', async () => {
    const root = tempResultsDir();
    const before = [
      '# Title',
      '',
      'intro prose',
      '',
      BEGIN_MARKER,
      'stale content',
      END_MARKER,
      '',
      '## Historical section (untouched)',
      'old data',
      '',
    ].join('\n');
    const outFile = tempOutFile(before);
    try {
      await persistDurableResult(root, fakeSummary());
      const { code, stderr } = await runResultsTable(['--results-dir', root, '--out', outFile]);
      assert.equal(code, 0, stderr);
      const next = await readFile(outFile, 'utf8');
      assert.match(next, /`fibonacci-library`/);
      assert.doesNotMatch(next, /stale content/);
      assert.match(next, /## Historical section \(untouched\)\nold data/);
      assert.match(next, /^# Title\n\nintro prose\n\n/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      cleanupOutFile(outFile);
    }
  });

  it('fails loud (non-zero exit, no write) when the markers are missing, never silently no-ops', async () => {
    const root = tempResultsDir();
    const outFile = tempOutFile('# no markers here\n');
    try {
      await persistDurableResult(root, fakeSummary());
      const { code, stderr } = await runResultsTable(['--results-dir', root, '--out', outFile]);
      assert.notEqual(code, 0);
      assert.match(stderr, /markers not found/);
      const untouched = await readFile(outFile, 'utf8');
      assert.equal(untouched, '# no markers here\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
      cleanupOutFile(outFile);
    }
  });
});

describe('GAP-E-6: docs/journal/RESULTS.md freshness (the real committed file, real committed results/)', () => {
  it('`--check` against the real results/ and RESULTS.md reports up to date (no diff, no write)', async () => {
    const before = await readFile(RESULTS_MD, 'utf8');
    const { code, stdout, stderr } = await runResultsTable([
      '--results-dir',
      DEFAULT_RESULTS_DIR,
      '--out',
      RESULTS_MD,
      '--check',
    ]);
    const after = await readFile(RESULTS_MD, 'utf8');
    assert.equal(after, before, '--check must never write');
    assert.equal(
      code,
      0,
      `RESULTS.md is stale — run \`npm run results:table\` and commit the result\n${stdout}${stderr}`
    );
    assert.match(stdout, /up to date/);
  });
});
