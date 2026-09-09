// @file: GAP-E-5 (D-46) both-way proof for verify-eval-docs.ts — the script that gates the unified
//   eval spec on "every command/path is real, zero [UNVERIFIED] markers left". Drives the real CLI as
//   a subprocess (same pattern as results-table.test.ts): a fixture doc with each kind of problem must
//   fail with a non-zero exit and name the problem; a clean fixture (including placeholder-only paths
//   that must NOT be false-flagged) must pass; and the real EVAL-SPEC.md/RUNBOOK.md in this checkout
//   must pass right now, proving the acceptance claim, not just the mechanism.
// @consumers: N/A (test file)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
      assert.match(stdout, /OK — 1 doc\(s\), 1 path\(s\) checked, 1 npm command\(s\) checked/);
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

  it('the real EVAL-SPEC.md and RUNBOOK.md in this checkout pass right now', async () => {
    const { code, stdout, stderr } = await runVerifier([]);
    assert.equal(code, 0, `${stdout}${stderr}`);
    assert.match(stdout, /0 \[UNVERIFIED\] markers/);
  });
});
