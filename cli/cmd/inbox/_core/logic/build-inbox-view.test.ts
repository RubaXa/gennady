// @file: Unit tests for buildInboxView policy (filter / group / sort).
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildInboxView, type InboxOptions } from './build-inbox-view.logic.ts';
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
  updatedAt: '2026-06-23T00:00:00Z',
  draft: false,
  state: 'opened',
  role: 'reviewer',
  events: [],
  directlyAddressed: false,
  ...over,
});

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
