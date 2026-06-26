// @file: Unit tests for VcsGitlabInbox.getActionable.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGitlabInbox } from '../../gitlab/vcs-gitlab-inbox.ts';

const mr = (iid: string, over: Record<string, unknown> = {}) => ({
  iid,
  title: `MR ${iid}`,
  webUrl: `https://gitlab.example.com/g/p/-/merge_requests/${iid}`,
  updatedAt: '2026-06-24T00:00:00Z',
  draft: false,
  project: { fullPath: 'g/p' },
  ...over,
});

const data = (over: Record<string, unknown>) => ({
  currentUser: {
    todos: { nodes: [] },
    reviewRequestedMergeRequests: { nodes: [] },
    authoredMergeRequests: { nodes: [] },
    ...over,
  },
});

describe('VcsGitlabInbox — getActionable', () => {
  let graphql: ReturnType<typeof mock.fn>;
  let inbox: VcsGitlabInbox;

  beforeEach(() => {
    graphql = mock.fn(async () => ({ currentUser: null }));
    inbox = new VcsGitlabInbox(graphql);
  });

  it('maps a review_requested todo to the reviewer role', async () => {
    graphql.mock.mockImplementationOnce(async () =>
      data({
        todos: {
          nodes: [
            { action: 'review_requested', target: { __typename: 'MergeRequest', ...mr('1') } },
          ],
        },
      })
    );

    const result = await inbox.getActionable();
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].role, 'reviewer');
    assert.deepStrictEqual(result[0].events, []);
  });

  it('tags authored MRs with the author role', async () => {
    graphql.mock.mockImplementationOnce(async () =>
      data({ authoredMergeRequests: { nodes: [mr('2')] } })
    );

    const result = await inbox.getActionable();
    assert.strictEqual(result[0].role, 'author');
  });

  it('resolves role by priority and collects events on dedup', async () => {
    graphql.mock.mockImplementationOnce(async () =>
      data({
        todos: {
          nodes: [
            { action: 'build_failed', target: { __typename: 'MergeRequest', ...mr('3') } },
            { action: 'review_requested', target: { __typename: 'MergeRequest', ...mr('3') } },
          ],
        },
        authoredMergeRequests: { nodes: [mr('3')] },
      })
    );

    const result = await inbox.getActionable();
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].role, 'author'); // author > reviewer
    assert.deepStrictEqual(result[0].events, ['ci_failed']);
  });

  it('leaves role null when only state events point at the MR', async () => {
    graphql.mock.mockImplementationOnce(async () =>
      data({
        todos: {
          nodes: [
            { action: 'unmergeable', target: { __typename: 'MergeRequest', ...mr('4') } },
            { action: 'build_failed', target: { __typename: 'MergeRequest', ...mr('4') } },
          ],
        },
      })
    );

    const result = await inbox.getActionable();
    assert.strictEqual(result[0].role, null);
    assert.deepStrictEqual(result[0].events.sort(), ['ci_failed', 'unmergeable']);
  });

  it('flags directly_addressed and sets the mentioned role', async () => {
    graphql.mock.mockImplementationOnce(async () =>
      data({
        todos: {
          nodes: [
            { action: 'directly_addressed', target: { __typename: 'MergeRequest', ...mr('5') } },
          ],
        },
      })
    );

    const result = await inbox.getActionable();
    assert.strictEqual(result[0].role, 'mentioned');
    assert.strictEqual(result[0].directlyAddressed, true);
  });

  it('skips todos whose target is not a merge request', async () => {
    graphql.mock.mockImplementationOnce(async () =>
      data({ todos: { nodes: [{ action: 'assigned', target: { __typename: 'Issue' } }] } })
    );

    const result = await inbox.getActionable();
    assert.strictEqual(result.length, 0);
  });

  it('carries the MR state so non-open MRs can be filtered downstream', async () => {
    graphql.mock.mockImplementationOnce(async () =>
      data({
        todos: {
          nodes: [
            {
              action: 'review_requested',
              target: { __typename: 'MergeRequest', ...mr('7', { state: 'merged' }) },
            },
          ],
        },
      })
    );

    const result = await inbox.getActionable();
    assert.strictEqual(result[0].state, 'merged');
  });

  it('defaults missing state to opened', async () => {
    graphql.mock.mockImplementationOnce(async () =>
      data({ authoredMergeRequests: { nodes: [mr('8')] } })
    );

    const result = await inbox.getActionable();
    assert.strictEqual(result[0].state, 'opened');
  });

  it('normalizes description, author, reviewers and approvedBy for context cards', async () => {
    graphql.mock.mockImplementationOnce(async () =>
      data({
        authoredMergeRequests: {
          nodes: [
            mr('9', {
              description: 'adds X',
              author: { username: 'a.author' },
              reviewers: { nodes: [{ username: 'r.one' }, { username: 'r.two' }, null] },
              approvedBy: { nodes: [{ username: 'r.one' }] },
            }),
          ],
        },
      })
    );

    const result = await inbox.getActionable();
    assert.strictEqual(result[0].description, 'adds X');
    assert.strictEqual(result[0].author, 'a.author');
    assert.deepStrictEqual(result[0].reviewers, ['r.one', 'r.two']);
    assert.deepStrictEqual(result[0].approvedBy, ['r.one']);
  });

  it('defaults missing context fields to empty', async () => {
    graphql.mock.mockImplementationOnce(async () =>
      data({ authoredMergeRequests: { nodes: [mr('10')] } })
    );

    const result = await inbox.getActionable();
    assert.strictEqual(result[0].description, '');
    assert.strictEqual(result[0].author, '');
    assert.deepStrictEqual(result[0].reviewers, []);
    assert.deepStrictEqual(result[0].approvedBy, []);
  });

  it('preserves the draft flag for later filtering', async () => {
    graphql.mock.mockImplementationOnce(async () =>
      data({ authoredMergeRequests: { nodes: [mr('6', { draft: true })] } })
    );

    const result = await inbox.getActionable();
    assert.strictEqual(result[0].draft, true);
  });

  it('returns empty list when currentUser is absent', async () => {
    graphql.mock.mockImplementationOnce(async () => ({ currentUser: null }));
    const result = await inbox.getActionable();
    assert.deepStrictEqual(result, []);
  });

  it('propagates GraphQL transport errors', async () => {
    graphql.mock.mockImplementationOnce(async () => {
      throw new Error('GitLab GraphQL errors: something broke');
    });
    await assert.rejects(() => inbox.getActionable(), /GraphQL/);
  });
});
