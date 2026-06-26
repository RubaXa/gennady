// @file: Unit tests for buildInboxView policy (filter / group / sort).
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildInboxView, type InboxOptions } from './build-inbox-view.logic.ts';
import type { MrStage } from './classify-mr-stage.logic.ts';
import type { VcsActionableMr } from '../../../../../services/vcs-client/entities/vcs-actionable-mr.type.ts';

const NOW = '2026-06-24T00:00:00Z';

const opt = (o: Partial<InboxOptions> = {}): InboxOptions => ({
  drafts: false,
  includeStale: false,
  staleDays: 14,
  ciAll: false,
  all: false,
  ...o,
});

const raw = (over: Partial<VcsActionableMr> & { iid: string }): VcsActionableMr => ({
  project: 'g/p',
  webUrl: `https://x/${over.iid}`,
  title: `t${over.iid}`,
  description: '',
  author: '',
  reviewers: [],
  approvedBy: [],
  updatedAt: '2026-06-23T00:00:00Z',
  draft: false,
  state: 'opened',
  role: 'reviewer',
  events: [],
  directlyAddressed: false,
  ...over,
});

/** @purpose Build a webUrl→stage map matching the raw() webUrl scheme. */
const stageMap = (entries: Record<string, MrStage>): Map<string, MrStage> =>
  new Map(Object.entries(entries).map(([iid, s]) => [`https://x/${iid}`, s]));

