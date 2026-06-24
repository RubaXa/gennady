// @file: Unit tests for projectFromRemoteUrl.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectFromRemoteUrl } from './locate-clone.logic.ts';

describe('projectFromRemoteUrl', () => {
  it('parses ssh remote', () => {
    assert.strictEqual(
      projectFromRemoteUrl('git@gitlab.corp.mail.ru:mail-core/wisehub.git'),
      'mail-core/wisehub'
    );
  });

  it('parses https remote', () => {
    assert.strictEqual(
      projectFromRemoteUrl('https://gitlab.corp.mail.ru/vk-workspace/superapp.git'),
      'vk-workspace/superapp'
    );
  });

  it('handles nested groups and no .git suffix', () => {
    assert.strictEqual(
      projectFromRemoteUrl('https://gitlab.corp.mail.ru/infra/iaas/ansible-devint'),
      'infra/iaas/ansible-devint'
    );
  });

  it('returns null on garbage', () => {
    assert.strictEqual(projectFromRemoteUrl(''), null);
    assert.strictEqual(projectFromRemoteUrl('not a url'), null);
  });
});
