import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupMockAgent } from '#utils/test/mock-http.ts';

describe('setupMockAgent', () => {
  let mockEnv: ReturnType<typeof setupMockAgent>;

  beforeEach(() => {
    mockEnv = setupMockAgent();
  });

  afterEach(() => {
    mockEnv.cleanup();
  });

  it('should intercept a global fetch GET and return the mocked JSON body', async () => {
    mockEnv.interceptOnce('GET', 'https://vendor.test/items/42', {
      status: 200,
      body: { id: 42, name: 'Keyboard' },
    });

    const res = await fetch('https://vendor.test/items/42');
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(data, { id: 42, name: 'Keyboard' });
  });

  it('should let a reply function branch on the request body (intelligent backend)', async () => {
    // contract: one endpoint, response depends on the GraphQL query in the POST body
    mockEnv.interceptOnce('POST', 'https://vendor.test/graphql', (req) => {
      const asksReviewers = (req.body ?? '').includes('reviewRequestedMergeRequests');
      return { status: 200, body: { kind: asksReviewers ? 'reviews' : 'other' } };
    });

    const res = await fetch('https://vendor.test/graphql', {
      method: 'POST',
      body: JSON.stringify({ query: '{ reviewRequestedMergeRequests { count } }' }),
    });
    const data = (await res.json()) as { kind: string };

    assert.strictEqual(data.kind, 'reviews');
  });

  it('should branch on query params via the reply function', async () => {
    mockEnv.interceptOnce('GET', 'https://vendor.test/mrs', (req) => {
      const state = req.query.get('state');
      return { status: 200, body: { state } };
    });

    const res = await fetch('https://vendor.test/mrs?state=opened&per_page=50');
    const data = (await res.json()) as { state: string };

    assert.strictEqual(data.state, 'opened');
  });

  it('should serve sequential replies in order and count attempts', async () => {
    // contract: one transient failure tolerated before success (retry-style)
    const tracker = mockEnv.interceptMultiple('GET', 'https://vendor.test/flaky', [
      { status: 503, body: 'down' },
      { status: 200, body: { ok: true } },
    ]);

    const first = await fetch('https://vendor.test/flaky');
    const second = await fetch('https://vendor.test/flaky');

    assert.strictEqual(first.status, 503);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(tracker.getAttemptCount(), 2);
  });
});
