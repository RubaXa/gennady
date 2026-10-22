// @file: Executable generated scope-owner handoff from scaffold output to pre-portal orientation.
// @spec: CLI-SDD-ORIENT
// @consumers: deterministic CLI regression suite, scope authoring directive

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';
import { runCli } from './run-cli.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

for (const kind of ['product', 'library']) {
  it(`executes the generated ${kind} scope orientation before portal registration`, () => {
    const root = mkdtempSync(join(tmpdir(), 'gennady-scope-orientation-'));
    try {
      const custom = kind === 'library' ? ['--out', 'specs/custom/library.spec.md'] : [];
      const created = runCli(['sdd-new', kind, '--scope', 'brand-new', ...custom], root);
      assert.equal(created.exitCode, 0, created.stderr + created.stdout);
      const path = /^\[sdd-new\] created \w+ skeleton: (.+)$/mu.exec(created.stdout)?.[1];
      assert.ok(path, 'sdd-new must return the exact created path');
      const directive = readFileSync(
        join(ROOT, 'ai/directives/sdd-v2/scope.directive.xml'),
        'utf8'
      );
      const command = /<ToolCall[^>]*result="orientation">([\s\S]*?)<\/ToolCall>/u.exec(
        directive
      )?.[1];
      assert.ok(command, 'the generated scope owner must provide its orientation command');
      const args = command
        .replace(/^npx gennady\s+/u, '')
        .replace('<scope-spec-path>', path)
        .replace('<scope>', 'brand-new')
        .trim()
        .split(/\s+/u);
      assert.equal(existsSync(join(root, 'specs/README.md')), false);
      const unresolvedScope = runCli(['sdd-orient', '--scope', 'brand-new'], root);
      assert.equal(unresolvedScope.exitCode, 4, unresolvedScope.stdout + unresolvedScope.stderr);
      assert.match(unresolvedScope.stdout, /portal.*missing/u);
      const oriented = runCli(args, root);
      assert.equal(oriented.exitCode, 0, oriented.stderr + oriented.stdout);
      assert.ok(oriented.stdout.includes(`neighbourhood — ${path}`), oriented.stdout);
      assert.equal(existsSync(join(root, 'specs/README.md')), false);
      const emptyPortal =
        '# Project\n\n## Scopes\n\n| Scope | Type | Spec | Description |\n|---|---|---|---|\n';
      writeFileSync(join(root, 'specs/README.md'), emptyPortal);
      const unregistered = runCli(['sdd-orient', '--scope', 'brand-new'], root);
      assert.equal(unregistered.exitCode, 4, unregistered.stdout + unregistered.stderr);
      assert.match(unregistered.stdout, /does not match a --scope name/u);
      const withoutRegistration = runCli(args, root);
      assert.equal(
        withoutRegistration.exitCode,
        0,
        withoutRegistration.stderr + withoutRegistration.stdout
      );
      assert.ok(
        withoutRegistration.stdout.includes(`neighbourhood — ${path}`),
        withoutRegistration.stdout
      );
      assert.equal(readFileSync(join(root, 'specs/README.md'), 'utf8'), emptyPortal);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

for (const custom of [false, true]) {
  it(`executes generated module orientation at its ${custom ? 'custom' : 'default'} manifest path before portal registration`, () => {
    const root = mkdtempSync(join(tmpdir(), 'gennady-module-orientation-'));
    try {
      const scope = runCli(['sdd-new', 'library', '--scope', 'brand-new'], root);
      assert.equal(scope.exitCode, 0, scope.stderr + scope.stdout);
      const out = custom ? ['--out', 'specs/brand-new/nested/core.spec.md'] : [];
      const created = runCli(
        ['sdd-new', 'module', '--scope', 'brand-new', '--module', 'core', ...out],
        root
      );
      assert.equal(created.exitCode, 0, created.stderr + created.stdout);
      const path = /^\[sdd-new\] created module skeleton: (.+)$/mu.exec(created.stdout)?.[1];
      assert.ok(path, 'moduleManifest must provide the exact created path');
      const directive = readFileSync(
        join(ROOT, 'ai/directives/sdd-v2/module.directive.xml'),
        'utf8'
      );
      const command = /<ToolCall[^>]*result="orientation">([\s\S]*?)<\/ToolCall>/u.exec(
        directive
      )?.[1];
      assert.ok(command, 'the generated module owner must provide its orientation command');
      const args = command
        .replace(/^npx gennady\s+/u, '')
        .replace('<module-spec-path>', path)
        .trim()
        .split(/\s+/u);
      assert.equal(existsSync(join(root, 'specs/README.md')), false);
      const priorCall = runCli(['sdd-orient', '--scope', 'brand-new'], root);
      assert.equal(priorCall.exitCode, 4, priorCall.stdout + priorCall.stderr);
      assert.match(priorCall.stdout, /portal.*missing/u);
      const oriented = runCli(args, root);
      assert.equal(oriented.exitCode, 0, oriented.stderr + oriented.stdout);
      assert.ok(oriented.stdout.includes(`neighbourhood — ${path}`), oriented.stdout);
      assert.equal(existsSync(join(root, 'specs/README.md')), false);
      const emptyPortal =
        '# Project\n\n## Scopes\n\n| Scope | Type | Spec | Description |\n|---|---|---|---|\n';
      writeFileSync(join(root, 'specs/README.md'), emptyPortal);
      const unregistered = runCli(['sdd-orient', '--scope', 'brand-new'], root);
      assert.equal(unregistered.exitCode, 4, unregistered.stdout + unregistered.stderr);
      assert.match(unregistered.stdout, /does not match a --scope name/u);
      const withoutRegistration = runCli(args, root);
      assert.equal(
        withoutRegistration.exitCode,
        0,
        withoutRegistration.stderr + withoutRegistration.stdout
      );
      assert.ok(
        withoutRegistration.stdout.includes(`neighbourhood — ${path}`),
        withoutRegistration.stdout
      );
      assert.equal(readFileSync(join(root, 'specs/README.md'), 'utf8'), emptyPortal);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
