// @file: Integration tests for SddOrientCommand#run — real filesystem fixtures, both modes, every error path, exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type SddOrientModule = typeof import('../sdd-orient.cmd.ts');

let mod: SddOrientModule;
let origExit: typeof process.exit;
let origArgv: string[];
let projectRoot: string;

const PORTAL = [
  '## Scopes',
  '',
  '| Scope | Type | Spec | Description |',
  '|---|---|---|---|',
  '| [`infra-base`](./infra-base/infra-base.spec.md) | infrastructure | ✅ | toolchain |',
  '| [`todos-app`](./todos-app/todos-app.spec.md) | product | ✅ | Todo app |',
  '',
  '## Scope Graph',
  '',
  '```mermaid',
  'graph TD',
  '    todos-app --> infra-base',
  '```',
].join('\n');

const SCOPE_SPEC = [
  '<!--SECTION:SCOPE_TYPE-->',
  'product',
  '<!--/SECTION:SCOPE_TYPE-->',
  '<!--SECTION:MODULE_MAP-->',
  '- [ui](./ui/ui.spec.md) — UI',
  '```mermaid',
  'graph TD',
  '    ui --> storage',
  '```',
  '- [storage](./storage/storage.spec.md) — storage',
  '<!--/SECTION:MODULE_MAP-->',
].join('\n');

const UI_SPEC = [
  '<!--SECTION:MODULE_VISION-->',
  'x',
  '<!--/SECTION:MODULE_VISION-->',
  '<!--SECTION:ENTITY_INVENTORY-->',
  '| Name | Type | Purpose |',
  '| `TodoList` | Component | x |',
  '<!--/SECTION:ENTITY_INVENTORY-->',
].join('\n');

const STORAGE_SPEC = ['<!--SECTION:MODULE_VISION-->', 'x', '<!--/SECTION:MODULE_VISION-->'].join(
  '\n'
);

describe('SddOrientCommand#run', () => {
  before(() => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-orient'];
  });

  before(async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'sdd-orient-cmd-'));
    mkdirSync(join(projectRoot, 'specs', 'todos-app', 'ui'), { recursive: true });
    mkdirSync(join(projectRoot, 'specs', 'todos-app', 'storage'), { recursive: true });
    mkdirSync(join(projectRoot, 'specs', 'infra-base'), { recursive: true });
    writeFileSync(join(projectRoot, 'specs', 'README.md'), PORTAL);
    writeFileSync(join(projectRoot, 'specs', 'todos-app', 'todos-app.spec.md'), SCOPE_SPEC);
    writeFileSync(join(projectRoot, 'specs', 'todos-app', 'ui', 'ui.spec.md'), UI_SPEC);
    writeFileSync(
      join(projectRoot, 'specs', 'todos-app', 'storage', 'storage.spec.md'),
      STORAGE_SPEC
    );
    writeFileSync(
      join(projectRoot, 'specs', 'infra-base', 'infra-base.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\ninfrastructure\n<!--/SECTION:SCOPE_TYPE-->'
    );
    mod = await import('../sdd-orient.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('mode 1: a spec path resolves and renders the neighbourhood', async () => {
    const out = await mod.run(
      ['node', 'gennady', 'sdd-orient', 'specs/todos-app/ui/ui.spec.md'],
      projectRoot
    );
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.match(out.text, /\[sdd-orient\] neighbourhood — specs\/todos-app\/ui\/ui\.spec\.md/);
      assert.match(out.text, /portal: todos-app \(product\) · depends on: infra-base/);
      assert.match(out.text, /storage \(module\)/);
    }
  });

  it('mode 2: --scope resolves the same scope and lists all its modules', async () => {
    const out = await mod.run(
      ['node', 'gennady', 'sdd-orient', '--scope', 'todos-app'],
      projectRoot
    );
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.match(out.text, /neighbourhood — specs\/todos-app\/todos-app\.spec\.md/);
      assert.match(out.text, /ui \(module\)/);
      assert.match(out.text, /storage \(module\)/);
    }
  });

  it('bad invocation: no argument at all → exit 4', async () => {
    const out = await mod.run(['node', 'gennady', 'sdd-orient'], projectRoot);
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.exitCode, 4);
      assert.match(out.message, /pass exactly one of/);
    }
  });

  it('bad invocation: both positional path and --scope given → exit 4', async () => {
    const out = await mod.run(
      ['node', 'gennady', 'sdd-orient', 'specs/todos-app/ui/ui.spec.md', '--scope', 'todos-app'],
      projectRoot
    );
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.exitCode, 4);
  });

  it('bad invocation: more than one positional argument → exit 4', async () => {
    const out = await mod.run(
      ['node', 'gennady', 'sdd-orient', 'a.spec.md', 'b.spec.md'],
      projectRoot
    );
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.exitCode, 4);
  });

  it('an unresolvable path/scope argument → tool-teaches error listing known scopes, exit 4', async () => {
    const out = await mod.run(
      ['node', 'gennady', 'sdd-orient', 'specs/no-such/no-such.spec.md'],
      projectRoot
    );
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.exitCode, 4);
      assert.match(out.message, /Known scopes: infra-base, todos-app/);
    }
  });

  it('an unknown --scope name → tool-teaches error, exit 4', async () => {
    const out = await mod.run(
      ['node', 'gennady', 'sdd-orient', '--scope', 'ghost-scope'],
      projectRoot
    );
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.exitCode, 4);
  });

  it('missing portal + --scope → dedicated no-portal error, exit 4', async () => {
    const noPortalRoot = mkdtempSync(join(tmpdir(), 'sdd-orient-no-portal-'));
    try {
      const out = await mod.run(
        ['node', 'gennady', 'sdd-orient', '--scope', 'todos-app'],
        noPortalRoot
      );
      assert.equal(out.ok, false);
      if (!out.ok) {
        assert.equal(out.exitCode, 4);
        assert.match(out.message, /portal.*is missing/);
      }
    } finally {
      rmSync(noPortalRoot, { recursive: true, force: true });
    }
  });

  it('missing portal + spec path still succeeds, degraded portal line', async () => {
    const noPortalRoot = mkdtempSync(join(tmpdir(), 'sdd-orient-no-portal-path-'));
    try {
      mkdirSync(join(noPortalRoot, 'specs', 'todos-app', 'ui'), { recursive: true });
      writeFileSync(join(noPortalRoot, 'specs', 'todos-app', 'ui', 'ui.spec.md'), UI_SPEC);
      const out = await mod.run(
        ['node', 'gennady', 'sdd-orient', 'specs/todos-app/ui/ui.spec.md'],
        noPortalRoot
      );
      assert.equal(out.ok, true);
      if (out.ok) assert.match(out.text, /портал не найден/);
    } finally {
      rmSync(noPortalRoot, { recursive: true, force: true });
    }
  });
});
