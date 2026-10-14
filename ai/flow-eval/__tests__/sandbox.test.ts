// @file: Deterministic contract for the eval sandbox prepare/clean script (node fs, not shell rm).
// @spec: AI-SKILLS
// @consumers: ai/flow-eval/scripts/sandbox.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'sandbox.ts');

// Run the script (via tsx) with an ISOLATED TMPDIR so clean never touches real, in-flight sandboxes.
function run(iso: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const res = spawnSync('node', ['--import', 'tsx', SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: iso },
  });
  return {
    code: res.status ?? 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}

function withIsoRoot(runTest: (iso: string) => void): void {
  const iso = mkdtempSync(join(tmpdir(), 'sandbox-iso-'));
  try {
    runTest(iso);
  } finally {
    // The prepared child lives below iso, so one guarded removal cleans both success and failure.
    rmSync(iso, { recursive: true, force: true });
  }
}

function dependencyStore(iso: string, name: string, leaseContents?: string): string {
  const directory = join(iso, '.sdd-flow-eval-dependencies', name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'metadata.json'), '{}\n');
  if (leaseContents !== undefined) {
    mkdirSync(join(directory, 'leases'));
    writeFileSync(join(directory, 'leases', 'run.json'), leaseContents);
  }
  return directory;
}

function lease(heartbeatAt: Date): string {
  return `${JSON.stringify({
    schema: 1,
    leaseId: 'cli-test-run',
    ownerToken: 'cli-test-token',
    hostname: 'foreign-test-host',
    pid: 4242,
    createdAt: heartbeatAt.toISOString(),
    heartbeatAt: heartbeatAt.toISOString(),
  })}\n`;
}

describe('eval sandbox script (deterministic prepare/clean)', () => {
  it('prepare creates a fresh sandbox root under TMPDIR', () => {
    withIsoRoot((iso) => {
      const { code, stdout, stderr } = run(iso, ['prepare']);
      assert.strictEqual(code, 0, stderr);
      const prepared = stdout.trim();
      assert.ok(
        prepared.startsWith(join(iso, 'sdd-flow-eval-root.')),
        `unexpected path: ${prepared}; stderr: ${stderr}`
      );
      assert.ok(existsSync(prepared), 'prepared dir must exist');
    });
  });

  it('clean --dry lists sandbox roots but removes nothing', () => {
    withIsoRoot((iso) => {
      const victim = join(iso, 'sdd-flow-eval-root.aaa');
      mkdirSync(victim);
      // --root pins the sweep to the isolated dir so the test never touches real temp dirs.
      const { code, stdout, stderr } = run(iso, ['clean', '--dry', '--root', iso]);
      assert.strictEqual(code, 0, stderr);
      assert.match(stdout, /would remove/);
      assert.ok(existsSync(victim), 'dry run must not delete');
    });
  });

  it('clean removes sandbox roots (recursive)', () => {
    withIsoRoot((iso) => {
      const victim = join(iso, 'diag-recover.bbb');
      mkdirSync(join(victim, 'nested'), { recursive: true });
      const { code, stderr } = run(iso, ['clean', '--root', iso]);
      assert.strictEqual(code, 0, stderr);
      assert.ok(!existsSync(victim), 'clean must remove the sandbox root and its contents');
    });
  });

  it('clean removes hand-created gen-* roots (the prefix that once leaked to /private/tmp)', () => {
    withIsoRoot((iso) => {
      const victim = join(iso, 'gen-h2-baseline-1.ccc');
      mkdirSync(join(victim, 'node_modules'), { recursive: true });
      const { code, stderr } = run(iso, ['clean', '--root', iso]);
      assert.strictEqual(code, 0, stderr);
      assert.ok(!existsSync(victim), 'clean must remove gen-* experiment roots');
    });
  });

  it('clean sweeps multiple --root directories in one pass', () => {
    withIsoRoot((isoA) => {
      withIsoRoot((isoB) => {
        const victimA = join(isoA, 'sdd-flow-eval-root.a');
        const victimB = join(isoB, 'gen-b');
        mkdirSync(victimA);
        mkdirSync(victimB);
        const { code, stderr } = run(isoA, ['clean', '--root', isoA, '--root', isoB]);
        assert.strictEqual(code, 0, stderr);
        assert.ok(!existsSync(victimA), 'first root swept');
        assert.ok(!existsSync(victimB), 'second root swept');
      });
    });
  });

  it('clean never touches non-sandbox directories', () => {
    withIsoRoot((iso) => {
      const keep = join(iso, 'unrelated-project');
      mkdirSync(keep);
      const { code, stderr } = run(iso, ['clean', '--root', iso]);
      assert.strictEqual(code, 0, stderr);
      assert.ok(existsSync(keep), 'clean must not remove directories without a sandbox prefix');
    });
  });

  it('dependencies requires an explicit root and creates nothing on rejection', () => {
    withIsoRoot((iso) => {
      const storeRoot = join(iso, '.sdd-flow-eval-dependencies');
      const { code, stdout, stderr } = run(iso, ['dependencies']);
      assert.notStrictEqual(code, 0);
      assert.match(`${stdout}${stderr}`, /requires at least one explicit --root/);
      assert.equal(existsSync(storeRoot), false);
    });
  });

  it('dependencies with a root is a read-only report by default', () => {
    withIsoRoot((iso) => {
      const stale = new Date(Date.now() - 3 * 60 * 1000);
      const directory = dependencyStore(iso, 'stale-inactive', lease(stale));
      const leaseFile = join(directory, 'leases', 'run.json');
      const { code, stdout, stderr } = run(iso, ['dependencies', '--root', iso]);
      assert.strictEqual(code, 0, stderr);
      assert.match(stdout, /would-remove lease/);
      assert.ok(existsSync(leaseFile), 'default report must preserve a stale lease');
      assert.ok(existsSync(directory), 'default report must preserve its inactive store');
    });
  });

  it('dependencies --clean removes inactive stores but preserves active and quarantined stores', () => {
    withIsoRoot((iso) => {
      const now = new Date();
      const stale = new Date(now.getTime() - 3 * 60 * 1000);
      const inactive = dependencyStore(iso, 'inactive', lease(stale));
      const active = dependencyStore(iso, 'active', lease(now));
      const quarantined = dependencyStore(iso, 'quarantined', '{broken\n');
      const { code, stdout, stderr } = run(iso, ['dependencies', '--clean', '--root', iso]);
      assert.strictEqual(code, 0, stderr);
      assert.equal(existsSync(inactive), false);
      assert.equal(existsSync(active), true);
      assert.equal(existsSync(quarantined), true);
      assert.match(stdout, /removed store .*inactive/);
      assert.match(stdout, /kept store .*active .*active lease/);
      assert.match(stdout, /quarantined lease .*quarantined/);
      assert.match(stdout, /quarantined store .*quarantined/);
    });
  });

  it('rejects an unknown command with a nonzero exit', () => {
    withIsoRoot((iso) => {
      const { code, stdout, stderr } = run(iso, ['frobnicate']);
      assert.notStrictEqual(code, 0);
      assert.match(`${stdout}${stderr}`, /usage/);
    });
  });
});
