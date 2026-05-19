// @file: Unit tests for catGenFromVcs — pure function converting VCS files to CatGenResult[].
// @consumers: node:test runner
// @tasks: TSK-31

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { catGenFromVcs } from '../cat-gen.ts';
import type { VcsMergeRequestChanges } from '../../../services/vcs-client/entities/vcs-merge-request-changes.type.ts';
import type { VcsFileContent } from '../../../services/vcs-client/entities/vcs-file-content.type.ts';

describe('catGenFromVcs', () => {
  it('returns all non-deleted files', () => {
    const changes: VcsMergeRequestChanges[] = [
      { path: 'src/a.ts', status: 'modified', ref: 'main' },
      { path: 'src/b.go', status: 'added', ref: 'main' },
      { path: 'Dockerfile', status: 'modified', ref: 'main' },
    ];
    const files: VcsFileContent[] = [
      { path: 'src/a.ts', content: 'a', encoding: 'utf-8' },
      { path: 'src/b.go', content: 'b', encoding: 'utf-8' },
      { path: 'Dockerfile', content: 'FROM node', encoding: 'utf-8' },
    ];

    const result = catGenFromVcs(changes, files);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].relativePath, 'src/a.ts');
    assert.strictEqual(result[1].relativePath, 'src/b.go');
    assert.strictEqual(result[2].relativePath, 'Dockerfile');
  });

  it('skips deleted files', () => {
    const changes: VcsMergeRequestChanges[] = [
      { path: 'src/a.ts', status: 'deleted', ref: 'main' },
      { path: 'src/b.ts', status: 'modified', ref: 'main' },
    ];
    const files: VcsFileContent[] = [
      { path: 'src/a.ts', content: 'a', encoding: 'utf-8' },
      { path: 'src/b.ts', content: 'b', encoding: 'utf-8' },
    ];

    const result = catGenFromVcs(changes, files);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].relativePath, 'src/b.ts');
  });

  it('skips base64 (binary) files', () => {
    const changes: VcsMergeRequestChanges[] = [
      { path: 'img.png', status: 'added', ref: 'main' },
      { path: 'src/a.ts', status: 'modified', ref: 'main' },
    ];
    const files: VcsFileContent[] = [
      { path: 'img.png', content: 'aaa', encoding: 'base64' },
      { path: 'src/a.ts', content: 'code', encoding: 'utf-8' },
    ];

    const result = catGenFromVcs(changes, files);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].relativePath, 'src/a.ts');
  });

  it('includes ref in absPath when available', () => {
    const changes: VcsMergeRequestChanges[] = [
      { path: 'src/a.ts', status: 'modified', ref: 'feature/x' },
    ];
    const files: VcsFileContent[] = [{ path: 'src/a.ts', content: 'code', encoding: 'utf-8' }];

    const result = catGenFromVcs(changes, files);
    assert.ok(result[0].absPath.includes('ref=feature/x'));
  });
});
