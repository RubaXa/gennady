// @file: Unit + integration tests for inbox-roles mr-watch — detectMrEvents classification,
//   DebounceTracker quiet-period arm/reset/elapse, and the promoteReviewedHeadSha → update-review
//   reachability path (SV-19/20/21, agent-inbox spec §4.1.5).
// @consumers: node:test runner
// @tasks: TSK-141

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectMrEvents, DebounceTracker, type MrEventSignal } from '../mr-watch.ts';
import { StateStore } from '../../inbox-core/state-store.ts';
import { VcsInboxReal } from '../../inbox-core/vcs-inbox.real.ts';
import type { Discussion } from '../../inbox-core/vcs-inbox.port.ts';
import { ReviewerRole } from '../reviewer.role.ts';
import type { PrepNode, NodeContext, PrepResult } from '../role-node.ts';
import type { RegistryEntry } from '../../../../../cli/cmd/inbox/_core/logic/inbox-registry.logic.ts';

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inbox-roles-mr-watch-test-'));
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** @purpose One discussion thread where I hold a note, optionally with a later reply from someone else. */
function myThreadDiscussion(over?: { replyUsername?: string; replyAt?: string }): Discussion {
  const notes = [
    {
      id: 'n1',
      author: 'Me',
      username: 'me',
      body: 'looks fine so far',
      createdAt: '2026-07-22T10:00:00Z',
    },
  ];
  if (over?.replyUsername) {
    notes.push({
      id: 'n2',
      author: 'Author',
      username: over.replyUsername,
      body: 'addressed',
      createdAt: over.replyAt ?? '2026-07-22T10:00:00Z',
    });
  }
  return {
    id: 'd1',
    shortId: 'd1',
    author: 'me',
    body: 'looks fine so far',
    resolved: false,
    notes,
  };
}

describe('detectMrEvents', () => {
  it('commit without my-thread reply does not trigger step', () => {
    // contract: hasNewCommit and hasMyThreadReply are independent flags; a bare fast_forward
    // with no fresh reply must not arm the debounce window (only a reply does, per SV-20)
    const since = '2026-07-22T09:00:00Z';
    const discussions = [myThreadDiscussion()];

    const signal: MrEventSignal = detectMrEvents(discussions, 'fast_forward', 'me', since);

    assert.deepStrictEqual(signal, { hasNewCommit: true, hasMyThreadReply: false });

    // SV-19: a commit-only signal must never arm the debounce marker — a fresh tracker with
    // no recorded event stays closed regardless of how recent `now` is.
    const tracker = new DebounceTracker(tmpDir);
    const ref = 'g/p!101';
    assert.strictEqual(tracker.shouldTriggerAnalysis(ref, since), false);
  });

  it('first reply starts debounce, does not trigger immediately', () => {
    // Given: a reply from the author landed just now, inside my thread
    const since = '2026-07-22T10:00:00Z';
    const replyAt = '2026-07-22T10:05:00Z';
    const discussions = [myThreadDiscussion({ replyUsername: 'author', replyAt })];

    const signal = detectMrEvents(discussions, undefined, 'me', since);
    assert.strictEqual(signal.hasMyThreadReply, true);

    // When: shouldTriggerAnalysis is evaluated right at the moment the reply arms the window
    const tracker = new DebounceTracker(tmpDir);
    const ref = 'g/p!102';
    tracker.recordEvent(ref, replyAt);

    assert.strictEqual(tracker.shouldTriggerAnalysis(ref, replyAt), false);
  });

  it('new event resets debounce timer', () => {
    const ref = 'g/p!103';
    const tracker = new DebounceTracker(tmpDir);
    const t0 = '2026-07-22T11:00:00Z';
    const t0Plus4 = '2026-07-22T11:04:00Z';

    // #region START_RESET_SETUP_ARM_AND_PARTIAL_WAIT
    tracker.recordEvent(ref, t0);
    assert.strictEqual(
      tracker.shouldTriggerAnalysis(ref, t0Plus4),
      false,
      'only 4 minutes elapsed — window not yet open'
    );
    // #endregion END_RESET_SETUP_ARM_AND_PARTIAL_WAIT

    // A fresh event at the 4-minute mark re-arms the window from THIS moment.
    tracker.recordEvent(ref, t0Plus4);

    // #region START_RESET_ASSERT_WINDOW_RESTARTED
    const t0Plus8 = '2026-07-22T11:08:00Z'; // 8 min since t0, only 4 min since the reset event
    assert.strictEqual(
      tracker.shouldTriggerAnalysis(ref, t0Plus8),
      false,
      'reset event means only 4 minutes have elapsed since the new marker, not 8'
    );
    // #endregion END_RESET_ASSERT_WINDOW_RESTARTED
  });

  it('quiet period elapsed allows analysis', () => {
    const ref = 'g/p!104';
    const tracker = new DebounceTracker(tmpDir);
    const t0 = '2026-07-22T12:00:00Z';
    const t0Plus5 = '2026-07-22T12:05:00Z';

    tracker.recordEvent(ref, t0);
    assert.strictEqual(tracker.shouldTriggerAnalysis(ref, t0Plus5), true);
  });
});

