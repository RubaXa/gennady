// @file: Deterministic contract for the eval sandbox prepare/clean script (node fs, not shell rm).
// @consumers: ai/flow-eval/scripts/sandbox.mjs
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'sandbox.ts');

// Run the script (via tsx) with an ISOLATED TMPDIR so clean never touches real, in-flight sandboxes.
function run(iso: string, args: string[]): { code: number; out: string } {
  const res = spawnSync('node', ['--import', 'tsx', SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: iso },
  });
  return { code: res.status ?? 1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

function isoRoot(): string {
  return mkdtempSync(join(tmpdir(), 'sandbox-iso-'));
}

describe('eval sandbox script (deterministic prepare/clean)', () => {
  it('prepare creates a fresh sandbox root under TMPDIR', () => {
    const iso = isoRoot();
    const { code, out } = run(iso, ['prepare']);
    assert.strictEqual(code, 0);
    const path = out.trim();
    assert.ok(path.startsWith(join(iso, 'sdd-flow-eval-root.')), `unexpected path: ${path}`);
    assert.ok(existsSync(path), 'prepared dir must exist');
  });

  it('clean --dry lists sandbox roots but removes nothing', () => {
    const iso = isoRoot();
    const victim = join(iso, 'sdd-flow-eval-root.aaa');
    mkdirSync(victim);
    // --root pins the sweep to the isolated dir so the test never touches the machine's real temp dirs.
    const { code, out } = run(iso, ['clean', '--dry', '--root', iso]);
    assert.strictEqual(code, 0);
    assert.match(out, /would remove/);
    assert.ok(existsSync(victim), 'dry run must not delete');
  });

  it('clean removes sandbox roots (recursive)', () => {
    const iso = isoRoot();
    const victim = join(iso, 'diag-recover.bbb');
    mkdirSync(join(victim, 'nested'), { recursive: true });
    const { code } = run(iso, ['clean', '--root', iso]);
    assert.strictEqual(code, 0);
    assert.ok(!existsSync(victim), 'clean must remove the sandbox root and its contents');
  });

  it('clean removes hand-created gen-* roots (the prefix that once leaked to /private/tmp)', () => {
    const iso = isoRoot();
    const victim = join(iso, 'gen-h2-baseline-1.ccc');
    mkdirSync(join(victim, 'node_modules'), { recursive: true });
    const { code } = run(iso, ['clean', '--root', iso]);
    assert.strictEqual(code, 0);
    assert.ok(!existsSync(victim), 'clean must remove gen-* experiment roots');
  });

  it('clean sweeps multiple --root directories in one pass', () => {
    const isoA = isoRoot();
    const isoB = isoRoot();
    const victimA = join(isoA, 'sdd-flow-eval-root.a');
    const victimB = join(isoB, 'gen-b');
    mkdirSync(victimA);
    mkdirSync(victimB);
    const { code } = run(isoA, ['clean', '--root', isoA, '--root', isoB]);
    assert.strictEqual(code, 0);
    assert.ok(!existsSync(victimA), 'first root swept');
    assert.ok(!existsSync(victimB), 'second root swept');
  });

  it('clean never touches non-sandbox directories', () => {
    const iso = isoRoot();
    const keep = join(iso, 'unrelated-project');
    mkdirSync(keep);
    run(iso, ['clean', '--root', iso]);
    assert.ok(existsSync(keep), 'clean must not remove directories without a sandbox prefix');
  });

  it('rejects an unknown command with a nonzero exit', () => {
    const iso = isoRoot();
    const { code, out } = run(iso, ['frobnicate']);
    assert.notStrictEqual(code, 0);
    assert.match(out, /usage/);
  });
});
