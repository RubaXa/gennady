// @file: Unit + integration tests for inbox-roles thread-signal-classifier — SV-22 decision table
//   (a)-(e), the peer-thread structural invariant, a live read-only classification against a real
//   actionable MR (D-116), and the dry-run guard proving EffectExecutor never posts a real write
//   when dispatching the "commit+verified, author silent" case.
// @consumers: node:test runner
// @tasks: TSK-142

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyThreadSignals,
  decideThreadAction,
  type MrDiffContext,
  type ThreadDecision,
  type ThreadSignalVerdict,
} from '../thread-signal-classifier.ts';
import { EffectExecutor, type ProposedAction } from '../effect-executor.ts';
import { VcsInboxReal } from '../../inbox-core/vcs-inbox.real.ts';
import { setDryRunBroadcaster, type DryRunEntry } from '../../inbox-core/dry-run.ts';
import type { AuditEntry } from '../../inbox-core/audit-log.ts';
import type { StateStore } from '../../inbox-core/state-store.ts';

/** @purpose Minimal in-memory StateStore double — audit-only, matches EffectExecutor's needs. */
class FakeStateStore {
  public audits: AuditEntry[] = [];

  getStateDir() {
    return '/home/test/.gennady';
  }

  loadRegistry() {
    return { version: 1, entries: {} };
  }

  async appendAudit(entry: AuditEntry) {
    this.audits.push(entry);
  }

  async queryAudit(_mr: string): Promise<AuditEntry[]> {
    return [...this.audits];
  }
}

/** @purpose Baseline "own, unresolved, no signals" verdict — every case overrides only what it needs. */
function createVerdict(overrides?: Partial<ThreadSignalVerdict>): ThreadSignalVerdict {
  return {
    claim: false,
    commit: false,
    verified: false,
    ownedByMe: true,
    lastNoteFromAuthor: false,
    disputed: false,
    quietPeriodElapsed: false,
    ...overrides,
  };
}

describe('decideThreadAction — SV-22 rule table (a)-(e)', () => {
  const cases: Array<{ name: string; verdict: ThreadSignalVerdict; expected: ThreadDecision }> = [
    {
      name: 'resolves silently when commit and verified with no author comment',
      verdict: createVerdict({ commit: true, verified: true, lastNoteFromAuthor: false }),
      expected: { kind: 'resolve_silently' },
    },
    {
      name: 'reacts to author comment then resolves when verified',
      verdict: createVerdict({ commit: true, verified: true, lastNoteFromAuthor: true }),
      expected: { kind: 'react_then_resolve' },
    },
    {
      name: 'skips silently on unverified commit without claim',
      verdict: createVerdict({ commit: true, verified: false, claim: false }),
      expected: { kind: 'skip' },
    },
    {
      name: 'autonomously replies not-done after quiet period on false claim',
      verdict: createVerdict({
        claim: true,
        commit: false,
        verified: false,
        quietPeriodElapsed: true,
      }),
      expected: { kind: 'reply_not_done' },
    },
    {
      name: 'flags dispute without resolving',
      verdict: createVerdict({ disputed: true, commit: true, verified: true }),
      expected: { kind: 'dispute' },
    },
  ];

  for (const { name, verdict, expected } of cases) {
    it(name, () => {
      assert.deepStrictEqual(decideThreadAction(verdict), expected);
    });
  }
});

describe('decideThreadAction — peer-thread structural invariant', () => {
  it('never resolves a peer-owned thread', () => {
    // contract: ownership guard runs FIRST, unconditionally — even when every fix-signal fires
    // non-goal: this is not "resolve happens to be false for this input", it is a structural block
    const verdict = createVerdict({
      ownedByMe: false,
      commit: true,
      verified: true,
      claim: true,
      lastNoteFromAuthor: true,
      quietPeriodElapsed: true,
    });

    const decision = decideThreadAction(verdict);

    assert.notStrictEqual(decision.kind, 'resolve_silently');
    assert.notStrictEqual(decision.kind, 'react_then_resolve');
    assert.strictEqual(decision.kind, 'skip');
  });
});

