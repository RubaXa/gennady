// @file: Black-box proof for production VcsInboxReal through bounded GitLab GraphQL discovery.
// @consumers: node:test runner
// @tasks: TSK-110, TSK-174
// The PRODUCTION VcsInboxReal adapter (through VcsGitlabClient + the real
// GraphQL query and normalization) runs unchanged; only the network is faked at the undici
// layer. The adapter believes it is calling the real GitLab instance. Proves the network-
// interception tier from AX_HTTP_MOCK_AGENT_PATTERN end-to-end for MR discovery.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupMockAgent } from '#utils/test/mock-http.ts';
import { VcsInboxReal } from '../vcs-inbox.real.ts';

const HOST = 'gitlab.test';
const GRAPHQL_URL = `https://${HOST}/api/graphql`;

/** One MergeRequest node in the exact shape ACTIONABLE_QUERY selects. */
function mrNode(o: {
  iid: string;
  path: string;
  title?: string;
  draft?: boolean;
  state?: string;
  author?: string;
  reviewers?: string[];
  approvedBy?: string[];
}) {
  return {
    iid: o.iid,
    title: o.title ?? `MR ${o.iid}`,
    webUrl: `https://${HOST}/${o.path}/-/merge_requests/${o.iid}`,
    updatedAt: '2026-07-20T10:00:00Z',
    draft: o.draft ?? false,
    state: o.state ?? 'opened',
    description: '',
    author: { username: o.author ?? 'someone' },
    reviewers: { nodes: (o.reviewers ?? []).map((username) => ({ username })) },
    approvedBy: { nodes: (o.approvedBy ?? []).map((username) => ({ username })) },
    project: { fullPath: o.path },
  };
}

/** The `data` payload GitLab returns across the bounded actionable source queries. */
function actionableData(source: string) {
  const reviewA = mrNode({
    iid: '164',
    path: 'mail/messenger',
    author: 'alice',
    reviewers: ['me'],
  });
  const reviewB = mrNode({
    iid: '630',
    path: 'vk-workspace/superapp',
    author: 'bob',
    reviewers: ['me'],
  });
  const authored = mrNode({ iid: '900', path: 'infra/iaas/ansible-devint', author: 'me' });
  const assigned = mrNode({ iid: '77', path: 'ops/runbook', author: 'dave' });
  const empty = { nodes: [] };
  return {
    currentUser: {
      todos:
        source === 'todos'
          ? {
              nodes: [
                // Same MR as reviewB, but surfaced via a todo with a CI-failure event —
                // proves role stays 'reviewer' (2 > mentioned 1) and the event decorates it.
                {
                  id: 'gid://gitlab/Todo/1',
                  action: 'build_failed',
                  target: { __typename: 'MergeRequest', ...reviewB },
                },
                // A mention-only MR not present in any connection.
                {
                  id: 'gid://gitlab/Todo/2',
                  action: 'mentioned',
                  target: {
                    __typename: 'MergeRequest',
                    ...mrNode({ iid: '42', path: 'team/docs', author: 'carol' }),
                  },
                },
              ],
            }
          : empty,
      reviewRequestedMergeRequests:
        source === 'reviewRequestedMergeRequests' ? { nodes: [reviewA, reviewB] } : empty,
      assignedMergeRequests: source === 'assignedMergeRequests' ? { nodes: [assigned] } : empty,
      authoredMergeRequests: source === 'authoredMergeRequests' ? { nodes: [authored] } : empty,
    },
  };
}

describe('VcsInboxReal#getActionable (black-box over intercepted network)', () => {
  let mockEnv: ReturnType<typeof setupMockAgent>;

  beforeEach(() => {
    mockEnv = setupMockAgent();
  });

  afterEach(() => {
    mockEnv.cleanup();
  });

  it('should discover, dedup, and role-merge MRs via the real GraphQL path', async () => {
    const sourcePattern =
      /todos\(|reviewRequestedMergeRequests\(|assignedMergeRequests\(|authoredMergeRequests\(/g;
    const reply = (req: { body: string | null }) => {
      const body = req.body ?? '';
      const sources = body.match(sourcePattern) ?? [];
      assert.strictEqual(sources.length, 1);
      const source = sources[0]!.slice(0, -1);
      assert.match(body, new RegExp(`${source}\\(first: 100`));
      return { status: 200, body: { data: actionableData(source) } };
    };
    const tracker = mockEnv.interceptMultiple('POST', GRAPHQL_URL, [reply, reply, reply, reply]);

    const vcs = new VcsInboxReal({ host: HOST, token: 'fake-token' });
    const actionable = await vcs.getActionable();

    // #region ASSERT_DISCOVERY
    assert.strictEqual(tracker.getAttemptCount(), 4);
    const byKey = new Map(actionable.map((m) => [`${m.project}!${m.iid}`, m]));

    // 5 distinct MRs after dedup (reviewB appears in both a todo and the connection).
    assert.strictEqual(actionable.length, 5);

    const superapp = byKey.get('vk-workspace/superapp!630');
    assert.ok(superapp, 'reviewB must be present');
    assert.strictEqual(superapp.role, 'reviewer'); // reviewer(2) wins over the todo's mention
    assert.deepStrictEqual(superapp.events, ['ci_failed']); // build_failed todo decorated it

    assert.strictEqual(byKey.get('infra/iaas/ansible-devint!900')?.role, 'author');
    assert.strictEqual(byKey.get('mail/messenger!164')?.role, 'reviewer');
    assert.strictEqual(byKey.get('team/docs!42')?.role, 'mentioned');
    assert.strictEqual(byKey.get('ops/runbook!77')?.role, 'mentioned');
    // #endregion ASSERT_DISCOVERY
  });

  it('should propagate a GraphQL-errors payload as a thrown NETWORK/AUTH error', async () => {
    const errorReply = {
      status: 200,
      body: { errors: [{ message: 'insufficient scope' }] },
    };
    mockEnv.interceptMultiple('POST', GRAPHQL_URL, [
      errorReply,
      errorReply,
      errorReply,
      errorReply,
    ]);

    const vcs = new VcsInboxReal({ host: HOST, token: 'fake-token' });

    await assert.rejects(
      () => vcs.getActionable(),
      (err: unknown) => {
        assert.match((err as Error).message, /\[VcsInboxReal\].*insufficient scope/);
        return true;
      }
    );
  });
});
