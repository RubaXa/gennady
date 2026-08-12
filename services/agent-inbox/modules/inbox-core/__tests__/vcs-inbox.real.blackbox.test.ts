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

/** One MergeRequest node in the exact shape the connection queries select. */
function mrNode(o: {
  iid: string;
  path: string;
  title?: string;
  draft?: boolean;
  state?: string;
  author?: string;
  reviewers?: string[];
  approvedBy?: string[];
  pipelineStatus?: string;
  conflicts?: boolean;
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
    headPipeline: o.pipelineStatus ? { status: o.pipelineStatus } : null,
    conflicts: o.conflicts ?? false,
    project: { fullPath: o.path },
  };
}

/** The `data` payload GitLab returns across the three bounded discovery source queries. */
function actionableData(source: string) {
  const reviewA = mrNode({
    iid: '164',
    path: 'mail/messenger',
    author: 'alice',
    reviewers: ['me'],
  });
  // reviewB carries a FAILED head pipeline — proves ci_failed is now derived from MR
  // facts (headPipeline.status), not from a build_failed pending todo.
  const reviewB = mrNode({
    iid: '630',
    path: 'vk-workspace/superapp',
    author: 'bob',
    reviewers: ['me'],
    pipelineStatus: 'FAILED',
  });
  const authored = mrNode({ iid: '900', path: 'infra/iaas/ansible-devint', author: 'me' });
  const assigned = mrNode({ iid: '77', path: 'ops/runbook', author: 'dave' });
  const empty = { nodes: [] };
  return {
    currentUser: {
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
      /reviewRequestedMergeRequests\(|assignedMergeRequests\(|authoredMergeRequests\(/g;
    const reply = (req: { body: string | null }) => {
      const body = req.body ?? '';
      const sources = body.match(sourcePattern) ?? [];
      assert.strictEqual(sources.length, 1);
      const source = sources[0]!.slice(0, -1);
      assert.match(body, new RegExp(`${source}\\(first: 100`));
      // discovery must not read pending todos
      assert.doesNotMatch(body, /todos\(/);
      return { status: 200, body: { data: actionableData(source) } };
    };
    const tracker = mockEnv.interceptMultiple('POST', GRAPHQL_URL, [reply, reply, reply]);

    const vcs = new VcsInboxReal({ host: HOST, token: 'fake-token' });
    const actionable = await vcs.getActionable();

    // #region ASSERT_DISCOVERY
    assert.strictEqual(tracker.getAttemptCount(), 3);
    const byKey = new Map(actionable.map((m) => [`${m.project}!${m.iid}`, m]));

    // 4 distinct MRs from the three discovery sources (reviewA, reviewB, authored, assigned).
    assert.strictEqual(actionable.length, 4);

    const superapp = byKey.get('vk-workspace/superapp!630');
    assert.ok(superapp, 'reviewB must be present');
    assert.strictEqual(superapp.role, 'reviewer');
    assert.deepStrictEqual(superapp.events, ['ci_failed']); // derived from FAILED head pipeline

    assert.strictEqual(byKey.get('infra/iaas/ansible-devint!900')?.role, 'author');
    assert.strictEqual(byKey.get('mail/messenger!164')?.role, 'reviewer');
    assert.strictEqual(byKey.get('ops/runbook!77')?.role, 'mentioned'); // assigned → mentioned
    // #endregion ASSERT_DISCOVERY
  });

  it('should propagate a GraphQL-errors payload as a thrown NETWORK/AUTH error', async () => {
    const errorReply = {
      status: 200,
      body: { errors: [{ message: 'insufficient scope' }] },
    };
    mockEnv.interceptMultiple('POST', GRAPHQL_URL, [errorReply, errorReply, errorReply]);

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
