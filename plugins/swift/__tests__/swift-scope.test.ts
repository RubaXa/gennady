// @file: Unit tests for deterministic Swift file scope resolution.
// @spec: CLI-VERIFY
// @consumers: CI

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import type { SwiftProject } from '../swift-detect.logic.ts';

const { resolveSwiftScope } = await import('../swift-scope.logic.ts');

const project: SwiftProject = {
  root: '/repo',
  kind: 'package',
  markers: ['Package.swift'],
  manifests: ['Package.swift'],
  tools: {
    swift: { id: 'swift', bin: '/tool/swift' },
    swiftformat: { id: 'swiftformat', bin: '/tool/swiftformat' },
    swiftlint: { id: 'swiftlint', bin: null },
    xcodebuild: { id: 'xcodebuild', bin: null },
  },
  diagnostics: [],
};

describe('resolveSwiftScope', () => {
  it('keeps only deduplicated Swift files in stable absolute order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swift-scope-files-'));
    try {
      fs.mkdirSync(path.join(root, 'Sources'));
      fs.writeFileSync(path.join(root, 'Sources', 'A.swift'), '// A\n');
      fs.writeFileSync(path.join(root, 'Sources', 'Z.swift'), '// Z\n');
      const scope = resolveSwiftScope(
        { ...project, root },
        {
          mode: 'files',
          targets: ['Sources/Z.swift', 'README.md', 'Sources/A.swift', 'Sources/Z.swift'],
        }
      );

      assert.deepEqual(scope.details.files, [
        path.join(root, 'Sources', 'A.swift'),
        path.join(root, 'Sources', 'Z.swift'),
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not silently expand an explicit non-Swift target to the repository', () => {
    const scope = resolveSwiftScope(project, { mode: 'files', targets: ['README.md'] });

    assert.deepEqual(scope.details.files, []);
    assert.match(scope.note, /0 Swift file/);
  });

  it('keeps all mode repository-wide without inventing source paths', () => {
    const scope = resolveSwiftScope(project, { mode: 'all', targets: [] });

    assert.deepEqual(scope.details.files, []);
    assert.equal(scope.details.repoWide, true);
    assert.match(scope.note, /repository scope/);
  });
});

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    stdio: 'ignore',
  });
}

describe('resolveSwiftScope changed mode', () => {
  it('includes branch delta, staged, unstaged, and untracked Swift files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swift-scope-git-'));
    try {
      fs.writeFileSync(path.join(root, 'Package.swift'), '// swift-tools-version: 6.0\n');
      for (const name of ['Branch.swift', 'Staged.swift', 'Unstaged.swift']) {
        fs.writeFileSync(path.join(root, name), '// base\n');
      }
      git(root, 'init', '-q', '-b', 'main');
      git(root, 'add', '-A');
      git(root, 'commit', '-qm', 'base');
      git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
      git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
      fs.writeFileSync(path.join(root, 'Branch.swift'), '// branch\n');
      git(root, 'add', 'Branch.swift');
      git(root, 'commit', '-qm', 'branch');
      fs.writeFileSync(path.join(root, 'Staged.swift'), '// staged\n');
      git(root, 'add', 'Staged.swift');
      fs.writeFileSync(path.join(root, 'Unstaged.swift'), '// unstaged\n');
      fs.writeFileSync(path.join(root, 'Untracked.swift'), '// untracked\n');

      const scope = resolveSwiftScope({ ...project, root }, { mode: 'changed', targets: [] });

      assert.deepEqual(
        scope.details.files.map((file) => path.basename(file)),
        ['Branch.swift', 'Staged.swift', 'Unstaged.swift', 'Untracked.swift']
      );
      assert.equal(scope.details.repoWide, false);
      assert.match(scope.note, /4 Swift file/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('widens a build-definition change to repository scope', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swift-scope-manifest-'));
    try {
      fs.writeFileSync(path.join(root, 'Package.swift'), '// swift-tools-version: 6.0\n');
      git(root, 'init', '-q', '-b', 'main');
      git(root, 'add', '-A');
      git(root, 'commit', '-qm', 'base');
      fs.appendFileSync(path.join(root, 'Package.swift'), '// changed\n');

      const scope = resolveSwiftScope({ ...project, root }, { mode: 'changed', targets: [] });

      assert.equal(scope.details.repoWide, true);
      assert.match(scope.note, /repository scope/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
