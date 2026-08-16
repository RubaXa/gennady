// @file: Integration tests for SddNewCommand#run — arg parsing, path resolution, no-overwrite, manifest report.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
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

  it('resolves a nested --module: dir is the full path, filename is the last segment', () => {
    const path = mod.resolvePath('module', { scope: 's', module: 'foo/bar/qux' });
    assert.strictEqual(path, 'specs/s/foo/bar/qux/qux.spec.md');
  });

  it('resolves a nested task path the same way', () => {
    const path = mod.resolvePath('task', { scope: 's', module: 'foo/bar', id: 'ACR-slug' });
    assert.strictEqual(path, 'specs/s/foo/bar/bar.task.ACR-slug.md');
  });

  it('resolves module-index at any nesting depth: <module>.3-tasks.md', () => {
    const path = mod.resolvePath('module-index', { scope: 's', module: 'foo/bar' });
    assert.strictEqual(path, 'specs/s/foo/bar/bar.3-tasks.md');
  });

  it('resolves scope-index: specs/<scope>/<scope>.3-tasks.md', () => {
    const path = mod.resolvePath('scope-index', { scope: 's' });
    assert.strictEqual(path, 'specs/s/s.3-tasks.md');
  });

  it('validateModulePath accepts a well-formed nested module', () => {
    assert.strictEqual(mod.validateModulePath('foo/bar/qux'), null);
    assert.strictEqual(mod.validateModulePath('auth'), null);
  });

  it('validateModulePath rejects an empty segment (double slash)', () => {
    assert.match(mod.validateModulePath('foo//bar') ?? '', /empty/);
  });

  it('validateModulePath rejects an absolute path', () => {
    assert.match(mod.validateModulePath('/foo/bar') ?? '', /relative/);
  });

  it('validateModulePath rejects ".." segments', () => {
    assert.match(mod.validateModulePath('foo/../bar') ?? '', /\.\./);
  });

  it('validateModulePath rejects a non-kebab-case segment', () => {
    assert.match(mod.validateModulePath('foo/Bar_Baz') ?? '', /kebab-case/);
  });

  it('rejects a malformed --module with exit 4 / BAD_INVOCATION before touching the filesystem', async () => {
    const outcome = await mod.run(argv('module', '--scope', 's', '--module', 'foo//bar'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 4);
      assert.match(outcome.code, /BAD_INVOCATION/);
    }
  });

  it('creates a module-index skeleton at the module-index path', async () => {
    const out = join(tmpDir, 'specs', 'idxs', 'auth', 'auth.3-tasks.md');
    const outcome = await mod.run(
      argv('module-index', '--scope', 'idxs', '--module', 'auth', '--out', out)
    );
    assert.strictEqual(outcome.ok, true);
    assert.ok(existsSync(out));
    const written = readFileSync(out, 'utf-8');
    assert.match(written, /Tracker Index/);
  });

  it('--manifest prints the section manifest for a kind without creating a file or requiring --scope', async () => {
    const outcome = await mod.run(argv('module', '--manifest'));
    assert.strictEqual(outcome.ok, true);
    if (outcome.ok) {
      assert.match(outcome.text, /manifest for module/);
      assert.match(outcome.text, /REQUIRED/);
      assert.match(outcome.text, /Section\s+Required\s+Fold\s+Fill/);
      assert.strictEqual(outcome.path, '');
    }
  });

  it('--manifest works for kinds that would otherwise require --module/--id (task)', async () => {
    const outcome = await mod.run(argv('task', '--manifest'));
    assert.strictEqual(outcome.ok, true);
    if (outcome.ok) {
      assert.match(outcome.text, /manifest for task/);
    }
  });

  it('--manifest with an unknown kind still fails with exit 4 / UNKNOWN_KIND', async () => {
    const outcome = await mod.run(argv('widget', '--manifest'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 4);
      assert.match(outcome.code, /UNKNOWN_KIND/);
    }
  });

  it('rejects a --id that fails the v2 grammar, with exit 4 / BAD_TASK_ID and a suggestion', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sdd-new-id-'));
    const prevCwd = process.cwd();
    try {
      process.chdir(cwd);
      const outcome = await mod.run(
        argv('task', '--scope', 's', '--module', 'm', '--id', 'bad_id')
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) {
        assert.strictEqual(outcome.exitCode, 4);
        assert.match(outcome.code, /BAD_TASK_ID/);
        assert.match(outcome.message, /grammar/);
        assert.match(outcome.message, /try: --id/);
      }
      assert.ok(!existsSync(join(cwd, 'specs')), 'must not create anything on rejection');
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rejects a --id one char past the slug cap (9 chars), naming the length', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sdd-new-id-'));
    const prevCwd = process.cwd();
    try {
      process.chdir(cwd);
      const outcome = await mod.run(
        argv('task', '--scope', 's', '--module', 'm', '--id', 'GAT-abcdefghi')
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) assert.match(outcome.message, /9-char/);
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rejects a --id that duplicates an existing project Task-ID', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sdd-new-id-'));
    const prevCwd = process.cwd();
    try {
      mkdirSync(join(cwd, 'specs', 's', 'm'), { recursive: true });
      writeFileSync(
        join(cwd, 'specs', 's', 'm', 'm.task.GAT-login.md'),
        '<!--SECTION:META-->\n- **Task-ID:** GAT-login\n<!--/SECTION:META-->\n'
      );
      process.chdir(cwd);
      const outcome = await mod.run(
        argv('task', '--scope', 's', '--module', 'm', '--id', 'GAT-login')
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) {
        assert.strictEqual(outcome.exitCode, 4);
        assert.match(outcome.code, /BAD_TASK_ID/);
        assert.match(outcome.message, /already exists/);
      }
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rejects a --id that prefix-conflicts with an existing Task-ID (gates vs gates-v2)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sdd-new-id-'));
    const prevCwd = process.cwd();
    try {
      mkdirSync(join(cwd, 'specs', 's', 'm'), { recursive: true });
      writeFileSync(
        join(cwd, 'specs', 's', 'm', 'm.task.GAT-gates.md'),
        '<!--SECTION:META-->\n- **Task-ID:** GAT-gates\n<!--/SECTION:META-->\n'
      );
      process.chdir(cwd);
      const outcome = await mod.run(
        argv('task', '--scope', 's', '--module', 'm', '--id', 'GAT-gates-v2')
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) {
        assert.strictEqual(outcome.exitCode, 4);
        assert.match(outcome.message, /prefix conflict/);
        assert.match(outcome.message, /GAT-gates/);
      }
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('accepts a valid, conflict-free --id and creates the ticket', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sdd-new-id-'));
    const prevCwd = process.cwd();
    try {
      process.chdir(cwd);
      const outcome = await mod.run(
        argv('task', '--scope', 's', '--module', 'm', '--id', 'GAT-login')
      );
      assert.strictEqual(outcome.ok, true);
      if (outcome.ok) assert.ok(existsSync(outcome.path));
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('--manifest with no <kind> still fails with exit 4 / BAD_INVOCATION', async () => {
    const outcome = await mod.run(argv('--manifest'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 4);
      assert.match(outcome.code, /BAD_INVOCATION/);
    }
  });

  it('creates a scope-index skeleton at the scope-index path', async () => {
    const out = join(tmpDir, 'specs', 'idxs2', 'idxs2.3-tasks.md');
    const outcome = await mod.run(argv('scope-index', '--scope', 'idxs2', '--out', out));
    assert.strictEqual(outcome.ok, true);
    assert.ok(existsSync(out));
    const written = readFileSync(out, 'utf-8');
    assert.match(written, /Cascade Table/);
  });

  it('resolves project-index: specs/3-tasks.md, no --scope required', () => {
    const path = mod.resolvePath('project-index', {});
    assert.strictEqual(path, 'specs/3-tasks.md');
  });

  it('creates a project-index skeleton via --out without --scope (like portal)', async () => {
    const out = join(tmpDir, 'specs', '3-tasks.md');
    const outcome = await mod.run(argv('project-index', '--out', out));
    assert.strictEqual(outcome.ok, true);
    assert.ok(existsSync(out));
    const written = readFileSync(out, 'utf-8');
    assert.match(written, /Scope Tracker/);
    assert.match(written, /Cross-Scope DAG/);
    if (outcome.ok) {
      assert.match(outcome.text, /created project-index skeleton/);
    }
  });
});
