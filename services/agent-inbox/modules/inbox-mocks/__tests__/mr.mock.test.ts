// @file: Unit tests for mr.mock factories — type validation for mockActionableMr and mockMrContext.
// @consumers: node:test runner
// @tasks: TSK-105

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mockActionableMr, mockMrContext } from '../mr.mock.ts';
import type { ActionableMr, MrContext } from '../mr.mock.ts';

describe('mockActionableMr — default values', () => {
  it('GIVEN no overrides WHEN mockActionableMr() THEN returns ActionableMr with default fields', () => {
    const mr: ActionableMr = mockActionableMr();

    assert.strictEqual(mr.project, 'group/project');
    assert.strictEqual(mr.iid, 510);
    assert.strictEqual(mr.title, 'feat: add new feature');
    assert.strictEqual(mr.webUrl, 'https://gitlab.example.com/group/project/-/merge_requests/510');
    assert.strictEqual(mr.author, 'j.doe');
    assert.deepStrictEqual(mr.reviewers, ['k.lebedev']);
    assert.deepStrictEqual(mr.approvedBy, []);
    assert.strictEqual(mr.draft, false);
    assert.strictEqual(mr.state, 'opened');
    assert.strictEqual(mr.role, 'reviewer');
    assert.strictEqual(mr.stage, 'review_needed');
    assert.strictEqual(mr.sourceBranch, 'feature/new-feature');
    assert.strictEqual(mr.targetBranch, 'main');
    assert.deepStrictEqual(mr.events, []);
    assert.strictEqual(mr.directlyAddressed, false);
    assert.deepStrictEqual(mr.todoIds, []);
    assert.strictEqual(mr.updatedAt, '2026-07-10T10:00:00Z');
    assert.strictEqual(mr.description, '');
  });

  it('GIVEN overrides WHEN mockActionableMr({ iid: 999 }) THEN iid=999 and defaults preserved', () => {
    const mr = mockActionableMr({ iid: 999 });

    assert.strictEqual(mr.iid, 999);
    assert.strictEqual(mr.project, 'group/project');
    assert.strictEqual(mr.stage, 'review_needed');
  });

  it('GIVEN multiple overrides WHEN mockActionableMr THEN all overridden fields applied', () => {
    const mr = mockActionableMr({
      project: 'team/ui',
      iid: 511,
      stage: 'reply_needed',
      role: 'author',
      draft: true,
    });

    assert.strictEqual(mr.project, 'team/ui');
    assert.strictEqual(mr.iid, 511);
    assert.strictEqual(mr.stage, 'reply_needed');
    assert.strictEqual(mr.role, 'author');
    assert.strictEqual(mr.draft, true);
    // defaults preserved for non-overridden
    assert.strictEqual(mr.title, 'feat: add new feature');
  });

  it('GIVEN partial overrides WHEN mockActionableMr({}) THEN same as no-overrides', () => {
    const mrDefault = mockActionableMr();
    const mrEmpty = mockActionableMr({});

    assert.deepStrictEqual(mrDefault, mrEmpty);
  });
});

describe('mockMrContext — default values', () => {
  it('GIVEN no overrides WHEN mockMrContext() THEN returns MrContext with default fields', () => {
    const ctx: MrContext = mockMrContext();

    assert.strictEqual(ctx.ref, 'group/project!510');
    assert.strictEqual(ctx.title, 'feat: add new feature');
    assert.strictEqual(ctx.webUrl, 'https://gitlab.example.com/group/project/-/merge_requests/510');
    assert.strictEqual(ctx.myLogin, 'k.lebedev');
    assert.strictEqual(ctx.myRole, 'reviewer');
    assert.strictEqual(ctx.author, 'j.doe');
    assert.strictEqual(ctx.stage, 'review_needed');
    assert.strictEqual(ctx.openQuestions, 0);
    assert.strictEqual(ctx.lastAuthor, 'j.doe');
    assert.deepStrictEqual(ctx.threadStats, { total: 1, drafts: 0 });
    assert.notStrictEqual(ctx.worktree, undefined);
    assert.strictEqual(ctx.worktree.path, '/tmp/worktree/group__project-510');
    assert.notStrictEqual(ctx.changeset, undefined);
    assert.strictEqual(ctx.changeset?.totals.files, 1);
  });

  it('GIVEN overrides WHEN mockMrContext THEN overrides merged over defaults', () => {
    const ctx = mockMrContext({
      ref: 'team/api!200',
      stage: 'awaiting_reply',
      headChanged: { kind: 'fast_forward', newCommitCount: 3 },
    });

    assert.strictEqual(ctx.ref, 'team/api!200');
    assert.strictEqual(ctx.stage, 'awaiting_reply');
    assert.deepStrictEqual(ctx.headChanged, { kind: 'fast_forward', newCommitCount: 3 });
    assert.strictEqual(ctx.myLogin, 'k.lebedev');
  });

  it('GIVEN null overrides WHEN mockMrContext THEN fields become null', () => {
    const ctx = mockMrContext({
      changeset: null,
      openQuestions: null,
      threadStats: null,
    });

    assert.strictEqual(ctx.changeset, null);
    assert.strictEqual(ctx.openQuestions, null);
    assert.strictEqual(ctx.threadStats, null);
  });
});
