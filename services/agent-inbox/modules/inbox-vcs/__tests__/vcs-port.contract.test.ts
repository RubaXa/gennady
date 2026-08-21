// @file: Closed-world contract proof for unified VCS read, effect, action, and outcome variants.
// @consumers: node:test runner
// @tasks: TSK-174

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { composeVcsEffectId } from '../effects.ts';
import {
  validateVcsEffectRequest,
  type VcsEffectKind,
  type VcsEffectOutcome,
  type VcsEffectRequest,
} from '../vcs-port.ts';
import { MemoryVcsPort } from './vcs-test-context.ts';
import { ReadonlyVcsEffectError } from '../readonly-effect.guard.ts';
import { selectVcsRuntime, type VcsRuntime } from '../vcs-runtime.ts';
import { VcsGitlabPort } from '../vcs-gitlab.port.ts';
import type { VcsGitlabClient } from '../../../../vcs-client/gitlab/vcs-gitlab-client.ts';

type VcsPortContractContext = {
  port: MemoryVcsPort;
  composeRequest(kind: VcsEffectKind): VcsEffectRequest;
};

function createVcsPortContractContext(): VcsPortContractContext {
  const port = new MemoryVcsPort();
  const composeRequest = (kind: VcsEffectKind): VcsEffectRequest => {
    const request: Omit<VcsEffectRequest, 'effectId'> = {
      kind,
      project: 'group/project',
      iid: '42',
      revision: 'sha-1',
      currentRevision: 'sha-1',
      permission: {
        operatorLogin: 'operator',
        operatorIsMrAuthor: true,
        reviewerPermission: true,
        threadAuthor: 'operator',
        automatic: false,
      },
      ...(['comment', 'reply', 'request_changes', 'edit_description'].includes(kind)
        ? { body: 'Blocking review body' }
        : {}),
      ...(['reply', 'resolve', 'reopen'].includes(kind) ? { discussionId: 'discussion-1' } : {}),
      ...(kind === 'react' ? { noteId: 'note-1', emoji: 'thumbsup' } : {}),
    };
    return { ...request, effectId: composeVcsEffectId(request) };
  };
  return { port, composeRequest };
}

describe('unified VCS contracts', () => {
  it('VCS contracts handle every action and outcome exhaustively', () => {
    // contract: every supported kind validates while an unknown kind fails before a port method can run

    // #region START_EXHAUSTIVE_CONTRACT_SETUP_CLOSED_VARIANTS
    const context = createVcsPortContractContext();
    const kinds: VcsEffectKind[] = [
      'comment',
      'reply',
      'react',
      'resolve',
      'reopen',
      'approve',
      'unapprove',
      'request_changes',
      'edit_description',
    ];
    const outcomes: VcsEffectOutcome['status'][] = [
      'applied',
      'no_op',
      'denied',
      'unavailable',
      'failed',
      'unknown',
    ];
    // #endregion END_EXHAUSTIVE_CONTRACT_SETUP_CLOSED_VARIANTS

    const validated = kinds.map((kind) => validateVcsEffectRequest(context.composeRequest(kind)));

    // #region START_EXHAUSTIVE_CONTRACT_ASSERT_BOUNDARY
    assert.deepStrictEqual(
      validated.map((request) => request.kind),
      kinds
    );
    assert.deepStrictEqual(outcomes, [
      'applied',
      'no_op',
      'denied',
      'unavailable',
      'failed',
      'unknown',
    ]);
    assert.throws(
      () =>
        validateVcsEffectRequest({
          ...context.composeRequest('approve'),
          kind: 'merge_without_review',
        }),
      /\[validateVcsEffectRequest\] Unsupported kind/
    );
    assert.strictEqual(context.port.mutationCalls.length, 0);
    // #endregion END_EXHAUSTIVE_CONTRACT_ASSERT_BOUNDARY
  });

  type RuntimeContractCase = {
    name: 'memory' | 'readonly' | 'real-gitlab';
    writable: boolean;
    create(): { runtime: VcsRuntime; mutationCalls: string[] };
  };

  const createRealRuntime = (): { runtime: VcsRuntime; mutationCalls: string[] } => {
    const mutationCalls: string[] = [];
    const client = {
      getCurrentUser: async () => ({ login: 'operator' }),
      Inbox: { getActionable: async () => [] },
      MergeDiscussions: {
        createDiscussion: async () => {
          mutationCalls.push('comment');
        },
      },
      supportsRequestChanges: async () => false,
    } as unknown as VcsGitlabClient;
    return {
      runtime: selectVcsRuntime('real-work', new VcsGitlabPort(client, 'gitlab.example.com')),
      mutationCalls,
    };
  };

  const cases: RuntimeContractCase[] = [
    {
      name: 'memory',
      writable: true,
      create: () => {
        const adapter = new MemoryVcsPort();
        return {
          runtime: selectVcsRuntime('deterministic-mock', adapter),
          mutationCalls: adapter.mutationCalls,
        };
      },
    },
    {
      name: 'readonly',
      writable: false,
      create: () => {
        const adapter = new MemoryVcsPort();
        return {
          runtime: selectVcsRuntime('real-readonly', adapter),
          mutationCalls: adapter.mutationCalls,
        };
      },
    },
    { name: 'real-gitlab', writable: true, create: createRealRuntime },
  ];

  for (const contractCase of cases) {
    it(`${contractCase.name} runtime passes the common read/effect port contract`, async () => {
      const context = contractCase.create();
      assert.strictEqual(typeof context.runtime.read.getInbox, 'function');
      assert.strictEqual(typeof context.runtime.read.readSnapshot, 'function');
      assert.strictEqual(typeof context.runtime.read.probeCapabilities, 'function');
      assert.strictEqual(typeof context.runtime.effects.postDiscussion, 'function');
      assert.strictEqual(typeof context.runtime.effects.requestChanges, 'function');
      assert.deepStrictEqual(await context.runtime.read.getInbox(), []);

      if (contractCase.writable) {
        await context.runtime.effects.postDiscussion('group/project', '42', 'contract body');
        assert.deepStrictEqual(context.mutationCalls, ['comment']);
      } else {
        await assert.rejects(
          context.runtime.effects.postDiscussion('group/project', '42', 'contract body'),
          (error: unknown) => error instanceof ReadonlyVcsEffectError
        );
        assert.deepStrictEqual(context.mutationCalls, []);
      }
    });
  }

  it('real GitLab reopen and unapprove preserve provider failures behind adapter errors', async () => {
    const reopenCause = new Error('provider reopen failure');
    const unapproveCause = new Error('provider unapprove failure');
    const client = {
      MergeDiscussions: {
        resolveDiscussion: async () => {
          throw reopenCause;
        },
      },
      MergeRequests: {
        unapprove: async () => {
          throw unapproveCause;
        },
      },
    } as unknown as VcsGitlabClient;
    const port = new VcsGitlabPort(client, 'gitlab.example.com');

    await assert.rejects(port.reopen('group/project', '42', 'discussion-1'), (error: unknown) => {
      assert.notStrictEqual(error, reopenCause);
      assert.match((error as Error).message, /^\[VcsGitlabPort#reopen\]/);
      assert.strictEqual((error as Error).cause, reopenCause);
      return true;
    });
    await assert.rejects(port.unapprove('group/project', '42'), (error: unknown) => {
      assert.notStrictEqual(error, unapproveCause);
      assert.match((error as Error).message, /^\[VcsGitlabPort#unapprove\]/);
      assert.strictEqual((error as Error).cause, unapproveCause);
      return true;
    });
  });
});
