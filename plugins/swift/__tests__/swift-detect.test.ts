// @file: Unit tests for Swift/Xcode/Tuist marker and build-definition discovery.
// @spec: CLI-VERIFY
// @consumers: CI

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

const { detectSwiftProject, discoverSwiftBuildDefinitions } =
  await import('../swift-detect.logic.ts');

const roots: string[] = [];

/** @purpose Create an isolated repository-shaped directory. */
function fixture(files: Readonly<Record<string, string>>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swift-detect-'));
  roots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('detectSwiftProject', () => {
  it('does not assign Swift without a canonical project marker', () => {
    const root = fixture({ 'Sources/App.swift': 'print("hello")\n' });

    assert.equal(detectSwiftProject(root), null);
  });

  it('does not assign Swift from a nested dependency Package.swift alone', () => {
    const root = fixture({ 'Dependencies/Some/Package.swift': '// swift-tools-version: 6.0\n' });

    assert.equal(detectSwiftProject(root), null);
    assert.deepEqual(discoverSwiftBuildDefinitions(root), ['Dependencies/Some/Package.swift']);
  });

  it('does not assign Swift from nested Tuist root markers', () => {
    const root = fixture({
      'Vendor/Foo/Project.swift': 'import ProjectDescription\n',
      'Vendor/Bar/Workspace.swift': 'import ProjectDescription\n',
    });

    assert.equal(detectSwiftProject(root), null);
    assert.deepEqual(discoverSwiftBuildDefinitions(root), [
      'Vendor/Bar/Workspace.swift',
      'Vendor/Foo/Project.swift',
    ]);
  });

  it('accepts literal root Tuist project and workspace markers', () => {
    const root = fixture({
      'Project.swift': 'import ProjectDescription\n',
      'Workspace.swift': 'import ProjectDescription\n',
    });

    const project = detectSwiftProject(root);

    assert.equal(project?.kind, 'xcode');
    assert.deepEqual(project?.markers, ['Project.swift', 'Workspace.swift']);
  });

  it('uses SwiftPM defaults only for a root Package.swift', () => {
    const root = fixture({
      'Package.swift': '// swift-tools-version: 6.0\n',
      'Package.resolved': '{}\n',
      'Sources/App.swift': 'print("hello")\n',
    });

    const project = detectSwiftProject(root);

    assert.equal(project?.kind, 'package');
    assert.deepEqual(project?.markers, ['Package.swift']);
  });

  it('classifies Xcode and Tuist markers without guessing project-specific argv', () => {
    const root = fixture({
      'App.xcodeproj/project.pbxproj': '// !$*UTF8*$!\n',
      'Project.swift': 'import ProjectDescription\n',
      'Tuist/Package.swift': '// swift-tools-version: 6.0\n',
      'Tuist/Package.resolved': '{}\n',
    });

    const project = detectSwiftProject(root);

    assert.equal(project?.kind, 'xcode');
    assert.deepEqual(project?.manifests, [
      'App.xcodeproj/project.pbxproj',
      'Project.swift',
      'Tuist/Package.resolved',
      'Tuist/Package.swift',
    ]);
  });

  it('discovers the D-SWIFT-ENV manifest set in deterministic repo-relative order', () => {
    const root = fixture({
      '.mise.toml': '[tools]\nswift = "6"\n',
      'Package.resolved': '{}\n',
      'Package.swift': '// swift-tools-version: 6.0\n',
      'Project.swift': 'import ProjectDescription\n',
      'Workspace.swift': 'import ProjectDescription\n',
      'Tuist/Package.resolved': '{}\n',
      'Tuist/Package.swift': '// swift-tools-version: 6.0\n',
      'project.yml': 'name: App\n',
      'Tests/App.xctestplan': '{}\n',
      'App.xcodeproj/project.pbxproj': '// project\n',
      'App.xcworkspace/contents.xcworkspacedata': '<Workspace/>\n',
      'DerivedData/ignored/Project.swift': 'ignored\n',
      '.build/checkouts/ignored/Package.swift': 'ignored\n',
    });

    const manifests = discoverSwiftBuildDefinitions(root);

    assert.deepEqual(manifests, [...manifests].sort());
    assert.deepEqual(manifests, [
      '.mise.toml',
      'App.xcodeproj/project.pbxproj',
      'App.xcworkspace/contents.xcworkspacedata',
      'Package.resolved',
      'Package.swift',
      'Project.swift',
      'Tests/App.xctestplan',
      'Tuist/Package.resolved',
      'Tuist/Package.swift',
      'Workspace.swift',
      'project.yml',
    ]);
  });
});
