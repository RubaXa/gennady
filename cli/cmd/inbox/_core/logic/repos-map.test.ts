// @file: Unit tests for repos-map resolveClonePath.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveClonePath } from './repos-map.logic.ts';

describe('resolveClonePath', () => {
  it('returns the exact project mapping', () => {
    const map = { 'vk-workspace/superapp': '/clones/superapp' };
    assert.strictEqual(resolveClonePath(map, 'vk-workspace/superapp'), '/clones/superapp');
  });

  it('falls back to a group-level prefix', () => {
    const map = { 'mail': '/clones/mail-mono' };
    assert.strictEqual(resolveClonePath(map, 'mail/messenger'), '/clones/mail-mono');
  });

  it('prefers the longest matching prefix', () => {
    const map = { 'mail': '/clones/mono', 'mail/messenger': '/clones/messenger' };
    assert.strictEqual(resolveClonePath(map, 'mail/messenger'), '/clones/messenger');
  });

  it('returns undefined when not configured', () => {
    assert.strictEqual(resolveClonePath({}, 'x/y'), undefined);
  });

  it('does not match a partial path segment', () => {
    const map = { 'mail': '/clones/mono' };
    assert.strictEqual(resolveClonePath(map, 'mailbox/app'), undefined);
  });
});
