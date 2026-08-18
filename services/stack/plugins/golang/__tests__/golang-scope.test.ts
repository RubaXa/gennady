// @file: Unit tests for golang scope resolution — file-to-package mapping, exclusions, all-mode targets.
// @consumers: CI
// @tasks: TSK-95

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GoProject, GoTool, GoToolId } from '../golang-detect.logic.ts';

const { resolveGoScope } = await import('../golang-scope.logic.ts');

let root: string;

/** @purpose Write a file inside the fixture, creating parent directories as needed. */
function write(relativePath: string, content = 'package x\n'): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

/** @purpose Build a resolved tool stub. */
function tool(id: GoToolId): GoTool {
  return { id, bin: `/usr/bin/${id}`, origin: 'path', builtWithGo: null };
}

/** @purpose Build a minimal project fixture rooted at the temporary directory. */
function project(): GoProject {
  return {
    root,
    modules: [{ dir: root, path: 'example.com/app', goVersion: '1.24' }],
    workspace: null,
    vendored: false,
    golangciConfig: null,
    missingGolangciConfigs: [],
    makeTargets: [],
    tools: { go: tool('go'), 'golangci-lint': tool('golangci-lint'), gofmt: tool('gofmt') },
    diagnostics: [],
  };
}

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-scope-'));
  write('go.mod', 'module example.com/app\n\ngo 1.24\n');
  write('internal/foo/foo.go');
  write('internal/foo/foo_test.go');
  write('internal/bar/bar.go');
  write('vendor/example.com/dep/dep.go');
  write('README.md', '# not go\n');
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('resolveGoScope', () => {
  it('maps explicit files to their package directories, deduplicated', () => {
    const scope = resolveGoScope(project(), {
      mode: 'files',
      targets: ['internal/foo/foo.go', 'internal/foo/foo_test.go'],
    });

    assert.deepEqual(scope.packages, ['./internal/foo']);
    assert.equal(scope.files.length, 2);
  });

  it('expands a directory target into the packages beneath it', () => {
    const scope = resolveGoScope(project(), { mode: 'files', targets: ['internal'] });

    assert.deepEqual([...scope.packages].sort(), ['./internal/bar', './internal/foo']);
  });

  it('ignores non-Go targets', () => {
    const scope = resolveGoScope(project(), { mode: 'files', targets: ['README.md'] });

    assert.deepEqual(scope.packages, []);
    assert.deepEqual(scope.files, []);
  });

  it('never scopes into vendor/', () => {
    const scope = resolveGoScope(project(), { mode: 'files', targets: ['.'] });

    assert.ok(!scope.packages.some((pkg) => pkg.includes('vendor')));
  });

  it('uses ./... in all mode and lists Go-bearing top-level paths for the formatter', () => {
    const scope = resolveGoScope(project(), { mode: 'all', targets: [] });

    assert.deepEqual(scope.packages, ['./...']);
    assert.ok(scope.fmtTargets.includes('internal'));
    assert.ok(!scope.fmtTargets.includes('vendor'), 'vendor is never formatted');
  });

  it('keeps formatting targets relative so commands stay readable', () => {
    const scope = resolveGoScope(project(), { mode: 'files', targets: ['internal/foo/foo.go'] });

    assert.deepEqual(scope.fmtTargets, ['internal/foo/foo.go']);
  });

  it('reports an empty scope rather than falling back to the whole repo', () => {
    const scope = resolveGoScope(project(), { mode: 'files', targets: ['does/not/exist.go'] });

    assert.deepEqual(scope.packages, []);
    assert.match(scope.note, /0 file/);
  });
});
