// @file: FeedProjectionTests — canonical seven-kind FeedWidget contract and read cursor coverage.
// @consumers: node:test runner
// @tasks: TSK-162

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FeedProjection } from '../projections/feed-projection.ts';
import type { EventJournal } from '../../inbox-core/event-journal.ts';
import type { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';

const TS = '2026-08-08T00:00:00Z';

function journal(kinds: string[]) {
  const entries = kinds.map((kind, index) => ({
    seq: index + 1,
    ts: `${TS}.${index}`,
    mr: 'group/project!1',
    kind,
    payload: {},
  })) as import('../../inbox-core/event-journal.ts').JournalEntry[];
  return {
    since: mock.fn((cursor: number) => ({
      entries: entries.filter((entry) => entry.seq > cursor),
      nextCursor: entries.length,
    })),
    read: mock.fn(() => entries),
  } as unknown as EventJournal;
}

function registry(): InboxRegistryAccess {
  return {
    load: mock.fn(() => ({
      entries: {
        'https://gitlab/group/project/-/merge_requests/1': { project: 'group/project', iid: '1' },
      },
    })),
    recordLastRead: mock.fn(),
    save: mock.fn(),
  } as unknown as InboxRegistryAccess;
}

describe('FeedProjection', () => {
  it('projects canonical shared widget fields and per-kind payloads', () => {
    const projection = new FeedProjection(
      journal([
        'widget_bump',
        'chat_turn',
        'artifact_produced',
        'gitlab_event',
        'proposal',
        'task_status',
        'decision',
      ]),
      registry()
    );
    const result = projection.project(0);
    assert.deepStrictEqual(
      result.widgets.map((widget) => widget.type),
      ['findings', 'threads', 'artifact', 'gitlab', 'plan', 'progress', 'action']
    );
    for (const widget of result.widgets) {
      assert.ok(widget.widgetId.length > 0);
      assert.ok(widget.lastActivity.length > 0);
      assert.strictEqual(typeof widget.resolved, 'boolean');
      assert.strictEqual(typeof widget.unread, 'boolean');
      assert.ok(Array.isArray(widget.anchors));
      assert.ok(typeof widget.payload === 'object');
    }
    assert.deepStrictEqual(result.widgets[2].payload, {
      path: 'report/unknown',
      title: 'Artifact',
      attachments: [],
    });
    assert.deepStrictEqual(result.widgets[5].payload.events[0].kind, 'task_status');
  });

  it('returns an empty range after its cursor', () => {
    const projection = new FeedProjection(journal(['gitlab_event']), registry());
    assert.deepStrictEqual(projection.project(1).widgets, []);
  });

  it('normalizes untrusted findings and thread payloads to their public union contracts', () => {
    const source = {
      since: mock.fn(() => ({
        entries: [
          {
            seq: 1,
            ts: TS,
            mr: 'group/project!1',
            kind: 'widget_bump',
            payload: { items: [{ id: 'f1', line: 'bad' }, null] },
          },
          {
            seq: 2,
            ts: TS,
            mr: 'group/project!1',
            kind: 'chat_turn',
            payload: { items: [{ threadId: 't1', reactions: 'bad' }, 2] },
          },
        ],
        nextCursor: 2,
      })),
    } as unknown as EventJournal;
    const widgets = new FeedProjection(source, registry()).project(0).widgets;
    assert.deepStrictEqual(widgets[0], {
      widgetId: 'group/project!1:1',
      type: 'findings',
      lastActivity: TS,
      resolved: false,
      unread: true,
      anchors: [],
      payload: {
        items: [{ id: 'f1', severity: 'unknown', file: '', line: 0, summary: '', state: 'open' }],
      },
    });
    assert.deepStrictEqual(widgets[1], {
      widgetId: 'group/project!1:2',
      type: 'threads',
      lastActivity: TS,
      resolved: false,
      unread: true,
      anchors: [],
      payload: { items: [{ threadId: 't1', author: '', quote: '', factcheck: '', reactions: [] }] },
    });
  });

  it('advances the durable read cursor to max lastActivity for an MR feed', () => {
    const access = registry();
    const projection = new FeedProjection(journal(['gitlab_event', 'task_status']), access);
    projection.project(0, 'group/project!1');
    assert.strictEqual(
      (access.recordLastRead as unknown as { mock: { calls: unknown[][] } }).mock.calls.length,
      1
    );
  });
});
