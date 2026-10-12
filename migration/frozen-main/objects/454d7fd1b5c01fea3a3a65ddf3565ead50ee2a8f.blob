// @file: Unit tests for VcsGithubClient — composition and auth.
// @consumers: node:test runner
// @tasks: TSK-30

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGithubClient } from '../../github/vcs-github-client.ts';

describe('VcsGithubClient', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has undefined MergeDiscussions (optional port)', () => {
    globalThis.fetch = mock.fn(
      async () => new Response('[]', { status: 200 })
    ) as unknown as typeof fetch;

    const client = new VcsGithubClient({
      baseUrl: 'https://api.github.com',
      token: 'ghp_xxx',
    });
    assert.strictEqual(client.MergeDiscussions, undefined);
  });

  it('has MergeRequests and RepositoryFiles ports', () => {
    globalThis.fetch = mock.fn(
      async () => new Response('[]', { status: 200 })
    ) as unknown as typeof fetch;

    const client = new VcsGithubClient({
      baseUrl: 'https://api.github.com',
      token: 'ghp_xxx',
    });
    assert.ok(client.MergeRequests);
    assert.ok(client.RepositoryFiles);
  });

  it('uses Bearer auth. header', async () => {
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = mock.fn(async (url: string, init?: RequestInit) => {
      capturedHeaders = (init?.headers as Record<string, string>) ?? {};
      return new Response('[]', { status: 200 });
    }) as unknown as typeof fetch;

    const client = new VcsGithubClient({
      baseUrl: 'https://api.github.com',
      token: 'ghp_test',
    });

    try {
      await (
        client.MergeRequests as unknown as { _request: (p: string) => Promise<unknown> }
      )._request?.('/test');
    } catch {
      // ignore stub errors
    }

    assert.strictEqual(capturedHeaders['Authorization'], 'Bearer ghp_test');
  });
});
