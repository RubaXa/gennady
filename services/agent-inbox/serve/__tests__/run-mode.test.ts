// @file: Integration tests for run-mode's runMrsOnce — a fixed MR list driven through the real
//   role graph (RoleInstance/RoleEngine/EffectExecutor), network-free via VcsInboxMock/OpenCodeMock
//   and an injected fetchDiffRefs stub. Covers: review_needed reaches ask-terminal with staged
//   proposedActions (real reviewer graph); effect dry-run posts nothing and a second pass is
//   idempotent (0 new effect_applied) via a minimal prep→effect graph.
// @consumers: node:test runner
// @tasks: TSK-121

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMrsOnce, type RunModeDeps } from '../run-mode.ts';
import { RoleEngine } from '../../modules/inbox-roles/role-engine.ts';
import type { RoleGraph } from '../../modules/inbox-roles/role-node.ts';
import { StateStore } from '../../modules/inbox-core/state-store.ts';
import { VcsInboxMock } from '../../modules/inbox-core/vcs-inbox.mock.ts';
import type { MrContext } from '../../modules/inbox-core/vcs-inbox.port.ts';
import { OpenCodeMock } from '../../modules/inbox-opencode/opencode.mock.ts';

/**
 * @purpose Fresh StateStore rooted at a temp dir, with `agent-inbox/` pre-created so
 *   `appendAudit` can write immediately — never touches the real `~/.gennady` registry.
 *   Also seeds `repos.json` pointing at the (non-git) temp dir itself so context-builder's
 *   `ensureClone` short-circuits on the reposMap hit instead of attempting a real network clone —
 *   the subsequent `git worktree prune` on a non-repo then fails fast, locally, keeping this suite
 *   network-free per the P4 job's constraint.
 */
function makeStateStore(): StateStore {
  const stateDir = mkdtempSync(join(tmpdir(), 'gennady-run-mode-'));
  mkdirSync(join(stateDir, 'agent-inbox'), { recursive: true });
  writeFileSync(
    join(stateDir, 'repos.json'),
    JSON.stringify({ 'group/project': stateDir }),
    'utf8'
  );
  return new StateStore(stateDir);
}

function mrContext(webUrl: string, myRole: string | null): MrContext {
  return {
    project: 'group/project',
    iid: '1',
    webUrl,
    title: 'Test MR',
    sourceBranch: 'feature',
    targetBranch: 'main',
    createdAt: '',
    updatedAt: '',
    author: 'other',
    reviewers: [],
    approvedBy: [],
    description: '',
    myRole,
  };
}

describe('runMrsOnce — real reviewer graph reaches ask-terminal (review_needed)', () => {
  it('GIVEN список MR + свежий seed WHEN run-mode THEN MR доходит до node_ask (awaiting_operator), proposedActions застейджены', async () => {
    const MR = 'https://gitlab.example.com/group/project/-/merge_requests/1';

    const engine = new RoleEngine();
    await engine.loadAll();

    const vcs = new VcsInboxMock();
    vcs.seed([], { [MR]: mrContext(MR, 'reviewer') });

    const opencode = new OpenCodeMock();
    opencode.seed('node_track_review', { findings: [{ id: 1 }], tracksCovered: [] });
    opencode.seed('node_security_lens', { findings: [] });
    opencode.seed('node_code_review', { findings: [] });
    opencode.seed('node_synthesize', {
      reviewReport: { verdict: 'changes_requested' },
      recommendations: [],
      proposedActions: [
        { type: 'reply', body: 'Fix this', position: { file: 'a.ts', newLine: 10 } },
        { type: 'reply', body: 'General note' },
      ],
    });

    const store = makeStateStore();
    const deps: RunModeDeps = {
      engine,
      store,
      vcs,
      opencode,
      fetchDiffRefs: async () => undefined,
    };

    const result = await runMrsOnce({ mrs: [MR], dryRun: true, deps });

    assert.strictEqual(result.results.length, 1);
    const mrResult = result.results[0];
    assert.strictEqual(mrResult.state, 'awaiting_operator');
    assert.strictEqual(mrResult.role, 'reviewer');
    assert.ok(mrResult.board, 'board snapshot should be present');
    assert.strictEqual((mrResult.board as Record<string, unknown>).currentNode, 'node_ask');

    const synth = mrResult.artifacts?.node_synthesize as Record<string, unknown>;
    assert.ok(
      Array.isArray(synth?.proposedActions),
      'node_synthesize should stage proposedActions'
    );
    assert.strictEqual((synth.proposedActions as unknown[]).length, 2);
  });
});

