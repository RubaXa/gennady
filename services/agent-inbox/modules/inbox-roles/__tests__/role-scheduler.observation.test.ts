// @file: Deterministic tests for RoleScheduler's continuous-observation gate
//   `_shouldAdvanceInstance` (SV-19/20/21 + the D-138 fix). Network- and git-free: VcsInboxMock
//   drives discussions/identity, a real StateStore-in-tmp backs the DebounceTracker, and
//   fetchDiffRefs is stubbed so `headChanged` stays undefined for most cases (a live git
//   worktree is the only source of hasNewCommit). The SV-19 commit-only-hold case below wires a
//   real `createGitFixture` worktree through `buildNodeContext` so `headChanged` genuinely
//   resolves to `fast_forward` — see that case for the exact plumbing.
// @consumers: node:test runner
// @tasks: TSK-141, D-138, TSK-148

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoleEngine } from '../role-engine.ts';
import { RoleScheduler } from '../role-scheduler.ts';
import { DebounceTracker } from '../mr-watch.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import { StateStore } from '../../inbox-core/state-store.ts';
import { createGitFixture } from '#utils/test/git-fixture.ts';
import type { RoleInstance } from '../role-instance.ts';
import type { Discussion, DiscussionNote } from '../../inbox-core/vcs-inbox.port.ts';
import type { InboxRegistry } from '../../inbox-core/inbox-registry.ts';

const MR = 'https://gitlab.example.com/group/project/-/merge_requests/7';
const REF = 'group/project!7';
const ME = 'me';
/** Older than any note timestamp used below, so a "fresh reply" is unambiguously after it. */
const OLD_CREATED_AT = '2020-01-01T00:00:00.000Z';

/** VcsInboxMock with a fixed identity — the base mock leaves getMyLogin at ''. */
class IdentifiedVcsMock extends VcsInboxMock {
  override async getMyLogin(): Promise<string> {
    return ME;
  }
}

/** Exposes the protected SV-19/20/21 gate for direct, deterministic assertions. */
class ObservableScheduler extends RoleScheduler {
  advance(instance: RoleInstance, registry: InboxRegistry): Promise<boolean> {
    return this._shouldAdvanceInstance(instance, registry);
  }
}

function note(username: string, createdAt: string): DiscussionNote {
  return { id: `n-${username}-${createdAt}`, author: username, username, body: 'x', createdAt };
}

function discussion(id: string, notes: DiscussionNote[]): Discussion {
  return {
    id,
    shortId: id.slice(0, 8),
    author: notes[0]?.author ?? '',
    body: '',
    resolved: null,
    notes,
  };
}

/** A minimal instance — the gate reads only `.mr` and `.createdAt`. */
function fakeInstance(): RoleInstance {
  return { mr: MR, createdAt: OLD_CREATED_AT } as unknown as RoleInstance;
}

function registryWithEntry(): InboxRegistry {
  return { entries: { [MR]: { project: 'group/project', iid: '7' } } } as unknown as InboxRegistry;
}

