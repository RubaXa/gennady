// @file: Unit tests for parseVcsUrl — GitLab/GitHub URL parsing.
// @consumers: node:test runner
// @tasks: TSK-27

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseVcsUrl } from '../parse-vcs-url.ts';

describe('parseVcsUrl — valid URLs', () => {
  it('parses standard GitLab MR URL', () => {
    const result = parseVcsUrl('https://gitlab.com/group/project/-/merge_requests/42');
    assert.deepStrictEqual(result, {
      provider: 'gitlab',
      host: 'gitlab.com',
      repository: 'group/project',
      iid: 42,
    });
  });

  it('parses self-hosted GitLab MR URL', () => {
    const result = parseVcsUrl('https://gitlab.company.com/team/repo/-/merge_requests/7');
    assert.deepStrictEqual(result, {
      provider: 'gitlab',
      host: 'gitlab.company.com',
      repository: 'team/repo',
      iid: 7,
    });
  });

  it('parses nested subgroup GitLab MR URL', () => {
    const result = parseVcsUrl('https://gitlab.com/a/b/c/d/-/merge_requests/99');
    assert.deepStrictEqual(result, {
      provider: 'gitlab',
      host: 'gitlab.com',
      repository: 'a/b/c/d',
      iid: 99,
    });
  });

  it('parses standard GitHub PR URL', () => {
    const result = parseVcsUrl('https://github.com/owner/repo/pull/123');
    assert.deepStrictEqual(result, {
      provider: 'github',
      host: 'github.com',
      repository: 'owner/repo',
      iid: 123,
    });
  });

  it('parses self-hosted GitHub PR URL', () => {
    const result = parseVcsUrl('https://github.internal.com/org/repo/pull/5');
    assert.deepStrictEqual(result, {
      provider: 'github',
      host: 'github.internal.com',
      repository: 'org/repo',
      iid: 5,
    });
  });

  it('parses URL with query params', () => {
    const result = parseVcsUrl('https://gitlab.com/group/project/-/merge_requests/42?view=diff');
    assert.deepStrictEqual(result, {
      provider: 'gitlab',
      host: 'gitlab.com',
      repository: 'group/project',
      iid: 42,
    });
  });

  it('parses URL with trailing slash', () => {
    const result = parseVcsUrl('https://github.com/owner/repo/pull/123/');
    assert.deepStrictEqual(result, {
      provider: 'github',
      host: 'github.com',
      repository: 'owner/repo',
      iid: 123,
    });
  });

  it('parses URL with port', () => {
    const result = parseVcsUrl('https://gitlab.example.com:8443/team/repo/-/merge_requests/7');
    assert.deepStrictEqual(result, {
      provider: 'gitlab',
      host: 'gitlab.example.com:8443',
      repository: 'team/repo',
      iid: 7,
    });
  });
});

describe('parseVcsUrl — invalid URLs → null', () => {
  it('returns null for non-MR GitLab URL (issues)', () => {
    assert.strictEqual(parseVcsUrl('https://gitlab.com/group/project/issues/42'), null);
  });

  it('returns null for non-VCS URL', () => {
    assert.strictEqual(parseVcsUrl('https://example.com/page'), null);
  });

  it('returns null for empty string', () => {
    assert.strictEqual(parseVcsUrl(''), null);
  });

  it('returns null for null input', () => {
    assert.strictEqual(parseVcsUrl(null), null);
  });

  it('returns null for undefined input', () => {
    assert.strictEqual(parseVcsUrl(undefined), null);
  });

  it('returns null for GitLab URL without IID', () => {
    assert.strictEqual(parseVcsUrl('https://gitlab.com/group/project/-/merge_requests/'), null);
  });

  it('returns null for GitHub URL without PR number', () => {
    assert.strictEqual(parseVcsUrl('https://github.com/owner/repo/pull/'), null);
  });

  it('returns null for non-numeric IID', () => {
    assert.strictEqual(parseVcsUrl('https://github.com/owner/repo/pull/abc'), null);
  });

  it('returns null for SSH URL', () => {
    assert.strictEqual(parseVcsUrl('git@github.com:group/project.git'), null);
  });
});