describe('detectMrEvents — live (D-116)', () => {
  it('classifies real live MR discussions', async (t) => {
    const token = process.env.GITLAB_PERSONAL_TOKEN;
    if (!token) {
      t.skip('D-116: GITLAB_PERSONAL_TOKEN not set — no fixture fallback, honest skip.');
      return;
    }

    const host = 'gitlab.corp.mail.ru';
    const vcs = new VcsInboxReal({ host });

    // #region START_LIVE_SETUP_FIND_ACTIONABLE_MR — read-only, no writes
    let actionable: Awaited<ReturnType<typeof vcs.getActionable>>;
    try {
      actionable = await vcs.getActionable();
    } catch (cause) {
      t.skip(`D-116: live getActionable() unreachable — ${String(cause)}. Honest skip.`);
      return;
    }
    if (actionable.length === 0) {
      t.skip('D-116: no actionable MRs for the operator right now — nothing to classify against.');
      return;
    }

    const mr = actionable[0]!;
    const myLogin = await vcs.getMyLogin();
    const discussions = await vcs.getDiscussions(mr.webUrl, { my: true });
    // #endregion END_LIVE_SETUP_FIND_ACTIONABLE_MR

    const since = '2020-01-01T00:00:00Z'; // far past — any real note counts as "fresh"
    const signal = detectMrEvents(discussions, undefined, myLogin, since);

    // observation focus: structural correctness on the real GitLab response shape, not a
    // specific business outcome — this MR's actual thread state decides true/false.
    assert.strictEqual(typeof signal.hasNewCommit, 'boolean');
    assert.strictEqual(typeof signal.hasMyThreadReply, 'boolean');
  });
});

describe('promoteReviewedHeadSha → update-review reachability', () => {
  function makeRegistryEntry(over?: Partial<RegistryEntry>): RegistryEntry {
    return {
      project: 'g/p',
      iid: '105',
      role: 'reviewer',
      stage: 'review_needed',
      lastSeenUpdatedAt: '2026-07-22T00:00:00Z',
      firstSeenAt: '2026-07-22T00:00:00Z',
      lastClassifiedAt: '2026-07-22T00:00:00Z',
      ...over,
    };
  }

  it('promoteReviewedHeadSha unlocks update-review branch', async () => {
    const webUrl = 'https://gitlab.example.com/g/p/-/merge_requests/105';
    const stateDir = join(tmpDir, 'promote-unlock');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'inbox-registry.json'),
      JSON.stringify({
        version: 1,
        entries: { [webUrl]: makeRegistryEntry({ candidateHeadSha: 'sha-new-commit' }) },
      })
    );

    // #region START_PROMOTE_SIMULATE_GATE_SYNTHESIS_PASS
    // Simulates what RoleInstance#_promoteReviewedHead does once gate_review_synthesis/
    // gate_delta_synthesis passes: candidateHeadSha (already set above) is promoted to
    // lastReviewedHeadSha and persisted — the actual call this phase's P1 wired in.
    const store = new StateStore(stateDir);
    store.loadRegistry();
    store.promoteReviewedHeadSha(webUrl);
    store.saveRegistry();
    // #endregion END_PROMOTE_SIMULATE_GATE_SYNTHESIS_PASS

    // Reload from a fresh StateStore instance — proves the promotion round-tripped through disk,
    // not just an in-memory mutation.
    const reloaded = new StateStore(stateDir).loadRegistry();
    const promotedSha = reloaded.entries[webUrl]?.lastReviewedHeadSha;
    assert.strictEqual(promotedSha, 'sha-new-commit');

    // #region START_PROMOTE_TRIGGER_PREP_NODE — the MR then gets a new commit (fast_forward);
    // node_prepare (ReviewerRole's public graph) must now pick update-review, not review_needed.
    const prepNode = ReviewerRole.graph.nodes.find((n) => n.id === 'node_prepare') as
      | PrepNode
      | undefined;
    assert.ok(prepNode, 'ReviewerRole graph must expose a node_prepare prep node');

    const ctx: NodeContext = {
      mr: {
        project: 'g/p',
        iid: '105',
        webUrl,
        title: 'Some MR',
        sourceBranch: 'feature',
        targetBranch: 'main',
        createdAt: '2026-07-22T00:00:00Z',
        updatedAt: '2026-07-22T00:00:00Z',
        author: 'author',
        reviewers: ['me'],
      },
      workspace: stateDir,
      artifacts: {
        headChanged: 'fast_forward',
        lastReviewedHeadSha: promotedSha,
      },
    };
    // #endregion END_PROMOTE_TRIGGER_PREP_NODE

    const result: PrepResult = await prepNode!.run(ctx);
    assert.strictEqual(result.branch, 'update-review');
  });
});
