// @file: Contract matrix tests for ReviewRuntimeProfile composition.
// @consumers: node:test runner
// @tasks: TSK-172

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReviewRuntimeProfile } from '../runtime-profile.ts';
import type { ReviewRuntimeProfileSpec } from '../types/review-runtime-profile-spec.type.ts';

type RuntimeProfileContext = {
  allowed: ReviewRuntimeProfileSpec[];
  forbidden: ReviewRuntimeProfileSpec[];
};

function createRuntimeProfileContext(): RuntimeProfileContext {
  return {
    allowed: [
      { stateNamespace: 'production', externalIoPolicy: 'real-work' },
      { stateNamespace: 'test', externalIoPolicy: 'real-readonly', runId: 'readonly-172' },
      {
        stateNamespace: 'test',
        externalIoPolicy: 'real-effects',
        runId: 'effects-172',
        effectAllowlistIdentity: 'allowlist-sha256:172',
      },
      { stateNamespace: 'mock', externalIoPolicy: 'deterministic-mock', runId: 'mock-172' },
    ],
    forbidden: [
      { stateNamespace: 'production', externalIoPolicy: 'real-readonly' },
      { stateNamespace: 'production', externalIoPolicy: 'real-effects' },
      { stateNamespace: 'production', externalIoPolicy: 'deterministic-mock' },
      { stateNamespace: 'test', externalIoPolicy: 'real-work', runId: 'test-172' },
      { stateNamespace: 'test', externalIoPolicy: 'deterministic-mock', runId: 'test-172' },
      { stateNamespace: 'mock', externalIoPolicy: 'real-work', runId: 'mock-172' },
      { stateNamespace: 'mock', externalIoPolicy: 'real-readonly', runId: 'mock-172' },
      { stateNamespace: 'mock', externalIoPolicy: 'real-effects', runId: 'mock-172' },
      { stateNamespace: 'test', externalIoPolicy: 'real-readonly' },
      { stateNamespace: 'mock', externalIoPolicy: 'deterministic-mock', runId: '../work' },
      { stateNamespace: 'test', externalIoPolicy: 'real-effects', runId: 'effects-172' },
      {
        stateNamespace: 'test',
        externalIoPolicy: 'real-readonly',
        runId: 'readonly-172',
        effectAllowlistIdentity: 'unexpected',
      },
    ],
  };
}

describe('ReviewRuntimeProfile', () => {
  it('accepts only the four safe runtime profile combinations', () => {
    const { allowed, forbidden } = createRuntimeProfileContext();

    // #region START_PROFILE_MATRIX_TRIGGER_COMPOSE_VARIANTS
    const accepted = allowed.map((spec) => ReviewRuntimeProfile.compose(spec));
    const rejected = forbidden.map((spec) => {
      assert.throws(() => ReviewRuntimeProfile.compose(spec), /\[ReviewRuntimeProfile#compose\]/);
      return `${spec.stateNamespace}+${spec.externalIoPolicy}`;
    });
    // #endregion END_PROFILE_MATRIX_TRIGGER_COMPOSE_VARIANTS

    // #region START_PROFILE_MATRIX_ASSERT_CLOSED_WORLD
    assert.strictEqual(accepted.length, 4);
    assert.strictEqual(rejected.length, forbidden.length);
    assert.deepStrictEqual(
      accepted.map((profile) => [profile.stateNamespace, profile.externalIoPolicy]),
      [
        ['production', 'real-work'],
        ['test', 'real-readonly'],
        ['test', 'real-effects'],
        ['mock', 'deterministic-mock'],
      ]
    );
    // #endregion END_PROFILE_MATRIX_ASSERT_CLOSED_WORLD
  });
});
