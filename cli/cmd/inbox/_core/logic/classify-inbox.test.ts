// @file: Unit tests for classifyInbox (new / updated / idle vs registry).
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyInbox } from './classify-inbox.logic.ts';
import type { InboxRegistry } from './inbox-registry.logic.ts';
import type { VcsActionableMr } from '../../../../../services/vcs-client/entities/vcs-actionable-mr.type.ts';

const NOW = '2026-06-24T00:00:00Z';

const mr = (over: Partial<VcsActionableMr> & { iid: string }): VcsActionableMr => ({
  project: 'g/p',
  webUrl: `https://x/${over.iid}`,
  title: `t${over.iid}`,
  updatedAt: '2026-06-23T00:00:00Z',
  draft: false,
  role: 'reviewer',
  events: [],
  directlyAddressed: false,
  ...over,
});

const empty: InboxRegistry = { version: 1, entries: {} };

describe('classifyInbox', () => {
  it('marks an unseen MR as new and records it', () => {
    const { deltas, next } = classifyInbox([mr({ iid: '1' })], empty, NOW);
    assert.strictEqual(deltas.get('https://x/1'), 'new');
    assert.strictEqual(next.entries['https://x/1'].firstSeenAt, NOW);
    assert.strictEqual(next.entries['https://x/1'].lastSeenUpdatedAt, '2026-06-23T00:00:00Z');
  });

  it('marks idle when updatedAt is unchanged', () => {
    const first = classifyInbox([mr({ iid: '1' })], empty, NOW).next;
    const { deltas } = classifyInbox([mr({ iid: '1' })], first, NOW);
    assert.strictEqual(deltas.get('https://x/1'), 'idle');
  });

  it('marks updated when updatedAt advances', () => {
    const first = classifyInbox([mr({ iid: '1' })], empty, NOW).next;
    const { deltas, next } = classifyInbox(
      [mr({ iid: '1', updatedAt: '2026-06-24T10:00:00Z' })],
      first,
      NOW
    );
    assert.strictEqual(deltas.get('https://x/1'), 'updated');
    assert.strictEqual(next.entries['https://x/1'].lastSeenUpdatedAt, '2026-06-24T10:00:00Z');
  });

  it('preserves firstSeenAt across ticks', () => {
    const first = classifyInbox([mr({ iid: '1' })], empty, '2026-06-01T00:00:00Z').next;
    const { next } = classifyInbox(
      [mr({ iid: '1', updatedAt: '2026-06-24T10:00:00Z' })],
      first,
      NOW
    );
    assert.strictEqual(next.entries['https://x/1'].firstSeenAt, '2026-06-01T00:00:00Z');
  });

  it('keeps prior entries not present this tick (returning MR reads as updated)', () => {
    const first = classifyInbox([mr({ iid: '1' })], empty, NOW).next;
    // tick where MR 1 is absent (left the inbox)
    const second = classifyInbox([mr({ iid: '2' })], first, NOW).next;
    assert.ok(second.entries['https://x/1'], 'entry 1 retained');
    // MR 1 returns with newer activity → updated, not new
    const { deltas } = classifyInbox(
      [mr({ iid: '1', updatedAt: '2026-06-25T00:00:00Z' })],
      second,
      NOW
    );
    assert.strictEqual(deltas.get('https://x/1'), 'updated');
  });
});
