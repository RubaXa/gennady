// @file: Unit tests for repo-wide stack detection — determinism, node inclusion, `use` narrowing,
//   multi-stack repos, and the anystack-last-resort rule.
// @consumers: CI
// @tasks: V-05, V-05b

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectRepoStack } from '../stack-detection.ts';

/** @purpose Create a temp repo dir with the given root-level marker files, run fn, clean up. */
function withRepo<T>(files: Record<string, string>, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-detection-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('detectRepoStack', () => {
  it('detects node from package.json', () => {
    withRepo({ 'package.json': '{}' }, (dir) => {
      const result = detectRepoStack(dir, null);
      assert.deepEqual(result.stacks, ['node']);
      assert.equal(result.source, 'marker:package.json');
    });
  });

  it('detects golang from go.mod', () => {
    withRepo({ 'go.mod': 'module example.com/x\n\ngo 1.22\n' }, (dir) => {
      const result = detectRepoStack(dir, null);
      assert.deepEqual(result.stacks, ['golang']);
      assert.equal(result.source, 'marker:go.mod');
    });
  });

  it('a multi-stack repo (package.json + go.mod) reports both, sorted', () => {
    withRepo({ 'package.json': '{}', 'go.mod': 'module example.com/x\n\ngo 1.22\n' }, (dir) => {
      const result = detectRepoStack(dir, null);
      assert.deepEqual(result.stacks, ['golang', 'node']);
      assert.equal(result.source, 'marker:go.mod,marker:package.json');
    });
  });

  it('anystack is the last resort — never included alongside a real match', () => {
    withRepo({ 'package.json': '{}' }, (dir) => {
      const result = detectRepoStack(dir, null);
      assert.ok(!result.stacks.includes('anystack'));
    });
  });

  it('a marker-less repo keeps the historical node bootstrap default without stack.use', () => {
    withRepo({}, (dir) => {
      const result = detectRepoStack(dir, null);
      assert.deepEqual(result.stacks, ['node']);
      assert.equal(result.source, 'fallback:node');
    });
  });

  it('anystack remains reachable on a marker-less repo through explicit stack.use', () => {
    withRepo({}, (dir) => {
      const result = detectRepoStack(dir, { use: ['anystack'] });
      assert.deepEqual(result.stacks, ['anystack']);
      assert.equal(result.source, 'config:stack.use');
    });
  });

  it('stack.use narrows the candidates but does not assign a stack that did not detect', () => {
    withRepo({ 'package.json': '{}' }, (dir) => {
      // `use: [golang]` excludes node; go.mod is absent, so nothing detects — anystack still
      // never appears because `use` did not include it either (unmatched stays unmatched).
      const result = detectRepoStack(dir, { use: ['golang'] });
      assert.deepEqual(result.stacks, []);
      assert.equal(result.source, 'config:stack.use');
    });
  });

  it('stack.use narrows node out even though package.json is present', () => {
    withRepo({ 'package.json': '{}', 'go.mod': 'module example.com/x\n\ngo 1.22\n' }, (dir) => {
      const result = detectRepoStack(dir, { use: ['golang'] });
      assert.deepEqual(result.stacks, ['golang']);
      assert.equal(result.source, 'config:stack.use');
    });
  });

  it('is deterministic across repeated calls on the same root', () => {
    withRepo({ 'package.json': '{}' }, (dir) => {
      const first = detectRepoStack(dir, null);
      const second = detectRepoStack(dir, null);
      assert.deepEqual(first.stacks, second.stacks);
      assert.equal(first.source, second.source);
    });
  });
});