describe('runMrsOnce — effect dry-run + идемпотентность', () => {
  /** @purpose Minimal graph reaching node_effect without an operator answer — proves the
   *   dry-run/idempotency contract end-to-end through runMrsOnce, independent of the real
   *   reviewer graph's ask-gated effect node. */
  function makeEffectGraph(): RoleGraph {
    return {
      nodes: [
        {
          kind: 'prep',
          id: 'node_prep',
          async run() {
            return {
              branch: 'go',
              // Nested under a node-keyed artifact (mirrors node_thread_triage's shape) — RoleInstance
              // #_collectProposedActions scans artifact *values* for a `.proposedActions` field, not
              // a top-level `artifacts.proposedActions` key.
              artifacts: {
                node_prep: { proposedActions: [{ type: 'react', commentId: 'c1', emoji: '👍' }] },
              },
            };
          },
        },
        {
          kind: 'effect',
          id: 'node_effect',
          async run() {
            /* staged action applied by RoleInstance/EffectExecutor */
          },
        },
      ],
      edges: [
        { from: 'node_prep', to: 'node_effect', on: 'go' },
        { from: 'node_effect', to: 'done', on: 'ok' },
      ],
    };
  }

  it('GIVEN effect-узел + dry-run WHEN execute THEN EffectExecutor вызван, 0 реальных постингов, повтор → 0 новых', async () => {
    const MR = 'https://gitlab.example.com/group/project/-/merge_requests/2';

    const engine = new RoleEngine();
    engine.register({
      name: 'test-effect',
      description: 'minimal graph reaching node_effect without an ask gate',
      graph: makeEffectGraph(),
    });

    const vcs = new VcsInboxMock();
    vcs.seed([], { [MR]: mrContext(MR, 'test-effect') });

    const opencode = new OpenCodeMock();
    const store = makeStateStore();
    const deps: RunModeDeps = {
      engine,
      store,
      vcs,
      opencode,
      fetchDiffRefs: async () => undefined,
    };

    // First pass — dry-run (default): EffectExecutor runs, reconcile/dedup + effect_applied marker
    // fire, but the real vcs-* call (_apply) is withheld.
    const first = await runMrsOnce({ mrs: [MR], deps });
    const firstResult = first.results[0];
    assert.strictEqual(firstResult.state, 'done');

    const effectResult = firstResult.artifacts?.node_effect_result as {
      outcomes: Array<{ status: string }>;
    };
    assert.strictEqual(effectResult.outcomes.length, 1);
    assert.strictEqual(effectResult.outcomes[0].status, 'applied');

    const auditAfterFirst = await store.queryAudit(MR);
    const appliedCountAfterFirst = auditAfterFirst.filter(
      (e) => e.event === 'effect_applied'
    ).length;
    assert.ok(
      appliedCountAfterFirst > 0,
      'at least one effect_applied marker after the first pass'
    );

    // Second pass over the same MR/store — RoleInstance's own effect_applied guard (generic
    // `node:<id>` marker, appended before EffectExecutor even runs) sees the prior pass and skips
    // node.run()/EffectExecutor entirely (0 new applied, G10 sense) — regardless of exactly how
    // many markers the first pass produced (RoleInstance's own + EffectExecutor's finer one).
    const second = await runMrsOnce({ mrs: [MR], deps });
    const secondResult = second.results[0];
    assert.strictEqual(secondResult.state, 'done');
    assert.strictEqual(
      secondResult.artifacts?.node_effect_result,
      undefined,
      'second pass never re-enters EffectExecutor — effect already applied'
    );

    const auditAfterSecond = await store.queryAudit(MR);
    const appliedCountAfterSecond = auditAfterSecond.filter(
      (e) => e.event === 'effect_applied'
    ).length;
    assert.strictEqual(
      appliedCountAfterSecond,
      appliedCountAfterFirst,
      '0 new effect_applied entries on the second pass'
    );
  });
});

describe('runMrsOnce — per-MR result shape for an unresolved role', () => {
  it('GIVEN MR без myRole WHEN run-mode THEN результат unresolved_role, граф не запускается', async () => {
    const MR = 'https://gitlab.example.com/group/project/-/merge_requests/3';

    const engine = new RoleEngine();
    await engine.loadAll();

    const vcs = new VcsInboxMock();
    vcs.seed([], { [MR]: mrContext(MR, null) });

    const store = makeStateStore();
    const deps: RunModeDeps = {
      engine,
      store,
      vcs,
      opencode: new OpenCodeMock(),
      fetchDiffRefs: async () => undefined,
    };

    const result = await runMrsOnce({ mrs: [MR], deps });
    const mrResult = result.results[0];

    assert.strictEqual(mrResult.state, 'unresolved_role');
    assert.strictEqual(mrResult.board, null);
    assert.strictEqual(mrResult.artifacts, null);
  });
});
