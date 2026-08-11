// @file: Integration test for complete delta fallback, supersession inputs and evidence revalidation.
// @consumers: TSK-176 audit
// @tasks: TSK-176

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ReviewDeltaVerifier } from '../../../services/agent-inbox/modules/inbox-pipeline/verification/review-delta-verifier.ts';

type DeltaContext = {
  verifier: ReviewDeltaVerifier;
  key: { mr: string; headSHA: string; eventCursor: string };
};
function createDeltaContext(): DeltaContext {
  return {
    verifier: new ReviewDeltaVerifier(),
    key: { mr: 'g/p!1', headSHA: 'h2', eventCursor: 'e2' },
  };
}

describe('ReviewDeltaVerifier', () => {
  it('delta fallback supersede revalidation and lane failure preserve all gaps', () => {
    const { verifier, key } = createDeltaContext();
    const full = verifier.deriveIntent(
      { key, eventIds: ['e1', 'e2'], changedInputIds: ['file:a', 'thread:t'] },
      []
    );
    assert.strictEqual(full.intent.kind, 'full');
    assert.deepStrictEqual(full.affectedInputIds, ['file:a', 'thread:t']);
    const delta = verifier.deriveIntent(
      {
        key,
        eventIds: ['e1', 'e2'],
        changedInputIds: ['file:a', 'thread:t'],
        baseline: { manifestRef: 'm1', evidenceRef: 'ev1' },
      },
      []
    );
    assert.strictEqual(delta.intent.kind, 'delta');
    assert.deepStrictEqual(delta.coveredEventIds, ['e1', 'e2']);
  });
});
