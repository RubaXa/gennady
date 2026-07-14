// @file: Unit tests for state-seed — parseSeedState validation, and applySeedState's 'fresh'
//   (delete registry entry) / 'reviewed' (set lastReviewedHeadSha) effects on the registry.
// @consumers: node:test runner
// @tasks: TSK-121

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSeedState, applySeedState, type SeedState } from '../state-seed.ts';
import { StateStore } from '../../modules/inbox-core/state-store.ts';

const MR = 'https://gitlab.example.com/group/project/-/merge_requests/1';

let store: StateStore;

beforeEach(() => {
  const stateDir = mkdtempSync(join(tmpdir(), 'gennady-state-seed-'));
  store = new StateStore(stateDir);
});

describe('parseSeedState — validation', () => {
  it('GIVEN валидный документ с fresh+reviewed WHEN parseSeedState THEN возвращает SeedState как есть', () => {
    const raw = {
      version: 1,
      mrs: {
        [MR]: { state: 'fresh' },
        'https://gitlab.example.com/group/project/-/merge_requests/2': {
          state: 'reviewed',
          headSha: 'abc123',
        },
      },
    };

    const parsed = parseSeedState(raw);
    assert.strictEqual(parsed.version, 1);
    assert.strictEqual(parsed.mrs[MR].state, 'fresh');
  });

  it('GIVEN документ без "mrs" WHEN parseSeedState THEN throw', () => {
    assert.throws(() => parseSeedState({ version: 1 }), /must have an "mrs" object/);
  });

  it('GIVEN state не fresh/reviewed WHEN parseSeedState THEN throw ("malformed seed → clear error")', () => {
    assert.throws(
      () => parseSeedState({ mrs: { [MR]: { state: 'bogus' } } }),
      /state must be 'fresh' or 'reviewed'/
    );
  });

  it('GIVEN reviewed без headSha WHEN parseSeedState THEN throw ("malformed seed → clear error")', () => {
    assert.throws(
      () => parseSeedState({ mrs: { [MR]: { state: 'reviewed' } } }),
      /'reviewed' state requires headSha/
    );
  });
});

describe('applySeedState — fresh deletes entry', () => {
  it('GIVEN existing registry entry WHEN applySeedState с state=fresh THEN entry удалён из реестра', () => {
    const registry = store.loadRegistry();
    registry.entries[MR] = {
      project: 'group/project',
      iid: '1',
      role: 'reviewer',
      stage: 'review_needed',
      lastSeenUpdatedAt: '',
      firstSeenAt: '',
      lastClassifiedAt: '',
      lastReviewedHeadSha: 'stale-sha',
    };
    store.saveRegistry();

    const seed: SeedState = { version: 1, mrs: { [MR]: { state: 'fresh' } } };
    applySeedState(store, seed);

    const after = store.loadRegistry();
    assert.strictEqual(after.entries[MR], undefined);
  });
});

describe('applySeedState — reviewed@head sets lastReviewedHeadSha', () => {
  it('GIVEN нет предшествующей записи WHEN applySeedState с state=reviewed+headSha THEN создаёт entry с lastReviewedHeadSha', () => {
    const seed: SeedState = {
      version: 1,
      mrs: { [MR]: { state: 'reviewed', headSha: 'head-sha-1' } },
    };
    applySeedState(store, seed);

    const after = store.loadRegistry();
    assert.strictEqual(after.entries[MR].lastReviewedHeadSha, 'head-sha-1');
  });

  it('GIVEN существующая запись WHEN applySeedState с state=reviewed+новым headSha THEN обновляет lastReviewedHeadSha, сохраняя прочие поля', () => {
    const registry = store.loadRegistry();
    registry.entries[MR] = {
      project: 'group/project',
      iid: '1',
      role: 'reviewer',
      stage: 'review_needed',
      lastSeenUpdatedAt: 'ts-1',
      firstSeenAt: 'ts-0',
      lastClassifiedAt: 'ts-1',
      lastReviewedHeadSha: 'old-sha',
    };
    store.saveRegistry();

    const seed: SeedState = {
      version: 1,
      mrs: { [MR]: { state: 'reviewed', headSha: 'new-sha' } },
    };
    applySeedState(store, seed);

    const after = store.loadRegistry();
    assert.strictEqual(after.entries[MR].lastReviewedHeadSha, 'new-sha');
    assert.strictEqual(after.entries[MR].firstSeenAt, 'ts-0');
  });
});
