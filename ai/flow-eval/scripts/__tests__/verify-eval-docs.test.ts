// @file: GAP-E-5 (D-46) both-way proof for verify-eval-docs.ts — the script that gates every doc
//   under ai/flow-eval/docs/** on "every command/path/link is real, zero [UNVERIFIED] markers left".
//   Drives the real CLI as a subprocess (same pattern as results-table.test.ts): a fixture doc with
//   each kind of problem must fail with a non-zero exit and name the problem; a clean fixture
//   (including placeholder-only paths that must NOT be false-flagged) must pass; and the real docs in
//   this checkout must pass right now, proving the acceptance claim, not just the mechanism.
// @consumers: N/A (test file)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = resolve(import.meta.dirname, '../../../..');
const SCRIPT = resolve(PROJECT_ROOT, 'ai/flow-eval/scripts/verify-eval-docs.ts');

type RunResult = { stdout: string; stderr: string; code: number };

async function runVerifier(args: readonly string[]): Promise<RunResult> {
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

/** @purpose A throwaway fake repo root: package.json with one real script + one real file, so
 *  fixture docs can reference genuinely-existing paths/commands alongside the ones under test. */
function fakeRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'verify-eval-docs-'));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ scripts: { 'real-script': 'echo hi' } }, null, 2)
  );
  mkdirSync(join(root, 'ai', 'flow-eval'), { recursive: true });
  writeFileSync(join(root, 'ai', 'flow-eval', 'real-file.ts'), '// real\n');
  return root;
}

