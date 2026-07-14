// @file: Unit tests for inbox-roles context-builder — base sourced from diff_refs.base_sha (never
//   a recomputed merge-base), degrade-open when diff_refs/worktree are unavailable, and
//   stage/lastReviewedHeadSha passthrough from the registry into NodeContext.artifacts.
// @consumers: node:test runner
// @tasks: TSK-121

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNodeContext, type DiffRefs } from '../context-builder.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import type {
  InboxRegistry,
  RegistryEntry,
} from '../../../../../cli/cmd/inbox/_core/logic/inbox-registry.logic.ts';

/**
 * @purpose Point context-builder's repos.json at an existing-but-non-git directory so
 *   `ensureClone` short-circuits on the reposMap hit instead of attempting a real network clone —
 *   the subsequent `git worktree prune` on a non-repo then fails fast (local, no network), keeping
 *   this suite network-free per the P4 job's constraint.
 * @param stateDir Temp state directory for this test.
 * @sideEffect Writes `<stateDir>/repos.json`.
 */
function seedReposMap(stateDir: string): void {
  writeFileSync(
    join(stateDir, 'repos.json'),
    JSON.stringify({ 'group/project': stateDir }),
    'utf8'
  );
}

/** @purpose Minimal StateStore stand-in — buildNodeContext only needs loadRegistry()/getStateDir(). */
class FakeStateStore {
  constructor(
    protected _stateDir: string,
    protected _registry: InboxRegistry = { version: 1, entries: {} }
  ) {}

  getStateDir(): string {
    return this._stateDir;
  }

  loadRegistry(): InboxRegistry {
    return this._registry;
  }
}

const MR = 'https://gitlab.example.com/group/project/-/merge_requests/1';

let vcs: VcsInboxMock;
let stateDir: string;

beforeEach(() => {
  vcs = new VcsInboxMock();
  stateDir = mkdtempSync(join(tmpdir(), 'gennady-context-builder-'));
  seedReposMap(stateDir);
});

describe('buildNodeContext — base from diff_refs.base_sha', () => {
  it('GIVEN diff_refs.baseSha=deadbeef WHEN buildNodeContext THEN ctx.base === deadbeef verbatim (не merge-base)', async () => {
    const store = new FakeStateStore(stateDir);
    const diffRefs: DiffRefs = { baseSha: 'deadbeef', startSha: 'cafe', headSha: 'feedface' };

    const ctx = await buildNodeContext(MR, {
      vcs,
      store: store as unknown as Parameters<typeof buildNodeContext>[1]['store'],
      fetchDiffRefs: async () => diffRefs,
    });

    assert.strictEqual(ctx.base, 'deadbeef');
    assert.strictEqual(ctx.artifacts.baseSha, 'deadbeef');
  });
});

describe('buildNodeContext — degrade-open on fetch failure', () => {
  it('GIVEN fetchDiffRefs резолвит undefined (как fetchDiffRefsLive при сбое) WHEN buildNodeContext THEN base undefined, без throw', async () => {
    const store = new FakeStateStore(stateDir);

    const ctx = await buildNodeContext(MR, {
      vcs,
      store: store as unknown as Parameters<typeof buildNodeContext>[1]['store'],
      fetchDiffRefs: async () => undefined,
    });

    assert.strictEqual(ctx.base, undefined);
    assert.strictEqual(ctx.artifacts.baseSha, undefined);
  });

  it('GIVEN недостижимый VCS-хост (сеть/клон недоступны) WHEN buildNodeContext THEN worktree/changeset деградируют, headChanged undefined даже при заполненном lastReviewedHeadSha', async () => {
    const entry: RegistryEntry = {
      project: 'group/project',
      iid: '1',
      role: 'reviewer',
      stage: 'review_needed',
      lastSeenUpdatedAt: '',
      firstSeenAt: '',
      lastClassifiedAt: '',
      lastReviewedHeadSha: 'oldsha123',
    };
    const store = new FakeStateStore(stateDir, {
      version: 1,
      entries: { [MR]: entry },
    });

    const ctx = await buildNodeContext(MR, {
      vcs,
      store: store as unknown as Parameters<typeof buildNodeContext>[1]['store'],
      fetchDiffRefs: async () => ({ baseSha: 'deadbeef' }),
    });

    assert.strictEqual(ctx.changeset, undefined);
    assert.strictEqual(ctx.artifacts.headChanged, undefined);
  });
});

describe('buildNodeContext — stage/lastReviewedHeadSha passthrough from registry', () => {
  it('GIVEN registry entry со stage=reply_needed WHEN buildNodeContext THEN artifacts.stage === reply_needed', async () => {
    const entry: RegistryEntry = {
      project: 'group/project',
      iid: '1',
      role: 'reviewer',
      stage: 'reply_needed',
      lastSeenUpdatedAt: '',
      firstSeenAt: '',
      lastClassifiedAt: '',
    };
    const store = new FakeStateStore(stateDir, {
      version: 1,
      entries: { [MR]: entry },
    });

    const ctx = await buildNodeContext(MR, {
      vcs,
      store: store as unknown as Parameters<typeof buildNodeContext>[1]['store'],
      fetchDiffRefs: async () => undefined,
    });

    assert.strictEqual(ctx.artifacts.stage, 'reply_needed');
    assert.strictEqual(ctx.artifacts.lastReviewedHeadSha, undefined);
  });

  it('GIVEN нет registry entry (первое рассмотрение MR) WHEN buildNodeContext THEN stage/lastReviewedHeadSha оба undefined', async () => {
    const store = new FakeStateStore(stateDir);

    const ctx = await buildNodeContext(MR, {
      vcs,
      store: store as unknown as Parameters<typeof buildNodeContext>[1]['store'],
      fetchDiffRefs: async () => undefined,
    });

    assert.strictEqual(ctx.artifacts.stage, undefined);
    assert.strictEqual(ctx.artifacts.lastReviewedHeadSha, undefined);
  });
});
