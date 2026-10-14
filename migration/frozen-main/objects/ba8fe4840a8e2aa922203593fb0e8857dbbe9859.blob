// @file: Unit tests for golang scope resolution — file-to-package mapping, exclusions, all-mode targets.
// @consumers: CI
// @tasks: TSK-95

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { GoProject, GoTool, GoToolId } from '../golang-detect.logic.ts';

const { resolveGoScope, isStructuralListError } = await import('../golang-scope.logic.ts');

let root: string;

/** @purpose Write a file inside the fixture, creating parent directories as needed. */
function write(relativePath: string, content = 'package x\n'): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

/** @purpose Build a resolved tool stub. */
function tool(id: GoToolId): GoTool {
  return { id, bin: `/usr/bin/${id}`, origin: 'path' };
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

/** @purpose Run git in a fixture dir. */
function git(dir: string, ...args: string[]): void {
  execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    stdio: 'ignore',
  });
}

describe('resolveGoScope — changed mode in a real git repository', () => {
  it('sees committed changes when root is a subdirectory of the git toplevel (review B1)', () => {
    const top = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-scope-git-'));
    try {
      const sub = path.join(top, 'svc');
      fs.mkdirSync(sub);
      fs.writeFileSync(path.join(sub, 'go.mod'), 'module example.com/svc\n\ngo 1.24\n');
      fs.writeFileSync(path.join(sub, 'a.go'), 'package svc\n');
      git(top, 'init', '-q', '-b', 'master');
      git(top, 'add', '-A');
      git(top, 'commit', '-qm', 'init');
      // Change a tracked file and stage it — git diff prints 'svc/a.go' relative to toplevel.
      fs.writeFileSync(path.join(sub, 'a.go'), 'package svc\n\nfunc A() {}\n');
      git(top, 'add', '-A');

      const subProject: GoProject = { ...project(), root: sub };
      const scope = resolveGoScope(subProject, { mode: 'changed', targets: [] });

      assert.deepEqual(scope.packages, ['.'], `note: ${scope.note}`);
    } finally {
      fs.rmSync(top, { recursive: true, force: true });
    }
  });

  it('prefers origin/HEAD over a stale origin/master (review B9)', () => {
    const top = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-scope-head-'));
    try {
      fs.writeFileSync(path.join(top, 'go.mod'), 'module example.com/app\n\ngo 1.24\n');
      fs.writeFileSync(path.join(top, 'a.go'), 'package app\n');
      git(top, 'init', '-q', '-b', 'main');
      git(top, 'add', '-A');
      git(top, 'commit', '-qm', 'c1');
      // Stale origin/master at c1; origin/main and origin/HEAD at c2.
      git(top, 'update-ref', 'refs/remotes/origin/master', 'HEAD');
      fs.writeFileSync(path.join(top, 'b.go'), 'package app\n');
      git(top, 'add', '-A');
      git(top, 'commit', '-qm', 'c2');
      git(top, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
      git(top, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');

      const scope = resolveGoScope({ ...project(), root: top }, { mode: 'changed', targets: [] });

      assert.match(scope.note, /vs origin\/main/);
    } finally {
      fs.rmSync(top, { recursive: true, force: true });
    }
  });

  it('falls back to origin/main over a stale origin/master when origin/HEAD is unset (review B9)', () => {
    const top = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-scope-fallback-'));
    try {
      fs.writeFileSync(path.join(top, 'go.mod'), 'module example.com/app\n\ngo 1.24\n');
      fs.writeFileSync(path.join(top, 'a.go'), 'package app\n');
      git(top, 'init', '-q', '-b', 'main');
      git(top, 'add', '-A');
      git(top, 'commit', '-qm', 'c1');
      // Migration leftover: origin/master frozen at c1, origin/main current, no origin/HEAD —
      // the state after `git remote add` + `fetch` without `set-head`.
      git(top, 'update-ref', 'refs/remotes/origin/master', 'HEAD');
      fs.writeFileSync(path.join(top, 'b.go'), 'package app\n');
      git(top, 'add', '-A');
      git(top, 'commit', '-qm', 'c2');
      git(top, 'update-ref', 'refs/remotes/origin/main', 'HEAD');

      const scope = resolveGoScope({ ...project(), root: top }, { mode: 'changed', targets: [] });

      assert.match(scope.note, /vs origin\/main/);
    } finally {
      fs.rmSync(top, { recursive: true, force: true });
    }
  });
});

describe('isStructuralListError', () => {
  // Strings measured against go1.26. Getting this classification wrong in the permissive
  // direction converts a broken tree into ALL_GATES_PASS, so each class is pinned literally.
  const NOT_A_PACKAGE = [
    'build constraints exclude all Go files in /repo/excluded',
    'no Go files in /repo/docs',
    'main module (example.com/m) does not contain package example.com/m/nested',
    'stat /repo/missing: directory not found',
  ] as const;

  const BROKEN_CODE = [
    'import cycle not allowed',
    'found packages one (a.go) and two (b.go) in /repo/pkg',
  ] as const;

  for (const error of NOT_A_PACKAGE) {
    it(`drops: ${error.slice(0, 44)}`, () => {
      assert.strictEqual(isStructuralListError(error), true);
    });
  }

  for (const error of BROKEN_CODE) {
    it(`keeps: ${error.slice(0, 44)}`, () => {
      assert.strictEqual(
        isStructuralListError(error),
        false,
        'a package the change broke must reach the gates, not vanish from scope'
      );
    });
  }

  it('keeps anything it does not recognize', () => {
    assert.strictEqual(
      isStructuralListError('some future go error nobody has seen'),
      false,
      'an unfamiliar message may cost a false red, never a false green'
    );
  });
});