function fixtureDoc(root: string, name: string, content: string): string {
  const file = join(root, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return name;
}

describe('GAP-E-5: verify-eval-docs.ts (both-way, real subprocess)', () => {
  it('fails when an [UNVERIFIED] marker remains', async () => {
    const root = fakeRepoRoot();
    try {
      const doc = fixtureDoc(root, 'DOC.md', 'Some claim. [UNVERIFIED] this needs checking.\n');
      const { code, stderr } = await runVerifier(['--root', root, doc]);
      assert.notEqual(code, 0);
      assert.match(stderr, /1 \[UNVERIFIED\] marker/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when an inline-code path does not exist in the checkout', async () => {
    const root = fakeRepoRoot();
    try {
      const doc = fixtureDoc(root, 'DOC.md', 'Run `ai/flow-eval/does-not-exist.ts` to see it.\n');
      const { code, stderr } = await runVerifier(['--root', root, doc]);
      assert.notEqual(code, 0);
      assert.match(stderr, /does not exist: `ai\/flow-eval\/does-not-exist\.ts`/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when `npm run <script>` names a script missing from package.json', async () => {
    const root = fakeRepoRoot();
    try {
      const doc = fixtureDoc(root, 'DOC.md', 'First `npm run nonexistent-script`, then done.\n');
      const { code, stderr } = await runVerifier(['--root', root, doc]);
      assert.notEqual(code, 0);
      assert.match(stderr, /npm run nonexistent-script — no such script/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes on a real path + a real npm command + zero markers', async () => {
    const root = fakeRepoRoot();
    try {
      const doc = fixtureDoc(
        root,
        'DOC.md',
        'See `ai/flow-eval/real-file.ts` and run `npm run real-script`.\n'
      );
      const { code, stdout } = await runVerifier(['--root', root, doc]);
      assert.equal(code, 0, stdout);
      assert.match(
        stdout,
        /OK — 1 doc\(s\), 1 path\(s\) checked, 0 link\(s\) checked, 1 npm command\(s\) checked/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when a markdown link target does not exist in the checkout (C-2 regression)', async () => {
    const root = fakeRepoRoot();
    try {
      const doc = fixtureDoc(
        root,
        'DOC.md',
        'See the [`PROGRESS-REPORT.md`](./PROGRESS-REPORT.md) for the long version.\n'
      );
      const { code, stderr } = await runVerifier(['--root', root, doc]);
      assert.notEqual(code, 0);
      assert.match(stderr, /link target does not exist: \(\.\/PROGRESS-REPORT\.md\)/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes a markdown link that resolves relative to the doc, anchor and all', async () => {
    const root = fakeRepoRoot();
    try {
      fixtureDoc(root, 'RUNBOOK.md', '# runbook\n');
      const doc = fixtureDoc(
        root,
        'DOC.md',
        'See [the runbook](./RUNBOOK.md#some-heading) for setup.\n'
      );
      const { code, stdout } = await runVerifier(['--root', root, doc]);
      assert.equal(code, 0, stdout);
      assert.match(stdout, /1 link\(s\) checked/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('never flags a link that is a same-page anchor or an external/mailto URL', async () => {
    const root = fakeRepoRoot();
    try {
      const doc = fixtureDoc(
        root,
        'DOC.md',
        [
          'See [above](#some-anchor) and [the site](https://example.com/x) and',
          '[support](mailto:support@example.com).',
          '',
        ].join('\n')
      );
      const { code, stdout } = await runVerifier(['--root', root, doc]);
      assert.equal(code, 0, stdout);
      assert.match(stdout, /0 link\(s\) checked/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('never false-flags placeholder/live-only spans: sandbox paths, shell vars, ~, URLs', async () => {
    const root = fakeRepoRoot();
    try {
      const doc = fixtureDoc(
        root,
        'DOC.md',
        [
          'Sandbox path `<sandbox>/specs/README.md` is not a real repo path.',
          'Neither is `$RT/golden/check.sh` or `~/Developer/<repo>`.',
          'Nor a transient run dir `.results/run-<ISO>/summary.json`.',
          'Nor a URL `https://download.swift.org/swift-6.2.pkg`.',
          'A bare flag value like `4097` or `v2` is not a path either.',
          'Nor a worker-sandbox fixture path `bin/log-summary.sh` or `golden/verify.sh`,',
          'nor a script inside an external checkout `Tools/check-swiftlint-exceptions.sh`.',
          '',
        ].join('\n')
      );
      const { code, stdout } = await runVerifier(['--root', root, doc]);
      assert.equal(code, 0, stdout);
      assert.match(stdout, /0 path\(s\) checked/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('strips a trailing `:line` reference before checking a backtick path exists', async () => {
    const root = fakeRepoRoot();
    try {
      const doc = fixtureDoc(
        root,
        'DOC.md',
        'See `ai/flow-eval/real-file.ts:15` and the range `ai/flow-eval/real-file.ts:15-20`.\n'
      );
      const { code, stdout } = await runVerifier(['--root', root, doc]);
      assert.equal(code, 0, stdout);
      assert.match(stdout, /2 path\(s\) checked/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('still fails a `:line` reference whose underlying file does not exist', async () => {
    const root = fakeRepoRoot();
    try {
      const doc = fixtureDoc(root, 'DOC.md', 'See `ai/flow-eval/missing-file.ts:15`.\n');
      const { code, stderr } = await runVerifier(['--root', root, doc]);
      assert.notEqual(code, 0);
      assert.match(stderr, /path does not exist: `ai\/flow-eval\/missing-file\.ts:15`/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('with no FILE args, discovers every .md under ai/flow-eval/docs/ recursively (not just two names)', async () => {
    const root = fakeRepoRoot();
    try {
      fixtureDoc(root, 'ai/flow-eval/docs/EVAL-SPEC.md', '# spec\n');
      fixtureDoc(root, 'ai/flow-eval/docs/RUNBOOK.md', '# runbook\n');
      fixtureDoc(
        root,
        'ai/flow-eval/docs/journal/RESULTS.md',
        'Dangling: [`GONE.md`](./GONE.md)\n'
      );
      const { code, stderr } = await runVerifier(['--root', root]);
      // The nested journal/RESULTS.md must have been picked up by default (not just the two
      // top-level docs) — its dangling link is what proves it was actually checked, not skipped.
      assert.notEqual(code, 0);
      assert.match(stderr, /journal\/RESULTS\.md.*link target does not exist/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the real docs under ai/flow-eval/docs/ (all of them, not just EVAL-SPEC/RUNBOOK) pass right now', async () => {
    const { code, stdout, stderr } = await runVerifier([]);
    assert.equal(code, 0, `${stdout}${stderr}`);
    assert.match(stdout, /0 \[UNVERIFIED\] markers/);
    // At least the two top-level docs (EVAL-SPEC/RUNBOOK) plus the journal/ docs this batch unified
    // (ledger/EXPERIMENTS-LOG/RESULTS) plus the docs a later upstream rebase (fix/sdd-check-v2-critic-rounds)
    // added on top (11-ANALYSIS-CHECKLIST.md, journal/guard-verification.md, journal/eval-history-gaps.md) —
    // the recursive discovery must pick up all of them, not a frozen count from this batch alone.
    assert.match(stdout, /OK — 8 doc\(s\)/);
    // Proves the new link-checking mechanism is actually exercised on the real corpus, not just
    // passing vacuously because nothing in it uses a markdown link.
    const linkCountMatch = stdout.match(/(\d+) link\(s\) checked/);
    assert.ok(linkCountMatch, stdout);
    assert.ok(Number(linkCountMatch![1]) > 0, 'expected at least one real markdown link checked');
  });
});
