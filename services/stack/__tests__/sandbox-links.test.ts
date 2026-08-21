// @file: Unit tests for sandboxLinks expansion — literals, single-segment globs, unresolved.
// @consumers: CI
// @tasks: TSK-96

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { expandSandboxLinks } = await import('../sandbox-links.ts');

let root: string;

function mk(...relatives: string[]): void {
  for (const relative of relatives) {
    const target = path.join(root, relative);
    if (relative.endsWith('/')) {
      fs.mkdirSync(target, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'x');
    }
  }
}

describe('expandSandboxLinks', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-links-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes an existing literal through and reports a missing one', () => {
    mk('cache/');
    const result = expandSandboxLinks(root, ['cache', 'nope']);

    assert.deepEqual(result.links, ['cache']);
    assert.deepEqual(result.unresolved, ['nope']);
  });

  it('expands a single-segment * against the real tree (the Tuist/Xcode shape)', () => {
    mk(
      'External/AuthKit/Derived/',
      'External/CloudKit/Derived/',
      'External/AuthKit/AuthKit.xcodeproj/',
      'External/CloudKit/CloudKit.xcodeproj/',
      'External/Docs/readme.md'
    );

    const result = expandSandboxLinks(root, ['External/*/Derived', 'External/*/*.xcodeproj']);

    assert.deepEqual(result.links, [
      'External/AuthKit/AuthKit.xcodeproj',
      'External/AuthKit/Derived',
      'External/CloudKit/CloudKit.xcodeproj',
      'External/CloudKit/Derived',
    ]);
    assert.deepEqual(result.unresolved, []);
  });

  it('reports a glob that matched nothing instead of silently dropping it (review P1)', () => {
    mk('cache/data.txt');
    const result = expandSandboxLinks(root, ['cach*', 'cachr*']);

    assert.deepEqual(result.links, ['cache']);
    assert.deepEqual(result.unresolved, ['cachr*']);
  });

  it('does not let a bare * match dotted entries; a literal dot segment still resolves', () => {
    mk('Tuist/.build/', 'Tuist/visible/');
    const result = expandSandboxLinks(root, ['Tuist/*', 'Tuist/.build']);

    assert.deepEqual(result.links, ['Tuist/.build', 'Tuist/visible']);
    assert.deepEqual(result.unresolved, []);
  });

  it('escapes regex metacharacters in literal parts of a glob segment', () => {
    mk('app.xcodeproj/', 'appQxcodeproj/');
    const result = expandSandboxLinks(root, ['*.xcodeproj']);

    assert.deepEqual(result.links, ['app.xcodeproj']);
  });
});
