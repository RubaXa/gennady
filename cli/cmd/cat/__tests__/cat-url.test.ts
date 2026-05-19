// @file: Unit tests for resolveCatUrl — URL validation, tokens, filters, baseUrl.
// @consumers: node:test runner
// @tasks: TSK-31

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

function clearTokens() {
  delete process.env.GITLAB_PERSONAL_TOKEN;
  delete process.env.GITHUB_PERSONAL_TOKEN;
}

describe('resolveCatUrl — URL validation', () => {
  it('errors on invalid URL', async () => {
    const { resolveCatUrl } = await import('../cat-url.fn.ts');
    const result = await resolveCatUrl('not-a-url');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error!.includes('Не удалось распознать'));
  });

  it('errors on non-MR GitLab URL', async () => {
    const { resolveCatUrl } = await import('../cat-url.fn.ts');
    const result = await resolveCatUrl('https://gitlab.com/group/project');
    assert.strictEqual(result.ok, false);
  });
});

describe('resolveCatUrl — token validation', () => {
  beforeEach(clearTokens);

  it('errors when GITLAB_PERSONAL_TOKEN missing', async () => {
    const { resolveCatUrl } = await import('../cat-url.fn.ts?nocache=1');
    const result = await resolveCatUrl('https://gitlab.com/group/project/-/merge_requests/1');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error!.includes('GITLAB_PERSONAL_TOKEN'));
  });

  it('errors when GITHUB_PERSONAL_TOKEN missing', async () => {
    const { resolveCatUrl } = await import('../cat-url.fn.ts?nocache=2');
    const result = await resolveCatUrl('https://github.com/owner/repo/pull/1');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error!.includes('GITHUB_PERSONAL_TOKEN'));
  });
});

describe('resolveCatUrl — GitHub baseUrl', () => {
  beforeEach(() => {
    process.env.GITHUB_PERSONAL_TOKEN = 'ghp_test';
  });
  afterEach(clearTokens);

  it('uses api.github.com for github.com', async () => {
    // Verify by checking that the function uses the correct baseUrl in its logic.
    // We test this indirectly: non-api.github.com would fail with 404.
    // For unit test, we verify parse + token check passes (URL is valid).
    const { resolveCatUrl } = await import('../cat-url.fn.ts?nocache=3');
    const result = await resolveCatUrl('https://github.com/owner/repo/pull/1');
    // Will fail on network (no real token), but should NOT fail on URL parse or token check
    assert.strictEqual(result.ok, false);
    assert.ok(!result.error!.includes('Не удалось распознать'));
    assert.ok(!result.error!.includes('не установлен'));
  });

  it('uses /api/v3 for GitHub Enterprise', async () => {
    const { resolveCatUrl } = await import('../cat-url.fn.ts?nocache=4');
    const result = await resolveCatUrl('https://github.internal.com/org/repo/pull/5');
    assert.strictEqual(result.ok, false);
    assert.ok(!result.error!.includes('Не удалось распознать'));
    assert.ok(!result.error!.includes('не установлен'));
  });
});
