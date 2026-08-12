// @file: Unit tests for VcsGitlabInbox — getActionable todoIds, markTodoDone GraphQL mutation, connection-only sources.
// @consumers: node:test runner
// @tasks: TSK-75

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGitlabInbox } from '../vcs-gitlab-inbox.ts';

type GraphqlFn = ReturnType<typeof mock.fn>;

type InboxTestContext = {
  graphqlFn: GraphqlFn;
  inbox: VcsGitlabInbox;
};

function createInboxTestContext(overrides?: {
  graphqlImpl?: () => Promise<unknown>;
}): InboxTestContext {
  const graphqlFn = mock.fn(overrides?.graphqlImpl ?? (async () => ({})));
  const inbox = new VcsGitlabInbox(graphqlFn);
  return { graphqlFn, inbox };
}

describe('VcsGitlabInbox', () => {
  it('getActionable — todoIds populated from currentUser.todos.nodes for todo sources', async () => {
    // contract: FR-40,41 — todoIds string[] on VcsActionableMr; filled from todo.id for todo-targeted MRs
    // failure mode: do NOT drop todoIds when a todo targets a MergeRequest

    // #region START_GETACTIONABLE_TODO_IDS_SETUP
    const { inbox } = createInboxTestContext({
      graphqlImpl: async () => ({
        currentUser: {
          todos: {
            nodes: [
              {
                id: 'gid://gitlab/Todo/123',
                action: 'review_requested',
                target: {
                  __typename: 'MergeRequest',
                  iid: '42',
                  webUrl: 'https://gitlab.com/group/repo/-/merge_requests/42',
                  title: 'Fix login bug',
                  updatedAt: '2025-01-01T00:00:00Z',
                  draft: false,
                  state: 'opened',
                  description: 'fixes the login',
                  author: { username: 'alice' },
                  reviewers: { nodes: [{ username: 'bob' }] },
                  approvedBy: { nodes: [] },
                  project: { fullPath: 'group/repo' },
                },
              },
            ],
          },
          reviewRequestedMergeRequests: { nodes: [] },
          authoredMergeRequests: { nodes: [] },
        },
      }),
    });
    // #endregion END_GETACTIONABLE_TODO_IDS_SETUP

    const result = await inbox.getActionable();

    // #region START_GETACTIONABLE_TODO_IDS_ASSERT
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0].todoIds, ['gid://gitlab/Todo/123']);
    // #endregion END_GETACTIONABLE_TODO_IDS_ASSERT
  });

  it('markTodoDone — calls GraphQL todoMarkDone mutation with the given todoId', async () => {
    // contract: FR-38,39 — markTodoDone calls todoMarkDone(id) GraphQL mutation
    // failure mode: do NOT alter the id or skip the mutation call

    const { graphqlFn, inbox } = createInboxTestContext();

    await inbox.markTodoDone({ todoId: 'gid://gitlab/Todo/456' });

    // #region START_MARK_TODO_DONE_ASSERT_INTERACTIONS
    assert.strictEqual(graphqlFn.mock.callCount(), 1);
    const [query, variables] = graphqlFn.mock.calls[0].arguments as [
      string,
      Record<string, unknown>,
    ];
    assert.match(query, /todoMarkDone/);
    assert.deepStrictEqual(variables, { input: { id: 'gid://gitlab/Todo/456' } });
    // #endregion END_MARK_TODO_DONE_ASSERT_INTERACTIONS
  });

  it('getActionable — connection-only sources (reviewRequested/authored) yield empty todoIds', async () => {
    // contract: FR-40 — todoIds = [] for connection-only sources; only todo-sourced MRs carry ids
    // failure mode: do NOT invent todoIds for MRs from reviewRequested or authored connections

    // #region START_CONNECTION_ONLY_SETUP
    const { inbox } = createInboxTestContext({
      graphqlImpl: async () => ({
        currentUser: {
          todos: { nodes: [] },
          reviewRequestedMergeRequests: {
            nodes: [
              {
                iid: '10',
                webUrl: 'https://gitlab.com/group/repo/-/merge_requests/10',
                title: 'Add feature X',
                updatedAt: '2025-02-01T00:00:00Z',
                draft: false,
                state: 'opened',
                description: '',
                author: { username: 'carol' },
                reviewers: { nodes: [{ username: 'me' }] },
                approvedBy: { nodes: [] },
                project: { fullPath: 'group/repo' },
              },
            ],
          },
          authoredMergeRequests: {
            nodes: [
              {
                iid: '20',
                webUrl: 'https://gitlab.com/group/repo/-/merge_requests/20',
                title: 'Fix typo',
                updatedAt: '2025-03-01T00:00:00Z',
                draft: false,
                state: 'opened',
                description: '',
                author: { username: 'me' },
                reviewers: { nodes: [] },
                approvedBy: { nodes: [] },
                project: { fullPath: 'group/repo' },
              },
            ],
          },
        },
      }),
    });
    // #endregion END_CONNECTION_ONLY_SETUP

    const result = await inbox.getActionable();

    // #region START_CONNECTION_ONLY_ASSERT
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0].todoIds, []);
    assert.deepStrictEqual(result[1].todoIds, []);
    // #endregion END_CONNECTION_ONLY_ASSERT
  });

  it('getActionable — exposes GraphQL approvalsRequired for the poll-tier approval denominator', async () => {
    // contract: inbox-vcs receives the real required-approval count from the concrete GitLab client
    // failure mode: do not silently replace an unavailable REST detail field with a synthetic denominator

    // #region START_APPROVALS_REQUIRED_SETUP_GRAPHQL_RESULT
    const { graphqlFn, inbox } = createInboxTestContext({
      graphqlImpl: async () => ({
        currentUser: {
          todos: { nodes: [] },
          reviewRequestedMergeRequests: { nodes: [] },
          authoredMergeRequests: {
            nodes: [
              {
                iid: '42',
                webUrl: 'https://gitlab.com/group/repo/-/merge_requests/42',
                title: 'Approval-backed MR',
                updatedAt: '2026-08-08T00:00:00Z',
                draft: false,
                state: 'opened',
                description: '',
                author: { username: 'me' },
                reviewers: { nodes: [] },
                approvedBy: { nodes: [{ username: 'reviewer' }] },
                approvalsRequired: 2,
                project: { fullPath: 'group/repo' },
              },
            ],
          },
        },
      }),
    });
    // #endregion END_APPROVALS_REQUIRED_SETUP_GRAPHQL_RESULT

    const result = await inbox.getActionable();

    // #region START_APPROVALS_REQUIRED_ASSERT_RUNTIME_FACT
    assert.strictEqual(result[0].approvalsRequired, 2);
    const queries = graphqlFn.mock.calls.map((c) => (c.arguments as [string])[0]);
    // Connection sources (reviewer/assignee/author) carry the full MR projection.
    assert.ok(
      queries.some((q) => /approvalsRequired/.test(q)),
      'a connection source query must request approvalsRequired'
    );
    // Discovery does NOT read pending todos — they are opt-in (todo management only),
    // so a default getActionable() issues no todos query.
    assert.ok(
      !queries.some((q) => /todos\(/.test(q)),
      'default discovery must not query pending todos'
    );
    // #endregion END_APPROVALS_REQUIRED_ASSERT_RUNTIME_FACT
  });
});