describe('classifyThreadSignals — live (D-116)', () => {
  it('classifies real live thread signals', async (t) => {
    const token = process.env.GITLAB_PERSONAL_TOKEN;
    if (!token) {
      t.skip('D-116: GITLAB_PERSONAL_TOKEN not set — no fixture fallback, honest skip.');
      return;
    }

    const host = 'gitlab.corp.mail.ru';
    const vcs = new VcsInboxReal({ host });

    // #region START_LIVE_CLASSIFY_SETUP_FIND_THREAD — read-only, no writes
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
    if (discussions.length === 0) {
      t.skip('D-116: no open thread of mine on this actionable MR — nothing to classify.');
      return;
    }
    const mrContext = await vcs.getMrContext(mr.webUrl);
    const thread = discussions[0]!;
    // #endregion END_LIVE_CLASSIFY_SETUP_FIND_THREAD

    const mrDiff: MrDiffContext = {
      changedFiles: new Set(thread.file ? [thread.file] : []),
      worktreePath: process.cwd(),
      authorLogin: mrContext.author,
    };

    const verdict = classifyThreadSignals(thread, mrDiff, myLogin);

    // observation focus: structural correctness of the real classification — verified is a real
    // file:line re-read on current HEAD (never a stub); this MR's actual thread state decides the
    // concrete booleans, not this test.
    // #region START_LIVE_CLASSIFY_ASSERT_STRUCTURE
    assert.strictEqual(typeof verdict.claim, 'boolean');
    assert.strictEqual(typeof verdict.commit, 'boolean');
    assert.strictEqual(typeof verdict.verified, 'boolean');
    assert.strictEqual(typeof verdict.ownedByMe, 'boolean');
    assert.strictEqual(typeof verdict.lastNoteFromAuthor, 'boolean');
    // invariant: verified can never be true without commit — real code re-read, not a shortcut
    assert.ok(!verdict.verified || verdict.commit);
    // #endregion END_LIVE_CLASSIFY_ASSERT_STRUCTURE
  });
});

describe('EffectExecutor — dry-run resolve (D-116, live read-only reconcile)', () => {
  it('dry-run resolve does not post to real MR', async (t) => {
    const token = process.env.GITLAB_PERSONAL_TOKEN;
    if (!token) {
      t.skip('D-116: GITLAB_PERSONAL_TOKEN not set — no fixture fallback, honest skip.');
      return;
    }

    const host = 'gitlab.corp.mail.ru';
    const vcs = new VcsInboxReal({ host });

    // #region START_DRY_RUN_SETUP_FIND_THREAD — read-only, no writes
    let actionable: Awaited<ReturnType<typeof vcs.getActionable>>;
    try {
      actionable = await vcs.getActionable();
    } catch (cause) {
      t.skip(`D-116: live getActionable() unreachable — ${String(cause)}. Honest skip.`);
      return;
    }
    if (actionable.length === 0) {
      t.skip('D-116: no actionable MRs — nothing to dispatch a dry-run resolve against.');
      return;
    }

    const mr = actionable[0]!;
    const before = await vcs.getDiscussions(mr.webUrl, { my: true });
    if (before.length === 0) {
      t.skip('D-116: no open thread of mine on this actionable MR — nothing to dry-run resolve.');
      return;
    }
    const thread = before[0]!;
    // #endregion END_DRY_RUN_SETUP_FIND_THREAD

    // synthetic case: commit+verified, author silent (rule a) — decides resolve_silently
    const verdict = createVerdict({ commit: true, verified: true, lastNoteFromAuthor: false });
    const decision = decideThreadAction(verdict);
    assert.strictEqual(decision.kind, 'resolve_silently');

    const action: ProposedAction = { type: 'resolve', discussionId: thread.id, resolve: true };
    const store = new FakeStateStore();
    const captured: DryRunEntry[] = [];

    // #region START_DRY_RUN_TRIGGER_DISPATCH
    setDryRunBroadcaster((entry) => captured.push(entry));
    let result: Awaited<ReturnType<InstanceType<typeof EffectExecutor>['execute']>>;
    try {
      const executor = new EffectExecutor({
        vcs,
        store: store as unknown as StateStore,
        dryRun: true,
      });
      result = await executor.execute({ mr: mr.webUrl, role: 'reviewer', nodeId: 'test-dry-run' }, [
        action,
      ]);
    } finally {
      setDryRunBroadcaster(null);
    }
    // #endregion END_DRY_RUN_TRIGGER_DISPATCH

    // #region START_DRY_RUN_ASSERT_NO_REAL_WRITE
    assert.strictEqual(result.outcomes[0]?.status, 'applied');
    assert.ok(
      captured.some(
        (e) => e.channel === 'mr' && /^DRY-RUN post→MR .*resolve discussion/.test(e.line)
      )
    );

    // hard invariant: re-reading the SAME thread from the real MR shows no change — the dry-run
    // branch never reached the real vcs-reply POST that would have flipped `resolved`
    const after = await vcs.getDiscussions(mr.webUrl, { my: true, all: true });
    const stillThere = after.find((d) => d.id === thread.id);
    assert.strictEqual(stillThere?.resolved, thread.resolved);
    // #endregion END_DRY_RUN_ASSERT_NO_REAL_WRITE
  });
});
