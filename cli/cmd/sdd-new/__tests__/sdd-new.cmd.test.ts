// @file: Integration tests for SddNewCommand#run — arg parsing, path resolution, no-overwrite, manifest report.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type SddNewModule = typeof import('../sdd-new.cmd.ts');

let mod: SddNewModule;
let origExit: typeof process.exit;
let origArgv: string[];
let tmpDir: string;

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-new', ...rest];
}

describe('SddNewCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-new'];
    tmpDir = mkdtempSync(join(tmpdir(), 'sdd-new-test-'));
    mod = await import('../sdd-new.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('--list prints every known kind with a path pattern', async () => {
    const outcome = await mod.run(argv('--list'));
    assert.strictEqual(outcome.ok, true);
    if (outcome.ok) {
      assert.match(outcome.text, /product/);
      assert.match(outcome.text, /module/);
      assert.match(outcome.text, /portal/);
      assert.match(outcome.text, /specs\/README\.md/);
    }
  });

  it('rejects a missing <kind> with exit 4 / BAD_INVOCATION', async () => {
    const outcome = await mod.run(argv());
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 4);
      assert.match(outcome.code, /BAD_INVOCATION/);
    }
  });

  it('rejects an unknown <kind> with exit 4 / UNKNOWN_KIND', async () => {
    const outcome = await mod.run(argv('widget', '--scope', 'x'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 4);
      assert.match(outcome.code, /UNKNOWN_KIND/);
    }
  });

  it('rejects a scope-kind with no --scope and no --out with exit 4 / BAD_INVOCATION', async () => {
    const outcome = await mod.run(argv('product'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 4);
      assert.match(outcome.code, /BAD_INVOCATION/);
      assert.match(outcome.message, /--scope/);
    }
  });

  it('rejects task with --scope/--module but no --id with exit 4 / BAD_INVOCATION', async () => {
    const outcome = await mod.run(argv('task', '--scope', 'x', '--module', 'y'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.match(outcome.message, /--id/);
    }
  });

  it('creates a product spec at the conventional path via --out and writes the skeleton verbatim', async () => {
    const out = join(tmpDir, 'specs', 'backend', 'backend.spec.md');
    const outcome = await mod.run(argv('product', '--scope', 'backend', '--out', out));
    assert.strictEqual(outcome.ok, true);
    assert.ok(existsSync(out), 'expected the skeleton file to be created');
    const written = readFileSync(out, 'utf-8');
    assert.match(written, /<!--SECTION:SCOPE_TYPE-->/);
    assert.match(written, /^product$/m);
    if (outcome.ok) {
      assert.match(outcome.text, /created product skeleton/);
      assert.match(outcome.text, /VISION/);
      assert.match(outcome.text, /REQUIRED/);
    }
  });

  it('creates missing parent directories', async () => {
    const out = join(tmpDir, 'specs', 'deep', 'nested', 'module', 'module.spec.md');
    const outcome = await mod.run(
      argv('module', '--scope', 'deep', '--module', 'nested', '--out', out)
    );
    assert.strictEqual(outcome.ok, true);
    assert.ok(existsSync(out));
  });

  it('refuses to overwrite an existing file with exit 1 / FILE_EXISTS', async () => {
    const out = join(tmpDir, 'existing.md');
    writeFileSync(out, 'already here', 'utf-8');
    const outcome = await mod.run(argv('portal', '--out', out));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 1);
      assert.match(outcome.code, /FILE_EXISTS/);
    }
    assert.strictEqual(
      readFileSync(out, 'utf-8'),
      'already here',
      'must not have overwritten the file'
    );
  });

  it('resolves the task path convention: specs/<scope>/<module>/<module>.task.<id>.md', () => {
    const path = mod.resolvePath('task', { scope: 's', module: 'm', id: 'ACR-slug' });
    assert.strictEqual(path, 'specs/s/m/m.task.ACR-slug.md');
  });

  it('resolves the module path convention: specs/<scope>/<module>/<module>.spec.md', () => {
    const path = mod.resolvePath('module', { scope: 's', module: 'm' });
    assert.strictEqual(path, 'specs/s/m/m.spec.md');
  });

  it('an explicit --out always wins over the computed path', () => {
    const path = mod.resolvePath('product', { scope: 's', out: 'custom/path.md' });
    assert.strictEqual(path, 'custom/path.md');
  });
});
