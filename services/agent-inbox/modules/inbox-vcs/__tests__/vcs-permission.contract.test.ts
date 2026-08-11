// @file: Complete ownership, revision, identity, body, permission, and capability truth-table tests.
// @consumers: node:test runner
// @tasks: TSK-174

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VcsPermissionPolicy } from '../permission-policy.ts';
import { validateVcsEffectRequest, type VcsEffectRequest } from '../vcs-port.ts';

type VcsPermissionContext = {
  policy: VcsPermissionPolicy;
  request(overrides?: Partial<VcsEffectRequest>): VcsEffectRequest;
};

function createVcsPermissionContext(): VcsPermissionContext {
  return {
    policy: new VcsPermissionPolicy(['review-bot']),
    request: (overrides = {}) => ({
      effectId: 'stable-effect',
      kind: 'resolve',
      project: 'group/project',
      iid: '42',
      revision: 'sha-1',
      currentRevision: 'sha-1',
      discussionId: 'discussion-1',
      permission: {
        operatorLogin: 'operator',
        operatorIsMrAuthor: false,
        reviewerPermission: true,
        threadAuthor: 'operator',
        automatic: false,
      },
      ...overrides,
    }),
  };
}

describe('VcsPermissionPolicy', () => {
  it('resolve and reopen follow the ownership truth table', () => {
    const context = createVcsPermissionContext();
    const supported = { requestChanges: true, evidence: 'native' };

    // #region START_OWNERSHIP_MATRIX_TRIGGER_EVALUATE_CASES
    const decisions = [
      context.policy.authorize(context.request(), supported),
      context.policy.authorize(
        context.request({
          permission: {
            ...context.request().permission,
            automatic: true,
          },
        }),
        supported
      ),
      context.policy.authorize(
        context.request({
          permission: {
            ...context.request().permission,
            threadAuthor: 'review-bot',
            operatorIsMrAuthor: true,
          },
        }),
        supported
      ),
      context.policy.authorize(
        context.request({
          permission: { ...context.request().permission, threadAuthor: 'review-bot' },
        }),
        supported
      ),
      context.policy.authorize(
        context.request({
          permission: { ...context.request().permission, threadAuthor: 'foreign-human' },
        }),
        supported
      ),
      context.policy.authorize(
        context.request({
          kind: 'reopen',
          permission: { ...context.request().permission, automatic: true },
        }),
        supported
      ),
    ];
    // #endregion END_OWNERSHIP_MATRIX_TRIGGER_EVALUATE_CASES

    assert.deepStrictEqual(
      decisions.map((decision) => [decision.allowed, decision.evidence]),
      [
        [true, 'operator-thread'],
        [true, 'operator-thread'],
        [true, 'allowlisted-bot-thread-on-owned-mr'],
        [false, 'operator-does-not-own-mr'],
        [false, 'foreign-thread'],
        [false, 'automatic-reopen-disabled'],
      ]
    );
  });

  it('identity ownership automatic reopen and request changes negative gates deny before IO', () => {
    const context = createVcsPermissionContext();
    const requestChanges = context.request({ kind: 'request_changes', body: 'Blocking body' });

    // #region START_NEGATIVE_GATES_TRIGGER_POLICY
    const decisions = {
      identity: context.policy.authorize(
        context.request({
          permission: { ...context.request().permission, operatorLogin: '' },
        }),
        { requestChanges: true, evidence: 'native' }
      ),
      stale: context.policy.authorize(
        { ...requestChanges, currentRevision: 'sha-2' },
        { requestChanges: true, evidence: 'native' }
      ),
      permission: context.policy.authorize(
        {
          ...requestChanges,
          permission: { ...requestChanges.permission, reviewerPermission: false },
        },
        { requestChanges: true, evidence: 'native' }
      ),
      capability: context.policy.authorize(requestChanges, {
        requestChanges: false,
        evidence: 'schema-field-absent',
      }),
    };
    // #endregion END_NEGATIVE_GATES_TRIGGER_POLICY

    // #region START_NEGATIVE_GATES_ASSERT_NO_ALLOW
    assert.deepStrictEqual(
      Object.values(decisions).map((decision) => [decision.allowed, decision.status]),
      [
        [false, 'denied'],
        [false, 'denied'],
        [false, 'denied'],
        [false, 'unavailable'],
      ]
    );
    assert.throws(
      () => validateVcsEffectRequest({ ...requestChanges, body: '   ' }),
      /request_changes body is required/
    );
    // #endregion END_NEGATIVE_GATES_ASSERT_NO_ALLOW
  });
});