describe('RoleScheduler#_shouldAdvanceInstance (continuous-observation gate)', () => {
  let stateDir: string;
  let scheduler: ObservableScheduler;
  let vcs: IdentifiedVcsMock;

  function build(discussions: Discussion[]): void {
    vcs = new IdentifiedVcsMock();
    vcs.seed([], undefined, { [MR]: discussions });
    const engine = new RoleEngine();
    scheduler = new ObservableScheduler({
      engine,
      store: new StateStore(stateDir),
      vcs,
      opencode: new OpenCodeMock(),
      fetchDiffRefs: async () => undefined,
    });
  }

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'gennady-observe-'));
    // Point the repo at the (non-git) tmp dir so buildNodeContext's ensureClone short-circuits
    // on the reposMap hit instead of attempting a real network clone (network-free per this
    // suite's contract — same trick as run-mode.test.ts#makeStateStore).
    mkdirSync(join(stateDir, 'agent-inbox'), { recursive: true });
    writeFileSync(
      join(stateDir, 'repos.json'),
      JSON.stringify({ 'group/project': stateDir }),
      'utf8'
    );
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it('D-138: advances a review I have not started (no thread of mine) instead of blocking forever', async () => {
    // Regression: an empty {my:true} discussion set means I never posted here. The old debounce
    // could never see a reply-to-my-thread and a lone new commit stalled the MR's first pass.
    build([]);
    const advance = await scheduler.advance(fakeInstance(), registryWithEntry());
    assert.strictEqual(advance, true);
  });

  it('advances on a quiet tick — my thread exists but carries no fresh foreign reply', async () => {
    build([discussion('d1', [note(ME, '2026-07-20T10:00:00.000Z')])]);
    const advance = await scheduler.advance(fakeInstance(), registryWithEntry());
    assert.strictEqual(advance, true);
  });

  it('SV-20: a fresh reply in my thread arms the quiet window and holds this tick', async () => {
    build([
      discussion('d1', [
        note(ME, '2026-07-20T10:00:00.000Z'),
        note('teammate', '2026-07-23T09:00:00.000Z'), // after instance.createdAt → a fresh reply
      ]),
    ]);

    const advance = await scheduler.advance(fakeInstance(), registryWithEntry());

    assert.strictEqual(
      advance,
      false,
      'a just-arrived reply must not fire analysis in the same tick'
    );
    const tracker = new DebounceTracker(stateDir);
    assert.notStrictEqual(tracker.lastEventAt(REF), undefined, 'the window must be armed');
  });

  it('SV-19: a new commit with no reply in my thread holds the tick', async () => {
    // Real git worktree (TSK-147's createGitFixture) wired through buildNodeContext so
    // `headChanged` genuinely resolves to 'fast_forward' — not seeded/mocked. Plumbing:
    //  1. The fixture repo doubles as its own "origin" remote (fetch-from-self is a plain local
    //     read, no network) and gets a `refs/merge-requests/<iid>/head` ref pointing at its own
    //     HEAD, matching what `prepareMrWorktree` fetches in production.
    //  2. repos.json maps the project straight at the fixture path, so `ensureClone` returns it
    //     without attempting a real clone.
    //  3. inbox-registry.json seeds `lastReviewedHeadSha=baseSha` so `_classifyHeadChanged` has
    //     an ancestor to compare HEAD against (base is an ancestor of head → 'fast_forward').
    //  4. GITLAB_PERSONAL_TOKEN is set only for the duration of this test — `resolveVcsContext`
    //     requires a token even though it is never used for a network call here (repos.json hit).
    const fixture = createGitFixture({ 'a.txt': 'base' });
    const priorToken = process.env['GITLAB_PERSONAL_TOKEN'];
    process.env['GITLAB_PERSONAL_TOKEN'] = 'fixture-token';
    try {
      execFileSync('git', ['remote', 'add', 'origin', fixture.worktreePath], {
        cwd: fixture.worktreePath,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      execFileSync('git', ['update-ref', 'refs/merge-requests/7/head', fixture.headSha], {
        cwd: fixture.worktreePath,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      writeFileSync(
        join(stateDir, 'repos.json'),
        JSON.stringify({ 'group/project': fixture.worktreePath }),
        'utf8'
      );
      writeFileSync(
        join(stateDir, 'inbox-registry.json'),
        JSON.stringify({
          version: 1,
          entries: {
            [MR]: {
              project: 'group/project',
              iid: '7',
              role: null,
              stage: '',
              lastSeenUpdatedAt: OLD_CREATED_AT,
              firstSeenAt: OLD_CREATED_AT,
              lastClassifiedAt: OLD_CREATED_AT,
              lastReviewedHeadSha: fixture.baseSha,
            },
          },
        }),
        'utf8'
      );

      // My thread exists (non-empty {my:true}), no fresh foreign reply — only the real
      // fast_forward head movement should hold this tick.
      build([discussion('d1', [note(ME, '2026-07-20T10:00:00.000Z')])]);

      const advance = await scheduler.advance(fakeInstance(), registryWithEntry());

      assert.strictEqual(advance, false, 'a bare fast_forward commit must hold, not advance');
      const tracker = new DebounceTracker(stateDir);
      assert.strictEqual(
        tracker.lastEventAt(REF),
        undefined,
        'commit-only must not arm the debounce window (only a reply arms it)'
      );
    } finally {
      if (priorToken === undefined) delete process.env['GITLAB_PERSONAL_TOKEN'];
      else process.env['GITLAB_PERSONAL_TOKEN'] = priorToken;
      fixture.cleanup();
    }
  });

  it('SV-21: a pre-armed window that has fully elapsed advances and clears the marker', async () => {
    // Pre-arm the window in the ancient past so the real-clock quiet period is guaranteed elapsed.
    new DebounceTracker(stateDir).recordEvent(REF, OLD_CREATED_AT);
    build([discussion('d1', [note(ME, '2026-07-20T10:00:00.000Z')])]); // my thread, no foreign reply

    const advance = await scheduler.advance(fakeInstance(), registryWithEntry());

    assert.strictEqual(advance, true, 'an elapsed quiet window must let step() proceed');
    const tracker = new DebounceTracker(stateDir);
    assert.strictEqual(tracker.lastEventAt(REF), undefined, 'the elapsed window must be cleared');
  });
});
