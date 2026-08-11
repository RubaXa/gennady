// @file: Integration tests — zero-ref independent command gates; hidden refs reroute guarded.
// @consumers: TSK-177 audit
// @tasks: TSK-177

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ReviewEffectCoordinator } from '../../../services/agent-inbox/modules/inbox-queue/effects/review-effect-coordinator.ts';
import { ReviewActionCatalog } from '../../../services/agent-inbox/modules/inbox-queue/registry/review-action-catalog.ts';
import type { IndependentOperatorCommand } from '../../../services/agent-inbox/modules/inbox-queue/effects/review-effect-coordinator.ts';
import type {
  JournalPort,
  JournalEntry,
} from '../../../services/agent-inbox/modules/inbox-core/event-journal.ts';
import {
  VcsPort,
  type VcsEffectKind,
  type VcsActionableMr,
  type MrDetail,
  type VcsDiscussion,
} from '../../../services/agent-inbox/modules/inbox-vcs/vcs-port.ts';

// ── Fakes ────────────────────────────────────────────────────────────────────

function createMemoryJournal(): JournalPort {
  const entries: JournalEntry[] = [];
  return {
    identity: 'memory-journal',
    health: () => ({ status: 'healthy' }),
    append: async (entry) => {
      const seq = entries.length + 1;
      entries.push({ ...entry, seq });
      return seq;
    },
    read: () => [...entries],
    since: (cursor) => {
      const filtered = entries.filter((e) => e.seq > cursor);
      const nextCursor = entries.length > 0 ? (entries[entries.length - 1]?.seq ?? cursor) : cursor;
      return { entries: filtered, nextCursor };
    },
    appendReviewEvent: async () => {
      throw new Error('not implemented');
    },
    replayReviewEvents: () => [],
  };
}

