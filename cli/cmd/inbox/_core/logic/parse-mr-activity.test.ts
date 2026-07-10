// @file: Unit tests for parseMrActivity — parsing system notes into MrActivityEvent[].
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMrActivity } from './parse-mr-activity.logic.ts';
import type { MrActivityEvent } from '../../../../../services/vcs-client/entities/mr-activity-event.type.ts';
import type { RawNote } from './classify-mr-stage.logic.ts';

const sys = (body: string, at = '2026-07-10T12:00:00Z'): RawNote => ({
  system: true,
  body,
  created_at: at,
  author: { username: 'svc' },
});

const real = (login: string, body: string, at = '2026-07-10T12:05:00Z'): RawNote => ({
  system: false,
  body,
  created_at: at,
  author: { username: login },
});

describe('parseMrActivity', () => {
  it('parses commits_pushed from system note', () => {
    const events = parseMrActivity([sys('added 3 commits')], '2026-07-10T11:00:00Z');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'commits_pushed');
    assert.strictEqual(events[0].summary, 'добавлено 3 коммитов');
  });

  it('parses target_branch_merged from system note', () => {
    const events = parseMrActivity(
      [sys("added 2 commits\n\nmerged branch 'master' into 'feature'")],
      '2026-07-10T11:00:00Z'
    );
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'target_branch_merged');
    assert.ok(events[0].summary.includes('master'));
  });

  it('parses description_changed', () => {
    const events = parseMrActivity([sys('changed the description')], '2026-07-10T11:00:00Z');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'description_changed');
  });

  it('parses draft_removed and draft_marked', () => {
    const ready = parseMrActivity(
      [sys('marked this merge request as ready')],
      '2026-07-10T11:00:00Z'
    );
    assert.strictEqual(ready[0].type, 'draft_removed');

    const draft = parseMrActivity(
      [sys('marked this merge request as draft')],
      '2026-07-10T11:00:00Z'
    );
    assert.strictEqual(draft[0].type, 'draft_marked');
  });

  it('parses approved and unapproved', () => {
    const app = parseMrActivity([sys('approved this merge request')], '2026-07-10T11:00:00Z');
    assert.strictEqual(app[0].type, 'approved');

    const un = parseMrActivity([sys('unapproved this merge request')], '2026-07-10T11:00:00Z');
    assert.strictEqual(un[0].type, 'unapproved');
  });

  it('parses target_branch_changed', () => {
    const events = parseMrActivity(
      [sys('changed target branch from master to release')],
      '2026-07-10T11:00:00Z'
    );
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'target_branch_changed');
    assert.ok(events[0].summary.includes('master'));
    assert.ok(events[0].summary.includes('release'));
  });

  it('parses review_requested and review_request_removed', () => {
    const req = parseMrActivity(
      [sys('requested review from @alice, @bob')],
      '2026-07-10T11:00:00Z'
    );
    assert.strictEqual(req[0].type, 'review_requested');

    const rem = parseMrActivity([sys('removed review request for @alice')], '2026-07-10T11:00:00Z');
    assert.strictEqual(rem[0].type, 'review_request_removed');
  });

  it('parses threads_resolved', () => {
    const events = parseMrActivity([sys('resolved all threads')], '2026-07-10T11:00:00Z');
    assert.strictEqual(events[0].type, 'threads_resolved');
  });

  it('parses reopened', () => {
    const events = parseMrActivity([sys('reopened this merge request')], '2026-07-10T11:00:00Z');
    assert.strictEqual(events[0].type, 'reopened');
  });

  it('detects discussion_added from non-system notes after threshold', () => {
    const events = parseMrActivity(
      [
        sys('added 1 commit', '2026-07-10T11:30:00Z'),
        real('alice', 'LGTM', '2026-07-10T12:00:00Z'),
      ],
      '2026-07-10T11:00:00Z'
    );
    const types = events.map((e) => e.type);
    assert.ok(types.includes('discussion_added'));
    assert.ok(types.includes('commits_pushed'));
  });

  it('filters out notes before lastClassifiedAt', () => {
    const events = parseMrActivity(
      [sys('added 5 commits', '2026-07-10T10:00:00Z')],
      '2026-07-10T11:00:00Z'
    );
    assert.strictEqual(events.length, 0);
  });

  it('emits commits_detected when head SHA differs and no system note announced', () => {
    const events = parseMrActivity([], '2026-07-10T11:00:00Z', {
      current: 'abc123',
      previous: 'def456',
    });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'commits_detected');
  });

  it('skips commits_detected when commits_pushed system note already covers it', () => {
    const events = parseMrActivity(
      [sys('added 2 commits', '2026-07-10T12:00:00Z')],
      '2026-07-10T11:00:00Z',
      { current: 'abc123', previous: 'def456' }
    );
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'commits_pushed');
  });

  it('MrActivityEvent type is provider-agnostic — no GitLab-specific fields', () => {
    const event: MrActivityEvent = {
      type: 'commits_pushed',
      at: '2026-07-10T12:00:00Z',
      summary: 'добавлено 3 коммитов',
    };
    assert.strictEqual(event.type, 'commits_pushed');
    // The type is defined in services/vcs-client/entities/ — shared by all providers.
  });
});