describe('buildInboxView', () => {
  it('drops role-less items as noise', () => {
    const view = buildInboxView([raw({ iid: '1', role: null, events: ['ci_failed'] })], opt(), NOW);
    assert.strictEqual(view.total, 0);
    assert.strictEqual(view.hidden.noise, 1);
  });

  it('hides merged/closed MRs even under --all (only open is actionable)', () => {
    const items = [
      raw({ iid: '1', role: 'reviewer', state: 'merged' }),
      raw({ iid: '2', role: 'author', state: 'closed' }),
      raw({ iid: '3', role: 'reviewer', state: 'opened' }),
    ];
    const view = buildInboxView(items, opt({ all: true }), NOW);
    assert.strictEqual(view.total, 1);
    assert.strictEqual(view.hidden.closed, 2);
  });

  it('hides MRs I have already approved (revealed under --all)', () => {
    const items = [
      raw({ iid: '1', role: 'reviewer', approvedBy: ['k.lebedev', 'other'] }),
      raw({ iid: '2', role: 'reviewer', approvedBy: ['other'] }),
    ];
    const view = buildInboxView(items, opt(), NOW, new Map(), new Map(), 'k.lebedev');
    assert.strictEqual(view.total, 1);
    assert.strictEqual(view.groups[0].items[0].iid, '2');
    assert.strictEqual(view.hidden.approved, 1);

    const all = buildInboxView(items, opt({ all: true }), NOW, new Map(), new Map(), 'k.lebedev');
    assert.strictEqual(all.total, 2);
    assert.strictEqual(all.hidden.approved, 0);
  });

  it('hides awaiting_reply/idle when stages are known (no reaction needed from me)', () => {
    const items = [
      raw({ iid: '1', role: 'reviewer' }),
      raw({ iid: '2', role: 'reviewer' }),
      raw({ iid: '3', role: 'reviewer' }),
      raw({ iid: '4', role: 'reviewer' }),
    ];
    const stages = stageMap({
      '1': 'reply_needed',
      '2': 'review_needed',
      '3': 'awaiting_reply',
      '4': 'idle',
    });
    const view = buildInboxView(items, opt(), NOW, new Map(), stages);
    assert.strictEqual(view.total, 2);
    assert.strictEqual(view.hidden.waiting, 2);
    assert.deepStrictEqual(view.groups[0].items.map((i) => i.stage).sort(), [
      'reply_needed',
      'review_needed',
    ]);

    // Under --all nothing is dropped by stage.
    const all = buildInboxView(items, opt({ all: true }), NOW, new Map(), stages);
    assert.strictEqual(all.total, 4);
    assert.strictEqual(all.hidden.waiting, 0);
  });

  it('does not stage-filter on the pre-scan pass (empty stages map)', () => {
    const items = [raw({ iid: '1', role: 'reviewer' })];
    const view = buildInboxView(items, opt(), NOW);
    assert.strictEqual(view.total, 1);
    assert.strictEqual(view.hidden.waiting, 0);
  });

  it('carries description / author / reviewers onto the row', () => {
    const items = [
      raw({
        iid: '1',
        role: 'reviewer',
        description: 'do X',
        author: 'a.b',
        reviewers: ['c.d', 'e.f'],
      }),
    ];
    const item = buildInboxView(items, opt(), NOW).groups[0].items[0];
    assert.strictEqual(item.description, 'do X');
    assert.strictEqual(item.author, 'a.b');
    assert.deepStrictEqual(item.reviewers, ['c.d', 'e.f']);
  });

  it('hides drafts by default and shows them with --drafts', () => {
    const items = [raw({ iid: '1', role: 'reviewer', draft: true })];
    assert.strictEqual(buildInboxView(items, opt(), NOW).hidden.drafts, 1);
    assert.strictEqual(buildInboxView(items, opt({ drafts: true }), NOW).total, 1);
  });

  it('keeps a fresh author draft that has a blocking event', () => {
    const items = [raw({ iid: '1', role: 'author', draft: true, events: ['ci_failed'] })];
    const view = buildInboxView(items, opt(), NOW);
    assert.strictEqual(view.total, 1);
    assert.strictEqual(view.hidden.drafts, 0);
  });

  it('hides an ancient author draft even with a blocking event', () => {
    const items = [
      raw({
        iid: '1',
        role: 'author',
        draft: true,
        events: ['ci_failed'],
        updatedAt: '2025-01-01T00:00:00Z',
      }),
    ];
    const view = buildInboxView(items, opt(), NOW);
    assert.strictEqual(view.total, 0);
    assert.strictEqual(view.hidden.drafts, 1);
  });

  it('hides stale items of any role, shown with --include-stale', () => {
    const stale = '2026-06-01T00:00:00Z';
    for (const role of ['reviewer', 'author', 'mentioned'] as const) {
      const items = [raw({ iid: '1', role, updatedAt: stale })];
      assert.strictEqual(buildInboxView(items, opt(), NOW).hidden.stale, 1, role);
      assert.strictEqual(buildInboxView(items, opt({ includeStale: true }), NOW).total, 1, role);
    }
  });

  it('shows CI events only for author, not reviewer', () => {
    const rev = buildInboxView(
      [raw({ iid: '1', role: 'reviewer', events: ['ci_failed'] })],
      opt(),
      NOW
    );
    assert.deepStrictEqual(rev.groups[0].items[0].shownEvents, []);

    const auth = buildInboxView(
      [raw({ iid: '2', role: 'author', events: ['ci_failed'] })],
      opt(),
      NOW
    );
    assert.deepStrictEqual(auth.groups[0].items[0].shownEvents, ['ci_failed']);
  });

  it('orders groups reviewer → author → mentioned', () => {
    const items = [
      raw({ iid: '1', role: 'mentioned' }),
      raw({ iid: '2', role: 'author' }),
      raw({ iid: '3', role: 'reviewer' }),
    ];
    const view = buildInboxView(items, opt(), NOW);
    assert.deepStrictEqual(
      view.groups.map((g) => g.role),
      ['reviewer', 'author', 'mentioned']
    );
  });

  it('sorts directly-addressed to the top of mentioned', () => {
    const items = [
      raw({ iid: '1', role: 'mentioned', updatedAt: '2026-06-23T00:00:00Z' }),
      raw({
        iid: '2',
        role: 'mentioned',
        directlyAddressed: true,
        updatedAt: '2026-06-20T00:00:00Z',
      }),
    ];
    const view = buildInboxView(items, opt(), NOW);
    assert.strictEqual(view.groups[0].items[0].iid, '2');
  });
});
