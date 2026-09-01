// @file: Integration tests for SddNewCommand#run — arg parsing, path resolution, no-overwrite, manifest report.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

type SddNewModule = typeof import('../sdd-new.cmd.ts');

let mod: SddNewModule;
let origExit: typeof process.exit;
let origArgv: string[];
let tmpDir: string;

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-new', ...rest];
}

function writeScope(root: string, scope: string, scopeType: string): void {
  const scopeDir = join(root, 'specs', scope);
  mkdirSync(scopeDir, { recursive: true });
  writeFileSync(
    join(scopeDir, `${scope}.spec.md`),
    `<!--SECTION:SCOPE_TYPE-->\n## scope-type\n${scopeType}\n<!--/SECTION:SCOPE_TYPE-->`,
    'utf-8'
  );
}

const PRE_SCAFFOLD_FIXTURE = fileURLToPath(new URL('./fixtures/pre-scaffold', import.meta.url));

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

  it('rejects an unknown flag and prints canonical usage without requiring --help', async () => {
    const outcome = await mod.run(argv('product', '--scpoe', 'backend'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 4);
      assert.match(outcome.message, /unknown flag "--scpoe"/);
      assert.match(outcome.message, /expected: npx gennady sdd-new <kind> --scope <s>/);
      assert.match(outcome.message, /scope: +<s> is one kebab-case name/);
    }
  });

  it('rejects an extra positional token instead of silently ignoring it', async () => {
    const outcome = await mod.run(argv('product', 'surprise', '--scope', 'backend'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 4);
      assert.match(outcome.message, /unexpected positional argument "surprise"/);
    }
  });

  it('rejects a value flag without its value instead of treating true as undefined', async () => {
    const outcome = await mod.run(argv('product', '--scope'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 4);
      assert.match(outcome.message, /flag "--scope" requires a value/);
      assert.match(outcome.message, /expected: npx gennady sdd-new/);
    }
  });

  it('rejects repeated scalar and boolean modes before any filesystem write', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sdd-new-repeated-'));
    const prevCwd = process.cwd();
    try {
      process.chdir(cwd);
      const invalid = [
        argv('product', '--scope=alpha', '--out=a.md', '--out=b.md'),
        argv('product', '--scope=alpha', '--scope=beta'),
        argv('--list', '--list'),
        argv('module', '--manifest', '--manifest'),
      ];
      for (const rawArgs of invalid) {
        const outcome = await mod.run(rawArgs);
        assert.strictEqual(outcome.ok, false, rawArgs.join(' '));
        if (!outcome.ok) {
          assert.strictEqual(outcome.exitCode, 4);
          assert.match(outcome.message, /must be specified at most once/);
        }
      }
      assert.strictEqual(existsSync(join(cwd, 'a.md')), false);
      assert.strictEqual(existsSync(join(cwd, 'b.md')), false);
      assert.strictEqual(existsSync(join(cwd, 'specs')), false);
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rejects every path-like or non-kebab scope before touching the filesystem', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sdd-new-bad-scope-'));
    const prevCwd = process.cwd();
    try {
      process.chdir(cwd);
      for (const scope of ['../escape', '/absolute', 'a/b', 'a\\b', '.', '', 'Bad_Name']) {
        const outcome = await mod.run(argv('product', `--scope=${scope}`));
        assert.strictEqual(outcome.ok, false, `scope must be rejected: ${JSON.stringify(scope)}`);
        if (!outcome.ok) {
          assert.strictEqual(outcome.exitCode, 4);
          assert.match(outcome.message, /--scope/);
        }
      }
      assert.ok(!existsSync(join(cwd, 'specs')), 'invalid scope must not create specs/');
      assert.ok(!existsSync(join(cwd, 'escape')), 'invalid scope must not escape specs/');
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
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
    const outcome = await mod.run(
      argv('task', '--owner', 'infrastructure-flat', '--scope', 'x', '--module', 'y')
    );
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.match(outcome.message, /--id/);
    }
  });

  it('rejects task with --scope but no --module and no --id with exit 4 / BAD_INVOCATION (--id still required, --module NOT)', async () => {
    const outcome = await mod.run(argv('task', '--owner', 'infrastructure-flat', '--scope', 'x'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.match(outcome.message, /task requires --id/);
    }
  });

  it('rejects task --out=<path> when both --scope and --id are missing', async () => {
    const outcome = await mod.run(argv('task', `--out=${join(tmpDir, 'bypass-equals.md')}`));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.match(outcome.code, /BAD_INVOCATION/);
      assert.match(outcome.message, /cannot prove task --out ownership/);
    }
  });

  it('rejects task --out <path> when --scope is missing', async () => {
    const outcome = await mod.run(
      argv(
        'task',
        '--owner',
        'infrastructure-flat',
        '--id',
        'TSK-out',
        '--out',
        join(tmpDir, 'missing-scope.md')
      )
    );
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.message, /absolute paths are forbidden/);
  });

  it('rejects task --out <path> when --id is missing', async () => {
    const outcome = await mod.run(
      argv(
        'task',
        '--owner',
        'infrastructure-flat',
        '--scope',
        'infra-base',
        '--out',
        join(tmpDir, 'missing-id.md')
      )
    );
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.message, /absolute paths are forbidden/);
  });

  it('rejects module with --scope but no --module with exit 4 / BAD_INVOCATION (module always needs --module)', async () => {
    const outcome = await mod.run(argv('module', '--scope', 'x'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.match(outcome.message, /--module/);
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
      assert.match(outcome.text, /next:/);
      assert.match(outcome.text, /\/sdd/);
    }
  });

  it('creates an infrastructure spec with DAG-serialized shared-writer guidance', async () => {
    const out = join(tmpDir, 'specs', 'infra-contract', 'infra-contract.spec.md');
    const outcome = await mod.run(
      argv('infrastructure', '--scope', 'infra-contract', '--out', out)
    );
    assert.strictEqual(outcome.ok, true);
    const written = readFileSync(out, 'utf8');
    assert.match(
      written,
      /Every shared manifest\/lock write has an owning phase\/task; all writers of the same file are strictly DAG-serialized/
    );
    assert.doesNotMatch(written, /EXACTLY ONE owning task/);
  });

  it('creates missing parent directories', async () => {
    const out = join(tmpDir, 'specs', 'deep', 'nested', 'module', 'module.spec.md');
    const outcome = await mod.run(
      argv('module', '--scope', 'deep', '--module', 'nested', '--out', out)
    );
    assert.strictEqual(outcome.ok, true);
    assert.ok(existsSync(out));
  });

  it('accepts a nested module with an explicit --out destination', async () => {
    const out = join(tmpDir, 'custom', 'nested-module.spec.md');
    const outcome = await mod.run(
      argv('module', '--scope', 'deep-scope', '--module', 'auth/tokens', '--out', out)
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

  it('resolves a flat task (no --module) at specs/<scope>/<scope>.task.<id>.md — no doubled scope segment', () => {
    const path = mod.resolvePath('task', { scope: 'infra-base', id: 'INF-tooling' });
    assert.strictEqual(path, 'specs/infra-base/infra-base.task.INF-tooling.md');
  });

  it('resolves a flat module-index (no --module) at specs/<scope>/<scope>.3-tasks.md', () => {
    const path = mod.resolvePath('module-index', { scope: 'infra-base' });
    assert.strictEqual(path, 'specs/infra-base/infra-base.3-tasks.md');
  });

  it('refuses a product task until the scope has a module spec', async () => {
    const root = join(tmpDir, 'product-without-modules');
    const scopeDir = join(root, 'specs', 'shop');
    mkdirSync(scopeDir, { recursive: true });
    writeFileSync(
      join(scopeDir, 'shop.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\n## scope-type\nproduct\n<!--/SECTION:SCOPE_TYPE-->',
      'utf-8'
    );
    const previous = process.cwd();
    process.chdir(root);
    try {
      const outcome = await mod.run(
        argv('task', '--owner', 'scope-bootstrap', '--scope', 'shop', '--id', 'SHP-checkout')
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) assert.match(outcome.code, /SCOPE_NOT_DECOMPOSED/);
      assert.strictEqual(existsSync(join(scopeDir, 'shop.task.SHP-checkout.md')), false);
    } finally {
      process.chdir(previous);
    }
  });

  it('allows a product task after module decomposition and exempts infrastructure scopes', async () => {
    const root = join(tmpDir, 'decomposed-and-infra');
    const productDir = join(root, 'specs', 'shop');
    const moduleDir = join(productDir, 'checkout');
    const infraDir = join(root, 'specs', 'infra-base');
    mkdirSync(moduleDir, { recursive: true });
    mkdirSync(infraDir, { recursive: true });
    writeFileSync(
      join(productDir, 'shop.spec.md'),
      [
        '<!--SECTION:SCOPE_TYPE-->',
        '## scope-type',
        'product',
        '<!--/SECTION:SCOPE_TYPE-->',
        '<!--SECTION:MODULE_MAP-->',
        '- [checkout](./checkout/checkout.spec.md)',
        '<!--/SECTION:MODULE_MAP-->',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      join(moduleDir, 'checkout.spec.md'),
      [
        '<!--SECTION:MODULE_VISION-->',
        '## Vision',
        'checkout',
        '<!--/SECTION:MODULE_VISION-->',
        '<details>',
        '<summary>Contracts</summary>',
        '#### Port: `TodoStore`',
        'contract',
        '</details>',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      join(infraDir, 'infra-base.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\n## scope-type\ninfrastructure\n<!--/SECTION:SCOPE_TYPE-->',
      'utf-8'
    );
    const previous = process.cwd();
    process.chdir(root);
    try {
      const bootstrap = await mod.run(
        argv('task', '--owner', 'scope-bootstrap', '--scope', 'shop', '--id', 'SHP-boot')
      );
      const product = await mod.run(
        argv(
          'task',
          '--owner',
          'module',
          '--scope',
          'shop',
          '--module',
          'checkout',
          '--id',
          'SHP-checkout'
        )
      );
      const infra = await mod.run(
        argv(
          'task',
          '--owner',
          'infrastructure-flat',
          '--scope',
          'infra-base',
          '--id',
          'INF-tooling'
        )
      );
      assert.strictEqual(bootstrap.ok, true);
      assert.strictEqual(product.ok, true);
      assert.strictEqual(infra.ok, true);
      if (bootstrap.ok) {
        assert.match(bootstrap.text, /owning-spec: \[Owning spec\]\(\.\/shop\.spec\.md\)/);
        const ticket = readFileSync(join(root, bootstrap.path), 'utf-8');
        assert.match(ticket, /^- \*\*Task-ID:\*\* SHP-boot\s+<!-- semantic slug;/m);
        assert.match(ticket, /^- \*\*Status:\*\* \[ \] TODO\b/m);
        assert.match(ticket, /^- \*\*Scope:\*\* shop$/m);
        assert.match(ticket, /^- \*\*Module:\*\* N\/A$/m);
        assert.match(ticket, /^- \*\*Structural Owner:\*\* scope-bootstrap$/m);
        assert.match(ticket, /^- \*\*Owning Spec:\*\* \[Owning spec\]\(\.\/shop\.spec\.md\)$/m);
      }
      if (product.ok) {
        assert.match(product.text, /\[Port: TodoStore\]\(\.\/checkout\.spec\.md#port-todostore\)/);
      }
      if (product.ok) {
        assert.match(product.text, /owning-spec: \[Owning spec\]\(\.\/checkout\.spec\.md\)/);
        assert.match(product.text, /\[testing-common\]\([^\n]*testing\/common\.xml\)/);
        assert.doesNotMatch(product.text, /\[common\]\(/);
        assert.match(
          product.text,
          /deferred-test-ownership: - Deferred Test Ownership: <other-Task-ID> <scenario name>/
        );
      }
    } finally {
      process.chdir(previous);
    }
  });

  it('pre-scaffold fixture: module task is created with every mechanically-known owner field and CREATE-aware guidance', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdd-new-pre-scaffold-module-'));
    cpSync(PRE_SCAFFOLD_FIXTURE, root, { recursive: true });
    const previous = process.cwd();
    process.chdir(root);
    try {
      const outcome = await mod.run(
        argv(
          'task',
          '--owner',
          'module',
          '--scope',
          'todos-app',
          '--module',
          'core',
          '--id',
          'TODO-core'
        )
      );

      assert.strictEqual(outcome.ok, true, outcome.ok ? '' : outcome.message);
      if (!outcome.ok) return;
      assert.match(
        outcome.text,
        /^\[sdd-new\] created task skeleton: specs\/todos-app\/core\/core\.task\.TODO-core\.md$/m
      );
      assert.match(outcome.text, /existing READ Target Files or future CREATE Target Files/);
      assert.doesNotMatch(outcome.text, /existing Target Files/);

      const ticket = readFileSync(join(root, outcome.path), 'utf-8');
      assert.match(ticket, /^# Task: TODO-core — <Task Title>$/m);
      assert.match(ticket, /^- \*\*Task-ID:\*\* TODO-core\s+<!-- semantic slug;/m);
      assert.match(ticket, /^- \*\*Status:\*\* \[ \] TODO\b/m);
      assert.match(ticket, /^- \*\*Scope:\*\* todos-app$/m);
      assert.match(ticket, /^- \*\*Module:\*\* core$/m);
      assert.match(ticket, /^- \*\*Structural Owner:\*\* module$/m);
      assert.match(ticket, /^- \*\*Owning Spec:\*\* \[Owning spec\]\(\.\/core\.spec\.md\)$/m);
      assert.match(ticket, /^- \*\*Capability Adapter:\*\* <adapter-id>/m);
      assert.match(ticket, /^- \*\*Provides Capabilities:\*\* <comma-separated capability ids>/m);
      assert.match(ticket, /^- \*\*Requires Capabilities:\*\* <comma-separated capability ids>/m);
      assert.match(
        outcome.text,
        new RegExp(
          `npx gennady sdd-check --task ${outcome.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} --authoring`
        )
      );
      assert.match(outcome.text, /npx gennady sdd-check --scaffold-feasibility/);
      assert.doesNotMatch(outcome.text, /--help/);
      assert.doesNotMatch(ticket, /<ACRONYM>-<slug>/);
      assert.doesNotMatch(ticket, /- \*\*Scope:\*\* <scope-name>/);
      assert.doesNotMatch(ticket, /- \*\*Module:\*\* <module-name or N\/A>/);
    } finally {
      process.chdir(previous);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('pre-scaffold fixture: flat infrastructure task records N/A module and its structural owner', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdd-new-pre-scaffold-infra-'));
    cpSync(PRE_SCAFFOLD_FIXTURE, root, { recursive: true });
    const previous = process.cwd();
    process.chdir(root);
    try {
      const outcome = await mod.run(
        argv('task', '--owner', 'infrastructure-flat', '--scope', 'infra-base', '--id', 'INF-setup')
      );

      assert.strictEqual(outcome.ok, true, outcome.ok ? '' : outcome.message);
      if (!outcome.ok) return;
      assert.strictEqual(outcome.path, 'specs/infra-base/infra-base.task.INF-setup.md');
      assert.match(outcome.text, /owning-spec: \[Owning spec\]\(\.\/infra-base\.spec\.md\)/);
      assert.doesNotMatch(outcome.text, /existing Target Files/);

      const ticket = readFileSync(join(root, outcome.path), 'utf-8');
      assert.match(ticket, /^- \*\*Task-ID:\*\* INF-setup\s+<!-- semantic slug;/m);
      assert.match(ticket, /^- \*\*Status:\*\* \[ \] TODO\b/m);
      assert.match(ticket, /^- \*\*Scope:\*\* infra-base$/m);
      assert.match(ticket, /^- \*\*Module:\*\* N\/A$/m);
      assert.match(ticket, /^- \*\*Structural Owner:\*\* infrastructure-flat$/m);
      assert.match(ticket, /^- \*\*Owning Spec:\*\* \[Owning spec\]\(\.\/infra-base\.spec\.md\)$/m);
    } finally {
      process.chdir(previous);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses duplicate contract-anchor slugs before writing the task', async () => {
    const root = join(tmpDir, 'duplicate-contract-anchor');
    const scopeDir = join(root, 'specs', 'infra-base');
    mkdirSync(scopeDir, { recursive: true });
    writeFileSync(
      join(scopeDir, 'infra-base.spec.md'),
      [
        '<!--SECTION:SCOPE_TYPE-->',
        'infrastructure',
        '<!--/SECTION:SCOPE_TYPE-->',
        '#### Service: `Toolchain`',
        'first',
        '#### Service: Toolchain',
        'duplicate',
      ].join('\n'),
      'utf-8'
    );
    const previous = process.cwd();
    process.chdir(root);
    try {
      const outcome = await mod.run(
        argv('task', '--owner', 'infrastructure-flat', '--scope', 'infra-base', '--id', 'INF-dupe')
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) {
        assert.match(outcome.code, /AUTHORING_LITERALS_INVALID/);
        assert.match(outcome.message, /duplicate contract heading slug '#service-toolchain'/);
      }
      assert.equal(existsSync(join(scopeDir, 'infra-base.task.INF-dupe.md')), false);
    } finally {
      process.chdir(previous);
    }
  });

  it('refuses task creation instead of guessing when the project rule registry is malformed', async () => {
    const root = join(tmpDir, 'malformed-rule-registry');
    writeScope(root, 'infra-base', 'infrastructure');
    mkdirSync(join(root, 'ai', 'directives'), { recursive: true });
    writeFileSync(join(root, 'ai', 'directives', 'knowledge.xml'), '<Rules></Rules>');
    const previous = process.cwd();
    process.chdir(root);
    try {
      const outcome = await mod.run(
        argv('task', '--owner', 'infrastructure-flat', '--scope', 'infra-base', '--id', 'INF-safe')
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) {
        assert.match(outcome.code, /RULE_REGISTRY_INVALID/);
        assert.match(outcome.message, /do not guess rule IDs or hrefs/);
      }
      assert.equal(
        existsSync(join(root, 'specs', 'infra-base', 'infra-base.task.INF-safe.md')),
        false
      );
    } finally {
      process.chdir(previous);
    }
  });

  it('rejects ordinary product flat work and does not let --out bypass the explicit owner', async () => {
    const root = join(tmpDir, 'typed-owner-negatives');
    const scopeDir = join(root, 'specs', 'shop');
    const moduleDir = join(scopeDir, 'checkout');
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(
      join(scopeDir, 'shop.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\nproduct\n<!--/SECTION:SCOPE_TYPE-->\n<!--SECTION:MODULE_MAP-->\n- [checkout](./checkout/checkout.spec.md)\n<!--/SECTION:MODULE_MAP-->'
    );
    writeFileSync(
      join(moduleDir, 'checkout.spec.md'),
      '<!--SECTION:MODULE_VISION-->\ncheckout\n<!--/SECTION:MODULE_VISION-->'
    );
    const previous = process.cwd();
    process.chdir(root);
    try {
      const ordinaryFlat = await mod.run(
        argv('task', '--owner', 'module', '--scope', 'shop', '--id', 'SHP-flat')
      );
      assert.strictEqual(ordinaryFlat.ok, false);
      if (!ordinaryFlat.ok) assert.match(ordinaryFlat.message, /owner module requires --module/);

      const outBypass = await mod.run(
        argv(
          'task',
          '--owner',
          'scope-bootstrap',
          '--id',
          'SHP-bypass',
          '--out',
          'specs/shop/checkout/bypass.task.md'
        )
      );
      assert.strictEqual(outBypass.ok, false);
      if (!outBypass.ok) {
        assert.match(outBypass.message, /owner scope-bootstrap does not accept --module/);
      }
    } finally {
      process.chdir(previous);
    }
  });

  it('rejects a ghost module and infers the exact declared module from --out', async () => {
    const root = join(tmpDir, 'module-task-owner');
    const scopeDir = join(root, 'specs', 'shop');
    const moduleDir = join(scopeDir, 'checkout');
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(
      join(scopeDir, 'shop.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\nproduct\n<!--/SECTION:SCOPE_TYPE-->\n<!--SECTION:MODULE_MAP-->\n- [checkout](./checkout/checkout.spec.md)\n<!--/SECTION:MODULE_MAP-->'
    );
    writeFileSync(
      join(moduleDir, 'checkout.spec.md'),
      '<!--SECTION:MODULE_VISION-->\ncheckout\n<!--/SECTION:MODULE_VISION-->'
    );
    const previous = process.cwd();
    process.chdir(root);
    try {
      const ghost = await mod.run(
        argv(
          'task',
          '--owner',
          'module',
          '--scope',
          'shop',
          '--module',
          'ghost',
          '--id',
          'SHP-ghost'
        )
      );
      assert.strictEqual(ghost.ok, false);
      if (!ghost.ok) assert.match(ghost.message, /no exact canonical|not an exact declared/);

      const out = 'specs/shop/checkout/custom.task.md';
      const inferred = await mod.run(
        argv('task', '--owner', 'module', '--id', 'SHP-owned', '--out', out)
      );
      assert.strictEqual(inferred.ok, true, inferred.ok ? '' : inferred.message);
      assert.strictEqual(existsSync(join(root, out)), true);
    } finally {
      process.chdir(previous);
    }
  });

  it('rejects an explicit module that conflicts with ownership inferred from --out', async () => {
    const root = join(tmpDir, 'module-out-conflict');
    const scopeDir = join(root, 'specs', 'shop');
    for (const module of ['one', 'two']) {
      mkdirSync(join(scopeDir, module), { recursive: true });
      writeFileSync(
        join(scopeDir, module, `${module}.spec.md`),
        '<!--SECTION:MODULE_VISION-->\nmodule\n<!--/SECTION:MODULE_VISION-->'
      );
    }
    writeFileSync(
      join(scopeDir, 'shop.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\nproduct\n<!--/SECTION:SCOPE_TYPE-->\n<!--SECTION:MODULE_MAP-->\n- [one](./one/one.spec.md)\n- [two](./two/two.spec.md)\n<!--/SECTION:MODULE_MAP-->'
    );
    const previous = process.cwd();
    process.chdir(root);
    try {
      const outcome = await mod.run(
        argv(
          'task',
          '--owner',
          'module',
          '--scope',
          'shop',
          '--module',
          'two',
          '--id',
          'SHP-conflict',
          '--out',
          'specs/shop/one/task.md'
        )
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) assert.match(outcome.message, /conflicts with --out module owner one/);
    } finally {
      process.chdir(previous);
    }
  });

  it('rejects incomplete decomposition even when a module-like file exists', async () => {
    const root = join(tmpDir, 'incomplete-decomposition');
    const scopeDir = join(root, 'specs', 'shop');
    const moduleDir = join(scopeDir, 'checkout');
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(
      join(scopeDir, 'shop.spec.md'),
      [
        '<!--SECTION:SCOPE_TYPE-->',
        'product',
        '<!--/SECTION:SCOPE_TYPE-->',
        '<!--SECTION:MODULE_MAP-->',
        '- [missing](./missing/missing.spec.md)',
        '<!--/SECTION:MODULE_MAP-->',
      ].join('\n')
    );
    writeFileSync(
      join(moduleDir, 'checkout.spec.md'),
      '<!--SECTION:MODULE_VISION-->\ncheckout\n<!--/SECTION:MODULE_VISION-->'
    );
    const previous = process.cwd();
    process.chdir(root);
    try {
      const outcome = await mod.run(
        argv('task', '--owner', 'scope-bootstrap', '--scope', 'shop', '--id', 'SHP-gap')
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) {
        assert.match(outcome.message, /declared module spec missing\/missing\.spec\.md is missing/);
        assert.match(outcome.message, /checkout\/checkout\.spec\.md is undeclared/);
      }
    } finally {
      process.chdir(previous);
    }
  });

  it('fails closed when the task scope spec is missing', async () => {
    const root = join(tmpDir, 'missing-scope-spec');
    mkdirSync(root, { recursive: true });
    const previous = process.cwd();
    process.chdir(root);
    try {
      const outcome = await mod.run(
        argv('task', '--owner', 'scope-bootstrap', '--scope', 'ghost', '--id', 'GHO-task')
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) {
        assert.match(outcome.code, /SCOPE_NOT_DECOMPOSED/);
        assert.match(outcome.message, /missing or unreadable/);
      }
    } finally {
      process.chdir(previous);
    }
  });

  it('fails closed on malformed or ambiguous SCOPE_TYPE evidence', async () => {
    const root = join(tmpDir, 'bad-scope-types');
    writeScope(root, 'malformed', 'not-a-scope-type');
    writeScope(root, 'ambiguous', 'product\nlibrary');
    const previous = process.cwd();
    process.chdir(root);
    try {
      const malformed = await mod.run(
        argv('task', '--owner', 'scope-bootstrap', '--scope', 'malformed', '--id', 'BAD-type')
      );
      const ambiguous = await mod.run(
        argv('task', '--owner', 'scope-bootstrap', '--scope', 'ambiguous', '--id', 'AMB-type')
      );
      assert.strictEqual(malformed.ok, false);
      assert.strictEqual(ambiguous.ok, false);
      if (!malformed.ok) assert.match(malformed.message, /literal is unsupported/);
      if (!ambiguous.ok) assert.match(ambiguous.message, /exactly one literal/);
    } finally {
      process.chdir(previous);
    }
  });

  it('does not accept a fenced example as canonical SCOPE_TYPE evidence', async () => {
    const root = join(tmpDir, 'fenced-scope-type');
    writeScope(root, 'example-only', '```text\nproduct\n```');
    const previous = process.cwd();
    process.chdir(root);
    try {
      const outcome = await mod.run(
        argv('task', '--owner', 'scope-bootstrap', '--scope', 'example-only', '--id', 'EXA-ticket')
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) assert.match(outcome.message, /exactly one literal/);
    } finally {
      process.chdir(previous);
    }
  });

  it('does not give interface a direct task-scaffold route, even with module-like files present', async () => {
    const root = join(tmpDir, 'interface-no-modules');
    writeScope(root, 'api-contract', 'interface');
    const moduleDir = join(root, 'specs', 'api-contract', 'client');
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(
      join(moduleDir, 'client.spec.md'),
      '<!--SECTION:MODULE_VISION-->\n## Vision\nclient\n<!--/SECTION:MODULE_VISION-->',
      'utf-8'
    );
    const previous = process.cwd();
    process.chdir(root);
    try {
      const outcome = await mod.run(
        argv(
          'task',
          '--owner',
          'infrastructure-flat',
          '--scope',
          'api-contract',
          '--id',
          'API-ticket'
        )
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) {
        assert.match(outcome.message, /interface scopes have no direct task-scaffold route/);
        assert.match(outcome.message, /interface scopes have no direct task-scaffold route/);
      }
    } finally {
      process.chdir(previous);
    }
  });

  it('creates a task at a custom --out path in both equals and separated forms', async () => {
    const root = join(tmpDir, 'task-custom-out');
    writeScope(root, 'infra-base', 'infrastructure');
    const previous = process.cwd();
    process.chdir(root);
    try {
      const equalsPath = 'specs/infra-base/custom/equals.task.md';
      const separatedPath = 'specs/infra-base/custom/separated.task.md';
      const equals = await mod.run(
        argv(
          'task',
          '--owner',
          'infrastructure-flat',
          '--scope',
          'infra-base',
          '--id',
          'INF-equal',
          `--out=${equalsPath}`
        )
      );
      const separated = await mod.run(
        argv(
          'task',
          '--owner',
          'infrastructure-flat',
          '--scope',
          'infra-base',
          '--id',
          'INF-separate',
          '--out',
          separatedPath
        )
      );
      assert.strictEqual(equals.ok, true);
      assert.strictEqual(separated.ok, true);
      assert.strictEqual(existsSync(join(root, equalsPath)), true);
      assert.strictEqual(existsSync(join(root, separatedPath)), true);
    } finally {
      process.chdir(previous);
    }
  });

  it('infers task --scope from the one canonical scope ancestor of --out', async () => {
    const root = join(tmpDir, 'task-inferred-scope');
    writeScope(root, 'infra-base', 'infrastructure');
    const previous = process.cwd();
    process.chdir(root);
    try {
      const out = 'specs/infra-base/custom/ticket.md';
      const outcome = await mod.run(
        argv('task', '--owner', 'infrastructure-flat', '--id', 'INF-inferred', '--out', out)
      );
      assert.strictEqual(outcome.ok, true, outcome.ok ? '' : outcome.message);
      assert.strictEqual(existsSync(join(root, out)), true);
    } finally {
      process.chdir(previous);
    }
  });

  it('rejects a non-kebab scope owner inferred from task --out before writing the ticket', async () => {
    const root = join(tmpDir, 'task-invalid-inferred-scope');
    writeScope(root, 'bad_scope', 'infrastructure');
    const previous = process.cwd();
    process.chdir(root);
    try {
      const out = 'specs/bad_scope/custom/ticket.md';
      const outcome = await mod.run(
        argv('task', '--owner', 'infrastructure-flat', '--id', 'BAD-owner', '--out', out)
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) {
        assert.strictEqual(outcome.exitCode, 4);
        assert.match(outcome.message, /inferred an invalid owner/);
        assert.match(outcome.message, /--scope "bad_scope" is not kebab-case/);
      }
      assert.strictEqual(existsSync(join(root, out)), false);
    } finally {
      process.chdir(previous);
    }
  });

  it('fails closed when task --out has no owner or multiple canonical scope ancestors', async () => {
    const root = join(tmpDir, 'task-owner-failures');
    writeScope(root, 'outer', 'infrastructure');
    writeScope(join(root, 'specs', 'outer'), 'inner', 'infrastructure');
    const previous = process.cwd();
    process.chdir(root);
    try {
      const noOwner = await mod.run(
        argv(
          'task',
          '--owner',
          'infrastructure-flat',
          '--id',
          'OWN-none',
          '--out',
          'custom/ticket.md'
        )
      );
      assert.strictEqual(noOwner.ok, false);
      if (!noOwner.ok) assert.match(noOwner.message, /cannot prove task --out ownership/);

      const ambiguous = await mod.run(
        argv(
          'task',
          '--owner',
          'infrastructure-flat',
          '--id',
          'OWN-many',
          '--out',
          'specs/outer/specs/inner/ticket.md'
        )
      );
      assert.strictEqual(ambiguous.ok, false);
      if (!ambiguous.ok) assert.match(ambiguous.message, /ambiguous scope owners \(inner, outer\)/);
    } finally {
      process.chdir(previous);
    }
  });

  it('rejects absolute, traversal, and ownerless task --out even with an explicit scope', async () => {
    const root = join(tmpDir, 'task-unsafe-out');
    writeScope(root, 'infra-base', 'infrastructure');
    const previous = process.cwd();
    process.chdir(root);
    try {
      const cases = [
        join(root, 'specs', 'infra-base', 'absolute.task.md'),
        '../escaped.task.md',
        'custom/ownerless.task.md',
      ];
      for (const out of cases) {
        const outcome = await mod.run(
          argv(
            'task',
            '--owner',
            'infrastructure-flat',
            '--scope',
            'infra-base',
            '--id',
            `INF-${cases.indexOf(out)}`,
            '--out',
            out
          )
        );
        assert.strictEqual(outcome.ok, false, out);
        if (!outcome.ok) {
          assert.strictEqual(outcome.exitCode, 4);
          assert.match(outcome.message, /cannot prove task --out ownership/);
          assert.match(outcome.message, /cannot replace ownership evidence/);
        }
      }
      assert.strictEqual(existsSync(join(root, '..', 'escaped.task.md')), false);
      assert.strictEqual(existsSync(join(root, 'custom', 'ownerless.task.md')), false);
    } finally {
      process.chdir(previous);
    }
  });

  it('rejects task --out through a symlink file or symlink directory without dereferencing it', async () => {
    const root = join(tmpDir, 'task-symlink-out');
    writeScope(root, 'infra-base', 'infrastructure');
    mkdirSync(join(root, 'elsewhere'));
    symlinkSync(join(root, 'elsewhere'), join(root, 'specs', 'infra-base', 'alias-dir'));
    writeFileSync(join(root, 'elsewhere', 'real.task.md'), 'do not overwrite');
    symlinkSync(
      join(root, 'elsewhere', 'real.task.md'),
      join(root, 'specs', 'infra-base', 'alias.task.md')
    );
    const previous = process.cwd();
    process.chdir(root);
    try {
      for (const out of [
        'specs/infra-base/alias-dir/new.task.md',
        'specs/infra-base/alias.task.md',
      ]) {
        const outcome = await mod.run(
          argv(
            'task',
            '--owner',
            'infrastructure-flat',
            '--scope',
            'infra-base',
            '--id',
            `INF-link-${out.length}`,
            '--out',
            out
          )
        );
        assert.strictEqual(outcome.ok, false, out);
        if (!outcome.ok) assert.match(outcome.message, /symlink component/);
      }
      assert.strictEqual(existsSync(join(root, 'elsewhere', 'new.task.md')), false);
      assert.strictEqual(
        readFileSync(join(root, 'elsewhere', 'real.task.md'), 'utf-8'),
        'do not overwrite'
      );
    } finally {
      process.chdir(previous);
    }
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

  it('creates a flat task ticket (no --module) at specs/<scope>/<scope>.task.<id>.md', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sdd-new-flat-'));
    const prevCwd = process.cwd();
    try {
      writeScope(cwd, 'demo', 'infrastructure');
      process.chdir(cwd);
      const outcome = await mod.run(
        argv('task', '--owner', 'infrastructure-flat', '--scope', 'demo', '--id', 'DEM-x')
      );
      assert.strictEqual(outcome.ok, true);
      if (outcome.ok) {
        assert.strictEqual(outcome.path, 'specs/demo/demo.task.DEM-x.md');
        assert.ok(existsSync(outcome.path));
        assert.match(
          outcome.text,
          /Task-ID: DEM-x — во всех дальнейших ссылках используй ровно этот ID\./
        );
      }
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('creates a flat module-index (no --module) at specs/<scope>/<scope>.3-tasks.md', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sdd-new-flat-idx-'));
    const prevCwd = process.cwd();
    try {
      process.chdir(cwd);
      const outcome = await mod.run(argv('module-index', '--scope', 'demo'));
      assert.strictEqual(outcome.ok, true);
      if (outcome.ok) {
        assert.strictEqual(outcome.path, 'specs/demo/demo.3-tasks.md');
        assert.ok(existsSync(outcome.path));
      }
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
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
      assert.match(outcome.text, /Create output is path-aware/);
      assert.doesNotMatch(outcome.text, /owning-spec: \[/);
      assert.match(outcome.text, /infrastructure-flat \| infrastructure \| forbidden/);
      assert.match(outcome.text, /scope-bootstrap \| product\/library \| forbidden/);
      assert.match(outcome.text, /module \| product\/library \| required/);
      assert.match(outcome.text, /No other task owner form is legal/);
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
        argv(
          'task',
          '--owner',
          'infrastructure-flat',
          '--scope',
          's',
          '--module',
          'm',
          '--id',
          'bad_id'
        )
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
        argv(
          'task',
          '--owner',
          'infrastructure-flat',
          '--scope',
          's',
          '--module',
          'm',
          '--id',
          'GAT-abcdefghi'
        )
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
        argv('task', '--owner', 'infrastructure-flat', '--scope', 's', '--id', 'GAT-login')
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
        argv(
          'task',
          '--owner',
          'infrastructure-flat',
          '--scope',
          's',
          '--module',
          'm',
          '--id',
          'GAT-gates-v2'
        )
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
      writeScope(cwd, 's', 'infrastructure');
      process.chdir(cwd);
      const outcome = await mod.run(
        argv('task', '--owner', 'infrastructure-flat', '--scope', 's', '--id', 'GAT-login')
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

  describe('research kind', () => {
    it('--list includes research with its date+slug path pattern', async () => {
      const outcome = await mod.run(argv('--list'));
      assert.strictEqual(outcome.ok, true);
      if (outcome.ok) {
        assert.match(
          outcome.text,
          /research\s+specs\/<scope>\/research\/<yyyy-mm-dd>-<slug>\.research\.md/
        );
      }
    });

    it('rejects research with --scope but no --slug, exit 4 / BAD_INVOCATION', async () => {
      const outcome = await mod.run(argv('research', '--scope', 'demo'));
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) {
        assert.strictEqual(outcome.exitCode, 4);
        assert.match(outcome.code, /BAD_INVOCATION/);
        assert.match(outcome.message, /--slug/);
      }
    });

    it('rejects research with no --scope and no --slug, exit 4 / BAD_INVOCATION', async () => {
      const outcome = await mod.run(argv('research'));
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) assert.strictEqual(outcome.exitCode, 4);
    });

    it('rejects a non-kebab-case --slug before touching the filesystem', async () => {
      const outcome = await mod.run(argv('research', '--scope', 'demo', '--slug', 'Not_Kebab'));
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) {
        assert.strictEqual(outcome.exitCode, 4);
        assert.match(outcome.message, /kebab-case/);
      }
    });

    it('validateSlug accepts a well-formed kebab-case slug and rejects the rest', () => {
      assert.strictEqual(mod.validateSlug('ai-tooling-stack'), null);
      assert.match(mod.validateSlug('') ?? '', /empty/);
      assert.match(mod.validateSlug('Ai_Tooling') ?? '', /kebab-case/);
    });

    it('todayDateStamp formats yyyy-mm-dd, zero-padded', () => {
      assert.strictEqual(mod.todayDateStamp(new Date(2026, 0, 5)), '2026-01-05');
      assert.strictEqual(mod.todayDateStamp(new Date(2026, 11, 31)), '2026-12-31');
    });

    it('resolvePath: specs/<scope>/research/<date>-<slug>.research.md, date is caller-supplied', () => {
      const path = mod.resolvePath('research', {
        scope: 'demo',
        slug: 'ai-tooling-stack',
        date: '2026-08-18',
      });
      assert.strictEqual(path, 'specs/demo/research/2026-08-18-ai-tooling-stack.research.md');
    });

    it('--manifest lists STATUS/PROBLEM/OPTIONS/DECISION/EVIDENCE as REQUIRED, without --scope/--slug', async () => {
      const outcome = await mod.run(argv('research', '--manifest'));
      assert.strictEqual(outcome.ok, true);
      if (outcome.ok) {
        assert.match(outcome.text, /manifest for research/);
        for (const name of ['STATUS', 'PROBLEM', 'OPTIONS', 'DECISION', 'EVIDENCE']) {
          assert.match(outcome.text, new RegExp(`${name}\\s+REQUIRED`));
        }
      }
    });

    it('creates a research doc at specs/<scope>/research/<today>-<slug>.research.md and reports the section manifest', async () => {
      const cwd = mkdtempSync(join(tmpdir(), 'sdd-new-research-'));
      const prevCwd = process.cwd();
      try {
        process.chdir(cwd);
        const outcome = await mod.run(
          argv('research', '--scope', 'demo', '--slug', 'ai-tooling-stack')
        );
        assert.strictEqual(outcome.ok, true);
        if (outcome.ok) {
          const today = mod.todayDateStamp();
          assert.strictEqual(
            outcome.path,
            `specs/demo/research/${today}-ai-tooling-stack.research.md`
          );
          assert.ok(existsSync(outcome.path));
          const written = readFileSync(outcome.path, 'utf-8');
          assert.match(written, /<!--SECTION:STATUS-->/);
          assert.match(written, /<!--SECTION:EVIDENCE-->/);
          assert.match(outcome.text, /created research skeleton/);
          assert.match(outcome.text, /STATUS\s+REQUIRED/);
        }

        // Same-day re-run at the same slug never overwrites — ERR_FILE_EXISTS.
        const again = await mod.run(
          argv('research', '--scope', 'demo', '--slug', 'ai-tooling-stack')
        );
        assert.strictEqual(again.ok, false);
        if (!again.ok) {
          assert.strictEqual(again.exitCode, 1);
          assert.match(again.code, /FILE_EXISTS/);
        }
      } finally {
        process.chdir(prevCwd);
        rmSync(cwd, { recursive: true, force: true });
      }
    });

    it('prints a next: block naming the concrete scope spec to register the doc in (--scope substituted)', async () => {
      const cwd = mkdtempSync(join(tmpdir(), 'sdd-new-research-next-'));
      const prevCwd = process.cwd();
      try {
        process.chdir(cwd);
        const outcome = await mod.run(argv('research', '--scope', 'checkout', '--slug', 'x'));
        assert.strictEqual(outcome.ok, true);
        if (outcome.ok) {
          assert.match(outcome.text, /next:/);
          assert.match(outcome.text, /specs\/checkout\/checkout\.spec\.md/);
          assert.match(outcome.text, /## Research/);
        }
      } finally {
        process.chdir(prevCwd);
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });
});
