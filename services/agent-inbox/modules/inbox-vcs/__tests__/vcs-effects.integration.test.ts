// @file: Ambiguous effect reconciliation and native request-changes integration tests.
// @consumers: node:test runner
// @tasks: TSK-174

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryJournal } from '../../inbox-core/adapters/in-memory-journal.ts';
import { Effects, composeVcsEffectId } from '../effects.ts';
import type { VcsEffectRequest } from '../vcs-port.ts';
import { MemoryVcsPort, createVcsSnapshot } from './vcs-test-context.ts';

type VcsEffectsContext = {
  port: MemoryVcsPort;
  journal: InMemoryJournal;
  effects: Effects;
  request(overrides: Partial<Omit<VcsEffectRequest, 'effectId'>>): VcsEffectRequest;
};

function createVcsEffectsContext(): VcsEffectsContext {
  const port = new MemoryVcsPort();
  const journal = new InMemoryJournal();
  const effects = new Effects(port, journal, { botAllowlist: ['review-bot'] });
  const request = (overrides: Partial<Omit<VcsEffectRequest, 'effectId'>>): VcsEffectRequest => {
    const effect: Omit<VcsEffectRequest, 'effectId'> = {
      kind: 'approve',
      project: 'group/project',
      iid: '42',
      revision: 'sha-1',
      currentRevision: 'sha-1',
      permission: {
        operatorLogin: 'operator',
        operatorIsMrAuthor: false,
        reviewerPermission: true,
        automatic: false,
      },
      ...overrides,
    };
    return { ...effect, effectId: composeVcsEffectId(effect) };
  };
  return { port, journal, effects, request };
}

describe('Effects reconciliation', () => {
  it('ambiguous effect reads GitLab before safe retry', async () => {
    // failure mode: response loss after provider application must not duplicate the observed effect
    const context = createVcsEffectsContext();
    context.port.snapshot = createVcsSnapshot({
      discussions: [
        {
          id: 'discussion-1',
          resolved: false,
          notes: [
            {
              id: 'note-1',
              author: 'operator',
              body: 'Own thread',
              createdAt: '2026-08-10T12:00:00.000Z',
              system: false,
            },
          ],
        },
      ],
    });
    context.port.ambiguousAfterApply = 'resolve';
    const request = context.request({
      kind: 'resolve',
      discussionId: 'discussion-1',
      permission: {
        operatorLogin: 'operator',
        operatorIsMrAuthor: false,
        reviewerPermission: true,
        threadAuthor: 'operator',
        automatic: false,
      },
    });

    const outcome = await context.effects.apply(request);

    // #region START_AMBIGUOUS_EFFECT_ASSERT_RECONCILIATION
    assert.deepStrictEqual(
      { status: outcome.status, readBeforeRetry: outcome.readBeforeRetry },
      { status: 'applied', readBeforeRetry: true }
    );
    assert.deepStrictEqual(context.port.mutationCalls, ['resolve']);
    assert.strictEqual(context.port.snapshot.discussions[0].resolved, true);
    // #endregion END_AMBIGUOUS_EFFECT_ASSERT_RECONCILIATION
  });

  it('request changes probes native capability and never substitutes silently', async () => {
    const supported = createVcsEffectsContext();
    const unsupported = createVcsEffectsContext();
    unsupported.port.capabilities = {
      requestChanges: false,
      evidence: 'schema-field-absent',
    };
    const supportedRequest = supported.request({
      kind: 'request_changes',
      body: 'Blocking finding on the current revision',
    });
    const unsupportedRequest = unsupported.request({
      kind: 'request_changes',
      body: 'Blocking finding on the current revision',
    });

    const supportedOutcome = await supported.effects.apply(supportedRequest);
    const unsupportedOutcome = await unsupported.effects.apply(unsupportedRequest);

    // #region START_REQUEST_CHANGES_ASSERT_NATIVE_ONLY
    assert.strictEqual(supportedOutcome.status, 'applied');
    assert.strictEqual(supported.port.snapshot.reviewerState, 'requested_changes');
    assert.deepStrictEqual(supported.port.mutationCalls, ['request_changes']);
    assert.strictEqual(unsupportedOutcome.status, 'unavailable');
    assert.deepStrictEqual(unsupported.port.mutationCalls, []);
    assert.strictEqual(unsupported.journal.read().length, 0);
    // #endregion END_REQUEST_CHANGES_ASSERT_NATIVE_ONLY
  });
});