class StubVcsPort extends VcsPort {
  getHost(): string {
    return 'https://gitlab.test';
  }
  async getCurrentUserLogin(): Promise<string> {
    throw new Error('not implemented');
  }
  async getInbox(): Promise<VcsActionableMr[]> {
    throw new Error('not implemented');
  }
  async getMrDetail(): Promise<MrDetail> {
    throw new Error('not implemented');
  }
  async getDiscussions(): Promise<{
    discussions: VcsDiscussion[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  }> {
    throw new Error('not implemented');
  }
  async compareSha(): Promise<{ commits: string[]; complete: boolean; evidence: string }> {
    throw new Error('not implemented');
  }
  async postNote(): Promise<void> {
    throw new Error('not implemented');
  }
  async postDiscussion(): Promise<void> {
    throw new Error('not implemented');
  }
  async react(): Promise<void> {
    throw new Error('not implemented');
  }
  async resolve(): Promise<void> {
    throw new Error('not implemented');
  }
  async approve(): Promise<void> {
    throw new Error('not implemented');
  }
  async editDescription(): Promise<void> {
    throw new Error('not implemented');
  }
}

// ── Context factory ───────────────────────────────────────────────────────────

type IndependentContext = { coordinator: ReviewEffectCoordinator };

function createIndependentContext(): IndependentContext {
  const catalog = new ReviewActionCatalog();
  const journal = createMemoryJournal();
  const vcs = new StubVcsPort() as unknown as VcsPort;
  return { coordinator: new ReviewEffectCoordinator(vcs, journal, catalog) };
}

const BASE_COMMAND: IndependentOperatorCommand = Object.freeze({
  operatorCommandId: 'cmd-001',
  operatorLogin: 'alice',
  mr: 'g/p!1',
  kind: 'resolve' as const,
  payload: Object.freeze({ body: '' }),
  directTargetId: 'disc:42',
  directTargetVersion: 'ver:1',
  examinedRoundRefs: Object.freeze([]),
});

describe('ReviewIndependentCommand', () => {
  it('zero current round refs require queue permission allowlist freshness and provider gates only', async () => {
    // invariant: command with examinedRoundRefs=[] is classified as operator-independent;
    //   catalog must know the kind (permission gate); supported kind → effect created with zero deps
    const { coordinator } = createIndependentContext();

    const effect = await coordinator.executeIndependentOperatorCommand(BASE_COMMAND);

    // #region START_ZERO_REF_ASSERT
    assert.ok(effect !== undefined, 'effect must be produced for zero-ref command');

    // identity: operator-independent bound to command; zero deps; kind matches command
    assert.strictEqual(effect.identity.origin, 'operator-independent');
    if (effect.identity.origin === 'operator-independent') {
      assert.strictEqual(effect.identity.operatorCommandId, BASE_COMMAND.operatorCommandId);
      assert.strictEqual(effect.identity.directTargetId, BASE_COMMAND.directTargetId);
      assert.strictEqual(effect.identity.directTargetVersion, BASE_COMMAND.directTargetVersion);
    }
    assert.deepStrictEqual([...effect.dependsOn], []);
    assert.strictEqual(effect.kind, 'resolve');

    // effectId is stable across duplicate calls; provenance records zero examined refs
    const duplicate = await coordinator.executeIndependentOperatorCommand(BASE_COMMAND);
    assert.ok(duplicate !== undefined);
    assert.strictEqual(duplicate.effectId, effect.effectId);
    assert.deepStrictEqual([...effect.provenance.examinedRefs], []);
    // #endregion END_ZERO_REF_ASSERT
  });

  it('round references reroute guarded or reject with zero effect', async () => {
    // invariant: any nonzero examinedRoundRef in the command routes to guarded path → returns undefined;
    //   unsupported action kind → returns undefined (gate denied); no effect is created
    const { coordinator } = createIndependentContext();

    // #region START_ROUND_REF_REROUTE_ASSERT
    // Hidden round ref: command claims independent but has a round artifact reference
    const commandWithRef: IndependentOperatorCommand = {
      ...BASE_COMMAND,
      examinedRoundRefs: Object.freeze(['guard:g1']),
    };
    const result1 = await coordinator.executeIndependentOperatorCommand(commandWithRef);
    assert.strictEqual(result1, undefined, 'nonzero round ref must produce no effect');

    // Unknown kind: coordinator resolveAction fails → undefined
    const unknownKind: IndependentOperatorCommand = {
      ...BASE_COMMAND,
      kind: 'unknown_kind' as VcsEffectKind,
    };
    const result2 = await coordinator.executeIndependentOperatorCommand(unknownKind);
    assert.strictEqual(result2, undefined, 'unknown kind must produce no effect');

    // Multiple round refs: all routes to guarded path
    const multiRef: IndependentOperatorCommand = {
      ...BASE_COMMAND,
      examinedRoundRefs: Object.freeze(['ref:1', 'ref:2', 'ref:3']),
    };
    const result3 = await coordinator.executeIndependentOperatorCommand(multiRef);
    assert.strictEqual(result3, undefined, 'multiple round refs must produce no effect');
    // #endregion END_ROUND_REF_REROUTE_ASSERT
  });

  it('different operator commands produce different effect IDs for the same kind and target', async () => {
    // invariant: effectId is computed from commandId — different commands targeting the same thread
    //   get distinct effect IDs preventing accidental dedup
    const { coordinator } = createIndependentContext();

    const cmd1 = { ...BASE_COMMAND, operatorCommandId: 'cmd-A' };
    const cmd2 = { ...BASE_COMMAND, operatorCommandId: 'cmd-B' };

    const eff1 = await coordinator.executeIndependentOperatorCommand(cmd1);
    const eff2 = await coordinator.executeIndependentOperatorCommand(cmd2);

    assert.ok(eff1 !== undefined);
    assert.ok(eff2 !== undefined);
    assert.notStrictEqual(eff1.effectId, eff2.effectId);
  });
});
